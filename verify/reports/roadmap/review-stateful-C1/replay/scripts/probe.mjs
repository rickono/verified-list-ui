import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";

const root = "/tmp/c1-replay-review/tree";
const out = "/tmp/c1-replay-review/out";
import { mkdirSync } from "node:fs";
mkdirSync(out, { recursive: true });

const { machineOf } = await import(`${root}/verify/stateful/machine.mjs`);
const { assumptionsOf } = await import(`${root}/verify/stateful/environment.mjs`);
const { transitionsOf } = await import(`${root}/verify/stateful/transitions.mjs`);
const { replayTrace, traceOf, encodeValue, decodeValue } = await import(`${root}/verify/stateful/traces.mjs`);
const { checkStateful } = await import(`${root}/verify/stateful/index.mjs`);
const { SourceError } = await import(`${root}/verify/error.mjs`);

const findings = [];
const notes = [];
const sha = (text) => createHash("sha256").update(text).digest("hex");
const slim = (report) => report && ({
  status: report.status, reason: report.reason, message: report.message,
  line: report.line, column: report.column,
  violation: report.violation ?? report.violated ?? null,
  faults: report.faults, searched: report.searched && { maxDepth: report.searched.maxDepth, executions: report.searched.executions, stopped: report.searched.stopped, depth: report.searched.depth },
  requests: report.requests?.map((r) => ({ seq: r.seq, op: r.op, settled: r.settled, args: r.args?.map(decodeValue) })),
  steps: report.trace?.steps?.map((s) => ({ step: s.step, kind: s.action?.kind, state: s.state && Object.fromEntries(Object.entries(s.state).map(([k, v]) => [k, decodeValue(v)])) })),
  assumptionsSha: report.assumptions?.sha256,
  settles: report.assumptions?.environment?.map((e) => ({ op: e.op, rejects: e.rejects, settles: e.settles, settlesUse: e.settlesUse, settlementCount: e.settlementCount, settlementOrder: e.settlementOrder })),
  units: report.units?.map((u) => ({ unit: u.unit, status: u.status, reason: u.reason })),
});

async function timed(name, ms, fn) {
  const started = performance.now();
  let timer;
  try {
    const value = await Promise.race([
      fn(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`PROBE_DEADLINE ${name}`)), ms); }),
    ]);
    return { name, ms: Math.round(performance.now() - started), value };
  } catch (error) {
    return { name, ms: Math.round(performance.now() - started), error: error?.name ?? "Error", message: String(error?.message ?? error), stack: String(error?.stack ?? "").split("\n").slice(0, 6) };
  } finally { clearTimeout(timer); }
}

function ps() {
  try { return execFileSync("ps", ["-ax", "-o", "pid=,ppid=,stat=,command="], { encoding: "utf8" }).split("\n").filter((line) => /replay-worker|probe\.mjs|stateful-replay/.test(line)); }
  catch (error) { return [String(error)]; }
}

const env = `// @environment
// resolves Number.isFinite(result)
declare function op(q: number): Promise<number>;
`;
const envBool = `// @environment
// resolves result === flag
declare function op(flag: boolean): Promise<boolean>;
`;

async function replay(file, source, actions, options) {
  const machine = machineOf(file, source);
  return { machine, result: await replayTrace(file, source, traceOf(machine, actions), options) };
}

const cases = [];

// --- scalar bits ---
{
  const samples = [NaN, -0, 0, Infinity, -Infinity, 2 ** 53, 1, true, false];
  const bits = samples.map((value) => {
    const encoded = encodeValue(value);
    const through = decodeValue(JSON.parse(JSON.stringify(encoded)));
    return { value: Object.is(value, -0) ? "-0" : value, encoded, same: Object.is(value, through) };
  });
  const payload = Buffer.from("7ff8000000000001", "hex");
  const decodedPayload = payload.readDoubleBE();
  const recoded = Buffer.alloc(8); recoded.writeDoubleBE(decodedPayload);
  cases.push({ name: "scalar-bits", bits, nanPayloadIn: "7ff8000000000001", nanPayloadOut: recoded.toString("hex"), payloadIsNaN: Number.isNaN(decodedPayload) });
}

