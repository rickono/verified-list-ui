# Retained numerical bug reports

These reports concern the pinned versions on 2026-11-13. They claim no novelty,
current-main status, upstream acknowledgement, or upstream fix. No issue was
posted. Fresh execution results are in [report.md](report.md).

## Positive harmonic mean collapses to zero

**Source:** simple-statistics 8.0.0,
`a9ec6767820e3fc7c29ab5f179778308c75a2f47`, `src/harmonic_mean.js`, ISC.
The unchanged source, export, license, and published JSDoc contract are retained
in `verify/examples/simple-statistics/`. The adjacent provenance records exact
source and license hashes. `inputs.json` pins those artifacts and their checker.

**Minimal inputs:** `[Number.MIN_VALUE]` or `[2 ** -1024]`.
Both are dense singletons with a finite positive element. The JSDoc describes
the harmonic mean of one or more positive values as the reciprocal of the
arithmetic mean of their reciprocals. It excludes neither subnormal inputs nor
finite positive values whose reciprocals overflow.

**Expected:** a positive result. Mathematically, the singleton's harmonic mean
is its input, which is itself representable as a positive binary64 value.

**Actual:** `1 / x[0]` is `Infinity`; the original return computes
`1 / Infinity`, yielding `+0`, bits `0000000000000000`.

The universal total-return proof keeps every finite positive singleton in its
domain. Its positivity counterpart changes only `ensures true` to
`ensures result > 0`. It does not add a reciprocal-finiteness assumption or a
fixed numeric input. The exact runtime tokens, bytes after annotation removal,
and export survive. This is an unchanged-source failure, not a seeded mutant.

Ordinary input `[49]` produces a result one ulp above 49. That rounding row is a
finite control and is not the claimed bug. Empty, zero, and negative inputs
throw and are outside the theorem's domain. The documented `[2, 3]` example
still prints `2.40`.

## A nice interval fails to cover its input

**Source:** d3-array 3.2.5,
`24c015e4d894ee44af6cf6a2cc9e300b1885b0d9`, `src/nice.js` and `src/ticks.js`, ISC.
Exact bytes are in `pins/d3-array/`. [provenance.json](provenance.json) identifies
the pinned source and the published `nice` documentation blob and digest.

**Minimal inputs:** `nice(0.9299999999999999, 0.93, 1)` and the same endpoints
with count `5000`. They satisfy the documented `start <= stop` precondition.

**Expected:** `[niceStart, niceStop]` covers `[start, stop]`, so
`niceStart <= start && stop <= niceStop`.

**Actual:** both calls return `[0.93, 0.93]`. The lower bound exceeds `start`,
so the returned interval fails coverage. The first reciprocal tick increments
are `-10000000000000000` and `-50000000000000000000`, respectively.

The documented `nice(1, 9, 5)` result `[0, 10]` is retained as a finite control.
The issue-282 vector `nice(0.9299999999999999, 1.07, 5000)` covers on this pin.
That already-fixed input is not counted as a failure.

## A nice call has a repeated period-2 state

**Inputs:** binary64 start/stop bit patterns
`3f5b4dad6af648df` / `3f5b4dad6af648e1`, count `100`, and
`3fbcc42ba089e7d0` / `3fbcc42ba089e7d1`, count `5`.
Both endpoints are finite and ordered, with a positive count.

**Expected:** the documented operation returns an interval.

**Observed native behavior:** the unchanged imported module prints its call
input and does not return before an actual 2-second subprocess timeout. The
parent kills it with `SIGKILL` and waits for it. An elapsed timeout alone proves
only that observation.

**Separate argument:** the modified diagnostic records the full loop-head state
`(start, stop, count, prestep)`. It repeats bit-for-bit at iterations 2 and 4,
with no intervening return. Under pure deterministic `tickIncrement` and standard
builtins, the same transition repeats indefinitely. The diagnostic uses the
pinned real `tickIncrement` and the original `nice` body with one trace hook.
It is finite diagnostic evidence plus a conditional cycle argument, not a
source-verifier theorem. Its 16-step diagnostic limit is not a proof bound.

The current unchanged-source API result is unsupported at the numeric top-level
`const` declaration in `ticks.js:1`, span `[0, 73)`. No supported kernel is
substituted for these modules, and no formal proof of `nice` is claimed.
