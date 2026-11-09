# Proof obligations and backend budgets

## Existing flow

`source.mjs` produces SMT declarations, entry preconditions, combined call/postcondition obligations, input models, and a separate small-witness condition. `index.mjs` replays solver witnesses against captured original bodies and gates callers on every callee's final status. The old solver process checks targets sequentially and returns one batch. A killed process loses even finished target results.

## Interface and ownership

`proofs.mjs` owns obligations, evidence, and scheduling. `backend.mjs` owns one isolated worker connection. `solver.mjs` is the Z3 adapter. No backend selection or trusted assumptions are added to the public API.

```js
const backend = createBackend();
await backend.start(remainingMs); // name, protocol, capabilities
const answer = await backend.check({
  target, phase, domain, declarations, assertions, models,
}, turnRemainingMs); // sat + witness/oversized, unsat, or unknown
await backend.close(); // terminate and reap

const outcomes = await solve(targets, timeoutMs);
```

Z3 advertises SMT-LIB 2, binary64, bitvectors, uninterpreted functions, quantifiers, and model extraction. These are the current frontend's conservative requirements, not a promise of termination or proof certificates. Missing capabilities, malformed answers, unexpected statuses, and invalid witnesses fail closed.

Each query uses a fresh solver. The worker returns only query answers, never `verified`. The parent retains completed evidence and identifies queries by target, phase, and domain.

## Obligations and soundness

The phases are `feasibility`, `feasibility-witness`, `postcondition`, and `counterexample-witness`. Feasibility and postcondition queries retain the full input domain. Only the two witness phases assert `smallWitness`, after the corresponding full-domain query returned sat with an oversized model.

Full-domain infeasibility yields `vacuous`. A proof requires a feasible concrete witness and an unsat full-domain postcondition query. A counterexample requires a sat full-domain postcondition query and a concrete witness. An unsat bounded witness query yields `unknown`. `index.mjs` still replays proof witnesses and counterexamples and gates dependencies after every replay.

## Independent postcondition queries

The compiler retains the combined `post` formula and emits `postconditions`, an equivalent conjunction of call-safety obligations and individual ensures under all callee facts. Call safety still uses only earlier executed callee facts. Trivially true conjuncts are omitted, with one true query retained when all conjuncts are true. No parser splits generated SMT text.

The scheduler proves each conjunct separately under the same original target turn and request deadline. Verification requires a feasible replay witness and unsat for every full-domain conjunct. Any sat conjunct supplies a candidate counterexample for actual-source replay. A small counterexample-witness query negates only that same conjunct. Timeouts retain the index of the first unproved conjunct, so completed unsat obligations survive retries and worker replacements. Diagnostics identify the one-based postcondition number and count. These numbers include call-safety obligations, not only source ensures lines.

The standalone prefix comparison verified on the baseline but timed out through the grouped query path. A diagnostic experiment compiled one source ensures at a time and proved every prefix clause sequentially under a single shared 60000 ms allowance. Both exact-length clauses also proved under one allowance; the baseline exact-length run itself reached its hard deadline. This supports separate obligations without changing assumptions, input domains, or budgets.

## Fairness and one deadline

Specification-definedness is a separate full-domain phase before feasibility. It negates `preDefined` without assuming the target's `requires`. A satisfiable result is a replay candidate with phase `requires-definedness`; an oversized candidate gets a separate bounded witness search. Unsatisfiability of that bounded search cannot establish vacuity or verification. Native targets whose definedness is `true` retain their existing query sequence. The backend capability profile includes exact reals and finite floating-point-to-real conversion.

`timeoutMs` remains one wall-clock solver-process budget for the entire request, including initialization and restarts. Compilation and JavaScript replay remain outside that solver budget. A request owns at most two workers, with one active query per worker. Requests share no worker, solver, or schedule state.

Targets enter a shared queue in original order. A worker takes the next target. Its turn receives the remaining request time divided by `ceil(unfinishedTargets / workerSlots)`, with at least one millisecond when time remains. Two targets can therefore each continue until the original deadline. A cheap independent target gets an immediate slot alongside a costly target. Larger queues receive bounded turns so later targets get opportunities. A timeout requeues the target with its completed phase evidence. Reports retain their original target order.

This explicitly permits two workers' CPU and memory use, capped independently of graph size. It does not allocate a new wall-clock allowance per target or worker. Every startup, query, retry, and replacement derives its budget from the same original deadline. The worker subtracts SMT parsing time and a response allowance before setting Z3's cooperative timeout. The parent's hard timer includes both. Teardown is awaited and receives no additional proof budget.

A hard timeout kills and reaps the worker before a replacement starts. Completed query responses and target outcomes stay in the parent. An initialization or worker failure affects its active target; other workers and pending targets keep their own outcomes. Tiny budgets can expire during initialization or before every target gets a turn. Fairness is an opportunity when time remains, not a promise that every target finishes under any budget.

Resource and backend outcomes include the pending phase, domain, backend, number of attempts, and solver detail when available. This attribution also covers unattempted targets.

## Compatibility decision

Two single-worker designs failed the pinned composed-prefix check: fresh solvers after each timed turn, and retained solvers after cooperative timeout. Their shared premise was that interruption and retry would preserve enough quantified proof progress. A serial-lane comparison reconstructed the baseline worker from `ff2518c` and supplied identical compiled targets to both implementations, each with 60000 ms. The baseline returned two verified provisional outcomes; the retained-solver scheduler returned unknown for the helper and verified for the caller before final dependency gating.

The fixed two-worker design removes the need to interrupt one of two targets merely to run the other. A worker per target would instead multiply initialization and memory with graph size. Streaming whole-target results alone would still allow the first costly target to starve independent targets.

## Verification

Controlled clocks, synchronization barriers, and a controlled worker fixture exercise deadlines and failures without wall-clock speed assertions. Real Z3 supplies actual proof evidence in the partial-outcome test. Public source tests check replay, concurrent requests, and transitive dependency gating. The full suite retains the pinned Remeda checks and all native array lengths.

Run the focused suites and `make test-verify` through the shared serial test lane. Final exact commands and results are in `verify/reports/ready-B.md`.
