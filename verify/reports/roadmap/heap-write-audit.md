# Heap write ownership and interval audit

Status: **PASS**, measured at the committed heap below. This report covers K enabling gate 2 only.
Heap-writing loops remain unsupported. Numeric acceptance and the compiler's
frame fixed point belong to other units.

## Source and scope

The prepared checkout is
`/Users/rick/.t3/worktrees/verified-list-ui/t3-33e43afa`, branch
`t3/heap-write-audit`. Parent `eaf23c0ca4a2e61e9d844a84a876755872eb16e7`
contains `32bd5b260aa116ca88642a1479bed8d3fc447f4b`; `verify/` exists.
The implementation, focused tests, design, and reproduction scripts are in
local commit `b5a1b103c59f4d1a074ed025dc101e2f0a13eb56`.
Commit `ca0d28d46d809a2f6c7425d78bd5a434b3cc5398` runs each exact unchanged
boundary control before its private mutation.

The selected candidate is A,
`d9c22c63c5ae15d8f38d6f6873a9f3b779c53a31`. The independent judgment is
`e581b4134b845b98387ad9f0f92f98d2e9093064`. Both were read with `git show`,
including the relevant heap diff, sketch, judgment scripts, heap logs, and
source-hash manifest. Their files remain unchanged. No candidate commit or
scratch tree was imported. The implementation commit credits the candidate's
derived-frame design and preserves its Claude coauthor attribution.

Only `verify/heap.mjs` changed in production. In particular, `source.mjs`,
`data.mjs`, proof construction, native replay, and loop admission are unchanged.
No unfinished branch, public mutation option, proof bound, new assumption,
roadmap change, or canonical audit change is included.

| Source | SHA-256 |
| --- | --- |
| Parent `heap.mjs` | `3a833de64dca47275accc84371a451f84ba5905fea618ffe2935149269e50f9a` |
| Delivered `heap.mjs` | `25bccf21abbb3e5a4c94fd88ceae26124436385daebd0c08b0ed8fc8f00d7311` |
| Unchanged `data.mjs` | `6c53f2fc830558b353ebe9e38147ee7b4dbbb12cbfa2bd15b56f36fa567c17f4` |
| Unchanged `source.mjs` | `38bbea4deee14933640511a90336142d1d1bde67793c4ae0f752ced597c52e2e` |
| Unchanged `index.mjs` | `f8a4f8c173a2185c01f1dc4626fbd5e9a2f4cc566639a4e5e75a90c7f0f3a75c` |
| Unchanged `proofs.mjs` | `8b0cc8361db5cf42882f8145ccd53940ced483c71af1dd081391ae301dd3ba9c` |
| Unchanged lockfile | `8a0e19b686e00939f10a597f1a9c3b8ae2c25c1dae10d340cba0a365830afa21` |

The delivered heap Git blob is `0607e95df2cfbff65505680997ae1cceff695fab`.

## Invariant and API

Every content version has registry-owned provenance created by one constructor.
Stores, indexed stores, summary havoc, and allocation initialization require
matching location data and a predecessor. Conditional versions require both
predecessor arms. Each state separately carries write ownership keyed by the
specific writer version.

`loopWrites(head, backs, exits)` traverses actual content roots and predecessors
before checking their ownership. A missing writer record, an omitted join arm,
an unknown content version, a mismatched slot, detached history, a missing
owner, or a non-descendant heap throws an internal `Error`. No optional empty
log is trusted. Array presence is audited with array values. Allocation events
and allocator-term changes are reported separately from content writes.

The result contains checked back-edge `locations` and an `allocated` flag.
Exit heaps are audited without enlarging that frame. Locations carry `ref`,
`key`, `sort`, and a `field` or `elements` discriminator. The discriminator
prevents the supported literal record key `@elements` from becoming array havoc.
No content-version names or history maps escape this API.

