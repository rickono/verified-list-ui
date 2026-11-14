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

The final combined full suite and current-model numerical evidence will be
recorded after their frozen runs. The standalone 390 and merged 483 receipts
are historical measurements of their own trees, not a full pass on this branch.
