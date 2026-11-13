// Focused solver checks against archived c9c4511. Run only under serial-verify.py.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = "/tmp/review-p-c9c4511";
const REPO = "/Users/rick/.t3/worktrees/verified-list-ui/t3-53a73242";
const BASE = "e435c8abce3107f3afce5be2b10ae23102d269d2";
const { verify, verifyFile, affected, reproduce } = await import(pathToFileURL(join(ROOT, "verify/index.mjs")));
const { compile } = await import(pathToFileURL(join(ROOT, "verify/source.mjs")));
const { single } = await import(pathToFileURL(join(ROOT, "verify/modules.mjs")));
const { phases, obligation } = await import(pathToFileURL(join(ROOT, "verify/proofs.mjs")));
const log = (row) => console.log(JSON.stringify(row));
const scratch = mkdtempSync(join(tmpdir(), "review-p-solver-"));
const out = (report, fn) => report.outcomes.find((o) => o.fn === fn);

try {
  const oldDir = join(scratch, "baseline");
  mkdirSync(oldDir);
  const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", BASE, "verify"], { cwd: REPO, encoding: "utf8" })
    .trim().split("\n").filter((p) => /^verify\/[^/]+\.mjs$/.test(p));
  for (const path of paths) writeFileSync(join(oldDir, path.slice(7)), execFileSync("git", ["show", `${BASE}:${path}`], { cwd: REPO }));
  symlinkSync(join(ROOT, "node_modules"), join(scratch, "node_modules"));
  const baseline = await import(pathToFileURL(join(oldDir, "index.mjs")));
  const oldSource = await import(pathToFileURL(join(oldDir, "source.mjs")));
  const oldModules = await import(pathToFileURL(join(oldDir, "modules.mjs")));
  const oldProofs = await import(pathToFileURL(join(oldDir, "proofs.mjs")));
  const cases = [
    ["identity", "// ensures Object.is(result,x)\nconst f=(x:number)=>x;"],
    ["requires-definedness", "// requires real(x)>real(0)\n// ensures true\nconst f=(x:number)=>x;"],
    ["vacuous", "// requires false\n// ensures true\nconst f=(x:number)=>x;"],
    ["heap", "// modifies a.x\n// ensures Object.is(a.x,x)\nfunction f(a:{x:number},x:number){a.x=x;return a;}"],
    ["caller", "// ensures Object.is(result,x)\nfunction id(x:number){return x;}\n// ensures Object.is(result,y)\nfunction f(y:number){return id(y);}"],
  ];
  for (const [name, source] of cases) {
    const now = compile(single("baseline.ts", source).records).targets;
    const then = oldSource.compile(oldModules.single("baseline.ts", source).records).targets;
    assert.equal(now.length, then.length, name);
    for (let i = 0; i < now.length; i++) {
      assert.deepEqual(phases(now[i]).map(([phase]) => phase), name === "requires-definedness" && i === 0 ? ["requires-definedness", "requires-definedness-witness", "feasibility", "feasibility-witness", "postcondition", "counterexample-witness"] : phases(now[i]).map(([phase]) => phase));
      for (const [phase, index] of phases(now[i])) assert.deepEqual(obligation(now[i], phase, index), oldProofs.obligation(then[i], phase, index), `${name}:${phase}`);
    }
    const before = await baseline.verify(source, { file: "baseline.ts", timeoutMs: 20_000 });
    const after = await verify(source, { file: "baseline.ts", timeoutMs: 20_000 });
    assert.equal(after.cache, undefined, name);
    assert.deepEqual(after, before, name);
    log({ check: "default-report-and-phases", name, status: after.outcomes.map((o) => [o.fn, o.status, o.phase ?? null, o.label ?? null]) });
  }

  const project = join(scratch, "proj");
  mkdirSync(project);
  const entry = join(project, "entry.ts");
  const source = `// requires x>0
// ensures result>0
const broken=(x:number)=>x;
// requires y>0
// ensures result>0
const middle=(y:number)=>broken(y);
// requires z>0
// ensures result>0
const outer=(z:number)=>middle(z);`;
  writeFileSync(entry, source);
  const dir = join(scratch, "cache");
  const cold = await verifyFile(entry, { timeoutMs: 20_000, cache: { dir } });
  for (const fn of ["broken", "middle", "outer"]) assert.equal(out(cold, fn).status, "verified", fn);
  assert.equal(cold.cache.written.length, 3);
  writeFileSync(entry, source.replace("const broken=(x:number)=>x;", "const broken=(x:number)=>x-1;"));
  const gated = await verifyFile(entry, { timeoutMs: 20_000, cache: { dir } });
  assert.equal(out(gated, "broken").status, "counterexample");
  for (const fn of ["middle", "outer"]) assert.notEqual(out(gated, fn).status, "verified", JSON.stringify(out(gated, fn)));
  assert.deepEqual(gated.cache.written, []);
  log({
    check: "transitive-hit-gate",
    outcomes: gated.outcomes.map((o) => [o.fn, o.status, o.reason ?? null]),
    hits: gated.cache.hits.map((id) => id.split("#").at(-1)),
    solved: gated.cache.solved.map((id) => id.split("#").at(-1)),
    rejected: gated.cache.rejected.map((r) => [r.target.split("#").at(-1), r.reason]),
  });

  const repairDir = join(scratch, "repair");
  const repairEntry = join(project, "repair.ts");
  writeFileSync(repairEntry, "// requires x>0\n// ensures result>0\nexport const leaf=(x:number)=>x;\n// requires y>0\n// ensures result>0\nexport const caller=(y:number)=>leaf(y);");
  const repairedCold = await verifyFile(repairEntry, { timeoutMs: 20_000, cache: { dir: repairDir } });
  assert.equal(out(repairedCold, "leaf").status, "verified");
  const leafKey = Object.entries(repairedCold.cache.keys).find(([id]) => id.endsWith("#leaf"))[1];
  const leafFile = join(repairDir, leafKey.slice(0, 2), `${leafKey}.json`);
  const leafReceipt = JSON.parse(readFileSync(leafFile, "utf8"));
  leafReceipt.witness = ["0000000000000000"];
  writeFileSync(leafFile, JSON.stringify(leafReceipt));
  const once = await verifyFile(repairEntry, { timeoutMs: 20_000, cache: { dir: repairDir } });
  assert.equal(once.cache.rejected.length, 1);
  assert.equal(once.cache.rejected[0].reason, "replay");
  assert.deepEqual(once.cache.solved.map((id) => id.split("#").at(-1)), ["leaf"]);
  assert.deepEqual(once.cache.written.map((id) => id.split("#").at(-1)), ["leaf"]);
  assert.equal(out(once, "leaf").status, "verified");
  assert.equal(out(once, "caller").status, "verified");
  const warm = await verifyFile(repairEntry, { timeoutMs: 20_000, cache: { dir: repairDir } });
  assert.deepEqual(warm.cache.solved, []);
  assert.equal(warm.cache.hits.length, 2);
  log({ check: "replay-failed-repair-once", rejected: once.cache.rejected[0].reason, solved: once.cache.solved.length, warmHits: warm.cache.hits.length });

  const absent = join(scratch, "absent", "cache");
  for (const mode of ["readonly", "audit"]) {
    const report = await verifyFile(repairEntry, { timeoutMs: 20_000, cache: { dir: absent, mode } });
    assert.equal(existsSync(dirname(absent)), false, mode);
    assert.equal(report.cache.written.length, 0, mode);
  }
  const plan = await affected(repairEntry, { cache: { dir: absent } });
  assert.equal(plan.plan.noSolver, true);
  assert.equal(plan.outcomes.length, 0);
  assert.equal(existsSync(dirname(absent)), false);
  log({ check: "readonly-audit-plan-create-nothing" });

  const residualDir = join(scratch, "residual");
  const residualEntry = join(project, "residual.ts");
  writeFileSync(residualEntry, "// requires real(x)>real(0)\n// ensures true\nexport const undef=(x:number)=>x;\n// requires false\n// ensures true\nexport const vacuous=(x:number)=>x;\n// ensures Object.is(result,x)\nexport const fine=(x:number)=>x;");
  const first = await verifyFile(residualEntry, { timeoutMs: 20_000, cache: { dir: residualDir } });
  assert.equal(out(first, "undef").phase, "requires-definedness");
  assert.equal(out(first, "undef").status, "counterexample");
  assert.equal(out(first, "vacuous").status, "vacuous");
  assert.deepEqual(first.cache.written.map((id) => id.split("#").at(-1)), ["fine"]);
  const second = await verifyFile(residualEntry, { timeoutMs: 20_000, cache: { dir: residualDir } });
  assert.deepEqual(second.cache.hits.map((id) => id.split("#").at(-1)), ["fine"]);
  assert.deepEqual(second.cache.solved.map((id) => id.split("#").at(-1)).sort(), ["undef", "vacuous"]);
  assert.deepEqual(second.cache.written, []);
  log({ check: "definedness-and-vacuous-not-cached", undef: out(first, "undef").status, vacuous: out(first, "vacuous").status, written: first.cache.written.length });

  const trustDir = join(scratch, "trust");
  const trustEntry = join(project, "trust.ts");
  writeFileSync(trustEntry, "// ensures result < 100\nexport const bug=(n:number)=>n*2;");
  const proved = await verify("// ensures true\nconst bug=(n:number)=>n;", { file: trustEntry, timeoutMs: 20_000, cache: { dir: trustDir } });
  assert.equal(proved.outcomes[0].status, "verified");
  writeFileSync(trustEntry, "// ensures result < 100\nexport const bug=(n:number)=>n*2;");
  // Same query is not expected: the ensures text changes the key. Transplant the
  // verified feasibility witness under the new key, the documented trust case.
  const { proofKey } = await import(pathToFileURL(join(ROOT, "verify/cache.mjs")));
  const { runningIdentity } = await import(pathToFileURL(join(ROOT, "verify/manifest.mjs")));
  const freshTarget = compile((await import(pathToFileURL(join(ROOT, "verify/modules.mjs")))).load(trustEntry).records).targets[0];
  const identity = runningIdentity().sha256;
  const key = proofKey(freshTarget, identity);
  const old = Object.values(proved.cache.keys)[0];
  const oldReceipt = JSON.parse(readFileSync(join(trustDir, old.slice(0, 2), `${old}.json`), "utf8"));
  const forged = { ...oldReceipt, key, identity, witness: ["0000000000000000"] };
  mkdirSync(join(trustDir, key.slice(0, 2)), { recursive: true });
  writeFileSync(join(trustDir, key.slice(0, 2), `${key}.json`), JSON.stringify(forged));
  const readonly = await verifyFile(trustEntry, { timeoutMs: 20_000, cache: { dir: trustDir, mode: "readonly" } });
  const audit = await verifyFile(trustEntry, { timeoutMs: 20_000, cache: { dir: trustDir, mode: "audit" } });
  log({
    check: "benign-forgery-trust-control",
    readonly: out(readonly, "bug").status,
    audit: out(audit, "bug").status,
    disagreements: audit.cache.disagreements.map((d) => d.kind),
    auditWritten: audit.cache.written.length,
  });
  assert.equal(out(readonly, "bug").status, "verified");
  assert.equal(out(audit, "bug").status, "counterexample");
  assert.ok(audit.cache.disagreements.some((d) => d.kind === "logical"));
  assert.deepEqual(audit.cache.written, []);

  const bugs = await verifyFile(join(ROOT, "verify/examples/bugs.ts"), { timeoutMs: 20_000, evidence: true });
  assert.equal(bugs.outcomes.length, 3);
  assert.ok(bugs.outcomes.every((o) => o.status === "counterexample" && o.confirmed));
  const replayed = reproduce(join(ROOT, "verify/examples/bugs.ts"), JSON.parse(JSON.stringify(bugs.evidence)));
  assert.equal(replayed.status, "reproduced");
  assert.equal(replayed.outcomes.length, 3);
  log({ check: "bugs-reproduced", names: bugs.outcomes.map((o) => [o.fn, o.inputs]) });
  console.log(JSON.stringify({ ok: true }));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
