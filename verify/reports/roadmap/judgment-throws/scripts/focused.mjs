// Judge-owned focused controls. Loads a byte-exact extracted candidate.
// Does not edit verify/source.mjs, verify/index.mjs, or either candidate tree.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const seat = process.argv[2];
const outPath = process.argv[3];
const root = process.argv[4];
if (!["A", "B"].includes(seat) || !outPath || !root) {
  console.error("usage: focused.mjs A|B OUT.json EXTRACT_ROOT");
  process.exit(2);
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const fileUrl = (path) => pathToFileURL(path).href;
const cases = [];
const started = Date.now();

function save(extra = {}) {
  writeFileSync(outPath, JSON.stringify({
    seat, started, finished: new Date().toISOString(), ms: Date.now() - started,
    node: process.version, root, ...extra, cases,
  }, null, 2));
}

function viewOutcome(o) {
  if (!o) return null;
  return {
    fn: o.fn, status: o.status, reason: o.reason, phase: o.phase, confirmed: o.confirmed,
    message: o.message, inputs: o.inputs, result: o.result, failed: o.failed,
    keys: Object.keys(o).sort(),
  };
}

let api;
async function load() {
  if (seat === "A") {
    const proto = await import(fileUrl(`${root}/verify/reports/roadmap/candidate-throws-codex/prototype.mjs`));
    const normal = await proto.build("normal");
    const drop = await proto.build("drop-throw-check");
    const baseline = await proto.build("baseline");
    const bind = (built) => ({
      verify: built.index.verify.bind(built.index),
      parse: built.source.parse.bind(built.source),
      compile: built.source.compile.bind(built.source),
    });
    api = { ...bind(normal), drop: bind(drop), baseline: bind(baseline), hashes: normal.hashes };
    return;
  }
  await import(fileUrl(`${root}/verify/reports/roadmap/candidate-throws-grok/prototype/register.mjs`));
  const index = await import(fileUrl(`${root}/verify/index.mjs`));
  const source = await import(fileUrl(`${root}/verify/source.mjs`));
  const bound = {
    verify: index.verify.bind(index),
    parse: source.parse.bind(source),
    compile: source.compile.bind(source),
  };
  api = { ...bound, drop: bound, baseline: null };
}

function compileOf(sourceText, file) {
  try {
    const record = api.parse(file, sourceText, () => { throw new Error("unexpected import"); });
    return {
      ok: true,
      targets: api.compile([record]).targets.map((t) => ({
        name: t.name,
        pre: t.pre,
        throwEvents: t.obligations.filter((o) => o.kind === "throw-unreachable"),
        obligations: t.obligations,
        postconditions: t.postconditions,
      })),
    };
  } catch (e) {
    return { ok: false, status: e.status, message: e.message };
  }
}

async function check(name, sourceText, { file = `${name}.js`, timeoutMs = 15000, use = api, note } = {}) {
  const compiledView = (() => {
    const saved = { parse: api.parse, compile: api.compile };
    api.parse = use.parse;
    api.compile = use.compile;
    try { return compileOf(sourceText, file); }
    finally { api.parse = saved.parse; api.compile = saved.compile; }
  })();
  let report = null, error = null;
  const t0 = Date.now();
  try { report = await use.verify(sourceText, { file, timeoutMs }); }
  catch (e) { error = { name: e.name, message: e.message, stack: e.stack }; }
  const entry = {
    name, note: note ?? null, file, timeoutMs, ms: Date.now() - t0,
    error, compiled: compiledView,
    outcomes: report?.outcomes?.map(viewOutcome) ?? null,
    verified: (report?.outcomes ?? []).some((o) => o.status === "verified"),
    anyConfirmed: (report?.outcomes ?? []).some((o) => o.status === "counterexample" && o.confirmed === true),
  };
  cases.push(entry);
  save();
  const line = `${seat} ${name} ${entry.outcomes?.map((o) => `${o.fn}:${o.status}/${o.reason ?? ""}/${o.phase ?? ""}`).join(" | ") || entry.error?.message || compiledView.message}`;
  console.log(line);
  return entry;
}

const booleanGate = (requires = "") => `/** @param {boolean} flag */
${requires ? `// requires ${requires}\n` : ""}// ensures true
function gate(flag) {
  if (flag === true) throw new Error("boom");
  return 1;
}`;

const afterLoop = (ensures) => `// ensures ${ensures}
function afterLoop() {
  let y = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) { y = 0; }
  if (y !== 0) throw new Error("abstract after loop");
  return y;
}`;

const inLoopWeak = `// ensures true
function inLoopWeak() {
  let y = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) {
    if (y !== 0) throw new Error("weak in loop");
    y = 0;
  }
  return 0;
}`;

const widening = `/** @param {boolean} flag */
// requires !flag
// ensures true
function widen(flag) {
  let v = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) { if (flag) throw new Error("loop"); v = undefined; }
  return 0;
}`;

function stripContracts(source) {
  return source.split("\n").filter((line) => !/^\s*\/\/ (requires|ensures|invariant|decreases) /.test(line)).join("\n");
}

function nativeFunction(source, name) {
  const body = source.replace("export default harmonicMean;", "");
  return new Function(`${body}\nreturn ${name};`)();
}

async function main() {
  await load();
  const coreBefore = {
    source: sha256(readFileSync(`${root}/verify/source.mjs`)),
    index: sha256(readFileSync(`${root}/verify/index.mjs`)),
    proofs: sha256(readFileSync(`${root}/verify/proofs.mjs`)),
  };
  save({ coreBefore, overlayHashes: api.hashes ?? null });

  await check("guarded-ok", `/** @param {number} x */
