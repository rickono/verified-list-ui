# C2a integration and abort-proof correction

This branch combines C2a with merged K, guarded throws and the budget amendment.
R, S, T and U remain incomplete here until integration validation and acceptance
assessment. The standalone implementation `c1df5f6` passed 390 tests, and its
[native review](review-C2a/native/report.md) passes. Its
[proof review](review-C2a/proof/report.md) found a structural gap: the named
request frames were reflexive claims disconnected from the abort operation.
Neither review reproduced a false scalar application proof.

The coordinator reproduced that gap by replacing each named request-abort rule
with an unrelated true claim. The validator accepted both and the intended
rejection check failed. Those RED results are preserved externally under
`artifacts/roadmap-20261113/combined-C2a/`, alongside the original integration
results. They are failures of structural validation, not confirmed application
counterexamples.

The correction gives source lowering and protocol induction one persistent
`advisoryAbort` transformation. Required clauses compare its actual before and
after maps for pending requests, selected outcomes and running invocations,
together with the changed abort contents. Source aborts carry these clauses
at their original spans. Validation checks their typed clauses, source-action
coverage and write effects. A matching rule name alone, a substituted claim,
an added assumption or an erased source action/frame cannot pass admission.

Unchanged frames can simplify to reflexive terms because the shared transition
preserves those fields by construction. The evidence is the coupling and its
negative controls, not unsatisfiability of an unrelated identity. Private changes
to the real transformation that lose pending, settled or running membership,
or leave abort contents unset, produce abstract solver counterexamples in both
the rule and the source step. These are not native application bug reports.
The protocol semantics, constructor and compiler remain trusted; this is not
an independent proof certificate or an expanded source subset.

The first combined seam run passed 20 of 21 checks. Its sole failure compared
K's allocation metadata against pre-K main `77c95f3`. The corrected baseline
uses published pre-C2a `e5d040d` and compares every artifact and report field
without filtering; the affected test passed 1 of 1. The corrected protocol,
abort-frame and K/throw seam run passed 25 of 25. After adding assumption and
effect-certificate rejection, the eight abort-frame checks passed 8 of 8.
Each run froze source/test inputs; the distinct results are preserved separately.

The final combined full suite passed **510/510**, with zero failures, skips or
cancellations, at committed source `e1a76a3`. All 212 recorded inputs match
before and after the run and still match this branch. The receipt's tracked
diff is empty before and after. [The evidence summary](C2a-integration-evidence/summary.json)
keeps each earlier run separate. Raw TAP logs are compressed without changing
their bytes; receipt hashes cover the decompressed text. The recorded runner
and exact command are included. The full suite ran once after the correction.
The standalone 390 and merged 483 receipts remain measurements of their own
trees, not a combined pass on this branch.

Both original review reports remain unchanged: native PASS and proof ISSUES on
`c1df5f6`. The coordinator corrected the finding and tested the changed code;
the original reviewer did not review `e1a76a3`. The full suite includes the
current native protocol cases and eight new binding/mutation checks. It does
not include the separate conditional-completion implementation `20ff205`.
That implementation has native PASS and a separate source-plan integrity issue
which is still pending; this landing does not deliver U.

## First-layer acceptance

R's lifecycle property is safety over arbitrary modeled listener sequences,
including deliveries after disposal. The guarded listener fixture proves that
property with no event bound, and native closure-identity/cleanup controls give
2/1/0 deliveries. The EventTarget domain excludes asynchronous handlers,
payloads, registration mutation and EventEmitter reentrancy.

S's ordering property includes arbitrary modeled scalar async interleavings,
legal resolve/reject outcomes, and advisory abort before or after selection.
Guard removals reproduce real native safety failures. Scalar C1 entries retain
multiple awaits; protocol entries have one await and separate listener modules.
Abort changes contents and preserves invocations rather than deleting work.

T's declared-operation model exposes response domains, rejection, handle
ownership, cancellation policy and settlement assumptions. Native replay
refuses undeclared/illegal outcomes and malformed ownership. Safety does not
discharge external production or fairness. These are explicit scalar/protocol
contracts, not proofs of HTTP services, wall-clock timing or every Promise API.

These scoped R/S/T predicates are ready for integration. They are not marked
integrated until the implementation lands. U, V and W remain separate goals.
Current-model numerical evidence will be recorded after its fresh campaign;
previous model-bound evidence is not promoted across source changes.
