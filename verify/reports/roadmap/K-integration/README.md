# Combined loop, throw and stateful integration

This checkpoint combines the independently reviewed guarded-throw unit and
K implementation with public C1 main `77c95f3`. Both K review axes pass.
The combined suite passed 477 of 477 tests at `59ee1dc`, with zero failures,
skips or cancellations, a clean checkout, and unchanged recorded inputs.
[The receipt](final/receipt.json) binds that exact tree. Report and campaign
imports left those tested inputs unchanged. The later resource amendment below
changes the budget boundary and has its own 483-test receipt. K landed in
PR #14 as `e364946`; the current-model numerical campaign repair and its
independent review also passed. [The milestone receipt](../KQ-landing.md)
records the scoped K/Q completion.

The only source conflict was the loop iteration context. The resolution keeps
K's context for the test, body and update, and the collector span used by throw
attribution. C1's missing-contract SourceError is retained. The numeric owner,
proof phase planner and P cache/evidence policy have no new changes.

The first targeted run passed 22 of 23 checks. Its sole failure was a historical
throw test comparing all internal target fields before K added `allocates`.
A static comparison of all eleven existing root TypeScript examples found no
other changed target field. The compatibility helper removes only that new
boolean metadata; every pre-existing field, solver query, graph hash and public
report remains compared exactly. K separately tests the allocation effect.
The affected throw check then passed 1 of 1. No production change followed.

The new integration test exercises heap-frame discovery and optional-scalar
widening together. Exactly one throw obligation survives retries, with its
original throw and loop spans. Its guarded program verifies; admitting the
throwing input cannot produce verified. The targeted run includes this case.

The source-semantics review is
[PASS](../review-K/semantics/report.md). Its two probe processes exited 1 for
four incorrect reviewer expectations: two reference assignments are outside
the subset, and two positive index-side-effect programs correctly verify.
Those raw logs remain unchanged. They are not described as passing suites.
The [ownership and rollback review](../review-K/ownership/report.md) also passes.
Its 22 heap/compile probes, domain and guard controls, and continue/break checks
found no executed product defect. Those runs concern the standalone K tree;
the 477-test run above checks the combined source.

## Composition evidence and resource limits

The [Reverse and take campaign](../library-composition/README.md) proves exact
length and contents relative to caller entry across three real modules and
all admitted dense numeric array lengths. Only contracts and exports are added
to the extracted unchanged helpers. The one informed retry uses the equal
exact-real rank `real(arr.length - 0) - real(i)`; runtime tokens, preconditions
and postconditions do not change. A cold proof and an independent baseline
audit verified all three targets. Native samples cover 179 inputs.

Weakening only take's content contract leaves a contract gap; a bad Reverse
body blocks the caller despite its reusable proof key. Wrong-order caller
failures reproduce. Some additional negative-case audits time out under the
public 60-second graph budget. Their expected repeatability is unestablished;
the campaign and its checker retain ISSUES and a nonzero resource-limit exit.
Those unknowns are not proofs. The existing node acceptance asks for real
composition and honest behavior under edits, not a guaranteed solve time.
The final completion assessment must distinguish these executed properties
from the separate unresolved repeatability prediction.

A fresh root request on combined model `13874e72` also timed out at 60 seconds
on Reverse's invariant preservation. Take verified; the caller remained
`unknown/dependency`. No new cold proof or warm hit is claimed for that request.
All 15 current postcondition SMT strings match the earlier successful campaign
byte-for-byte. [The comparison](composition-current/query-comparison.json) and
[raw result](composition-current/cold.json) preserve that distinction. A separate
isolated task tested a larger resource budget without changing contracts,
proof domains or witness limits. The 477-test pass does not resolve this query's
resource limit.

### Reviewed resource amendment

The [budget unit](../composition-budget/README.md) admits caller requests through
180000 ms while retaining the 10000 ms default, one shared graph deadline,
100 ms native replay, and witness-only limits. The implementation `7feca28`
passed 46 focused checks and one final full run of 483 tests. Its recorded
verifier and test inputs match this branch. The coordinator ran its inventory
checker; the full suite was not repeated for subsequent report-only imports.

An [independent review](../review-composition-budget/report.md) passes. It checked
67 artifact hashes, current source bytes, all 15 postconditions and all 36
phase queries/models/replay guards, and ran compact API/CLI and virtual-clock
checks. The resource boundary is the only production logic amendment.

At the current model `09d21829`, the recorded cold request and fresh audit each
verified Reverse, take and their caller; warm replay hit all three receipts.
These are those requests, not a future completion guarantee or evidence that
any individual query needs more than 60 seconds. The larger first scheduling
turn explains the diagnostic observation; the historical 60-second unknowns
remain preserved. The amendment also records fresh harmonic failure evidence
and refusal of the old model's artifact.

## Maintained numerical campaign

The historical [numerical campaign](../library-campaigns/report.md) passed all ten stages
and [independent review](../review-library-campaigns/report.md). It preserves
the harmonic-mean total-return proof and genuine reciprocal-overflow failure,
Ramda's generic first-match theorem with seeded controls, and native d3-array
coverage failures. The d3 source remains formally unsupported; timeouts and
the separate instrumented cycle argument are not solver proofs. Its model-bound
receipts remain historical. The [maintenance unit](../library-campaigns/maintenance.md)
separates immutable library inputs from fresh verifier snapshots and removes
mandatory unpublished-history reads. Its current-model campaign passed all ten
stages, twelve focused controls and eight audit groups, with 345 package hashes.
The [independent maintenance review](../review-campaign-maintenance/report.md)
passes: it executed drift, missing-history, queued-snapshot and replay controls,
and checked the recorded full campaign without repeating it. Root checked the
imported input gate and all 345 hashes. The recorded proof identity is
`09d21829`; none of the old model's artifacts are promoted.

One sentence in that review calls the lockfile `package-lock.json`; this
repository tracks `pnpm-lock.yaml` and has no tracked `package-lock.json`.
Root checked that `package.json` and `pnpm-lock.yaml` match the 483-test head
`7feca28`. This correction changes no source, receipt or proof claim.

The numerical review ran an 800 ms native timeout control outside the requested
serial lane and records that policy miss. The coordinator repeated that check
through the serial lane: the original count-5 call printed its start, exceeded
800 ms, was killed with SIGKILL, and was waited/reaped. The pid was absent.
[The separate receipt](native-containment/receipt.json) classifies that observation
as unknown, not a nontermination proof or speed measurement. No full suite is
repeated for these report-only imports.

Historical composition checksums bind to `aa17bb3` and its code head `b5c8828`.
They do not assert that every historical runtime/test hash matches this combined
checkout, which additionally contains guarded throws and test corrections.
