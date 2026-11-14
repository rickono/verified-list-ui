# Standards and native integration of source-owned completion

**Verdict: PASS.** Documented repo standards are absent, and the executions below show no accidental producer or consumer data substitution that authorizes completion. C1 cuts, C2a abort behavior, capture admission, and legacy parity hold on this tree. This review does not complete U or any other roadmap node. The coordinator full suite on this head was left to its own lane and is not a result here. The historical 496 and C2a 510 receipts were not rerun.

## Checkout

Prepared checkout `/Users/rick/.t3/worktrees/verified-list-ui/t3-cfdc1d17`, HEAD `1f326fdf2d1fcae58961b76ab1f90eee92e653f5` (`1f326fd`, "Seal source-owned completion graphs before planning"). `git merge-base --is-ancestor` is exit 0 for published main `ec325c7eb605ab0751e21b2d629a8fe96ff666e8` and for baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b`. `verify/` is present. Node v22.23.1. There is no `.pstack` file. These six blobs are identical at HEAD and main: `protocol-native.mjs`, `protocol-transitions.mjs`, `protocol-rules.mjs`, `protocol-abort.mjs`, `protocol-machine.mjs`, `protocol-values.mjs`.

## Standards

A file search found no `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `.editorconfig`, ESLint, Prettier, or Biome config. `package.json` has no lint script. The `tsconfig.json` files are compiler settings. `verify/README.md` records the verifier's trust list and the admitted language, which is a product contract rather than a style guide. Documented violations: none.

The completion fixtures were read under the TypeScript best-practices skill. They contain no `as` and no `any`. `two.ts` annotates await results and `one.ts` does not. The stateful frontend accepts both. That difference is outside any repo rule.

Possible smells, kept separate from violations. The identity-frame predicate is duplicated in `verify/source.mjs` and `verify/stateful/temporal.mjs`; the second copy is the independent check, and on `zero`, `one`, `two`, `false`, and `partial` the stored flag and the recompute agree, including empty call footprints and zero's `["$s"]` path. `closed: true` can coexist with `producer-ownership: missing` because the flag compares a plan with its rebuild; the goal stays `unknown`. `transitions.mjs` shadows `names` inside the temporal resolves walk. No repo tool enforces these.

## Native and environment integration

Replay on this HEAD. `two.ts` through init, call, resolve, resolve leaves `n` at 0, 0, 1, 2, live across the first resolve and `returned` after the second. `one.ts` resolving 0 returns with `n = 0`; resolving 1 sets `n = 1`; a declared reject leaves `n = 0` and `environment-rejected`; a bare call stays `ok` and live, with no confirmation flag. `false.ts` and `partial.ts` value 0 are `illegal-environment-action`. `partial.ts` value 1 sets `n = 1`. `zero.ts` sets `done` true in the call. A replaced `sourceSha256` and an observation suffix are `illegal-environment-action`. `while (true) {}` at `timeoutMs` 50 is `unknown` / `replay-timeout`.

Public solver rows, through the shared lane. `false.ts` is safety `verified` and completion `unknown` / `outcome-viability`, with `nativeConfirmed: false`, per-request settlement `assumed-unused`, and weak resumption `missing`. `zero.ts` is `verified`, `nativeConfirmed: false`, with no settlement row, continuing runtime `assumed-used`, total declared calls `assumed-unused`, and weak resumption `discharged-unused`. `one.ts` is `verified` on profile `c1-action-cuts`, settlement `op` `assumed-used`, weak resumption `discharged-used`, and `nativeConfirmed: false`. Passing `{profile: "alternate"}` to `zero.ts` stays `verified` with the same assumption record. `two.ts` at `timeoutMs: 1` is `unknown` / `solver`, and both goals are `unknown` / `safety-prerequisite`. Settlement is a completion premise: `false.ts` leaves it unused while safety is verified, `one.ts` marks `op` assumed-used only on the verified goal, and `zero.ts` has no reached request.

C2a replay on the unchanged protocol files: abort then resolve leaves `shown` 0 and settled; resolve then abort leaves `shown` 1; `settle-abort` leaves `shown` 0; an already aborted signal leaves `shown` 0; the alias listener records handler cuts 2, 1, 0. A completion goal on `listeners.ts` or `advisory.ts`, and `scheduler: "delayed"` on `one.ts`, are `unsupported` with no `completion` object.

