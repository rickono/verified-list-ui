# P implementation and local verification

Local result: **PASS**. The implementation is complete at code commit
`c9c45110b8669f99f83c4330d6efe1b6202ff1be`. Final executed results and cleanup
are recorded below. This report does not mark roadmap P complete. The coordinator
owns integration, independent review, and the unchanged `doneWhen` predicate in
`docs/verification-roadmap.json`.

## Scope and ancestry

The only repository write target was
`/Users/rick/.t3/worktrees/verified-list-ui/t3-c517e11a`, branch
`t3/proof-cache-workflow`. Prepared parent was
`e435c8abce3107f3afce5be2b10ae23102d269d2`. The required baseline
`32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor, and `verify/` exists.
The selected design is `verify/design/project-workflow.md`, from synthesis
`e020460`. Candidate A `9e1e945d0d2e1e91ea3baf506c80e19e1a8cac78`, candidate B
`8e9ce8062372f35122e9bc054d6ae8ebe44505a1`, and judgment
`2bc3b466abbb4a064e539362046fc90e1fcb669c` were read using `git show` at their
`verify/reports/roadmap/` package paths.

The implementation preserves the baseline default API, source and graph hashes,
outcome policy, and dependency gate. `verify/source.mjs`, the canonical roadmap,
selected design, and canonical audit files have no diff against the prepared
parent. Stateful mode and cache-machine support are outside P. No old failed
worktree was edited. No subagents, pushes, PRs, merges, messages, watches,
deployment, dependency installation, or new Git worktrees were used.

## Inherited material, separately attributed

Partial commit `53e33a3d65d2f86d36c8d1576a3ca545d77bfe7f` was cherry-picked as
`688fdbf40913d8eac1f3f7d1f5dfdefe937d8d9a`. Rick's author identity and the
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer remain intact.
Its claimed 75 focused passes were inherited context. The recovery check in this
checkout executed the command below and passed 83 tests.

Only two uncommitted drafts were copied from the exact P recovery snapshot
`20261113T160218Z-P/files/verify/`. Both matched its SHA256SUMS before copying:

| Draft | SHA-256 before changes |
| --- | --- |
| `cache.mjs` | `efb96f5c5befde5d7a2138dca782c960542b0959759836619b5b7fbeb26a1da7` |
| `manifest.mjs` | `82d1ead941ca2166959c9b70d03d19983a17491f39368ca49f2757ad45431c56` |

These drafts were untested context. They were audited and revised here. The
selected Claude prototype informed shrinking and test fixtures. Commit `e1de182`
credits Claude as co-author. Neither candidate's reported test counts count as
acceptance evidence in this report.

## Delivered behavior

- `proofs.mjs` owns one query state graph. The scheduler follows its transitions;
  `phases()` enumerates the same nodes for exact-query receipt keys. Only
  diagnostic attribution fields are excluded from solver input identity.
- `backend.mjs` owns `validWitness()`. Worker answers, cache reads, evidence
  reads, and shrink candidates use its whole-witness contract, including shapes,
  replay caps, predicate tables, heap types, and parameter/root agreement.
- `manifest.mjs` follows Acorn AST imports, side-effect imports, re-exports,
  literal dynamic imports, and worker URLs from `index.mjs`. Index, cache,
  source translation, replay, evidence policy, and their semantic dependencies
  are included. Computed or unresolved dependencies disable caching. The whole
  installed solver package, declared package dependencies, Node version,
  platform, architecture, and protocol affect identity. Loaded local code drift
  also disables reuse.
- `cache.mjs` stores only positive proof receipts with feasibility witnesses.
  There is no verdict field or global ledger. Writes use exclusive creation of
  random process-owned temporary files and atomic rename. Stale cleanup requires
  a recognized local-host name, an old regular file, and a dead writer process.
  Foreign-host, active-writer, and unrelated files remain untouched.
- `verify` and `verifyFile` accept `targets`, `cache`, `evidence`, and `plan`.
  Selection includes transitive callees. Every receipt hit replays current
  original source and passes the current final callee gate. Rejected or
  replay-failed hits enter one fresh solve. Readwrite repairs them after a
  successful proof and replay. Only final verified targets are written. This
  write rule is more conservative than the prototype's relative caller writes.
- `affected()` and plan run neither the solver nor native source. Their hits
  remain provisional. Readonly, audit, and plan create no cache files or
  directories. Audit re-solves all selected targets and reports validation,
  replay, and logical disagreements, while using fresh results for outcomes.
- Confirmed bugs retain original witnesses, source graph and model identities,
  exact query keys, and failure signatures. Greedy shrinking accepts only
  smaller validated witnesses reproducing the same failure. Heap, predicate
  table, and callback-probe witnesses explicitly skip shrinking.
- `reproduce(entry, evidence, options)` validates the complete artifact before
  native replay, uses no solver, and refuses stale graphs or incompatible model
  identities and keys. Source-relative IDs and config paths allow relocation of
  an identical graph. It accepts no persisted solver statuses or unchecked
  axioms.
- CLI options are `--target`, `--cache`, `--cache-mode`, `--plan`, and
  `--evidence`. `reproduce` and its `replay` alias replay a bug artifact. Audit
  exits 1 on disagreements. Existing default output and exit policy remain.

## Trust and limits

Receipt integrity and trusted writers are explicit assumptions. A correctly
formed forged receipt with a benign witness can bypass solving for buggy source.
Readonly does not establish authenticity. The negative control measures this
case, and audit independently finds its counterexample. One native witness is
not a proof certificate. Z3, translation, resolution, replay, standard builtins,
and the JavaScript runtime remain trusted.

Keys are precise within one verifier build. A semantic build byte change
conservatively invalidates all receipts. Equivalent translated queries can share
a receipt, including across targets and relocations. A config edit selecting
identical queries can preserve hits, while the graph digest still changes.
Compilation still covers the entire loaded graph, including unselected source.

Shrinking performs at most 300 candidate replays. This bounds replay work only;
it adds no proof-domain bound and makes no minimality claim. Unsupported complex
witnesses keep their original reproducible inputs. Evidence binds the complete
current graph and model; it is not an offline source snapshot. Proof reproduction
requires fresh verification or audit. Nonliteral dynamic semantic dependencies
and unsupported source keep explicit disabled or unsupported outcomes.

The es-toolkit pilot still proves only its documented empty-array properties.
It is not evidence of full sum/mean correctness, a new upstream bug, a completed
Q campaign, or P's independent integration acceptance. No benchmark ratio is
claimed.

## Executed checks

Every solver-heavy command used
`python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py --`.
Core files were not edited while a run in this checkout was active. Heavy
command invocations shared one serial lane. The initial recovered-seam command
retained Node's default file concurrency. Subsequent multi-file runs used
`--test-concurrency=1`, and no full suites ran in parallel. Logs retain test names
and exact outcomes.

1. Recovered seams, **83/83 passed**, exit 0:

   ```sh
   python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test tests/verify/proof-backends.test.mjs tests/verify/backend-process.test.mjs tests/verify/conformance.test.mjs tests/verify/heap.test.mjs tests/verify/integration.test.mjs tests/verify/predicates.test.mjs tests/verify/calls.test.mjs
   ```

   Log: [recovered-focused.log](P-evidence/logs/recovered-focused.log).

2. First integrated workflow and backend check, **30/30 passed**, exit 0:

   ```sh
   python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/cache.test.mjs tests/verify/proof-backends.test.mjs tests/verify/backend-process.test.mjs
   ```

   Log: [workflow-focused-1.log](P-evidence/logs/workflow-focused-1.log).

3. Identity, writer/crash, and CLI drafts, **6/8 passed**, exit 1.
   [identity-io-cli-1.log](P-evidence/logs/identity-io-cli-1.log) retains both
   failures. A filesystem watcher delivered its event after rename, so the kill
   probe failed to interrupt a write. A child script also had a newline escaping
   error. The corrected crash test performs real partial disk I/O, SIGSTOPs that
   process, and lets the parent SIGKILL it before rename. This is filesystem
   fault injection, not injected solver evidence. The corrected expanded run
   passed **18/18**, exit 0, in
   [identity-io-cli-2.log](P-evidence/logs/identity-io-cli-2.log).

4. Final focused checks, **20/20 passed**, exit 0:

   ```sh
   python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/cache.test.mjs tests/verify/manifest.test.mjs tests/verify/cache-io.test.mjs tests/verify/workflow-cli.test.mjs
   ```

   Log: [workflow-focused-final.log](P-evidence/logs/workflow-focused-final.log).
   The actual final invocation ran this command sequentially after the workflow
   script below, inside one locked `sh -c` command. The lane log is
   [focused-final-lane.log](P-evidence/logs/focused-final-lane.log).

   These checks cover the judge's nine forged witnesses, an additional heap type
   forgery, corrupt repair, replay-failed repair, audit disagreements, benign
   forgery trust, stale naive spec/helper-shape/type keys, real source/contract/
   type/tsconfig invalidation, current callee gating, absent cache directories,
   unsupported and residual outcomes, import forms, index/cache/model edits,
   all selected backend JS files and wasm drift, multiple writer/reader
   processes, interrupted writes, stale cleanup ownership, source/config
   relocation, greedy shrinking, and native CLI reproduction.

5. Default baseline and real workflows, exit 0:

   ```sh
   python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/P-evidence/check-workflow.mjs
   ```

   Script: [check-workflow.mjs](P-evidence/check-workflow.mjs).
   Log: [baseline-real-workflows-2.log](P-evidence/logs/baseline-real-workflows-2.log).
   Six cases compare entire default reports and every query phase against
   prepared parent `e435c8a`: scalar identity, requires-definedness, a body-local
   result, heap mutation, a callback, and helper composition. All are identical.
   Historic modules were copied with `git show` into disposable scratch files;
   no old checkout or branch was edited.

   Cold, warm, audit, selection, and plan ran against unchanged pinned
   es-toolkit `1913a7627a2995b095249d6b0b6453b900cdd4bc` with comment-only
   annotations. Both targets verified. Cold wrote two receipts, warm hit both
   with no solver work, plan found both provisional hits, and audit re-solved
   both with no disagreement. Original/declaration hashes and annotation hashes
   are in the log. The source/declaration hashes remain those in the original
   `verify/examples/es-toolkit/provenance.json`.

   All three existing contract failures in `verify/examples/bugs.ts` produced
   confirmed evidence and reproduced natively. `brokenClamp` contains the actual
   implementation bug. The other two expose NaN equality and missing overflow
   assumptions in numeric contracts. The standalone artifact is
   [bugs.json](P-evidence/bugs.json). These bugs predate P and are not a new
   upstream campaign. Original source spans remain in the reproduced outcomes.

   [baseline-real-workflows-1.log](P-evidence/logs/baseline-real-workflows-1.log)
   retains the failed draft. Its `real(x) > 0` probe was unsupported because
   both operands must be explicit reals. The corrected probe uses `real(0)`.

6. The first full verifier suite passed **277/277** on code commit `ed10db6`.
   [full-before-label-fix.log](P-evidence/logs/full-before-label-fix.log) preserves
   that run. Final audit then found a real phase-refactor metadata regression:
   verified answers retained the last postcondition's obligation label. The
   original scheduler returned no pending-obligation label on success. A change
   to subsequent native replay-timeout attribution was an inferred consequence.
   The real Z3 regression check reproduced the extra label, **0/1 passed**, in
   [terminal-label-before-fix.log](P-evidence/logs/terminal-label-before-fix.log).

   The one-line correction excludes labels from terminal verified answers.
   It changes no query or proof domain. The affected backend and workflow checks
   passed **41/41**, exit 0, in
   [after-label-fix-focused.log](P-evidence/logs/after-label-fix-focused.log).

   ```sh
   python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/proof-phase-parity.test.mjs tests/verify/proof-backends.test.mjs tests/verify/backend-process.test.mjs tests/verify/cache.test.mjs tests/verify/manifest.test.mjs tests/verify/cache-io.test.mjs tests/verify/workflow-cli.test.mjs
   ```

   Default reports and every query phase still matched the prepared baseline.
   All real workflows passed again in
   [baseline-real-workflows-final.log](P-evidence/logs/baseline-real-workflows-final.log).
   Commit `c9c4511` records this verifiable correction and its regression test.

7. Full final verifier suite on code commit `c9c4511`:

   ```sh
   python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- sh verify/reports/roadmap/P-evidence/run-final.sh
   ```

   This expands to `node --test --test-concurrency=1 tests/verify/*.test.mjs`.
   Logs: [full-final.log](P-evidence/logs/full-final.log) and
   [full-final-lane.log](P-evidence/logs/full-final-lane.log). The script then
   regenerates the standalone artifact from the final executed workflow and
   replays it through the CLI in the same serial lane. The second full run was
   required by the real correction above. The final result is recorded below.

## Runtime and exact code identity

Executed runtime was Node `v22.23.1`, `darwin`, `arm64`, Z3 package `5.3.3`.
The whole Z3 package fingerprint was
`86b294aa37c79743a43bebec164e16b6fcd03d882041d29311b225ec4424b685`.
Wasm SHA-256 was
`591c5a534abf69c74d6c21813ef36c7e1b2d9b6151bf871a7be4803f542fa377`.
The final workflow identity was
`ffa6dc01465e53e123f77aef439e80c04c93eee8445861facbe15e24961c393c`.

Both checkout and coordinator `pnpm-lock.yaml` matched
`8a0e19b686e00939f10a597f1a9c3b8ae2c25c1dae10d340cba0a365830afa21`.
The temporary dependency link pointed to
`/Users/rick/verification-vibes/verified-list-ui/node_modules`. That shared target
was never installed into or changed. Backend mutation tests used private copies.

| File | SHA-256 at tested code commit |
| --- | --- |
| `verify/source.mjs`, unchanged | `38bbea4deee14933640511a90336142d1d1bde67793c4ae0f752ced597c52e2e` |
| `verify/proofs.mjs` | `50cf540bd5ad12ffb8949cee8a90a52d60f5676b01b544f8bac19158b4b0d8ba` |
| `verify/backend.mjs` | `c0b69326dbe4af694735f06baa3a0934c3cca2c17899c5b6847491697f953bbb` |
| `verify/index.mjs` | `bcb92bc429c375505863ff97d881b960fa3422cda35886803d1832820a03d7e9` |
| `verify/cache.mjs` | `7100b30c6fc411a355084a85d2b6f45f1ea110367ecfb3f0775e47aff371ebc0` |
| `verify/manifest.mjs` | `406625f381f34f44dc65e927b59a481d8d0d8e31cf8354cbc94656eecc306b6f` |
| `verify/evidence.mjs` | `f70f4aa94295477e8a0bc3a91712722a254c8a52205ee2f2eef8a9dc550ed62e` |
| `verify/bin/jsverify.mjs` | `20ce339ff296e3dbc47431a5bcf810ff5bfd1a9dcc54da21871ee6c02a233940` |

## Final receipt

The final full verifier suite passed **278/278**, exit 0, with no failures,
skips, or cancellations on `c9c4511`. The regenerated standalone artifact
reproduced all three contract failures through the CLI, exit 0. All task-owned
processes ended, the temporary dependency link was removed, and the shared
dependency target was not modified. The standalone artifact command is:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/bin/jsverify.mjs reproduce --json verify/reports/roadmap/P-evidence/bugs.json verify/examples/bugs.ts
```

Its output is [saved-artifact-cli.log](P-evidence/logs/saved-artifact-cli.log).
Final reproduction and process/link cleanup are recorded in
[cleanup.json](P-evidence/cleanup.json). Evidence files have a
[SHA256SUMS manifest](P-evidence/SHA256SUMS). The final report/log-only commit is
the commit containing this report; `git log -1 -- verify/reports/roadmap/P-implementation.md`
identifies it. It follows local implementation commits `688fdbf`, `e1de182`,
`ed10db6`, and `c9c4511` without an authorship rewrite.

Independent review and combined integration with C1 remain coordinator work.
This is not a delivered roadmap-completion claim.
