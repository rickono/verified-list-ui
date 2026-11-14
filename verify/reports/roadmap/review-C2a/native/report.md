# C2a native protocol and replay review

**PASS.** Native EventTarget identity, adjacent cuts, advisory cancellation, trace rejection, and worker containment match the C2a contract on code `c1df5f6a7302dc70ede1c43649aa61295d3d80f7` (tree `e6ab0ad2fa9b16633ac86795d0a5bd0c285e4f17`). No R, S, T, or U node is complete. This review does not integrate C2a.

Prepared checkout `/Users/rick/.t3/worktrees/verified-list-ui/t3-12ed5a98`, branch `t3/native-protocol-replay-review`, parent `5f0fb47a0a822d62537f296ef804d5037eebba5c`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists. The evidence tip `6f464327f9d5d7ea48706f334ac13e24d3cad632` at `/Users/rick/.t3/worktrees/verified-list-ui/t3-105287a3` was read only. Runtime bytes were extracted to a temporary archive and deleted. `protocol-native.mjs` blob `100abe135dff02fe0f4f7a5bb8b21239a7755e96` matches that commit. Node v22.23.1, Acorn 8.19.0, z3-solver 5.3.3.

## Receipts

`shasum -a 256 -c SHA256SUMS` in `verify/reports/roadmap/C2a-evidence` reported OK 97, FAILED 0. The suite was not rerun.

- `full-final.log.txt` SHA-256 `404c966510d2527f6ba167a3809dab25aa077ad3ca24ef44cd23768b30170f50`. Summary: `# tests 390`, `# pass 390`, `# fail 0`. Root TAP plan `1..352`. `final-commands.json` records exit 0 for `make test-verify` on `c1df5f6`.
- `protocol-final-focused.log.txt` SHA-256 `3984e500072e3a2bd03d9f1d7b2cd668bbf1ca5a486bfaab16a99145e64b16bc`: `# tests 18`, `# pass 18`, `# fail 0`, plan `1..18`.
- `focused-final.log.txt` is an earlier 15/15 log. Its head file is parent `07c64858d3ecdce0eeee59c2439f07daf6449adc`. The 18-test receipt is the protocol log above.
- `tested-tree.txt` records `c1df5f6` and tree `e6ab0ad`. Fixture SHA-256 values reproduced: listeners `caffe023b53b4005064699ae33240af4eb9fb97aaf028182f16d312a652d1b73`, advisory `4358227cc2aed584cbb0220bf97da366443d924a03bfbbb12355ebe597e5118f`.

## Identity and cuts

Predictions are in `predictions.md` and `predictions-followup.md`. Measurements are in `probe.json` (SHA-256 `a8a49e5ffa270123b07f2b18a2a75dee4557be2a5bc86f1bfec776b8077c7401`) and `followup.json` (`0ceacc8f6a8b2a026e4c2ae13ad4c4e2a0b7f919f05478bdaf1d7bab1c229191`).

Duplicate registration of one closure produced one live registration, one `handler` cut, and `n=1`. Two binds, alias removal, a repeated invoke, and the last removal produced handler-cut counts 2, 1, and 0, with no violation. Re-add after removal dispatched once (`n=1`); the returned remover then produced an `empty-dispatch` cut. A fresh arrow passed to `removeEventListener` left the original registration live. `checkStateful` on that fresh remover returned `verified` (45/45, `eventBound: null`, no search). The fixture properties are `shown === 0 || shown === 1` and the disposal `always`. Replay after the fresh remover still ran the original handler and reported no violation. No count or leak property is in the source.

Uninstrumented Node `EventTarget` effect counts for the same duplicate, removal, idempotent removal, and re-add sequence were 2, 1, 0, 1. The admitted zero-parameter handler assigns a number. A raw listener received an object whose `instanceof Event` check was true. `(event)` is `unsupported` at admission, in 0 ms, with message “without parameters or payload access.”

Distinct target ids kept three live registrations and moved `n` through 1, 2, 3 across events `x`, `x`, and `y`. Binding both names to id `1` collapsed the two `x` adds: two live registrations and `n` through 1, 2. Each `EventTarget` declaration needs its own two-line protocol block. The first probe stopped because the second declaration did not have one (`probe-attempt-1.json`, SHA-256 `8c02c8bcb9e490e172297a36f5be6df33cc57bccd70685aefadbb0dab86c8b60`).

