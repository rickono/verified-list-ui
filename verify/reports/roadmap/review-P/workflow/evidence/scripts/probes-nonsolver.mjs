// Independent P workflow probes that do not start a solver.
// Archive under test: c9c45110b8669f99f83c4330d6efe1b6202ff1be
import fs from "node:fs";
import cp from "node:child_process";
import vm from "node:vm";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = "/tmp/p-review-code";
process.env.P_REVIEW_NO_SPAWN = "1";
const orig = {
  mkdirSync: fs.mkdirSync,
  writeFileSync: fs.writeFileSync,
  openSync: fs.openSync,
  renameSync: fs.renameSync,
  unlinkSync: fs.unlinkSync,
  rmSync: fs.rmSync,
  spawn: cp.spawn,
  Script: vm.Script,
};
let scripts = 0;
const spawns = [];
const writes = [];
let armWrites = false;
vm.Script = class Script extends orig.Script {
  constructor(...args) { scripts++; super(...args); }
};
cp.spawn = function (...args) {
  spawns.push(String(args[0]));
  const error = new Error(`unexpected solver spawn: ${args[0]}`);
  error.code = "NO_SPAWN";
  throw error;
};
for (const name of ["mkdirSync", "writeFileSync", "renameSync", "unlinkSync", "rmSync"]) {
  fs[name] = function (path, ...rest) {
    if (armWrites) writes.push([name, String(path)]);
    return orig[name](path, ...rest);
  };
}
fs.openSync = function (path, flags, ...rest) {
  if (armWrites && /[wax+]/.test(String(flags))) writes.push(["open", String(path), String(flags)]);
  return orig.openSync(path, flags, ...rest);
};
syncBuiltinESMExports();

const { verify, verifyFile, affected, reproduce } = await import(pathToFileURL(join(ROOT, "verify/index.mjs")));
const { openCache, proofKey, witnessModels, MAX_ENTRY_BYTES } = await import(pathToFileURL(join(ROOT, "verify/cache.mjs")));
const { validWitness } = await import(pathToFileURL(join(ROOT, "verify/backend.mjs")));
const { runningIdentity } = await import(pathToFileURL(join(ROOT, "verify/manifest.mjs")));
const { shrink, signature, validateEvidence } = await import(pathToFileURL(join(ROOT, "verify/evidence.mjs")));
const { compile } = await import(pathToFileURL(join(ROOT, "verify/source.mjs")));
const { single, load, graphDigest } = await import(pathToFileURL(join(ROOT, "verify/modules.mjs")));
const { createHash } = await import("node:crypto");

const results = [];
const fail = (check, detail) => { const row = { check, ok: false, detail }; results.push(row); console.log(JSON.stringify(row)); throw new Error(check + " " + JSON.stringify(detail)); };
const pass = (check, detail) => { const row = { check, ok: true, detail }; results.push(row); console.log(JSON.stringify(row)); };
const hex = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
const num = (h) => Buffer.from(h, "hex").readDoubleBE();
const scratch = mkdtempSync(join(tmpdir(), "p-review-ns-"));
const cliPath = join(ROOT, "verify/bin/jsverify.mjs");

const identity = runningIdentity();
pass("running-identity", identity.disabled ? { disabled: identity.disabled } : {
  sha256: identity.sha256,
  claimed: "ffa6dc01465e53e123f77aef439e80c04c93eee8445861facbe15e24961c393c",
  match: identity.sha256 === "ffa6dc01465e53e123f77aef439e80c04c93eee8445861facbe15e24961c393c",
  node: identity.runtime, backend: identity.backend.package, wasmFiles: identity.backend.files?.length,
});
if (identity.disabled) fail("running-identity-enabled", identity);

