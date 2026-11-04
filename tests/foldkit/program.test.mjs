// Checks the trusted steps of the Foldkit backend: that the printed module
// (theories/FoldTs.v), run by the pinned Effect and Foldkit, behaves as
// theories/Fold.v's [f_update], [f_can], and [restore] say.
//
// The oracle is computed in Rocq from [counter_program], and CounterFold.v
// proves that program agrees with the app's [update] and [enabled]
// (theories/Counter.v). So matching the oracle checks Effect, Foldkit, and
// the printer against the specification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Schema } from "effect";

const dir = resolve(process.env.FOLDKIT_OUT ?? "_build/default/foldkit");
const { Model, Saved, initialModel, init, update, can, restore } = await import(
  pathToFileURL(join(dir, "counter.program.ts")).href
);
const oracle = JSON.parse(readFileSync(join(dir, "counter.oracle.json"), "utf8"));

// A Return as plain data: the model, and each command's arguments.
const plain = ({ model, commands }) => ({
  model,
  commands: commands.map((c) => {
    assert.equal(c.name, oracle.schema.command);
    return c.args;
  }),
});

test("initial model", () => {
  assert.deepEqual(initialModel, oracle.init);
  assert.deepEqual(plain(init(initialModel)), { model: oracle.init, commands: [] });
  assert.ok(Schema.is(Model)(initialModel));
});

test("every sampled (model, message) step matches the Rocq oracle", () => {
  // 60 counter states x 2 amount-field states x 34 messages
  assert.equal(oracle.steps.length, 60 * 2 * 34);
  for (const { from, message, to, can: expected } of oracle.steps) {
    const label = `${JSON.stringify(from)} ${JSON.stringify(message)}`;
    assert.equal(can(from, message), expected, `can: ${label}`);
    const r = plain(update(from, message));
    assert.deepEqual(r, to, label);
    assert.ok(Schema.is(Model)(r.model), `model fits its Schema: ${label}`);
    for (const args of r.commands) assert.ok(Schema.is(Saved)(args), `command fits Saved: ${label}`);
  }
  // The samples must hit both sides of every guard, or this test proves little.
  const outcomes = new Set(oracle.steps.map((r) => `${r.message._tag} ${r.can}`));
  for (const tag of ["ClickedAdd", "ClickedSubtract", "ClickedReset", "ClickedLock", "ClickedUnlock"]) {
    assert.ok(outcomes.has(`${tag} true`) && outcomes.has(`${tag} false`), tag);
  }
  for (const tag of ["ChangedAmount", "ClearedAmount"]) assert.ok(outcomes.has(`${tag} true`), tag);
  for (const tag of ["CompletedSaveCounter", "FailedSaveCounter", "Nope", "clickedAdd", ""]) {
    assert.ok(!outcomes.has(`${tag} true`), tag);
  }
});

test("pseudo-random traces match the Rocq oracle", () => {
  assert.equal(oracle.traces.length, 20);
  for (const { messages, results } of oracle.traces) {
    assert.equal(messages.length, results.length);
    let model = initialModel;
    messages.forEach((message, i) => {
      const r = plain(update(model, message));
      assert.deepEqual(r, results[i], `step ${i} ${JSON.stringify(message)}`);
      model = r.model;
    });
  }
});

test("restoring stored JSON matches the Rocq oracle", () => {
  assert.ok(oracle.restores.length > 60);
  let restored = 0;
  for (const { stored, model } of oracle.restores) {
    assert.deepEqual(restore(JSON.stringify(stored)), model, JSON.stringify(stored));
    if (JSON.stringify(model) !== JSON.stringify(oracle.init)) restored++;
  }
  // Both outcomes must occur: some saves restore, some fall back.
  assert.ok(restored > 0 && restored < oracle.restores.length);
});

// The Rocq model reads stored text as [option json] with natural numbers
// only. These check the reading that is trusted: anything that is not JSON
// is [None], and a number that is not a non-negative safe integer is
// rejected like any other mistyped field.
test("stored text that is not a valid save restores the initial model", () => {
  const bad = [
    undefined, "", " ", "{", "nul", "undefined", "NaN", '{"locked":false,"count":1,"changes":1',
    '{"locked":false,"count":4.5,"changes":3}',
    '{"locked":false,"count":-1,"changes":3}',
    '{"locked":false,"count":1e300,"changes":3}',
    '{"locked":false,"count":"4","changes":3}',
    '{"locked":0,"count":4,"changes":3}',
    '{"locked":null,"count":4,"changes":3}',
    '{"locked":false,"count":4,"changes":9007199254740992}',
    '{"locked":false,"count":4,"changes":-0.5}',
    "null", "[1]", "5", '"counter"', "true",
  ];
  for (const s of bad) assert.deepEqual(restore(s), oracle.init, JSON.stringify(s));
});

test("a valid save restores exactly its fields; extra keys are dropped", () => {
  const max = Number(oracle.schema.maxes.changes);
  assert.deepEqual(restore(`{"locked":true,"count":499,"changes":${max}}`), {
    ...oracle.init, locked: true, count: 499, changes: max,
  });
  assert.deepEqual(restore('{"locked":false,"count":1e2,"changes":3,"amount":7,"amountOk":false,"x":1}'), {
    ...oracle.init, count: 100, changes: 3,
  });
  // -0 is [JNum 0]: the restored count is numerically 0.
  const r = restore('{"locked":false,"count":-0,"changes":0}');
  assert.ok(r.count === 0);
});
