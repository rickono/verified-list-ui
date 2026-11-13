import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Parser, tokenizer } from "acorn";
import { verifyFile } from "../../index.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const here = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));
const OPTIONS = { ecmaVersion: 2022, sourceType: "module" };
const tokens = (source) => [...tokenizer(source, OPTIONS)].map((t) => source.slice(t.start, t.end));
const replaceOnce = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Expected one mutation site: ${before}`);
  return source.replace(before, after);
};
const outcome = (report, fn) => report.outcomes.find((o) => o.fn === fn);

// The proof adds line comments only. The accumulator keeps its upstream name.
export const SUM_CONTRACT = "ensures nums.length !== 0 || Object.is(result, 0)";
export const SUM_LOOP = [
  "invariant i !== 0 || Object.is(result, 0)",
  "invariant Number.isInteger(i) && 0 <= i && i <= nums.length",
  "decreases real(nums.length) - real(i)",
];
export const MEAN_CONTRACT = "ensures nums.length !== 0 || Number.isNaN(result)";

function pinned(source, entry) {
  assert.equal(Buffer.byteLength(source), entry.bytes, `${entry.local} changed size.`);
  assert.equal(hash(source), entry.sha256, `${entry.local} changed.`);
  const stripped = stripTypeScriptTypes(source);
  assert.equal(stripped.length, source.length, "Type stripping must preserve offsets.");
  const program = Parser.parse(stripped, OPTIONS);
  const top = program.body.find((n) => n.type === "ExportNamedDeclaration" && n.declaration?.type === "FunctionDeclaration" && n.declaration.id.name === entry.declaration);
  assert.ok(top, `The pinned ${entry.declaration} declaration is missing.`);
  assert.equal(hash(source.slice(top.start, top.end)), entry.declarationSha256, `The extracted ${entry.declaration} declaration changed.`);
  return { source, stripped, top, fn: top.declaration };
}

// Insert comment lines at fixed offsets, then prove the insertion is the only change.
function annotate(source, insertions) {
  let annotated = source;
  for (const { at, text } of [...insertions].sort((a, b) => b.at - a.at)) {
    assert.ok(text.split("\n").every((line) => /^\s*(\/\/ .*)?$/.test(line)), `Only line comments may be inserted: ${text}`);
    annotated = annotated.slice(0, at) + text + annotated.slice(at);
  }
  // Removing in ascending order puts each later insertion back at its original offset.
  let recovered = annotated;
  for (const { at, text } of [...insertions].sort((a, b) => a.at - b.at)) {
    assert.equal(recovered.slice(at, at + text.length), text);
    recovered = recovered.slice(0, at) + recovered.slice(at + text.length);
  }
  assert.equal(recovered, source, "Removing the proof comments must recover the pinned bytes.");
  assert.equal(hash(recovered), hash(source));
  assert.deepEqual(tokens(annotated), tokens(source), "Proof comments must preserve every TypeScript token.");
  assert.deepEqual(tokens(stripTypeScriptTypes(annotated)), tokens(stripTypeScriptTypes(source)), "Proof comments must preserve every executable token.");
  return annotated;
}

export function annotatedSources(sources, provenance) {
  const sum = pinned(sources.sum, provenance.files.sum);
  const mean = pinned(sources.mean, provenance.files.mean);
  const loop = sum.fn.body.body.find((n) => n.type === "ForStatement");
  assert.ok(loop, "The sum loop is missing.");
  assert.equal(sum.fn.body.body.find((n) => n.type === "VariableDeclaration")?.declarations[0].id.name, "result", "The pinned accumulator is named result.");
  const imports = mean.stripped.slice(0, mean.top.start);
  assert.match(imports, /^import \{ sum \} from '\.\/sum\.ts';\n/, "mean keeps its upstream ./sum.ts import.");
  return {
    sum: annotate(sum.source, [
      { at: sum.top.start, text: `// ${SUM_CONTRACT}\n` },
      { at: loop.start, text: SUM_LOOP.map((line, i) => `${i ? "  " : ""}// ${line}\n`).join("") + "  " },
    ]),
    mean: annotate(mean.source, [{ at: mean.top.start, text: `// ${MEAN_CONTRACT}\n` }]),
  };
}

