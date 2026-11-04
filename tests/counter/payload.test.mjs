// Checks the trusted steps at the JavaScript boundary of the counter:
//
// - the reading of a JavaScript value as a [payload] (XStateCtx.v):
//   [PayNat n] for a number that is a non-negative integer, [PayOther]
//   for everything else;
// - that the printed Zod schemas accept exactly what [admits] accepts;
// - that an event that fails its schema is ignored ([js_step]) and that
//   snapshot.can is false for it ([js_can]).
//
// The schema facts (which types carry [n], and [payload_max]) come from the
// Rocq oracle, not from the printed module.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createActor, getNextSnapshot } from "xstate";

const dir = resolve(process.env.COUNTER_OUT ?? "_build/default/counter");
const { machine, events } = await import(pathToFileURL(join(dir, "counter.machine.js")).href);
const oracle = JSON.parse(readFileSync(join(dir, "counter.oracle.json"), "utf8"));

const max = Number(oracle.schema.payloadMax);
const natTypes = Object.keys(oracle.schema.types).filter((t) => oracle.schema.types[t] === "nat");
const noneTypes = Object.keys(oracle.schema.types).filter((t) => oracle.schema.types[t] === "none");

const at = ({ value, context }) => machine.resolveState({ value, context });
const snap = (s) => ({ value: s.value, context: s.context });
const accepts = (type, event) => events[type]["~standard"].validate(event).issues === undefined;

// Payload values that read as [PayOther], or as [PayNat n] with n > max.
// [ABSENT] means the event has no n key.
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

const withN = (type, n) => (n === ABSENT ? { type } : { type, n });

test("the oracle's schema facts", () => {
  assert.deepEqual(natTypes, ["ADD", "SUB"]);
  assert.deepEqual(noneTypes, ["RESET", "LOCK", "UNLOCK"]);
  assert.equal(String(max), oracle.schema.payloadMax);
  // payload_max_safe, checked again in JavaScript.
  assert.ok(Number.isSafeInteger(max + 500));
  assert.deepEqual(Object.keys(events), Object.keys(oracle.schema.types));
});

test("the printed schemas accept exactly what [admits] accepts", () => {
  for (const type of natTypes) {
    for (const [label, n] of accepted) assert.ok(accepts(type, withN(type, n)), `${type} n=${label}`);
    for (const [label, n] of rejected) assert.ok(!accepts(type, withN(type, n)), `${type} n=${label}`);
  }
  for (const type of noneTypes) {
    for (const [label, n] of [...accepted, ...rejected]) {
      assert.ok(accepts(type, withN(type, n)), `${type} n=${label}`);
    }
  }
  // A schema checks only its own type.
  assert.ok(!accepts("ADD", { type: "SUB", n: 1 }));
  assert.ok(!accepts("RESET", { type: "LOCK" }));
});

test("the bad payloads that broke the cap before the schemas are now ignored", () => {
  const run = (evs) => {
    const actor = createActor(machine).start();
    evs.forEach((e) => actor.send(e));
    const { context } = actor.getSnapshot();
    actor.stop();
    return context;
  };
  assert.deepEqual(run([{ type: "ADD", n: 498 }, { type: "SUB", n: -5 }]), { count: 498, changes: 1, limit: 500 });
  assert.deepEqual(run([{ type: "ADD", n: 498 }, { type: "ADD", n: 1.5 }]), { count: 498, changes: 1, limit: 500 });
  assert.deepEqual(run([{ type: "ADD", n: "1" }]), { count: 0, changes: 0, limit: 500 });
});

// Distinct sampled snapshots from the oracle.
const froms = [...new Map(oracle.steps.map((r) => [JSON.stringify(r.from), r.from])).values()];
const stepFor = (from, event) =>
  oracle.steps.find((r) => JSON.stringify(r.from) === JSON.stringify(from) && JSON.stringify(r.event) === JSON.stringify(event));

test("every sampled state: a rejected payload changes nothing and can() is false", () => {
  assert.equal(froms.length, 60);
  for (const from of froms) {
    const before = at(from);
    for (const type of natTypes) {
      for (const [label, n] of rejected) {
        const event = withN(type, n);
        assert.equal(before.can(event), false, `can ${type} n=${label} at ${JSON.stringify(from)}`);
        assert.deepEqual(snap(getNextSnapshot(machine, before, event)), from, `${type} n=${label}`);
      }
    }
  }
});

test("every sampled state: an accepted payload acts as its nat, and n is not read for RESET/LOCK/UNLOCK", () => {
  for (const from of froms) {
    const before = at(from);
    // -0 is [PayNat 0]: it must act as the oracle's n = 0 step.
    for (const type of natTypes) {
      const row = stepFor(from, { type, n: 0 });
      const event = { type, n: -0 };
      assert.equal(before.can(event), row.can, `can ${type} -0`);
      assert.deepEqual(snap(getNextSnapshot(machine, before, event)), row.to, `${type} -0`);
    }
    // n = max passes the schema, and the guards reject it: count + max >= 500, max > count.
    for (const type of natTypes) {
      const event = { type, n: max };
      assert.equal(before.can(event), false, `can ${type} max`);
      assert.deepEqual(snap(getNextSnapshot(machine, before, event)), from, `${type} max`);
    }
    for (const type of noneTypes) {
      const row = stepFor(from, { type });
      for (const [label, n] of [...accepted, ...rejected]) {
        const event = withN(type, n);
        assert.equal(before.can(event), row.can, `can ${type} n=${label}`);
        assert.deepEqual(snap(getNextSnapshot(machine, before, event)), row.to, `${type} n=${label}`);
      }
    }
  }
});

test("payload fuzz: count stays below 500 and every number is a safe integer (js_count_below_limit, js_exact)", () => {
  // mulberry32, fixed seed.
  let seed = 7;
  const rand = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const types = ["ADD", "ADD", "ADD", "SUB", "SUB", "RESET", "LOCK", "UNLOCK", "NOPE"];
  const payloads = [...accepted, ...rejected].map(([, n]) => n);
  let top = 0;
  let ignored = 0;
  for (let run = 0; run < 200; run++) {
    const actor = createActor(machine).start();
    for (let i = 0; i < 200; i++) {
      const type = types[rand(types.length)];
      const n = rand(2) ? rand(500) : payloads[rand(payloads.length)];
      const before = actor.getSnapshot();
      actor.send(withN(type, n));
      if (actor.getSnapshot() === before) ignored++;
      const { count, changes, limit } = actor.getSnapshot().context;
      assert.equal(limit, 500);
      assert.ok(Number.isSafeInteger(count) && count >= 0 && count < 500, `count ${String(count)}`);
      assert.ok(Number.isSafeInteger(changes) && changes >= 0, `changes ${String(changes)}`);
      top = Math.max(top, count);
    }
    actor.stop();
  }
  assert.ok(top >= 490, `fuzz should press against the cap (max ${top})`);
  assert.ok(ignored > 1000, `fuzz should send many rejected events (${ignored})`);
});
