// Frozen predictions were written before execution. Do not edit them to match results.
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.env.C2A_ROOT ?? "/tmp/c2a-measure";
const out = process.env.C2A_OUT ?? "/tmp/c2a-proof-out.json";
const load = (rel) => import(pathToFileURL(join(root, rel)).href);
const { machineOf } = await load("verify/stateful/machine.mjs");
const { transitionsOf } = await load("verify/stateful/transitions.mjs");
const { solve } = await load("verify/proofs.mjs");
const { SourceError } = await load("verify/error.mjs");
const { protocolTraceOf } = await load("verify/stateful/protocol-values.mjs");
const { executeProtocolNative } = await load("verify/stateful/protocol-native.mjs");
const { handleValue } = await load("verify/stateful/protocol-values.mjs");

const predictions = {
  "listener-shape": "38 units include both correspondence directions, stutter, and unary keeps; creation uses literal 1; queries have no search cap",
  "advisory-shape": "34 units include stutter and both directions; no listener handler",
  "abort-keeps-smt": "request abort/selected keeps are reflexive and do not mention abort or an updated membership map",
  "allocation-fresh-constant": "allocation inverse obligations mention the updated functions; the non-aborted conjunct is a reflexive ite",
  "creation-absence": "creation assumes global occupied absence, not one mismatched representative",
  "weaken-absence": "replacing the occupied-absence premise makes create's forward VC not verified",
  "omit-stutter": "deleting the stutter unit throws Incomplete protocol induction",
  "omit-forward": "deleting occurrence-index units throws",
  "omit-reverse": "deleting index-occurrence units throws",
  "omit-keeps": "deleting handler keeps throws",
  "direct-signal-member": "c.signal.aborted without an alias is rejected, not verified",
  "fresh-aborted-same-turn": "verified: a constructor signal read in the same segment is not aborted",
  "fresh-distinct": "not verified: two constructor identities are not a proved inequality",
  "input-alias": "not verified: distinct parameters may alias",
  "signal-stable": "verified: one controller's signal reads are the same identity",
  "stutter-load": "not verified: non-reflexive always fails the external stutter; native allocate/abort confirms",
  "collision-same": "verified: 2^53 neighbors are the same binary64 value",
  "collision-diff": "not verified: those neighbors are not proved distinct",
  "negzero-objectis": "not verified: assigning -0 does not establish Object.is(x, 0)",
  "negzero-init": "verified: a -0 cell initializer stays Object.is -0",
  "negzero-eq": "verified: assigning -0 preserves x === 0",
  "nan-isnan": "verified: 0/0 establishes Number.isNaN",
  "nan-objectis-zero": "not verified: 0/0 does not establish Object.is(x, 0)",
  "capture-plus": "not verified: a non-literal capture is not pinned to 2",
  "capture-zero-objectis": "capture literal 0 does not prove Object.is(shown, -0)",
  "div-after-allocate": "not verified: allocation does not admit division by an arbitrary parameter",
  "resolves-partial": "not verified: resolves 1/result === 1 does not discharge its own definedness",
  "resolves-handle": "rejected: signal.aborted in resolves",
  "pending-member": "rejected: protocol member in pending",
  "across-await-abort": "not verified: post-await aborted is not frozen false",
  "dead-division": "same-segment fresh aborted=false makes the division branch dead or the module unverified",
  "pure-read": "a signal.aborted read is heap, not pure",
  "pure-abort": "a bare abort is writes, not pure",
  "api-table": "a non-string source is rejected",
  "reserved-result": "a cell named result is rejected",
  "stutter-present-handle-only": "a constructor-only module still emits $stutter",
};

const TARGET = `// @environment
// protocol node22-event-target-v1
declare const events: EventTarget;
`;
const cases = [];
const record = (id, observed) => cases.push({ id, prediction: predictions[id], observed });

function compile(source, file = "probe.ts") {
  try {
    const machine = machineOf(file, source);
    const transitions = transitionsOf(machine);
    return { machine, transitions };
  } catch (e) {
    if (e instanceof SourceError) return { error: e.message, status: e.status, span: e.span };
    return { error: e.name + ": " + e.message };
  }
}
const slim = (r) => ({ status: r.status, reason: r.reason, phase: r.obligation?.phase, unit: undefined, message: r.message });
async function prove(source, file = "probe.ts") {
  const compiled = compile(source, file);
  if (compiled.error) return { rejected: true, ...compiled };
  const outcomes = await solve(compiled.transitions.units.map((u) => u.target), 20000);
  const units = compiled.transitions.units.map((u, i) => ({ name: u.name, kind: u.kind, status: outcomes[i].status, reason: outcomes[i].reason, phase: outcomes[i].obligation?.phase }));
  const bad = units.filter((u) => !["verified", "vacuous"].includes(u.status));
  return {
    rejected: false, proved: bad.length === 0, bad: bad.slice(0, 8),
    effects: compiled.transitions.units.filter((u) => u.kind === "entry" || u.kind === "handler").map((u) => ({ name: u.name, effects: u.target.effects, actions: u.protocolActions?.map((a) => a.kind) })),
  };
}

