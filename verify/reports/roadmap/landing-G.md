# Landing review: G (heap, aliases and frames)

**Verdict: PASS+NOTES.** I found no false verification, unsound frame, or broken
replay. The final code fixes every finding in `heap-review.md`. One
documentation defect (P3) should be corrected, though it does not block landing.
The notes below record trust and completeness boundaries that K, Q, V and W
inherit.

Each claim is tagged. **[measured]** means a check I executed in this review.
**[inferred]** means I read the source and did not run it. **[predicted]**
means an untested expectation. The author's green suite counts only as baseline
evidence. I reran it.

## Reviewed patch

| item | value |
|---|---|
| parent (H) | `37355ccf197b22286cf0c25fddf147f2e3713172`, tree `eb1cff67338618101f5ab5d906f2cbd542b3308b` |
| head (G) | `32bd5b260aa116ca88642a1479bed8d3fc447f4b`, tree `053835783226d888aa0d92573284007fd59dbe2a` |
| review checkpoint | `38a3c6db2a350e19e059da71c9757dd9bdc241ed`, tree `bf5a99019bd9ec4e9323f3faa4058262c3416dc4` |
| patch commits | `38a3c6d` (heap model) and `32bd5b2` (review fixes) |
| prepared checkout | `/Users/rick/.t3/worktrees/verified-list-ui/t3-795726ab`, branch `t3/review-heap-landing`, HEAD `69d9f15` |
| node acceptance | `docs/verification-roadmap.json` G `doneWhen`: "Proofs distinguish a fresh copy from an alias and remain sound when two arguments share storage." |

The prepared HEAD adds three coordinator commits on top of `32bd5b2`. They change
only `verify/reports/roadmap/plan.md` and `.audit/roadmap-20261113.tsv`
(`git diff --stat 32bd5b2 HEAD`) **[measured]**. I therefore tested the exact
SHAs, not the combined tree. Each SHA was extracted with `git archive` into a
separate scratch directory. I did not create git worktrees or clones. Every blob
in all three snapshots matched its git blob SHA-1, with no missing or extra files
(head: 224 blobs; parent: 213; checkpoint: 223). The head snapshot still matched
after the full suite **[measured]**. `node_modules` was a symlink to the
ready-now coordinator's install. I checked that its `pnpm-lock.yaml` is
byte-identical to the lockfile in all three snapshots **[measured]**. Node was `v22.23.1`.

## Acceptance assessment

**"Distinguish a fresh copy from an alias": met [measured].**
- Spread and slice copies can be written with no frame and still verify.
- A write through a local alias of an input is a confirmed `frame-write`.
- A shallow copy shares nested references. A write through the copy's nested
  record verifies under `modifies a.n.x` and is a confirmed `frame-write`
  without it.
- `[...xs] === xs` and "returned input is fresh" both give confirmed
  counterexamples.
- `old(a)` keeps identity through the indirect results `id(make())` and
  `id(id(make()))`.

**"Remain sound when two arguments share storage": met in the documented
domain [measured].**
- Every alias negative I tried gives a confirmed counterexample. Reports carry
  `aliases` groups and native replay reconstructs the shared graph. The cases:
  - record = record
  - `a.c = b.c` under `requires a !== b`
  - `a = b.c` across depths
  - array = record field
  - empty `number[]` = empty `boolean[]`
  - write order under aliasing
  - havoc through an alias
- Aliased positive contracts verify: `a===b ? 1 : old(b.x)`, nested, and swap.
- A write is checked against the frame when attempted, not as a net change.
  No-op, conditional no-op, array no-op and later-restored writes are all
  confirmed `frame-write`.
- A callee's restored write is a confirmed caller `frame-inclusion`, while the
  callee itself verifies.

## Findings, most severe first

No P0, P1 or P2 findings.

### P3: stale README statements contradict the delivered capability [measured]

At `32bd5b2`, `verify/README.md:90` still says "Reference equality for
arrays/records is unsupported; compare their fields, lengths, or elements."
`verify/README.md:440` still says `collections.test.mjs` covers "explicit
rejection of reference identity, mutation". Both lines are unchanged from the
parent (README lines 88 and 406 there).

