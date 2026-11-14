# Caller-requested composition budgets

The public option boundary now accepts integer `timeoutMs` values through
180,000 ms. The default stays 10,000 ms, and the minimum stays 1 ms. CLI
`--timeout` uses that same API boundary. Implementation commit
`7feca2830d90e237227fc1522e77e1a11ce3abee` changes no query compiler,
solver policy, source contract, annotation, or proof domain.

This is a resource diagnosis and an option correction. The original
[60-second composition report](../library-composition/README.md) remains
historical ISSUES. A timeout is an unknown, not an unsafe verdict. The runs
below provide no speedup or general repeatability claim.

## Evidence and decision

The prepared parent is `2809e885ef01e09da906ddc31e070fde1df180a2`.
Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor, and
`verify/` exists. The checkout is
`/Users/rick/.t3/worktrees/verified-list-ui/t3-21fb6e7a`.

The parent regression in [parent-red.txt](parent-red.txt) fails at admission
in 1.233 ms with `Expected a timeoutMs integer between 1 and 60000.`
Its selected test requests a real proof through the public APIs. The failure
occurs before a solver starts. The whole test process takes 98.821 ms, excluding
the shared-lane queue. The root's existing 60-second result is preserved under
[root-60s/](root-60s/). Reverse is `unknown/request-timeout` on full-domain
postcondition 6 of 9, invariant preservation. Take is verified. The caller
remains `unknown/dependency`. This task did not repeat that 60-second run.

The hypotheses, in the order tested, were:

1. The unchanged scheduled query costs more than the admitted budget permits
   in some runs. Increasing only admission can allow the graph to finish.
2. Integration changed the query. Independent compilation would then produce
   different bytes from the successful second-obligations dump.
3. Shared scheduling or phase budgets are the limiter. The original deadline
   and initial target turns would then explain interruptions despite unchanged
   SMT bytes.

[parent-queries.json](parent-queries.json) compares actual production-generated
SMT strings with all 15 historical postcondition files. Every byte matches.
Reverse's invariant-preserve query has SHA-256
`a12952814fda3922e53008fb48b59c08f5fb2366c592ccdc4752cb7faf8726f1`.
[parent-inputs.json](parent-inputs.json) preserves exact sources, pinned upstream
metadata, package provenance, and the parent model manifest. The root's
independent hash comparison is also preserved.

The single informed experiment copies the parent's trusted verifier closure
into a private directory inside this checkout. It changes only the admission
ceiling and its error text in `index.mjs`. [scratch-change.json](scratch-change.json)
records the exact replacement, changed file, hashes, and private model identity.
It calls the actual private `verifyFile` API with one 180,000 ms request over
the unchanged three-module graph and a fresh cache. No backend answer or verdict
is substituted. A diagnostic IPC observer forwards all arguments and answers
unchanged. Its source hash is recorded separately from the verifier identity.

The scratch graph verifies all three targets in 33,149.001 ms, with three cold
solves and three receipts. Native execution passes 179 comparisons, including
signed zeros, NaNs, infinities, and array lengths through 1024. These finite
native samples do not establish the full-domain proof. The proof witnesses and
every full-domain solver answer are preserved in [scratch-ipc.json](scratch-ipc.json)
and [scratch-proof-receipts.json](scratch-proof-receipts.json).

The IPC trace distinguishes total time from query admission. Two workers start.
Reverse receives an initial turn of about 89,951 ms because three unfinished
targets need two rounds in two slots. Its invariant-preserve query receives
86,719 ms and returns unsat after 29,165.535 ms. Earlier Reverse phases consume
about 3.3 seconds. The 60-second request's initial turn would be about 30 seconds,
so that same uninterrupted sequence would exceed the first turn even though
the scratch graph finishes within 60 seconds overall. This is an inference
from the measured trace and unchanged scheduler, not a fresh 60-second trace.

The evidence supports admitting the caller's larger resource request and
retaining the existing scheduling policy. It does not prove that the invariant
query alone needs more than 60 seconds, distinguish every source of solver
variation, or establish future completion within 180 seconds. No further
annotation, seed, solver tactic, or standalone-query experiment was run.

## Budget ownership

`verify/index.mjs:options` is the only changed production resource boundary.
`Number.isInteger` still rejects NaN, infinities, fractions, strings, and null.
The same boundary validates `verify`, `verifyFile`, plans, and CLI requests.

`proofs.mjs:solve` creates one deadline for the whole selected graph, after
compilation and cache lookup. All target turns, startups, retries, and worker
replacements consume it. The fixed worker width remains at most two. Completed
phase evidence survives a timed turn. A larger budget also increases the first
turn; the scheduler itself is unchanged.

`backend.mjs:createBackend` uses the supplied remaining time for each startup
and query timer. Hard expiry rejects the active exchange. `proofs.mjs` awaits
`close()`, which kills and reaps the process before replacement or return.
`solver.mjs` subtracts SMT parsing time and its existing response allowance
before setting Z3's cooperative timeout. No phase has another 60-second ceiling.

Compilation, source loading, cache work, and JavaScript replay remain outside
the shared solver deadline. Each native VM invocation retains its 100 ms limit.
Replay-witness materialization retains `REPLAY_LIMIT = 256`; the symbolic native
array-length domain remains 0 through 4,294,967,295. Bounded witness searches
cannot establish proofs or vacuity. No admission change bypasses native replay,
cache identity, or final dependency gating.

