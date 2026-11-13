// Strong/weak-contract controls for the es-toolkit sum/mean pilot, run against an archived head.
// Usage: node es-controls.mjs <archived-head-dir> <scratch-dir>
// Each control edits only proof comments (or one named body mutation), verifies the
// two-file graph through mean.ts's original './sum.ts' import, and checks every
// verified outcome natively on the exact verified text. A verified claim that native
// V8 violates is a FALSE-PROOF; any other mismatch with the expectation is UNEXPECTED.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

const [head, scratch] = process.argv.slice(2);
const dir = join(head, "verify/examples/es-toolkit");
const check = await import(pathToFileURL(join(dir, "check.mjs")).href);
const { verifyFile } = await import(pathToFileURL(join(head, "verify/index.mjs")).href);
const provenance = JSON.parse(await readFile(join(dir, "provenance.json"), "utf8"));
const read = (key) => readFile(join(dir, provenance.files[key].local), "utf8");
const original = { sum: await read("sum"), mean: await read("mean") };
const annotated = check.annotatedSources(original, provenance);
const sha = (text) => createHash("sha256").update(text).digest("hex");
const once = (text, before, after) => { assert.equal(text.split(before).length, 2, before); return text.replace(before, after); };
const IMPORT = "import { sum } from './sum.ts';\n";
assert.ok(annotated.mean.startsWith(IMPORT));

// Native V8: type-stripped sum, then mean minus its import line, in a fresh context.
function native(files, fn, nums) {
  const s = stripTypeScriptTypes(files.sum).replace(/^export /gm, "");
  const m = stripTypeScriptTypes(files.mean).slice(IMPORT.length).replace(/^export /gm, "");
  return runInNewContext(`${s}\n${m}\n;${fn}(__nums)`, { __nums: nums }, { timeout: 1_000 });
}
const SAMPLES = [[], [-0], [0], [1], [NaN], [Infinity, -Infinity], [1, 2, 3, 4], [-1, -2, -3, 4], [0.1, 0.2], [1e308, 1e308], [5e-324], [-0, -0]];

