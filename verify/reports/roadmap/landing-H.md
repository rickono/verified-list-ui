# Landing review: H, pure callback contracts

**Verdict: PASS+NOTES.** I ran checks against the exact patch and found no soundness defect, no weakened gate and no hidden trusted callback. The notes below are about scope and documentation. None of them blocks landing H.

| | |
|---|---|
| Patch | `91c2806d883a8a647c0cfb540a218ff01c19baf4..37355ccf197b22286cf0c25fddf147f2e3713172`, one commit, 31 files, +1338/-53 |
| Parent tree | `963c1cff41032264b8a7d3d285da73168119ed64` (verify/ `b7d39bd2…`) |
| Head tree | `eb1cff67338618101f5ab5d906f2cbd542b3308b` (verify/ `251d1bcc…`) |
| Checkout | `/Users/rick/.t3/worktrees/verified-list-ui/t3-eda5a7d5`, branch `t3/eda5a7d5`, HEAD `69d9f155f9c13b906b55d0602a83f1faa287a220` at the start of review |
| Reviewer | Claude Opus 5.5, independent landing review, 2026-11-13 |

The checkout HEAD also contains the G heap commits (`38a3c6d`, `32bd5b2`) and three roadmap-record commits, all after `37355cc`. I did not review that combined tree. Every check here ran on clean exports made with `git archive <sha> | tar -x`:

- the parent export, at `$S/snap/parent`
- the head export, at `$S/snap/head`

`S=/private/tmp/claude-501/-Users-rick--t3-worktrees-verified-list-ui-t3-eda5a7d5/e23e2506-e7ee-4e62-9d62-95945ef2c5a1/scratchpad`

Both exports have `node_modules` symlinked from `/Users/rick/verification-vibes/verified-list-ui/node_modules`. The toolchain is Node 22.23.1 and z3-solver 5.3.3. I changed no production code.

Each claim below is marked as one of:

- **measured**: I ran it, and the log is listed.
- **inferred**: I read the source at the exact SHA.
- **author**: it comes from the patch's own report and I did not re-run it.

## Acceptance

H's `doneWhen` is: "Selected generic/callback helpers compose through checked function contracts without treating arbitrary callbacks as trusted."

- **Composition through checked contracts (measured).** Three shapes verify at head and are rejected as unsupported at the parent:
  - the generic helper `findIndex<T>`
  - generic forwarding (p15)
  - named and imported predicate contracts (q23, p17)

  The callee contract is used in the proof. In q23, `trustsYes` verifies only through `yes`'s `ensures`.
- **Arbitrary callbacks are not trusted (measured).** Every callback passes a total admission check over the full binary64 domain before its facts are used:
  - A narrow callback fails admission with a concrete probe at NaN (p01), at -0 (p02) or at 0 (p17, p20, `callback-bugs.ts`).
  - A named callee that lies is caught three ways:
    - A false counterexample becomes `contract-gap` (p10).
    - A replayed contract violation becomes `dependency-violation` (p18).
    - A callee that is not verified gates the caller through final dependency status (q24).
  - Captures that could change are rejected: let, parameter write, array, function, TDZ and reassignable aliases.
- **Unchanged real code (measured).** The Ramda v0.30.1 `findIndex` declaration matches upstream byte for byte. It verifies, and both seeded mutants yield confirmed counterexamples.

## Findings, by severity

No blocking findings.

1. **Note: the purity certificate is hard-coded and depends on G (inferred).**
   - Head `verify/source.mjs:1016` sets `effects: { kind: "pure" }` for every compiled unit. A comment says: "G must derive effects from its heap operations before admitting named predicates."
   - `verify/source.mjs:165` rejects a named predicate when `effects.kind !== "pure"`. At this head that check can never fire.
   - This is sound for H alone. At the parent and at head, heap writes and unmodelled calls are rejected (`source.mjs:642`). Top-level code is limited to function bindings, so a named callee has no mutable state to observe. p07, the `Math.random` probe, is rejected as unsupported.
   - In the combined checkout, G derives effects instead (`verify/source.mjs:1203` at `69d9f15`), and the purity gate starts to matter. Whoever lands G must prove that derivation. This review does not cover it.

2. **Note: the trust documentation is incomplete (inferred and measured).**
   - The head `verify/README.md:392` "Trusted components" list does not name solver-model predicate-table replay.
   - The trust line is added to reports at run time, only when a target has a function parameter (`verify/index.mjs:214`). I saw it in the JSON output of the Ramda pilot, p11, p13 and p14 (measured).
   - The impact is limited to how counterexamples are confirmed. A `verified` verdict does not depend on replay. Suggested follow-up: one README sentence.

3. **Note: conservative rejection of direct closure calls (measured, p16).**
   - A local closure called directly on `values[i]` inside a bounds-checked loop is rejected: "A direct local predicate call may receive undefined; this slice requires a present number."
   - The rule is `source.mjs:251`. It is incomplete, not unsound.