G replaced that test with "reference identity verifies and unpermitted array
stores produce confirmed violations" (`tests/verify/collections.test.mjs:188`).
The same README says "reference comparisons use identity" (`:265`) and has a
whole "Shared references and mutation frames" section (`:341`). My probes show
that `a===b`, `a!==b` and `Object.is` on references verify and refute at head.

The impact is documentation only. A reader of the domain paragraph is told the
wrong scope. Fix: rewrite both sentences to point at the heap section. This
review did not change production code or documentation.

### Notes: trust and completeness boundaries (no change required to land)

**N1. The exact-record domain carries some proofs [measured; impact inferred].**
`ensures a!==b` for `f(a:{x:number}, b:{y:number})` verifies. So does
`{x:number}` vs `{x:boolean}`. A nonempty `number[]` vs `boolean[]` is distinct,
while empty arrays of those types can alias. These results follow from the
documented domain: records have exactly their declared own enumerable data
fields (`README.md:88`), and the report assumption says "no extra properties,
accessors, proxies, or custom prototypes … References may be shared across
parameters and fields" (in the `bugs-json` CLI output).

TypeScript's structural typing accepts `const o = {x: 0, y: 0}; f(o, o)`. Such a
caller is outside the proven domain **[inferred]**. The assumption is visible in
JSON and text reports, which is what W requires. V and Q pilots should not cite
type-shape-only disjointness as a property of arbitrary TypeScript callers.

**N2. An opaque reference result that may alias another argument is `unknown`,
not a confirmed violation [measured].** `pick(a,b)` returns `a` with contract
`ensures true`, and the caller writes `r.x` under `modifies a.x` only. The
result is `unknown/frame-write`: "abstract heap obligation failed, but
unchanged-source replay did not observe…".

This is honest. The helper contract does allow `r === b`, and replay of the real
body never takes that path. With `modifies a.x, b.x` the caller verifies.

**N3. `old(...)` inside an `every` binder cannot reference the binder variable
[measured].** `xs.every((v) => Object.is(old({k:v}).k, v))` is `unsupported`
("Unknown value v…"). This is conservative.

The spec-allocation vacuity probes are not vacuous; both give confirmed
counterexamples to `ensures false`. A fresh literal under a binder is never
equal to an input, which verifies.

**N4. Undefined/reference joins are uniformly unsupported [measured].** I tried
seven variants: record child, array child, reversed order, direct result,
`let` branch, local-then-read, and optional parameter field. None verifies at
head. The P1 fix closed this hole by rejecting the whole join class rather than
modelling optional references. That is sound, but it is a completeness gap for
later nodes.

**N5. Mutating loops are rejected with specific messages [measured].** Direct
writes, writing helpers, allocation, reference-returning helpers, and writes
before an early return are all `unsupported`. A read-only heap loop verifies.
This is K's scope, and G does not claim it.

**N6. An unsupported function collapses its source unit to one outcome
[measured; pre-existing].** When `f` hits the loop restriction, the report holds
only `f`, and the helpers `poke`/`id` are not reported. The parent behaves the
same way: there `poke` is the reported rejecting function.

So `outcomes[0]` in the loop-restriction test (`tests/verify/heap.test.mjs:185`)
is reliably the rejecting function. However, that test asserts only the
`unsupported` status, not the message. An unrelated rejection would also pass
it. This is a P4 test-specificity point, not a defect.

**N7. The review fixes were not re-reviewed on the final tree, so I validated
them myself [measured].** `heap-review.md` says the two reviews examined
checkpoint `38a3c6d`. I ran the same probes at checkpoint and head:

| defect (heap-review.md) | checkpoint `38a3c6d` | head `32bd5b2` |
|---|---|---|
| P1 undefined/reference join, record child | **verified** (false proof) | unsupported |
| P1 same, array child | **verified** (false proof) | unsupported |
| P1 neighbour: reversed join | unknown/replay-mismatch | unsupported |
| P1 neighbour: join, local, then read | counterexample+confirmed | unsupported |
| P2 indirect allocation `id(make())` with `old(a)===a` | unknown/dependency-violation | verified |
| P2 binder exactness, positive | error/worker-error | verified |
| P2 binder exactness, negative | error/worker-error | counterexample+confirmed |
| `old` aggregate identity, negative | unknown/replay-mismatch | counterexample+confirmed |
| `old` aggregate, live read | unknown/replay-mismatch | verified |
| `old` aggregate, object only | unknown/replay-mismatch | verified |

