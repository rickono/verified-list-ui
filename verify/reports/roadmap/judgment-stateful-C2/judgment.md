**ISSUES — select A as the implementation base, with the corrections below.** Neither package implements C2. No executed false C2 verification result exists; the findings concern proposed semantics and acceptance examples. No roadmap node is completed.

Reviewed immutable heads:

- A: `d87f70040f05c4b2449476334936feabe727ba01`, `verify/reports/roadmap/candidate-stateful-C2-codex/`.
- B: `d764ed854be9fec825871b39b494875a4c7de2af`, `verify/reports/roadmap/candidate-stateful-C2-grok/`.
- Current source: `bd0d9570e8f910a8cf7db14cf517728ba3fd673e`.
- Checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-a3d6fc68`.

`32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor; `verify/` exists. Both packages’ grounding, design, contracts, sketches, probes and evidence were read completely, alongside selected C1, its ten implementation files, and relevant G/H/compiler/backend code. Review used `git show` snapshots materialized only here. All 27 current verifier/stateful runtime modules compared byte-for-byte equal to candidate baseline `74c3747`. PR12 merge `41079c5` and 49 focused/371 full passes are **inherited**, not rerun. Root notes were hypotheses; independent controls below tested them.

The six rubric scores use 0 absent, 1 predicted, 2 grounded with gaps, 3 demonstrated. The evidence score measures the review package, not delivery of C2.

| Criterion | A | B | Basis |
| --- | ---: | ---: | --- |
| Faithful scheduler/environment/native protocol | 2 | 1 | A states observation cuts and advisory scope; B’s payload, interleaving and abort rules need correction. |
| Unbounded identity, preservation/keeps/count argument | 2 | 1 | Both retain representatives; A requires both index directions, B’s local mismatch cannot establish absence. Neither demonstrates C2 induction. |
| Effects, capture, alias ownership with C1/G/H | 2 | 2 | Both retain derived effects; A specifies declaration identities and ownership more fully. New identity/projection machinery is unimplemented. |
| Independent traces, containment, honest outcomes | 2 | 2 | Native protocol and contained C1 evidence exist; no contained C2 replay exists. |
| Deep source compiler interface, smallest stages | 2 | 1 | A gives coherent owners and a complete quantified alternative; B’s competing site table is intrinsically inadequate and its admission stages conflict. |
| Executable positive/negative evidence, disclosed gaps | 3 | 2 | A’s scoped C1 disposal proof/native controls reproduce. B preserves failed predictions, but some proposed acceptance outcomes are contradicted. |
| **Total** | **13** | **9** | |

Both preferred architectures extend C1; model names supply no basis for selection. A keeps resolution/provenance in Machine, protocol assumptions in environment, scheduling/induction in transitions, expressions/effects in `compileAstUnit`, and independent execution in native replay. Its alternative whole-configuration quantified architecture covers ownership, allocation, cursors and preservation, but requires a larger annotation/proof language before a useful slice. B’s source API is equally small, yet `matchRegistration(created, other)` and `settlementAllowed(mode, aborted, action)` omit global membership and settlement phase. Small signatures do not hide complexity successfully when they omit necessary semantics. A’s interfaces remain proposals requiring concrete correspondence obligations.

**Own executed findings** ([native evidence](logs/native.json), [source evidence](logs/source.json)):

1. **Payload and admission.** Executing B’s exact stripped `p1-guard.ts` with native EventTarget delivers an `Event`; `shown` becomes an object and `Number.isFinite(shown)` is false. `delivers Number.isFinite(value)` cannot turn that Event into a number. Reject the annotation/domain mismatch, or later specify and execute a real projection. A’s handlers with no formal parameters avoid this gap while still receiving the ignored native Event. Separately, the current H production path confirms a full-domain admission counterexample at numeric input 0 for a predicate requiring `x > 0`, even when the actual helper call passes 1. Delivery assumptions must not establish their own type safety, definedness or totality.