// --- bit survival through a real replayed cell ---
{
  const source = `let x = 0;\n// state true\nexport function entry(q: number) { x = q; }`;
  const machine = machineOf("bits.ts", source);
  const observed = {};
  for (const value of [NaN, -0, Infinity, -Infinity, 0]) {
    const result = await replayTrace("bits.ts", source, traceOf(machine, [{ kind: "call", entry: "entry", args: [value] }]));
    const stored = result.trace?.steps?.at(-1)?.state?.x;
    observed[Object.is(value, -0) ? "-0" : String(value)] = { status: result.status, bits: stored, same: stored ? Object.is(decodeValue(stored), value) : false };
  }
  cases.push({ name: "replay-cell-bits", observed });
}

// --- hashes and assumption defaults ---
{
  const base = `${env}let x = 0;\n// state x === 0\nexport async function entry(q: number) { const v = await op(q); x = v; }`;
  const settled = base.replace("// resolves Number.isFinite(result)\n", "// resolves Number.isFinite(result)\n// settles eventually\n");
  const rejecting = base.replace("// resolves Number.isFinite(result)\n", "// resolves Number.isFinite(result)\n// rejects\n");
  const a = machineOf("a.ts", base), b = machineOf("a.ts", base);
  const s = machineOf("s.ts", settled), r = machineOf("r.ts", rejecting);
  const ta = transitionsOf(a), ts = transitionsOf(s);
  cases.push({ name: "assumptions",
    stable: a.assumptions.sha256 === b.assumptions.sha256 && a.executableSha256 === b.executableSha256 && a.sourceSha256 === sha(base),
    sourceSha: a.sourceSha256, executableSha: a.executableSha256, assumptionsSha: a.assumptions.sha256,
    executableDiffersFromSource: a.executableSha256 !== a.sourceSha256,
    default: a.assumptions.environment[0],
    settles: s.assumptions.environment[0],
    rejects: r.assumptions.environment[0],
    eventBound: a.assumptions.eventBound,
    scheduler: a.assumptions.scheduler,
    entryCalls: a.assumptions.entryCalls,
    fairness: a.assumptions.fairness,
    smtIdenticalDespiteSettles: ta.sha256 === ts.sha256,
    rejectAddsUnit: transitionsOf(r).units.some((u) => u.name === "$reject"),
    settlesDoesNotAddUnit: ta.units.length === ts.units.length,
  });
}

// --- trace trust ---
{
  const source = `let x = 0;\n// state x === 0\nexport function bad() { x = 1; }\nexport function fix() { x = 0; }`;
  const machine = machineOf("trust.ts", source);
  const bad = { kind: "call", entry: "bad", args: [] };
  const fix = { kind: "call", entry: "fix", args: [] };
  const violated = await replayTrace("trust.ts", source, traceOf(machine, [bad]));
  const repaired = await replayTrace("trust.ts", source, traceOf(machine, [bad, fix]));
  const illegalSuffix = await replayTrace("trust.ts", source, traceOf(machine, [bad, { kind: "nope" }]));
  const extraOnViolating = await replayTrace("trust.ts", source, traceOf(machine, [{ ...bad, extra: true }]));
  const observed = violated.trace;
  const tampered = structuredClone(observed);
  tampered.steps.at(-1).state.x = encodeValue(0);
  const tamperedResult = await replayTrace("trust.ts", source, tampered);
  const fakeClean = structuredClone(observed);
  fakeClean.violation = null; fakeClean.status = "verified";
  const fake = await replayTrace("trust.ts", source, fakeClean);
  const wrongHash = await replayTrace("trust.ts", source, { ...traceOf(machine, []), sourceSha256: "0".repeat(64) });
  const uppercase = traceOf(machine, [bad]);
  uppercase.actions[0].args = [{ type: "number", bits: "8000000000000000".toUpperCase() }];
  // bad takes no args; use the number entry instead
  const num = `let x = 0;\n// state true\nexport function entry(q: number) { x = q; }`;
  const nm = machineOf("num.ts", num);
  const upperTrace = traceOf(nm, [{ kind: "call", entry: "entry", args: [1] }]);
  upperTrace.actions[0].args[0].bits = upperTrace.actions[0].args[0].bits.toUpperCase();
  const upperResult = await replayTrace("num.ts", num, upperTrace);
  const shortBits = traceOf(nm, [{ kind: "call", entry: "entry", args: [1] }]);
  shortBits.actions[0].args[0].bits = "123";
  const shortResult = await replayTrace("num.ts", num, shortBits);
  const extraValue = traceOf(nm, [{ kind: "call", entry: "entry", args: [1] }]);
  extraValue.actions[0].unexpected = 1;
  const extraResult = await replayTrace("num.ts", num, extraValue);
  cases.push({ name: "trace-trust",
    violated: slim(violated),
    repairedStillViolation: slim(repaired),
    illegalAfterViolation: slim(illegalSuffix),
    extraFieldOnCall: slim(extraOnViolating),
    tamperedObservation: slim(tamperedResult),
    envelopeFakeStatus: { status: fake.status, violation: !!fake.violation, traceStatus: fake.trace?.status ?? null },
    wrongHash: slim(wrongHash),
    uppercaseBits: slim(upperResult),
    shortBits: slim(shortResult),
    extraActionField: slim(extraResult),
  });
}

