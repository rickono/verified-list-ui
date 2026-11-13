# Independent review: heap write ownership (gate 2)

**Verdict: PASS**

Reviewed head `7444276bfce715cf1aabe9ba50c985a291dbea5e`, range `eaf23c0ca4a2e61e9d844a84a876755872eb16e7..7444276bfce715cf1aabe9ba50c985a291dbea5e`. The review branch is `t3/heap-write-audit-review`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor of that head and of this branch. `verify/` exists at both. Production files, the candidate worktree, the canonical roadmap, and the audit trail were left unchanged. No PR, push, merge, or upstream message was made.

The range is `b5a1b103c59f4d1a074ed025dc101e2f0a13eb56` (ownership), `ca0d28d46d809a2f6c7425d78bd5a434b3cc5398` (unchanged controls before each mutant), and `7444276` (receipt). The production diff is `verify/heap.mjs` only: blob `0607e95df2cfbff65505680997ae1cceff695fab`, sha256 `25bccf21abbb3e5a4c94fd88ceae26124436385daebd0c08b0ed8fc8f00d7311`. `source.mjs`, `data.mjs`, `index.mjs`, `proofs.mjs`, and `pnpm-lock.yaml` match the parent. This gate does not accept K, numeric metadata, or a loop compiler. Heap-writing loops stay unsupported.

## Behavior checked

`contentVersion` is the only constructor of content functions. It stores slot, kind (`write`, `havoc`, `allocation`, or `join`), parents, and locations on the registry owner. Joins require both parents and store no locations. Each state keeps its own ownership map, keyed by version, on an enumerable symbol that a role-only object spread copies. `loopWrites(head, backs, exits = [])` audits every supplied back edge and exit from the live roots and their parents, then returns the checked back-edge locations and `allocated`. Exit writes stay out of `locations`. `loopHead` audits, havocs the supplied locations, and audits again. Versions already reachable from the head stay in the baseline, so a repeated cell, a no-op, a restore, and a store after an earlier write each need their own log entry. Allocation versions and an allocator-term change set `allocated` and do not join the content frame. `permission()` is unchanged and still matches on `key` only.

## Receipt

Every raw log named in `verify/reports/roadmap/heap-write-audit/evidence.json` matches its recorded sha256 under `/Users/rick/verification-vibes/artifacts/roadmap-20261113/heap-write-audit/`. Git blobs for the delivered heap, tests, design, scripts, report, and receipt match `SHA256SUMS`.

`focused-final.log` ends with tests 90, pass 90, fail 0, cancelled 0, skipped 0. Its six mutant diagnostics match the receipt hashes. `comparison-accepted.log` and the saved JSON are byte-equal between parent and current:

| Output | Rows | Bytes | sha256 |
| --- | --- | --- | --- |
| queries | 629 = 616 query objects + 13 compile errors | 2009998 | `96d0c0e32e5461e9c3ef2f9cc546437dcebd893f4f169f06b9a8a2090a05146b` |
| smt | 616 | 1570478 | `27c49c444205d6c4f7cb35746cf7a57bda08a0b080f41c71bc454e6af22fb942` |
| runtime | 14 | 20335 | `e9fb04b13ebe2e6e701b976140bc0459cd4ec5e49932acb073ae4445bb8277a5` |
| native | 14 entries, 40 samples | 3558 | `48fe93f548b7204472bef384ec7a85bcd26846415f635ecb70efa8af67960cc1` |
| sources | 44 | 8014 | `90009f81e13ae41a8e4c4d7f2d4c70cee0a5f457471b63b97a0a0defdab8003a` |

`snapshot.mjs` records `obligation()` text and never calls the solver, so the 616 rows are constructed queries. Saved runtime outcomes for the public cases are `verified`, except `noop-store` and `restored-store`, which are confirmed `frame-write` counterexamples. All 29 native case rows have `holds: true`. The es-toolkit entry is the 11 pinned sample names. `parent-snapshot.log` and `comparison-final.log` are the same 41-byte line, `Waiting for the shared solver test lane.` The report's account of those two terminated waits matches the files. `tree-hashes.json` shows the five unchanged production inputs equal to the parent and the delivered heap hash above. This review did not rerun that comparison or the 90-test file.

## Review execution

Exact `git archive` trees of `eaf23c0` and `7444276` were used. A `node_modules` link was removed before this report was written. No solver lane was taken.

The delivered boundary file, with the public `verify()` test excluded, was run from the `7444276` archive: 14 pass, 0 fail (`evidence/boundary.tap`). The six mutant sha256 values match the receipt: `13f63bab…`, `78aeaf72…`, `71c12d04…`, `1cc51352…`, `890d3db4…`, `5e5940b0…`.

