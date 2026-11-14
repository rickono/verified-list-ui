import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const code = "c1df5f6a7302dc70ede1c43649aa61295d3d80f7";
const repo = "/Users/rick/.t3/worktrees/verified-list-ui/t3-12ed5a98";
const modules = "/Users/rick/verification-vibes/verified-list-ui/node_modules";
const outDir = new URL(".", import.meta.url);
const root = join(tmpdir(), `c2a-native-review-${process.pid}`);
const results = [];
const record = (id, data) => results.push({ id, ...data });

const listener = `// @environment
// protocol node22-event-target-v1
declare const events: EventTarget;
let disposed = false;
let shown = 0;
// state shown === 0 || shown === 1
// always !old(disposed) || shown === old(shown)
export function bind() {
  const value: number = 1;
  const handler = () => { if (!disposed) shown = value; };
  events.addEventListener("x", handler);
  events.addEventListener("x", handler);
  return () => events.removeEventListener("x", handler);
}
export function dispose() { disposed = true; }
`;
const advisory = `// @environment
// resolves result === 1
// rejects
// abort advisory signal
declare function lookup(q: number, signal: AbortSignal): Promise<number>;
let disposed = false;
let shown = 0;
// state shown === 0 || shown === 1
// always !old(disposed) || shown === old(shown)
export async function search(q: number, signal: AbortSignal) {
  const value = await lookup(q, signal);
  if (disposed || signal.aborted) return;
  shown = value;
}
export function dispose(controller: AbortController) {
  disposed = true;
  controller.abort();
}
`;

function extract(dest) {
  mkdirSync(dest, { recursive: true });
  execFileSync("git", ["archive", code, "verify/stateful", "verify/source.mjs", "verify/proofs.mjs", "verify/error.mjs", "verify/solver.mjs", "verify/backend.mjs", "verify/data.mjs", "verify/types.mjs", "verify/specifications.mjs", "verify/heap.mjs", "verify/predicate-witness.mjs", "verify/heap-witness.mjs"], { cwd: repo, stdio: ["ignore", "pipe", "inherit"] }).pipe ?? null;
  const tar = execFileSync("git", ["archive", code, "verify/stateful", "verify/source.mjs", "verify/proofs.mjs", "verify/error.mjs", "verify/solver.mjs", "verify/backend.mjs", "verify/data.mjs", "verify/types.mjs", "verify/specifications.mjs", "verify/heap.mjs", "verify/predicate-witness.mjs", "verify/heap-witness.mjs"], { cwd: repo });
  execFileSync("tar", ["-x", "-C", dest], { input: tar });
  symlinkSync(modules, join(dest, "node_modules"));
}

function workers() {
  try { return execFileSync("pgrep", ["-fl", "replay-worker.mjs"], { encoding: "utf8" }).trim(); }
  catch { return ""; }
}

const h = (sort, id) => ({ type: "handle", sort, id });
const sha = (text) => createHash("sha256").update(text).digest("hex");

async function load(dest) {
  const base = pathToFileURL(join(dest, "verify/stateful/"));
  const [machine, traces, index, values] = await Promise.all([
    import(new URL("machine.mjs", base)),
    import(new URL("traces.mjs", base)),
    import(new URL("index.mjs", base)),
    import(new URL("values.mjs", base)),
  ]);
  return { machineOf: machine.machineOf, replayTrace: traces.replayTrace, traceOf: traces.traceOf, decodeValue: values.decodeValue, checkStateful: index.checkStateful };
}

function brief(decodeValue, result) {
  if (!result || typeof result !== "object") return result;
  const steps = result.trace?.steps?.map((step) => ({
    action: step.action?.kind,
    state: step.state && Object.fromEntries(Object.entries(step.state).map(([key, value]) => [key, value.bits ?? value])),
    cuts: step.cuts?.map((cut) => ({
      kind: cut.kind,
      state: cut.state && Object.fromEntries(Object.entries(cut.state).map(([key, value]) => [key, value.bits ?? value])),
    })),
  }));
  return {
    status: result.status, reason: result.reason ?? null, message: result.message ?? null,
    violation: result.violation ?? null, steps, registrations: result.registrations ?? null,
    requests: result.requests?.map(({ seq, op, settled, invocation }) => ({ seq, op, settled, invocation })) ?? null,
    signals: result.signals ?? null, invocations: result.invocations ?? null,
    decoded: steps?.at(-1)?.state && Object.fromEntries(Object.entries(result.trace.steps.at(-1).state).filter(([, value]) => value?.type === "number" || value?.type === "boolean").map(([key, value]) => [key, decodeValue(value)])),
  };
}

