// Authored report campaign. Verdicts come only from the public verifyFile API.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, readdir, rm, copyFile, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import { performance } from "node:perf_hooks";
import { verifyFile, affected, reproduce } from "../../../index.mjs";
import { load, graphDigest } from "../../../modules.mjs";
import { runningIdentity } from "../../../manifest.mjs";
import { here, hash, tokens, pinnedFixtures, CONTENT } from "./fixture.mjs";
import { nativeComparisons } from "./native.mjs";

const BUDGET = 60_000; // One deadline for the whole graph, not each obligation.
const root = here("./fixtures/gpl-3.0/"), entry = root + "caller.js";
const work = here("./.work/"), cacheDir = work + "cache";
const names = (ids) => ids.map((id) => id.split("#").at(-1)).sort();
const all = ["Reverse", "reverseFirstTwo", "takeImplementation"].sort();
const out = (r, name) => r.outcomes.find((o) => o.fn === name);
const key = (r, name) => Object.entries(r.cache.keys).find(([id]) => id.endsWith("#" + name))?.[1];
const json = (v) => JSON.stringify(v, null, 2) + "\n";
const git = (...args) => execFileSync("git", args, { cwd: here("../../../.."), encoding: "utf8" }).trim();
const edit = (s, before, after) => {
  assert.equal(s.split(before).length, 2, `Exactly one edit site: ${before}`);
  return s.replace(before, after);
};
async function cacheFiles(directory = cacheDir) {
  const files = {};
  async function visit(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (e) { if (e.code === "ENOENT") return; throw e; }
    for (const item of entries) {
      const path = dir + "/" + item.name;
      if (item.isDirectory()) await visit(path);
      else files[relative(directory, path)] = hash(await readFile(path));
    }
  }
  await visit(directory);
  return Object.fromEntries(Object.entries(files).sort());
}
function verified(report) {
  assert.deepEqual(names(report.outcomes.map((o) => `${o.file}#${o.fn}`)), all);
  for (const o of report.outcomes) assert.equal(o.status, "verified", JSON.stringify(o));
}
function sameAssumptions(report, cold) {
  for (const name of all) {
    const assumptions = (r) => out(r, name).assumptions.map(({ file, span, ...a }) => a);
    assert.deepEqual(assumptions(report), assumptions(cold), `Same types/requires: ${name}`);
  }
}

