# Checkpoint C1 documentation review

Verdict: **PASS**. Attention flags: four documentation notes, all non-blocking. No executed product defect. No roadmap node is marked complete by this review.

## Checkout

| Item | Value |
| --- | --- |
| Review commit under review | `bd0d9570e8f910a8cf7db14cf517728ba3fd673e` |
| Review branch / checkout | `t3/review-roadmap-checkpoint-c1` at `/Users/rick/.t3/worktrees/verified-list-ui/t3-cd4134db` |
| Main | `41079c5d22ba889005075d23ffd5ef5ca7a1e600` (PR #12 merge) |
| Prior receipt | `2f961eec9f5bd16637bff823d47fb82b9ffb4b94` on coordinator `e2021fa5f5c4785b40dbebb9bf48c5fe7de2ce55` |
| Baseline | `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor of HEAD and of main. `verify/` exists. |

HEAD contains main. The diff against main is documentation only: `.audit/roadmap-20261113.tsv`, `docs/verification-roadmap.json`, `docs/verification-roadmap.md`, `scripts/render-verification-roadmap.py`, `verify/reports/roadmap/plan.md`, and the guarded-throw design judgment under `verify/design/guarded-throws.md` plus `verify/reports/roadmap/judgment-throws/`. Twenty-eight top-level `verify/*.mjs` modules match main blob-for-blob. `verify/bin` and `verify/stateful` (11 paths) match main. No solver process and no `verify` symlink remained.

## What the checkpoint says, checked against logs

These counts were read from committed TAP logs and receipts. Suites were not rerun.

| Receipt | Log result | Binds to |
| --- | --- | --- |
| P isolated suite | 278/278, fail 0, skip 0 | `c9c45110b8669f99f83c4330d6efe1b6202ff1be` via `P-evidence/logs/full-final.log` |
| P + heap audit + numeric | 322/322, fail 0, skip 0 | `dedde91b9f6e1fec3a30f5e39cae65f5381b6b26` via `P-integration/combined-numeric/full.log` |
| C1 original implementation | 47/47 focused, 304/304 full | `5d8415aa8279cab2f4a662b049616ce9d94a98a3` via `stateful-C1-evidence/` |
| C1 first integration attempt | 48 pass, 1 fail, 49 tests; full not started | `74c3747afd1c60d334b8c0713be5786dc715111a`; failure text is `callback-bugs.ts: complete compiled artifact` |
| C1 corrected integration | 49/49 focused, 371/371 full, one full execution | `0345a9adb631f0785ff79ccb7cb9dc842393080a` |
| Unicode admission | archived test fail 1; production frontend 5/5 | `review-unicode-before.log`, `review-unicode-production.log` |
| Loop diagnostic | 11/11 | `review-loop-fix.log` |

`P-integration/combined-numeric/historical-evidence.log` records `invalid-evidence` and `The verification model/backend identity changed.` The receipt keeps the wrapper mistake: the harness expected `stale` after the model change. `fullSuiteRepeated` is false. `tests/verify/stateful-regression.test.mjs` compares complete artifacts, graph hashes, and reports with `assert.deepEqual` against public main `8fa17d6`, and writes only a temporary `verify/.stateful-baseline-*` tree that it removes. `stateful-outcomes.test.mjs` does not write report files.

P is `integrated: true` with `doneWhen` still the original invalidation-and-reproduction sentence. `deliveryStatus` is `finished`. K, Q, R, S, T, U, V, and W stay `integrated: false`. Plan text says eight nodes remain and C1 completes none of R/S/T/U. Heap and numeric sit in `numericGateDelivery` and the heap merge `0d7c39c`, as enabling gates. Numeric review `04ba933` is **ISSUES** and accepts the rules with the N12 timeout and 15 unsat / 23 unknown limits copied into the roadmap data.

K Gate 3 and guarded throws are local. At `7a98698`, `K-evidence/receipt.json` has `full-final.tap` 418/418 and preserves `full-before-oracle-update.tap` 417 pass / 1 fail, plus earlier transaction failures. Code SHA on that receipt is `00e5fc4`; the evidence tip adds `verify/README.md` and reports. At `7692103`, `throws-evidence/full.log` is 331/331 and `focused-P.log` is 37/37, code `b16d07b`. Neither tree is main. Q stays planned.

## Checksums name a git head

`C1-integration/final/runtime-SHA256SUMS` (18 lines) and `stateful-SHA256SUMS` (10) match `0345a9a`. Those runtime bytes also match main and this HEAD: later commits did not change them. `verify/source.mjs` is `6f8568d6…` at `0345a9a`, main, and HEAD.

`P-integration/combined-numeric/runtime-SHA256SUMS` matches `dedde91` on all 18 lines. Against HEAD, only `verify/source.mjs` differs (`38bbea4d…` there, `6f8568d6…` now).

`P-integration/runtime-SHA256SUMS` matches PR #10 merge `b908127edf34202233912b98e43715ee42ba2233` (P on the landed heap audit) on all 18 lines. It differs from isolated P `c9c4511` on `verify/heap.mjs` and from `dedde91` on `verify/data.mjs`. The 278 count stays on `c9c4511`. The 322 count stays on `dedde91`.

Original C1 `verify/source.mjs` at `5d8415a` is `bf990306…`, a different blob from current runtime.

## Generator

No separate JSON Schema file is in the repo. The renderer is the structural check: `node.result.fullSuite` feeds the original-branch table. Commit `ac84980` stored P's new metadata in `node.result` without `fullSuite`. Replaying that JSON through the current loop raises `KeyError: 'fullSuite'`. Commit `06360e4` moved that object to top-level `workflowDelivery`. Current P has no `result` key. Running `python3 scripts/render-verification-roadmap.py` left `docs/verification-roadmap.md` unchanged.

Node status, `doneWhen`, and the generated status line agree that P is integrated and that K/Q/R/S/T/U/V/W are not. Ready packages render as K and T because their node status is still `ready`.

## Trail after `e2021fa`

The append-only TSV adds 29 rows from `2026-11-13T14:26:51Z` through `2026-11-14T00:22:23Z`. H/G rows at `e2021fa` were left as the prior receipt described them. Spot-checked merge commits are ancestors of main:

- PR #8 `58ecbe42242b9faa575d255df1e1bb28982f8efc`
- PR #9 `0d7c39cac22f27daaf6e19c98714a57109bb8831`
- PR #10 `b908127edf34202233912b98e43715ee42ba2233`
- PR #11 `8fa17d652d3b6e5b7ebbccc42b2d81e90ead701e`
- PR #12 `41079c5d22ba889005075d23ffd5ef5ca7a1e600`

Independent review openings: P cache `b0b1f70` PASS, P workflow `92aa740` PASS, heap audit `3555ee0` PASS, local-result standards `33ffffd` PASS, local-result spec `b00f56a` PASS. C1 replay `d812b7a` and proof `bd790ea` are ISSUES; the landing names those findings and the fix commits `9721f8c` and `67ad05b`.

`pending-coordinator-audit.json` is `[]`. `pending-coordinator-audit-applied.json` holds six deferred rows. They were copied into the TSV at one timestamp, `2026-11-14T00:22:23Z`, with the reason "Record the completed branch work after returning to the canonical coordinator log".

The V recon thread `<t3-thread://v2/a77123eb-c55f-4b51-83af-db8d1f1daf8d/thread:delegated-task:command%3Amcp%3Ae073a0c9-f654-4e32-9431-e80eff02277d%3Adelegate-task%3Aroadmap-20261113-next-V-recon>` has status `failed`. Its single run ended `2026-11-13T23:12:39Z` after one assistant sentence. V's node stays planned. `artifacts/roadmap-20261113/stateful-known-regressions/README.md` says the p-event sources were fetched and not executed, and that this does not complete V. No completed V appears in the roadmap status.

The throws production review `<t3-thread://v2/a77123eb-c55f-4b51-83af-db8d1f1daf8d/thread:delegated-task:command%3Amcp%3Ae073a0c9-f654-4e32-9431-e80eff02277d%3Adelegate-task%3Aroadmap-20261113-review-throws-production>` completed `2026-11-13T23:54:27Z`. Its report at `6627c16` opens with **PASS**. The checkpoint status that the campaign passed review and still awaits combined integration matches that thread. The design judgment in this commit remains **ISSUES** for candidate B and selects ordered candidate A. That is a separate, earlier judgment.

Parent `<t3-thread://v2/a77123eb-c55f-4b51-83af-db8d1f1daf8d/1cdc229e-ad5a-4769-989f-7e1c11a49497>` was paged from position 7306 (2026-11-13T14:56Z, run 143) through 8681 (run 160), plus activity at 7989–7996. The activity item is the archived Unicode test command, exit 1, subtest not ok, before the fix. Assistant lines in that range say 322 passed, then a harness expected `stale`, then 48/49 with the full suite not started, then 49/49 and 371/371, then local 418 and 331, and that the broad recon was rejected. Those lines match the git objects above. Queue JSON under `agents-*.json` still shows some of those tasks as `running`; the thread records and git objects are the evidence used here. `pendingRequestCount` was 0. This review did not wait on PR #13.

## Documentation notes

1. **Low.** `edgeMeaning` still says the stateful foundation is being designed and that P and T can proceed. The renderer copies that sentence, and the heap paragraph hardcodes "P and T can proceed independently." The status line, the P node, and the C1 section say P and C1 are already integrated. Regenerating the markdown keeps the older sentences. K's diagram label stays READY while the status prose says a local 418-test Gate 3 awaits review. `integrated` is false, so this does not complete K.

2. **Low.** The six backfilled TSV rows share `2026-11-14T00:22:23Z` and still say "full running", "designs active", and "now independent review". By that clock time C1 had merged (PR #12 at 23:44Z) and the throws review had returned PASS (23:54Z). The same commit's status and plan sentences are the later facts. The rows are a frozen intermediate snapshot, weakly labeled as the result of a later recording pass. No corrective action is invented here.

3. **Low.** `verify/reports/roadmap/C1-review-fixes.md`, unchanged from main, still says the combined C1 run "is recorded separately when it completes." `C1-landing.md` and the 49/371 logs are that record.

4. **Low.** Calling `P-integration/runtime-SHA256SUMS` the P-only runtime is one file away from both `c9c4511` and `dedde91`. The file is the PR #10 tree `b908127`. Use that head when checking those hashes.

## Limits

No whole-suite rerun, no production edit, no canonical audit edit beyond this report, no push, PR comment, or watch. Inherited logs were hashed and counted in place. This review's own commands were git reads, a renderer run that produced an empty diff, and Python hash comparisons.
