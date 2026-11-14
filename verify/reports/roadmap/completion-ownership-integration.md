# Conditional completion integration and producer ownership

This branch combines scalar conditional completion with merged C2a. It does
not extend the completion rule to protocol modules. Historical implementation
`20ff205` passed 496 tests; its native review passed, while its proof review
found that a changed compiled viability check could be blessed by rebuilding
the plan. Those reports and their original evidence are preserved.

The coordinator reproduced the actual bypass before changing the code. With
`resolves false`, public safety remains verified and completion remains unknown.
Replacing only the compiled outcome-existence check with `true`, solving the
rebuilt targets, and supplying the original verified safety made the private
conclusion return verified. The RED check expected unknown and received
verified. An earlier coordinator driver accidentally supplied the public
combined unknown status as safety; that failed for safety-prerequisite and is
retained separately as a harness mistake, not the reproduced defect.

The correction starts before planning. `machineOf` privately registers the
parsed temporal machine's data identity. `transitionsOf` requires that original,
unchanged machine and seals its produced graph after all exits, rejection
segments and keeps units have been compiled. A private ownership table records
the graph and frontend identity. Only the producer can register this graph;
copying it and rebuilding a plan does not acquire ownership. Graph checks,
footprints, effects, parameter/result types and control metadata are immutable.
Map changes to the frontend data are detected even though freezing a Map would
not prevent `set`.

Planning adds a required producer-ownership obligation. Its identity-frame
check reads actual compiled parameter/result types and footprint locations,
rather than accepting only the saved boolean. Query identity also binds actual
footprints, effects, types and control metadata. Both plan construction and
conclusion check the same source-owned producer output. Replaced viability,
footprint or effect data cannot authorize completion. A modified frontend
cannot mint a new owned graph from the same source either.

This enforces the internal data boundary; it is not a new proof kernel. Parser,
frontend, compiler, the finite-control correspondence rule and solver remain
trusted. It does not authenticate arbitrary fabricated backend outcomes or
prove infinite behavior by running a finite native trace. Per-reached-request
settlement and a continuing runtime remain explicit completion premises.

Integration keeps C2a parsing, environment assumptions, native protocol dispatch,
source-bound abort frames and protocol reports. A protocol module with a
completion goal is rejected at the goal's original source span. Existing
no-goal scalar and protocol modules are compared against published pre-completion
main `ec325c7` with complete compiled targets, phase queries and report JSON;
real solver responses are recorded once and replayed to compare report assembly.
The original `5f0fb47` comparison is retained separately.

The final focused integration run passed 46/46 with unchanged source/test inputs, including both baseline parity comparisons, protocol rejection, the six ownership regressions and the landed abort-frame checks. The earlier copy test attempted to structured-clone Acorn token functions and failed before the assertion; it now checks an unowned shallow copy. Combined full validation remains pending. No original roadmap acceptance
sentence is changed, and U is not yet marked integrated. The historical 496 and
C2a 510 results describe their own trees and are not combined validation here.
