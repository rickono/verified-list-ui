// Reproduce the P baseline comparison and real source workflows. Run through
// artifacts/ready-now/serial-verify.py from the repository root.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verify, verifyFile, affected, reproduce } from "../../../index.mjs";
import { compile } from "../../../source.mjs";
import { single } from "../../../modules.mjs";
import { phases, obligation } from "../../../proofs.mjs";
import { annotatedSources } from "../../../examples/es-toolkit/check.mjs";
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const BASE = "e435c8abce3107f3afce5be2b10ae23102d269d2";
const sha = (text) => createHash("sha256").update(text).digest("hex");
const scratch = mkdtempSync(join(tmpdir(), "jsverify-p-review-"));
const log = (o) => console.log(JSON.stringify(o));
try {
  const old = join(scratch, "baseline"); mkdirSync(old);
  const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", BASE, "verify"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter((p) => /^verify\/[^/]+\.mjs$/.test(p));
  for (const path of paths) writeFileSync(join(old, path.slice(7)), execFileSync("git", ["show", `${BASE}:${path}`], { cwd: ROOT }));
  symlinkSync(join(ROOT, "node_modules"), join(scratch, "node_modules"));
  const baseline = await import(pathToFileURL(join(old, "index.mjs")));
  const oldSource = await import(pathToFileURL(join(old, "source.mjs")));
  const oldModules = await import(pathToFileURL(join(old, "modules.mjs")));
  const oldProofs = await import(pathToFileURL(join(old, "proofs.mjs")));
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
    const before = await baseline.verify(source, { file: "baseline.ts", timeoutMs: 30_000 });
    const after = await verify(source, { file: "baseline.ts", timeoutMs: 30_000 });
    assert.deepEqual(after, before, name);
    log({ check: "default-report-and-all-query-phases", name, identical: true, sourceSha256: sha(source), outcomes: after.outcomes });
  }
  const es = join(ROOT, "verify/examples/es-toolkit");
  const provenance = JSON.parse(readFileSync(join(es, "provenance.json"), "utf8"));
  const sources = Object.fromEntries(["sum", "mean"].map((n) => [n, readFileSync(join(es, `${n}.upstream.ts`), "utf8")]));
  const annotated = annotatedSources(sources, provenance);
  const project = join(scratch, "project"); mkdirSync(project);
  writeFileSync(join(project, "package.json"), '{"type":"module"}\n');
  for (const name of ["sum", "mean"]) writeFileSync(join(project, `${name}.ts`), annotated[name]);
  const entry = join(project, "mean.ts"), dir = join(scratch, "cache"), opts = { timeoutMs: 60_000, targets: ["mean"], cache: { dir } };
  const cold = await verifyFile(entry, opts), warm = await verifyFile(entry, opts);
  assert.ok(cold.outcomes.every((o) => o.status === "verified")); assert.equal(cold.cache.written.length, 2);
  assert.equal(warm.cache.hits.length, 2); assert.equal(warm.cache.solved.length, 0); assert.deepEqual(warm.outcomes, cold.outcomes);
  const plan = await affected(entry, opts); assert.ok(plan.plan.targets.every((t) => !t.needsSolve));
  const audit = await verifyFile(entry, { ...opts, cache: { dir, mode: "audit" } }); assert.equal(audit.cache.solved.length, 2); assert.deepEqual(audit.cache.disagreements, []);
  log({ check: "pinned-es-toolkit-project-workflow", pin: provenance.commit, sourceFiles: provenance.files, annotatedHashes: Object.fromEntries(Object.entries(annotated).map(([n, s]) => [n, sha(s)])), identity: cold.cache.identity, cold: cold.cache, warm: warm.cache, plan: plan.plan, audit: audit.cache, outcomes: cold.outcomes });
  // This repository fixture contains actual buggy bodies. It is not a new
  // upstream bug campaign and the expected bugs predate this P implementation.
  const buggy = join(ROOT, "verify/examples/bugs.ts");
  const bugs = await verifyFile(buggy, { timeoutMs: 30_000, evidence: true });
  assert.equal(bugs.outcomes.length, 3); assert.ok(bugs.outcomes.every((o) => o.status === "counterexample" && o.confirmed));
  const reproduced = reproduce(buggy, JSON.parse(JSON.stringify(bugs.evidence)));
  assert.equal(reproduced.status, "reproduced");
  log({ check: "real-buggy-fixture-evidence-reproduce", source: "verify/examples/bugs.ts", sourceSha256: sha(readFileSync(buggy)), evidence: bugs.evidence, reproduced });
} finally { rmSync(scratch, { recursive: true, force: true }); }
