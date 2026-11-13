import { performance } from "node:perf_hooks";
import { machineOf } from "/tmp/c1-replay-review/tree/verify/stateful/machine.mjs";
import { transitionsOf } from "/tmp/c1-replay-review/tree/verify/stateful/transitions.mjs";
import { replayTrace, traceOf, decodeValue } from "/tmp/c1-replay-review/tree/verify/stateful/traces.mjs";

const root = "/tmp/c1-replay-review/tree";
async function contain(name, source, actions) {
  const started = performance.now();
  let timer;
  try {
    const value = await Promise.race([
      (async () => {
        const machine = machineOf(`${name}.ts`, source);
        return await replayTrace(`${name}.ts`, source, traceOf(machine, actions), { timeoutMs: 100 });
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("PROBE_DEADLINE")), 4000); }),
    ]);
    return { name, ms: Math.round(performance.now() - started), status: value.status, reason: value.reason, message: value.message, faults: value.faults ?? null };
  } catch (error) {
    return { name, ms: Math.round(performance.now() - started), error: error.name, message: error.message };
  } finally { clearTimeout(timer); }
}

const spin = `let x = 0;\n// state x === 0\nexport function spin() { Promise.resolve().then(spin); }\nexport function entry() { Promise.resolve().then(spin); }`;
const tight = `let x = 0;\n// state x === 0\nexport function spin() { for (;;) {} }\nexport function entry() { Promise.resolve().then(spin); }`;
const throwThen = `let x = 0;\n// state x === 0\nexport function boom() { throw new Error("boom"); }\nexport function entry() { Promise.resolve().then(boom); }`;
const results = [];
results.push(await contain("promise-chain", spin, [{ kind: "call", entry: "entry", args: [] }]));
results.push(await contain("promise-tight", tight, [{ kind: "call", entry: "entry", args: [] }]));
results.push(await contain("promise-throw", throwThen, [{ kind: "call", entry: "entry", args: [] }]));

const correlated = `// @environment
// resolves result === q
declare function op(q: number): Promise<number>;
let shown = 0;
// state true
export async function entry(q: number) {
  const value = await op(q);
  shown = value;
}`;
const machine = machineOf("corr.ts", correlated);
const wrong = await replayTrace("corr.ts", correlated, traceOf(machine, [
  { kind: "call", entry: "entry", args: [1] },
  { kind: "call", entry: "entry", args: [7] },
  { kind: "resolve", request: 1, op: "op", value: 7 },
]));
const right = await replayTrace("corr.ts", correlated, traceOf(machine, [
  { kind: "call", entry: "entry", args: [1] },
  { kind: "call", entry: "entry", args: [7] },
  { kind: "resolve", request: 2, op: "op", value: 7 },
  { kind: "resolve", request: 1, op: "op", value: 1 },
]));
const successive = `// @environment
// resolves result === q
declare function op(q: number): Promise<number>;
let shown = 0;
// state true
export async function entry(q: number) {
  const first = await op(q);
  const marker: number = 8;
  const second = await op(marker);
  shown = second;
}`;
console.log(JSON.stringify({ phase: "before-successive", results, correlation: { wrong: slim(wrong), right: slim(right) } }));
const sm = machineOf("suc.ts", successive);
const opened = await replayTrace("suc.ts", successive, traceOf(sm, [
  { kind: "call", entry: "entry", args: [3] },
  { kind: "resolve", request: 1, op: "op", value: 3 },
]));
const secondOk = await replayTrace("suc.ts", successive, traceOf(sm, [
  { kind: "call", entry: "entry", args: [3] },
  { kind: "resolve", request: 1, op: "op", value: 3 },
  { kind: "resolve", request: 2, op: "op", value: 8 },
]));
const secondOriginal = await replayTrace("suc.ts", successive, traceOf(sm, [
  { kind: "call", entry: "entry", args: [3] },
  { kind: "resolve", request: 1, op: "op", value: 3 },
  { kind: "resolve", request: 2, op: "op", value: 3 },
]));
const secondStale = await replayTrace("suc.ts", successive, traceOf(sm, [
  { kind: "call", entry: "entry", args: [3] },
  { kind: "resolve", request: 1, op: "op", value: 4 },
]));

function slim(result) {
  return { status: result.status, reason: result.reason ?? null, message: result.message ?? null,
    requests: result.requests?.map((r) => ({ seq: r.seq, settled: r.settled })),
    shown: result.trace?.steps?.at(-1)?.state?.shown ?? null };
}

const base = `// @environment
// resolves Number.isFinite(result)
declare function op(q: number): Promise<number>;
let x = 0;
// state x === 0
export async function entry(q: number) { const v = await op(q); x = v; }`;
const settled = base.replace("// resolves Number.isFinite(result)\n", "// resolves Number.isFinite(result)\n// settles eventually\n");
const strip = (units) => units.map(({ target }) => ({ declarations: target.declarations, pre: target.pre, preDefined: target.preDefined, postconditions: target.postconditions }));
const a = strip(transitionsOf(machineOf("same.ts", base)).units);
const b = strip(transitionsOf(machineOf("same.ts", settled)).units);
const smt = { sameFile: JSON.stringify(a) === JSON.stringify(b), units: a.length, settledUnits: b.length };

let successiveOut = null, successiveError = null;
try {
  successiveOut = { afterFirst: { ...slim(opened), args: opened.requests?.map((r) => r.args.map(decodeValue)) }, matchMarker: slim(secondOk), originalQOnSecond: slim(secondOriginal), wrongFirst: slim(secondStale) };
} catch (error) {
  successiveError = { name: error.name, message: error.message, status: error.status ?? null };
}
const out = { results, correlation: { wrong: slim(wrong), right: slim(right) }, successive: successiveOut, successiveError, smt };
console.log(JSON.stringify(out, null, 2));
process.exit(0);
