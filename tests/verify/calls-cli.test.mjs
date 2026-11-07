import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const cli = fileURLToPath(new URL("../../verify/bin/jsverify.mjs", import.meta.url));

test("the CLI explains call failures and weak-contract proof gaps", async () => {
  const directory = await mkdtemp(join(tmpdir(), "verify-calls-"));
  try {
    const file = join(directory, "calls.ts");
    await writeFile(file, `// requires x > 0
// ensures result > 0
const positive = (x: number) => x;
// ensures true
const badCall = () => positive(0);
// ensures true
const weak = (flag: boolean) => flag;
// ensures result === flag
const gap = (flag: boolean) => weak(flag);`);
    const proc = spawnSync(process.execPath, [cli, file], { encoding: "utf8", timeout: 10_000 });
    assert.equal(proc.error, undefined);
    assert.equal(proc.status, 1, proc.stderr);
    assert.match(proc.stdout, /call: positive\(x = 0\) \(replayed in JavaScript\)/);
    assert.match(proc.stdout, /failed call requires: x > 0/);
    assert.match(proc.stdout, /reason: contract-gap/);
    assert.doesNotMatch(proc.stdout, /returned: undefined/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("replay timeouts block callers transitively after their raw proofs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "verify-replay-"));
  try {
    let predicate = "true";
    for (let i = 5; i >= 0; i--) predicate = `xs.every((value${i}) => ${predicate})`;
    const file = join(directory, "budget.ts");
    await writeFile(file, `// requires xs.length === 256
// requires ${predicate}
// ensures result
const expensive = (xs: boolean[]) => true;
// ensures result === false
const skipped = () => false && expensive([]);
// ensures result === false
const outer = () => skipped();
// ensures result
const unrelated = () => true;`);
    const proc = spawnSync(process.execPath, [cli, "--json", file], { encoding: "utf8", timeout: 10_000 });
    assert.equal(proc.error, undefined, "The verifier must finish even when a contract is too expensive to replay.");
    assert.equal(proc.status, 1, proc.stderr);
    const outcomes = Object.fromEntries(JSON.parse(proc.stdout)[0].outcomes.map((o) => [o.fn, o]));
    assert.equal(outcomes.expensive.status, "unknown");
    assert.equal(outcomes.expensive.reason, "replay-timeout");
    assert.equal(outcomes.skipped.status, "unknown");
    assert.equal(outcomes.skipped.reason, "dependency");
    assert.equal(outcomes.outer.status, "unknown");
    assert.equal(outcomes.outer.reason, "dependency");
    assert.equal(outcomes.unrelated.status, "verified");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
