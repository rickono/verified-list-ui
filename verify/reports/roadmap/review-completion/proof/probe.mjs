// Correspondence probe for immutable 20ff205. Imports only the extracted archive.
// ARCHIVE=/tmp/cc-20ff205 node probe.mjs
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PREPARED = "/Users/rick/.t3/worktrees/verified-list-ui/t3-f467f016";
const ARCHIVE = process.env.ARCHIVE ?? "/tmp/cc-20ff205";
const EVIDENCE = "/Users/rick/.t3/worktrees/verified-list-ui/t3-64551363/verify/reports/roadmap/conditional-completion-evidence";
const BASE = "32bd5b260aa116ca88642a1479bed8d3fc447f4b";
const IMPL = "20ff20556fe19a72f73ccf3708d7bd7329ec2bc0";
const TIP = "1926a8af8effb2316c325b919cd501161877f40e";
const outPath = new URL("./probe-log.json", import.meta.url);
const href = (rel) => pathToFileURL(join(ARCHIVE, rel)).href;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (rel) => readFileSync(join(ARCHIVE, rel));

const { checkStateful } = await import(href("verify/stateful/index.mjs"));
const { machineOf } = await import(href("verify/stateful/machine.mjs"));
const { transitionsOf } = await import(href("verify/stateful/transitions.mjs"));
const { completionPlan, concludeCompletion } = await import(href("verify/stateful/temporal.mjs"));
const { C1_PROFILE } = await import(href("verify/stateful/environment.mjs"));
const { sha256 } = await import(href("verify/stateful/ast.mjs"));
const { replayTrace, traceOf, decodeValue } = await import(href("verify/stateful/traces.mjs"));
const { readCompletion } = await import(href("tests/verify/fixtures/completion-cases.mjs"));
const { solve } = await import(href("verify/proofs.mjs"));
const { compileAstUnit } = await import(href("verify/source.mjs"));
const specifications = await import(href("verify/specifications.mjs"));
const { implies } = await import(href("verify/data.mjs"));

const cases = [];
const write = () => writeFileSync(outPath, JSON.stringify({
  node: process.version, archive: ARCHIVE, prepared: PREPARED, cases,
  mismatches: cases.filter((c) => c.match === false).map((c) => c.id),
}, null, 2) + "\n");
const add = (row) => { cases.push(row); write(); console.log(`${row.match === false ? "MISMATCH" : "ok"} ${row.id}`); };

function ancestor(commit, head) {
  try { execFileSync("git", ["merge-base", "--is-ancestor", commit, head], { cwd: PREPARED, stdio: "ignore" }); return true; }
  catch { return false; }
}
function gitBytes(rev, path) {
  return execFileSync("git", ["show", `${rev}:${path}`], { cwd: PREPARED });
}

const heads = {
  prepared: execFileSync("git", ["rev-parse", "HEAD"], { cwd: PREPARED, encoding: "utf8" }).trim(),
  baselineAncestorOfPrepared: ancestor(BASE, "HEAD"),
  baselineAncestorOfImpl: ancestor(BASE, IMPL),
  implAncestorOfPrepared: ancestor(IMPL, "HEAD"),
  verifyPrepared: existsSync(join(PREPARED, "verify")),
  verifyArchive: existsSync(join(ARCHIVE, "verify")),
  pstack: [".pstack", "verify/.pstack", ".grok/pstack"].filter((p) => existsSync(join(PREPARED, p)) || existsSync(join(ARCHIVE, p))),
};
add({ id: "heads", match: heads.prepared === "c47bbc1bfe15461b27380c9226dcfe07b486d424" && heads.baselineAncestorOfPrepared && heads.baselineAncestorOfImpl && heads.verifyPrepared && heads.verifyArchive && heads.pstack.length === 0 && heads.implAncestorOfPrepared === false, observed: heads });

