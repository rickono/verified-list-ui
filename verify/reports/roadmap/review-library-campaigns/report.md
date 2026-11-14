# Independent review of the pinned numerical library campaign

**Verdict: PASS.** The maintained package's stated numerical results hold under the checks below. This review does not complete Q, K, or any roadmap node.

Checkout `2809e885ef01e09da906ddc31e070fde1df180a2` on `t3/review-library-campaigns`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists. The package tree matches evidence tip `7e6d9b56c36e89dac9d9b7943771feb8af4dd0ab`. Tested head `42567fc7b286e2a8e838279396fcb444e1118253` and initial `cf7c183a6cefcf14742738bc11e21a695f99cb67` are the campaign commits. Parent `203ad818169be544432b3bad93ff1c4f01ef20a3` is their base.

## Runtime bytes

Eighty-six runtime files under `verify/` (`.mjs`, `.js`, `.cjs`, `.ts`, `.json`, excluding `verify/reports/`) are byte-identical at the parent, `f974b30da4efcf16b69df889b909975e3321dcb2`, coordinator `59ee1dcf7d646d46fdfc847f94e0798c631d7908`, the evidence tip, and this HEAD. The parent and `f974b30` also match on every other non-report `verify/` path. Coordinator and this HEAD add only `verify/design/stateful-protocols.md`. That file is not a runtime module. This review used the local runtime after that comparison. `runningIdentity()` returned `13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106` on Node v22.23.1, darwin arm64.

## What the hashes bind

All 10 final stages passed. Their ids are `native-harmonic`, `native-d3`, `native-cycle100`, `native-cycle5`, `cycle-diagnostic`, `d3-admission`, `harmonic`, `ramda`, `query-inputs`, and `freeze-and-model`. The stage list has no per-stage git field. The checksummed `run.json`, `evidence.json`, and `model.json` record tested head `42567fc`. The first attempt's envelope still records `cf7c183`. The admission preflight command records parent `203ad81`.

`SHA256SUMS` has 161 lines. `shasum -a 256 -c` passed, and each line matches the blob at tip `7e6d9b5`. The sums cover this package, not an arbitrary checkout. The prepared-parent digest `cddcdf5230636188466bce3b4822a4cc877d65811f63146e031d57e2d8a0ec39` recomputes from the 825 blobs of parent `203ad81` with `JSON.stringify`. The same path list in this worktree does not match: `.audit/roadmap-20261113.tsv` differs. The campaign attributes that digest to the prepared parent. That statement is right, and it is not current-checkout equality.

Failed experiments remain. `02-campaign` is ISSUES because the diagnostic wrapper kept an import; its other stages passed. `04-drift-controls` timed out in the shared lane before Node ran. Its raw result still contains the premature "refused before semantic imports" sentence, and `correction.json` withdraws that sentence. `06-integrity-setup` expected 11 stages; the passing list has 10.

## Harmonic mean

New compile, no solver. Stripping contract comments from `harmonic-total.js`, `harmonic-positive.js`, and `harmonic-weak.js` restores `harmonic_mean.js`, and the tokens match. The source sha256 is `c0bcedc78add016bd1f22ce9eb1a417363ac72d8cb5c0e7dfa4c74062a19f71d` and the ISC license sha256 is `63b5b6a85bc21476ebee13febd48d0a52056a695754a73aaed1ed7eafb059f29`. Positive differs from total only by `ensures result > 0`. Weak drops only the `reciprocalSum` invariant. All three share the requires `x.length === 1` and `Number.isFinite(x[0]) && x[0] > 0`, and the same precondition SMT. That SMT does not require a finite reciprocal. The retained query plans do not contain witness bits `0000001000008041`.

`ensures true` simplifies to SMT true and is not a query. Total's remaining obligations are `throw-unreachable`, `invariant-init`, `throw-unreachable`, `invariant-preserve`, and `rank`. Those are the unreachable-throw and termination obligations inside the total-return proof. Positive and weak add `ensures` for `result > 0`. The weak invariant does not prove positivity.

Inherited final solver log, not re-solved: total `verified`; positive confirmed counterexample `3.3951948877e-313` (bits `0000001000008041`) with native result `+0`; weak `unknown` / `induction-gap` at ensures. The `02-campaign` weak log remains a confirmed `+0` at `1.35807730622e-312`. Neither weak result is a proof.

New native import of the unchanged module: `Number.MIN_VALUE` and `2 ** -1024` have reciprocal Infinity and result bits `0000000000000000`. `2 ** -1022` round-trips. Input 49 is one ulp high (`4048800000000000` to `4048800000000001`). `[2, 3].toFixed(2)` is `2.40`. The one-ulp row is not the defect.

New `reproduce()` on the current positive file returned `reproduced`, result `"0"`, `confirmed: true`, graph `48f186e1e6a863fc581597ff8f49aba20831ad1e474567773caa457170c70469`. That API does not call `solve`. A one-comment source copy returned `stale`. Identity `0` repeated 64 times returned `invalid-evidence` with the model-identity message. The warm total receipt is an inherited log: status `verified`, one cache hit, `solved` empty. It is a trusted receipt, not a certificate.

## Ramda

