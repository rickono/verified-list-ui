# Judgment: guarded-throw candidates

Status: **ISSUES**. Review checkout `5e501991dcf124ebc06f149e3d603adf00caa737`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor. No candidate or P edit is applied, and no roadmap node is complete.

Candidates, read at their commits and executed from `git archive` copies: A Codex `f5473537eb543470feef3f886e778f2737f8ed43` (`candidate-throws-codex`), B Grok `f5c3d471afda371b5f3805ee888c9d0e4688c38e` (`candidate-throws-grok`). Parent of both is `6a84478f31dff7005bc5d3ef4581aa00be203e33`. Archived `verify/source.mjs` is `38bbea4deee14933640511a90336142d1d1bde67793c4ae0f752ced597c52e2e`, `verify/index.mjs` is `f8a4f8c173a2185c01f1dc4626fbd5e9a2f4cc566639a4e5e75a90c7f0f3a75c`, and `verify/proofs.mjs` is `8b0cc8361db5cf42882f8145ccd53940ced483c71af1dd081391ae301dd3ba9c`. Those three hashes matched again after the runs. Original `harmonic_mean.js` is `c0bcedc78add016bd1f22ce9eb1a417363ac72d8cb5c0e7dfa4c74062a19f71d` in both packages (simple-statistics `a9ec6767820e3fc7c29ab5f179778308c75a2f47`, ISC).

## Scores

Scale: 0 absent, 1 predicted, 2 grounded with gaps, 3 demonstrated.

| Criterion | A | B |
| --- | ---: | ---: |
| Verified result proves throws unreachable under requires, without vacuity or self-discharge | 3 | 3 |
| Branch, loop, return, and earlier-fact order preserves native semantics | 3 | 2 |
| Unchanged-source replay confirms failures; uncertainty stays unknown | 3 | 3 |
| One small compiler/replay boundary, no exception framework | 3 | 2 |
| Harmonic mean plus positive, negative, and mutation controls | 3 | 3 |

No executed admission returned a false `verified`. The drop-check mutants do, and they stay out of production. B is not landable as-is: every verified report gains fields, and a throw after an abstract loop is called a concrete verifier discrepancy.

## Shape

Both emit `{guard: path, safe: "false", assume: "true"}`, drop the state, and push no return. The fold asks `pre AND path AND earlier call facts` to be unsatisfiable. `pre` is requires only. The event adds no fact. The separate abrupt-exit list is sketched only.

A admits unshadowed `throw new Error("string literal")`. B leaves the argument opaque and does not call `expression()` on it. Neither models constructors or `try`/`catch`. An always-throwing function still fails "Every syntactic path must return" (both, own run).

## Own controls

Public `verify` on the extracted overlays. Solver work went through `serial-verify.py`. Logs: `logs/focused-A.json`, `logs/focused-B.json`, `logs/followup-A.json`, `logs/followup-B.json`.

Shared outcomes, both seats:

- Guard `x > 0` around `throw new Error("no")`: verified. The throw label is concrete. `pre` does not contain `call_fact`.
- Reachable `throw new Error("boom")`: `unknown` / `replay-mismatch`, `JavaScript replay failed: boom`.
- `requires false`: vacuous. `real(x) > real("0") && false`: confirmed `requires-definedness`, input `NaN`.
- Reachable throw with `ensures false`: still that replay-mismatch. Unreachable throw with `ensures false`: confirmed ensures failure, result `1`, witness `flag false`.
- Earlier call whose ensures is `result === false`: throw obligation is `(=> (and call0 call_fact0) false)`. Helper and caller both verified.
- Throw before a later `ensures false` helper: throw obligation is `(=> input_0 false)`, with no `call_fact`. Caller stays `replay-mismatch`.
- Call to `ensures false` and then a throw: the throw obligation does mention `call_fact0`, so the false fact would discharge that one query. The caller’s final status is `unknown` / `dependency-violation`, because replay saw the helper break its contract. The caller is not verified.
- Helper `requires x > 0` after the caller’s own throw: caller `replay-mismatch` (`no`), not verified.
- Caller that invokes a throwing helper only on the unsafe branch: caller `unknown` / `dependency`.
- Optional widening (`v = undefined` on a back edge, `requires !flag`): verified, exactly one committed `throw-unreachable` event, `abstract: true`, loop span present.
- In-loop weak `y`: both `induction-gap`, phase `throw-unreachable`, `abstract: true`, loop span set. A’s message is the GAP sentence. B’s `message` value is `undefined` (`GAP` has no throw entry). The first `try` fixture died on a missing parameter type; the follow-up is `unsupported` `TryStatement` for both. A type assertion in a throw argument, dead path included, is erased-syntax `unsupported` for both.

Post-loop throw, same SMT on both seats, `ensures true` and `ensures result === 0`:

- A: `abstract: true` from `cutpoints > 0`, no loop span. `induction-gap`, phase `throw-unreachable`, GAP sentence present. `result === 0` stays unproved.
- B: `abstract: false` because `throwLoop` exists only inside the loop body. `replay-mismatch`, "This indicates a verifier discrepancy." The obligation text matches A. The candidate is unconfirmed, and the wording calls it a discrepancy.

Drop-check. Both verify, while native `true` throws `boom` and native `false` returns `1`. B records witness `flag: "false"`. A’s report has no `inputs`. A’s mutant sets `safe` to `"true"`; the fold drops that tautology, so the throw list is empty. The unmutated twin is the replay-mismatch above, so the accepted boolean witness is `false`.

