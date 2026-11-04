# Verified list UI: technical details

The full write-up: every definition, theorem, trust boundary, test, and negative control, back end by back end. For the overview, see the [front page](../README.md). For the implementation log, see [REPORT.md](REPORT.md). Paths are relative to the repository root.

A browser UI that shows three items, lets you select one, delete the selected item, and reset. The state, the event transitions, and the declarative view are written in Rocq and proved correct for every finite event sequence. They are then extracted to OCaml and compiled to JavaScript with js_of_ocaml. The browser runs the extracted `initial`, `update`, and `view` functions. A small handwritten OCaml host connects them to the DOM.

```
theories/*.v (Rocq definitions + proofs)
    ─ rocq extraction ─▶ _build/default/extraction/verified_core.ml   (generated)
    ─ ocamlc + js_of_ocaml, linked with browser/host.ml ─▶ _build/default/browser/host.bc.js
    ─▶ browser (index.html + styles.css)

theories/{XState,Compile,Json}.v (machine model, proved compiler, JSON)
    ─ rocq extraction (serializes two constants) ─▶ _build/default/xstate/list.machine.json
    ─▶ react/src/App.tsx: useMachine(createMachine(config)), renders meta ─▶ _build/react

theories/{XStateCtx,CtxJs,Counter,CounterMachine,CounterOut}.v (context model, counter, printer)
    ─ rocq extraction (prints the module) ─▶ _build/default/counter/counter.machine.js
    ─▶ react/src/Counter.tsx: useMachine(machine), renders context ─▶ _build/react/counter.html

theories/{Fold,FoldTs,FoldOut,CounterFold,CounterFoldOut}.v (Foldkit model, printer, counter, proofs)
    ─ rocq extraction (prints the module) ─▶ _build/default/foldkit/counter.program.ts
    ─▶ foldkit-web/src/main.ts: Runtime.makeApplication, view only ─▶ _build/foldkit-web/counter.html

theories/{ListFold,ListFoldOut}.v (the list app, same Foldkit model and printer)
    ─ rocq extraction (prints the module) ─▶ _build/default/foldkit/list.program.ts
    ─▶ foldkit-web/src/list.ts: Runtime.makeApplication, view only ─▶ _build/foldkit-web/index.html

foldkit-web/src/{counter,list}.fold (the same two programs, in .fold syntax)
    ─ fold/ (untrusted builder) ─▶ a .v file: the program, its invariants, and their proofs
    ─ rocq (fwfb, every proof, then prints ts_module) ─▶ the TypeScript module
    ─▶ imported as ./counter.fold and ./list.fold (Vite plugin; tsc 7.1 content mapper)
    fold/apps/AppsSame.v: each is the program theories/{CounterFold,ListFold}.v defines
```

## Setup

Tested on macOS 27 (arm64). You need:

- Homebrew `opam` 2.6.1, plus `pkgconf` and `gmp` (needed to build `zarith` for Rocq)
- Node ≥ 22 and pnpm 10

```sh
brew install opam pkgconf gmp
opam init --bare --no-setup -y      # once per machine
make setup
```

`make setup` creates a project-local opam switch in `./_opam` from `verified-list-ui.opam.locked`, which pins every transitive package. It then installs `@playwright/test` from `pnpm-lock.yaml` and downloads Playwright's Chromium. A from-scratch setup takes several minutes, mostly compiling OCaml and Rocq.

Pinned toolchain:

| component | version |
| --- | --- |
| OCaml (`ocaml-base-compiler`) | 5.3.0 |
| dune | 3.23.1 (Rocq rules: `(using rocq 0.11)`) |
| Rocq (`rocq-core`, `rocq-runtime`, `rocq-stdlib`) | 9.2.0 |
| js_of_ocaml, js_of_ocaml-compiler, js_of_ocaml-ppx | 6.5.0 |
| @playwright/test | 1.64.1 (Chromium) |
| xstate | 5.33.3 |
| react, react-dom / @xstate/react | 19.3.1 / 6.1.0 |
| vite / @vitejs/plugin-react / typescript | 8.3.5 / 6.1.2 / 7.0.2 (and 7.1.0-beta for `.fold`, as `typescript-7.1`) |
| foldkit / effect / @effect/platform-browser | 0.168.0 / 4.0.0 / 4.0.0 |

`verified-list-ui.opam` lists the direct dependencies. Regenerate the lock file after changing it with `opam lock .`.

## Commands

All commands run inside the local switch. You don't need `eval $(opam env)`.

```sh
make check   # proofs, assumptions audit, all apps, XState, Foldkit, and .fold tests, browser tests
make serve   # build, then serve the jsoo app at http://127.0.0.1:8080/  (PORT=… to change)
make serve-react  # build, then serve the React + XState app (PORT=… to change)
make build   # proofs + extraction + bundle only
make proofs  # Rocq theory only
make assumptions  # Print Assumptions audit only
make xstate       # emit _build/default/xstate/list.machine.json (and the test oracle)
make test-xstate  # run the emitted config in XState against the Rocq oracle
make counter      # emit _build/default/counter/counter.machine.js (and the test oracle)
make test-counter # run the emitted counter module in XState against the Rocq oracle
make react        # type-check and build the React pages into _build/react (/, /counter.html)
make foldkit      # emit _build/default/foldkit/{counter,list}.program.ts (and the test oracles)
make test-foldkit # type-check, then run the printed Foldkit programs against the Rocq oracles
make fold         # build the .fold apps through fold/ and check them in Rocq (fold/apps)
make test-fold    # the builder, the content mapper (and tsc 7.1), and the Vite plugin
make foldkit-web  # build the Foldkit pages into _build/foldkit-web (/ is the list, /counter.html)
make serve-foldkit  # build, then serve the Foldkit pages (PORT=… to change)
make clean
```

dune tracks dependencies from the `.v` files through the `.vo` files, the extracted `.ml`, and the bundle. Editing a definition therefore re-checks every affected proof, re-extracts, and rebuilds the JS. Generated code lives only in `_build/` and is never committed or edited. A failing proof fails the build, so the build never falls back to an older extraction.

## Layout

| path | role |
| --- | --- |
| `theories/ListUI.v` | `item`, `state`, `event`, `initial`, `update`, `run`, `ids`, `Valid`; the required examples, checked by `reflexivity` |
| `theories/ListUIProofs.v` | state, execution, and operation theorems |
| `theories/View.v` | `row`, `view_t`, `view`, and the view correspondence theorems |
| `theories/XState.v` | model of flat XState machines: `machine`, `m_step`, `m_run`, `m_meta`, well-formedness `wfb` |
| `theories/Compile.v` | `compile` from `update`/`view` to a `machine`, and its correctness proofs |
| `theories/Json.v` | JSON AST, printer, safe-charset check, the config and the test oracle |
| `xstate/ExtractJson.v`, `xstate/emit.ml` | extract the two JSON texts and print them into `_build/default/xstate/` |
| `react/src/App.tsx`, `react/src/main.tsx` | React renderer for the generated machine (`useMachine`, copies `meta` into the DOM) |
| `react/index.html`, `react/vite.config.ts`, `react/tsconfig.json` | React app shell and build config; the machine JSON is imported as `@machine` from `_build/default/xstate/` |
| `tests/xstate/machine.test.mjs` | `node:test` checks of the emitted config under the pinned XState |
| `theories/XStateCtx.v` | model of XState machines with context: expressions, guards, `assign`, `c_step`, `c_can`, well-formedness `cwfb`; event schemas, JavaScript events (`js_step`), and exact arithmetic (`trace_exact`) |
| `theories/CtxJs.v` | printer from a machine with context to an XState JavaScript module with Zod event schemas |
| `theories/Counter.v` | the capped counter: `state`, `event`, `enabled`, `update`, and the cap theorem |
| `theories/CounterMachine.v` | the counter as a machine with context, and the proofs that it implements `update` |
| `theories/CounterOut.v` | the printed module and the counter's test oracle |
| `counter/ExtractCounter.v`, `counter/emit.ml` | extract and print them into `_build/default/counter/` |
| `react/counter.html`, `react/src/Counter.tsx`, `react/src/counter-main.tsx` | React page for the counter; the module is imported as `@counter` |
| `tests/counter/machine.test.mjs` | `node:test` checks of the emitted counter module under the pinned XState |
| `tests/counter/payload.test.mjs` | `node:test` checks of the event schemas: Zod's verdicts, and bad payloads in every sampled state |
| `tests/browser/counter.spec.ts` | Playwright checks of the counter page (projects `react` and `foldkit`) |
| `theories/Fold.v` | model of Foldkit programs: boolean, number, optional-number, and `{ id, label }`-list fields with Schema maxima, message tags with payload schemas, `update` as a clause table, the save command, `restore`, `f_update`, `f_can`, `f_run`, `f_cmds`, well-formedness `fwfb`, exact arithmetic (`f_trace_exact`), invariants (`fold_keeps`) |
| `theories/FoldTs.v` | printer from a `Fold.v` program to a Foldkit TypeScript module (Effect Schemas, message union, save command, `restore`, `flags`, `update`, `can`) |
| `theories/FoldOut.v` | JSON encoders shared by the Foldkit oracles: models, messages, steps, traces, Schema facts |
| `theories/CounterFold.v` | the counter as a Foldkit program with a saved state, and the proofs that it implements `update` and keeps the cap from any stored value |
| `theories/CounterFoldOut.v` | the printed module and its test oracle (steps, traces, restores) |
| `theories/ListFold.v` | the list app as a Foldkit program with a saved list, and the proofs that it implements `ListUI.update`, restores a `Valid` state from any stored value, and keeps `Valid` for any messages |
| `theories/ListFoldOut.v` | the printed list module and its test oracle (steps, traces, restores) |
| `foldkit/ExtractFold.v`, `foldkit/emit.ml` | extract and print both programs and oracles into `_build/default/foldkit/` |
| `foldkit-web/src/counter.fold`, `foldkit-web/src/list.fold` | the two programs in `.fold` syntax; see "Writing apps in `.fold`" |
| `foldkit-web/counter.html`, `foldkit-web/src/main.ts` | Foldkit page for the counter: the view, and `Runtime.makeApplication` with `localStorage`; the module is imported from `./counter.fold` |
| `foldkit-web/index.html`, `foldkit-web/src/list.ts` | Foldkit page for the list: the view, and `Runtime.makeApplication` with `localStorage`; the module is imported from `./list.fold` |
| `foldkit-web/vite.config.ts`, `foldkit-web/tsconfig.json` | build config for both pages: the `fold` Vite plugin, and the `.fold` content mapper, through which `tsc` 7.1 type-checks the printed modules |
| `theories/FoldAuto.v` | `fold_holds`, `fold_holds_saves`, and the tactics the generated proofs use |
| `fold/src/*.mjs`, `fold/bin/foldc.mjs` | the untrusted builder: `.fold` to a `.v` file, diagnostics, span mappings; and its command line |
| `fold/vite.mjs`, `fold/mapper/server.mjs` | the Vite plugin, and the TypeScript 7.1 content mapper (package `fold-content-mapper`) |
| `fold/apps/dune`, `fold/apps/AppsSame.v` | generate `CounterApp.v` and `ListApp.v` from the `.fold` files, compile them, and prove each equal to the hand-written program |
| `tests/fold/builder.test.mjs`, `mapper.test.mjs`, `vite.test.mjs`, `tests/fold/fixture/` | `node:test` checks of the builder, the content mapper, and the Vite plugin, on a fixture whose proof fails |
| `tests/foldkit/program.test.mjs` | `node:test` checks of the printed module under the pinned Effect and Foldkit against the Rocq oracle |
| `tests/foldkit/boundary.test.mjs` | `node:test` checks of the payload Schemas, the save command, and `flags` against a fake `Storage` |
| `tests/foldkit/list.test.mjs` | `node:test` checks of the printed list module against its Rocq oracle, of its payload and label Schemas, and of the save command and `flags` against an in-memory store |
| `tests/browser/counter-saved.spec.ts`, `tests/browser/list-saved.spec.ts` | Playwright checks of saving and restoring the counter and the list (Foldkit project only) |
| `extraction/Extract.v` | extraction entry point (`Extraction "verified_core.ml" initial update run view`) |
| `assumptions/Assumptions.v` | `Print Assumptions` for all 123 main theorems; `scripts/check-assumptions.sh` fails the build unless each says "Closed under the global context" |
| `browser/host.ml` | handwritten host: private state, serialized dispatch, DOM rendering |
| `browser/index.html`, `browser/styles.css` | static page |
| `tests/browser/list.spec.ts` | Playwright integration checks of the list (projects `jsoo`, `react`, and `foldkit`) |
| `scripts/serve.mjs` | dependency-free static server for the built app |