const tracked = [
  "verify/source.mjs", "verify/stateful/temporal.mjs", "verify/stateful/transitions.mjs",
  "verify/stateful/native.mjs", "verify/stateful/index.mjs", "verify/stateful/machine.mjs",
  "verify/stateful/clauses.mjs", "verify/stateful/environment.mjs", "verify/specifications.mjs",
  "tests/verify/conditional-completion.test.mjs",
];
const blobMatch = tracked.map((path) => {
  const archive = sha(text(path)), impl = sha(gitBytes(IMPL, path)), tip = sha(gitBytes(TIP, path));
  return { path, archive, impl, tip, match: archive === impl && impl === tip };
});
add({ id: "archive-blobs", match: blobMatch.every((r) => r.match), observed: blobMatch });

function receiptCheck(label) {
  const receipt = JSON.parse(readFileSync(join(EVIDENCE, label, "receipt.json"), "utf8"));
  const rows = Object.entries(receipt.sha256).map(([path, digest]) => {
    const impl = sha(gitBytes(IMPL, path));
    const tip = sha(gitBytes(TIP, path));
    return { path, digest, impl, tip, match: digest === impl && digest === tip };
  });
  const log = readFileSync(join(EVIDENCE, label, "run.txt"), "utf8");
  const summary = Object.fromEntries([...log.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)/gm)].map((m) => [m[1], Number(m[2])]));
  return { label, runHead: receipt.runHead, exitCode: receipt.exitCode, coreUnchangedDuringRun: receipt.coreUnchangedDuringRun, files: rows.length, mismatched: rows.filter((r) => !r.match).map((r) => r.path), summary };
}
const focused = receiptCheck("focused-final");
const full = receiptCheck("full-final");
const focused1 = receiptCheck("focused-1");
const sums = readFileSync(join(EVIDENCE, "SHA256SUMS"), "utf8").trim().split("\n");
let sumBad = 0;
for (const line of sums) {
  const digest = line.slice(0, 64), rel = line.slice(66).trim();
  const file = join("/Users/rick/.t3/worktrees/verified-list-ui/t3-64551363", rel);
  if (sha(readFileSync(file)) !== digest) sumBad++;
}
add({ id: "inherited-receipts", match: focused.mismatched.length === 0 && full.mismatched.length === 0 && focused.summary.tests === 61 && focused.summary.pass === 61 && focused.summary.fail === 0 && full.summary.tests === 496 && full.summary.pass === 496 && full.summary.fail === 0 && full.exitCode === 0 && sumBad === 0 && focused1.summary.fail === 6, observed: { focused, full, focused1: { runHead: focused1.runHead, summary: focused1.summary, mismatched: focused1.mismatched.length }, sumLines: sums.length, sumBad } });

