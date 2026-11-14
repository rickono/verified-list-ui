# Conditional-completion correspondence review

**Verdict: ISSUES**

Measured tree: implementation `20ff20556fe19a72f73ccf3708d7bd7329ec2bc0`, evidence tip `1926a8af8effb2316c325b919cd501161877f40e`. Execution used a `git archive` of 20ff205 at `/tmp/cc-20ff205`, with `node_modules` linked to `/Users/rick/verification-vibes/verified-list-ui/node_modules`. The prepared coordinator `c47bbc1bfe15461b27380c9226dcfe07b486d424` was not imported. Node v22.23.1. No `.pstack` file is present. No new full suite was run.

## Heads and blobs

`verify/` exists in the prepared checkout and in the archive. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor of prepared HEAD and of 20ff205. 20ff205 is not an ancestor of prepared HEAD. Ten tracked blobs match among the archive, 20ff205, and 1926a8a, including `verify/stateful/temporal.mjs` SHA-256 `1b84ca9bed641aabdf23b6b7e07112f8554636410c0dc7477bcf321b428837c7`. The 20ff205-to-1926a8a difference is evidence and the implementation report. Source blobs hashed by the receipts match at both commits.

## Commands

Archive extract, from the prepared checkout:

```
rm -rf /tmp/cc-20ff205 && mkdir -p /tmp/cc-20ff205 && git archive 20ff20556fe19a72f73ccf3708d7bd7329ec2bc0 | tar -x -C /tmp/cc-20ff205 && ln -s /Users/rick/verification-vibes/verified-list-ui/node_modules /tmp/cc-20ff205/node_modules
```

Both solver commands exited 0 under `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py --`:

- `node verify/reports/roadmap/review-completion/proof/probe.mjs` — 100 cases. Twelve comparator rows are listed under mismatches. Log: `probe-log.json`.
- `node verify/reports/roadmap/review-completion/proof/followup.mjs` — 5 cases, `mismatches: []`. Log: `followup-log.json`. This command waited while another checkout held `solver-suite.lock` (C2a `full-final`, pid 89220, cwd `ready-now-coordinator`). That process was not stopped.

A compile-only import of archive `false.ts` printed the waiting nonnegative query. It does not call Z3.

## Inherited evidence

Hash-checked, not re-run. focused-final records runHead `5f0fb47a0a822d62537f296ef804d5037eebba5c`, 61 tests, 61 pass, exit 0, and 38 file digests equal to the 20ff205 and 1926a8a blobs. full-final records runHead 20ff205, 496 tests, 496 pass, exit 0, and the same 38 digests. `SHA256SUMS` in read-only checkout `t3-64551363` has 180 lines and 0 mismatches. focused-1 is an earlier snapshot on that parent: 60 tests, 54 pass, 6 fail. Those six failures predate the focused-final tree.

The design and judgment texts read from the prepared tree are the same blobs as on the implementation parent. The judgment's result on the prototypes remains ISSUES. This review measures the later archive.

## Public results on the archive

`checkStateful` on admitted sources:

- Verified, with `nativeConfirmed: false`: zero awaits, one await, two awaits, empty body, all-tail returns, fallthrough, duplicate compiler paths at one return, nested tail returns, `resolves false` together with `rejects`, `result > 0`, a boolean domain without rejects, `Number.isNaN(result)`, `Object.is(result, -0)`, `result === Infinity`, `result === -Infinity`, `Object.is(result, q)`, and the saturation fixture.
- Safety verified, completion unknown, reason `outcome-viability`, plan closed, `nativeConfirmed: false`: `resolves false` without rejects; `q > 0 && result > 0`; `result === NaN`; `Object.is(result, 0) && Object.is(result, -0)`; symbolic `q && Object.is(q, -0)`.
- Dropping `settles eventually` yields goal status `liveness-gap`. The `op` settlement classification is `missing`. Weak resumption is not assumed-used.
- A foreign operation that declares `rejects` does not make `op` with `resolves false` viable.
- false.ts plus a sibling sync entry stays unknown in aggregate.
- `timeoutMs: 1` on two.ts stays unknown.
- Unsupported, and not reported as verified completion: loops, helpers, `Promise.resolve`, object literals, try/catch, an await nested in `if`, a return before a later await, a throw after an await, any `real(...)` contract, `scheduler: "delayed"`, `protocol: "c2a"`, and goal words outside the grammar.

