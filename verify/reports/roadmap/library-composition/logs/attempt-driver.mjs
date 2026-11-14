#!/usr/bin/env node
// Authored report checker. Run through the shared serial-verify.py lane.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { verifyFile } from "../../../index.mjs";
import { load } from "../../../modules.mjs";
import { compile } from "../../../source.mjs";
import { obligation } from "../../../proofs.mjs";
import { here, hash, pinnedFixtures } from "./fixture.mjs";

const budgetMs = 60_000; // One deadline for the complete separate-module graph.
const root = here("./fixtures/gpl-3.0/");
async function firstProof() {
  const { pins } = await pinnedFixtures({ write: process.argv.includes("--write-fixtures") });
  await writeFile(here("./provenance.json"), JSON.stringify(pins, null, 2) + "\n");
  if (process.argv.includes("--dump-only")) return dumpActual();
  console.log(JSON.stringify({ event: "start", requestBudgetMs: budgetMs, entry: root + "caller.js" }));
  const start = performance.now();
  const report = await verifyFile(root + "caller.js", { timeoutMs: budgetMs,
    cache: { dir: here("./.work/cache") }, evidence: true });
  const record = { name: "second-whole-graph", requestBudgetMs: budgetMs, ms: performance.now() - start, report };
  await writeFile(here("./logs/03-second-proof.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify(record));
  if (report.outcomes.some((o) => o.status !== "verified")) await dumpActual();
  assert.equal(report.outcomes.length, 3);
  for (const o of report.outcomes) assert.equal(o.status, "verified", JSON.stringify(o));
}
async function dumpActual() {
    const snapshot = load(root + "caller.js");
    if (snapshot.error) throw snapshot.error;
    const { targets } = compile(snapshot.records);
    const directory = here("./logs/second-obligations/");
    await mkdir(directory, { recursive: true });
    const inventory = [];
    for (const target of targets) for (let i = 0; i < target.postconditions.length; i++) {
      const query = obligation(target, "postcondition", i);
      const name = `${target.name}.${i + 1}.smt2`;
      const source = `${query.declarations}\n${query.assertions.map((a) => `(assert ${a})`).join("\n")}\n(check-sat)\n`;
      await writeFile(directory + name, source);
      inventory.push({ name, sha256: hash(source), bytes: Buffer.byteLength(source),
        kind: target.obligations[i]?.kind ?? "ensures", metadata: { ...query, declarations: undefined, assertions: undefined, models: undefined } });
    }
    await writeFile(directory + "inventory.json", JSON.stringify(inventory, null, 2) + "\n");
    console.log(JSON.stringify({ event: "actual-obligations", inventory }));
}
await firstProof();
