# Ready-now node B: proof scaling and backend API

Acceptance status: **fully met** for node B's supported subset.

- A costly obligation cannot erase unrelated completed results; controlled deadlines, both target orders, real Z3 evidence, and retained conjuncts demonstrate this.
- Uncertainty fails closed, including worker/process errors, hard deadlines, invalid responses, vacuity, witness limits, abstract replay gaps, and final dependency failures.
- Backend theory/model capabilities and the proof-obligation boundary are explicit. The documented wall-clock budget remains one request budget with a fixed two-worker cap.

## Checkout and scope

- Checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-2e255731`.
- Branch: `t3/proof-backend-scheduling` (initial checkout branch: `t3/2e255731`).
- Baseline: `ff2518cd7494300084f2ab54da71f4d79185e586`, verified as an ancestor before writing; `verify/source.mjs` and `tests/verify/` were present.
- Final commit: the commit containing this report, resolved with `git log -1 --format=%H -- verify/reports/ready-B.md`. The handoff supplies its literal hash.
- Work is local to this prepared worktree. No delegation, downstream implementation, merge, push, or publication occurred.
- Tests used the existing pinned installation through the authorized read-only `node_modules` symlink. The local symlink was removed after testing. No dependency files changed.

## Implemented behavior

`source.mjs` emits independent call-safety and ensures conjuncts as `postconditions`, alongside the preserved combined `post` formula. `proofs.mjs` owns explicit feasibility, per-conjunct postcondition, and separate replay-witness obligations. Verification requires every full-domain conjunct. A sat conjunct supplies the candidate counterexample; bounded replay searches negate only that same conjunct. Completed conjuncts survive retries and worker replacements. `backend.mjs` owns a small `start/check/close` worker interface, capability validation, response and witness validation, hard deadlines, and process reaping. `solver.mjs` adapts those queries to real Z3 and never emits source verdicts.

One request deadline covers initialization, all target turns, and worker restarts. The scheduler uses at most two workers and divides remaining time by the number of rounds needed to serve unfinished targets in those slots. Two targets can run without artificial mid-request interruption; larger queues get bounded turns. A costly target yields on timeout and returns at the end of the queue. Completed phase evidence and outcomes live in the parent. A hard timeout kills and reaps its worker. An active worker error affects that target, while independent targets can use another worker or a replacement. Reports keep their original target order. The fixed cap explicitly permits two workers' CPU and memory use, while the public wall-clock budget stays unchanged.

Resource and backend failures identify the target, phase, full or replay-witness domain, backend, one-based conjunct number and count where applicable, number of attempts, and solver detail when available. The CLI prints that attribution. The public `verify`, `verifyFile`, `timeoutMs`, and CLI outcome vocabulary are unchanged. No public backend override or extra budget is introduced.

## Supported subset and soundness

The source and contract subset is the baseline subset, unchanged. The backend requires SMT-LIB 2, binary64, bitvectors, uninterpreted functions, quantifiers, and model extraction. Z3 remains the only backend. This is a conservative frontend capability profile, not a claim that every quantified query terminates or that proof certificates exist.

Every query has a fresh solver and its own assertions. Retries keep completed phase evidence, but do not claim to resume unfinished solver internals. Requests never share workers, solvers, or schedule state.

Full-domain feasibility and postcondition queries never assert `smallWitness`. Only a separate witness search after a full-domain sat result may bound input materialization to 256 elements. Bounded infeasibility cannot establish vacuity or verification. Oversized witnesses, solver uncertainty, timeouts, interruptions, invalid responses, and worker failures fail closed.

`index.mjs` retains original-source replay, abstract counterexample rejection, helper replay alarms, and final transitive dependency gating after all replays. A source verdict still trusts the frontend, builtins, Z3 and WASM bindings, and JavaScript runtime. It is not a Rocq certificate.

## Verification

- Focused command after the two-worker revision: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/proof-backends.test.mjs tests/verify/backend-process.test.mjs tests/verify/remeda-calls.test.mjs`. Result: **19 passed, 0 failed**. This includes real Z3 evidence surviving a controlled costly target in both orders, cheap work behind two costly targets, hard worker interruption and reaping, worker and protocol errors, missing capabilities, concurrent requests, assertion isolation, replay witnesses, transitive dependency gating, CLI attribution, and pinned Remeda composition/mutation.
- Pure scheduler command after the two-worker scheduling revision: `node --test tests/verify/proof-backends.test.mjs`. Result: **11 passed, 0 failed**. Deadline tests use controlled clocks and synchronization barriers, not wall-clock speed assertions. The harness checks the fixed two-worker cap and one original deadline.
- Initial full command: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify`. Result before the scheduling revision: **96 passed, 3 failed** out of 99. The failures were `remeda-calls`, `remeda-imports`, and the unchanged eager prefix in `remeda-take`, all due to proof timeouts. Assertions and budgets were kept unchanged.
- Diagnostic command: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/.ready-B-probe.mjs`. This temporary probe reconstructed the baseline worker with `git show ff2518cd7494300084f2ab54da71f4d79185e586:verify/solver.mjs` and fed identical compiled composed-prefix targets to both versions with 60000 ms. Baseline: `[verified, verified]`. Single-worker retained-solver scheduler: `[unknown (request-timeout, helper postcondition), verified]` before dependency gating. This established an implementation regression rather than dismissing it as existing resource exhaustion. The revised fixed two-worker design subsequently passed the pinned composition check above. Temporary probe files are excluded from the commit.
- Full command after the two-worker revision: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify`. Result: **101 passed, 1 failed** out of 102. Pinned calls and imports passed. The standalone eager Remeda check returned `[unknown, unknown, counterexample]` instead of `[verified, verified, counterexample]`. All assertions and request budgets remain unchanged. The subsequent standalone comparison reconstructed the original worker and ran identical queries: prefix baseline verified while the grouped query path timed out, confirming a remaining regression. The exact-length baseline itself was killed at its 60000 ms deadline while the new grouped path verified on that diagnostic run, showing resource sensitivity as well. Proving each source ensures separately, sequentially, under one shared 60000 ms allowance verified every prefix clause and both exact-length clauses. This motivated compiler-emitted independent conjuncts rather than changing assumptions or allocating a new budget per clause. The exact diagnostic command was `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/.ready-B-probe.mjs --standalone`.
- The deterministic separate-conjunct test was run red before implementation: grouped-query exhaustion yielded unknown instead of the expected replay candidate. After the change, all 12 scheduler tests passed with `node --test tests/verify/proof-backends.test.mjs`.
- Final focused command: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/proof-backends.test.mjs tests/verify/backend-process.test.mjs tests/verify/calls.test.mjs tests/verify/remeda-take.test.mjs`. Result: **39 passed, 0 failed**, including unchanged eager Remeda prefix and exact-length proofs, replayed mutant failure, every call-composition test, independent-conjunct completion/retry policy, and oversized-counterexample clause attribution. Final full command: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify`. Result: **104 passed, 0 failed**, with no skipped or cancelled tests. All pinned Remeda eager, composition, import, weakened-summary, and mutation checks passed with their original budgets and assertions. All test processes ended; no background work remains.
- `node --check verify/source.mjs`, `node --check verify/backend.mjs`, `node --check verify/proofs.mjs`, `node --check verify/solver.mjs`, `node --check verify/bin/jsverify.mjs`, and `git diff --check` passed. No Rocq or browser rebuild is required for these verifier-only changes.

## Integration touchpoints

The compiler adds a required `postconditions` array to targets while retaining the combined `post` formula. Its conjunction is equivalent to that formula; call safety keeps earlier facts and ensures keep all callee facts. `index.mjs` replaces its batch subprocess helper with `solve` and accepts per-target error results before replay. Frontend integrations must emit `postconditions` through the compiler. An extension requiring another SMT theory must extend the capability profile explicitly.

The private `solver.mjs` stdin/batch protocol is replaced with the internal query IPC protocol. Public API and CLI callers continue through `index.mjs`. No other node's unfinished API is imported. `make test-verify` discovers the new behavioral tests without a Makefile change.

## Remaining limits

Turns are fair opportunities within the original budget, not a guarantee that every target runs under tiny budgets or that expensive quantified proofs finish. Worker initialization or restart can exhaust the remaining time. Hard termination loses unfinished solver internals, while completed evidence survives. The solver timeout reserves response time within the original deadline; process teardown is awaited and receives no new proof budget. There is no second external solver, cancellation API, persistent cross-request cache, or independent proof certificate.
