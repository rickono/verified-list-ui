#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyFile, reproduce } from "../../../index.mjs";
import { runningIdentity } from "../../../manifest.mjs";
import { compile } from "../../../source.mjs";
import { load } from "../../../modules.mjs";
import { obligation, phases } from "../../../proofs.mjs";
import { pinnedFixtures } from "../library-composition/fixture.mjs";
import { nativeComparisons } from "../library-composition/native.mjs";
import { checkHarmonic } from "../../../examples/simple-statistics/check-harmonic.mjs";
import { observe, sha, smt } from "./observe.mjs";

const here = fileURLToPath(new URL(".", import.meta.url)), root = resolve(here, "../../../..");
const entry = resolve(here, "../library-composition/fixtures/gpl-3.0/caller.js");
const head = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const save = (name, value) => writeFileSync(join(here, name), JSON.stringify(value, null, 2) + "\n");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const scratchBase = join(here, ".scratch");
const identity = runningIdentity();
assert.equal(identity.disabled, undefined);

async function inspect() {
  const { pins } = await pinnedFixtures();
  const snapshot = load(entry), { targets } = compile(snapshot.records);
  const rows = [], allPhases = [];
  for (const target of targets) {
    for (const [phase, index] of phases(target)) {
      const query = obligation(target, phase, index);
      allPhases.push({ fn: target.name, phase, index, domain: query.domain, sha256: sha(smt(query)),
        models: query.models, replayGuards: query.replayGuards });
    }
    for (let index = 0; index < target.postconditions.length; index++) {
      const name = `${target.name}.${index + 1}.smt2`, query = smt(obligation(target, "postcondition", index));
      const historical = readFileSync(resolve(here, "../library-composition/logs/second-obligations", name));
      const current = Buffer.from(query);
      rows.push({ name, kind: target.obligations[index].kind, bytes: current.length, equal: current.equals(historical),
        historicalSha256: sha(historical), currentSha256: sha(current) });
    }
  }
  save("queries.json", { head: head(), identity: identity.sha256, queries: rows.length, allIdentical: rows.every((r) => r.equal), rows, allPhases });
  save("inputs.json", { head: head(), identity, pins, sources: snapshot.files, dependencies: snapshot.dependencies,
    commands: { inspect: process.argv, cwd: process.cwd() } });
  assert.equal(rows.length, 15); assert.ok(rows.every((r) => r.equal));
  console.log(JSON.stringify({ queries: rows.length, allIdentical: true, identity: identity.sha256 }));
}

const summary = (report) => report.outcomes.map(({ fn, status, reason, obligation, phase, attempts, solverReason }) =>
  ({ fn, status, reason, obligation, phase, attempts, solverReason }));
const verified = (report) => report.outcomes.length === 3 && report.outcomes.every((o) => o.status === "verified");
const cacheFiles = (dir) => {
  const rows = [];
  const visit = (path) => { for (const e of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, e.name); if (e.isDirectory()) visit(file);
    else rows.push({ file: relative(dir, file), sha256: sha(readFileSync(file)) });
  } };
  visit(dir); return rows.sort((a, b) => a.file.localeCompare(b.file));
};

