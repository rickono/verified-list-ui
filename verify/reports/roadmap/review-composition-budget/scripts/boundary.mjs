import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { verify, verifyFile, reproduce } from "../../../../index.mjs";
import { runningIdentity } from "../../../../manifest.mjs";
import { compile } from "../../../../source.mjs";
import { load } from "../../../../modules.mjs";
import { obligation, phases } from "../../../../proofs.mjs";

const root = resolve(import.meta.dirname, "../../../../../");
const evidence = resolve(import.meta.dirname, "../../composition-budget");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const smt = (query) => `${query.declarations}\n${query.assertions.map((a) => `(assert ${a})`).join("\n")}\n(check-sat)\n`;
const read = (file) => JSON.parse(readFileSync(file, "utf8"));

const source = "// ensures result\nexport const ok = () => true;";
const rejected = [];
for (const timeoutMs of [0, -1, NaN, Infinity, -Infinity, 1.5, 180_001, "180000", null]) {
  for (const request of [() => verify(source, { timeoutMs }), () => verifyFile("/missing-budget-fixture.mjs", { timeoutMs })]) {
    await assert.rejects(request, { name: "TypeError", message: "Expected a timeoutMs integer between 1 and 180000." });
    rejected.push(timeoutMs);
  }
}

const cli = resolve(root, "verify/bin/jsverify.mjs");
const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
assert.equal(help.status, 0);
assert.match(help.stdout, /--timeout accepts integers from 1 to 180000 ms \(default 10000\), shared by all solver targets and phases/);
const invalid = spawnSync(process.execPath, [cli, "--timeout", "180001", "/missing-budget-fixture.mjs"], { encoding: "utf8" });
assert.equal(invalid.status, 2, invalid.stderr);
assert.match(invalid.stderr, /Expected a timeoutMs integer between 1 and 180000\./);
const fractional = spawnSync(process.execPath, [cli, "--timeout", "1.5", "/missing-budget-fixture.mjs"], { encoding: "utf8" });
assert.equal(fractional.status, 2);
assert.match(fractional.stderr, /Expected a timeoutMs integer between 1 and 180000\./);

const identity = runningIdentity();
assert.equal(identity.disabled, undefined);
assert.equal(identity.sha256, "09d21829d8ea449858782577b32ed5531b112b3fa2b9cfbe06ced64f767b28ef");

const artifactPath = resolve(root, "verify/reports/roadmap/library-campaigns/evidence/03-final/harmonic/positive.evidence.json");
const artifact = read(artifactPath);
assert.equal(artifact.identity, "13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106");
const refusal = reproduce("verify/examples/simple-statistics/harmonic-positive.js", artifact);
assert.equal(refusal.status, "invalid-evidence");
assert.match(refusal.message, /model\/backend identity changed/);

const entry = resolve(root, "verify/reports/roadmap/library-composition/fixtures/gpl-3.0/caller.js");
const snapshot = load(entry);
const { targets } = compile(snapshot.records);
const current = read(resolve(evidence, "queries.json"));
const parent = read(resolve(evidence, "parent-queries.json"));
const allPhases = [];
const posts = [];
for (const target of targets) {
  for (const [phase, index] of phases(target)) {
    const query = obligation(target, phase, index);
    allPhases.push({ fn: target.name, phase, index, domain: query.domain, sha256: sha(smt(query)),
      models: query.models, replayGuards: query.replayGuards });
  }
  for (let index = 0; index < target.postconditions.length; index++) {
    const name = `${target.name}.${index + 1}.smt2`;
    const historical = readFileSync(resolve(root, "verify/reports/roadmap/library-composition/logs/second-obligations", name));
    const bytes = Buffer.from(smt(obligation(target, "postcondition", index)));
    posts.push({ name, equal: bytes.equals(historical), sha256: sha(bytes) });
  }
}
assert.equal(posts.length, 15);
assert.ok(posts.every((row) => row.equal));
assert.deepEqual(allPhases, current.allPhases);
assert.deepEqual(allPhases, parent.allPhases);
assert.equal(allPhases.length, 36);

const log = {
  rejectedCount: rejected.length,
  helpStatus: help.status,
  invalidCli: { status: invalid.status, stderr: invalid.stderr.trim() },
  identity: identity.sha256,
  runtime: identity.runtime,
  refusal,
  posts: posts.length,
  phases: allPhases.length,
  postSha256: posts.map((row) => row.sha256),
};
writeFileSync(new URL("../logs/boundary.json", import.meta.url), JSON.stringify(log, null, 2) + "\n");
console.log(JSON.stringify({ status: "PASS", identity: identity.sha256, refusal: refusal.status, posts: posts.length, phases: allPhases.length }));
