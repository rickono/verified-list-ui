// Checks the trusted step of the XState backend: that XState interprets the
// generated config the way theories/XState.v's [m_step] and [m_meta] say.
//
// The oracle file is computed in Rocq from [update], [enc], and [view]
// directly, not from the compiled machine. Matching it means XState, running
// the generated config, reproduces the application semantics on every
// (reachable state, event) pair, including events the machine has no entry for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createActor, createMachine, getNextSnapshot } from "xstate";

const dir = process.env.XSTATE_OUT ?? "_build/default/xstate";
const config = JSON.parse(readFileSync(join(dir, "list.machine.json"), "utf8"));
const oracle = JSON.parse(readFileSync(join(dir, "list.oracle.json"), "utf8"));
const machine = createMachine(config);
const keys = Object.keys(config.states);

const at = (key) => machine.resolveState({ value: key });
const metaOf = (snapshot) => {
  const meta = snapshot.getMeta();
  assert.deepEqual(Object.keys(meta), [`${config.id}.${snapshot.value}`]);
  return meta[`${config.id}.${snapshot.value}`];
};

test("config shape: 20 flat states, the initial key, only on and meta", () => {
  assert.equal(keys.length, 20);
  assert.equal(config.initial, "items_1_2_3__sel_none");
  for (const key of keys) {
    assert.deepEqual(Object.keys(config.states[key]).sort(), ["meta", "on"]);
    for (const target of Object.values(config.states[key].on)) {
      assert.ok(keys.includes(target), `${key} -> ${target}`);
    }
  }
});

test("every (state, event) pair matches the Rocq oracle", () => {
  // 20 states x (3 selects + delete + reset + 3 absent selects)
  assert.equal(oracle.length, 20 * 8);
  for (const { from, event, to, view } of oracle) {
    const next = getNextSnapshot(machine, at(from), { type: event });
    assert.equal(next.value, to, `${from} --${event}-->`);
    assert.deepEqual(metaOf(next), view, `${from} --${event}--> meta`);
  }
});

test("every state's meta is reported as stored", () => {
  for (const key of keys) assert.deepEqual(metaOf(at(key)), config.states[key].meta);
});

test("each row's selectEvent selects that row", () => {
  for (const key of keys) {
    for (const row of config.states[key].meta.rows) {
      assert.equal(row.selectEvent, `SELECT_${row.id}`);
      const next = getNextSnapshot(machine, at(key), { type: row.selectEvent });
      assert.deepEqual(metaOf(next).rows.filter((r) => r.selected).map((r) => r.id), [row.id]);
    }
  }
});

test("event types with no entry are ignored in every state", () => {
  const junk = ["FOO", "select_1", "SELECT_01", "SELECT_", "SELECT_1 ", "DELETE", "reset", ""];
  for (const key of keys) {
    for (const type of junk) {
      assert.equal(getNextSnapshot(machine, at(key), { type }).value, key, `${key} ${JSON.stringify(type)}`);
    }
  }
});

// End-to-end through a live actor, with expectations written from the spec
// rather than taken from either generated file.
const send = (events) => {
  const actor = createActor(machine).start();
  for (const type of events) actor.send({ type });
  const view = metaOf(actor.getSnapshot());
  actor.stop();
  return {
    labels: view.rows.map((r) => r.label),
    selected: view.rows.filter((r) => r.selected).map((r) => r.label),
    deleteEnabled: view.deleteEnabled,
    empty: view.showEmptyMessage,
  };
};
const full = ["Alpha", "Beta", "Gamma"];

test("required example sequences through a live actor", () => {
  const cases = [
    [[], full, []],
    [["SELECT_2", "DELETE_SELECTED"], ["Alpha", "Gamma"], []],
    [["SELECT_2", "DELETE_SELECTED", "SELECT_2"], ["Alpha", "Gamma"], []],
    [["SELECT_1", "SELECT_3", "DELETE_SELECTED"], ["Alpha", "Beta"], []],
    [["SELECT_999"], full, []],
    [["SELECT_1", "DELETE_SELECTED", "SELECT_2", "DELETE_SELECTED", "SELECT_3", "DELETE_SELECTED"], [], []],
    [["SELECT_2", "DELETE_SELECTED", "DELETE_SELECTED"], ["Alpha", "Gamma"], []],
    [["SELECT_2", "SELECT_2"], full, ["Beta"]],
    [["SELECT_1", "DELETE_SELECTED", "RESET", "RESET"], full, []],
  ];
  for (const [events, labels, selected] of cases) {
    const got = send(events);
    assert.deepEqual(got, { labels, selected, deleteEnabled: selected.length > 0, empty: labels.length === 0 }, events.join(" "));
    assert.deepEqual(send([...events, "RESET"]), { labels: full, selected: [], deleteEnabled: false, empty: false });
  }
});

test("long random runs on a live actor follow the oracle", () => {
  const table = new Map(oracle.map((r) => [`${r.from} ${r.event}`, r.to]));
  const events = [...new Set(oracle.map((r) => r.event))];
  // mulberry32, fixed seed: reproducible, and good low bits.
  let seed = 12345;
  const rand = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const covered = new Set();
  for (let run = 0; run < 200; run++) {
    const actor = createActor(machine).start();
    let expected = config.initial;
    for (let i = 0; i < 50; i++) {
      const type = events[rand(events.length)];
      covered.add(`${expected} ${type}`);
      actor.send({ type });
      expected = table.get(`${expected} ${type}`);
      assert.equal(actor.getSnapshot().value, expected);
    }
    actor.stop();
  }
  // The runs must exercise every pair, or this test proves little.
  assert.equal(covered.size, oracle.length);
});