const listener = readFileSync(join(root, "tests/verify/fixtures/stateful/protocols/listeners.ts"), "utf8");
const advisory = readFileSync(join(root, "tests/verify/fixtures/stateful/protocols/advisory.ts"), "utf8");
const L = compile(listener, "listeners.ts");
const A = compile(advisory, "advisory.ts");
const names = (t) => t.transitions.units.map((u) => u.name);
const has = (list, s) => list.some((n) => n.includes(s));
record("listener-shape", {
  count: L.transitions.units.length,
  stutter: names(L).filter((n) => n.includes("stutter")),
  keeps: names(L).filter((n) => n.includes("$keeps$")),
  forward: names(L).filter((n) => n.endsWith("occurrence-index")),
  reverse: names(L).filter((n) => n.endsWith("index-occurrence")),
  handlerRequires: L.transitions.units.filter((u) => u.kind === "handler").map((u) => u.requires.map((c) => c.text)),
  captureEnsures: L.transitions.units.filter((u) => (u.ensures ?? []).some((c) => c.text === "immutable capture creation")).map((u) => u.ensures.filter((c) => c.text === "immutable capture creation").map((c) => c.text)),
  capInSmt: JSON.stringify(L.transitions.units.map((u) => u.target.post)).includes("maxDepth"),
});
record("advisory-shape", {
  count: A.transitions.units.length,
  stutter: names(A).includes("$stutter"),
  handlers: names(A).filter((n) => n.includes("closure")),
  forward: has(names(A), "$registry$create$occurrence-index"),
  reverse: has(names(A), "$registry$create$index-occurrence"),
});

const rule = (transitions, name) => transitions.units.find((u) => u.name === name);
const snip = (target) => ({ pre: target.pre, post: target.postconditions, defined: target.preDefined });
record("abort-keeps-smt", {
  abort: snip(rule(L.transitions, "$request$abort-keeps").target),
  selected: snip(rule(L.transitions, "$request$selected-keeps").target),
  mentionsAbort: JSON.stringify(snip(rule(L.transitions, "$request$abort-keeps").target)).includes("aborted"),
});
record("allocation-fresh-constant", snip(rule(L.transitions, "$handles$allocation").target));
record("creation-absence", {
  pre: rule(L.transitions, "$registry$creation").target.pre,
  forwardPre: rule(L.transitions, "$registry$create$occurrence-index").target.pre,
});

const weakened = rule(L.transitions, "$registry$create$occurrence-index").target;
const weakenedPre = weakened.pre.replace("(not ($occupied $target $event $callback))", "true");
const weakOutcome = await solve([{ ...weakened, pre: weakenedPre }], 20000);
record("weaken-absence", { replaced: weakenedPre !== weakened.pre, outcome: slim(weakOutcome[0]), originalPreHasAbsence: weakened.pre.includes("(not ($occupied $target $event $callback))") });

function mutant(id, file, from, to) {
  const dir = `/tmp/${id}`;
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(root, "verify"), join(dir, "verify"), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const path = join(dir, file);
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) return { patched: false };
  writeFileSync(path, text.replace(from, to));
  return { patched: true, dir };
}
async function rejectionOf(id, file, from, to, source, label) {
  const made = mutant(id, file, from, to);
  if (!made.patched) return record(id, { patched: false });
  const { machineOf: of } = await import(pathToFileURL(join(made.dir, "verify/stateful/machine.mjs")).href);
  const { transitionsOf: tr } = await import(pathToFileURL(join(made.dir, "verify/stateful/transitions.mjs")).href);
  try {
    tr(of(label, source));
    record(id, { patched: true, threw: false });
  } catch (e) {
    record(id, { patched: true, threw: true, message: e.message });
  }
}
await rejectionOf("omit-stutter", "verify/stateful/protocol-transitions.mjs",
  'steps.push({ name: "$stutter", kind: "stutter", span: at, params: [stateParam], requires: state(), ensures: [...state(), ...always()], modifies: [], body: [] });',
  "/* stutter deleted */", listener, "listeners.ts");
