// Temporal judgment controls. Predictions were frozen before this process.
// Solver and replay run only when the parent invokes serial-verify.py.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { verify } from "../../../../index.mjs";
import { obligation, phases } from "../../../../proofs.mjs";
import { machineOf } from "../../../../stateful/machine.mjs";
import { transitionsOf } from "../../../../stateful/transitions.mjs";
import { checkStateful } from "../../../../stateful/index.mjs";
import { replayTrace, traceOf } from "../../../../stateful/traces.mjs";
import { decodeValue } from "../../../../stateful/values.mjs";

const scratchPath = `${tmpdir()}/tj-grok-9d9ef436-scratch.mjs`;
writeFileSync(scratchPath, execFileSync("git", ["show", "51a8bb6b3ae0897b242fa5781ac003796cc85a5a:verify/reports/roadmap/candidate-temporal-grok/probes/scratch.mjs"]));
const scratch = await import(pathToFileURL(scratchPath).href);

const root = new URL("..", import.meta.url);
const predictions = JSON.parse(readFileSync(new URL("predictions.json", root), "utf8"));
const predHash = createHash("sha256").update(readFileSync(new URL("predictions.json", root))).digest("hex");
const logs = new URL("logs/", root);
mkdirSync(logs, { recursive: true });
const observed = [];
const details = {};

function matches(predicted, actual) {
  if (Array.isArray(predicted)) return Array.isArray(actual) && predicted.length === actual.length && predicted.every((item, i) => matches(item, actual[i]));
  if (predicted && typeof predicted === "object") {
    if (Object.hasOwn(predicted, "reasonOneOf")) {
      const { reasonOneOf, ...rest } = predicted;
      return reasonOneOf.includes(actual?.reason) && matches(rest, actual);
    }
    return !!actual && typeof actual === "object" && Object.entries(predicted).every(([key, value]) => {
      if (typeof value === "string" && key.endsWith("Includes")) return String(actual[key] ?? "").includes(value);
      return matches(value, actual[key]);
    });
  }
  return Object.is(predicted, actual);
}
function record(id, actual) {
  if (actual && Object.hasOwn(actual, "machine")) {
    const { machine, ...rest } = actual;
    actual = rest;
  }
  const predicted = predictions.cases[id];
  const match = matches(predicted, actual);
  observed.push({ id, match, predicted, observed: actual });
  console.log(`${match ? "ok" : "DIFF"} ${id}`);
  writeFileSync(new URL("observed.json", logs), JSON.stringify({ predHash, observed }, null, 2) + "\n");
}
const cell = (name) => `let ${name} = 0;\n// state ${name} >= 0\n// always ${name} >= 0\n`;
const env = (lines) => `// @environment\n${lines}\ndeclare function op(): Promise<number>;\n`;
function front(source, body) {
  try {
    const machine = machineOf("probe.ts", source);
    const view = { status: "ok", kinds: machine.clauses.filter((c) => c.kind).map((c) => c.kind), ...(body ? body(machine) : {}) };
    view.machine = machine;
    return view;
  } catch (error) {
    return { status: error.status ?? "error", message: error.message ?? String(error), messageIncludes: error.message };
  }
}
function phaseA(entry) {
  const count = BigInt(entry.awaits.length);
  const labels = new Set();
  const waiting = [];
  entry.awaits.forEach((w, i) => {
    const rank = 2n * (count - BigInt(i));
    waiting.push(String(rank));
    labels.add("settle");
    labels.add("resume-resolve");
    if (w.op.rejects) labels.add("resume-reject");
  });
  return { top: String(2n * count), sites: waiting.length, waiting, labels: [...labels] };
}
const baseBool = `// state done === false || done === true\nlet done = false;\nexport async function work(): Promise<void> {\n  done = true;\n}\n`;

