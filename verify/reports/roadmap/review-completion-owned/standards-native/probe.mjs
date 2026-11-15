import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Parser } from "acorn";
import { machineOf, temporalMachineIdentity } from "../../../../stateful/machine.mjs";
import { transitionsOf, ownsCompletionGraph } from "../../../../stateful/transitions.mjs";
import { completionPlan, concludeCompletion } from "../../../../stateful/temporal.mjs";
import { checkStateful } from "../../../../stateful/index.mjs";
import { replayTrace, traceOf, decodeValue } from "../../../../stateful/traces.mjs";
import { handleValue as h } from "../../../../stateful/protocol-values.mjs";

const root = "/Users/rick/.t3/worktrees/verified-list-ui/t3-cfdc1d17";
const main = "ec325c7eb605ab0751e21b2d629a8fe96ff666e8";
const baseline = "32bd5b260aa116ca88642a1479bed8d3fc447f4b";
const nm = "/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/node_modules";
const here = new URL(".", import.meta.url);
const executed = [], unsuccessful = [], boundaries = [];
const note = (id, value) => executed.push({ id, ...value });
const failRow = (id, error) => unsuccessful.push({ id, message: String(error?.message ?? error), name: error?.name ?? "Error" });
async function row(id, fn) {
  try { note(id, await fn()); }
  catch (error) { failRow(id, error); }
}
const read = (name) => readFileSync(new URL(`../../../../../tests/verify/fixtures/stateful/completion/${name}.ts`, import.meta.url), "utf8");
const fixture = (name) => readFileSync(join(root, "tests/verify/fixtures/stateful", name), "utf8");
const compiled = (name, source = read(name)) => {
  const machine = machineOf(`${name}.ts`, source);
  return { machine, graph: transitionsOf(machine) };
};
const owned = (machine, graph) => completionPlan(machine, graph).obligations.find((o) => o.kind === "producer-ownership")?.status;
const cells = (result) => result.trace?.steps?.map((s) => ({
  kind: s.action.kind,
  state: Object.fromEntries(Object.entries(s.state ?? {}).map(([k, v]) => [k, decodeValue(v)])),
  activations: s.activations?.map((a) => ({ id: a.id, status: a.status })),
  cuts: s.cuts?.map((c) => c.kind),
}));
const replay = async (name, source, actions) => {
  const machine = machineOf(name, source);
  return replayTrace(name, source, traceOf(machine, actions));
};
const messageOf = (source, file = "probe.ts") => {
  try { transitionsOf(machineOf(file, source)); return { threw: false }; }
  catch (error) { return { threw: true, message: error.message, status: error.status }; }
};
function scan(value, seen = new WeakSet(), out = { maps: 0, sets: 0, functions: 0, unfrozen: 0 }, depth = 0) {
  if (!value || typeof value !== "object" || seen.has(value) || depth > 40) return out;
  seen.add(value);
  if (typeof value === "function") out.functions++;
  if (value instanceof Map) { out.maps++; for (const v of value.values()) scan(v, seen, out, depth + 1); return out; }
  if (value instanceof Set) { out.sets++; for (const v of value.values()) scan(v, seen, out, depth + 1); return out; }
  if (!Object.isFrozen(value)) out.unfrozen++;
  for (const v of Object.values(value)) scan(v, seen, out, depth + 1);
  return out;
}
function findStore(machine) {
  const seen = new WeakSet();
  const walk = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value.type === "ExpressionStatement" && value.expression?.type === "AssignmentExpression" && value.expression.left?.name === "n") return value;
    for (const child of Object.values(value)) {
      const found = Array.isArray(child) ? child.map(walk).find(Boolean) : walk(child);
      if (found) return found;
    }
  };
  return walk(machine.entries[0]);
}
const dead = `// @environment
// resolves Number.isFinite(result)
// settles eventually
declare function op(): Promise<number>;
let n = 0;
// state n >= 0
// leads work completes
export async function work() {
  await op();
  return;
  n = 1;
}
`;
const frameAgrees = (target) => {
  const scalar = (type) => ["number", "boolean", "undefined"].includes(type);
  const scalarRecord = (type) => type?.kind === "object" && type.fields.every((f) => scalar(f.type) && !f.optional);
  return !!target && target.params.every((p) => scalar(p.type) || p.name === "$s" && scalarRecord(p.type))
    && (scalar(target.resultType) || scalarRecord(target.resultType))
    && target.footprint.every((f) => f.path[0] === "$s");
};
const safetyUnits = (graph) => [...graph.units, ...(graph.completionRejections ?? [])].map((u) => ({ unit: u.name, status: "verified" }));
const lied = (plan) => plan.targets.map((t) => ({ unit: t.unit, querySha256: t.querySha256, status: "verified" }));
const goalOf = (conclusion) => conclusion.goals.map((g) => ({
  status: g.status, reason: g.reason ?? null, nativeConfirmed: g.nativeConfirmed,
  assumptions: g.assumptions.map((a) => ({ kind: a.kind, op: a.op ?? null, classification: a.classification })),
}));

