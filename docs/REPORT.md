# Implementation report: verified list UI

Date: 2026-10-30. Machine: macOS 27.0 (arm64), Node 22.23.1, pnpm 10.15.0.

## Status

Every acceptance criterion in the handoff was met and checked by a command that was actually run. Nothing is blocked.

| criterion | evidence |
| --- | --- |
| Clickable app with the exact behavior | `make serve` returned 200 for `/` and `/host.bc.js`. The 9 Playwright tests drove the app. |
| Bundle runs the extracted `update` and `view` | `host.ml` calls only `Verified_core.initial`, `Verified_core.update`, and `Verified_core.view`. `verified_core` is the dune library built from the extracted `verified_core.ml`. No JS or TS reimplementation exists. |
| Checked proofs of all required properties | `dune build theories` succeeds. See the theorem table in [DETAILS.md](DETAILS.md). |
| Preservation over arbitrary valid states and every finite event list | `update_preserves_validity` (∀ s e), `run_preserves_validity` and `intermediate_states_valid` (∀ es, by induction), and `trace_valid` |
| No additional axioms | `assumptions check: all 22 theorems closed under the global context (no axioms)` |
| Browser checks pass | `9 passed` |
| Pinned and documented dependencies | `verified-list-ui.opam.locked` (all 36 opam packages), `pnpm-lock.yaml`, and the version table in DETAILS.md |
| One command | `make check` |
| Serve command | `make serve` |
| Clean rebuild | `make clean && make check` passes. A from-scratch `make setup && make check` in a fresh copy also passes. |

## Commands run and results

1. **Toolchain.** `brew install opam` gave opam 2.6.1; then `opam init --bare --no-setup -y` and `opam switch create . ocaml-base-compiler.5.3.0`. The first package install stopped because the `pkgconf` depext was missing, so I ran `brew install pkgconf`. After that, `opam install dune.3.23.1 rocq-core.9.2.0 rocq-stdlib.9.2.0 js_of_ocaml.6.5.0 js_of_ocaml-compiler.6.5.0 js_of_ocaml-ppx.6.5.0` succeeded. `opam lock .` pinned the transitive set. `rocq --version` reports 9.2, compiled with OCaml 5.3.0.
2. **Proofs.** `dune build` checked all three theories, including the 10 required-behavior `Example`s, which are checked by evaluation. The initial errors were two notation and scope problems (`++` and `length` resolving to `String`) and one proof step. All were fixed in the source.
3. **Extraction.** `verified_core.ml` and `.mli` are generated into `_build/default/extraction/` and compile as an OCaml library.
4. **Bundle.** `_build/default/browser/host.bc.js` is 2.59 MB, built with dune's default dev profile.
5. **Assumptions audit.** `make assumptions` reports all 22 closed. I also ran a negative control on a scratch file containing an `Admitted` lemma. The check script printed `FAILED: 0 of 2 theorems closed` and exited with code 1.
6. **Rebuild after a definition change.** I mutated `update` so that `Select` skips the membership check, then ran `make build`. It failed at `ListUI.v:80`, an example, before producing a bundle. Restoring the file rebuilt cleanly.
7. **Browser tests.** `make check` gave `9 passed`. The first run had 2 failures caused by the tests themselves: a Playwright strict-mode locator, and a globals check that flagged Chromium built-ins. I fixed the tests. The app was unchanged.
8. **Clean rebuild.** `make clean && make check` exited 0 in about 14 seconds.
9. **From scratch.** I copied the sources (without `_opam`, `_build`, or `node_modules`) to a temporary directory and ran `make setup && make check`. It exited 0, the assumption audit reported all 22 closed, and the browser tests reported `9 passed`.

## Follow-up: XState backend

A second target compiles the application to a flat XState v5 config, with no DOM. See "XState backend" in [DETAILS.md](DETAILS.md).

| item | evidence |
| --- | --- |
| Compiler correct for every finite event list | `compile_correct` in `theories/Compile.v`, checked by `dune build theories` |
| No axioms | `assumptions check: all 33 theorems closed under the global context (no axioms)`. The 11 new theorems are included. |
| XState runs the config as modeled | `make test-xstate`: `# tests 6`, `# pass 6`, `# fail 0` against xstate 5.33.3 |
| Wired into the one command | `make check` builds `_build/default/xstate/list.machine.json` (5,207 bytes, 20 states) and runs the XState tests before the browser tests. `make clean && make check` passes. |

Commands and results:

1. **Proofs.** The first build hung in `Compile.v`. Tactics such as `now` and `simpl` were unfolding `reachable`, which was then defined as a fuel-bounded search, and evaluating it symbolically. I changed `reachable` to a literal computed once with `Eval vm_compute`, and narrowed one `simpl` to `cbn [m_states]`. The file now checks in about 0.4 s.
2. **Emission.** `xstate/emit.exe` prints the config (5,207 bytes) and the oracle (34,530 bytes, 160 rows).
3. **XState tests.** All 6 passed on the first run. Then:
   - **Negative controls.** I copied the generated JSON and changed one transition target (`items_1_3__sel_3` on `DELETE_SELECTED`). The oracle test and the random-run test failed. Changing one `meta.selected` flag made the oracle test and the example test fail.
   - **A weak test, found and fixed.** The random-run test did not catch the first corruption. Measuring coverage showed why: its linear congruential generator, used modulo 8, covered only 6 of the 160 pairs. I replaced it with mulberry32, and the test now asserts that its runs cover all 160 pairs. The corruption is caught.
4. **Compiler mutation.** Making `transitions` skip the last alphabet event (`RESET`) failed the build at `Compile.v:236` in `lookup_transition`. Restoring the file rebuilt cleanly.

Limits of this backend:

- The compiler is specific to this application. Its alphabet is `map Select (ids initial) ++ [DeleteSelected; Reset]`, and the out-of-alphabet argument uses `select_missing_noop`.
- The facts checked by evaluation trust the kernel's bytecode VM.
- XState's semantics are tested for this one machine, not proved for the fragment.

## Follow-up: React app on the XState machine

`react/` is a Vite + React 19 app. It runs the generated config through `@xstate/react`'s `useMachine` and renders each state's `meta`.

1. **Rocq change.** Each row in `meta` now carries `selectEvent = ev_name (Select id)` (`Json.v`), so the renderer sends names produced in Rocq. A new XState test checks that each row's `selectEvent` is `SELECT_<id>` and selects exactly that row: `# pass 7`, `# fail 0`.
2. **Build.** `tsc -p react` reported no errors. `vite build` produced a 264 KB bundle (82 KB gzipped).
3. **Browser tests.** The same spec runs as two projects. The first run had 17 passed and 1 failed: the present-ID stale-button test asserted that the old button is detached, which holds for `host.ml` but not for React, since React reuses keyed elements. I made that assertion project-specific. After that, 18 passed.
4. **Negative control.** I made every row send the first row's event. The React project then had 4 failed and 5 passed. Restoring the file restored the pass.
5. **One command.** `make clean && make check` exited 0: 33 theorems closed, 7 XState tests passed, 18 browser tests passed.

## Follow-up: XState with context (capped counter)

This toy app checks whether the approach works when the state space is infinite. See "XState with context" in [DETAILS.md](DETAILS.md).

1. **Model and printer.** `XStateCtx.v` models context, guards, and `assign`, with expressions whose meaning is defined in Rocq. `CtxJs.v` prints a machine as an ES module.
2. **App and proofs.** `Counter.v` proves `count_below_limit` by induction. `CounterMachine.v` proves symbolically that the hand-written machine implements `update`, and that `snapshot.can` is `enabled`. It also proves `machine_count_below_limit`: for any raw events XState is sent, the count stays below 500. The first attempt at `step_correct` failed because `cbn` does not unfold a step whose guard is symbolic. `lazy` with arithmetic kept folded fixed it.
3. **XState check.** `make test-counter` gave `# pass 5`. The checks were 1,260 sampled steps, 20 traces generated in Rocq, junk events and payloads, and a 40,000-event raw fuzz.
4. **Browser.** `/counter.html` in the React build. `counter.spec.ts` has 7 tests, all passed.
5. **Negative controls.** These are in the table in [DETAILS.md](DETAILS.md). The Rocq mutations break proofs, and a printer bug (`<` printed as `<=`) fails 3 Node tests. Dropping `Math.max` from printed subtraction is **not** caught, because the `SUB` guard makes it unobservable in this machine.
6. **One command.** `make clean && make check` exited 0: 51 theorems closed, 7 + 5 XState tests passed, 25 browser tests passed.

## Not verified

- **Browsers.** Only Playwright's Chromium was tested. Firefox and WebKit were not run.
- **Visuals.** Nothing checked visual styling, contrast, or screen reader output. Accessible names and `aria-pressed` are asserted through Playwright's role queries only.
- **Trusted components.** [DETAILS.md](DETAILS.md) lists them: Rocq kernel, extraction, the compilers, the host, and the browser. None is proved.

## Recommended next experiment

