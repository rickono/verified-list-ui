// Reviewer probe. No solver. Imports the archived c9c4511 tree and three scheduler snapshots.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync, copyFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = "/tmp/review-p-c9c4511";
const { compile } = await import(pathToFileURL(join(ROOT, "verify/source.mjs")));
const { single } = await import(pathToFileURL(join(ROOT, "verify/modules.mjs")));
const { phases, obligation, solve } = await import(pathToFileURL(join(ROOT, "verify/proofs.mjs")));
const { proofKey, solverInput, witnessModels } = await import(pathToFileURL(join(ROOT, "verify/cache.mjs")));
const { validWitness } = await import(pathToFileURL(join(ROOT, "verify/backend.mjs")));
const { trustedIdentity, dependencies } = await import(pathToFileURL(join(ROOT, "verify/manifest.mjs")));
const { REPLAY_LIMIT } = await import(pathToFileURL(join(ROOT, "verify/data.mjs")));
const log = [];
const note = (name, value) => { log.push({ name, ...value }); console.log(JSON.stringify({ name, ...value })); };

const targetOf = (source) => compile(single("t.ts", source).records).targets;

function scripted(responses) {
  const seen = [];
  const connect = () => ({
    async start() { return { name: "mock" }; },
    async check(query) {
      seen.push({ phase: query.phase, postcondition: query.postcondition ?? null, domain: query.domain, assertions: query.assertions });
      const next = responses.shift();
      if (!next) throw new Error(`unexpected query ${query.phase}`);
      return next;
    },
    async close() {},
  });
  return { connect, seen };
}
const base = {
  id: "t.ts#f", pre: "(> x 0)", preDefined: "(not (defined x))", postconditions: ["(= result x)", "(> result 0)"],
  smallWitness: "(small)", replayGuards: ["g1"], declarations: "(declare-fun x () (_ BitVec 64))",
  params: [{ model: { kind: "number" } }], obligations: [
    { kind: "ensures", text: "first" },
    { kind: "ensures", text: "last", abstract: true, span: { start: 1, end: 2 } },
  ],
};
const WIT = ["0000000000000000"];
async function run(version, responses, target = base) {
  const mod = await import(pathToFileURL(`/tmp/review-p-work/sched/${version}/proofs.mjs`));
  const harness = scripted(responses.map((r) => ({ ...r })));
  const [outcome] = await mod.solve([target], 10_000, { connect: harness.connect, now: (() => { let t = 0; return () => t++; })() });
  return { outcome, seen: harness.seen };
}
const definednessPath = [
  { status: "unsat" },
  { status: "sat", witness: WIT },
  { status: "unsat" },
  { status: "unsat" },
];
for (const version of ["parent", "ed10", "c9"]) {
  const verified = await run(version, definednessPath);
  note("scheduler-verified", {
    version,
    phases: verified.seen.map((q) => q.phase),
    status: verified.outcome.status,
    label: verified.outcome.label ?? null,
    witness: verified.outcome.witness,
  });
  assert.deepEqual(verified.seen.map((q) => q.phase), ["requires-definedness", "feasibility", "postcondition", "postcondition"]);
  assert.equal(verified.outcome.status, "verified");
  assert.equal(verified.outcome.witness, WIT);
  const second = await run(version, [{ status: "unsat" }, { status: "sat", witness: WIT }, { status: "unsat" }, { status: "sat", witness: ["3ff0000000000000"] }]);
  note("scheduler-second-post-counterexample", { version, phase: second.seen.at(-1).phase, postcondition: second.seen.at(-1).postcondition, label: second.outcome.label ?? null, status: second.outcome.status });
  assert.equal(second.outcome.status, "counterexample");
  assert.equal(second.outcome.label?.text, "last");
  const vacuous = await run(version, [{ status: "unsat" }, { status: "unsat" }]);
  assert.equal(vacuous.outcome.status, "vacuous");
  assert.equal(vacuous.outcome.witness, undefined);
  assert.deepEqual(vacuous.seen.map((q) => q.phase), ["requires-definedness", "feasibility"]);
  const oversized = await run(version, [{ status: "unsat" }, { status: "sat", oversized: true }, { status: "sat", oversized: true }]);
  assert.equal(oversized.outcome.status, "unknown");
  assert.equal(oversized.outcome.reason, "witness-too-large");
  assert.deepEqual(oversized.seen.map((q) => q.phase), ["requires-definedness", "feasibility", "feasibility-witness"]);
  const definedCe = await run(version, [{ status: "sat", witness: WIT }]);
  assert.equal(definedCe.outcome.status, "counterexample");
  assert.equal(definedCe.outcome.phase, "requires-definedness");
  assert.equal(definedCe.seen.length, 1);
}
const parentVerified = (await run("parent", definednessPath)).outcome;
const edVerified = (await run("ed10", definednessPath)).outcome;
const c9Verified = (await run("c9", definednessPath)).outcome;
assert.equal(parentVerified.label, undefined);
assert.equal(c9Verified.label, undefined);
assert.equal(edVerified.label?.text, "last");
assert.equal(edVerified.label?.abstract, true);
note("terminal-label", { parent: parentVerified.label ?? null, ed10: edVerified.label, c9: c9Verified.label ?? null });

