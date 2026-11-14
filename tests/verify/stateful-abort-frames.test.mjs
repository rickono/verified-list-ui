import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { machineOf } from "../../verify/stateful/machine.mjs";
import { transitionsOf } from "../../verify/stateful/transitions.mjs";
import { validateProtocolUnits } from "../../verify/stateful/protocol-rules.mjs";
import { constant, projection } from "../../verify/stateful/projection.mjs";
import { solve } from "../../verify/proofs.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = readFileSync(new URL("./fixtures/stateful/protocols/advisory.ts", import.meta.url), "utf8");
const machine = machineOf("advisory.ts", source);

test("abort rule names cannot admit unrelated true claims", () => {
  const { units } = transitionsOf(machine);
  for (const name of ["$abort$contents", "$request$abort-keeps", "$request$selected-keeps"]) {
    const changed = units.map((u) => u.name === name ? { ...u, requires: [],
      ensures: [{ text: "unrelated", span: u.span, ast: projection(constant(true), u.span) }],
      target: { ...u.target, pre: "true", post: "true", postconditions: ["true"] } } : u);
    assert.throws(() => validateProtocolUnits(changed, machine), /unbound advisory abort/);
  }
});

test("source abort frames retain their actual action span and cannot be deleted", () => {
  const { units } = transitionsOf(machine);
  const step = units.find((u) => u.name === "dispose$0");
  assert.equal(step.protocolAborts.length, 1);
  const proof = step.protocolAborts[0];
  assert.equal(source.slice(proof.span.start, proof.span.end), "controller.abort()");
  assert.ok(step.ensures.some((c) => c.abortProof === proof.id));
  const deleted = units.map((u) => u === step ? { ...u, protocolAborts: [],
    ensures: u.ensures.filter((c) => c.abortProof !== proof.id) } : u);
  assert.throws(() => validateProtocolUnits(deleted, machine), /missing source advisory abort frame dispose\$0/);
});

test("an added abort assumption cannot make its preservation rule vacuous", () => {
  const { units } = transitionsOf(machine);
  const name = "$request$abort-keeps";
  const changed = units.map((u) => u.name === name ? { ...u, requires: [
    ...u.requires, { text: "false", span: u.span, ast: projection(constant(false), u.span) },
  ] } : u);
  assert.throws(() => validateProtocolUnits(changed, machine), /unbound advisory abort/);
});

test("source abort admission cannot erase its action or write certificate", () => {
  const { units } = transitionsOf(machine);
  for (const patch of [
    { protocolActions: [] },
    { protocolEffects: { writes: false } },
    { target: { ...units.find((u) => u.name === "dispose$0").target, effects: { kind: "pure" } } },
  ]) {
    const changed = units.map((u) => u.name === "dispose$0" ? { ...u, ...patch } : u);
    assert.throws(() => validateProtocolUnits(changed, machine), /missing source advisory abort frame/);
  }
});

for (const mutation of ["pending", "settled", "running", "aborted"]) {
  test(`a real abort transformation that loses ${mutation} fails both its schema and source step`, async (t) => {
    const temporary = mkdtempSync(join(root, ".stateful-abort-"));
    try {
      for (const dir of ["verify", "verify/stateful"]) {
        mkdirSync(join(temporary, dir), { recursive: true });
        for (const name of readdirSync(join(root, dir)).filter((p) => p.endsWith(".mjs"))) {
          writeFileSync(join(temporary, dir, name), readFileSync(join(root, dir, name)));
        }
      }
      const file = join(temporary, "verify/stateful/protocol-abort.mjs");
      const original = readFileSync(file, "utf8"), anchor = "aborted: update(state.aborted, [signal], constant(true))";
      assert.equal(original.split(anchor).length, 2);
      const replacement = mutation === "aborted" ? "aborted: state.aborted" : `${anchor}, ${mutation}: () => constant(false)`;
      writeFileSync(file, original.replace(anchor, replacement));
      const { machineOf: privateMachine } = await import(pathToFileURL(join(temporary, "verify/stateful/machine.mjs")));
      const { transitionsOf: privateTransitions } = await import(pathToFileURL(join(temporary, "verify/stateful/transitions.mjs")));
      const { units } = privateTransitions(privateMachine("advisory.ts", source));
      const schema = mutation === "aborted" ? "$abort$contents" : "$request$abort-keeps";
      const selected = [schema, "dispose$0"].map((name) => units.find((u) => u.name === name));
      const outcomes = await solve(selected.map((u) => u.target), 10_000);
      t.diagnostic(JSON.stringify(selected.map((u, i) => ({ unit: u.name, mutation, status: outcomes[i].status }))));
      for (const result of outcomes) assert.equal(result.status, "counterexample", JSON.stringify(result));
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
}