**After the XState backend:** make `compile` generic. Parameterize `Compile.v` over a state type with decidable equality, an event type, `update`, `view`, `initial`, an encoder, and a finite alphabet. Require a proof that events outside the alphabet are no-ops on reachable states. Most of the current proofs (`m_step_correct`, `compile_simulates`, the lookup lemmas) do not mention the list UI and would carry over unchanged. A second application, such as a toggle or a wizard, would then cost only its own model and that alphabet lemma. That is the point at which "trust only the compiler" holds for more than one app.

The renderer experiment below still applies to the browser path.

### Browser path

**Prove a renderer correct against an abstract DOM model.** This is the smallest step that shrinks the trusted base. Define a tiny DOM tree in Rocq (elements, attributes, text children), write `render : view_t -> dom` in Rocq, and prove that it is injective on the fields the user perceives (labels, pressed state, disabled state). The handwritten host would then shrink to a mechanical tree-to-DOM copier with no per-application logic.

Item creation is a cheaper extension. It would mostly exercise fresh-ID generation and `NoDup` preservation, but it would not move the trust boundary. Packaging the core as a reusable component is premature with only one application.

## Follow-up: event schemas (Zod via Standard Schema)

The counter's proofs took the payload `n` as a natural number. A direct test showed that JavaScript payloads broke the cap: `SUB` with `n: -5` at 498 gave 503. `ADD` with `n: 1.5` gave a fraction, and `ADD` with `n: "1"` gave the string `"01"`.

1. **Model.** Each machine now declares a schema for each event type (`cm_events`: `PNone` or `PNat max`). `js_step` models a JavaScript event: a `payload` is `PayNat k` or `PayOther`, and an event that fails its schema is ignored. `cwfb` checks that every handled type has a schema and that `PNone` types do not read `n`.
2. **Printer.** `CtxJs.v` prints the schemas as Zod objects and starts every guard with a Standard Schema check (`schema["~standard"].validate`).
3. **Proofs.** `js_count_below_limit` gives the cap for every list of JavaScript events. `step_exact` and `js_exact` prove that every number the machine computes is a safe integer on runs of fewer than 2^53 − 1 events. This replaces the old assumption about JavaScript numbers. `step_exact` passed on the first attempt, with `lazy` followed by `lia`.
4. **Checks.** `make test-counter` gave `# pass 11` (5 machine tests and 6 payload tests). Nine negative controls (five on the printed module, four on the model and the machine) each made a test or a proof fail.

## Follow-up: Foldkit backend (the counter, saved)

The counter is ported to Foldkit 0.168.0 on Effect 4.0.0, and it now saves its state to `localStorage` and restores it at start-up. See "Foldkit backend" in [DETAILS.md](DETAILS.md).

| item | evidence |
| --- | --- |
| The program implements `Counter.update` and `enabled` | `update_correct`, `can_correct`, `run_correct` in `theories/CounterFold.v` |
| The cap holds for every stored value and every list of messages | `restore_enc`, `fold_count_below_limit`; saves restore to what was saved: `fold_saves`, `saves_restore` |
| No axioms | `assumptions check: all 78 theorems closed under the global context (no axioms)`. The 20 new theorems are included. |
| The printed module runs as modeled | `make test-foldkit`: `tsc -p foldkit-web` with no errors, then `# tests 15`, `# pass 15`, `# fail 0` (6 oracle tests, 9 boundary tests) |
| The page works and saves | Playwright project `foldkit`: 11 passed (7 shared counter tests, 4 saving tests) |
| Wired into the one command | `make check` builds the module, the oracle, and the page, and runs the Foldkit tests before the browser tests. `make clean && make check` exited 0 in about 23 seconds. |

Commands and results:

1. **Model and printer.** `Fold.v` models the subset of Foldkit the printer emits: Schema-bounded number fields, message tags with payload schemas, `update` as a clause table, one save command, and `restore`. It reuses `XStateCtx.v`'s expressions, guards, payload reading, and exactness definitions. `FoldTs.v` prints a program as a TypeScript module. One build failed in `FoldTs.v`: under `string_scope`, `ws ++ gs` resolved to `String.append`. Writing `(ws ++ gs)%list` fixed it.
2. **Proofs.** `CounterFold.v` reuses the proof pattern from `CounterMachine.v` (`lazy` with arithmetic kept folded). `raw_message` does a case split on the tag string, and each case leads to `update_correct`, `update_rejected`, or `update_no_clauses`. `restore_enc` destructs the decoded record by its shape, which `fits_spec` gives.
3. **Emission.** `foldkit/emit.exe` prints the module (6,346 bytes, 142 lines) and the oracle (1.13 MB: 4,080 steps, 20 traces, 73 restores). One sample amount (12345) triggered Rocq's large-`nat` warning, so I changed it to 4321.
4. **Build.** `vite build --config foldkit-web/vite.config.ts` produced a 301 KB bundle (98 KB gzipped).
5. **Negative controls.** These are in the table in [DETAILS.md](DETAILS.md):
   - Eight mutations of the printed module were each run on a copy, with `FOLDKIT_OUT` pointing at it. Seven made 1 to 4 of the 15 Node tests fail. An unmodified copy passed 15 of 15. Dropping `Math.max` from subtraction is **not** caught, for the same reason as on the XState path.
   - The Rocq mutation (`GLt` → `GLe` on `ClickedAdd`) failed `update_correct`.
   - A view that ignores `can` failed 9 of 11 Foldkit browser tests.
   - After the Rocq and view controls, `cmp` confirmed that each restored file was identical, and the suite passed again.