async function play(api, source, actions, { inputs = [], targets, timeoutMs, mutate } = {}) {
  try {
    const machine = api.machineOf("fixture.ts", source);
    const trace = api.traceOf(machine, actions, { inputs, ...(targets ? { targets } : {}) });
    mutate?.(trace);
    const started = Date.now();
    const result = await api.replayTrace(machine.file, source, trace, timeoutMs ? { timeoutMs } : {});
    return { ms: Date.now() - started, machineProtocol: Boolean(machine.protocol), ...brief(api.decodeValue, result) };
  } catch (error) { return { error: error?.stack ?? String(error) }; }
}

async function prove(api, source, options) {
  const started = Date.now();
  let report;
  try { report = await api.checkStateful("fixture.ts", source, options); }
  catch (error) { return { ms: Date.now() - started, error: error?.stack ?? String(error) }; }
  const units = report.units ?? [];
  return {
    ms: Date.now() - started, status: report.status, reason: report.reason ?? null, message: report.message ?? null,
    eventBound: report.assumptions?.eventBound ?? null, searched: report.searched ?? null,
    verified: units.filter((unit) => unit.status === "verified" || unit.status === "vacuous").length,
    units: units.length,
    bad: units.filter((unit) => !["verified", "vacuous"].includes(unit.status)).map((unit) => ({ unit: unit.unit, status: unit.status, reason: unit.reason ?? null })),
    violated: report.violated ?? null,
  };
}

const cell = (name, init, body) => `// @environment
// protocol node22-event-target-v1
declare const events: EventTarget;
let ${name} = ${init};
// state true
// always true
${body}
`;

extract(root);
const api = await load(root);
const parentAdd = EventTarget.prototype.addEventListener;
record("identity", {
  node: process.version,
  listenerSha: sha(listener),
  advisorySha: sha(advisory),
  nativeSha: sha(readFileSync(join(root, "verify/stateful/protocol-native.mjs"))),
});

