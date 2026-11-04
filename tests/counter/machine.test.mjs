// Checks the trusted steps of the context backend: that the pinned XState,
// running the printed module, behaves as theories/XStateCtx.v's [c_step],
// [c_can], and [c_meta_of] say.
//
// The oracle is computed in Rocq from the app's [update] and [enabled]
// (theories/Counter.v), not from the machine, so matching it checks XState
// plus the printer against the specification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createActor, getNextSnapshot } from "xstate";

const dir = resolve(process.env.COUNTER_OUT ?? "_build/default/counter");
const { machine } = await import(pathToFileURL(join(dir, "counter.machine.js")).href);
const oracle = JSON.parse(readFileSync(join(dir, "counter.oracle.json"), "utf8"));

const at = ({ value, context }) => machine.resolveState({ value, context });
const snap = (s) => ({ value: s.value, context: s.context });
const metaOf = (s) => {
  const meta = s.getMeta();
  assert.deepEqual(Object.keys(meta), [`counter.${s.value}`]);
  return meta[`counter.${s.value}`];
};

test("initial snapshot", () => {
  const actor = createActor(machine).start();
  assert.deepEqual(snap(actor.getSnapshot()), { value: "unlocked", context: { count: 0, changes: 0, limit: 500 } });
  actor.stop();
});

test("every sampled (state, event) step matches the Rocq oracle", () => {
  // 2 control states x 15 counts x 2 change counts x 21 events
  assert.equal(oracle.steps.length, 2 * 15 * 2 * 21);
  for (const { from, event, to, meta, can } of oracle.steps) {
    const label = `${JSON.stringify(from)} ${JSON.stringify(event)}`;
    const before = at(from);
    assert.equal(before.can(event), can, `can: ${label}`);
    const next = getNextSnapshot(machine, before, event);
    assert.deepEqual(snap(next), to, label);
    assert.deepEqual(metaOf(next), meta, `meta: ${label}`);
  }
  // The samples must hit both sides of every guard, or this test proves little.
  const outcomes = new Set(oracle.steps.map((r) => `${r.event.type} ${r.can}`));
  for (const type of ["ADD", "SUB", "RESET", "LOCK", "UNLOCK"]) {
    assert.ok(outcomes.has(`${type} true`) && outcomes.has(`${type} false`), type);
  }
});

test("pseudo-random traces on a live actor match the Rocq oracle", () => {
  assert.equal(oracle.traces.length, 20);
  for (const { events, snapshots } of oracle.traces) {
    const actor = createActor(machine).start();
    events.forEach((event, i) => {
      actor.send(event);
      assert.deepEqual(snap(actor.getSnapshot()), snapshots[i], `step ${i}`);
    });
    actor.stop();
  }
  const top = Math.max(...oracle.traces.flatMap((t) => t.snapshots.map((s) => s.context.count)));
  assert.ok(top >= 450, `traces should approach the cap (max ${top})`);
});

test("unknown event types are ignored; payloads of RESET/LOCK/UNLOCK are not read", () => {
  const junk = ["FOO", "add", "ADD ", "Add", "", "*", "counter.ADD"];
  for (const { from } of oracle.steps) {
    const before = at(from);
    for (const type of junk) {
      assert.deepEqual(snap(getNextSnapshot(machine, before, { type, n: 5 })), from, type);
    }
    for (const type of ["RESET", "LOCK", "UNLOCK"]) {
      assert.deepEqual(
        snap(getNextSnapshot(machine, before, { type, n: 7 })),
        snap(getNextSnapshot(machine, before, { type })),
        type,
      );
    }
  }
});

test("raw-event fuzz: count stays below 500 (machine_count_below_limit)", () => {
  // mulberry32, fixed seed.
  let seed = 2024;
  const rand = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const types = ["ADD", "ADD", "ADD", "SUB", "RESET", "LOCK", "UNLOCK", "NOPE"];
  let max = 0;
  for (let run = 0; run < 200; run++) {
    const actor = createActor(machine).start();
    for (let i = 0; i < 200; i++) {
      const event = { type: types[rand(types.length)] };
      if (rand(4) > 0) event.n = rand(4) === 0 ? rand(100000) : rand(200);
      actor.send(event);
      const { count, changes, limit } = actor.getSnapshot().context;
      assert.equal(limit, 500);
      assert.ok(Number.isInteger(count) && count >= 0 && count < 500, `count ${count}`);
      assert.ok(Number.isInteger(changes) && changes >= 0);
      max = Math.max(max, count);
    }
    actor.stop();
  }
  assert.ok(max >= 490, `fuzz should press against the cap (max ${max})`);
});
