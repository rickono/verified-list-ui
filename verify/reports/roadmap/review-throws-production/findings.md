# Review of guarded throws at b16d07b

Status: **PASS**. Execution reproduced the admitted-throw rule, the harmonic-mean failure, and the recorded receipt heads. No product defect survived.

## Scope

The review worktree is `t3/review-throws-verifier`. Its HEAD before this commit, `74c3747afd1c60d334b8c0713be5786dc715111a`, contains no `throw-unreachable` code. The implementation was read and executed from `git archive` snapshots. Tested code is `b16d07b9fa7514b60084377959e2d155385d49ce`. Evidence tip `769210310b1f4f05856010568c0a1e330538033b` was hashed and read. Parent `dedde91b9f6e1fec3a30f5e39cae65f5381b6b26`. Rule commit `eab85932e56a86ecfaa559f018bea3049cc4b993`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor, and `verify/` exists. `b16d07b` has no AGENTS.md, CLAUDE.md, CODING_STANDARDS.md, CONTRIBUTING, pstack file, or `.editorconfig`.

`8fa17d652d3b6e5b7ebbccc42b2d81e90ead701e` shares merge-base `dedde91` with the patch. `proofs.mjs`, `heap.mjs`, `data.mjs`, `solver.mjs`, `backend.mjs`, `cache.mjs`, `manifest.mjs`, and `evidence.mjs` are the same blobs at the parent, at `b16d07b`, and at `8fa17d6`. The patch edits `verify/source.mjs` by 13 lines and `verify/index.mjs` by the one gap sentence. C1 integration, K, Q, and roadmap completion were left untouched.

## Patch

`statements` admits an unshadowed `throw new Error` with one string-literal argument. `Error` in the module map or in any current environment rejects the statement. `fail` throws before an event is recorded. Each current path gets `{guard, safe: "false", assume: "true"}`, kind `throw-unreachable`, the throw span, `abstract: cutpoints > 0`, and the active loop span. The path list is cleared and no return is added. `assume: "true"` adds no fact. The fold consults only facts already recorded, so a later fact or the caller ensures cannot discharge the throw. A false requires is vacuous at feasibility, before postconditions. Definedness remains the first phase when the precondition is not known to be defined. Widening uses a private event log and commits it once. `cutpoints` increments once and stays positive after the loop.

## Behavior

Node `v22.23.1`. The passing command is in [commands.md](commands.md). Thirteen checks in [logs/results.json](logs/results.json) exited 0 through `serial-verify.py`.

A guarded `requires !flag` throw verifies with no public witness fields. Its only SMT postcondition is `(=> input_0 false)` on the full domain. `ensures true` stays on the target and is omitted from the SMT list because it is constant true. The result type stays `number`. A reachable `throw new Error("boom")`, with or without `ensures false`, is `unknown` / `replay-mismatch` (`JavaScript replay failed: boom`) and is not confirmed. `requires false` is vacuous. `real(x) > real("0") && false` is a confirmed `requires-definedness` counterexample at `NaN`, ahead of feasibility and the throw. An always-throw function and a both-branches throw are unsupported because no path returns.

A helper with `ensures false` before the throw puts `call_fact0` on that obligation and not a later fact. The caller ends `dependency-violation`. The same helper after the throw leaves `(=> input_0 false)` and `replay-mismatch`. An unreachable throw plus `ensures false` is a confirmed ensures failure, result `0`, input `flag` false. Inside a loop, the same false helper still blocks the caller with `dependency-violation`.

Throws inside and after a loop are abstract. Only the inner throw has a loop span. Both are `induction-gap` / `throw-unreachable` with the new sentence. The widening retry commits one throw event and one `loop_replay` declaration. The full postcondition does not assert that flag, and the function verifies.

Computed arguments, templates, other constructors, arity changes, sequence writes, `globalThis.Error`, local, parameter, module, and imported `Error`, a multiline computed argument, `try`/`catch`, and parentheses around `new Error` are unsupported at the original span. `throw new Error("boom" as string)` is unsupported erased syntax.