const read = (name) => readCompletion(name);
const scalar = (type) => ["number", "boolean", "undefined"].includes(type);
const scalarRecord = (type) => type?.kind === "object" && type.fields.every((f) => scalar(f.type) && !f.optional);
function derivedRank(before, after) {
  return specifications.rankDecrease(specifications.exact(String(before)), specifications.exact(String(after)));
}
function derivedNonnegative(after) {
  return specifications.binary(">=", specifications.exact(String(after)), specifications.exact("0")).smt;
}
function inspect(source, file = "p.ts") {
  const machine = machineOf(file, source);
  const transitions = transitionsOf(machine);
  const plan = completionPlan(machine, transitions);
  const exits = [];
  for (const unit of [...transitions.units, ...(transitions.completionRejections ?? [])]) {
    const control = unit.target?.control;
    if (!control) continue;
    const frameAgrees = unit.target.params.every((p) => scalar(p.type) || p.name === "$s" && scalarRecord(p.type))
      && (scalar(unit.target.resultType) || scalarRecord(unit.target.resultType))
      && unit.target.footprint.every((f) => f.path[0] === "$s");
    for (const [i, exit] of control.exits.entries()) {
      const progress = control.checks[exit.progress];
      const nonnegative = control.checks[exit.nonnegative];
      const decrease = derivedRank(control.rankBefore, exit.rankAfter);
      const nonneg = derivedNonnegative(exit.rankAfter);
      exits.push({
        unit: unit.name, i, kind: exit.kind, site: exit.site ?? null,
        rankBefore: control.rankBefore, rankAfter: exit.rankAfter, span: exit.span, path: exit.path,
        progressKind: progress?.kind, progressExit: progress?.exit, progressSpan: progress?.span,
        progressSmt: progress?.smt, decrease, progressMatch: progress?.kind === "own-progress" && progress.exit === i
          && progress.span?.start === exit.span?.start && progress.span?.end === exit.span?.end
          && (progress.smt === implies(exit.path, decrease) || decrease === "true" && progress.smt === "true"),
        nonnegativeSmt: nonnegative?.smt, nonneg, nonnegativeMatch: nonnegative?.kind === "rank-nonnegative" && nonnegative.exit === i
          && (nonnegative.smt === implies(exit.path, nonneg) || nonneg === "true" && nonnegative.smt === "true"),
        viability: exit.viability === undefined ? null : control.checks[exit.viability]?.smt,
        rejects: exit.request?.rejects ?? null, request: exit.request?.op ?? null,
      });
    }
    exits.push({ unit: unit.name, identityFrame: control.identityFrame, frameAgrees, footprint: unit.target.footprint,
      cutpoints: control.cutpoints, callees: control.callees, checks: control.checks.map((c) => c.kind) });
  }
  const queries = JSON.stringify(plan.targets.map((t) => [t.target.declarations, t.target.pre, t.target.preDefined, t.target.postconditions, t.target.control?.checks]));
  return { machine, transitions, plan, exits, queryHits: ["eventBound", "activationBound", "maxDepth", "bv256", "poolLimit", "activationCount"].filter((s) => queries.includes(s)),
    profileMatch: plan.binding.profileSha256 === sha256(JSON.stringify(C1_PROFILE)),
    kinds: [...new Set(plan.obligations.map((o) => o.kind))],
    missing: plan.obligations.filter((o) => o.status !== "checked").map((o) => o.id) };
}

function brief(report) {
  const goals = report?.completion?.goals?.map((g) => ({ entry: g.entry, status: g.status, reason: g.reason ?? null,
    nativeConfirmed: g.nativeConfirmed, assumptions: g.assumptions?.map((a) => ({ kind: a.kind, op: a.op ?? null, classification: a.classification })) }));
  return { status: report?.status ?? null, message: report?.message ?? null, safety: report?.safety?.status ?? null,
    reason: report?.reason ?? null, closed: report?.completion?.closed ?? null, nativeConfirmed: report?.completion?.nativeConfirmed ?? null,
    goals: goals ?? null, eventBound: report?.assumptions?.eventBound ?? null };
}
const subset = (observed, expected) => Object.entries(expected).every(([k, v]) => JSON.stringify(observed?.[k]) === JSON.stringify(v));

const zeroLike = (body) => read("zero").replace("done = true;", body);
const asyncOf = (env, body, extra = "") => `${env}
let n = 0;
// state n >= 0
// leads work completes
export async function work() {
${body}
}
${extra}`;
const finiteEnv = `// @environment
// resolves Number.isFinite(result)
// settles eventually
declare function op(): Promise<number>;`;
const domain = (resolves, type = "number", params = "", args = "") => `// @environment
// resolves ${resolves}
// settles eventually
declare function op(${params}): Promise<${type}>;
let n = 0;
// state n >= 0
// leads work completes
export async function work(${params.includes(":") ? params : ""}) { await op(${args}); n = 1; }`;