A nonempty dispatch of two incrementing handlers recorded only `handler` cuts at 1 and 2. Status `ok`, violation absent, final `x=2`. A private mutant that also checks the pre-dispatch state against the post-dispatch state reports `always` `x - old(x) <= 1` on that same trace. Production does not. The C1 entry that increments twice in one action has `machine.protocol` false, one call step, and `always` `x-old(x)<=1`. `checkStateful` returns `counterexample` for that entry.

Empty dispatch, `allocate`, and `abort` on `always x !== old(x)` each record one cut (`empty-dispatch` or `action`) and `always`, with `x` still false. Deleting only the empty-dispatch observe in a private copy leaves the same dispatch with an empty cut list and no violation.

The weak state `0 <= x && x <= 2` is `unknown` / `induction-gap` at `maxDepth: 0` (37/38 verified; abstract counterexample `$closure_186`). Native replay of 0, 1, 2 has no violation. Adding `x === 0 || x === 1 || x === 2` is `verified`, 38/38. The abstract gap and the native adjacent trace are different results. Removing the disposal guard is a native `always` failure and a `checkStateful` `counterexample` (search executions 19).

## Cancellation, traces, and containment

Abort, then resolve: `shown=0`, request settled, invocation `search` phase `completed`, signal `11` aborted and `21` not. Dispose, then resolve: `disposed=true`, `shown=0`, both the search and dispose invocations remain. Resolve, then abort: `shown` bits `3ff0000000000000`, then abort leaves that value and aborts only signal `11`. Already-aborted input: `shown=0`, invocation completed. `settle-abort` on the guarded fixture: `shown=0`, request settled, invocation completed, owned signal aborted.

A resume that assigns `shown=1` against `state shown === 0` is `ok` with `violation.kind` `state`. The resolve cut’s `shown` bits are `3ff0000000000000`, so the continuation ran before that cut. A follow-up whose entry flips `x` before `await` and flips it back after resume separates the cuts: the call leaves `x` true and phase `awaiting`; a later abort violates `x !== old(x)` and leaves phase `awaiting`; `settle-abort` has no violation, leaves `x` false, phase `completed`, the request settled, and only signal `11` aborted. One signal id on two controllers is illegal (“Duplicate or malformed handle identity”). Using signal id `11` as the ambient target is illegal (“Signal-as-target overlap is excluded”).

An early `return` claimed as a remover is illegal (“not return a callable remover”). A second constructor return reused as id `1000000000` is illegal (“Returned alias must retain its identity”). `protocolSha256` mismatch, input id `0`, a second settlement, an unmarked rejection, and `resolves` failures for `2` and `NaN` are `illegal-environment-action`. The suffix case is the unguarded advisory trace plus a second resolve; the status is illegal (“not pending”), so the illegal suffix is enforced after the property failure. `traceOf` throws `TypeError` for handle id `01` before replay. The same id placed in a crafted envelope is illegal (“Fabricated handle or incompatible handle sort”).

Floating-point transport kept `7ff8000000000042`, `fff8000000000037`, `8000000000000000`, `0000000000000000`, `7ff0000000000000`, `fff0000000000000`, and `0000000000000001`. Signed zero did not violate `shown === 0 || shown === 1`. The other five values did, as state failures, with those bits stored. A protocol call with argument `-0` stored `shown` bits `8000000000000000` and left the realm flag at `0000000000000000` (`this` and `process` were absent). The parent `EventTarget.prototype.addEventListener` was unchanged.

`while (true)` at `timeoutMs: 100` returned `replay-timeout` in 162 ms, message “Script execution timed out after 100ms”. At `timeoutMs: 10000` the parent returned in 762 ms with “Native replay containment deadline exceeded.” `pgrep -fl replay-worker.mjs` was empty after each timeout and at the end.

The non-reflexive stutter module is `unknown` / `induction-gap` at `maxDepth: 0`: 31/32 verified, abstract counterexample `$stutter`, one search execution. The same `always` fails natively on abort. Witness search does not schedule abort, allocate, invoke, or settle-abort, so this native failure stays an induction gap until an explicit replay. That is an honest unknown outcome. The direct abort replay is the property failure.

## Commands and cleanup

```sh
shasum -a 256 -c SHA256SUMS
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/review-C2a/native/probe.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/review-C2a/native/followup.mjs
```

Both lane commands printed “Acquired the solver test lane” and exited 0. The first probe execution also exited 0 and is preserved as `probe-attempt-1.json`. Logs: `probe.log.txt`, `followup.log.txt`. Temporary archives and both private mutants were removed. No replay worker remained. No canonical roadmap, audit, push, PR, or merge was written.