function project(name, source) {
  const dir = join(scratch, name);
  orig.mkdirSync(dir, { recursive: true });
  const entry = join(dir, "entry.ts");
  orig.writeFileSync(entry, source);
  return { dir, entry, source };
}
function bundleFor(entry, source) {
  const loaded = load(entry);
  if (loaded.error) fail("load", loaded.error.message);
  const { targets } = compile(loaded.records);
  const byName = new Map(targets.map((t) => [t.name, t]));
  const graph = graphDigest(loaded.files, loaded.dependencies);
  const witnesses = {};
  for (const t of targets) witnesses[`${"entry.ts"}#${t.name}`] = { key: proofKey(t, identity.sha256), witness: null, target: t };
  return { targets, byName, graph, witnesses, loaded };
}

const bug = project("bug", "// requires n>=0\n// ensures result<100\nexport const bug=(n:number)=>n*2;\n");
const built = bundleFor(bug.entry, bug.source);
const bugTarget = built.byName.get("bug");
const bugModels = witnessModels(bugTarget);
if (validWitness(bugModels, [hex(50)])) fail("witness-50-shape", validWitness(bugModels, [hex(50)]));
const bugId = "entry.ts#bug";
function artifact(witnesses, extra = {}) {
  return { format: 1, kind: "jsverify-bugs", entry: bug.entry, identity: identity.sha256, graphSha256: built.graph, witnesses, ...extra };
}
const goodWitness = { key: proofKey(bugTarget, identity.sha256), witness: [hex(50)], signature: "placeholder" };
scripts = 0;
const learned = reproduce(bug.entry, artifact({ [bugId]: goodWitness }));
if (!(scripts > 0)) fail("script-hook", { scripts, status: learned.status, message: learned.message });
const learnedOutcome = learned.outcomes?.[0];
if (!learnedOutcome?.confirmed) fail("hand-witness-confirms", learned);
const goal = signature(learnedOutcome);
pass("script-hook-and-hand-witness", { scripts, signature: goal, input: learnedOutcome.inputs, status: learned.status });

const real = artifact({ [bugId]: { ...goodWitness, signature: goal } });
scripts = 0;
const reproduced = reproduce(bug.entry, real);
if (reproduced.status !== "reproduced" || scripts === 0) fail("real-hand-reproduce", { status: reproduced.status, scripts, message: reproduced.message });
pass("real-hand-reproduce", { status: reproduced.status, scripts, input: reproduced.outcomes[0].inputs });

// Whole artifact is rejected before any witness runs.
const side = project("two", "// ensures result<0\nexport const side=(n:number)=>n;\n// ensures result<0\nexport const other=(n:number)=>n;\n");
const two = bundleFor(side.entry);
const ids = ["entry.ts#side", "entry.ts#other"];
const twoArt = {
  format: 1, kind: "jsverify-bugs", identity: identity.sha256, graphSha256: two.graph,
  witnesses: Object.fromEntries(ids.map((id) => [id, { key: proofKey(two.byName.get(id.split("#")[1]), identity.sha256), witness: [hex(1)], signature: "x" }])),
};
scripts = 0;
twoArt.witnesses[ids[1]].witness = [];
const invalidSecond = reproduce(side.entry, twoArt);
if (invalidSecond.status !== "invalid-evidence" || scripts !== 0) fail("validate-all-before-replay", { status: invalidSecond.status, scripts, message: invalidSecond.message });
pass("validate-all-before-replay", { status: invalidSecond.status, scripts, message: invalidSecond.message });

scripts = 0;
twoArt.witnesses[ids[1]].witness = [hex(1)];
twoArt.witnesses[ids[0]].key = "0".repeat(64);
const badKey = reproduce(side.entry, twoArt);
if (badKey.status !== "invalid-evidence" || scripts !== 0) fail("keys-before-replay", { status: badKey.status, scripts, message: badKey.message });
pass("keys-before-replay", { status: badKey.status, scripts, message: badKey.message });

scripts = 0;
const stale = reproduce(side.entry, { ...twoArt, graphSha256: "ab".repeat(32) });
if (stale.status !== "stale" || scripts !== 0 || stale.status === "reproduced") fail("stale-graph-before-replay", stale);
pass("stale-graph-before-replay", { status: stale.status, scripts });

