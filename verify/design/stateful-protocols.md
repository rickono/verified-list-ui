# Source-linked listener and cancellation protocols

Select candidate A, `d87f700`, with every correction in the independent
[C2 judgment](../reports/roadmap/judgment-stateful-C2/judgment.md), `323d6a6`.
Its score is 13/18 to B's 9/18. This contract selects an architecture; it does
not deliver R, S, T or U.

Keep `checkStateful(file, source, options)` and C1's source-linked Machine,
AST compilation, init/step/keeps proof rule and independent native replay.
No public transition-table input or second expression evaluator is introduced.

## First unit

C2a implements A's restricted synchronous EventTarget identity fixture and its
separate advisory cancellation fixture. Read A's complete `contracts.md` at
the selected commit and the judgment's corrected fixtures before coding.

The pinned protocol is `node22-event-target-v1`. Ambient target registries
start empty and source-owned. Handlers take no formal parameters and ignore
the actual Event object. Event names are literals, capture is false, and
listener options, payload reads, registration mutation inside handlers,
reentrant dispatch and EventEmitter stay unsupported. Repeated evaluations of
one arrow create distinct closures; aliases preserve identity. Duplicate
registration of the same key is a no-op. The simple returned remover is
admitted; general cleanup bodies and mutable local captures are deferred.

Advisory abort changes signal contents, not request or running-invocation
membership. A response after abort remains legal. Already-aborted inputs,
settled-but-not-resumed requests, same and different controller aliases and
input ownership must be explicit. Constructor freshness follows allocation
history. Compatible external inputs may alias; binding names do not establish
distinct identities. Signal-as-target overlap is excluded in this first unit.
Reject-on-abort and implicit rejection stay unsupported; an ordinary declared
rejection still needs C1's marker.

## Proof ownership

Machine resolves original declaration identities, captures, handle sorts and
source spans. Environment owns protocol selection and operation assumptions.
Transitions owns creation, source steps, deletion, unary/pairwise keeps and
registry correspondence obligations. The existing compiler owns expressions
and derived effects; native replay independently enforces protocol legality.

Distinguish closure, registration occurrence, running invocation, request and
handle identities. Check both directions of registration-key index/occurrence
correspondence, and preserve them on creation and deletion. A comparison with
one nonmatching registration cannot justify absence of every matching key.
No finite identity pool, event bound or activation cap enters a proof.

Safety includes initialization, creation and every permitted alias case.
Environmental postconditions cannot establish their own input-domain safety,
definedness or callback totality. Keep requires-only feasibility, ordered
earlier facts and H's effect admission. A stateful or protocol-reading callback
cannot acquire a pure certificate through a helper.

In protocol mode, `state` and `always` observe adjacent source-handler cuts.
Synchronous dispatch excludes other external actions and microtasks between
handlers. An empty dispatch stutters. There is no additional outer-endpoint
`always` check for a nonempty dispatch. C1's existing action cuts remain intact.
Retain the non-transitive relation control, where 0→1 and 1→2 satisfy a
one-step relation but 0→2 does not. Do not advertise endpoint composition.

## Replay and grammar

Replay executes the unchanged stripped source and concrete closures in a strict
contained realm. Do not replace callbacks with wrappers that change their
identity. Record source, executable, assumptions, protocol and trace-schema
hashes. Handle transport preserves identity and sorts separately from FP64
scalars. Validate every action, including illegal suffixes after a violation;
reject fabricated handles, wrong ownership and duplicate settlements.
Timed microtask drains and killed/reaped workers remain mandatory.

Extend the one clause table when introducing `protocol` and advisory abort.
Reserve counts, uniqueness and temporal words immediately and fail closed on
unimplemented forms. Retain original-span rejection of Unicode edits, typos,
case, block comments and punctuation. `timeoutMs` budgets proving and search;
finite search depth affects witness finding only. Neither changes the proof
domain. Solver uncertainty, replay mismatch or exhausted search stays unknown.

## Acceptance

Both vertical fixtures must pass unbounded induction. Two binds and successive
idempotent cleanups must give native dispatch counts 2, 1, 0. A fresh same-body
remover must leave the registration, without inventing a safety violation.
Removing the disposal commit guard must give a legal native property failure.
Deleting keeps or either registry-correspondence direction in a private control
must expose a wrong proof or fail structural validation.

Advisory late resolution remains legal and harmless under the guard; removing
the whole guard produces the declared disposal failure. Removing only the
signal check does not falsify that global disposal property. Exercise aliases,
already-aborted inputs, malformed traces, derived effects and containment.
Preserve C1 and synchronous query/report behavior against public main `77c95f3`.
Run focused checks and a final full suite on frozen source, then independent
review before publication or any roadmap completion claim.

Exact counts, mutable captures, asynchronous listeners, general reference
storage and conditional liveness remain later units. They require their own
checked semantics and acceptance; this first unit does not silently admit them.

## Grafts and rejected choices

Take B's explicit reserved-word table and negative grammar controls. Reject its
numeric Event payload assumption, pairwise-mismatch absence rule, unrestricted
relational-interleaving claim and settlement-phase-free abort-rejects rule.
A's global quantified alternative remains documented but is not the first
implementation. Its larger allocation/order/cardinality obligations are not
needed to establish the two restricted vertical fixtures.
