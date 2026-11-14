**ISSUES — implementation base is Candidate A’s per-invocation correspondence rule, with the corrections below.** Neither package delivers conditional liveness. Source completion stays unknown. No U, R, S, T, V, or W node is complete.

Reviewed immutable heads:

- A: `13672f7c11c8dd5849ec550fe43f3a226252f453`, `verify/reports/roadmap/candidate-temporal-codex/`.
- B: `51a8bb6b3ae0897b242fa5781ac003796cc85a5a`, `verify/reports/roadmap/candidate-temporal-grok/`.
- Current source: `2809e885ef01e09da906ddc31e070fde1df180a2`.
- Checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-9d9ef436`.

`32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor of HEAD, and `verify/` exists. Public C1 `77c95f3` is an ancestor. Candidate parent `07c6485` is not; the merge-base is `77c95f3`. Every `verify/stateful/` blob matches that parent (`native.mjs` is `e767a0851db2e122b380481cbaa2916a67fe17ba`). `verify/source.mjs` has the later K loop, heap, and throw edits. Own solver results use HEAD. The full suite was not rerun.

Both packages’ grounding, design, contract, sketch, and evidence were read, with the architect rationale, red-flag list, and deep-module vocabulary. A’s manual SMT was read and not re-solved. B’s classifier was re-executed from `git show`. The root preference for A was a hypothesis.

Scale: 0 absent, 1 predicted, 2 grounded with gaps, 3 demonstrated.

| Criterion | A | B |
| --- | ---: | ---: |
| Source-to-infinite correspondence without hidden bounds | 2 | 2 |
| Rank, interference, enabledness, explicit fairness | 2 | 1 |
| Binary64, identity, and cardinality fidelity | 2 | 2 |
| Honest outcomes and infinite-counterexample replay | 2 | 2 |
| Deep C1/C2 integration and a small first contract | 2 | 2 |
| Executed evidence with disclosed limits | 2 | 2 |
| **Total** | **12** | **11** |

## Base

A is the base because one private temporal owner can close exit coverage, the obligation manifest, and the C1 profile, while callers still use only `checkStateful(file, source, options)`. The measured scheduler split supports the hypothesis in one direction. On a two-await source the native trace is `init`, `call` (`n=0`, one pending request), `resolve` (`n=1`), `resolve` (`n=2`, both requests settled). The write between the awaits happens inside the settlement action. `microtaskMode: "afterEvaluate"` plus `void 0` drains the continuation before the next external action. Resumption fairness for that profile can be discharged after segment totality and exit correspondence pass. A call-only prefix stays `ok` with `n=0` and one pending request, so choosing to settle is not discharged. `settles eventually` remains an environment premise.

B’s `fair settlement` repeats that fused occurrence as a second undischarged user premise. Re-executed `classifyLasso` returns `unfair-excluded` when either premise is true. The premises are interchangeable in the witness rule and both required in `judgeCompletion`. Weak fairness also does not fire when the action is disabled. `resolves false` with no `rejects` still makes safety `verified`, the resume unit `vacuous`, and `settles eventually` recorded as unused. Native resolution of `1` is `illegal-environment-action`. A disabled settlement is not an enabled gate that weak fairness can force.

B’s segment ranks match the fused grain more closely than A’s ready phase, and that part is grafted. They do not make B the base. `deriveSegmentRank` returns `[0]` for a zero-await entry whose only segment still assigns `done`, and `[2,1,0]` for two awaits whose last segment still assigns `n=2`. Rank 0 is a live location in that schema. The infinite argument that rank 0 means the invocation has returned is false for those states.

## Correspondence, exits, and fairness

Zero awaits: one segment, units `$init` and `work$0` only. The call action changes `done` from false to true and opens no request. Completion is the entry action. A’s reproduced phase formula has top rank 0 and no sites. B’s rank is `[0]` at birth. Both need a positive birth rank that reaches 0 only after that segment finishes, with no settlement premise.

Two awaits: three segments, the first source segment empty, and unit `work$0` still present. A’s formula, applied to that entry, waits at 4 and 2 and has edges `settle`, `resume-resolve`, and `resume-reject`. Those ready ranks are not C1 actions. The native kinds are only `init`, `call`, and `resolve`. Modeling `entries[0]` alone, as A’s manual probe does, drops a second entry.

Returns before a later await are unsupported: `Returns before a later await are outside C1.` A conditional return in the final segment is accepted. The return is nested in the `if`, which is why the frozen top-level-return flag was false. Resolving `0` leaves `n=0` and no pending request. Resolving `1` sets `n=1`. Completion includes that suppressed write. Rejection of the first request leaves `n=0`, one settled request, and no second request. The production unit for that path is `$reject` with kind `stutter`. It has no activation identity. Cell stutter and “this invocation reached a rejection terminal” are different obligations.