// Native V8 executes the pinned module graph, or a named mutant, through Node's
// own type stripping. No verifier value helper is involved.
async function nativeModules(sum, mean) {
  const directory = realpathSync.native(await mkdtemp(join(tmpdir(), "es-toolkit-native-")));
  await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
  await writeFile(join(directory, "sum.ts"), sum);
  await writeFile(join(directory, "mean.ts"), mean);
  const load = (name) => import(pathToFileURL(join(directory, name)).href);
  const [{ sum: nativeSum }, { mean: nativeMean }] = await Promise.all([load("sum.ts"), load("mean.ts")]);
  return { sum: nativeSum, mean: nativeMean, directory };
}

export async function nativeSamples(sources) {
  const native = await nativeModules(sources.sum, sources.mean);
  try {
    const { sum, mean } = native;
    // These literals are the pinned spec files' expectations; the checks below
    // fail if either spec stops saying them.
    for (const text of ["sum([1, 2, 3, 4]);", "toBe(10)", "sum([]);", "toBe(0)", "sum([-1, -2, -3, 4]);", "toBe(-2)",
      "expect(sum(array1) + sum(array2)).toBe(sum([...array1, ...array2]))"]) assert.ok(sources.sumSpec.includes(text), text);
    for (const text of ["expect(mean([1, 2, 3, 4, 5])).toEqual(3)", "expect(mean([])).toEqual(NaN)"]) assert.ok(sources.meanSpec.includes(text), text);
    const samples = [
      ["spec sum([1, 2, 3, 4]) is 10", Object.is(sum([1, 2, 3, 4]), 10)],
      ["spec sum([]) is +0", Object.is(sum([]), 0)],
      ["spec sum([-1, -2, -3, 4]) is -2", Object.is(sum([-1, -2, -3, 4]), -2)],
      ["spec sum([]) + sum([1, 2, 3, 4]) is sum of the concatenation", Object.is(sum([]) + sum([1, 2, 3, 4]), sum([1, 2, 3, 4]))],
      ["spec mean([1, 2, 3, 4, 5]) is 3", Object.is(mean([1, 2, 3, 4, 5]), 3)],
      ["spec mean([]) is NaN", Number.isNaN(mean([]))],
      ["binary64 sum([-0]) is +0, not -0", Object.is(sum([-0]), 0)],
      ["binary64 sum([NaN]) is NaN", Number.isNaN(sum([NaN]))],
      ["binary64 sum([Infinity, -Infinity]) is NaN with no NaN input", Number.isNaN(sum([Infinity, -Infinity]))],
      ["binary64 sum([0.1, 0.2]) rounds to 0.30000000000000004", Object.is(sum([0.1, 0.2]), 0.30000000000000004)],
      ["binary64 mean([-0]) is +0", Object.is(mean([-0]), 0)],
    ];
    for (const [name, ok] of samples) assert.ok(ok, name);
    return samples.map(([name]) => name);
  } finally { await rm(native.directory, { recursive: true, force: true }); }
}

