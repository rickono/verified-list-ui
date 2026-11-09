# Ready-now F: richer specifications

Acceptance is **fully met for the documented first-layer subset**. Entry values,
checked pure specifications/lemmas, and exact rational arithmetic compose with
explicit domain obligations and no unchecked axioms. The final full regression
run passes **102/102**, including all 18 node F tests. No unsupported or unknown
outcome is treated as verified.

## Checkout and provenance

- Checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-c4dc57f4`.
- Branch: `t3/implement-ready-now-node-f`.
- Baseline: `ff2518cd7494300084f2ab54da71f4d79185e586`, verified as HEAD and an
  ancestor before writing. `verify/source.mjs`, `verify/`, and `tests/verify/`
  were present. The checkout was clean.
- Final commit: the local commit containing this report. Resolve its full SHA
  with `git log -1 --format=%H -- verify/reports/ready-F.md`; the completion
  response also records the SHA.
- Verification environment: Node `v22.23.1`, installed `z3-solver` `5.3.3`.
- Changes are confined to this prepared checkout. Dependencies use the allowed
  read-only shared `node_modules` symlink during verification, removed afterward. No packages,
  original source checkout, coordinator checkout, downstream nodes, other branches,
  remotes, or published artifacts are changed.

## Implemented behavior and supported subset

`old(expression)` in ensures reads entry parameters. Each root and monitored
helper invocation snapshots supported plain records and arrays before body
execution. Snapshots preserve absent own keys, explicit undefined, NaN, and
signed zero. `result`, body locals, and callback locals are unavailable inside
old. The source subset still rejects mutation and reference identity.

`real(numberExpression)` embeds a present finite binary64 value as an exact
rational. It generates a finiteness obligation. Exact decimal and fraction
string literals use `real("0.1")` and `real("1/3")`. Literal size is limited to
1024 characters; decimal exponents range from -1000 to 1000. Real scalars
support unary signs, arithmetic, comparisons, equality, and conditionals.
Division requires a nonzero divisor. Mixed numeric sorts, real parameters,
real collections, JavaScript builtins over reals, and conversion back to a
JavaScript number fail closed.

An exact `// @spec` marker declares an expression-bodied specification function
over the existing JavaScript input types. It can return native data or a real
scalar. It needs ensures and is independently checked. A Boolean specification
with `ensures result` is a checked lemma. Contracts and specification bodies can
call marked functions, including named local imports. Runtime bodies cannot
call them, and specification bodies cannot call runtime functions.

## Soundness decisions

Specifications expand definitions instead of assuming postconditions. Each
call must establish domains, preconditions, and body definedness. Direct and
mutual recursion, including cycles through requires or ensures, are rejected.
Final dependency gating prevents false, vacuous, unknown, or replay-failing
lemmas from supporting verified consumers, including inactive dependencies.

Requires definedness is checked before feasibility, over the original input
domain and without body facts. Requires clauses are ordered; earlier true
clauses and short-circuit guards can establish later domains. A failed check
uses the existing counterexample outcome with `phase: requires-definedness`
only after replay confirms it. Partial arithmetic cannot silently strengthen a
precondition or turn an unsafe proof vacuous.

Quantifier checks stay inside their lexical index scopes. Callback definedness
is universally quantified independently of predicate polarity. Native array
lengths remain unrestricted in proofs. The existing 256-element limit applies
only to witness materialization.

SMT uses exact Real arithmetic and finite `fp.to_real` bridges. Replay uses
reduced BigInt fractions and an independent binary64 bit decomposition. Native
body arithmetic remains binary64. In particular, rounded `real(0.1 + 0.2)`,
the exact sum of embedded binary64 operands, and exact decimal rationals remain
distinct. Equality with `real(result)` states exactness and finiteness of a
runtime result. Mathematical zero forgets its sign; native old values and
Object.is preserve it. The exact interpreter is listed in trusted components.
There is no Rocq certificate or unchecked user axiom.

## Checks and failures

Completed checks:

