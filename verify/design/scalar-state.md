# Scalar state and control flow

Local scalar updates must preserve both the value of an expression and the state
seen by the next expression. Contracts continue to describe entry arguments.

```ts
// ensures Object.is(result.before, x)
// ensures Object.is(result.after, x + 1)
function step(x: number) {
	let value = x;
	const before = value++;
	return { before, after: value };
}
```

## Existing ownership

`source.mjs` parses functions, resolves names, compiles expressions and disjoint
statement paths, and records calls in evaluation order. `data.mjs` represents
immutable value views and binary64 operations. `index.mjs` replays original
bodies and contracts, then gates callers on their callees' final statuses.
`modules.mjs` owns source snapshots, and `solver.mjs` owns proof queries and
witness extraction. Scalar state belongs in the source compiler. Its updates
replace views rather than changing data objects or replay code.

## Interface and state

Each environment entry becomes an immutable binding descriptor:

```text
Binding = { declaration, kind, value }
kind = parameter | const | let | var | self | contract
value = existing data view | null (declaration not initialized)
Environment = Map<name, Binding>
expression(node, env, context) -> data view; replaces entries in env
statements(nodes, continuations, returns, context) -> continuations
Continuation = { path, env }
```

Binding identity is its declaration node. Forks copy the environment map.
Assignment replaces a descriptor, so earlier reads and call arguments keep their
captured values. A block predeclares its lexical bindings before evaluating any
initializer. On exit it restores shadowed names and retains updates to bindings
whose declaration identity matches the enclosing environment. Function-scoped
`var` names are collected before execution, including declarations inside blocks.

The existing disjoint statement continuations retain branch writes through
joins and early returns. Conditional expressions evaluate each arm in a fork
and merge binding values with `data.merge`. Logical expressions merge the right
operand's writes under the same condition that guards its calls. All other
operands, receivers, declarators, and arguments evaluate left to right.

Call events still obey the ordered rule: only earlier guarded helper facts can
establish a call's requirements. State updates never add helper facts to caller
feasibility, and fresh helper results remain opaque.

## Supported subset and rejection rules

- Initialized simple `let`, `var`, and `const` declarators, including multiple
  declarators and nested block scopes. Lexical bindings can shadow outer data
  bindings and module functions. Contract callback binding rules stay unchanged.
  Local names exclude the verifier's reserved set, except that an ordinary
  body-local declaration may be named `result`.
- Local scalar `=`, numeric `+=`, `-=`, `*=`, `/=`, and numeric prefix and postfix
  `++` and `--`. Sequence expressions preserve left-to-right effects.
- Expression statements, blocks, `if`/`else`, and explicit value returns.
- Number, boolean, and undefined assignments keep their scalar sort. A numeric
  or boolean binding can receive undefined and retain its optional encoding.
  A binding initially holding only undefined cannot change to another sort.
- Parameters, constants, private function names, reserved names, and unknown
  bindings cannot be written. Contracts reject assignment and update syntax.
- Uninitialized declarations, reads or writes before declaration, and repeated
  `var` declarations are unsupported. Hoisted names still mask module functions,
  so unsupported hoisting cannot accidentally resolve a different callee.
- Arrays and records retain immutable views. Reference binding replacement,
  heap writes, destructuring, coercions outside the existing subset, logical
  compound assignment, remainder, bitwise updates, loops, callbacks, and async
  remain unsupported. Unsupported syntax is rejected even under a false guard.

Postfix numeric updates return the converted old number, including NaN for an
absent optional value. Every arithmetic update uses existing binary64 operators.
No algebraic cancellation, integer arithmetic, or bounded proof domain is added.

## Design choice

A full state-passing expression result with separate scope and store objects
would make effects explicit, but would change every expression caller. Binding
descriptors in forked maps fit the current compiler and preserve captured values
with a smaller change. Keeping statement paths also preserves the existing
argument for ordered guarded call facts. The path limit remains 128.

## Verification and integration

Behavior tests exercise the public API, proving expected updates and confirming
bad contracts through actual-source replay. They cover scopes, argument order,
short circuits, helper facts, binary64 edge values, and fail-closed syntax.
Run focused tests and `make test-verify` through the shared serial test lane.

Future loop induction must retain binding identity and define a loop state
transition. Heap mutation requires a separate model. Neither extension is part
of this implementation. No public API, solver protocol, replay outcome, source
snapshot rule, array proof domain, or trust claim changes.
