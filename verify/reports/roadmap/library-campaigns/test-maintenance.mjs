#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bindModel, freeze } from "./campaign-inputs.mjs";

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, "../../../..");
const prefix = "verify/reports/roadmap/library-campaigns";
const out = resolve(process.argv[2]);
assert.ok(!existsSync(out), "Keep earlier test evidence. Use a new output directory.");
mkdirSync(out, { recursive: true });
const sha = (data) => createHash("sha256").update(data).digest("hex");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const save = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + "\n");
const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
const checks = [], commands = [];
const before = freeze(root);
save("freeze.before.json", before);
const fixture = mkdtempSync(join(here, ".maintenance-test-"));
const fixturePackage = join(fixture, prefix), bin = join(fixture, "bin");
const marker = join(fixture, "semantic-imported"), laneMarker = join(fixture, "lane-launched");
mkdirSync(fixturePackage, { recursive: true }); mkdirSync(bin);
copyFileSync(join(here, "git-no-private-history.mjs"), join(bin, "git")); chmodSync(join(bin, "git"), 0o755);
// A failed gate must never start the lane, even when a regression accidentally permits it.
writeFileSync(join(bin, "python3"), `#!/bin/sh\nprintf 'unexpected lane launch' > '${laneMarker}'\nexit 97\n`);
chmodSync(join(bin, "python3"), 0o755);
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CAMPAIGN_REAL_GIT: realGit, CAMPAIGN_GIT_CWD: root };
const inputs = json(join(here, "inputs.json"));
const fixed = Object.assign({}, ...Object.values(inputs.immutable));
const copy = (p) => { mkdirSync(dirname(join(fixture, p)), { recursive: true }); copyFileSync(join(root, p), join(fixture, p)); };
for (const p of [...Object.keys(fixed), `${prefix}/inputs.json`, `${prefix}/check.mjs`, `${prefix}/campaign-inputs.mjs`]) copy(p);
writeFileSync(join(fixture, "verify/manifest.mjs"), `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'imported'); throw Error('semantic import trap');\n`);

function run(name, argv, cwd = fixture, environment = env) {
  const startedAt = new Date().toISOString();
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env: environment, encoding: "utf8", timeout: 20000, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(join(out, `${name}.stdout.txt`), r.stdout ?? "");
  writeFileSync(join(out, `${name}.stderr.txt`), r.stderr ?? "");
  let alive = false;
  if (r.pid) { try { process.kill(r.pid, 0); alive = true; } catch (e) { if (e.code !== "ESRCH") throw e; } }
  commands.push({ name, argv, cwd, gitForwardedTo: root, startedAt, finishedAt: new Date().toISOString(),
    pid: r.pid, status: r.status, signal: r.signal, error: r.error?.message,
    stdoutSha256: sha(r.stdout ?? ""), stderrSha256: sha(r.stderr ?? ""), aliveAfterWait: alive });
  save("commands.json", commands);
  assert.equal(alive, false); assert.equal(r.error, undefined);
  return r;
}
const cli = (name, ...args) => run(name, [process.execPath, join(fixturePackage, "check.mjs"), ...args]);
const unimported = () => { assert.equal(existsSync(marker), false); assert.equal(existsSync(laneMarker), false); };
async function test(name, fn) {
  try { const detail = await fn(); checks.push({ name, status: "PASS", detail }); console.log(`PASS ${name}`); }
  catch (e) { checks.push({ name, status: "ISSUES", message: e.message, stack: e.stack }); throw e; }
  finally { save("checks.json", checks); }
}

