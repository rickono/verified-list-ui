# Proving guarded throws unreachable

Select candidate A (Codex `f5473537`) with the independent judgment
`e97d03d`. Candidate B (`f5c3d471`) independently reproduced the same numeric
bug and ordered proof shape. Its wider opaque throw admission, loader, and
verified-report additions are outside this implementation. The candidates and
judgment are design evidence, not delivered support or completion of Q.

## Source behavior

Admit only an unshadowed `throw new Error("literal")` with exactly one string
literal argument. This is a syntax gate, not an Error constructor model. Every
throw path must be proved unreachable under the function's requires. Computed
messages, shadowed constructors, other thrown values and `try`/`catch` remain
unsupported, with source spans. An always-throwing function still fails the
existing requirement for a supported return.

`statements()` emits one ordinary ordered event with the current path as its
guard, `safe: "false"`, and `assume: "true"`. It then drops that continuation
without adding a return. The event can use earlier call facts; no later call,
postcondition, or fact from the event itself can discharge it. Requires remain
the only feasibility precondition. Definedness and vacuity policy are unchanged.

Use `unit.cutpoints > 0` for abstract labels, including a throw after a loop.
The active loop collector supplies its source span. Trial rollback must discard
throw events with every other speculative event. Do not introduce a second
abrupt-exit evaluator or assume the Error constructor is pure.

## Ownership and outcomes

`source.mjs` owns syntax, the ordered event and source labels. The existing
event fold and `proofs.mjs` phase plan own obligation sequencing. Add the single
`throw-unreachable` induction-gap message beside the existing messages in
`index.mjs`. Keep P's extracted replay judge, terminal attribution fix, phase
plan, dependency gate and verified-report shape unchanged.

A reachable throw is non-verified. An arbitrary native exception remains
`unknown/replay-mismatch`; it is not a source-confirmed throw counterexample.
An abstract candidate not confirmed by native execution is an induction gap.
A normal-return numeric failure still uses the existing ensures replay and
can be a confirmed counterexample. No throw-site receipt framework is needed.

## Production acceptance

Test guarded and reachable throws, branches, loops and post-loop gaps, optional
widening, empty/false requires, partial requires, unsupported forms and Error
shadowing. Test ordering against earlier and later helper facts and final
dependency gating. A private mutant dropping the event must expose false
verification and be detected. Old programs must keep their default reports and
proof queries. Do not expose feasibility witnesses on every verified report.

Keep a maintained fixture of the unchanged simple-statistics 8.0.0
`harmonic_mean.js` at `a9ec6767820e3fc7c29ab5f179778308c75a2f47`, SHA-256
`c0bcedc78add016bd1f22ce9eb1a417363ac72d8cb5c0e7dfa4c74062a19f71d`, with its
ISC license and provenance. Add comments only; byte stripping and runtime-token
comparison must recover the original implementation and export.

Both goals cover every dense singleton whose element is finite and positive,
without a fixed input or a reciprocal-finiteness assumption. Use the same loop
invariant for both: index 0 with a +0 accumulator, or index 1 with an accumulator
`Object.is`-equal to `1 / x[0]`. Prove total return and termination with
`ensures true`; demonstrate a replay-confirmed failure of `result > 0` caused
by reciprocal overflow returning +0. Ordinary one-ulp rounding at 49 is not the
claimed bug. A weakened invariant can yield either a genuine failure or an
honest gap, never a verified false promise.

Run the final verifier suite, P cache/evidence checks, native bug reproduction,
and independent review on the production tree. Preserve failed experiments and
historical model-bound artifacts. Fresh evidence must bind the final semantic
model rather than reusing the candidates' or P's stale artifacts. No upstream
message, exception framework or roadmap completion follows from this gate.
