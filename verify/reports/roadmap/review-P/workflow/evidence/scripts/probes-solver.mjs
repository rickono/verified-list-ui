// Solver-backed P workflow probes against archived c9c4511.
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const ROOT = "/tmp/p-review-code";
const GIT = "/Users/rick/.t3/worktrees/verified-list-ui/t3-04da8a47";
const PARENT = "e435c8abce3107f3afce5be2b10ae23102d269d2";
const origSpawn = cp.spawn;
const spawns = [];
cp.spawn = function (...args) {
  spawns.push(String(args[0]));
  return origSpawn.apply(this, args);
};
syncBuiltinESMExports();

const { verify, verifyFile, affected, reproduce } = await import(pathToFileURL(join(ROOT, "verify/index.mjs")));
const { openCache, proofKey } = await import(pathToFileURL(join(ROOT, "verify/cache.mjs")));
const { runningIdentity } = await import(pathToFileURL(join(ROOT, "verify/manifest.mjs")));
const { signature } = await import(pathToFileURL(join(ROOT, "verify/evidence.mjs")));
const { compile } = await import(pathToFileURL(join(ROOT, "verify/source.mjs")));
const { single, load } = await import(pathToFileURL(join(ROOT, "verify/modules.mjs")));
const { phases, obligation } = await import(pathToFileURL(join(ROOT, "verify/proofs.mjs")));
const { annotatedSources } = await import(pathToFileURL(join(ROOT, "verify/examples/es-toolkit/check.mjs")));
const assert = (await import("node:assert/strict")).default;

