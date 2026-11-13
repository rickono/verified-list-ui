# Commands, as executed (2026-11-13, UTC)

**Paths**

- `S=/private/tmp/claude-501/-Users-rick--t3-worktrees-verified-list-ui-t3-4e767245/536b9b3d-94bd-40ef-b83b-d2f76d484e4f/scratchpad` (session scratch, outside the repo)
- `REPO=/Users/rick/.t3/worktrees/verified-list-ui/t3-4e767245` (branch `t3/review-local-result`)
- `LANE=/Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py`

Each step lists its output log in `evidence/`. Paths outside the repo are written as they were executed.

Two simplifications:

- `…` stands in for date stamps in the echo headers.
- Step 8 leaves out its echo/printf section framing and a no-op `git ls-files`.

**Environment**

- Node v22.23.1.
- Solver work ran only through `$LANE`.
- The snapshot ran with no checkout and no worktree.

## 1. Snapshot of exact head (15:04:57Z)

```sh
cd $REPO && mkdir -p $S/head && git archive --format=tar 44809983ca516600292b42a8f2b7db8b4ecc1b78 | tar -x -C $S/head && ln -s /Users/rick/verification-vibes/verified-list-ui/node_modules $S/head/node_modules
```

The lockfile matches the owner of `node_modules` (`lockfile.log`). The link was removed after the runs with `rm $S/head/node_modules`.

## 2. Focused tests (8), serial lane → `focused-review.log`

```sh
cd $S/head && { echo "head=44809983ca516600292b42a8f2b7db8b4ecc1b78 tree=git-archive start=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; python3 $LANE -- node --test --test-concurrency=1 tests/verify/local-result.test.mjs tests/verify/es-toolkit-sum-mean.test.mjs; echo "exit=$? end=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; } > $S/logs/focused-review.log 2>&1
```

- Expected: 8 pass.
- Observed: 8 pass, 0 fail, exit 0, 15:05:05Z–15:11:59Z.
- It ran once; the log has one header and one exit line.

## 3. Untrusted upstream downloads (15:08:01Z) → hashes in `upstream.log`

The downloads went into their own directory, `$S/upstream-dl`. They were only read and hashed, never executed, and not copied here.

```sh
D=$S/upstream-dl; rm -rf "$D"; mkdir -p "$D/at-1913a76" "$D/at-main-4d5963e"
for c in 1913a7627a2995b095249d6b0b6453b900cdd4bc:at-1913a76 4d5963eb2df129021efdba0de5a3a16bbb3c7bec:at-main-4d5963e; do commit=${c%%:*}; dir=${c##*:};
  for p in src/math/sum.ts src/math/mean.ts src/math/sum.spec.ts src/math/mean.spec.ts LICENSE; do
    out="$D/$dir/$(echo $p | tr '/' '_')"; curl -sS -L --fail -o "$out" "https://raw.githubusercontent.com/toss/es-toolkit/$commit/$p" && echo "ok $dir $p" || echo "FAIL $dir $p"; done; done
```

Run at 15:25:47Z:

```sh
git ls-remote https://github.com/toss/es-toolkit refs/tags/v1.53.2 'refs/tags/v1.53.2^{}' refs/heads/main
cd $S/upstream-dl && for f in */*; do printf '%s %s %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$(wc -c < "$f" | tr -d ' ')" "$f"; done
```

There is no peeled `^{}` line, so `v1.53.2` is a lightweight tag at `1913a76`.

## 4. Provenance and annotation → `annot-check.log`

This step runs no solver, so it ran outside the lane.

```sh
cd $S && { echo "head=… start=…"; node review-scripts/annot-check.mjs $S/head $S/upstream-dl; echo "exit=$?"; } > $S/logs/annot-check.log 2>&1
```

- Expected: 10 PASS lines.
- Observed: 10 PASS, exit 0.
- Script: `scripts/annot-check.mjs`.

## 5. Probes, run 1 (31 probes) → `probes-run1.log`

```sh
cd $S && node --check review-scripts/probes.mjs && { echo "head=… start=…"; python3 $LANE -- node review-scripts/probes.mjs $S/head; echo "exit=$? end=…"; } > $S/logs/probes.log 2>&1
```

- Observed: 31 PASS, 0 false proofs, exit 0, 15:18:40Z–15:18:56Z.
- At 15:24:51Z this log was renamed to `probes-run1.log`.
- The script then gained a scratch-directory argument and 8 probes:
  - the dead-var pair;
  - `loop-body-local-unavailable-to-invariant`;
  - callback, `every` in ensures, `every` in invariant, destructured and import bindings named `result`.