try {
  const count = cell("n", "0", `export function bind() {
    const a = () => { n = n + 1; };
    events.addEventListener("x", a);
    events.addEventListener("x", a);
    return () => events.removeEventListener("x", a);
  }`);
  record("duplicate-once", await play(api, count, [{ kind: "call", entry: "bind", args: [], returns: "100" }, { kind: "dispatch", target: h("target", "1"), event: "x" }], { inputs: [] }));
  const alias = listener.replace('return () => events.removeEventListener("x", handler);', 'const alias = handler; return () => events.removeEventListener("x", alias);');
  const cleanup = [
    { kind: "call", entry: "bind", args: [], returns: "100" },
    { kind: "call", entry: "bind", args: [], returns: "101" },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
    { kind: "invoke", handle: h("remover", "100") },
    { kind: "invoke", handle: h("remover", "100") },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
    { kind: "invoke", handle: h("remover", "101") },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
  ];
  record("cleanup-210", await play(api, alias, cleanup, { inputs: [] }));
  const cycle = cell("n", "0", `export function cycle() {
    const a = () => { n = n + 1; };
    events.addEventListener("x", a);
    events.removeEventListener("x", a);
    events.addEventListener("x", a);
    events.removeEventListener("x", () => { n = n + 1; });
    return () => events.removeEventListener("x", a);
  }`);
  record("readd-absent", await play(api, cycle, [
    { kind: "call", entry: "cycle", args: [], returns: "100" },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
    { kind: "invoke", handle: h("remover", "100") },
    { kind: "invoke", handle: h("remover", "100") },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
  ], { inputs: [] }));

  const raw = [];
  {
    const target = new EventTarget();
    let n = 0;
    const make = () => { const fn = () => { n += 1; }; target.addEventListener("x", fn); target.addEventListener("x", fn); return fn; };
    const a = make(), b = make();
    const fire = () => { const before = n; target.dispatchEvent(new Event("x")); raw.push(n - before); };
    fire(); target.removeEventListener("x", a); target.removeEventListener("x", a); fire();
    target.removeEventListener("x", b); fire();
    const fresh = () => { n += 1; };
    target.addEventListener("x", a); target.removeEventListener("x", fresh); fire();
    let seen = "missing";
    const typed = (event) => { seen = event instanceof Event ? "Event" : typeof event; };
    target.addEventListener("z", typed); target.dispatchEvent(new Event("z"));
    let ignored = 0; const zero = () => { ignored = 1; };
    target.addEventListener("z", zero); target.dispatchEvent(new Event("z"));
    const order = [];
    const other = new EventTarget();
    const added = () => order.push("added");
    const first = () => { order.push("first"); other.addEventListener("x", added); };
    const trail = () => order.push("trail");
    other.addEventListener("x", first); other.addEventListener("x", trail); other.dispatchEvent(new Event("x"));
    raw.push({ seen, ignored, order });
  }
  record("uninstrumented", { raw });

  const many = `// @environment
// protocol node22-event-target-v1
declare const left: EventTarget;
// @environment
// protocol node22-event-target-v1
declare const right: EventTarget;
let n = 0;
// state true
// always true
export function bind() {
  const a = () => { n = n + 1; };
  left.addEventListener("x", a);
  right.addEventListener("x", a);
  left.addEventListener("y", a);
}
`;
  record("targets-distinct", await play(api, many, [
    { kind: "call", entry: "bind", args: [] },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
    { kind: "dispatch", target: h("target", "2"), event: "x" },
    { kind: "dispatch", target: h("target", "1"), event: "y" },
  ], { inputs: [], targets: { left: "1", right: "2" } }));
  record("targets-alias", await play(api, many, [
    { kind: "call", entry: "bind", args: [] },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
    { kind: "dispatch", target: h("target", "1"), event: "y" },
  ], { inputs: [], targets: { left: "1", right: "1" } }));

  const weak = `// @environment
// protocol node22-event-target-v1
declare const events: EventTarget;
let x=0;
// state 0 <= x && x <= 2
// always x - old(x) <= 1
export function bind() { const handler=()=>{if(x<2)x=x+1;}; events.addEventListener("x",handler); }
export function noop() {}
`;
  record("relation-native", await play(api, weak, [
    { kind: "call", entry: "bind", args: [] }, { kind: "call", entry: "bind", args: [] },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
  ], { inputs: [] }));
  record("relation-gap", await prove(api, weak, { maxDepth: 0, timeoutMs: 30000 }));
  record("relation-strengthened", await prove(api, weak.replace("// state 0 <= x && x <= 2", "// state 0 <= x && x <= 2\n// state x === 0 || x === 1 || x === 2"), { maxDepth: 0, timeoutMs: 30000 }));
  const c1 = `let x=0;\n// state 0 <= x && x <= 2\n// always x-old(x)<=1\nexport function entry(){if(x<2)x=x+1;if(x<2)x=x+1;}`;
  record("c1-endpoint", { native: await play(api, c1, [{ kind: "call", entry: "entry", args: [] }]), proof: await prove(api, c1, { maxDepth: 1, timeoutMs: 30000 }) });

  const stutter = `// @environment
// protocol node22-event-target-v1
declare const events: EventTarget;
let x=false;
// state true
// always x !== old(x)
export function noop() {}
`;
  const inputs = [{ id: "10", signal: "11", aborted: false }];
  record("empty-dispatch", await play(api, stutter, [{ kind: "dispatch", target: h("target", "1"), event: "x" }], { inputs }));
  record("allocate-stutter", await play(api, stutter, [{ kind: "allocate", controller: "30", signal: "31" }], { inputs }));
  record("abort-stutter", await play(api, stutter, [{ kind: "abort", controller: h("controller", "10") }], { inputs }));
  record("stutter-proof", await prove(api, `let x=false;\n// state true\n// always x !== old(x)\nexport function flip(controller:AbortController){x=!x;}`, { maxDepth: 0, timeoutMs: 30000 }));

  const fresh = listener.replace('return () => events.removeEventListener("x", handler);', 'return () => events.removeEventListener("x", () => { if (!disposed) shown = value; });');
  record("fresh-proof", await prove(api, fresh, { maxDepth: 0, timeoutMs: 30000 }));
  record("fresh-native", await play(api, fresh, [
    { kind: "call", entry: "bind", args: [], returns: "100" },
    { kind: "invoke", handle: h("remover", "100") },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
  ], { inputs: [] }));
  const unguarded = listener.replace("if (!disposed) shown", "shown");
  record("unguarded-native", await play(api, unguarded, [
    { kind: "call", entry: "bind", args: [], returns: "100" },
    { kind: "call", entry: "dispose", args: [] },
    { kind: "dispatch", target: h("target", "1"), event: "x" },
  ], { inputs: [] }));
  record("unguarded-proof", await prove(api, unguarded, { maxDepth: 3, timeoutMs: 30000 }));

  record("event-param", await prove(api, listener.replace("const handler = ()", "const handler = (event)"), { maxDepth: 0, timeoutMs: 5000 }));

  const graph = [{ id: "10", signal: "11", aborted: false }, { id: "20", signal: "21", aborted: false }];
  const search = { kind: "call", entry: "search", args: [0, h("signal", "11")] };
  const resolve = { kind: "resolve", request: 1, op: "lookup", value: 1 };
  record("late-abort", await play(api, advisory, [search, { kind: "abort", controller: h("controller", "10") }, resolve], { inputs: graph }));
  record("late-dispose", await play(api, advisory, [search, { kind: "call", entry: "dispose", args: [h("controller", "10")] }, resolve], { inputs: graph }));
  record("selected-then-abort", await play(api, advisory, [search, resolve, { kind: "abort", controller: h("controller", "10") }], { inputs: graph }));
  record("already-aborted", await play(api, advisory, [search, resolve], { inputs: [{ id: "10", signal: "11", aborted: true }] }));
  record("settle-abort", await play(api, advisory, [search, { ...resolve, kind: "settle-abort", controller: h("controller", "10") }], { inputs: graph }));
  record("distinct-abort", await play(api, advisory, [{ kind: "abort", controller: h("controller", "10") }], { inputs: graph }));
  record("shared-signal-owner", await play(api, advisory, [], { inputs: [{ id: "10", signal: "11", aborted: false }, { id: "20", signal: "11", aborted: false }] }));
  record("signal-as-target", await play(api, listener, [], { inputs: graph, targets: { events: "11" } }));

  const resumeState = advisory
    .replace("// resolves result === 1\n", "// resolves true\n")
    .replace("Promise<number>", "Promise<boolean>")
    .replace("let shown = 0;", "let shown = 0;")
    .replace("// state shown === 0 || shown === 1", "// state shown === 0")
    .replace("  const value = await lookup(q, signal);\n  if (disposed || signal.aborted) return;\n  shown = value;", "  await lookup(q, signal);\n  shown = 1;");
  record("resume-state", await play(api, resumeState, [search, { kind: "resolve", request: 1, op: "lookup", value: true }], { inputs: graph }));
  const repair = `// @environment
// resolves true
// abort advisory signal
declare function lookup(q: number, signal: AbortSignal): Promise<boolean>;
let x = false;
// state true
// always x !== old(x)
export async function search(q: number, signal: AbortSignal) {
  await lookup(q, signal);
  x = !x;
}
`;
  record("repair-abort", await play(api, repair, [{ kind: "abort", controller: h("controller", "10") }], { inputs: graph }));
  record("repair-settle", await play(api, repair, [
    { kind: "call", entry: "search", args: [0, h("signal", "11")] },
    { kind: "settle-abort", request: 1, op: "lookup", value: true, controller: h("controller", "10") },
  ], { inputs: graph }));

  const early = listener.replace("export function bind() {", "export function bind(skip: boolean) {\n  if (skip) return;").replace("shown = value", "shown = 1");
  record("early-return", await play(api, early, [{ kind: "call", entry: "bind", args: [true], returns: "100" }], { inputs: [] }));
  const constructed = advisory.replace("export function dispose", "export function allocate() { const c = new AbortController(); return c; }\nexport function dispose");
  record("return-alias", await play(api, constructed, [
    { kind: "call", entry: "allocate", args: [], returns: "1000000000" },
    { kind: "call", entry: "allocate", args: [], returns: "1000000000" },
  ], { inputs: graph }));

  const machine = api.machineOf("fixture.ts", advisory);
  const valid = api.traceOf(machine, [search, resolve], { inputs: graph });
  record("hash-mismatch", await brief(api.decodeValue, await api.replayTrace(machine.file, advisory, { ...valid, protocolSha256: "0".repeat(64) })));
  record("bad-id", await play(api, advisory, [{ kind: "call", entry: "search", args: [0, h("signal", "01")] }], { inputs: graph }));
  record("bad-zero-id", await play(api, advisory, [], { inputs: [{ id: "0", signal: "11", aborted: false }] }));
  record("duplicate-settlement", await play(api, advisory, [search, resolve, resolve], { inputs: graph }));
  record("suffix-after-violation", await play(api, advisory.replace("  if (disposed || signal.aborted) return;\n", ""), [
    search, { kind: "call", entry: "dispose", args: [h("controller", "10")] }, resolve, resolve,
  ], { inputs: graph }));
  record("unmarked-reject", await play(api, advisory.replace("// rejects\n", ""), [search, { kind: "reject", request: 1, op: "lookup" }], { inputs: graph }));
  record("resolves-two", await play(api, advisory, [search, { ...resolve, value: 2 }], { inputs: graph }));
  record("resolves-nan", await play(api, advisory, [search, { ...resolve, value: NaN }], { inputs: graph }));

  const bitsSource = advisory.replace("// resolves result === 1\n", "");
  const fp = {};
  for (const bits of ["7ff8000000000042", "fff8000000000037", "8000000000000000", "0000000000000000", "7ff0000000000000", "fff0000000000000", "0000000000000001"]) {
    const traced = api.traceOf(api.machineOf("bits.ts", bitsSource), [search, resolve], { inputs: graph });
    traced.actions[1].value.bits = bits;
    const result = await api.replayTrace("bits.ts", bitsSource, traced);
    fp[bits] = { status: result.status, violation: result.violation?.kind ?? null, shown: result.trace?.steps?.at(-1)?.state?.shown?.bits ?? null };
  }
  record("fp-bits", fp);

  const realm = `// @environment
// protocol node22-event-target-v1
declare const events: EventTarget;
let flag = 0;
let shown = 0;
// state true
// always true
export function f(q: number) {
  if (this !== undefined || typeof process !== "undefined") flag = 1;
  shown = q;
}
`;
  record("realm-argument", await play(api, realm, [{ kind: "call", entry: "f", args: [-0] }], { inputs: [] }));
  const looping = listener.replace("if (!disposed) shown = value;", "while (true) {}");
  record("script-timeout", await play(api, looping, [{ kind: "call", entry: "bind", args: [] }, { kind: "dispatch", target: h("target", "1"), event: "x" }], { inputs: [], timeoutMs: 100 }));
  record("workers-after-script-timeout", { workers: workers() });
  record("parent-kill", await play(api, looping, [{ kind: "call", entry: "bind", args: [] }, { kind: "dispatch", target: h("target", "1"), event: "x" }], { inputs: [], timeoutMs: 10000 }));
  record("workers-after-parent-kill", { workers: workers() });
  record("parent-prototype", { unchanged: EventTarget.prototype.addEventListener === parentAdd });

  const dispatchLine = readFileSync(join(root, "verify/stateful/protocol-native.mjs"), "utf8").match(/        run\(`if\(\$dispatching\)throw new \$Error\('Reentrant dispatch'\);[\s\S]*?if\(!\$dispatchCount\)\$observe\('empty-dispatch',null\);`\);/)?.[0];
  if (!dispatchLine) throw new Error("dispatch anchor missing");
  for (const [name, replacement] of [
    ["endpoint-mutant", dispatchLine.replace("if(!$dispatchCount)$observe('empty-dispatch',null);", `if(!$dispatchCount)$observe('empty-dispatch',null);
          else if($dispatchCount>1){const $end=$read(); $firstViolation ??= $check($dispatchPre,$end);}`).replace("$dispatchCount=0;", "$dispatchCount=0; const $dispatchPre=$cutPre;")],
    ["empty-mutant", dispatchLine.replace("if(!$dispatchCount)$observe('empty-dispatch',null);", "void 0;")],
  ]) {
    const dest = `${root}-${name}`;
    cpSync(root, dest, { recursive: true });
    const file = join(dest, "verify/stateful/protocol-native.mjs");
    const source = readFileSync(file, "utf8");
    if (!source.includes(dispatchLine)) throw new Error(`patch anchor missing for ${name}`);
    writeFileSync(file, source.replace(dispatchLine, replacement));
    const mutant = await load(dest);
    if (name === "endpoint-mutant") record(name, await play(mutant, weak, [
      { kind: "call", entry: "bind", args: [] }, { kind: "call", entry: "bind", args: [] },
      { kind: "dispatch", target: h("target", "1"), event: "x" },
    ], { inputs: [] }));
    else record(name, await play(mutant, stutter, [{ kind: "dispatch", target: h("target", "1"), event: "x" }], { inputs }));
    rmSync(dest, { recursive: true, force: true });
  }
} catch (error) {
  record("probe-exception", { message: error?.stack ?? String(error) });
} finally {
  record("workers-final", { workers: workers() });
  rmSync(root, { recursive: true, force: true });
}

writeFileSync(new URL("probe.json", outDir), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map((item) => ({ id: item.id, status: item.status ?? item.native?.status ?? null, reason: item.reason ?? null }))));
