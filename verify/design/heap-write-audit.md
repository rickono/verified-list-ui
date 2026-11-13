# Checked heap write intervals (K enabling gate 2)

Heap-writing loops remain rejected by `source.mjs`. This boundary prepares the
heap for a later compiler consumer; it does not implement loop induction.

## Ownership invariant

Every primitive content function is either its slot's known entry function or
a version created by `contentVersion`. That constructor requires a predecessor
and nonempty locations for stores, summary havoc and allocation initialization.
A conditional version requires both predecessor arms. Locations identify the
reference term, record key or whole-array elements, and primitive sort. The
constructor checks that each location matches the version's content slot.
Checked locations also carry `kind: "field"` or `kind: "elements"`. This
distinguishes a literal record key named `@elements` from the existing array
footprint marker. Existing source-compiler footprints retain their encoding.

The registry privately retains this provenance graph. Each persistent state
separately retains ownership records keyed by the particular writer version,
not just by location. State copies retain history; symbolic joins merge both
histories. The ownership symbol survives the source compiler's role-only object
spreads. No history or provenance is serialized into proof or witness queries.

`loopWrites` traverses actual content roots and their predecessor graph, then
requires an exact matching ownership record for every reachable writer. It
rejects unknown functions, mismatched slots, missing ownership, detached
ownership, missing state metadata, unrelated heap owners and states that do not
descend from the supplied head on every arm. These are internal `Error`s, not
unsupported source or a trusted empty frame. Checking provenance independently
of ownership is what catches a writer or join that forgets to carry a log.

An attempted no-op store still creates a writer event. A restoring store keeps
the intervening writer in its predecessor chain. A location written before the
head cannot cover a new unlogged store: ownership is checked per version before
events are deduplicated into locations. No semantic SMT equivalence check or
sampling decides whether a write counts.

Allocation initialization is tracked and audited, but classified separately
from content stores. An interval reports `allocated` for initialization events
or an allocator-term change on any back edge or exit. A fresh object created
before the head is ordinary existing storage within that interval. Immutable
shape functions and array lengths are not loop-frame contents. Indexed stores
track both values and element presence; summary havoc retains the existing
monotonic-presence encoding. Entry/current/summary roles, alias identities and
all previous content versions retain their existing meaning.

## Compiler migration

The only new exports are:

```js
const head = heap.loopHead(trialUnit, preLoopHeap, derivedLocations);
const {locations, allocated} = heap.loopWrites(head, backHeaps, exitHeaps);
```

`loopHead` audits the input before havoc and the result afterward. It havocs
only supplied content locations and keeps the allocator and shapes. Supplying
the returned head to `loopWrites` starts the interval there: head havoc and
earlier writes are excluded without erasing their audit provenance. An empty
body therefore reports no writes even when its head was havocked.

The compiler must pass every back edge, including `continue`, and every exit,
including `break`, test-false and return heaps. Exits are audited but do not
grow the back-edge frame. The returned locations are fresh plain footprint
values, with no history maps, version names or registry transport exposed.
There is deliberately no `written()` export or unchecked alternate frame path.
Candidate A's `written`/`locationKey` calls must be replaced, rather than kept
as a fallback. Deduplicate the accumulated frame with a compiler-local key over
`ref`, `key`, `sort`, and `kind`, or feed its union back through the checked boundary.
If target closure is not enforced during source lowering, also request
`heap.loopWrites(head, exitHeaps)` to obtain checked exit-only locations for that
validation. Do not add those locations to the back-edge frame.

The later K consumer must reject `allocated`, ensure each location reference
is closed over the pre-loop signature, and enforce the existing permission
obligations independently. It must run invariant initialization on the actual
pre-loop heap, reach a frame fixed point, check preservation, rank and exits,
and retain entry `old()` semantics. None of these compiler responsibilities is
discharged by this heap audit. Trial rollback must still cover declarations,
events, checks, assumptions and registry effects. Provenance records share the
registry and use monotonic version names; discarded-trial records emit no SMT
by themselves, but a committed state must never refer to discarded declarations.

## Trust and controls

The heap implementation and its SMT bodies remain trusted. The audit does not
parse an arbitrary new SMT function body to infer its semantic write target.
Instead the mandatory constructor owns each version's slot, predecessor and
location data. A new content writer that omits those data fails construction;
one that omits ownership fails the interval audit. Bypassing the constructor
with a new content name fails as an unknown version. Deliberately deleting both
this ownership boundary and its audit is outside what this check can protect.

Direct boundary tests cover all content writers and both join arms, allocation,
roles, presence, unchanged views and interval cutoffs. Private copies remove
writer or join ownership, or omit mandatory location data, and must fail at the
real boundary with an internal error. Public straightline tests run unchanged
source through `verify()` and an independent native oracle. Snapshot comparisons
against the exact parent check SMT and default public reports byte for byte.
See [the gate report](../reports/roadmap/heap-write-audit.md) for measured scope.
