// Checks the trusted steps at the JavaScript boundary of the Foldkit counter:
//
// - the reading of a message's n as a [payload] (XStateCtx.v): [PayNat n]
//   for a number that is a non-negative integer, [PayOther] for everything
//   else;
// - that the printed Message Schemas accept exactly what [f_admits]
//   accepts, and that a message that fails its Schema is ignored by
//   [update] and makes [can] false;
// - the save command: it stores what [restore] reads back, and turns a
//   store error into the failed message;
// - [flags], which reads the store at start-up and falls back to the
//   initial model.
//
// The schema facts (tags, bounds, key) come from the Rocq oracle, not from
// the printed module.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Schema } from "effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";

const dir = resolve(process.env.FOLDKIT_OUT ?? "_build/default/foldkit");
const program = await import(pathToFileURL(join(dir, "counter.program.ts")).href);
const { Model, Message, initialModel, update, can, restore, flags } = program;
const oracle = JSON.parse(readFileSync(join(dir, "counter.oracle.json"), "utf8"));

const { tags, key, command, payloadMax } = oracle.schema;
const max = Number(payloadMax);
const limit = oracle.schema.limit;
const natTags = Object.keys(tags).filter((t) => tags[t] === "nat");
const noneTags = Object.keys(tags).filter((t) => tags[t] === "none");

// Payload values that read as [PayOther], or as [PayNat n] with n > max.
// [ABSENT] means the message has no n key.
const ABSENT = Symbol("absent");
const rejected = [
  ["absent", ABSENT], ["undefined", undefined], ["null", null],
  ["-1", -1], ["-5", -5], ["0.5", 0.5], ["1.5", 1.5], ["max + 0.5", max + 0.5],
  ["NaN", NaN], ["Infinity", Infinity], ["-Infinity", -Infinity],
  ['"1"', "1"], ['""', ""], ["true", true], ["[]", []], ["[1]", [1]], ["{}", {}],
  ["1n", 1n], ["new Number(1)", new Number(1)],
  ["max + 1", max + 1], ["2^53", 2 ** 53], ["1e300", 1e300],
];
// Payload values that read as [PayNat n] with n <= max.
const accepted = [["0", 0], ["-0", -0], ["1", 1], ["499", 499], ["500", 500], ["max", max]];

const withN = (_tag, n) => (n === ABSENT ? { _tag } : { _tag, n });
const accepts = (tag, message) => Schema.is(Message[tag])(message);
const plain = ({ model, commands }) => ({ model, commands: commands.map((c) => c.args) });

test("the oracle's schema facts", () => {
  assert.deepEqual(natTags, ["ClickedAdd", "ClickedSubtract", "ChangedAmount"]);
  assert.deepEqual(noneTags, [
    "ClickedReset", "ClickedLock", "ClickedUnlock", "ClearedAmount", "CompletedSaveCounter", "FailedSaveCounter",
  ]);
  assert.equal(String(max), payloadMax);
  // payload_max_safe, checked again in JavaScript.
  assert.ok(Number.isSafeInteger(max + limit));
  assert.equal(program.limit, limit);
  assert.equal(typeof program[command], "function");
  for (const [field, m] of Object.entries(oracle.schema.maxes)) {
    assert.ok(Schema.is(Model)({ ...initialModel, [field]: Number(m) }), `${field} = max`);
    assert.ok(!Schema.is(Model)({ ...initialModel, [field]: Number(m) + 1 }), `${field} = max + 1`);
  }
});

test("each tag's constructor builds a message its Schema accepts", () => {
  for (const tag of natTags) {
    for (const [label, n] of accepted) {
      const m = Message[tag]({ n });
      assert.equal(m._tag, tag);
      assert.ok(Object.is(m.n, n), `${tag} n=${label}`);
      assert.ok(accepts(tag, m));
    }
  }
  for (const tag of noneTags) assert.ok(accepts(tag, Message[tag]()), tag);
});