## 6. Strong/weak controls → `es-controls.log`

```sh
cd $S && node --check review-scripts/es-controls.mjs && { echo "head=… start=…"; python3 $LANE -- node review-scripts/es-controls.mjs $S/head $S; echo "exit=$? end=…"; } > $S/logs/es-controls.log 2>&1
```

- Expected: every control matches its expectation, and no verified claim fails natively.
- Observed: 9 controls, 0 unexpected, 0 false proofs, exit 0, 15:21:11Z–15:21:39Z.
- Script: `scripts/es-controls.mjs`.

## 7. Probes, run 2 (final, 39 probes) → `probes.log`

```sh
cd $S && { echo "head=… start=…"; python3 $LANE -- node review-scripts/probes.mjs $S/head $S; echo "exit=$? end=…"; } > $S/logs/probes.log 2>&1
```

- Observed: 37 PASS, 2 NON-PROOF (the dead-var pair is unsupported), 0 false proofs, exit 0, 15:25:01Z–15:25:17Z.
- Script: `scripts/probes.mjs`.

## 8. Repository checks (15:22:21Z and 15:26:05Z) → `repo-checks.log`

These are the inputs for the name comparison:

```sh
L=/Users/rick/verification-vibes/artifacts/roadmap-20261113/local-result-evidence/full-suite.log
grep -E '^ok [0-9]+ - ' $L | sed -E 's/^ok [0-9]+ - //' | sort > $S/logs/full-names.txt
git grep -hoE '^test\((`[^`]*`|"[^"]*"|'"'"'[^'"'"']*'"'"')' 13df4da -- 'tests/verify/*.test.mjs' | sed -E 's/^test\(.//; s/.$//' | sort > $S/logs/static-names.txt
```

These are the checks, run from `$REPO`:

```sh
git ls-tree -r 4480998 | awk '{print $3"  "$4}' | sort -k2 > $S/logs/tree-4480998.txt
( cd $S/head && find . -type f -not -path './node_modules*' | sed 's|^\./||' | sort | while read -r f; do printf '%s  %s\n' "$(git hash-object "$f")" "$f"; done ) > $S/logs/tree-archive.txt
cmp -s $S/logs/tree-4480998.txt $S/logs/tree-archive.txt
git diff --stat 13df4da 4480998
git diff --stat fa2b439 4480998 -- verify/source.mjs
git show 4480998:verify/source.mjs | grep -nE 'localName\(|LOCAL_RESERVED|RESERVED\.has'
( cd /Users/rick/verification-vibes/artifacts/roadmap-20261113/local-result-evidence && shasum -a 256 -c SHA256SUMS )
grep -cE '^ok [0-9]+ ' $L; grep -cE '^not ok ' $L; grep -E '^# (tests|pass|fail|cancelled|skipped|todo) |^exit=' $L
for c in fa2b439 13df4da 4480998; do git grep -hE '^test\(' $c -- 'tests/verify/*.test.mjs' | wc -l; done
comm -23 $S/logs/full-names.txt $S/logs/static-names.txt; comm -13 $S/logs/full-names.txt $S/logs/static-names.txt
for t in tests/verify/es-toolkit-sum-mean.test.mjs tests/verify/local-result.test.mjs; do git show 4480998:$t | grep -oE '^test\("[^"]+' | sed 's/^test("//' | while read -r n; do printf '%s ok-lines=%s\n' "$n" "$(grep -cF -- "- $n" $L)"; done; done
```

**Correction.** The first run hashed `package-lock.json`, which does not exist; this repo uses `pnpm-lock.yaml`. That section of `repo-checks.log` was then rewritten from the `pnpm-lock.yaml` hashes already measured at 15:04:34Z–15:04:42Z. Run at 15:29:40Z, `lockfile.log` recomputes those hashes directly and agrees:

```sh
shasum -a 256 $S/head/pnpm-lock.yaml /Users/rick/verification-vibes/verified-list-ui/pnpm-lock.yaml
git show 4480998:pnpm-lock.yaml | shasum -a 256; git show fa2b439:pnpm-lock.yaml | shasum -a 256
git diff --quiet fa2b439 4480998 -- pnpm-lock.yaml package.json
```

The intermediate files `full-names.txt`, `static-names.txt` and `tree-*.txt` stay in `$S/logs` and are not copied.

## Committing the logs

`.gitignore:8` ignores `*.log` across the repo. The eight `evidence/*.log` files were added with `git add -f`, and `.gitignore` was left unchanged.

## Not run

- The full suite was not rerun: its durable log covers `13df4da`, and only a report file changed afterwards.
- No push, PR, comment or watch was made.
