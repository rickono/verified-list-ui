# K Gate 3 review: ownership, rollback, and abstract state

**PASS.** No executed product defect on this axis. K completion stays coordinator-owned. This review does not mark a roadmap node complete.

## Checkout

Review checkout `/Users/rick/.t3/worktrees/verified-list-ui/t3-91451dac`, branch `t3/review-k-ownership`, starting HEAD `bd0d9570e8f910a8cf7db14cf517728ba3fd673e`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists. That HEAD contains coordinator `41079c5d22ba889005075d23ffd5ef5ca7a1e600`. Its `verify/source.mjs` blob is `91547b26465fae11145518965199482b6fd47aeb` and its `verify/heap.mjs` blob is `0607e95df2cfbff65505680997ae1cceff695fab`, the same blobs as `41079c5`. Neither file defines `heap.trial` or `fixedLoopTarget`.

Reviewed archives, not this worktree's compiler:

- Parent `dedde91b9f6e1fec3a30f5e39cae65f5381b6b26`
- Core `bc9fec06ff535da4fa87012904775ec6eece2804`
- Tested tree `00e5fc4244f6f756b045e2ea4b6af9ddaaf1715b`
- Evidence tip `7a98698ea421bf22ff6e5e057ac62842ca9f0c7f`
- Chain `85d121d57383c0a56368270b50e660d5a9dc828e`, `78de4665b041070072bbb31ad2b0dec84abc8a9e`, `098160fdc417a4eb8db04cc3d8d3ea2cdb95e74e`, then the three above

`verify/source.mjs` and `verify/heap.mjs` are identical from core through the evidence tip: source blob `99ed6718c1014ef5c7930ca6ab55dab38f36ee5c`, heap blob `1c3535242c25350531d1cb6ebee5087ebc023ffa`. `00e5fc4` changes only `tests/verify/numeric-metadata.test.mjs` after core. Parent-to-core production diff is `verify/source.mjs` +81/−25 lines net and `verify/heap.mjs` +26/−1. `verify/data.mjs` is blob `ea0b9c081f9d1ea408855f191a663c96fb4e792b` on the parent, on K, and on this HEAD. Its SHA-256 is `63f39ff7edc16e4e4d7f0eef3563c9d7f84d63cef0a475239dfe98f32173c5f6`. It exports no `indexBits`.

Judgment `e581b4134b845b98387ad9f0f92f98d2e9093064` selects candidate A. It lives on `t3/review-k-loop-designs` and is not an ancestor of this HEAD or of `00e5fc4`. Execution used `git archive` of `00e5fc4` with a temporary `node_modules` link to `/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/node_modules`. Node v22.23.1. Solver work went through `serial-verify.py`. The archive, the link, the review scratch copy, and the mutant directory were removed. No review process remains.

No `AGENTS.md`, `CLAUDE.md`, eslint, prettier, biome, or editorconfig file exists at `00e5fc4`.

## What production changes

The trial unit is a fresh container for events, declarations, dependencies, replay guards, probes, loops, the functions map, emitted functions, and pending axioms. `specRefs` is a copied number written back only after commit. The shared registry, the monotonic `fresh` counter, the permission frame, and the program build cache stay outside that container.

`heap.trial` snapshots registry keys, exact, asserts, decls, roots, rootTypes, and the boolean flags `used`, `allocated`, `writes`, and `reads`. Rollback restores those fields, keeps `reg.versions`, and deletes new private version-map entries. A retained discarded state then fails `unknown content version`. Commit only clears the active flag. A second rollback or commit throws `already ended`. `contentVersion` is the only content-function constructor and only increments the counter.

`loopWrites` audits every back edge and every exit from provenance. Only back-edge locations grow the frame. An omitted ownership-log name throws `Heap write audit: missing ownership` and returns no frame. `fixedLoopTarget` rejects a write or call footprint whose SMT tokens match a trial-local `declare-const`, `declare-fun`, or `define-fun` name. Runtime allocation in the test, update, body, return, or a transitive helper is rejected. Reference stores, length or shape changes, and nested loops stay outside this slice and are rejected.

## Own execution

Archive at `/tmp/k-gate3-00e5fc4`, then `node verify/reports/roadmap/review-K/ownership/probe.mjs`. Log: `probe.log`, 22 probes, exit 0. The probe compiles and mutates private heap state. It does not call the solver. The final command redirected stdout to `probe.log` and appended `EXIT:0`.

Registry rollback restored every listed field. The counter stayed at 9. The next live write was `heap_num_79_v10`, disjoint from eight discarded names and from the committed name. `finish()` contained neither the discarded `ghost_field` nor `temp_field` declaration. The retained discarded state failed as a back edge and as an exit. A second rollback and a second commit threw `already ended`. `finish().head` aliases `reg.decls`; the probe compared a clone taken before the trial. The compiler calls `finish` only after commit, so that alias is not a product leak.

Both symbolic join arms (`x` and `y`) were returned. Deleting one ownership name (`heap_num_78_v1`) threw `missing ownership`. A no-op write followed by a restore collapsed to one location with three logged versions; deleting the middle log threw. A call havoc of that location was included in the frame, and deleting its log threw. `loopHead` role was `current`.

