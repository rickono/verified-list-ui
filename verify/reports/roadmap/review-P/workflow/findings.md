# P workflow review

**Verdict: PASS.**

Independent review of immutable range `e435c8abce3107f3afce5be2b10ae23102d269d2..98c06aab10e9f68a707db06449bb79cbf8629537`. Tested code is `c9c45110b8669f99f83c4330d6efe1b6202ff1be`. Commit `98c06aa` adds the implementation report and its evidence. Prepared review HEAD before this report is `59ea39d7e579a0f3966629dc5980a63525309902` on `t3/review-proof-workflow`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor of that HEAD, of `c9c4511`, and of `98c06aa`. `verify/` exists. Pstack settings are absent.

No executed product defect. A forged benign witness is the documented cache-trust control. Readonly replay returned `verified`. Audit re-solved to `counterexample`, recorded disagreement kind `logical`, and wrote nothing.

## Scope that stayed put

`verify/source.mjs` blob `ecb43e934b05` and content SHA-256 `38bbea4deee14933640511a90336142d1d1bde67793c4ae0f752ced597c52e2e` match the parent and the receipt. Design `verify/design/project-workflow.md` blob `9f042612e651` is identical from the parent through this review HEAD. Across the reviewed range, `docs/verification-roadmap.json`, `docs/verification-roadmap.md`, and `.audit/roadmap-20261113.tsv` are unchanged. Cherry-pick `688fdbf` matches partial `53e33a3` on `verify/proofs.mjs`, `verify/backend.mjs`, and `verify/index.mjs` (stable patch-id `e0c7adb010167c6e6f17f80dbac7004c2b3b8b7c`). The `c9c4511` change in `verify/proofs.mjs` is one line: a verified outcome keeps no last-postcondition label. All eight claimed source hashes at `c9c4511` match. `P-evidence/SHA256SUMS` matches all 23 listed blobs. Wasm `z3-built.wasm` SHA-256 is `591c5a534abf69c74d6c21813ef36c7e1b2d9b6151bf871a7be4803f542fa377`. `runningIdentity()` here is `ffa6dc01465e53e123f77aef439e80c04c93eee8445861facbe15e24961c393c` (Node v22.23.1, darwin arm64, z3-solver 5.3.3, 25 wasm files).

## Receipt counts

The 278-test suite was not re-run. `full-final.log` has 278 `ok` lines, 278 unique names, `# pass 278`, `# fail 0`. The names are the 274 top-level string literals under `tests/verify` plus four generated deadline names from `tests/verify/proof-backends.test.mjs:38`. `full-before-label-fix.log` is 277/277. `after-label-fix-focused.log` is 41/41. `workflow-focused-final.log` is 20/20. `recovered-focused.log` is 83/83. The saved CLI object has status `reproduced` and three outcomes, each `reproduced: true` (`equalityAlone`, `finiteDouble`, `brokenClamp`). Trailing text is the experimental `stripTypeScriptTypes` warning after the JSON object. Saved shrink counts are equalityAlone 5 unchanged, finiteDouble 29 changed, and brokenClamp 14 changed, each with limit 300 and `greedy: true`. This review's solver replay of `verify/examples/bugs.ts` produced those same counts, and `reproduce` of the saved artifact returned `reproduced` for all three.

## Executed behavior

The code under test was `git archive c9c4511` at `/tmp/p-review-code`. Solver commands used `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py`. Commands and raw logs are in `evidence/`.

Default `verify(source)` reports for identity, requires-definedness, body-local result, heap, callback, and caller deep-equal the parent archive. Obligations match. Those reports have no cache field. Requires-definedness is a counterexample in phase `requires-definedness` with a null label. `verify(source)` of `import {secret} from './secret.ts'` returns status `unsupported` and message `verify(source) never reads files; use verifyFile(entry) to import ./secret.ts.` The secret file was unread and no `.jsverify` directory appeared.

es-toolkit pin `1913a7627a2995b095249d6b0b6453b900cdd4bc`: `sum`, `mean`, and both specs match the provenance bytes. Cold wrote two verified receipts and spawned twice. Warm spawned 0. Plan at `timeoutMs: 1` spawned 0, with `plan.noSolver` true and an empty outcome list. Audit solved 2, recorded 0 disagreements, and wrote 0. Readonly on a missing directory created nothing.

