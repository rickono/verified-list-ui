# Exact contracts and checked specifications

## Usage and supported subset

```ts
// @spec
// requires Number.isFinite(x)
// ensures result === real(x) + real("1/2")
const halfMore = (x: number) => real(x) + real("1/2");

// requires Number.isFinite(x)
// ensures real(result) === halfMore(old(x))
const addHalf = (x: number) => x + 0.5;
```

`addHalf` needs an exactness proof: some finite inputs round or overflow, so this
unrestricted contract fails. Runtime arithmetic remains binary64.

`real(numberExpression)` embeds a present finite binary64 value as its exact
rational value. It adds a finiteness obligation. `real("decimal")` and
`real("integer/integer")` construct exact rationals from bounded decimal or
fraction strings. Real values support unary signs, `+ - * /`, comparisons,
equality, and conditionals. Division requires a nonzero divisor. Mixed real and
JavaScript operands, implicit conversions, real parameters, real collections,
and a conversion back to JavaScript numbers are unsupported.

`real(0.1 + 0.2)` embeds the rounded runtime addition. `real(0.1) + real(0.2)`
adds the exact binary64 operands. `real("0.1") + real("0.2")` adds decimal
rationals. These three expressions have distinct meanings.

`old(expression)` is supported in ensures and loop specifications. Its expression sees only the
function's entry parameters, without `result`, body locals, or callback locals.
Replay captures a sharing-preserving entry snapshot before each body.
Absent own keys, explicit undefined, NaN, and signed zero survive. The
[heap model](heap.md) adds aliases and frames: `old(a.x)` is entry contents,
while `old(a)` retains its identity and `old(a).x` reads current contents.

An exact `// @spec` marker selects a specification-only, expression-bodied
function. Parameters use existing JavaScript data types. Its body can use the
contract language (including `every` and other marked specifications) but cannot
call runtime functions. Every specification still needs ensures and is checked
as an independent target. Ordinary bodies cannot call it. A Boolean
specification with `ensures result` serves as a checked lemma.

## Interfaces and ownership

`specifications.mjs` owns symbolic real operations, exact rational replay, and
contract-expression replay generation. `source.mjs` owns the marker, entry
environment, guarded definedness checks, and acyclic specification expansion.
`solver.mjs` checks precondition definedness before feasibility and the usual
postcondition query. `index.mjs` owns snapshots and final dependency gating.

Each expression contributes guarded definedness obligations. A short-circuit
right operand is checked only when executed. An `every` callback's obligations
are universally closed inside the callback's index scope, independently of the
predicate's Boolean polarity. Negating a predicate cannot negate definedness.

Requires clauses are evaluated in order. The first clause's definedness must
hold for the entire input domain; later clauses may use earlier true clauses.
This check has no body facts or assumed specification postconditions. A
definedness failure is a replay-confirmed counterexample with phase
`requires-definedness`, rather than an implicit precondition or vacuous proof.
Postcondition and specification-body definedness are ordinary proof obligations.

Specification calls expand checked definitions, never assume their ensures.
Each use checks argument domains, requires, and body definedness. Compilation
rejects direct and mutual cycles, including cycles through contracts. Every
syntactic specification dependency must have final status verified. Consequently
a false, vacuous, unknown, or replay-failing lemma cannot support a verified
consumer, even when its result is ignored or its call is inactive.

## Design decision and trust

Opaque lemma summaries would require ordered fresh results under quantifiers and
a separate proof-fact policy for preconditions. Definition expansion is the
smaller first layer and preserves quantifier scope without introducing axioms.
It trades proof size for a clear meaning. Runtime helper summaries stay opaque.

SMT uses exact Real arithmetic and `fp.to_real` only with explicit finiteness
obligations. Replay independently uses reduced BigInt fractions, including an
exact binary64 bit decomposition. It never substitutes native arithmetic for
mathematical operations. Real zero has no sign; native `old` and `Object.is`
retain the binary64 zero sign. Frontend, exact replay, builtins, and Z3 remain
trusted. There is no Rocq certificate or general theorem-prover API.

Comparisons between finite embeddings can use native floating-point order and
numerical equality directly. An exact literal enters this reduction only after
an integer round-trip check proves it is exactly representable. Finiteness
obligations remain separate. This avoids difficult inverse `fp.to_real` queries
for representable bounds such as `real(x) === real("1/2")`; nonrepresentable
decimal literals are never rounded for this reduction.

## Verification

`tests/verify/specifications.test.mjs` exercises bridge definedness, exact
fractions, rounding and overflow, entry snapshots, specification dependencies,
cycles, and quantifier polarity and scope. Run solver tests through the shared
serial test lane, followed by `make test-verify` in that lane.