Follow-up sources, all verified and closed: two awaits with an empty middle and `rejects` inside the environment block; `await op(-0)` under `Object.is(result, q) && Object.is(q, -0)`; partial.ts with `await op(q)` replaced by `await op(1)`.

Native traces. two.ts is init, call, resolve, resolve, with `n` cells 0, 0, 1, 2. Two overlapping one.ts calls, then reject of request 1, leave activations `"1"` and `"2"`. Saturation starts at `latest` 9007199254740991, then 9007199254740992 on both calls, with activations `"1"` and `"2"` live. Under `result > 0`, native 0 is illegal and 1 is legal; NaN is illegal and Infinity is legal; -0 and -Infinity are illegal. `Number.isNaN(result)` accepts NaN and rejects 0. `Object.is(result, -0)` accepts -0 and rejects +0.

## Rank, viability, and the manifest

false.ts `work$0` waits at rank 2 then 1. Its own-progress SMT is `true`, and `rankDecrease(exact("2"), exact("1"))` is `true`. Its nonnegative check is:

```
(=> call_fact0 (fp.geq ((_ to_fp 11 53) #x3ff0000000000000) ((_ to_fp 11 53) #x0000000000000000)))
```

The consequent equals `specifications.binary(">=", exact("1"), exact("0")).smt`. A stall that sets rankAfter equal to rankBefore 1 solves as a counterexample; decrease and SMT are `false`. A half-unit rankAfter of 0.5 solves as a counterexample of `(>= (- (/ 1 1) (/ 1 2)) 1)`. Incrementing a waiting exit's rankAfter by 1 marks `source-exit-coverage` missing, and `concludeCompletion` does not verify.

one.ts folds viability to `true` because the operation declares `rejects`. false.ts keeps `(=> call_fact0 (exists ((completion_outcome0 (_ BitVec 64))) false))`. partial.ts quantifies only the completion outcome. The captured argument stays a heap read, so that check is for every `q`. Public partial stays unknown. The frozen call `op(1)` verifies.

On two.ts, with the public report's verified safety, omitting any one of own-progress, interference-nonincrease, pending-keeps, segment-totality, identity-alias, source-exit-coverage, creation, deletion, init, or outcome-viability yields `closed: false` and goals unknown. Swapping the first two obligations yields closed false. Setting an already built plan target's postconditions to `["true"]` yields closed false. A decoy verified evidence row placed before a counterexample row leaves both goals unknown. Clearing `identityFrame` marks identity-alias missing (9 obligations not checked).

`allQueries` also calls `proved` on the first evidence row with the same unit, without reading that row's hash (`temporal.mjs`). The obligation update still requires `querySha256`. The executed decoy stayed unknown.

Follow-up on two.ts: the public manifest and a fresh `completionPlan` are both `9cb0086b7a4b5e89c728732f774fd2fef79d4356911e9c972bad7988aae87875`. All six unit query hashes match. `concludeCompletion` of the public evidence returns `work` and `disturb` verified and closed. Solving that same plan and concluding again is closed and verified.

## Trusted finite-control inference

`RULE` is `c1-per-invocation-completion-1`. It is a finite ordinal argument. There is no infinite-word certificate. Every completion record sets `nativeConfirmed: false`.

The rule, as written above `completionPlan`: fix one invocation; its positive source ordinal decreases on its own call and settlements; the disjoint-identity frame leaves that ordinal unchanged under every other action; a nonterminal suffix waits at a reached request; viability, per-request eventual settlement, and the checked same-action drain force another drop; rank 0 occurs only after return or declared rejection.

