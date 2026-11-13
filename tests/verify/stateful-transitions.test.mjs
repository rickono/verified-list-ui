import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { machineOf } from "../../verify/stateful/machine.mjs";
import { transitionsOf } from "../../verify/stateful/transitions.mjs";
import { solve } from "../../verify/proofs.mjs";

const read = (name) => readFileSync(new URL(`./fixtures/stateful/${name}`, import.meta.url), "utf8");
const compile = (name) => transitionsOf(machineOf(name, read(name)));
test("original AST segments prove guarded search and both annotated awaits", async () => {
  for (const name of ["pilots/search.ts", "variants/V18b-two-awaits-annotated.ts", "variants/V11-rejects.ts"]) {
    const { units } = compile(name);
    const states = await solve(units.map((u) => u.target), 30_000);
    assert.deepEqual(states.map((s) => s.status), units.map(() => "verified"), JSON.stringify(states.map((s) => ({ name: units[states.indexOf(s)].name, outcome: s }))));
    if (name.includes("V18b")) assert.equal(units.filter((u) => u.kind === "interference").length, 6);
    if (name.includes("V11")) assert.ok(units.some((u) => u.name === "$reject"));
  }
});
test("keeps refutes overclaim; private deletion reproduces the unsound ablation", async () => {
  const { units } = compile("pilots/search-overclaim.ts");
  const states = await solve(units.map((u) => u.target), 30_000);
  const keeps = states[units.findIndex((u) => u.name === "search$0$keeps$search$1")];
  assert.equal(keeps.status, "counterexample");
  // Mutation of the test-owned target list only. Production has no switch.
  const ablated = await solve(units.filter((u) => u.kind !== "interference").map((u) => u.target), 30_000);
  assert.ok(ablated.every((s) => s.status === "verified"));
});
test("AST seam preserves original statements/spans and has no witness bound", () => {
  const { units } = compile("pilots/search.ts");
  assert.deepEqual(units.map((u) => u.name), ["$init", "search$0", "search$1", "search$0$keeps$search$1", "search$1$keeps$search$1"]);
  const source = read("pilots/search.ts"), step = units.find((u) => u.name === "search$0");
  assert.equal(source.slice(step.body[0].start, step.body[0].end), "const id: number = latest + 1;");
  const proof = units.map((u) => [u.target.declarations, u.target.pre, u.target.postconditions]);
  assert.doesNotMatch(JSON.stringify(proof), /maxDepth|eventBound|activationCount|sampleLimit/);
});
