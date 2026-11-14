// Independent grammar, native-profile, and legacy-query probe.
// Executes bytes extracted from 20ff205, never the prepared C2a checkout.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const prepared = "/Users/rick/.t3/worktrees/verified-list-ui/t3-09fc5ec2";
const implementation = "20ff20556fe19a72f73ccf3708d7bd7329ec2bc0";
const parent = "5f0fb47a0a822d62537f296ef804d5037eebba5c";
const deps = "/Users/rick/verification-vibes/verified-list-ui/node_modules";
const outDir = join(prepared, "verify/reports/roadmap/review-completion/native");
const root = join(tmpdir(), "review-completion-native-20ff205");
const defects = [];
const notes = [];
const defect = (id, detail) => defects.push({ id, ...detail });
const note = (id, detail) => notes.push({ id, ...detail });

function paths(commit) {
  return execFileSync("git", ["ls-tree", "-r", "--name-only", commit], { cwd: prepared, encoding: "utf8" })
    .trim().split("\n").filter((p) =>
      (p.startsWith("verify/") && p.endsWith(".mjs") && !p.startsWith("verify/reports/") && !p.startsWith("verify/examples/"))
      || /^verify\/examples\/[^/]+\.ts$/.test(p)
      || p.startsWith("tests/verify/fixtures/stateful/")
      || p === "tests/verify/fixtures/completion-cases.mjs");
}
function extract(commit, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const list = paths(commit);
  const tar = join(dest, "src.tar");
  execFileSync("git", ["archive", `-o${tar}`, commit, "--", ...list], { cwd: prepared });
  execFileSync("tar", ["-xf", tar, "-C", dest]);
  rmSync(tar);
  symlinkSync(deps, join(dest, "node_modules"));
  return list.length;
}
function shaFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function gitSha(commit, path) {
  return createHash("sha256").update(execFileSync("git", ["show", `${commit}:${path}`], { cwd: prepared })).digest("hex");
}
const read = (tree, name) => readFileSync(join(tree, "tests/verify/fixtures/stateful/completion", `${name}.ts`), "utf8");
const classes = (goal) => goal.assumptions.map((a) => `${a.kind}${a.op ? ":" + a.op : ""}=${a.classification}`);
function summary(report) {
  return {
    status: report.status,
    reason: report.reason,
    safety: report.safety?.status,
    safetyReason: report.safety?.reason,
    confirmed: report.confirmed,
    hasCompletion: Object.hasOwn(report, "completion"),
    nativeConfirmed: report.completion?.nativeConfirmed,
    goals: report.completion?.goals?.map((g) => ({
      entry: g.entry, status: g.status, reason: g.reason, nativeConfirmed: g.nativeConfirmed,
      rank: g.rank, classes: classes(g),
    })),
  };
}
function queryRows(transitions) {
  return transitions.units.map((u) => ({
    name: u.name,
    control: u.target.control ? "present" : "absent",
    id: u.target.id,
    declarations: u.target.declarations,
    pre: u.target.pre,
    preDefined: u.target.preDefined,
    postconditions: u.target.postconditions,
  }));
}
function walkTs(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...walkTs(path, base));
    else if (name.name.endsWith(".ts")) out.push(path.slice(base.length + 1));
  }
  return out.sort();
}

