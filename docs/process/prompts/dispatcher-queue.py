#!/usr/bin/env python3
"""Read-only queue picker for the dispatcher (.prompts/dispatcher.md).

One `gh issue list` call per poll; decides, for every role, the next issue to work on.
Config (mode, active labels, roles) is read from dispatcher.md on every call, so switching
a sprint is a one-line edit that takes effect without restarting the dispatcher.

Usage: dispatcher-queue.py [--busy gpt1,gpt2] [--wait SECONDS] [--interval 60]
Exit codes: 0 work found (PLAN lines), 3 nothing to do (after --wait), 4 STOP file, 5 main folder dirty and NOT healable, 2 gh failure.
A dirty main folder is healed automatically (patch and stray files are saved to .prompts/stray/<time>/, then restored and re-locked); the line GUARD_HEALED is printed.
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = HERE / "dispatcher.md"
STOP_FILE = HERE / "STOP"
MAIN_FOLDER = "/Users/valiev/Dev/Apps/FlowPilot"  # nobody may edit it; agents work in worktrees
REPO = "ValievM/flowpilot"
RANK = {"status:doing": 0, "status:review": 1, "status:ready": 2}


def read_config():
    text = CONFIG.read_text(encoding="utf-8")

    def line(key, default):
        match = re.search(rf"^{re.escape(key)}:\s*(.+)$", text, re.M)
        return match.group(1).strip() if match else default

    mode = line("РЕЖИМ", "dry-run").split()[0]
    active = [x.strip() for x in line("АКТИВНЫЕ МЕТКИ", "phase:1").replace(";", ",").split(",") if x.strip()]
    roles = [x for x in re.split(r"[\s,]+", line("РОЛИ", "gpt1 gpt2 gpt3")) if x]
    return mode, active, roles


def auto_unblock():
    """Dependency-free chore for Claude's routine: blocked issues whose dependencies are closed become ready."""
    try:
        sys.path.insert(0, str(HERE))
        import unblock
        flipped = unblock.main()
        if flipped:
            print("UNBLOCKED " + " ".join(f"#{n}" for n in flipped))
    except Exception as error:  # never let this chore break the queue
        print(f"unblock skipped: {error}")


def auto_merge():
    """Start the safe auto-merge (tier:c / tier:b without needs-eyes) in the background; it never blocks the queue."""
    try:
        script = HERE / "automerge.py"
        if script.exists() and not (HERE / "NO_AUTOMERGE").exists():
            subprocess.Popen([sys.executable, str(script)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
    except Exception as error:  # never let this chore break the queue
        print(f"automerge skipped: {error}")


def fetch_issues():
    out = subprocess.run(
        ["gh", "issue", "list", "--repo", REPO, "--state", "open", "--limit", "200",
         "--json", "number,title,labels,updatedAt"],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:200])
    return json.loads(out.stdout)


def main_folder_dirty(path):
    out = subprocess.run(["git", "-C", path, "status", "--porcelain"], capture_output=True, text=True, timeout=30)
    return [line for line in out.stdout.splitlines() if line.strip()]


STRAY_DIR = HERE / "stray"
HEAL_LIMIT = 50  # more dirty entries than this look like something bigger than a misplaced edit: stop instead


def heal_main_folder(path, dirty):
    """Save what a worker wrote into the protected main folder, put the folder back and lock it again."""
    stamp = time.strftime("%Y%m%d-%H%M%S")
    target = STRAY_DIR / stamp
    target.mkdir(parents=True, exist_ok=True)
    patch = subprocess.run(["git", "-C", path, "diff"], capture_output=True, text=True, timeout=60).stdout
    (target / "tracked.patch").write_text(patch, encoding="utf-8")
    for line in dirty:
        status, name = line[:2], line[3:].strip().strip('"')
        if status == "??":
            source = Path(path) / name
            if source.is_file():
                (target / "untracked").mkdir(exist_ok=True)
                destination = target / "untracked" / name.replace("/", "__")
                destination.write_bytes(source.read_bytes())
    subprocess.run(["git", "-C", path, "checkout", "--", "."], capture_output=True, timeout=60)
    subprocess.run(["git", "-C", path, "clean", "-fd"], capture_output=True, timeout=60)  # ignored files stay
    listing = subprocess.run(["git", "-C", path, "ls-files", "-z"], capture_output=True, timeout=60).stdout
    names = [x for x in listing.decode("utf-8").split("\0") if x]
    for chunk_start in range(0, len(names), 500):
        subprocess.run(["chmod", "a-w", *names[chunk_start:chunk_start + 500]], cwd=path, timeout=60)
    return target


def plan(issues, active, roles, busy):
    lines, waiting_claude, waiting_owner = [], [], []
    by_role = {role: [] for role in roles}
    for issue in issues:
        labels = {label["name"] for label in issue["labels"]}
        if not labels & set(active):
            continue
        if "who:claude" in labels:
            waiting_claude.append(issue["number"])
        if "who:owner" in labels:
            waiting_owner.append(issue["number"])
        status = next((s for s in RANK if s in labels), None)
        if status is None:
            continue
        for role in roles:
            if f"who:{role}" in labels:
                by_role[role].append((RANK[status], 0, issue["number"], status, issue))
    found = False
    for role in roles:
        if role in busy:
            lines.append(f"BUSY role={role}")
            continue
        candidates = sorted(by_role[role], key=lambda item: item[:3])
        if not candidates:
            lines.append(f"IDLE role={role}")
            continue
        _, _, number, status, issue = candidates[0]
        found = True
        lines.append(
            f"PLAN role={role} issue={number} status={status.split(':')[1]} "
            f"updated={issue['updatedAt']} queue={len(candidates)} title={issue['title'][:70]}"
        )
    lines.append("WAIT_CLAUDE " + (" ".join(f"#{n}" for n in sorted(waiting_claude)) or "-"))
    lines.append("WAIT_OWNER " + (" ".join(f"#{n}" for n in sorted(waiting_owner)) or "-"))
    return found, lines


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--busy", default="")
    parser.add_argument("--wait", type=int, default=0)
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--guard-path", default=MAIN_FOLDER)
    args = parser.parse_args()
    busy = {x for x in args.busy.split(",") if x}
    deadline = time.time() + args.wait
    failures = 0
    while True:
        if STOP_FILE.exists():
            print("STOP file present: finish running work and exit")
            return 4
        dirty = main_folder_dirty(args.guard_path)
        if dirty:
            if len(dirty) > HEAL_LIMIT:
                print(f"GUARD main folder is dirty ({len(dirty)} files, too many to heal automatically)")
                print("\n".join(dirty[:5]))
                return 5
            saved = heal_main_folder(args.guard_path, dirty)
            print(f"GUARD_HEALED {len(dirty)} entries written into the main folder were saved to {saved} and removed; "
                  "tell the role that wrote there to use its worktree path (worker keeps running)")
            print("\n".join(dirty[:5]))
            if main_folder_dirty(args.guard_path):
                print("GUARD main folder still dirty after healing")
                return 5
        auto_unblock()
        auto_merge()
        mode, active, roles = read_config()
        try:
            found, lines = plan(fetch_issues(), active, roles, busy)
            failures = 0
        except Exception as error:  # transient gh/network failure: retry on the next poll
            failures += 1
            if failures >= 5:
                print(f"ERROR gh failed {failures} times: {error}")
                return 2
            time.sleep(min(args.interval, 30))
            continue
        if found or time.time() >= deadline:
            print(f"MODE {mode}")
            print("ACTIVE " + ",".join(active))
            print("\n".join(lines))
            return 0 if found else 3
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