The controlled deadline tests exercise 180,000 ms with virtual clocks and fired
timers. They do not sleep for three minutes. Public tests run actual API and
CLI proofs with the new maximum and check one-millisecond containment. The
focused boundary, deadline, cache, identity, and CLI checks pass 46/46.

## Current production evidence

[production-receipt.json](production-receipt.json) records the production API
at `7feca2830d90e237227fc1522e77e1a11ce3abee`, without the IPC observer.
The cold request verifies Reverse, take, and the caller in 36,139.707 ms,
with zero hits, three solves, and three written receipts. Warm replay verifies
all three in 94.800 ms with three hits and zero solves. The one independent
audit verifies all three in 35,429.267 ms, with three fresh solves, zero writes,
and no disagreements. Each request specifies one 180,000 ms solver budget.
Native execution again passes 179 comparisons. These are individual resource
observations. They provide no comparison benchmark or future completion bound.

[proof-comparison.json](proof-comparison.json) confirms equality beyond the
15 historical postcondition strings. All 36 planned phase queries, models,
and replay guards match the parent. The current graph and module hashes match
the root's timed-out graph. The graph SHA-256 is
`c59463e822bf9ad28cb373d08d2d36389d364573a4f7697f4c177e0311ad38e2`.
The private scratch model and production model identities are equal.

The parent model identity is
`13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106`.
The current model identity is
`09d21829d8ea449858782577b32ed5531b112b3fa2b9cfbe06ced64f767b28ef`.
Only `index.mjs` changes inside the trusted closure. `scope.json` records
policy-file hashes, ancestry, and the CPU/load samples taken during diagnosis.
The scratch sample shows one solver worker using about one core on the
10-core host. All heavy runs share the process-locked lane.

The maintained harmonic checker passes under the current model and preserves
fresh proof, cache, bug, native, and drift evidence under [harmonic/](harmonic/).
The total-return contract verifies over the existing dense finite positive
singleton domain. The positive-result contract has a confirmed counterexample:
input bits `0000001000008041`, decimal `3.3951948877e-313`, whose reciprocal
overflows to Infinity and whose harmonic mean is native `+0`.
Original, minimized, and relocated evidence replay reproduces. The weakened
annotation case also returns a confirmed counterexample in this run. No source
annotation was changed for the budget correction. The maintained checker still
records `qComplete: false`.

[harmonic-old-invalid.json](harmonic-old-invalid.json) records rejection of the
earlier throws-campaign artifact. The separate parent-model drift check targets
the numerical campaign's artifact with the exact parent identity above. Its
exact command and result are recorded under `parent-model-drift.*` and
`harmonic-parent-invalid.json`. Old receipts and bug artifacts are historical
evidence; the current campaign creates fresh proof receipts and bug evidence.

The final `make test-verify` run passes 483/483 on the same implementation
commit. [full-final.txt](full-final.txt) retains the actual classifications.
Its separate harmonic check returns `unknown/induction-gap` for the weak
annotation case. Existing K cases also retain induction gaps and explicit
60-second request timeouts. Neither the standalone counterexample nor the full
suite unknown is relabeled. The budget change gives callers another resource
option and does not remove these solver or induction limits.

## Rerunnable checks

Every heavy command runs through the shared solver lane. Each `*.run.json`
records the exact command, HEAD, tracked diff, exit status, and elapsed time
including queueing. Solver request timings are recorded separately. Raw logs
retain failures as well as successes.

From the checkout root, the maintained commands are:

```sh
python3 verify/reports/roadmap/composition-budget/run.py inspect-current node verify/reports/roadmap/composition-budget/check.mjs inspect
python3 verify/reports/roadmap/composition-budget/run.py production180 node verify/reports/roadmap/composition-budget/check.mjs production
python3 verify/reports/roadmap/composition-budget/run.py harmonic-current node verify/reports/roadmap/composition-budget/check.mjs harmonic
python3 verify/reports/roadmap/composition-budget/record.py --check
```

Solver commands require the repository's Node dependencies. This task used a
temporary `node_modules` symlink and removed it after all solver runs.
`record.py --check` checks evidence hashes and exact recorded verifier/test
input bytes without a solver or Node dependencies. It never admits a cache
receipt. `receipt.json` records the tested implementation commit. The later
evidence commit changes only this report directory. Only one final full suite
was run after the production and test files froze.

`production` uses a fresh cache and the production API without the diagnostic
observer. After a verified cold graph, it checks warm replay, then runs one
independent audit and asserts that audit does not write receipts. It records
actual unknowns as ISSUES and exits nonzero. Unknowns never become verified by
changing an expectation. `harmonic` rejects the historical bug artifact under
the current identity, then invokes the maintained harmonic checker.

The `scratch` mode is diagnostic and accepts the parent's original 60-second
admission line. It is not another production API or a source theorem. Its one
recorded run is preserved; running that mode after the correction fails its
parent-line assertion rather than silently changing another boundary.

The initial dependency setup pointed at a node_modules directory without Acorn.
The import failed with `ERR_MODULE_NOT_FOUND` before any request could run.
The link was corrected to the repository's existing dependencies before the
recorded parent regression. This setup failure is separate from the budget bug.

The first inventory-checker attempt also stopped on TAP's escaped `\#` in a
JSON diagnostic. `report-checker-initial.json` preserves that failure and the
following missing-inventory error. The checker now decodes the reporter escape
before reading diagnostics. Production files, test expectations, and the full
test log are unchanged.
