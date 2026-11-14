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

The correction starts before planning. `machineOf` privately retains a
structural snapshot and an opaque identity for the parsed temporal machine. `transitionsOf` requires that original,
unchanged machine and seals its produced graph after all exits, rejection
segments and keeps units have been compiled. A private ownership table records
the graph and frontend identity. Only the producer can register this graph;
copying it and rebuilding a plan does not acquire ownership. Graph checks,
footprints, effects, parameter/result types and control metadata are immutable.
Map changes to the frontend data are detected even though freezing a Map would
not prevent `set`. Snapshot equality preserves signed zero and nonfinite Numbers,
Map/Set contents, parser prototypes and trusted parser-function references.
The conclusion compares actual bound data directly; digests identify transported
evidence and do not authorize changed structures.

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

The first focused integration run passed 46/46; a subsequent combined run on
`1f326fd` passed 530/530 with unchanged inputs. Those results do not certify the
later numerical provenance correction. One independent review delegate was
rejected by automatic safety review for possible cybersecurity risk. It produced
no completed review result. Its retained partial preflight revealed that JSON
hashing equated a source Literal `+0` with an edited `-0`. The changed machine
still acquired provenance. A coordinator regression reproduced that binding
failure before the correction. The rejected brief was not retried.

The correction removes JSON hashing from the frontend ownership decision, using
retained data and direct equality instead. The numeric-focused run passed 47/47,
including signed zero, infinities and NaN edits, both complete baseline parity
comparisons, protocol rejection, and the landed abort-frame checks. Its inputs
were unchanged. One earlier clone test failed on Acorn function tokens before
its assertion; that harness error remains separate. The new comparison retains
trusted function references rather than attempting to serialize parser code.

Final combined validation and the fresh current-model campaign are pending.
No original roadmap acceptance sentence is changed, and U is not yet marked
integrated. Historical 496, 510 and 530 results describe their own trees.

## Current validation and review scope

The first post-correction combined run on `776fa71` finished with 519 passes and
12 failures out of 531; no inputs changed. The next campaign was not started.
All failing outcomes were resource-related unknowns or mismatched unknown reasons;
the full log remains a failed run, not a pass. OS power logs record 68 Sleep,
67 DarkWake and one Wake event inside that run's interval, including clamshell
sleep and subsequent maintenance sleeps. Several individual tests with short
request budgets consumed many minutes. This is evidence of host suspension
contaminating wall-clock checks, not proof that every failure has that cause.
Targeted unchanged-budget rechecks and a clean combined run remain required.

The [completed standards/native review](review-completion-owned/standards-native/report.md)
passes its executed cases on `1f326fd`, with the original reviewer limits retained.
It does not cover `776fa71`. Its JSON/object-hook examples and the failed review's
partial signed-zero case explain why the coordinator removed JSON from the
ownership decision. New coordinator checks reject signed-zero substitution,
added `toJSON` and added function-valued control data before lowering. The hook
is never invoked. An initial coordinator hook probe selected an empty prefix
and failed before its assertion; that harness error is preserved separately.
There is no completed second proof-axis review: automatic safety review rejected
that delegate, and it was not retried. Historical source/native findings,
coordinator regression controls and the independent completed axis remain distinct.