const newTree = join(root, "new");
const oldTree = join(root, "old");
let exitCode = 0;
try {
  const newCount = extract(implementation, newTree);
  const oldCount = extract(parent, oldTree);
  const pinned = [
    "verify/stateful/temporal.mjs", "verify/stateful/native.mjs", "verify/stateful/clauses.mjs",
    "verify/stateful/index.mjs", "verify/source.mjs", "verify/stateful/transitions.mjs",
  ];
  const pinMismatches = pinned.filter((p) => shaFile(join(newTree, p)) !== gitSha(implementation, p));
  if (pinMismatches.length) throw new Error(`Extracted bytes differ from ${implementation}: ${pinMismatches.join(", ")}`);
  const neo = async (rel) => import(pathToFileURL(join(newTree, rel)).href);
  const old = async (rel) => import(pathToFileURL(join(oldTree, rel)).href);
  const current = await neo("verify/stateful/index.mjs");
  const temporalUrl = new URL("./temporal.mjs", pathToFileURL(join(newTree, "verify/stateful/index.mjs")));
  if (!temporalUrl.pathname.includes("review-completion-native-20ff205/new/")) throw new Error(`Wrong temporal owner ${temporalUrl.href}`);
  const { machineOf } = await neo("verify/stateful/machine.mjs");
  const { transitionsOf } = await neo("verify/stateful/transitions.mjs");
  const { replayTrace, traceOf, decodeValue } = await neo("verify/stateful/traces.mjs");
  const { completionPlan, concludeCompletion } = await neo("verify/stateful/temporal.mjs");
  const { compileAstUnit } = await neo("verify/source.mjs");
  const { solve } = await neo("verify/proofs.mjs");
  const { verify } = await neo("verify/index.mjs");
  const oldMachine = await old("verify/stateful/machine.mjs");
  const oldTransitions = await old("verify/stateful/transitions.mjs");
  const oldTraces = await old("verify/stateful/traces.mjs");
  const oldSource = await old("verify/source.mjs");
  const oldModules = await old("verify/modules.mjs");
  const newSource = await neo("verify/source.mjs");
  const newModules = await neo("verify/modules.mjs");
  note("runtime", {
    node: process.version,
    acorn: JSON.parse(readFileSync(join(deps, "acorn/package.json"), "utf8")).version,
    z3: JSON.parse(readFileSync(join(deps, "z3-solver/package.json"), "utf8")).version,
    extractedNew: newCount, extractedOld: oldCount,
    temporal: temporalUrl.pathname,
  });

  const legacyDiffs = [];
  const legacyThrows = [];
  const reject = /^(V1-|V1b-|V2-|V3-|V4-|V5-|V5b-|V9-|V10-|V14-|V15-|V16-)/;
  for (const rel of walkTs(join(newTree, "tests/verify/fixtures/stateful"))) {
    if (rel.startsWith("completion/")) continue;
    const source = readFileSync(join(newTree, "tests/verify/fixtures/stateful", rel), "utf8");
    let currentMachine, previousMachine;
    try { currentMachine = machineOf(rel, source); } catch (e) { currentMachine = e; }
    try { previousMachine = oldMachine.machineOf(rel, source); } catch (e) { previousMachine = e; }
    const currentFail = currentMachine instanceof Error;
    const previousFail = previousMachine instanceof Error;
    if (currentFail !== previousFail) legacyThrows.push({ rel, current: currentFail ? currentMachine.message : "parsed", previous: previousFail ? previousMachine.message : "parsed" });
    if (currentFail || previousFail) continue;
    if (currentMachine.temporal || previousMachine.temporal) legacyThrows.push({ rel, temporal: true });
    let now, then;
    try { now = transitionsOf(currentMachine); } catch (e) { legacyThrows.push({ rel, stage: "new-transitions", message: e.message }); continue; }
    try { then = oldTransitions.transitionsOf(previousMachine); } catch (e) { legacyThrows.push({ rel, stage: "old-transitions", message: e.message }); continue; }
    const left = JSON.stringify(queryRows(now));
    const right = JSON.stringify(queryRows(then));
    if (left !== right || now.sha256 !== then.sha256 || JSON.stringify(currentMachine.assumptions) !== JSON.stringify(previousMachine.assumptions))
      legacyDiffs.push({ rel, shaNow: now.sha256, shaThen: then.sha256, assumptions: JSON.stringify(currentMachine.assumptions) === JSON.stringify(previousMachine.assumptions) });
    if (queryRows(now).some((row) => row.control === "present")) legacyDiffs.push({ rel, control: "present" });
  }
  if (legacyDiffs.length || legacyThrows.length) defect("legacy-fixture-correspondence", { legacyDiffs, legacyThrows });
  else note("legacy-fixtures", { compared: walkTs(join(newTree, "tests/verify/fixtures/stateful")).length, queryBytesEqual: true, temporal: false });

  const exampleDiffs = [];
  for (const name of readdirSync(join(newTree, "verify/examples")).filter((p) => p.endsWith(".ts")).sort()) {
    const path = join(newTree, "verify/examples", name);
    let left, right;
    try { left = newSource.compile(newModules.load(path).records).targets; } catch (e) { left = e; }
    try { right = oldSource.compile(oldModules.load(path).records).targets; } catch (e) { right = e; }
    if (left instanceof Error || right instanceof Error) {
      if ((left instanceof Error) !== (right instanceof Error) || left.message !== right.message) exampleDiffs.push({ name, new: left.message, old: right.message });
      continue;
    }
    const pack = (targets) => JSON.stringify(targets.map((t) => ({ id: t.id, declarations: t.declarations, pre: t.pre, preDefined: t.preDefined, postconditions: t.postconditions, control: t.control ? "present" : "absent" })));
    if (pack(left) !== pack(right) || left.some((t) => t.control)) exampleDiffs.push({ name, changed: true });
  }
  if (exampleDiffs.length) defect("legacy-example-queries", { exampleDiffs });
  else note("legacy-examples", { equal: true });

  const search = readFileSync(join(newTree, "tests/verify/fixtures/stateful/pilots/search.ts"), "utf8");
  const actions = [{ kind: "call", entry: "search", args: [0] }, { kind: "resolve", request: 1, op: "lookup", value: 1 }];
  const newReplay = await replayTrace("search.ts", search, traceOf(machineOf("search.ts", search), actions));
  const oldReplay = await oldTraces.replayTrace("search.ts", search, oldTraces.traceOf(oldMachine.machineOf("search.ts", search), actions));
  if (JSON.stringify(newReplay) !== JSON.stringify(oldReplay)) defect("legacy-native-replay", { status: [newReplay.status, oldReplay.status] });
  else note("legacy-native-replay", { status: newReplay.status, steps: newReplay.trace.steps.length, equal: true });

  const zero = read(newTree, "zero");
  const grammar = [
    "completes", "completion", "fair settlement", "commits shown", "commit", "count pending", "rank 1", "ranks 1",
    "abort", "leads work succeeds", "leads work commits", "leads work completes soon", "leads ghost completes",
    "leads work Completes", "LEADS work completes", "lead work completes", "leeds work completes", "leads: work completes",
    "leads(work)", "leads work complete", "fairness", "fairness resumptions strong",
    "fairness settlement weak", "fairness resumptions weak.", "FAIRNESS resumptions weak", "fairnes resumptions weak",
    "fairness. resumptions weak", "fаirnеss resumptions weak", "lеаds work completes", "соmрlеtеs", "cоmmitѕ x",
    "сount pending", "rаnk 1", "completes\u200b", "scheduler c2", "protocol c2a", "success", "success!", "protocol",
    "scheduler", "order fifo", "decreases n", "liveness", "live", "ensures true", "fair", "the work completes",
    "items count", "note the rank", "PROTOCOL temporal", "ｌｅａｄｓ work completes",
  ];
  const grammarMisses = [];
  for (const text of grammar) {
    const source = zero.replace("// leads work completes", `// ${text}`);
    try {
      machineOf("grammar.ts", source);
      grammarMisses.push({ text, accepted: true });
    } catch (e) {
      if (e.status !== "unsupported" || e.span?.start !== source.indexOf(`// ${text}`) || !(e.span.end > e.span.start))
        grammarMisses.push({ text, status: e.status, message: e.message, span: e.span });
    }
  }
  for (const text of ["leads work completes", "completes", "fair settlement", "rank 1", "count pending", "fairness resumptions weak"]) {
    const source = zero.replace("// leads work completes", `/* ${text} */`);
    try {
      machineOf("block.ts", source);
      grammarMisses.push({ text, block: "accepted" });
    } catch (e) {
      if (e.status !== "unsupported" || !source.slice(e.span.start).startsWith("/*")) grammarMisses.push({ text, block: e.message });
    }
  }
  const attachments = {
    "unknown-prose": zero.replace("// leads work completes", "// wishful thinking\n// leads work completes"),
    "fairness-without-goal": zero.replace("// leads work completes", "// fairness resumptions weak"),
    "duplicate-goal": zero.replace("// leads work completes", "// leads work completes\n// leads work completes"),
    "duplicate-fairness": zero.replace("// leads work completes", "// fairness resumptions weak\n// fairness resumptions weak\n// leads work completes"),
    "inside-entry": zero.replace("done = true;", "// leads work completes\ndone = true;").replace("// leads work completes\n", ""),
    "environment-leads": `// @environment\n// leads work completes\n// resolves Number.isFinite(result)\ndeclare function op(): Promise<number>;\nlet n = 0;\n// state n >= 0\nexport function work() { n = 1; }\n`,
    "environment-fairness": `// @environment\n// fairness resumptions weak\n// resolves Number.isFinite(result)\ndeclare function op(): Promise<number>;\nlet n = 0;\n// state n >= 0\n// leads work completes\nexport function work() { n = 1; }\n`,
    "unknown-entry": zero.replace("// leads work completes", "// leads ghost completes"),
  };
  const attachmentMisses = [];
  for (const [name, source] of Object.entries(attachments)) {
    try { machineOf(`${name}.ts`, source); attachmentMisses.push({ name, accepted: true }); }
    catch (e) { if (e.status !== "unsupported") attachmentMisses.push({ name, status: e.status, message: e.message }); else note(`attachment-${name}`, { message: e.message }); }
  }
  const prose = zero.replace("// leads work completes", "// returns a boolean\n// see the note\n// Stale-response documentation\n// leads work completes");
  try { const parsed = machineOf("prose.ts", prose); if (parsed.temporal?.goals?.length !== 1) attachmentMisses.push({ name: "prose", goals: parsed.temporal }); }
  catch (e) { attachmentMisses.push({ name: "prose", message: e.message }); }
  if (grammarMisses.length || attachmentMisses.length) defect("grammar", { grammarMisses, attachmentMisses });
  else note("grammar", { rejected: grammar.length, blocks: 6, attachments: Object.keys(attachments).length, proseKept: true });

  const admitted = [];
  for (const body of ["while (false) {}", "for (;;) {}", "Math.random();", "const a = {};", "return Promise.resolve(0);", "try {} catch {}", "const f = () => 0; f();", "work();", "return {then: 0};"]) {
    const source = zero.replace("done = true;", body);
    const report = await current.checkStateful("admission.ts", source, { timeoutMs: 5_000 });
    admitted.push({ body, status: report.status, completion: Object.hasOwn(report, "completion"), message: report.message });
    if (report.status !== "unsupported" || report.completion) defect("admission", { body, status: report.status, message: report.message });
  }
  note("admission", { admitted });

  async function native(name, source, steps, options) {
    const machine = machineOf(`${name}.ts`, source);
    const result = await replayTrace(`${name}.ts`, source, traceOf(machine, steps), options);
    return { machine, result };
  }
  const cell = (result, name) => decodeValue(result.trace.steps.at(-1).state[name]);
  const kinds = (result) => result.trace?.steps?.map((s) => s.action.kind);
  const two = read(newTree, "two");
  const one = read(newTree, "one");
  const call = (entry = "work", args = []) => ({ kind: "call", entry, args });
  const resolve = (request, value = 1, op = "op") => ({ kind: "resolve", request, op, value });
  const twoRun = await native("two", two, [call(), resolve(1), resolve(2)]);
  const seq = twoRun.result.trace.steps.map((s) => decodeValue(s.state.n));
  if (twoRun.result.status !== "ok" || JSON.stringify(kinds(twoRun.result)) !== JSON.stringify(["init", "call", "resolve", "resolve"]) || JSON.stringify(seq) !== JSON.stringify([0, 0, 1, 2]) || twoRun.result.trace.steps.at(-1).activations[0].status !== "returned")
    defect("two-await-sequence", { status: twoRun.result.status, kinds: kinds(twoRun.result), seq, activation: twoRun.result.trace?.steps?.at(-1)?.activations });
  else note("two-await-sequence", { seq, steps: twoRun.result.trace.steps.length });
  if (twoRun.machine.executable.includes("$activation") || twoRun.machine.executable.includes("$nextActivation")) defect("observer-wraps-body", { executable: twoRun.machine.executable });
  else note("observer", { harnessMarkersInExecutable: false, bodyKept: twoRun.machine.executable.includes("await op()") });

  const suppressed = await native("suppressed", one, [call(), resolve(1, 0)]);
  const written = await native("written", one, [call(), resolve(1, 1)]);
  if (suppressed.result.status !== "ok" || cell(suppressed.result, "n") !== 0 || suppressed.result.trace.steps.at(-1).activations[0].status !== "returned")
    defect("suppressed-tail", { status: suppressed.result.status, n: suppressed.result.trace && cell(suppressed.result, "n"), activation: suppressed.result.trace?.steps?.at(-1)?.activations });
  else note("suppressed-tail", { n: 0, status: suppressed.result.trace.steps.at(-1).activations[0].status });
  if (written.result.status !== "ok" || cell(written.result, "n") !== 1) defect("legal-write", { status: written.result.status });
  const rejected = await native("rejected", two, [call(), { kind: "reject", request: 1, op: "op" }]);
  if (rejected.result.status !== "ok" || cell(rejected.result, "n") !== 0 || rejected.result.requests.length !== 1 || rejected.result.trace.steps.at(-1).activations[0].status !== "environment-rejected")
    defect("rejection-terminal", { status: rejected.result.status, requests: rejected.result.requests?.length, activation: rejected.result.trace?.steps?.at(-1)?.activations, n: rejected.result.trace && cell(rejected.result, "n") });
  else note("rejection-terminal", { n: 0, requests: 1, status: "environment-rejected" });
  const pending = await native("pending", two, [call()]);
  if (pending.result.status !== "ok" || pending.result.trace.steps.at(-1).activations[0].status !== "live" || pending.result.confirmed || pending.result.nativeConfirmed === true)
    defect("finite-prefix", { status: pending.result.status, activation: pending.result.trace?.steps?.at(-1)?.activations?.[0]?.status, confirmed: pending.result.confirmed });
  else note("finite-prefix", { status: "ok", activation: "live", nativeConfirmed: false });

  const positive = read(newTree, "false").replace("resolves false", "resolves result > 0");
  const illegal = await native("illegal", positive, [call(), resolve(1, 0)]);
  const stutter = await native("stutter", positive, [call(), { kind: "stutter" }]);
  const stale = traceOf(machineOf("stale.ts", positive), [call(), resolve(1, 1)]);
  stale.sourceSha256 = "0".repeat(64);
  const staleResult = await replayTrace("stale.ts", positive, stale);
  const suffix = await native("suffix", positive, [call(), resolve(1, 1), resolve(2, 1)]);
  for (const [name, result] of [["illegal-zero", illegal.result], ["stutter", stutter.result], ["stale-envelope", staleResult], ["bad-suffix", suffix.result]]) {
    if (result.status !== "illegal-environment-action" || result.confirmed || result.nativeConfirmed === true || result.status === "counterexample")
      defect("illegal-not-counterexample", { name, status: result.status, confirmed: result.confirmed, message: result.message });
  }
  if (!defects.some((d) => d.id === "illegal-not-counterexample")) note("illegal-not-counterexample", { cases: ["illegal-zero", "stutter", "stale-envelope", "bad-suffix"], status: "illegal-environment-action" });

  const captured = `// @environment\n// resolves result === q\n// settles eventually\ndeclare function op(q: number): Promise<number>;\nlet n = 0;\n// state n >= 0\n// leads work completes\nexport async function work(q: number) {\n  const held: number = q;\n  const a: number = await op(held);\n  n = a;\n}\n`;
  const captureRun = await native("capture", captured, [call("work", [1]), resolve(1, 1)]);
  const captureBad = await native("capture-bad", captured, [call("work", [1]), resolve(1, 2)]);
  const mutable = captured.replace("const held: number = q;", "let held: number = q;");
  let mutableStatus = "parsed";
  try { machineOf("mutable.ts", mutable); } catch (e) { mutableStatus = e.message; }
  const capturedArg = captureRun.result.requests?.[0]?.args?.map(decodeValue);
  if (captureRun.result.status !== "ok" || JSON.stringify(capturedArg) !== JSON.stringify([1]) || captureBad.result.status !== "illegal-environment-action" || !/immutable/.test(mutableStatus))
    defect("immutable-capture", { ok: captureRun.result.status, args: capturedArg, bad: captureBad.result.status, mutableStatus });
  else note("immutable-capture", { args: capturedArg, illegalOther: captureBad.result.status, mutableRejected: mutableStatus });

  const saturation = read(newTree, "saturation");
  const sat = await native("saturation", saturation, [call(), call()]);
  const ids = sat.result.trace?.steps?.at(-1)?.activations?.map((a) => a.id);
  if (sat.result.status !== "ok" || cell(sat.result, "latest") !== 2 ** 53 || JSON.stringify(sat.result.requests.map((r) => r.activation)) !== JSON.stringify(["1", "2"]) || JSON.stringify(ids) !== JSON.stringify(["1", "2"]) || new Set(ids).size !== 2)
    defect("saturation-identities", { status: sat.result.status, latest: sat.result.trace && cell(sat.result, "latest"), activations: sat.result.requests?.map((r) => r.activation), ids });
  else note("saturation-identities", { latest: 2 ** 53, activations: ["1", "2"] });

  const thrown = zero.replace("done = true;", 'throw new Error("stop");');
  const thrownRun = await native("throw", thrown, [call()]);
  if (thrownRun.result.status !== "unknown" || thrownRun.result.reason !== "replay-runtime" || !thrownRun.result.faults?.includes("stop") || thrownRun.result.confirmed)
    defect("sync-throw", { status: thrownRun.result.status, reason: thrownRun.result.reason, faults: thrownRun.result.faults, confirmed: thrownRun.result.confirmed });
  else note("sync-throw", { status: thrownRun.result.status, reason: thrownRun.result.reason, faults: thrownRun.result.faults });
  const after = one.replace("if (a === 0) return;\n  n = 1;", 'throw new Error("stop");');
  const afterRun = await native("after", after, [call(), resolve(1, 1)]);
  if (afterRun.result.status !== "unknown" || afterRun.result.reason !== "replay-runtime" || !afterRun.result.faults?.includes("stop"))
    defect("continuation-fault-containment", { status: afterRun.result.status, reason: afterRun.result.reason, faults: afterRun.result.faults, activation: afterRun.result.trace?.steps?.at(-1)?.activations });
  else note("continuation-fault-containment", { status: afterRun.result.status, reason: afterRun.result.reason, faults: afterRun.result.faults });
  const looping = zero.replace("done = true;", "while (true) {}");
  const loopRun = await native("loop", looping, [call()], { timeoutMs: 50 });
  if (!["replay-timeout", "replay-runtime"].includes(loopRun.result.reason) || loopRun.result.status === "ok" || loopRun.result.confirmed)
    defect("worker-kill-containment", { status: loopRun.result.status, reason: loopRun.result.reason, confirmed: loopRun.result.confirmed });
  else note("worker-kill-containment", { status: loopRun.result.status, reason: loopRun.result.reason });

  const checks = {};
  async function check(name, source, options = {}) {
    const report = await current.checkStateful(`${name}.ts`, source, { timeoutMs: 20_000, ...options });
    checks[name] = summary(report);
    return report;
  }
  const expectVerified = async (name, source, pred) => {
    const report = await check(name, source);
    if (!pred(report)) defect(name, checks[name]);
    return report;
  };
  await expectVerified("zero", zero, (r) => r.status === "verified" && r.completion.nativeConfirmed === false && r.completion.goals[0].rank.birth === "1" && r.completion.goals[0].rank.terminal === "0" && classes(r.completion.goals[0]).includes("weak-resumption=discharged-unused") && classes(r.completion.goals[0]).includes("continuing-runtime=assumed-used") && !classes(r.completion.goals[0]).some((c) => c.startsWith("per-reached") && c.endsWith("discharged-used")));
  await expectVerified("one", one, (r) => r.status === "verified" && classes(r.completion.goals[0]).includes("per-reached-request-settlement:op=assumed-used") && classes(r.completion.goals[0]).includes("weak-resumption=discharged-used") && classes(r.completion.goals[0]).includes("total-declared-environment-calls=assumed-used") && r.completion.goals.every((g) => g.nativeConfirmed === false));
  await expectVerified("two", two, (r) => r.status === "verified" && r.completion.goals.length === 2 && classes(r.completion.goals[0]).includes("per-reached-request-settlement:unused=assumed-unused") && classes(r.completion.goals[0]).includes("per-reached-request-settlement:op=assumed-used") && classes(r.completion.goals[1]).includes("per-reached-request-settlement:op=assumed-unused") && classes(r.completion.goals[1]).includes("weak-resumption=discharged-unused") && r.completion.goals[0].rank.waiting.join(",") === "2,1");
  const tails = zero.replace("done = true;", "if (done) return; else return;");
  await expectVerified("all-tail", tails, (r) => r.status === "verified" && r.completion.goals[0].rank.birth === "1");
  const falseFair = read(newTree, "false").replace("// leads work completes", "// fairness resumptions weak\n// leads work completes");
  const falseReport = await check("false-fair", falseFair);
  if (falseReport.status === "verified" || falseReport.completion?.goals?.some((g) => g.status === "verified" || g.nativeConfirmed !== false) || classes(falseReport.completion.goals[0]).includes("weak-resumption=discharged-used"))
    defect("disabled-settlement", checks["false-fair"]);
  else note("disabled-settlement", checks["false-fair"]);
  const partial = await check("partial", read(newTree, "partial"));
  if (partial.status === "verified" || partial.completion.goals[0].reason !== "outcome-viability" || partial.completion.nativeConfirmed !== false)
    defect("partial-domain", checks.partial);
  else note("partial-domain", checks.partial);
  const missing = await check("missing", one.replace("// settles eventually\n", ""));
  if (missing.completion?.goals?.[0]?.status !== "liveness-gap" || missing.completion.nativeConfirmed !== false || !classes(missing.completion.goals[0]).includes("per-reached-request-settlement:op=missing") || classes(missing.completion.goals[0]).includes("weak-resumption=discharged-used"))
    defect("missing-settlement", checks.missing);
  else note("missing-settlement", checks.missing);
  const split = `${one.replace("declare function op(): Promise<number>;", "declare function op(): Promise<number>;\n// @environment\n// resolves false\n// settles eventually\ndeclare function bad(): Promise<number>;").replace("// leads work completes", "// leads work completes\n// leads other completes")}\nexport async function other() { await bad(); n = 2; }\n`;
  const splitReport = await check("split", split);
  if (splitReport.status === "verified" || !splitReport.completion || splitReport.completion.goals.some((g) => g.status === "verified"))
    defect("unresolved-viability-blocks-every-goal", checks.split);
  else note("unresolved-viability-blocks-every-goal", checks.split);
  await expectVerified("saturation", saturation, (r) => r.status === "verified" && r.completion.nativeConfirmed === false && !JSON.stringify(r.completion.units).includes("eventBound"));
  const legacy = await check("legacy", "let n = 0;\n// state n >= 0\nexport function work() { n = 1; }\n");
  if (legacy.completion || legacy.status !== "verified") defect("legacy-report-shape", checks.legacy);
  else note("legacy-report-shape", { status: legacy.status, completion: false });
  const throwReport = await check("throw-admission", thrown);
  if (throwReport.status === "verified" || throwReport.completion?.goals?.some((g) => g.status === "verified")) defect("throw-not-completion", checks["throw-admission"]);
  else note("throw-not-completion", checks["throw-admission"]);
  const wrong = await check("wrong-safety", one.replace("// state n >= 0", "// state n >= 0\n// always n === old(n)"));
  if (wrong.completion?.nativeConfirmed !== false || wrong.completion?.goals?.some((g) => g.nativeConfirmed !== false || g.status === "verified")) defect("safety-counterexample-not-infinite", checks["wrong-safety"]);
  else note("safety-counterexample-not-infinite", { status: wrong.status, confirmed: wrong.confirmed, completion: checks["wrong-safety"].goals });
  const timed = await check("timeout", two, { timeoutMs: 1, maxDepth: 0 });
  const depth = await check("depth", one.replace("// state n >= 0", "// state n >= 0\n// always n === old(n)"), { maxDepth: 0 });
  if (timed.status === "verified" || timed.completion?.nativeConfirmed !== false || depth.status === "verified" || depth.completion?.goals?.some((g) => g.status === "verified" || g.nativeConfirmed !== false))
    defect("bounds-not-infinite", { timed: checks.timeout, depth: checks.depth });
  else note("bounds-not-infinite", { timed: checks.timeout, depth: checks.depth });
  for (const options of [{ scheduler: "delayed" }, { protocol: "c2a" }, { scheduler: "c1-action-cuts" }]) {
    const report = await current.checkStateful("mode.ts", one, options);
    if (report.status !== "unsupported" || report.completion) defect("alternate-profile", { options, status: report.status, message: report.message });
  }
  const ignored = await check("ignored-profile-key", zero, { profile: "alternate" });
  note("ignored-profile-key", { status: ignored.status, profile: ignored.completion?.profile, nativeConfirmed: ignored.completion?.nativeConfirmed });
  if (ignored.completion?.profile?.kind !== "c1-action-cuts" || ignored.completion?.nativeConfirmed !== false) defect("ignored-profile-key", checks["ignored-profile-key"]);

  const verified = checks.two && await current.checkStateful("two.ts", two, { timeoutMs: 20_000 });
  const machine = machineOf("two.ts", two);
  const transitions = transitionsOf(machine);
  const plan = completionPlan(machine, transitions);
  const tampered = verified.completion.units.map((u, i) => ({ ...u, querySha256: i === 0 ? "0".repeat(64) : u.querySha256 }));
  const refused = concludeCompletion(machine, transitions, plan, tampered, verified);
  if (refused.closed !== false || refused.goals.some((g) => g.status === "verified")) defect("stale-evidence", { closed: refused.closed, goals: refused.goals.map((g) => g.status) });
  else note("stale-evidence", { closed: false, verified: false });

  const fp = {};
  for (const [predicate, expected] of [["result > k", "counterexample"], ["result === k + 1", "verified"]]) {
    const source = `// requires k === 9007199254740992\n// ensures ${predicate}\nexport function bump(k: number) { return k + 1; }`;
    const first = await verify(source, { timeoutMs: 10_000 });
    const second = await verify(source, { timeoutMs: 10_000 });
    fp[predicate] = { status: first.outcomes[0].status, repeatStatus: second.outcomes[0].status, witnessEqual: JSON.stringify(first.outcomes[0]) === JSON.stringify(second.outcomes[0]) };
    if (first.outcomes[0].status !== expected || second.outcomes[0].status !== expected) defect("fp64-control", { predicate, expected, fp: fp[predicate] });
  }
  note("fp64-control", fp);

  const step = transitionsOf(machineOf("zero.ts", zero)).units.find((u) => u.name === "work$0");
  for (const [name, rankAfter] of [["stall", 1], ["half", 0.5]]) {
    const mutated = structuredClone(step);
    const patch = (v) => { if (v?.completionExit) v.completionExit.rankAfter = rankAfter; if (v && typeof v === "object") for (const x of Object.values(v)) { if (Array.isArray(x)) x.forEach(patch); else if (x && typeof x === "object") patch(x); } };
    mutated.body.forEach(patch);
    const body = { type: "BlockStatement", body: mutated.body, ...step.span };
    const fn = { type: "FunctionDeclaration", id: { type: "Identifier", name: step.name, ...step.span }, params: step.params.map((p) => p.node), body, ...step.span };
    const target = compileAstUnit(machineOf("zero.ts", zero), { ...mutated, top: fn, fn });
    const [outcome] = await solve([{ ...target, postconditions: target.control.checks.map((c) => c.smt), obligations: target.control.checks.map(({ kind, span }) => ({ kind, span })) }], 10_000);
    if (outcome.status !== "counterexample" || outcome.label?.kind !== "own-progress") defect("rank-mutation", { name, status: outcome.status, label: outcome.label });
    else note("rank-mutation", { name, status: outcome.status, label: outcome.label.kind });
  }

  const parityPath = "tests/verify/conditional-completion-parity.test.mjs";
  const parity = execFileSync("git", ["show", `${implementation}:${parityPath}`], { cwd: prepared, encoding: "utf8" });
  if (!parity.includes("Parity solver request changed") || !parity.includes("JSON.stringify(actual)") || /delete\s+\w+\.witness|delete\s+\w+\.model/.test(parity))
    defect("parity-comparator", { refusesChangedQueries: parity.includes("Parity solver request changed"), fullJson: parity.includes("JSON.stringify(actual)") });
  else note("parity-comparator", { refusesChangedQueries: true, comparesFullReportBytes: true, deletesWitnessFields: false });
} catch (error) {
  exitCode = 1;
  defect("probe-infrastructure", { message: error?.stack || String(error) });
} finally {
  rmSync(root, { recursive: true, force: true });
}

const result = {
  implementation,
  parent,
  preparedHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: prepared, encoding: "utf8" }).trim(),
  verdict: exitCode === 0 && defects.length === 0 ? "PASS" : defects.some((d) => d.id === "probe-infrastructure") && defects.length === 1 ? "BLOCKED" : "ISSUES",
  defects, notes,
};
writeFileSync(join(outDir, "results.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ verdict: result.verdict, defects: defects.map((d) => d.id), notes: notes.map((n) => n.id) }, null, 2));
process.exit(exitCode);