const structuralSources = {
  zero: read("zero"), one: read("one"), two: read("two"), false: read("false"), partial: read("partial"),
  empty: zeroLike(""), "all-tail": zeroLike("if (done) return; else return;"),
  fallthrough: zeroLike("if (done) return;"),
  duplicate: zeroLike("if (done) done = true; else done = false; return;"),
  nested: zeroLike("if (done) { if (done) return 1; } return 0;"),
};
for (const [name, source] of Object.entries(structuralSources)) {
  try {
    const info = inspect(source, `${name}.ts`);
    const exitRows = info.exits.filter((e) => e.kind);
    const frames = info.exits.filter((e) => e.identityFrame !== undefined);
    const viabilityOk = exitRows.every((e) => e.viability === null || (e.rejects ? e.viability === "true" : e.viability.includes("exists") && e.viability !== "true"));
    add({ id: `derive:${name}`, match: exitRows.every((e) => e.progressMatch && e.nonnegativeMatch) && viabilityOk && frames.every((f) => f.identityFrame === true && f.frameAgrees === true && f.cutpoints === 0 && f.callees.length === 0) && info.queryHits.length === 0 && info.profileMatch && info.missing.length === 0, observed: { ranks: exitRows.map((e) => ({ unit: e.unit, kind: e.kind, rankBefore: e.rankBefore, rankAfter: e.rankAfter, progressSmt: e.progressSmt, decrease: e.decrease, viability: e.viability, rejects: e.rejects })), frames: frames.map((f) => ({ unit: f.unit, footprint: f.footprint, checks: f.checks })), kinds: info.kinds, queryHits: info.queryHits, profileMatch: info.profileMatch, missing: info.missing } });
  } catch (error) { add({ id: `derive:${name}`, match: false, observed: { error: String(error?.message ?? error) } }); }
}

const nativeSource = text("verify/stateful/native.mjs").toString("utf8");
add({ id: "profile-binding", match: nativeSource.includes("microtaskMode: C1_PROFILE.microtaskMode") && nativeSource.includes("run(C1_PROFILE.drain)") && nativeSource.includes("let $nextActivation = 0n") && nativeSource.includes("Number.isSafeInteger(action.request)"), observed: { profile: C1_PROFILE, profileSha: sha256(JSON.stringify(C1_PROFILE)) } });

async function admit(id, source, expected) {
  try {
    const report = await checkStateful(`${id}.ts`, source, { timeoutMs: 20000, maxDepth: 1 });
    const observed = brief(report);
    add({ id, match: subset(observed, expected), expected, observed });
    return report;
  } catch (error) {
    add({ id, match: false, expected, observed: { thrown: String(error?.message ?? error) } });
  }
}
async function native(id, source, actions, pred) {
  try {
    const machine = machineOf(`${id}.ts`, source);
    const result = await replayTrace(`${id}.ts`, source, traceOf(machine, actions));
    const steps = result.trace?.steps ?? [];
    const observed = { status: result.status, message: result.message ?? null, kinds: steps.map((s) => s.action.kind),
      cells: steps.map((s) => Object.fromEntries(Object.entries(s.state ?? {}).map(([k, v]) => [k, v?.type ? decodeValue(v) : v]))),
      activations: steps.map((s) => s.activations ?? null), requests: result.requests ?? null };
    add({ id, match: pred(observed), observed });
    return observed;
  } catch (error) { add({ id, match: false, observed: { thrown: String(error?.message ?? error) } }); }
}
const call = (entry = "work", args = []) => ({ kind: "call", entry, args });
const resolve = (request, value, op = "op") => ({ kind: "resolve", request, op, value });
const reject = (request, op = "op") => ({ kind: "reject", request, op });

await native("native-two", read("two"), [call(), resolve(1, 1), resolve(2, 1)], (o) => o.status === "ok" && JSON.stringify(o.kinds) === JSON.stringify(["init", "call", "resolve", "resolve"]) && JSON.stringify(o.cells.map((c) => c.n)) === JSON.stringify([0, 0, 1, 2]) && o.activations.at(-1)?.[0]?.status === "returned");
await native("native-reject", read("two"), [call(), reject(1)], (o) => o.status === "ok" && o.cells.at(-1).n === 0 && o.activations.at(-1)?.[0]?.status === "environment-rejected" && o.requests.length === 1);
await native("native-suppress", read("two"), [call(), resolve(1, 0), resolve(2, 0)], (o) => o.status === "ok" && o.cells.at(-1).n === 1 && o.activations.at(-1)?.[0]?.status === "returned");
await native("native-distinct", read("one"), [call(), call(), reject(1)], (o) => o.status === "ok" && o.activations.at(-1)?.[0]?.status === "environment-rejected" && o.activations.at(-1)?.[1]?.status === "live" && o.activations.at(-1)?.[0]?.id !== o.activations.at(-1)?.[1]?.id);
await native("native-interfere", read("two"), [call(), call("disturb"), resolve(1, 1), resolve(2, 1)], (o) => o.status === "ok" && o.activations[2]?.find((a) => a.entry === "work")?.status === "live" && o.activations.at(-1)?.every((a) => a.status === "returned"));
await native("native-prefix", read("two"), [call()], (o) => o.status === "ok" && o.activations.at(-1)?.[0]?.status === "live");
await native("native-saturation", read("saturation"), [call(), call()], (o) => o.status === "ok" && o.cells.at(-1).latest === 2 ** 53 && o.requests?.length === 2 && JSON.stringify(o.requests.map((r) => r.activation)) === JSON.stringify(["1", "2"]) && JSON.stringify(o.activations.at(-1)?.map((a) => a.id)) === JSON.stringify(["1", "2"]));

