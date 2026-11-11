# Proving Lodash's search helper

This fixture proves the unchanged `strictIndexOf` function from Lodash 4.17.21's
[npm-source commit](https://github.com/lodash/lodash/blob/c6e281b878b315c7a10d90f9c2af4cdb112d9625/_strictIndexOf.js).
The raw source and license are stored here. The checker extracts the declaration,
checks its hash, and inserts only proof comments. Removing those comments recovers
the exact declaration bytes; its JavaScript tokens must also match.

Run the proof and both seeded bugs offline:

```sh
node verify/examples/lodash/check.mjs
node --test --test-concurrency=1 tests/verify/upstream-search.test.mjs
```

Each verification request has a 60-second budget. A timeout fails the checker;
it never counts as a proof or a detected bug.

## The claim

Inputs are dense ordinary numeric arrays, a numeric target, and an integer
`fromIndex` in `[0, array.length]`. This includes empty arrays, starting at the
end, NaN, infinities and both zero signs. Every native array length is included
in the proof domain, up to `2^32 - 1`.

The result is an integer. It is either the first matching index at or after
`fromIndex`, or `-1` exactly when no such match exists. Equality is JavaScript
`===`: NaN never matches, and `0` matches `-0`. The loop terminates.

This is a proof of the internal numeric-array helper. Lodash's public `indexOf`
wrapper, its argument normalization, sparse arrays and arbitrary element values
are outside the claim. The CommonJS export wrapper is retained in the raw
fixture and exercised natively; the proof targets the extracted function.

## Why the loop needs an invariant

The upstream body starts one position before the requested range and increments
inside the test:

```js
var index = fromIndex - 1,
    length = array.length;

while (++index < length) {
  if (array[index] === value) {
    return index;
  }
}
return -1;
```

At the loop head, `index` is the last position examined. The checker inserts:

```js
// invariant Number.isInteger(index) && -1 <= index && fromIndex - 1 <= index && index < length
// invariant array.every((element, i) => i < fromIndex || i >= index + 1 || element !== value)
// decreases real(length) - real(index)
```

The prefix invariant says that positions from `fromIndex` through `index` have
no match. Initialization gives an empty prefix. A back-edge extends it by one
nonmatching element. A matching return is therefore the first match; exhausting
the array establishes absence. The exact real difference is nonnegative and
drops by one per back-edge. No iteration count is unrolled or bounded.

## Bug checks

Both mutations must produce a counterexample that fails a contract in the real
mutated source. The checker independently executes each reported input and
compares the result with native array `indexOf`.

| Seeded change | Small illustrating input | Wrong result | Correct result |
| --- | --- | --- | --- |
| Return `index + 1` | `[1]`, target `1`, start `0` | `1` | `0` |
| Ignore a match when `index === fromIndex` | `[1]`, target `1`, start `0` | `-1` | `0` |

These are deliberate mutations, not bugs discovered in Lodash. Solver witnesses
can be larger than these illustrations. Another trial mutation, initializing
`index = fromIndex`, first exposed an invariant failure on an input whose result
was still correct. That unconfirmed candidate was reported as an induction gap.

The raw CommonJS export also passes 261 independent V8 comparisons with native
strict search, covering duplicates, subnormals, extrema, NaN, infinities, signed
zeros and every valid start in the sampled arrays. These finite checks supplement
the universal proof; they do not establish it.

## Numeric translation and trust

The first direct proof attempt exhausted its budget at invariant initialization.
The verifier now carries exact integer information for bounded parameters and
loop counters that can be `-1`. A predecessor is represented as an unsigned
integer minus one; incrementing it recovers an exact unsigned index. Comparisons
use widened bitvectors to prevent wrap. Floating-point payloads remain available
for `Object.is`, preserving signed zero.

Parameter representations are linked to the original inputs only where the
original preconditions are defined and true. Loop representations require
explicit, checked integer and range invariants. Missing values disable the
shortcuts. Array and entry-rank preferences of 256 apply only to replay witness
searches, never to the proof domain.

The parser, translation, solver and replay runtime remain trusted. No independent
proof certificate is produced. See the [validation report](../../reports/upstream-search.md)
and [loop rules](../../design/loops.md).