// --- order, identity, at-most-once, successive args ---
{
  const source = `${env}let shown = 0;\n// state true\nexport async function entry(q: number) {\n  const first = await op(q);\n  q = 9;\n  const second = await op(first);\n  shown = second;\n}`;
  const machine = machineOf("succ.ts", source);
  const call = { kind: "call", entry: "entry", args: [3] };
  const resolve = (request, value) => ({ kind: "resolve", request, op: "op", value });
  const pending = await replayTrace("succ.ts", source, traceOf(machine, [call]));
  const first = await replayTrace("succ.ts", source, traceOf(machine, [call, resolve(1, 4)]));
  const secondOk = await replayTrace("succ.ts", source, traceOf(machine, [call, resolve(1, 4), resolve(2, 4)]));
  const secondStale = await replayTrace("succ.ts", source, traceOf(machine, [call, resolve(1, 4), resolve(2, 3)]));
  const secondAssigned = await replayTrace("succ.ts", source, traceOf(machine, [call, resolve(1, 4), resolve(2, 9)]));
  const before = await replayTrace("succ.ts", source, traceOf(machine, [resolve(1, 3)]));
  const twice = await replayTrace("succ.ts", source, traceOf(machine, [call, resolve(1, 4), resolve(1, 4)]));
  const reject = await replayTrace("succ.ts", source, traceOf(machine, [call, { kind: "reject", request: 1, op: "op" }]));
  const swap = `${env.replace("function op(q: number): Promise<number>", "function op(q: number): Promise<number>")}let shown = 0;\n// state true\nexport async function entry(q: number) { const value = await op(q); shown = value; }`;
  const sm = machineOf("swap.ts", swap);
  const cross = await replayTrace("swap.ts", swap, traceOf(sm, [
    { kind: "call", entry: "entry", args: [1] }, { kind: "call", entry: "entry", args: [7] },
    { kind: "resolve", request: 1, op: "op", value: 7 },
  ]));
  const crossOk = await replayTrace("swap.ts", swap, traceOf(sm, [
    { kind: "call", entry: "entry", args: [1] }, { kind: "call", entry: "entry", args: [7] },
    { kind: "resolve", request: 1, op: "op", value: 1 }, { kind: "resolve", request: 2, op: "op", value: 7 },
  ]));
  const boolSource = `${envBool}let shown = false;\n// state true\nexport async function entry(flag: boolean) { const value = await op(flag); shown = value; }`;
  const bm = machineOf("bool.ts", boolSource);
  const boolBad = await replayTrace("bool.ts", boolSource, traceOf(bm, [
    { kind: "call", entry: "entry", args: [false] }, { kind: "resolve", request: 1, op: "op", value: true },
  ]));
  const boolGood = await replayTrace("bool.ts", boolSource, traceOf(bm, [
    { kind: "call", entry: "entry", args: [false] }, { kind: "resolve", request: 1, op: "op", value: false },
  ]));
  cases.push({ name: "identity",
    pending: slim(pending),
    afterFirst: slim(first),
    secondMatchesFirstResult: slim(secondOk),
    secondUsesOriginalQ: slim(secondStale),
    secondUsesAssignedQ: slim(secondAssigned),
    resolveBeforeCall: slim(before),
    doubleResolve: slim(twice),
    rejectWithoutPermission: slim(reject),
    crossActivationWrongValue: slim(cross),
    crossActivationRightValues: slim(crossOk),
    boolMismatch: slim(boolBad),
    boolMatch: slim(boolGood),
  });
}

