import { readFileSync, writeFileSync } from "node:fs";
import { Parser } from "acorn";
import { machineOf } from "../../../../stateful/machine.mjs";
import { transitionsOf } from "../../../../stateful/transitions.mjs";
import { completionPlan, concludeCompletion } from "../../../../stateful/temporal.mjs";
import { checkStateful } from "../../../../stateful/index.mjs";
import { solve } from "../../../../proofs.mjs";

const read = (name) => readFileSync(new URL(`../../../../../tests/verify/fixtures/stateful/completion/${name}.ts`, import.meta.url), "utf8");
const brief = (report) => ({
  status: report.status, reason: report.reason ?? null, safety: report.safety?.status ?? null,
  nativeConfirmed: report.completion?.nativeConfirmed ?? null,
  profile: report.completion?.profile?.kind ?? null,
  goals: report.completion?.goals?.map((g) => ({
    status: g.status, reason: g.reason ?? null, nativeConfirmed: g.nativeConfirmed,
    assumptions: g.assumptions.map((a) => ({ kind: a.kind, op: a.op ?? null, classification: a.classification })),
  })) ?? null,
});
const one = await checkStateful("one.ts", read("one"), { timeoutMs: 20_000 });
const spoofed = machineOf("false.ts", read("false"));
const replacer = (_, value) => value instanceof Map ? { map: [...value] } : value instanceof Set ? { set: [...value] } : value;
const snapshot = JSON.parse(JSON.stringify(spoofed, replacer));
spoofed.toJSON = () => snapshot;
const op = spoofed.environment.get("op");
op.resolves = [{ ...op.resolves[0], text: "true", ast: Parser.parseExpressionAt("true", 0, { ecmaVersion: "latest" }) }];
const graph = transitionsOf(spoofed);
const plan = completionPlan(spoofed, graph);
const results = await solve(plan.targets.map((t) => t.target), 20_000);
const evidence = plan.targets.map((t, i) => ({ unit: t.unit, querySha256: t.querySha256, ...results[i] }));
const safety = { status: "verified", units: [...graph.units, ...(graph.completionRejections ?? [])].map((u) => ({ unit: u.name, status: "verified" })) };
const conclusion = concludeCompletion(spoofed, graph, plan, evidence, safety);
const output = {
  publicOne: brief(one),
  toJSON: {
    ownership: plan.obligations.find((o) => o.kind === "producer-ownership")?.status,
    solver: results.map((r) => r.status),
    closed: conclusion.closed,
    nativeConfirmed: conclusion.nativeConfirmed,
    goals: conclusion.goals.map((g) => ({ status: g.status, reason: g.reason ?? null, nativeConfirmed: g.nativeConfirmed })),
  },
};
writeFileSync(new URL("followup-solver.json", import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output));
