// Corrected controls that the first focused script did not isolate.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const seat = process.argv[2];
const outPath = process.argv[3];
const root = process.argv[4];
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const fileUrl = (path) => pathToFileURL(path).href;
const cases = [];
const save = () => writeFileSync(outPath, JSON.stringify({ seat, node: process.version, cases }, null, 2));

let api;
if (seat === "A") {
  const proto = await import(fileUrl(`${root}/verify/reports/roadmap/candidate-throws-codex/prototype.mjs`));
  const normal = await proto.build("normal");
  api = {
    verify: normal.index.verify.bind(normal.index),
    parse: normal.source.parse.bind(normal.source),
    compile: normal.source.compile.bind(normal.source),
  };
} else {
  await import(fileUrl(`${root}/verify/reports/roadmap/candidate-throws-grok/prototype/register.mjs`));
  const index = await import(fileUrl(`${root}/verify/index.mjs`));
  const source = await import(fileUrl(`${root}/verify/source.mjs`));
  api = {
    verify: index.verify.bind(index),
    parse: source.parse.bind(source),
    compile: source.compile.bind(source),
  };
}

function compileOf(sourceText, file) {
  try {
    const record = api.parse(file, sourceText, () => { throw new Error("unexpected import"); });
    const targets = api.compile([record]).targets.map((t) => ({
      name: t.name,
      throwEvents: t.obligations.filter((o) => o.kind === "throw-unreachable"),
    }));
    return { ok: true, targets };
  } catch (e) {
    return { ok: false, status: e.status, message: e.message };
  }
}

async function check(name, sourceText, { file = `${name}.js`, timeoutMs = 20000 } = {}) {
  const compiled = compileOf(sourceText, file);
  let report = null, error = null;
  const t0 = Date.now();
  try { report = await api.verify(sourceText, { file, timeoutMs }); }
  catch (e) { error = e.message; }
  const outcomes = report?.outcomes?.map((o) => ({
    fn: o.fn, status: o.status, reason: o.reason, phase: o.phase, confirmed: o.confirmed,
    message: o.message ?? null, inputs: o.inputs, result: o.result,
  })) ?? null;
  cases.push({ name, ms: Date.now() - t0, error, compiled, outcomes });
  save();
  console.log(seat, name, outcomes?.map((o) => `${o.fn}:${o.status}:${o.reason ?? ""}:${o.message ?? ""}`).join(" | ") || compiled.message);
}

await check("try-catch", `/** @param {number} x */
// ensures true
function caught(x) {
  try { return x; } catch (e) { return 0; }
}`);

await check("shadow-local-dead", `/** @param {boolean} flag */
// requires !flag
// ensures result === 0
function shadowLocal(flag) {
  const Error = 1;
  if (flag) throw new Error("lit");
  return 0;
}`);

await check("shadow-local-live", `/** @param {boolean} flag */
// ensures true
function shadowLocalLive(flag) {
  const Error = 1;
  if (flag) throw new Error("lit");
  return 0;
}`);

await check("shadow-module-dead", `// ensures true
function Error() { return 0; }
/** @param {boolean} flag */
// requires !flag
// ensures result === 0
function shadowModule(flag) {
  if (flag) throw new Error("lit");
  return 0;
}`);

await check("shadow-module-live", `// ensures true
function Error() { return 0; }
/** @param {boolean} flag */
// ensures true
function shadowModuleLive(flag) {
  if (flag) throw new Error("lit");
  return 0;
}`);

if (seat === "A") {
  const rootA = `${root}/verify/reports/roadmap/candidate-throws-codex`;
  const original = readFileSync(`${rootA}/upstream/harmonic_mean.js`, "utf8");
  const positive = readFileSync(`${rootA}/evidence/harmonic-positive.annotated.js`, "utf8");
  const weak = positive.split("\n").filter((line) => !(line.includes("invariant") && line.includes("reciprocalSum"))).join("\n");
  const strips = weak.split("\n").filter((line) => !/^\s*\/\/ (requires|ensures|invariant|decreases) /.test(line)).join("\n");
  cases.push({
    name: "weak-audit",
    original: sha256(original),
    stripsToOriginal: strips === original,
    removedOnlySumInvariant: positive.split("\n").filter((line) => !weak.split("\n").includes(line)).map((line) => line.trim()),
  });
  save();
  console.log("A weak-audit", JSON.stringify(cases.at(-1)));
  await check("harmonic-weak", weak, { file: "harmonic_mean.js", timeoutMs: 45000 });
  const sample = cases.at(-1).outcomes?.[0]?.inputs?.x;
  if (Array.isArray(sample)) {
    const fn = new Function(`${original.replace("export default harmonicMean;", "")}\nreturn harmonicMean;`)();
    const x = sample.map(Number);
    let native;
    try { const result = fn(x); native = { result, positiveZero: Object.is(result, 0) }; }
    catch (e) { native = { threw: e.message }; }
    cases.push({ name: "harmonic-weak-native", sample, native });
    save();
    console.log("A weak-native", JSON.stringify(cases.at(-1)));
  }
}
console.log(seat, "followup-done");
