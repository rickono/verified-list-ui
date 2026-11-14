# R/S/T landing receipt

PR [#16](https://github.com/rickono/verified-list-ui/pull/16) merged at
`a60ae39abcaff2d6c49be39beb60e8a53409a19c` on 2026-11-14. Its feature head
is `057abaa37cb5a31a6db45e6e33bb72e31718c261`; its committed tested source
is `e1a76a3eed05674cee184c69ef15efae54bf3ad4`. No GitHub checks or required
reviews were pending at merge. The new receipt changes documentation only.

The [integration report](C2a-integration.md) assesses each original `doneWhen`.
The graph marks R/S/T integrated within that explicit first-layer domain:
EventTarget identity and disposal safety; scalar async interleaving and advisory
cancellation; and declared, replayable external outcomes and assumptions.
The original acceptance sentences have not changed. There is no hidden event
count in those proofs. Native search bounds affect counterexample discovery.

The corrected source passed one combined 510-test run. Eight binding checks
cover source/operation coupling, and four private operation mutations fail in
both the source and schema obligations. All 212 recorded source/test inputs
match the merged tree. The original native PASS and proof ISSUES reviews are
preserved: the coordinator corrected and tested the proof finding; the original
reviewer did not provide a new PASS on that correction.

The fresh ten-stage numerical campaign uses model `0a6c4292…` on the same
runtime. Harmonic and Ramda proofs and the real harmonic failure reproduce;
the old model's artifact is refused. Raw receipts and a rerunnable checker are
in [C2a integration evidence](C2a-integration-evidence/summary.json). Historical
390, 483 and 496 suites remain tied to their own trees. The 510 run does not
include the separate conditional-completion implementation.

U remains open because its plan can be rebuilt from modified compiled checks.
The next correction belongs at the producing compiler boundary, before the
consumer constructs a plan. V remains open: unchanged historical p-event
old/fixed code reproduces cleanup behavior natively, but both production APIs
reject the factory. Competing source-bridge designs are still being evaluated.
W depends on those maintained stateful proofs. EventEmitter semantics, general
Promise adoption, payloads, exact counts and wall-clock guarantees are outside
this landed subset.
