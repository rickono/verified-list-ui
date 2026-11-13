# Same-module call contracts

## Problem and usage

A caller must prove a helper's preconditions and use its postconditions without repeating the helper's implementation. Helpers remain independently checked.

```ts
// ensures Object.is(result, value)
const caller = (value: number) => identity(value);

// ensures Object.is(result, value)
const identity = (value: number) => value;
```

The same interface checks scalar wrappers, array and record helpers, and the pinned Remeda eager `take` composition. `verify(source, options)` remains the public entry point. Contracts use ordinary JavaScript expressions.

## Shape and ownership

`source.mjs` collects headers in source order and retains contract ASTs. A memoized body compiler resolves dependencies, infers return shapes, and rejects cycles. Targets remain in source order. Resolution respects local data and the private name of a named function expression.

Each body evaluation carries a guard and a per-target collection of fresh names, declarations, and ordered call events. Callee contracts are re-evaluated with formal parameters bound to actual value views. A fresh result of the inferred return shape is constrained only by the callee's postconditions. Array results retain possible undefined elements, and records keep own-key presence separate from value presence.

For call `k`, let `Gk` be its execution guard, `Sk` its argument-domain and requires condition, and `Fk` the implication from its guard to its ensures. The target postcondition conjoins these obligations:

```text
(Gk and all earlier Fj) implies Sk
all Fj implies caller ensures
```

Facts are named Boolean definitions to share terms. No body facts enter caller `pre`, which stays the caller's requires alone. A call's own or later postcondition cannot prove its precondition. An impossible helper postcondition cannot make a caller vacuous.

The [backend scheduler](proof-backends.md) proves these call-safety conjuncts and individual ensures separately. It requires every conjunct and retains the same earlier-fact rule for each call. Every ensures uses all callee facts.

`data.mjs` owns both the value and execution guard for short-circuit operators, plus argument-domain checks and symbolic values. Ordinary reads accept one argument; guarded reads use a separate helper, so array mapping cannot accidentally pass an index as a guard. Method receivers are evaluated before arguments.

This fold relies on the statement compiler's disjoint branch paths. Local scalar updates preserve captured value views; conditional expressions and short circuits merge writes under the same guards as their call events. The [scalar-state design](scalar-state.md) records that extension. [Loop induction](loops.md) adds guarded cutpoint obligations; [pure callbacks](callbacks.md) add ordered admission and closed quantified applications. Heap mutation, overlapping execution paths and recursion require a new argument before they can extend the fold.

## Replay and status policy

`index.mjs` installs monitored module bindings in a fresh VM with a null-prototype host namespace. Original executable bodies remain unchanged. Predicates take lexical parameters, and every invocation runs through the timed VM. A host-only sentinel records the actual callee, arguments, and failed clause or parameter domain. Source code cannot catch the sentinel because `try` is unsupported.

A direct call violation can confirm a caller counterexample. A violation inside a helper yields `dependency-violation` and records an alarm against that helper. An unreproduced abstract counterexample yields `contract-gap`. Final statuses are resolved dependency-first after all replays; any unverified helper prevents a verified caller. Gating includes inactive syntactic calls. Locations are whole caller spans, not asserted call-site traces.

The backend owns the query protocol and one shared request deadline. Witness bounds apply only to caller input materialization. Fresh call result lengths and native input array lengths have no additional proof bound.

## Synthesis decision

Two candidates chose ordered, guarded events in one postcondition. The independent comparison selected the prototype-backed candidate. Integration corrected mapped-read guards, receiver order, self-name shadowing, and timed predicate execution. Domain parity, disjoint branches, replay namespaces, CLI diagnostics, and post-replay dependency gating have regression checks.

## Alternatives and limits

Separate call queries can be sound, but require another result-combination policy and more solver queries. A weakest-precondition continuation would move sequencing into a different evaluator. Uninterpreted helper symbols would require a different representation for closure-built array arguments. Body inlining defeats opaque contracts.

Fresh results lose information omitted from ensures, including relationships between repeated calls to a pure helper. Return shapes are conservative. [Imports and aliases](imports.md) and [pure unary predicates](callbacks.md) now compose through checked contracts. General calls in contracts, currying, general higher-order values and recursion remain unsupported. Quantified summaries share the module's solver budget and can return `unknown`.

## Verification

Run `make test-verify` for all source-verifier checks. Run `node verify/examples/remeda/check-calls.mjs` for the pinned helper composition and a length-correct shifted wrapper failure. The caller proof uses helper contracts; replay uses the real eager body.