const positive = read("false").replace("resolves false", "resolves result > 0");
for (const [value, okStatus] of [[0, false], [1, true], [Number.NaN, false], [Infinity, true], [-0, false], [-Infinity, false]]) {
  await native(`native-domain-${Object.is(value, -0) ? "-0" : String(value)}`, positive, [call(), resolve(1, value)], (o) => okStatus ? o.status === "ok" && o.activations.at(-1)?.[0]?.status === "returned" : o.status === "illegal-environment-action");
}
const nanSource = domain("Number.isNaN(result)");
await native("native-nan-ok", nanSource, [call(), resolve(1, Number.NaN)], (o) => o.status === "ok");
await native("native-nan-reject-zero", nanSource, [call(), resolve(1, 0)], (o) => o.status === "illegal-environment-action");
const negZeroSource = domain("Object.is(result, -0)");
await native("native-negzero-ok", negZeroSource, [call(), resolve(1, -0)], (o) => o.status === "ok");
await native("native-negzero-plus", negZeroSource, [call(), resolve(1, 0)], (o) => o.status === "illegal-environment-action");
const eqNan = domain("result === NaN");
await native("native-eq-nan", eqNan, [call(), resolve(1, Number.NaN)], (o) => o.status === "illegal-environment-action");

for (const [id, source] of [
  ["grammar-succeeds", zeroLike("").replace("// leads work completes", "// leads work succeeds")],
  ["grammar-fair-settlement", zeroLike("").replace("// leads work completes", "// fair settlement")],
  ["grammar-confusable", zeroLike("").replace("// leads work completes", "// lеаds work completes")],
  ["grammar-block", zeroLike("").replace("// leads work completes", "/* leads work completes */")],
  ["grammar-scheduler-word", zeroLike("").replace("// leads work completes", "// scheduler c1")],
  ["return-before-await", asyncOf(finiteEnv + "\n// rejects", "  if (n === 0) return;\n  await op();")],
  ["loop-sync", zeroLike("while (true) {}")],
  ["loop-after-await", asyncOf(finiteEnv, "  await op();\n  while (true) {}")],
  ["throw-after-await", asyncOf(finiteEnv, "  await op();\n  throw new Error(\"stop\");")],
  ["helper", zeroLike("const f = () => 0; f();")],
  ["promise", zeroLike("return Promise.resolve(0);")],
  ["object", zeroLike("const a = {};")],
  ["try", zeroLike("try { done = true; } catch {}")],
  ["await-nested", asyncOf(finiteEnv, "  if (n === 0) { await op(); }")],
]) {
  const report = await admit(id, source, { status: "unsupported" });
  if (report?.status === "verified") add({ id: `${id}-verified-defect`, match: false, observed: brief(report) });
}
const scheduler = await checkStateful("scheduler.ts", read("one"), { scheduler: "delayed", timeoutMs: 5000 });
const protocol = await checkStateful("protocol.ts", read("one"), { protocol: "c2a", timeoutMs: 5000 });
add({ id: "reject-scheduler-protocol", match: scheduler.status === "unsupported" && protocol.status === "unsupported", observed: { scheduler: brief(scheduler), protocol: brief(protocol) } });