All of these are fixed on the final code. The binder-exactness cases also
verify or refute at the parent. The checkpoint regression did not survive.

The independent heap corpus reinstates the P1 defect as verifier mutant
`undefined-reference-join-erased` and detects it (below).

**N8. Replay limits are as documented [inferred from source].** Each attempt
gets a fresh `materializeHeap` graph, fresh realms and a fresh write monitor.
The Proxy membrane covers input-graph objects only, so a frame violation that
replay does not observe stays `unknown`. `README.md:364` documents this:
"Unobserved abstract frame violations stay unknown."

## Before/after and regression checks

**Parent vs head [measured].**
- The parent rejects every heap write: "Only local scalar bindings can be
  assigned; heap writes and destructuring are unsupported."
- Natural-number shadows are identical at parent and head on all nine natural
  rows: safe-integer rounding at `MAX_SAFE_INTEGER`, successor, `-0`, u32
  maximum, strict lower bound, strict bound with `-0`, slice length with and
  without `n <= xs.length`, and my `Math.min` probe, which is unsupported at
  both.
- Binder exactness and the loose-equality rejections are also identical.
- One result changed in the stricter direction. `incl-elements-nonempty-neg`
  verified at the parent, which had no frame model. At head it is a confirmed
  `frame-inclusion`. Empty `@elements` footprints still verify.

**Reference/primitive equality [measured].** I added this check because
`equal()` in `verify/data.mjs:147-156` returns `false` for a reference compared
with any non-reference, and JavaScript's `[] == 0` is `true`. Loose equality
between different sorts is rejected first (`data.mjs:180-183`):
- `a == n` (array vs number) is `unsupported`.
- `a == b` (record vs boolean) is `unsupported`.
- `a == undefined` decides as `false`: it verifies, and its negation is a
  confirmed counterexample.
- `a === n` and `Object.is(a, n)` verify as `false`.

There is no soundness hole.

## CLI JSON/text [measured]

I ran the commands through the serial lane from each snapshot root, using
`$S/probes/cli-all.sh`. It started at 2026-11-13T13:55:01Z and ended at
13:55:41Z. Input SHA-256 values: `heap.ts`
`0dfe23776b089cc1ca15724892d8acb4581dfe6a8815baaf4f75251efbd00270` and
`heap-bugs.ts`
`d4359358d543678c1026ca7d51bb6360db107e334f2ce5bd887a3847ced48177`. The parent
received byte-identical copies of the head files.

| run | head exit | head result | parent exit | parent result |
|---|---|---|---|---|
| `--json heap.ts` | 0 | 6 verified | 1 | unsupported (heap writes) |
| `--json heap-bugs.ts` | 1 | 3 confirmed counterexamples | 1 | unsupported |
| text `heap.ts` | 0 | 6 verified | 1 | unsupported |
| text `heap-bugs.ts` | 1 | 3 confirmed counterexamples | 1 | unsupported |
| text, both files | 1 | as above | 1 | unsupported |
| `--json`, both files | 1 | two reports | 1 | unsupported |

The six functions verified in `heap.ts` are setValue, sharedArguments,
preserveOtherField, shallowCopy, swapFirstTwo and copyBeforeWrite.

The three counterexamples in `heap-bugs.ts` at head:
- `forgottenAlias`: aliases `[["left","right"]]`. The text output prints
  `shared references: left === right`.
- `restoredOutsideFrame`: `frame-write`, with failure location `point.value`.
  The text output prints `failed frame-write: restoredOutsideFrame writes
  point.value outside its modifies frame (observed in JavaScript)`.
- `growsOutsideDomain`: `store-domain` with `values = []`.

The JSON report keys are `file, sha256, trusted, modules, dependencies,
graphSha256, outcomes`. The trusted list names the "solver-model heap graphs
replayed with shared identities and a write-monitoring Proxy membrane".

## Conformance and the full suite [measured]

**Heap conformance.** `node verify/conformance/heap.mjs --mutations` at head
exited 0. It covered 8 fixtures (optionalRef unsupported; alias, optional and
array counterexamples with `a=b`; restored `frame-write`; inclusion
`frame-inclusion`; copy and snapshot verified). It also covered 20 native
samples and 5 independently reproduced counterexamples. All four heap mutants
were detected:

