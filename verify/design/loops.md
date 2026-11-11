# Loop induction

Annotated `while` and C-style `for` loops use induction over local scalar state. Proof queries cover every input allowed by parameter types and requires, including every native dense-array length. The compiler does not unroll loops or assume that they run at most a fixed number of times.

## Usage

Each loop has zero or more `invariant` lines and exactly one `decreases` line immediately above it. Missing invariants mean `true`, which is usually too weak. Contracts can use the supported specification expressions, local bindings visible at the loop head, and checked `@spec` definitions.

```ts
// ensures result === -1 || (0 <= result && result < values.length && values[result] === target)
// ensures result !== -1 || values.every((value) => value !== target)
function indexOf(values: readonly number[], target: number) {
	// invariant Number.isInteger(i) && 0 <= i && i <= values.length
	// invariant values.every((value, index) => index >= i || value !== target)
	// decreases real(values.length) - real(i)
	for (let i = 0; i < values.length; i++) {
		if (values[i] === target) return i;
	}
	return -1;
}
```

The [executable example](../examples/loops.ts) also specifies first-match behavior and includes a counting loop with `continue`. Its counting contract proves an integer result between zero and the input length; it does not claim an exact count formula.

Search uses native `===`: `NaN` never matches, and the two signs of zero compare equal.

`old(...)` in invariants and measures reads function-entry parameters, as in ensures. It cannot capture a loop-local variable or refer to the state at the previous iteration. Parameters and input collections remain immutable.

## Proof rules

The compiler checks the invariant's value and definedness at entry, before assuming the invariant or reading any later helper facts. It then replaces every syntactically written outer scalar with an arbitrary loop-head value. Writes in false-guarded branches and to shadowed names are conservatively included. Reference writes remain unsupported.

An abstract iteration assumes the invariant as a path guard. It evaluates the test and body in JavaScript order. Every normal back-edge and `continue` executes the `for` update, then checks invariant preservation and the termination measure. `break` keeps its actual path and values, without executing the update. Scope exit restores shadowed bindings on all these paths. Each return checks ensures and specification definedness under that return's own guard and value.

Initialization, helper calls, preservation and rank checks are ordered events. An event can use earlier helper guarantees, but cannot use its own or a later helper's guarantee. Invariants never enter the function's requires or the global helper-fact list. Every obligation remains independently scheduled by the existing backend.

Loop-head values retain declaration identity. If an iteration can make a number or boolean absent, trial compilation widens that binding to optional and repeats until no further widening is needed. Trials isolate events, declarations, dependencies and checks. Only the final trial is committed.

## Termination and numeric fidelity

Every back-edge requires a finite, defined measure that starts nonnegative and decreases by at least one exact unit. These rules exclude infinitely many back-edges. Strict real decrease alone would allow arbitrarily small steps and is insufficient for this rule.

A number-valued measure `e` means the exact embedding of the already-rounded JavaScript result, `real(e)`. Only explicit real-valued arithmetic is linearized. For example, `decreases n - i` and `decreases real(n - i)` agree. They differ from `decreases real(n) - real(i)` when the subtraction rounds. The tests include a large `n` where that distinction changes whether the proposed rank drops.

`specifications.mjs` owns exact linear forms, cancellation and directed-rounding thresholds. It uses a bitvector sum only when an exact numeric shadow survives. Otherwise thresholds use explicit rounding toward positive or negative infinity, or exact real arithmetic. Other real expressions retain their exact SMT meaning and may time out.

An invariant can establish that a written number is an integer between zero and a u32 bound. The compiler then represents every admitted value with an exact unsigned bitvector and both possible zero signs. This representation requires unconditional integer, lower-bound and upper-bound conjuncts, all checked at initialization and preservation. Bounds can be stable array lengths, u32 literals or previously established bounded locals. Builtin matching uses lexical/module resolution.

Exact shadows propagate through nonnegative integer additions only while the sum fits 53 bits. Comparisons can use their bitvectors. `Object.is` keeps native signed-zero behavior, optional values cannot use stale shadows, and non-loop expressions retain their existing encoding. A counter that stalls at 2^53 cannot satisfy the rank obligation.

## Outcomes and replay

The original function body is replayed unchanged. An actual failed ensures or helper precondition can produce a confirmed counterexample. An abstract invariant or rank failure that the original execution does not reproduce is `unknown` with reason `induction-gap`, a phase, source location and candidate inputs. Candidate inputs are not described as confirmed bugs. A replay timeout remains `unknown`; it does not certify nontermination.

Full-domain queries do not assume a small starting rank. A model-readable flag describes whether the entry measure is at most 256. Its defining equality does not assert the bound. If a satisfying model violates that flag, the worker requests a separate witness search. Only witness searches assert the rank flag and existing array materialization limits. Precondition-definedness replay does not execute the body, so its queries omit rank preferences. If no manageable witness exists, the outcome is `unknown/witness-too-large`, never vacuous or verified. Coarse measures can prevent finding a small witness even for short executions. Invalid measures can still allow replay timeouts.

## Synthesis decision

The cutpoint design became the base because it keeps helper ordering and statement semantics in the existing compiler. Its prototype ran through `verify()` and replay. The alternative loop-summary design had solver-level probes but no end-to-end implementation and duplicated obligation ordering.

The implementation takes the alternative's witness-only starting-rank preference. It fixes the prototype's interpretation of bare arithmetic, moves rank lowering into the specification module, removes ablation switches, resolves builtin identities and isolates trial checks. Numeric shadow shortcuts are enabled only for values derived from loop cutpoints, which preserves the baseline encodings of loop-free programs.

## Supported scope and validation

This slice supports read-only arrays, local number/boolean updates, sequential loops, early returns and unlabeled `break` and `continue`. Nested loops, `do` loops, `for-in`, `for-of`, labels, `var` declarations inside loops and heap writes are rejected. Initialized outer `var` scalar bindings retain their existing behavior. Floating-point accumulators and mixed real/quantified proofs may exhaust the solver budget.

[Loop tests](../../tests/verify/loops.test.mjs) cover first-match search, the off-by-one mutation, false invariants, invalid measures, native versus exact arithmetic, stalling increments, optional widening, signed zero, jumps, helper ordering, definedness and witness bounds. Independent V8 fixtures exercise the original search body and reported witnesses. Two additional verifier mutants remove preservation and rank checks; both must be detected after their unchanged controls pass.

Run `make test-verify` for the combined suite, or `node --test --test-concurrency=1 tests/verify/loops.test.mjs` for the loop checks. The frontend, loop encoding, exact specification machinery, solver and runtime remain trusted. No independently checked certificates are introduced.
