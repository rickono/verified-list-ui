import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { machineOf, temporalMachineIdentity } from "../../verify/stateful/machine.mjs";
import { transitionsOf } from "../../verify/stateful/transitions.mjs";
import { completionPlan, concludeCompletion } from "../../verify/stateful/temporal.mjs";
import { checkStateful } from "../../verify/stateful/index.mjs";
import { solve } from "../../verify/proofs.mjs";

const source = (name) => readFileSync(new URL(`./fixtures/stateful/completion/${name}.ts`, import.meta.url), "utf8");
const compiled = (name = "one") => {
  const m = machineOf(`${name}.ts`, source(name));
  return { m, graph: transitionsOf(m) };
};
const owned = (plan) => plan.obligations.find((o) => o.kind === "producer-ownership")?.status;

test("rebuilding a plan after substituting false outcome viability cannot authorize completion", async () => {
  const { m, graph } = compiled("false");
  const safety = await checkStateful("false.ts", source("false"), { timeoutMs: 10_000 });
  assert.equal(safety.safety.status, "verified");
  assert.equal(safety.completion.goals[0].reason, "outcome-viability");
  const changed = structuredClone(graph);
  const checks = changed.units.find((u) => u.name === "work$0").target.control.checks;
  assert.equal(checks.filter((c) => c.kind === "outcome-viability").length, 1);
  checks.find((c) => c.kind === "outcome-viability").smt = "true";
  const plan = completionPlan(m, changed);
  const results = await solve(plan.targets.map((t) => t.target), 10_000);
  assert.ok(results.every((r) => ["verified", "vacuous"].includes(r.status)));
  const evidence = plan.targets.map((t, i) => ({ unit: t.unit, querySha256: t.querySha256, ...results[i] }));
  const conclusion = concludeCompletion(m, changed, plan, evidence, { ...safety, status: safety.safety.status });
  assert.equal(conclusion.goals[0].status, "unknown");
  assert.equal(conclusion.goals[0].reason, "manifest-gap");
  assert.equal(owned(plan), "missing");
});

test("only the original producer graph and source machine have completion provenance", () => {
  const { m, graph } = compiled();
  assert.equal(owned(completionPlan(m, graph)), "checked");
  assert.equal(owned(completionPlan(m, structuredClone(graph))), "missing");
  assert.equal(owned(completionPlan(machineOf("one.ts", source("one")), graph)), "missing");
  const op = m.environment.get("op");
  m.environment.set("op", { ...op, settles: "may-never-settle" });
  assert.equal(owned(completionPlan(m, graph)), "missing");
});

test("produced temporal checks, actual footprints and effects cannot be changed in place", () => {
  const { m, graph } = compiled();
  const t = graph.units.find((u) => u.name === "work$0").target;
  assert.throws(() => { t.control.checks[0].smt = "true"; }, TypeError);
  assert.throws(() => { t.footprint = [{ path: ["foreign", "control"] }]; }, TypeError);
  assert.throws(() => { t.effects = { kind: "pure" }; }, TypeError);
  assert.throws(() => { graph.units.pop(); }, TypeError);
  assert.equal(owned(completionPlan(m, graph)), "checked");
  for (const change of [
    (u) => { u.target.footprint = [{ path: ["foreign", "control"] }]; },
    (u) => { u.target.effects = { kind: "writes" }; },
    (u) => { u.target.control.identityFrame = true; u.target.params = [{ name: "foreign", type: { kind: "object", fields: [] } }]; },
  ]) {
    const changed = structuredClone(graph); change(changed.units.find((u) => u.name === "work$0"));
    assert.equal(owned(completionPlan(m, changed)), "missing");
  }
});

test("a plan cannot substitute a footprint after the source producer has sealed it", async () => {
  const { m, graph } = compiled("zero"), plan = completionPlan(m, graph);
  const safety = await checkStateful("zero.ts", source("zero"), { timeoutMs: 10_000 });
  assert.equal(safety.status, "verified");
  const changed = structuredClone(plan);
  changed.targets[0].target.footprint = [{ path: ["otherInvocation", "control"] }];
  const conclusion = concludeCompletion(m, graph, changed, safety.completion.units, safety);
  assert.equal(conclusion.closed, false);
  assert.equal(conclusion.goals[0].status, "unknown");
});

test("protocol goals do not acquire the scalar completion rule during integration", async () => {
  for (const name of ["listeners", "advisory"]) {
    const original = readFileSync(new URL(`./fixtures/stateful/protocols/${name}.ts`, import.meta.url), "utf8");
    const goal = name === "listeners" ? "bind" : "search";
    const source = `// leads ${goal} completes\n` + original;
    const r = await checkStateful(`${name}.ts`, source);
    assert.equal(r.status, "unsupported");
    assert.match(r.message, /Protocol temporal mode is unsupported/);
    assert.equal(r.completion, undefined);
    assert.equal(r.span.start, 0);
  }
});

test("a modified or copied frontend machine cannot mint a source-owned completion graph", () => {
  const machine = machineOf("false.ts", source("false"));
  const op = machine.environment.get("op");
  machine.environment.set("op", { ...op, resolves: [] });
  assert.throws(() => transitionsOf(machine), /Source-bound completion requires the unchanged frontend/);
  const copy = { ...machineOf("one.ts", source("one")) };
  assert.throws(() => transitionsOf(copy), /Source-bound completion requires the unchanged frontend/);
});

test("source provenance preserves signed zero and nonfinite numeric literal identity", () => {
  for (const [literal, changed] of [["0", -0], ["1e400", -Infinity], ["1e400", NaN]]) {
    const text = source("one").replace("Number.isFinite(result)", `Object.is(result, ${literal})`);
    const m = machineOf("numeric-provenance.ts", text);
    const before = temporalMachineIdentity(m);
    assert.ok(before);
    const value = m.environment.get("op").resolves[0].ast.arguments[1];
    assert.equal(value.type, "Literal");
    value.value = changed;
    assert.equal(temporalMachineIdentity(m), undefined, literal);
    assert.throws(() => transitionsOf(m), /Source-bound completion requires the unchanged frontend/);
  }
});
