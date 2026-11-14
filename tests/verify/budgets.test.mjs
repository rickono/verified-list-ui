import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { verify, verifyFile } from "../../verify/index.mjs";

const source = "// ensures result\nexport const ok = () => true;";
const cli = new URL("../../verify/bin/jsverify.mjs", import.meta.url).pathname;
const fixture = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "verify-budget-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const entry = join(dir, "entry.mjs");
  writeFileSync(entry, source);
  return entry;
};

test("public APIs accept a caller-requested 180000 ms budget and replay a real proof", async (t) => {
  const entry = fixture(t);
  for (const report of [await verify(source, { timeoutMs: 180_000 }), await verifyFile(entry, { timeoutMs: 180_000 })]) {
    assert.equal(report.outcomes.length, 1);
    assert.equal(report.outcomes[0].status, "verified", JSON.stringify(report));
  }
});

test("public APIs reject invalid budgets before reading a file or solving", async () => {
  for (const timeoutMs of [0, -1, NaN, Infinity, -Infinity, 1.5, 180_001, "180000", null]) {
    for (const request of [() => verify(source, { timeoutMs }), () => verifyFile("/missing-budget-fixture.mjs", { timeoutMs })]) {
      await assert.rejects(request, { name: "TypeError", message: "Expected a timeoutMs integer between 1 and 180000." });
    }
  }
});

test("default verification works and a one millisecond request stays contained", async (t) => {
  assert.equal((await verify(source)).outcomes[0].status, "verified");
  const entry = fixture(t);
  for (const report of [await verify(source, { timeoutMs: 1 }), await verifyFile(entry, { timeoutMs: 1 })]) {
    assert.equal(report.outcomes[0].status, "unknown", JSON.stringify(report));
    assert.equal(report.outcomes[0].reason, "request-timeout");
  }
});

test("CLI --timeout accepts 180000 and rejects the same invalid numeric budgets", (t) => {
  const entry = fixture(t);
  const run = (budget) => spawnSync(process.execPath, [cli, "--json", "--timeout", budget, entry], { encoding: "utf8", timeout: 15_000 });
  const accepted = run("180000");
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout)[0].outcomes[0].status, "verified");
  for (const budget of ["0", "-1", "NaN", "Infinity", "-Infinity", "1.5", "180001"]) {
    const result = run(budget);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Expected a timeoutMs integer between 1 and 180000\./);
  }
  const short = run("1");
  assert.equal(short.status, 1, short.stderr);
  assert.equal(JSON.parse(short.stdout)[0].outcomes[0].reason, "request-timeout");
});
