import test from "node:test";
import assert from "node:assert/strict";
import { checkStateful } from "../../verify/stateful/index.mjs";
import { machineOf } from "../../verify/stateful/machine.mjs";
import { transitionsOf } from "../../verify/stateful/transitions.mjs";
import { completionPlan, concludeCompletion } from "../../verify/stateful/temporal.mjs";
import { replayTrace, traceOf, decodeValue } from "../../verify/stateful/traces.mjs";
import { compileAstUnit } from "../../verify/source.mjs";
import { solve } from "../../verify/proofs.mjs";
import { verify } from "../../verify/index.mjs";
import { readCompletion as read, recordCompletion as record } from "./fixtures/completion-cases.mjs";

const check = async (name, source = read(name), options) => {
  const report = await checkStateful(`${name}.ts`, source, { timeoutMs: 30_000, ...options });
  record(name, { source, options, report });
  return report;
};
const call = (entry = "work", args = []) => ({ kind: "call", entry, args });
const resolve = (request, value = 1) => ({ kind: "resolve", request, op: "op", value });
async function native(name, source, actions) {
  const m = machineOf(`${name}.ts`, source), result = await replayTrace(`${name}.ts`, source, traceOf(m, actions));
  record(`native-${name}`, { source, result }); return result;
}

test("zero/one/two awaits, empty prefixes, all entries and nested tail exits complete through the public API", async () => {
  for (const name of ["zero", "one", "two"]) {
    const r = await check(name);
    assert.equal(r.status, "verified", JSON.stringify(r)); assert.equal(r.safety.status, "verified");
    assert.ok(r.completion.goals.every((g) => g.status === "verified"));
    assert.equal(r.completion.closed, true); assert.equal(r.assumptions.eventBound, null);
    assert.ok(r.completion.units.every((u) => ["verified", "vacuous"].includes(u.status)));
    assert.ok(r.completion.obligations.some((o) => o.kind === "own-progress" && o.status === "discharged"));
    const m = machineOf(`${name}.ts`, read(name)), transitions = transitionsOf(m), plan = completionPlan(m, transitions);
    record(`targets-${name}`, plan);
    for (const t of plan.targets) {
      assert.equal(t.target.control.cutpoints, 0);
      assert.ok(t.target.control.checks.some((c) => c.kind === "own-progress"));
      assert.ok(t.target.control.exits.every((e) => e.rankAfter === 0 ? e.kind !== "waiting" : e.kind === "waiting"));
    }
    const phases = r.completion.goals[0].assumptions;
    assert.equal(phases.find((p) => p.kind === "continuing-runtime").classification, "assumed-used");
    assert.equal(phases.find((p) => p.kind === "weak-resumption").classification, name === "zero" ? "discharged-unused" : "discharged-used");
    if (name === "two") {
      assert.equal(r.completion.goals.length, 2);
      assert.equal(phases.find((p) => p.op === "unused").classification, "assumed-unused");
    }
  }
  const r = await native("two", read("two"), [call(), resolve(1), resolve(2)]);
  assert.equal(r.status, "ok"); assert.equal(r.violation, undefined);
  assert.deepEqual(r.trace.steps.map((s) => s.action.kind), ["init", "call", "resolve", "resolve"]);
  assert.deepEqual(r.trace.steps.map((s) => decodeValue(s.state.n)), [0, 0, 1, 2]);
  assert.equal(r.trace.steps.at(-1).activations[0].status, "returned");
});

test("native return, suppressed tail, rejection and arbitrary other-entry interference retain action cuts", async () => {
  const z = await native("zero", read("zero"), [call()]);
  assert.equal(z.trace.steps.at(-1).activations[0].status, "returned");
  const s = await native("suppressed", read("two"), [call(), resolve(1, 0), resolve(2, 0)]);
  assert.equal(decodeValue(s.trace.steps.at(-1).state.n), 1);
  assert.equal(s.trace.steps.at(-1).activations[0].status, "returned");
  const reject = await native("rejected", read("two"), [call(), { kind: "reject", request: 1, op: "op" }]);
  assert.equal(reject.status, "ok"); assert.equal(reject.requests.length, 1);
  assert.equal(decodeValue(reject.trace.steps.at(-1).state.n), 0);
  assert.equal(reject.trace.steps.at(-1).activations[0].status, "environment-rejected");
  const interference = await native("interference", read("two"), [call(), call("disturb"), resolve(1), call("disturb"), resolve(2)]);
  assert.equal(interference.status, "ok");
  assert.ok(interference.trace.steps.at(-1).activations.every((a) => a.status === "returned"));
  const pending = await native("finite-prefix", read("two"), [call()]);
  assert.equal(pending.status, "ok"); assert.equal(pending.trace.steps.at(-1).activations[0].status, "live");
});

