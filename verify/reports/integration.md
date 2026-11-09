# Combined verifier integration

The five ready-now packages A, B, C, D and F work together for their documented subsets. The combined suite passes 168 tests, with no failures or skips. This completes roadmap checkpoint I. Downstream capabilities remain unimplemented.

## Included branches

The integration starts at `ff2518cd7494300084f2ab54da71f4d79185e586`. Each original delivery remains in the merge ancestry.

| Package | Original commit | Integration merge |
| --- | --- | --- |
| B: proof scheduling and backend API | `abd0bf5202729b1fa0872613c7bfdd46a06a1d93` | `c5105ca` |
| A: local scalar state | `46c8f7884b3447a72ccae7e2cc95f43390baf4a2` | `de8cdc1` |
| C: project frontend | `304587c9a827b3bf38912b4c5acf1ed9a12da11e` | `0de811a` |
| F: exact specifications | `3aa07f3fa9901057e62de195ff5d2210c69679c2` | `52b85df` |
| D: independent conformance corpus | `4a628d3d5c76f6d0d0b893e2019073d7fbf8740d` | `962e88d` |

The original [A](ready-A.md), [B](ready-B.md), [C](ready-C.md), [D](ready-D.md) and [F](ready-F.md) reports describe isolated branch results. D's original partial acceptance is historical. Its three Remeda timeout failures pass in the combined run.

## Compatibility decisions

The compiler retains A's binding descriptors and lexical scopes. Parameter, callback, helper-contract and specification environments use the same representation. Entry snapshots preserve the values needed by `old(...)`. C's annotation validation covers `const`, `let` and `var`.

B's scheduler retains independent call obligations and ensures clauses within one request deadline. F's specification obligations enter that scheduler as additional conclusions. Preconditions containing partial exact arithmetic first require a separate definedness proof. That query does not assume the precondition it is checking. A bounded witness search can produce a replayable example or `unknown`; it cannot establish universal correctness or vacuity.

D's mutation runner copies every top-level verifier module into its isolated test copies. Its proof-bound mutant now changes the query builder in `proofs.mjs`. The control still requires the native 257-element example to expose false verification. An import error or timeout does not count as detecting that mutant.

The native baseline comparison excludes the new `typeAliases` provenance metadata. It still compares parameter names, types and input models, solver declarations and formulas, result shapes, witness constraints and executable source.

## Validation on 2026-11-09

The CPU-heavy checks ran through the shared serial solver lane, using `node --test --test-concurrency=1`.

| Check | Result |
| --- | --- |
| Backend protocol and scheduling | 20 passed |
| Scalar state and helper calls | 33 passed |
| Project frontend and scalar state | 38 passed |
| Specifications, scalar state and backend protocol | 54 passed |
| New cross-feature integration checks | 5 passed |
| Independent conformance and mutation suite | 3 passed |
| Full combined `make test-verify` | 168 passed, 0 failed, 0 skipped |
| `node verify/check-native-baseline.mjs` | Identical semantic payloads across 8 cases, 13 targets |
| `node verify/examples/project/check-baseline.mjs` | Identical obligations and both composed/shifted graphs |

The conformance run covers 53 fixtures, 565 reported outcomes and 643 native samples. All 16 reported counterexamples reproduce, and all eight seeded verifier mutants are detected. These checks provide executable evidence for the corpus; they do not constitute a proof of the verifier itself.

The new [integration tests](../../tests/verify/integration.test.mjs) exercise aliases with local updates and entry snapshots, imported specifications through barrels, exact-arithmetic definedness, short-circuit effects and scheduler witness policy. [The decision record](integration-decisions.tsv) records the merge choices and evidence. Local raw logs are under `/Users/rick/verification-vibes/artifacts/integration/`.

## Review and evidence notes

Claude Opus 5.5 reviewed the conflict resolutions, decision trail and retained evidence. The review found no blocking defects.

The C command included a negative test-name pattern. Its actual TAP output records all 38 tests passing with zero skips, including the pinned project fixture. That fixture also passes in the full suite.

The first native-baseline comparison failed because the parameter projection included new provenance metadata. The active-run transcript retains that failure. The successful rerun replaced `native-baseline.log` after the projection was narrowed to the baseline's original parameter fields.

The full suite ran against the runtime implementation at `962e88d`. Later changes affect only the baseline comparison script, reports and roadmap. The suite does not import the comparison script, which was checked separately. No runtime verifier implementation changed after the successful full run.

## Remaining limits

The verifier handles an explicit subset of JavaScript and TypeScript. Local scalar mutation is supported; parameter writes, mutable heap semantics, loops, general higher-order code and async effects remain unsupported. Type aliases and project loading use the documented frontend subset.

Z3 remains the only solver backend. Timeouts and incomplete reasoning remain `unknown`. The compiler, supported-semantics encoding, solver, source loader and Node replay remain trusted components. The conformance corpus is finite, and solver results have no independently checked certificates. The 256-element witness materialization limit does not bound proof domains.