scripts = 0;
const empty = reproduce(bug.entry, artifact({}));
if (empty.status !== "not-reproduced" || scripts !== 0) fail("empty-witnesses", { status: empty.status, scripts, message: empty.message });
pass("empty-witnesses", { status: empty.status, scripts });

scripts = 0;
const forgedStatus = reproduce(bug.entry, artifact({}, { status: "reproduced" }));
if (forgedStatus.status === "reproduced" || scripts !== 0) fail("forged-status-field", forgedStatus);
pass("forged-status-field", { status: forgedStatus.status, scripts });

for (const value of [null, [], "reproduced", 1, { status: "reproduced" }]) {
  scripts = 0;
  let result;
  try { result = reproduce(bug.entry, value); }
  catch (e) { result = { status: "thrown", message: e.message }; }
  if (result.status === "reproduced" || scripts !== 0) fail("adversarial-shape", { value, result, scripts });
  pass("adversarial-shape", { value: Array.isArray(value) ? "array" : value && typeof value === "object" ? Object.keys(value) : value, status: result.status, scripts });
}

const forgedSig = artifact({ [bugId]: { ...goodWitness, signature: goal + "forged" } });
scripts = 0;
const sig = reproduce(bug.entry, forgedSig);
if (sig.status !== "not-reproduced" || sig.outcomes?.[0]?.reproduced !== false || !(scripts > 0)) fail("signature-forgery", { status: sig.status, scripts, outcome: sig.outcomes?.[0] });
pass("signature-forgery", { status: sig.status, scripts, reproduced: sig.outcomes[0].reproduced });

const poison = structuredClone(real);
poison.witnesses[bugId].shrunk = { witness: [hex(0)], replays: 1, limit: 300, greedy: true, changed: true };
const poisoned = reproduce(bug.entry, poison);
const original = reproduce(bug.entry, poison, { shrunk: false });
if (poisoned.status === "reproduced" || original.status !== "reproduced") fail("poison-shrink-does-not-claim", { poisoned: poisoned.status, original: original.status, pin: poisoned.outcomes?.[0]?.inputs });
pass("poison-shrink-does-not-claim", { poisoned: poisoned.status, original: original.status, shrunkInput: poisoned.outcomes?.[0]?.inputs, originalInput: original.outcomes?.[0]?.inputs });

// Relocation of an identical one-file graph, then one stale byte.
const moved = project("moved", bug.source);
const movedRun = reproduce(moved.entry, real);
if (movedRun.status !== "reproduced") fail("relocate-identical", movedRun);
orig.writeFileSync(moved.entry, bug.source + "\n// changed\n");
const movedStale = reproduce(moved.entry, real);
if (movedStale.status !== "stale") fail("relocate-then-edit", movedStale);
pass("relocate-identical-and-stale-edit", { moved: movedRun.status, edited: movedStale.status, graphsEqualBeforeEdit: true });

// Saved implementation artifact, replayed against this archive's bugs.ts.
const saved = JSON.parse(fs.readFileSync("/tmp/p-review-out/bugs.json", "utf8"));
const savedRun = reproduce(join(ROOT, "verify/examples/bugs.ts"), saved);
pass("saved-bugs-artifact", { status: savedRun.status, message: savedRun.message, outcomes: savedRun.outcomes?.map((o) => ({ target: o.target?.split("#").pop(), reproduced: o.reproduced, status: o.status })) });
if (identity.sha256 === saved.identity && savedRun.status !== "reproduced") fail("saved-bugs-artifact", savedRun);