// --- rejection stutter ---
{
  const source = `// @environment\n// resolves Number.isFinite(result)\n// rejects\ndeclare function op(): Promise<number>;\nlet x = 0;\n// always x >= old(x)\nexport async function entry() { x = 1; await op(); x = -1; }`;
  const machine = machineOf("rej.ts", source);
  const call = { kind: "call", entry: "entry", args: [] };
  const afterCall = await replayTrace("rej.ts", source, traceOf(machine, [call]));
  const afterReject = await replayTrace("rej.ts", source, traceOf(machine, [call, { kind: "reject", request: 1, op: "op" }]));
  const afterResolve = await replayTrace("rej.ts", source, traceOf(machine, [call, { kind: "resolve", request: 1, op: "op", value: 1 }]));
  const doubleReject = await replayTrace("rej.ts", source, traceOf(machine, [call, { kind: "reject", request: 1, op: "op" }, { kind: "reject", request: 1, op: "op" }]));
  const rejectThenResolve = await replayTrace("rej.ts", source, traceOf(machine, [call, { kind: "reject", request: 1, op: "op" }, { kind: "resolve", request: 1, op: "op", value: 1 }]));
  cases.push({ name: "reject-stutter", afterCall: slim(afterCall), afterReject: slim(afterReject), afterResolve: slim(afterResolve), doubleReject: slim(doubleReject), rejectThenResolve: slim(rejectThenResolve) });
}

// --- clause fail-closed spot checks ---
{
  const base = `// @environment\n// resolves Number.isFinite(result)\ndeclare function op(): Promise<number>;\nlet x = 0;\n// state x >= 0\nexport function entry() { x = 1; }`;
  const variants = {
    "order-fifo": base.replace("// resolves", "// order fifo\n// resolves"),
    "abort": base.replace("// resolves", "// abort\n// resolves"),
    "settles-bare": base.replace("// resolves", "// settles\n// resolves"),
    "settles-case": base.replace("// resolves", "// Settles eventually\n// resolves"),
    "state-case": base.replace("// state x >= 0", "// STATE x >= 0"),
    "state-colon": base.replace("// state x >= 0", "// state: x >= 0"),
    "block-state": base.replace("// state x >= 0", "/* state x === 1 */"),
    "direct-recursion": base.replace("x = 1;", "entry();"),
    "global-recursion": base.replace("x = 1;", "globalThis.entry();"),
    "queue-microtask": `let x = 0;\n// state x === 0\nexport function boom() { x = 1; }\nexport function entry() { queueMicrotask(boom); }`,
  };
  const syntax = {};
  for (const [name, source] of Object.entries(variants)) {
    try {
      const report = await checkStateful(`${name}.ts`, source, { timeoutMs: 15000, maxDepth: 1 });
      syntax[name] = slim(report);
    } catch (error) {
      syntax[name] = { error: error.name, message: error.message };
    }
  }
  cases.push({ name: "fail-closed", syntax });
}

