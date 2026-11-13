# Independent review of stateful C1

Verdict: **ISSUES**.

Reviewed code head: `5d8415aa8279cab2f4a662b049616ce9d94a98a3`.
Receipt-only commit: `ae60681cd6e84ad19ba62a24d60591138cb2719f`.
Range: `e435c8abce3107f3afce5be2b10ae23102d269d2..ae60681cd6e84ad19ba62a24d60591138cb2719f`.
Implementation commits: `0bb41330124777dbfb0fe9865533d7e59e3a31ef`, `7381ffebc5f1410079b3ca2bbd1435deb91a436b`, `5d8415aa8279cab2f4a662b049616ce9d94a98a3`, `ae60681cd6e84ad19ba62a24d60591138cb2719f`.
Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor of this checkout. The inspection tree is `git archive` of the code head. This report is committed later, on a checkout that no longer contains the C1 sources. No production file was edited. Fixture author and `Co-Authored-By` trailers were left unchanged.

Runnable logs and scripts are in [evidence/](evidence/).

## 1. `checkStateful` throws on `while` and `for`

Severity: fail-safe API defect. The call throws before it can return `verified`. This review reproduced it on the archived code head. The coordinator notes already record the same throw. A harness that indexed the wrong argv slot is outside this finding.

Observed: `checkStateful` on a synchronous entry `while (false) { x = 1; }` throws `TypeError: Cannot read properties of undefined (reading 'decreases')`. Top frame: `at loop (file:///private/tmp/c1-review-stateful/verify/source.mjs:894:13)`. The same throw occurs for `for (; false; )` and for `while (q > 2) { x = x + 1; }`. Rows: `checkStateful-while`, `while-false`, `for-false`, `while-true-inc` in `evidence/adv-results.json`.

At the code head:

- `verify/source.mjs:1241` — `compileAstUnit` passes `loops: new Map()`.
- `verify/source.mjs:891-894` — `loop()` reads `cx.loops.get(node)` and then `spec.decreases`. A missing entry is `undefined`, so the read throws before `fail()`.
- `verify/stateful/index.mjs:22-24` — the public catch rethrows every error that is not a `SourceError`.

`do-while`, `for-of`, and `switch` return spanned `unsupported` `SourceError`s. `delete` of a local and a duplicate branch binding also fail closed.

Required behavior: a source-spanned `unsupported` outcome, with no throw. A repair must keep the direct native replay timeout fixture. `machineOf` and `replayTrace` may parse loops that the proof compiler rejects; banning loops in that parser would erase the timeout case.

Command, exit 0 for the harness (the API row records the throw):

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/c1-adv.mjs
```

## 2. A non-ASCII character inside a reserved clause word drops the clause

Severity: high admission defect. The proof that comes back covers only the clause the grammar admitted. Native replay satisfies that clause. The dropped clause is absent from `properties`, and its text is false on the native state.

`verify/stateful/clauses.mjs:29` keeps only `/^(@?[A-Za-z]+)(?=$|[^A-Za-z_-])/`. `near()` at lines 12-20 runs on that ASCII prefix. Line 34 looks the raw first token up in the grammar. Design `verify/design/stateful-foundation.md:111-114` requires one grammar to parse or reject contract-looking comments, including one-edit misspellings of reserved words. Ordinary prose stays a comment.

`stаte` uses Cyrillic `а` (U+0430). Code points: 115, 116, 1072, 116, 101. Levenshtein distance from `state` is 1. The extractor returns `st`. Length difference 3 makes `looks` false, so the comment is prose.

Source:

```
let x = 0;
// stаte x === 1
// state true
export function f(q: number) {}
```

`checkStateful` returned `status: "verified"`, properties `[{kind:"state", text:"true", span:{start:28, end:41}}]`, units `$init` and `f$0` both `verified`. Native replay: `{status:"ok", violation:null, state:{x:0}}`. Span 28 is `// state true`. The first comment is missing. `x === 0` makes the dropped text `x === 1` false.

The same drop, beside an admitted `// state true`, occurs for U+200B inside the word (`st\u200bate`) and for fullwidth `ａ` (U+FF41). A lone Cyrillic clause returns `unsupported` with message `No state or always property; pending clauses alone cannot establish safety.` That outcome refuses a proof and names the wrong cause. Trailing ZWSP (`state\u200b`), `state_`, `staet`, a block comment, `ensures false`, and an unknown environment line are rejected with a clause error.

