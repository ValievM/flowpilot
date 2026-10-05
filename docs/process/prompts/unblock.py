#!/usr/bin/env python3
"""Flip status:blocked -> status:ready when every issue named in the line 'Зависит от: #1, #2' is closed.
Run by dispatcher-queue.py on each poll (and by hand). Issues without that exact line are never touched."""
import json, re, subprocess, sys

REPO = "ValievM/flowpilot"

def gh(*args):
    out = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:200])
    return out.stdout

def main(dry=False):
    blocked = json.loads(gh("issue", "list", "--repo", REPO, "--state", "open", "--label", "status:blocked",
                            "--limit", "100", "--json", "number,body,labels"))
    states = {}
    flipped = []
    for issue in blocked:
        names = {l["name"] for l in issue["labels"]}
        if not any(n.startswith("phase:") for n in names) or not any(n.startswith("who:gpt") for n in names):
            continue
        match = re.search(r"^Зависит от:\s*(.+)$", issue["body"] or "", re.M)
        if not match:
            continue
        deps = [int(x) for x in re.findall(r"#(\d+)", match.group(1))]
        if not deps:
            continue
        for d in deps:
            if d not in states:
                states[d] = json.loads(gh("issue", "view", str(d), "--repo", REPO, "--json", "state"))["state"]
        if all(states[d] == "CLOSED" for d in deps):
            flipped.append(issue["number"])
            if not dry:
                gh("issue", "edit", str(issue["number"]), "--repo", REPO, "--remove-label", "status:blocked", "--add-label", "status:ready")
                gh("issue", "comment", str(issue["number"]), "--repo", REPO, "--body",
                   f"[скрипт] Зависимости {', '.join('#'+str(d) for d in deps)} закрыты: status:ready.")
    return flipped

if __name__ == "__main__":
    print("UNBLOCKED", main(dry="--dry" in sys.argv))