// requires Number.isFinite(x) && x > 0
// ensures result === x
function guarded(x) {
  if (!(x > 0)) throw new Error("no");
  return x;
}`);

  await check("reachable-throw", booleanGate(), { note: "native throw must stay unknown, not a confirmed counterexample" });
  await check("always-throw", `// ensures true
function alwaysThrow() {
  throw new Error("always");
}`);
  await check("vacuous", `/** @param {boolean} flag */
// requires false
// ensures true
function vacuous(flag) {
  if (flag) throw new Error("no");
  return 0;
}`);
  await check("malformed-requires", `/** @param {number} x */
// requires real(x) > real("0") && false
// ensures true
function malformed(x) {
  if (x <= 0) throw new Error("domain");
  return 0;
}`);
  await check("impossible-ensures-hides-throw", booleanGate().replace("// ensures true", "// ensures false"), {
    note: "reachable throw must not become a confirmed normal-return ensures counterexample",
  });
  await check("dead-throw-impossible-ensures", `/** @param {boolean} flag */
// requires !flag
// ensures false
function dead(flag) {
  if (flag === true) throw new Error("no");
  return 1;
}`);

  await check("after-loop-ensures-true", afterLoop("true"), { timeoutMs: 30000 });
  await check("after-loop-true-property", afterLoop("result === 0"), { timeoutMs: 30000, note: "true concrete property under a weak post-loop invariant" });
  await check("in-loop-weak", inLoopWeak, { timeoutMs: 30000 });
  await check("widening-one-event", widening, { timeoutMs: 30000 });

  await check("earlier-helper-fact", `/** @param {boolean} flag */
// ensures result === false
function no(flag) { return false; }
/** @param {boolean} flag */
// ensures result === 0
function afterEarlier(flag) { if (no(flag)) throw new Error("earlier"); return 0; }`, { timeoutMs: 20000 });

  await check("later-impossible-post", `// ensures false
function impossible() { return 0; }
/** @param {boolean} flag */
// ensures true
function beforeLater(flag) { if (flag) throw new Error("before later fact"); return impossible(); }`, { timeoutMs: 20000 });

  await check("earlier-impossible-post", `// ensures false