| mutant | outcome under the mutant |
|---|---|
| `undefined-reference-join-erased` | verified |
| `input-aliases-erased` | verified |
| `store-permission-erased` | unknown/replay-mismatch |
| `call-frame-inclusion-erased` | unknown/replay-mismatch |

**Full suite at head.** `node --test --test-concurrency=1 tests/verify/*.test.mjs`
is the `make test-verify` recipe. Result: 249/249 pass, 0 fail, cancelled or
skipped; `duration_ms` 327863.97; exit 0. It ran from 2026-11-13T13:25:02Z to
13:30:30Z. The author's baseline (`artifacts/heap-design/full-final.log`) was
also 249/249.

## Tested scope

I ran 92 source probes through the public `verify()` API at head. I ran 92 at
the parent and 86 at the checkpoint; the 6 loose-equality probes were added
after the checkpoint run. The probe groups:
- aliasing
- copies
- attempted, restored and no-op writes
- callee frame inclusion, including empty and nonempty `@elements` and havoc
- `old` identity, including indirect results and new aggregates
- quantifier binder exactness and spec-allocation vacuity
- undefined/reference joins
- natural-number shadows
- loop restrictions
- reference/primitive equality

At head, 87 of 92 matched my expectation. The 5 mismatches are my own authoring
errors (below), not verifier defects. I also read the outcome mapping and replay
in `verify/index.mjs`, all of `verify/heap-witness.mjs`, all of
`tests/verify/heap.test.mjs`, the README heap and domain sections,
`verify/reports/heap.md` and `verify/reports/heap-review.md`.

## My own failed experiments (kept, not hidden)

- Two probes used `string` and are unsupported ("Unresolved type string").
  `alias2/*-boolean` replaces them.
- `old/old-aggregate-identity` used an array of records. It is unsupported
  ("Arrays of heap records are outside the first heap slice."), and
  `old2/old-aggregate-object-only` replaces it.
- `natural/slice-natural-count-pos` used `Math.min`, which is unsupported.
  `natural2/slice-natural-count-{pos,neg}` replaces it.
- `alias/disjoint-keys-may-alias` expected a counterexample. Under the
  documented exact-record domain (N1), `verified` is correct, so the
  expectation was wrong.
- The two `loop2/*` probes lacked a `decreases` clause and were rejected for
  that reason, not for heap effects. `loop3/*` corrects this, selects `f`
  explicitly, and records the specific messages.
- Tooling slips, none affecting results:
  - Using `path` as a zsh loop variable clobbered `PATH`, so I rewrote the
    provenance check in Python.
  - The sandbox denied an `rm -f`, and I reran without it.
  - The serial lane prints status lines to stdout, so parsers keep only lines
    that start with `{`.
  - The first probe-table script keyed rows by case name, which collapsed the
    two `slice-natural-count-pos` rows. It now keys by `group/case`.

## Gaps (not tested or not claimed)

- I did not rerun the full suite at the parent or the checkpoint; the full run
  covers head only. I did not run `make check` targets outside `test-verify`.
- I did not probe cross-module heap composition directly. The full suite's
  "imported footprints retain defining identities and derived effects" test is
  my only evidence for it.
- I did not probe JSDoc-typed heap parameters, `readonly` array writes,
  array-length footprints, reference stores, optional-field writes, or the
  256-element replay cap. They are documented as unsupported or limited.
- I did not run randomized alias-graph generation; the probes are hand-written.
  Corpus and mutants are finite conformance evidence, not a proof of the
  translator.
- I did not review `verify/solver.mjs` or the encoder line by line. I relied on
  behavioural probes, the corpus, and the reviewed outcome and replay code.
- Callers outside the exact-record domain (N1) are unproven by design.

## Commands and evidence

`$S` is
`/private/tmp/claude-501/-Users-rick--t3-worktrees-verified-list-ui-t3-795726ab/58458c57-f2f4-4ea1-8726-2d4fe1b604c6/scratchpad`.
`LANE` is `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py`
(sha256 `731d3577afa7a8ba6c4bf7e646f9c4a72d35268057acf3d8ae01b9cd8be4fe1b`).
Every solver run used the lane. Every process I started exited, and none
remained at the end (`pgrep`).

