// Checks the trusted steps of the Foldkit list: that the printed module
// (theories/FoldTs.v), run by the pinned Effect and Foldkit, behaves as
// theories/Fold.v's [f_update], [f_can], and [restore] say, and that its
// Schemas read numbers and labels the way the Rocq model does.
//
// The oracle is computed in Rocq from [list_program], and ListFold.v
// proves that program agrees with the list app's [update] (ListUI.v) and
// the Delete button's [delete_enabled] (View.v), and that whatever is
// stored restores to a valid state. So matching the oracle checks Effect,
// Foldkit, and the printer against the specification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Schema } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";

const dir = resolve(process.env.FOLDKIT_OUT ?? "_build/default/foldkit");
const program = await import(pathToFileURL(join(dir, "list.program.ts")).href);
const { Model, Saved, Message, initialModel, init, update, can, restore, flags } = program;
const oracle = JSON.parse(readFileSync(join(dir, "list.oracle.json"), "utf8"));
const { key, command, saved, tags, maxes, safeChars } = oracle.schema;

// A Return as plain data: the model, and each command's arguments.
const plain = ({ model, commands }) => ({
  model,
  commands: commands.map((c) => {
    assert.equal(c.name, command);
    return c.args;
  }),
});

// Runs [effect] against an in-memory store holding [entries].
const withStore = (entries, effect) =>
  Effect.runSync(
    Effect.gen(function* () {
      const store = yield* KeyValueStore.KeyValueStore;
      for (const [k, v] of Object.entries(entries)) yield* store.set(k, v);
      return yield* effect;
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  );

test("initial model", () => {
  assert.deepEqual(initialModel, oracle.init);
  assert.deepEqual(plain(init(initialModel)), { model: oracle.init, commands: [] });
  assert.ok(Schema.is(Model)(initialModel));
  assert.ok(Schema.is(Saved)(initialModel));
});

test("every sampled (model, message) step matches the Rocq oracle", () => {
  // 20 reachable states and 5 odd ones x 18 messages
  assert.equal(oracle.steps.length, 25 * 18);
  let saves = 0;
  let outside = 0;
  for (const { from, message, to, can: expected } of oracle.steps) {
    const label = `${JSON.stringify(from)} ${JSON.stringify(message)}`;
    assert.equal(can(from, message), expected, `can: ${label}`);
    const r = plain(update(from, message));
    assert.deepEqual(r, to, label);
    // The one sample with a repeated id is outside the Model Schema; from
    // every other, the model stays inside it.
    if (Schema.is(Model)(from)) assert.ok(Schema.is(Model)(r.model), `model fits its Schema: ${label}`);
    else outside++;
    // From a valid save, every save is valid and restores to itself
    // (ListFold.v, [fold_saves_restore]).
    if (Schema.is(Saved)(from)) {
      for (const args of r.commands) {
        assert.ok(Schema.is(Saved)(args), `command fits Saved: ${label}`);
        assert.deepEqual(restore(JSON.stringify(args)), args, `save restores: ${label}`);
        saves++;
      }
    }
  }
  assert.equal(outside, 18);
  assert.ok(saves > 100);
  // The samples must hit both sides of every condition, or this test proves little.
  const outcomes = new Set(oracle.steps.map((r) => `${r.message._tag} ${r.can}`));
  for (const tag of ["ClickedItem", "ClickedDelete"]) {
    assert.ok(outcomes.has(`${tag} true`) && outcomes.has(`${tag} false`), tag);
  }
  assert.ok(outcomes.has("ClickedReset true"));
  for (const tag of ["CompletedSaveList", "FailedSaveList", "Nope", "clickedItem", ""]) {
    assert.ok(outcomes.has(`${tag} false`) && !outcomes.has(`${tag} true`), tag);
  }
  // Deleting with a repeated id removes every copy; with a selection that
  // is not in the list it removes nothing.
  const deletes = oracle.steps.filter((r) => r.message._tag === "ClickedDelete" && r.can);
  assert.ok(deletes.some((r) => r.from.items.length - r.to.model.items.length === 2));
  assert.ok(deletes.some((r) => r.from.items.length > 0 && r.from.items.length === r.to.model.items.length));
});

test("pseudo-random traces match the Rocq oracle", () => {
  assert.equal(oracle.traces.length, 20);
  let emptied = 0;
  for (const { messages, results } of oracle.traces) {
    assert.equal(messages.length, results.length);
    let model = initialModel;
    messages.forEach((message, i) => {
      const r = plain(update(model, message));
      assert.deepEqual(r, results[i], `step ${i} ${JSON.stringify(message)}`);
      for (const args of r.commands) {
        assert.deepEqual(args, r.model, `the save is the new model: step ${i}`);
        assert.deepEqual(restore(JSON.stringify(args)), args, `save restores: step ${i}`);
      }
      model = r.model;
      if (model.items.length === 0) emptied++;
    });
  }
  // The traces must reach the empty list too.
  assert.ok(emptied > 0);
});

// ** Saving and restoring

test("restoring stored JSON matches the Rocq oracle", () => {
  assert.ok(oracle.restores.length > 50);
  let restored = 0;
  for (const { stored, model } of oracle.restores) {
    const label = JSON.stringify(stored);
    assert.deepEqual(restore(JSON.stringify(stored)), model, label);
    assert.ok(Schema.is(Model)(model) && Schema.is(Saved)(model), `restores a valid model: ${label}`);
    if (JSON.stringify(model) !== JSON.stringify(oracle.init)) restored++;
  }
  // Both outcomes must occur: some saves restore, some fall back.
  assert.ok(restored > 20 && restored < oracle.restores.length - 20);
});

// The Rocq model reads stored text as [option json], with natural numbers
// and strings of any characters. These check the reading that is trusted:
// anything that is not JSON is [None], a number that is not a
// non-negative safe integer is rejected like any other mistyped field, and
// a label is rejected exactly when one of its characters is not a
// [safe_char]. The oracle cannot hold such labels: its printer does no
// escaping.
const goodItems = '[{"id":1,"label":"A"},{"id":2,"label":"B"}]';
const withLabel = (json) => `{"selected":null,"items":[{"id":1,"label":${json}}]}`;
const badStored = [
  undefined, "", " ", "{", "nul", "undefined", "NaN", `{"selected":null,"items":${goodItems}`,
  `{"selected":1.5,"items":${goodItems}}`,
  `{"selected":-1,"items":${goodItems}}`,
  `{"selected":1e300,"items":${goodItems}}`,
  `{"selected":"1","items":${goodItems}}`,
  '{"selected":null,"items":[{"id":1.5,"label":"A"}]}',
  '{"selected":null,"items":[{"id":-1,"label":"A"}]}',
  '{"selected":null,"items":[{"id":9007199254740992,"label":"A"}]}',
  '{"selected":null,"items":[{"id":1,"label":"A"},{"id":1.0,"label":"B"}]}',
  withLabel('"a\\"b"'), withLabel('"a\\\\b"'), withLabel('"\\n"'), withLabel('"tab\\there"'),
  withLabel('"\\u0000"'), withLabel('"\\u001f"'), withLabel('"\\u007f"'), withLabel('"café"'),
  withLabel('"\\u00e9"'), withLabel('"\u{1F600}"'), withLabel('"\\ud800"'), withLabel('"\\u2028"'),
  "null", "[1]", "5", '"list"', "true",
];

test("stored text that is not a valid save restores the initial model", () => {
  for (const s of badStored) assert.deepEqual(restore(s), oracle.init, JSON.stringify(s));
});

test("a valid save restores exactly its fields; extra keys are dropped", () => {
  const max = Number(maxes.items);
  assert.deepEqual(restore(`{"selected":${max},"items":[{"id":${max},"label":"~ !"}],"x":1}`), {
    selected: max,
    items: [{ id: max, label: "~ !" }],
  });
  // 1e1 is [JNum 10]; an escaped printable character is that character.
  assert.deepEqual(restore('{"selected":1e1,"items":[{"id":10,"label":"\\u0041\\/","x":[]}]}'), {
    selected: 10,
    items: [{ id: 10, label: "A/" }],
  });
  // -0 is [JNum 0].
  const r = restore('{"selected":-0,"items":[{"id":0,"label":""}]}');
  assert.ok(r.selected === 0 && r.items[0].id === 0);
});

test("the label pattern accepts exactly the characters safe_char does", () => {
  assert.equal(safeChars.length, 126 - 32 + 1 - 2);
  const safe = new Set(safeChars);
  const fits = (label) => Schema.is(Model)({ selected: null, items: [{ id: 1, label }] });
  for (let c = 0; c <= 0xffff; c++) {
    assert.equal(fits(String.fromCharCode(c)), safe.has(c), `U+${c.toString(16)}`);
  }
  assert.ok(fits(""));
  assert.ok(fits(safeChars.map((c) => String.fromCharCode(c)).join("")));
  for (const label of ["\u{1F600}", "ok\n", "\nok", 'a"', "a\\"]) assert.ok(!fits(label), JSON.stringify(label));
});

test("start-up reads the store, and a save writes what restores", () => {
  // Nothing stored, or something that does not restore: the initial model.
  assert.deepEqual(withStore({}, flags), oracle.init);
  for (const s of badStored.filter((s) => s !== undefined)) {
    assert.deepEqual(withStore({ [key]: s }, flags), oracle.init, JSON.stringify(s));
  }
  // Another key is not read.
  assert.deepEqual(withStore({ counter: `{"selected":null,"items":[]}` }, flags), oracle.init);
  // Each save in a trace, run against a store, completes, and start-up
  // then restores exactly the model it saved.
  for (const { messages } of oracle.traces.slice(0, 3)) {
    let model = initialModel;
    for (const message of messages) {
      const r = update(model, message);
      for (const c of r.commands) {
        const [done, back] = withStore(
          {},
          Effect.gen(function* () {
            const done = yield* c.effect;
            return [done, yield* flags];
          }),
        );
        assert.equal(done._tag, "CompletedSaveList");
        assert.deepEqual(back, r.model);
      }
      model = r.model;
    }
  }
});

test("a save that does not fit Saved fails, and writes nothing", () => {
  const bad = [
    { selected: 9, items: [{ id: 1, label: "A" }] },
    { selected: null, items: [{ id: 1, label: "A" }, { id: 1, label: "B" }] },
    { selected: null, items: [{ id: 1, label: 'a"b' }] },
  ];
  for (const args of bad) {
    const [done, stored] = withStore(
      {},
      Effect.gen(function* () {
        const done = yield* program[command](args).effect;
        const store = yield* KeyValueStore.KeyValueStore;
        return [done, yield* store.get(key)];
      }),
    );
    assert.equal(done._tag, "FailedSaveList", JSON.stringify(args));
    assert.equal(stored, undefined, JSON.stringify(args));
  }
});

// ** The boundary: the reading of n as a [payload], and the Schemas.
const max = Number(maxes.selected);
const ABSENT = Symbol("absent");
const rejected = [
  ["absent", ABSENT], ["undefined", undefined], ["null", null],
  ["-1", -1], ["0.5", 0.5], ["1.5", 1.5], ["max + 0.5", max + 0.5],
  ["NaN", NaN], ["Infinity", Infinity], ['"1"', "1"], ['""', ""], ["true", true],
  ["[]", []], ["[1]", [1]], ["{}", {}], ["1n", 1n], ["new Number(1)", new Number(1)],
  ["max + 1", max + 1], ["2^53", 2 ** 53], ["1e300", 1e300],
];
const withN = (_tag, n) => (n === ABSENT ? { _tag } : { _tag, n });

test("the oracle's schema facts", () => {
  assert.equal(key, "list");
  assert.equal(command, "SaveList");
  assert.deepEqual(saved, ["selected", "items"]);
  assert.deepEqual(tags, {
    ClickedItem: "nat", ClickedDelete: "none", ClickedReset: "none",
    CompletedSaveList: "none", FailedSaveList: "none",
  });
  assert.deepEqual(maxes, { selected: "1000", items: "1000" });
  const item = (id) => ({ ...initialModel, items: [{ id, label: "X" }] });
  assert.ok(Schema.is(Model)({ ...initialModel, selected: max }));
  assert.ok(!Schema.is(Model)({ ...initialModel, selected: max + 1 }));
  assert.ok(!Schema.is(Model)({ ...initialModel, selected: -1 }));
  assert.ok(Schema.is(Model)(item(max)));
  assert.ok(!Schema.is(Model)(item(max + 1)));
  assert.ok(!Schema.is(Model)(item(1.5)));
  assert.ok(!Schema.is(Model)({ ...initialModel, items: [{ id: 1 }] }));
  // Ids are unique; labels may repeat.
  const two = (a, b) => ({ selected: null, items: [{ id: a, label: "X" }, { id: b, label: "X" }] });
  assert.ok(Schema.is(Model)(two(1, 2)));
  assert.ok(!Schema.is(Model)(two(1, 1)));
  assert.ok(!Schema.is(Model)({ selected: null, items: [1, 2, 3, 2].map((id) => ({ id, label: `L${id}` })) }));
  // Model allows any selection; Saved requires it to be one of the ids.
  const sel = (selected, ids) => ({ selected, items: ids.map((id) => ({ id, label: "X" })) });
  assert.ok(Schema.is(Model)(sel(9, [1])));
  assert.ok(!Schema.is(Saved)(sel(9, [1])));
  assert.ok(!Schema.is(Saved)(sel(0, [])));
  assert.ok(Schema.is(Saved)(sel(1, [1])));
  assert.ok(Schema.is(Saved)(sel(null, [])));
  assert.ok(!Schema.is(Saved)(two(1, 1)));
});

test("ClickedItem with an n that is not an integer in [0, max] changes nothing", () => {
  // From a model whose list holds that very value as an id (not a valid
  // model), so the membership test alone would accept it: only the
  // Message Schema can reject it.
  for (const [label, n] of rejected) {
    const message = withN("ClickedItem", n);
    const model = { selected: null, items: [{ id: n === ABSENT ? undefined : n, label: "X" }] };
    assert.ok(!Schema.is(Message.ClickedItem)(message), label);
    assert.equal(can(model, message), false, label);
    assert.deepEqual(plain(update(model, message)), { model, commands: [] }, label);
  }
});

test("ClickedItem accepts every integer in [0, max], and selects it when present", () => {
  for (const n of [0, -0, 1, 2, 3, max]) {
    const m = Message.ClickedItem({ n });
    assert.ok(Schema.is(Message.ClickedItem)(m), String(n));
    const model = { selected: null, items: [{ id: n, label: "X" }] };
    assert.equal(can(model, m), true, String(n));
    assert.equal(update(model, m).model.selected, n, String(n));
  }
});

test("delete and reset ignore any n", () => {
  const selected = { ...initialModel, selected: 2 };
  for (const [label, n] of [...rejected, ["1", 1]]) {
    assert.equal(can(selected, withN("ClickedDelete", n)), true, label);
    assert.equal(can(selected, withN("ClickedReset", n)), true, label);
  }
});