Two entries with pending clauses produce `$init`, four segment units, the stutter reject, and 10 interference units. No unit name is a progress, rank, or completion obligation. An `ensures true` function verifies while returning its input. A stall whose contract demands a drop of one exact unit is a counterexample. Those are synchronous controls. They show a constant true formula in a neighboring target is not own-progress.

`resolves result > 0` verifies, including a non-vacuous resume. Native `0` is illegal and native `1` sets `n=1` with nothing pending. Viability is the resolves domain. The resume postcondition `n >= 0` does not create a legal value. Infeasible premises must not inherit the vacuous safety verdict.

The assumption record states the C1 scheduler, `eventBound: null`, unbounded repeated entry calls, and “none used by safety.” It does not state environment-call totality or that the runtime continues. `throw new Error("stop")` is accepted by `machineOf` and returns `unknown` / `replay-runtime` with fault `stop`. Totality and continuation stay explicit assumptions.

Finite maximal runs are the traces above. Time passage without a new arrival is a stutter: it adds no call and does not settle. It does not satisfy `settles eventually`. It also does not forbid a later call. Weak fairness of a ready continuation is the drain, after totality. Weak fairness of settlement selection remains the environment premise, and only while a legal outcome exists.

A’s fairness queries were read and not re-solved. They conjoin a self-loop with its negation, so unsat is that contradiction. The interference query assumes `(= next q)`. Those files do not discharge the manifest.

C2 per-handler cuts stay a different profile. A one-step `always` does not cross handlers, and a handler cut must not reset this rank. C2a was not executed. `machine.mjs` still rejects closures and handlers.

## Infinite words, native bounds, and grammar

A finite pending prefix is status `ok`. It is not an infinite counterexample and not a completion refutation. Timeout `1` on the false `always` source is `unknown` / `solver`. `maxDepth: 0` is `unknown` / `induction-gap`, with the production sentence that exhaustion is not a proof. The resume unit there is a counterexample; search did not confirm it. A one-millisecond `verify` of the rank bundle is `unknown` for every function.

B’s fresh-call cycle has no cell or pool field. With both premises absent, `classifyLasso` returns `legal-infinite-pending`, `nativeConfirmed: false`. Endless fresh calls grow the pool. That object is not a closed lasso. A’s design already asks for equivariant renaming or an indexed word. The first contract reports `liveness-gap` until that check exists.

At `latest = 2^53-1`, two calls leave `latest = 9007199254740992` and two pending requests. Semantic identities stay distinct from the source `Number`. Frozen `ensures result === k + 1` at `k === 2^53` **verified**. The specification addition collapses with the body. Follow-up, predicted separately: `result > k` is a counterexample and `result === k` verifies. A half-step `real(k) - real(result) >= real("1")` from `1` to `k/2` is a counterexample. The original `half` row was also a counterexample, at phase `requires-definedness`, so that match does not refute the decrease postcondition.

A verified one-iteration loop contains `bvule` and no `eventBound` or `_ bv256`. The false-resolves stateful assertions contain none of those tokens, and `eventBound` is null. A scan hit is not a pool bound. Absence of the token is not, by itself, an unboundedness proof. No Int cardinality bridge is required for this goal. If a later goal needs it, the ghost is exact `Int`, bijective with activation identity, and a binary64 cell bridges only inside a proved safe-integer range.

Current grammar fails closed on `leads`, `leads work succeeds`, an interior `leads`, `fairness`, `FAIRNESS`, `fairness.`, `fairnes`, Cyrillic `fаirness`, `abort`, a block `leads`, and `settles soon`. Module-level `completes`, `fair settlement`, `rank 1`, `commits shown`, and `count pending` parse as ordinary prose (`kinds: ["state"]`). The same `fair settlement` line inside an environment block is `Unknown line in environment block.` New words have to enter the one grammar or they stay invisible. A’s exact `leads <entry> completes` is the admitted form. Other tails, `fair settlement`, `commits`, user `rank`, and `count` stay unsupported.

Safety `verified` plus `literalDrop` `verified` is still `unknown` under the review rule `no-correspondence-theorem`. That rule is this review’s composition check. It is not a product verdict. Several discharged queries may later compose, once a checked correspondence theorem ties their hashes, exits, identities, and profile. One query is neither necessary nor sufficient.

## Whole alternative

The full omega backend is a real second architecture: source-derived configurations, FP64 cells, finite-support maps over a generative identity domain, a negated-goal automaton, and per-identity justice, using the existing expression compiler. A describes that shape. B’s writeup starts from one representative plus a summary interference step, which is a witness abstraction. The full backend loses the first vertical because allocation, finite support, justice preservation, and FP64 correspondence all have to land before the same completion result falls out. It remains the later base for global leads-to. Finite BFS, a default ban on further arrivals, a caller-supplied transition relation, binary64 or bitvector ranks used as unbounded naturals, and success, commits, or global emptiness as the first goal are rejected.

## Required corrections and grafts

