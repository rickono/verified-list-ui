# Local `result` declarations and the es-toolkit sum/mean pilot

**Verdict: PASS.** An ordinary body-local `let`, `const` or `var` may now
be named `result`. In `ensures`, `result` still means the returned value. The
unchanged es-toolkit v1.53.2 `sum` and `mean` now prove their documented
empty-array results, composed through `mean`'s original `./sum.ts` import.
This is an enabling unit and a pilot. It does not complete Q or K.

Each claim is tagged. **[measured]** means a check I executed. **[inferred]**
means I read the source but did not run it. **[predicted]** means an untested
expectation.

## Patch

| item | value |
|---|---|
| base | `fa2b4393de974fbfc41347ed9cfe2ce5ec776ba6`; the landed G baseline `32bd5b2` is an ancestor **[measured]** |
| recon package | `3510de7470a2924e6bc04e630a71160e815a4f31` (read with `git show`) |
| checkout | `/Users/rick/.t3/worktrees/verified-list-ui/t3-c0f66961`, branch `t3/local-result-proof-pilot` |
| core commit | `607a71fd2ab782ea0c9332edc965b0dd53372efe`: `verify/source.mjs` (+9/-1) and `tests/verify/local-result.test.mjs` |
| fixture commit | `2dfa0899aee74f168bda3a47e09997dd2dc73953`: `verify/examples/es-toolkit/*` and `tests/verify/es-toolkit-sum-mean.test.mjs` |
| docs commit | `13df4dae5205ec1173b36742a0689ba9ef004c34`: `verify/README.md` and the `prefix`, `scalar-state` and `loops` design notes |
| report commit | this file only |
| runtime | Node `v22.23.1`; `node_modules` was a temporary untracked symlink to the coordinator install and was removed afterwards |

No canonical roadmap or audit file changed: `docs/verification-roadmap.json`,
`verify/reports/roadmap/plan.md` and `.audit/roadmap-20261113.tsv` are untouched
**[measured: `git diff --stat fa2b439 HEAD`]**.

## Before

The recon package probes the draft annotations on unchanged es-toolkit
sources. Four of them (`es-sum-empty`, `es-mean-empty`, `es-sum-ieee` and
`es-sum-singleton`) stop at the first statement of `sum`, before any proof
query:

```
"status": "unsupported", "line": 3, "column": 7,
"message": "Local declarations need simple, nonreserved names."
```

The span is `let result = 0;`. The source also confirms the gate: `localName`
rejected every name in the global `RESERVED` set, and `RESERVED` begins with
`"result"` **[inferred]**.

At base `fa2b439`, my probe `probe/state.mjs` gave this, through the serial
lane **[measured]**:

```
const-local     unsupported  Local declarations need simple, nonreserved names.
let-local-wrong unsupported  Local declarations need simple, nonreserved names.
sum-draft       unsupported  Local declarations need simple, nonreserved names.
```

## After

On the patched tree, the same probe gave **[measured]**:

```
const-local     verified
let-local-wrong counterexample confirmed, inputs {x: 1e-323}, result 1e-323
sum-draft       verified
```

`const-local` is `const result = 0; return x;` with `ensures Object.is(result, x)`.
`let-local-wrong` claims `Object.is(result, 0)` while returning `x`. A leak of the
local into `ensures` would prove that claim. Instead it is a native-confirmed
counterexample.

## The change

```js
const LOCAL_RESERVED = new Set([...RESERVED].filter((name) => name !== "result"));

function localName(id) {
  if (id.type !== "Identifier" || LOCAL_RESERVED.has(id.name)) fail("Local declarations need simple, nonreserved names.", id);
}
```

`localName` is called only from `varBindings` (function-scope `var`) and
`lexicalBindings` (body, block and `for` initializer `let`/`const`). `RESERVED`
itself and every other name check are unchanged. No runtime token is renamed.

### Why `result` in ensures is still the return value [inferred]

Contract environments do not inherit the body scope chain:

- `requires` and `old(...)` evaluate over the entry environment, which has
  only parameters and the heap.
- `ensures` evaluates over a copy of the function's outer environment. The
  contract `result` is set on that copy after the body has been compiled.
  The body's own scopes are never part of it.
- Callee summaries re-evaluate the callee's contract in a fresh parameter
  environment.
- Loop invariants and measures evaluate in the live loop-head environment.
  There, a visible local `result` is that local.
- Native ensures replay is a separate function with parameters
  `(library, entry, ...params, result)`. The body's local lives in the
  replayed function's own scope.

The tests below exercise each of these paths.

## Admitted scope