Corrected captures are in `corrected-expectations.json`. The first two programs used a module-level binding and an unannotated local, so those rows are harness mistakes. On the corrected locals, `let held: number` read after the await is rejected as a mutable capture. `const held: number` is admitted as `const:held`. Either binding used only as `op(held)` is admitted and is not a capture.

Legacy comparison used `git archive` of main's verifier sources and no solver. `pilots/search.ts`, `protocols/listeners.ts`, and `protocols/advisory.ts` match main on assumption hash, transition JSON, trace envelope, and replay JSON. `V1-leads-no-settles.ts` only changes rejection text, from "Unsupported or misspelled contract clause leads." to the invalid-leads sentence. Both are `unsupported`. `leads work succeeds`, `fair settlement`, fairness without a goal, a block comment, and Cyrillic `fаirness` are rejected with no completion object.

The outer `trusted` list names Acorn and type stripping, the stateful frontend, the existing compiler, representative induction, Z3, and strict native replay. Executed completion limitations are "no checked infinite-word realizability", "no global draining/success/commit/count theorem", and "protocol temporal mode unsupported". Every solved goal here has `nativeConfirmed: false`, including fabricated verified evidence. A pending prefix, a one-millisecond budget, and a timed-out loop leave liveness unconfirmed.

## Producer ownership

The plain-data bypass from the `20ff205` proof review is closed. Cloning the `false.ts` graph, setting outcome-viability SMT to `true`, and solving returns `verified` and `vacuous`. `concludeCompletion` then returns `unknown` / `manifest-gap`, ownership `missing`, `nativeConfirmed: false`. In-place SMT and footprint writes throw `TypeError`. The sealed graph has no Map, Set, function, or unfrozen object. A shallow machine copy is rejected, a second `machineOf` does not own the first graph, and an environment `Map` edit drops ownership. Cloned footprints `["$s","foreign"]` and `["ghost"]`, and a cloned `rankAfter` of 7, all lose ownership. The `$s` prefix check would still accept the foreign `$s` path; ownership is the gate that blocks it. An enumerable boolean `completionFallthrough` on a dead store changes the frontend hash and is rejected. A non-enumerable boolean is dropped by the copier, and the dead store stays unsupported. Adding `// rejects` is another source: viability SMT is literal `true`, and the producer owns that graph.

## Three trust classes

The frontend, the compiler, the finite-control rule, and the solver remain trusted. The integration text says this seal is an internal data boundary and does not authenticate fabricated backend outcomes. Giving `concludeCompletion` verified rows whose hashes match the real queries makes the private report of `false.ts` say `verified`, with settlement `assumed-used` and weak resumption `discharged-used`, while `nativeConfirmed` stays false. A verified decoy placed ahead of a hash-matching counterexample stays `unknown` / `completion-obligation`. `checkStateful` does not accept those rows. Public `false.ts` remains `outcome-viability`.

Arbitrary object-protocol hooks are a different class from accidental field edits. Assigning `completionFallthrough` to a function on the dead store is omitted by `JSON.stringify`, so `transitionsOf` seals an owned graph for a source that is otherwise unsupported. That plan was not solved. Installing `toJSON` to return a snapshot taken before the edit, then replacing the resolves AST with `true`, seals an owned graph whose viability formula is an exists-true implication. The source text still says `resolves false`. Solving those completion targets returns `verified`, `verified`. `concludeCompletion`, given a supplied verified safety status rather than a fresh safety solve, returns a verified goal and `nativeConfirmed: false`. The same viability edit without `toJSON` is the plain substitution above, and that one stays `unknown`.

## Evidence and limits

Commands, from this checkout. The dependency link was `node_modules` → `/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/node_modules`, removed after the runs. The archive directory was `/tmp/std-native-ec325c7` and is gone.

```sh
node verify/reports/roadmap/review-completion-owned/standards-native/probe.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/review-completion-owned/standards-native/solver-probe.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/review-completion-owned/standards-native/followup-solver.mjs
```

Logs: `probe-results.json` (10 rows, 0 unsuccessful), `solver-results.json` (5 rows, 0 unsuccessful), `followup-solver.json`, `corrected-expectations.json`. Node printed the experimental `stripTypeScriptTypes` warning. No full suite was run. No canonical roadmap edit, push, pull request, or merge was made.
