# Conditional per-invocation completion implementation

**PASS for this implementation slice.** The final focused pass is **61/61**,
and the frozen full verifier suite is **496/496**, with no failures, skips, or
cancellations. Independent review and coordinator integration remain required.
This makes no U, R, S, T, V, or W completion claim.

The only repository write target is
`/Users/rick/.t3/worktrees/verified-list-ui/t3-64551363`.
The checkout started clean at prepared coordinator HEAD
`5f0fb47a0a822d62537f296ef804d5037eebba5c`.
Executed ancestry checks confirm
`32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists.
Implementation and acceptance fixtures are frozen in local commit
`20ff20556fe19a72f73ccf3708d7bd7329ec2bc0`.
The full run uses that commit. Focused runs use its recorded working source
snapshots on prepared HEAD. Their receipts distinguish these identities.

Read-only design inputs were common.md and next-wave-completion.md from
`/Users/rick/verification-vibes/artifacts/roadmap-20261113/`, the current
conditional-completion design, the entire independent judgment, and the
candidate packages read with `git show` at immutable commits
`13672f7c11c8dd5849ec550fe43f3a226252f453` and
`51a8bb6b3ae0897b242fa5781ac003796cc85a5a`.
Those prototypes' results are inherited design evidence. They were not
re-executed or presented as production completion proofs. The judgment's
original tip is `357635ce1e5d123ef78fd840c42caabd133c0b52`.
No subagents, upstream messages, PRs, pushes, merges, watches, or canonical
roadmap/audit edits were used. Pstack settings were absent.

## Delivered behavior

The existing `checkStateful(file, source, options)` admits exactly
`leads <entry> completes` and an optional `fairness resumptions weak` request.
It returns separate safety and completion records. Aggregate verification
requires safety, the closed source manifest, all temporal queries, viable
outcome domains, and the required per-request settlement premises.
Unsupported goals, reserved temporal prose, misspellings, confusables, case,
punctuation, block clauses, misplaced clauses, and unknown lines in attached
temporal blocks fail at original source spans. Alternate scheduler or protocol
options are unsupported. C2a is not a dependency and has no temporal discharge.

`source.mjs` emits opt-in control metadata from its actual guarded return paths.
The existing compiler evaluates source expressions, writes, return expressions,
and request captures once. Original source returns and compiler-generated wait
and fallthrough exits retain their spans. One source return can have several
compiler paths. Coverage checks every path and every original return span.
Zero awaits, empty prefixes/bodies, nested tail returns, all-tail branches,
normal fallthrough, and per-site declared rejection have explicit coverage.
Unsupported loops, helpers, Promise adoption, handlers, and allocation effects
do not become segment-totality assumptions.

For an entry with `m` awaits, the birth ordinal is `m + 1`, waiting at zero-based
site `j` has ordinal `m - j`, and only post-terminal control has ordinal zero.
The call executes the first segment. Settlement and the following segment are
one C1 action. Every actual exit carries a nonnegativity check and an own-step
check using existing `specifications.rankDecrease` on exact literals. Even a
constant-folded `true` remains an explicit solver obligation on that segment's
target, with its guarded source exit and query hash. No neighboring constant
function or alternative evaluator supplies progress.

The private `stateful/temporal.mjs` owner reconstructs expected coverage from
Machine's entries and awaits. Its manifest includes init, safety steps,
creation, deletion, own progress, nonnegative ranks, all interference cases,
pending keeps, identity aliases, terminal equivalence, totality, outcome
viability, and the native profile. Missing rows, source units, compiler checks,
identity frames, or changed queries prevent verification independently of
safety. Source, executable, assumptions, implementation files, runtime, rule,
profile, goals, source exits, safety units, and temporal queries are bound by
hashes. These private records are not a public proof-import or cache interface.

Identity-frame evidence is structural. The compiler checks that inputs and
outputs contain scalar data and that write footprints name only the state
record. Application source cannot represent or write invocation control or
request ownership. For every observed waiting location, the manifest enumerates
the owning actor and all distinct-actor cases across entry, resolve, reject,
creation, and deletion. Existing pending keeps cover arbitrary other pending
representatives. The trusted finite-control rule uses that separation to derive
rank nonincrease; it does not assume a caller-supplied `nextRank = rank` relation.

## Correspondence, premises, and trust

The native owner consumes the same fixed C1 profile used in the manifest:
`microtaskMode: "afterEvaluate"` and an explicit timed `void 0;` drain.
Only after compiler totality, exit coverage, and the closed manifest pass can
the rule discharge same-action resumption. Manifest `checked` rows denote
structural checks; solver results and goal-level premise classifications
record the separate discharge gate. `fairness resumptions weak` requests
this check. It does not assume a second settlement guarantee.

Per-reached-request `settles eventually`, a continuing runtime, and total
declared environment calls remain assumptions. Usage classifications are
`assumed-used`, `assumed-unused`, `discharged-used`, `discharged-unused`, and
`missing`. Unused declarations remain unused. A missing settlement premise
produces a symbolic `liveness-gap`, with `nativeConfirmed: false`.

Request viability is a guarded existential over the complete declared boolean
or binary64 result domain, compiled with the existing expression compiler and
the actual captured request arguments. It includes resolves definedness and
the union with declared rejection. It does not assume the request's own
resolves predicate or resume postconditions. No finite sample establishes
existence. False and partial domains stay unknown for completion. A partial
operation called only on a proved legal argument can pass. A declared rejection
can make the domain viable even when resolution is impossible. A vacuous
resolution target in that case represents an impossible legal resolution;
creation viability and the real rejection terminal are still required.

The rule fixes an arbitrary born invocation. Other actions preserve its
source-control ordinal. If it stays live, it waits at a reached viable request.
Eventual settlement and the total same-action continuation force another drop
of at least one. A nonnegative integer cannot sustain those drops forever.
Zero awaits terminate inside the call. This is an inferred theorem over the
admitted C1 source/profile and explicit premises, supported by the executed
compiler/solver obligations. It is not an independently checked proof kernel.

The trusted components include the frontend and binding rewrites, the existing
body/heap/FP64 compiler, the new manifest/frame/profile rule, Z3 including
quantified outcome queries, standard builtins, and Node's Promise/VM behavior.
Quantified viability can remain unknown. Existing compiler source-path limits
remain fail-closed admission limits. No event limit, invocation pool size,
application Number counter, finite identity vector, or global rank sum occurs
in the completion proof. Repeated calls and time stuttering are allowed.
No assumption excludes future arrivals.

Temporal native replay adds BigInt-generated invocation occurrence IDs and
request ownership observations without rewriting entry bodies. Source Numbers
remain binary64. Legacy finite request transport still uses safe-integer
request indices. Native execution and finite witness search are evidence, not
the proof's identity domain. The existing finite BFS's numeric samples,
depth, and 5,000-execution budget remain disclosed in non-verified safety
search reports. Neither those bounds nor finite replay enter the theorem.

There is no checked infinite-word realizability certificate. Every completion
record has `nativeConfirmed: false`. A pending prefix, a timeout, an exhausted
search, or a hand-written lasso confirms no infinite bug. Completion promises
normal return, including suppressed writes, or declared rejection. It does not
promise success, publication, global draining, uniqueness of application IDs,
or arbitrary JavaScript liveness.

## Executed acceptance evidence

All solver work uses the prescribed process-locked lane. Node is `v22.23.1`,
Acorn is `8.19.0`, and z3-solver is `5.3.3`.
The [evidence directory](conditional-completion-evidence/) contains exact
commands, receipts, test/source hashes, full logs, reports, native observations,
compiled targets, source manifests, and query hashes. Each receipt checks that
core and fixture bytes stayed unchanged throughout its run.

| Case | Expected and measured in final focused pass |
| --- | --- |
| Zero, one, two awaits | Safety and completion verified |
| Empty body/prefix, branching prefix, all-tail branches | Verified with positive live ordinal and terminal zero |
| Two async entries plus a synchronous entry | All goals verified, arbitrary other-entry interference covered |
| Two-await native sequence | `init/call/resolve/resolve`, `n = 0/0/1/2`, returned terminal |
| Nested suppressed tail | Returned terminal, `n = 1`, later write skipped |
| First-request declared rejection | Rejection terminal, `n = 0`, no second request |
| Boolean and correlated numeric outcomes | Verified over complete domains |
| False resolves, no rejection | Safety verified with vacuous resume; completion unknown/outcome-viability |
| Partial resolves over unrestricted request argument | Safety verified; completion unknown/outcome-viability |
| Partial operation called with legal constant argument | Verified |
| `result > 0` | Verified; native 0 illegal, native 1 returns |
| False resolves plus declared rejection | Verified rejection-only completion |
| Missing settlement | Safety verified; symbolic liveness-gap, nativeConfirmed false |
| Missing progress/interference/keeps/alias/totality/init/creation/deletion/exit rows | Completion blocked while safety remains verified |
| Missing compiled progress/identity-frame/step/rejection/keeps | Completion blocked |
| Stalling and half-unit rank mutations on actual segment exits | Own-progress counterexamples via existing rankDecrease |
| Wrong `always` | Native finite safety counterexample; completion unknown |
| Wrong safety with maxDepth 0 | Unknown/induction-gap; completion unknown |
| One-ms timeout | Unknown/solver; completion unknown |
| Unsupported scheduler, protocol, grammar, loops, effects, helpers, adoption | Unsupported at source spans |
| Two calls at source Number saturation | Source latest equals 2^53; invocation and request owners remain distinct |
| `result > k` at 2^53 | Native finite contract counterexample |
| `result === k + 1` at 2^53 | Verified because the specification addition also rounds |

Prepared-HEAD parity covers 11 default example compilations and 12 admitted
legacy C1 fixtures. Complete compiled artifacts and every phase query match
byte for byte. Four complete reports match under identical recorded real
solver responses, and two native reports/cuts match. The disposable parity
copies alone contain a solver-response recorder. Production has no injection
option. Existing C1 and synchronous regression tests remain unchanged.

The initial attempt to compare separate live reports failed because their
arbitrary feasibility witnesses differed with backend worker history, despite
identical queries. That raw failure remains in focused-1. The final comparator
checks report bytes with identical actual solver inputs/responses and checks
all full-domain phase queries separately. It does not claim that independently
scheduled solver runs choose byte-identical arbitrary models.

Focused run history is preserved without rewriting failed expectations:

- `focused-1/run.txt`: 54/60 passed. It exposed duplicate compiler paths at one
  original return span, the live-model parity issue, a test accessor mistake
  for synchronous reports, and incompatible fairness diagnostic wording.
- `focused-2/run.txt`: 60/60 passed after those corrections.
- `focused-final/run.txt`: 61/61 passed after adding branching/multiple-async
  coverage and explicit compiler identity-frame checks.
- `full-final/run.txt`: 496/496 passed, exit 0, with core and fixtures unchanged.
  This includes existing C1, K, guarded-throws, P/cache, CLI, and default-module
  regression tests. Expected unknown/induction-gap outcomes remain unknown.

The exact final focused command is:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- python3 verify/reports/roadmap/conditional-completion-evidence/capture.py focused-final -- node --test --test-concurrency=1 tests/verify/conditional-completion-grammar.test.mjs tests/verify/conditional-completion.test.mjs tests/verify/conditional-completion-parity.test.mjs tests/verify/stateful-frontend.test.mjs tests/verify/stateful-boundaries.test.mjs tests/verify/stateful-transitions.test.mjs tests/verify/stateful-outcomes.test.mjs tests/verify/stateful-replay.test.mjs
```

