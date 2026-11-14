# Pinned library campaign report

PASS for this package's scope. The complete maintained checker passed at tested
head `42567fc7b286e2a8e838279396fcb444e1118253` on 2026-11-13, America/Chicago.
The UTC run timestamps are on November 14. Independent review, K completion,
Q completion, and publication remain coordinator-owned.

The checkout is `/Users/rick/.t3/worktrees/verified-list-ui/t3-a21ee524`.
Prepared parent `203ad818169be544432b3bad93ff1c4f01ef20a3` contains the combined
C1, K, and guarded-throw runtime. Its production modules match
`f974b30da4efcf16b69df889b909975e3321dcb2`. Baseline
`32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists.
Only this new package changed. There are no C2 production changes.

The runner, pins, and local bug notes landed in
`cf7c183a6cefcf14742738bc11e21a695f99cb67`. Commit `42567fc` preserves the first
attempt and fixes its diagnostic binding. The later receipt commit adds only
evidence and documentation. [manifest.json](manifest.json) records the code,
source, license, provenance, model, budgets, and artifact hashes.

The complete executed command was:

```sh
node verify/reports/roadmap/library-campaigns/check.mjs verify/reports/roadmap/library-campaigns/evidence/03-final
```

The launcher placed the campaign in the shared serial lane. Exact resolved
arguments, raw stdout and stderr, process status, and nested native and CLI
commands are in [run.json](evidence/03-final/run.json). Each public proof request
had 60,000 ms. Native finite controls had 10,000 ms, CLI replay had 15,000 ms,
and the unsupported d3 API request had 1,000 ms. The outer guard was 600,000 ms.
No full suite or benchmark ran.

| Artifact or claim | Actual result | Classification and scope |
| --- | --- | --- |
| Harmonic total-return contract | verified | Universal proof over every dense finite positive singleton, with checked termination and unreachable throws |
| Harmonic `result > 0` | confirmed counterexample, native `+0` | Solver-confirmed failure in unchanged source; fresh P evidence, API and CLI reproduction |
| Harmonic weak accumulator invariant | unknown, induction-gap at ensures | No positivity proof or newly detected bug follows from this final query |
| Ramda eager `findIndex` | verified | Universal bounds, match, first-match order, absence, and termination theorem in the admitted callback domain |
| Ramda off-by-one and skipped-first mutants | two native-confirmed counterexamples | Seeded negative controls, excluded from real-bug counts |
| d3 adjacent interval, counts 1 and 5000 | both returned `[0.93, 0.93]`, failing coverage | Independent native reproducer on pinned unchanged modules |
| d3 documented example and issue-282 input | `[0, 10]`; coverage holds on the fixed issue-282 input | Finite controls; the fixed input is excluded from failures |
| Two unchanged native d3 cycle inputs | no return before each 2,000 ms subprocess timeout; `SIGKILL`, waited, PID absent | Observed timeouts, classified unknown; neither is a verified result |
| Two instrumented d3 cycle diagnostics | full state first at iteration 2, repeated at 4, period 2 | Finite control plus a separate conditional pure-state cycle argument |
| Unchanged d3 source graph | unsupported at `ticks.js:1`, span `[0, 73)` | Top-level numeric constants violate the current ordinary-function-only boundary; no solver ran |

Harmonic evidence is under [harmonic/](evidence/03-final/harmonic/). Both strong
contracts have the same finite-positive-singleton preconditions, integer index
bounds, exact-real decreases expression, and accumulator invariant. There is no
fixed input or reciprocal-finiteness precondition. Removing annotations recovers
the original source bytes, runtime tokens, and export, with its ISC license.

The solver witness is `3.3951948877e-313`, bits `0000001000008041`.
Its reciprocal is Infinity and the native result is `+0`, bits
`0000000000000000`. Independent subprocess imports also confirm `+0` for
`Number.MIN_VALUE` and `2 ** -1024`. The smallest positive normal round-trips.
Input 49 returns one ulp higher and is not the reported defect. Empty, zero,
negative, and documented `[2, 3]` controls retain their original behavior.

The fresh P identity is
`13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106`.
The source-graph digest is
`48f186e1e6a863fc581597ff8f49aba20831ad1e474567773caa457170c70469`.
Original, preferred, and relocated witnesses reproduced. The total proof wrote
one positive receipt and the warm request used one hit without solving. The bug
wrote no proof receipt. Changed source returned `stale`; a changed model identity
returned `invalid-evidence`. The first run's weak variant produced a genuine
native-confirmed counterexample; the final run returned an induction gap. Both
raw reports remain. Neither weak result is relabeled as a proof.

[Ramda's report](evidence/03-final/ramda/upstream.report.json) concerns the exact
174-byte eager declaration from v0.30.1 at
`980b3bf7712adb8ad8b5d9b2c6aca525cb3cf143`, under MIT. Currying, dispatch, and
transducers are excluded. The callback domain is pure total unary numeric
predicates returning a present Boolean, without effects, exceptions, or NaN
payload inspection. The proof has no added array-length or predicate-table bound.
The retained 42 native comparisons are finite controls. The original callback
and first-match contract, extraction checks, and mutant replay all come from the
current public maintained checker. No trivial negate theorem substitutes for it.

d3-array 3.2.5 is pinned to
`24c015e4d894ee44af6cf6a2cc9e300b1885b0d9`. Source and ISC license bytes match
the independently validated package at `a83f50762005ae47edfe3e07295f3840b485687b`.
The published interval-coverage contract and documentation digest are inherited
provenance, checked locally with `git show`. All native observations above are
fresh. The [cycle diagnostic](evidence/03-final/d3-cycle-diagnostic.json) binds the
real pinned `tickIncrement` to the original loop body with one trace hook. Under
pure deterministic builtins, the repeated full state implies repeated execution.
That argument is separate from the observed timeouts and from the unsupported
source-verifier result. No supported kernel, patched production module, or
unchanged-source verifier proof of `nice` is substituted.

Es-toolkit evidence is inherited and was not rerun. Its pinned checker establishes
only empty-input `sum` returning `+0` and `mean` returning NaN, with termination.
It supplies no general summation or concatenation law in this campaign.

The first full attempt in [02-campaign](evidence/02-campaign/) failed because the
diagnostic function wrapper retained an ES-module import. Its other proof and
native checks passed. The corrected final run passed every stage.
An auxiliary drift-control attempt in [04-drift-controls](evidence/04-drift-controls/)
expired while waiting for the shared lane, before Node ran. Its raw nonpassing
result and a correction of its premature explanatory field remain. The successful
[05-drift-controls](evidence/05-drift-controls/result.json) directly exercised the
lightweight hash gate on temporary copies: changed source bytes and changed
provenance both refused before semantic imports or any solver. Those finite
hash-only controls are not CPU-heavy verification runs. Their copies were removed.
The retained [inventory setup failure](evidence/06-integrity-setup/failure.json)
expected 11 stages instead of the actual 10. The corrected inventory checks the
passing list without changing any verifier result.

The final run preserved the hashes of all 825 prepared files before and after.
Production source and the lockfile stayed byte-identical to the prepared parent.
The process group was empty after the campaign, native children were killed and
waited, and the temporary dependency link was removed. See
[cleanup.json](cleanup.json) and [integrity.json](integrity.json).

The frontend, binary64 translation, loop abstraction, exact specification replay,
Z3/WASM, Node, and unmodified builtins remain trusted. Receipts require trusted
writers and are not certificates. Static query plans are retained inputs, not
solver transcripts. Native replay confirms individual witnesses. This report
claims neither arbitrary-JavaScript completeness nor novelty, current-main
status, upstream acknowledgement, or a fix. [bugs.md](bugs.md) contains the local
minimal-input bug reports. No external messages, pushes, PRs, merges, watches,
canonical roadmap edits, or production verifier edits occurred.
