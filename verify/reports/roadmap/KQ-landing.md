# Library proof and bug-campaign landing

K and Q meet their existing completion predicates in the documented verifier
subset. PR [#14](https://github.com/rickono/verified-list-ui/pull/14) merged as
`e364946706b2790bf6a8029d3b5db83f27b00f47`, from reviewed feature head
`6832cb1cdb9d3a1a46294d43d6f3d446f7613c5c`. This receipt adds no source feature.

K requires realistic functions to compose, seeded bugs to be caught, and honest
behavior after source or contract edits. The unchanged Reverse and eager take
helpers prove entry-relative contents and exact length through a three-module
caller. Weakening a helper contract produces a gap; a broken helper blocks its
caller despite a reusable caller proof key; wrong-order callers and seeded
mutants reproduce native failures. Ramda's unchanged generic findIndex also
proves bounds, matching, first-match order, absence and termination in its
admitted pure total predicate domain. The source/compiler and ownership reviews
pass. See [integration](K-integration/README.md) and
[composition](library-composition/README.md).

The first combined K/throw/C1 tree passed 477 tests. The resource amendment's
matching code and test tree passed 483, with 46 focused checks. Its independent
review passes. One recorded 180000 ms cold graph, warm replay and fresh audit
verify all three composition targets. All 15 postconditions and 36 phase plans
match the preceding source. Historical 60000 ms unknowns remain historical;
future completion within any budget is not guaranteed. Native replay remains
100 ms and witness limits remain 256. These limits do not bound proofs.

Q requires independent real-code campaigns with reproducible failures and
maintained universal proofs, without rewriting implementations. The current
[numerical campaign](library-campaigns/maintenance.md) passes all ten stages:
the finite-positive-singleton harmonicMean total-return theorem and genuine
reciprocal-overflow failure; Ramda's generic theorem and seeded controls; and
independent native d3-array coverage failures. Native d3 timeouts and its
separate instrumented cycle argument are not solver proofs. The verifier still
rejects d3's source at its documented admission boundary. A singleton such as
Number.MIN_VALUE gives harmonicMean native +0; the positivity witness is
reproduced through the API and CLI. Seeded mutants are separate from real bugs.

Current campaign evidence binds model `09d21829` and implementation `524d03a`.
The immutable library, annotation, license and adapter pins remain strict.
Current verifier snapshots are recorded before and after execution; default
execution needs no unpublished Git object. Twelve focused controls, eight
audit groups and 345 hashes pass. The original campaign and its maintenance
each received independent review. Root checked the imported gate and hashes;
it did not repeat the full campaign or full suite for report-only imports.
Old model receipts remain historical and are refused under a changed model.

This is a scoped milestone, not arbitrary-JavaScript completeness, a proof
certificate, a novelty claim, an upstream fix or a report to maintainers.
Trusted translation, solver, builtins, replay and cache-writer assumptions
remain explicit. GPL Reverse stays a separate licensed report fixture.

R, S, T, U, V and W remain open. C2a's native review passes, but its proof
review found nominal request/activation frame checks that need correction.
Conditional completion is a separate local implementation awaiting review.