| binding named `result` | status | gate |
|---|---|---|
| body `let`/`const`/`var` | admitted | `localName` |
| nested block `let`/`const` | admitted; scope exit restores the outer binding | `localName` |
| `for (let result = …; …)` initializer | admitted; visible to that loop's invariants | `localName` |
| function parameter | rejected | `bind`: "nonreserved" / "shadowing" |
| arrow callback parameter | rejected | `closure`: "Callback parameters need simple, nonreserved names." |
| `every` callback parameter in a contract | rejected | `bind` |
| function name, `const result = (…) =>`, named function expression | rejected | `header`: "A function cannot shadow a verifier builtin" |
| top-level `const result = 1` | rejected earlier | "Only ordinary top-level functions…" |
| import alias | rejected | `parse`: "Duplicate or reserved module binding result" |
| type alias `type result` | rejected | `parse`: "Reserved type binding result" |
| `old`, `real`, `Number`, `Math`, `Object`, `Array`, `NaN`, `Infinity`, `undefined` as locals | rejected, unchanged | `localName` |

All rows are covered by `tests/verify/local-result.test.mjs` **[measured]**.
The other binding rules are unchanged:

- uninitialized declarations stay rejected;
- repeated `var` stays rejected;
- `var` inside loops stays rejected;
- TDZ reads stay rejected;
- `let` captures by callbacks stay rejected.

## Grounding: global removal (A) versus body-local admission (B)

I ran the same test file (`sha256 65a2f44b6efb…caff`) against three scratch
copies. Each used the serial lane **[measured]**.

| variant | `source.mjs` | result |
|---|---|---|
| base | byte-identical to `fa2b439` | 0/7: every test stops at the `localName` gate |
| A | `"result"` removed from global `RESERVED` (one line) | 5/7 |
| B | this patch | 7/7 |

Alternative A fails two tests:

- A parameter named `result` is admitted. The solver result then fails in
  native replay with `unknown/replay-mismatch`: "JavaScript replay failed:
  Duplicate parameter name not allowed in this context". The parameter and
  the replay predicate's `result` collide. A would therefore need a renamed
  replay token to be sound.
- An arrow callback parameter named `result` is admitted and solved (`apply`
  verified, `f` a confirmed counterexample). That changes the callback binder
  without any proof that the callback namespace is safe.

B changes only the declarations that live in body scopes, which contracts
never inherit. So I chose B.

## Regression tests

`tests/verify/local-result.test.mjs`, 7 tests, public `verify`/`verifyFile` only
**[measured]**:

1. **Verified:**
   - `const`, `let` and `var` locals;
   - a block local;
   - an inner `if`-block `const result = 2` with outer `result === 1` after it;
   - a `for (let result …)` loop whose invariant and measure use that local,
     with `ensures result === n`;
   - the draft `sum`.
2. **Wrong return claims a namespace leak would prove**, each a confirmed
   counterexample whose native return equals the report and violates the claim:
   - `Object.is(result, 0)` with a local `result = 0` while returning `x`
     (`const` and `let`);
   - a block local `result === 7`;
   - an abstract loop returning `i`;
   - `sum` claiming `Object.is(result, 1)` on `[]`;
   - a `return result + 1;` mutant.
3. **Closures:**
   - `const result = 0; const p = (y) => y === result;` passed to a
     contracted `apply` verifies `result === (x === 0)`;
   - `result === false` and `result === (x === 1)` are confirmed
     counterexamples;
   - rejected: a missing local, a `let` capture, a closure before the
     declaration, and a callback parameter named `result`.
4. **`every`:**
   - a max loop's invariant `nums.every((v, j) => j >= i || v <= result)`
     reads the live local;
   - `ensures nums.every((v) => v <= result)` reads the return;
   - a `return nums[0]` mutant is a confirmed counterexample;
   - `every` parameters named `result` are rejected in ensures, with and
     without a local, and in an invariant.
5. **TDZ, hoisting and scope exit**, all rejected:
   - `const` or `var` read before its declaration;
   - an invariant reading a `result` declared after the loop;
   - returning a block or `for`-init `result` after its scope;
   - a later loop invariant reading a block `result`;
   - writing a `const result`.
6. **A wrong invariant** `Object.is(result, 0)` on `sum` is
   `unknown/induction-gap` at `invariant-preserve`, not a proof.
7. **Preserved gates:** every rejected row in the admitted-scope table above.

## es-toolkit pilot

### Provenance [measured]

The fixture stores these files from es-toolkit v1.53.2, commit
`1913a7627a2995b095249d6b0b6453b900cdd4bc`. The same bytes are on main at
`4d5963eb2df129021efdba0de5a3a16bbb3c7bec`.

