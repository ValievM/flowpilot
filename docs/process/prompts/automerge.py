#!/usr/bin/env python3
"""Safe auto-merge for low-risk tasks (tier:c, and tier:b without needs-eyes). One issue per run.

Candidates: open issues labelled who:automerge + status:review. An issue is merged only if ALL hold:
  - labels: tier:c, or tier:b without needs-eyes; no `hold`; kill switch file .prompts/NO_AUTOMERGE absent
  - the last comment starting with [РЕВЬЮЕР] contains "Вердикт: ВЛИТЬ" and "ПРОВЕРКА: OK" and names the
    exact current head commit of the branch (so unreviewed later pushes are never merged)
  - branch merges into origin/dev without conflicts
  - a GitHub Actions run for that head commit, if one exists, is successful (a running one means: wait)
  - merge-task.sh passes the full check on the merged result (and e2e for tier:b); it pushes and closes the issue
Otherwise nothing is merged: waiting reasons are printed, hard failures return the issue to who:claude with a comment.
usage: automerge.py [--dry]
"""
import json, os, re, subprocess, sys, time

REPO = "ValievM/flowpilot"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WT = "/Users/valiev/Dev/Apps/FlowPilot-worktrees/dev-wt"
LOCK = "/tmp/flowpilot-automerge.lock"
KILL = os.path.join(HERE, "NO_AUTOMERGE")


def run(*cmd, cwd=None, timeout=3600):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def gh_json(*args):
    out = run("gh", *args)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:200])
    return json.loads(out.stdout or "null")


def eligible_labels(labels):
    if "hold" in labels:
        return False, "hold"
    if "tier:c" in labels:
        return True, ""
    if "tier:b" in labels and "needs-eyes" not in labels:
        return True, ""
    return False, "tier не позволяет автослияние (нужен tier:c или tier:b без needs-eyes)"


def branch_of(body):
    match = re.search(r"\*\*Ветка / Worktree:\*\*\s*`([^`]+)`", body or "")
    return match.group(1) if match else None


def reviewer_ok(comments, head):
    reviewer = [c for c in comments if (c.get("body") or "").lstrip().startswith("[РЕВЬЮЕР]")]
    if not reviewer:
        return False, "нет сводки ревьюера"
    body = reviewer[-1]["body"]
    if "Вердикт: ВЛИТЬ" not in body or "ПРОВЕРКА: OK" not in body:
        return False, "последняя сводка ревьюера без «Вердикт: ВЛИТЬ» и «ПРОВЕРКА: OK»"
    hashes = re.findall(r"\b[0-9a-f]{7,40}\b", body)
    if not any(len(h) >= 7 and head.startswith(h) for h in hashes):
        return False, f"сводка ревьюера не относится к текущему коммиту ветки {head[:7]}"
    return True, ""


SENSITIVE = (".github/", "eslint.config.js", ".dependency-cruiser.cjs", "package.json", "package-lock.json",
             ".prettierrc", ".prettierignore", "tsconfig.json", "vitest.config.ts", "playwright.config.ts",
             "stylelint.config.js", "forge.config.ts", "vite.", ".prompts/", "scripts/")


def sensitive_files(branch):
    """Files whose change can weaken the checks themselves: never auto-merged (the check cannot judge them)."""
    out = run("git", "diff", "--name-only", f"origin/dev...origin/{branch}", cwd=WT).stdout.split()
    return [f for f in out if f.startswith(SENSITIVE) or any(f.endswith(x) for x in (".github", ".sh"))]


def ci_state(branch, head):
    try:
        runs = gh_json("run", "list", "--repo", REPO, "--branch", branch, "--limit", "10",
                       "--json", "headSha,status,conclusion")
    except Exception:
        return "unknown"
    mine = [r for r in runs if r.get("headSha") == head]
    if not mine:
        return "none"
    if any(r["status"] != "completed" for r in mine):
        return "running"
    return "ok" if all(r["conclusion"] == "success" for r in mine) else "failed"


def fail(number, reason, dry):
    print(f"FAIL #{number}: {reason}")
    if dry:
        return
    run("gh", "issue", "comment", str(number), "--repo", REPO, "--body",
        f"[Автослияние] не слито: {reason}. Возвращаю Claude (who:claude); автослияние для этой задачи остановлено до решения.")
    run("gh", "issue", "edit", str(number), "--repo", REPO, "--remove-label", "who:automerge", "--add-label", "who:claude")


def acquire():
    if os.path.isdir(LOCK) and time.time() - os.path.getmtime(LOCK) > 3600:
        os.rmdir(LOCK)
    try:
        os.mkdir(LOCK)
        return True
    except FileExistsError:
        return False


def main():
    dry = "--dry" in sys.argv
    if os.path.exists(KILL):
        print("AUTOMERGE disabled (NO_AUTOMERGE file)")
        return 0
    issues = gh_json("issue", "list", "--repo", REPO, "--state", "open", "--label", "who:automerge",
                     "--limit", "20", "--json", "number,labels,body,comments")
    if not issues:
        print("AUTOMERGE nothing to do")
        return 0
    if not dry and not acquire():
        print("AUTOMERGE busy (another run in progress)")
        return 0
    try:
        for issue in sorted(issues, key=lambda i: i["number"]):
            number = issue["number"]
            labels = {l["name"] for l in issue["labels"]}
            ok, why = eligible_labels(labels)
            if not ok:
                if why == "hold":
                    print(f"SKIP #{number}: hold")
                else:
                    fail(number, why, dry)
                continue
            if "status:review" not in labels:
                print(f"SKIP #{number}: not in status:review")
                continue
            branch = branch_of(issue["body"])
            if not branch:
                fail(number, "в первой строке issue нет имени ветки", dry)
                continue
            run("git", "fetch", "-q", "origin", cwd=WT)
            head = run("git", "rev-parse", f"origin/{branch}", cwd=WT).stdout.strip()
            if not head:
                fail(number, f"ветка origin/{branch} не найдена", dry)
                continue
            ok, why = reviewer_ok(issue["comments"], head)
            if not ok:
                fail(number, why, dry)
                continue
            touched = sensitive_files(branch)
            if touched:
                fail(number, "затронуты файлы, которые меняют сами проверки или зависимости (" + ", ".join(touched[:4]) + "): автослияние запрещено, нужен Claude", dry)
                continue
            ci = ci_state(branch, head)
            if ci == "running":
                print(f"WAIT #{number}: CI ветки ещё идёт")
                continue
            if ci == "failed":
                fail(number, "CI ветки красный", dry)
                continue
            tree = run("git", "merge-tree", "--write-tree", "origin/dev", f"origin/{branch}", cwd=WT)
            if tree.returncode != 0:
                fail(number, "конфликт слияния с dev", dry)
                continue
            tier = "tier:c" if "tier:c" in labels else "tier:b"
            print(f"MERGE #{number} {branch} {head[:7]} ({tier}, CI={ci})" + (" [dry run]" if dry else ""))
            if dry:
                continue
            args = [os.path.join(HERE, "merge-task.sh"), str(number), branch,
                    "--note", f"Автослияние ({tier}): ревьюер ПРОВЕРКА: OK на коммите {head[:7]}, полная проверка на слитом dev зелёная."]
            if tier == "tier:b":
                args.insert(3, "--e2e")
            result = run(*args, timeout=3000)
            print(result.stdout[-400:])
            if result.returncode != 0:
                fail(number, f"merge-task.sh завершился с кодом {result.returncode} (проверка на слитом dev или push)", dry)
            break  # one merge per run
    finally:
        if not dry:
            try:
                os.rmdir(LOCK)
            except OSError:
                pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
