# Stateful C1 production foundation

C1 implements source-text stateful safety checking in `verify/stateful/index.mjs`.
Its public operation is `checkStateful(file, source, { timeoutMs, maxDepth })`.
This unit completes no R, S, T, or U roadmap doneWhen. Independent landing review
and integration with the existing public verifier remain coordinator work.

PASS for the assigned C1 acceptance. This report distinguishes checks executed
in this checkout from inherited evidence. The complete verifier suite passed
304 of 304 tests on the final code tree.

## Source and recovery provenance

- Prepared checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-327babb7`.
- Starting HEAD: `e435c8abce3107f3afce5be2b10ae23102d269d2`.
- Executed `git merge-base --is-ancestor 32bd5b260aa116ca88642a1479bed8d3fc447f4b HEAD`
  and confirmed `verify/` exists. Both checks passed.
- Selected contract: `verify/design/stateful-foundation.md` at
  `c82112be9bc16429902b3e534941bbf445ceb5b8`.
- Candidate A: `6d2cdfcae3b027b8a17dc606983c3083860e4bd3`.
  Candidate B: `7b52fd9b9a25ded5c5e3b88fb1032e2a115404c7`.
  Independent judgment: `dd657b7bcac613f11c270dd747a957c387921986`.
  These immutable artifacts supplied design context and expected outcomes.
  Their solver results are inherited evidence, not checks executed here.
- Recovery snapshot:
  `/Users/rick/verification-vibes/artifacts/roadmap-20261113/rate-limit-recovery/20261113T160033Z/stateful-C1/owned/`.
  All 25 fixture copies matched both the snapshot's `SHA256SUMS` and their
  candidate or judgment Git blobs. The executed comparison and every source
  hash are recorded in [fixtures.json](stateful-C1-evidence/fixtures.json).
  The failed seat supplied no production implementation. Recovery was not acceptance.
- Imported fixtures retain their exact bytes. The import commit preserves
  author Rick and the original `Co-Authored-By: Claude Opus 5.5` trailer.
- Node is `v22.23.1`. Repository pins are Acorn `8.19.0` and z3-solver `5.3.3`.
  The dependency link targets `/Users/rick/verification-vibes/verified-list-ui/node_modules`.
  Both lockfiles have SHA-256
  `8a0e19b686e00939f10a597f1a9c3b8ae2c25c1dae10d340cba0a365830afa21`.
  This checkout did not install or change the shared dependencies.

## Implementation and trust

Before C1, this checkout had the selected design and no production stateful
checker. C1 adds one machine owner, a closed clause grammar, explicit environment
assumptions, AST-derived obligations, and native replay.

`machine.mjs` owns the original source, cells, entries, segments, clauses,
operations, and captured bindings. Captures include the actual request arguments.
That preserves correlations in `resolves result === parameter` when a module
cell changes while a request is pending. The compiler checks captured values
against their declared scalar types before admitting resumption assumptions.

`transitions.mjs` builds function-shaped AST wrappers. Cell references become
fields on the existing heap-backed `$s` parameter. Original statement and
expression spans remain attached to rewritten nodes. The only existing core
change is `compileAstUnit` in `source.mjs`, which invokes the existing `body()`.
The source compiler contains no scheduler or activation-pool policy. No
application JavaScript is generated for proof compilation, and C1 introduces
no alternate expression evaluator or solver backend.

The safety rule proves initialization, each arbitrary entry or resumption step,
and preservation of every other pending representative. The pool has no bound.
Unhandled rejection discards one activation and stutters the scalar cells.
Keeps remains mandatory, including across different entries and await kinds.
The private deletion test removes keeps targets in test-owned memory and
reproduces the overclaim's false proof. Production has no mutation switch.

The trusted base includes the frontend and AST rewrites, the representative
induction argument, the existing expression and heap compiler, the proof
scheduler and Z3, and native JavaScript replay. Passing the corpus does not
constitute an independent soundness review of that base.

## Scope and outcomes

The first subset has number and boolean cells with literal initializers,
exported synchronous or asynchronous entries, scalar environment operations,
and one or more top-level awaits. V18b's second annotated await is compiled.
Unsupported source constructs report the original file, span, line, and column.
Helpers outside the existing accepted source subset fail closed.

The shared grammar recognizes reserved words, case changes, colons, nearby
misspellings, adjacent transpositions, and contract-looking block comments.
Unknown environment-block lines fail. Unsupported entry contracts, ordering,
abort, handlers, cancellation, imports, reference state, recursion, and liveness
fail closed. A module without a `state` or `always` property is unsupported.
Pending clauses are auxiliary lemmas. `old` in `always` reads the pre-step state.
The frontend rejects `old` in `state`, `pending`, and `resolves`.

Reports separate source properties, abstract unit results, assumptions, and
native counterexamples. Assumptions include every operation domain and default,
never-rejects or may-reject, may-never-settle, arbitrary settlement order,
at-most-once settlement, binary64, external entry calls, and microtask drains
between actions. `settles eventually` is declared-unused for safety.
`eventBound` is null. A canonical hash binds the complete assumption record.

All unit obligations must discharge before a safety proof. An infeasible
conditional obligation retains its solver `vacuous` status. Initialization and
creation obligations prevent inconsistent invariants from establishing safety.
A satisfiable unit is an abstract induction failure. Only an actual native
property failure earns `counterexample`. Otherwise the result is
`unknown/induction-gap`. Solver uncertainty remains `unknown/solver`, including
the original phase, domain, backend, and request-budget attribution.

`maxDepth`, the sampled values, the entry argument samples, the 5,000-execution
limit, and elapsed witness budget constrain native witness search only.
Non-verified reports expose these bounds in `searched`. Verified reports have
no search bounds. No trace bound enters an SMT proof.

## Native replay

Replay executes the unchanged type-stripped source with export keywords
blanked at their original offsets. A strict directive supplies the supported
module's strict semantics. Every replay has a fresh null-prototype realm with
`microtaskMode: "afterEvaluate"`. Every call, settlement, observation, predicate,
and explicit microtask drain runs under a VM deadline. An owned subprocess
provides a second containment deadline and is killed and reaped on completion.
Application code receives realm-native promises and no host callback.

Trace JSON binds the original source, executable, and assumptions by SHA-256.
Replay validates action fields, entry argument types, request identity,
operation identity, settlement multiplicity, result types, rejection permission,
and `resolves` on the original request arguments. It recomputes observations and
rejects changed stored states. A property failure does not excuse an illegal
action later in the supplied trace. Scalar encoding uses IEEE-754 bits and
retains NaN, infinities, and signed zero.

Executed replay checks cover repeated replay, three tampered hashes, altered
observations, illegal actions and outcomes, an unresolved request, strict
`this`, and a looping native async continuation. The initial focused replay run
returned the loop as `unknown/replay-timeout` in 156 ms, below the one-second
acceptance limit. The later complete logs contain their own measured times.

## Executed acceptance

All CPU-heavy commands use this prefix:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py --
```