// Explicit shrink skip does not call the oracle. Typed heap, predicate, callback probe.
function skipCase(name, fn, source) {
  const { targets } = compile(single("skip.ts", source).records);
  const target = targets.find((t) => t.name === fn);
  let calls = 0;
  const result = shrink(target, { status: "counterexample", witness: [] }, () => { calls++; return { status: "counterexample", confirmed: true, failed: [{ text: "x" }] }; });
  const row = { name: target?.name, heap: !!target?.heapModel, probes: target?.probes?.length ?? 0, models: witnessModels(target).map((m) => m.kind), skipped: result.skipped ?? null, calls };
  if (calls !== 0 || result.skipped !== "heap, callback-probe or predicate-table witness") fail("shrink-skip-" + name, row);
  pass("shrink-skip-" + name, row);
}
skipCase("heap", "bug", "// ensures true\nexport function bug(a:{x:number}){a.x=1;return true;}\n");
skipCase("predicate", "bug", "// ensures result\nexport function bug(p:(x:number)=>boolean){return p(1)===p(2);}\n");
skipCase("callback-probe", "caller", `// ensures result === fn(x)
export function applyPredicate(fn:(value:number)=>boolean,x:number){return fn(x);}
// requires x>0
// ensures result === (x>1)
export function big(x:number){return x>1;}
// ensures true
export function caller(){const matches=(x:number):boolean=>big(x);return applyPredicate(matches,2);}
`);

// Greedy shrink: same failure, strictly smaller, valid witnesses only, cap is not minimality.
function cost(m, raw) {
  if (raw === null) return 0;
  if (m.kind === "number") {
    const n = num(raw);
    return Number.isNaN(n) ? 3000 : !Number.isFinite(n) ? 2999 : n === 0 ? (Object.is(n, -0) ? 0.5 : 0) : 1 + Math.log2(1 + Math.abs(n)) + (Number.isInteger(n) ? 0 : 1) + (n < 0 ? 0.25 : 0);
  }
  if (m.kind === "array") return 1e4 * raw.length + raw.reduce((s, v) => s + cost({ kind: m.element }, v), 0);
  return 0;
}
const numberOracle = (r) => {
  const invalid = validWitness(bugModels, r.witness);
  if (invalid) fail("shrink-replayed-invalid", invalid);
  const n = num(r.witness[0]);
  if (!(n >= 0)) return { status: "counterexample", confirmed: true, phase: "requires-definedness", failed: [{ text: "n>=0" }] };
  if (!(n * 2 < 100)) return { status: "counterexample", confirmed: true, failed: [{ text: "result<100" }] };
  return { status: "verified", confirmed: false, failed: [] };
};
const shrunkNumber = shrink(bugTarget, { status: "counterexample", witness: [hex(1e300)] }, numberOracle);
const shrunkValue = num(shrunkNumber.witness[0]);
if (shrunkNumber.replays > 300 || !(cost({ kind: "number" }, shrunkNumber.witness[0]) < cost({ kind: "number" }, hex(1e300))) || shrunkValue !== 50 || signature(numberOracle({ witness: shrunkNumber.witness })) !== signature(numberOracle({ witness: [hex(1e300)] }))) {
  fail("greedy-number", { ...shrunkNumber, value: shrunkValue });
}
pass("greedy-number", { replays: shrunkNumber.replays, limit: shrunkNumber.limit, value: shrunkValue, greedy: shrunkNumber.greedy, changed: shrunkNumber.changed });

const arrayProject = project("array", "// ensures result<10\nexport const bug=(xs:readonly number[])=>xs.length;\n");
const arrayTarget = bundleFor(arrayProject.entry).byName.get("bug");
let arrayCalls = 0;
const arraySkip = shrink(arrayTarget, { status: "counterexample", witness: [] }, () => { arrayCalls++; return { status: "counterexample", confirmed: true, failed: [{ text: "result<10" }] }; });
if (arrayCalls !== 0 || !arrayTarget.heapModel || arraySkip.skipped !== "heap, callback-probe or predicate-table witness") fail("array-heap-skips-shrink", { arrayCalls, heap: !!arrayTarget.heapModel, skipped: arraySkip.skipped, models: witnessModels(arrayTarget).map((m) => m.kind) });
pass("array-heap-skips-shrink", { calls: arrayCalls, models: witnessModels(arrayTarget).map((m) => m.kind), skipped: arraySkip.skipped });

