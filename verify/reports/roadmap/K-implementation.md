# Gate 3 implementation receipt

PASS for the owned Gate 3 implementation. K completion and publication belong
to the coordinator after independent review and integration.

The prepared checkout is `/Users/rick/.t3/worktrees/verified-list-ui/t3-c31012ad`,
branch `t3/implement-gate3-mutating-loops`. Its parent is
`dedde91b9f6e1fec3a30f5e39cae65f5381b6b26`. Baseline
`32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists.
The implementation reads the selected candidate `d9c22c63`, the independent
judgment `e581b413`, and the accepted Gate 2 consumer requirements. It imports
candidate A's fixed-point shape and fixtures, with attribution in the commit.
Candidate B's permission-frame havoc is excluded.

## Compiler behavior

`source.mjs` starts with an empty changing-location frame and existing scalar
optionality. Each real trial emits invariant initialization on the actual
pre-loop environment and heap. The compiler then calls `heap.loopHead` on that
heap and the derived locations, assumes the invariant, and evaluates the test,
body, and update. Normal back edges and `continue` include update effects.
False tests, `break`, and returns retain their exit heaps.

`heap.loopWrites(head, backs, exits)` audits every back edge and exit, including
return heaps. Only its checked back-edge locations grow the head frame. A new
location or optional scalar discards the trial and repeats. Each location has
a fixed pre-loop reference term, primitive sort, and field or elements kind.
The set can grow only over the finite source targets. Whole-array havoc uses
identity tests, so aliases share the new contents, including fresh allocations
made before the loop. A later loop starts a new audited interval at its own
pre-loop heap.

Every attempted store retains ordered `store-domain` and `frame-write` events.
Helper requires and frame inclusion stay before their postcondition facts.
Those facts cannot prove the helper's own safety or invariant initialization.
The store selects its index through the existing `data.index` callback boundary,
which keeps modulo bits private. Its original store-domain obligation still
establishes the native range before any store is admitted. `data.mjs` is unchanged.

The compiler rejects nested loops, runtime allocation in a repeated loop part,
reference-returning calls, transitively allocating runtime helpers, reference
stores, length or shape changes, and write
references that use trial-local symbols. Checks cover test and update expressions
as well as bodies and exit-only writes. Diagnostics carry source spans.
`old(xs.slice())[k]` still reads function entry. Callback-local index capture by
`old` remains unsupported. There is no quantifier-index binder graft.

## Trial ownership

The compiler creates separate declarations, events, dependencies, checks,
returns, probes, replay guards, pending facts, and loop metadata for each trial.
Function-summary maps and emitted-fact sets are copied. Their existing entries
are immutable. Successful trials publish those containers once and propagate
the specification reference counter.

The pre-loop states and the heap registry owner are shared. `heap.trial()` owns
the registry checkpoint. Rollback restores keys, field declarations, exactness
entries, assertions, roots, root types, and effects flags. It deletes content
provenance created by the discarded trial. A retained discarded state then
fails the unknown-version audit. The heap version counter never moves backward.
Fresh-name counters advance monotonically. No discarded-trial provenance survives. Earlier committed provenance stays
shared. Audits visit only the live state roots and their parents; provenance
records add no SMT facts. Registry containers emitted by `finish()` are restored
on rollback.

The shared module build cache contains immutable compiled callee targets, each
with its own heap owner. Building one speculatively adds no caller facts or
assumptions. A committed caller still publishes only its committed dependency
set and events. Source scope, parsed ASTs, types, and the function permission
frame are shared read-only. Source `specRefs` is a trial-local scalar whose
successful value is copied back. No discarded spec view reaches a final query.

The transaction test executes the first trial and observes both frame growth
and scalar widening. It compares the complete ordered committed queries after
alpha-renaming generated symbols with a private compiler seeded at the final
fixed point. Another test adds actual heap inputs and allocations, extra
registry fields, roots, assertions, and trial-local artifacts to that discarded
trial. The final queries remain identical. Disabling heap rollback is detected.
These controls use real compilation and heap operations, without a solver stub.

## Acceptance and limitations

The core code SHA is `bc9fec06ff535da4fa87012904775ec6eece2804`.
The final tested tree SHA is `00e5fc4244f6f756b045e2ea4b6af9ddaaf1715b`.
Its only change after the pilot is the numeric test admission oracle.
The final run passed 418/418 tests. `K-evidence/receipt.json` and `SHA256SUMS`
record input and raw-log hashes. `commands.json` records every executed command
with its expected and observed result. The public judgment corpus preserves the original sources and
independent native postconditions. Positive proofs, native-confirmed failures,
induction gaps, timeouts, and exclusions have separate expectations.

A native failure on a hand input does not turn an induction gap into a detected
bug. Optionality and whole-array havoc can require stronger invariants. A
quantified query that exhausts the 60,000 ms request budget stays unknown.
No replay materialization limit enters a full proof. Frontend translation,
numeric metadata, solver, and native replay retain their existing trust scope.
The numeric range argument is a trusted translation invariant, not a compiler
theorem. The accepted Gate 1 record still includes N12's unpinned timeout and
23 arithmetic-validity unknowns.

## Unchanged licensed pilot

`K-evidence/pilot` contains the original GPL-3.0 TheAlgorithms Reverse bytes,
license, and provenance. It is a report fixture, separate from MIT/ISC product
examples. The upstream commit is
`636017ca51dad05339cde3b5c66cbe1d71957f7e`; the file SHA-256 is
`8049944060cfc7e8a3a95cc65f5e097ebb07469c5e8b871b678f151312e88e46`.
The script checks file and declaration hashes, byte recovery after comment
insertion, complete token equality, and 11 independent native samples.

The production pilot and its lost-temp, short-bound, and over-swap mutants run
through public `verify()` with an explicit 60,000 ms budget each. The source is
not a rewritten kernel. No benchmark speedup is claimed. Historical short-bound
results remain a confirmed failure in candidate A's r2 run and a later timeout
in independent judgment. Both are retained; the mutant must never verify.

## Pilot execution

The production run at `bc9fec0` used the shared lane and passed its assertions.
These are correctness observations from one run, with no speed comparison.

| Variant | Expected | Observed | Native comparison |
| --- | --- | --- | --- |
| Unchanged upstream | verified | verified in 41,446 ms | 11 independent samples passed |
| Lost temporary | confirmed counterexample | confirmed in 41,859 ms | reversal failed, length 129 |
| Short bound | confirmed failure or honest timeout | confirmed in 39,275 ms | reversal failed, length 2 |
| Over swap | confirmed store-domain failure | confirmed in 2,599 ms | empty input changed length |

Each complete public request had 60,000 ms. Full results, source digests, the
budget, native witness checks, and upstream provenance are in
`K-evidence/pilot-results.json`. `K-evidence/smt` contains all 36 unchanged full
postcondition queries, nine for each source variant. No pilot query timed out
in this run. The historical short-bound timeout remains in the pilot README.

## Retained failed experiments

`commands.json` records the exact commands, exit statuses, observations, and raw
logs. `iterations/pre-diagnostic-core.patch` reproduces the early core from
`dedde91b` and matches the recorded source hashes. The first transaction test failed because its scratch import could not
resolve Acorn and its expected value retained a live registry array. A later
comparison failed because alpha-renaming operated on JSON text rather than
string values. Fixing those harness defects produced three passing real
transaction tests. The initial helper test expected a nonexistent `reason`
field despite a confirmed requires failure. Another expected the wrong name
for the existing dependency-violation outcome. Both test oracles were corrected.

The first pilot query dump found an implementation defect: source stores used
A's candidate-only `data.indexBits` export. That API is private in the accepted
numeric unit. The queued pilot runner was terminated before it acquired the
lane. Commit `bc9fec0` reuses `data.index` to select the store address, preserves
the original domain event, and adds a signed-metadata public regression. All
36 pilot queries then compiled, that regression passed, and the production
pilot passed. `data.mjs` was never edited.

## Full-run oracle correction

The first full invocation executed 418 tests, with 417 passing. Its only failure
was the Gate 1 test that still required a primitive write under `while (false)`
to be unsupported. That assertion described the old admission boundary. The
unchanged source now verifies, as Gate 3 permits. Its independent straight-line
wrapping-index domain check passed, as did the numeric width and range mutants.

The correction changes only that admission oracle. It retains the original
straight-line domain assertions, adds a reachable writing-loop wrapping-index
domain failure, and retains explicit rejection of allocation in a loop. The
input comparison in `K-evidence/test-only-correction.json` records exactly one
changed test file and zero changed core files. The earlier full log and frozen
input hashes remain in `full-before-oracle-update.tap` and
`inputs-before-oracle-update.json`. A second full invocation is required by this
new failure and test edit; the first invocation is not omitted from the receipt.

In the first full run, all 64 inherited public rows met their expectations:
15 verified, 27 replay-confirmed counterexamples, 13 induction gaps, one
request timeout, and eight explicit exclusions. The 43 judgment rows comprise
seven verified, 22 confirmed failures, ten induction gaps, and four exclusions.
Those ten gaps include H14's native-correct dead branch. The other nine have
native failures on hand inputs, but the verifier did not confirm those bugs.
The candidate timeout is the missing-suffix alias invariant at preservation.

All 96 added tests passed in that run. Five private compiler ownership mutants
were rejected at seven actual compile sites, including break and return heaps.
The existing six heap-boundary mutants also passed. The transaction control
removed rollback and detected leaked registry facts. The seeded conformance
campaign checked 574 functions, 667 native samples, and 20 counterexamples,
and detected all 12 semantic and verdict-policy mutants. These counts describe
executed controls, not 64 successful proofs or universal numeric validation.

## Final verification and cleanup

The final full test tree `00e5fc4` ran once after the oracle correction:

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify
```