// --- containment ---
async function contain(name, source, actions, timeoutMs = 100) {
  return timed(name, 4000, async () => {
    const machine = machineOf(`${name}.ts`, source);
    const result = await replayTrace(`${name}.ts`, source, traceOf(machine, actions), { timeoutMs });
    return slim(result);
  });
}
cases.push({ name: "contain-sync-loop", ...(await contain("loop", `// @environment\ndeclare function op(): Promise<number>;\nlet x = 0;\n// state x === 0\nexport async function entry() { await op(); for (;;) {} }`, [{ kind: "call", entry: "entry", args: [] }, { kind: "resolve", request: 1, op: "op", value: 0 }])) });
cases.push({ name: "contain-microtask-chain", ...(await contain("chain", `let x = 0;\n// state x === 0\nexport function spin() { queueMicrotask(spin); }\nexport function entry() { queueMicrotask(spin); }`, [{ kind: "call", entry: "entry", args: [] }])) });
cases.push({ name: "contain-microtask-throw", ...(await contain("throwm", `let x = 0;\n// state x === 0\nexport function boom() { throw new Error("boom"); }\nexport function entry() { queueMicrotask(boom); }`, [{ kind: "call", entry: "entry", args: [] }])) });
cases.push({ name: "contain-continuation-throw", ...(await contain("cthrow", `// @environment\ndeclare function op(): Promise<number>;\nlet x = 0;\n// state x === 0\nexport async function entry() { await op(); throw new Error("x"); }`, [{ kind: "call", entry: "entry", args: [] }, { kind: "resolve", request: 1, op: "op", value: 0 }])) });
cases.push({ name: "contain-never-settle", ...(await contain("pending", `// @environment\ndeclare function op(): Promise<number>;\nlet x = 0;\n// state true\nexport async function entry() { await op(); x = 1; }`, [{ kind: "call", entry: "entry", args: [] }])) });
cases.push({ name: "contain-sync-throw-and-violate", ...(await contain("both", `let x = 0;\n// state x === 0\nexport function entry() { x = 1; throw new Error("boom"); }`, [{ kind: "call", entry: "entry", args: [] }])) });

// worker replacement probes
const workerPath = `${root}/verify/stateful/replay-worker.mjs`;
const workerBackup = readFileSync(workerPath);
async function withWorker(name, sourceText, fn) {
  writeFileSync(workerPath, sourceText);
  try { return await timed(name, 4000, fn); }
  finally { writeFileSync(workerPath, workerBackup); }
}
const dummy = `let x = 0;\n// state x === 0\nexport function entry() {}`;
const dummyMachine = machineOf("dummy.ts", dummy);
const dummyTrace = traceOf(dummyMachine, []);
cases.push({ name: "worker-missing", ...(await (async () => {
  const saved = workerBackup;
  rmSync(workerPath);
  try { return await timed("worker-missing", 4000, () => replayTrace("dummy.ts", dummy, dummyTrace)); }
  finally { writeFileSync(workerPath, saved); }
})()) });
cases.push({ name: "worker-hang", ...(await withWorker("worker-hang", `setInterval(() => {}, 1000000);\n`, () => replayTrace("dummy.ts", dummy, dummyTrace))) });
cases.push({ name: "worker-exit", ...(await withWorker("worker-exit", `process.exit(1);\n`, () => replayTrace("dummy.ts", dummy, dummyTrace))) });
cases.push({ name: "worker-wrong-id", ...(await withWorker("worker-wrong-id", `process.on("message", (m) => process.send({ id: (m.id ?? 0) + 99, ready: true }));\n`, () => replayTrace("dummy.ts", dummy, dummyTrace))) });
cases.push({ name: "worker-throw", ...(await withWorker("worker-throw", `process.on("message", () => { throw new Error("worker-boom"); });\n`, () => replayTrace("dummy.ts", dummy, dummyTrace))) });
cases.push({ name: "worker-disconnect", ...(await withWorker("worker-disconnect", `process.on("message", () => process.disconnect());\n`, () => replayTrace("dummy.ts", dummy, dummyTrace))) });