// Real compiled queries: definedness precedes feasibility; diagnostic attribution is not solver input.
const definedSource = "// requires real(x)>real(0)\n// ensures true\nconst f=(x:number)=>x;";
const plainSource = "// ensures true\nconst f=(x:number)=>x;";
const [definedTarget] = targetOf(definedSource);
const [plainTarget] = targetOf(plainSource);
assert.equal(phases(definedTarget)[0][0], "requires-definedness");
assert.equal(phases(definedTarget)[1][0], "requires-definedness-witness");
assert.equal(phases(definedTarget)[2][0], "feasibility");
const sent = new Set();
for (const [phase, index] of phases(definedTarget)) {
  const query = obligation(definedTarget, phase, index);
  const input = solverInput(query);
  for (const key of Object.keys(input)) sent.add(key);
  for (const diagnostic of ["target", "phase", "domain", "postcondition", "postconditionCount"]) assert.equal(Object.hasOwn(input, diagnostic), false);
  assert.deepEqual(Object.keys(input).sort(), ["assertions", "declarations", "models", "replayGuards"]);
}
note("solver-input-fields", { fields: [...sent].sort(), definedPhases: phases(definedTarget), plainPhases: phases(plainTarget) });
const commented = "// leading comment\n" + definedSource;
const [commentedTarget] = targetOf(commented);
assert.equal(proofKey(definedTarget, "a".repeat(64)), proofKey(commentedTarget, "a".repeat(64)));
assert.notEqual(proofKey(definedTarget, "a".repeat(64)), proofKey(plainTarget, "a".repeat(64)));
const renamed = compile(single("other-name.ts", definedSource).records).targets[0];
assert.equal(proofKey(definedTarget, "a".repeat(64)), proofKey(renamed, "a".repeat(64)));
const body = "// ensures Object.is(result,x)\nconst f=(x:number)=>x;";
const body2 = "// ensures Object.is(result,x)\nconst f=(x:number)=>x*1;";
assert.notEqual(proofKey(targetOf(body)[0], "a".repeat(64)), proofKey(targetOf(body2)[0], "a".repeat(64)));
note("query-identity", { commentAndFilenameShare: true, definednessChangesKey: true, bodyChangesKey: true });

