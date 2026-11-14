# Pinned Reverse and eager take composition

ISSUES for repeatability within the public API's budget. The whole composition
is verified, and the required negative controls fail closed. Some independent
audits remain unknown. No core correctness failure was established.

This report checks a three-module graph with the public `verifyFile` API.
TheAlgorithms Reverse mutates the caller's array, then Remeda eager take
returns its first two elements. The caller proves exact length and contents
relative to its entry array. K and Q completion remain owned by the coordinator.

## Reproduce the campaign

From a checkout with the repository's dependencies available, run:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/library-composition/check.mjs
```

The checker creates a fresh cache, runs the graph and controls, writes raw JSON
under `logs/campaign/run-*`, restores the source fixtures, and removes `.work/`.
Each graph verification has one 60,000 ms deadline shared by all targets and
obligations. This is the maximum accepted by the public API, within the
operator's 180,000 ms ceiling. Plans run without a solver. Audits re-solve the
whole graph and cannot change receipt files. The checker exits nonzero on a
missed acceptance assertion or a recorded resource limit. An unknown cannot
become a proof.

The historical `--resume-second` invocation adopted the already measured cold
second attempt after checking its graph hash and verification-model identity.
The ordinary command above always starts cold. Historical receipt files are
evidence, never an injected verdict or a substitute for a new cold proof.

`--continue-controls` is a historical continuation that checks the saved graph
and model identities, restores the original authentic receipts, and replays
them through the public API. It adopts already executed baseline and wrong-order
results, then runs the remaining controls. The earlier interrupted runs and
their assertions remain visible. Ordinary reproduction needs neither flag.

## Property and scope

`fixtures/gpl-3.0/caller.js` is authored glue:

```js
// modifies array
// ensures result.length === (array.length < 2 ? array.length : 2)
// ensures result.every((value, index) => Object.is(value, old(array.slice())[array.length - 1 - index]))
export const reverseFirstTwo = (array) => take(Reverse(array), 2);
```

Its `number[]` parameter has no length or finiteness precondition. Dense ordinary
numeric arrays include every native length, 0 through 4,294,967,295, and all
binary64 numbers. Contents use SameValue through `Object.is`: signed zeros are
distinct, infinities retain their signs, and NaNs compare equal. NaN payload
inspection is outside the model. Sparse arrays, proxies, accessors, extra
properties, custom prototypes, and species overrides are outside the domain.

The exact length gives both the input-length and two-element bounds. The
content clause reads `old(array.slice())` at caller entry, before Reverse can
write. `modifies array` covers Reverse's whole-array element footprint. Helpers
prove their own bodies; caller obligations use their summaries without body
inlining. Native tests also inspect full input reversal, fresh result identity,
unchanged input length, and absence of extra input properties. Those additional
native checks are finite comparisons, not extra proved caller postconditions.

Remeda's helper retains its existing `Number.isSafeInteger(n) && n >= 0`
precondition. The caller supplies 2. Every positive and negative scenario uses
the same explicit parameter types and requires clauses.

## Provenance and licenses

The checker calls the maintained Reverse annotation checker and Remeda's
pin/type-erasure adapter. It checks source bytes, extracted declarations,
runtime tokens, licenses, and the generated helper files. `provenance.json`
records all hashes, adapter hashes, source references, and module imports.
Original upstream files and metadata are reused without alteration:

| Helper | Pin | Raw source SHA-256 |
| --- | --- | --- |
| TheAlgorithms Reverse, GPL-3.0 | `636017ca51dad05339cde3b5c66cbe1d71957f7e` | `8049944060cfc7e8a3a95cc65f5e097ebb07469c5e8b871b678f151312e88e46` |
| Remeda eager take, MIT | `004b09194f6d39f727118c0a71adc9986bcc13e1` | `64ccd5ad15d4c387b2aa57cb6173a541b8bd79dcdfa06cc57e0136141e539bdf` |

The full upstream `take.ts` preserves its original runtime and type imports.
The selected eager declaration uses only its arguments and standard Array
operations, so its extracted module has no imports. This campaign does not
verify Remeda's overload dispatcher, lazy implementation, or their dependencies.
The report records the actual caller-to-helper import graph and every captured
package dependency in each source snapshot and API report.

The [fixture notice](fixtures/gpl-3.0/NOTICE.md), GPL license, and Remeda MIT
notice keep this aggregate in the report directory. Existing MIT and ISC
product examples receive no new files or edits.

## Initial attempt and informed retry

The first whole-graph request used the maintained Reverse annotations unchanged.
It timed out after 60,020.589 ms on full-domain postcondition 7 of 9, the rank
obligation. Take verified, and the caller's final status was `unknown/dependency`.
The report preserves that result, the initial sources, and all actual queries.
The first query-dump helper mistakenly treated the declaration string as an
array. Its error remains in the raw log. A corrected inspection dumped the
production obligations without running another solver.

That rank query retained floating-point finiteness checks for raw array length.
Two candidate expressions were compiled and inspected without solver runs.
`real(arr.length - i)` retained a floating-point rank comparison, as did
`real(arr.length + 0) - real(i)`. Both unrun query sets remain in `logs/`.

The single solver retry uses the authored proof-only rank
`real(arr.length - 0) - real(i)`. Subtracting zero is exact for every native
array length. The maintained numeric translator gives that signed-integer
expression an exact representation. This removes the pending rank's
floating-point conversion checks while preserving its value and entry replay
measure. No runtime token, function contract, precondition, or proof domain
changes. The selected actual queries are in `logs/second-obligations/`.

The retry verified Reverse, take, and the caller in 23,594.680 ms. This timing
is a resource observation, not a benchmark or speedup claim. No hand-solved SMT
result enters a verdict. The public API runs and replays every proof.

## Controls and trust

The campaign asserts the following outcomes and saves the actual reports:

| Control | Required result |
| --- | --- |
| Cold, warm, and fresh audit of unchanged graph | All three targets verified |
| Reverse the caller's call order | Confirmed contents failure; exact length still holds; native wrapper also fails |
| Delete only take's content guarantee | Helper bodies and native wrapper pass; caller is `unknown/contract-gap` |
| Seed Reverse's lost-temp store mutation | Changed helper cannot support a verified caller; final dependency gate blocks it |
| Plan each edit | No solver, pending states, honest affected targets and current graph hashes |
| Reuse the unchanged caller summary after a helper body edit | Its proof key may stay equal; final callee status still blocks verification |
| Warm negative cases | No failing or residual target becomes a cached proof |
| Replay bug evidence | Same graph reproduces; contract or source drift is stale |
| Restore the original graph | Three original receipts reusable after replay and gating |

Native workers import the real separate files through Node. The 179 samples
include empty and singleton arrays, every pair of twelve special numeric
values, odd and even lengths, and lengths 255, 256, 257, and 1024. Logs encode
numbers as binary64 hex to retain negative zero and nonfinite values. Samples
do not establish a universal result. The solver's bounded replay-witness
queries cannot establish a proof or vacuity; full-domain obligations do that.

The API reports list the trusted parser, type stripping, module snapshots,
source-to-SMT translation, exact specification replay, Z3 and its bindings,
JavaScript runtime, standard builtins, and heap replay membrane. Cache receipts
also trust their writers and integrity. They are not proof certificates.
Readonly mode does not authenticate receipts. Audit independently re-solves.

The unchanged pins are proof cases, not discovered upstream bugs. The changed
caller and helper are labeled seeded controls. A native failure is reported
only when the actual wrapper property fails. A contract gap or lost proof by
itself is not a software bug. This report provides no broader software-discovery,
security-testing, K-completion, or Q-completion claim.

## Measured results and predicted limits

The complete control receipt is
[`logs/campaign/run-XafdDE/receipt.json`](logs/campaign/run-XafdDE/receipt.json).
Some baseline and wrong-order records reference the earlier executed run;
`adoptedFrom` identifies those records. Timings below are measured graph request
times, not benchmark claims. Every solver request used 60,000 ms for the whole
graph.

| Check | Prediction | Measured |
| --- | --- | --- |
| First graph with original rank | Three verified | Reverse rank timeout, caller dependency, take verified; 60,020.589 ms |
| Single informed retry, cold | Three verified | Three verified; 23,594.680 ms |
| Warm baseline | Three hits and no solves | Three verified, three hits, zero solves; 82.225 ms in complete run |
| Baseline audit | Three fresh proofs | Three verified; 52,735.038 ms |
| Wrong-order caller | Length holds, content fails | Confirmed content-only counterexample; 6,263.607 ms; native 21 of 179 fail |
| Wrong-order warm and replay | Failure never cached; exact replay | Confirmed again in 4,481.881 ms; replay reproduced |
| Wrong-order audit | Confirmed caller, helpers verify | Caller confirmed; unchanged Reverse timed out on invariant preservation; 60,045.813 ms |
| Weaken only take content guarantee | Helpers verify, caller contract gap | Normal and warm return `unknown/contract-gap` in 7,808.570 and 7,801.456 ms; native 179 of 179 pass |
| Weak-contract audit | Same contract-gap classification | Reverse and caller timeout, take verified; 60,045.788 ms |
| Lost-temp helper, normal, warm, and audit | Failed helper blocks caller | Helper confirmed, caller `unknown/dependency` in 7,203.662, 7,244.392, and 7,152.507 ms; no failing receipt written |
| Restore graph | Original proofs reusable | Three verified hits, zero solves; 42.474 ms |
| Maintained pin and C1 guard checks | Pass | Four selected tests pass; no full suite or K corpus |

An earlier weak-contract request also timed out at 60,135.528 ms. It remains in
`logs/05-controls-continuation.log`. The two stopped owned-checker assertions
assumed those queries would finish within the cap. The corrected checker
records resource unknowns as ISSUES and continues independent controls. It
does not change any verifier verdict or function contract. The premise that
all these graph requests reliably finish within 60 seconds is contradicted by
the preserved runs. No further proof-annotation retry follows the single
informed retry.

The mutant caller's proof key stayed
`3cdb60cf480a2fdbbecaf255ccfa60a8fae4a7e8f8957032d5e65be6e04b4936`.
Its provisional receipt was a hit in normal, warm, and audit modes. The failed
current Reverse helper still blocked its final proof in every case. Contract
weakening changed both take's and the caller's keys. Plans left receipts
unchanged and reported provisional pending states. Bug replay reproduced exact
graphs and refused changed graphs as stale.

The exact four-element helper counterexample passes the wrapper's first-two
property, despite violating Reverse's full reversal contract. It is not a
confirmed caller bug at that witness. Independent native execution shows the
seeded wrapper actually fails on `[1, 2]`; 132 of the 179 samples fail for that
mutant. `check-witnesses.mjs` verifies this distinction against all three helper
reports and checks the wrong-order caller's exact witness. Its twelve native
executions pass in `logs/08-native-witnesses.json`.

## Checkout and evidence integrity

The prepared checkout is
`/Users/rick/.t3/worktrees/verified-list-ui/t3-c713e504`, branch
`t3/library-composition-proof`. Prepared HEAD was
`bd0d9570e8f910a8cf7db14cf517728ba3fd673e`, with C1 and main `41079c5`.
Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor, and
`verify/` exists. The six requested K commits were cherry-picked into this
branch with their original authors and patch identities. `imports.json` maps
each original to its imported commit. The imported code head is
`b5c8828f0c281df812751371f651603481f3aefb`. Artifact work is a separate commit.
C1's missing parsed-loop-spec guard and `compileAstUnit` entry remain intact.

`code-inputs.json` records every maintained verifier and test input hash.
`provenance.json` records pinned and generated source hashes. API reports record
module and graph hashes, model identity, backend package files, outcomes, and
budgets. `commands.json` includes failed setup and intermediate commands.
`SHA256SUMS` binds the report files. The imported standalone 418-test K receipt
and independent K reviews are separate; this report does not adopt their
results as new executions.

To check the committed evidence and unchanged core without solving:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- python3 verify/reports/roadmap/library-composition/record.py --check
```

`record.py` regenerates the owned inventory when invoked without `--check`.
The final receipt also records cleanup. The temporary dependency symlink and
campaign cache were removed, and no started solver or native worker remains.