Core files were not edited while a run from this checkout was active or queued.
The expected production outcomes are the judgment's corrected matrix.

| Cases | Expected and observed in `outcomes-01.log` |
| --- | --- |
| Guarded pilot | verified, all five units proved |
| Stale pilot | native counterexample, call, call, resolve 2, resolve 1 |
| Gap pilot | unknown/induction-gap |
| Missing resolves pilot | native NaN counterexample in two actions |
| Overclaim pilot | keeps refuted, native stale counterexample |
| Unsupported pilot | unsupported at original line 20 |
| V1, V1b, V2-V5, V5b, V9, V10, V14-V16 | unsupported |
| V6, V18 | unknown/induction-gap |
| V7, V8, V11, V18b | verified |
| V8b | native counterexample in three actions |

Every pilot unit name and solver verdict also matches the candidate matrix.
Per-fixture JSON files in `stateful-C1-evidence/` contain exact hashes,
assumptions, units, outcomes, and traces from the latest acceptance run.
The native V7 replay displays response 10 after response 20 because both IDs
equal 2^53. All stated properties hold. C1 proves no pairwise identity,
uniqueness, count, or liveness claim from unary invariants.

| Command after the serial prefix | Log | Result |
| --- | --- | --- |
| `node --test --test-concurrency=1 tests/verify/stateful-frontend.test.mjs` | `frontend-03.log` | 4 passed |
| `node --test --test-concurrency=1 tests/verify/stateful-transitions.test.mjs` | `transitions-02.log` | 3 passed, including private ablation |
| `node --test --test-concurrency=1 tests/verify/stateful-replay.test.mjs` | `replay-01.log` | 5 passed |
| `node --test --test-concurrency=1 tests/verify/stateful-outcomes.test.mjs` | `outcomes-01.log` | 29 passed, including 25 fixture cases |