6. **Two control runs had to be redone.** Two of my first mutation scripts were malformed: one edit also hit the `initialModel` line, and one used a pattern that matched nothing. I redid both in fresh directories.
7. **A stray symlink.** To let the copies resolve `effect`, I linked `node_modules` into the scratch directory. Running `ln -sf` a second time followed the existing link and created `node_modules/node_modules` inside the repo. dune then failed with "Path node_modules has already been scanned". `unlink node_modules/node_modules` fixed it, and the build has been clean since.
8. **One command.** `make clean && make check` exited 0. The results were:
   - 78 theorems closed
   - Node tests: 7 XState, 11 counter, and 15 Foldkit, all passed
   - Playwright: 36 passed (18 list, 7 React counter, 7 Foldkit counter, 4 Foldkit saving)

Limits of this backend:

- The Foldkit runtime is modeled as a fold, and the model is tested, not proved. That includes the order in which saves land. Foldkit forks each command in a microtask in issue order, and the browser tests observe the last save winning.
- Payload and stored-text readings are trusted. The getter/`Proxy` caveat applies as on the XState path.
- `fold_model_fits` and the exactness theorems need `changes` plus the run length below 2^53 − 1. The cap does not.

## Follow-up: a generic invariant theorem for Foldkit programs

Before this, the counter's cap was proved by a case split specific to the counter (`raw_message`), and a new property would have needed another one. `Fold.v` now has a theorem for every program, and the cap is one use of it. See "Proving the cap" in [DETAILS.md](DETAILS.md).

| item | evidence |
| --- | --- |
| If every clause keeps `P` and `restore` gives `P`, then `P` holds after any run from any stored value, and of the model behind every save | `fold_keeps`, `fold_saves_keep` in `theories/Fold.v` (the new sections are 246 lines, including the tactic `keeps_nums`) |
| Every run keeps the model's field names, for every program | `fold_fields` |
| The cap, re-proved through it | `keeps_below_cap`: `keeps_nums below_cap. all: unfold limit in *; lia.` 14 goals, two per clause. `restores_below_cap` takes 3 lines. `fold_below_cap`, `saves_below_cap` follow. `fold_count_below_limit` keeps its statement and is now `fold_below_cap` plus `fold_fields` |
| A second invariant costs about as much | `fold_amount_fits`: `amount ≤ payload_max`, 6 proof lines |
| No axioms | `assumptions check: all 88 theorems closed under the global context (no axioms)`. The 10 new theorems are included. |
| Nothing else changed | `make clean && make check` exited 0: Node 7 + 11 + 15 passed, Playwright 36 passed |

Commands and results:

1. **The theorem.** `f_update` either changes nothing or applies a clause that fired, with a payload its Schema admits (`update_cases`). So the obligations are per clause, and they do not mention unknown tags, rejected payloads, or which clause a tag picks first. The payload bound reaches each obligation as `arg_ok`. `restores_fits` reduces the `restore` obligation to "every model within the Schema maxima satisfies `P`".
2. **The tactic.** `keeps_nums P` splits `keeps` into one goal per clause, computes the clause's assignments, and case-splits on whether each field read is present. My first version used `repeat constructor` to split the `Forall`s. It also unfolded into the obligations and applied `le` constructors, which left false goals such as `S (num ...) ≤ 0`. Splitting with `apply Forall_cons` / `Forall_nil` only (`split_keeps`) fixed it.
3. **One edit broke a statement.** I edited `CounterFold.v` with a Python heredoc, and a `/\` at the end of a line was read as a line continuation. The build failed with a type error at `fold_count_below_limit`. I fixed it with a plain edit, and a search found no other mangled lines.
4. **Negative controls.** These were run on copies of `counter_program` in a scratch file ([DETAILS.md](DETAILS.md), "Negative controls"):
   - With the `ClickedAdd` guard weakened to `≤ 500`, `lia` closed 13 goals and left one, that clause's: `n + arg ≤ 500 ⊢ n + arg < 500`.
   - With `ClickedReset` setting `count` to 500, it left one goal: `500 < 500`.
   - With `count`'s Schema maximum raised to 500, `keeps` still held, and `restores` failed at `count ≤ 500 ⊢ count < 500`. `Fail lia` confirmed it.
   - The scratch file compiled with exit 0.

Limits:

- `keeps_nums` drops the flag conditions of each clause (`locked = false` and the like). An invariant that depends on them, or that relates a flag to a number, needs a hand proof of the `clause_keeps` goals, or a stronger tactic.
- `P` is a property of one model. Statements about how two models relate, such as "`changes` grows by at most one per message", still need their own proofs. So does the link from models back to counter states (`raw_message`, used by `fold_saves` and `fold_model_fits`).

## Follow-up: the list app on Foldkit

Date: 2026-11-02. The list app (select, delete the selected item, reset) is the second Foldkit program. It tests whether `Fold.v` generalizes past the counter. See "Foldkit backend: the list" in [DETAILS.md](DETAILS.md).

| item | evidence |
| --- | --- |
| The program implements `ListUI.update`, and Delete's enabling matches `View.v` | `update_correct`, `can_correct`, `run_correct`, `can_delete` in `theories/ListFold.v` (359 lines) |
| For every stored value and every list of messages, the model encodes a `Valid` state | `fold_valid`, which is `fold_keeps` with a one-line `keeps_good`. Each clause is a `ListUI` event, so `update_preserves_validity` from `ListUIProofs.v` does the rest |
| No commands, and the printed Schema and safe integers hold on every run, with no length bound | `fold_no_cmds`, `fold_model_fits`, `fold_exact` |
| No axioms | `assumptions check: all 105 theorems closed under the global context (no axioms)`. The 17 new entries are included. |
| The printed module runs as modeled | `tests/foldkit/list.test.mjs`: 7 of 7 pass |
| The page works | Playwright project `foldkit` runs `list.spec.ts`: 9 of 9 pass. All projects: 45 of 45 |
| The counter is unchanged | after the shared encoders moved to `FoldOut.v`, `cmp` showed the printed counter module and its oracle identical to the earlier build |
| Wired into the one command | `make clean && make check` exited 0; `make check` took about 24 seconds. Node: 7 XState, 11 counter, and 22 Foldkit (15 counter, 7 list), all passed. Playwright: 45 passed |

What it took:

1. **`Fold.v`** gained optional-number and `{ id, label }`-list fields, two conditions (`CSet`, `CHas`), and three update forms (`ONull`/`OSome`, `LLit`, `LDrop`). It went from 597 to 773 lines. The statements of `fold_keeps`, `fold_saves_keep`, and `update_cases` did not change.
2. **`FoldTs.v`** prints them as `Schema.NullOr`, `Schema.Array(Schema.Struct(...))`, `!== null`, `.some`, and `.filter`. It went from 199 to 269 lines. It omits the constants block when a program has none; before that, the list module printed a double blank line.
3. **The program** is three clauses, one per `ListUI` event. `ListFold.v` is mostly the link between `ListUI` states and Foldkit models: what each clause does to `enc s`, and that ids stay within the Schema.
4. **`foldkit-web/src/list.ts`** (67 lines) is the view. It is served at `/`, and the counter stays at `/counter.html`.

Problems on the way:

- In `drop_id_enc`, `=?` under `string_scope` was `String.eqb`. Writing `Nat.eqb` fixed it.
- `rewrite` could not reach `fires` under a `match` on the clause list. A lemma `step_one` for one-clause tags fixed it.
- In `keeps_good`, `ltac:(tauto)` inside a term fixed an evar too early. Stating the per-clause fact as `clause_good` and closing with `auto` fixed it.
- `lia` found no witness in `step_exact` until `max_id` and `max_safe` were unfolded.
- Three Foldkit runs of `list.spec.ts` failed at first. A check ran before Foldkit's asynchronous render, and two "nothing changed" checks passed before the click had landed. `expectState` now retries through `expect.poll`, and a `settle` helper waits two animation frames before each no-change check. The jsoo and React projects still pass.

Negative controls ([DETAILS.md](DETAILS.md), "Negative controls" under the list):

- Eight mutations of the printed module were each run on a copy. Each made 1 or 2 of the 7 Node tests fail. One more, membership `===` → `==`, is not caught, because the Schema has already made `n` an integer.
- Two Rocq mutations, dropping `CHas` from select and dropping `CSet` from delete, each broke the build at that clause's lemma.
- Three view mutations each made 1 to 5 of the 9 Foldkit list browser tests fail. After restoring the view, `cmp` matched the original file and the 9 tests passed again.

Limits:

- The view is handwritten. On the jsoo path, `View.v`'s `view` is extracted and its rows are proved. Here, the selected-row comparison and the empty-list test in `list.ts` are trusted and only tested.
- Lists and optional numbers cannot be saved, so the list resets on reload. Saving them would need `decode_saved` and the printed `Saved` Schema to handle arrays and `null`. (Done in the next follow-up, "saving the list".)
- Labels come only from list literals in the program. No message carries a string.

## Follow-up: saving the list

Date: 2026-11-03. The Foldkit list page now saves `selected` and `items` to `localStorage` after every accepted click, and restores them at start-up, as the counter does. Validity now has to hold for whatever the store holds. See "Foldkit backend: the list" in [DETAILS.md](DETAILS.md).

| item | evidence |
| --- | --- |
| Whatever is stored, the app starts from a `Valid` state whose ids are at most 1000 and whose labels are safe | `restore_valid` in `theories/ListFold.v` (505 lines), from `fits_enc` |
| A saved state restores to itself | `save_restore`; and along any run, `fold_saves_restore`: every save holds a valid state and restores to exactly what it saved |
| The program is still `ListUI.update`, and now saves exactly when the event is enabled | `update_correct`, `can_correct`, `run_correct`, `can_delete`, `raw_message`, `fold_run` |
| For every stored value and every list of messages, the model encodes a `Valid` state | `fold_valid`, still `fold_keeps`, with `good` strengthened to `fits_state` |
| The printed Schema and safe integers hold on every run, with no length bound | `fold_model_fits`, `fold_exact` |
| No axioms | `assumptions check: all 113 theorems closed under the global context (no axioms)` |
| The printed module runs as modeled | `tests/foldkit/list.test.mjs`: 13 of 13 pass (450 steps, 20 traces, 51 restores from the oracle; 33 bad stored strings; the label pattern against `safe_char` over every UTF-16 code unit; the save command and `flags` against an in-memory store) |
| The page saves and restores | `tests/browser/list-saved.spec.ts`: 4 of 4 pass. All projects: 49 of 49 |
| The counter is unchanged | `cmp` showed the printed counter module and its oracle identical to the build before this change |
| Wired into the one command | `make clean && make check` exited 0 in 25 seconds. Node: 7 XState, 11 counter, and 28 Foldkit (15 counter, 13 list), all passed. Playwright: 49 passed |

What it took:

1. **`Fold.v`** (773 → 877 lines). `decode_saved` reads `null` or a number for a saved optional number, and an array of `{ id, label }` objects for a saved list, dropping extra keys at both levels. `fits` adds three checks: each list's ids are unique (`ids_unique`), its labels are `safe_char`s (`entries_ok`), and each reference in the new `p_refs` holds (`refs_ok`: an optional number that, when set, is an id of a given list). `fits_spec` states all six conjuncts. `fwfb` requires both fields of a reference to be saved, and the initial model to satisfy the references.
2. **`FoldTs.v`** (269 → 296 lines). The label Schema is `Schema.String` with the pattern `/^[\x20\x21\x23-\x5B\x5D-\x7E]*$/`, the list Schema has a `findIndex` filter for unique ids, and `Saved` has a filter for the references. `Saved` reuses `Model`'s field Schemas, so `NullOr` and `Array` needed no new printing there.
3. **`ListFold.v`.** Every clause saves, and the program declares the reference `("selected", "items")`. The new part is restoring: `fits_enc` turns each conjunct of `fits` into a part of `fits_state` (`Valid`, `ids_fit`, `labels_ok`), and `save_restore` goes the other way. `restore_initial` and `fold_no_cmds` are gone. Their place is taken by `restore_none` (nothing stored gives `initial`) and `fold_saves_restore`.
4. **`foldkit-web/src/list.ts`** (79 lines) passes `BrowserKeyValueStore.layerLocalStorage` to `makeApplication`, so the printed `flags` and `SaveList` reach `localStorage`.

Why the label check: a stored label is any JavaScript string, a sequence of UTF-16 code units, while a Rocq `string` is bytes. Accepting only code units 32 to 126 other than `"` and `\` makes the trusted reading of a label exact, and keeps every label printable in the oracle, whose printer does no escaping. The Node tests cover the labels the oracle cannot hold.