New extraction from the vendored file: the eager `findIndex` declaration is 174 bytes, sha256 `9005ea9989f87b9f5ce349fa5467f8256cd1c085a5a0e7faaca330eb68167275`, matching the pin that names `980b3bf7712adb8ad8b5d9b2c6aca525cb3cf143`. That commit object is not in this repository. No fetch was made. The vendored file sha256 `78467c00c06ef87c44d6d8415a9d9ee3cd7c41c549890fb0fef2b87d06e4bac1` and MIT license sha256 `62fba31dc0582fb6ee413403e47f2de319a4f14140ebd71be094c1f8c7a839ff` match the pin. The checker builds the annotated source by token-preserving insertion around that declaration.

Inherited upstream report: `verified`. The callback domain is every pure total unary predicate from binary64 to a present boolean, including NaN, infinities, signed zeros, and subnormals, and excluding effects, exceptions, and NaN-payload identity. The array domain includes every dense native length. The ensures clauses are integer bounds, match, first-match order, absence, and the rank obligation carries termination. This is not a finite predicate table. The generic proof was not re-solved.

Inherited mutants `off-by-one` and `skipped-first` are confirmed counterexamples on `[0]` with an always-true table, results `1` and `-1`. A new `Function` replay of those retained sources returns `1` and `-1`, while `Array.prototype.findIndex` returns `0`. The manifest excludes them from real-bug counts.

## d3-array

New `git show` of `a83f50762005ae47edfe3e07295f3840b485687b`: `nice.js`, `ticks.js`, and `LICENSE` under the `24c015e4d894ee44af6cf6a2cc9e300b1885b0d9` pin equal `pins/d3-array/`. License sha256 `2a6d2d5f32ba0b755ddbc1c833f766e30cdbe6ebe9a6d4e3e24427721f0b63d3`. The published ticks document sha256 `728883f5266670f4abbccf6ef8ea57a9e4b15f5cec02969b3d48f24843fba531` contains "covering the given interval". That coverage sentence is inherited provenance, not a current-main or novelty claim.

New native imports: `nice(0.9299999999999999, 0.93, 1)` and the same endpoints with count `5000` both return `[0.93, 0.93]` and fail coverage. First increments are `-1e16` (`c341c37937e08000`) and `-5e19` (`c405af1d78b58c40`). `nice(1, 9, 5)` is `[0, 10]`. `nice(0.9299999999999999, 1.07, 5000)` covers. These match the retained final native log.

New `load` of unchanged `nice.js` returns unsupported at `ticks.js` line 1, span `[0, 73)`, text `const e10 = Math.sqrt(50),\n    e5 = Math.sqrt(10),\n    e2 = Math.sqrt(2);`, message "Only ordinary top-level functions and const function expressions are supported." `compile` was not called and `solve` was not called. There is no formal proof of `nice`.

The corrected unchanged-source call with bits `3fbcc42ba089e7d0`, `3fbcc42ba089e7d1`, and count 5 printed `calling` and did not return. `spawnSync` used an 800 ms timeout, `SIGKILL`, and `ETIMEDOUT`. After wait, the pid was absent. Classification: unknown. It does not prove nontermination. The first reviewer path resolved to `verify/reports/library-campaigns/...` and exited `ERR_MODULE_NOT_FOUND` without calling `nice`. That stderr is unchanged in `logs/hang-nice-attempt1.stderr.txt`.

A new walk applies the original loop formulas to the pinned `tickIncrement`. On this input the head state repeats at iteration 4 the state first seen at iteration 2, period 2. All four states have `returns: false`. Two calls to `tickIncrement` on each head agree. The steps are `-5e17` and `-2e17`. Under pure deterministic `tickIncrement` and the standard `Math` operations in the loop, the transition repeats. That is a conditional mathematical argument about an instrumented state walk, not an unchanged-source solver theorem and not a rewritten kernel.

## Runner

A new copy of the 47 pinned inputs, with one comment appended to `nice.js`, ran the copied `check.mjs`. Exit code 1. Stderr is the `inputCheck` assertion `Source/provenance drift: verify/reports/roadmap/library-campaigns/pins/d3-array/nice.js`, from `supervise` before any verifier import and with no lane message. The checker does create the output directory before that hash check. The scratch directory was removed. Inherited `05-drift-controls` records the same refusal for source bytes and for provenance. Inherited `04` does not: those processes died at the lane wait.

Retained final native commands have `aliveAfterWait: false`. This review removed its temporary `node_modules` link to the coordinator install. No review process remained.

## Limits

No full campaign, full suite, or fresh solver. The shared solver lane was busy at a non-blocking probe, including an earlier holder `serial-verify.py -- python3 verify/reports/roadmap/C2a-evidence/run-final.py`. Entering `serial-verify.py` would have waited on that other checkout, so it was not called. The 800 ms kill therefore ran outside the lane. Es-toolkit was not rerun; the campaign's inherited claim stays the empty-input `sum`/`mean` statement. Frontend, binary64 translation, Z3/WASM, and the inherited solver transcripts remain trusted. Receipts are not certificates. Query plans are static inputs, not transcripts.

Evidence is `verify/reports/roadmap/review-library-campaigns/logs/review.json`. Commands are `logs/commands.txt`.