The final focused run passed 47 of 47 tests in `focused-02.log`. The complete
verifier run passed 304 of 304 tests in `full-final.log`, with no cancellations
or skips. Both commands used the required serial prefix. The complete suite
ran once on the final code tree.

## Preserved failed experiments

All logs are under `verify/reports/roadmap/stateful-C1-evidence/`.
None of the following failures authorizes a capability claim.

- `frontend-01.log`: 0 of 4 passed. The first attempt imported the older
  TypeScript parser API from the pinned TypeScript 7 package. `ts.ScriptTarget`
  was undefined. Production now uses the repository's Acorn token approach to
  validate erased syntax. No dependency installation or fallback version was used.
- `frontend-02.log`: 3 of 4 passed. Recognition missed the adjacent transposition
  `staet`. The closed grammar now recognizes that spelling and rejects it.
- `transitions-01.log`: 1 of 3 passed. The test read `s.outcome.status` even though
  `solve()` returns outcomes directly. The corrected assertions read `s.status`.
- `focused-01.log`: 45 of 47 passed. One test expected declared settling after
  adding only `rejects`. Another fed import-bearing examples to `single()` and
  then called `compile()` with its failed snapshot. The corrected comparison
  uses real project loading and checks every example against the exact parent.

## Corrected real-code grounding and remaining gates

The repository contains asynchronous application code in `fold/`.
This checkout inspected `fold/mapper/server.mjs`, including `limited` at lines
98-111 and its `transform` caller. The current file hash is
`ca41ce97541750c7b2f06d9fbad57e170d1e89d110274a6e535e9c156dc54ee9`.
That matches the judgment's pinned file.

The judgment measured over-admission under one microtask schedule. That
experiment was not rerun here. Its claim that current stdin callers cannot
reach that schedule remains inherited inference. C1 does not check the limiter:
its resolver queue, count relation, and `try/finally` need later work.

Later S work needs cancellation semantics and native cancellation witnesses.
R needs closure identity, source-specific removal and duplicate behavior, and
exact counts. T needs integrated environment checking beyond this independent
entry point and a landing review. U needs explicit last-call and fairness
premises, rank decrease, enabledness, and rejection-path obligations. V needs a
pinned real subsystem through production. W needs the completed campaign and
an independent audit. None is delivered by the synthetic search fixtures.

## Final receipt

Status: PASS for C1. Tested code HEAD is `5d8415aa8279cab2f4a662b049616ce9d94a98a3`.
The subsequent receipt commit changes reports and evidence only.

Local implementation commits are:

- `0bb41330124777dbfb0fe9865533d7e59e3a31ef`: closed frontend, explicit environment, and audited fixtures.
- `7381ffebc5f1410079b3ca2bbd1435deb91a436b`: original-AST compiler boundary and induction rule.
- `5d8415aa8279cab2f4a662b049616ce9d94a98a3`: contained native replay, outcome policy, full acceptance, and default-path comparison.

Final commands were:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/stateful-*.test.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify
```

The first command passed 47 tests. The second passed 304 tests.
[receipt.json](stateful-C1-evidence/receipt.json) records their exact log hashes.
[inputs.json](stateful-C1-evidence/inputs.json) binds the tested code and fixtures
and records nine unchanged existing production modules. The 11-example comparison
is in [default-regression.json](stateful-C1-evidence/default-regression.json).

After the full run, all 42 input hashes still matched. The process check found
no remaining Node process whose command named this checkout. All owned run
sessions had ended. The temporary `node_modules` link was removed. No shared
dependency target, canonical roadmap, audit trail, upstream branch, PR, or
deployment was changed. C1 remains subject to independent landing review, and
no roadmap node is marked complete.