await rejectionOf("omit-forward", "verify/stateful/protocol-rules.mjs",
  "unit(`$registry$${operation}$occurrence-index`, [...own, forward(before, r)], [forward(after, r)]);",
  "void 0;", listener, "listeners.ts");
await rejectionOf("omit-reverse", "verify/stateful/protocol-rules.mjs",
  "unit(`$registry$${operation}$index-occurrence`, [...own, reverse(before, otherKey)], [reverse(after, otherKey)]);",
  "void 0;", listener, "listeners.ts");
await rejectionOf("omit-keeps", "verify/stateful/protocol-transitions.mjs",
  "for (const step of steps) for (const { step: handler, facts } of handlers) {",
  "for (const step of []) for (const { step: handler, facts } of handlers) {", listener, "listeners.ts");

const solved = [];
async function check(id, source) {
  solved.push(id);
  record(id, await prove(source));
}
const cell = (body, property = "state shown === 0") => `let shown = 0;\n// ${property}\n${body}`;

{
  const direct = compile(`let shown = 0;\n// state shown === 0\nexport function f() {\n  const c = new AbortController();\n  if (c.signal.aborted) shown = 1;\n}\n`);
  record("direct-signal-member", direct.error ? { rejected: true, message: direct.error, status: direct.status } : { rejected: false, units: direct.transitions.units.length });
}
await check("fresh-aborted-same-turn", `let shown = 0;\n// state shown === 0\nexport function f() {\n  const c = new AbortController();\n  const s = c.signal;\n  if (s.aborted) shown = 1;\n}\n`);
await check("fresh-distinct", `let shown = 0;\n// state shown === 0\nexport function f() {\n  const a = new AbortController();\n  const b = new AbortController();\n  if (a === b || a.signal === b.signal) shown = 1;\n}\n`);
await check("input-alias", `let shown = 0;\n// state shown === 0\nexport function f(a: AbortController, b: AbortController) {\n  if (a === b) shown = 1;\n}\n`);
await check("signal-stable", `let shown = 0;\n// state shown === 0\nexport function f(a: AbortController) {\n  const s = a.signal;\n  if (s !== a.signal) shown = 1;\n}\n`);
await check("stutter-load", `let x = 0;\n// always x === old(x) + 1\nexport function step(signal: AbortSignal) { x = x + 1; }\n`);
await check("collision-same", `let x = 0;\n// state x === 9007199254740993\nexport function f(signal: AbortSignal) { x = 9007199254740992; }\n`);
await check("collision-diff", `let x = 0;\n// state x !== 9007199254740993\nexport function f(signal: AbortSignal) { x = 9007199254740992; }\n`);
await check("negzero-objectis", `let x = 0;\n// state Object.is(x, 0)\nexport function f(signal: AbortSignal) { x = -0; }\n`);
await check("negzero-init", `let x = -0;\n// state Object.is(x, -0)\nexport function f(signal: AbortSignal) {}\n`);
await check("negzero-eq", `let x = 0;\n// state x === 0\nexport function f(signal: AbortSignal) { x = -0; }\n`);
await check("nan-isnan", `let x = 0;\n// state Number.isNaN(x)\nexport function f(signal: AbortSignal) { x = 0 / 0; }\n`);
await check("nan-objectis-zero", `let x = 0;\n// state Object.is(x, 0)\nexport function f(signal: AbortSignal) { x = 0 / 0; }\n`);
await check("capture-plus", `${TARGET}let shown = 0;\n// state shown === 0 || shown === 1\nexport function bind() {\n  const value = 1 + 1;\n  const handler = () => { shown = value; };\n  events.addEventListener("x", handler);\n}\n`);
await check("capture-zero-objectis", `${TARGET}let shown = 1;\n// state shown === 1 || Object.is(shown, -0)\nexport function bind() {\n  const value = 0;\n  const handler = () => { shown = value; };\n  events.addEventListener("x", handler);\n}\n`);
await check("div-after-allocate", `let shown = 0;\n// state shown === 1\nexport function f(q: number) {\n  const c = new AbortController();\n  shown = 1 / q;\n}\n`);
await check("resolves-partial", `// @environment\n// resolves 1 / result === 1\n// abort advisory signal\ndeclare function op(signal: AbortSignal): Promise<number>;\nlet shown = 0;\n// state shown === 0\nexport async function f(signal: AbortSignal) {\n  const value = await op(signal);\n}\n`);
{
  const handle = compile(`// @environment\n// resolves signal.aborted === false\n// abort advisory signal\ndeclare function op(signal: AbortSignal): Promise<number>;\nlet shown = 0;\n// state shown === 0\nexport async function f(signal: AbortSignal) { await op(signal); }\n`);
  record("resolves-handle", handle.error ? { rejected: true, message: handle.error } : { rejected: false });
}
{
  const pending = compile(`// @environment\n// resolves result === 1\n// abort advisory signal\ndeclare function op(signal: AbortSignal): Promise<number>;\nlet shown = 0;\n// state shown === 0\nexport async function f(signal: AbortSignal) {\n  // pending signal.aborted === false\n  await op(signal);\n}\n`);
  record("pending-member", pending.error ? { rejected: true, message: pending.error } : { rejected: false });
}
await check("across-await-abort", `// @environment\n// resolves result === 1\n// abort advisory signal\ndeclare function op(signal: AbortSignal): Promise<number>;\nlet shown = 0;\n// state shown === 0\nexport async function f() {\n  const c = new AbortController();\n  const s = c.signal;\n  await op(s);\n  if (s.aborted) shown = 1;\n}\n`);
await check("dead-division", `let shown = 0;\n// state Number.isFinite(shown)\nexport function f(q: number) {\n  const c = new AbortController();\n  const s = c.signal;\n  shown = s.aborted ? 1 / q : 1;\n}\n`);
const readOnly = compile(`let x = 0;\n// state x === 0\nexport function f(signal: AbortSignal) {\n  const flag: boolean = signal.aborted;\n}\n`);
record("pure-read", { error: readOnly.error, effects: readOnly.transitions?.units.filter((u) => u.name.endsWith("$0")).map((u) => u.target.effects) });
const abortOnly = compile(`let x = 0;\n// state x === 0\nexport function f(c: AbortController) { c.abort(); }\n`);
record("pure-abort", { error: abortOnly.error, effects: abortOnly.transitions?.units.filter((u) => u.kind === "entry").map((u) => ({ name: u.name, effects: u.target.effects, actions: u.protocolActions })) });
record("api-table", await (async () => {
  const { checkStateful } = await load("verify/stateful/index.mjs");
  try { return { threw: false, value: typeof await checkStateful("a.ts", { transitions: [] }) }; }
  catch (e) { return { threw: true, name: e.name, message: e.message }; }
})());
{
  const reserved = compile(`let result = 0;\n// state result === 0\nexport function f(signal: AbortSignal) {}\n`);
  record("reserved-result", reserved.error ? { rejected: true, message: reserved.error } : { rejected: false });
}
{
  const only = compile(`let x = 0;\n// state x === 0\nexport function f() { const c = new AbortController(); }\n`);
  record("stutter-present-handle-only", only.error ? { rejected: true, message: only.error } : { names: names(only).filter((n) => n === "$stutter" || n.includes("occurrence-index") || n.includes("index-occurrence")) });
}