// Witness boundary: same validWitness the cache and answer() share.
const numberModels = [{ kind: "number" }];
const good = ["0000000000000000"];
assert.equal(validWitness(numberModels, good), undefined);
const cases = [
  ["empty", numberModels, []],
  ["bad-number", numberModels, ["zz"]],
  ["array-257", [{ kind: "array", element: "number" }], [Array.from({ length: 257 }, () => "0000000000000000")]],
  ["predicate-garbage", [{ kind: "function", params: ["number"], result: "boolean" }], ["garbage"]],
  ["predicate-object", [{ kind: "function", params: ["number"], result: "boolean" }], [{}]],
  ["predicate-over-cap", [{ kind: "function", params: ["number"], result: "boolean" }], [{ entries: Array.from({ length: REPLAY_LIMIT + 1 }, () => [["0000000000000000"], "true"]), else: "false" }]],
];
const reasons = {};
for (const [name, models, value] of cases) {
  const failure = validWitness(models, value);
  assert.ok(failure, name);
  reasons[name] = failure.reason;
}
const heapModel = { kind: "heap", types: [{ kind: "array", element: "number" }], keys: [] };
const huge = validWitness([{ kind: "ref" }, heapModel], ["1", { roots: ["1"], nodes: { 1: { kind: "array", element: "number", values: Array.from({ length: 200000 }, () => ["num", "0000000000000000"]) } } }]);
assert.equal(huge?.reason, "witness-invalid");
reasons["heap-values-200000"] = huge.reason;
const refModels = [{ kind: "ref" }, { kind: "heap", types: [{ kind: "object", fields: [] }], keys: [] }];
for (const [name, value] of [["nondecimal-ref", ["x", { roots: ["1"], nodes: {} }]], ["ref-array", [["1"], { roots: ["1"], nodes: {} }]]]) {
  const failure = validWitness(refModels, value);
  assert.ok(failure, name);
  reasons[name] = failure.reason;
}
const validObject = { roots: ["1"], nodes: { 1: { kind: "object", fields: {} } } };
assert.equal(validWitness(refModels, ["1", validObject]), undefined);
const rootMismatch = validWitness(refModels, ["2", validObject]);
assert.equal(rootMismatch?.message, "The heap graph roots disagree with parameter identities.");
reasons["root-mismatch"] = rootMismatch.reason;
note("witness-boundary", { replayLimit: REPLAY_LIMIT, reasons });

// Manifest closure versus a manual read of the same walker, and the whole z3 package.
const identity = trustedIdentity(join(ROOT, "verify"));
assert.equal(identity.disabled, undefined);
const names = new Set(identity.files.map(([name]) => name));
for (const required of ["index.mjs", "cache.mjs", "manifest.mjs", "backend.mjs", "solver.mjs", "proofs.mjs", "evidence.mjs", "source.mjs", "data.mjs", "heap-witness.mjs", "predicate-witness.mjs"]) {
  assert.ok(names.has(required), required);
}
const z3 = identity.backend.files.map(([name]) => name);
for (const required of ["build/node.js", "build/z3-built.js", "build/z3-built.wasm", "package.json"]) assert.ok(z3.includes(required), required);
const packageRoot = identity.packages.find((p) => p.name === "z3-solver");
const walked = [];
const walk = (dir, prefix) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!prefix && entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const kind = statSync(path);
      if (kind.isDirectory()) walk(path, prefix + entry.name + "/");
      else if (kind.isFile()) walked.push(prefix + entry.name);
      continue;
    }
    if (entry.isDirectory()) walk(path, prefix + entry.name + "/");
    else if (entry.isFile()) walked.push(prefix + entry.name);
  }
};
const z3dir = execFileSync("node", ["-e", "console.log(require.resolve('z3-solver/package.json'))"], { cwd: ROOT, encoding: "utf8" }).trim();
walk(dirname(z3dir), "");
const listed = new Set(z3);
const missing = walked.filter((name) => !listed.has(name));
const extra = z3.filter((name) => !walked.includes(name));
assert.deepEqual(missing, []);
assert.deepEqual(extra, []);
note("manifest-closure", {
  files: identity.files.map(([name]) => name).sort(),
  packages: identity.packages.map((p) => `${p.name}@${p.version}`),
  z3Files: z3.length,
  z3Sha: identity.backend.sha256,
  wasm: identity.backend.files.find(([name]) => name.endsWith(".wasm")),
  runtime: identity.runtime,
  protocol: identity.protocol,
});

