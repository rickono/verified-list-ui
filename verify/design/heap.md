# Heap identity, aliases and mutation frames

## Usage

References may be shared across arguments and nested fields. Contracts can compare
them by identity and name the entry-reachable locations a function may write.

```ts
type Point = { value: number; label: number };

// modifies point.value
// ensures Object.is(point.value, value)
function setValue(point: Point, value: number) {
  point.value = value;
  return point;
}

// modifies left.value
// ensures Object.is(result, left === right ? value : old(right.value))
function shared(left: Point, right: Point, value: number) {
  setValue(left, value);
  return right.value;
}
```

`modifies point.value` grants write permission for that required primitive field.
`modifies values` grants permission for the existing elements of an array;
`modifies box.values` does the same for a required array field. Comma-separated
paths and multiple clauses form a union. Paths are evaluated at function entry.
No clause means an empty input footprint. Newly allocated storage is writable.

Permission is checked at **each store**, including no-op writes and writes later
restored. A caller must establish inclusion of its callee's declared footprint
before using the callee's facts. This is conservative: the callee may not actually
write every permitted location. An empty array has no element locations.

```ts
// requires values.length >= 2
// modifies values
// ensures Object.is(values[0], old(values[1]))
// ensures Object.is(values[1], old(values[0]))
function swapFirstTwo(values: number[]) {
  const first = values[0];
  values[0] = values[1];
  values[1] = first;
  return values;
}
```

## Identity, contents and entry state

`heap.mjs` owns the symbolic heap. A reference carries an unbounded integer
identity and a static shape. Immutable functions describe object kind, key
presence, field sort, nested reference identity, array length and element sort.
Primitive contents live in persistent versions of functions indexed by identity
(and by a 32-bit index for arrays). A store defines a new function with an `ite`
at the written location. The previous version remains unchanged.

Inputs have no blanket distinctness assumption. Shape constraints determine
compatibility: one `{ x: 0 }` can satisfy both `{ x: number }` and
`{ x: number; y?: number }`. Different primitive array types can share an empty
array. Fresh literals, object spread, array spread and `slice` allocate fresh
root identities and copy contents at creation. Record copies share nested
references. A fresh *symbol* for an opaque result does not imply fresh storage.

`old(e)` evaluates `e` in the entry heap. A reference result retains its original
identity: `old(a) === a`. Consequently `old(a.x)` is the entry scalar, while
`old(a).x` dereferences that identity in the current heap. This distinction also
holds during specification replay. Entry snapshots preserve sharing and map
snapshot objects back to their live identities. `old` still cannot name body
locals or a contract callback's local bindings.

`data.mjs` retains the scalar and collection operation algebra. Heap references
are focused into temporary value views at reads. Scalar reads and arguments are
frozen when evaluated; reference arguments retain identities whose contents may
reflect later arguments' writes. Computed keys run before their load. Method
receiver identity is evaluated before arguments, and `slice` copies contents
after those arguments. Branches and short circuits merge persistent heap states
under the same guards as values and call events.

Array lengths are immutable, so created array references can retain their exact
length view as a cache. Integer shadows are used only with established range
provenance. Explicit integer/nonnegative/array-length requires can establish a
u32 parameter; nonnegative `Number.isSafeInteger` requires establish the entire
53-bit safe-integer range. Both retain either zero sign and keep their links
guarded by the original requires and definedness. `slice` clamps exact natural
shadows with bitvectors. Other numbers retain the floating-point conversion
rules, with a redundant bitvector clamp exposing the native index range; NaN,
infinities and fractions keep their JavaScript behavior. These are representation changes,
not witness limits or additional assumptions.

## Calls, effects and proof obligations

`source.mjs` carries a heap state beside lexical bindings. Entry, current and
post-call summary states have explicit roles. Requires use the pre-call state;
callee ensures use the summary. Updating an uncommitted summary is rejected.
Transparent `@spec` calls establish their own read-only logical call scope.

Calls evaluate arguments first, prove parameter domains, requires and frame
inclusion under earlier guarded facts, then havoc only permitted contents. The
callee's ensures become a fact about that post-state. They cannot establish their
own safety or frame inclusion. Earlier facts keep referring to earlier versions,
so a later alias write cannot silently reuse a stale fact as a current read.
Feasibility remains the caller's explicit requires over its typed input domain.

A reference result may be reachable from an argument or newly allocated; that
rule applies recursively to its reference fields. It is never assumed distinct
from arguments. The supported module grammar has no module-level object storage
or ambient references. This rule must be revisited if such sources are admitted.
A helper's frame and ensures remain independently checked; final dependency
gating still requires every callee to verify after replay.

Effects are derived from direct stores, declared footprints and callees. Reads
and allocations also prevent admission as a heap-free named predicate. Pure
expression callbacks keep immutable primitive captures; `const k = box.value`
captures a scalar snapshot before later writes. Reference captures and stateful
callbacks remain unsupported. TypeScript `readonly` is still a type spelling,
not a separate permission system: explicit `modifies` clauses govern writes.

## Witness transport and replay

The solver extracts one graph from entry roots, preserving repeated identities.
`heap.mjs` supplies the worker with one encoding descriptor for function names
and tags; the extractor does not reconstruct those decisions.
`heap-witness.mjs` validates payload types at every reachable path, key sets,
edge targets, root identities and shared-node compatibility before interning
native objects. Invalid graphs produce `witness-invalid`, not bug verdicts.
Limits of 256 graph nodes and 256 elements per array apply only to materialized
witnesses. Full proof queries retain all native array lengths and unbounded
identity tags. Oversized or undecidable queries remain unknown.

Native bodies are unchanged. A canonical Proxy membrane around input-graph
objects records attempted writes, so unauthorized no-op and restored writes can
be confirmed. The admitted operations preserve reference equality through this
membrane. Helpers compare concrete footprint inclusion at their native call.
Snapshots also detect unpermitted final differences.

New native allocations retain their raw identity at call boundaries: wrapping
them there would change `===` against caller locals. A transient write to such
an unmonitored object cannot be confirmed from a final snapshot alone. If replay
does not observe the abstract violation, the result is unknown with reason
`frame-write`, `frame-inclusion` or `store-domain`. Dependencies are checked
separately. Replay is a trusted check, not a proof of the translator.

Reports keep ordinary JSON-safe input values and add `aliases` groups such as
`["left", "right"]` or `["a.items", "b.items"]`. The independent conformance
decoder restores sharing from those paths without importing heap or replay code.

## Scope and synthesis

The source-prototype design scored 14/18 against 9/18 for persistent per-reference
generation maps. It supplies the base. The other design contributes the reachable
or fresh result rule, empty-array type overlap and explicit state roles. Its
different-field-set distinctness axiom is rejected: it hid an executable alias
bug. Integration replaces final-state-only frames with per-write permission,
adds array state, typed graph validation and independent decoding, and removes
all prototype flags and mutation switches. Optional present-undefined values
retain their existing domain; review's proposed blanket tightening was unnecessary.

Writes are limited to required present primitive record fields and in-bounds
dense primitive array slots. Length/shape changes, key additions/deletions,
reference stores/reassignment, optional-field writes, arrays of references and
general cyclic structures are unsupported. Loops may read the heap and perform
scalar induction; heap-writing/allocating loop bodies and writing or
reference-returning helper calls inside loops are rejected explicitly. Mutating
loop induction and stateful callbacks are future work.

Run [the examples](../examples/heap.ts),
[deliberate failures](../examples/heap-bugs.ts), `make test-verify`, and
`node verify/conformance/heap.mjs --mutations`. See
[the delivery report](../reports/heap.md) for final evidence.