2. **Forgotten removal.** B’s prescribed variant (`stop` only sets `open=0`) retains the native listener but leaves `shown=0` after dispatch: its guard prevents the claimed write. This disproves that proposed acceptance trace, not cleanup correctness or a verifier result. A correct negative control removes the commit guard and states the corresponding property. A retained listener alone is not a count/leak counterexample. Whole-target dispatch after removal remains legal and empty; explicitly invoking a removed registration is different.

3. **Relational cuts.** Two native handlers move `x` through 0→1→2. `R(a,b) := b-a <= 1` holds for each adjacent pair and fails for 0→2. B’s unrestricted sound-overapproximation claim therefore fails for arbitrary two-state `always`; safety of state predicates does not establish relational composition. Separate native observer listeners captured `[1,2]` without wrapping/replacing either application callback; duplicate collapse, alias removal, final state and microtask order matched the uninstrumented control. This demonstrates A’s restricted synchronous cuts are observable, not a complete replay adapter. A current C1 entry performing both increments reports a native `always` violation at span 37..62, so its action-level meaning must stay unchanged. No extra outer-dispatch check belongs in A’s expressly different protocol contract.

4. **Membership and allocation.** With two native registrations, adding the first again leaves two. Comparing the proposed key against the matching representative yields “noop”; comparing against the other yields B’s “fresh.” One mismatch cannot establish global absence. Finite countermodels separately expose a missing index entry and a phantom occupied entry: each satisfies only one correspondence direction. These are executed design-premise controls, not C2 proofs. Require global absence or a checked bidirectional index, preservation under creation/removal, and all relevant equality cases. Native same-site closures differ; aliases remove the same callback. Constructors produce distinct controller/signal pairs, but compatible input bindings may alias. `AbortSignal instanceof EventTarget` is true: either model overlapping roles or explicitly exclude signals from the target domain.

5. **Abort is not a settlement phase.** Six explicit synthetic producer schedules distinguish already-aborted input, queued resolution, and settled-but-not-resumed promises. Advisory requests fulfill after abort. A producer rejecting synchronously on abort beats a merely queued resolution; an already resolved promise still fulfills after abort, and its continuation observes `aborted=true`. Queueing resolve before a queued abort also lets resolution win. B’s stronger policy additionally requires `rejects`, absent from its acceptance fixture; actual C1 rejects unmarked rejection. Do not silently add a rejection, delete an invocation, or forbid a previously selected outcome. Adopt A’s advisory-only first policy; defer `abort rejects` until settlement states, already-aborted creation and marker compatibility have a coherent rule. Native removed-awaiting handlers resumed once: guarded shown=0, unsafe shown=9.

6. **Capture/effects.** A captured primitive `signal.aborted` stayed false after abort; a captured signal handle read true. Current H compiles an immutable primitive capture as pure and rejects mutable capture, reference-writing capture and an indirect heap-effect helper. C1’s setter/resume targets derive `writes`; its capture-only entry derives `heap`. New protocol/capture effects must likewise prevent H certification, including through callees. General reference stores remain outside G’s admitted domain.

7. **Budgets and grammar.** The nine C1 disposal obligations verified with `maxDepth=0`, `eventBound:null`, and no search record; retained full-domain queries contain no event/activation cap. A deliberate 1ms resource budget returned `unknown/solver`. Thus `timeoutMs` budgets proving too; neither it nor witness depth is a logical domain bound. Current C1 parsing treats future `protocol/event/delivers/count/uniqueness` and a Unicode-edited protocol word as prose outside environment blocks; existing Cyrillic `stаte`, `leads` and `fairness` fail closed. This is a measured frontier, not delivered C2 clause loss. Every newly introduced/reserved word must join the single recognition/admission grammar, preserving Unicode/case/block/punctuation/typo rejection and original spans.

An additional native control resolves the packages’ add-during-dispatch disagreement: with only the adding listener, the new listener waits; with a trailing listener, it runs that turn on Node v22.23.1. Keep additions unsupported. Synthetic EventEmitter `newListener` cleanup observed count 0 inside the hook and 1 after add: store follows callback. The read-only p-event fixes/tests/provenance identify future timeout-cleanup and reentrant-registration requirements; none of that fetched source was executed. Neither is mandatory for the first EventTarget slice. EventEmitter must remain rejected, never silently modeled store-before-callback.

