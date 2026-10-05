#!/usr/bin/env python3
"""Pipeline metrics over closed issues of ValievM/flowpilot (ready->closed time, returns, review waiting).
usage: metrics.py [--table]
Prints one line for the owner: «средняя задача X ч, возвратов Y, из них простой Z ч».
Returns = comments with «ВОЗВРАТ» or «ПРОВЕРКА: замечания» or «Вердикт: ВЕРНУТЬ». Waiting Z = time under who:claude / who:reviewer.
"""
import json, subprocess, sys
from datetime import datetime

REPO = "ValievM/flowpilot"


def gh(*a):
    out = subprocess.run(["gh", *a], capture_output=True, text=True)
    return json.loads(out.stdout or "null") if out.returncode == 0 else None


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def main():
    closed = gh("issue", "list", "--repo", REPO, "--state", "closed", "--limit", "300",
                "--json", "number,title,labels,closedAt,comments") or []
    rows = []
    for issue in closed:
        labels = [l["name"] for l in issue["labels"]]
        if "who:owner" in labels or "decision" in labels and not any(l.startswith("who:gpt") for l in labels):
            pass
        events = gh("api", f"repos/{REPO}/issues/{issue['number']}/events", "--paginate") or []
        ready = next((ts(e["created_at"]) for e in events
                      if e.get("event") == "labeled" and e["label"]["name"] == "status:ready"), None)
        if not ready:
            continue
        closed_at = ts(issue["closedAt"])
        returns = sum(1 for c in issue["comments"]
                      if any(m in (c["body"] or "") for m in ("ВОЗВРАТ", "ПРОВЕРКА: замечания", "Вердикт: ВЕРНУТЬ")))
        wait = 0.0
        since = {}
        for e in sorted(events, key=lambda e: e["created_at"]):
            name = (e.get("label") or {}).get("name", "")
            if name not in ("who:claude", "who:reviewer"):
                continue
            if e["event"] == "labeled":
                since[name] = ts(e["created_at"])
            elif e["event"] == "unlabeled" and name in since:
                wait += (ts(e["created_at"]) - since.pop(name)).total_seconds() / 3600
        for name, start in since.items():
            wait += (closed_at - start).total_seconds() / 3600
        tier = next((l for l in labels if l.startswith("tier:")), "tier:-")
        rows.append((issue["number"], tier, (closed_at - ready).total_seconds() / 3600, returns, wait))
    if not rows:
        print("метрик пока нет: нет закрытых задач со status:ready")
        return 0
    if "--table" in sys.argv:
        for n, tier, hours, returns, wait in sorted(rows):
            print(f"#{n:<3} {tier:<7} {hours:6.1f} ч  возвратов {returns}  ожидание claude/reviewer {wait:5.1f} ч")
    avg = sum(r[2] for r in rows) / len(rows)
    ret = sum(r[3] for r in rows)
    wait = sum(r[4] for r in rows)
    print(f"средняя задача {avg:.1f} ч (по {len(rows)} закрытым), возвратов {ret}, из них простой в ожидании Claude/ревьюера {wait:.1f} ч")
    return 0


if __name__ == "__main__":
    sys.exit(main())