Control and occurrence identity are not FP64 cells. Admitted bodies write scalar `$s` cells and actor locals. `identityFrame` is the compile-time boolean requiring scalar parameters or a scalar `$s` record, a scalar or scalar-record result, every footprint path starting at `$s`, cutpoints 0, and no callees. Interference-nonincrease and identity-alias are that flag, not SMT rank queries. Measured frames on the fixtures agree with that recomputation, and plan text has no missing identity obligations.

Native activation ids are `String(++$nextActivation)` with `$nextActivation` a BigInt (`native.mjs`). The traces above use `"1"` and `"2"`. Replay still requires `Number.isSafeInteger(action.request)` before indexing `$requests`. That bound is on the native action record. It is not the proof-domain identity. The saturation trace still kept two distinct live activations. `C1_PROFILE` is bound by `profileSha256`. Searched plan text contained none of `eventBound`, `activationBound`, `maxDepth`, `bv256`, `poolLimit`, or `activationCount`. Solved reports record `eventBound: null`.

Happy-path own-progress is the folded constant `true` produced by `rankDecrease` on that exit's source ordinals when the drop is an integer of at least 1. Coverage rejects any other `rankAfter`. Nonnegative remains an explicit `fp.geq` of that exit's ordinal under the compiled `call_factN` guard. Viability is an exists over Bool or `(_ BitVec 64)` of the resolves AST on the captured arguments, unless `rejects` folds that check to `true`.

## Comparator rows that are not product defects

`derive:one`, `derive:two`, `derive:false`, and `derive:partial` failed the nonnegative comparator. It accepted `implies(exit.path, derived)` or both strings `true`. The compiled guard is `call_factN`, and the consequent matches the independent `fp.geq`. Progress, viability shape, frames, empty cap hits, profile match, and zero missing obligations held on those rows.

`solve-correlated-negzero-constant` and `solve-reachable-real` failed TypeScript stripping (`Expected '(', got '{'`). The legal follow-up `await op(-0)` source verified. `real(...)` was not retried: the three `solve-real*` rows are unsupported with `Exact real contracts are outside C1.`

`solve-empty-middle` is unsupported with `Misplaced rejects clause.` The probe placed `// rejects` outside the environment block. The legal follow-up source verified.

`gate-original` paired the long probe's `solve-two` evidence with a later `completionPlan` and recorded goals `unknown`, `unknown`. The follow-up's first compiles of two.ts show equal manifests, equal query hashes, and verified goals. That unknown pair is the long probe's cross-compile. The gate closes when the evidence is the plan it hashed.

## Defect proved by execution

Public `checkStateful` of false.ts stays unknown with reason `outcome-viability`, safety verified, closed true, and `nativeConfirmed: false`. The production viability SMT is the exists-false formula quoted above.

The probe cloned those transitions, set that check's `smt` to `"true"`, called `completionPlan`, solved, and called `concludeCompletion` with the original verified safety. Observed: goal `verified`, reason null, closed true, `work$0` verified, `work$1` vacuous. Ranks, spans, and the request metadata were left as compiled.

`concludeCompletion` rebuilds the expected plan from the transitions it is given. A query is discharged when that rebuilt hash matches and the solver returns verified or vacuous. The gate does not re-derive outcome-viability from the resolves AST. Substituting `["true"]` on an already built plan fails the hash and stays closed. Regenerating the plan from the substituted compiler check verifies `resolves false`. That bypasses the closure gate for a legal admitted noncompleting source. Unmutated `checkStateful` of the same source does not verify.

## Footprint binding

two.ts `work$0` compiles with footprint `[]`, `identityFrame` true, cutpoints 0, and callees `[]`. Replacing that footprint with `[{path:["ghost"], key:"id"}]` and calling `completionPlan` again left the plan SHA-256 unchanged and left `identityFrame` true. The hash covers binding, obligations, and per-unit query hashes. It does not cover footprint paths. The flag stays at the value compile stored. This run did not verify a public source through that replacement. It is the same trust boundary as the viability defect: a field written before `completionPlan` is not recomputed from the retained footprint.

## Scope

No U, R, S, T, V, or W completion is claimed. Prepared C2a sources were not executed. No canonical roadmap edit, push, pull request, or merge was made.
