#!/bin/sh
# Usage: check-assumptions.sh Assumptions.v assumptions.txt
# Fails unless every "Print Assumptions" in the report printed exactly
# "Closed under the global context" and nothing else was printed.
set -eu
src=$1
out=$2
expected=$(grep -c '^Print Assumptions ' "$src")
closed=$(grep -c '^Closed under the global context$' "$out" || true)
other=$(grep -v -e '^Closed under the global context$' -e '^[[:space:]]*$' "$out" || true)
if [ "$closed" -ne "$expected" ] || [ -n "$other" ]; then
  echo "assumptions check FAILED: $closed of $expected theorems closed" >&2
  [ -n "$other" ] && printf '%s\n' "$other" >&2
  exit 1
fi
echo "assumptions check: all $expected theorems closed under the global context (no axioms)"
