# Pure predicate contracts

## Usage and domain

A generic helper can accept a pure total predicate and describe its result using
that predicate. A caller can supply an expression arrow that captures immutable
primitive values, or a named source function with a checked contract.

```ts
// ensures result === predicate(value)
function apply(predicate: (x: number) => boolean, value: number) {
  return predicate(value);
}

// ensures result === (value > threshold)
function above(value: number, threshold: number) {
  const matches = (x: number): boolean => x > threshold;
  return apply(matches, value);
}
```

The function annotation is an explicit domain assumption at an external input:
pure, total, deterministic predicates from **every binary64 number** to a present
Boolean. This includes NaN, infinities, both zeros and subnormals, and excludes
undefined arguments, exceptions, effects, mutable captures, function identity,
properties and `this`. Predicates cannot distinguish NaN payloads. JavaScript code
using byte-level inspection can observe distinctions outside this domain; such
code is not admitted. Input assumptions include this restriction in reports.

Concrete callbacks supplied by admitted source are checked rather than assumed
to satisfy that domain. Admission requires safety for every numeric input, even
if a particular invocation searches an empty array. A named callback with
`requires x > 0` does not meet the generic predicate domain.

## Representation and ownership

`data.mjs` extends its single type grammar with unary `number => boolean` function
types and views for symbolic inputs, named source functions and local closures.
Aliases of this type work. Symbolic predicates use an SMT function from FP64 to
Bool: +0 and -0 remain distinct, and all NaNs share one argument value.

The compiler's callback operations remain private in `source.mjs`, alongside the
lexical binder, expression evaluator and ordered call events they use. This
avoids exposing compiler state through a second callback compiler interface.
Named functions are keyed by canonical file and declaration identity. A fresh
SMT symbol is allocated independently of identifier spelling; sanitizing paths
into symbols would collide for names such as `a-b.ts` and `a_b.ts`.

Expression closures preserve the defining bindings. Captures must be immutable
parameters or `const` values of number, Boolean or undefined type. The compiler
records a checked capture certificate. Named callbacks require the derived heap-free effect certificate and become
proof dependencies. The [heap extension](heap.md) derives effects from direct
writes, reads, allocations and callees before admitting a named predicate.

## Ordered admission and closed applications

Passing a callback creates a full-domain safety obligation with fresh numeric
probe inputs. That check appears **before** the callback's summary fact. Its own
postcondition, including an impossible postcondition, cannot discharge admission.
Named requires clauses are instantiated from their parsed expressions, never by
replacing substrings in SMT text. Pending summaries belong to the compilation
unit and become guarded ordered facts. They are not global asserted axioms.

A symbolic application is a function application, so two arguments need not have
the same result. A local closure is evaluated in its defining scope at each
application. A named function uses its checked contract. Inside contracts and
`every`, applications and their safety checks stay closed under the quantifier;
they cannot leak a bound index into the target's outer call events. No generic
body is specialized or inlined into callers. Named callback dependencies use the
ordinary post-replay gating rule.

## Witnesses and unchanged-source replay

`predicate-witness.mjs` owns bit-level FP literal decoding, table validation and
SameValue lookup. `solver.mjs` extracts a finite table of numeric keys and Boolean
values with a constant fallback. `backend.mjs` validates the result again at the
process boundary. Both enforce at most `REPLAY_LIMIT` entries (currently 256).
The limit affects materialization only; proof queries have no table-size bound.

Numeric keys are decoded from their bits, including NaN, infinities and signed
zero. Replay uses `Object.is`, not `Map` or `===`. Reports contain JSON-safe tables
rather than executable source. A nonliteral fallback, malformed table or oversized
model is an honest unknown; there is no weaker-query retry. The additional table
trust statement appears only for reports containing function input models.

Replay runs the original function bodies with monitored bindings. A full-domain
probe is matched to the particular executing call site and parameter using the
native stack location, then invokes the actual callback with its lexical captures.
An unavailable location produces unknown. A confirmed admission failure records
both the passing site and the callback's actual violated domain or requires clause.
Ordinary application failures are blamed on the applying function. Failures
inside dependencies remain dependency violations. A direct local closure call
with a possibly undefined argument is rejected explicitly because no typed
boundary would otherwise monitor it.

## Synthesis and limits

The prototype-backed candidate scored 13/18; the other design scored 10/18. The
implementation retains the first candidate's typed views, closed applications
and native replay, and takes bitwise keys, explicit domain and purity evidence
from the second. Review removed global callback axioms and the relaxed retry,
ordered safety before facts, restricted the signature, and required call-site
matching. Integration also fixed canonical-identity collisions and kept
data-only proof queries unchanged.

Only unary numeric predicates are supported. Local arrows have expression bodies;
direct calls require their parameter and Boolean return annotations, while helper
arguments provide contextual typing. Named source functions need checked
contracts. Mutable/reference captures, function expressions as local callbacks,
higher-order calls inside closures, callback arguments to `@spec` functions,
function returns/storage/equality and general conditional function merges are
unsupported. Builtins can be wrapped in an admitted source callback. Quantifiers,
especially negated or repeated summaries, can still return solver unknown.

See [the pinned Ramda pilot](../examples/ramda/README.md) and
[the validation report](../reports/callbacks.md). Run `make test-verify` for the
full suite and `make test-verify-conformance` for independent native comparisons
and seeded verifier mutations.