`evidence/adversaries.mjs` then reported 59 checks and 0 failures (`evidence/adversary.jsonl`). It imports `heap.mjs`, `compile()`, and the native `Function` oracle. It does not call `verify()`.

A source-shaped sequence (field store, indexed store, record and array allocation, symbolic join, mixed havoc, reference-result havoc) produced identical operation declarations, `finish().head`, and `finish().tail` on the parent and the child. Those operation declarations contain no `(assert ...)`. `permission()` text matches. A footprint with no `kind` and key `@elements` produces identical array-havoc declarations. The same object with `kind: "field"` is array havoc on the parent and a field version on the child. Source footprints are `{ref, key, sort, path}` and carry no `kind`, so existing compiler havoc still follows `key === "@elements"`.

`compile()` matches the parent for the literal `@elements` record, the record-alias program, and a read-only heap loop. Rejected loops match the parent text: `Loops that write the heap are outside the first heap slice.`, `Loops cannot call heap-writing or reference-returning helpers in this slice.`, and `Loops that allocate collections are outside the first heap slice.`

Native rows hold for record-alias (2), array-alias (2), call-frame (2), element-marker-field (1), noop-store (2), and restored-store (2).

The following omissions throw `Heap write audit: ...` and return no frame. Each private copy ran the unchanged production operation first:

- the six delivered mutants
- array-summary log removed (`missing ownership for heap_array_num_v2`)
- indexed store logging only the value version (`heap_array_has_v5`)
- array-allocation log removed (`heap_array_num_v1`)
- record-store log removed, including allocation (`heap_num_78_v1`)
- direct deletions of the later same-cell version, the new version after a head write, the intervening restored version, either symbolic join arm on a back edge and on an exit, the array-presence version, an array summary, and both allocation contents
- unknown version, wrong slot, malformed maps, an extra array slot, a missing symbol, a different owner, a location mismatch, a detached log, and a JSON round-trip
- a pre-write entry supplied as a back edge: `content does not descend from loop head`

Frames that were returned had the required shape. Repeated stores, a no-op, and a restore each contribute the cell once, with distinct versions for the no-op and the restore. A symbolic join keeps both arms; `true` and `false` keep one. Exit writes stay out of `locations`. In-loop allocation sets `allocated` with no init location, and a later store of that fresh record is both allocated and listed. Exit-only allocation sets `allocated` and adds no back-edge location. Allocation before the head is not `allocated` on an empty interval at that head. A record key `@elements` and a real array stay `field` and `elements`. `loopHead` of those returned locations havocs both; a source-like footprint without `kind` havocs the array. An empty `loopHead` leaves the entry log empty after a later write. The ownership symbol is enumerable and survives `{...state, role: "current"}`.

## Dropped hypotheses

Pushing a version onto its own parent list after construction makes `extendsHead` throw `RangeError: Maximum call stack size exceeded`. `auditState` stops on `seen` and does not loop. The constructor accepts only parents that already exist, so versions it creates form a DAG. The cycle returns no locations. It is outside the gate's defect list.

Removing the registry record and the ownership log together, or pointing the live slot back at the base function, is the trust boundary stated in `verify/design/heap-write-audit.md`. The design says that pair of deletions is outside what this check protects. It is not a new defect.

## Consumer constraints

`exits` defaults to `[]`, so a caller that omits exits does not audit them. The third argument audits exits without adding their locations. Passing exit heaps as the second argument is the documented way to ask for exit locations.

Provenance is a module WeakMap on the shared `unit.heap` object. A trial that spreads the parent unit keeps that object. `contentVersion` appends the `define-fun` before it returns. A consumer that only advances the version counter, drops discarded states, and restores declarations can leave orphan names in the map. Moving the counter backward would overwrite provenance for a reused name. The trial transaction is out of scope; the API still allows a monotonic trial.

`permission()` ignores `kind`. Locations returned by `loopWrites` include `kind`. The modifies frame and the derived frame stay separate inputs. `footprintPaths` rejects a computed member, so a source modifies clause cannot name a field `@elements`. The cutpoint path stamps `kind: "field"` for that key.

No new SMT assertion, bound, default-report change, or loop admission showed up on the checked corpus or these compiler diffs.

## Limits

The 90-test log and the 616-query comparison were checked from the saved receipt, not run again. The full suite, numeric metadata, and the compiler fixed point remain separate gates. Review processes were closed, and the temporary dependency links were removed. Exact commands, hashes, and outputs are in [evidence/commands.md](evidence/commands.md).