Graft B’s segment-remainder integers onto the fused C1 action, using `specifications.rankDecrease` on exact literals, with no module cell and no second decrease helper. Graft the separate safety status, `nativeConfirmed: false` for every infinite word in this unit, and the cap-scan lesson, including B’s two retained wrong predictions. Graft rejection-to-terminal for the rejected activation.

Required corrections:

1. Discharge only same-action resumption, after totality and exit correspondence. Keep per-reached-request `settles eventually` assumed. Do not admit `fair settlement` as a second premise. Record the C1 profile `discharged-used` only when that check passes. A delayed scheduler must not reuse the discharge.
2. Rank 0 is the post-terminal state. Cover zero awaits, two awaits, empty entry segments, every entry, nested tail returns, and declared rejection. A ready rank is an explanation of the macro step, not a C1 cut and not a user premise.
3. The manifest lists init, own progress, nonincrease, keeps, creation, deletion, and identity alias. Another activation’s deletion does not increase this rank. Source `Number` collision is not identity alias. `$reject` as written is not own-progress. A missing item fails closed. `ensures true` is not the decrease rule.
4. Viability uses the resolves/rejects domain only. `resolves false` without `rejects` plus `settles eventually` is infeasible, including when safety is verified and the resume unit is vacuous. A partial domain stays partial.
5. State environment totality and continuing runtime as assumptions. A thrown entry is `replay-runtime`, not completion.
6. Stutter is time passage without an arrival and without a settlement. A lasso closes source and pool state, or carries a checked equivariant renaming, respects every persistent identity, avoids the goal, and meets the reported fairness. A growing pool is an indexed word. A pending prefix is a finite trace.
7. One grammar. Fail closed on the prose words above, on Unicode, case, punctuation, typos, and block comments, at the original span.
8. Outcomes keep safety, completion, and fairness (`assumed-used`, `assumed-unused`, `discharged-used`, `discharged-unused`, `missing`) apart, plus `liveness-gap` and `unknown`. No infinite native confirmation from a prefix, a timeout, or an exhausted search.

## Smallest production contract

Stage 1 is grammar only. No completion verdict changes. Positive gate: the unsupported words above fail at their spans. Negative gate: prose `completes` does not verify.

Stage 2 is the manifest and one goal, `leads work completes`.

Positive, through `checkStateful` and native replay:

- Zero-await completion in the call, with no settlement premise.
- One-await and two-await completion under `settles eventually`, including another entry’s calls. The two-await oracle is the measured `n` sequence `0,0,1,2` on `init, call, resolve, resolve`.
- Declared rejection completes with the cells unchanged.
- `if (a === 0) return` in the tail completes with the later write skipped.
- A true pending keeps obligation still verifies, and own decrease is a real `rankDecrease` query on the segment target.

Negative:

- No `settles eventually`: safety may verify; completion is `liveness-gap`; the pending prefix is not native-infinite.
- `resolves false`, no `rejects`, with `settles eventually`: not verified.
- `result > 0`: value `0` illegal, value `1` completes.
- A manifest with own-progress or interference removed: not verified.
- `ensures true`, a nondecreasing body, or a half-unit real drop: not completion.
- Two calls from `2^53-1` leave two requests. `result > k` at `2^53` is a counterexample. `result === k + 1` must not be offered as that witness.
- `leads work succeeds`, `commits`, `fair settlement`, and `abort` stay unsupported.
- `timeoutMs: 1` and `maxDepth: 0` stay `unknown`.
- C2a is not a dependency. A handler cut does not reset this rank, and endpoint `always` is not added for a nonempty dispatch.

## Evidence, mistakes, and limits

Own: `logs/observed.json` (53 rows, 2 mismatches), `logs/followup.json` (2 rows, matched), and the run logs. Predictions hash `5f235d7b24b17d8d5ad01014c58d3ad1146f77629c56787b0da5dacb07dcd8fb`. Follow-up hash `2d33b1dfc580968ca31808fed676cd581ae06900c0bcd0b15ef3e8ee991379f6`. Attempt 1 missed `verify/index.mjs` by one import level and solved nothing. Predictions were not edited afterward.

Inherited, not re-run: A’s 14 source rows and 11 manual queries, B’s 34/36 probe log, C1 receipts, and the selected C2 design. Both candidates already say the source temporal proof is unsupported.

Predicted: the staged contract and any completion verdict. Sketch bodies throw. No false source proof was produced.

Preserved mismatches: the tail return is nested, not a top-level `ReturnStatement`; `result === k + 1` at `2^53` verifies. The follow-up was a new frozen file.

Limits: A’s SMT files were not re-solved. Stateful queries on HEAD were not diffed byte-for-byte against A’s saved targets. No C2a run, no full suite, no upstream execution. The temporary `node_modules` link used only to resolve Acorn 8.19.0 and z3-solver 5.3.3 was removed. No probe process remains.

Commands, from this checkout:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/judgment-temporal/scripts/probe.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/judgment-temporal/scripts/followup.mjs
```

Node v22.23.1. Probe exit 2 from the two frozen mismatches. Follow-up exit 0.
