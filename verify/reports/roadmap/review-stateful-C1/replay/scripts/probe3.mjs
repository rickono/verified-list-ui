import { performance } from "node:perf_hooks";
import { machineOf } from "/tmp/c1-replay-review/tree/verify/stateful/machine.mjs";
import { replayTrace, traceOf, decodeValue } from "/tmp/c1-replay-review/tree/verify/stateful/traces.mjs";
import { checkStateful } from "/tmp/c1-replay-review/tree/verify/stateful/index.mjs";

const writeThenThrow = `let x = 0;\n// state x === 0\nexport function boom() { x = 1; throw new Error("boom"); }\nexport function entry() { Promise.resolve().then(boom); }`;
const machine = machineOf("write-throw.ts", writeThenThrow);
const started = performance.now();
const replay = await replayTrace("write-throw.ts", writeThenThrow, traceOf(machine, [{ kind: "call", entry: "entry", args: [] }]), { timeoutMs: 100 });
let check;
try {
  check = await checkStateful("write-throw.ts", writeThenThrow, { timeoutMs: 15000, maxDepth: 1 });
} catch (error) {
  check = { error: error.name, message: error.message };
}
const state = replay.trace?.steps?.at(-1)?.state?.x;
console.log(JSON.stringify({
  ms: Math.round(performance.now() - started),
  replay: { status: replay.status, reason: replay.reason ?? null, message: replay.message ?? null, faults: replay.faults ?? null, violation: replay.violation?.text ?? null, x: state ? decodeValue(state) : null },
  check: check.error ? check : { status: check.status, reason: check.reason ?? null, message: check.message ?? null, line: check.line ?? null },
}, null, 2));
process.exit(0);