const wide = project("wide", "// requires a>=0\n// requires b>=0\n// requires c>=0\n// requires d>=0\n// ensures result===1\nexport const bug=(a:number,b:number,c:number,d:number)=>a>=100&&b>=100&&c>=100&&d>=100?0:1;\n");
const wideTarget = bundleFor(wide.entry).byName.get("bug");
const wideModels = witnessModels(wideTarget);
const wideWitness = Array.from({ length: 4 }, () => hex(1e300));
if (validWitness(wideModels, wideWitness)) fail("wide-witness-shape", validWitness(wideModels, wideWitness));
const wideOracle = (r) => {
  const invalid = validWitness(wideModels, r.witness);
  if (invalid) fail("wide-shrink-replayed-invalid", invalid);
  const values = r.witness.map(num);
  if (!values.every((n) => n >= 0)) return { status: "counterexample", confirmed: true, phase: "requires-definedness", failed: [{ text: "finite" }] };
  if (values.every((n) => n >= 100)) return { status: "counterexample", confirmed: true, failed: [{ text: "result===1" }] };
  return { status: "verified", confirmed: false, failed: [] };
};
const shrunkWide = shrink(wideTarget, { status: "counterexample", witness: wideWitness }, wideOracle);
const wideValues = shrunkWide.witness.map(num);
const wideCosts = wideWitness.map((w, i) => cost(wideModels[i], w));
const finalCosts = shrunkWide.witness.map((w, i) => cost(wideModels[i], w));
const stillFails = signature(wideOracle({ witness: shrunkWide.witness })) === signature(wideOracle({ witness: wideWitness }));
const notMinimal = wideValues.some((n) => n > 100);
if (shrunkWide.replays !== 300 || shrunkWide.replays > 300 || !stillFails || !notMinimal || finalCosts.some((c, i) => c > wideCosts[i])) fail("greedy-cap-not-minimal", { replays: shrunkWide.replays, limit: shrunkWide.limit, wideValues, stillFails, notMinimal, finalCosts, wideCosts });
pass("greedy-cap-not-minimal", { replays: shrunkWide.replays, limit: shrunkWide.limit, values: wideValues, greedy: shrunkWide.greedy, changed: shrunkWide.changed, smallerCosts: finalCosts.map((c, i) => c < wideCosts[i]) });

// Filesystem: readonly, audit, and plan create nothing. Readwrite put is the only creator.
const absent = join(scratch, "absent-root", "cache");
armWrites = true;
const before = writes.length;
for (const mode of ["readonly", "audit"]) {
  const store = openCache(absent + mode, { mode });
  const got = store.get("ab".repeat(32), bugTarget, identity.sha256);
  if (!got.miss) fail("absent-get", { mode, got });
}
const planDir = join(scratch, "plan-missing", "cache");
const plan = await affected(bug.entry, { cache: { dir: planDir }, timeoutMs: 1, plan: false });
if (!plan.plan?.noSolver || plan.outcomes.length !== 0 || fs.existsSync(join(scratch, "plan-missing")) || fs.existsSync(join(scratch, "absent-root"))) fail("plan-creates", { plan, writes: writes.slice(before), spawns });
pass("readonly-audit-plan-create-nothing", { noSolver: plan.plan.noSolver, outcomes: plan.outcomes.length, needsSolve: plan.plan.targets.map((t) => t.needsSolve), writes: writes.slice(before), spawns });
armWrites = false;

// Default verify(source) does not read an adjacent file and does not create a cache.
const secret = join(scratch, "secret.ts");
orig.writeFileSync(secret, "export const secret = 1;\n");
const readOrig = fs.readFileSync;
let secretReads = 0;
fs.readFileSync = function (path, ...rest) {
  if (String(path).endsWith("secret.ts")) secretReads++;
  return readOrig(path, ...rest);
};
syncBuiltinESMExports();
const isolated = await verify("import {secret} from './secret.ts';\nexport const f=()=>secret;\n", { file: join(scratch, "app.ts") });
fs.readFileSync = readOrig;
syncBuiltinESMExports();
const isolatedMessage = isolated.outcomes?.map((o) => o.message).join("\n") ?? "";
if (!/never reads files/.test(isolatedMessage) || secretReads !== 0 || fs.existsSync(join(scratch, ".jsverify"))) fail("default-verify-isolation", { isolated, secretReads });
pass("default-verify-isolation", { status: isolated.outcomes.map((o) => o.status), message: isolatedMessage, secretReads, spawns });

