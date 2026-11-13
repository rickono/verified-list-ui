# Review: Gate 1 exact numeric metadata

**Verdict: ISSUES.** Accept the `data.mjs` rules with the limits below. No executed run falsely verified a native failure. N12's timeout is a solver search miss on a query the final encoding still falsifies. It is not an unsafe acceptance. Open validity queries and translator trust remain. This note does not mark E or K complete, and it does not admit heap-writing loops.

| | |
| --- | --- |
| Reviewed parent | `eaf23c0ca4a2e61e9d844a84a876755872eb16e7` |
| Implementation | `4c40e079bd82b23f90ff8eb2e9cadadf39cd2526` |
| Evidence commit | `b00b08ea36bb64d0c08c5814c8e70d9e5220481a` |
| Production baseline | `32bd5b260aa116ca88642a1479bed8d3fc447f4b`, an ancestor of this review checkout |
| Candidate context | `d9c22c63c5ae15d8f38d6f6873a9f3b779c53a31` and judgment `e581b4134b845b98387ad9f0f92f98d2e9093064` are sources, not production acceptance |
| Review checkout | `/Users/rick/.t3/worktrees/verified-list-ui/t3-4c86761c`, branch `t3/review-numeric-metadata` |
| Final `verify/data.mjs` | `63f39ff7edc16e4e4d7f0eef3563c9d7f84d63cef0a475239dfe98f32173c5f6` |
| Unchanged `source.mjs` / `heap.mjs` | `38bbea4deee14933640511a90336142d1d1bde67793c4ae0f752ced597c52e2e` / `3a833de64dca47275accc84371a451f84ba5905fea618ffe2935149269e50f9a` |

`verify/` exists. Production behavior changes only in `verify/data.mjs`. Node is `v22.23.1`. This run's solver backend reported `z3`.

## Mathematical review

Metadata is a derived expression. The binary64 term stays in the formula. No constructor adds an assertion, an assumption, or a proof bound. The invariant is numerical equality for a present finite value. Either sign of zero may sit on the FP term. `Object.is` uses that term.

An integer shadow denotes `pos - neg`, components in `[0, 2^w - 1]`, `w <= 53`, hence a safe integer. A half shadow denotes `(pos - neg) / 2`, absolute value at most `2^52 - 0.5`. Both sets are binary64-exact. Correctly rounded `fp.add`, `fp.sub`, and division by two equal the real result when that result is representable. Shortcuts fire only then. A failed width check leaves the rounded term and drops the shadow.

From `4c40e07`:

- `intOf` lifts `integerOf`: a natural is `(bitvector, 0)`; a predecessor and literal `-1` are `(bitvector, 1)`. Widths above 53 are refused. Other negative literals stay on the FP path.
- Carry-1 `signedPair` uses `w = max + 1` and refuses `w > 53`. Each widened component is at most `2^{w-1} - 1`, so a sum is at most `2^w - 2` and does not wrap. Carry 0 only zero-extends and selects. Addition pairs like components; subtraction swaps the second pair. Order and equality compare the cross sums `p + m` and `q + n`. Subtraction builds a signed result from two naturals; addition does so only when one side already has `.int`.
- `halvesOf` zero-extends one bit and shifts left by one. The doubled value is at most `2^{w+1} - 2`, so no bit is lost. A lift past 53 is refused. Division by literal two copies components only when the integer width is strictly below 53. The quotient of a 53-bit integer is itself exact; this stricter cut is sound and leaves some exact quotients on the FP path. Mixed denominators lift the integer, or drop the shadow if the lift does not fit.
- Unary plus returns a present number unchanged. Unary minus swaps components, `bvneg`s `low`, and keeps `fp.neg`, so a zero's sign stays on the FP term.
- Merge copies `int` and `halves` only when `present` is exactly `true`. Uncertain presence also drops `u32` and `nat`.
- `Number.isFinite`, `Number.isInteger`, and `Number.isSafeInteger` may return true from an integer shadow, which is already a safe integer. Halves keep the FP predicate. `Math.abs`, multiplication, and any other division emit a bare FP term.

Low 32 bits are a congruence from extract-or-extend, wrapping `bvadd` / `bvsub` / `bvneg`, and `ite`. They are not written to `u32`. A signed read widens to `max(width, 33)`, requires `neg <= pos`, and requires `pos - neg < length`. The first check makes `bvsub` exact. Widened length is below `2^32`, so the difference is in `[0, 2^32)` and equals `low`. Otherwise `present` is false. `2^32` and `-2^32` fail it; both have low bits 0. `merge` may still put the element term in `smt`, because the absent arm copies that payload and equal arms collapse. Definedness is `present`. `need` supplies NaN when it is false. The executed out-of-range reads do not treat the payload as in bounds.

The unchanged store checks presence, `Number.isInteger`, `>= 0`, and `< length`, then uses `(_ fp.to_ubv 32) RTZ` unless a real `u32` cache exists. The predicates may see an integer shadow. The stored bits do not. A passing check means an integer in `[0, length)`, so the conversion equals `low`. N19 executes the `2^32` case.

`integerPair` is the existing comparison workspace, with offsets 0 and -1 only. Different offsets add one bit. A 53-bit natural compared with a 53-bit predecessor emits boolean `(= (bvadd ((_ zero_extend 1) nat) (_ bv1 54)) ((_ zero_extend 1) pred))`. Adding or subtracting two 53-bit naturals creates no numeric shadow. That 54-bit add is not an FP result.

