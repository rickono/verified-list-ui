# Proving es-toolkit's empty-array sum and mean

This fixture proves the documented empty-array results of unchanged `sum` and
`mean` from es-toolkit v1.53.2
([commit 1913a76](https://github.com/toss/es-toolkit/tree/1913a7627a2995b095249d6b0b6453b900cdd4bc/src/math)).
The same bytes are still present on main at `4d5963e`. The raw sources, their
upstream specs and the MIT license are stored here. `provenance.json` records
their sizes and SHA-256 hashes, plus each exported declaration's hash.

Run the proof, the wrong claims and the seeded bug offline:

```sh
node verify/examples/es-toolkit/check.mjs
node --test --test-concurrency=1 tests/verify/es-toolkit-sum-mean.test.mjs
```

Each verification request has a 60-second budget. A timeout fails the checker;
it never counts as a proof or a detected bug.

## The claim

For every dense array of binary64 numbers the verifier models, including NaN,
infinities and both zero signs, and of any native length:

- an empty input makes `sum` return `+0`, not `-0`;
- an empty input makes `mean` return NaN.

`mean` is proved through its original `import { sum } from './sum.ts'` and
`sum`'s checked contract. The loop terminates for every length.

Nonempty results are not claimed. That excludes singleton identity, the real
number sum, rounding error bounds, the upstream concatenation test and the
average. The binary64 samples below show why several of those would be false.

## Annotations

The checker inserts only `//` comment lines into the pinned bytes. The function
bodies, imports and type annotations are unchanged; Node erases the types.

```ts
// ensures nums.length !== 0 || Object.is(result, 0)
export function sum(nums: readonly number[]): number {
  let result = 0;

  // invariant i !== 0 || Object.is(result, 0)
  // invariant Number.isInteger(i) && 0 <= i && i <= nums.length
  // decreases real(nums.length) - real(i)
  for (let i = 0; i < nums.length; i++) {
    result += nums[i];
  }

  return result;
}
```

```ts
// ensures nums.length !== 0 || Number.isNaN(result)
export function mean(nums: readonly number[]): number {
  return sum(nums) / nums.length;
}
```

The accumulator keeps its upstream name, `result`. In the invariant, `result`
is that live body local. In `ensures`, `result` is still the returned value.
The verifier admits this name only for ordinary body-local declarations; see
the [local `result` report](../../reports/roadmap/local-result.md).

The checker proves the annotation is the only change. Removing the inserted
lines recovers the pinned bytes and hash. Both the TypeScript token stream and
the type-stripped token stream are identical to the original.

## Checks

| Check | Expected outcome |
| --- | --- |
| Annotated `sum` and `mean` as a two-file project | both `verified`; module hashes match the annotated text |
| `sum` weakened to `ensures nums.length !== 0 \|\| !Number.isNaN(result)` | `sum` verified, `mean` `unknown/contract-gap` |
| `sum` claims `Object.is(result, -0)` on empty input | confirmed counterexample `[]`; native `+0` |
| `mean` claims `Object.is(result, 0)` on empty input | confirmed counterexample `[]`; native NaN |
| `sum` mutated to `return result + 1;` | confirmed counterexample `[]`; native `1` |

Each counterexample is re-executed by native V8 on the unchanged, or mutated,
upstream module text, loaded through Node's own type stripping. The reported
return value must match and must violate the claim.

The checker also requires the upstream spec expectations to be present, and
runs 11 native samples. They cover the spec values (`10`, `+0`, `-2`, the
empty concatenation case, `3` and NaN) and binary64 edges. `sum([-0])` is
`+0`, `sum([NaN])` is NaN and `sum([Infinity, -Infinity])` is NaN.
`sum([0.1, 0.2])` is `0.30000000000000004`, and `mean([-0])` is `+0`. These finite
samples describe behavior. They do not extend the proof.

## Trust

The parser, type stripping, translation, Z3 and the replay runtime remain
trusted. Loop invariants are checked by the solver, not by native replay. No
independent proof certificate is produced.
