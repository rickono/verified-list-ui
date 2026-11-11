# Upstream search proof

PR #3 merged loop induction into `main` at `80ed2fd53b054206a108639c97116ae6f59e8099`.
Roadmap J now proves Lodash's unchanged `strictIndexOf` function on
`feat/upstream-search-proof`. The new pilot awaits integration.

## Result and scope

The [pinned function](../examples/lodash/strictIndexOf.upstream.js) verifies an
integer result, bounds, first match, absence and termination. Inputs are dense
ordinary numeric arrays and an integer start in `[0, array.length]`. All native
array lengths are included; NaN, infinities and both zero signs remain in the
numeric domain. Matching uses native `===`.

The source comes from Lodash's `4.17.21-npm` commit
`c6e281b878b315c7a10d90f9c2af4cdb112d9625`. The checker validates hashes of the raw
source, extracted declaration and retained license. It inserts only loop proof
comments: removing them recovers the exact declaration bytes, and token sequences
must match. The original CommonJS export is exercised separately in V8.

This proves the internal helper under explicit numeric-array assumptions. The
public Lodash wrapper, normalization, sparse arrays and arbitrary values are
outside the claim. The [fixture guide](../examples/lodash/README.md) explains the
contracts and induction argument.

Two seeded mutations produce replay-confirmed contract failures. Independently
executing each reported input reproduces the result and disagrees with native
array `indexOf`:

| Mutation | Native illustration | Mutant result | Expected |
| --- | --- | --- | --- |
| Return `index + 1` | `[1]`, target `1`, start `0` | `1` | `0` |
| Ignore a match at `fromIndex` | `[1]`, target `1`, start `0` | `-1` | `0` |

These are synthetic bugs, not discovered Lodash defects. The illustrations are
small native executions; solver witnesses can be larger. The raw export also
passes 261 independent native comparisons over numeric edges and valid starts.

## Translation changes

The first direct proof attempt exhausted its budget at invariant initialization.
The compiler now preserves exact integer views for explicitly bounded parameters
and predecessor counters. An unsigned shadow minus one represents the `-1`
sentinel without treating negative indices as unsigned. Adding one recovers an
exact unsigned view. Comparisons widen before offset normalization; `Object.is`
retains the original FP payload and its zero sign. Rank lowering uses the exact
successor only when the integer view survives.

Parameter links are guarded by the original precondition and its definedness.
They retain raw input models and add no new input assumptions. Loop views require
checked integer/range invariants. Optional values disable integer shortcuts.
Proofs still have no array-length or iteration cap; replay witness preferences
are unchanged.

Review caught a new range-analysis defect before publication: excluding an
optional scalar from representation candidates also excluded it from the write
set used to identify stable bounds. The regression initially returned
`unknown/replay-mismatch`. The analysis now receives candidates and the full write
set separately. The corrected encoding gives a confirmed counterexample with
`result = 4294967296`. All seven integer regressions pass.

## Validation

The final `make test-verify` run passes **199/199** tests, with zero failures or skips. It includes all 189 tests from merged PR #3 and ten new tests.

The first combined run passed 195/198 tests. Two existing Remeda witness searches
hit the 60-second budget, and one existing numerical-operator replay hit its
100 ms runtime budget. All three passed in a serial isolated recheck with their
original assertions and budgets. The changing-bound regression was added after
that run; the final run above includes its correction.

- All ten added tests cover the upstream proof, both seeded bugs, source drift,
  native strict search, integer boundaries, signed zero, optional values,
  precondition definedness and mutable bounds.
- The independent corpus checks 56 fixtures, 569 functions and 657 native samples.
  All 17 reported counterexamples reproduce, and all ten verifier mutants are
  detected after their unmodified controls pass.
- Eight loop-free cases and thirteen targets retain identical native payloads
  against both the original `ff2518c` baseline and merged PR #3. For PR #3, this
  also compares definedness, individual postconditions and witness flags.
- The project fixture retains identical obligations and both source graphs.
- Syntax checks and `git diff --check` pass.

[Machine-readable evidence](upstream-search.json) records the upstream identity,
proof results, concrete witnesses, test counts and baseline comparisons.

## Reproduce

```sh
node verify/examples/lodash/check.mjs
node --test --test-concurrency=1 tests/verify/integer-shadows.test.mjs tests/verify/upstream-search.test.mjs
make test-verify
node verify/check-native-baseline.mjs
node verify/check-native-baseline.mjs 80ed2fd53b054206a108639c97116ae6f59e8099
node verify/examples/project/check-baseline.mjs
```

CPU-heavy checks ran through the shared serial solver lane and tests used
`--test-concurrency=1`. No test assertions, source contracts or proof domains
were weakened to handle resource limits.

The frontend, numeric translation, solver and runtime remain trusted. These are
solver-backed proofs within that model; they introduce no independently checked
certificate. Nested loops, mutation and higher-order library helpers remain
separate roadmap work.