test("the printed Schemas accept exactly what [f_admits] accepts", () => {
  for (const tag of natTags) {
    for (const [label, n] of accepted) assert.ok(accepts(tag, withN(tag, n)), `${tag} n=${label}`);
    for (const [label, n] of rejected) assert.ok(!accepts(tag, withN(tag, n)), `${tag} n=${label}`);
  }
  for (const tag of noneTags) {
    for (const [label, n] of [...accepted, ...rejected]) assert.ok(accepts(tag, withN(tag, n)), `${tag} n=${label}`);
  }
  // A Schema checks only its own tag.
  assert.ok(!accepts("ClickedAdd", { _tag: "ClickedSubtract", n: 1 }));
  assert.ok(!accepts("ClickedReset", { _tag: "ClickedLock" }));
});

// Distinct sampled models from the oracle.
const froms = [...new Map(oracle.steps.map((r) => [JSON.stringify(r.from), r.from])).values()];
const stepFor = (from, message) =>
  oracle.steps.find(
    (r) => JSON.stringify(r.from) === JSON.stringify(from) && JSON.stringify(r.message) === JSON.stringify(message),
  );

test("every sampled model: a rejected payload changes nothing and can() is false", () => {
  assert.equal(froms.length, 120);
  for (const from of froms) {
    for (const tag of natTags) {
      for (const [label, n] of rejected) {
        const message = withN(tag, n);
        assert.equal(can(from, message), false, `can ${tag} n=${label} at ${JSON.stringify(from)}`);
        const r = update(from, message);
        assert.equal(r.model, from, `${tag} n=${label}`);
        assert.deepEqual(r.commands, []);
      }
    }
  }
});

test("every sampled model: an accepted payload acts as its nat, and n is not read for other tags", () => {
  for (const from of froms) {
    // -0 is [PayNat 0]: it must act as the oracle's n = 0 step.
    for (const tag of ["ClickedAdd", "ClickedSubtract"]) {
      const row = stepFor(from, { _tag: tag, n: 0 });
      const message = { _tag: tag, n: -0 };
      assert.equal(can(from, message), row.can, `can ${tag} -0`);
      assert.deepEqual(plain(update(from, message)), row.to, `${tag} -0`);
    }
    // n = max passes the Schema, and the guards reject it: count + max >= 500, max > count.
    for (const tag of ["ClickedAdd", "ClickedSubtract"]) {
      const message = { _tag: tag, n: max };
      assert.equal(can(from, message), false, `can ${tag} max`);
      assert.equal(update(from, message).model, from, `${tag} max`);
    }
    // ChangedAmount stores any accepted n.
    for (const [label, n] of accepted) {
      const r = update(from, { _tag: "ChangedAmount", n });
      assert.deepEqual(r.commands, []);
      assert.ok(Object.is(r.model.amount, n), `ChangedAmount n=${label}`);
      assert.deepEqual({ ...r.model, amount: 0 }, { ...from, amountOk: true, amount: 0 });
    }
    for (const tag of noneTags) {
      const row = stepFor(from, { _tag: tag });
      for (const [label, n] of [...accepted, ...rejected]) {
        const message = withN(tag, n);
        assert.equal(can(from, message), row.can, `can ${tag} n=${label}`);
        assert.deepEqual(plain(update(from, message)), row.to, `${tag} n=${label}`);
      }
    }
  }
});

