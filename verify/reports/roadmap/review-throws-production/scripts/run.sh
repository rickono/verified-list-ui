#!/bin/sh
set -eu
TESTED=/tmp/review-throws-snaps/tested
PARENT=/tmp/review-throws-parent
MUTANT=/tmp/review-throws-mutant
OUT=/tmp/review-throws-probe/out
NM=/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/node_modules
REPO=/Users/rick/.t3/worktrees/verified-list-ui/t3-b9613c02
cleanup() {
  rm -f "$TESTED/node_modules" "$PARENT/node_modules" "$MUTANT/node_modules"
  rm -f "$PARENT/probe-bug.js"
}
trap cleanup EXIT INT TERM
rm -rf "$PARENT" "$MUTANT" "$OUT"
mkdir -p "$OUT"
cp -a "$TESTED" "$PARENT"
cp -a "$TESTED" "$MUTANT"
git -C "$REPO" show dedde91b9f6e1fec3a30f5e39cae65f5381b6b26:verify/source.mjs > "$PARENT/verify/source.mjs"
git -C "$REPO" show dedde91b9f6e1fec3a30f5e39cae65f5381b6b26:verify/index.mjs > "$PARENT/verify/index.mjs"
ln -s "$NM" "$TESTED/node_modules"
ln -s "$NM" "$PARENT/node_modules"
ln -s "$NM" "$MUTANT/node_modules"
export TESTED_ROOT="$TESTED" PARENT_ROOT="$PARENT" MUTANT_ROOT="$MUTANT" OUT_DIR="$OUT"
node /tmp/review-throws-probe/probe.mjs
