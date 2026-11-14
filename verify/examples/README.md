# Source verifier examples

These examples check ordinary TypeScript function bodies against `requires` and `ensures` comments. Some prove a property; others deliberately expose a bug. The verifier checks the supported input domain, rather than sampling a fixed set of inputs. Every reported counterexample must reproduce during replay.

From the repository root, with Node 22 or later and the pinned dependencies installed:

```sh
pnpm install --frozen-lockfile
node verify/examples/check-readme.mjs
```

The runner reads the snippets directly from this README and checks their expected verdicts. It exits 0 when all examples behave as described, including the deliberate failures. To inspect a snippet's full report, save that block to `example.ts` and run `pnpm verify --json --timeout 60000 example.ts`. The CLI exits 1 for a counterexample.

## Doubling can fail an equality contract or overflow

The implementation looks trivial. But `number` includes `NaN`, and `NaN === NaN` is false. Even a finite input can overflow: `Number.MAX_VALUE * 2` is infinity.

<!-- verify: badEquality=counterexample badOverflow=counterexample double=verified -->
```ts
// ensures x * 2 === result
const badEquality = (x: number) => x * 2;

// requires Number.isFinite(x)
// ensures Number.isFinite(result)
const badOverflow = (x: number) => x * 2;

// requires Number.isFinite(x)
// requires Math.abs(x) <= Number.MAX_VALUE / 2
// ensures Number.isFinite(result)
// ensures result === x * 2
const double = (x: number) => x * 2;
```

`badEquality` and `badOverflow` produce counterexamples. `double` verifies under its explicit bounds. Its equality describes JavaScript multiplication; it does not claim exact real arithmetic.

## Exact decimal arithmetic exposes rounding

`real(number)` embeds the exact value of a finite binary64 number. `real("0.3")` means the exact fraction 3/10. They let a contract distinguish a rounded runtime calculation from the mathematical result.

<!-- verify: roundedSum=counterexample decimalSum=verified -->
```ts
// ensures real(result) === real("0.3")
const roundedSum = () => 0.1 + 0.2;

// @spec
// ensures result === real("0.3")
const decimalSum = () => real("0.1") + real("0.2");
```

`roundedSum` fails with result `0.30000000000000004`. `decimalSum` verifies as an exact, specification-only definition. The `@spec` function is checked, not accepted as an axiom. Its rational values cannot enter runtime JavaScript bodies.

## A correct length can hide the wrong array contents

Both slices below return two elements when the input has at least three. Only one preserves the prefix. For `[10, 20, 30]`, the shifted version returns `[20, 30]`.

<!-- verify: firstTwo=verified shifted=counterexample -->
```ts
// requires values.length >= 3
// ensures result.length === 2
// ensures result.every((value, index) => Object.is(value, values[index]))
const firstTwo = (values: number[]) => values.slice(0, 2);

// requires values.length >= 3
// ensures result.length === 2
// ensures result.every((value, index) => Object.is(value, values[index]))
const shifted = (values: number[]) => values.slice(1, 3);
```

`firstTwo` verifies. `shifted` produces a counterexample to the element contract while its length contract holds. `Object.is` preserves `NaN` and distinguishes signed zeros. These proofs have no small-array bound: every legal JavaScript array length satisfying the precondition is included, under the dense-array assumptions.

For a real upstream target, the [pinned Remeda checks](remeda/check.mjs) verify the unchanged eager `take` body and catch a shifted-slice mutation. [The import check](remeda/check-imports.mjs) also composes it across files and demonstrates how weakening a helper contract loses a caller's proof.

## Helper contracts make missing assumptions visible

The wrapper must establish the helper's preconditions before using its guarantee. A checked specification gives the range property a reusable name; `Bounds` is an ordinary supported type alias.

<!-- verify: inRange=verified clamp=verified percentage=verified unsafePercentage=counterexample -->
```ts
type Bounds = { min: number; max: number };

// @spec
// ensures result === (value >= bounds.min && value <= bounds.max)
const inRange = (value: number, bounds: Bounds) =>
	value >= bounds.min && value <= bounds.max;

// requires Number.isFinite(value)
// requires bounds.min <= bounds.max
// ensures inRange(result, bounds)
const clamp = (value: number, bounds: Bounds) =>
	value < bounds.min ? bounds.min : value > bounds.max ? bounds.max : value;

// requires Number.isFinite(value)
// ensures result >= 0 && result <= 100
const percentage = (value: number) => clamp(value, { min: 0, max: 100 });

// ensures result >= 0 && result <= 100
const unsafePercentage = (value: number) => clamp(value, { min: 0, max: 100 });
```

The specification, helper and guarded wrapper verify. `unsafePercentage` fails at the helper call because it permits nonfinite arguments. For example, `NaN` violates `clamp`'s first precondition. Runtime helper bodies are checked independently; callers use their contracts instead of inlining them. A caller is verified only if its dependencies also verify.

## Local updates keep entry values and evaluation order

`old(x)` refers to the entry argument. The local copy can change without changing that snapshot. Postfix `value++` returns the previous value, which makes the second function's contract wrong.

<!-- verify: step=verified wrongIncrement=counterexample -->
```ts
// ensures Object.is(result, up ? old(x) + 1 : old(x) - 1)
const step = (x: number, up: boolean) => {
	let value = x;
	if (up) { value++; } else { value--; }
	return value;
};

// requires Number.isSafeInteger(x)
// requires x >= 0 && x < Number.MAX_SAFE_INTEGER
// ensures result === old(x) + 1
const wrongIncrement = (x: number) => {
	let value = x;
	return value++;
};
```

`step` verifies, including nonfinite inputs and signed zeros. `wrongIncrement` produces a counterexample even within the safe-integer bounds: at `x = 0`, it returns 0 instead of 1. Returning `++value` fixes that example. Parameters themselves cannot be assigned, and `old` does not provide mutable-heap verification.

## What these results mean

`verified` means the property holds within the supported semantics and stated assumptions, trusting the frontend, encoding, Z3 and replay machinery. These are not Rocq-checked proof certificates. Dense arrays and plain records have explicit environment restrictions. General heap mutation, loops, async code and arbitrary TypeScript remain unsupported. A timeout or incomplete proof is `unknown`, never success.

See [the verifier reference](../README.md) for supported syntax, input assumptions, result meanings and the trust boundary.