`loopHead` audits before and after content havoc. The supplied head defines the
new interval without erasing old provenance. No-op attempts, restored stores,
and later stores to an already-recorded location still require their own
ownership. Earlier snapshots, identities, entry/current/summary roles, shape,
length, and existing presence rules retain their previous encoding.

There is no `written()` export. The later compiler must migrate A's unchecked
reader to this API, reject allocation, close targets over the pre-loop state,
and retain separate permission and induction checks. The
[design and migration notes](../../design/heap-write-audit.md) specify exit-only
closure checks and trial-registry responsibilities.

## Executed evidence

Raw evidence is under
`/Users/rick/verification-vibes/artifacts/roadmap-20261113/heap-write-audit/`.
All solver and test-suite runs used the shared serial lane. No core file changed
while a run in this checkout was active.

The final command, run from the prepared checkout, is:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- sh verify/reports/roadmap/heap-write-audit/run-validation.sh /Users/rick/verification-vibes/artifacts/roadmap-20261113/heap-write-audit > /Users/rick/verification-vibes/artifacts/roadmap-20261113/heap-write-audit/validation-final.log 2>&1
```

It runs these commands sequentially inside one lane:

```sh
sh verify/reports/roadmap/heap-write-audit/run-focused.sh
node verify/reports/roadmap/heap-write-audit/compare.mjs /Users/rick/verification-vibes/artifacts/roadmap-20261113/heap-write-audit/comparison-accepted
```

The final command exited 0. `focused-final.log` records **90 tests passed,
0 failed, 0 skipped, 0 cancelled**. All six private boundary mutations were
detected after their exact unchanged controls passed. `run-focused.sh` covers direct heap
boundaries, public straightline/native scenarios, existing heap and call tests,
heap and general conformance mutations, integration, local-result, and pinned
es-toolkit sum/mean checks. This is a focused run, not the full verifier suite.
The existing general and heap conformance tests also detected their 12 and 4
mutants, respectively. These controls do not complete roadmap node Q.

### Negative controls

Each private mutation changes only an owned temporary heap module. Its unchanged
control must pass. The mutated state must fail the same production boundary a
future writer omission would reach. All private copies are removed in `finally`.

| Mutation | Concrete target | Required failure |
| --- | --- | --- |
| Remove record-store ownership | `a.x`, already present in the head history | Missing ownership at `loopWrites` and at a subsequent `loopHead` |
| Remove indexed-store ownership | Existing fresh array element | Missing ownership |
| Remove summary field ownership | Opaque havoc of `a.x` | Missing ownership |
| Drop join arm A's history | Record store under a symbolic guard | Missing ownership, including on an exit heap |
| Drop join arm B's history | Indexed store under the other symbolic arm | Missing ownership, including on an exit heap |
| Omit mandatory writer location | Record-store constructor | Missing write location before version construction |

Additional direct controls cover unknown versions in each content family,
missing metadata, malformed maps, changed array shape metadata, unrelated
owners, invalid interval ancestry, both concrete join choices, no-op/restored
attempts, fresh records and arrays, empty allocation, summary roles, old views,
optional presence, and repeated intervals. Public cases independently run the
unchanged native source with real aliasing, calls, both branch choices, fresh
locals, signed zero, NaN, infinity, missing properties, and explicit undefined.

### Exact parent comparison

`compare.mjs` archives the exact parent from Git, checks every extracted file
against its Git blob, and removes the temporary tree and dependency link. It
captures all six synchronous proof/witness phases for each compiled target and
each postcondition, including examples, local-result, and annotated pinned
es-toolkit sources. Unsupported compilation outcomes are retained as errors.
Only tree-root paths in target attribution and compilation-error labels are
canonicalized. SMT declarations, assertions, and model descriptors are not
rewritten. Default public `verify()` reports are compared as complete JSON bytes.

The separate `smt.json` comparison checks the raw query strings. Public native
rows preserve signed zero and NaN in their serialization. The pinned es-toolkit
native checks run its existing independent module executions.

`comparison-accepted.log` records exact equality for all five outputs. The
capture includes 44 source cases, 616 constructed proof/witness queries, and 13
retained unsupported compilation cases. It compares 14 complete default public
reports and 40 native samples, including the 11 pinned es-toolkit native checks.
The 616 count describes query construction, not 616 independently solved proofs.

| Equal output | Bytes | SHA-256 |
| --- | --- | --- |
| Complete queries and unsupported outcomes | 2,009,998 | `96d0c0e32e5461e9c3ef2f9cc546437dcebd893f4f169f06b9a8a2090a05146b` |
| Raw SMT declarations and assertions | 1,570,478 | `27c49c444205d6c4f7cb35746cf7a57bda08a0b080f41c71bc454e6af22fb942` |
| Default public reports | 20,335 | `e9fb04b13ebe2e6e701b976140bc0459cd4ec5e49932acb073ae4445bb8277a5` |
| Independent native results | 3,558 | `48fe93f548b7204472bef384ec7a85bcd26846415f635ecb70efa8af67960cc1` |
| Captured source identities | 8,014 | `90009f81e13ae41a8e4c4d7f2d4c70cee0a5f457471b63b97a0a0defdab8003a` |

The complete per-source archive check is
`comparison-accepted/tree-hashes.json`. [The machine-readable evidence receipt](heap-write-audit/evidence.json)
records source hashes, private-mutant source hashes, commands, results, and raw
log paths with SHA-256. [SHA256SUMS](heap-write-audit/SHA256SUMS) covers the
delivered heap, tests, design, scripts, report, and receipt from the repo root.

### Earlier runs and corrections

- `parent-snapshot.log`: the original parent capture was terminated while it
  still waited for the shared lane. Exit 143, no solver result. The comparison
  script replaced it with an exact parent archive.
- `focused-audit-1.log`: 24 passed, 2 failed. One public fixture used an
  unsupported numeric RHS for `&&`. That subtest and its enclosing test failed.
  The fixture now uses `(store, true)`. No production contract was changed.
- `focused-audit-2.log`: 26 passed, 0 failed at the first heap implementation.
- `focused-regression.log`: 88 passed, 0 failed before the final field/elements
  discriminator and malformed-map controls. These are earlier-tree results.
- `comparison.log`: raw SMT, full default reports, and native bytes matched.
  The overall comparison failed because archive labels used `/var` while the
  filesystem reader reported `/private/var`. The script now resolves the tree's
  real path. This failed run is not the final acceptance result.
- `comparison-final.log`: the subsequent comparison was terminated while still
  waiting for the lane, exit 143. The final validation includes the additional
  literal-field control and pins the comparison to the delivered heap.

## Inherited evidence and limits

The judgment's false proofs from omitted writer and join logs are inherited
evidence, not rerun loop proofs in this unit. Candidate B remains rejected.
No mutating-loop pilot, numeric-metadata proof, frame fixed point, or discarded
trial transaction was implemented or verified here. Root's combined K gate
still needs those units, independent review, and the full suite after admission.

Code inspection supports the claim that old alias, snapshot, shape, and role
semantics remain unchanged because no SMT content expression was changed. The
executed byte comparisons establish that claim only for the captured corpus.
The audit still trusts the heap writer's SMT body and the mandatory provenance
constructor. It does not infer effects from arbitrary SMT text. Removing both
the provenance boundary and the audit can defeat this protection.

The registry retains provenance for earlier versions. Future compiler trial
rollback must prevent references to discarded SMT declarations and account for
all other registry effects. This gate does not certify that transaction.

The temporary dependency link, parent archives, and private module copies were
removed. All processes started for this unit exited or were terminated while
queued, with no surviving solver or test process. The final working tree is
clean after the evidence commit. No push, PR, merge, watch, deployment, upstream
comment, or shared-checkout write was performed.