**Required corrections and first production contract.** Adopt A’s C2a staging, graft B’s explicit reserved-word table and negative grammar gates, and correct the findings above. Reserve counts/uniqueness and U terms immediately; do not admit them until cardinality correspondence or rank/enabledness/fairness semantics exist. Resolve A’s cleanup staging ambiguity: C2a allows the simple returned remover below; general cleanup bodies and mutable captures remain later work. Reconcile B’s module-only handlers with its factory fixture before reusing that fixture.

The first EventTarget vertical fixture is this ordinary source, using A’s pinned protocol:

```ts
// @environment
// protocol node22-event-target-v1
declare const events: EventTarget;
let disposed = false;
let shown = 0;
// state shown === 0 || shown === 1
// always !old(disposed) || shown === old(shown)
export function bind() {
  const value: number = 1;
  const handler = () => { if (!disposed) shown = value; };
  events.addEventListener("x", handler);
  events.addEventListener("x", handler);
  return () => events.removeEventListener("x", handler);
}
export function dispose() { disposed = true; }
```

Keep `checkStateful(file, source, options)`. Admit immutable captures, repeated closure evaluations, aliases and this simple returned cleanup. Ambient target registries start empty and source-owned. Exclude event payload reads, signal-as-target overlap, listener options, handler registration mutation, reentrancy, imports/general reference storage and async handlers in this vertical fixture. Preserve original declaration identities/spans; do not match names or generate application proof text.

Before returning verified, emit checked init, allocation/creation, source-step, unary/pairwise keeps and deletion-preservation obligations. Distinguish closure, registration, running invocation, request and handle identities. Define actual index/occurrence correspondence in both directions; constructor freshness must follow allocation history, never arbitrary symbol names. No finite pool or trace bound enters proof. Unsupported relational schemas remain unsupported/unknown rather than assumed axioms.

Acceptance: arbitrary repeated binds verify disposal safety; two binds and successive idempotent cleanups produce native dispatch counts 2,1,0; fresh same-body removal retains the registration without inventing a property violation; removing the disposal guard produces a legal native property failure. Explicitly record per-handler source cuts, empty-dispatch stutter and no external/microtask action between synchronous handlers; retain the non-transitive regression and unchanged C1 cuts. Do not claim action-endpoint composition.

Then complete A’s separate advisory cancellation fixture with explicit signal parameter/ownership, already-aborted inputs, same/different controller aliases, and late legal resolution. Abort changes signal contents, not request/invocation membership. Rejection still requires its marker. Reject stronger abort modes until specified. Counts, mutable captures and liveness stay outside this first contract.

Native confirmation must independently execute source closures and legal protocol actions, hash source/executable/assumptions/protocol/schema, preserve bit-level scalar/handle identity, reject illegal suffixes even after a violation, and enforce strict timed drains plus killed/reaped workers. My observer control does not demonstrate realm containment for C2. Preserve requires-definedness, requires-only feasibility, derived effects and original error spans. Solver uncertainty, exhausted finite witnesses, illegal traces and native mismatches cannot authorize verified; abstract failures without a native property failure remain induction gaps.

**Execution and limits.** Exact invocations/results are in [commands](logs/commands.txt); runnable scripts and exact fixtures are retained. Native run exited 0. Source run proved 9/9 C1 units, confirmed disposal/stale failures at spans 253..301/359..394, refused illegal domain/hash/duplicate-settlement/unmarked-reject actions, and contained an infinite continuation in 181ms. It then exited 1 on my incorrect “all entries write” assertion. The failed script/log/JSON remain; a frontier-only continuation corrected that expectation and exited 0 without repeating proofs. H’s full-domain negative control was natively confirmed. These are C1/H support and finite native protocol evidence, not C2 end-to-end capability. No full suite, upstream execution, production edits or roadmap updates occurred. Final snapshot/hash/cleanup checks and local commit are recorded in the handoff; only this directory is committed.
