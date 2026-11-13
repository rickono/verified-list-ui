import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const cli = new URL("../../verify/bin/jsverify.mjs", import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
test("CLI cold/warm/audit, plan/selection and native evidence reproduction use real source", (t) => {
  const root = mkdtempSync(join(tmpdir(), "jsverify-cli-p-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const entry = join(root, "entry.ts"), dir = join(root, "cache"), artifact = join(root, "bugs.json");
  writeFileSync(entry, `// ensures Object.is(result,x)
export const id=(x:number)=>x;
// ensures Object.is(result,y)
export const caller=(y:number)=>id(y);`);
  const cold = run("--json", "--cache", dir, "--target", "caller", entry); assert.equal(cold.status, 0, cold.stderr);
  const c = JSON.parse(cold.stdout)[0]; assert.equal(c.cache.solved.length, 2);
  const warm = run("--cache", dir, entry); assert.equal(warm.status, 0, warm.stderr); assert.match(warm.stdout, /2 provisional hits, 0 solved/); assert.match(warm.stdout, /Readonly does not authenticate/);
  const audit = run("--json", "--cache", dir, "--cache-mode", "audit", entry); assert.equal(audit.status, 0, audit.stderr); assert.equal(JSON.parse(audit.stdout)[0].cache.solved.length, 2);
  const absent = join(root, "absent", "cache"); const plan = run("--json", "--plan", "--cache", absent, entry);
  assert.equal(plan.status, 0, plan.stderr); assert.equal(existsSync(join(root, "absent")), false); assert.equal(JSON.parse(plan.stdout)[0].plan.noSolver, true);
  const ro = run("--json", "--cache", absent, "--cache-mode", "readonly", entry); assert.equal(ro.status, 0, ro.stderr); assert.equal(existsSync(absent), false);
  writeFileSync(entry, "// requires n>=0\n// ensures result<100\nexport const bug=(n:number)=>n*2;");
  const bug = run("--json", "--evidence", artifact, entry); assert.equal(bug.status, 1, bug.stderr);
  assert.equal(JSON.parse(bug.stdout)[0].outcomes[0].confirmed, true);
  const replay = run("reproduce", "--json", artifact); assert.equal(replay.status, 0, replay.stderr); assert.equal(JSON.parse(replay.stdout).outcomes[0].inputs.n, "50");
  assert.equal(run("replay", artifact).status, 0);
  writeFileSync(entry, readFileSync(entry, "utf8") + "\n// changed"); assert.equal(run("reproduce", artifact).status, 1);
  const invalid = run("--target", "absent", entry); assert.equal(invalid.status, 2); assert.match(invalid.stderr, /Unknown proof target/);
  for (const args of [["--cache"], ["--target"], ["--evidence"], ["--cache-mode", "audit", entry], ["--plan", "--evidence", artifact, entry]]) assert.equal(run(...args).status, 2, args.join(" "));
});