```sh
git archive <sha> | tar -x -C $S/{head,parent,checkpoint}
python3 -I $S/probes/provenance.py <repo> $S          # -> logs/snapshots.provenance
cd $S/head && $LANE -- node --test --test-concurrency=1 tests/verify/*.test.mjs   # logs/full-head.log
$LANE -- node $S/probes/run.mjs $S/<parent|checkpoint|head> <label>              # logs/probes-{parent,checkpoint,all-head}.jsonl
$LANE -- node $S/probes/run.mjs $S/<head|parent> <label> loose4                  # logs/probes4-{head,parent}.jsonl
$LANE -- $S/probes/cli-all.sh    # CLI JSON/text at head and parent, then heap conformance --mutations at head
node $S/probes/table.mjs $S      # logs/probe-table.md
```

Probe runs at head:

| log | window (2026-11-13, UTC) | result |
|---|---|---|
| `probes-all-head` | 13:53:19–13:53:45 | 81/86 match |
| `probes4-head` | 14:00:33 | 6/6 match |

The earlier head batches `probes-head` (62 cases), `probes2-head` (18) and
`probes3-head` (6) agree with the final rerun on all 86 cases. Each case
compared equal on status, reason, confirmation and aliases.

Parent and checkpoint runs:

| log | window (2026-11-13, UTC) | result |
|---|---|---|
| `probes-parent` | 13:52:32–13:52:42 | 33/86 match head expectations |
| `probes-checkpoint` | 13:52:42–13:53:08 | 72/86 match head expectations |

Script SHA-256 values: `cases.mjs` `fd66a18f…7924`, `run.mjs` `66d9719d…78f9`,
`table.mjs` `51a41661…83de`, `cli.sh` `e1ca9ba7…a7dd`, `cli-all.sh`
`1f91a39e…697d`, `provenance.py` `86612efb…fc02`.

Durable copies of all probes and logs, with `SHA256SUMS`, are in
`/Users/rick/verification-vibes/artifacts/roadmap-20261113/landing-G/`. They
follow the `landing-H` layout. `SHA256SUMS` lists 73 files and verifies
cleanly. Its own sha256 is
`a4baa4f2654265da562c6a0157629b78a1b478e0c112d730e6b7faa8d2534937`.

## Appendix: probe outcomes

Notation:
- `+c` means replay confirmed the result.
- `x=y` is an alias group.
- `not S` means any status except S.
- `none` means not run at that snapshot.

