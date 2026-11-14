// Follow-up for probe mismatches that were source-shape or cross-compile artifacts,
// plus the same-compile closure check. Imports only the 20ff205 archive.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ARCHIVE = process.env.ARCHIVE ?? "/tmp/cc-20ff205";
const href = (rel) => pathToFileURL(join(ARCHIVE, rel)).href;
const { checkStateful } = await import(href("verify/stateful/index.mjs"));
const { machineOf } = await import(href("verify/stateful/machine.mjs"));
const { transitionsOf } = await import(href("verify/stateful/transitions.mjs"));
const { completionPlan, concludeCompletion } = await import(href("verify/stateful/temporal.mjs"));
const { readCompletion } = await import(href("tests/verify/fixtures/completion-cases.mjs"));
const { solve } = await import(href("verify/proofs.mjs"));

const cases = [];
const out = new URL("./followup-log.json", import.meta.url);
const save = () => writeFileSync(out, JSON.stringify({ cases, mismatches: cases.filter((c) => !c.match).map((c) => c.id) }, null, 2) + "\n");
const add = (row) => { cases.push(row); save(); console.log(`${row.match ? "ok" : "MISMATCH"} ${row.id}`); };

const two = await checkStateful("two.ts", readCompletion("two"), { timeoutMs: 20000 });
const machine = machineOf("two.ts", readCompletion("two"));
const transitions = transitionsOf(machine);
const plan = completionPlan(machine, transitions);
const safety = { status: two.safety.status, units: two.units, scope: two.scope };
const cross = concludeCompletion(machine, transitions, plan, two.completion.units, safety);
add({ id: "cross-compile-gate", match: cross.goals.every((g) => g.status === "verified"), observed: {
  publicClosed: two.completion.closed, publicManifest: two.completion.manifestSha256,
  freshManifest: plan.sha256, sameManifest: two.completion.manifestSha256 === plan.sha256,
  crossGoals: cross.goals.map((g) => g.status), crossClosed: cross.closed,
  hashPairs: plan.targets.map((t) => ({ unit: t.unit, plan: t.querySha256, evidence: two.completion.units.find((e) => e.unit === t.unit)?.querySha256 ?? null })),
}});

const outcomes = await solve(plan.targets.map((t) => t.target), 20000);
const evidence = plan.targets.map((t, i) => ({ unit: t.unit, querySha256: t.querySha256, ...outcomes[i] }));
const same = concludeCompletion(machine, transitions, plan, evidence, safety);
add({ id: "same-compile-gate", match: same.closed === true && same.goals.every((g) => g.status === "verified"), observed: { closed: same.closed, goals: same.goals.map((g) => ({ entry: g.entry, status: g.status, reason: g.reason ?? null })), outcomes: evidence.map((e) => ({ unit: e.unit, status: e.status })) } });

async function run(id, source, expected) {
  const report = await checkStateful(`${id}.ts`, source, { timeoutMs: 20000 });
  const observed = { status: report.status, message: report.message ?? null, safety: report.safety?.status ?? null, reason: report.reason ?? report.completion?.goals?.[0]?.reason ?? null, closed: report.completion?.closed ?? null, goals: report.completion?.goals?.map((g) => ({ entry: g.entry, status: g.status, reason: g.reason ?? null })) ?? null };
  const match = Object.entries(expected).every(([k, v]) => JSON.stringify(observed[k]) === JSON.stringify(v));
  add({ id, match, expected, observed });
}

await run("empty-middle", `// @environment
// resolves Number.isFinite(result)
// rejects
// settles eventually
declare function op(): Promise<number>;
let n = 0;
// state n >= 0
// leads work completes
export async function work() {
  await op();
  await op();
}
`, { status: "verified", closed: true });

await run("negzero-constant", `// @environment
// resolves Object.is(result, q) && Object.is(q, -0)
// settles eventually
declare function op(q: number): Promise<number>;
let n = 0;
// state n >= 0
// leads work completes
export async function work() { await op(-0); n = 1; }
`, { status: "verified" });

await run("reachable-partial", readCompletion("partial").replace("await op(q)", "await op(1)"), { status: "verified" });

console.log(JSON.stringify({ mismatches: cases.filter((c) => !c.match).map((c) => c.id) }));
