# Executed commands

All commands ran in `/Users/rick/.t3/worktrees/verified-list-ui/t3-105287a3`.
Initial HEAD was `07c64858d3ecdce0eeee59c2439f07daf6449adc`. Initial status
was clean. `git merge-base --is-ancestor 32bd5b260aa116ca88642a1479bed8d3fc447f4b HEAD`
and `test -d verify` returned 0. Public `77c95f3` is an ancestor too.
No upstream source was fetched or executed.

The first temporary dependency link pointed to
`/Users/rick/verification-vibes/node_modules`, whose Acorn package is absent.
A frontend import probe failed with `ERR_MODULE_NOT_FOUND: acorn`. The link was
replaced with `/Users/rick/verification-vibes/verified-list-ui/node_modules`.
No dependency installation occurred. Node is v22.23.1, Acorn 8.19.0 and
z3-solver 5.3.3.

During construction, direct frontend-only compilation probes reported these
errors before the first solver run: unconditional generated trailing return
was unreachable; specification replay had no `StatefulProjection`; the new
transitions module missed its `references` import; a bare source return needed
the C1 undefined-return normalization. Each was corrected before proving.
Those probes ran `node --input-type=module` over the two retained fixtures,
`machineOf` and `transitionsOf`. They did not execute a solver or assert a proof.

The following solver/native runs used the shared serial wrapper. Source was
frozen during every run, including queue waits. The shell redirected stdout
and stderr to the named `.log` file; committed copies use `.log.txt`.

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/C2a-evidence/prove.mjs verify/reports/roadmap/C2a-evidence/prove-first.json
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/C2a-evidence/native-probe.mjs verify/reports/roadmap/C2a-evidence/native-first.json
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/C2a-evidence/native-probe.mjs verify/reports/roadmap/C2a-evidence/native-second.json
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/stateful-protocols.test.mjs
```

`prove-first` exited 0, with 38/38 listener and 34/34 advisory targets verified.
`native-first` exited 0 as a recording probe, but recorded advisory
`unknown/replay-runtime: Super constructor null of AbortSignal is not a constructor`.
The native-class hardener had erased AbortSignal's superclass link. The second
native run restored that link and recorded both fixtures `ok`; listener callback
cuts were 2, 1, 0 and guarded late advisory fulfillment left `shown=0`.
These logs remain distinct.

The first focused test command was terminated with SIGTERM while still waiting
for the shared lane, exit 143. Its log contains only the wait announcement;
no test ran. `focused-first.sources.tar.gz` and its hash manifest preserve that
queued tree. The next invocation uses `focused-second.*` snapshots and logs.

`focused-second` was also terminated while waiting for the lane, exit 143,
before any test started. Static inspection found that a source-only abort or
constructor could lose its derived effect after scalar lowering. Source action
metadata now derives writes/reads/allocation through the shared compiler
boundary. A regression checks both effects. Neither queued cancellation is a
test pass or failure.

Executed focused outcomes, with sources frozen and archived:

| Log prefix | Actual command after the serial wrapper | Exit and result |
| --- | --- | --- |
| `focused-third` | `node --test --test-concurrency=1 tests/verify/stateful-protocols.test.mjs` | 1, 12/13; wrong fractional-state expectation retained |
| `focused-fourth` | `node --test --test-concurrency=1 tests/verify/stateful-*.test.mjs` | 0, 64/64; includes both exact-parent regressions |
| `fp-before` | `node verify/reports/roadmap/C2a-evidence/fp-probe.mjs verify/reports/roadmap/C2a-evidence/fp-before.json` | 0 recording probe; observed quiet NaN payload loss |
| `focused-final` | `node --test --test-concurrency=1 tests/verify/stateful-protocols.test.mjs` | 0, 15/15, including byte-preserving transport |
| `return-before` | `node verify/reports/roadmap/C2a-evidence/return-probe.mjs verify/reports/roadmap/C2a-evidence/return-before.json` | 0 recording probe; wrongly accepted requested remover on early return |
| `return-fix-focused` | `node --test --test-concurrency=1 tests/verify/stateful-protocols.test.mjs` | 0, 16/16; early return is illegal only when a missing handle is requested |

`fp-before` used the `focused-fourth` runtime, and `return-before` used committed
`78d4e14`. Exact application sources and hashes are included in their JSON.
The early native/proof dependency snapshots are explicitly labelled
reconstructions from the earliest captured source and the recorded tiny
corrective deltas. `early-snapshots.py` regenerates their manifests and archives;
the labels do not imply an earlier live snapshot was taken.

Final driver command, invoked through the serial wrapper:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- python3 verify/reports/roadmap/C2a-evidence/run-final.py
```

The driver executes proof capture, direct native controls, FP-bit recording,
exact baseline query comparison, then `make test-verify`. Its first invocation
on `78d4e14` passed 387/387. The final invocation also includes the corrected
return recording, and runs on `7be8658`. Exact child commands and exit codes are
in `final-commands-first.json` and `final-commands.json`. The second full run is
required by the actual returned-handle boundary fix, not a retry of passing code.

The second full invocation on `7be8658` passed 388/388. Source inspection then
found a missing stutter obligation for protocol modules with neither listeners
nor a rejection marker. The historical probe was cancelled while queued,
exit 143, before executing. The final `stutter-control.json` instead records a
private deletion control on the final source: every remaining VC verifies,
while a legal native abort violates the stated non-reflexive `always` property.
Production requires the stutter unit and returns unknown for that weak model.
This is not an executed old-verifier result.

A third final request was also cancelled while queued before any command ran,
exit 143. The standalone constructor admission correction was made before
requeuing. `final-third-queued.log.txt` and `final-third.*` retain that state.
The final driver on `c1df5f6` first runs all protocol-focused tests, followed by
the proof/native/bit/return/baseline/stutter controls and the final full suite.
No core edits occur while that driver is queued or active.


Final executed outcomes on `c1df5f6`: 18/18 protocol-focused tests, 38/38
listener and 34/34 advisory proof units, all native/transport/domain/private
stutter controls, exact public-main compiler/query parity, and 390/390 full
verifier tests passed. The driver and every child exited 0. `full-final.log.txt`
is the final combined run; `full-before-return.log.txt` and
`full-before-stutter.log.txt` retain the earlier 387/387 and 388/388 full runs.
No core source changed during or after this final execution.

The temporary dependency link was used only for these local runs and is removed
at handoff. To reproduce with the same installed dependencies, temporarily link
`node_modules` to `/Users/rick/verification-vibes/verified-list-ui/node_modules`,
run the recorded serial command, then remove that link. `inputs.json` records
versions, resolved package manifests, contract hashes and the wrapper hash.
No dependency installation or upstream fetch was performed.
