# P review: proof cache and project workflow

Verdict: **PASS**. No defect survived execution. The tested code is `c9c45110b8669f99f83c4330d6efe1b6202ff1be`. The report-only tip is `98c06aab10e9f68a707db06449bb79cbf8629537`. This review checkout stayed on its prepared branch and did not edit the implementation worktree, the canonical roadmap, or the design.

Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor of both this checkout and `c9c4511`. `verify/` exists. `verify/source.mjs` is unchanged from the prepared parent `e435c8ab`. The only `proofs.mjs` change after `ed10db6` is the terminal-label guard.

## Receipts checked, not relabeled

`P-evidence/SHA256SUMS` matches all 23 blobs at `98c06aa`. The eight source hashes in `P-implementation.md` match `c9c4511`. `pnpm-lock.yaml` at that commit matches the shared install, SHA-256 `8a0e19b6…afa21`. A read-only manifest walk reproduced the recorded identity `ffa6dc01…c393c`, Z3 package `86b294aa…b685`, and wasm `591c5a53…a377` on Node v22.23.1, darwin, arm64.

| Claim | Checked evidence |
|---|---|
| Full suite 278/278 | `full-final.log`: tests 278, pass 278, fail 0, cancelled 0, skipped 0. `full-final-lane.log` records HEAD `c9c4511`. Every string-literal test name at `c9c4511` is an `ok` line. The four extra `ok` lines are the generated deadline orders in `proof-backends.test.mjs`. |
| Focused 41/41 | `after-label-fix-focused.log`: pass 41, fail 0. |
| Before the fix 277/277, then 0/1 | `full-before-label-fix.log` pass 277; `terminal-label-before-fix.log` fail 1. |
| 3/3 bugs | Saved `bugs.json` replayed through archived `verify/examples/bugs.ts`: `reproduced` for `equalityAlone`, `finiteDouble`, and `brokenClamp`, including the shrunk clamp witness `lo=0`, `hi=0`. A fresh solve also confirmed all three, with different Z3 models. |

This review reran the cache, manifest, cache I/O, CLI, and label tests: **21/21 pass, fail 0**, `duration_ms 27496.56375`. The 278-test suite and the es-toolkit pilot were not rerun.

## Executed behavior

Scheduler mocks of parent `e435c8a`, pre-fix `ed10db6`, and `c9c4511` send the same queries. Definedness runs before feasibility and a definedness counterexample does not query feasibility. Feasibility `unsat` is vacuous and stops. An oversized feasibility witness goes to the small-witness query and then `witness-too-large`, not `verified`. A second postcondition counterexample keeps that obligation's label on all three versions. A completed proof has **no label** on the parent and on `c9c4511`. `ed10db6` still attaches the last, abstract obligation. That is the real regression the one-line fix restores. The live label test passed.

Default `verify(source)` reports and every `obligation()` for identity, requires-definedness, vacuous, heap, and caller matched the parent byte for byte, including a definedness counterexample with phase `requires-definedness` and a vacuous result. Those reports have no `cache` field.

Solver input retained by `proofKey` is only `declarations`, `assertions`, `models`, and `replayGuards`. Target, phase, domain, postcondition index, and postcondition count are diagnostic. A leading comment and a renamed file share a key. Adding a definedness query or editing the body changes the key. `validWitness` rejects an empty witness, a bad number, a 257-element array, predicate garbage, an empty predicate object, a table over `REPLAY_LIMIT` (256), a 200,000-element heap, a non-decimal ref, a ref given as an array, and a root mismatch. Cache reads and `answer()` call this one function.

The shipped closure is the 16 verifier modules reached from `index.mjs`, including `solver.mjs` via `new URL("./solver.mjs", import.meta.url)`, plus acorn, async-mutex, tslib, and every file in `z3-solver@5.3.3` (25, including `build/node.js`, `build/z3-built.js`, and `build/z3-built.wasm`). The parser follows side-effect imports, named imports, re-exports, `export *`, literal and template dynamic imports, and worker URLs. A computed import disables identity. Editing `solver.mjs` in a private copy changes the identity. Editing it after the process has loaded disables reuse instead of hashing the new bytes. The manifest tests also passed for index/cache/model edits and for private copies of the Z3 JS and wasm files.

A leaf changed from `x` to `x-1` is re-solved to a counterexample. Its callers keep their receipts only when replay of witness `4` still satisfies the contracts, and both the direct caller and the transitive caller then finish `unknown` / `dependency`. Nothing is written. When the stored caller witness itself fails against the new leaf, those hits are `rejected: replay`, solved once, and also finish `dependency-violation`, with nothing written. A shape-valid witness of `0` on `requires x>0` is `rejected: replay`, solved once, repaired, and the next run is hits only. Definedness counterexamples and vacuous results are not receipts; the next run solves them again and hits only the verified sibling. Readonly, audit, and plan create no directory. Readonly and audit write nothing.

## Trust control, not a defect

A witness of `0` transplanted under the current key for `n*2` with `ensures result<100` makes readonly report `verified`. Audit re-solves, reports disagreement kind `logical`, returns the counterexample, and writes nothing. That is the stated assumption that receipt integrity and writers are trusted. Readonly is not authentication. It is not a new false-proof bug.

## Dropped hypotheses

A copy of `index.mjs` with an added `require("./not-imported.txt")` stays enabled and does not hash that file. No shipped closure module has a Node `require` or a computed `import()`. `specifications.mjs` uses a local SMT helper named `require`. There is no accepted stale hit, so this is not a defect.

An unimported text file beside the verifier does not change identity. It is not loaded. A future loader that the shipped modules do not use was not treated as a bug.

## Limits

The full suite, es-toolkit pilot, and `proof-backends` / `backend-process` files were not rerun. Phase parity for those suites rests on the parent report comparison above, the mock differential, and the committed 277/278 logs. The shared `node_modules` tree was not modified. No review process or dependency link remains.