await mkdir(join(scratch, "controls-tmp"), { recursive: true });
async function project(files) {
  const directory = realpathSync.native(await mkdtemp(join(scratch, "controls-tmp", "graph-")));
  try {
    await writeFile(join(directory, "sum.ts"), files.sum);
    await writeFile(join(directory, "mean.ts"), files.mean);
    const report = await verifyFile(join(directory, "mean.ts"), { timeoutMs: 60_000 });
    return { ...report, modules: report.modules.map((m) => ({ file: m.file.slice(directory.length + 1), sha256: m.sha256 })) };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

const SUM = (e) => once(annotated.sum, check.SUM_CONTRACT, `ensures ${e}`);
const MEAN = (e) => once(annotated.mean, check.MEAN_CONTRACT, `ensures ${e}`);
const SUM_CLAIM = (r, n) => n.length !== 0 || Object.is(r, 0);
const MEAN_CLAIM = (r, n) => n.length !== 0 || Number.isNaN(r);
const is = (status, reason) => (o) => o?.status === status && (reason === undefined || o.reason === reason);
const not = (status) => (o) => o !== undefined && o.status !== status;
const cex = (nums, result) => (o) => o?.status === "counterexample" && o.confirmed === true && JSON.stringify(o.inputs.nums.map(Number)) === JSON.stringify(nums) && Object.is(Number(o.result), result);

const controls = [
  { id: "C0 baseline: pinned annotation", files: annotated, claims: { sum: SUM_CLAIM, mean: MEAN_CLAIM },
    expect: { sum: is("verified"), mean: is("verified") } },
  { id: "C1 strong enough: sum result === 0 (either zero)", files: { sum: SUM("nums.length !== 0 || result === 0"), mean: annotated.mean },
    claims: { sum: (r, n) => n.length !== 0 || r === 0, mean: MEAN_CLAIM }, expect: { sum: is("verified"), mean: is("verified") } },
  { id: "C2 weak: sum ensures true", files: { sum: SUM("true"), mean: annotated.mean },
    claims: { sum: () => true, mean: MEAN_CLAIM }, expect: { sum: is("verified"), mean: is("unknown", "contract-gap") }, meanBytes: true },
  { id: "C3 weak: sum only finite", files: { sum: SUM("nums.length !== 0 || Number.isFinite(result)"), mean: annotated.mean },
    claims: { sum: (r, n) => n.length !== 0 || Number.isFinite(r), mean: MEAN_CLAIM }, expect: { sum: is("verified"), mean: is("unknown", "contract-gap") }, meanBytes: true },
  { id: "C4 false callee contract cannot support the caller", files: { sum: SUM("nums.length !== 0 || Object.is(result, 1)"), mean: MEAN("nums.length !== 0 || result === Infinity") },
    claims: { sum: (r, n) => n.length !== 0 || Object.is(r, 1), mean: (r, n) => n.length !== 0 || r === Infinity },
    expect: { sum: cex([], 0), mean: not("verified") } },
  { id: "C5 mean body mutant: / (nums.length + 1)", files: { sum: annotated.sum, mean: once(annotated.mean, "return sum(nums) / nums.length;", "return sum(nums) / (nums.length + 1);") },
    claims: { sum: SUM_CLAIM, mean: MEAN_CLAIM }, expect: { sum: is("verified"), mean: cex([], 0) } },
  { id: "C6 no nonempty overclaim: mean NaN without the length guard", files: { sum: annotated.sum, mean: MEAN("Number.isNaN(result)") },
    claims: { sum: SUM_CLAIM, mean: (r) => Number.isNaN(r) }, expect: { sum: is("verified"), mean: not("verified") } },
  { id: "C7 no singleton law: sum([x]) is x (false at [-0])", files: { sum: SUM("nums.length !== 1 || Object.is(result, nums[0])"), mean: annotated.mean },
    claims: { sum: (r, n) => n.length !== 1 || Object.is(r, n[0]), mean: MEAN_CLAIM }, expect: { sum: not("verified"), mean: not("verified") } },
  { id: "C8 live-local invariant is load-bearing: drop it", files: { sum: once(annotated.sum, `  // ${check.SUM_LOOP[0]}\n`, ""), mean: annotated.mean },
    claims: { sum: SUM_CLAIM, mean: MEAN_CLAIM }, expect: { sum: not("verified"), mean: not("verified") } },
];

let baseline, falseProofs = 0, unexpected = 0;
for (const c of controls) {
  const started = Date.now();
  const report = await project(c.files);
  const ms = Date.now() - started;
  const notes = [];
  for (const fn of ["sum", "mean"]) {
    const o = report.outcomes.find((x) => x.fn === fn);
    if (o?.status === "verified") {
      const bad = SAMPLES.find((nums) => !c.claims[fn](native(c.files, fn, nums), nums));
      if (bad) { falseProofs++; notes.push(`FALSE-PROOF ${fn} native ${native(c.files, fn, bad)} at ${JSON.stringify(bad)}`); }
    }
    if (o?.status === "counterexample") {
      const nums = o.inputs.nums.map(Number), actual = native(c.files, fn, nums);
      const reproduced = o.confirmed === true && Object.is(actual, Number(o.result)) && c.claims[fn](actual, nums) === false;
      notes.push(`${fn} cex ${JSON.stringify(o.inputs.nums)} reported ${o.result} native ${actual} reproduced=${reproduced}`);
      if (!reproduced) unexpected++;
    }
    const ok = c.expect[fn](o);
    if (!ok) unexpected++;
    notes.push(`${fn}=${o?.status}${o?.reason ? `/${o.reason}` : ""}${ok ? "" : " (UNEXPECTED)"}`);
  }
  if (!baseline) baseline = report;
  const meanModule = report.modules.find((m) => m.file === "mean.ts");
  if (c.meanBytes) {
    const same = meanModule?.sha256 === sha(annotated.mean) && report.graphSha256 !== baseline.graphSha256;
    if (!same) unexpected++;
    notes.push(`mean.ts bytes unchanged and graph hash differs: ${same}`);
  }
  console.log(`${c.id} | ${ms}ms | ${notes.join("; ")} | graph ${report.graphSha256}`);
}
await rm(join(scratch, "controls-tmp"), { recursive: true, force: true });
console.log(`controls=${controls.length} unexpected=${unexpected} falseProofs=${falseProofs}`);
process.exitCode = falseProofs || unexpected ? 1 : 0;