record("grammar-leads", front(`// leads work completes\n${baseBool}`));
record("grammar-leads-succeeds", front(`// leads work succeeds\n${baseBool}`));
record("grammar-leads-inside", front(`// state done === false || done === true\nlet done = false;\nexport async function work(): Promise<void> {\n  // leads work completes\n  done = true;\n}\n`));
record("grammar-fairness", front(`// fairness resumptions weak\n${baseBool}`));
record("grammar-fairness-case", front(`// FAIRNESS resumptions weak\n${baseBool}`));
record("grammar-fairness-punct", front(`// fairness.\n${baseBool}`));
record("grammar-fairness-typo", front(`// fairnes weak\n${baseBool}`));
record("grammar-fairness-unicode", front(`// f\u0430irness resumptions weak\n${baseBool}`));
record("grammar-abort", front(`// abort\n${baseBool}`));
record("grammar-block", front(`/* leads work completes */\n${baseBool}`));
record("grammar-settles-soon", front(`${env("// settles soon\n// resolves Number.isFinite(result)")}\n${cell("n")}export async function work(): Promise<void> {\n  const a: number = await op();\n  n = 1;\n}\n`));
record("grammar-env-fair", front(`${env("// fair settlement\n// resolves Number.isFinite(result)")}\n${cell("n")}export async function work(): Promise<void> {\n  const a: number = await op();\n  n = 1;\n}\n`));
for (const [id, line] of [
  ["grammar-completes-prose", "// completes"],
  ["grammar-fair-settlement-prose", "// fair settlement"],
  ["grammar-rank-prose", "// rank 1"],
  ["grammar-commits-prose", "// commits shown"],
  ["grammar-count-prose", "// count pending"],
]) record(id, front(`${line}\n${baseBool}`));

const early = front(`${env("// resolves Number.isFinite(result)")}\n${cell("n")}export async function work(): Promise<void> {\n  if (n === 0) return;\n  const a: number = await op();\n  n = 1;\n}\n`);
record("early-return", early);

const tailSource = `${env("// resolves Number.isFinite(result)\n// rejects")}\n${cell("n")}export async function work(): Promise<void> {\n  const a: number = await op();\n  if (a === 0) return;\n  n = 1;\n}\n`;
const tail = front(tailSource);
record("tail-return-shape", tail.status === "ok" ? {
  status: "ok", awaits: tail.machine.entries[0].awaits.length, segments: tail.machine.entries[0].segments.length,
  lastSegmentHasReturn: tail.machine.entries[0].segments.at(-1).some((s) => s.type === "ReturnStatement"),
} : tail);

const zeroSource = baseBool;
const zero = front(zeroSource);
record("zero-shape", zero.status === "ok" ? (() => {
  const entry = zero.machine.entries[0];
  const units = transitionsOf(zero.machine).units;
  const a = phaseA(entry);
  return { status: "ok", awaits: entry.awaits.length, segments: entry.segments.length, segmentStatements: entry.segments.map((s) => s.length),
    unitPrefix: units.map((u) => u.name), kinds: units.map((u) => u.kind), bRank: scratch.deriveSegmentRank(entry), aSites: a.sites, aTop: a.top };
})() : zero);

const twoSource = `${env("// resolves Number.isFinite(result)\n// rejects\n// settles eventually")}\n${cell("n")}export async function work(): Promise<void> {\n  const a: number = await op();\n  n = 1;\n  const b: number = await op();\n  n = 2;\n}\n`;
const two = front(twoSource);
record("two-shape", two.status === "ok" ? (() => {
  const entry = two.machine.entries[0];
  const units = transitionsOf(two.machine).units;
  const a = phaseA(entry);
  return { status: "ok", awaits: entry.awaits.length, segments: entry.segments.length, firstSegmentStatements: entry.segments[0].length,
    lastSegmentStatements: entry.segments.at(-1).length, hasEntryUnit: units.some((u) => u.name === "work$0" && u.kind === "entry"),
    bRank: scratch.deriveSegmentRank(entry), aWaiting: a.waiting, aEdgeLabels: a.labels };
})() : two);
record("assumptions-two", two.status === "ok" ? {
  eventBound: two.machine.assumptions.eventBound,
  schedulerIncludes: two.machine.assumptions.scheduler,
  fairnessIncludes: two.machine.assumptions.fairness,
  settles: two.machine.assumptions.environment[0].settles,
  settlesUse: two.machine.assumptions.environment[0].settlesUse,
  entryIncludes: two.machine.assumptions.entryCalls,
  mentionsTotality: JSON.stringify(two.machine.assumptions).includes("totality"),
} : two);