| group | case | head expectation | parent 37355cc | checkpoint 38a3c6d | head 32bd5b2 | head matches |
|---|---|---|---|---|---|---|
| alias | rec-alias-neg | counterexample +c a=b | unsupported | counterexample+c a=b | counterexample+c a=b | yes |
| alias | rec-alias-pos | verified | unsupported | verified | verified | yes |
| alias | nested-shared-distinct-roots-neg | counterexample +c a.c=b.c | unsupported | counterexample+c a.c=b.c | counterexample+c a.c=b.c | yes |
| alias | nested-shared-distinct-roots-pos | verified | unsupported | verified | verified | yes |
| alias | cross-depth-alias-neg | counterexample +c a=b.c | unsupported | counterexample+c a=b.c | counterexample+c a=b.c | yes |
| alias | disjoint-field-sorts-distinct | verified | unsupported | unsupported | unsupported | **no** (probe used `string`) |
| alias | disjoint-keys-may-alias | counterexample +c a=b | unsupported | verified | verified | **no** (expectation wrong; N1) |
| alias | array-record-field-alias-neg | counterexample +c a=b.xs | unsupported | counterexample+c a=b.xs | counterexample+c a=b.xs | yes |
| alias | nonempty-number-vs-string-array | verified | unsupported | unsupported | unsupported | **no** (probe used `string`) |
| copy | spread-copy-write-no-frame | verified | unsupported | verified | verified | yes |
| copy | alias-local-write-neg | counterexample frame-write +c | unsupported | counterexample/frame-write+c | counterexample/frame-write+c | yes |
| copy | copy-nested-write-permitted | verified | unsupported | verified | verified | yes |
| copy | copy-nested-write-unpermitted | counterexample frame-write +c | unsupported | counterexample/frame-write+c | counterexample/frame-write+c | yes |
| copy | slice-copy-write-no-frame | verified | unsupported | verified | verified | yes |
| copy | array-spread-identity-neg | counterexample +c | unsupported | counterexample+c | counterexample+c | yes |
| copy | return-input-not-fresh-neg | counterexample +c | unsupported | counterexample+c | counterexample+c | yes |
| copy | spread-override | verified | unsupported | verified | verified | yes |
| write | noop-write | counterexample frame-write +c | unsupported | counterexample/frame-write+c | counterexample/frame-write+c | yes |
| write | restore-through-unpermitted-alias | counterexample frame-write +c | unsupported | counterexample/frame-write+c | counterexample/frame-write+c | yes |
| write | restore-through-required-alias | verified | unsupported | verified | verified | yes |
| write | conditional-noop-write | counterexample frame-write +c | unsupported | counterexample/frame-write+c | counterexample/frame-write+c | yes |
| write | array-noop-write | counterexample frame-write +c | unsupported | counterexample/frame-write+c | counterexample/frame-write+c | yes |
| write | fresh-object-write | verified | unsupported | verified | verified | yes |
| write | callee-restored-write-inclusion | counterexample frame-inclusion +c | unsupported | counterexample/frame-inclusion+c | counterexample/frame-inclusion+c | yes |
| write | callee-restored-write-callee-ok | verified | unsupported | verified | verified | yes |
| inclusion | incl-same-frame | verified | unsupported | verified | verified | yes |
| inclusion | incl-required-alias | verified | unsupported | verified | verified | yes |
| inclusion | incl-unrequired-alias-neg | counterexample frame-inclusion +c | unsupported | counterexample/frame-inclusion+c | counterexample/frame-inclusion+c | yes |
| inclusion | incl-wrong-field-neg | counterexample frame-inclusion +c | unsupported | counterexample/frame-inclusion+c | counterexample/frame-inclusion+c | yes |
| inclusion | incl-fresh-target | verified | unsupported | verified | verified | yes |
| inclusion | incl-elements-empty-ok | verified | verified | verified | verified | yes |
| inclusion | incl-elements-nonempty-neg | counterexample frame-inclusion +c | verified | counterexample/frame-inclusion+c | counterexample/frame-inclusion+c | yes |
| inclusion | incl-havoc-preserves-other | verified | unsupported | verified | verified | yes |
| inclusion | incl-havoc-alias-neg | counterexample +c a=b | unsupported | counterexample+c a=b | counterexample+c a=b | yes |
| old | old-ref-identity | verified | unsupported | verified | verified | yes |
| old | old-indirect-result | verified | unsupported | unknown/dependency-violation | verified | yes |
| old | old-indirect-result-identity-chain | verified | unsupported | verified | verified | yes |
| old | old-indirect-result-neg | counterexample +c | unsupported | counterexample+c | counterexample+c | yes |
| old | old-aggregate-identity | verified | unsupported | unsupported | unsupported | **no** (probe used an array of records) |
| old | old-aggregate-identity-neg | counterexample +c | unsupported | unknown/replay-mismatch | counterexample+c | yes |
| old | old-aggregate-live-read | verified | unsupported | unknown/replay-mismatch | verified | yes |
| old | old-aggregate-frozen-scalar-neg | counterexample +c | unsupported | counterexample+c | counterexample+c | yes |
| old | old-aggregate-fresh-vs-input | verified | unsupported | verified | verified | yes |
| old | spec-alloc-equal-neg | counterexample +c | unsupported | counterexample+c | counterexample+c | yes |
| quant | binder-exactness-pos | verified | verified | error/worker-error | verified | yes |
| quant | binder-exactness-neg | counterexample +c | counterexample+c | error/worker-error | counterexample+c | yes |
| quant | binder-exactness-nested-pos | verified | verified | verified | verified | yes |
| quant | binder-exactness-nested-neg | counterexample +c | counterexample+c | counterexample+c | counterexample+c | yes |
| join | join-record-child | unsupported | unsupported | verified | unsupported | yes |
| join | join-array-child | unsupported | unsupported | verified | unsupported | yes |
| join | join-reversed-order | unsupported | unsupported | unknown/replay-mismatch | unsupported | yes |
| join | join-direct-result | not verified | unsupported | unsupported | unsupported | yes |
| join | join-let-branch | not verified | unsupported | unsupported | unsupported | yes |
| join | join-local-then-read | not verified | unsupported | counterexample+c | unsupported | yes |
| join | join-optional-param-field | not verified | unsupported | unsupported | unsupported | yes |
| natural | safe-int-rounding-neg | counterexample +c | counterexample+c | counterexample+c | counterexample+c | yes |
| natural | safe-int-successor-pos | verified | verified | verified | verified | yes |
| natural | safe-int-negzero-neg | counterexample +c | counterexample+c | counterexample+c | counterexample+c | yes |
| natural | u32-max-neg | counterexample +c | counterexample+c | counterexample+c | counterexample+c | yes |
| natural | strict-lower-bound-pos | verified | verified | verified | verified | yes |
| natural | strict-lower-bound-negzero-neg | counterexample +c | counterexample+c | counterexample+c | counterexample+c | yes |
| natural | slice-natural-count-pos | verified | unsupported | unsupported | unsupported | **no** (probe used `Math.min`) |
| alias2 | disjoint-field-sorts-distinct-boolean | verified | unsupported | verified | verified | yes |
| alias2 | nonempty-number-vs-boolean-array | not unsupported | unsupported | verified | verified | yes |
| alias2 | empty-number-vs-boolean-array-alias | counterexample +c a=b | unsupported | counterexample+c a=b | counterexample+c a=b | yes |
| alias2 | exact-record-alias-optional-absent | verified | unsupported | verified | verified | yes |
| alias2 | aliased-swap-contract | verified | unsupported | verified | verified | yes |
| alias2 | aliased-write-order-neg | counterexample +c a=b | unsupported | counterexample+c a=b | counterexample+c a=b | yes |
| alias2 | opaque-result-may-alias-other-arg | not verified | unsupported | unknown/frame-write | unknown/frame-write | yes |
| alias2 | opaque-result-both-permitted | verified | unsupported | verified | verified | yes |
| alias2 | fresh-helper-result-write | verified | unsupported | verified | verified | yes |
| old2 | old-aggregate-object-only | verified | unsupported | unknown/replay-mismatch | verified | yes |
| old2 | binder-spec-alloc-vacuity-requires | not verified | counterexample+c | counterexample+c | counterexample+c | yes |
| old2 | binder-spec-alloc-value | not counterexample | unsupported | unsupported | unsupported | yes |
| old2 | binder-spec-helper-alloc-vacuity | not verified | counterexample+c | counterexample+c | counterexample+c | yes |
| old2 | binder-spec-alloc-identity | not counterexample | unsupported | verified | verified | yes |
| natural2 | slice-natural-count-pos | verified | verified | verified | verified | yes |
| natural2 | slice-natural-count-neg | counterexample +c | counterexample+c | counterexample+c | counterexample+c | yes |
| loop2 | heap-write-in-loop-rejected | unsupported | unsupported | unsupported | unsupported | yes (rejected for the missing `decreases`) |
| loop2 | allocating-loop-rejected | unsupported | unsupported | unsupported | unsupported | yes (rejected for the missing `decreases`) |
| loop3 | loop-direct-write | unsupported | unsupported | unsupported | unsupported | yes |
| loop3 | loop-helper-write | unsupported | unsupported | unsupported | unsupported | yes |
| loop3 | loop-allocation | unsupported | unsupported | unsupported | unsupported | yes |
| loop3 | loop-ref-returning-helper | unsupported | unsupported | unsupported | unsupported | yes |
| loop3 | loop-early-return-write | unsupported | unsupported | unsupported | unsupported | yes |
| loop3 | loop-heap-read-only | verified | verified | verified | verified | yes |
| loose4 | array-loose-eq-number-rejected | unsupported | unsupported | none | unsupported | yes |
| loose4 | record-loose-eq-boolean-rejected | unsupported | unsupported | none | unsupported | yes |
| loose4 | array-loose-eq-undefined-false | verified | unsupported | none | verified | yes |
| loose4 | array-loose-eq-undefined-neg | counterexample +c | unsupported | none | counterexample+c | yes |
| loose4 | array-strict-eq-number-false | verified | unsupported | none | verified | yes |
| loose4 | array-objectis-number-false | verified | unsupported | none | verified | yes |

At the parent, the `loop3` rows are `unsupported` because the helper `poke`
writes the heap. Those rows say nothing about the parent's loop handling.