Problems on the way:

- `ListFold.v` needed `Json` imported for `safe_char`.
- `save_restore` first failed with "Unable to unify true with opt_fits ...": `cbn` did not reduce `fits` far enough. Proving `model_fits` and `refs_ok` as separate asserts and rewriting with them fixed it.
- `step_exact` destructs the message table, which grew from 3 tags to 5 with the save results.
- The step test asserted that every result fits `Model`. The repeated-id sample no longer fits `Model`, so neither does its result. The test now asserts it only from samples that fit, and checks that exactly 18 steps (that sample's) start outside `Model`.
- The browser check of a rejected click first asserted that Delete was disabled after the click. A forced-enabled button stays enabled because the model does not change, so nothing re-renders. The test now checks the rows and that the store still holds a marker.

Negative controls ([DETAILS.md](DETAILS.md), "Negative controls" under the list):

- 20 mutations of the printed module were each run on a copy. 19 made 1 to 6 of the 13 Node tests fail. Membership `===` → `==` is still not caught, because the Schema has already made `n` an integer.
- Two new Rocq mutations, each in a scratch copy of `ListFold.v`: with no reference (`p_refs = []`), the build fails in `fits_enc`, where the selection can no longer be shown to be an id. With select not saving, it fails in `clause_event`.
- The three view mutations were rerun against the 13 Foldkit list browser tests (`list.spec.ts` and `list-saved.spec.ts`). They failed 9, 2, and 2 of them. The highlight mutation is a different form from the earlier one: it highlights the first row whenever any row is selected. After restoring the view, `cmp` matched the original file and all 13 passed.

Limits:

- The view is still handwritten, as before.
- Labels are printable ASCII other than `"` and `\`. A list someone stores with other characters, such as `é`, is rejected whole at start-up, and the page falls back to the three starting items. The app itself never creates such a label, since labels come only from the program's list literal.
- The order in which saves land is trusted, as for the counter. The page reads the store only at start-up, so two tabs each keep their own list, and the last save wins.
- Both Foldkit programs now save. `FoldTs.v`'s branch for a program that saves nothing (`flags = Effect.succeed(initialModel)`) is no longer exercised by any program or test.

## Follow-up: the `.fold` authoring path

Date: 2026-11-03. Both Foldkit apps are now written in `.fold` files (`foldkit-web/src/counter.fold`, 70 lines; `list.fold`, 42 lines), a small TypeScript-flavored syntax. An untrusted builder (`fold/`) turns each file into a `.v` file. Rocq checks `fwfb`, proves each stated invariant, and prints the TypeScript module, which the pages import as `./counter.fold` and `./list.fold`. A TypeScript 7.1 content mapper shows failed proofs as `tsc` errors on the rule that breaks them. See "Writing apps in `.fold`" in [DETAILS.md](DETAILS.md).

| item | evidence |
| --- | --- |
| The `.fold` sources are exactly the hand-written programs | `counter_same`, `list_same` (`reflexivity`), and `counter_ts_same`, `list_ts_same` for the printed modules, in `fold/apps/AppsSame.v` (24 lines). dune builds them in `make fold`, so every earlier theorem about `counter_program` and `list_program` holds for the `.fold` files |
| The counter's invariants are proved from the source | `CounterApp.wf`, `belowCap_always`, `amountFits_always`, `belowCap_saves`, `amountFits_saves`, in the generated `CounterApp.v`, through `fold_holds` and `fold_holds_saves` in `theories/FoldAuto.v` (164 lines). `ListApp.wf` for the list |
| No axioms | `assumptions check: all 123 theorems closed under the global context (no axioms)`. The 10 new entries are included |
| The builder | `tests/fold/builder.test.mjs`: 8 of 8 pass. Seven kinds of bad source are rejected with the right code and span, and so is a callback parameter that hides an outer name. `compile` reproduces dune's modules, apart from line 1. A breakable rule and an invariant false at the start are reported with the right codes and spans. The strict build refuses both. The span mappings are sound |
| The content mapper | `tests/fold/mapper.test.mjs`: 4 of 4 pass, over the protocol and through `tsc` 7.1 on `tests/fold/fixture`, which exits 2 with `level.fold(11,3): error fold3: belowCap might not hold after this branch of Raised` |
| The Vite plugin | `tests/fold/vite.test.mjs`: 2 of 2 pass. A failed proof stops the bundle, and a fixed one bundles Rocq's module. `make foldkit-web` builds the real pages through the plugin |
| The pages are unchanged | Playwright: 49 of 49, against pages built from the `.fold` files |
| Speed | One soft analysis (all proofs tried, with diagnostics): 0.7 s for `counter.fold`, 0.4 s for `list.fold`. A strict compile: 0.9 s and 0.4 s. `foldc check` on three files: about 1.4 s |
| Wired into the one command | `make clean && make check` exited 0 in 35 seconds. Node: 7 XState, 11 counter, 28 Foldkit, and 13 `.fold` tests, all passed. Playwright: 49 passed. After the review fix below, `make check` exited 0 again, with 14 `.fold` tests |

What it took:

1. **The builder**, `fold/src`, has 1,646 lines in eight modules: a lexer, a parser that keeps source spans, a checker, the `.v` emitter, the Rocq runner, the diagnostics, the span mappings, and the entry points. The checker builds the `Fold.v` program and states each invariant as a Rocq proposition. It rejects anything `Fold.v` cannot express before Rocq runs, with a message in `.fold` terms.
2. **`theories/FoldAuto.v`** (164 lines). `fold_holds` and `fold_holds_saves` restate `fold_keeps` and `fold_saves_keep` for an invariant proved clause by clause. The tactics `clause_start` and `stored_start` set up each obligation, and `fold_report` prints the goal `lia` was left with.
3. **Two builds of the same `.v` file.** The strict build ends every lemma in `Qed`, and is the only one bundled. The soft build tries every obligation, ends each in `Admitted`, and prints `FOLD-*` lines that `diagnose.mjs` turns back into `.fold` terms.
4. **Three front ends.** `fold/bin/foldc.mjs` (98 lines), the Vite plugin `fold/vite.mjs` (49 lines), and the content mapper `fold/mapper/server.mjs` (229 lines).
5. **Wiring.** `package.json` adds `typescript-7.1` (`npm:typescript@7.1.0-beta`) and links `fold-content-mapper`. `foldkit-web` drops its `@program` path aliases for the plugin and the mapper. The Makefile gains `fold` and `test-fold`, and type-checks `foldkit-web` with 7.1 and `--runExternalCode`. `assumptions/` also reads `fold/apps`.

Problems on the way:

- `idtac` is a tactic, so the soft build's `idtac "FOLD-…"` markers could not run at top level. Each one is now wrapped in `Goal True. idtac "…". Abort.`
- After the `destruct` that splits a clause into cases, the generated proof had to chain its tactics with `;`. Otherwise `fold_simpl` and the `try discriminate` dispatch reached only the first goal. The steps before the split stay as separate sentences.
- The goals `lia` was left with were hard to read. Boolean fields destructured into `true || …` and `false || …`, and hypotheses like `true = true` filled the list. The diagnostic now simplifies those forms and drops trivial hypotheses before printing "needs" and "knows".
- `||` in a guard cannot be expressed, because a clause's guard is a conjunction. The checker reports it on the `||` and suggests `else if`.
- The printed message payload is always `n`, so `on Raised(by: …)` would have printed `Message.Raised({ n })` and broken a `main.ts` that wrote `{ by }`. The builder now requires the parameter to be named `n`, and says so.
- An invariant false at the start was reported twice, once for init and again for stored. With nothing saved, `restore` returns the initial model, so the stored failure repeats the init one. It is now reported once.
- `foldc` printed `FOLD3` while `tsc` prints `fold3`. Both now use `fold3`.
- `tsc` counts a mapper's diagnostics as syntactic, so while a `.fold` proof fails, it skips the semantic pass for the whole program. A type error in `main.ts` stays hidden until the proof goes through. This is documented, not fixed.
- The Vite test first matched minified output, which was fragile. It now builds with `minify: false` and matches the printed lines.
- A design review found that the checker ignored scope in callbacks. `model.items.filter((model) => model.id !== model.selected)` was read as "drop the selected item", although in TypeScript `model.selected` there is the item's field. A callback parameter named `model`, `next`, the message parameter, or a constant is now rejected.

Limits:

- TypeScript 7.1 and content mappers are in beta. Only the `tsc` CLI was tested, not an editor.
- The builder is trusted to state the invariants faithfully. For the counter, `Q_belowCap` should be read in `foldc v` output. `AppsSame` pins the programs, but not the invariants, which are new statements.
- Invariants cannot mention lists, so the list's validity is still proved in `ListFold.v`, and `list.fold` states no invariant. Messages carry only numbers. There is no `||` and no multiplication in rules.
- Each branch is proved on its own, without assuming that earlier conditions failed. A later branch that relies on this will be reported even though it is safe.
- Each analysis runs Rocq on the whole file. That is fast enough for these two apps, but it will not stay fast as the files grow.
