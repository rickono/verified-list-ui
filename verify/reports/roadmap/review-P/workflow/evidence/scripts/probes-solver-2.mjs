// Remaining solver probes: hit-path callee gate, forgery, repair, typed evidence, relocation.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = "/tmp/p-review-code";
const { verifyFile, reproduce } = await import(pathToFileURL(join(ROOT, "verify/index.mjs")));
const { openCache, proofKey } = await import(pathToFileURL(join(ROOT, "verify/cache.mjs")));
const { runningIdentity } = await import(pathToFileURL(join(ROOT, "verify/manifest.mjs")));
const scratch = mkdtempSync(join(tmpdir(), "p-review-solver2-"));
const pass = (check, detail) => console.log(JSON.stringify({ check, ok: true, detail }));
const fail = (check, detail) => { console.log(JSON.stringify({ check, ok: false, detail })); throw new Error(check); };
const hex = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
const project = (name, files) => {
  const dir = join(scratch, name);
  for (const [file, text] of Object.entries(files)) {
    const path = join(dir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  return dir;
};
const tail = (id) => id.split("#").pop();

const skipDone = process.env.P_REVIEW_SKIP_DONE === "1";
try {
  if (skipDone) pass("skipped-already-executed", ["hit-callee-gate", "benign-forgery-trust-control"]);
  else {
  const helper = "// requires x > 0\n// ensures result > 0\nexport const positive = (x: number) => x;\n";
  const entryText = "import { positive } from './helper.ts';\n// requires y > 1\n// ensures result > 0\nexport const caller = (y: number) => positive(y);\n// ensures Object.is(result,z)\nexport const other = (z: number) => z;\n";
  const dir = project("gate", { "helper.ts": helper, "entry.ts": entryText });
  const entry = join(dir, "entry.ts");
  const cache = join(dir, "cache");
  const cold = await verifyFile(entry, { timeoutMs: 30_000, cache: { dir: cache } });
  if (!cold.outcomes.every((o) => o.status === "verified")) fail("gate-cold", cold.outcomes);
  writeFileSync(join(dir, "helper.ts"), helper.replace("=> x;", "=> x - 1;"));
  const gated = await verifyFile(entry, { timeoutMs: 30_000, targets: ["caller"], cache: { dir: cache } });
  const names = gated.selection.included.map(tail).sort();
  const caller = gated.outcomes.find((o) => o.fn === "caller");
  const positive = gated.outcomes.find((o) => o.fn === "positive");
  if (JSON.stringify(names) !== JSON.stringify(["caller", "positive"]) || positive.status !== "counterexample" || caller.status === "verified" || caller.reason !== "dependency" || gated.cache.written.some((id) => tail(id) === "caller") || !gated.cache.hits.some((id) => tail(id) === "caller")) {
    fail("hit-callee-gate", { names, caller, positive, hits: gated.cache.hits.map(tail), solved: gated.cache.solved.map(tail), written: gated.cache.written.map(tail) });
  }
  const omitted = await verifyFile(entry, { timeoutMs: 30_000, targets: ["other"], cache: { dir: cache } });
  if (omitted.selection.included.map(tail).includes("caller")) fail("selection-omits-callers", omitted.selection);
  pass("hit-callee-gate", { included: names, caller: caller.reason, positive: positive.status, hits: gated.cache.hits.map(tail), solved: gated.cache.solved.map(tail), written: gated.cache.written.map(tail), otherIncludes: omitted.selection.included.map(tail) });

  const trustDir = project("trust", { "entry.ts": "// ensures result<100\nexport const keep=(n:number)=>n;\n" });
  const trustEntry = join(trustDir, "entry.ts");
  const trustCache = join(trustDir, "cache");
  const trustCold = await verifyFile(trustEntry, { timeoutMs: 30_000, cache: { dir: trustCache } });
  const oldKey = Object.values(trustCold.cache.keys)[0];
  writeFileSync(trustEntry, "// ensures result<100\nexport const keep=(n:number)=>n*2;\n");
  const key = proofKey((await import(pathToFileURL(join(ROOT, "verify/source.mjs")))).compile((await import(pathToFileURL(join(ROOT, "verify/modules.mjs")))).load(trustEntry).records).targets[0], runningIdentity().sha256);
  if (key === oldKey) fail("trust-key", { key });
  const file = openCache(trustCache).path(key);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ format: 1, identity: runningIdentity().sha256, key, target: "entry.ts#keep", witness: [hex(0)] }));
  const readonlyHit = await verifyFile(trustEntry, { timeoutMs: 30_000, cache: { dir: trustCache, mode: "readonly" } });
  const auditHit = await verifyFile(trustEntry, { timeoutMs: 30_000, cache: { dir: trustCache, mode: "audit" } });
  const keep = (r) => r.outcomes.find((o) => o.fn === "keep");
  if (keep(readonlyHit).status !== "verified") fail("forgery-readonly", keep(readonlyHit));
  if (keep(auditHit).status !== "counterexample" || !auditHit.cache.disagreements.some((d) => d.kind === "logical") || auditHit.cache.written.length !== 0 || existsSync(join(trustDir, "nope"))) fail("forgery-audit", { status: keep(auditHit).status, disagreements: auditHit.cache.disagreements, written: auditHit.cache.written });
  pass("benign-forgery-trust-control", { readonly: keep(readonlyHit).status, audit: keep(auditHit).status, kinds: auditHit.cache.disagreements.map((d) => d.kind), trust: readonlyHit.cache.trust });
  }

  const mix = project("mix", { "entry.ts": "// ensures result<100\nexport const bug=(n:number)=>n*2;\n// ensures Object.is(result,n)\nexport const fine=(n:number)=>n;\n" });
  const mixEntry = join(mix, "entry.ts");
  const mixCache = join(mix, "cache");
  const mixCold = await verifyFile(mixEntry, { timeoutMs: 30_000, cache: { dir: mixCache } });
  if (JSON.stringify(mixCold.cache.written.map(tail)) !== JSON.stringify(["fine"])) fail("write-only-verified", { written: mixCold.cache.written.map(tail), outcomes: mixCold.outcomes.map((o) => [o.fn, o.status]) });
  const fineId = mixCold.cache.written[0];
  const fineFile = openCache(mixCache, { mode: "readonly" }).path(mixCold.cache.keys[fineId]);
  writeFileSync(fineFile, "{");
  const repaired = await verifyFile(mixEntry, { timeoutMs: 30_000, cache: { dir: mixCache } });
  const parsed = JSON.parse(readFileSync(fineFile, "utf8"));
  const warm = await verifyFile(mixEntry, { timeoutMs: 30_000, cache: { dir: mixCache } });
  const warmHits = warm.cache.hits.map(tail);
  const warmSolved = warm.cache.solved.map(tail);
  // Counterexamples are not receipts, so the next readwrite re-solves bug. The repaired fine receipt is a hit and is not solved again.
  if (repaired.cache.rejected.length !== 1 || repaired.cache.rejected[0].reason !== "unparseable" || JSON.stringify(repaired.cache.written.map(tail)) !== JSON.stringify(["fine"]) || !Array.isArray(parsed.witness) || JSON.stringify(warmHits) !== JSON.stringify(["fine"]) || JSON.stringify(warmSolved) !== JSON.stringify(["bug"])) fail("repair", { rejected: repaired.cache.rejected, written: repaired.cache.written.map(tail), solved: repaired.cache.solved.map(tail), witness: Array.isArray(parsed.witness), warm: { hits: warmHits, solved: warmSolved } });
  pass("write-policy-and-repair", { coldWritten: mixCold.cache.written.map(tail), rejected: repaired.cache.rejected.map((r) => r.reason), repaired: repaired.cache.written.map(tail), witness: parsed.witness.length, warmHits, warmSolved });

  const absent = join(scratch, "missing", "cache");
  const ro = await verifyFile(mixEntry, { timeoutMs: 30_000, cache: { dir: absent, mode: "readonly" } });
  const plan = await verifyFile(mixEntry, { timeoutMs: 1, plan: true, cache: { dir: join(scratch, "plan-missing", "cache") } });
  if (existsSync(join(scratch, "missing")) || existsSync(join(scratch, "plan-missing")) || ro.cache.written.length !== 0 || !plan.plan.noSolver || plan.outcomes.length !== 0) fail("no-create", { missing: existsSync(join(scratch, "missing")), planMissing: existsSync(join(scratch, "plan-missing")), written: ro.cache.written, plan: plan.plan });
  pass("readonly-and-plan-create-nothing", { readonlyWritten: ro.cache.written, planTargets: plan.plan.targets.length, noSolver: plan.plan.noSolver });

  for (const [name, source, fn] of [
    ["heap", "// ensures true\nexport function bug(a:{x:number}){a.x=1;return true;}\n", "bug"],
    ["predicate", "// ensures result\nexport function bug(p:(x:number)=>boolean){return p(1)===p(2);}\n", "bug"],
    ["callback", "// ensures result === fn(x)\nexport function applyPredicate(fn:(value:number)=>boolean,x:number){return fn(x);}\n// requires x>0\n// ensures result===(x>1)\nexport function big(x:number){return x>1;}\n// ensures true\nexport function caller(){const matches=(x:number):boolean=>big(x);return applyPredicate(matches,2);}\n", "caller"],
  ]) {
    const here = project(name, { "entry.ts": source });
    const report = await verifyFile(join(here, "entry.ts"), { timeoutMs: 30_000, evidence: true });
    const outcome = report.outcomes.find((o) => o.fn === fn);
    const id = Object.keys(report.evidence?.witnesses ?? {}).find((key) => key.endsWith("#" + fn));
    const item = id && report.evidence.witnesses[id];
    const replayed = id ? reproduce(join(here, "entry.ts"), report.evidence, { target: id }) : { status: "missing" };
    if (outcome?.status !== "counterexample" || !outcome.confirmed || item?.shrunk?.skipped !== "heap, callback-probe or predicate-table witness" || replayed.status !== "reproduced") fail("special-" + name, { status: outcome?.status, reason: outcome?.reason, skipped: item?.shrunk, replayed: replayed.status, message: replayed.message, evidence: report.evidence?.disabled });
    pass("special-" + name, { status: outcome.status, skipped: item.shrunk.skipped, reproduced: replayed.status });
  }

  const movedFiles = {
    "entry.ts": "import {id} from '@lib/id';\n// ensures result<100\nexport const bug=(n:number)=>id(n*2);\n",
    "lib.ts": "// ensures Object.is(result,x)\nexport const id=(x:number)=>x;\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@lib/id": ["lib.ts"] } } }),
  };
  const left = project("left", movedFiles);
  const report = await verifyFile(join(left, "entry.ts"), { timeoutMs: 30_000, tsconfig: join(left, "tsconfig.json"), evidence: true });
  const right = project("right", movedFiles);
  const moved = reproduce(join(right, "entry.ts"), report.evidence);
  writeFileSync(join(right, "tsconfig.json"), movedFiles["tsconfig.json"] + "\n");
  const stale = reproduce(join(right, "entry.ts"), report.evidence);
  if (report.evidence.tsconfig !== "tsconfig.json" || moved.status !== "reproduced" || stale.status !== "stale") fail("config-relocation", { tsconfig: report.evidence?.tsconfig, moved: moved.status, stale: stale.status, message: moved.message ?? stale.message });
  pass("config-relocation", { tsconfig: report.evidence.tsconfig, moved: moved.status, editedConfig: stale.status });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
