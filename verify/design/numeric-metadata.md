# Exact signed numeric metadata

`data.mjs` owns the numeric metadata rules. The binary64 `smt` term remains
authoritative, including its zero sign. Metadata is a derived expression, never
a new symbol, assertion, assumption, proof bound, or replacement arithmetic term.
This extends E's natural/predecessor views. It does not enable heap-writing loops
or complete E or K.

The signed representation comes from candidate A, commit
`d9c22c63c5ae15d8f38d6f6873a9f3b779c53a31`, authored by Rick with Claude Opus 5.5.
The production port adds half-integer joins and equality, preserves unary views,
and drops every numeric cache on a possibly absent merge. Candidate files remain
unchanged. The review at `e581b4134b845b98387ad9f0f92f98d2e9093064` requires
the width cap and the index range guard.

## Invariant and width argument

An `int` shadow has unsigned `pos` and `neg` components of width `w`, and
`low`, a 32-bit expression. A `halves` shadow has the same components without
`low`. Both require a present, finite number and `w <= INT_WIDTH = 53`.
Their exact numerical denotations are `pos - neg` and `(pos - neg) / 2`.
Integer `low` equals `(pos - neg) mod 2^32`, including negative values.

These are mathematical bounds for every admitted width, independent of the
solver experiments. For unsigned width `w`, each component lies in
`[0, 2^w - 1]`. Thus an integer shadow has absolute value at most `2^w - 1`.
A half-integer shadow has absolute value at most `(2^w - 1) / 2`. At `w <= 53`,
the former is a safe integer and the latter is an exactly representable multiple
of one half below `2^52`. Zero may have either sign.

The constructors preserve the invariant as follows:

- Lifting an existing exact natural uses `(natural, 0)`. Lifting its predecessor
  uses `(natural, 1)`. Those existing views already denote finite exact integers.
- Arithmetic pairs reserve one carry bit: `w = max(input widths) + 1`. Each
  component sum is at most `2^w - 2`, so unsigned BV addition cannot wrap.
  Addition combines positive with positive and negative with negative.
  Subtraction exchanges the second operand's components. The resulting bound
  makes native binary64 addition or subtraction exact. If `w > 53`, metadata is
  dropped before performing a shortcut. The original rounded FP term remains.
- Comparing `p - n` with `q - m` compares the unsigned sums `p + m` and `q + n`.
  The same carry bit prevents either sum from wrapping. Equality uses the same
  identity. Half-integers use this identity after both operands share denominator
  two. Comparisons conservatively keep the same 53-bit cap.
- Lifting an integer to halves zero-extends one bit before shifting left by one.
  The doubled component is at most `2^(old width + 1) - 2`. The shift cannot
  discard a bit. A lift beyond 53 bits is refused.
- Division by the present literal two copies an integer's components into a
  half-integer shadow. Division is exact, with no subnormal underflow. This rule
  conservatively requires the input width to be strictly below 53. Subsequent
  half-integer addition and subtraction use the carry-bit rule above.
- Unary plus preserves a present numeric view. Unary minus swaps the signed
  components and negates `low` modulo `2^32`. The FP term still computes the sign.
- A merge selects components with the same condition as the FP term. It only
  zero-extends to the maximum branch width; selection needs no carry bit.
  Integer/half-integer merges first lift the integer to denominator two.
  Any uncertain branch or uncertain presence drops the metadata.

The inherited natural/predecessor comparison can use a 54-bit comparison
workspace for a 53-bit natural. Moving both operands above a common offset
adds at most one, giving at most `2^53`. That extra carry bit prevents wrap.
It is an existing comparison expression, not a wider numeric result shadow
or a native FP addition whose rounding is omitted.

`Object.is` always uses the original FP terms. Numeric equality may identify
both zeros. No integer shortcut applies to NaN, infinity, a fractional value
without an exact half shadow, or an optional value whose presence is uncertain.
`Number.isInteger`, `Number.isFinite`, and `Number.isSafeInteger` can use an
integer shadow. Half-integer builtin checks retain the FP path. `Math.abs`,
multiplication, and divisions other than the stated rule discard the shadows.
No rule changes fallback FP semantics.

## Index boundary

Modulo bits are private to `data.mjs`; they are never assigned to `u32`.
Truncation or zero-extension obtains modulo bits. Low-bit addition,
subtraction, and negation intentionally wrap in arithmetic modulo `2^32`.
The corresponding integer operations preserve congruence; a conditional selects
the same branch's congruence. These low-bit operations claim no unsigned range.
A signed read widens components and length to `max(w, 33)`, checks `neg <= pos`, and checks
`pos - neg < length`. The first check makes subtraction nonnegative and exact
in that width. Under both checks the difference lies in `[0, length)` and below
`2^32`, so its modulo bits are its exact index. Otherwise the read is undefined.
The same merge preserves optional array elements.

The source compiler's existing straight-line store obligation remains intact.
It uses the FP-to-index conversion after checking presence, integrality,
nonnegativity, and length. No source store consumer is added here. Loop writes
remain unsupported.

## Evidence limits

The report `verify/reports/roadmap/numeric-metadata.md` records executed public
proofs, native boundary replays, private mutants, and solver validity queries.
Symbolic queries relate shortcuts to original FP terms for their stated widths.
Small widths and native samples are not a proof for every width. A solver
timeout is an open solver obligation; the general range argument above is a
separate mathematical argument within the trusted source-to-SMT translation.
