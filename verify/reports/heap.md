# G: shared heap identity and checked frames

G is implemented on `feat/heap-alias-frames`, based on H commit `37355cc`
and stacked on [H's PR #5](https://github.com/rickono/verified-list-ui/pull/5).
Neither branch is claimed as integrated. [Design and scope](../design/heap.md).

Shared record/array identities, shallow-copy freshness, required primitive field
and fixed-length array writes, entry snapshots and per-store permissions compose
through helper calls. Effects are derived before admitting callbacks. Native
counterexample replay preserves sharing.

## Final evidence

`make test-verify`: **249/249 passed**, with zero failures, cancellations or skips.
The run covered the final source tree; subsequent changes only update reports
and the roadmap. Nineteen changed JavaScript modules passed syntax checks.

The suite includes 24 heap tests, two independent heap corpus/mutation tests and
two new safe-integer representation edge tests. Existing Remeda composition,
imports, prefix and project fixtures pass, as do the unchanged Lodash and Ramda
search proofs and their implementation mutants.

The original conformance corpus covers 58 fixtures, 574 functions, 667 native
samples and 20 independently reproduced counterexamples. Its twelve verifier
mutants are detected. The separate heap corpus covers eight fixtures, twenty
native samples and five independently reproduced counterexamples; all four
heap-specific verifier mutants are detected. Alias restoration and the native
oracle do not import the heap encoder or production replay code. These finite
checks provide conformance evidence rather than a proof of the translator.

The CLI verifies all six functions in `heap.ts`. Both JSON and text output
reproduce all three deliberate failures in `heap-bugs.ts`, including alias
groups, an observed restored write outside the frame, and an out-of-bounds
array store. The combined command exits 1 as expected.

Reproduce the checks from the repository root:

```sh
make test-verify
node verify/conformance/heap.mjs --mutations
node verify/bin/jsverify.mjs --json --timeout 60000 verify/examples/heap.ts
node verify/bin/jsverify.mjs --json --timeout 60000 verify/examples/heap-bugs.ts
node verify/bin/jsverify.mjs --timeout 60000 verify/examples/heap.ts verify/examples/heap-bugs.ts
```

The deliberate failures exit 1. Local solver runs used the shared serial lane;
`make test-verify` also serializes test files.

## Corrections before publication

Independent Standards and Spec reviews found one false-verification defect and
two composition/replay defects in checkpoint `38a3c6d`. All were corrected with
public-API source regressions, and the false-verification defect has a verifier
mutation check. The worker now consumes the heap encoder's descriptor. A further
`old` aggregate regression and explicit array-length-footprint boundary are
covered. [Separate review findings and resolutions](heap-review.md).

Earlier combined runs exposed a fixed-string-key lookup bug and existing
Remeda proofs exhausting their budgets. The lookup was corrected. Immutable
length views, exact natural shadows under established requires, and redundant
slice clamps preserve the original domains while exposing useful integer facts.
Safe-integer edge checks retain -0, reach `Number.MAX_SAFE_INTEGER`, reject an
impossible unsafe bound as vacuous, and preserve requires-definedness ordering.
No solver tactic, weakened contract/query or bounded proof was added. The final
combined run above supersedes those failing intermediate runs.

## Limits and trust

Array lengths and record shapes stay fixed. Reference stores/rebinding, optional
field writes, arrays of references and cyclic data types are unsupported.
Writing, allocating or reference-returning helper calls inside loops are
rejected. Mutating loop induction and stateful callbacks remain future work.

The parser, translation, solver, typed graph transport and native replay monitor
remain trusted. Input-graph proxies record attempted writes; raw new allocations
retain native identity. If replay cannot observe a transient violation on an
unmonitored fresh object, the abstract failure remains unknown. Limits of 256
graph nodes and 256 elements per array constrain witnesses only. Full proof
queries retain native array lengths and unbounded identities. See the design for
precise `old` semantics and input-domain assumptions.
