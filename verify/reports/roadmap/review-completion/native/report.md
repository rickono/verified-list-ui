# Native review of conditional per-invocation completion

**Verdict: PASS.** No executed product defect. The probe artifact's own `verdict` field is `ISSUES` because three of its assertions were stronger than the contract. Those rows are recorded below and are not defects. This review does not complete U, R, S, T, V, W, or any roadmap node. Design scores remain A 12/18 and B 11/18 in the unchanged judgment. Neither package is a source-completion theorem.

## Checkout

Prepared coordinator `/Users/rick/.t3/worktrees/verified-list-ui/t3-09fc5ec2`, HEAD `c47bbc1bfe15461b27380c9226dcfe07b486d424`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor (`git merge-base --is-ancestor`, exit 0) and `verify/` exists. That HEAD contains separate C2a code. This review did not import or execute prepared `verify/`.

Measured implementation `20ff20556fe19a72f73ccf3708d7bd7329ec2bc0`. Parent `5f0fb47a0a822d62537f296ef804d5037eebba5c`. Evidence tip `1926a8af8effb2316c325b919cd501161877f40e` at read-only checkout `/Users/rick/.t3/worktrees/verified-list-ui/t3-64551363`, clean. `20ff205` is an ancestor of `1926a8a`. Commits after the implementation are `d91ea57` (evidence) and `1926a8a` (TAP whitespace documentation). `git diff --stat 20ff205 1926a8a` outside `verify/reports` is empty.

Baseline is also an ancestor of `20ff205` (exit 0). Design blob `a54021d33c2f9d6a175860dee0a9321ec3a4e9d0` and judgment blob `12de6ddfb4053e2927d7b2e277708a10254cd64a` match at prepared HEAD, `20ff205`, `1926a8a`, and judgment commit `357635ce1e5d123ef78fd840c42caabd133c0b52`.

Node v22.23.1. Acorn 8.19.0 and z3-solver 5.3.3 from `/Users/rick/verification-vibes/verified-list-ui/node_modules`. The archive and prepared trees have no `node_modules`.

## Commands