const multiSource = `${env("// resolves Number.isFinite(result)\n// rejects")}\n${cell("n")}export async function left(): Promise<void> {\n  // pending n >= 0\n  const a: number = await op();\n  n = n;\n}\nexport async function right(): Promise<void> {\n  // pending n >= 0\n  const b: number = await op();\n  n = n;\n}\n`;
const multi = front(multiSource);
record("multi-shape", multi.status === "ok" ? (() => {
  const units = transitionsOf(multi.machine).units;
  const a = phaseA(multi.machine.entries[0]);
  return { status: "ok", entries: multi.machine.entries.map((e) => e.name),
    unitPrefix: units.filter((u) => u.kind !== "interference").map((u) => u.name),
    rejectKind: units.find((u) => u.name === "$reject")?.kind ?? null,
    interferenceCount: units.filter((u) => u.kind === "interference").length,
    progressUnitCount: units.filter((u) => /rank|decrease|progress|completes/.test(u.name + u.kind)).length,
    aModeledEntry: multi.machine.entries[0].name, aSites: a.sites };
})() : multi);

async function play(file, source, actions, mutate) {
  const machine = machineOf(file, source);
  const trace = traceOf(machine, actions);
  if (mutate) mutate(trace);
  const report = await replayTrace(file, source, trace, { timeoutMs: 200 });
  const steps = report.trace?.steps ?? [];
  return {
    status: report.status, reason: report.reason ?? null, message: report.message ?? null,
    messageIncludes: report.message ?? "",
    faultIncludes: (report.faults ?? []).join("\n"),
    actions: steps.map((s) => s.action.kind),
    n: steps.map((s) => s.state && Object.hasOwn(s.state, "n") ? decodeValue(s.state.n) : null),
    done: steps.map((s) => s.state && Object.hasOwn(s.state, "done") ? decodeValue(s.state.done) : null),
    latest: steps.at(-1)?.state && Object.hasOwn(steps.at(-1).state, "latest") ? decodeValue(steps.at(-1).state.latest) : null,
    requests: steps.map((s) => (s.requests ? undefined : null)),
    requestRows: report.requests ?? [],
  };
}

const call = { kind: "call", entry: "work", args: [] };
const resolve = (request, value) => ({ kind: "resolve", request, op: "op", value });
const pendingOf = (report) => report.requestRows.filter((r) => !r.settled).length;
const zeroPlay = await play("zero.ts", zeroSource, [call]);
record("native-zero", { status: zeroPlay.status, actions: zeroPlay.actions, done: zeroPlay.done.filter((v) => v !== null), finalRequests: zeroPlay.requestRows.length });
const fuse = await play("two.ts", twoSource, [call, resolve(1, 1), resolve(2, 1)]);
record("native-fuse", { status: fuse.status, actions: fuse.actions, n: fuse.n.filter((v) => v !== null), finalRequests: fuse.requestRows.length, pending: pendingOf(fuse) });
details.fuseRequests = fuse.requestRows;
details.fuseSteps = fuse.actions.map((kind, i) => ({ kind, n: fuse.n[i] ?? null }));
const rejectPlay = await play("two.ts", twoSource, [call, { kind: "reject", request: 1, op: "op" }]);
record("native-reject", { status: rejectPlay.status, actions: rejectPlay.actions, n: rejectPlay.n.filter((v) => v !== null), finalRequests: rejectPlay.requestRows.length, pending: pendingOf(rejectPlay) });
const suppress = await play("tail.ts", tailSource, [call, resolve(1, 0)]);
record("native-suppress", { status: suppress.status, n: suppress.n.at(-1), pending: suppress.requestRows.filter((r) => !r.settled).length });
const publish = await play("tail.ts", tailSource, [call, resolve(1, 1)]);
record("native-publish", { status: publish.status, n: publish.n.at(-1), pending: publish.requestRows.filter((r) => !r.settled).length });
const prefix = await play("two.ts", twoSource, [call]);
record("native-prefix", { status: prefix.status, n: prefix.n.at(-1), pending: prefix.requestRows.filter((r) => !r.settled).length });

