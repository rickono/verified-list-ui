import { readFileSync, writeFileSync } from "node:fs";
import { machineOf } from "../../../../stateful/machine.mjs";
import { transitionsOf } from "../../../../stateful/transitions.mjs";
import { completionPlan, concludeCompletion } from "../../../../stateful/temporal.mjs";
import { checkStateful } from "../../../../stateful/index.mjs";
import { solve } from "../../../../proofs.mjs";

const read = (name) => readFileSync(new URL(`../../../../../tests/verify/fixtures/stateful/completion/${name}.ts`, import.meta.url), "utf8");
const executed = [], unsuccessful = [];
async function row(id, fn) {
  try { executed.push({ id, ...(await fn()) }); }
  catch (error) { unsuccessful.push({ id, message: String(error?.message ?? error), name: error?.name ?? "Error" }); }
}
const brief = (report) => ({
  status: report?.status ?? null,
  reason: report?.reason ?? null,
  safety: report?.safety?.status ?? null,
  completion: report?.completion ? {
    closed: report.completion.closed,
    nativeConfirmed: report.completion.nativeConfirmed,
    goals: report.completion.goals.map((g) => ({
      entry: g.entry, status: g.status, reason: g.reason ?? null, nativeConfirmed: g.nativeConfirmed,
      assumptions: g.assumptions.map((a) => ({ kind: a.kind, op: a.op ?? null, classification: a.classification })),
    })),
    limitations: report.completion.limitations,
  } : null,
  trusted: report?.trusted ?? null,
});

await row("public-false", async () => brief(await checkStateful("false.ts", read("false"), { timeoutMs: 20_000 })));
await row("public-zero", async () => brief(await checkStateful("zero.ts", read("zero"), { timeoutMs: 20_000 })));
await row("zero-ignored-profile", async () => brief(await checkStateful("zero.ts", read("zero"), { timeoutMs: 20_000, profile: "alternate" })));
await row("two-timeout-1", async () => brief(await checkStateful("two.ts", read("two"), { timeoutMs: 1 })));
await row("historical-viability-substitution", async () => {
  const source = read("false");
  const machine = machineOf("false.ts", source);
  const graph = transitionsOf(machine);
  const safety = await checkStateful("false.ts", source, { timeoutMs: 20_000 });
  const changed = structuredClone(graph);
  changed.units.find((u) => u.name === "work$0").target.control.checks.find((c) => c.kind === "outcome-viability").smt = "true";
  const plan = completionPlan(machine, changed);
  const results = await solve(plan.targets.map((t) => t.target), 20_000);
  const evidence = plan.targets.map((t, i) => ({ unit: t.unit, querySha256: t.querySha256, ...results[i] }));
  const conclusion = concludeCompletion(machine, changed, plan, evidence, { ...safety, status: safety.safety.status });
  return {
    public: brief(safety),
    substitutedSolver: results.map((r) => r.status),
    ownership: plan.obligations.find((o) => o.kind === "producer-ownership")?.status,
    conclusion: { closed: conclusion.closed, nativeConfirmed: conclusion.nativeConfirmed, goals: conclusion.goals.map((g) => ({ status: g.status, reason: g.reason ?? null, nativeConfirmed: g.nativeConfirmed })) },
  };
});

writeFileSync(new URL("solver-results.json", import.meta.url), JSON.stringify({ infrastructure: null, node: process.version, executed, unsuccessful }, null, 2));
console.log(JSON.stringify({ executed: executed.length, unsuccessful: unsuccessful.length }));
