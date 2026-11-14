# Independent C2a source and induction review

Verdict: **ISSUES**.

Measured code is `c1df5f6a7302dc70ede1c43649aa61295d3d80f7`, tree `e6ab0ad2fa9b16633ac86795d0a5bd0c285e4f17`. Evidence tip `6f464327f9d5d7ea48706f334ac13e24d3cad632` was read in `/Users/rick/.t3/worktrees/verified-list-ui/t3-105287a3` and not modified. Prepared HEAD is `5f0fb47a0a822d62537f296ef804d5037eebba5c`. That coordinator snapshot does not contain C2a and is not the tested tree. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor of prepared HEAD. `verify/` exists. The measured tree was a `git archive` at `/tmp/c2a-measure`, with `node_modules` linked from `/Users/rick/verification-vibes/verified-list-ui/node_modules`. Node is v22.23.1. No production file was edited. Omission copies under `/tmp/omit-*` were not git worktrees.

## Request keeps do not state separation

The units named for request/activation separation are weaker than that property. They hold in every interpretation of the membership functions, including models where an abort transition clears pending or running requests. The completeness check accepts them because it checks names.

At the tested tree, `verify/stateful/protocol-rules.mjs` lines 68–69 are:

```
unit("$request$abort-keeps", [], [eq(pending(req), pending(req)), eq(settled(req), settled(req)), eq(running(run), running(run))]);
unit("$request$selected-keeps", [settled(req)], [settled(req)]);
```

On `listeners.ts` those compile to the SMT in `logs/probe-out.json` (`abort-keeps-smt`). `$request$abort-keeps` has pre `true` and posts `(= ($pending $request) ($pending $request))`, and the same shape for `$settled` and `$running`. The term does not mention `$aborted` or an updated map. `$request$selected-keeps` has pre and post `($settled $request)`. `validateProtocolUnits` (lines 77–96) throws `Incomplete protocol induction: missing ${name}` only when an expected name is absent. Abort actions list these two names beside `$abort$contents` (`protocol-transitions.mjs` line 111). `$abort$contents` updates the aborted map. The request units do not say that update leaves pending, settled, and running unchanged.

`$request$creation` is a different shape. Its post is a stored-constant `ite` for pending true and settled false, plus a frame for every other request (`logs/followup.json`). A false stored constant would fail that unit. `$closure$allocation` proves `(not (= $freshClosure $oldClosure))` against one historical closure. Its history `ite` on the fresh closure simplifies to true. `$handles$allocation` proves the two inverse updates. Its third conjunct is `(not (ite (= $freshSignal $freshSignal) false ($aborted $freshSignal)))`, which simplifies to true. The same-segment source step `fresh-aborted-same-turn` verifies `shown === 0` when a fresh alias is read in that segment, so the constant conjunct is not a second defect.

The listener and advisory receipts still verify their scalar clauses. This review found no scalar `state` or `always` that verified while a legal native trace made it false. The gap is the named separation obligation. It is not a false scalar proof of `listeners.ts` or `advisory.ts`.

## Obligations that held

Predictions were frozen in `probe.mjs` before the successful run. Rows are in `logs/probe-out.json`.

Registry creation's precondition begins `(not ($occupied $target $event $callback))` with fresh history. The forward create occurrence-index premise contains that same global absence. Replacing only that occupied-absence atom with `true` and solving that unit returned `counterexample`. That is an abstract solver result, not a native bug. Deleting the occurrence-index emission throws `Incomplete protocol induction: missing $registry$create$occurrence-index`. Deleting the index-occurrence emission throws `missing $registry$create$index-occurrence`. Deleting handler interference keeps throws `missing bind$0$keeps$$closure_278`. Deleting the `$stutter` push throws `missing $stutter`. The expected name remains after the push is removed. A constructor-only module still emits `$stutter` and both correspondence directions. The listener module has 38 units, both directions, `$stutter`, and keeps `bind$0$keeps$$closure_278`, `dispose$0$keeps$$closure_278`, `$stutter$keeps$$closure_278`, and `$closure_278$keeps$$closure_278`. The advisory module has 34 units, `$stutter`, both directions, and no listener handler. No unit repeats a `(declare-` line.

Distinct controller parameters are not proved unequal: `a === b` is an entry counterexample. One controller's `signal` reads are stable, and that module verifies. Two fresh constructors are not proved distinct (`a === b || a.signal === b.signal` is an entry counterexample). That incompleteness fails closed.

An identifier read of `signal.aborted` is a heap effect, not pure. `c.abort()` is `writes`. `c.signal.aborted` without an alias is rejected: `Unknown value c. Calls and ambient values need explicit support.` `resolves signal.aborted === false` is rejected. A `pending` read of `signal.aborted` is rejected as outside C2a. A cell named `result` is rejected. `checkStateful(file, {transitions:[]})` throws `TypeError: checkStateful accepts a file name and source text, never a transition relation.`

