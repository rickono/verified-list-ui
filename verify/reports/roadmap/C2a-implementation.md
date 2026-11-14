# C2a implementation receipt

PASS for this scoped implementation. The final full suite passed 390/390 and
the protocol-focused suite passed 18/18. This is a local implementation handoff for root
review and integration. It completes no R, S, T, or U roadmap node and asserts
no fairness, progress, count, leak, or universal JavaScript theorem.

Checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-105287a3`.
Prepared parent: `07c64858d3ecdce0eeee59c2439f07daf6449adc`.
Public comparison: `77c95f374742f9a78b931a2310c8bb1147f3c4d6`.
Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor, `verify/`
exists, and the initial checkout was clean. The prepared parent's production
verifier files equal public main; its intervening changes are design/review
artifacts. No unmerged K or guarded-throws production changes were included.

Implementation commits:

- `78d4e149b1cc8a30cabb1c9f1e6bc08e9e0be357`, restricted protocol implementation,
  fixtures, acceptance tests, and public-main regression.
- `7be8658103d643d24de6cebe72182545080283d1`, actual returned-handle domain checks
  and the early-return regression.
- `8b8de0cef6db8a7607c5f0769c098ed7c72574e7`, mandatory external stutter preservation in every protocol module.
- `c1df5f6a7302dc70ede1c43649aa61295d3d80f7`, standalone unannotated constructor admission and alias/ownership regression.

The final tested code commit is `c1df5f6a7302dc70ede1c43649aa61295d3d80f7`,
with tree `e6ab0ad2fa9b16633ac86795d0a5bd0c285e4f17`. The evidence commit
adds this receipt and its reproducible artifacts without changing production
code, tests, or the README. [The tree record](C2a-evidence/tested-tree.txt) and
[final source hashes](C2a-evidence/final-fourth.sha256.json) identify the tested
bytes. Runtime source archives accompany each focused-run manifest.

## Contract and ownership

The implementation follows [stateful-protocols.md](../../design/stateful-protocols.md)
and the complete [C2 judgment](judgment-stateful-C2/judgment.md). The current
judgment is byte-identical to original `323d6a6`, SHA-256
`7f78e30d9e0c12569664f6dc98482d8cf4feacce330b90247d8773b6a7ca708b`.
A's immutable `d87f70040f05c4b2449476334936feabe727ba01` contracts, design,
sketch, grounding and evidence were read with `git show`. B supplies reserved
words and negative grammar gates only. No new upstream source was fetched or introduced for C2. The required full
suite ran its existing repository-pinned regressions unchanged. No canonical roadmap or audit file changed.

The public entry remains `checkStateful(file, source, options)`. Machine owns
source declarations, no-shadow binding resolution, captures and original spans.
Protocol admission extends that Machine in `protocol-machine.mjs`. The same
`transitionsOf` selects source-derived AST units and checked protocol schemas.
`source.mjs` still interprets every application expression and body.

`compileAstUnit` gains an internal typed projection for opaque identity equality,
total protocol-map reads and functional updates. Its eight identity sorts
separate target, event, closure, registration occurrence, running invocation,
request, controller and signal. They never replace application Numbers.
The extension has no source spelling or caller transition-table API. It uses the
existing proof scheduler/backend and ordered safety/definedness rules.

The necessary representation extension is explicit: protocol units declare
identity sorts and map signatures and use `StatefulProjection` AST leaves.
Their executable predicate metadata is empty because replay belongs to the
unchanged source owner; the full preconditions/postconditions remain compiled
and checked. C1 and default units retain their existing metadata. Public-main
comparison below checks complete artifacts and query bytes, without a baseline
projection or reset.

Protocol reads and admitted source operations derive heap/write effects, even
when an abort, registration or allocation is removed from a scalar wrapper.
A protocol projection cannot compile in a pure callback context. Helpers and
imports remain rejected in this source subset. Callback admission has no
`delivers` or numeric Event axiom: listeners have no parameters, immutable
captures receive checked creation predicates, and native Event objects are
ignored. Signal reads in `resolves` are rejected before outcome assumptions
can grant their own admission or definedness.

## Induction and correspondence

For occurrence `r` and key `k=(target,event,callback)`, the checked relations are:

- `live(r) => occupied(key(r)) && index(key(r)) = r`.
- `occupied(k) => live(index(k)) && key(index(k)) = k`.

Initial live and occupied maps are empty definitions. Creation requires a
vacant indexed key and an identity outside registration history. It updates
membership, key projections, index and history with typed `ite` definitions.
Duplicate add preserves the existing occurrence. Removal clears occupancy and
exactly `live(index(k))`; history remains allocated. Absent removal is a no-op.

Each operation checks both directions for arbitrary occurrence/key observers,
live/history preservation, and arbitrary pair uniqueness. Equal observers and
all compatible aliases remain legal. These schemas establish the relations at
creation and preserve them under removal; they never infer global absence from
one nonmatching representative. Controller/signal inverse ownership, historical
allocation freshness, closure allocation, advisory content changes, request
creation/settlement, and settled/running membership frames have separate units.

Source capture creation uses the actual original declarations and expressions.
Handler steps quantify over captures satisfying those checked predicates.
All protocol modules also check external allocation/abort stutters, including
modules without listeners or a rejection marker. Removing that stutter unit
is structurally rejected; its private ablation is checked against a legal
native failure of an explicitly non-reflexive `always` relation.
Unary keeps retain them across arbitrary entry and handler interference.
Protocol pair schemas quantify over arbitrary representative pairs. Pending
source lemmas retain C1 creation/step/keeps ownership. No identity pool, event
limit, runtime activation cap, witness depth, or search sample appears in a
proof query.

Deletion controls remove keeps and each correspondence direction from private
unit lists; structural completeness rejects all three omissions. Additional
private premise deletions produce satisfiable forward/reverse preservation VCs.
These are abstract failures, not application counterexamples. The inherited C1
keeps ablation still exposes its false proof. Production has no deletion switch.

## Native replay

Replay independently reconstructs the source Machine and executes the unchanged
stripped source with export markers blanked at their original offsets.
Node v22.23.1 receives the actual source closures. The EventTarget method adapter
forwards callbacks unchanged and installs separate realm observer listeners.
Observers check adjacent handler cuts. A nonempty dispatch gets no extra outer
endpoint check; empty dispatch stutters. External actions and microtasks cannot
interleave synchronous handlers. C1 action observations remain unchanged.

Ambient targets start empty and source-owned; compatible ambient bindings may
alias. Input controller/signal graphs check ownership, sort and existing
identity. They permit already-aborted signals and repeated use of the same
input. Constructors create native controller/signal objects with fresh interned
identities. Returned removers are checked for actual callability on the executed
path; other returned handles must have the declared owned sort. Native request
records retain a separate invoking entry identity and settlement phase.

Advisory abort changes contents only. Requests can fulfill after abort, declared
rejections are ordinary outcomes, and a selected fulfillment survives a later
abort. `settle-abort` executes one producer turn that selects the response,
aborts, then drains the actual promise continuation. External allocation and abort
actions observe module-cell stutters, and the proof includes these cuts in
every protocol module. It models the settled but
not resumed case without deleting or replacing an invocation.

Version-2 traces validate source, executable, assumptions, protocol and schema
hashes, typed IDs, scalar domains, outcomes, duplicate settlements, all suffixes,
and any supplied observations. Binary64 values decode from their eight original
bytes inside the realm. No host arrays/objects enter application argument data.
Native API functions/accessors are rehomed into the code-generation-disabled
realm. Every turn and microtask drain has a VM deadline; the owner kills and
reaps the worker even after timeout. Only a legal replayed property failure earns
`counterexample`. Solver uncertainty, abstract induction gaps, replay failures,
and exhausted finite search stay honest unknown outcomes.

## Observed verification

Every solver/native/CPU-heavy command used `serial-verify.py`; source stayed
frozen throughout each run. [Commands and failures](C2a-evidence/commands.md),
[final invocations](C2a-evidence/final-commands.json), and raw logs retain actual
outcomes. Runtime is Node v22.23.1, Acorn 8.19.0, z3-solver 5.3.3.

| Check | Observed evidence |
| --- | --- |
| Complete listener fixture | 38/38 full-domain units verified, `eventBound:null`, no search record |
| Complete advisory fixture | 34/34 full-domain units verified, `eventBound:null`, no search record |
| Repeated binds, aliases, duplicate add and cleanup | Native cuts 2,1,0; idempotent first cleanup; separate 24-bind run |
| Uninstrumented native comparison | Actual listener lists 2,1,0; fresh same-body removers leave 2,2,2 |
| Fresh-remover safety | Existing finite-value/disposal properties still verify; no invented leak failure |
| Both guard removals | Legal source-native `always` failures; replayed confirmation |
| Remove only signal check | Global disposal property still verifies |
| Cancellation timing and aliases | Same/different controller, shared signal arguments, already-aborted, late response, already settled and settled-before-resume cases pass |
| Constructors and returns | Fresh owned signal pairs; actual early-return noncallable refused |
| Non-transitive relation | Native 0,1,2 adjacent cuts; strengthened reachable-state lemma proves; C1 two increments in one action still refute endpoint relation |
| Grammar and effects | Reserved words, Unicode, typo, case, punctuation, block and unsupported syntax reject at original spans; effect/purity controls pass |
| Negative proof controls | Missing keeps/direction structurally rejected; three missing-premise VCs satisfiable |
| Trace/containment controls | Hash, malformed domain/ID/ownership, suffix, duplicate settlement, unmarked rejection, strictness and timeout cases pass |
| Floating-point transport | Quiet NaN payload/sign, signed zero, infinities and subnormal bytes retained |
| Focused C1/C2 run | 64/64 before the final transport/return controls; final protocol-focused run 18/18 |
| First full run, commit `78d4e14` | 387/387; retained after the returned-handle gap was discovered |
| Second full run, commit `7be8658` | 388/388, retained before stutter/admission corrections |
| Final full run, commit `c1df5f6` | 390/390, exit 0 |

[Final proof reports](C2a-evidence/proof-final.json) and compressed full-domain
queries for [listeners](C2a-evidence/listeners-full-queries.json.gz) and
[advisory](C2a-evidence/advisory-full-queries.json.gz) are retained. The exact
fixture hashes are `caffe023b53b4005064699ae33240af4eb9fb97aaf028182f16d312a652d1b73`
and `4358227cc2aed584cbb0220bf97da366443d924a03bfbbb12355ebe597e5118f`.

[Public-main parity](C2a-evidence/baseline-compare.json) compares 11 examples,
40 targets and all 296 query phases byte-for-byte. Complete target artifacts
also match. A separate regression checks complete default reports and CLI
output against public `77c95f3`; the original older-parent C1 regression remains.
No baseline reset or metadata-only filtering was needed.

## Failed experiments and scope limits

The first native hardener erased AbortSignal's superclass link, producing
`unknown/replay-runtime`; [the failed recording](C2a-evidence/native-first.json)
is retained beside its corrected continuation. Two focused requests were
cancelled while queued, exit 143, before tests started. Neither counts as a run.

The first executed focused suite passed 12/13. Its sole failing expectation
assumed `0 <= x <= 2` excluded fractional binary64 induction states. The checker
correctly returned an induction gap. The regression now preserves that unknown
and separately proves an additional reachable-value invariant, checked at init
and every step. No solver query was weakened.

The [FP probe before correction](C2a-evidence/fp-before.json) recorded payload
`7ff8000000000042` becoming canonical NaN. The [corrected probe](C2a-evidence/fp-after.json)
retains the original bits. After the first full pass, the
[return probe](C2a-evidence/return-before.json) showed an early source return
being interned as a remover. The [corrected result](C2a-evidence/return-after.json)
is `illegal-environment-action`. This substantive boundary fix required the
second full run, which passed 388/388.

Subsequent source inspection found the stutter schema was emitted only for
listener modules or marked rejection. A typed-handle-only module can still
receive an external abort. The [executed stutter control](C2a-evidence/stutter-control.json) removes `$stutter`,
checks that every remaining VC verifies, and independently replays an abort
that violates the source's non-reflexive relation. Production now requires
that unit for every protocol module. A queued historical probe was cancelled
before execution, so it is not reported as an executed old-verifier result.

Standalone `new AbortController()` without an annotation or ambient operation
also needs protocol admission. Machine now detects the unshadowed constructor
syntax directly. The regression proves its source and checks two native
allocations through returned immutable aliases. Both corrections precede the
final full run. A queued final request was replaced before it acquired the lane;
its wait-only log and frozen snapshot remain.

This first unit has explicit extra syntax gates: targets are ambient, listener
and advisory-await modules are separate, one protocol await is admitted per
entry, and protocol-reading pending clauses are unsupported. The original C1
scalar multi-await path is unchanged. A later protocol multi-await unit needs
continuation-owned request identity tracking. Immutable primitive captures can
need additional source invariants when their values are not literals; the
checker does not infer finiteness or safety from their annotations.

Mutable captures, asynchronous handlers, payloads, options, handler registration
mutation, reentrancy, EventEmitter, signal-as-target overlap, imports, general
reference stores, helper calls, reject-on-abort, exact counts, user uniqueness,
and temporal clauses remain rejected. Current signal contents are overapproximated
after suspension rather than frozen at constructor time. Search uses finite
materialization samples and selected action shapes solely to find failures;
explicit replay accepts a wider legal action set. Search exhaustion proves nothing.
The compiler, protocol schemas, native adapters, Node runtime and solver remain
trusted implementation components, not an independent formal certificate.

Independent review, integration, and roadmap decisions belong to root. No
subagents, messages to others, pushes, PRs, merges or watches occurred. Cleanup
and final evidence checks are recorded in [cleanup.json](C2a-evidence/cleanup.json).
No owned solver, replay worker, driver, baseline directory or dependency link
remains. The final core/test hash manifest still matches every tested byte.
