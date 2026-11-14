import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = "/tmp/c2a-measure";
const load = (rel) => import(pathToFileURL(join(root, rel)).href);
const { machineOf } = await load("verify/stateful/machine.mjs");
const { transitionsOf } = await load("verify/stateful/transitions.mjs");
const { solve } = await load("verify/proofs.mjs");
for (const file of ["listeners.ts", "advisory.ts"]) {
  const source = readFileSync(join(root, "tests/verify/fixtures/stateful/protocols", file), "utf8");
  const transitions = transitionsOf(machineOf(file, source));
  const outcomes = await solve(transitions.units.map((u) => u.target), 60000);
  const bad = transitions.units.map((u, i) => [u.name, outcomes[i].status]).filter(([, s]) => !["verified", "vacuous"].includes(s));
  const counts = {};
  for (const o of outcomes) counts[o.status] = (counts[o.status] ?? 0) + 1;
  console.log(JSON.stringify({ file, units: transitions.units.length, counts, bad }));
}
