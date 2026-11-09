# Ready-now D implementation report

## Delivery

Acceptance is **partially met**. The conformance and mutation implementation is
delivered. The unchanged full baseline has three unresolved Remeda `unknown`
results. The final focused CLI regression and a second-seed standalone CLI run
both passed. No baseline assertion or proof domain was weakened.

- Checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-bfb414bd`.
- Branch: `t3/implement-ready-node-d`.
- Final local commit: the commit containing this report. Resolve its exact hash
  with `git log -1 --format=%H -- verify/reports/ready-D.md`.
- Expected baseline: `ff2518cd7494300084f2ab54da71f4d79185e586`.
  `git merge-base --is-ancestor` passed, `verify/source.mjs` existed, and the
  prepared worktree was clean before writes.
- No delegation, merge, push, publication, downstream implementation, dependency
  installation, or writes to the original source/coordinator checkout occurred.

## Implemented behavior and supported subset

`verify/conformance/corpus.mjs` builds 53 small fixtures with 565 expected
function outcomes and 643 native samples. The default seed is `1592643597`
(`0x5eedd00d`). Six seeded raw binary64 samples supplement explicit edge values;
this is a finite deterministic corpus, not arbitrary-program fuzzing.

Coverage includes all modeled binary numeric operators, unary operators,
numeric builtins/constants, composition and branch/block returns, optional
Boolean truth tables, undefined numeric coercions, indexing, numeric/Boolean
array copying and slicing, native `every`, record spread, absent versus own
undefined keys, literal-call parameter domains, guarded calls, opaque summaries,
module identities/aliases, helper edits, unused failing imports, and the public
verdict/replay/final-dependency policy. Seven deliberate source bugs produce
native-confirmed counterexamples. There are 16 expected counterexamples overall,
including call-domain/precondition failures and imported helper failures.

`runner.mjs` uses the public APIs, native ESM execution of the captured original
JavaScript, timed native contract evaluation, and separate small call-domain
oracles. It imports no compiler data/domain/replay helpers. Every reported
counterexample must reproduce; accepted results must have passing independent
native samples. The CLI emits source text, source hashes, import edges, explicit
assumptions, oracle provenance, seed/runtime metadata, native observations,
actual outcomes, and mutation results as JSON.

Concrete differential fixtures explicitly pin their test inputs. Universal
identity/copy fixtures retain their full input types. The 257-element negative
example detects a replay limit accidentally used as a proof bound. No verifier
input domain, proof bound, assertion, outcome vocabulary, or trusted axiom changed.
Fresh helper summaries remain opaque. Unknown/unsupported never count as verified.

## Observed mutation detections

All eight mutants first require passing unmodified controls. Each mutation is
applied once to a uniquely anchored site in an isolated temporary copy of the
six baseline verifier modules. Scratch copies and fixture files are removed.
Crashes, patch drift, and solver exhaustion cannot substitute for the required
specific behavioral discrepancy.

| Seeded verifier mistake | Observed mutant behavior |
| --- | --- |
| Addition translated as subtraction | `unknown/replay-mismatch` instead of verified |
| SameValue translated as numeric equality | `unknown/replay-mismatch` instead of verified |
| Default slice skips first element | `unknown/replay-mismatch` instead of verified |
| Spread ignores own undefined value | `unknown/replay-mismatch` instead of verified |
| Call obligations erased | `unknown/replay-mismatch` instead of confirmed call failure |
| Unconfirmed abstract bug accepted | Reports a counterexample that native execution does not reproduce |
| Final dependency gate erased | Reports verified despite an unknown final helper dependency |
| Replay limit added to proof queries | Reports verified; a native 257-element sample refutes the contract |

These are observed seeded failures, not discovered defects in the baseline
translator. Passing the corpus does not prove translator soundness. Frontend,
builtins, runtime, and solver remain trusted; there is no Rocq certificate.

## Checks and failures

Completed commands, all substantive solver suites through the provided lane:

1. `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify-conformance`
   Initial API-based suite: 3 passed, 0 failed. Observed 53 fixtures, 565 outcomes,
   643 native samples, 16 reproduced counterexamples, and 8 detected mutants.
2. `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify`
   Finished with **84 passed, 3 failed, 0 skipped** out of 87. The new corpus
   passed again. The failing existing tests were `remeda-calls.test.mjs`,
   `remeda-imports.test.mjs`, and the first test in `remeda-take.test.mjs`.
   Calls/imports explicitly returned `unknown` with
   `Wall-clock verification budget exhausted.` at their 60,000 ms budget.
   The take checker observed `[unknown, verified, counterexample]`; its assertion
   output did not preserve the first outcome's unknown reason.
3. `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/remeda-calls.test.mjs`
   Fresh isolated control: 0 passed, 1 failed. It reproduced the same explicit
   wall-clock exhaustion without executing the new corpus first.
4. `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify-conformance`
   Final suite after the CLI fix: **3 passed, 0 failed**, exit 0. This version
   runs the actual CLI with `--mutations`, parses the JSON, and checks the same
   53 fixtures, 565 outcomes, 643 native samples, 16 counterexamples, and 8 mutants.
5. `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/conformance/run.mjs --seed 1592643598 --mutations`
   **Passed**, exit 0. Parsed JSON has `failures: []`, the same fixture/function/
   sample/counterexample counts, and all 8 mutants detected under the second seed.
   Runtime: Node v22.23.1, V8 12.4.254.21-node.56. Raw evidence:
   `/tmp/ready-D-conformance-evidence-final.log`.
6. Anchored seed-only Node test and `node --check` checks passed. `git diff --check`
   is run again before commit.

The exact baseline comparison passed:

```sh
git diff --exit-code ff2518cd7494300084f2ab54da71f4d79185e586 -- \
  verify/index.mjs verify/source.mjs verify/data.mjs verify/modules.mjs \
  verify/solver.mjs verify/error.mjs verify/examples/remeda \
  tests/verify/remeda-calls.test.mjs tests/verify/remeda-imports.test.mjs \
  tests/verify/remeda-take.test.mjs
