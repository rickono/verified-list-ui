// Follow-up controls. Does not edit predictions.json.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { verify } from "../../../../index.mjs";
import { machineOf } from "../../../../stateful/machine.mjs";

const root = new URL("../", import.meta.url);
const predictions = JSON.parse(readFileSync(new URL("predictions-followup.json", root), "utf8"));
const tail = `// @environment
// resolves Number.isFinite(result)
declare function op(): Promise<number>;
let n = 0;
// state n >= 0
export async function work(): Promise<void> {
  const a: number = await op();
  if (a === 0) return;
  n = 1;
}
`;
const entry = machineOf("tail.ts", tail).entries[0];
let nested = false;
const walk = (node) => {
  if (!node || typeof node !== "object") return;
  if (node.type === "ReturnStatement") nested = true;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object" && value.type) walk(value);
  }
};
for (const statement of entry.segments.at(-1)) {
  if (statement.type === "ReturnStatement") nested = false;
  else walk(statement);
}
const topLevelReturn = entry.segments.at(-1).some((statement) => statement.type === "ReturnStatement");
const tailObserved = { topLevelReturn, nestedReturn: nested && !topLevelReturn };
const ranks = `// requires k === 9007199254740992
// ensures result > k
function advances(k: number): number { return k + 1; }
// requires k === 9007199254740992
// ensures result === k
function collapses(k: number): number { return k + 1; }
// requires Number.isInteger(k) && k === 1
// ensures real(k) - real(result) >= real("1")
function halfStep(k: number): number { return k / 2; }
`;
const report = await verify(ranks, { file: "followup.ts", timeoutMs: 60_000 });
const follow = Object.fromEntries(report.outcomes.filter((o) => o.fn).map((o) => [o.fn, { status: o.status, phase: o.phase ?? null, reason: o.reason ?? null }]));
const observed = { "tail-nested": tailObserved, "follow-ranks": Object.fromEntries(Object.entries(follow).map(([name, row]) => [name, row.status])) };
function matches(predicted, actual) {
  if (Array.isArray(predicted)) return Array.isArray(actual) && predicted.every((item, i) => matches(item, actual[i]));
  if (predicted && typeof predicted === "object") return !!actual && Object.entries(predicted).every(([key, value]) => matches(value, actual[key]));
  return Object.is(predicted, actual);
}
const rows = Object.entries(predictions.cases).map(([id, predicted]) => ({ id, match: matches(predicted, observed[id]), predicted, observed: id === "follow-ranks" ? follow : observed[id] }));
mkdirSync(new URL("logs/", root), { recursive: true });
writeFileSync(new URL("logs/followup.json", root), JSON.stringify({ rows, diffs: rows.filter((row) => !row.match).map((row) => row.id) }, null, 2) + "\n");
console.log(JSON.stringify(rows.map((row) => ({ id: row.id, match: row.match, observed: row.observed }))));
if (rows.some((row) => !row.match)) process.exitCode = 2;