## Definitions

```coq
Record item  := mkItem  { item_id : nat; item_label : string }.
Record state := mkState { items : list item; selected : option nat }.
Inductive event := Select (id : nat) | DeleteSelected | Reset.

Definition update s e := match e with
  | Select id      => if mem id (items s) then mkState (items s) (Some id) else s
  | DeleteSelected => match selected s with
                      | None => s
                      | Some id => mkState (remove_id id (items s)) None end
  | Reset          => initial end.

Definition run s es := fold_left update es s.
Definition Valid s := NoDup (ids s) /\ match selected s with None => True | Some id => In id (ids s) end.
```

`view s` produces one `row` per item, `{row_id; row_label; row_selected}`, plus `delete_enabled` and `show_empty_message` flags. The host only copies these into the DOM.

## What is proved

Every theorem below is checked by the Rocq kernel. The assumptions audit confirms that none depends on any axiom. There are no `Admitted`, `admit`, or `Axiom` in the development.

| theorem | statement |
| --- | --- |
| `initial_valid` | `Valid initial` |
| `update_preserves_validity` | `∀ s e, Valid s → Valid (update s e)` |
| `run_preserves_validity` | `∀ es, Valid (run initial es)` (via `run_preserves_validity_from`, by induction on `es`) |
| `intermediate_states_valid` | `∀ es n, Valid (run initial (firstn n es))` |
| `trace_valid` | `Forall Valid (trace initial es)`: every state the host passes through. `trace_prefixes` relates the trace to `run` on prefixes |
| `select_existing_spec` | `In id (ids s) → update s (Select id) = mkState (items s) (Some id)` |
| `select_missing_noop` | `¬ In id (ids s) → update s (Select id) = s` |
| `delete_none_noop` | `selected s = None → update s DeleteSelected = s` |
| `delete_selected_spec` | `Valid s → selected s = Some id → ∃ pre it post, items s = pre ++ it :: post ∧ item_id it = id ∧ id ∉ ids pre ∧ id ∉ ids post ∧ update s DeleteSelected = mkState (pre ++ post) None` |
| `delete_selected_length`, `delete_selected_removes_id` | length drops by exactly 1; the ID is gone |
| `reset_spec` | `∀ s, update s Reset = initial` |
| `delete_twice_noop`, `reset_idempotent` | second delete is a no-op; repeated reset is stable |
| `view_rows_match_items` | `map row_item (rows (view s)) = items s`: same items, same order, same IDs and labels (also `view_rows_positionwise`, `view_rows_length`) |
| `view_row_selected_iff` | for each row, `row_selected r = true ↔ selected s = Some (row_id r)` |
| `view_exactly_one_selected` | `Valid s → selected s = Some id →` the selected rows are exactly `[the row for the item with ID id]` (also `view_selected_count_some`) |
| `view_none_selected` | `selected s = None →` no row is selected |
| `view_delete_enabled_iff` | `delete_enabled (view s) = true ↔ ∃ id, selected s = Some id` |
| `view_delete_enabled_effective` | in a valid state, enabled Delete means a present item exists and the update removes exactly it |
| `view_empty_message_iff` | the empty message shows iff `items s = []` |

`delete_selected_spec` is stated over the item records themselves, not just their IDs. That rules out deleting the wrong item, deleting several items, relabelling, and reordering. The preservation theorem quantifies over arbitrary valid states, not just the three-item examples, and `Select` of an absent ID is covered by the same theorem.

The view theorems are about the abstract view only. They say nothing about pixels, layout, contrast, or how a browser draws a button.

## Browser host

`browser/host.ml` keeps `state` in a module-private `ref`. Each click builds an extracted event: `Select id`, using the extracted `nat` captured from that row's view, or `DeleteSelected`, or `Reset`. The event goes into a FIFO queue. The dispatcher applies `Verified_core.update` to the latest state, stores the result, and re-renders from `Verified_core.view`. Handlers never capture a state.

Rendering replaces the list contents fully. Each row is a native `<button type="button">`. Its label is set via `textContent` and is its accessible name. `aria-pressed` and a `selected` class show selection. The Delete button's native `disabled` property is set from `delete_enabled`.

Nothing is exported to JavaScript. The only globals the bundle adds are js_of_ocaml's runtime hooks (`jsoo_runtime`, `jsoo_create_file`, `jsoo_fs_tmp`), and a test checks this.

The host contains two small decoders, used only for display: `int_of_nat` for the `data-id` attribute and `string_of_rocq`, which turns the extracted 8-bit `ascii` list into an OCaml string for `textContent`. No code converts machine integers to `nat`.

## Trust boundary

The claim is this: the Rocq implementation preserves its proved state properties and produces an abstract view satisfying its proved correspondence properties. The running browser application executes the extracted implementation, provided the trusted integration below behaves as documented.

Trusted, not proved:

1. **Proof checking and platform.** The Rocq 9.2.0 kernel, the OCaml 5.3.0 runtime that Rocq runs on, macOS, and hardware.
2. **Extraction.** Rocq's extraction plugin, and the `ExtrOcamlBasic` mappings of `bool`, `option`, `list`, `prod`, `unit`, and `sumbool` to the OCaml types of the same shape. Each mapping is constructor for constructor. `nat`, `string`, and `ascii` have no custom mapping. They extract as Peano naturals and 8-bit records, so no machine-integer or native-string representation is trusted. The cost is unary arithmetic, which is negligible for three items.
3. **Compilation.** `ocamlc` 5.3.0, js_of_ocaml 6.5.0 and its runtime, and dune 3.23.1 wiring the right files together.
4. **The handwritten host** (`browser/host.ml`, about 100 lines): event construction, the dispatch loop, DOM writes, and the two display decoders. The Playwright tests are evidence for it, not a proof.
5. **The browser.** DOM, event delivery, layout, accessibility tree, and painting. Tested in Playwright's Chromium only.
6. **The static page and server.** `index.html` must contain the four elements the host expects; the host fails loudly if any is missing. `scripts/serve.mjs` serves three fixed files.

Not verified at all: pixel output, CSS, layout, contrast, and any backend or network. This spike has no backend or network.

## Browser tests

`tests/browser/list.spec.ts` runs against all three list apps (Playwright projects `jsoo`, `react`, and `foldkit`, 27 tests). `tests/browser/counter.spec.ts` runs against both counter pages, in the `react` and `foldkit` projects (7 tests each), and `tests/browser/counter-saved.spec.ts` and `tests/browser/list-saved.spec.ts` against the Foldkit pages only (4 tests each). That is 49 in all; see below for the counter and the Foldkit list. The list tests cover the integration boundary:

- initial rendering, including order, `data-id`, native `type` and `disabled`, and the hidden empty message
- the selection highlight moving between rows, and re-selecting the same row
- deleting the intended row while preserving order
- re-selecting then deleting
- deleting down to the empty state, then reset
- repeated reset
- a retained, detached row button whose ID was deleted: clicking it leaves the state unchanged, including the current selection. This is the adapter-level absent-ID check.
- a retained button whose ID still exists, which selects normally
- no application globals

## XState backend

This is a second target with no DOM. The Rocq development compiles the application into a flat XState v5 machine config. The compiler is proved. What stays trusted is small and application-independent: the JSON printer, and the claim that XState runs flat machines the way `theories/XState.v` says.

### What is compiled

Only finitely many states are reachable from `initial`: 8 subsets of the three items, each with no selection or one of its items selected, for 20 in all (`reachable_count`). `compile` makes one XState state per reachable state:

```json
"items_1_3__sel_3": {
  "on": { "SELECT_1": "items_1_3__sel_1", "DELETE_SELECTED": "items_1__sel_none",
          "RESET": "items_1_2_3__sel_none" },
  "meta": { "rows": [ {"id":1,"label":"Alpha","selected":false},
                      {"id":3,"label":"Gamma","selected":true} ],
            "deleteEnabled": true, "showEmptyMessage": false } }
```

