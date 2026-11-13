# Exact numeric metadata acceptance

Accept Gate 1 for the mutating-loop work. This adds derived integer and
half-integer expressions to `data.mjs`; binary64 terms remain authoritative.
The metadata is discarded when exactness or presence is not established.
Numerical equality may combine signed zeros, while `Object.is` keeps the
original FP term. Low 32 bits are used only after the index range guard.

Implementation `4c40e07`, evidence `b00b08e` and independent review `04ba933`
are preserved in [the implementation report](numeric-metadata.md) and
[the review](review-numeric-metadata/findings.md). The full implementation
suite passed 273/273. The reviewer independently exercised boundary cases and
both private false-proof mutants. No executed case falsely verified a native
failure.

The coordinator combined this gate with reviewed P and main's heap write audit
at `dedde91`. **322/322 tests passed**, with no failures or skips. The current
runtime files and lockfile match the tested hashes. The stack also passed the
real project cold/warm/audit checks and reproduced all three fixture bugs.
[The combined receipt](P-integration/combined-numeric/receipt.json),
[full log](P-integration/combined-numeric/full.log), and
[fresh bug artifact](P-integration/combined-numeric/bugs.json) retain the exact
tested tree. P's receipt describes the corrected wrapper assertion; it was not
a product failure or a second full run.

Two limits remain visible. N12 times out in the final unpinned query at the
recorded 20-second budget, though the two known native failures are both
satisfiable in that final encoding. This is a search miss, not a proof or a
reason to strengthen inputs. Of 38 arithmetic validity attempts, 15 returned
unsat and 23 unknown. The generic width argument is mathematics within the
trusted translator, not a mechanically verified compiler theorem. No speed
claim follows from these individual runs.

The production diff above P is only `data.mjs`. Numeric queries may change,
which correctly changes proof keys and model identity. P-only evidence predates
this gate; use the combined artifact above for this model. Later semantic
updates require fresh evidence or the recorded earlier model.

Heap-writing loops remain unsupported in this gate. The compiler cutpoint
consumer, unchanged upstream reverse pilot, final conformance controls and
independent review are still required for K.