const partialSource = `${env("// resolves result > 0")}\n${cell("n")}export async function work(): Promise<void> {\n  const a: number = await op();\n  n = 1;\n}\n`;
const partialZero = await play("partial.ts", partialSource, [call, resolve(1, 0)]);
record("native-partial-zero", partialZero);
const partialOne = await play("partial.ts", partialSource, [call, resolve(1, 1)]);
record("native-partial-one", { status: partialOne.status, n: partialOne.n.at(-1), pending: partialOne.requestRows.filter((r) => !r.settled).length });
const falseSource = `${env("// resolves false\n// settles eventually")}\n${cell("n")}export async function work(): Promise<void> {\n  const a: number = await op();\n  n = 1;\n}\n`;
const falseResolve = await play("false.ts", falseSource, [call, resolve(1, 1)]);
record("native-false-resolve", falseResolve);
const collisionSource = `${env("// resolves Number.isFinite(result)")}\nlet latest = 9007199254740991;\n// state latest >= 0\nexport async function work(): Promise<void> {\n  const id: number = latest + 1;\n  latest = id;\n  const value: number = await op();\n}\n`;
const collision = await play("collision.ts", collisionSource, [{ kind: "call", entry: "work", args: [] }, { kind: "call", entry: "work", args: [] }]);
record("native-collision", { status: collision.status, latest: collision.latest, requests: collision.requestRows.length, pending: collision.requestRows.filter((r) => !r.settled).length });
const illegal = await play("two.ts", twoSource, [call, { kind: "bogus" }]);
record("native-illegal", { status: illegal.status });
const doubled = await play("two.ts", twoSource, [call, resolve(1, 1), resolve(1, 1)]);
record("native-double", { status: doubled.status });
const hashed = await play("two.ts", twoSource, [call], (trace) => { trace.assumptionsSha256 = "0".repeat(64); });
record("native-hash", hashed);
const throwSource = `// state n >= 0\nlet n = 0;\nexport async function work(): Promise<void> {\n  throw new Error("stop");\n}\n`;
const thrown = await play("throw.ts", throwSource, [call]);
record("native-throw", thrown);

function safetyView(report, resumeName) {
  const resume = report.units?.find((u) => u.unit === resumeName);
  return {
    status: report.status, reason: report.reason ?? null, message: report.message ?? null,
    eventBound: report.assumptions?.eventBound ?? null,
    resumeStatus: resume?.status ?? null,
    rejectUnits: (report.units ?? []).filter((u) => u.unit === "$reject").length,
    fairnessIncludes: report.assumptions?.fairness ?? report.message ?? "",
    maxDepth: report.searched?.maxDepth ?? null,
    units: (report.units ?? []).map((u) => ({ unit: u.unit, kind: u.kind, status: u.status })),
  };
}
const falseSafety = safetyView(await checkStateful("false.ts", falseSource, { timeoutMs: 60_000, maxDepth: 0 }), "work$1");
record("safety-false-resolves", falseSafety);
details.falseSafety = falseSafety.units;
const partialSafety = safetyView(await checkStateful("partial.ts", partialSource, { timeoutMs: 60_000, maxDepth: 0 }), "work$1");
record("safety-partial", partialSafety);
const gapSource = `${env("// resolves Number.isFinite(result)")}\nlet n = 0;\n// state n === 0\n// always n === 0\nexport async function work(): Promise<void> {\n  const a: number = await op();\n  n = 1;\n}\n`;
const gap = safetyView(await checkStateful("gap.ts", gapSource, { timeoutMs: 60_000, maxDepth: 0 }), "work$1");
record("safety-gap", gap);
const budget = safetyView(await checkStateful("gap.ts", gapSource, { timeoutMs: 1, maxDepth: 0 }), "work$1");
record("budget-gap", budget);

const ranks = `// requires Number.isInteger(k) && k === 1
// ensures real(k) - real(result) >= real("1") && real(result) >= real("0") && result === 0
function literalDrop(k: number): number { return 0; }
// requires Number.isInteger(k) && k === 1
// ensures real(k) - real(result) >= real("1") && real(result) >= real("0")
function literalStall(k: number): number { return k; }
// requires real(k) === real("1")
// ensures real(k) - real(result) >= real("1") && real(result) >= real("0")
function half(k: number): number { return k / 2; }
// requires Number.isInteger(k) && k === 1
// ensures true
function trueRank(k: number): number { return k; }
// requires k === 9007199254740992
// ensures result === k + 1
function saturated(k: number): number { return k + 1; }
`;
function outcomeMap(report) {
  return Object.fromEntries((report.outcomes ?? []).filter((o) => o.fn).map((o) => [o.fn, o.status]));
}
const rankReport = await verify(ranks, { file: "ranks.ts", timeoutMs: 60_000 });
const rankMap = outcomeMap(rankReport);
record("ranks", rankMap);
details.ranks = rankReport.outcomes?.map((o) => ({ fn: o.fn, status: o.status, reason: o.reason ?? null, phase: o.phase ?? null }));
const rankBudget = outcomeMap(await verify(ranks, { file: "ranks.ts", timeoutMs: 1 }));
record("budget-ranks", { someUnknown: Object.values(rankBudget).includes("unknown"), statuses: rankBudget });