test("payload fuzz: count stays below 500, the model fits its Schema, every save matches the model (fold_count_below_limit, fold_saves, fold_model_fits)", () => {
  // mulberry32, fixed seed.
  let seed = 7;
  const rand = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const pool = ["ClickedAdd", "ClickedAdd", "ClickedAdd", "ClickedSubtract", "ClickedSubtract", ...noneTags, "ChangedAmount", "Nope", "toString", "__proto__"];
  const payloads = [...accepted, ...rejected].map(([, n]) => n);
  let top = 0;
  let ignored = 0;
  for (let run = 0; run < 200; run++) {
    let model = restore(rand(2) ? undefined : `{"locked":false,"count":${rand(500)},"changes":${rand(1000)}}`);
    for (let i = 0; i < 200; i++) {
      const tag = pool[rand(pool.length)];
      const n = rand(2) ? rand(500) : payloads[rand(payloads.length)];
      const r = update(model, withN(tag, n));
      if (r.model === model) ignored++;
      model = r.model;
      assert.ok(Schema.is(Model)(model), JSON.stringify(model, (_, v) => (typeof v === "bigint" ? String(v) : v)));
      assert.ok(model.count < limit, `count ${model.count}`);
      for (const c of r.commands) {
        assert.equal(c.name, command);
        assert.deepEqual(c.args, { locked: model.locked, count: model.count, changes: model.changes });
      }
      top = Math.max(top, model.count);
    }
  }
  assert.ok(top >= 490, `fuzz should press against the cap (max ${top})`);
  assert.ok(ignored > 1000, `fuzz should send many ignored messages (${ignored})`);
});

// A Storage like window.localStorage, optionally failing every call.
const storage = (fail = false) => {
  const items = new Map();
  const guard = (f) => (...a) => {
    if (fail) throw new Error("storage unavailable");
    return f(...a);
  };
  return {
    items,
    getItem: guard((k) => (items.has(k) ? items.get(k) : null)),
    setItem: guard((k, v) => void items.set(k, String(v))),
    removeItem: guard((k) => void items.delete(k)),
    clear: guard(() => items.clear()),
    key: guard((i) => [...items.keys()][i] ?? null),
    get length() {
      return items.size;
    },
  };
};
const runWith = (s, effect) => Effect.runPromise(effect.pipe(Effect.provide(KeyValueStore.layerStorage(() => s))));

test("the save command stores what restore reads back (save_restore)", async () => {
  let model = initialModel;
  for (const message of [
    Message.ClickedAdd({ n: 250 }), Message.ClickedAdd({ n: 249 }), Message.ClickedSubtract({ n: 9 }),
    Message.ClickedLock(), Message.ClickedUnlock(), Message.ClickedReset(), Message.ClickedAdd({ n: 1 }),
    Message.ClickedLock(),
  ]) {
    const r = update(model, message);
    assert.equal(r.commands.length, 1, message._tag);
    const s = storage();
    const done = await runWith(s, r.commands[0].effect);
    assert.deepEqual(done, Message.CompletedSaveCounter());
    assert.deepEqual([...s.items.keys()], [key]);
    const text = s.items.get(key);
    assert.deepEqual(JSON.parse(text), { locked: r.model.locked, count: r.model.count, changes: r.model.changes });
    assert.deepEqual(restore(text), { ...r.model, amount: initialModel.amount, amountOk: initialModel.amountOk });
    assert.deepEqual(await runWith(s, flags), restore(text));
    model = r.model;
  }
});

test("a store error becomes the failed message, and flags falls back to the initial model", async () => {
  const r = update(initialModel, Message.ClickedAdd({ n: 5 }));
  assert.deepEqual(await runWith(storage(true), r.commands[0].effect), Message.FailedSaveCounter());
  assert.deepEqual(await runWith(storage(true), flags), initialModel);
  // An empty store, and a store holding a bad save, start from the initial model.
  assert.deepEqual(await runWith(storage(), flags), initialModel);
  const s = storage();
  s.items.set(key, '{"locked":false,"count":500,"changes":1}');
  assert.deepEqual(await runWith(s, flags), initialModel);
});

test("the result messages of the save command change nothing", () => {
  for (const from of froms) {
    for (const message of [Message.CompletedSaveCounter(), Message.FailedSaveCounter()]) {
      assert.equal(can(from, message), false);
      assert.equal(update(from, message).model, from);
    }
  }
});