`verify/design/numeric-metadata.md` matches these constructors. The argument is an invariant of the emitted terms, under trust in SMT-LIB RNE binary64. It is not an SMT axiom and not a translator proof. Width-2 `unsat` does not extend it.

## Own execution

Solver work went through `serial-verify.py` on `git archive` of `b00b08e`. The archive and its `node_modules` link are gone. No candidate or production worktree was edited. Log: `logs/probes.jsonl`.

Native samples of `((n/2)+1)-(n/2)` return `1` at `2^51-1`, `2^52-1`, `2^52`, `2^53-3`, and `2^53-2`, and `0.5` at `2^53-1`. Direct division keeps a width-52 half and refuses a width-53 natural. Cancellation keeps a half at input widths 40 and 51 (result widths 42 and 53) and drops it at 52. A difference of two width-52 naturals is already width 53, so dividing it drops the shadow too.

| Check | Own result |
| --- | --- |
| N01 | Confirmed counterexample at `9007199254740991` |
| N03, N08, N18, N22 half, N22 infinity, N23, N27, N41 | Confirmed counterexamples |
| N14, N21b, N24, N28, nested merge | Verified. N21b includes native NaN |
| N17 control, N19 | Confirmed counterexamples. N19's failed check is `store-domain`; native `2^32` does not change `xs[0]` |
| N21 | Confirmed counterexample. `NaN === NaN` is false |
| `isInteger(n/2)`, `isSafeInteger(n/2)` | Confirmed counterexamples. Halves stay on the FP predicate |
| N02 cap 64, N17 guard deleted | Each control is a confirmed counterexample; each mutant verifies and is killed |

Mutant sources hash to the production `data.mjs` digest above. Cap-64 mutant `e62e06ac83ecae82e8b4a299de7aa0331f6b6f2b1955932f77a07e901a97b879`. Guard mutant `a66ee0fd8e525f4b0f958a3612dbba92bbc62c0c0bef026af5861a6e89944055`. No own case was falsely verified. `Object.is(-0, 0)` stays FP equality. Numeric `===` of those zeros is the bit-vector cross sum.

## N12

Source, final and baseline queries, and both corpus rows are in the evidence commit. Requires are four `u32` values and one nonnegative safe integer. The body is `((a-b)+n === (c-d)+n) && a-b !== c-d ? 1 : 0` with `ensures result === 0`.

Own native runs: `[2, 0, 1, 0, 9007199254740991]` returns `1`, and so does the baseline witness `[268505086, 134287360, 1610550338, 1476332610, 9007199120693249]`. Both violate `ensures result === 0`. `2 + (2^53-1)` rounds to `2^53`; `1 + (2^53-1)` is exactly `2^53`; the unrounded differences are `2` and `1`.

The final obligation is mixed (`2,251,560` bytes on this archive). `a - b` is a width-33 integer, so `!==` is an exact width-34 bit-vector comparison. `(a-b)+n` needs width 54, the shadow is dropped, and the outer equality is `fp.eq` of `fp.add`. The drop is required. Inherited `comparison.json` records the obligation and verdict change. Judgment `e581b41` timed out on both trees at 20 seconds. This evidence commit's baseline then found a confirmed counterexample, and its final tree returned `unknown` / `request-timeout` at the same budget. All three records stand. None is `verified`.

Own diagnostic, same 20-second budget: the final postcondition obligation plus pins for each witness and its FP bits is `sat` for both witnesses. The encoding admits those failures. A pin is not a proof that every counterexample is found, and it was not added to production. The unpinned search miss does not show bad metadata. This review did not rerun that search, retry it, or time a distribution. One inherited sample supports no speed claim.

## Inherited evidence, checked and not rerun

`SHA256SUMS` at `b00b08e` matches 170 files and 0 failures, including both `data.mjs` hashes, the compressed queries, and the validity SMT. Focused log: 65/65. Full suite: 273/273, none skipped. Each corpus has 48 sources and 0 `falseVerified`: baseline 33 confirmed counterexamples, 12 verified, 3 unknown; final 33 confirmed, 14 verified, 1 unknown (N12). Validity attempts each of 38 queries once: 15 `unsat` (11 at width 2, plus `signed-order` and `half-equality` at widths 32 and 50), 23 `unknown`, 0 `sat`, 0 error. A timeout is not evidence of bad metadata. Width 2 is not a generic proof.

## Limits

Root can accept this `data.mjs` change with these limits recorded. No further production encoding is recommended from this review.

- N12 is `unknown` on the final tree at 20 seconds. Native failures and pinned `sat` results still falsify the contract.
- Twenty-three symbolic obligations are unproved. The range argument covers them only as mathematics inside the trusted translation.
- Nothing here proves the compiler, the SMT theory, or every width.
- Heap-writing loops stay unsupported. E and K are not complete.
- No canonical roadmap, audit, push, PR, merge, or comment was made.

## Commands

```sh
git archive b00b08ea36bb64d0c08c5814c8e70d9e5220481a | tar -x -C /tmp/nm-review-src
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/review-numeric-metadata/scripts/probes.mjs /tmp/nm-review-src verify/reports/roadmap/review-numeric-metadata/logs/probes.jsonl
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --input-type=module -e '<N19 program>'
shasum -a 256 -c verify/reports/roadmap/numeric-metadata/SHA256SUMS
```

The checksum command ran inside the archive and reported 170 OK. The N19 invocation was inline `node --input-type=module -e` against `/tmp/nm-review-src`, appending the last `probes.jsonl` row. `scripts/n19.mjs` preserves that program and was not executed a second time.
