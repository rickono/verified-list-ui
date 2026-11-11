# G: shared heap identity and checked frames

Validation is in progress on `feat/heap-alias-frames`, based on H commit
`37355cc`. The final delivery will be stacked on H's PR #5. No integration or
merge is claimed. [Design and scope](../design/heap.md).

The implementation covers shared record/array identities, shallow-copy freshness,
required primitive field and fixed-length array writes, entry snapshots,
per-store permissions, opaque helper frames, derived callback effects and native
shared-witness replay. Mutating loops and stateful callbacks remain unsupported.

## Evidence so far

- The first full run passed 237/239. Both failures were the same original
  conformance fixture: fixed string record keys were being interpreted as data
  literals. The lookup path was corrected.
- Focused conformance and heap checks then passed 23/23: 58 original fixtures,
  574 functions, 667 native samples and 20 independently reproduced
  counterexamples. All 12 original and three heap-specific verifier mutations
  were detected. Heap-specific native replay is separate from the original
  corpus and restores alias paths without importing heap/replay code.
- The Remeda shifted-prefix test initially returned unknown on its length
  obligation. Isolated queries identified the regression. Checked integer range
  metadata now works through heap length references and exact natural slice
  clamping; the length obligation proves and the content bug reproduces. No
  proof bound, weaker query or solver tactic was added.
- Optional shape overlap, nested sharing, signed zero, no-op/restored writes,
  helper frame inclusion, call-result aliases, `old` identity and primitive
  capture snapshots have source-level checks. Fixed-shape domain changes and
  malformed worker payloads have separate replay/protocol checks.

The final full rerun, CLI examples and independent code review are pending.
Counts and commands below will be completed before publication.

## Limits and trust

Array lengths and record shapes stay fixed. Reference stores/rebinding, optional
field writes, arrays of references and cyclic data types are unsupported. Writing,
allocating or reference-returning helper calls inside loops are rejected.

The parser, translation, solver, typed graph transport and native replay monitor
remain trusted. Input-graph proxies record attempted writes; raw new allocations
retain native identity. If a transient write to an unmonitored fresh object
cannot be observed, its abstract failure remains unknown. Graph/array witness
limits affect materialization only, never proof domains. See the design for
precise `old` semantics and the visible input-domain assumptions.
