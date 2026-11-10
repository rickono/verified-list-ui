# Loop induction validation

Roadmap E is implemented on `feat/loop-induction` for the supported subset. The feature is ready for integration. The unchanged-upstream search pilot J remains a separate next milestone.

The compiler verifies annotated `while` and C-style `for` loops by cutpoint induction. It checks initialization, preservation, returns and a defined, nonnegative rank dropping by at least one exact unit per back-edge. Proof queries have no iteration or array-length cap. [The loop design](../design/loops.md) records the rules, synthesis and limits.

## Results

The final `make test-verify` run passes **189/189** tests, with zero failures or skips. This includes all 168 prior tests and 21 new loop tests. The CPU-heavy runs used the shared serial solver lane and `--test-concurrency=1`.

- Array search proves bounds, first match and absence under native `===`, for every supported dense-array length. Its off-by-one mutation produces a replay-confirmed counterexample.
- Loop helpers compose across imports. CLI failures identify the invariant or rank clause and distinguish an induction candidate from a confirmed source bug.
- Negative tests cover initialization, preservation, constant and fractional measures, rounding, stalling at 2^53, optional widening, signed zero, jump scope, helper ordering and partial specification expressions.
- A 53-bit boundary check compares rank thresholds against independent BigInt arithmetic through the real solver.
- Witness tests keep rank and array bounds out of proof queries. Precondition-definedness replay omits rank preferences because it never executes the body.
- The independent conformance run covers 56 fixtures, 569 outcomes and 657 native samples. All 17 reported counterexamples reproduce. All ten verifier mutants are detected after their unchanged controls pass, including the new preservation-erasure and termination-erasure mutants.
- `node verify/check-native-baseline.mjs` reports identical loop-free payloads across eight cases and thirteen targets. `node verify/examples/project/check-baseline.mjs` reports identical obligations and both project graphs.

The first prototype's bare numeric rank arithmetic was incorrect. The implemented regression distinguishes rounded `n - i`, its equivalent `real(n - i)` embedding and the exact expression `real(n) - real(i)`. Rank lowering now belongs to `specifications.mjs`, uses exact shadows or directed thresholds, and has no ablation switches.

Earlier test runs exposed invalid test invariants, an omitted `decreases` keyword and the model-readability of a witness flag. Those were corrected before the final run. The last witness-phase regression also ensures that a long unexecuted loop cannot hide an undefined precondition.

## Reproduce

```sh
make test-verify
node --test --test-concurrency=1 tests/verify/loops.test.mjs
pnpm verify --timeout 60000 verify/examples/loops.ts
pnpm verify --timeout 60000 verify/examples/loop-gaps.ts
node verify/check-native-baseline.mjs
node verify/examples/project/check-baseline.mjs
```

The gap examples intentionally exit 1. Their implementations satisfy ensures, but the proposed invariant and constant rank fail induction. Native replay remains unchanged, and neither candidate is described as a confirmed program bug.

Local raw evidence is under `/Users/rick/verification-vibes/artifacts/loop-design/`, especially `release-full.log`, `native-final.log` and `project-final.log`. The original designs and cross-judgment are retained there as working artifacts.

## Limits

Nested loops, labels, `do`, `for-in`, `for-of`, `var` declarations inside loops and heap writes remain unsupported. Accumulators and mixed-theory obligations can time out. A coarse rank can make every witness exceed the replay preference even when execution would be short. The frontend, encoding, solver and replay machinery remain trusted; these results introduce no independently checked certificates.
