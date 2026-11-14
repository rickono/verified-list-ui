# Historical p-event issue7 regression

PASS for this narrow native regression pilot, measured on Node v22.23.1.
Production admission is **unsupported**, and no source proof is claimed.
The known defect reproduces in the old module and the historical fix passes.
This result makes no current-version, novelty, or roadmap-completion claim.

Measured checkout is `/Users/rick/.t3/worktrees/verified-list-ui/t3-42696d4c`.
The executed verifier snapshot is corrected C2a
`e1a76a3eed05674cee184c69ef15efae54bf3ad4`.
Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor, and `verify/`
exists. The coordinator full-suite result remains unknown here. This pilot
does not run that suite or change the canonical roadmap or decision trail.

Measured source pins for [upstream issue 7](https://github.com/sindresorhus/p-event/issues/7)
are parent `1674bd43fe7602d2f048d3d199be12d4ef16787c` and
[fix `da59143760a36bcf9e3f309609c2ddf33c27c8bd`](https://github.com/sindresorhus/p-event/commit/da59143760a36bcf9e3f309609c2ddf33c27c8bd).
Their unchanged `index.js` SHA-256 values are, respectively:

```text
ce6a001c40f13395cdb87a322c16e3a19f086498d74adadc4e89167f59a5affd
5a8c58248377106a9591233c97c17a521812c742ded80e22f2842ccf141364d4
```

Measured fidelity checks match all eight supplied source, test, package, and
license digests and both upstream metadata snapshots. Both package files say
1.3.0; commits distinguish the versions. [Provenance](provenance.json) retains
primary-source URLs and package, license, module, and tarball hashes.
The native dependency is the real published `p-timeout@1.1.1`, whose package
declares no runtime dependencies. Each native require cache contains only
the pinned p-event and p-timeout modules. Production admission uses private
`acorn@8.19.0`, also without runtime dependencies. Complete licensed tarballs
are included; every extracted member, registry SHA-1, and SHA-512 integrity
value was checked. [NOTICE](NOTICE.md) describes the pins.

Predicted expectations were frozen before execution in
[expectations.json](expectations.json), SHA-256
`2ef1d38ab326c7ab0d3a000cc8049b8125fc22bdc27ed4bab4ca37472cebe500`.
Measured [run evidence](evidence/run-01/summary.json) matches all four cases.
The timeout cases schedule the event at 200 ms and use the upstream 50 ms
timeout. Both await an actual pinned `TimeoutError` with the original message
`Promise timed out after 50 milliseconds`. Before any harness cleanup, the
upstream `emitter.listenerCount('🦄') === 0` assertion fails in the old version
with actual 1 and passes in the fixed version with actual 0. The old module
retains its exact registered event and error handler identities; the fixed
module retains neither. Thus the expected and observed managed counts after
timeout are old `(1, 1)` and fixed `(0, 0)` for event and error listeners.

Measured normal-success controls use the upstream 200 ms event and 250 ms
timeout. Both versions fulfill with `🌈` and remove both managed listeners,
as predicted. Before registration, total event/error counts are `(0, 1)`;
after registration they are `(1, 2)`. The extra error listener is caller-owned,
and its exact identity survives every awaited outcome. Each evidence file
records all stages and identity comparisons. The late event timer is cancelled
only after retaining the timeout assertion and observations. Harness cleanup
then removes exact remaining listener identities and the caller control.
The original AVA test files remain unchanged reference evidence; their full
suite and development dependencies are not executed.

Measured production results come from `verifyFile` and `checkStateful` on both
complete, unmodified pinned modules. All four results are `unsupported` at
line 1, column 1, half-open span `[0, 13)`, containing `'use strict';`:

- `verifyFile`: `Only ordinary top-level functions and const function expressions are supported.`
- `checkStateful`: `Unsupported stateful top-level ExpressionStatement.`

No source prefix was removed to get another result. No solver started, and no
handwritten equivalent, extracted proof, trusted dependency stub, weakened
admission, or production verifier change was introduced.
[Admission evidence](evidence/run-01/admission.json) preserves the complete
production reports and original spans.

Inferred admission gaps for later source work come from read-only inspection,
not separately reached production diagnostics. The smallest unchanged cleanup
assignment is `cancel = () => {...}`, span `[1068, 1243)`, line 50, column 3,
SHA-256 `88f006cbb7769ee739a48fea260e52ecc5a695265a85e736662e47ccfaebcc58`.
Its lexical context requires CommonJS dependency/export binding, Promise
construction with an executor, and mutable captures of `cancel`, options,
and bound emitter methods. The callback removes the event listener before
iterating over rejection listeners. Both event handlers invoke cleanup before
settlement. The fixed timeout branch catches rejection, checks the dependency's
TimeoutError constructor, invokes cleanup, and rethrows. These ordered effects
and exceptions exceed the documented current subset. Exact context spans are
preserved in the admission evidence. EventEmitter also lies outside C2a's
EventTarget protocol. No second semantic model was built.

Measured containment uses four isolated native subprocesses and one admission
subprocess through the prescribed shared serial lane. Each has a ten-second
hard deadline, exits 0 naturally, and has verified wait/reap, absent PID, and
absent process group. Deadline expiry was not exercised. The serial wrapper
also exits 0. [Cleanup evidence](evidence/run-01/cleanup.json) confirms private
dependencies were removed. Root dependencies and lockfiles were untouched;
no install or lifecycle script ran. Production runtime manifests before and
after match, and the diff outside this owned directory is empty.

Measured execution has no unexpected native result or harness failure. Preparation's
inaccessible web-tool fetch and unnecessary, never-executed p-finally fetch
are recorded in [preparation evidence](evidence/preparation.json). Exact entry
and child commands, stdout, stderr, expectations, source hashes, and process
receipts are retained. [commands.txt](commands.txt) gives the executed command
and offline rerun command; reruns require a new output directory.

These finite observations establish this historical regression reproduction.
They are neither universal safety proofs nor timer-precision measurements.
Production source proof remains unadmitted. V, R, S, T, U, and W completion and
the coordinator full-suite result remain unclaimed. No other target,
reentrancy expansion, upstream message, subagent, PR, push, merge, or watch is
part of this pilot.
