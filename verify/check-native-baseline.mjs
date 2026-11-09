// Read-only compiler comparison for the native quantified regression cases.
// Copies historical verifier modules into a temporary directory here; no checkout,
// branch, original source file, or package installation changes. The optional
// --solve-baseline flag runs representative baseline cases through its solver;
// run that command through the shared serial test lane.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile } from "./source.mjs";
import { single, load } from "./modules.mjs";
import { takeCases } from "./examples/remeda/check.mjs";

const here = dirname(fileURLToPath(import.meta.url)), root = dirname(here);
const solveBaseline = process.argv.includes("--solve-baseline");
const baseline = process.argv.slice(2).find((arg) => arg !== "--solve-baseline") ?? "ff2518cd7494300084f2ab54da71f4d79185e586";
const temporary = await mkdtemp(join(here, ".native-baseline-"));
try {
  for (const file of ["error.mjs", "data.mjs", "source.mjs", "modules.mjs", ...(solveBaseline ? ["index.mjs", "solver.mjs"] : [])]) {
    await writeFile(join(temporary, file), execFileSync("git", ["show", `${baseline}:verify/${file}`], { cwd: root }));
  }
  const original = await import(pathToFileURL(join(temporary, "source.mjs")));
  const modules = await import(pathToFileURL(join(temporary, "modules.mjs")));
  const upstream = await readFile(join(here, "examples/remeda/take.upstream.ts"), "utf8");
  const provenance = JSON.parse(await readFile(join(here, "examples/remeda/provenance.json"), "utf8"));
  const cases = takeCases(upstream, provenance);
  const helper = cases.find((c) => c.name === "exact-length-and-prefix").source;
  cases.unshift({ name: "nested-callbacks", source: `// ensures result.every((value, index) => xs.every((other, position) => position !== index || Object.is(value, other)))
const copy = (xs: number[]) => xs.slice();
// ensures result.every((value) => [value].every((item) => Object.is(item, value)))
const literal = (xs: number[]) => xs.slice();`, file: "input.ts" });
  cases.push({ name: "composed-calls", source: `${helper}
/** @param {number[]} array */
// ensures result.length === (array.length < 2 ? array.length : 2)
// ensures result.every((value, index) => Object.is(value, array[index]))
const firstTwo = (array) => takeImplementation(takeImplementation(array, 3), 2);` });
  cases.push({ name: "shifted-calls", source: `${helper}
/** @param {number[]} array */
// requires array.length > 2
// ensures result.length === 2
// ensures result.every((value, index) => Object.is(value, array[index]))
const shifted = (array) => takeImplementation(array.slice(1), 2);` });
  for (const file of ["composed.js", "shifted.js"]) cases.push({ name: `import-${file}`, entry: join(here, "examples/remeda", file) });
  const evidence = [];
  const projection = ({ name, params, declarations, pre, post, smallWitness, resultType, executable }) =>
    ({ name, params: params.map(({ name, type, model }) => ({ name, type, model })),
      declarations, pre, post, smallWitness, resultType, executable });
  for (const c of cases) {
    const snapshot = c.entry ? load(c.entry) : single(c.file ?? `${c.name}.js`, c.source);
    const before = c.entry ? modules.load(c.entry) : modules.single(c.file ?? `${c.name}.js`, c.source);
    assert.ifError(snapshot.error);
    assert.ifError(before.error);
    const current = compile(snapshot.records).targets, old = original.compile(before.records).targets;
    assert.ok(current.every((t) => t.preDefined === "true" && !t.spec), `${c.name}: unexpected specification query`);
    const queries = current.map(projection);
    assert.deepEqual(queries, old.map(projection), `${c.name}: native solver obligations changed`);
    evidence.push({ name: c.name, targets: current.length, sha256: createHash("sha256").update(JSON.stringify(queries)).digest("hex") });
  }
  const baselineOutcomes = [];
  if (solveBaseline) {
    const api = await import(pathToFileURL(join(temporary, "index.mjs")));
    for (const name of ["nested-callbacks", "composed-calls", "import-shifted.js"]) {
      const c = cases.find((c) => c.name === name), timeoutMs = name === "nested-callbacks" ? 30_000 : 60_000;
      const report = c.entry ? await api.verifyFile(c.entry, { timeoutMs }) : await api.verify(c.source, { file: c.file ?? `${c.name}.js`, timeoutMs });
      baselineOutcomes.push({ name, outcomes: report.outcomes.map(({ fn, status, reason, message }) => ({ fn, status, reason, message })) });
    }
  }
  console.log(JSON.stringify({ baseline, identical: true, cases: evidence, ...(solveBaseline ? { baselineOutcomes } : {}) }, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