const scratch = mkdtempSync(join(tmpdir(), "p-review-solver-"));
const results = [];
const pass = (check, detail) => { const row = { check, ok: true, detail }; results.push(row); console.log(JSON.stringify(row)); };
const fail = (check, detail) => { const row = { check, ok: false, detail }; results.push(row); console.log(JSON.stringify(row)); throw new Error(check); };
const sha = (text) => createHash("sha256").update(text).digest("hex");
const hex = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
const reset = () => { spawns.length = 0; };
const project = (name, files) => {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    const path = join(dir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  return dir;
};

try {
  const oldDir = join(scratch, "baseline");
  mkdirSync(join(oldDir, "verify"), { recursive: true });
  symlinkSync(join(ROOT, "node_modules"), join(oldDir, "node_modules"));
  const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", PARENT, "verify"], { cwd: GIT, encoding: "utf8" }).trim().split("\n").filter((p) => /^verify\/[^/]+\.mjs$/.test(p));
  for (const path of paths) writeFileSync(join(oldDir, path), execFileSync("git", ["show", `${PARENT}:${path}`], { cwd: GIT }));
  const baseline = await import(pathToFileURL(join(oldDir, "verify/index.mjs")));
  const oldSource = await import(pathToFileURL(join(oldDir, "verify/source.mjs")));
  const oldModules = await import(pathToFileURL(join(oldDir, "verify/modules.mjs")));
  const oldProofs = await import(pathToFileURL(join(oldDir, "verify/proofs.mjs")));
  const cases = [
    ["identity", "// ensures Object.is(result,x)\nconst f=(x:number)=>x;"],
    ["requires-definedness", "// requires real(x)>real(0)\n// ensures true\nconst f=(x:number)=>x;"],
    ["body-local-result", "// ensures Object.is(result,x)\nfunction f(x:number){const result=x;return result;}"],
    ["heap", "// modifies a.x\n// ensures Object.is(a.x,x)\nfunction f(a:{x:number},x:number){a.x=x;return a;}"],
    ["callback", "// ensures result===p(x)\nfunction f(p:(n:number)=>boolean,x:number){return p(x);}"],
    ["caller", "// ensures Object.is(result,x)\nfunction id(x:number){return x;}\n// ensures Object.is(result,y)\nfunction f(y:number){return id(y);}"],
  ];
  for (const [name, source] of cases) {
    const now = compile(single("baseline.ts", source).records).targets;
    const then = oldSource.compile(oldModules.single("baseline.ts", source).records).targets;
    for (let i = 0; i < now.length; i++) for (const [phase, index] of phases(now[i])) assert.deepEqual(obligation(now[i], phase, index), oldProofs.obligation(then[i], phase, index));
    reset();
    const before = await baseline.verify(source, { file: "baseline.ts", timeoutMs: 30_000 });
    const mid = spawns.length;
    const after = await verify(source, { file: "baseline.ts", timeoutMs: 30_000 });
    assert.deepEqual(after, before, name);
    assert.equal(after.cache, undefined);
    pass("default-report", { name, identical: true, spawns: spawns.length, baselineSpawns: mid, graph: after.graphSha256, outcomes: after.outcomes.map((o) => ({ fn: o.fn, status: o.status, phase: o.phase ?? null, label: o.label ?? null })) });
  }

  const provenance = JSON.parse(readFileSync(join(ROOT, "verify/examples/es-toolkit/provenance.json"), "utf8"));
  const hashes = {};
  for (const [name, file] of Object.entries(provenance.files)) hashes[name] = sha(readFileSync(join(ROOT, "verify/examples/es-toolkit", file.local)));
  const hashMatch = Object.fromEntries(Object.entries(provenance.files).map(([name, file]) => [name, hashes[name] === file.sha256]));
  pass("es-toolkit-bytes", { pin: provenance.commit, hashMatch });
  if (Object.values(hashMatch).some((ok) => !ok)) fail("es-toolkit-bytes", hashMatch);
  const sources = Object.fromEntries(["sum", "mean"].map((n) => [n, readFileSync(join(ROOT, "verify/examples/es-toolkit", `${n}.upstream.ts`), "utf8")]));
  const annotated = annotatedSources(sources, provenance);
  const esDir = project("es", { "package.json": '{"type":"module"}\n', "sum.ts": annotated.sum, "mean.ts": annotated.mean });
  const entry = join(esDir, "mean.ts");
  const dir = join(scratch, "es-cache");
  reset();
  const cold = await verifyFile(entry, { timeoutMs: 60_000, targets: ["mean"], cache: { dir } });
  const coldSpawns = spawns.length;
  if (!cold.outcomes.every((o) => o.status === "verified") || cold.cache.written.length !== 2 || coldSpawns === 0) fail("es-cold", { outcomes: cold.outcomes, cache: cold.cache, coldSpawns });
  reset();
  const warm = await verifyFile(entry, { timeoutMs: 60_000, targets: ["mean"], cache: { dir } });
  if (warm.cache.hits.length !== 2 || warm.cache.solved.length !== 0 || spawns.length !== 0) fail("es-warm", { hits: warm.cache.hits.length, solved: warm.cache.solved, spawns: spawns.length });
  assert.deepEqual(warm.outcomes, cold.outcomes);
  reset();
  const plan = await affected(entry, { timeoutMs: 1, targets: ["mean"], cache: { dir } });
  if (!plan.plan.noSolver || plan.outcomes.length !== 0 || plan.plan.targets.some((t) => t.needsSolve) || spawns.length !== 0) fail("es-plan", { plan: plan.plan, outcomes: plan.outcomes.length, spawns: spawns.length });
  reset();
  const audit = await verifyFile(entry, { timeoutMs: 60_000, targets: ["mean"], cache: { dir, mode: "audit" } });
  if (audit.cache.solved.length !== 2 || audit.cache.disagreements.length !== 0 || audit.cache.written.length !== 0 || spawns.length === 0) fail("es-audit", { cache: audit.cache, spawns: spawns.length });
  const absent = join(scratch, "es-absent", "cache");
  reset();
  const readonly = await verifyFile(entry, { timeoutMs: 60_000, targets: ["mean"], cache: { dir: absent, mode: "readonly" } });
  if (existsSync(dirname(absent)) || readonly.cache.written.length !== 0 || readonly.cache.hits.length !== 0) fail("es-readonly-absent", { exists: existsSync(dirname(absent)), cache: readonly.cache });
  pass("es-toolkit-workflow", { identity: cold.cache.identity, coldSpawns, warmSpawns: 0, planSpawns: 0, auditSolved: audit.cache.solved.length, readonlyCreated: existsSync(dirname(absent)), outcomes: cold.outcomes.map((o) => o.fn + ":" + o.status) });

  const buggy = join(ROOT, "verify/examples/bugs.ts");
  reset();
  const bugs = await verifyFile(buggy, { timeoutMs: 30_000, evidence: true });
  if (bugs.outcomes.length !== 3 || bugs.outcomes.some((o) => o.status !== "counterexample" || !o.confirmed)) fail("bugs-verify", bugs.outcomes);
  const replayed = reproduce(buggy, JSON.parse(JSON.stringify(bugs.evidence)));
  if (replayed.status !== "reproduced") fail("bugs-reproduce", replayed);
  for (const [id, item] of Object.entries(bugs.evidence.witnesses)) {
    if (item.shrunk.replays > item.shrunk.limit || item.shrunk.greedy !== true) fail("bugs-shrink-bound", item.shrunk);
    const again = reproduce(buggy, bugs.evidence, { target: id, shrunk: false });
    const shrunk = reproduce(buggy, bugs.evidence, { target: id, shrunk: true });
    if (again.status !== "reproduced" || shrunk.status !== "reproduced" || signature(again.outcomes[0]) !== signature(shrunk.outcomes[0]) || signature(again.outcomes[0]) !== item.signature) fail("bugs-same-failure", { id, again: again.status, shrunk: shrunk.status });
  }
  pass("bugs-evidence", { spawns: spawns.length, targets: bugs.outcomes.map((o) => ({ fn: o.fn, status: o.status })), shrink: Object.fromEntries(Object.entries(bugs.evidence.witnesses).map(([id, item]) => [id, { replays: item.shrunk.replays, changed: item.shrunk.changed, limit: item.shrunk.limit }])) });

  const gateDir = project("gate", { "entry.ts": "// ensures Object.is(result,x)\nexport const id=(x:number)=>x;\n// ensures Object.is(result,y)\nexport const caller=(y:number)=>id(y);\n// ensures Object.is(result,z)\nexport const other=(z:number)=>z;\n" });
  const gateEntry = join(gateDir, "entry.ts");
  const gateCache = join(gateDir, "cache");
  const selected = await verifyFile(gateEntry, { timeoutMs: 30_000, targets: ["caller"], cache: { dir: gateCache } });
  const names = selected.selection.included.map((id) => id.split("#").pop()).sort();
  if (JSON.stringify(names) !== JSON.stringify(["caller", "id"])) fail("dependency-closure", names);
  writeFileSync(gateEntry, readFileSync(gateEntry, "utf8").replace("=>x;", "=>x-1;"));
  const gated = await verifyFile(gateEntry, { timeoutMs: 30_000, targets: ["caller"], cache: { dir: gateCache } });
  const caller = gated.outcomes.find((o) => o.fn === "caller");
  const id = gated.outcomes.find((o) => o.fn === "id");
  const files = existsSync(gateCache) ? execFileSync("find", [gateCache, "-type", "f"], { encoding: "utf8" }).trim().split("\n").filter(Boolean) : [];
  if (id.status !== "counterexample" || caller.status === "verified" || caller.reason !== "dependency" || gated.cache.written.some((x) => x.endsWith("#caller"))) fail("callee-gate", { caller, id, written: gated.cache.written, hits: gated.cache.hits, solved: gated.cache.solved });
  pass("dependency-and-callee-gate", { included: names, caller: caller.reason, id: id.status, written: gated.cache.written.map((x) => x.split("#").pop()), receiptFiles: files.length });

  const trustDir = project("trust", { "entry.ts": "// ensures result<100\nexport const keep=(n:number)=>n;\n" });
  const trustEntry = join(trustDir, "entry.ts");
  const trustCache = join(trustDir, "cache");
  const trustCold = await verifyFile(trustEntry, { timeoutMs: 30_000, cache: { dir: trustCache } });
  const oldKey = Object.values(trustCold.cache.keys)[0];
  writeFileSync(trustEntry, "// ensures result<100\nexport const keep=(n:number)=>n*2;\n");
  const current = compile(load(trustEntry).records).targets[0];
  const key = proofKey(current, runningIdentity().sha256);
  if (key === oldKey) fail("trust-key-changed", { key });
  const forged = { format: 1, identity: runningIdentity().sha256, key, target: current.id, witness: [hex(0)] };
  const file = openCache(trustCache).path(key);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(forged));
  reset();
  const readonlyHit = await verifyFile(trustEntry, { timeoutMs: 30_000, cache: { dir: trustCache, mode: "readonly" } });
  const readonlySpawns = spawns.length;
  reset();
  const auditHit = await verifyFile(trustEntry, { timeoutMs: 30_000, cache: { dir: trustCache, mode: "audit" } });
  const outcome = (r) => r.outcomes.find((o) => o.fn === "keep");
  if (outcome(readonlyHit).status !== "verified" || readonlySpawns !== 0) fail("benign-forgery-readonly", { status: outcome(readonlyHit).status, readonlySpawns, trust: readonlyHit.cache.trust });
  if (outcome(auditHit).status !== "counterexample" || !auditHit.cache.disagreements.some((d) => d.kind === "logical") || auditHit.cache.written.length !== 0) fail("benign-forgery-audit", { status: outcome(auditHit).status, disagreements: auditHit.cache.disagreements, written: auditHit.cache.written });
  pass("benign-forgery-trust-control", { readonly: outcome(readonlyHit).status, readonlySpawns, audit: outcome(auditHit).status, disagreement: auditHit.cache.disagreements.map((d) => d.kind), auditSpawns: spawns.length, note: "forged benign witness is the documented trust assumption; audit re-solves" });

  const mix = project("mix", { "entry.ts": "// ensures result<100\nexport const bug=(n:number)=>n*2;\n// ensures Object.is(result,n)\nexport const fine=(n:number)=>n;\n" });
  const mixEntry = join(mix, "entry.ts");
  const mixCache = join(mix, "cache");
  const mixCold = await verifyFile(mixEntry, { timeoutMs: 30_000, cache: { dir: mixCache } });
  const writtenNames = mixCold.cache.written.map((id) => id.split("#").pop());
  if (JSON.stringify(writtenNames) !== JSON.stringify(["fine"])) fail("write-only-verified", { written: mixCold.cache.written, outcomes: mixCold.outcomes.map((o) => [o.fn, o.status]) });
  const fineKey = mixCold.cache.keys[mixCold.cache.written[0]];
  const fineFile = openCache(mixCache, { mode: "readonly" }).path(fineKey);
  writeFileSync(fineFile, "{");
  const repaired = await verifyFile(mixEntry, { timeoutMs: 30_000, cache: { dir: mixCache } });
  const parsed = JSON.parse(readFileSync(fineFile, "utf8"));
  if (repaired.cache.rejected.length !== 1 || repaired.cache.solved.length !== 1 || JSON.stringify(repaired.cache.written.map((id) => id.split("#").pop())) !== JSON.stringify(["fine"]) || parsed.key !== fineKey) fail("repair-once", { cache: repaired.cache, parsed });
  const warmFine = await verifyFile(mixEntry, { timeoutMs: 30_000, cache: { dir: mixCache } });
  if (warmFine.cache.hits.length !== 1 || warmFine.cache.solved.length !== 0 || warmFine.cache.written.length !== 0) fail("repair-stays", warmFine.cache);
  pass("write-policy-and-repair", { coldWritten: writtenNames, rejected: repaired.cache.rejected.map((r) => r.reason), repairedWritten: repaired.cache.written.map((id) => id.split("#").pop()), warmHits: warmFine.cache.hits.length });

  const specials = [
    ["heap", "// ensures true\nexport function bug(a:{x:number}){a.x=1;return true;}\n"],
    ["predicate", "// ensures result\nexport function bug(p:(x:number)=>boolean){return p(1)===p(2);}\n"],
    ["callback", "// ensures result === fn(x)\nexport function applyPredicate(fn:(value:number)=>boolean,x:number){return fn(x);}\n// requires x>0\n// ensures result===(x>1)\nexport function big(x:number){return x>1;}\n// ensures true\nexport function caller(){const matches=(x:number):boolean=>big(x);return applyPredicate(matches,2);}\n"],
  ];
  for (const [name, source] of specials) {
    const dir = project(name, { "entry.ts": source });
    const report = await verifyFile(join(dir, "entry.ts"), { timeoutMs: 30_000, evidence: true });
    const fn = name === "callback" ? "caller" : "bug";
    const outcome = report.outcomes.find((o) => o.fn === fn);
    const id = Object.keys(report.evidence.witnesses).find((key) => key.endsWith("#" + fn));
    const item = report.evidence.witnesses[id];
    const replayed = reproduce(join(dir, "entry.ts"), report.evidence, { target: id });
    if (outcome.status !== "counterexample" || !outcome.confirmed || !/heap, callback-probe or predicate-table witness/.test(item.shrunk.skipped) || replayed.status !== "reproduced") fail("special-evidence-" + name, { outcome, skipped: item?.shrunk, replayed: replayed.status, message: replayed.message });
    pass("special-evidence-" + name, { status: outcome.status, skipped: item.shrunk.skipped, reproduced: replayed.status });
  }

  const movedFiles = {
    "entry.ts": "import {id} from '@lib/id';\n// ensures result<100\nexport const bug=(n:number)=>id(n*2);\n",
    "lib.ts": "// ensures Object.is(result,x)\nexport const id=(x:number)=>x;\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@lib/id": ["lib.ts"] } } }),
  };
  const left = project("left", movedFiles);
  const leftReport = await verifyFile(join(left, "entry.ts"), { timeoutMs: 30_000, tsconfig: join(left, "tsconfig.json"), evidence: true });
  const right = project("right", movedFiles);
  const moved = reproduce(join(right, "entry.ts"), leftReport.evidence);
  writeFileSync(join(right, "tsconfig.json"), movedFiles["tsconfig.json"] + "\n");
  const configStale = reproduce(join(right, "entry.ts"), leftReport.evidence);
  if (leftReport.evidence.tsconfig !== "tsconfig.json" || moved.status !== "reproduced" || configStale.status !== "stale") fail("config-relocation", { tsconfig: leftReport.evidence.tsconfig, moved: moved.status, configStale: configStale.status, message: moved.message });
  pass("config-relocation", { tsconfig: leftReport.evidence.tsconfig, moved: moved.status, editedConfig: configStale.status });
  pass("solver-done", { passed: results.length });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
