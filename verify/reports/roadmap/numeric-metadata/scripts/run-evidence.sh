#!/bin/sh
# Invoke through serial-verify.py. Baseline runtime is a byte-exact extraction
# from the prepared parent, never a candidate's modified heap/source compiler.
set -eu
OUT=verify/reports/roadmap/numeric-metadata/logs
SCRIPTS=verify/reports/roadmap/numeric-metadata/scripts
BASE=verify/reports/roadmap/numeric-metadata/.baseline-runtime
node "$SCRIPTS/corpus.mjs" "$OUT/baseline" '' "$BASE" > "$OUT/baseline.log" 2>&1
node "$SCRIPTS/corpus.mjs" "$OUT/final" > "$OUT/final-corpus.log" 2>&1
node "$SCRIPTS/compare.mjs" "$OUT/baseline" "$OUT/final" > "$OUT/comparison.json"
node "$SCRIPTS/validity.mjs" "$OUT/validity" > "$OUT/validity.jsonl" 2>&1
node verify/check-native-baseline.mjs eaf23c0ca4a2e61e9d844a84a876755872eb16e7 > "$OUT/native-baseline.json" 2>&1
