#!/bin/bash
# Claude's routine for FlowPilot: merge a submitted task branch into dev, run the FULL check, push, comment, close, unblock followers.
# usage: merge-task.sh <issue> <branch> [--e2e] [--unblock 3,4] [--note "extra text"] [--dry]
# Red check or merge conflict: nothing is pushed, dev worktree is reset to origin/dev, exit code 1/2.
set -u
ISSUE="${1:?issue}"; BRANCH="${2:?branch}"; shift 2
UNBLOCK=""; NOTE=""; DRY=0; E2E=0
while [ $# -gt 0 ]; do
  case "$1" in
    --unblock) UNBLOCK="$2"; shift 2;;
    --note) NOTE="$2"; shift 2;;
    --e2e) E2E=1; shift;;
    --dry) DRY=1; shift;;
    *) echo "unknown arg $1"; exit 64;;
  esac
done
REPO=ValievM/flowpilot
W=/Users/valiev/Dev/Apps/FlowPilot-worktrees/dev-wt
RUN=~/.agent-runner/run
# one merge at a time on the shared dev worktree (automerge.py and manual merges must not overlap)
LOCKD=/tmp/flowpilot-merge.lock
[ -d "$LOCKD" ] && [ -n "$(find "$LOCKD" -maxdepth 0 -mmin +60 2>/dev/null)" ] && rmdir "$LOCKD" 2>/dev/null
GOT=0
for _ in $(seq 1 120); do if mkdir "$LOCKD" 2>/dev/null; then GOT=1; break; fi; sleep 10; done
[ "$GOT" = 1 ] || { echo "merge lock busy (another merge is running)"; exit 3; }
trap 'rmdir "$LOCKD" 2>/dev/null' EXIT
cd "$W" || exit 64
[ -z "$(git status --porcelain)" ] || { echo "dev worktree is dirty:"; git status --short | head; exit 3; }
git fetch -q origin || exit 3
git reset -q --hard origin/dev
echo "== diffstat origin/dev...$BRANCH"; git diff --stat "origin/dev...$BRANCH" | tail -15
[ "$DRY" = 1 ] && { echo "(dry run, stop)"; exit 0; }
git merge --no-ff "$BRANCH" -m "Merge $BRANCH into dev (Refs #$ISSUE)" >/tmp/fp-merge.out 2>&1 || { tail -5 /tmp/fp-merge.out; git merge --abort; echo "MERGE CONFLICT: return the task to its author or resolve by hand"; exit 2; }
LOGS=""
if [ -f package.json ]; then
  if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then npm ci --no-audit --no-fund >/tmp/fp-npm.out 2>&1 || { tail -20 /tmp/fp-npm.out; git reset -q --hard origin/dev; echo "npm ci failed"; exit 1; }; fi
  $RUN claude npm run check >/tmp/fp-check.out 2>&1; RC=$?
  LOGS=$(grep -o '/Users/[^ ]*claude-[0-9-]*\.log' /tmp/fp-check.out | tail -1)
  if [ $RC -eq 0 ] && [ "$E2E" = 1 ]; then $RUN claude npm run e2e >/tmp/fp-e2e.out 2>&1; RC=$?; LOGS="$LOGS $(grep -o '/Users/[^ ]*claude-[0-9-]*\.log' /tmp/fp-e2e.out | tail -1)"; fi
  if [ $RC -ne 0 ]; then echo "CHECK RED (logs: $LOGS)"; tail -30 /tmp/fp-check.out /tmp/fp-e2e.out 2>/dev/null | grep -E "error|Error|FAIL|✗|failed" | head -12; git reset -q --hard origin/dev; exit 1; fi
else
  echo "no package.json yet: docs-only merge, no code checks"
fi
git push -q origin dev || { echo "push failed"; exit 4; }
NAMES=""; for l in $LOGS; do NAMES="$NAMES $(basename "$l")"; done
gh issue comment "$ISSUE" --repo $REPO --body "[Claude] ПРИНЯТО и влито в dev. Полная проверка на слиянии зелёная (${NAMES:-только документы}, exit=0). $NOTE" >/dev/null
gh issue close "$ISSUE" --repo $REPO >/dev/null
for n in $(echo "$UNBLOCK" | tr ',' ' '); do
  gh issue edit "$n" --repo $REPO --remove-label status:blocked --add-label status:ready >/dev/null && echo "#$n -> ready"
done
echo "DONE #$ISSUE merged into dev ($NAMES)"