const loop = `// ensures result === 0
function shadow(): number {
  let s = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && s === 0
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) { s = s; }
  return s;
}
`;
const { compile } = await import("../../../../source.mjs");
const { single } = await import("../../../../modules.mjs");
function scan(source, file) {
  const built = single(file, source);
  if (built.error) return { error: built.error.message };
  const targets = compile(built.records).targets;
  let bvule = false, eventBound = false, bv256 = false, bitvec = 0;
  for (const target of targets) for (const [phase, index] of phases(target)) {
    const text = obligation(target, phase, index).assertions.join("\n");
    bvule ||= text.includes("bvule");
    eventBound ||= text.includes("eventBound");
    bv256 ||= text.includes("_ bv256");
    bitvec += (text.match(/\(_ BitVec 64\)/g) ?? []).length;
  }
  return { assertionBvule: bvule, assertionEventBound: eventBound, assertionBv256: bv256, bitVec64Assertions: bitvec, ids: targets.map((t) => t.id) };
}
const loopScan = scan(loop, "loop.ts");
const loopReport = await verify(loop, { file: "loop.ts", timeoutMs: 60_000 });
record("loop-scan", { status: loopReport.outcomes?.find((o) => o.fn === "shadow")?.status ?? loopReport.outcomes?.[0]?.status, ...loopScan });
details.loop = loopScan;
const statefulScan = scanTargets(falseSource);
record("stateful-scan", statefulScan);
function scanTargets(source) {
  const machine = machineOf("scan.ts", source);
  const targets = transitionsOf(machine).units.map((u) => u.target);
  let bvule = false, eventBound = false, bv256 = false, bitvec = 0;
  for (const target of targets) for (const [phase, index] of phases(target)) {
    const text = obligation(target, phase, index).assertions.join("\n");
    bvule ||= text.includes("bvule");
    eventBound ||= text.includes("eventBound");
    bv256 ||= text.includes("_ bv256");
    bitvec += (text.match(/\(_ BitVec 64\)/g) ?? []).length;
  }
  return { assertionBvule: bvule, assertionEventBound: eventBound, assertionBv256: bv256, bitVec64Assertions: bitvec, eventBoundField: machine.assumptions.eventBound };
}

const stuck = { stem: [{ kind: "call" }], cycle: [{ kind: "other-call", settlesRepresentative: false }], representativePending: true, observationCut: "c1-action" };
record("classifier-both", scratch.classifyLasso(stuck, { settlesEventually: true, fairSettlement: true }));
record("classifier-only-settles", scratch.classifyLasso(stuck, { settlesEventually: true, fairSettlement: false }));
record("classifier-only-fair", scratch.classifyLasso(stuck, { settlesEventually: false, fairSettlement: true }));
record("classifier-neither", scratch.classifyLasso(stuck, { settlesEventually: false, fairSettlement: false }));
record("classifier-empty", scratch.classifyLasso({ stem: [], cycle: [] }, {}));
const fresh = { stem: [], cycle: [{ kind: "call", fresh: true }], representativePending: true };
const freshClass = scratch.classifyLasso(fresh, { settlesEventually: false, fairSettlement: false });
record("classifier-fresh", { ...freshClass, cycleHasCells: fresh.cycle.some((step) => Object.hasOwn(step, "cells") || Object.hasOwn(step, "pool")) });
record("classifier-not-pending", scratch.classifyLasso({ ...stuck, representativePending: false }, { settlesEventually: false, fairSettlement: false }));
record("composition-rule", {
  judgment: "unknown",
  reason: "no-correspondence-theorem",
  safety: falseSafety.status,
  literalDrop: rankMap.literalDrop ?? null,
  note: "Review rule only. Adjacent verified queries are not a source progress theorem.",
});

try { execFileSync("rm", ["-f", scratchPath]); } catch { /* scratch is outside the package */ }
const diffs = observed.filter((row) => !row.match).map((row) => row.id);
const summary = { predHash, diffs, cases: observed.length, head: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim() };
writeFileSync(new URL("summary.json", logs), JSON.stringify(summary, null, 2) + "\n");
writeFileSync(new URL("details.json", logs), JSON.stringify(details, null, 2) + "\n");
console.log(JSON.stringify(summary));
if (diffs.length) process.exitCode = 2;
