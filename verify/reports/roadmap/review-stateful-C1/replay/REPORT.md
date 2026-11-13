# Native replay review of stateful C1

**Verdict: ISSUES.**

One fail-safe public-API crash, already proven by the root review and reproduced here. Native replay, process containment, environmental assumptions, and trace trust show no further defect. The crash is not a false proof. The earlier stdin driver that indexed `argv[1]` is not a product finding.

| | |
| --- | --- |
| Code head | `5d8415aa8279cab2f4a662b049616ce9d94a98a3` |
| Receipt head | `ae60681cd6e84ad19ba62a24d60591138cb2719f` |
| Parent | `e435c8abce3107f3afce5be2b10ae23102d269d2` |
| Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` | ancestor of this review checkout |
| Receipt commit vs this checkout | not an ancestor |
| Archive inspected | `git archive ae60681` at `/tmp/c1-replay-review/tree` |
| Node | v22.23.1 |
| Solver lane | `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- COMMAND` |

Implementation commits `0bb4133`, `7381ffe`, `5d8415a`, and `ae60681` are unchanged. This review only adds this directory. `verify/source.mjs` from parent to code head is one hunk, 13 added lines: `compileAstUnit` at lines 1240–1246. It passes `loops: new Map()` into `body()`.

## Proven defect

Severity: fail-safe API crash. `checkStateful` throws instead of returning a spanned `unsupported` result. Status is not `verified`.

- File: `verify/source.mjs:894` (`function loop` starts at line 891). `const spec = cx.loops.get(node)` is undefined, then `if (!spec.decreases)` throws.
- Command: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/c1-replay-review/probe.mjs` with cwd `/tmp/c1-replay-review/tree`. Cases `known-loop` and `for-ever-check` in `evidence/probe.json`.
- Source: `export function entry() { while (false) { x = 1; } }` with `// state x >= 0`. Also `export async function entry() { await op(); for (;;) {} }` with `// state x === 0`.
- Actual: `TypeError`, message `Cannot read properties of undefined (reading 'decreases')`, `sourceError: false`, 1 ms and 0 ms. Same message the root probe recorded.
- Required: return `unsupported` with the original span. Do not throw. A fix must keep direct `replayTrace` of a continuation `for(;;)` as `unknown/replay-timeout`. That path still returns in 158 ms with `Script execution timed out after 100ms` (probe case `loop`). The suite’s continuation-loop test passed in 157.135875 ms.

## Replay, containment, assumptions, trace trust

No additional proven defect. Commands, all through the solver lane, cwd the archive:

- `node /tmp/c1-replay-review/probe.mjs` → `evidence/probe.json`
- `node /tmp/c1-replay-review/probe2.mjs` → `evidence/probe2.log`, exit 0
- `node /tmp/c1-replay-review/probe3.mjs` then `node --test --test-concurrency=1 tests/verify/stateful-replay.test.mjs` → `evidence/probe3-replay-test.log`, exit 0, 6 pass / 0 fail, `duration_ms 1556.160458`

Scalar wire and replayed cells keep `0` `0000000000000000`, NaN `7ff8000000000000`, `-0` `8000000000000000`, `+Infinity` `7ff0000000000000`, `-Infinity` `fff0000000000000`. Payload `7ff8000000000001` round-trips. Uppercase and short bit strings return `Invalid argument encoding.`

Default assumptions are never-rejects, may-never-settle, order any, at most once. `settles eventually` is `declared-unused for safety` with no event bound. Pending-safety stays a counterexample with that clause (264 ms) and without it (280 ms). Same-file stripped init/step/keeps units match (`probe2` `smt.sameFile: true`). Source, executable, and assumption hashes differ (`2d8c7ea9…`, `3ad14d70…`, `43c69644…`).

`resolves result === q` rejects resolving request 1 with the other call’s 7, the second await with 3, and the first await with 4. The second call stores annotated marker 8 (`4020000000000000`). Resolving it with 8 is legal. `Number.isFinite(result)` allows other finite values because that is the predicate. Boolean mismatch is illegal. Resolve-before-call, double resolve, double reject, and reject-then-resolve are `Request identity is not pending or its operation differs.` Reject without permission is `Environment never-rejects assumption forbids rejection.` A permitted reject leaves `x` at 1. The matching resolve sets `x = -1` and violates `x >= old(x)`.