- The key is `enc s`, which spells out the item IDs and the selection.
- `on` has an entry for each event in the alphabet (`SELECT_1..3`, `DELETE_SELECTED`, `RESET`) whose `update` changes the state. Events that would leave the state unchanged have no entry, so XState ignores them.
- `meta` is `view s`.
- The config has no context, guards, actions, delays, or nested or parallel states.

Every guard checks its event against the schema first. So XState ignores an event that fails the schema, and `snapshot.can` is false for it.

### Why the schemas

The proofs about `c_step` take the payload as a natural number. JavaScript can send any value. Before the schemas, these events broke the cap or the arithmetic:

| event | before | now |
| --- | --- | --- |
| `SUB` with `n: -5` at count 498 | count 503 | ignored |
| `ADD` with `n: 1.5` at count 498 | count 499.5 | ignored |
| `ADD` with `n: "1"` at count 0 | count `"01"` (a string) | ignored |

The page did not send them, because its amount field accepts only digits. But nothing proved that, and any other code that calls `send` could send them.

### What is proved (`theories/Compile.v`)

| theorem | statement |
| --- | --- |
| `compile_correct` | `∀ es, m_run compile (m_initial compile) (map ev_name es) = enc (run initial es) ∧ m_meta compile (that state) = Some (view (run initial es))` |
| `compile_simulates`, `m_step_correct` | one step and every finite run of the machine track `update` and `run`, for every event, including `Select` of IDs that never exist |
| `reachable_closed` | `∀ s e, In s reachable → In (update s e) reachable` |
| `enc_inj` | distinct reachable states get distinct keys, so a machine state identifies the Rocq state exactly |
| `ev_name_inj` | distinct events get distinct names (`SELECT_<decimal>`, using the stdlib decimal round-trip lemmas) |
| `compile_wf` | the config meets the `wfb` side conditions: unique state keys, unique event keys per state, every target exists, and every key is non-empty `[A-Za-z0-9_]` (so XState never reads one as a path, an ID, a wildcard, or a built-in event) |
| `config_safe`, `oracle_safe` | every JSON string is printable ASCII without `"` or `\`, so the printer needs no escaping |

Several facts are checked by evaluation (`vm_compute`) over the 20 states rather than by hand proofs: closure under the alphabet, distinct keys, `wfb`, and the safe charset. If the compiler or `update` changes so that one fails, the build fails. For example, dropping the `RESET` transitions makes `lookup_transition` fail.

### Trust boundary for this path

Trusted, not proved:

1. **Rocq 9.2.0 kernel**, including its bytecode VM, which `vm_compute` uses to check the facts proved by evaluation.
2. **Extraction, OCaml 5.3.0, and `xstate/emit.ml`.** The extracted code computes the JSON text at build time; `emit.ml` (about 30 lines) decodes the 8-bit characters and prints them. A bug here could change the emitted file. Nothing extracted runs in the deployed artifact, which is plain JSON.
3. **The JSON printer** `print` in `Json.v`, about 15 lines.
4. **The XState model.** `m_step` and `m_meta` must be how XState 5.33.3 interprets this fragment: a transition is taken if the current state's `on` has the event type; otherwise the event is ignored; `getMeta()` returns the stored `meta` under `"list.<key>"`. This is not proved. `tests/xstate/machine.test.mjs` checks it for the generated machine:
   - every one of the 160 (reachable state, event) pairs, against an oracle computed in Rocq directly from `update`, `enc`, and `view` (not from `compile`). The events include `SELECT_0`, `SELECT_4`, and `SELECT_999`.
   - 8 malformed event types in all 20 states
   - the handoff's example sequences on a live actor, with expected labels written from the spec
   - 200 random 50-step live-actor runs, which are required to cover all 160 pairs

   Corrupting one transition target or one `meta` field in the emitted JSON makes the test fail.
5. **XState and the JS engine** that runs it.

The compiler is specific to this application, because its alphabet is the `Select` IDs of `initial`. See [REPORT.md](REPORT.md) for making it generic.

### React app

`react/src/App.tsx` (about 60 lines) runs the machine with `useMachine(createMachine(config))` from `@xstate/react`. The config is the generated JSON, bundled unchanged by Vite. On each render, the component reads `snapshot.getMeta()["list.<state>"]` and copies it into the same DOM shape as the jsoo app: row buttons with `aria-pressed` and `data-id`, a native `disabled` on Delete, and the empty message. It contains no list logic:

- A row button sends its row's `selectEvent`. That name is emitted by Rocq as `ev_name (Select id)`, so the renderer never builds event names.
- Delete and Reset send the fixed names `DELETE_SELECTED` and `RESET`.
- If a state has no `meta`, it throws instead of rendering something else.

Trusted for this app, in addition to the XState path above: `App.tsx`, React and `@xstate/react`, Vite's bundling, and the browser. The Playwright suite runs the same 9 scenarios against it as against the jsoo app (project `react`). There are two differences:

- React reuses the keyed row element across renders, so a retained Alpha button is still attached. The test asserts this per project.
- React delegates events from the root, so a detached button's click reaches no handler. In React, the absent-ID browser test therefore shows only that nothing happens. `tests/xstate` covers the machine's handling of `SELECT_2` after Beta is deleted.

Making every row send the first row's event fails 4 of the React project's tests.

## XState with context: the capped counter

The flat backend stores the whole application state in the state key, so it only works for small, finite state spaces. This second experiment uses XState's own mechanism for data: `context`, with guards that decide whether a transition fires and `assign` actions that update the context.

### The app (`theories/Counter.v`)

A counter that starts at 0. `Add n` and `Sub n` change it by any amount `n`. `Reset` sets it to 0. `Lock` blocks everything except `Unlock`. An event is accepted only when `enabled s e` holds; otherwise it is ignored:

```coq
Definition enabled (s : state) (e : event) : bool :=
  match e with
  | Add n => negb (locked s) && Nat.ltb (count s + n) limit     (* limit = 500 *)
  | Sub n => negb (locked s) && Nat.leb n (count s)
  | Reset | Lock => negb (locked s)
  | Unlock => locked s
  end.
```

`changes` counts the accepted `Add` and `Sub` events since the last reset, so it is unbounded. The state space is infinite (`changes_unbounded`), and the flat compiler could not enumerate it.

### The machine (`theories/CounterMachine.v`)

It is written in a small expression language (`theories/XStateCtx.v`) whose meaning is defined in Rocq. It has two control states, `unlocked` and `locked`, and the context `{ count, changes, limit }`. It also declares a schema for each event's `n` payload: `ADD` and `SUB` need an integer from 0 to `payload_max` (999999999999999, 15 digits), and `RESET`, `LOCK`, and `UNLOCK` do not read `n`. `CtxJs.v` prints it as an ES module. The output starts like this:

```js
export const events = {
  ADD: z.object({ type: z.literal("ADD"), n: z.number().int().min(0).max(999999999999999) }),
  ...
  RESET: z.object({ type: z.literal("RESET") }),
  ...
};

// Standard Schema check.  An async result counts as a failure.
const accepts = (schema, event) => {
  const result = schema["~standard"].validate(event);
  return !(result instanceof Promise) && result.issues === undefined;
};

