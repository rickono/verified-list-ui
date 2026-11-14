import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { machineOf } from "/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/verify/stateful/machine.mjs";
import { transitionsOf } from "/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/verify/stateful/transitions.mjs";
import { validateProtocolUnits } from "/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/verify/stateful/protocol-rules.mjs";
import { constant, projection } from "/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/verify/stateful/projection.mjs";

const source = readFileSync(new URL("/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/tests/verify/fixtures/stateful/protocols/advisory.ts", "file:"), "utf8");
const machine = machineOf("advisory.ts", source), { units } = transitionsOf(machine);
const results = [];
for (const name of ["$request$abort-keeps", "$request$selected-keeps"]) {
  const changed = units.map((u) => u.name === name ? { ...u,
    requires: [], ensures: [{ text: "unrelated true claim", span: u.span, ast: projection(constant(true), u.span) }],
    target: { ...u.target, pre: "true", post: "true", postconditions: ["true"] } } : u);
  let observed = "accepted";
  try { validateProtocolUnits(changed, machine); } catch (e) { observed = "rejected"; }
  results.push({ name, expected: "rejected", observed });
}
console.log(JSON.stringify({ results }, null, 2));
assert.ok(results.every((r) => r.expected === r.observed), "Names alone must not admit unrelated abort claims");
