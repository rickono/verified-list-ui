# Ready node A: scalar state and control flow

Status: node A acceptance criteria are fully met within the documented supported
subset. Supported scalar changes compile and replay faithfully, unsupported
effects fail closed, and every baseline check passes.

## Checkout and commit

- Checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-62e34dfa`.
- Branch: `t3/implement-ready-node-a`.
- Baseline: `ff2518cd7494300084f2ab54da71f4d79185e586`, confirmed as HEAD
  and an ancestor before writing. `verify/source.mjs` and `tests/verify/` existed.
- Final commit: the local commit containing this report. Resolve its exact SHA
  with `git log -1 --format=%H -- verify/reports/ready-A.md`; the handoff also
  supplies the SHA. This avoids placing a commit's own hash inside its contents.

All repository changes are in this prepared worktree. The existing dependency
installation was used through a local symlink without installation or updates.
No agents, other worktrees, downstream nodes, merges, pushes, or publications
were used.

## Implemented behavior

`verify/source.mjs` now tracks immutable binding descriptors and replaces value
views on local writes. Expressions can update the current environment while
earlier reads and helper arguments retain their captured values. Blocks restore
shadowed bindings by declaration identity and preserve writes to outer bindings.
Disjoint statement paths retain branch writes and early returns. Conditional
expressions and short circuits merge writes under their execution guards.

The supported subset includes initialized simple `const`, `let`, and `var`
declarations, multiple declarators, nested block scope, function-scoped `var`,
scalar `=`, numeric `+=`, `-=`, `*=`, `/=`, prefix/postfix `++` and `--`, sequence
expressions, expression statements, empty statements, blocks, `if`/`else`, and
explicit value returns. Local data can shadow module functions and outer data.
Declarations are visible for name resolution before initialization, so a later
local cannot accidentally resolve a module function.

Assignments preserve number, boolean, or undefined sort. Number and boolean
bindings can become undefined and later receive their original type again.
Arrays and records can initialize local bindings, but retain immutable views.

## Soundness decisions and limits

- Parameter writes are rejected. Contract formals always describe entry values.
- Constants, private function names, unknown bindings, and contract expressions
  cannot be written. Reserved names cannot be declared locally.
- Reads and writes before declaration, uninitialized declarations, repeated
  `var` declarations, and `var` redeclarations of parameters are rejected.
  This deliberately excludes general JavaScript hoisting behavior.
- Type changes, including changing a binding initialized only with undefined to
  a number or boolean, are unsupported. Reference replacement, heap writes,
  destructuring, logical or bitwise compound assignment, and unmodeled coercions
  fail closed. Unsupported syntax remains rejected under false guards.
- Postfix updates return the converted old number, so an absent optional number
  produces NaN. All arithmetic uses existing binary64 operators, including
  nonfinite values, signed zeros, rounding, and subnormals.
- Call requirements use only earlier guarded helper facts. Fresh results remain
  opaque, caller feasibility remains separate, and final dependency gating is
  unchanged. Views are never mutated through an argument alias.
- The existing 128-path limit and explicit-return requirement remain. Loops,
  invariants, callbacks in bodies, async, and heap semantics are outside node A.
- Array proofs still cover every native length. The replay materialization limit
  remains witness-only. The frontend, builtin model, solver, and runtime remain
  trusted; this produces no Rocq certificate.

## Checks

The focused command completed successfully with 51 tests passing, no failures,
and no skipped or cancelled tests:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/scalar-state.test.mjs tests/verify/source.test.mjs tests/verify/calls.test.mjs
```

The required full command completed successfully through the same serial lane
with 100 tests passing: all 84 baseline tests and 16 new scalar-state tests. It
had no failures, skips, cancellations, or remaining test processes:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify
```

Static checks passed with `node --check verify/source.mjs`,
`node --check tests/verify/scalar-state.test.mjs`, and `git diff --check`.
The full run included the final strengthened call-order assertion. No semantic
or resource failures occurred in either run. Node's existing experimental
TypeScript stripping warning did not affect the results.

The 16 new behavior tests include 80 V8-derived numeric update cases. They also
exercise reads before and after writes, assignment and update expression values,
compound-assignment operand order, branch joins, early returns, scopes, shadowing,
optional values, short circuits suppressing writes and calls, argument order,
earlier versus later helper facts, replay-confirmed bad contracts, and explicit
rejection with original-source spans. No assertion was weakened to hide a
failure.

## Integration touchpoints

The environment representation is internal to `verify/source.mjs`; entries now
contain `{ declaration, kind, value }` instead of a bare data view. Any concurrent
compiler extension must read the `value` field and preserve binding identity and
captured views. Loop induction will need to define a transition over these
bindings and the existing paths. New scalar sorts will need explicit assignment
and update rules.

`verify/index.mjs`, `data.mjs`, `modules.mjs`, `solver.mjs`, and the CLI require no
changes. Public APIs, outcomes, snapshots, replay bodies, and the solver protocol
are unchanged. `verify/design/scalar-state.md` contains the design; the README
and call design describe the supported extension.