| file | bytes | sha256 |
|---|---|---|
| `src/math/sum.ts` | 531 | `932fb45fe749f343a198e093a9c4fc1628aa8c21204957cf481e038903347507` |
| `src/math/mean.ts` | 471 | `b0445d7e281b1e8b646c9729efa1d3d4806217c93dc9954cc434261690573ca7` |
| `src/math/sum.spec.ts` | 728 | `2be85eec5f5a6eedf9fe2295146e04fd18f13cb30caa3f8b6bad11f517be8a62` |
| `src/math/mean.spec.ts` | 299 | `27c1b2e5a4afd77e10c5f54549939d22a9abda2929b1543ec3f4dac324e69182` |
| `LICENSE` (MIT) | 1077 | `51f3674294d988d89dbebd31273baaeb3c697a15482d9699b14d1fded2e132a7` |

Every stored file is byte-identical to the recon package copy and to a fresh
download of the upstream commit **[measured]**. `check.mjs` checks:

- the size and hash of each file;
- offset-preserving type stripping;
- the hash of the exported declaration (`sum` `83afe762…065d`, `mean`
  `2445e7ed…f48c`);
- that the accumulator is named `result`;
- that `mean` imports `./sum.ts`.

### Annotations [measured]

Annotations are only inserted `//` lines:

- one `ensures` line above each export;
- three loop lines above `sum`'s `for`.

Removing them in order recovers the pinned bytes and hash. Both the raw
TypeScript tokens and the type-stripped tokens are identical to the original.
The annotated sources hash to:

- `sum`: `1533bbc2c48962471467f1e9f20f892f71b201983a656d050f19ada968c6de71` (739 bytes);
- `mean`: `aa4bf214a3b04c95172c5b8d220086ea9d34942ed41aedcde8f1f80e4ddae5b9` (524 bytes).

```
// ensures nums.length !== 0 || Object.is(result, 0)              (sum)
// invariant i !== 0 || Object.is(result, 0)
// invariant Number.isInteger(i) && 0 <= i && i <= nums.length
// decreases real(nums.length) - real(i)
// ensures nums.length !== 0 || Number.isNaN(result)               (mean)
```

### Checks [measured]

| check | outcome |
|---|---|
| annotated `sum.ts` + `mean.ts` via `verifyFile(mean.ts)` | `sum` verified, `mean` verified; module hashes equal the annotated hashes above |
| `sum` weakened to `!Number.isNaN(result)` on empty input | `sum` verified, `mean` `unknown/contract-gap`; graph hash differs |
| `sum` claims `Object.is(result, -0)` | confirmed counterexample `nums: []`, result `0`; native `+0` |
| `mean` claims `Object.is(result, 0)` | `sum` verified; `mean` confirmed counterexample `nums: []`, result `NaN`; native NaN |
| `sum` mutated to `return result + 1;` | confirmed counterexample `nums: []`, result `1`; native `1` |

Native confirmation loads the pinned module text without the proof comments,
or the mutant text, through Node's own type stripping in a temporary directory.

The checker also requires the upstream spec expectations to be present, and
runs 11 native samples:

- the spec values: 10, +0, −2, the empty concatenation case, 3 and NaN;
- `sum([-0])` is `+0`;
- `sum([NaN])` and `sum([Infinity, -Infinity])` are NaN;
- `sum([0.1, 0.2])` is `0.30000000000000004`;
- `mean([-0])` is `+0`.

These samples are finite evidence. They do not extend the proof.

### Claimed and not claimed

Claimed for every dense binary64 array the verifier models, of any native
length:

- an empty input makes `sum` return `+0` and `mean` return NaN;
- the loop terminates.

Not claimed:

- any nonempty property;
- singleton identity (false for `-0`);
- a real-number sum or error bound;
- the concatenation law (false in binary64);
- any average.

The recon's `es-sum-ieee` and `es-sum-singleton` drafts were not promoted.

## Commands and logs

All CPU-heavy commands ran through
`python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- …`.
Logs are in the session scratchpad
`/private/tmp/claude-501/-Users-rick--t3-worktrees-verified-list-ui-t3-c0f66961/2ff15e54-b14f-47df-ab0e-56f45bb3aea0/scratchpad/`.