```sh
node --check verify/source.mjs
node --check verify/specifications.mjs
node --check verify/index.mjs
node --check verify/solver.mjs
node --check verify/bin/jsverify.mjs
node --check tests/verify/specifications.test.mjs
git diff --check
node --test --test-name-pattern='exact replay|entry snapshots|recursive specifications|unsupported mathematical' tests/verify/specifications.test.mjs
node --test --test-name-pattern='finite binary64 comparisons' tests/verify/specifications.test.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 --test-name-pattern='requires definedness' tests/verify/specifications.test.mjs
```

Syntax and whitespace checks pass. The solver-free groups pass 4/4 and 1/1.
The focused requires-definedness recheck passes 1/1 with its original assertions.

The initial full specification-file check used:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/specifications.test.mjs
```

It passed 16/17 tests and hit the 30-second budget on a precondition comparing
`real(x)` with exact `1/2`. This was a new mixed-theory resource limitation,
not an existing-suite failure. The fix reduces finite comparisons to native
floating-point comparisons only when both operands are exact embeddings or an
integer round-trip check proves the literal exactly representable. Finiteness
obligations remain. No assertion or expected outcome was weakened.
Nonrepresentable decimal comparisons retain exact rational semantics, with
regression coverage. The focused recheck above passes after the fix.

The full regression command completed in the same shared serial lane:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify
```

Initial result: **98/102 pass**, 4 fail, make exits 2. All 18 new specification tests
pass. Existing numeric comparisons, collections, import snapshots, call-domain
proofs, replay diagnostics, and dependency gating pass. Failures are:

- `tests/verify/prefix.test.mjs`: nested callbacks, 30-second solver timeout.
- `tests/verify/remeda-calls.test.mjs`: composed helper, 60-second timeout.
- `tests/verify/remeda-imports.test.mjs`: imported shifted helper, timeout.
- `tests/verify/remeda-take.test.mjs`: unchanged prefix and exact-length proofs
  return unknown; the shifted mutation still produces a counterexample.

`node verify/check-native-baseline.mjs` compares the generated native solver
inputs with modules read directly from the expected baseline commit. It passes
for eight representative cases and 13 targets, including every timed-out form.
Declarations, preconditions, postconditions, witness restrictions, parameter
models, result shapes, and native executable bodies are identical; native cases
also add no pre-definedness query. This is a rerunnable comparison, not a claim
that timeouts passed.

An actual unmodified-baseline verifier probe is also run through the lane:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- sh -c 'node verify/check-native-baseline.mjs --solve-baseline > verify/reports/ready-F-baseline.json'
```

The probe exited 0. The unmodified baseline verified both nested-callback
targets and both composed-call targets, and verified the imported helper while
confirming the shifted counterexample. Exact query hashes and outcomes are in
`verify/reports/ready-F-baseline.json`. Thus the representative native queries
can finish in the same environment, while the first full run exhausted their
budgets. No baseline tests, assertions, proof bounds, or budgets are weakened.

The second full run of the exact same serial-lane command completed with
**102/102 pass**, zero failures/skips, and exit 0. All four previously timed-out
tests passed without changes to code, assertions, proof bounds, or budgets.
This resolves the regression failures for this delivery while preserving the
evidence of resource-sensitive quantified proofs. Every test process ended
before the local commit. The passing full suite was not rerun again.

## Integration touchpoints and limitations

- `source.mjs` adds specification markers, guarded checks, entry environments,
  transparent calls, and target replay metadata. Scalar-state work must preserve
  the entry environment independently of later environments.
- `solver.mjs` consumes `preDefined` in a separate query before feasibility.
  Backend refactoring must preserve this ordering and keep body facts out.
- `index.mjs` adds exact predicate replay, snapshots, and specification bodies
  while retaining monitored native bodies and final dependency gating.
- Existing module snapshots and defining-module lexical scopes support imported
  specifications; no unfinished frontend or heap API is assumed.
- Definition expansion can grow formulas. Quantified and mixed floating-point /
  Real proofs can return unknown under the existing shared budget. Callback
  definedness is conservatively required for every element, even when native
  every might stop earlier. An unreproduced model remains unknown.
- Real values are scalar rationals with no irrational constants, general
  quantifier syntax, induction, mutable-heap old semantics, aliases, frames,
  higher-order functions, async behavior, or runtime mathematical execution.

The design and public syntax are recorded in `verify/design/specifications.md`
and `verify/README.md`.