4. **Note: deliberately narrow slice (measured).** Supported callbacks are unary `number -> boolean` only. These are all rejected:
   - other named function signatures (p19)
   - recursion through a callback (p08, p09)
   - function-valued captures, `let` function bindings and function returns (q26, q28, q29)
   - optional-parameter captures (p06; the parent rejects this too)

   `verify/README.md:149-186` documents this, and stateful callbacks are marked unsupported. This matches the node's "begin with pure callbacks" detail.

5. **Note: witnesses are correct but not minimal (measured).** Counterexample tables often key on subnormals, for example `1.69759663277e-313` and `-5e-324`. Witness decoding and native replay confirm each one. Readability only.

6. **Note: a compile failure collapses to one outcome per file (measured, pre-existing).**
   - When one function in a file is unsupported, the CLI reports a single outcome for the whole file. Examples are p03-p07, p16, p19, q22 and q26.
   - The parent behaves the same. This fails closed.

## Tested scope

All solver work ran through `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- …`. The native-baseline and obligation comparisons are compile-only, run no solver, and ran outside the lane.

### Suites at head (measured)

| Command (cwd `$S/snap/head`) | Result |
|---|---|
| `serial-verify.py -- node --test --test-concurrency=1 tests/verify/*.test.mjs` | 219/219 pass, 0 fail, 325.7 s, exit 0, 2026-11-13T13:25:09Z–13:35:55Z |
| `node --test --test-concurrency=1 tests/verify/predicates.test.mjs tests/verify/predicate-models.test.mjs tests/verify/ramda-find-index.test.mjs` (in lane) | 20/20 pass, exit 0 |
| `node --test --test-concurrency=1 tests/verify/conformance.test.mjs` (in lane) | 3/3 pass. Seed `0x5eedd00d`, 58 fixtures, 574 functions, 667 native samples, 20 counterexamples. 12/12 mutants detected, including `predicate-zeros-collapsed` and `predicate-number-keys-collapsed` (both `unknown/replay-mismatch`) |

These counts match the author's report. I treat them as a baseline. The verdict rests on the probes and comparisons below.

### Before and after (measured)

- **Native baseline.** `GIT_DIR=/Users/rick/verification-vibes/verified-list-ui/.git/worktrees/t3-eda5a7d5 node verify/check-native-baseline.mjs 91c2806…` at head returned `identical: true` across 8 cases and 13 targets, with split queries compared. Exit 0.
- **My own obligation comparison.** `node $S/bin/compare-obligations.mjs $S` compiled every parent corpus fixture (56) and every parent example file (20) with both snapshots. Result: 76/76 compiled obligation sets are byte-identical across 597 targets, with zero differences. Load or compile errors are identical on both sides. Conclusion: H does not change the obligations for any program the parent accepted.
- **Parent verifier on head's new inputs.** It returns unsupported every time, so H's capability is new:

  | Input | Parent result | Exit |
  |---|---|---|
  | `callbacks.ts` | `firstAbove`: "Runtime generic arguments, type assertions…" | 1 |
  | `callback-bugs.ts` | `findIndex`: "Unsupported data type syntax" | 1 |
  | `ramda/search.js` | `findIndex`: "Unsupported data type syntax" | 1 |

  The parent's own CLI run on the head-relative paths exits 2 with ENOENT, because the files are new in this patch.

### CLI at head (measured)

The command is `node verify/bin/jsverify.mjs [--json] --timeout 60000 verify/examples/<f>.ts`.

- **`callbacks.ts`.** `findIndex`, `firstAbove`, `firstNaN`, `isNegativeZero` and `firstNegativeZero` all verify. Exit 0.
- **`callback-bugs.ts`.** `findIndex` and `positiveOnly` verify. Exit 1.
  - `narrowPredicate` returns a counterexample with `values = []`.
  - The obligation is "callback admission: fn passed to findIndex (probe replay)".
  - The concrete call is `positiveOnly(value = 0)`, which fails `requires value > 0`.

### Ramda pilot at head (measured)

The command is `node verify/examples/ramda/check.mjs`. Exit 0, 13 s, 42 native samples.

- **Upstream.** `findIndex` is verified.
- **`off-by-one` mutant.** A confirmed counterexample:
  - predicate table `{1.69759663277e-313 → false, else true}`
  - list of 39 × that subnormal followed by NaN
  - result 40
- **`skipped-first` mutant.** A confirmed counterexample:
  - table `{entries [], else true}`
  - list `[1.036131e-317]`
  - result -1

Provenance was checked independently:

- Upstream is `ramda/ramda@980b3bf7712adb8ad8b5d9b2c6aca525cb3cf143` (v0.30.1), `source/findIndex.js`, fetched again from raw.githubusercontent.com.
- The fetched files have these hashes, which match `provenance.json` and the files in the patch:
  - `findIndex.js`: sha256 `78467c00c06ef87c44d6d8415a9d9ee3cd7c41c549890fb0fef2b87d06e4bac1`
  - `LICENSE.txt`: sha256 `62fba31dc0582fb6ee413403e47f2de319a4f14140ebd71be094c1f8c7a839ff`
- The declaration is 174 bytes, sha256 `9005ea9989f87b9f5ce349fa5467f8256cd1c085a5a0e7faaca330eb68167275`.
- `search.js` (sha256 `a588b7ce…`) is acorn-token-equal to the upstream declaration once its leading `export` is removed. Log: `ramda-decl.log`.