| log | command | expected | observed |
|---|---|---|---|
| `before-state.log` | `node probe/state.mjs <base copy>` | rejected at `localName` | 3 × unsupported **[measured]** |
| `after-state-initial.log` | same on patched tree | verified / confirmed cex / verified | as expected **[measured]** |
| `local-result-1.log` | `node --test tests/verify/local-result.test.mjs` | — | 3/7 |
| `local-result-2.log` | same, after test fixes | — | 5/7 |
| `local-result-3.log` | same | 7/7 | 7/7, 27.7 s |
| `control-base.log` | same test on base copy | 0/7 | 0/7 |
| `control-altA.log` | same test on alternative A | — | 5/7 (above) |
| `es-check-1.json` | `node verify/examples/es-toolkit/check.mjs` | exit 0 | exit 0; stderr only Node's `stripTypeScriptTypes` ExperimentalWarning |
| `focused.log` | `node --test --test-concurrency=1 tests/verify/local-result.test.mjs tests/verify/es-toolkit-sum-mean.test.mjs` at the final tree | 8/8 | 8/8, exit 0, 36.4 s |
| `full-suite.log` | `node --test --test-concurrency=1 tests/verify/*.test.mjs` at `13df4da` | all pass | 257/257 pass, 0 fail, cancelled or skipped; exit 0; 343.7 s **[measured]** |
| `probe2/closure-named-result.log` | `node probe2/closure-named-result.mjs <worktree>` at `13df4da` | see below | verified / confirmed cex / rejected **[measured]** |

The failures in `local-result-1` and `local-result-2` were defects in my test
file, not in the verifier:

- **Wrong message.** I expected the message "Unknown local binding result". The
  verifier says "Unknown value result. Calls and ambient values need explicit
  support." The test now accepts both.
- **Unreachable candidate.** With `requires 0 <= n`, the loop counterexample's
  solver candidate was `n = -0`. That reached an unreachable `-0` exit counter,
  which is an honest `induction-gap`. The test now uses `1 <= n`.
- **vm helper.** My native helper could not run `export` in a vm script. It now
  strips the leading `export`.
- **Earlier gate.** A top-level `const result = 1` is rejected by an earlier
  gate than I expected. The test now asserts that gate.

### Probe: a closure named `result` [measured]

After the full suite, I ran `probe2/closure-named-result.mjs` at `13df4da`
through the lane. It used the contracted helper `apply(p, x)` with
`ensures result === p(x)`.

- `const result = (y: number): boolean => y === 0; return apply(result, x);`
  with `ensures result === (x === 0)` is `verified`.
- The same body with `ensures result === (x === 1)` is a confirmed
  counterexample: `x = 0`, result `true`. The closure value named `result`
  does not reach `ensures`.
- `const p = function result(y: number): boolean { … }` is `unsupported`
  before the self-name check: "Runtime generic arguments, type assertions,
  non-null assertions and unmodeled erased runtime syntax are unsupported."
  It is rejected, but this probe does not reach the self-name gate. The
  top-level named function expression case in test 7 does reach it.

This probe is not in the committed test file, because the full suite had
already run on that file.

## Full suite

`python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py --
node --test --test-concurrency=1 tests/verify/*.test.mjs` ran once, at
`13df4dae5205ec1173b36742a0689ba9ef004c34`. It started at
2026-11-13T14:52:19Z and ended at 14:58:03Z **[measured]**.

```
# tests 257
# pass 257
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 343713.02325
exit=0
```

The landed G suite had 249 tests. This patch adds 8: 7 in
`local-result.test.mjs` and 1 in `es-toolkit-sum-mean.test.mjs`. No core file was
edited during the run. The only later commit adds this report.

## Risks and limits

- **Readability.** A body local named `result` and the contract `result` are
  different bindings with the same spelling. An `ensures` cannot refer to the
  local. Users who mean the local get a proof or counterexample about the
  return value instead. The README, design notes and fixture README say this
  explicitly.
- **Unhelpful message.** Reading `result` in `requires` or `old(...)` gives the
  generic "Unknown value result" message. That message predates this patch; it
  does not explain that `result` is unavailable there.
- **Invariants are not replayed natively.** An invariant about the local is
  checked only by the solver. A wrong one is `unknown/induction-gap`, never
  `counterexample` (test 6) **[measured]**.
- **Scope of the inference.** The separation argument is read from the current
  code. A future change that builds contract environments from body scopes
  would reopen the leak. The leak-sensitive tests above are the guard: wrong
  claims would verify if `result` leaked.
- **Other names stay reserved.** Parameters, callbacks, functions, imports and
  type aliases still cannot be named `result`. Upstream code using those
  shapes remains unsupported, and no other reserved name was relaxed.
- **Pilot scope.** The pilot proves only the documented empty-array result. A
  nonempty `sum` property needs real-number or rounding specifications that
  are not part of this unit.
- **Trust.** The parser, type stripping, translation, Z3 and the replay runtime
  remain trusted. No proof certificate is produced.

## Not done here

This unit does not complete Q or K. There was no push, PR, merge, comment,
watch, deployment, or edit to the canonical roadmap or audit files.
