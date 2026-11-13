# Source-linked stateful verification

This selects candidate A (`6d2cdfc`) with the corrections in the independent
judgment (`dd657b7`). Candidate B (`7b52fd9`) supplies several boundary checks,
but its site-slot model is rejected. This is a design and implementation
contract, not delivery of T, R, S or U.

## Usage and first subset

The initial entry point is deliberately separate while the new mode is being
verified:

```js
import { checkStateful } from "./verify/stateful/index.mjs";
const report = await checkStateful(file, source, { timeoutMs: 60_000 });
```

It accepts source text, never a caller-supplied transition relation. Once the
mode passes its landing review, the existing verifier can dispatch explicitly
annotated modules to this same implementation. That integration must migrate
callers rather than introduce another checker or expression semantics. The
existing `verify()`/`verifyFile()` reports remain unchanged in the first unit.

```ts
// @environment
// resolves Number.isFinite(result)
// settles eventually
declare function lookup(query: number): Promise<number>;

let latest = 0;
let shownFor = 0;
let shown = 0;
// state 0 <= shownFor && shownFor <= latest
// state Number.isFinite(shown)
// always shownFor >= old(shownFor)

export async function search(query: number) {
  const id: number = latest + 1;
  latest = id;
  // pending 1 <= id && id <= latest
  const value = await lookup(query);
  if (id !== latest) return;
  shownFor = id;
  shown = value;
}
```

These properties express finite displayed values and monotonic request numbers.
They do not establish distinct request identities or that the displayed payload
belongs to the last call: binary64 IDs can collide at 2^53.

The first unit supports literal-initialized number/boolean module cells,
exported entries and top-level await statements with primitive captures and
results. It rejects unsupported awaits, handlers, cancellation, reference state,
module imports, recursive entry calls, closures over mutable locals and liveness.
Pure helpers are admitted only through the existing checked compiler rules;
otherwise the module is rejected at the original source span.

## One machine, one primitive semantics

`Machine` owns the source snapshot, cells, entries, parsed segments, activation
kinds, clauses and declared environment. Every obligation and native trace is
derived from that machine and its source bytes.

| Owner | Responsibility |
| --- | --- |
| `stateful/machine.mjs` | Closed comment grammar, module/entry/await validation, source spans, captured bindings |
| `stateful/environment.mjs` | Operation domains, nondeterministic outcomes, explicit defaults, canonical assumption record |
| `stateful/transitions.mjs` | Init/step/keeps obligations and AST-based lowering into the existing compiler |
| `source.mjs` | Shared expression/control-flow semantics and a narrow internal AST compilation boundary |
| `stateful/traces.mjs` | Hash-bound native actions, strict timed replay, witness search |
| `stateful/index.mjs` | One check operation, budget and final outcome policy |

The implementation may combine owners when that reduces indirection. Do not
copy the evaluator, regenerate application JavaScript for proof compilation,
or build a second literal interpreter. Generated AST wrappers and binding
rewrites retain the original nodes' spans and source provenance. The source
compiler does not acquire knowledge of event schedulers or activation pools.

Conceptually the internal boundary consumes a source snapshot, original segment
AST, resolved bindings and obligation clauses. It returns ordinary solver
targets. Only `transitions.mjs` knows why those targets represent a machine step.
Transport details and solver formulas stay behind the checker.

## Induction rule

A configuration consists of cells and an unbounded multiset of activations.
Each evaluation that creates an activation gives it a distinct semantic identity;
a source site is its kind, not its identity.

For invariant `Inv` and unary pending predicates `P_k`, prove:

1. Init: initial cells satisfy `Inv`.
2. Step: `Inv` and the resumed activation's `P_j`, under legal environment
   outcomes, imply the next `Inv`, every `always` relation and the new `P_k`.
3. Keeps: the same step preserves `P_k` of any other pending representative.

This proves safety by induction on arbitrary trace length. Keeps is mandatory:
its deletion made the overclaim pilot falsely verify in both candidate and
judge runs. Pending clauses are lemmas, not standalone application properties.
Pairwise/count/uniqueness properties receive no unproved assumptions; an
insufficient unary invariant yields unknown or a documented unsupported form.

No activation count, trace depth or witness sample set enters a proof. Finite
native search may confirm a failure; exhausting it cannot establish safety.

## Required boundary corrections

All nine corrections from the judgment apply, with these concrete decisions:

- Parse or reject contract-looking comments, including block comments, case
  variations, a trailing colon and one-edit misspellings of reserved clause
  words. Derive recognition and validation from one grammar. Unknown lines in
  an environment block always fail. Ordinary prose comments remain comments.
- Require at least one `state` or `always` property. Reject entry contracts
  until their semantics exist. Never drop an unimplemented clause.
- `old` in `always` reads the pre-step state. Reject it in `state`, `pending`
  and `resolves`; do not reuse function-entry semantics by accident.
- Record every environment operation, outcome domain and default, including
  never-rejects, may-never-settle, any settlement order and binary64 state.
  Record `settles eventually` as an unused safety assumption, not a proved fact.
  Unsupported ordering or abort contracts fail rather than change the model.
- Actions are external entry calls or settlements, with run-to-completion and
  microtasks drained between actions. Entries do not invoke other entries.
  This is an explicit scheduling assumption, not a theorem about every caller.
- Replay the unchanged type-stripped module in a strict realm. Use
  `microtaskMode: "afterEvaluate"` with a timed invocation/drain for every action;
  retain a hard containment boundary if needed. A looping continuation must
  terminate replay with `replay-timeout`, never hang the orchestrator.
- Preserve solver uncertainty as `unknown/solver` (and budget attribution).
  A satisfiable induction obligation without a native property failure is
  `unknown/induction-gap`, not a counterexample.
- `leads`, `live`, `liveness` and `fairness` fail closed. Conditional liveness
  later requires rank decrease, enabledness, explicit last-call/fairness
  premises, rejection-path obligations and justified infinite traces.
- Attribute frontend errors to original file/line/column. Correct the claim
  that this repository has no async code: `fold/` does contain it.

Keep event-source removal, duplicate registration and disposal semantics as
future explicit parameters. EventEmitter and EventTarget differ; the native
fixtures in the judgment are constraints for R, not interchangeable examples.

## Reports and native evidence

Reports distinguish proved properties, auxiliary obligations and assumptions.
The assumption record carries a canonical hash, `eventBound: null`, scheduler,
numeric domain, initial cells, operation declarations and unsupported features.
Source/executable/assumption hashes bind a trace to the checked artifact.

Replay refuses a changed hash, invalid action, invalid request identity, wrong
argument/result shape or a settlement outside the declared domain. Number
encoding preserves NaN, infinities and signed zero. A never-settling request
may remain pending without hanging replay.

All obligations must be proved before a safety result is verified. Failed
obligations require native trace replay to earn `counterexample`. Invariant
failures without an application property failure remain induction gaps. Search
bounds appear only with non-verified outcomes. A replay timeout stays unknown.
No bounded trace or manually supplied relation can authorize a proof verdict.

## First verifiable unit (C1)

Implement A's T1–T3 and S1–S3, with the outcome distinction and native witness
search needed to preserve its six pilots. This completes no roadmap doneWhen.

- Reproduce guarded, stale, gap, missing-assumption, overclaim and unsupported
  pilots through the production path, with original source hashes.
- Promote the judge's adversarial variants to acceptance fixtures with the
  expected outcomes in `judgment-stateful/judgment.md`, including V18b's second
  await. Keep corrected and original expectation logs distinct.
- Make the continuation-loop replay test return `replay-timeout` within one
  second; test strictness, repeated replay, tampered hashes and illegal outcomes.
- Retain the keeps ablation as a private mutation test, never a public knob.
- Check original example outcomes, graph hashes and compiler obligations for
  equality on the default synchronous path.
- Run focused stateful checks, then the complete verifier suite once at the
  final code tree through the shared serial solver lane.

Next units implement cancellation, listener identity/lifecycle and exact ghost
counts, then conditional liveness. They need new acceptance and independent
review. A pinned real subsystem is required for V; the synthetic search pilots
cannot satisfy it. The fold limiter's over-admission is reproduced on one
microtask schedule; reachability from its present stdin callers is only inferred.

## Synthesis decision

A scores 13/18 to B's 8/18 in the independent judgment. Its real source seam,
native traces and keeps ablation are stronger evidence than B's custom literal
interpreter. Adopt A's representative rule, source-based segment compilation
and native replay. Graft B's source-only input boundary, explicit abstraction
record, no-hidden-cap audit, fail-closed clause handling and fixture-checked
event assumptions. Reject site-slot identities, injected bug verdicts, global
binary64 Horn solving and production text generation. Both prototypes' silent
annotation losses are blockers and must not enter production.