export async function campaign() {
  const flags = process.argv.slice(2);
  assert.ok(flags.length <= 1 && flags.every((s) => ["--resume-second", "--continue-controls"].includes(s)));
  const continuing = flags.includes("--continue-controls"), resuming = flags.length === 1;
  const previous = here("./logs/campaign/run-cC4nIK/");
  const { sources, pins } = await pinnedFixtures();
  assert.deepEqual(JSON.parse(await readFile(here("./provenance.json"), "utf8")), pins);
  git("merge-base", "--is-ancestor", "32bd5b260aa116ca88642a1479bed8d3fc447f4b", "HEAD");
  assert.match(await readFile(here("../../../source.mjs"), "utf8"), /A function needs at least one ensures contract/);
  assert.match(await readFile(here("../../../source.mjs"), "utf8"), /if \(!spec\) fail\("This compiler entry does not support loops without parsed contracts\./);
  const identity = runningIdentity();
  assert.equal(identity.disabled, undefined);
  await mkdir(here("./logs/campaign/"), { recursive: true });
  const output = await mkdtemp(here("./logs/campaign/run-"));
  const records = [], limits = [], emit = (data) => console.log(JSON.stringify(data));
  const save = async (name, data) => {
    await writeFile(output + "/" + name + ".json", json(data));
    records.push({ name, sha256: hash(json(data)) });
  };
  const run = async (name, mode = "readwrite") => {
    emit({ event: "start", name, requestBudgetMs: BUDGET, mode });
    const start = performance.now();
    const report = await verifyFile(entry, { targets: ["reverseFirstTwo"], timeoutMs: BUDGET,
      cache: { dir: cacheDir, mode }, evidence: true });
    const ms = performance.now() - start;
    await save(name, { name, requestBudgetMs: BUDGET, ms, report });
    emit({ event: "result", name, ms, outcomes: report.outcomes.map(({ fn, status, reason, confirmed }) => ({ fn, status, reason, confirmed })),
      hits: names(report.cache.hits), solved: names(report.cache.solved), written: names(report.cache.written), rejected: report.cache.rejected });
    assert.deepEqual(names(report.selection.included), all);
    assert.deepEqual(report.cache.errors, []);
    // Current-source replay can reject a caller receipt after a callee edit.
    // That is honest rejection, never permission to keep the caller verified.
    assert.ok(report.cache.rejected.every((r) => r.reason === "replay" && r.target.endsWith("#reverseFirstTwo")));
    return report;
  };
  const plan = async (name, dir = cacheDir) => {
    const before = await cacheFiles(dir), start = performance.now();
    const report = await affected(entry, { targets: ["reverseFirstTwo"], cache: { dir } });
    await save(name, { ms: performance.now() - start, report });
    assert.equal(report.plan.noSolver, true);
    assert.deepEqual(report.outcomes, []);
    assert.ok(report.plan.targets.every((t) => t.state === "pending"));
    assert.deepEqual(await cacheFiles(dir), before);
    return report;
  };
  const audit = async (name) => {
    const before = await cacheFiles(), report = await run(name, "audit");
    assert.deepEqual(await cacheFiles(), before);
    assert.deepEqual(report.cache.written, []);
    assert.deepEqual(names(report.cache.solved), all);
    honestAudit(name, report);
    return report;
  };
  function honestAudit(name, report) {
    for (const d of report.cache.disagreements) {
      if (d.kind === "logical") {
        const fresh = report.outcomes.find((o) => `${o.file}#${o.fn}` === d.target);
        assert.equal(d.cached, "verified");
        assert.equal(fresh.status, d.fresh);
      } else assert.ok(["replay", "fresh-replay"].includes(d.kind) && d.target.endsWith("#reverseFirstTwo"));
    }
    for (const o of report.outcomes) if (o.reason === "request-timeout") {
      limits.push({ name, fn: o.fn, status: o.status, reason: o.reason, obligation: o.obligation });
    }
  }
  const adopt = async (name, cold, expectedGraph) => {
    const record = JSON.parse(await readFile(previous + name + ".json", "utf8"));
    assert.equal(record.report.graphSha256, expectedGraph ?? cold.graphSha256);
    assert.equal(record.report.cache.identity, identity.sha256);
    await save(name, { ...record, adoptedFrom: relative(output, previous + name + ".json") });
    return record.report;
  };
  const snapshot = async (name, current) => {
    const dir = output + "/sources/" + name;
    await mkdir(dir, { recursive: true });
    for (const [file, source] of Object.entries(current)) {
      await writeFile(root + file, source);
      await writeFile(dir + "/" + file, source);
    }
    const s = load(entry);
    assert.equal(s.error, undefined);
    await save(name + "-graph", { graphSha256: graphDigest(s.files, s.dependencies),
      modules: s.files.map(({ file, sha256, imports }) => ({ file, sha256, imports })),
      dependencies: s.dependencies.map(({ file, sha256, kind }) => ({ file, sha256, kind })) });
  };
  const native = async (name, expectedFailures) => {
    const result = await nativeComparisons(entry);
    await save(name + "-native", result);
    assert.ok(result.checks.every((c) => c.length && c.resultFresh && c.inputLengthPreserved && c.noExtraInputProperties));
    if (expectedFailures) assert.ok(result.failures > 0, "An actual wrapper failure is required to claim a native failure.");
    else assert.equal(result.failures, 0);
    emit({ event: "native", name, samples: result.count, wrapperFailures: result.failures });
  };
  const replay = async (name, report, expected) => {
    const result = reproduce(entry, report.evidence, { shrunk: false });
    await save(name, result);
    assert.equal(result.status, expected);
  };
  let success = false;
  try {
    await save("inputs", { checkout: git("rev-parse", "--show-toplevel"), head: git("rev-parse", "HEAD"),
      branch: git("branch", "--show-current"), command: process.argv, cwd: process.cwd(), requestBudgetMs: BUDGET,
      identity, pins, authoredHashes: Object.fromEntries(await Promise.all(["check.mjs", "campaign.mjs", "fixture.mjs", "native.mjs"]
        .map(async (name) => [name, hash(await readFile(here("./" + name)))]))) });
    await snapshot("baseline", sources);
    await native("baseline", false);
    await mkdir(work, { recursive: true });
    if (!resuming) await rm(cacheDir, { recursive: true, force: true });
    if (continuing) for (const file of Object.keys(await cacheFiles(previous + "cold-receipts"))) {
      const dest = cacheDir + "/" + file;
      await mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
      await copyFile(previous + "cold-receipts/" + file, dest);
    }
    const empty = await plan("plan-absent", work + "absent/cache");
    assert.equal(empty.plan.targets.filter((t) => t.needsSolve).length, 3);
    assert.deepEqual(await readdir(work), resuming ? ["cache"] : []);
    let cold;
    if (resuming) {
      const recorded = JSON.parse(await readFile(here("./logs/03-second-proof.json"), "utf8"));
      cold = recorded.report;
      const s = load(entry);
      assert.equal(cold.graphSha256, graphDigest(s.files, s.dependencies));
      assert.equal(cold.cache.identity, identity.sha256);
      await save("cold", { ...recorded, adoptedFrom: "../../03-second-proof.json" });
    } else cold = await run("cold");
    verified(cold);
    assert.deepEqual(cold.cache.hits, []);
    assert.deepEqual(names(cold.cache.solved), all);
    assert.deepEqual(names(cold.cache.written), all);
    for (const file of Object.keys(await cacheFiles())) {
      const dest = output + "/cold-receipts/" + file;
      await mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
      await copyFile(cacheDir + "/" + file, dest);
    }
    assert.ok((await plan("baseline-plan")).plan.targets.every((t) => t.cached && !t.needsSolve));
    const warm = await run("warm");
    verified(warm);
    assert.deepEqual(names(warm.cache.hits), all);
    assert.deepEqual(warm.cache.solved, []);
    verified(continuing ? await adopt("baseline-audit", cold) : await audit("baseline-audit"));
    assert.deepEqual(cold.evidence.witnesses, {}, "A proof is not a bug replay certificate.");

    // Authored caller order only; unchanged helpers, types, requires and ensures.
    const wrongOrder = { ...sources, "caller.js": edit(sources["caller.js"], "take(Reverse(array), 2)", "Reverse(take(array, 2))") };
    await snapshot("wrong-order", wrongOrder);
    await native("wrong-order", true);
    assert.deepEqual(names((await plan("wrong-order-plan")).plan.targets.filter((t) => t.needsSolve).map((t) => t.target)), ["reverseFirstTwo"]);
    const wrongGraph = graphDigest(load(entry).files, load(entry).dependencies);
    const wrong = continuing ? await adopt("wrong-order", cold, wrongGraph) : await run("wrong-order");
    sameAssumptions(wrong, cold);
    assert.equal(out(wrong, "Reverse").status, "verified");
    assert.equal(out(wrong, "takeImplementation").status, "verified");
    const bad = out(wrong, "reverseFirstTwo");
    assert.equal(bad.status, "counterexample");
    assert.equal(bad.confirmed, true);
    assert.deepEqual(bad.failed.map((f) => f.text), [CONTENT]);
    await replay("wrong-order-replay", wrong, "reproduced");
    const wrongWarm = continuing ? await adopt("wrong-order-warm", cold, wrongGraph) : await run("wrong-order-warm", "readonly");
    assert.equal(out(wrongWarm, "reverseFirstTwo").confirmed, true);
    assert.ok(!names(wrongWarm.cache.hits).includes("reverseFirstTwo"));
    const wrongAudit = continuing ? await adopt("wrong-order-audit", cold, wrongGraph) : await audit("wrong-order-audit");
    if (continuing) honestAudit("wrong-order-audit", wrongAudit);
    assert.equal(out(wrongAudit, "reverseFirstTwo").confirmed, true);

    // Only take's content guarantee is removed. All runtime tokens stay exact.
    const prefix = "// ensures result.every((value, index) => Object.is(value, array[index]))\n";
    const weak = { ...sources, "take.helper.js": edit(sources["take.helper.js"], prefix, "") };
    assert.deepEqual(tokens(weak["take.helper.js"]), tokens(sources["take.helper.js"]));
    await snapshot("weak-contract", weak);
    await native("weak-contract", false);
    await replay("wrong-order-evidence-after-contract-edit", wrong, "stale");
    const weakPlan = await plan("weak-contract-plan");
    assert.notEqual(key(weakPlan, "reverseFirstTwo"), key(cold, "reverseFirstTwo"));
    assert.notEqual(key(weakPlan, "takeImplementation"), key(cold, "takeImplementation"));
    assert.equal(key(weakPlan, "Reverse"), key(cold, "Reverse"));
    assert.deepEqual(names(weakPlan.plan.targets.filter((t) => t.needsSolve).map((t) => t.target)), ["reverseFirstTwo", "takeImplementation"]);
    for (const name of ["weak-contract", "weak-contract-warm", "weak-contract-audit"]) {
      const r = name.endsWith("audit") ? await audit(name) : await run(name);
      sameAssumptions(r, cold);
      if (!name.endsWith("audit")) assert.equal(out(r, "Reverse").status, "verified");
      else assert.ok(out(r, "Reverse").status === "verified" || out(r, "Reverse").reason === "request-timeout");
      assert.equal(out(r, "takeImplementation").status, "verified");
      assert.equal(out(r, "reverseFirstTwo").status, "unknown");
      const reason = out(r, "reverseFirstTwo").reason;
      assert.ok(["contract-gap", "request-timeout", "dependency"].includes(reason));
      if (reason !== "contract-gap" && !limits.some((l) => l.name === name && l.fn === "reverseFirstTwo")) {
        limits.push({ name, fn: "reverseFirstTwo", status: "unknown", reason,
          predicted: "contract-gap", obligation: out(r, "reverseFirstTwo").obligation });
      }
      assert.ok(!names(r.cache.hits).includes("reverseFirstTwo"));
      assert.ok(!names(r.cache.written).includes("reverseFirstTwo"));
      assert.deepEqual(r.evidence.witnesses, {});
    }

    // One seeded helper mutation. Caller and summaries stay byte-for-byte.
    const mutant = { ...sources, "Reverse.helper.js": edit(sources["Reverse.helper.js"], "arr[j] = temp", "arr[j] = arr[i]") };
    await snapshot("lost-temp-mutant", mutant);
    await native("lost-temp-mutant", true);
    const mp = await plan("lost-temp-plan");
    assert.equal(key(mp, "reverseFirstTwo"), key(cold, "reverseFirstTwo"));
    assert.notEqual(key(mp, "Reverse"), key(cold, "Reverse"));
    assert.deepEqual(names(mp.plan.targets.filter((t) => t.needsSolve).map((t) => t.target)), ["Reverse"]);
    for (const name of ["lost-temp", "lost-temp-warm", "lost-temp-audit"]) {
      const r = name.endsWith("audit") ? await audit(name) : await run(name);
      sameAssumptions(r, cold);
      assert.equal(key(r, "reverseFirstTwo"), key(cold, "reverseFirstTwo"));
      assert.notEqual(out(r, "Reverse").status, "verified");
      assert.equal(out(r, "takeImplementation").status, "verified");
      assert.equal(out(r, "reverseFirstTwo").status, "unknown");
      assert.match(out(r, "reverseFirstTwo").reason, /^dependency/);
      assert.ok(!names(r.cache.hits).includes("Reverse"));
      assert.ok(!names(r.cache.written).some((n) => ["Reverse", "reverseFirstTwo"].includes(n)));
      assert.deepEqual(names(r.cache.dependencies.find((d) => d.target.endsWith("#reverseFirstTwo")).blockedBy), ["Reverse"]);
      if (out(r, "Reverse").confirmed) await replay(name + "-replay", r, "reproduced");
    }

    await snapshot("restored", sources);
    await replay("wrong-order-evidence-after-source-restore", wrong, "stale");
    const restored = await run("restored", "readonly");
    verified(restored);
    assert.deepEqual(names(restored.cache.hits), all);
    assert.deepEqual(restored.cache.solved, []);
    assert.equal(restored.graphSha256, cold.graphSha256);
    const cache = await cacheFiles();
    await save("cache-final", cache);
    assert.equal(Object.keys(cache).length, 4, "Only three baseline and one verified weak take receipt.");
    success = true;
  } finally {
    for (const [name, source] of Object.entries(sources)) await writeFile(root + name, source);
    await pinnedFixtures();
    await rm(work, { recursive: true, force: true });
    const status = success && !limits.length ? "PASS" : "ISSUES";
    await writeFile(output + "/receipt.json", json({ status, requestBudgetMs: BUDGET,
      head: git("rev-parse", "HEAD"), records, observedLimits: limits,
      cleanup: { sourcesRestored: true, workDirectoryRemoved: true, nativeWorkersTerminated: true },
      limits: "Dense ordinary numeric arrays, every native length. Trusted compiler/model/solver/runtime and cache writers; no certificates. Native samples are finite. Seeded failures are not upstream bugs. K/Q completion remains root-owned." }));
    if (limits.length) process.exitCode = 1;
    emit({ status, output, records: records.length, observedLimits: limits });
  }
}