async function graph(scratch) {
  await inspect();
  mkdirSync(scratchBase, { recursive: true });
  const work = mkdtempSync(join(scratchBase, scratch ? "admission-" : "production-"));
  const label = scratch ? "scratch" : "production", receipts = [];
  let api = { verifyFile }, getIdentity = runningIdentity, trace;
  try {
    if (scratch) {
      const privateVerify = join(work, "verify");
      for (const [name] of identity.files) {
        mkdirSync(dirname(join(privateVerify, name)), { recursive: true });
        copyFileSync(join(root, "verify", name), join(privateVerify, name));
      }
      const file = join(privateVerify, "index.mjs"), before = readFileSync(file, "utf8");
      const from = 'timeoutMs > 60_000) throw new TypeError("Expected a timeoutMs integer between 1 and 60000.")';
      const to = 'timeoutMs > 180_000) throw new TypeError("Expected a timeoutMs integer between 1 and 180000.")';
      assert.equal(before.split(from).length, 2);
      writeFileSync(file, before.replace(from, to));
      api = await import(pathToFileURL(file));
      ({ runningIdentity: getIdentity } = await import(pathToFileURL(join(privateVerify, "manifest.mjs"))));
      const privateIdentity = getIdentity();
      assert.equal(privateIdentity.disabled, undefined);
      const changed = identity.files.filter(([name, digest]) => sha(readFileSync(join(privateVerify, name))) !== digest).map(([name]) => name);
      assert.deepEqual(changed, ["index.mjs"]);
      save("scratch-change.json", { parent: head(), changed, beforeSha256: sha(before), afterSha256: sha(readFileSync(file)), from, to,
        privateIdentity, diagnosticObserverSha256: sha(readFileSync(join(here, "observe.mjs"))) });
      trace = observe();
    }
    const model = getIdentity();
    const options = { timeoutMs: 180_000, targets: ["reverseFirstTwo"], cache: { dir: join(work, "cache") } };
    const request = async (name, opts) => {
      const started = performance.now(), report = await api.verifyFile(entry, opts), elapsedMs = performance.now() - started;
      save(`${label}-${name}.json`, report);
      receipts.push({ name, requestBudgetMs: opts.timeoutMs, elapsedMs, outcomes: summary(report),
        hits: report.cache.hits.length, solved: report.cache.solved.length, written: report.cache.written.length,
        disagreements: report.cache.disagreements });
      console.log(JSON.stringify(receipts.at(-1)));
      assert.deepEqual(getIdentity(), model, "freeze trusted sources throughout the run");
      return report;
    };
    const cold = await request("cold", options);
    const receiptCopies = [];
    for (const row of cacheFiles(options.cache.dir)) {
      const data = read(join(options.cache.dir, row.file)); receiptCopies.push({ ...row, data });
    }
    save(`${label}-proof-receipts.json`, receiptCopies);
    if (!scratch && verified(cold)) {
      const warm = await request("warm", options);
      assert.deepEqual(warm.outcomes, cold.outcomes); assert.equal(warm.cache.hits.length, 3); assert.equal(warm.cache.solved.length, 0);
      const beforeAudit = cacheFiles(options.cache.dir);
      const audit = await request("audit", { ...options, cache: { ...options.cache, mode: "audit" } });
      assert.deepEqual(cacheFiles(options.cache.dir), beforeAudit, "audit must not write receipts");
      assert.equal(audit.cache.solved.length, 3); assert.equal(audit.cache.written.length, 0);
    }
    if (trace) {
      trace.stop(); save("scratch-ipc.json", trace.events);
      const inventory = read(join(here, "queries.json"));
      for (const event of trace.events.filter((e) => e.event === "query" && e.phase === "postcondition" && e.domain === "full")) {
        const expected = inventory.rows.find((q) => q.name === `${event.target.split("#").at(-1)}.${event.postcondition}.smt2`);
        assert.equal(event.querySha256, expected.currentSha256);
      }
      const spawned = trace.events.filter((e) => e.event === "spawn"), closed = trace.events.filter((e) => e.event === "close");
      assert.equal(closed.length, spawned.length, "all observed workers must be reaped");
    }
    const native = await nativeComparisons(entry);
    save(`${label}-native.json`, native); assert.equal(native.failures, 0); assert.equal(native.count, 179);
    assert.ok(native.checks.every((r) => r.inputFullyReversed && r.resultFresh && r.inputLengthPreserved && r.noExtraInputProperties));
    const status = receipts.every((r) => r.outcomes.every((o) => o.status === "verified")) ? "PASS" : "ISSUES";
    save(`${label}-receipt.json`, { status, head: head(), identity: model, requestBudgetMs: 180_000, receipts,
      nativeCount: native.count, nativeFailures: native.failures,
      scope: "Unchanged full-domain three-target graph through verifyFile; replay and final dependency gating retained. Resource observations, no speedup or repeatability claim." });
    if (status !== "PASS") process.exitCode = 1;
  } finally {
    trace?.stop();
    if (trace) save("scratch-ipc.json", trace.events);
    rmSync(work, { recursive: true, force: true });
    rmSync(scratchBase, { recursive: true, force: true });
  }
}

async function harmonic() {
  const file = join(root, "verify/examples/simple-statistics/harmonic-positive.js");
  const old = read(resolve(here, "../throws-evidence/campaign-final/positive.evidence.json"));
  const rejected = reproduce(file, old);
  save("harmonic-old-invalid.json", rejected);
  assert.equal(rejected.status, "invalid-evidence"); assert.match(rejected.message, /model\/backend identity changed/);
  const result = await checkHarmonic({ outputDir: join(here, "harmonic") });
  save("harmonic-receipt.json", result); assert.equal(result.status, "PASS");
  console.log(JSON.stringify(result));
}

try {
  if (process.argv[2] === "inspect") await inspect();
  else if (process.argv[2] === "scratch") await graph(true);
  else if (process.argv[2] === "production") await graph(false);
  else if (process.argv[2] === "harmonic") await harmonic();
  else throw new Error("Expected inspect, scratch, production, or harmonic.");
} catch (error) { console.error(error.stack); process.exitCode = 1; }
