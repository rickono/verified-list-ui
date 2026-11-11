# G review and corrections

Two independent reviews examined checkpoint `38a3c6d` against H base
`37355cc`. The findings below describe that checkpoint, before publication.
The final delivery checks are recorded in [heap.md](heap.md).

## Standards

**P1: joining undefined with a reference erased the missing-value case.**
`flag ? {child: undefined} : {child: {x: 1}}` inferred a required reference
field and falsely verified `result.child !== undefined`. The array variant had
the same defect. Reference/undefined joins now fail at the existing unsupported
optional-reference boundary. Both source regressions exercise the public API;
the `undefined-reference-join-erased` verifier mutant reinstates the defect and
must be detected by the independent heap corpus.

**Ownership concern: the worker reconstructed heap tags and field names.**
`heap.mjs` now supplies one encoding descriptor containing tags, function names
and field symbols. The solver consumes it rather than maintaining a second
copy. The conformance alias decoder deliberately remains independent.

## Spec

**P2: indirect allocations disabled identity-preserving replay.** A root that
only called `id(make())` could omit its heap metadata, causing a valid helper's
`old(a) === a` contract to fail replay. Opaque reference results now register
heap use, and all replay snapshots preserve shared identity. The three-function
source regression requires every result to verify.

**P2: deferred exact-shape checks escaped `every` binders.** Nullary definitions
captured a quantified reference expression. Exactness definitions now take that
reference as a formal argument. The source regression verifies a checked
`@spec` call under `every` with dynamic record selection and unrelated shapes.

## Additional corrections

Entry references inside newly constructed `old` aggregates are remapped to their
live identities, recursively. Object and array cases verify. Array-length
footprints are explicitly unsupported; an ordinary record's numeric `length`
field remains writable under its own permission.

Existing Remeda proofs exposed solver resource regressions. The corrections
retain immutable array-length views and use exact integer representations only
under established requires. Safe-integer shadows retain both zero signs and the
entire nonnegative safe-integer range. Slice clamps expose native index ranges
without new proof assumptions, bounded domains, weaker queries or solver
tactics. Edge checks cover signed zero, `Number.MAX_SAFE_INTEGER`, an impossible
unsafe bound, and requires-definedness ordering.

The independent reviews did not rerun these final corrections. Source tests,
native replay, verifier mutation tests and the final combined run provide the
post-fix evidence; they do not certify the translator.