Solver probe, serial lane, from the prepared checkout. It extracted `20ff205` (78 paths) and `5f0fb47` (70 paths) with `git archive`, symlinked the dependency tree, and deleted `/tmp/review-completion-native-20ff205` in `finally`. Process exit 0. The script sets exit 1 only on an infrastructure throw; `results.json` has no `probe-infrastructure` row. Its `verdict` field is `ISSUES` for the three expectation rows.

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/review-completion/native/probe.mjs
```

Receipt hash check, this continuation, exit 0:

```sh
python3 verify/reports/roadmap/review-completion/native/hash-check.py
```

Archive `machineOf` follow-up. First invocation exit 1: `pathToFileURL` received a URL and threw `ERR_INVALID_ARG_TYPE` before any import. The hook call was corrected. Second invocation exit 0. It does not solve and did not take the solver lane. `stripTypeScriptTypes` printed its experimental warning.

```sh
node verify/reports/roadmap/review-completion/native/followup.mjs
```

## Own solver and native results

`results.json` is the probe log. Passing predicates are absent from `defects`. Imported temporal module was the extract `.../review-completion-native-20ff205/new/verify/stateful/temporal.mjs`.

Legacy correspondence against `5f0fb47`: 31 stateful fixtures, query bytes equal, temporal control absent. Example `compile()` targets equal. `pilots/search.ts` replay status `ok`, 3 steps, equal.

Grammar: `grammarMisses` is empty. Every listed line form and six block-comment forms were `unsupported` with a span on that comment. Attachment rejections: unknown prose in the block, `Resumption fairness requires a completion goal.`, `Duplicate completion goal work.`, `Duplicate resumption fairness request.`, `Temporal clauses belong at module scope.`, environment `leads` and `fairness` as `Unknown line in environment block.`, `Unknown completion entry ghost.`

Admission through `checkStateful`, each `unsupported` and without `completion`: `while (false) {}`, `for (;;) {}`, `Math.random()`, object allocation, `Promise.resolve`, `try/catch`, an arrow, an entry call, and `{then:0}`.

Native replay on the extract: two awaits produce cell sequence `[0,0,1,2]` in 4 steps. The executable keeps `await op()` and contains neither `$activation` nor `$nextActivation`. Suppressed tail (`resolve` 0) returns with `n = 0`. A legal resolve writes `n = 1` (predicate passed, no separate note). Declared rejection returns `environment-rejected`, `n = 0`, one request. A call with no response stays `ok`, activation `live`, and is not confirmed. Illegal zero, stutter, stale source envelope, and an extra suffix are `illegal-environment-action`, not counterexamples. Saturation `latest` is `9007199254740992` with activation ids `["1","2"]`. Synchronous `throw new Error("stop")` and the same throw after an await are `unknown` / `replay-runtime` / faults `["stop"]`. `while (true) {}` with `timeoutMs` 50 is `unknown` / `replay-timeout`.

Solver classifications, `nativeConfirmed` false throughout:

- `zero`: verified, birth `"1"`, terminal `"0"`, `weak-resumption=discharged-unused`, `continuing-runtime=assumed-used`, no discharged per-request settlement.
- `one`: verified, `op=assumed-used`, `weak-resumption=discharged-used`, `total-declared-environment-calls=assumed-used`.
- `two`: both goals present. `work` has `unused=assumed-unused`, `op=assumed-used`, waiting `"2,1"`. `disturb` has `op=assumed-unused` and `weak-resumption=discharged-unused`.
- Nested `if (done) return; else return;`: verified, birth `"1"`.
- `resolves false` plus weak fairness: `unknown` / `outcome-viability`, safety verified, `op=assumed-unused`, `weak-resumption=missing`. Weak fairness did not discharge the disabled action.
- Partial domain: same outcome-viability refusal, weak missing, `op` assumed-unused.
- Settlement clause removed: `liveness-gap`, `op=missing`, `weak-resumption=discharged-unused`.
- Split `op` / `bad` with `bad` resolving false: both `work` and `other` stay `unknown` / `outcome-viability`, with both operations assumed-unused and weak missing. Neither goal verified.
- Legacy module with only `state`: `verified`, no completion object.
- `throw new Error("literal")`: `unsupported`, no completion.
- Safety `always n === old(n)` on a write: `counterexample`, confirmed text `strict native replay of the unchanged executable source`, completion `unknown` / `safety-prerequisite`.
- `timeoutMs` 1 on `two`: `unknown` / `solver`. `maxDepth` 0: `unknown` / `induction-gap`. Neither confirms an infinite bug.
- Options `scheduler: "delayed"`, `protocol: "c2a"`, and `scheduler: "c1-action-cuts"` are `unsupported` with no completion object.
- `{profile:"alternate"}` still verifies. The bound profile is `{kind:"c1-action-cuts", version:1, microtaskMode:"afterEvaluate", drain:"void 0;", resumption:"same-action-timed-drain", arrivals:"arbitrary-between-actions", eventBound:null, activationBound:null}`.
- Source `result > k` at `k === 2^53` is `counterexample` twice, witness JSON equal. `result === k + 1` is `verified` twice, witness JSON equal. Fields were not deleted.
- Rank after forced to `1` and to `0.5`: `counterexample` / `own-progress`.
- Parity test at `20ff205` contains `Parity solver request changed` and `JSON.stringify(actual)`, and does not delete a witness or model field.

## Probe rows that are not defects

`grammar`: `grammarMisses` empty. The only attachment miss is adjacent comments `// returns a boolean`, `// see the note`, and `// Stale-response documentation` directly above `// leads work completes`, message `Unknown line in temporal contract block.` The temporal walker treats the whitespace-connected comment run around `leads` as one block and rejects an unknown line there. That is the fail-closed rule.