```

That establishes byte identity of the verifier and Remeda inputs/tests. Combined
with the fresh isolated timeout, this distinguishes existing resource failure
from a semantic change by D. The direct-prefix unknown is still unresolved;
this report does not infer an unobserved reason or claim an all-green baseline.
No failing baseline assertion was weakened and no additional proof bound was added.

The first standalone CLI run found a real defect in the new runner: dynamic
import of the mutation module during the CLI's top-level await formed an async
import cycle and exited 13 with Node's unsettled-top-level-await diagnostic.
Separating the reusable runner from the CLI removes that cycle. The focused
regression now invokes the actual CLI with `--mutations` and parses its JSON.
The final focused CLI regression and standalone second-seed command both
verified that fix, including successful JSON output and all mutation checks.

An early exploratory seed-only selector also matched the solver corpus. That
attempt briefly started solver work outside the lane and was stopped; no solver
child remained. It is not counted as passing evidence. The anchored selector
passed, and every completed solver suite/control used the serial lane.

## Integration and remaining limits

The existing `make test-verify` glob includes the focused tests.
`make test-verify-conformance` selects them alone. The README documents JSON
capture and seed selection; `verify/design/conformance-corpus.md` describes the
interface and trust decisions. No new package is required.

The mutation copy manifest intentionally lists the six current verifier modules.
When integration adds verifier modules or changes a mutation site, update that
manifest/anchor explicitly; drift fails rather than silently skipping detection.
The runner depends on the current public outcomes, source hashes, module edges,
and call diagnostics. It does not depend on another implementation agent's APIs
or claim to validate their unfinished semantics.

Native checks are finite. The independent call-violation oracle covers the
literal-call fixtures, not arbitrary dynamic call traces. New syntax, heap
identity, mutation, loops, higher-order functions, package/type resolution,
mathematical specifications, and alternate backends need their own executable
fixtures as they become supported. The three baseline Remeda failures remain a
material validation limitation. All test processes ended before handoff.