Shadowing, follow-up, `const Error = 1` and a module `function Error()`:

- A rejects dead and live throws, local and module. The guarded builtin literal is the case that verified.
- B verifies dead shadowed throws (`requires !flag`, result `0`): the constructor is not evaluated. Live shadowed throws stay `replay-mismatch`, `Error is not a constructor`.
- A rejects a computed `new Error(flag ? "a" : "b")`. B verifies it under `requires !flag` and leaves the live throw at `replay-mismatch` (`a`).
- A rejects `throw (y = 1, new Error("w"))`. B verifies `result === 0` under `requires !flag` and `y === 0`. That unreachable write matches the native result. One case.

Old `identity`: both verified. A’s viewed outcome keys match its unpatched baseline and omit `inputs`/`result`. B’s verified outcome adds `inputs` and `result` (`x` `0`). That field change is the whole default-report delta measured here.

## Harmonic mean

Annotations are comments only. Stripping `requires` / `ensures` / `invariant` / `decreases` lines recovers the original bytes for both candidates’ total and positive files. The domain is `x.length === 1` and `Number.isFinite(x[0]) && x[0] > 0`, with no fixed input and no reciprocal-finiteness restriction. A uses the same disjunction on both goals: `(i === 0 && Object.is(reciprocalSum, 0)) || (i === 1 && Object.is(reciprocalSum, 1 / x[0]))`. B uses the same ternary on both goals: `i === 0 ? Object.is(reciprocalSum, 0) : Object.is(reciprocalSum, 1 / x[0])`. The formulas were not diffed. Each public proof used that candidate’s own text. The empty-array throw is concrete on both (it sits before any cutpoint). The in-loop positive-check throw is `abstract: true` with a loop span on both.

| Goal | A | B |
| --- | --- | --- |
| `ensures true` | verified | verified; witness `[3.337610787760802e-308]` returned that value |
| `ensures result > 0` | confirmed counterexample, `[3.3951948877e-313]`, result `0`, failed text `result > 0` | confirmed counterexample, `[8.700182742958e-311]`, result `0`, failed text `result > 0` |

Native calls of those displayed inputs return `+0` and do not throw. `Number.MIN_VALUE` is native `+0`. Input `49` goes from bits `4048800000000000` to `4048800000000001`, one ulp, and is not the bug. Native `[]`, `[-1]`, and `[0]` throw the original messages. Those throws were not confirmed counterexamples.

Weak sum, same requires, sum conjunct removed, `ensures result > 0`. The first A derivation also deleted executable `reciprocalSum` lines; that `unsupported` row is discarded. The corrected A file and B’s weak file both strip to the original. Both public runs returned a confirmed counterexample, `[1.35807730622e-312]`, result `0`, and that displayed input is native `+0`. B’s inherited summary had witness `[5.006416181641203e-308]` and `induction-gap` on `ensures`; that displayed value returns itself. Witness choice moves the weak query between a real overflow and a gap. Neither run verified `result > 0`.

## Recommendation

Base is A: ordered event, unshadowed `throw new Error("string literal")`, `abstract: unit.cutpoints > 0`, collector span, one GAP sentence. Leave out B’s loader, `CANDIDATE_THROW_MUTANT`, and verified `inputs`/`result`.

B’s opaque argument survived the dead computed message, dead shadowed `Error`, unreachable loop write, and erased-syntax rejection without a false `verified`. That is a wider admission, and it is not the first contract. Harmonic mean’s two sites already fit A. A later opaque widening still uses `cutpoints > 0` and the GAP string.

No `try`/`catch`, Error-value, or throw-site framework. A reachable throw stays unverified. A native exception stays `unknown` / `replay-mismatch`.

## First production contract on P

P `98c06aab10e9f68a707db06449bb79cbf8629537` has the same `source.mjs` hash. `index.mjs` and `proofs.mjs` differ. Commit `c9c45110b8669f99f83c4330d6efe1b6202ff1be`, present there, drops the last postcondition label when `o.status === "verified"`. Keep that judge. The three edits below were not applied or run.

1. On `ThrowStatement`, apply A’s syntax gate, push the ordered event with `abstract: cx.unit.cutpoints > 0` and `cx.loop.span` when a loop is current, then clear `states`. Push no return.
2. Put `span` on the loop collectors. Do not add `throwLoop`.
3. Add `GAP["throw-unreachable"]` beside P’s messages. Leave `put({ status: "verified" })` and `phases()` unchanged. Throw events are ordinary postconditions after definedness and feasibility. `judge()` already maps a thrown replay to `replay-mismatch` and an abstract unconfirmed label to `induction-gap`. B shows that gap’s message is undefined until the GAP string exists.

No cache field, loader, or report-shape change. Q stays open.

## Commands and limits

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- bash verify/reports/roadmap/judgment-throws/scripts/run.sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- bash verify/reports/roadmap/judgment-throws/scripts/followup.sh
```

`logs/commands.txt` has the follow-up text that actually ran. `followup.sh` is that same archive plus `followup.mjs` sequence, saved after the run.

Both exited 0. Node `v22.23.1`. The coordinator `node_modules` symlink lived in a deleted `/tmp` tree. Core hashes were unchanged. No full suite, no P replay, and no SMT diff of the two sum invariants. The abrupt-exit list was not executed. One post-loop fixture, one widening fixture, and one unreachable write-in-argument fixture bound those rows.