const solved = {};
for (const [id, source, expected] of [
  ["solve-zero", read("zero"), { status: "verified", safety: "verified", closed: true, nativeConfirmed: false }],
  ["solve-one", read("one"), { status: "verified", closed: true, nativeConfirmed: false }],
  ["solve-two", read("two"), { status: "verified", closed: true, nativeConfirmed: false }],
  ["solve-empty", zeroLike(""), { status: "verified", closed: true }],
  ["solve-all-tail", zeroLike("if (done) return; else return;"), { status: "verified" }],
  ["solve-fallthrough", zeroLike("if (done) return;"), { status: "verified" }],
  ["solve-duplicate", zeroLike("if (done) done = true; else done = false; return;"), { status: "verified" }],
  ["solve-nested", zeroLike("if (done) { if (done) return 1; } return 0;"), { status: "verified" }],
  ["solve-false", read("false"), { status: "unknown", safety: "verified", reason: "outcome-viability" }],
  ["solve-partial", read("partial"), { status: "unknown", safety: "verified", reason: "outcome-viability" }],
  ["solve-rejection-only", read("false").replace("// resolves false", "// resolves false\n// rejects"), { status: "verified", closed: true }],
  ["solve-positive", positive, { status: "verified" }],
  ["solve-missing-settlement", read("one").replace("// settles eventually\n", ""), { status: "unknown", safety: "verified" }],
  ["solve-boolean", domain("result === true || result === false", "boolean"), { status: "verified" }],
  ["solve-eq-nan", eqNan, { status: "unknown", safety: "verified", reason: "outcome-viability" }],
  ["solve-isnan", nanSource, { status: "verified" }],
  ["solve-both-zeros", domain("Object.is(result, 0) && Object.is(result, -0)"), { status: "unknown", reason: "outcome-viability" }],
  ["solve-negzero", negZeroSource, { status: "verified" }],
  ["solve-infinity", domain("result === Infinity"), { status: "verified" }],
  ["solve-neginfinity", domain("result === -Infinity"), { status: "verified" }],
  ["solve-correlated", read("partial").replace("q > 0 && result > 0", "Object.is(result, q)"), { status: "verified" }],
  ["solve-correlated-negzero-symbolic", domain("Object.is(result, q) && Object.is(q, -0)", "number", "q: number", "q"), { status: "unknown", reason: "outcome-viability" }],
  ["solve-correlated-negzero-constant", domain("Object.is(result, q) && Object.is(q, -0)", "number", "q: number", "-0").replace("export async function work(q: number)", "export async function work"), { status: "verified" }],
  ["solve-real", domain("real(result) > real(\"0\")"), { status: "verified" }],
  ["solve-real-nonfinite", domain("real(result) > real(\"0\") && !Number.isFinite(result)"), { status: "unknown", reason: "outcome-viability" }],
  ["solve-real-partial-arg", domain("q > 0 && real(result) > real(\"0\")", "number", "q: number", "q"), { status: "unknown", reason: "outcome-viability" }],
  ["solve-reachable-real", domain("q > 0 && real(result) > real(\"0\")", "number", "q: number", "1").replace("export async function work(q: number)", "export async function work"), { status: "verified" }],
  ["solve-foreign-reject", `// @environment
// resolves false
// settles eventually
declare function op(): Promise<number>;
// @environment
// resolves false
// rejects
// settles eventually
declare function other(): Promise<number>;
let n = 0;
// state n >= 0
// leads work completes
export async function work() { await op(); n = 1; }`, { status: "unknown", safety: "verified", reason: "outcome-viability" }],
  ["solve-sibling", read("false") + "\n// leads other completes\nexport function other() { n = 1; }\n", { status: "unknown" }],
  ["solve-saturation", read("saturation"), { status: "verified", nativeConfirmed: false }],
  ["solve-empty-middle", asyncOf(finiteEnv + "\n// rejects", "  await op();\n  await op();"), { status: "verified" }],
]) {
  solved[id] = await admit(id, source, expected);
}