A private copy that sets the throw event `safe` to `"true"` verifies with witness `["false"]` and no public inputs or result. Native `false` returns 0 and native `true` throws `boom`. Production `source.mjs` and `index.mjs` contain neither `process.env` nor `CANDIDATE_THROW_MUTANT`.

An old identity, an empty counted loop, a record read, and an integer successor compile to the same targets, phases, and obligations as the parent modules. Default reports for the old program match. The successor verifies. Parent evidence reproduces on the parent modules and is `invalid-evidence` on the tested modules. Fresh evidence reproduces, and the parent cache plans `needsSolve`. Identities are `ec47724f52d33b0a4ee841d7bf3dea5d4fcbd4663a917a5e1399927ba0eb391c` and `86f9e10064d037421d83775d3a2d35d8ddaffa18c9c81d590a175a9332007826`.

## Harmonic mean

The pinned simple-statistics `8.0.0` file and ISC license match the upstream commit `a9ec676`. SHA-256 values are `c0bcedc78add016bd1f22ce9eb1a417363ac72d8cb5c0e7dfa4c74062a19f71d` and `63b5b6a85bc21476ebee13febd48d0a52056a695754a73aaed1ed7eafb059f29`. Blob `7705c21e`. Stripping contract lines and comparing tokens recovers the original implementation and `export default`. Both strong goals use `x.length === 1`, `Number.isFinite(x[0]) && x[0] > 0`, the same index and accumulator invariants, and `decreases real(x.length) - real(i)`. The weak file deletes only the `reciprocalSum` conjunct. The compiled text does not embed the witness bits. The empty-array throw is concrete. The in-loop positive check is abstract and spans the `for`.

`verifyFile` verifies `harmonic-total.js`, writes one receipt, and warms with one hit and no solve. The verified outcome has no inputs or result. `verifyFile` of `harmonic-positive.js` returns a confirmed ensures counterexample, result `"0"`, clause `result > 0`, with no throw phase. The input bits are `0000001000008041`. Its reciprocal is Infinity and the unchanged function returns `+0`. API `reproduce` and `node verify/bin/jsverify.mjs reproduce --json` both return `reproduced`. The same relative graph reproduces. Changed source is `stale`. A zero model identity is `invalid-evidence`. The bug writes no receipt.

`Number.MIN_VALUE` and `2 ** -1024` also return `+0`. Inputs 1 and 2 stay themselves. Input 49 moves one ulp, from `4048800000000000` to `4048800000000001`, and stays positive. `[]`, `[-1]`, and `[0]` throw the documented messages and were not confirmed throw counterexamples.

The fresh weak run is `unknown` / `induction-gap` on `ensures`. Its candidate is finite and positive natively, so the gap does not invent a `+0` failure and does not verify positivity. The archived candidate `5.006416181641203e-308` returns itself.

## Receipts

Archived `SHA256SUMS` at `7692103` checks 44 files, all OK. `full.run.json` and `focused-P.run.json` name `b16d07b`, exit 0, and `coreUnchanged`. Their core hashes match the archive, including the source and index SHA-256 values above. The logs say 331 passed and 37 passed, with no failures, cancellations, skips, or todos. Those suites were not rerun. `focused-harmonic.run.json` names HEAD `dedde91` while its core hashes are already the committed bytes. `experiments.json` records that pre-commit run. The final campaign, CLI, focused-P, and full captures name `b16d07b`.

## Docs and harness

The verifier README and the simple-statistics README match this behavior: literal admission, the singleton domain, total return, the overflow `+0`, one-ulp rounding at 49, a weak gap or a real failure, and `replay-mismatch` for a native exception. They leave Q and package-wide claims open.

The harness, not the product, caused three failed processes. Acorn was imported from `/tmp` before the archive link existed. The next run demanded a second SMT postcondition for constant `ensures true`, and it called `.index.verify` on a module namespace. A later env-key scan matched this probe's `MUTANT_ROOT`. [logs/harness-run1.json](logs/harness-run1.json) keeps the namespace run. The corrected probe is `scripts/probe.mjs`.

Parentheses around `new Error` stay unsupported because the parser preserves them. One replayed input is not a universal proof. This review did not merge the patch onto `74c3747`.
