import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = "/tmp/review-p-c9c4511";
const REPO = "/Users/rick/.t3/worktrees/verified-list-ui/t3-53a73242";
const { verifyFile, reproduce } = await import(pathToFileURL(join(ROOT, "verify/index.mjs")));
const log = (row) => console.log(JSON.stringify(row));
const scratch = mkdtempSync(join(tmpdir(), "review-p-gate-"));
try {
  const entry = join(scratch, "entry.ts");
  const source = `// requires x>1
// ensures result>1
const broken=(x:number)=>x;
// requires y>1
// ensures result>1
const middle=(y:number)=>broken(y);
// requires z>1
// ensures result>1
const outer=(z:number)=>middle(z);`;
  writeFileSync(entry, source);
  const dir = join(scratch, "cache");
  const cold = await verifyFile(entry, { timeoutMs: 20_000, cache: { dir } });
  assert.ok(cold.outcomes.every((o) => o.status === "verified"));
  writeFileSync(entry, source.replace("=>x;", "=>x-1;"));
  const changed = await verifyFile(entry, { timeoutMs: 20_000, plan: true, cache: { dir } });
  const byName = new Map(changed.plan.targets.map((t) => [t.target.split("#").at(-1), t]));
  assert.equal(byName.get("broken").needsSolve, true);
  assert.equal(byName.get("middle").needsSolve, false);
  assert.equal(byName.get("outer").needsSolve, false);
  const four = Buffer.alloc(8); four.writeDoubleBE(4);
  for (const name of ["middle", "outer"]) {
    const key = byName.get(name).key;
    const file = join(dir, key.slice(0, 2), `${key}.json`);
    const entryJson = JSON.parse(readFileSync(file, "utf8"));
    entryJson.witness = [four.toString("hex")];
    writeFileSync(file, JSON.stringify(entryJson));
  }
  const gated = await verifyFile(entry, { timeoutMs: 20_000, cache: { dir } });
  const out = (fn) => gated.outcomes.find((o) => o.fn === fn);
  assert.equal(out("broken").status, "counterexample");
  assert.equal(out("middle").status, "unknown");
  assert.equal(out("middle").reason, "dependency");
  assert.equal(out("outer").status, "unknown");
  assert.equal(out("outer").reason, "dependency");
  assert.deepEqual(gated.cache.hits.map((id) => id.split("#").at(-1)).sort(), ["middle", "outer"]);
  assert.deepEqual(gated.cache.solved.map((id) => id.split("#").at(-1)), ["broken"]);
  assert.deepEqual(gated.cache.written, []);
  log({
    check: "transitive-replay-pass-still-gated",
    outcomes: gated.outcomes.map((o) => [o.fn, o.status, o.reason ?? null]),
    hits: gated.cache.hits.map((id) => id.split("#").at(-1)),
    solved: gated.cache.solved.map((id) => id.split("#").at(-1)),
  });

  const evidence = JSON.parse(execFileSync("git", ["show", "98c06aab10e9f68a707db06449bb79cbf8629537:verify/reports/roadmap/P-evidence/bugs.json"], { cwd: REPO, encoding: "utf8" }));
  const artifact = reproduce(join(ROOT, "verify/examples/bugs.ts"), evidence);
  assert.equal(artifact.status, "reproduced");
  assert.equal(artifact.outcomes.length, 3);
  assert.ok(artifact.outcomes.every((o) => o.reproduced === true));
  log({ check: "saved-artifact-reproduced", targets: artifact.outcomes.map((o) => [o.target.split("#").at(-1), o.inputs, o.reproduced]) });
  console.log(JSON.stringify({ ok: true }));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