An illegal action after a property failure stays `illegal-environment-action` and does not become `verified`. A later repair does not clear the first violation. Tampered observations, extra call fields, and a wrong `sourceSha256` are refused. An envelope field `status: "verified"` is echoed on `result.trace.status`; the outer status stays `ok` and the violation remains set.

Contract-looking typos (`order`, `abort`, bare `settles`, `Settles`, `STATE`, `state:`, a block-comment state) return `unsupported` with line and column. Direct `entry()` recursion, `globalThis.entry()`, and `queueMicrotask` do too. `queueMicrotask` is absent in the realm (`queueMicrotask is not defined`, 53 ms), not a host callback and not a hang. `Promise.resolve().then` spin loops are `unknown/replay-timeout` at 201 ms (requeue) and 157 ms (`for(;;)` inside `then`). A then-callback that only throws returns `ok` in 55 ms while `x === 0` still holds. A then-callback that writes `x = 1` and throws is a native violation `x === 0` with decoded `x` 1; `checkStateful` still returns `unsupported` ThrowStatement at line 3. Parameter assignment `q = 5` is `unsupported` in 1 ms (`Cannot write parameter binding q`); a hand replay can make `shown === 5`, and the checker does not verify it.

Replaced workers (missing, early exit, wrong id, throw, disconnect) return `unknown/replay-runtime` in 20–41 ms. A worker that never replies returns `unknown/replay-timeout`, `Native replay containment deadline exceeded.`, in 307 ms. None hung the parent. A never-settled request stays pending with status `ok`.

Search bounds do not authorize `verified`. `entry(q)` that sets `x = 1` only for `q === 2` is `unknown/induction-gap` with `entryArguments: [0, 1]` even though the resolve pool contains bit `4000000000000000` (2). A hand call with argument 2 is a real violation. `maxDepth: 0` on `entry(){ x = 1 }` is also `induction-gap` (1 execution), not `verified`. Published counterexample traces for stale, env NaN, overclaim, and V8b replay to the same violation text. The verified search pilot has no trace. `Object.is(shown, 0)` and `1/shown === Infinity` after resolving `-0` are counterexamples. JSON shows that `-0` cell as `0`; the bits do not.

Inconsistent `state x === 0` and `state x === 1` is an init counterexample, not vacuous `verified`. `compile()` JSON for seven default examples matches the parent. `evidence/hash-check.txt` records zero mismatches: 42 input blobs versus `git show 5d8415a`, nine unchanged production modules, both lockfiles `8a0e19b6…afa21`, ten receipt logs, and worker `e581ba7a…d563`.

## Receipt bookkeeping

`full-final.log` was not rerun. Its TAP summary is 304 pass, 0 fail, 0 cancelled, 0 skipped, and zero `not ok` lines. `focused-02.log` is 47/0 and includes the sixth replay test as `ok 19`. `replay-01.log` is an earlier 5-pass log without that test. The file at `5d8415a` and `ae60681` has 6 tests; the rerun is 6/6. The stale log is not a product failure. Earlier `focused-01` and `frontend-01` failures are superseded by `focused-02`; their hashes still match the receipt.

## Dropped

- Induction-gap text says search exhaustion when `maxDepth` is 0 or entry samples are only 0 and 1. Status stays `unknown`, with the bounds attached. Not `verified`.
- `settles` SMT hash inequality on two different file names was the file id, not an added axiom. Same-file stripped units match, and the pending counterexample remains.
- `Number.isFinite(result)` accepting 3, 4, or 9 is the predicate.
- Sync throw plus a property failure returns `replay-runtime` and drops the violation object. Fail-safe. The construct is unsupported at `checkStateful`.
- Extra envelope fields copied onto `result.trace` do not change the outer verdict.
- JSON rendering of `-0` is not a lost bit encoding.

## Limits

No full-suite rerun. No `verifyFile` solver rerun of the default examples; the check is `compile()` equality plus the nine unchanged modules. No broad VC review. `stateful-regression.test.mjs` was not run because it rewrites receipt evidence. Native search can miss a bug; the executed misses stayed `unknown`. Scripts import the archive path `/tmp/c1-replay-review/tree` and need that tree’s `node_modules` link to `/Users/rick/verification-vibes/verified-list-ui/node_modules`.
