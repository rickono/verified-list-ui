# Receipt review: prerequisite integration record

**Verdict: PASS+NOTES.**

The coordinator commit is a documentation-only receipt. H and G are merged on
main at the commits the receipt names, the reviewed G patch id is unchanged
after retargeting, and no prototype is recorded as a delivered roadmap node.
One generated roadmap sentence still says K is gated on integration after that
gate has opened. That sentence does not mark K complete.

| | |
| --- | --- |
| Reviewed base (main) | `8bbff6e3ce09b227ada4ed58f56f0ec5dd6d9416` |
| Reviewed head (coordinator) | `e2021fa5f5c4785b40dbebb9bf48c5fe7de2ce55` |
| Production runtime baseline | `32bd5b260aa116ca88642a1479bed8d3fc447f4b` |
| Review checkout | `/Users/rick/.t3/worktrees/verified-list-ui/t3-69cedbf9`, branch `t3/review-roadmap-receipt` |
| Parent transcript | `<t3-thread://v2/a77123eb-c55f-4b51-83af-db8d1f1daf8d/1cdc229e-ad5a-4769-989f-7e1c11a49497>` |
| Transcript window | This run, from the operator grant in run ordinal 134 (`2026-11-13T13:06:02Z`) through the receipt message at `2026-11-13T14:11:41Z`. Earlier thread history was not used. |

No solver suite was rerun. Landing counts below were read from the reviewers'
preserved logs. `SHA256SUMS` for both landing directories verifies with zero
mismatches (H: 144 files; G: 73 files, sums digest
`a4baa4f2654265da562c6a0157629b78a1b478e0c112d730e6b7faa8d2534937`).

## Runtime identity

`32bd5b2` is an ancestor of main and of the coordinator head. `8bbff6e^{tree}`
equals `32bd5b2^{tree}` (`053835783226d888aa0d92573284007fd59dbe2a`). The diff
`32bd5b2..e2021fa` is eleven documentation and roadmap files:

- `.audit/roadmap-20261113.tsv`
- `docs/verification-roadmap.json`
- `docs/verification-roadmap.md`
- `scripts/render-verification-roadmap.py`
- `verify/README.md`
- `verify/reports/callbacks.md`
- `verify/reports/heap.md`
- `verify/reports/roadmap/landing-G.md`
- `verify/reports/roadmap/landing-H.md`
- `verify/reports/roadmap/landing-summary.md`
- `verify/reports/roadmap/plan.md`

`git diff 32bd5b2 HEAD` is empty for `verify/**/*.mjs`, `verify/bin`, `tests`,
and the compiler, extraction, and UI trees. The verifier CLI and verifier tests
are byte-identical to the baseline. The render script is a documentation
generator; its one-sentence edit is in the receipt and is not a runtime module.

Every commit in `8bbff6e..e2021fa` touches only the audit trail, roadmap data,
README, delivery reports, or landing reports.

## PR #5 and #6, and patch provenance

Read from GitHub on this review, and matched to local parents:

| PR | State | Head | Merge | Merged at | On `origin/main` |
| --- | --- | --- | --- | --- | --- |
| [#5](https://github.com/rickono/verified-list-ui/pull/5) | merged | `37355ccf197b22286cf0c25fddf147f2e3713172` | `eb135b5145cceda1e225f5a42e595a4a59a7199b` | `2026-11-13T13:58:17Z` | yes |
| [#6](https://github.com/rickono/verified-list-ui/pull/6) | merged | `32bd5b260aa116ca88642a1479bed8d3fc447f4b` | `8bbff6e3ce09b227ada4ed58f56f0ec5dd6d9416` | `2026-11-13T14:07:00Z` | yes |

`origin/main` is `8bbff6e`. The documentation receipt itself is only on the
coordinator branch.

PR #5's merge parents are `91c2806` and `37355cc`. Its tree equals `37355cc`'s
tree (`eb1cff67338618101f5ab5d906f2cbd542b3308b`). PR #6's merge parents are
`eb135b5` and `32bd5b2`. GitHub records `base_ref_changed` on PR #6 at
`2026-11-13T13:58:29Z`, twelve seconds after PR #5 merged. There is no
`head_ref_force_pushed` event on either PR.

Stable patch id of `37355cc..32bd5b2`, of `eb135b5..32bd5b2`, and of
`eb135b5..8bbff6e` is the same value the receipt quotes:
`4e012b932dac875d32b90b499cf03050485450c9`. Retargeting G onto main after H
did not change the reviewed patch. The independent G report blob
`5bee114ade0a8648f2f3b7805e83d59304a57feb` is identical at review commit
`0aa0e0d`, coordinator commit `7ab48d7`, and `e2021fa`. The H report blob
`22ea9dc5ece9cc3f95daa3ec26e2babbc5f3d83e` is identical at `e11aa1b`,
`05d4162`, and `e2021fa`.

## README corrections

G's P3 named two stale sentences. Both are rewritten in this diff, and the
test they contradicted is still the baseline test at
`tests/verify/collections.test.mjs:188` ("reference identity verifies and
unpermitted array stores produce confirmed violations"):

- The record-domain paragraph now says reference comparisons use identity and
  points at `verify/design/heap.md`.
- The collections-test sentence now says the tests cover reference identity and
  confirmed unpermitted writes.

The trusted-components paragraph now names predicate-table replay. That matches
the code at the unchanged baseline:

- `verify/proofs.mjs` stores the feasibility witness and attaches it to
  `{ status: "verified", witness }`. An oversized model takes the
  `feasibility-witness` phase and uses that smaller witness the same way.
- `verify/index.mjs` replays `r.witness` before it emits `verified`. A replay
  failure on that path becomes `unknown`. Vacuous, unknown, and error results
  skip replay.
- The same replay materializes function parameters through
  `predicate-witness.mjs` (`Object.is` keys). The report trust line is added
  when any target has a function parameter.

H's landing note said a verified verdict does not depend on replay and that
the trust mattered only for counterexample confirmation. The receipt's
correction is the accurate description of this path: the feasibility witness
is replayed as a veto before `verified` is reported, and counterexample
witnesses are replayed for bug confirmation. The universal proof remains the
solver result. One feasible witness does not itself prove the contract. The
README states the trust boundary; it does not say the table proves the
verified result. Dependency gating still runs after replay
(`verify/index.mjs` final status). The exact-record domain text is unchanged
and still explicit: `verify/README.md` requires declared own fields and rejects
extra properties, getters, proxies, and custom prototypes, and
`verify/data.mjs` puts that assumption on reference-typed reports, including
"References may be shared across parameters and fields." The receipt treats
shape-disjoint `ensures a!==b` as true inside that assumption, which is what
G's N1 measured. Nodes K, P, Q, R, S, T, U, V, and W stay `integrated: false`.

## Generated roadmap

Regenerating `docs/verification-roadmap.md` from the committed JSON and
`scripts/render-verification-roadmap.py` in a temporary tree produced a
byte-identical file (5627 bytes). Generation is deterministic.

The JSON status, edge text, mermaid label, and ready-package line agree that
H and G are integrated, that K, P, and T are the ready packages, and that K is
in design comparison with one rejected prototype. `progress.pendingIntegration`
and `progress.branchReady` are empty. No remaining node has `integrated: true`
or a delivery claim.

**Note.** The heap-delivery paragraph, hardcoded in the renderer, still ends
with "K remains gated on integration; P and T can proceed independently."
After this receipt that clause is false. K's `status` is `ready` because J, G,
and H are integrated, and the top status says the prototype was rejected and
no remaining node is complete. The stale clause understates readiness. It does
not count the prototype as delivered.

`verify/reports/roadmap/plan.md` is the opening checkpoint. It still says H and
G are implemented in PRs #5 and #6 and lists landing as step 1. The landing
summary is the current integration record and matches the merges. The plan was
not rewritten after those merges.

## Audit rows

`.audit/roadmap-20261113.tsv` has a header and twelve data rows. Each commit
that touches it only appends lines (`git log -p` shows no deletions). Commit
timestamps equal the row timestamps. Each row was checked against the parent
transcript, the cited artifact, or git.

| Time (UTC) | Claim checked | Evidence |
| --- | --- | --- |
| 13:09:31 | Run opened under the operator grant; baseline `32bd5b2` | Transcript ordinal 134, user text at `13:06:05Z`: take over the rest of the map until completion or a stall. `plan.md` is introduced in `798bd9d`. |
| 13:11:37 | First wave partitioned into landing reviews and three design comparisons | `artifacts/roadmap-20261113/{P,K,stateful}-task.md` exist. `agents-wave1.json` records those seats at coordinator `1b67f93`. |
| 13:18:56 | Claude recheck passed; cancelled Claude seats relaunched on Claude | Three `grok-4.7-xhigh-fast` launches failed at `13:12:35Z` with `model_unavailable` on provider `codex`. Design P Claude failed authentication at `13:12:38Z`. The coordinator cancelled the five Claude seats and asked before any provider switch. The user answered "claude should be available" at `13:17:47Z`. Recheck thread `<t3-thread://v2/a77123eb-c55f-4b51-83af-db8d1f1daf8d/thread:delegated-task:command%3Amcp%3A8c05b982-a4e4-4ec2-a5b7-b2f0dd6ae09b%3Adelegate-task%3Aroadmap-20261113-claude-auth-recheck>` completed at `13:18:17Z` on `claude-opus-5-5`, ran `git rev-parse HEAD`, and returned `1b67f93b34df7490b7dd4bc3d229260bb5adfcd9` with `verify/source.mjs` present. `agents-claude-recovered.json` relaunches the five Claude seats. |
| 13:33:50 | Stateful Grok candidate inspected; no node advanced | `7b52fd9` is not an ancestor of `e2021fa`. Its diff is six files under `verify/reports/roadmap/candidate-stateful-grok/`. `completed.json` lists `nodeDeliveries: []`. R, S, T, and U stay `integrated: false`. |
| 13:36:45 | P candidate inspected; injected verdicts are not a proof cache | `8e9ce80` is not an ancestor. Diff is `candidate-P-grok/` only. Transcript: solver verdicts were injected. P stays `integrated: false`. |
| 13:36:45 | Upstream reconnaissance started; result still pending at the receipt | `agent-Q-recon.json` is a running Grok launch. The transcript at `13:36:54Z` says reconnaissance started. Q stays `planned` and `integrated: false`. |
| 13:45:06 | H kept unmerged after an interim return with no verdict | Transcript `13:41:08Z` and `13:45:23Z`: the H review had no landing verdict while probes were queued. PR #5's merge is later, at `13:58:17Z`. |
| 13:45:06 | K candidate challenged for fresh-local coverage; probe queued | `ab2ba9c` is not an ancestor. `K-grok-root-notes.md` records the open challenge and says not to call it a public finding until the probe exists. |
| 13:53:13 | K prototype rejected after three native false verifications | See below. |
| 14:01:45 | H landed; G retargeted to main; G review still pending | PR #5 merged at `eb135b5`. PR #6 base change at `13:58:29Z`. Transcript `14:02:48Z` says G awaits its verdict. |
| 14:10:15 | G landed; scope docs corrected; runtime unchanged from `32bd5b2` | PR #6 merged at `8bbff6e`. Patch id matches. README and roadmap edits are this commit. Runtime diff is empty, as above. |
| 14:11:31 | Initial routing failure recorded; Claude kept; Grok routed to provider `grok` / model `grok-4.7` | `agents-wave1.json` has the three Codex-model failures. `agents-routed.json` has `providerInstanceId: "grok"` and `model: "grok-4.7"`. The transcript says no provider switch was used after the recheck. |

The Q reconnaissance completion notice arrived at `2026-11-13T14:18:26Z`,
after `e2021fa`. It is outside this receipt. The "research pending" row was
accurate when it was written and when the receipt was committed.

## Rejected K prototype

`probe-K-fresh-local.mjs` runs three programs against the candidate verifier at
the checkout's `HEAD`, executes each with native JavaScript, and sets
`falseVerified` when the report says `verified` while some native result is
not 0. The preserved log and JSON agree, at head
`ab2ba9cd3c327dd0f104351503834ab7c5077f49`:

| Case | Contract | Native disagreement | Report |
| --- | --- | --- | --- |
| `fresh-array` | `ensures result === 0` for `n` in `0..2` | `n=1` and `n=2` return 1 | `verified`, `falseVerified: true` |
| `fresh-record` | same, writing `box.x` | same | `verified`, `falseVerified: true` |
| `fresh-array-boolean` | `ensures result === 0` | `flag=true` returns 1 | `verified`, `falseVerified: true` |

The candidate source at that commit havocs `unit.frame` at the loop head
(`candidate-K-grok/scratch/source.mjs` around the `heap.havoc(unit, ..., unit.frame, ...)`
call). `unit.frame` is the declared `modifies` footprint. The three programs
write fresh locals that are not in that footprint. The transcript at
`13:52:58Z` and `13:53:32Z` rejects the candidate and keeps the cases as future
regressions. `completed.json` records `verdict: "ISSUES"`, `falseVerifiedCases: 3`,
`status: "rejected as-is"`, and `nodeDeliveries: []`. K's roadmap status is
`ready` with `integrated: false`. The prototype commit is not in the
coordinator history, and `e2021fa` contains no `candidate-K-grok` tree.

## Landing evidence read back

H, from `landing-H/logs`, matching `landing-H.md`:

- `head-full.log`: `# tests 219`, `# pass 219`, `# fail 0`, `duration_ms 325681.37`, exit 0, end `2026-11-13T13:35:55Z`.
- `focused-tests-head.log`: `# pass 20`, `# fail 0`.
- `conformance-head.log`: 3/3 pass; corpus `fixtures: 58`, `functions: 574`, `nativeSamples: 667`, `counterexamples: 20`; twelve mutant ids including `predicate-zeros-collapsed` and `predicate-number-keys-collapsed`, both `unknown/replay-mismatch`.
- `logs/probes`: 29 distinct probe names, three logs each.

G, from `landing-G/logs`, matching `landing-G.md`:

- `full-head.log`: `# tests 249`, `# pass 249`, `# fail 0`, `duration_ms 327863.97`, exit 0.
- `probes-all-head.jsonl` plus `probes4-head.jsonl`: 86 + 6 JSON records. Five `matchesHeadExpectation: false`, the same five names and causes the report lists (two `string` probes, one array-of-records probe, one `Math.min` probe, and `disjoint-keys-may-alias` verified under the exact-record domain).
- `heap-mutations.json`: all four heap mutants `detected: true`, with `undefined-reference-join-erased` and `input-aliases-erased` observed `verified`, and `store-permission-erased` and `call-frame-inclusion-erased` observed `unknown/replay-mismatch`.

## Flags

1. **Roadmap template stale after integration.** `scripts/render-verification-roadmap.py` still prints "K remains gated on integration" in the heap section. The committed markdown matches the generator. The JSON and the rest of the markdown say K is ready and not complete.
2. **Opening plan not revised after landing.** `plan.md` still describes landing H and G as upcoming work. `landing-summary.md` is the record that matches GitHub.

No flag for runtime drift, patch substitution, a hidden provider switch, a counted prototype, or a rewritten audit row.