try {
  await test("precise-object-availability", () => {
    const normal = run("git-normal", ["git", "rev-parse", "HEAD"]);
    assert.equal(normal.status, 0); assert.equal(normal.stdout.trim(), before.head);
    const old = run("git-old-object", ["git", "show", "a83f50762005ae47edfe3e07295f3840b485687b:unneeded"]);
    assert.equal(old.status, 128); assert.match(old.stderr, /fixture: historical object unavailable/);
    return "Normal git forwards to the prepared repository; only old-object access is refused.";
  });
  await test("no-private-history-or-semantic-import", () => {
    const r = cli("inputs-only", "--inputs-only");
    assert.equal(r.status, 0, r.stderr); unimported();
    const result = JSON.parse(r.stdout);
    assert.deepEqual(result.history, { requested: false, checked: false });
    assert.equal(result.documentation.freshDownload, false);
    assert.equal(result.documentation.checkedDocumentBytesThisRun, false);
    return result.documentation;
  });
  await test("history-is-explicit-and-fails-when-absent", () => {
    const r = cli("optional-history", "--inputs-only", "--check-history");
    assert.equal(r.status, 1); assert.match(r.stderr, /fixture: historical object unavailable/); unimported();
  });
  for (const [name, path] of [
    ["library-source", `${prefix}/pins/d3-array/nice.js`],
    ["provenance", `${prefix}/provenance.json`],
    ["license", `${prefix}/pins/d3-array/LICENSE`],
    ["adapter", "verify/examples/simple-statistics/check-harmonic.mjs"],
    ["application-contract", "verify/examples/simple-statistics/harmonic-positive.js"],
    ["inherited-attestation", "verify/reports/roadmap/review-library-campaigns/report.md"],
  ]) await test(`reject-${name}-drift-before-import`, () => {
    const file = join(fixture, path), original = readFileSync(file), changed = Buffer.concat([original, Buffer.from("\n// drift control\n")]);
    try {
      writeFileSync(file, changed); assert.notEqual(sha(readFileSync(file)), sha(original));
      const r = cli(`drift-${name}`, join(fixture, `refused-${name}`));
      assert.equal(r.status, 1); assert.ok(r.stderr.includes(`Source/provenance drift: ${path}`), r.stderr); unimported();
      return { path, originalSha256: sha(original), changedSha256: sha(changed), suffix: "\n// drift control\n", observed: "default launcher refused before semantic import or lane launch" };
    } finally { writeFileSync(file, original); }
  });
  await test("refuse-existing-artifacts", () => {
    const r = cli("existing-output", fixturePackage);
    assert.equal(r.status, 1); assert.match(r.stderr, /Use a new output directory/); unimported();
  });
  await test("reject-ambiguous-legacy-inputs", () => {
    const path = join(fixturePackage, "inputs.json"), original = readFileSync(path);
    try {
      writeFileSync(path, JSON.stringify({ ...inputs, files: {} }));
      const r = cli("legacy-inputs", "--inputs-only"); assert.equal(r.status, 1); unimported();
    } finally { writeFileSync(path, original); }
  });
  await test("current-start-snapshot-and-changed-model", async () => {
    const [{ runningIdentity, trustedIdentity }, { reproduce }] = await Promise.all([import("../../../manifest.mjs"), import("../../../index.mjs")]);
    const current = runningIdentity(); assert.equal(current.disabled, undefined);
    const historical = json(join(here, "evidence/03-final/harmonic/positive.evidence.json"));
    assert.notEqual(historical.identity, current.sha256);
    const refused = reproduce(join(root, "verify/examples/simple-statistics/harmonic-positive.js"), historical);
    save("historical-model-refused.json", refused);
    assert.equal(refused.status, "invalid-evidence"); assert.match(refused.message, /model\/backend identity changed/);
    // Ordinary copies, not a git clone or worktree. Only the fixture's verifier changes.
    for (const path of new Set([...Object.keys(before.trackedFiles), ...Object.keys(before.currentRuntime), ...Object.keys(before.checker)])) copy(path);
    symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"));
    const same = trustedIdentity(join(fixture, "verify")); assert.equal(same.sha256, current.sha256);
    const path = join(fixture, "verify/index.mjs"), original = readFileSync(path);
    writeFileSync(path, Buffer.concat([original, Buffer.from("\n// model drift control\n")]));
    const changed = trustedIdentity(join(fixture, "verify"));
    assert.equal(changed.disabled, undefined); assert.notEqual(changed.sha256, current.sha256);
    assert.throws(() => bindModel(before, changed), /Model is outside the frozen runtime: index.mjs/);
    const previousEnv = { PATH: process.env.PATH, CAMPAIGN_REAL_GIT: process.env.CAMPAIGN_REAL_GIT, CAMPAIGN_GIT_CWD: process.env.CAMPAIGN_GIT_CWD };
    let fresh;
    try {
      for (const key of Object.keys(previousEnv)) process.env[key] = env[key];
      fresh = freeze(fixture);
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
    assert.equal(fresh.head, before.head); assert.equal(fresh.headTree, before.headTree);
    assert.equal(fresh.currentRuntime["verify/index.mjs"], sha(readFileSync(path)));
    assert.notEqual(fresh.snapshotSha256, before.snapshotSha256);
    const bound = bindModel(fresh, changed); assert.equal(bound.inputSnapshotSha256, fresh.snapshotSha256);
    const clean = bindModel(before, current); assert.equal(clean.codeHead, before.head);
    assert.equal(clean.codeTree, before.headTree);
    return { currentIdentity: current.sha256, historicalIdentity: historical.identity, changedFixtureIdentity: changed.sha256,
      actualStartHead: before.head, actualStartTree: before.headTree, trackedFileCount: Object.keys(before.trackedFiles).length,
      fixtureIndexBefore: sha(original), fixtureIndexAfter: sha(readFileSync(path)), historicalReplay: refused.status,
      freshArtifactRequired: "Changed model cannot bind the previous snapshot; historical proof/witness artifacts are not admitted. A full fresh campaign is a separate required check." };
  });
} catch (e) { console.error(e.stack); process.exitCode = 1; }
finally {
  rmSync(fixture, { recursive: true, force: true });
  const after = freeze(root);
  save("freeze.after.json", after);
  assert.deepEqual(after, before, "The real source/tree must stay unchanged during focused controls.");
  save("result.json", { status: checks.length === 12 && checks.every((c) => c.status === "PASS") ? "PASS" : "ISSUES",
    codeHead: before.head, codeTree: before.headTree, inputSnapshotSha256: before.snapshotSha256,
    checker: before.checker, node: before.node, checks,
    realSnapshotUnchanged: after.snapshotSha256 === before.snapshotSha256, fixtureRemoved: !existsSync(fixture),
    semanticImportAndLaneTraps: "No fixed-input control reached either trap; model control separately imports the real API without solving.",
    allSpawnedProcessesWaited: commands.every((c) => !c.aliveAfterWait && !c.signal), noRawSourceMutation: true });
}
