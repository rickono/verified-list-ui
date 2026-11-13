#!/bin/sh
# Usage: serial-verify.py -- sh run-validation.sh <output-directory>
# One lane owns both the regression and exact parent comparison.
set -eu
OUT=$1
mkdir -p "$OUT"
sh verify/reports/roadmap/heap-write-audit/run-focused.sh > "$OUT/focused-final.log" 2>&1
node verify/reports/roadmap/heap-write-audit/compare.mjs "$OUT/comparison-accepted" > "$OUT/comparison-accepted.log" 2>&1