// Copy the local verifier and show worker-file, loaded-drift, and non-semantic edits.
const scratch = mkdtempSync(join(tmpdir(), "review-p-manifest-"));
symlinkSync(join(ROOT, "node_modules"), join(scratch, "node_modules"));
const verify = join(scratch, "verify");
mkdirSync(verify);
for (const name of readdirSync(join(ROOT, "verify")).filter((name) => name.endsWith(".mjs"))) copyFileSync(join(ROOT, "verify", name), join(verify, name));
const before = trustedIdentity(verify);
const solverPath = join(verify, "solver.mjs");
writeFileSync(solverPath, readFileSync(solverPath, "utf8") + "\n// worker byte\n");
const afterSolver = trustedIdentity(verify);
assert.notEqual(afterSolver.sha256, before.sha256);
writeFileSync(solverPath, readFileSync(solverPath, "utf8").replace("\n// worker byte\n", ""));
writeFileSync(join(verify, "not-imported.txt"), "semantic?");
const afterUntracked = trustedIdentity(verify);
assert.equal(afterUntracked.sha256, before.sha256);
const index = join(verify, "index.mjs");
const originalIndex = readFileSync(index, "utf8");
writeFileSync(index, originalIndex + "\nconst hidden = require('./not-imported.txt');\n");
const requireForm = trustedIdentity(verify);
assert.equal(requireForm.disabled, undefined, "a bare require() call is not an import and must be judged by whether it is actually loaded");
const still = new Set(requireForm.files.map(([name]) => name));
assert.equal(still.has("not-imported.txt"), false);
writeFileSync(index, originalIndex);
// The production closure has no require/computed import. Record that directly.
let closureParses = true;
try {
  for (const [name] of identity.files) {
    if (!name.endsWith(".mjs") && !name.endsWith(".js")) continue;
    dependencies(readFileSync(join(ROOT, "verify", name), "utf8"), name);
  }
} catch { closureParses = false; }
assert.equal(closureParses, true);
note("manifest-mutations", {
  solverEditChangesIdentity: afterSolver.sha256 !== before.sha256,
  before: before.sha256, afterSolver: afterSolver.sha256,
  unimportedTextIgnored: afterUntracked.sha256 === before.sha256,
  bareRequireCallNotFollowed: !still.has("not-imported.txt"),
  requireFormDisabled: requireForm.disabled ?? null,
  closureParses,
});
rmSync(scratch, { recursive: true, force: true });

// The drift command above is incomplete if it throws; do it properly.
const scratch2 = mkdtempSync(join(tmpdir(), "review-p-drift-"));
symlinkSync(join(ROOT, "node_modules"), join(scratch2, "node_modules"));
const verify2 = join(scratch2, "verify");
mkdirSync(verify2);
for (const name of readdirSync(join(ROOT, "verify")).filter((name) => name.endsWith(".mjs"))) copyFileSync(join(ROOT, "verify", name), join(verify2, name));
const driftOut = execFileSync(process.execPath, ["--input-type=module", "-e", `
import { readFileSync, writeFileSync } from 'node:fs';
import { runningIdentity } from ${JSON.stringify(pathToFileURL(join(verify2, "manifest.mjs")).href)};
const path = ${JSON.stringify(join(verify2, "solver.mjs"))};
const before = runningIdentity();
writeFileSync(path, readFileSync(path, "utf8") + "\\n// loaded worker drifted\\n");
const after = runningIdentity();
console.log(JSON.stringify({ beforeDisabled: before.disabled ?? null, afterDisabled: after.disabled ?? null, same: before.sha256 === after.sha256 }));
`], { encoding: "utf8" });
const driftResult = JSON.parse(driftOut);
assert.match(driftResult.afterDisabled, /solver\.mjs/);
assert.equal(driftResult.beforeDisabled, null);
note("loaded-worker-drift", driftResult);
rmSync(scratch2, { recursive: true, force: true });

// Dependency forms on a throwaway module, not a hypothetical future loader.
const forms = dependencies(`
import './side.mjs';
import { a } from './named.mjs';
export { a as b } from './re.mjs';
export * from './star.mjs';
const dyn = import('./dyn.mjs');
const tmpl = import(\`./tmpl.mjs\`);
const worker = new URL('./worker.mjs', import.meta.url);
`, "forms.mjs");
assert.deepEqual(forms.map((f) => f.specifier).sort(), ["./dyn.mjs", "./named.mjs", "./re.mjs", "./side.mjs", "./star.mjs", "./tmpl.mjs", "./worker.mjs"]);
assert.throws(() => dependencies("import(path);", "computed.mjs"), /computed/);
assert.throws(() => dependencies("new URL('.', import.meta.url); const x = import.meta.url;", "meta.mjs"), /import\.meta/);
note("dependency-forms", { followed: forms, computedDisables: true });

console.log(JSON.stringify({ ok: true, checks: log.length }));
writeFileSync("/tmp/review-p-work/static-probe.json", JSON.stringify(log, null, 2));