const timed = await checkStateful("timed.ts", read("two"), { timeoutMs: 1, maxDepth: 0 });
add({ id: "solve-timeout-1", match: timed.status === "unknown" && timed.completion?.goals?.[0]?.status !== "verified", observed: brief(timed) });

const gap = solved["solve-missing-settlement"];
add({ id: "settlement-classification", match: gap?.completion?.goals?.[0]?.status === "liveness-gap" && gap.completion.nativeConfirmed === false && gap.completion.goals[0].assumptions.find((a) => a.op === "op")?.classification === "missing" && gap.completion.goals[0].assumptions.find((a) => a.kind === "weak-resumption")?.classification !== "assumed-used", observed: brief(gap) });

const zero = read("zero");
const zeroMachine = machineOf("zero.ts", zero);
const zeroTransitions = transitionsOf(zeroMachine);
const step = zeroTransitions.units.find((u) => u.name === "work$0");
for (const [name, rankAfter] of [["stall", 1], ["half", 0.5]]) {
  const mutated = structuredClone(step);
  const patch = (v) => { if (v?.completionExit) v.completionExit.rankAfter = rankAfter; if (v && typeof v === "object") for (const x of Object.values(v)) { if (Array.isArray(x)) x.forEach(patch); else if (x && typeof x === "object") patch(x); } };
  mutated.body.forEach(patch);
  const body = { type: "BlockStatement", body: mutated.body, ...step.span };
  const fn = { type: "FunctionDeclaration", id: { type: "Identifier", name: step.name, ...step.span }, params: step.params.map((p) => p.node), body, ...step.span };
  const target = compileAstUnit(zeroMachine, { ...mutated, top: fn, fn });
  const checks = target.control.checks;
  const [outcome] = await solve([{ ...target, postconditions: checks.map((c) => c.smt), obligations: checks.map(({ kind, span }) => ({ kind, span })) }], 20000);
  const decrease = derivedRank(target.control.rankBefore, rankAfter);
  add({ id: `rank-${name}`, match: outcome.status === "counterexample" && outcome.label?.kind === "own-progress" && decrease !== "true", observed: { status: outcome.status, kind: outcome.label?.kind ?? null, decrease, smt: checks.find((c) => c.kind === "own-progress")?.smt } });
}

