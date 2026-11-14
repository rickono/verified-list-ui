import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { compile } from "../../verify/source.mjs";
import { load } from "../../verify/modules.mjs";
import { phases, obligation } from "../../verify/proofs.mjs";
import { machineOf } from "../../verify/stateful/machine.mjs";
import { transitionsOf } from "../../verify/stateful/transitions.mjs";
import { replayTrace, traceOf } from "../../verify/stateful/traces.mjs";
import { recordCompletion as record } from "./fixtures/completion-cases.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const prepared = "5f0fb47a0a822d62537f296ef804d5037eebba5c";
test("no-temporal modules preserve prepared-HEAD compile artifacts, every phase query, full reports and native cuts byte for byte", async () => {
  const temporary = mkdtempSync(join(root, "verify/.completion-parity-"));
  const observed = { prepared, defaults: [], stateful: [], reports: [], native: [] };
  try {
    const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", prepared, "verify"], { cwd: root, encoding: "utf8" }).trim().split("\n")
      .filter((p) => /^verify\/(?:stateful\/)?[^/]+\.mjs$/.test(p));
    for (const path of paths) {
      const output = join(temporary, "old", path.slice("verify/".length));
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, execFileSync("git", ["show", `${prepared}:${path}`], { cwd: root }));
    }
    for (const folder of ["", "stateful/"]) for (const name of readdirSync(join(root, "verify", folder)).filter((p) => p.endsWith(".mjs"))) {
      const output = join(temporary, "current", folder, name);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, readFileSync(join(root, "verify", folder, name)));
    }
    // Feasibility witnesses depend on worker history. Record real solver
    // responses once, then compare unchanged report assembly with those exact
    // inputs. This hook exists only in these disposable test copies.
    for (const folder of ["old", "current"]) {
      const path = join(temporary, folder, "proofs.mjs");
      const source = readFileSync(path, "utf8").replace("export async function solve(", "async function actualSolve(");
      writeFileSync(path, source + `\nexport async function solve(targets, timeoutMs, options) {
        const tape = globalThis.__completionParity;
        const queries = targets.map(t => phases(t).map(([p,i]) => obligation(t,p,i)));
        if (tape.mode === "record") {
          const outcomes = await actualSolve(targets, timeoutMs, options);
          tape.rows.push({queries, outcomes}); return outcomes;
        }
        const row = tape.rows.shift();
        if (!row || JSON.stringify(queries) !== JSON.stringify(row.queries)) throw new Error("Parity solver request changed");
        return row.outcomes;
      }\n`);
    }
    const previous = async (path) => import(pathToFileURL(join(temporary, "old", path)));
    const current = async (path) => import(pathToFileURL(join(temporary, "current", path)));
    const identicalReports = async (before, after, label) => {
      const tape = { mode: "record", rows: [] }; globalThis.__completionParity = tape;
      try {
        const actual = await after(); tape.mode = "replay";
        const expected = await before();
        assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${label}: full report bytes with identical real solver outcomes`);
        assert.equal(tape.rows.length, 0); observed.reports.push(label);
      } finally { delete globalThis.__completionParity; }
    };
    const oldCompiler = await previous("source.mjs"), oldModules = await previous("modules.mjs"), oldProofs = await previous("proofs.mjs");
    const oldMachine = await previous("stateful/machine.mjs"), oldTransitions = await previous("stateful/transitions.mjs");
    const oldIndex = await previous("index.mjs"), oldStateful = await previous("stateful/index.mjs"), oldTraces = await previous("stateful/traces.mjs");
    const currentIndex = await current("index.mjs"), currentStateful = await current("stateful/index.mjs");
    const compareQueries = (before, after, label) => {
      assert.equal(JSON.stringify(after), JSON.stringify(before), `${label}: complete compiled target bytes`);
      for (let i = 0; i < before.length; i++) for (const [phase, index] of phases(after[i]))
        assert.equal(JSON.stringify(obligation(after[i], phase, index)), JSON.stringify(oldProofs.obligation(before[i], phase, index)), `${label}: ${phase}:${index}`);
    };
    for (const name of readdirSync(join(root, "verify/examples")).filter((p) => p.endsWith(".ts")).sort()) {
      const path = join(root, "verify/examples", name);
      compareQueries(oldCompiler.compile(oldModules.load(path).records).targets, compile(load(path).records).targets, name);
      observed.defaults.push(name);
    }
    for (const folder of ["pilots", "variants"]) for (const name of readdirSync(join(root, "tests/verify/fixtures/stateful", folder)).sort()) {
      const source = readFileSync(join(root, "tests/verify/fixtures/stateful", folder, name), "utf8");
      let original;
      try { original = oldTransitions.transitionsOf(oldMachine.machineOf(name, source)); }
      catch { continue; }
      const current = transitionsOf(machineOf(name, source));
      assert.equal(JSON.stringify(current), JSON.stringify(original), name);
      compareQueries(original.units.map((u) => u.target), current.units.map((u) => u.target), name);
      observed.stateful.push(`${folder}/${name}`);
    }
    for (const name of ["pilots/search.ts", "variants/V11-rejects.ts"]) {
      const source = readFileSync(join(root, "tests/verify/fixtures/stateful", name), "utf8");
      await identicalReports(() => oldStateful.checkStateful(name, source, { timeoutMs: 30_000 }),
        () => currentStateful.checkStateful(name, source, { timeoutMs: 30_000 }), name);
      const m = machineOf(name, source), actions = [{ kind: "call", entry: "search", args: [0] }, { kind: "resolve", request: 1, op: "lookup", value: 1 }];
      const trace = traceOf(m, actions);
      assert.equal(JSON.stringify(await replayTrace(name, source, trace)), JSON.stringify(await oldTraces.replayTrace(name, source, trace)), name);
      observed.native.push(name);
    }
    for (const name of ["valid.ts", "bugs.ts"]) {
      const path = join(root, "verify/examples", name);
      await identicalReports(() => oldIndex.verifyFile(path, { timeoutMs: 30_000 }),
        () => currentIndex.verifyFile(path, { timeoutMs: 30_000 }), name);
    }
    record("parity", observed);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
