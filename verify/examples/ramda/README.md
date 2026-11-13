# A generic search proof from Ramda

This fixture verifies the eager `findIndex(fn, list)` function from Ramda v0.30.1,
commit `980b3bf7712adb8ad8b5d9b2c6aca525cb3cf143`. The raw upstream file and MIT
license are pinned here. [provenance.json](provenance.json) records their SHA-256
hashes and the extracted declaration hash.

The checker extracts the exact 174-byte named function expression and uses it as
a standalone declaration. It adds contract and loop comments, checks that removing
the comments restores the bytes, and compares all runtime tokens. Currying,
dispatch and wrapper behavior are excluded. The exported annotated copy in
[search.js](search.js) is checked against that same extraction on every run.

```sh
node verify/examples/ramda/check.mjs
pnpm verify --timeout 60000 verify/examples/callbacks.ts
pnpm verify --timeout 60000 verify/examples/callback-bugs.ts
```

The first command succeeds when all expected outcomes hold:

- The unchanged eager function proves bounds, a matching result, first-match
  order, absence, and termination for every native dense numeric-array length.
- A returned-index off-by-one and a skipped-first-match mutation each produce a
  replay-confirmed counterexample. Their table predicates are decoded and run in
  an independent native execution.
- The unchanged body agrees with native `Array.findIndex` on 42 selected cases,
  including empty arrays, NaN, infinities, subnormals and both zeros.

The proof quantifies over admitted pure total unary numeric predicates. They
return a present Boolean, have no effects or exceptions, and do not inspect NaN
payloads. This is an explicit callback domain, not a claim about arbitrary
JavaScript functions. The proof has no array-length or callback-table bound.

[callbacks.ts](../callbacks.ts) composes the generic contract with a captured
threshold, a NaN predicate and a named negative-zero predicate. All targets verify.
[callback-bugs.ts](../callback-bugs.ts) deliberately passes a callback whose
requires only accepts positive numbers. That command exits 1 with a confirmed
admission failure, including on an empty list: the generic requires a predicate
defined for every number.