const twoReport = solved["solve-two"];
const twoSource = read("two");
const twoMachine = machineOf("two.ts", twoSource);
const twoTransitions = transitionsOf(twoMachine);
const twoPlan = completionPlan(twoMachine, twoTransitions);
const safety = { status: twoReport.safety.status, units: twoReport.units, scope: twoReport.scope };
const evidence = twoReport.completion.units;
add({ id: "gate-original", match: concludeCompletion(twoMachine, twoTransitions, twoPlan, evidence, safety).goals.every((g) => g.status === "verified"), observed: { goals: concludeCompletion(twoMachine, twoTransitions, twoPlan, evidence, safety).goals.map((g) => g.status) } });
for (const kind of ["own-progress", "interference-nonincrease", "pending-keeps", "segment-totality", "identity-alias", "source-exit-coverage", "creation", "deletion", "init", "outcome-viability"]) {
  const omitted = { ...twoPlan, obligations: twoPlan.obligations.filter((o) => o.kind !== kind) };
  const result = concludeCompletion(twoMachine, twoTransitions, omitted, evidence, safety);
  add({ id: `omit-${kind}`, match: result.closed === false && result.goals.every((g) => g.status !== "verified"), observed: { closed: result.closed, status: result.goals.map((g) => g.status) } });
}
const swapped = { ...twoPlan, obligations: [...twoPlan.obligations] };
[swapped.obligations[0], swapped.obligations[1]] = [swapped.obligations[1], swapped.obligations[0]];
add({ id: "interchange-rows", match: concludeCompletion(twoMachine, twoTransitions, swapped, evidence, safety).closed === false, observed: { closed: concludeCompletion(twoMachine, twoTransitions, swapped, evidence, safety).closed } });
const truePlan = structuredClone(twoPlan);
truePlan.targets[0].target.postconditions = ["true"];
add({ id: "true-plan-postcondition", match: concludeCompletion(twoMachine, twoTransitions, truePlan, evidence, safety).closed === false, observed: { closed: concludeCompletion(twoMachine, twoTransitions, truePlan, evidence, safety).closed } });
const decoy = [{ unit: evidence[0].unit, querySha256: "decoy", status: "verified" }, ...evidence.map((e) => e.unit === evidence[0].unit ? { ...e, status: "counterexample" } : e)];
add({ id: "decoy-evidence", match: concludeCompletion(twoMachine, twoTransitions, twoPlan, decoy, safety).goals.every((g) => g.status !== "verified"), observed: { status: concludeCompletion(twoMachine, twoTransitions, twoPlan, decoy, safety).goals.map((g) => g.status) } });
const lied = structuredClone(twoTransitions);
const waiting = lied.units.flatMap((u) => u.target?.control?.exits ?? []).find((e) => e.kind === "waiting");
waiting.rankAfter += 1;
const liedPlan = completionPlan(twoMachine, lied);
add({ id: "lie-rank-metadata", match: liedPlan.obligations.some((o) => o.kind === "source-exit-coverage" && o.status === "missing") && concludeCompletion(twoMachine, lied, liedPlan, evidence, safety).goals.every((g) => g.status !== "verified"), observed: { missing: liedPlan.missing ?? liedPlan.obligations.filter((o) => o.status !== "checked").map((o) => `${o.kind}:${o.status}`).slice(0, 8) } });
const unframed = structuredClone(twoTransitions);
unframed.units.find((u) => u.name === "work$0").target.control.identityFrame = false;
const unframedPlan = completionPlan(twoMachine, unframed);
add({ id: "clear-identity-frame", match: unframedPlan.obligations.some((o) => o.kind === "identity-alias" && o.status === "missing"), observed: { missing: unframedPlan.obligations.filter((o) => o.status !== "checked").length } });
const footSource = structuredClone(twoTransitions);
const footUnit = footSource.units.find((u) => u.name === "work$0");
const originalFoot = footUnit.target.footprint;
footUnit.target.footprint = [{ path: ["ghost"], key: "id" }];
const footPlan = completionPlan(twoMachine, footSource);
add({ id: "footprint-not-rechecked", match: footPlan.sha256 === twoPlan.sha256 && footUnit.target.control.identityFrame === true, observed: { hashUnchanged: footPlan.sha256 === twoPlan.sha256, frame: footUnit.target.control.identityFrame, originalFoot } });

const falseReport = solved["solve-false"];
const falseMachine = machineOf("false.ts", read("false"));
const falseTransitions = transitionsOf(falseMachine);
const falseSafety = { status: falseReport.safety.status, units: falseReport.units };
const substituted = structuredClone(falseTransitions);
const owner = substituted.units.find((u) => u.target.control?.exits?.some((e) => e.viability !== undefined));
const substitutedExit = owner.target.control.exits.find((e) => e.viability !== undefined);
const viabilityBefore = owner.target.control.checks[substitutedExit.viability].smt;
owner.target.control.checks[substitutedExit.viability].smt = "true";
const substitutedPlan = completionPlan(falseMachine, substituted);
const substitutedOutcomes = await solve(substitutedPlan.targets.map((t) => t.target), 20000);
const substitutedEvidence = substitutedPlan.targets.map((t, i) => ({ unit: t.unit, querySha256: t.querySha256, ...substitutedOutcomes[i] }));
const substitutedResult = concludeCompletion(falseMachine, substituted, substitutedPlan, substitutedEvidence, falseSafety);
add({ id: "true-substituted-viability", match: substitutedResult.goals[0].status !== "verified", observed: { before: viabilityBefore, goal: substitutedResult.goals[0].status, reason: substitutedResult.goals[0].reason ?? null, closed: substitutedResult.closed, outcomes: substitutedEvidence.map((e) => ({ unit: e.unit, status: e.status, kind: e.label?.kind ?? null })) } });

console.log(JSON.stringify({ cases: cases.length, mismatches: cases.filter((c) => c.match === false).map((c) => c.id) }));
