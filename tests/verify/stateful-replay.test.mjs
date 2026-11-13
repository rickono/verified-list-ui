import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { machineOf } from "../../verify/stateful/machine.mjs";
import { replayTrace, traceOf, encodeValue, decodeValue } from "../../verify/stateful/traces.mjs";

const source = readFileSync(new URL("./fixtures/stateful/pilots/search.ts", import.meta.url), "utf8");
const file = "search.ts", machine = machineOf(file, source);
const call = { kind: "call", entry: "search", args: [0] };
const resolve = { kind: "resolve", request: 1, op: "lookup", value: 1 };
const replay = (actions) => replayTrace(file, source, traceOf(machine, actions));
test("strict native source replay is repeatable, hash-bound, and may remain pending", async () => {
  const trace = traceOf(machine, [call, resolve]);
  const a = await replayTrace(file, source, trace), b = await replayTrace(file, source, JSON.parse(JSON.stringify(trace)));
  assert.equal(a.status, "ok"); assert.deepEqual(a, b);
  assert.equal(decodeValue(a.trace.steps.at(-1).state.shown), 1);
  const pending = await replay([call]);
  assert.equal(pending.status, "ok"); assert.equal(pending.requests[0].settled, false);
  for (const key of ["sourceSha256", "executableSha256", "assumptionsSha256"]) {
    const result = await replayTrace(file, source, { ...trace, [key]: "0".repeat(64) });
    assert.equal(result.status, "illegal-environment-action"); assert.match(result.message, /mismatch/);
  }
});
test("illegal action types, identities, args/results and outcomes are refused", async () => {
  const invalid = [
    [{ kind: "boom" }], [{ ...call, entry: "missing" }], [{ ...call, args: [true] }], [{ ...call, args: [] }],
    [resolve], [call, { ...resolve, request: 2 }], [call, { ...resolve, op: "other" }],
    [call, { ...resolve, value: true }], [call, { ...resolve, value: NaN }], [call, resolve, resolve],
    [call, { kind: "reject", request: 1, op: "lookup" }],
  ];
  for (const actions of invalid) assert.equal((await replay(actions)).status, "illegal-environment-action", JSON.stringify(actions));
  const malformed = traceOf(machine, [call]); malformed.actions[0].args[0] = { type: "number", bits: "123" };
  assert.equal((await replayTrace(file, source, malformed)).status, "illegal-environment-action");
  const observed = (await replay([call, resolve])).trace;
  observed.steps.at(-1).state.shown = encodeValue(2);
  assert.equal((await replayTrace(file, source, observed)).status, "illegal-environment-action");
});
test("wire scalars preserve binary64 exceptional values", async () => {
  for (const value of [NaN, -0, Infinity, -Infinity, 0, 2 ** 53, true, false]) assert.ok(Object.is(value, decodeValue(JSON.parse(JSON.stringify(encodeValue(value))))));
  const raw = source.replace("// resolves Number.isFinite(result)", "");
  const m = machineOf(file, raw);
  const result = await replayTrace(file, raw, traceOf(m, [call, { ...resolve, value: NaN }]));
  assert.equal(result.violation.text, "Number.isFinite(shown)");
  assert.ok(Number.isNaN(decodeValue(result.trace.steps.at(-1).state.shown)));
});
test("continuation loop is contained below one second with real native promises", async () => {
  const looping = `// @environment\ndeclare function op(): Promise<number>;\nlet x = 0;\n// state x === 0\nexport async function entry() { await op(); for (;;) {} }`;
  const m = machineOf("loop.ts", looping), before = performance.now();
  const result = await replayTrace("loop.ts", looping, traceOf(m, [{ kind: "call", entry: "entry", args: [] }, { kind: "resolve", request: 1, op: "op", value: 0 }]));
  assert.equal(result.status, "unknown"); assert.equal(result.reason, "replay-timeout");
  assert.ok(performance.now() - before < 1_000);
});
test("unchanged executable runs in strict realm and rejects unbound this", async () => {
  const strict = `let x = 0;\n// state x === 0\nexport function entry() { if (this !== undefined) x = 1; }`;
  const m = machineOf("strict.ts", strict);
  const result = await replayTrace("strict.ts", strict, traceOf(m, [{ kind: "call", entry: "entry", args: [] }]));
  assert.equal(result.status, "ok"); assert.equal(result.violation, undefined);
  assert.equal(decodeValue(result.trace.steps.at(-1).state.x), 0);
});
test("an initially false property cannot mask an illegal action suffix", async () => {
  const source = "let x = 0;\n// state x === 1\nexport function entry() {}";
  const m = machineOf("initial.ts", source);
  assert.equal((await replayTrace("initial.ts", source, traceOf(m, [{ kind: "illegal" }]))).status, "illegal-environment-action");
});