export const machine = createMachine({
  id: "counter",
  initial: "unlocked",
  context: { count: 0, changes: 0, limit: 500 },
  states: {
    unlocked: {
      meta: { locked: false },
      on: {
        ADD: [
          {
            guard: ({ context, event }) => (accepts(events.ADD, event) && ((context.count + (event.n ?? 0)) < context.limit)),
            target: "unlocked",
            actions: assign({ count: ({ context, event }) => (context.count + (event.n ?? 0)), changes: ... }),
          },
        ],
```

Every guard checks its event against the schema first. So XState ignores an event that fails the schema, and `snapshot.can` is false for it.

### Why the schemas

The proofs about `c_step` take the payload as a natural number. JavaScript can send any value. Before the schemas, these events broke the cap or the arithmetic:

| event | before | now |
| --- | --- | --- |
| `SUB` with `n: -5` at count 498 | count 503 | ignored |
| `ADD` with `n: 1.5` at count 498 | count 499.5 | ignored |
| `ADD` with `n: "1"` at count 0 | count `"01"` (a string) | ignored |

The page did not send them, because its amount field accepts only digits. But nothing proved that, and any other code that calls `send` could send them.

### What is proved

The proofs are symbolic: they cover every count, every `changes` value, and every payload. Nothing is enumerated.

| theorem | statement |
| --- | --- |
| `count_below_limit` | `∀ es, count (run initial es) < 500`, by induction with the invariant `update_inv` |
| `step_correct` | `∀ s e, c_step counter (enc s) (ev e) = enc (update s e)` |
| `can_correct` | `∀ s e, c_can counter (enc s) (ev e) = enabled s e`: XState's `snapshot.can` is `enabled` |
| `run_correct`, `meta_correct` | every run of the machine tracks `run`, and `meta.locked` is the state's `locked` |
| `unknown_ignored` | any event type other than the five is ignored |
| `machine_count_below_limit` | for every list of raw events, with any type string and any `nat` payload, the machine reaches a snapshot that encodes a state with `count < 500` |
| `js_count_below_limit` | the same for every list of JavaScript events (`js_step`), with any payload value: negative, fractional, a string, missing, and so on |
| `js_step_correct` | an event whose amount is at most `payload_max` passes its schema and does what `update` says |
| `step_exact`, `js_exact` | on every run of fewer than 2^53 − 1 events, every number the machine computes (context, guards, assignments, and their subexpressions) is at most `Number.MAX_SAFE_INTEGER`, so JavaScript arithmetic agrees with `nat`. `payload_max_safe` shows `payload_max + 500` is a safe integer. |
| `machine_context_ok` | that snapshot's context is exactly `{count: c, changes: k, limit: 500}` with `c < 500` |
| `disabled_noop`, `add_spec`, `add_enabled_iff`, `sub_enabled_iff`, `locked_only_unlock` | events do what they say |
| `every_count_reachable`, `changes_unbounded` | the guard is not too strict, and the state space is infinite |
| `counter_wf` | names are identifiers, targets exist, expressions read only declared fields, every handled event type has a schema, and no transition of a schema-less (`PNone`) type reads `n` |

### Trust boundary for this path

1. **The Rocq kernel, extraction, OCaml, and `counter/emit.ml`.** These are the same as for the flat path.
2. **The printer** `CtxJs.v`, about 150 lines. It fully parenthesizes expressions. It prints `EArg` as `(event.n ?? 0)` and `ESub` as `Math.max(0, a - b)`, so that JavaScript agrees with `eval` on nat. It prints each event schema as a Zod object, and it starts each guard with `accepts(events.T, event) &&`.
3. **The XState model** `c_step`, `c_can`, and `c_meta_of` in `XStateCtx.v`. They say that the first transition whose guard holds is taken, and that `assign` computes every field from the old context. `tests/counter/machine.test.mjs` checks this against an oracle computed from `update` and `enabled`, not from the machine:
   - all 1,260 sampled steps: both control states, 15 counts around every boundary, and 21 events with amounts around the cap, checking the next snapshot, the meta, and `can`
   - 20 pseudo-random 60-event traces, generated in Rocq, on a live actor
   - junk event types and extra payloads in every sampled state
   - a raw-event fuzz of 40,000 events, which checks that `count` stays below 500 in the real XState
4. **Zod 4.6.7 and the reading of a JavaScript value as a `payload`.** The model reads `n` as `PayNat k` when it is a number that is a non-negative integer (`-0` is 0), and as `PayOther` otherwise. It trusts that the printed schema accepts an event exactly when `admits` does. `tests/counter/payload.test.mjs` checks this (6 tests):
   - the schema verdicts for 28 payload values: missing, `undefined`, `null`, negative numbers, fractions, NaN, ±Infinity, strings, booleans, arrays, objects, BigInt, a boxed `Number`, `payload_max + 1`, 2^53, and the accepted values 0, `-0`, 1, 499, 500, and `payload_max`
   - in all 60 sampled states, every rejected payload on `ADD` and `SUB` changes nothing and `can` is false; `-0` acts as 0; `n` on `RESET`, `LOCK`, and `UNLOCK` is not read
   - a fuzz of 40,000 events, many with bad payloads or junk types, which checks that the count stays below 500 and that every context value is a safe integer

   JavaScript numbers are exact only for integers up to 2^53 − 1. `js_exact` proves that the machine stays in that range, so this is no longer an assumption. A getter or `Proxy` that returns a different `n` on each read could pass the schema and then give the guard a different value. The model does not cover this.
5. **`react/src/Counter.tsx`, React, and the browser.** The page shows `snapshot.context`, the `meta.locked` badge, and enables each button exactly when `snapshot.can(event)` holds. Its amount-field check is now needed only for usability: the cap no longer depends on it. `tests/browser/counter.spec.ts` has 7 tests. One of them forces the disabled `+100` button back on at 490 and clicks it: the machine's guard rejects the event, so the cap holds even when the UI is wrong.

### Negative controls

| mutation | caught by |
| --- | --- |
| machine guard `<` → `≤` in Rocq | `step_correct` fails |
| spec allows reaching 500 (`ltb` → `leb`) | `update_inv` fails |
| printer prints `<` as `<=` | 3 of 5 Node tests fail, including the fuzz |
| printer drops `Math.max` from subtraction | **not caught**. The `SUB` guard means subtraction never goes below zero in this machine, so the difference cannot be observed here. |
| printer drops the schema check from guards | 3 of 6 payload tests fail, including the fuzz |
| printer drops `.min(0)` or `.int()` from the schema | 4 of 6 payload tests fail |
| printer prints a larger bound (2^53 − 1) | the schema-verdict test fails |
| `accepts` always returns true | 3 of 6 payload tests fail |
| `payload_max` one too large (`payload_max + 500 = 2^53`) | `payload_max_safe` fails |
| `admits` ignores the bound | `step_exact` fails |
| `RESET` (a `PNone` type) reads `n`, or `SUB` is declared `PNone` | `counter_wf` fails |

## Foldkit backend: the counter, saved

[Foldkit](https://foldkit.dev) is an Elm-style framework on Effect. An app is a `Model` Schema, a union of `Message`s, a function `update(model, message) → { model, commands }`, and a `view`. The runtime folds every message through `update`, and it runs each command, an Effect, whose result comes back as another message. So the app's state is `fold_left update messages init`. That is a plain function, which is closer to the Rocq model than an XState actor is.

This port runs the same counter, plus one feature the XState page lacked: every accepted change is saved to `localStorage`, and the app restores the saved state when it starts. The cap now has to hold whatever the store holds, including values written by another tab or by hand.

### The model (`theories/Fold.v`)

`Fold.v` models the subset of Foldkit that the printer emits:

- **Model.** Boolean fields (`m_flags`), natural-number fields (`m_nums`), optional numbers (`m_opts`, `null` or a number), and lists of `{ id, label }` records (`m_lists`). Each number, list ids included, has a Schema maximum (`p_max`). The list port added the last two; see "Foldkit backend: the list".
- **Messages.** Each tag has a payload schema, as in `XStateCtx.v`: `PNone`, or `PNat max` for one integer field `n` with `0 ≤ n ≤ max`.
- **Update.** A table from tag to clauses. The first clause whose flag conditions, guard, and option and list conditions hold fires: it sets some flags, assigns some numbers (in `XStateCtx.v`'s expression language), sets optional numbers, replaces lists, and may issue the one command, "save the `p_saved` fields of the new model under `p_key`". A message that fails its schema, or that no clause fires for, leaves the model unchanged and issues no command. `f_can` says whether a message would fire.
- **Restore.** Fields of every kind can be saved. `decode_saved` reads a stored JSON value as a record of the saved fields. It needs a JSON object with a boolean for each saved flag, a natural number for each saved number, `null` or a natural number for each saved optional number, and an array of `{ id, label }` objects (natural-number `id`, string `label`) for each saved list. It drops other keys, in the object and in each item. `restore` then keeps the record only if it `fits`: every number is within its maximum, each list's ids are unique and its labels are safe characters (printable ASCII other than `"` and `\`), and every reference in `p_refs` holds (an optional number that, when set, is the id of an item of a given list). Then it spreads the record over the initial model.

`f_run` is `fold_left` of `f_update`, and `f_cmds` lists the commands issued along a run.

`Fold.v` also proves one theorem for every program, `fold_keeps`. A property `P` of the model holds after any messages, from anything `restore` returns, if two things hold:

- **`keeps P p`.** Each clause keeps `P`: if `P` holds, the clause fires, and the payload fits its tag's Schema, then `P` holds after the clause.
- **`restores P p`.** `P` holds for the initial model, and for the initial model with any fitting stored record spread over it. `restores_fits` reduces this to "every model that fits the Schema maxima satisfies `P`".

The obligations are about one clause at a time. They never mention unknown tags, payloads the Schema rejects, or which clause the tag picks first, because `f_update` either changes nothing or applies a clause that fired. `fold_saves_keep` gives the same for every save issued along the run. `fold_fields` is an invariant with no obligations: every run keeps the model's field names.

### The program (`theories/CounterFold.v`)

The model is `{ locked, amountOk, count, changes, amount }`. The amount field's state is now part of the model: `amount` is the last valid amount typed, and `amountOk` says whether the field holds one now. In the React page, that state lived in the component.

```coq
Definition counter_program : program :=
  mkProgram
    (mkModel [("locked", false); ("amountOk", true)]
             [("count", 0); ("changes", 0); ("amount", 250)])
    [("count", N.of_nat (limit - 1)); ("changes", max_safe); ("amount", payload_max)]
    ["locked"; "count"; "changes"]
    "counter" "SaveCounter" "CompletedSaveCounter" "FailedSaveCounter"
    ...
    [("ClickedAdd",
      [mkClause [("locked", false)] (GLt (EAdd (EVar "count") EArg) (ENum limit)) []
         [("count", EAdd (EVar "count") EArg); ("changes", EAdd (EVar "changes") (ENum 1))] true]);
     ...
     ("ChangedAmount", [mkClause [] GTrue [("amountOk", true)] [("amount", EArg)] false]);
     ("ClearedAmount", [mkClause [] GTrue [("amountOk", false)] [] false])].
```

`FoldTs.v` prints it as a TypeScript module (142 lines). `count`'s Schema maximum is 499, so `Model` itself says the cap:

```ts
export const Model = Schema.Struct({
  locked: Schema.Boolean,
  amountOk: Schema.Boolean,
  count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 499 })),
  changes: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9007199254740991 })),
  amount: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 999999999999999 })),
});

export const restore = (stored: string | undefined): Model =>
  Option.match(Schema.decodeUnknownOption(SavedJson)(stored), {
    onNone: () => initialModel,
    onSome: (saved) => ({ ...initialModel, ...saved }),
  });

const fire = (model: Model, message: Message): Return<...> | undefined => {
  switch (message._tag) {
    case "ClickedAdd": {
      if (!Schema.is(Message.ClickedAdd)(message)) return undefined;
      const n = message.n;
      if ((model.locked === false) && ((model.count + n) < 500)) {
        const next: Model = { locked: model.locked, amountOk: model.amountOk,
                              count: (model.count + n), changes: (model.changes + 1), amount: model.amount };
        return { model: next, commands: [SaveCounter({ locked: next.locked, count: next.count, changes: next.changes })] };
      }
      return undefined;
    }
    ...
    default:
      return undefined;
  }
};

export const update = (model, message) => fire(model, message) ?? { model, commands: [] };
export const can = (model, message) => fire(model, message) !== undefined;
```

`SaveCounter` is a `Command.define` whose Effect encodes its argument with `Schema.fromJsonString(Saved)` and writes it under `"counter"` in the `KeyValueStore`. It returns `CompletedSaveCounter`, or `FailedSaveCounter` on any error. `flags` is the Effect that reads the store at start-up and calls `restore`. If the read fails, it returns `initialModel`.

`foldkit-web/src/main.ts` (90 lines) is the view and the `Runtime.makeApplication` call, with `BrowserKeyValueStore.layerLocalStorage` as the store. It renders the same DOM as the React page, so `counter.spec.ts` runs against both. It enables each button exactly when `can(model, message)` holds. It decides one thing itself: input of 1 to 15 digits becomes `ChangedAmount`, and anything else becomes `ClearedAmount`.

### Proving the cap

The cap is `fold_keeps` with `P` = "`count` < 500":

```coq
Definition below_cap (m : fmodel) : Prop := num m "count" < limit.

Lemma keeps_below_cap : keeps below_cap counter_program.
Proof. keeps_nums below_cap. all: unfold limit in *; lia. Qed.

Lemma restores_below_cap : restores below_cap counter_program.
Proof.
  apply restores_fits; [reflexivity |]. intros m H.
  pose proof (num_le_max counter_program m "count" _ H eq_refl).
  unfold below_cap, limit in *. lia.
Qed.

Theorem fold_below_cap st msgs :
  below_cap (f_run counter_program (restore counter_program st) msgs).
Proof. apply fold_keeps; [exact keeps_below_cap | exact restores_below_cap]. Qed.
```

`keeps_nums` (in `Fold.v`) splits `keeps` into one goal per clause and computes what the clause does to the fields. Each goal becomes arithmetic on the old count `n`, the payload `arg`, and the guard. For example, `ClickedAdd` gives `n < 500`, `n + arg < 500 ⊢ n + arg < 500`, and `ClickedSubtract` gives `n < 500`, `arg ≤ n ⊢ n - arg < 500`. Each clause also gives a second goal for a model with no `count` field, where `count` reads as 0. `lia` proves all 14. For `restore`, the Schema maximum for `count` is 499.

A second invariant is about as short, with a 6-line proof. `fold_amount_fits` proves that `amount` stays within its maximum. That needs the payload bound: `ChangedAmount` sets `amount` to `n`, which the message Schema bounds, and `keeps_nums` passes that bound to each goal.

The obligations see the payload bound and the guard. They do not see the flag conditions (`locked = false`), so an invariant that depends on them needs more than `keeps_nums`.

`raw_message`, the case split over every tag and payload, is still needed for the refinement theorems (`fold_saves`, `fold_model_fits`), which speak about counter states, not one field.

### What is proved

As before, the proofs are symbolic. They cover every state, every payload, and every stored value. `enc s a ok` is the model for counter state `s`, amount `a`, and flag `ok`; `senc s` is the record the save command stores; `msg e` is the message the page sends for event `e`.

| theorem | statement |
| --- | --- |
| `update_correct` | for an amount at most `payload_max`, `f_update (enc s a ok) (msg e) = (enc (update s e) a ok, if enabled s e then [senc (update s e)] else [])`: `update` is `Counter.update`, and it saves exactly when the event is enabled |
| `can_correct`, `run_correct` | `f_can (enc s a ok) (msg e) = enabled s e`; every run of page messages tracks `run` |
| `raw_message` | any message, with any tag and any payload, either changes only the amount field (to a valid amount) and saves nothing, or is an enabled counter event, applied and saved |
| `restore_enc` | whatever the store holds (nothing, or any JSON value), `restore` gives `enc s 250 true` for a state `s` with `count s < 500` |
| `fold_below_cap`, `saves_below_cap` | for every stored value and every list of messages, `count < 500` after the run, and in every save issued along it. These are `fold_keeps` and `fold_saves_keep` |
| `fold_amount_fits` | likewise, `amount` stays at most `payload_max` |
| `fold_count_below_limit` | `f_run (restore st) msgs` encodes a state with `count < 500`: `fold_below_cap` and `fold_fields` |
| `fold_saves` | every save issued along a run stores `senc s'` for a state with `count s' < 500`, and `changes` grows by at most one per message |
| `save_restore`, `saves_restore` | a save restores to the state it saved; so on runs of fewer than 2^53 − 1 messages, everything the app saves restores to what it saved |
| `fold_model_fits` | on runs of fewer than 2^53 − 1 messages, the model is a value of the printed `Model` Schema |
| `fold_exact`, `init_exact`, `restored_exact` | on those runs, from the initial or a restored model, every number the printed `update` computes is a safe integer |
| `counter_wf` | `fwfb`: names are identifiers that clash with nothing the module defines or with names Effect reserves on a tagged union; tags start with an uppercase letter; every field has a maximum within `max_safe`, and the initial model fits; clauses read and write only declared fields; `PNone` tags do not read `n`; the save command's result messages are distinct `PNone` tags |
| `update_rejected`, `update_no_clauses`, `fits_spec` | general `Fold.v` facts: a rejected payload or an unhandled tag changes nothing; what `fits` checks |
| `fold_keeps`, `fold_saves_keep`, `run_keeps`, `cmds_keep` | general `Fold.v` facts: if every clause keeps `P` and `restore` gives it, then `P` holds after every run, and of the model behind every save |
| `fold_fields` | for every program, every run from `restore` keeps the model's field names |
| `counter_fold_oracle_safe` | every JSON string in the oracle needs no escaping |

### Trust boundary for this path

1. **The Rocq kernel, extraction, OCaml, and `foldkit/emit.ml`** (27 lines). These are the same as for the other paths.
2. **The printer** `FoldTs.v`, about 200 lines. It relies on `fwfb`, so names print unquoted and inside double quotes without escaping. Expressions are fully parenthesized. `EArg` is `n`, read from the message only for `PNat` tags, and `ESub` is `Math.max(0, a - b)`. `pnpm exec tsc -p foldkit-web` type-checks the printed module against Foldkit's and Effect's types.
3. **The Foldkit model.** The runtime must fold each message through `update` and render `view` of the current model. It must run each command's Effect, dispatch the result message, and start from `flags`. This is not proved. `tests/foldkit/program.test.mjs` (6 tests) checks the printed `update`, `can`, and `restore` under the pinned Effect and Foldkit against an oracle computed in Rocq from `f_update`, `f_can`, and `restore`. `CounterFold.v` proves that those agree with `Counter.v`. The test runs:
   - 4,080 sampled steps: 60 counter states × 2 amount-field states × 34 messages. The messages include amounts around the cap, missing payloads, payloads on `PNone` tags, command results, and unknown tags. Every result model must fit `Model`, and every command must fit `Saved`.
   - 20 pseudo-random 60-message traces generated in Rocq
   - 73 stored JSON values, through `restore`
   - bad stored text: not JSON, `NaN`, fractions, negatives, `1e300`, strings, `null`, and `changes` = 2^53
4. **Effect 4.0.0 Schema, and the readings of JavaScript values.** A payload is read as in `XStateCtx.v`: a number that is a non-negative integer is `PayNat` (`-0` is 0), and anything else is `PayOther`. Stored text is read as `option json` with natural numbers only. Text `JSON.parse` rejects is `None`. A number that is not a non-negative integer is rejected like any mistyped field. Integers above 2^53 − 1, which `JSON.parse` may round, are above every field's maximum, so `fits` rejects them either way. A duplicate key takes its last value, as `JSON.parse` does. `tests/foldkit/boundary.test.mjs` (9 tests) checks this:
   - the Schema verdicts for 28 payload values, on all 9 tags
   - in all 120 sampled models, every rejected payload changes nothing and makes `can` false; `-0` acts as 0; `n` on `PNone` tags is not read
   - a 40,000-message fuzz with junk tags (`toString`, `__proto__`) and bad payloads, from random restored states. It checks that `count` stays below 500, that the model fits `Model`, and that every save holds the model's saved fields.
   - the save command against a fake `Storage`: what it writes, `restore` reads back; a failing store gives `FailedSaveCounter`, and `flags` falls back to the initial model
5. **The store.** This is `BrowserKeyValueStore.layerLocalStorage` from `@effect/platform-browser` 4.0.0, and the browser's `localStorage`. `restore_enc` covers whatever is in the store at start-up. The page reads the store only then, and does not listen for writes from other tabs, so two tabs each keep their own count, and the last save wins. The model says nothing about the order in which saves land. Foldkit 0.168.0 forks each command in its own microtask, in issue order (`forkCommand` in `dist/runtime/runtime.js`), and each save is a short synchronous Effect, so in practice the last save issued is the last written. That is trusted, not modeled. The browser tests check it after bursts of clicks.
6. **`foldkit-web/src/main.ts`, Foldkit's renderer, Vite, and the browser.** `counter.spec.ts` (7 tests) and `counter-saved.spec.ts` (4 tests) run against the built page:
   - accepted clicks are saved as `{"locked":true,"count":110,"changes":2}`, and a reload restores them
   - the amount field is not saved
   - six bad stored values are ignored at start-up
   - a disabled button forced back on and clicked changes nothing, so the next save follows the last accepted one
7. **Two limits of the model.** These are the same as on the XState path:
   - A getter or `Proxy` that returns a different `n` on each read could pass `Schema.is` and then give the guard a different value.
   - `fold_model_fits` and the exactness theorems need `changes` plus the number of messages to stay below 2^53 − 1. `restore` accepts any stored `changes` up to 2^53 − 1. From there, the next accepted change makes `changes` 2^53, outside `Model`. That save is then rejected at the next start-up, which falls back to the initial model. The cap does not depend on this: `fold_count_below_limit` has no length condition.

### Negative controls

Each mutation of the printed module was made on a copy, and the Node tests were run on it with `FOLDKIT_OUT` pointing at the copy. An unmodified copy passes all 15.

| mutation | caught by |
| --- | --- |
| `ClickedAdd` guard `GLt` → `GLe` in `CounterFold.v` | `update_correct` fails |
| printed `ClickedAdd` guard `<` → `<=` | 3 of 15 Node tests fail |
| `Schema.is` check dropped from `ClickedSubtract` | 2 of 15 fail |
| `Model`'s `count` maximum 499 → 500 | 3 of 15 fail |
| save command writes another key | 1 of 15 fails |
| `ClickedReset` keeps `changes` | 3 of 15 fail |
| `ClickedUnlock` does not save | 4 of 15 fail |
| `restore` uses `JSON.parse` without the Schema | 4 of 15 fail |
| printed subtraction without `Math.max` | **not caught**, as on the XState path: the guard `n <= count` makes the difference unobservable |
| the view ignores `can` when enabling buttons | 9 of 11 Foldkit browser tests fail |

Three more mutations, made on copies of `counter_program` in a scratch file, check that the per-clause obligations catch a broken program and point at the clause that broke it:

| mutation | what `keeps_nums below_cap` and `lia` leave open |
| --- | --- |
| `ClickedAdd` guard `count + n < 500` → `count + n ≤ 500` | one goal, that clause's: `n < 500`, `n + arg ≤ 500 ⊢ n + arg < 500` |
| `ClickedReset` sets `count` to 500 | one goal, that clause's: `500 < 500` |
| `count`'s Schema maximum 499 → 500 | `keeps` still holds (no clause changed); `restores` fails, at `count ≤ 500 ⊢ count < 500` |

## Foldkit backend: the list

The counter was the only Foldkit program, and the question was whether `Fold.v` is a language or a counter in disguise. The list app from `ListUI.v` (select, delete the selected item, reset) is the second program. Its model is `{ selected: number | null, items: { id, label }[] }`, which the counter's booleans and numbers cannot hold.

Like the counter, the list is saved to `localStorage` after every accepted click and restored when the page starts. Validity must then hold for whatever the store holds: a stored list can repeat an id, select an id it does not contain, or hold any string as a label.

### What `Fold.v` gained

Two field kinds, four operations, and three checks on what a list may hold. Each prints to one line of TypeScript, and each is code the printer is trusted to get right, so the set is kept to what the list needs:

| `Fold.v` | printed by `FoldTs.v` |
| --- | --- |
| optional number field | `Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: max })))` |
| list field | `Schema.Array(Schema.Struct({ id: <Int 0..max>, label: <label> }))` with the unique-ids filter |
| labels are safe characters (`entries_ok`) | `<label>` is `Schema.String.check(Schema.isPattern(/^[\x20\x21\x23-\x5B\x5D-\x7E]*$/))` |
| ids are unique (`ids_unique`) | `.check(Schema.makeFilter((l) => l.every((it, i) => l.findIndex((o) => o.id === it.id) === i)))` |
| reference `(o, l)` in `p_refs` (`refs_ok`) | on `Saved`: `.check(Schema.makeFilter((saved) => (saved.o === null \|\| saved.l.some((it) => it.id === saved.o))))` |
| condition `CSet o` | `(model.o !== null)` |
| condition `CHas l e` | `model.l.some((it) => it.id === e)` |
| `ONull`, `OSome e` | `null`, `e` |
| `LLit l` | the array literal; `fwfb` requires every label to be safe inside double quotes |
| `LDrop o` | `model.l.filter((it) => it.id !== model.o)`, or the list unchanged if `o` is null |

Each check is there because `Valid` or the trusted reading of the store needs it:

- **Unique ids.** `Valid` requires them, and nothing else stops a stored list from repeating one. The filter is on `Model`, so `fold_model_fits` also says the model never has a repeated id.
- **The reference.** `Valid` requires the selection, if any, to be one of the ids. That relates two fields, so it is a filter on `Saved`, and `restore` checks it (`refs_ok`). `fwfb` requires both fields of a reference to be saved. `Model` has no such filter, so `fold_model_fits` does not say the selection is an id; `fold_valid` does.
- **Safe labels.** A stored label is a JavaScript string, a sequence of UTF-16 code units. Rocq's `string` is a sequence of bytes. The label pattern accepts only code units 32 to 126 other than `"` and `\`, which the two read the same way, so a label that passes is read exactly. The same characters also print inside double quotes without escaping, which the printer and the oracle rely on.

The list port took `Fold.v` from 597 to 773 lines and `FoldTs.v` from 199 to 269; saving lists took them to 877 and 296. `fold_keeps` and `update_cases` are unchanged in statement, and the counter's printed module and oracle are byte-identical to before both changes. The oracle encoders the two programs share are in `FoldOut.v`. A program that saves nothing still prints no store, no save command, and no `restore`, and its `flags` is `Effect.succeed(initialModel)`. Both programs now save, so nothing exercises that branch.

### The program (`theories/ListFold.v`)

```coq
Definition select_clause : clause :=
  mkClause [] GTrue [CHas "items" EArg] [] [] [("selected", OSome EArg)] [] true.
Definition delete_clause : clause :=
  mkClause [] GTrue [CSet "selected"] [] [] [("selected", ONull)] [("items", LDrop "selected")] true.
Definition reset_clause : clause :=
  mkClause [] GTrue [] [] [] [("selected", ONull)] [("items", LLit init_entries)] true.

Definition list_program : program :=
  mkProgram (mkModel [] [] [("selected", None)] [("items", init_entries)])
    [("selected", max_id); ("items", max_id)]   (* ids are at most 1000 *)
    ["selected"; "items"] [("selected", "items")]  (* both saved; the selection is an id of items *)
    "list" "SaveList" "CompletedSaveList" "FailedSaveList" []
    [("ClickedItem", PNat max_id); ("ClickedDelete", PNone); ("ClickedReset", PNone);
     ("CompletedSaveList", PNone); ("FailedSaveList", PNone)]
    [("ClickedItem", [select_clause]); ("ClickedDelete", [delete_clause]); ("ClickedReset", [reset_clause])].
```

The final `true` of each clause means "save". It prints as a 104-line module:

```ts
export const Model = Schema.Struct({
  selected: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))),
  // Ids are unique; labels are printable ASCII other than " and \.
  items: Schema.Array(
    Schema.Struct({
      id: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
      label: Schema.String.check(Schema.isPattern(/^[\x20\x21\x23-\x5B\x5D-\x7E]*$/)),
    }),
  ).check(Schema.makeFilter((l) => l.every((it, i) => l.findIndex((o) => o.id === it.id) === i))),
});

export const Saved = Schema.Struct({
  selected: Model.fields.selected,
  items: Model.fields.items,
}).check(Schema.makeFilter((saved) => (saved.selected === null || saved.items.some((it) => it.id === saved.selected))));

...
case "ClickedItem": {
  if (!Schema.is(Message.ClickedItem)(message)) return undefined;
  const n = message.n;
  if (model.items.some((it) => it.id === n)) {
    const next: Model = { selected: n, items: model.items };
    return { model: next, commands: [SaveList({ selected: next.selected, items: next.items })] };
  }
  return undefined;
}
case "ClickedDelete": {
  if (!Schema.is(Message.ClickedDelete)(message)) return undefined;
  if ((model.selected !== null)) {
    const next: Model = { selected: null, items: model.items.filter((it) => it.id !== model.selected) };
    return { model: next, commands: [SaveList({ selected: next.selected, items: next.items })] };
  }
  return undefined;
}
```

`SaveList`, `restore`, and `flags` are the counter's, with key `"list"`: `SaveList` encodes its argument with `Schema.fromJsonString(Saved)` and writes it, and `restore` decodes the stored text with the same Schema and spreads it over `initialModel`.

`foldkit-web/src/list.ts` (79 lines) renders the same markup as the jsoo and React pages, so `list.spec.ts` runs against all three. A row sends `ClickedItem({ n: id })`, and Delete is enabled exactly when `can(model, ClickedDelete())` holds. Its `makeApplication` call adds `BrowserKeyValueStore.layerLocalStorage` as the store, as the counter page does.

### Proving restore

`fits_state s` is `Valid s /\ ids_fit s /\ labels_ok s`: the ids are distinct, the selection is one of them, every id is at most 1000, and every label is safe. Restoring has three parts:

```coq
Lemma fits_enc sm :
  fits list_program sm = true ->
  exists s, merge (p_init list_program) sm = enc s /\ sm = enc s /\ fits_state s.

Theorem restore_valid st : exists s, restore list_program st = enc s /\ fits_state s.

Theorem save_restore s : fits_state s -> restore list_program (Some (enc s)) = enc s.
```

`fits_enc` reads a stored record that `fits` as a list state. Each conjunct of `fits` gives one part of `fits_state`: `ids_unique` gives `NoDup` of the ids, `refs_ok` gives the selection, the maxima give `ids_fit`, and `entries_ok` gives `labels_ok`. With `restore_valid`, whatever is stored, the app starts from a state that fits. `save_restore` is the converse: such a state, saved, passes every check and comes back unchanged.

Dropping the reference from `list_program` (`p_refs = []`) breaks the build in `fits_enc`, where the selection can no longer be shown to be an id. Making select not save (`false`) breaks it in `clause_event`, which now says every clause saves.

### Proving validity

The invariant is "this model encodes a state that fits", and it is one use of `fold_keeps`:

```coq
Definition good (m : fmodel) : Prop := exists s, m = enc s /\ fits_state s.

Lemma clause_good sch c :
  c = select_clause \/ c = delete_clause \/ c = reset_clause -> clause_keeps good sch c.
Proof.
  intros Hc m arg _ [s [-> Hs]] F.
  destruct (clause_event s arg c Hc F) as [_ [e ->]]. exists (update s e).
  split; [reflexivity | apply update_fits_state, Hs].
Qed.

Lemma keeps_good : keeps good list_program.
Proof. unfold keeps. split_keeps; apply clause_good; auto. Qed.

Lemma restores_good : restores good list_program.   (* the initial state, and fits_enc *)
```

`clause_event` says that a clause that fires on `enc s` saves, and does what some `ListUI` event does. From there, the proof of `Valid` is the one `ListUIProofs.v` already has (`update_preserves_validity`). It was not re-proved for Foldkit. `update_ids_fit` and `update_labels_ok` add that `update` keeps ids within 1000 and labels safe: it only drops items or puts back the three starting ones. `keeps_nums` does not apply here: it computes numbers, and this invariant is about lists.

### What is proved

`enc s` is the model for list state `s`, and `msg e` is the message the page sends for event `e`. `ids_fit s` says every id is at most 1000, the Schema maximum.

| theorem | statement |
| --- | --- |
| `update_correct` | if `ids_fit s`, then `f_update (enc s) (msg e) = (enc (update s e), if enabled s e then [enc (update s e)] else [])`: the program is `ListUI.update`, and it saves the new state exactly when the event is enabled |
| `can_correct`, `run_correct` | if `ids_fit s`, then `f_can (enc s) (msg e) = enabled s e`, and every run of page messages tracks `ListUI.run` |
| `can_delete` | in every state, `f_can (enc s) (msg DeleteSelected) = delete_enabled (view s)`: the Delete button is enabled exactly when `View.v` says |
| `raw_message` | any message, with any tag and any payload, either changes nothing and saves nothing, or applies some `ListUI` event and saves the new state |
| `restore_valid` | whatever the store holds (nothing, or any JSON value), `restore` gives `enc s` for a state `s` that fits: valid, ids at most 1000, safe labels |
| `save_restore` | a state that fits, saved, restores to itself |
| `restore_none`, `init_correct`, `saved_enc` | with nothing stored, the app starts from `enc initial`; the save command stores the whole model |
| `fold_run`, `fold_run_empty` | on page messages, the model is `enc (run s es)` from the state `s` it restored, and from `initial` when nothing is stored |
| `fold_valid` | for every stored value and every list of messages, the model is `enc s` for a state that fits: the ids are distinct and the selection is one of them |
| `fold_saves_restore` | every save issued along any run stores `enc s` for a state that fits, and restores to exactly what it saved |
| `fold_model_fits`, `fold_exact` | every model along any run is a value of the printed `Model` Schema, and every number the printed `update` computes is a safe integer. Unlike the counter, there is no bound on the run's length, because no number grows |
| `list_wf`, `list_fold_oracle_safe` | `fwfb list_program`; the oracle's strings need no escaping |

### Trust boundary for this path

The items are the counter's (above), with these differences:

1. **The printer** grew by the constructs in the table, and is now 296 lines. `pnpm exec tsc -p foldkit-web` type-checks the printed module.
2. **The Foldkit model.** `tests/foldkit/list.test.mjs` (13 tests) runs the printed module under the pinned Effect and Foldkit against an oracle that Rocq computes from `f_update`, `f_can`, and `restore`:
   - 450 sampled steps: the 20 reachable states and 5 odd ones (ids 0 and 1000, a repeated id, a selection not in the list) × 18 messages. The test checks that the samples include a delete that removes two copies of an id and a delete that removes nothing, and that the save-result tags never fire. Every result fits `Model`, except from the one sample with a repeated id, which does not fit it to begin with. From every sample that fits `Saved`, every save fits `Saved` and restores to itself.
   - 20 pseudo-random 60-message traces, which reach the empty list. Every save equals the new model and restores to it.
   - 51 stored JSON values through `restore`: the 20 reachable states, ids 0 and 1000, the empty list, a label of safe punctuation, reordered and extra keys (25 restore), and a selection not in the list, repeated ids, id 1001, missing or mistyped fields, and values that are not objects (26 fall back to the initial list)
3. **The reading of stored text.** The Rocq model reads stored text as `option json` with natural numbers and strings, and `fits` then checks the labels. The oracle cannot hold a bad label, because its printer does no escaping, so the Node tests check that reading directly:
   - 33 bad stored strings restore the initial list: text that is not JSON, fractional, negative, huge, or quoted numbers, a repeated id written `1` and `1.0`, and labels holding `"`, `\`, a newline, a tab, `\u0000`, `\u001f`, `\u007f`, `é` (precomposed, and escaped), an emoji, a lone surrogate, and `\u2028`
   - a valid save restores exactly its fields, with extra keys dropped at both levels; `1e1` reads as 10, `-0` as 0, and `\u0041` as `A`
   - the label pattern accepts exactly the 93 code units `safe_char` accepts, checked over every code unit from 0 to 0xFFFF
4. **The store.** The list page uses the same store as the counter, under key `"list"`, and the counter's notes on it apply: `restore_valid` covers whatever is in the store at start-up, the page reads it only then, and the order in which saves land is trusted, not modeled. The Node tests run the save command and `flags` against Effect's in-memory `KeyValueStore`: `flags` reads only `"list"`, a bad stored value gives the initial list, each save in three traces completes and then restores to the model it saved, and a save whose argument does not fit `Saved` gives `FailedSaveList` and writes nothing. `tests/browser/list-saved.spec.ts` (4 tests, Foldkit only) checks the page against `localStorage`:
   - selections, deletes, the empty list, and reset are saved in the program's form, and a reload restores them
   - 13 bad stored values are ignored at start-up and left in place until the next accepted click
   - a valid list written by hand, with extra keys, is restored, and the next save writes it back without them
   - a forced click on the disabled Delete button saves nothing
5. **The view is handwritten.** On the jsoo path, `View.v`'s `view` is extracted, and the row markup is proved. Here `list.ts` copies the model into the DOM itself. It decides two things: a row is selected when `model.selected === it.id` (`View.v`'s `is_selected`), and the empty message shows when `model.items.length === 0` (`show_empty_message`). The Delete button comes from `can`, which `can_delete` covers. `list.spec.ts` checks the rest in the browser.
6. **Rendering is asynchronous.** Foldkit dispatches in a microtask and renders in an animation frame, so the DOM can still show the previous model when a click returns. `list.spec.ts` retries every state check (`expect.poll`), and before a check that nothing changed it waits two frames, which would otherwise pass at once. The jsoo and React pages pass the same checks. A forced-enabled button stays enabled after a rejected click, because the model does not change and nothing re-renders, so `list-saved.spec.ts` checks the rows and the store there instead.
7. **Detached buttons.** The virtual DOM removes a destroyed element's listeners, so a click on a retained button for a deleted row reaches nothing, as on React. The absent-id case is covered by the Node tests and by `update_correct` instead. A retained button for a row that still exists is the same element, since rows are keyed by id, and it selects normally.

### Negative controls

Each printed-module mutation was made on a copy and run with `FOLDKIT_OUT` pointing at it. An unmodified copy passes all 13 Node tests. The view mutations were made on `list.ts`, rebuilt, and run against the 13 Foldkit list browser tests (`list.spec.ts` and `list-saved.spec.ts`), which all pass unmodified.

| mutation | caught by |
| --- | --- |
| `select_clause` without `CHas` in `ListFold.v` | the build: `select_fires` fails |
| `delete_clause` without `CSet` | the build: `delete_fires` fails |
| `select_clause` does not save | the build: `clause_event` fails |
| `p_refs = []` (no reference) | the build: `fits_enc` fails |
| printed `ClickedItem` without the `.some` membership test | 3 of 13 Node tests fail |
| `.filter` keeps the selected id instead of dropping it | 2 of 13 |
| `.filter` drops only the first item with the id | 1 of 13 (the repeated-id sample) |
| `ClickedDelete` without its `!== null` guard | 2 of 13 |
| delete keeps `selected` | 3 of 13 |
| reset keeps `selected` | 2 of 13 |
| `Schema.is` check dropped from `ClickedItem` | 1 of 13 |
| item ids' Schema maximum 1000 → 1001 | 2 of 13 |
| `Saved` without the reference filter | 3 of 13 |
| `Model` without the unique-ids filter | 6 of 13 |
| label pattern loosened to `/^[\x20-\x7E]*$/` | 4 of 13 |
| label is any string | 4 of 13 |
| label pattern without its anchors | 4 of 13 |
| the save writes another key | 1 of 13 |
| `flags` reads another key | 1 of 13 |
| delete does not save | 2 of 13 |
| select saves the old model | 3 of 13 |
| `restore` uses `JSON.parse` without the Schema | 4 of 13 |
| `restore` spreads `initialModel` over the save instead | 5 of 13 |
| membership `===` → `==` | **not caught**: the Schema has already made `n` an integer, and ids are integers, so the two agree |
| the view enables Delete regardless of `can` | 9 of 13 Foldkit list browser tests fail |
| the view never shows the empty message | 2 of 13 |
| the view highlights the first row whenever any row is selected | 2 of 13 |

## Writing apps in `.fold`

Before this, each Foldkit program was a Rocq term written by hand (`theories/CounterFold.v`, `theories/ListFold.v`). Now both apps are written in `.fold` files (`foldkit-web/src/counter.fold`, `foldkit-web/src/list.fold`), which use a small TypeScript-flavored syntax. An untrusted builder in `fold/` turns each file into a `.v` file. Rocq then checks the program's well-formedness (`fwfb`), proves every invariant the file states, and prints the TypeScript module. The pages import that module directly: `import { Message, update } from "./counter.fold"`.

There are three ways to build a `.fold` file, and all of them go through Rocq:

| path | what runs | what fails |
| --- | --- | --- |
| `make fold` (also part of `make build`) | dune generates `fold/apps/CounterApp.v` and `ListApp.v` and compiles them with `AppsSame.v` | a proof, `fwfb`, or a program that differs from the hand-written one |
| `make foldkit-web` | the Vite plugin `fold/vite.mjs` runs the strict build for each imported `.fold` file and bundles the TypeScript Rocq printed | a proof or `fwfb`; the build error lists the diagnostics |
| `tsc` 7.1 or an editor on TypeScript 7.1 | the content mapper `fold/mapper` runs the soft build and returns the printed module as the file's TypeScript | nothing fails; failed proofs show up as errors on the rule that breaks them |

### The language

```ts
export const limit = 500;
const payloadMax = 999_999_999_999_999;

model {
  saved locked: boolean = false;
  saved count: Nat<limit - 1> = 0;
  amount: Nat<payloadMax> = 250;
  // ...
}

store "counter" { save: SaveCounter; done: CompletedSaveCounter; failed: FailedSaveCounter; }

on ClickedAdd(n: Nat<payloadMax>) {
  if (!model.locked && model.count + n < limit) {
    next.count = model.count + n;
    save();
  }
}

invariant belowCap: model.count < limit;
```

| construct | meaning in `Fold.v` |
| --- | --- |
| `const x = …;`, `export const x = …;` | A number (`+ - *` of numbers and earlier constants) or a list of `{ id, label }` items. Exported numbers are printed as `export const`. |
| `model { … }` | The fields and their initial values. Fields marked `saved` are written by the save command and read back by `restore`. |
| field types | `boolean`; `Nat` or `Nat<max>`, optionally `\| null`; `Item<max>[]` (`{ id, label }` items with ids at most `max`); `IdOf<list> \| null` (an id of an item in `list`, saved together with it). |
| `store "key" { save: …; done: …; failed: …; }` | The `localStorage` key, the save command's name, and its two result messages. |
| `on Tag(n: T) { … }` | A message and its payload Schema: `Nat`, `Nat<max>`, or `IdOf<list>`. The body is statements, or an `if` / `else if` / `else` chain. Each branch is one clause. |
| statements | `next.field = …;` and `save();`. A field a branch does not set keeps its value. |
| conditions | `&&`, `!`, the comparisons `< <= > >= === !==` on number expressions, boolean fields, `model.x !== null`, and `model.items.some((it) => it.id === e)`. |
| number expressions | Numbers, constants, `n`, `model.field`, `+`, and `Math.max(0, a - b)`. Plain `a - b` is rejected because subtraction stops at 0 in the model, and the printed code does the same. |
| list updates | A list constant, or `model.items.filter((it) => it.id !== model.selected)`. A callback's parameter may have any name except `model`, `next`, the message parameter, or a constant, since those would hide the outer name. |
| `invariant name: …;` | A condition over the boolean and number fields. Rocq proves that it holds after any messages, from any stored value. |

Rules that may surprise:

- **The payload parameter is named `n`.** The printed message is `Message.Tag({ n })`, so `on ClickedItem(id: …)` is rejected with a message that says so.
- **There is no `||`.** A clause's guard is a conjunction, so use `else if` branches instead.
- **Each branch is proved on its own.** A branch's proof assumes its own condition, but not that the earlier conditions failed. The diagnostic for a later branch says so.
- **Invariants are about boolean and number fields only.** The list's validity (distinct ids, the selection names an item) is still proved in `ListFold.v`. `list.fold` states no invariant; `AppsSame.v` connects it to those theorems.

The builder rejects anything `Fold.v` cannot express. It reports the error on the offending span with a message in `.fold` terms, before Rocq runs (codes 1 and 2 below).

### The builder (`fold/`)

| file | lines | role |
| --- | --- | --- |
| `fold/src/lex.mjs`, `parse.mjs` | 90, 378 | tokens, and a syntax tree with source spans |
| `fold/src/check.mjs` | 557 | the program: fields, Schemas, clauses, and the invariants as Rocq propositions |
| `fold/src/emit-v.mjs` | 225 | the generated `.v` file, strict or soft |
| `fold/src/rocq.mjs` | 109 | runs `rocq c` on it and reads back what Rocq printed |
| `fold/src/diagnose.mjs` | 115 | soft-build results as diagnostics in `.fold` terms |
| `fold/src/mappings.mjs` | 85 | span mappings from the printed TypeScript back to the source |
| `fold/src/index.mjs` | 87 | `build` (to `.v`), `analyze` (soft), and `compile` (strict) |
| `fold/bin/foldc.mjs` | 98 | the command line |
| `theories/FoldAuto.v` | 164 | the generic theorems and tactics the generated proofs use |

The generated file defines one `clause_<Tag>_<i>` for each branch, the program `app`, the printed module `ts := ts_module header app`, and a `Q_<name>` for each invariant. Then it proves:

- `wf : fwfb app = true`, by `vm_compute`.
- For each invariant and each clause, `keeps_<inv>_<Tag>_<i>`: the clause keeps the invariant. The proof uses `clause_start` from `FoldAuto.v`, a case split, and `lia`.
- `init_<inv>` and `stored_<inv>`: the invariant holds for the initial model, and for whatever `restore` accepts.
- From those, through `fold_holds` and `fold_holds_saves` in `FoldAuto.v`:

```coq
Theorem belowCap_always st msgs : Q_belowCap (f_run app (restore app st) msgs).
Theorem belowCap_saves st msgs c :
  In c (f_cmds app (restore app st) msgs) -> exists m, Q_belowCap m /\ c = saved app m.
```

The strict build (dune, the Vite plugin, and `foldc ts`) ends every lemma in `Qed`, so one failed proof fails the build. The soft build is for diagnostics only. It tries every obligation. When `lia` fails, `fold_report` prints the goal that is left and its hypotheses. Every lemma ends in `Admitted`, and nothing built from the soft file is ever bundled.

`fold/bin/foldc.mjs` is the command line:

```sh
node fold/bin/foldc.mjs v foldkit-web/src/counter.fold           # the generated .v (--soft for the soft one)
node fold/bin/foldc.mjs ts foldkit-web/src/counter.fold          # strict build; print the TypeScript
node fold/bin/foldc.mjs check foldkit-web/src/*.fold             # diagnostics, as tsc prints them; exit 1 on any
```

`FOLD_ROCQ` and `FOLD_THEORIES` override the default paths, `./_opam/bin/rocq` and `./_build/default/theories`.

### Diagnostics

| code | meaning | reported on |
| --- | --- | --- |
| 1 | the file does not parse | the token |
| 2 | `Fold.v` cannot express it (e.g. `a - b`, `\|\|`, an unknown field, a parameter not named `n`) | the offending span |
| 3 | an invariant might not hold after a branch | the branch's `if (…)`, or the rule's name if it has no condition |
| 4 | an invariant fails for the initial model, or might fail for a stored value | the invariant's name |
| 5 | `fwfb` rejects the program (a builder bug: its own checks should catch this first) | the start of the file |
| 6 | Rocq itself failed | the start of the file |
| 7 | a bad content-mapper option | `tsconfig.json` |

A failed proof is shown as the goal `lia` was left with, translated back into `.fold` terms. Here it is for `tests/fold/fixture/src/level.fold`, whose guard is off by one:

```
tests/fold/fixture/src/level.fold:11:3 - error fold3: belowCap might not hold after this branch of Raised. Rocq's lia could not prove it, with model as it was before the message:
  needs:  (model.level + n) < 10
  knows:
    model.level + n <= 10   (the condition)
    model.level < 10   (belowCap before)
    n <= 10   (the parameter's Schema)

11   if (model.level + n <= cap) {
     ~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

`tsc` 7.1 prints this, and `foldc check` and the Vite plugin print the same message. A failed init proof does not also report the stored proof for the same invariant. With nothing saved, `restore` returns the initial model, so the stored failure would only repeat it.

### The content mapper (`fold/mapper`)

TypeScript 7.1 (in beta, `typescript@7.1.0-beta`) adds `contentMappers` ([microsoft/TypeScript#63800](https://github.com/microsoft/TypeScript/pull/63800)). A mapper is a process that turns a non-TypeScript file into TypeScript for the checker. `foldkit-web/tsconfig.json` registers `fold-content-mapper` (`fold/mapper`, linked in `package.json`) for `.fold`:

```jsonc
"contentMappers": [{ "package": "fold-content-mapper", "extensions": [".fold"] }]
```

`tsc` runs external code only with `--runExternalCode`, so the Makefile calls `node node_modules/typescript-7.1/bin/tsc -p foldkit-web --runExternalCode`. The plain `tsc` (7.0.2) is still used for `react/`.

`fold/mapper/server.mjs` (229 lines) speaks JSON-RPC over stdio (`initialize`, `openProject`, `transform`, `closeProject`):

- **`transform`** runs the soft build. It returns Rocq's printed module as the file's text (extension `.ts`), the span mappings, and the diagnostics. `main.ts` is type-checked against the exact module the Vite plugin bundles once the proofs pass.
- **When the file does not parse or check,** the last module printed for it stands in, unmapped. That way, the files that import it keep their types while you edit.
- **`openProject`** reads the options `rocq` and `theories` (paths relative to the tsconfig) and reports bad ones as code 7. Its `configIdentity` is a hash of the compiled theory and the builder's sources, and it returns both as `watchedFiles`. A rebuilt theory or an edited builder therefore invalidates every cached result.
- **Results are cached by content.** At most one Rocq runs per core. One analysis takes about 0.7 s for `counter.fold` and 0.4 s for `list.fold`.
- **Positions are in UTF-16,** or in UTF-8 when TypeScript offers only that.
- **Mappings:** names (constants, fields, messages, the store key) are Verbatim spans; conditions, branch bodies, and the save are Atoms; everything else is synthesized. They are what lets TypeScript place a position in the `.fold` file, for example for go-to-definition from `main.ts` (untested, since only the CLI was tried). Edits do not flow back through Atom spans.

**A failed proof hides semantic errors in other files.** `tsc` counts a mapper's diagnostics as syntactic errors, and, as with any syntax error, the CLI then skips the semantic pass. So while a `.fold` file has a failing proof, a type error in `main.ts` is not reported. It appears as soon as the proof goes through.

### What is proved

| theorem | statement |
| --- | --- |
| `CounterApp.wf`, `ListApp.wf` | `fwfb` accepts the programs the `.fold` files describe |
| `CounterApp.belowCap_always`, `amountFits_always` | the counter's two invariants hold after any messages, from any stored value |
| `CounterApp.belowCap_saves`, `amountFits_saves` | every save holds a model where they hold |
| `AppsSame.counter_same`, `list_same` | the programs are exactly `counter_program` and `list_program` (`reflexivity`) |
| `AppsSame.counter_ts_same`, `list_ts_same` | the printed modules are `ts_module` of those programs, so they differ only in the header line |

All ten are in `assumptions/Assumptions.v`, for 123 in all. Because of `AppsSame`, every theorem about `counter_program` and `list_program` in this document holds for the programs written in `counter.fold` and `list.fold`.

### Trust boundary for this path

- **The builder is not trusted for what runs.** Rocq prints the TypeScript from the same `app` term it checked, so the module that runs is the program the theorems are about, whatever the builder did.
- **The builder is trusted for what the program means to its author.** It decides how the source becomes `app`, and how each invariant becomes `Q_<name>`. A bug there would give correct proofs of something other than what the `.fold` file appears to say. For the two apps, `AppsSame` pins `app` to the hand-written programs. The invariants should be read in the generated file (`foldc v`). For the counter, `Q_belowCap` is `Z.of_nat (num m "count") < 500`.
- **The Vite plugin and the decoder are trusted:** that the string bundled is the string Rocq printed. `compile` returns text only when Rocq exits 0 on the strict file, and `tests/fold/builder.test.mjs` checks the result against the module dune extracts.
- **The content mapper is trusted for nothing.** Its output is a preview, and it may come from a file whose proofs fail (they are `Admitted` in the soft build).

### Tests

| file | checks |
| --- | --- |
| `tests/fold/builder.test.mjs` (8) | Seven kinds of bad source are rejected with the right code and span. A callback parameter that hides `model`, `n`, or a constant is rejected. `compile` on `counter.fold` and `list.fold` prints the modules dune extracts, apart from line 1. Both files check cleanly. A rule that can break an invariant is reported on its branch, with the goal. An invariant false at the start is reported once. The strict build refuses a failed proof. The span mappings are in range and do not overlap, and their Verbatim spans have the same text. |
| `tests/fold/mapper.test.mjs` (4) | The protocol, through a spawned `server.mjs`: the printed module, the mapping of each `case`, the code-3 diagnostic, the last-good fallback, option errors, and UTF-8 offsets. Then `tsc` 7.1 on `tests/fold/fixture`: exit 2, with the diagnostic at `level.fold(11,3)`. |
| `tests/fold/vite.test.mjs` (2) | The Vite plugin stops the fixture's build with the diagnostic. With the guard fixed, it bundles the printed module. |

`make test-fold` runs all three. `make foldkit-web` builds the real pages through the plugin, and the Playwright tests then run them.

### Limits

- TypeScript 7.1 and content mappers are in beta, and the protocol may change. Only the `tsc` CLI was tested, not an editor.
- Invariants cannot mention lists yet. Messages carry only numbers; there is no `||` and no multiplication in rules.
- Each analysis runs Rocq on the whole file (0.4 to 0.7 s for these two). Caching by content helps only with repeated contents.
- The mappings are line-based and recognize only the lines `FoldTs.v` prints. A change to the printer's layout can leave spans unmapped. That does not affect what is proved or bundled.

## Next experiment

See [REPORT.md](REPORT.md).