function impossible() { return 0; }
/** @param {boolean} flag */
// ensures true
function afterImpossible(flag) {
  impossible();
  if (flag) throw new Error("after impossible fact");
  return 0;
}`, { timeoutMs: 20000, note: "an impossible earlier post must not verify the caller" });

  await check("helper-requires-cannot-discharge", `/** @param {number} x */
// requires x > 0
// ensures result === x
function helper(x) { return x; }
/** @param {number} x */
// ensures result === x
function caller(x) {
  if (!(x > 0)) throw new Error("no");
  return helper(x);
}`, { timeoutMs: 20000 });

  await check("callee-gating", `/** @param {boolean} flag */
// ensures true
function helper(flag) { if (flag) throw new Error("helper"); return 0; }
/** @param {boolean} flag */
// ensures true
function caller(flag) { if (flag) return 0; return helper(flag); }`, { timeoutMs: 20000 });

  const dropSource = booleanGate();
  if (seat === "B") process.env.CANDIDATE_THROW_MUTANT = "drop";
  try {
    await check("drop-throw-check", dropSource, { use: api.drop, note: "private mutant omits or trivializes the throw obligation" });
  } finally { delete process.env.CANDIDATE_THROW_MUTANT; }
  const drop = cases.at(-1);
  const witness = drop.outcomes?.[0]?.inputs?.flag;
  let native = null;
  try {
    const fn = new Function(`${dropSource}\nreturn gate;`)();
    const probe = (value) => {
      try { return { threw: false, result: fn(value) }; }
      catch (e) { return { threw: true, message: e.message }; }
    };
    native = { false: probe(false), true: probe(true), reportedWitness: witness ?? null };
  } catch (e) { native = { error: e.message }; }
  cases.push({ name: "drop-throw-native", native, witness: witness ?? null });
  save();
  console.log(`${seat} drop-throw-native ${JSON.stringify(native)}`);

  await check("shadow-local-dead", `/** @param {boolean} flag */
// requires !flag
// ensures result === 0
function shadowLocal(flag) {
  const Error = function () { return 0; };
  if (flag) throw new Error("lit");
  return 0;
}`);
  await check("shadow-module-dead", `/** @param {string} message */
// ensures true
function Error(message) { return 0; }
/** @param {boolean} flag */
// requires !flag
// ensures result === 0
function shadowModule(flag) {
  if (flag) throw new Error("lit");
  return 0;
}`);
  await check("opaque-dead-computed", `/** @param {boolean} flag */
// requires !flag
// ensures result === 0
function opaqueDead(flag) {
  if (flag) throw new Error(flag ? "a" : "b");
  return 0;
}`);
  await check("opaque-live-computed", `/** @param {boolean} flag */
// ensures true
function opaqueLive(flag) {
  if (flag) throw new Error(flag ? "a" : "b");
  return 0;
}`);
  await check("erased-in-argument", `/** @param {number} x */
// requires x > 0
// ensures result === 1
function erased(x: number) {
  if (!(x > 0)) throw new Error((x as number).toFixed(0));
  return 1;
}`, { file: "erased.ts" });
  await check("loop-write-in-argument", `/** @param {boolean} flag */
// requires !flag
// ensures result === 0
function written(flag) {
  let y = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // invariant y === 0
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) {
    if (flag) throw (y = 1, new Error("w"));
  }
  return y;
}`, { timeoutMs: 30000 });
  await check("try-catch", `// ensures true
function caught(x) { try { return x; } catch (e) { return 0; } }`);

  const old = `/** @param {number} x */