// --- solver-facing outcome probes ---
async function check(name, source, options = {}) {
  const started = performance.now();
  try {
    const report = await checkStateful(`${name}.ts`, source, { timeoutMs: 20000, maxDepth: 3, ...options });
    let native = null;
    if (report.status === "verified" || report.status === "unknown") {
      // Hand a concrete trace when the probe defines one via options.attack
    }
    return { name, ms: Math.round(performance.now() - started), report: slim(report), rawStatus: report.status, rawReason: report.reason, message: report.message, searched: report.searched ?? null };
  } catch (error) {
    return { name, ms: Math.round(performance.now() - started), error: error.name, message: error.message, sourceError: error instanceof SourceError };
  }
}
const solver = [];
solver.push(await check("pending-safety", `// @environment\n// resolves Number.isFinite(result)\ndeclare function op(): Promise<number>;\nlet pending = 0;\n// state pending === 0\nexport async function entry() {\n  pending = 1;\n  await op();\n  pending = 0;\n}`));
solver.push(await check("pending-safety-settles", `// @environment\n// resolves Number.isFinite(result)\n// settles eventually\ndeclare function op(): Promise<number>;\nlet pending = 0;\n// state pending === 0\nexport async function entry() {\n  pending = 1;\n  await op();\n  pending = 0;\n}`));
solver.push(await check("resume-violates", `// @environment\n// resolves Number.isFinite(result)\ndeclare function op(): Promise<number>;\nlet x = 0;\n// state x === 0\nexport async function entry() { await op(); x = 1; }`));
solver.push(await check("forced-five", `// @environment\n// resolves result === q\ndeclare function op(q: number): Promise<number>;\nlet shown = 0;\n// state shown !== 5\nexport async function entry(q: number) {\n  q = 5;\n  const value = await op(q);\n  shown = value;\n}`));
solver.push(await check("entry-arg-two", `let x = 0;\n// state x === 0\nexport function entry(q: number) { if (q === 2) x = 1; }`));
solver.push(await check("negative-zero-div", `// @environment\n// resolves Number.isFinite(result)\ndeclare function op(): Promise<number>;\nlet shown = 0;\n// state 1 / shown === Infinity\nexport async function entry() { const value = await op(); shown = value; }`));
solver.push(await check("object-is-zero", `// @environment\n// resolves Number.isFinite(result)\ndeclare function op(): Promise<number>;\nlet shown = 0;\n// state Object.is(shown, 0)\nexport async function entry() { const value = await op(); shown = value; }`));
solver.push(await check("inconsistent", `let x = 0;\n// state x === 0\n// state x === 1\nexport function entry() {}`));
solver.push(await check("depth-zero", `let x = 0;\n// state x === 0\nexport function entry() { x = 1; }`, { maxDepth: 0 }));
solver.push(await check("known-loop", `let x = 0;\n// state x >= 0\nexport function entry() { while (false) { x = 1; } }`));
solver.push(await check("for-ever-check", `// @environment\ndeclare function op(): Promise<number>;\nlet x = 0;\n// state x === 0\nexport async function entry() { await op(); for (;;) {} }`));

// If forced-five or object-is or pending was verified, confirm with an explicit native trace.
async function attack(file, source, actions) {
  const machine = machineOf(file, source);
  const result = await replayTrace(file, source, traceOf(machine, actions));
  return slim(result);
}
const attacks = {};
attacks.forcedFive = await attack("forced-five.ts", `// @environment\n// resolves result === q\ndeclare function op(q: number): Promise<number>;\nlet shown = 0;\n// state shown !== 5\nexport async function entry(q: number) {\n  q = 5;\n  const value = await op(q);\n  shown = value;\n}`, [
  { kind: "call", entry: "entry", args: [0] }, { kind: "resolve", request: 1, op: "op", value: 5 },
]);
attacks.argTwo = await attack("entry-arg-two.ts", `let x = 0;\n// state x === 0\nexport function entry(q: number) { if (q === 2) x = 1; }`, [
  { kind: "call", entry: "entry", args: [2] },
]);
attacks.negZero = await attack("negative-zero-div.ts", `// @environment\n// resolves Number.isFinite(result)\ndeclare function op(): Promise<number>;\nlet shown = 0;\n// state 1 / shown === Infinity\nexport async function entry() { const value = await op(); shown = value; }`, [
  { kind: "call", entry: "entry", args: [] }, { kind: "resolve", request: 1, op: "op", value: -0 },
]);
attacks.objectIs = await attack("object-is-zero.ts", `// @environment\n// resolves Number.isFinite(result)\ndeclare function op(): Promise<number>;\nlet shown = 0;\n// state Object.is(shown, 0)\nexport async function entry() { const value = await op(); shown = value; }`, [
  { kind: "call", entry: "entry", args: [] }, { kind: "resolve", request: 1, op: "op", value: -0 },
]);

