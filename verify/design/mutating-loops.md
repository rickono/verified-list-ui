# Mutating loops: selection and implementation gates

Select candidate A (`d9c22c6`) with the corrections in the independent judgment
(`e581b41`). Reject candidate B (`ab2ba9c`) as-is. Its loop head forgets only the
function's permission frame, leaving writable fresh objects frozen; native
executions falsify claims that it reports verified. Neither prototype delivers K.

## Intended source behavior

Existing `invariant`, `decreases`, `modifies` and `old` contracts remain the
surface. A loop may change existing primitive array contents or required record
fields. The function's `modifies` clause checks permission at each attempted
store and each helper call. Fresh local storage remains writable.

The loop's changing contents are a separate fact. Derive them from every back
edge, including `continue`, using the heap's write history. Check invariant init
on the actual pre-loop heap; havoc the derived locations at the head, assume the
invariant, and prove preservation, exact rank decrease and all exits. Keep
return/break writes in their exit heaps. A fixed point grows the frame until no
new location or scalar optionality is discovered.

No loop-iteration or array-length bound enters a proof. A missing invariant fact
can produce an induction gap; a timeout stays unknown. A counterexample still
requires a real failure of the unchanged source in native replay.

## Gate 1: exact numeric metadata (E extension)

Implement and review the integer/half-integer rules independently of loop writes.
`data.mjs` owns them. Keep the binary64 term authoritative; auxiliary bitvectors
are derived expressions, never extra input assumptions or a replacement for
native arithmetic. Their invariant is an exact numerical equality to the
present finite FP value, within a range that guarantees every operation used by
the shortcut is exact. Discard metadata when the invariant cannot be established.

- Integer metadata represents `pos - neg`; half-integer metadata represents
  `(pos - neg) / 2`. Prove component widths, additions, shifts and comparisons do
  not wrap and stay inside the exact binary64 range.
- Keep the 53-bit cap. The wider mutant falsely verifies the safe-integer
  challenge `((n/2)+1)-(n/2) === 1` near `MAX_SAFE_INTEGER`.
- Preserve presence, NaN and both zero signs. Numerical comparisons may treat
  the two zeros alike; `Object.is` must continue using the original FP term.
- Low 32 bits are modulo bits, not an unconditional valid array index. Reads
  need a nonnegative, below-length guard; stores retain their domain obligation.
  Do not promote modulo bits to the existing unconditional `u32` cache.
- Every consumer must make that range obligation visible. Prefer the existing
  indexing boundary to a new unchecked alternate path.

Acceptance includes public source proofs and replay-confirmed negative cases
at 2^32, 2^53, signed zero, NaN, infinity and missing optional values. N01 must
remain a confirmed counterexample; N21b with `Object.is` must verify. N21 with
`===` can fail on NaN and is not a should-verify oracle. Private width/range
mutants must be detected as false verification or refused by a structural check.
Add focused arithmetic validity obligations against the original FP terms
where feasible, without treating sampled checks as universal evidence. Run the
full verifier suite at the final numeric tree. This gate does not admit loop
writes and does not complete K.

## Gate 2: heap write ownership and audit

This can be implemented independently of Gate 1. Keep loop writes unsupported
in the source compiler while preparing the heap boundary.

One heap owner records primitive stores, indexed stores, summary havoc and
conditional joins. The write history must include both arms of a symbolic join,
even when only one arm runs in a particular concrete execution. Allocations,
entry states and summary/head states keep their existing identities and roles.

Implement the missing `loopWrites` audit. A content-version change without a
matching location record must fail closed as an internal verifier error. Do not
make the audit simply read the same optional log it is meant to check. Prefer a
central version constructor/provenance record so new writers cannot silently
bypass tracking; derive the cutpoint set and audit it at that boundary. Check
record, array, havoc and join paths, including a no-op/restored store and a
fresh object. Keep allocator/shape/length changes distinguishable from permitted
content writes.

Mutation controls delete a writer's log record and a join arm's log record.
The audit must catch both. Default synchronous proof queries and native heap
behavior must remain unchanged. Focused heap/call/conformance tests and query
comparisons validate this preparatory unit; the combined K gate runs the full
suite again when its compiler consumer is added. No loop capability is claimed.

## Gate 3: compiler cutpoints and unchanged-source pilot

Start after the two enabling units are accepted. Reuse A's frame fixed point,
with audited write coverage and a real trial transaction. Discarded trials must
not publish declarations, events, checks, assumptions or heap-registry effects.
Fresh symbol names may advance monotonically. Document what remains shared and
why; do not claim there is nothing to roll back.

Write targets must be closed over the pre-loop state. Reject references chosen
inside a trial, nested loops, runtime allocations in the loop, length/shape
changes, reference stores and reference-returning calls with explicit spans.
Writing helpers keep the existing ordered requires/frame-inclusion checks; their
postconditions cannot discharge their own safety or invariant initialization.

The initial `old` form is A's entry snapshot, `old(xs.slice())[k]`. B's quantifier
index binding is a later, separately checked graft; never import its head havoc.

Acceptance covers the three fresh-local reproducers, aliases, sequential loops,
branch/short-circuit/ternary effects, test/update/call writes, return/break/continue,
permission failures and trial rollback. Honest gaps stay documented as unproved;
they are not advertised as caught bugs. Replace the outdated test that rejects
every writing loop with positive and negative assertions for the admitted scope.

Verify the unchanged pinned TheAlgorithms `Reverse` and reproduce lost-temp and
over-swap mutants. The short-bound mutant may be a confirmed failure or an honest
timeout, but never verified. Keep its two differing executed outcomes. Do not
quote the overwritten timing dump or claim a speedup from one run.

Keep this upstream source as an explicitly identified report/pilot fixture with
its GPL-3.0 license and exact provenance, separate from the existing MIT/ISC
product examples. Do not relicense it or present a rewritten kernel as upstream.
If an actual repository policy forbids that fixture, use another unchanged pin.

Run the final full suite, conformance/mutations and independent landing review
before changing K's integration state. Q still needs maintained real-code proofs
and reproducible real bugs beyond this enabling work.

## Synthesis rationale

A's actual source pilot, replayed failures and write-log ablations support its
architecture. B's native false proofs reject its architecture regardless of its
smaller patch. A still needs structural write ownership, trial rollback and
separate numeric acceptance. Candidate and inherited runs are evidence with
explicit provenance, not substitutes for production checks.