// CLI argument errors and adversarial artifacts do not claim reproduction.
function cli(args) {
  const child = cp.spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
  let parsed;
  try { parsed = JSON.parse(child.stdout); } catch { parsed = null; }
  return { status: child.status, stdout: child.stdout, stderr: child.stderr, parsed };
}
const cases = [
  [["--nope"], 2],
  [["reproduce"], 2],
  [["reproduce", "--json"], 2],
  [["--cache-mode", "audit", bug.entry], 2],
  [["reproduce", "--target", "a", "--target", "b", bug.entry], 2],
];
for (const [args, code] of cases) {
  const r = cli(args);
  if (r.status !== code || /"status": "reproduced"/.test(r.stdout) || r.stdout.includes("\nreproduced\n") || r.parsed?.status === "reproduced") fail("cli-usage", { args, status: r.status, stdout: r.stdout, stderr: r.stderr });
  pass("cli-usage", { args, status: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim().split("\n")[0] });
}
const forgedFile = join(scratch, "forged.json");
orig.writeFileSync(forgedFile, JSON.stringify({ status: "reproduced", format: 1, kind: "jsverify-bugs" }));
const forgedCli = cli(["reproduce", "--json", forgedFile, bug.entry]);
if (forgedCli.status === 0 || forgedCli.parsed?.status === "reproduced") fail("cli-forged-json", forgedCli);
pass("cli-forged-json", { status: forgedCli.status, body: forgedCli.parsed?.status, stderr: forgedCli.stderr.trim().split("\n")[0] });
const goodFile = join(scratch, "good.json");
orig.writeFileSync(goodFile, JSON.stringify(real));
const goodCli = cli(["reproduce", "--json", goodFile, bug.entry]);
if (goodCli.status !== 0 || goodCli.parsed?.status !== "reproduced") fail("cli-real-json", { status: goodCli.status, parsed: goodCli.parsed, stderr: goodCli.stderr });
pass("cli-real-json", { status: goodCli.status, input: goodCli.parsed.outcomes[0].inputs, reproduced: goodCli.parsed.outcomes[0].reproduced });
const textCli = cli(["replay", goodFile, bug.entry]);
if (textCli.status !== 0 || !textCli.stdout.startsWith("reproduced")) fail("cli-text", textCli);
pass("cli-text-replay", { status: textCli.status, stdout: textCli.stdout.trim() });
const staleCli = cli(["reproduce", "--json", goodFile]);
// evidence.entry is the original bug.entry, so this is a real reproduce, not a forgery.
pass("cli-entry-from-artifact", { status: staleCli.status, body: staleCli.parsed?.status });
const oversized = join(scratch, "big.json");
orig.writeFileSync(oversized, Buffer.alloc(MAX_ENTRY_BYTES + 1, 0x78));
const bigCli = cli(["reproduce", "--json", oversized]);
if (bigCli.status === 0 || bigCli.parsed?.status === "reproduced" || bigCli.stdout.includes("reproduced")) fail("cli-oversize", { status: bigCli.status, stdout: bigCli.stdout.slice(0, 200), stderr: bigCli.stderr.slice(0, 200) });
pass("cli-oversize", { status: bigCli.status, stderr: bigCli.stderr.trim().split("\n")[0], stdout: bigCli.stdout });
const dirCli = cli(["reproduce", "--json", scratch]);
if (dirCli.status === 0 || dirCli.parsed?.status === "reproduced") fail("cli-directory", dirCli);
pass("cli-directory", { status: dirCli.status, stderr: dirCli.stderr.trim().split("\n")[0], stdout: dirCli.stdout });

if (spawns.length) fail("unexpected-spawns", spawns);
pass("no-solver-spawns", { spawns: spawns.length, scripts });
orig.rmSync(scratch, { recursive: true, force: true });
console.log(JSON.stringify({ check: "nonsolver-done", ok: true, passed: results.length }));
