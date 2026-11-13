# Universal array contracts

## Problem

The eager Remeda `take` body must preserve every returned element at the same input position. Numeric equality cannot state that property for `NaN`; `Object.is` also distinguishes signed zeros. The proof must cover every native array length and retain actual-source replay.

## Usage

```ts
// ensures result.length <= values.length
// ensures result.every((value, index) => Object.is(value, values[index]))
export const take = (values: number[], n: number) => n < 0 ? [] : values.slice(0, n);
```

The same native method can state an input assumption:

```ts
// requires values.every((value) => value > 0)
// ensures values.length === 0 || result > 0
export const first = (values: number[]) => values[0];
```

## Shape

`source.mjs` owns the expression-bodied arrow subset and lexical binding. A per-target contract context supplies fresh quantifier names. A shared binding rule rejects shadowing and reserved names for parameters and callbacks. Body-local declarations reject the same set except `result`; the contract return value is bound separately, after the body. The builtin dispatch and reserved names derive from one set.

`data.mjs` owns the meaning. For an array view with length `L`, `every` produces `forall q: BV32. q < L implies predicate(element(q), Number(q))`. Every callback index is present and exactly representable as binary64, so its cached unsigned view agrees with JavaScript indexing. The array length guards access to its indexed element function. An empty array makes the implication true for every index.

Each index is bound inside the resulting Boolean formula. Negation, conditionals, equality, and nested calls preserve its meaning without compiler-side polarity rules. The solver handles quantifiers. An index chosen by the solver is not a new application parameter.

The public `verify()` interface, solver subprocess, and replay policy remain unchanged. Replay runs the original contract expression with native JavaScript `every`. The witness-only array limit never enters a proof query.

## Synthesis decision

Two independent candidates recommended native `every` with true quantifiers. An independent cross-judge selected the candidate that limits the method to contracts and shares the binding rule. Its scratch implementation verified the pinned eager body and reproduced a shifted-prefix failure where length remained correct.

The implementation also checks that the receiver has an indexed length and records the stripped declaration's hash. A small recursive reader retains contract context through nested expressions. Executable-body support is deferred because the target's body does not require it.

## Alternatives considered

- A special prefix relation requires custom replay helpers and additional vocabulary for later slice properties.
- Explicit specification-index syntax requires translating contracts before replay.
- Free index constants lose the universal formula's meaning under arbitrary Boolean polarity.
- Bounded unrolling proves only a restricted property.
- Moving array views to SMT aggregate theories changes more code than this property requires.

## Tradeoffs and limits

Quantified preconditions and nested contracts can exhaust the solver budget. Offset index arithmetic retains JavaScript floating-point semantics and can also return `unknown`. The callback subset excludes the third array parameter, `thisArg`, and general truthiness conversions.

The proof trusts the source translation and solver. Independently checked proof certificates, reference identity, wrapper dispatch, and lazy pipelines remain separate work.

## Verification

Run `make test-verify` for behavior tests. Run `node verify/examples/remeda/check.mjs` for the offline upstream proof and intentional mutation check. The fixture records its upstream commit and file hash; the runner also checks the extracted declaration hash before attaching contracts.