### Adversarial probes (measured)

I wrote 29 probes plus `narrow-lib.ts`. They import an unchanged copy of the pilot's `search.js`. Each probe ran at head in text and JSON mode, and at the parent in text mode. **Every probe is unsupported at the parent** (exit 1).

**Total admission**

| Probe | Head result |
|---|---|
| p01: named `requires x === x` | `useNoNaN` is a counterexample. The admission probe at x = NaN fails `x === x`. |
| p02: named `requires !Object.is(x,-0)` | `useNoNegZero` is a counterexample. The admission probe is at x = -0. |
| p20 | The guarded closure (`x > 0 &&`) verifies. The unguarded closure is an admission counterexample at `positiveOnly(0)`. |
| q27 | A callee made total by its `requires` verifies along with its caller, so admission does not over-reject. |

**Immutable captures**

| Probe | Head result |
|---|---|
| q25 | const `true`/`undefined` captures and a NaN-threshold capture verify |
| q21 | a `boolean \| undefined` const capture verifies |
| p03 | unsupported: "Callback captures let binding t; only immutable const/parameter captures are supported." |
| p04 | unsupported: "Cannot write parameter binding t" |
| p05 | unsupported: array capture |
| p07 | unsupported: `Math.random` |
| q22 | unsupported: TDZ |
| q26 | unsupported: function capture |
| q28 | unsupported: "Function values can be bound only with const." |
| q29 | unsupported: "Function-valued returns are unsupported." |

**Named and imported contracts**

| Probe | Head result |
|---|---|
| q23 | `yes` and `trustsYes` verify through the named contract |
| p10 | the weak contract gives `useWeak` `unknown/contract-gap`, not a false counterexample |
| p11 | `wrongCaller` is a confirmed counterexample: `values ["0","0","3.16e-322","3.16e-322"]`, result 2 |
| p17 | importing `positiveOnly` across a module boundary: the admission counterexample keeps the defining file `narrow-lib.ts` |
| p18 | the imported `liar` gives `trustsLiar` `unknown/dependency-violation`. Replaying 0 violates `ensures result === true`. |
| q24 | `almostYes` is a counterexample at 12345.5. `trustsAlmostYes` is `unknown/dependency`, so dependency gating holds even when replay misses the bad input. |
| p19 | a number→number named function is rejected |
| p08, p09 | recursion is rejected |

**NaN and signed-zero witnesses**

| Probe | Head result |
|---|---|
| p12 | NaN payloads and `Infinity - Infinity` verify |
| p13 | `strictEqualInputs` is a confirmed counterexample: `p = {"entries":[[["0"],"false"]],"else":"true"}`, x = -0, y = 0. The `Object.is` lookup tells ±0 apart, and the `===` caller is caught. `sameValueInputs` verifies. |
| p14 | subnormal key `{-5e-324 → false}` and infinity/zero keys `{-Infinity → false, 0 → false}` are confirmed counterexamples |

**Other forms**

| Probe | Head result |
|---|---|
| p15 | generic forwarding verifies |
| p16 | see finding 3 |

The JSON output for p11, p13 and p14 includes the predicate-domain assumption, which lists NaN, infinities, signed zeros and subnormals. It also includes the predicate-table trust line.

## Gaps (not tested here)

- I did not review G's effect derivation or the combined tree at `69d9f15`. See finding 1.
- No sustained fuzzing beyond the conformance corpus and 29 hand-written probes. The 256-entry witness-table limit and the `function-witness-incomplete` path were covered only by the author's tests in the 219-test suite. I did not probe them directly.
- No timeout or resource-exhaustion probes for admission queries.
- These were not exercised because the slice rejects them: multi-argument callbacks, non-number domains, stateful callbacks, and callbacks invoked from inside closures.
- The README trust-list wording (finding 2) is left to the author. Production code and docs are unchanged.

## Evidence

The originals are in the scratchpad. Durable copies are under `/Users/rick/verification-vibes/artifacts/roadmap-20261113/landing-H/`, which contains `logs/`, `probes/`, `bin/`, `upstream/` and `SHA256SUMS`.

Scripts:

- `bin/focused.sh` and `bin/followup.sh`: drivers run inside the serial lane. Every step logs its cwd, snapshot SHA, command, exit code and timing.
- `bin/compare-obligations.mjs`
- `bin/ramda-decl.mjs`

Suite and pilot logs:

- `logs/head-full.log`
- `logs/focused-tests-head.log`
- `logs/conformance-head.log`
- `logs/ramda-pilot-head.log`
- `logs/ramda-decl.log`

Comparison logs:

- `logs/native-baseline-head.log`
- `logs/compare-obligations.log`

CLI logs:

- `logs/cli-{head,parent}-{callbacks,callback-bugs}-{text,json}.log`
- `logs/cli-parent-on-head-*.log`

Driver logs:

- `logs/focused-driver.log`
- `logs/followup-driver.log`

Probes:

- outcomes in `logs/probes/<probe>-{head-text,head-json,parent-text}.log`
- sources in `probes/`