It passed 418/418 tests, with zero failures, skips, or cancellations. It includes
all 96 added tests and the existing conformance, heap, arithmetic, project/cache,
and CLI checks. The final 64 public corpus outcomes comprise 15 verified,
26 confirmed counterexamples, 14 induction gaps, one request timeout, and eight
exclusions. H39's entry-old negative changed from a confirmed counterexample in
the earlier full run to an ensures induction gap in the final run. Both outcomes
remain recorded. The final gap is not presented as a detected bug. The production
pilot used the byte-identical core `bc9fec0`, with upstream verified and all three
mutants confirmed.

Both full invocations used the shared serial lane. No core edits occurred during
any run. The frozen final inputs match after execution. The only intervening
test edit is recorded in `test-only-correction.json`. `receipt.mjs` regenerates
the hash receipt and checks the frozen inputs, the 64-row count, and the untouched
numeric, P, canonical roadmap, and audit files:

```
node verify/reports/roadmap/K-evidence/receipt.mjs 00e5fc4
```

The initial receipt preparation expected the earlier run's outcome counts and
stopped when H39 changed class. `logs/receipt-first.log` retains that diagnostic.
The final receipt reads the actual final classifications. No code or test edit
followed that bookkeeping correction.

Raw TAP output and patch context retain their original whitespace. The code
and documentation diff check excludes those byte-preserved evidence files.

All owned exec sessions ended. No checkout solver worker remains. The temporary
read-only dependency symlink was removed; the shared dependency installation was
not edited. `cleanup.json` records those checks. No subagents, pushes, PRs,
merges, external messages, watches, or canonical roadmap/audit edits occurred.
Only local implementation and evidence commits are delivered. Independent
review and integration have not been performed by this implementation agent.