async function project(files, entry) {
  const directory = realpathSync.native(await mkdtemp(join(tmpdir(), "es-toolkit-verify-")));
  try {
    for (const [name, text] of Object.entries(files)) await writeFile(join(directory, name), text);
    const report = await verifyFile(join(directory, entry), { timeoutMs: 60_000 });
    const modules = report.modules.map((m) => ({ ...m, file: m.file.slice(directory.length + 1) }));
    return { ...report, modules };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

// A counterexample must be reported as confirmed and must reproduce in native
// execution of the exact sum/mean module text that was verified, minus comments.
async function nativeCounterexample(report, fn, executable, claim) {
  const o = outcome(report, fn);
  assert.equal(o?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(o.confirmed, true, JSON.stringify(o));
  assert.ok(o.failed?.length, "A contract must fail, not just an induction hint.");
  const nums = o.inputs.nums.map(Number);
  const native = await nativeModules(executable.sum, executable.mean);
  try {
    const actual = native[fn](nums);
    assert.ok(Object.is(actual, Number(o.result)), `native ${actual} differs from the reported ${o.result}`);
    assert.equal(claim(actual, nums), false, `The native return must violate the claim for ${JSON.stringify(o.inputs)}.`);
  } finally { await rm(native.directory, { recursive: true, force: true }); }
  return o;
}

export async function checkSumMean() {
  const provenance = JSON.parse(await readFile(here("provenance.json"), "utf8"));
  const read = (key) => readFile(here(provenance.files[key].local), "utf8");
  const sources = { sum: await read("sum"), mean: await read("mean"), sumSpec: await read("sumSpec"), meanSpec: await read("meanSpec") };
  for (const key of ["sumSpec", "meanSpec"]) {
    assert.equal(Buffer.byteLength(sources[key]), provenance.files[key].bytes);
    assert.equal(hash(sources[key]), provenance.files[key].sha256, `${provenance.files[key].local} changed.`);
  }
  assert.equal(hash(await readFile(here(provenance.licensePath))), provenance.licenseSha256, "The pinned license changed.");
  const annotated = annotatedSources(sources, provenance);
  const samples = await nativeSamples(sources);

  // The documented empty-array behavior, composed through the original import.
  const composed = await project({ "sum.ts": annotated.sum, "mean.ts": annotated.mean }, "mean.ts");
  assert.equal(composed.outcomes.length, 2, JSON.stringify(composed.outcomes));
  assert.equal(outcome(composed, "sum")?.status, "verified", JSON.stringify(composed.outcomes));
  assert.equal(outcome(composed, "mean")?.status, "verified", JSON.stringify(composed.outcomes));
  assert.deepEqual(composed.modules.map((m) => [m.file, m.sha256]).sort(), [["mean.ts", hash(annotated.mean)], ["sum.ts", hash(annotated.sum)]]);

  // A weaker sum summary must remove mean's proof without touching mean's bytes.
  const weakSum = replaceOnce(annotated.sum, SUM_CONTRACT, "ensures nums.length !== 0 || !Number.isNaN(result)");
  const weakened = await project({ "sum.ts": weakSum, "mean.ts": annotated.mean }, "mean.ts");
  assert.equal(outcome(weakened, "sum")?.status, "verified", JSON.stringify(weakened.outcomes));
  assert.equal(outcome(weakened, "mean")?.status, "unknown", JSON.stringify(weakened.outcomes));
  assert.equal(outcome(weakened, "mean").reason, "contract-gap");
  assert.notEqual(weakened.graphSha256, composed.graphSha256);

  // Wrong signed-zero and NaN claims on the unchanged bodies are native counterexamples.
  const negativeZero = await project({ "sum.ts": replaceOnce(annotated.sum, SUM_CONTRACT, "ensures nums.length !== 0 || Object.is(result, -0)") }, "sum.ts");
  const zeroMean = await project({ "sum.ts": annotated.sum, "mean.ts": replaceOnce(annotated.mean, MEAN_CONTRACT, "ensures nums.length !== 0 || Object.is(result, 0)") }, "mean.ts");
  assert.equal(outcome(zeroMean, "sum")?.status, "verified", JSON.stringify(zeroMean.outcomes));
  const unchanged = { sum: sources.sum, mean: sources.mean };
  const nz = await nativeCounterexample(negativeZero, "sum", unchanged, (r, nums) => nums.length !== 0 || Object.is(r, -0));
  const zm = await nativeCounterexample(zeroMean, "mean", unchanged, (r, nums) => nums.length !== 0 || Object.is(r, 0));
  assert.deepEqual([nz.inputs.nums, zm.inputs.nums], [[], []]);

  // A seeded return bug is caught on the same proof comments.
  const bumped = { sum: replaceOnce(sources.sum, "return result;", "return result + 1;"), mean: sources.mean };
  const returnMutant = await project({ "sum.ts": replaceOnce(annotated.sum, "return result;", "return result + 1;") }, "sum.ts");
  const rm1 = await nativeCounterexample(returnMutant, "sum", bumped, (r, nums) => nums.length !== 0 || Object.is(r, 0));
  assert.deepEqual(rm1.inputs.nums, []);

  return {
    provenance,
    scope: "Unchanged es-toolkit v1.53.2 sum and mean plus line comments. For every dense binary64 number array the verifier models, an empty input makes sum return +0 and mean return NaN. mean is proved through the original './sum.ts' import and sum's contract. No property of nonempty inputs, no real-number sum and no concatenation law is claimed.",
    annotated,
    nativeSamples: samples,
    checks: [
      { name: "composed-empty", ...composed },
      { name: "weakened-sum-summary", ...weakened },
      { name: "negative-zero-sum-claim", ...negativeZero },
      { name: "zero-mean-claim", ...zeroMean },
      { name: "return-plus-one-mutant", ...returnMutant },
    ],
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await checkSumMean(), null, 2));
}
