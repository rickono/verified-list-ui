# H: pure callback contracts

H is implemented on `feat/pure-callback-contracts`, based on merged main
`91c2806d883a8a647c0cfb540a218ff01c19baf4`. Its documented first slice is complete;
heap effects, stateful callbacks and general higher-order JavaScript remain
outside this delivery. See [the design](../design/callbacks.md).

H was merged in [PR #5](https://github.com/rickono/verified-list-ui/pull/5) at
`eb135b5145cceda1e225f5a42e595a4a59a7199b` after an independent
[landing review](roadmap/landing-H.md). Counts below describe the H delivery.

## Final validation

All solver-heavy commands used the shared serial test lane. The final full run
includes the expanded callback conformance corpus and the runnable import fixture.

| Check | Result |
| --- | --- |
| `make test-verify` | 219 passed; 0 failed, skipped or cancelled |
| Predicate models, predicate source tests and Ramda pilot | 20/20 passed |
| `make test-verify-conformance` | 3/3 passed |
| Independent corpus | 58 fixtures, 574 functions, 667 native samples, 20 reproduced counterexamples |
| Seeded verifier mutations | All 12 detected; errors/timeouts do not count as detections |
| `node verify/check-native-baseline.mjs 91c2806d883a8a647c0cfb540a218ff01c19baf4` | Identical obligations for 8 data-only cases / 13 targets |
| `node verify/examples/project/check-baseline.mjs` | Equal native obligations and graph metadata |
| CLI `callbacks.ts`, 60-second budget | All five targets verified |
| CLI `callback-bugs.ts`, 60-second budget | Expected exit 1; narrow callback admission reproduced at input 0 |
| Syntax and whitespace checks | Passed |

The pinned Ramda eager declaration verifies without changing runtime tokens.
Both implementation mutants produce confirmed counterexamples, independently
replayed with the reported predicate tables. The unchanged body passes 42 native
comparisons. Pinning and the excluded wrappers are described in
[the fixture README](../examples/ramda/README.md).

## Corrections established by execution

The two designs scored 13/18 and 10/18. Cross-review and integration corrected:

- A callback's contradictory fact could hide its own admission failure. Safety
  now precedes facts, with no asserted callback axioms or weakened retry. The
  contradictory callback produces a confirmed caller counterexample.
- Reading FP numerals through the prototype's numeric accessor collapsed table
  keys to zero. Bit-level decoding covers normal values, subnormals, infinities,
  NaN and both zeros. Distinct-key failures now replay.
- Sanitized file paths could collide: `a-b.ts#f` and `a_b.ts#f` shared a predicate
  symbol. A red/fixed run on the review prototype and final implementation showed
  `wrong` change from **verified** to a **confirmed counterexample** at a nonzero
  input. Canonical identity keys and fresh symbols now keep the callbacks separate.
- Admission probes now match the executed call site, including multiple calls to
  the same generic. Imported callback diagnostics retain the defining file.
- IPC table limits, NaN-key conflicts, closure capture rejection, post-replay
  dependency gating, source-free CLI tables and unsafe optional arguments have
  executable checks. The corpus adds mutants for signed-zero lookup and corrupted
  numeric keys.

## Scope and trust

External predicate parameters assume the explicit pure-total numeric-to-Boolean
domain. Concrete source callbacks are checked for admission, immutable primitive
captures and purity in the current effect-free subset. A verified named callback
is a dependency; a false callback cannot leave its caller verified.

The frontend, SMT translation, model extraction, native replay and solver remain
trusted. The added model-table trust line is conditional on function models;
data-only reports retain their existing trust list. Unsupported model tables and
solver uncertainty remain unknown. The 256-entry table limit applies only to
witness materialization, never to proof queries. No performance claim is made.

G must derive purity from heap effects before admitting mutation. It must also
preserve the primitive capture snapshots and argument evaluation order established
here. H's publication does not imply G or stateful callbacks are implemented.
