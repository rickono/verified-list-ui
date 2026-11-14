#!/bin/bash
# Extract byte-exact candidate trees and run focused public-verify controls.
# The extracted tree and its node_modules symlink live under /tmp and are removed.
set -u
# scripts -> judgment-throws -> roadmap -> reports -> verify -> repo root
repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
out="$repo/verify/reports/roadmap/judgment-throws/logs"
deps="${VERIFY_NODE_MODULES:-/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/node_modules}"
test -d "$deps" || { echo "missing node_modules: $deps" >&2; exit 2; }
tmp="$(mktemp -d /tmp/judgment-throws-exec.XXXXXX)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT
git -C "$repo" archive HEAD verify | tar -x -C "$tmp"
git -C "$repo" archive f5473537eb543470feef3f886e778f2737f8ed43 verify/reports/roadmap/candidate-throws-codex | tar -x -C "$tmp"
git -C "$repo" archive f5c3d471afda371b5f3805ee888c9d0e4688c38e verify/reports/roadmap/candidate-throws-grok | tar -x -C "$tmp"
ln -s "$deps" "$tmp/node_modules"
{
  echo "repo=$repo"
  echo "head=$(git -C "$repo" rev-parse HEAD)"
  echo "tmp=$tmp"
  shasum -a 256 \
    "$tmp/verify/source.mjs" \
    "$tmp/verify/index.mjs" \
    "$tmp/verify/proofs.mjs" \
    "$tmp/verify/reports/roadmap/candidate-throws-codex/upstream/harmonic_mean.js" \
    "$tmp/verify/reports/roadmap/candidate-throws-grok/sources/harmonic_mean.js"
} | tee "$out/extract.txt"
node "$repo/verify/reports/roadmap/judgment-throws/scripts/focused.mjs" A "$out/focused-A.json" "$tmp"
status_a=$?
node "$repo/verify/reports/roadmap/judgment-throws/scripts/focused.mjs" B "$out/focused-B.json" "$tmp"
status_b=$?
printf 'A %s\nB %s\n' "$status_a" "$status_b" | tee "$out/statuses.txt"
test "$status_a" = 0 && test "$status_b" = 0