test("branching prefixes, two async entries and boolean outcome domains have full source coverage", async () => {
  const branching = read("one").replace("  // pending", "  if (n === 0) n = 1; else n = 2;\n  // pending");
  assert.equal((await check("branching-prefix", branching)).status, "verified");
  const multiple = read("two").replace("// leads disturb completes", "// leads disturb completes\n// leads other completes")
    + "\nexport async function other() { await op(); n = 4; }\n";
  const report = await check("two-async-entries", multiple);
  assert.equal(report.status, "verified", JSON.stringify(report)); assert.equal(report.completion.goals.length, 3);
  const result = await native("two-async-entries", multiple, [call(), call("other"), resolve(2), resolve(1), resolve(3)]);
  assert.ok(result.trace.steps.at(-1).activations.every((a) => a.status === "returned"));
  assert.deepEqual(result.requests.map((r) => r.activation), ["1", "2", "1"]);
  const boolean = read("one").replace("Number.isFinite(result)", "result === true || result === false")
    .replace("Promise<number>", "Promise<boolean>").replace("a === 0", "a === false");
  assert.equal((await check("boolean-outcome", boolean)).status, "verified");
  const reachable = read("partial").replace("await op(q)", "await op(1)");
  assert.equal((await check("reachable-partial-domain", reachable)).status, "verified");
});

test("viability is full-domain outcome existence, separate from safety and resume postconditions", async () => {
  for (const name of ["false", "partial"]) {
    const r = await check(name);
    assert.equal(r.safety.status, "verified", JSON.stringify(r)); assert.equal(r.status, "unknown");
    assert.equal(r.completion.goals[0].status, "unknown");
    assert.equal(r.completion.goals[0].reason, "outcome-viability", JSON.stringify(r));
    assert.ok(r.completion.units.some((u) => u.label?.kind === "outcome-viability" && u.status === "counterexample"));
  }
  const positive = read("false").replace("resolves false", "resolves result > 0");
  assert.equal((await check("positive-outcome", positive)).status, "verified");
  assert.equal((await native("illegal-zero", positive, [call(), resolve(1, 0)])).status, "illegal-environment-action");
  assert.equal((await native("legal-positive", positive, [call(), resolve(1, 1)])).trace.steps.at(-1).activations[0].status, "returned");
  const rejection = read("false").replace("// resolves false", "// resolves false\n// rejects");
  assert.equal((await check("rejection-only", rejection)).status, "verified");
  const correlated = read("partial").replace("q > 0 && result > 0", "Object.is(result, q)");
  assert.equal((await check("correlated-outcome", correlated)).status, "verified");
});

test("missing settlement is a symbolic liveness gap and unsupported schedulers/protocols fail closed", async () => {
  const source = read("one").replace("// settles eventually\n", "");
  const r = await check("missing-settlement", source);
  assert.equal(r.safety.status, "verified"); assert.equal(r.status, "unknown");
  assert.equal(r.completion.goals[0].status, "liveness-gap"); assert.equal(r.completion.nativeConfirmed, false);
  assert.equal(r.completion.goals[0].assumptions.find((p) => p.op === "op").classification, "missing");
  for (const options of [{ scheduler: "delayed" }, { protocol: "c2a" }])
    assert.equal((await checkStateful("unsupported.ts", read("one"), options)).status, "unsupported");
});

test("private progress, interference, keeps, totality, alias and exit omissions kill completion independently of safety", async () => {
  const source = read("two"), m = machineOf("two.ts", source), ts = transitionsOf(m), plan = completionPlan(m, ts);
  const safety = await checkStateful("two.ts", source, { timeoutMs: 30_000 });
  assert.equal(safety.safety.status, "verified");
  const evidence = safety.completion.units;
  assert.equal(concludeCompletion(m, ts, plan, evidence, safety).goals[0].status, "verified");
  for (const kind of ["own-progress", "interference-nonincrease", "pending-keeps", "segment-totality", "identity-alias", "source-exit-coverage", "creation", "deletion", "init"]) {
    const omitted = { ...plan, obligations: plan.obligations.filter((o) => o.kind !== kind) };
    const r = concludeCompletion(m, ts, omitted, evidence, safety);
    assert.equal(r.goals[0].status, "unknown", kind); assert.equal(r.closed, false, kind);
  }
  for (const removed of ["work$1", "work$reject$1", "work$0$keeps$work$1", "$reject"]) {
    const changed = { ...ts, units: ts.units.filter((u) => u.name !== removed), completionRejections: ts.completionRejections.filter((u) => u.name !== removed) };
    const changedPlan = completionPlan(m, changed);
    assert.equal(concludeCompletion(m, changed, changedPlan, evidence, safety).goals[0].status, "unknown", removed);
  }
  const removedCheck = structuredClone(plan);
  removedCheck.targets[0].target.postconditions = ["true"];
  assert.equal(concludeCompletion(m, ts, removedCheck, evidence, safety).closed, false);
  const omittedProgress = structuredClone(ts);
  const control = omittedProgress.units.find((u) => u.name === "work$0").target.control;
  control.checks.splice(control.exits[0].progress, 1);
  assert.ok(completionPlan(m, omittedProgress).obligations.some((o) => o.kind === "own-progress" && o.status === "missing"));
  const omittedFrame = structuredClone(ts);
  omittedFrame.units.find((u) => u.name === "work$0").target.control.identityFrame = false;
  assert.ok(completionPlan(m, omittedFrame).obligations.some((o) => o.kind === "identity-alias" && o.status === "missing"));
  record("ablation", { safety: safety.safety.status, kinds: plan.obligations.map((o) => o.kind), result: "all omissions blocked" });
});

