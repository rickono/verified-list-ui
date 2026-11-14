# Composition budget review

**PASS.** The public ceiling is an integer `timeoutMs` from 1 through 180000, default 10000. The scheduler, native limits, and measured-evidence claims hold for the recorded requests. This is a resource-boundary review. It is not a K or Q completion.

## Checkout and blobs

Prepared HEAD is `5f0fb47a0a822d62537f296ef804d5037eebba5c`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor. `verify/` exists. That HEAD is the coordinator commit named in the brief.

The implementation under review is `7feca2830d90e237227fc1522e77e1a11ce3abee`. The evidence commit is `c84aeab73ad34b9aa1a83f3b2ee4e682e39bcba3`. Root imported the same change as `045139ce5df5a89f222ca2986c3b4fe1fa56947b` and `6e0843e9b216b053ceae09cf052ba13447af505c`. The six-file patch is byte-identical. Git blobs of `verify/index.mjs`, `verify/bin/jsverify.mjs`, `verify/README.md`, and the three touched tests match across `7feca28`, `045139c`, and prepared HEAD. The `composition-budget/` trees at `c84aeab`, `6e0843e`, and prepared HEAD match. The commit parents differ (`2809e885` versus `05d1fadd`); the extra files between those commits sit outside this change.

Prepared HEAD adds later report and design files. The only `verify/` change after `7feca28`, aside from reports, is `verify/design/conditional-completion.md`. `proofs.mjs`, `backend.mjs`, `solver.mjs`, `data.mjs`, and `cache.mjs` keep the parent blobs. Live `runningIdentity` on this checkout is `09d21829d8ea449858782577b32ed5531b112b3fa2b9cfbe06ced64f767b28ef`.

## Policy

`verify/index.mjs` `options` is the production change: the upper bound moves from 60000 to 180000, and the TypeError text matches. `Number.isInteger` still rejects NaN, infinities, fractions, strings, and null. `verify`, `verifyFile`, and CLI `--timeout` call that function. CLI help states the shared 1..180000 range and the 10000 default. Minimum stays 1.

`solve` keeps one graph deadline, width `min(2, targets)`, and the same startup, retry, kill, and reap path. A check budget is remaining time on that deadline. There is no second 180000 ms ceiling per target or phase. The virtual-clock probe on three targets at 180000 ms records a first check budget of 90000 ms and a maximum of 179996 ms. Startup that consumes the whole 180000 ms returns `request-timeout` with 0 attempts, and every opened worker is closed. A one-target late response receives 180000 ms on its first check, which is that single graph deadline, then 179999 ms.

`proof-backends.test.mjs` passes 13/13 in 41.556 ms, including the 180000 ms shared-deadline case. The controlled hard-deadline test passes at 25 ms and at 180000 ms in 135.082 ms. Its 180000 ms timer assertion also accepts the explicit `start(100)` timer, so that assertion alone does not identify the check timer. The startup probe and the 13 virtual-clock tests do.

Native replay stays `timeout: 100`. `REPLAY_LIMIT` stays 256. `solver.mjs` still subtracts `min(100, timeoutMs / 10)` before Z3's cooperative timeout, which remains 100 ms at the new ceiling. `cache.mjs` is unchanged. The focused log records the benign-forgery trust test as passing. That control stays the documented cache-integrity assumption.

`budgets.test.mjs` ran through `serial-verify.py`: 4/4 in 1506.499 ms. The APIs verify the trivial program at 180000 ms, reject the invalid set before reading a missing file, keep the default, and return `request-timeout` at 1 ms. CLI `--timeout 180000` verifies, and `180001` and `1.5` exit 2 with the shared message.

## Evidence

`SHA256SUMS` matches 67/67 files. `record.py --check` passes and admits no receipt. Code-input hashes match `7feca28` and this worktree for all 199 recorded verifier and test files. Focused TAP is 46/46 with 0 `not ok`. Full TAP is 483/483 with 0 `not ok`, head `7feca28`, empty tracked diff, exit 0. The focused run's git HEAD is parent `2809e885`, with the ceiling diff still uncommitted; `budgets.test.mjs` is absent from that tracked diff because it was a new untracked file. The committed full log contains those tests as passing, and this review re-ran them.

Fresh compilation of the three-module graph matches the 15 historical postcondition files byte for byte, including Reverse invariant-preserve SHA-256 `a12952814fda3922e53008fb48b59c08f5fb2366c592ccdc4752cb7faf8726f1`. All 36 phase queries, models, and replay guards deep-equal both the parent dump (`2809e885`, identity `13874e72…`) and the current dump (`7feca28`, identity `09d21829…`). Graph SHA-256 `c59463e822bf9ad28cb373d08d2d36389d364573a4f7697f4c177e0311ad38e2` matches the preserved 60000 ms receipt, whose module hashes match too.

The production stdout records three 180000 ms requests: cold 36139.707 ms, 0 hits, 3 solves, 3 writes; warm 94.800 ms, 3 hits, 0 solves; audit 35429.267 ms, 3 solves, 0 writes, no disagreements. All three targets are verified in each. Those lines are those requests. The scratch cold stdout is a separate request at 33149.001 ms with the same outcome counts. Its report body matches the production cold report; the wall times live in the stdout and receipt summaries. Scratch spawned 2 workers and closed 2.

The IPC trace gives Reverse an initial turn of 89951 ms. Postcondition 6, invariant-preserve, receives 86719 ms and returns unsat in 29165.535 ms. Earlier Reverse phases take 3231.278 ms. The unchanged splitter uses `remaining / rounds`, and a three-target graph starts at two rounds, so a 60000 ms request's first slice is 30000 ms before startup. The sum of the measured earlier phases and this query exceeds that slice. The preserved 60000 ms receipt shows Reverse `unknown/request-timeout` after 10 attempts on postcondition 6 of 9, take verified, and the caller `unknown/dependency`. The sample supports a larger first turn letting this query finish. The query returned in 29165.535 ms. Another 180000 ms request is outside this evidence. The historical 60000 ms unknowns remain, including full-suite `alias-inc-into-no-suffix`.

`reproduce` of `library-campaigns/evidence/03-final/harmonic/positive.evidence.json` (SHA-256 `402863e3…`, identity `13874e72…`) returns `invalid-evidence`: the model identity changed. The recorded harmonic checker at identity `09d21829…` passes with `qComplete: false`: total verified, positive confirmed counterexample, bits `0000001000008041`, reciprocal Infinity, result `+0`. Its weak report is `counterexample`. The full-suite diagnostic records that weak case as `unknown/induction-gap`. Both records stand.

`library-campaigns/inputs.json` still pins the pre-ceiling hashes of `verify/index.mjs` and `verify/bin/jsverify.mjs`. `git diff --name-only f974b30da4efcf16b69df889b909975e3321dcb2 HEAD` over that runner's production set prints those two files. A fresh campaign audit would fail its pin and `runtimeEquivalentTo` check. This review does not edit that runner.

## Limits and cleanup

The original composition receipt stays historical ISSUES at 60000 ms. Induction gaps in the full log stay unknown. The ceiling does not guarantee a later proof. Node is v22.23.1. The temporary `node_modules` link to `/Users/rick/verification-vibes/verified-list-ui/node_modules` is removed. No review process remains, and `composition-budget/.scratch` is absent. Commands, probes, and logs are in this directory.
