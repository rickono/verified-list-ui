#!/bin/bash
# Shadow, try/catch, and the corrected weak-sum controls.
set -u
repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
out="$repo/verify/reports/roadmap/judgment-throws/logs"
deps="${VERIFY_NODE_MODULES:-/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/node_modules}"
test -d "$deps" || { echo "missing node_modules: $deps" >&2; exit 2; }
tmp="$(mktemp -d /tmp/judgment-throws-follow.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
git -C "$repo" archive HEAD verify | tar -x -C "$tmp"
git -C "$repo" archive f5473537eb543470feef3f886e778f2737f8ed43 verify/reports/roadmap/candidate-throws-codex | tar -x -C "$tmp"
git -C "$repo" archive f5c3d471afda371b5f3805ee888c9d0e4688c38e verify/reports/roadmap/candidate-throws-grok | tar -x -C "$tmp"
ln -s "$deps" "$tmp/node_modules"
node "$repo/verify/reports/roadmap/judgment-throws/scripts/followup.mjs" A "$out/followup-A.json" "$tmp"
status_a=$?
node "$repo/verify/reports/roadmap/judgment-throws/scripts/followup.mjs" B "$out/followup-B.json" "$tmp"
status_b=$?
printf 'followup A %s\nfollowup B %s\n' "$status_a" "$status_b" | tee "$out/followup-statuses.txt"
test "$status_a" = 0 && test "$status_b" = 0