const nativeSource = `let x = 0;\n// always x === old(x) + 1\nexport function step(signal: AbortSignal) { x = x + 1; }\n`;
const nativeCompiled = compile(nativeSource);
let native = { skipped: !nativeCompiled.machine };
if (nativeCompiled.machine) {
  const inputs = [{ id: "10", signal: "11", aborted: false }];
  const call = protocolTraceOf(nativeCompiled.machine, [{ kind: "call", entry: "step", args: [handleValue("signal", "11")] }], { inputs });
  const abort = protocolTraceOf(nativeCompiled.machine, [{ kind: "abort", controller: handleValue("controller", "10") }], { inputs });
  native = {
    call: await executeProtocolNative(nativeCompiled.machine, call, 1000),
    abort: await executeProtocolNative(nativeCompiled.machine, abort, 1000),
  };
  native = {
    call: { status: native.call.status, violation: native.call.violation ?? null, reason: native.call.reason ?? null },
    abort: { status: native.abort.status, violation: native.abort.violation ?? null, reason: native.abort.reason ?? null, message: native.abort.message ?? null },
  };
}
record("stutter-load-native", native);

const duplicates = [];
for (const unit of L.transitions.units) {
  const decls = unit.target.declarations.split("\n").filter((l) => l.startsWith("(declare-"));
  const seen = new Set();
  for (const line of decls) if (seen.has(line)) duplicates.push({ unit: unit.name, line }); else seen.add(line);
}
const result = { predictions, cases, solved, duplicateDeclarations: duplicates, node: process.version };
writeFileSync(out, JSON.stringify(result, (k, v) => typeof v === "function" || typeof v === "bigint" ? String(v) : v, 2));
console.log(JSON.stringify(cases.map((c) => ({ id: c.id, observed: c.observed?.proved ?? c.observed?.threw ?? c.observed?.rejected ?? c.observed?.error ?? c.observed })), null, 2));
