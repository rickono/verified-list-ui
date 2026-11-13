# Exact commands and results

Code under test: `git archive c9c45110b8669f99f83c4330d6efe1b6202ff1be` extracted at `/tmp/p-review-code`. `verify/index.mjs` blob `cd0b0539f89aaf845139b9b3861c2cbc249d9968` matches that commit. The archive's `node_modules` was a symlink to `/Users/rick/verification-vibes/verified-list-ui/node_modules` and was removed at the end of the review. The shared install was not modified. Runtime: Node v22.23.1, darwin arm64, z3-solver 5.3.3.

Solver lane: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- COMMAND`.

## Receipt re-check (no solver)

Run from `/Users/rick/.t3/worktrees/verified-list-ui/t3-04da8a47` with `git show` / `git merge-base --is-ancestor` / `git diff` / `git patch-id --stable`.

| Check | Result |
| --- | --- |
| Ancestor `32bd5b260aa116ca88642a1479bed8d3fc447f4b` of HEAD `59ea39d`, `c9c4511`, and `98c06aa` | yes |
| `verify/` present; pstack settings absent | yes |
| Range commits | `688fdbf`, `e1de182`, `ed10db6`, `c9c4511`, `98c06aa` |
| `c9c4511..98c06aa` | report and evidence files only |
| `source.mjs` blob parent and `c9c4511` | `ecb43e934b05004f88051cc3c951f14f045b2c2e` |
| Design blob parent, `c9c4511`, `98c06aa`, HEAD | `9f042612e65127d6a55ad536911974ddded38cbd` |
| Roadmap json/md and `.audit/roadmap-20261113.tsv` parent = `c9c4511` = `98c06aa` | unchanged in the P range |
| Patch-id of `53e33a3` and `688fdbf` on proofs, backend, index | `e0c7adb010167c6e6f17f80dbac7004c2b3b8b7c` |
| Label diff | one line in `verify/proofs.mjs` |
| Eight source SHA-256 values at `c9c4511` | all match the receipt table |
| `P-evidence/SHA256SUMS` | 23 files, 0 mismatches |
| `full-final.log` | tests 278, pass 278, fail 0, 278 unique `ok` names |
| Name correspondence | 274 top-level literals, 0 missing from the log, 4 generated deadline names |
| `full-before-label-fix.log` | 277/277 |
| `after-label-fix-focused.log` | 41/41 |
| `workflow-focused-final.log` | 20/20 |
| `recovered-focused.log` | 83/83 |
| `saved-artifact-cli.log` | status `reproduced`, 3/3 `reproduced: true`; warning is trailing stderr |
| `bugs.json` shrink | equalityAlone 5/false, finiteDouble 29/true, brokenClamp 14/true, limit 300, greedy |
| Wasm SHA-256 | `591c5a534abf69c74d6c21813ef36c7e1b2d9b6151bf871a7be4803f542fa377` |
| Lane log tested head | `c9c45110b8669f99f83c4330d6efe1b6202ff1be` |

## Nonsolver probe

`node /tmp/p-review-out/probes-nonsolver.mjs`

The script sets `P_REVIEW_NO_SPAWN=1` and patches `child_process.spawn` to throw before the real spawn. Exit 0. Log `logs/nonsolver.log`. Final line: `{"check":"nonsolver-done","ok":true,"passed":37}`. Stderr is only the `stripTypeScriptTypes` experimental warning.

Measured rows include: running identity match; 0 scripts before replay for invalid, stale, empty, forged-status, and non-object artifacts; signature forgery `not-reproduced` after 6 scripts; poisoned shrink `not-reproduced` and `{shrunk:false}` `reproduced` at n=50; identical relocation `reproduced` and a comment edit `stale`; saved bugs artifact `reproduced` 3/3; shrink skip 0 oracle calls; greedy number 146 replays to 50; greedy cap replays 300 values `[100, 2147483648, 1e300, 1e300]`; readonly/audit/plan open created nothing and spawned nothing; `verify(source)` isolation message as in `findings.md`; CLI exits 2/1/0 as in `findings.md`.

## Focused tests and cache IO

From `/tmp/p-review-code`:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/proof-phase-parity.test.mjs tests/verify/workflow-cli.test.mjs
node --test --test-concurrency=1 tests/verify/cache-io.test.mjs
```

`logs/focused-cli.log` starts with the lane banner. tests 2, pass 2, fail 0. Phase-parity duration 218 ms. Workflow CLI duration 2710 ms. Exit 0.

`logs/cache-io.log`: tests 3, pass 3, fail 0, duration 330.6 ms. Cache IO does not start Z3, so it was not placed on the solver lane.

## Solver probe 1

`python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/p-review-out/probes-solver.mjs`

Node stdout: `logs/solver.log`. Exit of the node script: 1. Passed checks: six default reports (each `identical: true`), es-toolkit byte pin, es-toolkit cold/warm/plan/audit, bugs evidence shrink. Failed its own `callee-gate` assertion. Actual caller reason was `dependency-violation` with `written: []` after a same-file body edit invalidated both keys. Recorded as a dropped hypothesis in `findings.md`. The script deletes its scratch directory, including the baseline `node_modules` symlink, in `finally`.

## Solver probe 2

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/p-review-out/probes-solver-2.mjs
```

`logs/solver-2.log` begins `Waiting for the shared solver test lane.` / `Acquired the solver test lane.` Passed `hit-callee-gate` and `benign-forgery-trust-control`. Exited 1 on the repair assertion because warm `solved` was `bug`. Stderr `logs/solver-2.err` is `Error: repair` plus the experimental warning.

Corrected assertion, remaining checks only:

```sh
P_REVIEW_SKIP_DONE=1 python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/p-review-out/probes-solver-2.mjs
```

`logs/solver-2b.log` acquired the lane and exited 0. Rows: write-policy-and-repair, readonly-and-plan-create-nothing, special-heap, special-predicate, special-callback, config-relocation. Stderr is the experimental warning only.

## Hit-path and trust rows (from solver-2.log)

```json
{"check":"hit-callee-gate","ok":true,"detail":{"included":["caller","positive"],"caller":"dependency","positive":"counterexample","hits":["caller"],"solved":["positive"],"written":[],"otherIncludes":["other"]}}
{"check":"benign-forgery-trust-control","ok":true,"detail":{"readonly":"verified","audit":"counterexample","kinds":["logical"],"trust":"Receipt integrity and trusted writers are required; no proof certificates. Readonly does not authenticate. Audit re-solves independently of receipts."}}
```

## Repair and later rows (from solver-2b.log)

```json
{"check":"write-policy-and-repair","ok":true,"detail":{"coldWritten":["fine"],"rejected":["unparseable"],"repaired":["fine"],"witness":1,"warmHits":["fine"],"warmSolved":["bug"]}}
{"check":"readonly-and-plan-create-nothing","ok":true,"detail":{"readonlyWritten":[],"planTargets":2,"noSolver":true}}
{"check":"special-heap","ok":true,"detail":{"status":"counterexample","skipped":"heap, callback-probe or predicate-table witness","reproduced":"reproduced"}}
{"check":"special-predicate","ok":true,"detail":{"status":"counterexample","skipped":"heap, callback-probe or predicate-table witness","reproduced":"reproduced"}}
{"check":"special-callback","ok":true,"detail":{"status":"counterexample","skipped":"heap, callback-probe or predicate-table witness","reproduced":"reproduced"}}
{"check":"config-relocation","ok":true,"detail":{"tsconfig":"tsconfig.json","moved":"reproduced","editedConfig":"stale"}}
```