The full final command is:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- python3 verify/reports/roadmap/conditional-completion-evidence/capture.py full-final -- node --test --test-concurrency=1 tests/verify/*.test.mjs
```

The labels are immutable run directories. Use a fresh label to reproduce a run.
`receipt.json` records the expanded command and every source/test SHA-256.
The temporary `node_modules` link points to the existing dependency installation
and is removed before final handoff. The final audit checks all 38 directly
recorded source/test hashes against the implementation commit, every recorded
public report control, native two-await observations, and process cleanup.
`implementation-tree.txt` records all committed verifier/test blob identities,
including pinned source fixtures. `validation.json` also records the complete
installed Acorn/Z3 dependency file hashes and confirms no owned solver, replay,
or test process remains. Only report/evidence artifacts follow the frozen
implementation commit. The checkout is committed and clean at handoff.

The static artifact audit commands are:

```sh
python3 verify/reports/roadmap/conditional-completion-evidence/audit.py --write
python3 verify/reports/roadmap/conditional-completion-evidence/audit.py
```

The audit uses installed local dependencies, or `COMPLETION_PROBE_DEPS` when
provided, with the existing shared installation as the local fallback. It
does not run a solver. `SHA256SUMS` binds final source, tests, reports, and logs.
Core and fixtures remain identical to the full-run implementation commit.

The source/test diff passes `git diff --check`. The first failed TAP log
contains whitespace-only diagnostic lines emitted by Node. The all-artifact
format check reported those lines; the raw log is preserved byte for byte.
The exact commands and results are in `conditional-completion-evidence/format-check.json`.