A fresh pre-loop nested alias (`box.inner` through `alias`) compiled with an empty footprint and one loop. `i === 0 ? a : b` inside the loop was rejected as a reference chosen inside the loop. The same choice bound to `flag` before the loop compiled, contained `ite`, and havocked. Allocation was rejected in the body, test, update, return (`allocate`), and a transitive helper (`allocating`). A reference store, `xs.push`, and a nested loop were rejected.

The caller and callee do not share mutable declarations. The callee constant `123456789` appeared only in the callee. Caller content versions were 4 and 6. Invariant-init was obligation 0, the call was obligation 1, and frame inclusion followed the call. Init and frame-inclusion SMT contained no `call_fact`. Init contained no `heap_havoc`. Discarded widening names were not reused: loop names started at 8 and 9, the predicate at 11, and calls at 12 and 13.

A review copy of archive `source.mjs` logged the existing counters around the commit site and was deleted afterward (`review-scratch-source.mjs` absent). Two attempts each computed trial `specRefs` 3 while the outer unit stayed 0. The first grew one location and widened `last`. The second grew nothing. One publish wrote 3. Published events contained one `invariant-init`. Each attempt had zero checks, returns, dependencies, functions, probes, and axioms, and one replay guard. Loop metadata stayed on the caller (`unit.loops.length` 0 inside the trial).

The compiler join emitted separate head havoc for `input_0` field `x` (`heap_havoc3`, `heap_num_78_v4`) and `input_1` field `y` (`heap_havoc5`, `heap_num_79_v6`), then the stores `heap_num_78_v7` and `heap_num_79_v8`. Obligations were invariant-init, two frame-writes, then preserve and rank for each arm. A break with no fall-through had content versions 1 and 2 and no `heap_havoc`. A continue in the update had versions `[1,2,3,7,9,10,11]`. An indexed store kept `store-domain` before `frame-write`. `data.indexBits` is undefined.

Replacing the single `return logged(next, [name]);` in a copied `heap.mjs` with `return next;` made compilation throw `missing ownership`. The unmutated control compiled. The copy was removed.

Solver commands, cwd `/tmp/k-gate3-00e5fc4`, each through `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py --`:

```sh
node --test --test-concurrency=1 --test-name-pattern='straight-line and loop stores|width and index guard' tests/verify/numeric-metadata.test.mjs
```

Exit 0. Tests 2, pass 2, fail 0, duration 9731.6 ms. The domain test took 1687.6 ms. The guard test took 7936.8 ms. Cap 64 changed `INT_WIDTH` 53 to 64 on N02: control `counterexample` confirmed, observed `verified`, detection `false-verification`. The index-guard mutant replaced `merge(valid, ...)` with ``merge(`(bvult ${z.low} ${owner.length.u32})`, ...)`` on N17, with the same detection. Both reports name the `data.mjs` SHA-256 above. No added axiom or proof limit.

```sh
node --input-type=module -e '… verify continue-update and weak break …'
```

Continue with `xs[0] = 1` in the update, invariant `xs[0] === i`, ensures `result === 1`: `verified`. The first break, invariant only on `i`, ensures `result === 1`: `unknown` / `induction-gap`. Head havoc of `i` leaves a feasible exit where `xs[0]` is still 0. That is a weak invariant, not a dropped exit heap.

```sh
node --input-type=module -e '… verify strengthened break …'
```

`while (xs[0] === 0) { xs[0] = 1; break; }` with invariant `xs[0] === 0 || xs[0] === 1` and ensures `result === 1`: `verified`.

## Inherited evidence

`git cat-file blob` against `7a98698:verify/reports/roadmap/K-evidence/SHA256SUMS` checked 85 files and found 0 mismatches. `full-before-oracle-update.tap` is 418 tests, 417 pass, 1 fail, 0 skipped, 0 cancelled. `full-final.tap` is 418 tests, 418 pass, 0 fail, 0 skipped, 0 cancelled. `H39-old-in-loop` is a confirmed counterexample in the first log (`expect: reject`) and `unknown` / `induction-gap` in the final log. The class change is retained. It is not a detected bug, and the final gap does not verify the false contract. The claimed 96 added tests are the implementation narrative. This review did not recount them. A crude `test(` count under-counts generated tests. The 418 suite was not rerun.

## Integration note

`41079c5` adds 14 lines to `verify/source.mjs` over K's parent and does not change `heap.mjs`. Those lines are `compileAstUnit` and `if (!spec) fail("This compiler entry does not support loops without parsed contracts.")`. K's loop rewrite is based on the parent and does not carry them. The original 418 did not run on `41079c5`, on this checkout, or on a throws integration. Combining the trees must keep that guard. This review did not combine C1 or throws with K.

## Limits

No full-suite rerun. No second solve of the Reverse pilots. `probe.mjs` imports the removed archive, so the saved `probe.log` is the executed record. The spec-ref logger was a deleted review copy, not a production switch. Shallow exact-entry objects were restored as sets; no product path that mutates an old exact entry was executed. Call footprints still follow the callee `modifies` list through unchanged P modules; that boundary was not re-solved here. An infeasible back-edge write can still enter the frame. That over-approximation is not a false verification by itself. Scope exclusions (allocation, reference-returning helpers, loop-varying reference targets, shape and reference stores, nested loops) were rejected or left outside this slice.