`immutable-capture`: replay status `ok`, request args `[1]`, a different resolved value is `illegal-environment-action`, and `let held` used only as `op(held)` parses. Captures are bindings live after the await. The call argument is snapshotted. That `let` is not live after the await, so the `/immutable/` expectation does not apply.

`stale-evidence`: `concludeCompletion` reports `closed: true` and goals `["unknown","unknown"]`. `closed` compares the reconstructed plan, binding, obligations, and target query identities with `completionPlan`. It does not compare evidence hashes. The tampered `querySha256` leaves the matching proof lookup unresolved, `ready` false, and the goals unknown. The goals are not verified.

## Follow-up on archive `machine.mjs`

Pins match `git show 20ff205:path` from the archive. SHA-256: `temporal.mjs` `1b84ca9bed641aabdf23b6b7e07112f8554636410c0dc7477bcf321b428837c7`, `machine.mjs` `c7e911950c6b8411b35aa37294f0b0b4a50e03908f677bfd3781933ea1eaa7e4`, `clauses.mjs` `12df5559e1e3b545d2d559d8c1f8f05611a78c8bce1c993359abe80eec2186bc`. Import URL is the archive file.

| Row | Result |
| --- | --- |
| Adjacent prose above `leads` | `unsupported`, `Unknown line in temporal contract block.` |
| Same prose separated by `export function marker() { return 0; }` | parsed, goal `work` |
| `let held` assigned into `n` after `await` | `unsupported`, `Captured held requires an immutable annotated scalar binding.` |
| `const held` in that position | parsed, capture `const:held`, goal `work` |
| `// leads  work completes` | parsed, goal `work` |

## Retained receipts

These are the evidence directory's receipts, not this review's runs. `hash-check.json`: `SHA256SUMS` has 180 entries and 0 mismatches against the archive files. Each receipt `sha256` map was compared with `git show 20ff205:path` and with the archive working tree.

| Receipt | Exit | TAP | runHead | Hash vs `20ff205` and archive |
| --- | --- | --- | --- | --- |
| focused-1 | 1 | tests 60, pass 54, fail 6, `duration_ms` 60923.436791 | `5f0fb47` | 6 mismatches; failure text kept |
| focused-2 | 0 | 60 / 60, `duration_ms` 58342.94075 | `5f0fb47` | 5 mismatches |
| focused-final | 0 | 61 / 61 / fail 0, `duration_ms` 60289.743959 | `5f0fb47` | none |
| full-final | 0 | 496 / 496 / fail 0, `duration_ms` 828752.270416 | `20ff205` | none |

focused-1 mismatches: the three completion tests, `verify/source.mjs`, `verify/stateful/clauses.mjs`, `verify/stateful/temporal.mjs`. focused-2 is that set without the parity test. Both final receipts have `preparedHead` `5f0fb47` and `coreUnchangedDuringRun` true. focused-final names the parent as `runHead` while its hashed bytes are `20ff205`. full-final names `20ff205` as `runHead`. The preserved focused-1 failure is not a current-source result.

## Limitations

Public `checkStateful` rejects temporal `scheduler` and `protocol` keys. An unknown `profile` key is ignored and the report stays on the C1 profile above. That is the measured API. Settlement rows are one per declared operation. `two.ts` awaits `op` twice and records one `op=assumed-used` row, while `rank.waiting` is `"2,1"`. The row scope text says each reached request occurrence. Both sites are that same declaration. Same-action resumption is discharged only with the profile check; `settles eventually`, continuing runtime, and total declared environment calls stay assumptions. `nativeConfirmed` stays false. No full suite was rerun. No C2a integration was run.

## Cleanup

`/tmp/review-completion-native-20ff205` and the `var/folders/.../T` copy are absent. This review's `probe.mjs` and `followup.mjs` processes have exited. Other sessions still hold `serial-verify.py` for `review-completion/proof/followup.mjs` and a C2a `full-final` seam run. Those processes were left running. The archive checkout is clean. This commit contains only `verify/reports/roadmap/review-completion/native/`.