Separate-file hit path, contract unchanged, helper body `=> x` replaced by `=> x - 1`: selection is `caller` and `positive`; `positive` is a confirmed counterexample; `caller` is a hit with reason `dependency`; `caller` is absent from `written`; target `other` does not pull in `caller`.

Write policy on a file with `bug = n*2` (`ensures result<100`) and `fine = n` (`ensures Object.is`): cold writes exactly `fine`. Replacing that receipt with `{` yields one rejection, reason `unparseable`, then one fresh verified write of `fine` whose parsed witness has length 1. The next readwrite hits `fine` and solves only `bug`.

Readonly and plan against missing cache directories create neither directory and write nothing. Plan reports `noSolver: true`, two targets, and zero outcomes.

Real heap-mutation, predicate-table, and callback-probe counterexamples are confirmed. `reproduce` returns `reproduced`. Shrink is skipped with `heap, callback-probe or predicate-table witness`. A nonsolver oracle hook recorded 0 calls for those three shapes and for a `readonly number[]` length target. Greedy shrink of hex(`1e300`) on `n*2` / `ensures result<100` reaches 50 in 146 replays, changed, limit 300. A four-parameter conjunction stops at replays 300 with values `[100, 2147483648, 1e300, 1e300]`. That cap bounds replay work.

`reproduce` compiles 0 `vm.Script`s for an invalid second witness, a bad proof key, a stale graph, empty witnesses, a forged status field, and the shapes `null`, array, the string `reproduced`, a number, and `{status}`. Statuses are `invalid-evidence`, `stale`, or `not-reproduced`. A forged signature compiles scripts and returns `not-reproduced`. A poisoned shrunk witness returns `not-reproduced`. `{shrunk:false}` returns `reproduced` with input `n` 50. An identical relocated one-file graph reproduces; one added comment is `stale`. An identical tsconfig path graph reproduces with evidence `tsconfig` `tsconfig.json`; one added newline in the destination tsconfig is `stale`.

CLI: `--nope`, `reproduce` without a source, `--cache-mode audit` without `--cache`, and two `--target`s exit 2 with empty stdout. Forged JSON exits 1 and the parsed status is `stale`. A real hand artifact exits 0, status `reproduced`, input `n` 50. Text `replay` stdout is `reproduced`. An oversized file and a directory exit 2 with stderr `Invalid or oversized evidence file.` and empty stdout.

`tests/verify/proof-phase-parity.test.mjs` and `tests/verify/workflow-cli.test.mjs` pass 2/2 (`focused-cli.log`). `tests/verify/cache-io.test.mjs` passes 3/3 (`cache-io.log`): concurrent writers and readers, mid-write SIGKILL, and stale cleanup that keeps an active local PID, a foreign host, and unrelated files.

## Dropped hypotheses

A same-file body edit of `id` changed both proof keys (`solver.log`, check `callee-gate`). The caller was `unknown`, reason `dependency-violation`, message `id violated its contract during replay.`, the callee was a confirmed counterexample, and `written` was empty. That request is fail-closed fresh solving. The hit-path result is the separate-file run above.

The first repair assertion required the following warm request to solve nothing (`solver-2.log` exit 1). The warm request solved `bug` and hit `fine`. Counterexamples are not receipts. `solver-2b.log` records that corrected observation and exits 0.

The 300-replay stop above a minimal quadruple is the stated work limit. Status `not-reproduced` contains the letters of `reproduced` and still exits 1 with that exact status. The four TAP names beyond top-level `test("` literals are the generated deadline tests. `first-workflow.log` records earlier identity `d3855a83aa4894839fd7a9262f03e3048d34a659768b17dcfa84c64c615ce095`. The identity recomputed for `c9c4511` is `ffa6dc01…`.

## Limits

`cache.test.mjs` and `manifest.test.mjs` were not repeated. No performance ratio was measured. Stateful and K code were outside this review. Receipt integrity and trusted writers remain assumptions. One native witness is not a proof. This review does not mark roadmap P complete.