// ensures Object.is(result, x)
function identity(x) { return x; }
export default identity;`;
  await check("old-program", old, { file: "old-program.js" });
  if (api.baseline) await check("old-program-baseline", old, { file: "old-program.js", use: api.baseline });

  const candidateRoot = seat === "A"
    ? `${root}/verify/reports/roadmap/candidate-throws-codex`
    : `${root}/verify/reports/roadmap/candidate-throws-grok`;
  const original = readFileSync(seat === "A" ? `${candidateRoot}/upstream/harmonic_mean.js` : `${candidateRoot}/sources/harmonic_mean.js`, "utf8");
  const total = readFileSync(seat === "A" ? `${candidateRoot}/evidence/harmonic-total.annotated.js` : `${candidateRoot}/sources/harmonic-ensures-true.js`, "utf8");
  const positive = readFileSync(seat === "A" ? `${candidateRoot}/evidence/harmonic-positive.annotated.js` : `${candidateRoot}/sources/harmonic-result-positive.js`, "utf8");
  const weak = seat === "B"
    ? readFileSync(`${candidateRoot}/sources/harmonic-weak-invariant.js`, "utf8")
    : positive.split("\n").filter((line) => !line.includes("reciprocalSum")).join("\n");
  const annotationAudit = {
    originalSha256: sha256(original),
    totalStripsToOriginal: stripContracts(total) === original,
    positiveStripsToOriginal: stripContracts(positive) === original,
    weakStripsToOriginal: stripContracts(weak) === original,
    totalSha256: sha256(total),
    positiveSha256: sha256(positive),
    weakSha256: sha256(weak),
    weakDerivedByJudge: seat === "A",
    sameRequiresAndInvariants: stripContracts(total.replace("// ensures true", "// ensures result > 0")) === stripContracts(positive) || total.replace("// ensures true", "// ensures result > 0") === positive,
  };
  cases.push({ name: "harmonic-annotation-audit", annotationAudit });
  save();
  console.log(`${seat} harmonic-annotation-audit ${JSON.stringify(annotationAudit)}`);

  await check("harmonic-ensures-true", total, { file: "harmonic_mean.js", timeoutMs: 60000 });
  await check("harmonic-result-positive", positive, { file: "harmonic_mean.js", timeoutMs: 60000 });
  const positiveCase = cases.find((c) => c.name === "harmonic-result-positive");
  const sample = positiveCase?.outcomes?.[0]?.inputs?.x;
  let positiveNative = null;
  if (Array.isArray(sample)) {
    const fn = nativeFunction(original, "harmonicMean");
    try {
      const result = fn(sample.map(Number));
      positiveNative = { sample, result, positiveZero: Object.is(result, 0), threw: false };
    } catch (e) { positiveNative = { sample, threw: true, message: e.message }; }
  }
  const fn = nativeFunction(original, "harmonicMean");
  const bits = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
  const nativeRows = [Number.MIN_VALUE, 2 ** -1024, 1, 49].map((x) => {
    const result = fn([x]);
    return { x, xBits: bits(x), result, resultBits: bits(result), positiveZero: Object.is(result, 0), objectIs: Object.is(result, x) };
  });
  const throws = {};
  for (const input of [[], [-1], [0]]) {
    try { fn(input); throws[JSON.stringify(input)] = null; }
    catch (e) { throws[JSON.stringify(input)] = e.message; }
  }
  cases.push({ name: "harmonic-native", positiveNative, nativeRows, throws });
  save();
  console.log(`${seat} harmonic-native ${JSON.stringify({ positiveNative, fortyNine: nativeRows[3], minZero: nativeRows[0].positiveZero })}`);

  await check("harmonic-weak", weak, { file: "harmonic_mean.js", timeoutMs: 45000, note: seat === "A" ? "judge-derived by deleting the reciprocalSum invariant from A's positive annotation" : "candidate weak file" });

  const coreAfter = {
    source: sha256(readFileSync(`${root}/verify/source.mjs`)),
    index: sha256(readFileSync(`${root}/verify/index.mjs`)),
    proofs: sha256(readFileSync(`${root}/verify/proofs.mjs`)),
  };
  save({ coreBefore, coreAfter, coreUnchanged: JSON.stringify(coreBefore) === JSON.stringify(coreAfter) });
  console.log(`${seat} done coreUnchanged=${JSON.stringify(coreBefore) === JSON.stringify(coreAfter)}`);
}

main().catch((e) => {
  cases.push({ name: "harness-error", message: e.stack });
  save();
  console.error(e);
  process.exit(1);
});
