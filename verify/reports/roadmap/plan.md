# Remaining verifier roadmap execution

The operator authorized completion of the remaining map on 2026-11-13, with
agents and continued work until completion or demonstrated loss of progress.
This is the execution checkpoint; no further permission is required for work
within that scope. No deployment, destructive history rewrite, or messages to
upstream maintainers are part of this run.

## Completion predicate

A roadmap node is complete only when its existing `doneWhen` predicate is met
by committed implementation and reproducible source-linked evidence. Each unit
needs an independent review, meaningful negative controls, and the relevant
regression checks. Combined changes need a combined run. Inconclusive checks do
not pass. We will not weaken contracts, replace an upstream implementation with
a model, hide finite event bounds, or label a proposed design as implemented.
Q requires genuine existing-code bug/proof campaigns; seeded mutants alone do
not satisfy it. U requires safety over arbitrary modeled sequences and explicit
fairness for liveness. W requires both Q and V, with trust and scope visible.

## Scope and order

Steps 1 and 2 are complete. H and G landed on main after independent exact-patch
reviews; P landed in PR #10 after two independent review axes. Numeric Gate1
and heap Gate2 are merged. C1 is merged in PR #12 with both admission fixes,
49 focused tests and a 371-test combined suite. The selected C2a protocol unit
is being implemented. K passed both independent reviews; guarded throws passed
a separate production review. Their combined tree passed 477 tests. The numerical
campaign also passed independent review. These units remain unmerged while a
resource-budget investigation addresses inconclusive fresh composition requests.
All fifteen current composition queries match a prior successful graph proof,
but the fresh 60-second request remained unknown. Conditional-progress designs
are complete and their cross-judge is recovering from a transport failure.
[The landing receipt](landing-summary.md) records the merges and checks.
The numbered list below preserves the execution order chosen at the
start; the remaining steps are still in progress.

H and G were implemented in PRs #5 and #6 at the start of this run. Eight nodes remain: K, Q, R, S, T, U, V, W. C1 does not complete any of R/S/T/U. Baseline source is `32bd5b260aa116ca88642a1479bed8d3fc447f4b`,
which passed 249/249 tests and JSON/text CLI checks. The final baseline log is
`artifacts/heap-design/full-final.log` outside the repository.

1. Review H against main and G against H independently, using exact parent/head
   commits and native CLI checks. Land the verified stack bottom-up. Preserve
   ancestry with merge commits; no force-push is needed.
2. Compare two project-workflow designs for P. Select a small API that captures
   target selection, affected dependencies, complete cache identity, replay and
   review evidence. Implement and test actual invalidation, not just hashing.
3. Compare two mutating-loop designs for K. Preserve alias-aware frame checks,
   entry heaps, invariant initialization/preservation, termination, and honest
   replay of induction gaps. Prove an unchanged pinned in-place implementation
   and reproduce implementation mutants before expanding the corpus.
4. Compare two coherent stateful architectures covering R, S, T and U. Ground
   the existing compiler/backend before choosing types. Implement T first, then
   R and S on compatible seams, then U. A manual transition model alone cannot
   satisfy source-linked acceptance.
5. Run K and P library campaigns for Q. Run U/P application pilots for V.
   Preserve unsupported outcomes and distinguish actual bugs from weak specs.
6. Audit Q and V against W, rerun combined checks, reconcile the roadmap and
   publish the evidence. Do not claim arbitrary-JavaScript completeness.

## Isolation and verification

Each agent owns a prepared worktree and an output directory. Candidates compare
whole designs, not flavors of one implementation. Candidates do not spawn
agents. Judges run only after candidates finish. Implementations follow the
selected shape and receive separate review. Only the coordinator writes the
canonical decision trail and integration roadmap.

All CPU-heavy solver checks use the existing process-locked lane:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- COMMAND
```

No core edits occur during that checkout's solver run. Root and worker changes
stay isolated. Existing tests and source contracts remain authoritative unless
a separately evidenced correction proves a gate itself wrong.

## Progress and stall rule

Each unit must advance a concrete artifact, a falsifiable check, or a diagnosed
constraint. An agent timeout or a hard problem is not a stall. After repeated
failure of the same premise, test the premise before another patch. A stall is
an unresolved external blocker or repeated materially different experiments
that produce no viable advance, with no other ready work available. Record the
attempts and failed predicate before stopping. Never mark a blocked node done.

## Artifacts

The canonical append-only trail is `.audit/roadmap-20261113.tsv`. Agent manifests,
raw logs and scratch evidence live under the task-owned external directory
`artifacts/roadmap-20261113/`. Final unit evidence belongs in `verify/reports/`;
source-of-truth graph data remains `docs/verification-roadmap.json`.