Required behavior: parse the clause or reject it on a source span. A `verified` report must include every contract-looking clause it was given.

Commands:

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- bash -c 'node /tmp/c1-adv2.mjs && node --test --test-concurrency=1 /tmp/c1-review-stateful/tests/verify/stateful-transitions.test.mjs /tmp/c1-review-stateful/tests/verify/stateful-boundaries.test.mjs'
```

Admission scan (no Z3): `evidence/admission-scan.mjs`. Log: `evidence/admission-scan.log`.

## Admitted obligations that held

No admitted `state` or `always` unit was `verified` while a supplied legal native trace falsified it. `falseProof` is empty in `adv-results.json`.

Init and the creation write survive contradictory `resolves` (`unsat-resolves-hide-write`: entry `counterexample`, resume `vacuous`). `$reject` is a counterexample when the stutter breaks the property (`reject-strict`, including the `$reject` unit). Request arguments are the values at the await, including a cell written before that await, a later second await, a const snapshot, and a second operation that does not inherit the first operation's `resolves`. `q > 0 && (x = 1)` and `q ? 1 : 0` fail with `Expected boolean; this JavaScript coercion is unsupported.` The frontend rejects those expressions, so they are not modeled side effects.

`eventBound` is `null` at `verify/stateful/environment.mjs:35`. `plus-one-relation` records `eventBound: null` and `executableCleared: true`, and native state `{x:1}` matches `always x === old(x) + 1` on that step. `old-increment-inductive` native state is `{x:2}`. `dead-else-live` verifies and the native trace matches. Signed zero, postfix and prefix updates, chained and comma assignments, both-branch decrement, `always false`, `state false`, and an init mismatch are counterexamples or `SourceError`s as the probes required.

ASCII one-edits, block comments, `ensures`, unknown environment lines, and modules with no `state` or `always` fail closed. The transitions test deletes keeps only in test-owned memory and the overclaim then verifies. Production `transitions.mjs` has no deletion switch.

## Hashes and tests

Recomputed against git objects this turn (`evidence/hash-check.txt`):

- 42/42 input hashes in the receipt's `inputs.json` match blobs at `5d8415aa`.
- 10/10 receipt log hashes match blobs at `ae60681`.
- Lockfile SHA-256 `8a0e19b686e00939f10a597f1a9c3b8ae2c25c1dae10d340cba0a365830afa21`.

Receipt evidence, read and not re-run: `focused-02.log` 47 pass / 0 fail; `full-final.log` 304 pass / 0 fail; `outcomes-01.log` 29 pass / 0 fail, `duration_ms 34754.691042`. Those totals are the implementation's. They are not this review's soundness result.

Executed in this review:

- Frontend: 4 pass, 0 fail, `duration_ms 94.397959`.
- Transitions and boundaries, after the second probe: 7 pass, 0 fail, `duration_ms 9680.937584`.
- Adversary matrix: 31 semantic cases, 16 grammar and construct rows, 2 API rows.

## Dropped hypotheses

`Number.MAX_VALUE + 1` remains `Number.MAX_VALUE` and finite, so `x = x + 1` with `Number.isFinite(x)` and `x === old(x) + 1` is not an overflow false proof. Loading `MAX_VALUE` and then `x = x + x` is a counterexample on both the load and the step (`load-then-add`).

`// st ate x === 1` is two tokens. `st` is not a one-edit of `state`, and the line was dropped beside `// state true`. That case is outside finding 2. `state_` is recognized and rejected.

A satisfiable abstract unit without a native property failure stays unknown. These probes classified units with `transitionsOf` and `solve`, then ran `executeNative` only when every unit was `verified` or `vacuous`. Witness search was not on the path of a `verified` report.

## Limits

Outcomes and the 304-test suite were not re-run. Native worker plumbing was not re-reviewed. Acorn, type stripping, `body()`, the heap model, and Z3 were used as the trusted compiler and solver, not re-proved. No production change was made.

## Verdict

ISSUES at code head `5d8415aa8279cab2f4a662b049616ce9d94a98a3`.