test("actual source exits reject stalling and half-unit ranks through specifications.rankDecrease", async () => {
  const m = machineOf("zero.ts", read("zero")), ts = transitionsOf(m), step = ts.units.find((u) => u.name === "work$0");
  for (const [name, rankAfter] of [["stall", 1], ["half", 0.5]]) {
    const mutated = structuredClone(step);
    const patch = (v) => { if (v?.completionExit) v.completionExit.rankAfter = rankAfter; if (v && typeof v === "object") Object.values(v).forEach((x) => { if (Array.isArray(x)) x.forEach(patch); else if (x && typeof x === "object") patch(x); }); };
    mutated.body.forEach(patch);
    const body = { type: "BlockStatement", body: mutated.body, ...step.span };
    const fn = { type: "FunctionDeclaration", id: { type: "Identifier", name: step.name, ...step.span }, params: step.params.map((p) => p.node), body, ...step.span };
    const target = compileAstUnit(m, { ...mutated, top: fn, fn });
    const checks = target.control.checks;
    const [outcome] = await solve([{ ...target, postconditions: checks.map((c) => c.smt), obligations: checks.map(({ kind, span }) => ({ kind, span })) }], 10_000);
    assert.equal(outcome.status, "counterexample"); assert.equal(outcome.label.kind, "own-progress");
    record(`rank-${name}`, { target, outcome });
  }
});

test("wrong safety, one-ms timeout and maxDepth0 never authorize completion", async () => {
  const source = read("one").replace("// state n >= 0", "// state n >= 0\n// always n === old(n)");
  const wrong = await check("wrong-safety", source);
  assert.equal(wrong.status, "counterexample"); assert.equal(wrong.safety.status, "counterexample");
  assert.equal(wrong.completion.goals[0].status, "unknown");
  const exhausted = await check("max-depth-zero", source, { maxDepth: 0 });
  assert.equal(exhausted.status, "unknown"); assert.equal(exhausted.safety.reason, "induction-gap");
  const timed = await check("timeout-one", read("two"), { timeoutMs: 1, maxDepth: 0 });
  assert.equal(timed.status, "unknown"); assert.equal(timed.safety.reason, "solver");
  assert.equal(timed.completion.goals[0].status, "unknown");
});

test("source Number saturation does not merge semantic invocation/request identities", async () => {
  assert.equal((await check("saturation")).status, "verified");
  const r = await native("saturation", read("saturation"), [call(), call()]);
  assert.equal(r.status, "ok"); assert.equal(decodeValue(r.trace.steps.at(-1).state.latest), 2 ** 53);
  assert.equal(r.requests.length, 2); assert.deepEqual(r.requests.map((r) => r.activation), ["1", "2"]);
  assert.deepEqual(r.trace.steps.at(-1).activations.map((a) => a.id), ["1", "2"]);
  const m = machineOf("saturation.ts", read("saturation")), plan = completionPlan(m, transitionsOf(m));
  const queries = plan.targets.map(({ target: t }) => [t.declarations, t.pre, t.preDefined, t.postconditions]);
  assert.doesNotMatch(JSON.stringify(queries), /maxDepth|eventBound|activationBound|activationCount|poolLimit|bv256/);
  for (const [predicate, expected] of [["result > k", "counterexample"], ["result === k + 1", "verified"]]) {
    const source = `// requires k === 9007199254740992\n// ensures ${predicate}\nexport function bump(k: number) { return k + 1; }`;
    const r = await verify(source, { timeoutMs: 10_000 });
    assert.equal(r.outcomes[0].status, expected); record(`fp-${expected}`, { source, report: r });
  }
});