// Reconfirm published counterexample traces.
const evidence = `${root}/verify/reports/roadmap/stateful-C1-evidence`;
const published = {};
for (const file of ["pilots-search-stale.json", "pilots-search-env.json", "pilots-search-overclaim.json", "variants-V8b-second-entry-reset.json", "pilots-search.json"]) {
  const saved = JSON.parse(readFileSync(`${evidence}/${file}`, "utf8"));
  if (!saved.trace) { published[file] = { status: saved.status, reason: saved.reason }; continue; }
  const fixture = file.startsWith("pilots-") ? `pilots/${file.slice("pilots-".length).replace(".json", ".ts")}` : `variants/${file.slice("variants-".length).replace(".json", ".ts")}`;
  const source = readFileSync(`${root}/tests/verify/fixtures/stateful/${fixture}`, "utf8");
  const again = await replayTrace(fixture, source, saved.trace);
  published[file] = { saved: saved.status, replay: again.status, violation: again.violation?.text ?? null, savedViolation: saved.violated?.text ?? null, match: again.violation?.text === saved.violated?.text, illegal: again.status === "illegal-environment-action" ? again.message : null };
}

// default-path compile spot check
let compiled = [];
try {
const parentDir = mkdtempSync(join(tmpdir(), "c1-parent-"));
symlinkSync("/Users/rick/verification-vibes/verified-list-ui/node_modules", join(parentDir, "node_modules"));
const parentFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", "e435c8abce3107f3afce5be2b10ae23102d269d2", "verify"], { cwd: "/Users/rick/.t3/worktrees/verified-list-ui/t3-dd1a1e06", encoding: "utf8" }).trim().split("\n").filter((p) => /^verify\/[^/]+\.mjs$/.test(p));
for (const path of parentFiles) {
  const dest = join(parentDir, path);
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, execFileSync("git", ["show", `e435c8abce3107f3afce5be2b10ae23102d269d2:${path}`], { cwd: "/Users/rick/.t3/worktrees/verified-list-ui/t3-dd1a1e06" }));
}
const parentCompile = await import(join(parentDir, "verify/source.mjs"));
const headCompile = await import(`${root}/verify/source.mjs`);
const parentLoad = await import(join(parentDir, "verify/modules.mjs"));
const headLoad = await import(`${root}/verify/modules.mjs`);
const examples = ["valid.ts", "bugs.ts", "loops.ts", "calls.ts", "collections.ts", "heap.ts", "callbacks.ts"].map((name) => join(root, "verify/examples", name));
for (const entry of examples) {
  try {
    const before = parentCompile.compile(parentLoad.load(entry).records);
    const after = headCompile.compile(headLoad.load(entry).records);
    compiled.push({ entry: entry.slice(root.length), equal: JSON.stringify(before) === JSON.stringify(after) });
  } catch (error) {
    compiled.push({ entry: entry.slice(root.length), error: error.name, message: String(error.message).slice(0, 300) });
  }
}
try { unlinkSync(join(parentDir, "node_modules")); } catch {}
rmSync(parentDir, { recursive: true, force: true });
} catch (error) {
  compiled = [{ error: error.name, message: String(error.message).slice(0, 500) }];
}

const processes = ps();
const summary = { cases, solver, attacks, published, compiled, processes, findings, notes };
writeFileSync(`${out}/probe.json`, JSON.stringify(summary, null, 2));
try {
  const kids = execFileSync("pgrep", ["-P", String(process.pid)], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  for (const pid of kids) { try { process.kill(Number(pid), "SIGKILL"); } catch {} }
} catch {}
console.log(JSON.stringify({
  solver: solver.map((s) => ({ name: s.name, ms: s.ms, status: s.report?.status ?? s.error, reason: s.report?.reason, message: s.message?.slice?.(0, 180) ?? s.report?.message })),
  attacks: Object.fromEntries(Object.entries(attacks).map(([k, v]) => [k, { status: v.status, violation: v.violation?.text ?? null, steps: v.steps }])),
  published,
  compiled,
  contain: cases.filter((c) => c.name?.startsWith("contain") || c.name?.startsWith("worker")).map((c) => ({ name: c.name, ms: c.ms, error: c.error, message: c.message, status: c.value?.status, reason: c.value?.reason, violation: c.value?.violation?.text ?? null })),
  identity: cases.find((c) => c.name === "identity"),
  trust: cases.find((c) => c.name === "trace-trust"),
  assumptions: cases.find((c) => c.name === "assumptions"),
  bits: cases.find((c) => c.name === "replay-cell-bits"),
  scalar: cases.find((c) => c.name === "scalar-bits"),
  reject: cases.find((c) => c.name === "reject-stutter"),
  syntax: cases.find((c) => c.name === "fail-closed"),
  processes,
}, null, 2));
process.exit(0);