`always x === old(x) + 1` on a protocol step is not verified. Both `step$0` and `$stutter` are counterexamples. The entry failure is also the binary64 fact that some values satisfy `x + 1 === x`. Native replay of one call from 0 returns status `ok` and no violation. Native abort of controller `10` returns status `ok` with violation kind `always` and text `x === old(x) + 1`. That is a legal external failure. Production does not verify this module.

Assigning `9007199254740992` does not prove `x !== 9007199254740993` (entry counterexample). `Object.is(x, 0)` after `x = -0` is an entry counterexample. `x === 0` after `x = -0` verifies. Initial `x = -0` with `Object.is(x, -0)` verifies. `Object.is(x, 0)` after `x = 0 / 0` is an entry counterexample. The follow-up state `x === 0 || Number.isNaN(x)` after `x = 0 / 0` verifies. A literal capture `0` does not prove `Object.is(shown, -0)` (handler counterexample). The listener handler precondition pins literal `1` with `fp.eq` to `#x3ff0000000000000` beside the `shown === 0 || shown === 1` patterns. Annotated captures `1 + 1` and `shown` fail at `$closure_211` for both the loose and the exact state. Unannotated `const value = 1 + 1` is rejected `Unsupported or mutable closure capture value.` That is disclosed incompleteness, not a false verify.

`resolves 1 / result === 1` on an unused advisory await with `shown === 0` verifies. JavaScript division is total, so this does not show a partial fact admitting its own domain. Division by an arbitrary parameter after allocation, with state `shown === 1`, fails init and entry. Same-segment `shown = s.aborted ? 1 / q : 1` with a fresh controller and `Number.isFinite(shown)` verifies: aborted is proved false and the division is dead. After an await, `if (s.aborted) shown = 1` with state `shown === 0` is a resume counterexample. Aborted is not frozen false across suspension.

Listener and advisory full queries contain `declare-sort Protocol_target` and do not contain `maxDepth`, `eventBound`, `activationCount`, `maxExecutions`, or `sampleLimit`. Receipt `eventBound` and `searched` are null. The scope text claims arbitrary-length sequences.

## Receipts

`shasum -a 256 -c SHA256SUMS` in the evidence directory exited 0, 97 OK, including `C2a-implementation.md` (`logs/shasum.txt`). `final-fourth.sha256.json` has 27 paths and all match the archive. Fixture hashes match the receipt: listeners `caffe023b53b4005064699ae33240af4eb9fb97aaf028182f16d312a652d1b73`, advisory `4358227cc2aed584cbb0220bf97da366443d924a03bfbbb12355ebe597e5118f`. `proof-final.json` is a two-element list: listeners 38/38 `verified`, advisory 34/34 `verified`. `protocol-final-focused.log.txt` ends `# tests 18`, `# pass 18`, `# fail 0`. The archived test file contains 18 `test(` calls. `full-final.log.txt` ends `# tests 390`, `# pass 390`, `# fail 0`. This review did not rerun the full suite. Earlier logs there (15/15, 387, 388) are historical. Baseline compare uses base `77c95f374742f9a78b931a2310c8bb1147f3c4d6` and tested head `c1df5f6`: 11 rows, all `exact: true`, 40 targets, 296 queries, artifact and query hashes unchanged. An independent re-solve of the archived fixtures, after that receipt check, returned listeners 38/38 `verified` and advisory 34/34 `verified`, with no other status (`logs/reprove.log`). The tautological request units are among those verified statuses.

## Prediction corrections

`collision-same` and `nan-isnan` predicted a verified module. Both fail at `$init` because the state does not hold of the initializer. The collision and NaN distinctions are the entry and follow-up rows above. `resolves-partial` predicted a failed proof and the module verified, because division is total. `capture-plus` predicted an unverified proof; the unannotated capture is rejected before solving. `stutter-load` is an entry counterexample as well as a stutter counterexample.

The first probe invocation failed before writing output: `ERR_MODULE_NOT_FOUND` for `acorn` from `/private/tmp/omit-stutter/verify/stateful/machine.mjs` (`logs/probe-first-failure.log`). The mutant had copied only `verify/`. The rerun after linking `node_modules` wrote `logs/probe-out.json`.

## Limits

Non-literal captures stay unconstrained parameters. Two fresh identities are not proved distinct. A history fact in one unit is not, by itself, an invariant across separately solved units. Completeness is nominal. A finite sample is not an identity-cardinality or safety proof. The compiler, Z3, and Node are trusted. Budget and temporal implementation were not reviewed. C2a is not integrated. The full suite was not repeated.

## Cleanup

After the probes, `/tmp/omit-stutter`, `/tmp/omit-forward`, `/tmp/omit-reverse`, `/tmp/omit-keeps`, and the measurement archive `/tmp/c2a-measure` were removed. No solver process started here remained. The evidence checkout was not modified. This commit contains only `verify/reports/roadmap/review-C2a/proof/`.