const archive = join(tmpdir(), "std-native-ec325c7");
rmSync(archive, { recursive: true, force: true });
mkdirSync(archive);
const files = execFileSync("git", ["ls-tree", "-r", "--name-only", main, "verify"], { cwd: root, encoding: "utf8" })
  .trim().split("\n").filter((p) => /^verify\/[^/]+\.mjs$/.test(p) || p.startsWith("verify/stateful/"));
const packed = spawnSync("git", ["archive", main, ...files], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
if (packed.status !== 0) throw new Error("git archive failed");
const extracted = spawnSync("tar", ["-x", "-C", archive], { input: packed.stdout });
if (extracted.status !== 0) throw new Error("tar extract failed");
symlinkSync(nm, join(archive, "node_modules"));

const oldMachine = await import(pathToFileURL(join(archive, "verify/stateful/machine.mjs")));
const oldTransitions = await import(pathToFileURL(join(archive, "verify/stateful/transitions.mjs")));
const oldTraces = await import(pathToFileURL(join(archive, "verify/stateful/traces.mjs")));

try {
  await row("checkout", async () => {
    const ancestor = (rev) => {
      const result = spawnSync("git", ["merge-base", "--is-ancestor", rev, "HEAD"], { cwd: root });
      return result.status === 0;
    };
    const blob = (rev, path) => execFileSync("git", ["rev-parse", `${rev}:${path}`], { cwd: root, encoding: "utf8" }).trim();
    const protocol = ["protocol-native.mjs", "protocol-transitions.mjs", "protocol-rules.mjs", "protocol-abort.mjs", "protocol-machine.mjs", "protocol-values.mjs"];
    const standards = ["AGENTS.md", "CLAUDE.md", "CODING_STANDARDS.md", "CONTRIBUTING.md", ".editorconfig", "eslint.config.js", "biome.json", ".pstack"];
    return {
      head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      node: process.version,
      baselineAncestor: ancestor(baseline),
      mainAncestor: ancestor(main),
      standardsPresent: standards.filter((name) => spawnSync("test", ["-e", join(root, name)]).status === 0),
      protocolBlobsEqual: Object.fromEntries(protocol.map((name) => [name, blob("HEAD", `verify/stateful/${name}`) === blob(main, `verify/stateful/${name}`)])),
    };
  });

  await row("graph-seal", async () => {
    const { machine, graph } = compiled("false");
    const shape = scan(graph);
    let smtWrite = "no-throw";
    try { graph.units.find((u) => u.name === "work$0").target.control.checks.find((c) => c.kind === "outcome-viability").smt = "true"; }
    catch (error) { smtWrite = error.name; }
    const viability = graph.units.find((u) => u.name === "work$0").target.control.checks.find((c) => c.kind === "outcome-viability").smt;
    return { shape, smtWrite, viabilityHasFalse: viability.includes("false"), owned: owned(machine, graph), sameObject: ownsCompletionGraph(machine, graph) };
  });

  await row("plain-substitutions", async () => {
    const { machine, graph } = compiled("one");
    const cloned = structuredClone(graph);
    cloned.units.find((u) => u.name === "work$0").target.control.checks.find((c) => c.kind === "outcome-viability").smt = "true";
    const dollar = structuredClone(graph);
    const ghost = structuredClone(graph);
    dollar.units.find((u) => u.name === "work$0").target.footprint = [{ path: ["$s", "foreign"], key: "id" }];
    ghost.units.find((u) => u.name === "work$0").target.footprint = [{ path: ["ghost"], key: "id" }];
    const rank = structuredClone(graph);
    rank.units.find((u) => u.name === "work$0").target.control.exits[0].rankAfter = 7;
    const liedSafety = { status: "verified", units: safetyUnits(graph) };
    const unowned = concludeCompletion(machine, cloned, completionPlan(machine, cloned), lied(completionPlan(machine, cloned)), liedSafety);
    const dollarPlan = completionPlan(machine, dollar);
    const ghostPlan = completionPlan(machine, ghost);
    const rankPlan = completionPlan(machine, rank);
    let inPlace = "no-throw";
    try { graph.units[0].target.footprint = [{ path: ["$s", "foreign"], key: "id" }]; }
    catch (error) { inPlace = error.name; }
    const other = machineOf("one.ts", read("one"));
    return {
      unownedGoal: goalOf(unowned),
      unownedClosed: unowned.closed,
      unownedNative: unowned.nativeConfirmed,
      dollarOwned: dollarPlan.obligations.find((o) => o.kind === "producer-ownership").status,
      dollarFrameWouldPass: frameAgrees(dollar.units.find((u) => u.name === "work$0").target),
      ghostOwned: ghostPlan.obligations.find((o) => o.kind === "producer-ownership").status,
      ghostFrameWouldPass: frameAgrees(ghost.units.find((u) => u.name === "work$0").target),
      rankOwned: rankPlan.obligations.find((o) => o.kind === "producer-ownership").status,
      inPlaceFootprint: inPlace,
      freshMachineOwned: owned(other, graph),
      copyMachine: messageOf(read("one"), "one.ts") && (() => {
        try { transitionsOf({ ...machineOf("one.ts", read("one")) }); return "no-throw"; }
        catch (error) { return error.message; }
      })(),
    };
  });

  await row("frontend-data-versus-hooks", async () => {
    const plain = messageOf(dead);
    const booleanMachine = machineOf("dead.ts", dead);
    const store = findStore(booleanMachine);
    store.completionFallthrough = true;
    let booleanMessage;
    try { transitionsOf(booleanMachine); booleanMessage = "no-throw"; }
    catch (error) { booleanMessage = error.message; }
    const hidden = machineOf("dead.ts", dead);
    Object.defineProperty(findStore(hidden), "completionFallthrough", { value: true, enumerable: false });
    let hiddenMessage;
    try { transitionsOf(hidden); hiddenMessage = "no-throw"; }
    catch (error) { hiddenMessage = error.message; }
    const hooked = machineOf("dead.ts", dead);
    findStore(hooked).completionFallthrough = function completionFallthrough() { return true; };
    let functionResult;
    try {
      const graph = transitionsOf(hooked);
      functionResult = { threw: false, owned: owned(hooked, graph), identity: temporalMachineIdentity(hooked) ? "live" : "lost" };
    } catch (error) { functionResult = { threw: true, message: error.message }; }
    const spoofed = machineOf("false.ts", read("false"));
    const replacer = (_, value) => value instanceof Map ? { map: [...value] } : value instanceof Set ? { set: [...value] } : value;
    const snapshot = JSON.parse(JSON.stringify(spoofed, replacer));
    spoofed.toJSON = () => snapshot;
    const op = spoofed.environment.get("op");
    op.resolves = [{ ...op.resolves[0], text: "true", ast: Parser.parseExpressionAt("true", 0, { ecmaVersion: "latest" }) }];
    let toJSONResult;
    try {
      const graph = transitionsOf(spoofed);
      const smt = graph.units.find((u) => u.name === "work$0").target.control.checks.find((c) => c.kind === "outcome-viability").smt;
      toJSONResult = { threw: false, owned: owned(spoofed, graph), viability: smt };
    } catch (error) { toJSONResult = { threw: true, message: error.message }; }
    const rejected = read("false").replace("// resolves false\n", "// resolves false\n// rejects\n");
    const legal = compiled("false-rejects", rejected);
    const legalSmt = legal.graph.units.find((u) => u.name === "work$0").target.control.checks.find((c) => c.kind === "outcome-viability").smt;
    return { plain, booleanMessage, hiddenMessage, functionResult, toJSONResult, legalRejectsSmt: legalSmt, legalOwned: owned(legal.machine, legal.graph) };
  });

  await row("solver-channel-boundary", async () => {
    const { machine, graph } = compiled("false");
    const plan = completionPlan(machine, graph);
    const safety = { status: "verified", units: safetyUnits(graph) };
    const trustedLie = concludeCompletion(machine, graph, plan, lied(plan), safety);
    const decoy = plan.targets.flatMap((t) => [
      { unit: t.unit, querySha256: "0".repeat(64), status: "verified" },
      { unit: t.unit, querySha256: t.querySha256, status: "counterexample" },
    ]);
    const decoyConclusion = concludeCompletion(machine, graph, plan, decoy, safety);
    const zero = compiled("zero");
    const zeroPlan = completionPlan(zero.machine, zero.graph);
    const zeroLie = concludeCompletion(zero.machine, zero.graph, zeroPlan, lied(zeroPlan), { status: "verified", units: safetyUnits(zero.graph) });
    return {
      falseLie: goalOf(trustedLie),
      falseLieClosed: trustedLie.closed,
      decoy: goalOf(decoyConclusion),
      zeroLie: goalOf(zeroLie),
      zeroNative: zeroLie.nativeConfirmed,
      zeroProfile: zeroLie.profile.kind,
    };
  });

  await row("frames-and-settlement-shape", async () => {
    const rows = {};
    for (const name of ["zero", "one", "two", "false", "partial"]) {
      const { machine, graph } = compiled(name);
      const plan = completionPlan(machine, graph);
      rows[name] = {
        owned: plan.obligations.find((o) => o.kind === "producer-ownership").status,
        missing: plan.obligations.filter((o) => o.status !== "checked").map((o) => o.kind),
        frames: graph.units.filter((u) => u.target.control).map((u) => ({
          unit: u.name,
          stored: u.target.control.identityFrame,
          recomputed: frameAgrees(u.target),
          footprint: u.target.footprint.map((f) => f.path),
          cutpoints: u.target.control.cutpoints,
          callees: u.target.control.callees,
          rankBefore: u.target.control.rankBefore,
        })),
        rejectsInPlan: plan.targets.filter((t) => t.unit.includes("reject")).map((t) => t.unit),
      };
    }
    return rows;
  });

  await row("native-traces", async () => {
    const two = read("two");
    const twoResult = await replay("two.ts", two, [
      { kind: "call", entry: "work", args: [] },
      { kind: "resolve", request: 1, op: "op", value: 1 },
      { kind: "resolve", request: 2, op: "op", value: 1 },
    ]);
    const suppressed = await replay("one.ts", read("one"), [
      { kind: "call", entry: "work", args: [] },
      { kind: "resolve", request: 1, op: "op", value: 0 },
    ]);
    const published = await replay("one.ts", read("one"), [
      { kind: "call", entry: "work", args: [] },
      { kind: "resolve", request: 1, op: "op", value: 1 },
    ]);
    const rejected = await replay("one.ts", read("one"), [
      { kind: "call", entry: "work", args: [] },
      { kind: "reject", request: 1, op: "op" },
    ]);
    const pending = await replay("one.ts", read("one"), [{ kind: "call", entry: "work", args: [] }]);
    const falseResolve = await replay("false.ts", read("false"), [
      { kind: "call", entry: "work", args: [] },
      { kind: "resolve", request: 1, op: "op", value: 1 },
    ]);
    const partialIllegal = await replay("partial.ts", read("partial"), [
      { kind: "call", entry: "work", args: [1] },
      { kind: "resolve", request: 1, op: "op", value: 0 },
    ]);
    const partialLegal = await replay("partial.ts", read("partial"), [
      { kind: "call", entry: "work", args: [1] },
      { kind: "resolve", request: 1, op: "op", value: 1 },
    ]);
    const zero = await replay("zero.ts", read("zero"), [{ kind: "call", entry: "work", args: [] }]);
    const staleMachine = machineOf("zero.ts", read("zero"));
    const stale = traceOf(staleMachine, []);
    stale.sourceSha256 = "0".repeat(64);
    const staleResult = await replayTrace("zero.ts", read("zero"), stale);
    const suffixMachine = machineOf("zero.ts", read("zero"));
    const suffix = traceOf(suffixMachine, [{ kind: "call", entry: "work", args: [] }]);
    suffix.steps = [{ step: 0 }];
    const suffixResult = await replayTrace("zero.ts", read("zero"), suffix);
    const loop = `let n = 0;\n// state n >= 0\nexport function work(){ while (true) {} }\n`;
    const loopResult = await replayTrace("loop.ts", loop, traceOf(machineOf("loop.ts", loop), [{ kind: "call", entry: "work", args: [] }]), { timeoutMs: 50 });
    return {
      two: { status: twoResult.status, cells: cells(twoResult), nativeConfirmed: twoResult.nativeConfirmed ?? null },
      suppressed: { status: suppressed.status, cells: cells(suppressed) },
      published: { status: published.status, cells: cells(published) },
      rejected: { status: rejected.status, cells: cells(rejected) },
      pending: { status: pending.status, cells: cells(pending), confirmed: pending.confirmed ?? null },
      falseResolve: { status: falseResolve.status, message: falseResolve.message ?? null },
      partialIllegal: { status: partialIllegal.status, message: partialIllegal.message ?? null },
      partialLegal: { status: partialLegal.status, cells: cells(partialLegal) },
      zero: { status: zero.status, cells: cells(zero) },
      stale: { status: staleResult.status, message: staleResult.message ?? null },
      suffix: { status: suffixResult.status, message: suffixResult.message ?? null },
      loop: { status: loopResult.status, reason: loopResult.reason ?? null, nativeConfirmed: loopResult.nativeConfirmed ?? null },
    };
  });

  await row("captures-and-admission", async () => {
    const base = (binding, later) => `// @environment
// resolves Number.isFinite(result)
// settles eventually
declare function op(q: number): Promise<number>;
${binding}
let n = 0;
// state n >= 0
// leads work completes
export async function work() {
  const a: number = await op(held);
  ${later}
}
`;
    const letAfter = messageOf(base("let held = 1;", "n = held;"));
    const constAfter = messageOf(base("const held = 1;", "n = held;"));
    const letArgument = messageOf(base("let held = 1;", "n = a;"));
    const scheduler = await checkStateful("one.ts", read("one"), { scheduler: "delayed" });
    const protocolGoal = await checkStateful("listeners.ts", `// leads bind completes\n${fixture("protocols/listeners.ts")}`);
    const advisoryGoal = await checkStateful("advisory.ts", `// leads search completes\n${fixture("protocols/advisory.ts")}`);
    const words = {
      succeeds: messageOf("// leads work succeeds\n" + read("zero")),
      fair: messageOf("// fair settlement\n" + read("zero")),
      fairnessAlone: messageOf(read("one").replace("// leads work completes\n", "")),
      block: messageOf("/* leads work completes */\n" + read("zero")),
      cyrillic: messageOf(read("one").replace("// fairness resumptions weak", "// f\u0430irness resumptions weak")),
      v1: messageOf(fixture("variants/V1-leads-no-settles.ts"), "V1-leads-no-settles.ts"),
    };
    let oldV1;
    try { oldMachine.machineOf("V1-leads-no-settles.ts", fixture("variants/V1-leads-no-settles.ts")); oldV1 = "no-throw"; }
    catch (error) { oldV1 = error.message; }
    return {
      letAfter, constAfter, letArgument,
      scheduler: { status: scheduler.status, message: scheduler.message, completion: scheduler.completion ?? null },
      protocolGoal: { status: protocolGoal.status, message: protocolGoal.message, completion: protocolGoal.completion ?? null, span: protocolGoal.span },
      advisoryGoal: { status: advisoryGoal.status, message: advisoryGoal.message, completion: advisoryGoal.completion ?? null, span: advisoryGoal.span },
      words, oldV1,
    };
  });

  await row("c2a-native", async () => {
    const advisory = fixture("protocols/advisory.ts");
    const listener = fixture("protocols/listeners.ts");
    const inputs = [{ id: "10", signal: "11", aborted: false }, { id: "20", signal: "21", aborted: false }];
    const call = (entry, args = [], extra = {}) => ({ kind: "call", entry, args, ...extra });
    const resolve = { kind: "resolve", request: 1, op: "lookup", value: 1 };
    const search = call("search", [0, h("signal", "11")]);
    const play = async (source, actions, graph = inputs) => {
      const machine = machineOf("fixture.ts", source);
      return replayTrace(machine.file, source, traceOf(machine, actions, { inputs: graph }));
    };
    const shown = (result) => decodeValue(result.trace.steps.at(-1).state.shown);
    const abortThen = await play(advisory, [search, call("dispose", [h("controller", "10")]), resolve]);
    const resolveThen = await play(advisory, [search, resolve, { kind: "abort", controller: h("controller", "10") }]);
    const settleAbort = await play(advisory, [search, { ...resolve, kind: "settle-abort", controller: h("controller", "10") }]);
    const already = await play(advisory, [search, resolve], [{ id: "10", signal: "11", aborted: true }]);
    const alias = listener.replace('return () => events.removeEventListener("x", handler);', "const alias = handler; return () => events.removeEventListener(\"x\", alias);");
    const cuts = await play(alias, [call("bind", [], { returns: "100" }), call("bind", [], { returns: "101" }), { kind: "dispatch", target: h("target", "1"), event: "x" }, { kind: "invoke", handle: h("remover", "100") }, { kind: "invoke", handle: h("remover", "100") }, { kind: "dispatch", target: h("target", "1"), event: "x" }, { kind: "invoke", handle: h("remover", "101") }, { kind: "dispatch", target: h("target", "1"), event: "x" }], []);
    const handlerCuts = cuts.trace.steps.filter((s) => s.action.kind === "dispatch").map((s) => s.cuts.filter((c) => c.kind === "handler").length);
    return {
      abortThen: { status: abortThen.status, shown: shown(abortThen), settled: abortThen.requests[0].settled, aborted: abortThen.signals.find((s) => s.owner === "10").aborted },
      resolveThen: { status: resolveThen.status, shown: shown(resolveThen), aborted: resolveThen.signals[0].aborted },
      settleAbort: { status: settleAbort.status, shown: shown(settleAbort), settled: settleAbort.requests[0].settled },
      already: { status: already.status, shown: shown(already) },
      handlerCuts, registrations: cuts.registrations, status: cuts.status,
    };
  });

  await row("legacy-parity", async () => {
    const compare = async (name) => {
      const source = fixture(name);
      const currentMachine = machineOf(name, source);
      const previousMachine = oldMachine.machineOf(name, source);
      const currentGraph = transitionsOf(currentMachine);
      const previousGraph = oldTransitions.transitionsOf(previousMachine);
      const currentJson = JSON.stringify(currentGraph);
      const previousJson = JSON.stringify(previousGraph);
      let at = 0;
      while (at < currentJson.length && currentJson[at] === previousJson[at]) at++;
      const protocol = !!currentMachine.protocol;
      const actions = name.endsWith("listeners.ts") ? [{ kind: "call", entry: "bind", args: [] }]
        : [{ kind: "call", entry: "search", args: protocol ? [0, h("signal", "11")] : [0] }, ...(protocol ? [] : [{ kind: "resolve", request: 1, op: "lookup", value: 1 }])];
      const options = protocol ? { inputs: [{ id: "10", signal: "11", aborted: false }] } : {};
      const currentTrace = traceOf(currentMachine, actions, options);
      const previousTrace = oldTraces.traceOf(previousMachine, actions, options);
      const currentReplay = await replayTrace(name, source, currentTrace);
      const previousReplay = await oldTraces.replayTrace(name, source, previousTrace);
      return {
        assumptionsEqual: currentMachine.assumptions.sha256 === previousMachine.assumptions.sha256,
        transitionEqual: currentJson === previousJson,
        transitionAt: at,
        currentLength: currentJson.length,
        previousLength: previousJson.length,
        traceEqual: JSON.stringify(currentTrace) === JSON.stringify(previousTrace),
        replayEqual: JSON.stringify(currentReplay) === JSON.stringify(previousReplay),
        replayStatus: currentReplay.status,
      };
    };
    return {
      search: await compare("pilots/search.ts"),
      listeners: await compare("protocols/listeners.ts"),
      advisory: await compare("protocols/advisory.ts"),
    };
  });
} finally {
  rmSync(archive, { recursive: true, force: true });
}

const output = { infrastructure: null, node: process.version, executed, unsuccessful, boundaries };
writeFileSync(new URL("probe-results.json", here), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ executed: executed.length, unsuccessful: unsuccessful.length }));
