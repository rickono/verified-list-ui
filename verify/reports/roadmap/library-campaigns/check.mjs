#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const self = fileURLToPath(import.meta.url), here = dirname(self);
const root = resolve(here, "../../../.."), prefix = relative(root, here);
const lane = "/Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py";
const sha = (data) => createHash("sha256").update(data).digest("hex");
const read = (file) => readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const save = (dir, name, value) => {
  const file = join(dir, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
  return value;
};
const bits = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
const fromBits = (s) => Buffer.from(s, "hex").readDoubleBE();
const number = (n) => ({ value: String(n), bits: bits(n) });
const cycles = {
  cycle100: ["3f5b4dad6af648df", "3f5b4dad6af648e1", 100],
  cycle5: ["3fbcc42ba089e7d0", "3fbcc42ba089e7d1", 5],
};

// Native subprocesses import the pinned runtime modules directly, including exports.
async function nativeNice(kind) {
  const { default: nice } = await import("./pins/d3-array/nice.js");
  const { tickIncrement } = await import("./pins/d3-array/ticks.js");
  const call = (id, start, stop, count) => {
    assert.ok(Number.isFinite(start) && Number.isFinite(stop) && start <= stop && count > 0);
    console.log(JSON.stringify({ event: "calling", id, start: number(start), stop: number(stop), count }));
    const increment = tickIncrement(start, stop, count), result = nice(start, stop, count);
    const row = { event: "returned", id, start: number(start), stop: number(stop), count,
      increment: number(increment), result: result.map(number), covers: result[0] <= start && stop <= result[1] };
    console.log(JSON.stringify(row));
    return { result, row };
  };
  if (kind === "finite") {
    for (const count of [1, 5000]) {
      const { result, row } = call(`coverage-${count}`, 0.9299999999999999, 0.93, count);
      assert.deepEqual(result, [0.93, 0.93]); assert.equal(row.covers, false);
    }
    assert.deepEqual(call("documented-example", 1, 9, 5).result, [0, 10]);
    assert.equal(call("fixed-issue-282", 0.9299999999999999, 1.07, 5000).row.covers, true);
  } else {
    assert.ok(Object.hasOwn(cycles, kind));
    const [a, b, count] = cycles[kind];
    call(kind, fromBits(a), fromBits(b), count);
    throw new Error("The retained cycle input unexpectedly returned.");
  }
}

async function nativeHarmonic() {
  const { default: mean } = await import("../../../examples/simple-statistics/harmonic_mean.js");
  const rows = [Number.MIN_VALUE, 2 ** -1024, 2 ** -1022, 1, 2, 49].map((x) => ({
    input: number(x), reciprocal: number(1 / x), result: number(mean([x])), positive: mean([x]) > 0,
  }));
  assert.ok(rows.slice(0, 2).every((r) => r.result.bits === "0000000000000000" && r.reciprocal.value === "Infinity"));
  assert.ok(rows.slice(2, 5).every((r) => r.input.bits === r.result.bits));
  assert.equal(BigInt(`0x${rows[5].result.bits}`) - BigInt(`0x${rows[5].input.bits}`), 1n);
  assert.equal(mean([2, 3]).toFixed(2), "2.40");
  const throws = [];
  for (const [x, message] of [[[], "harmonicMean requires at least one data point"],
    [[-1], "harmonicMean requires only positive numbers as input"], [[0], "harmonicMean requires only positive numbers as input"]]) {
    assert.throws(() => mean(x), { name: "Error", message }); throws.push({ x, message });
  }
  console.log(JSON.stringify({ rows, documentedExample: number(mean([2, 3])), throws }));
}

function inputCheck() {
  const inputs = json(join(here, "inputs.json"));
  assert.equal(inputs.baseline, "32bd5b260aa116ca88642a1479bed8d3fc447f4b");
  git("merge-base", "--is-ancestor", inputs.baseline, "HEAD");
  assert.ok(existsSync(join(root, "verify")));
  for (const [file, expected] of Object.entries(inputs.files)) {
    assert.equal(sha(readFileSync(join(root, file))), expected, `Source/provenance drift: ${file}`);
  }
  const provenance = json(join(here, "provenance.json")), d3 = provenance.d3Array;
  for (const [name, entry] of Object.entries(d3.sources)) {
    const old = execFileSync("git", ["show", `${provenance.inheritedCommit}:${entry.inheritedPath}`], { cwd: root });
    assert.equal(sha(old), entry.sha256);
    assert.deepEqual(readFileSync(join(here, "pins/d3-array", name)), old);
  }
  const contract = d3.publishedContract;
  const oldDocs = execFileSync("git", ["show", `${provenance.inheritedCommit}:${contract.inheritedPath}`], { cwd: root });
  assert.equal(sha(oldDocs), contract.fullDocumentSha256);
  assert.ok(oldDocs.toString().includes(contract.quotedFragment));
  assert.ok(oldDocs.toString().includes("d3.nice(1, 9, 5) // [0, 10]"));
  return inputs;
}

function freeze(inputs) {
  const paths = git("ls-tree", "-r", "--name-only", inputs.preparedParent).split("\n");
  const files = paths.map((p) => [p, sha(readFileSync(join(root, p)))]);
  // Keep the complete tree digest and individually named production/source hashes.
  return { preparedParent: inputs.preparedParent, preparedTree: git("rev-parse", `${inputs.preparedParent}^{tree}`),
    fileCount: files.length, allPreparedFilesSha256: sha(JSON.stringify(files)),
    sourceAndMetadata: Object.fromEntries(files.filter(([p]) => Object.hasOwn(inputs.files, p))) };
}

function childCommand(out, name, args, timeoutMs) {
  const argv = [process.execPath, ...args], startedAt = new Date().toISOString();
  const r = spawnSync(argv[0], argv.slice(1), { cwd: root, encoding: "utf8", timeout: timeoutMs,
    killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(join(out, `${name}.stdout.txt`), r.stdout ?? "");
  writeFileSync(join(out, `${name}.stderr.txt`), r.stderr ?? "");
  let alive = false;
  if (r.pid) { try { process.kill(r.pid, 0); alive = true; } catch (e) { if (e.code !== "ESRCH") throw e; } }
  const result = save(out, `${name}.command.json`, { argv, cwd: root, startedAt, finishedAt: new Date().toISOString(),
    timeoutMs, pid: r.pid, status: r.status, signal: r.signal, error: r.error && { code: r.error.code, message: r.error.message },
    stdoutSha256: sha(r.stdout ?? ""), stderrSha256: sha(r.stderr ?? ""), aliveAfterWait: alive,
    reaping: "spawnSync returned after wait; this subprocess starts no workers" });
  assert.equal(alive, false, `Unreaped subprocess: ${name}`);
  return { ...result, stdout: r.stdout, stderr: r.stderr };
}

async function cycleDiagnostic(out) {
  const { tickIncrement } = await import("./pins/d3-array/ticks.js");
  const original = read(join(here, "pins/d3-array/nice.js"));
  const hook = "    trace(start, stop, count, prestep);\n";
  assert.equal(original.split("  while (true) {\n").length, 2);
  const modified = original.replace("export default function nice(", "function nice(")
    .replace("  while (true) {\n", `  while (true) {\n${hook}`);
  assert.equal(modified.replace(hook, "").replace("function nice(", "export default function nice("), original);
  const imported = 'import {tickIncrement} from "./ticks.js";\n';
  assert.ok(modified.startsWith(imported));
  const bound = modified.slice(imported.length);
  mkdirSync(join(out, "diagnostic"));
  writeFileSync(join(out, "diagnostic/nice.js"), modified);
  writeFileSync(join(out, "diagnostic/bound-function.js"), bound);
  writeFileSync(join(out, "diagnostic/LICENSE"), readFileSync(join(here, "pins/d3-array/LICENSE")));
  const results = [];
  for (const [id, [a, b, count]] of Object.entries(cycles)) {
    const seen = new Map(), states = [], stop = Symbol("diagnostic-stop");
    let repeat;
    const trace = (start, end, c, prestep) => {
      const step = tickIncrement(start, end, c);
      const state = { start: number(start), stop: number(end), count: number(c),
        prestep: prestep === undefined ? { value: "undefined" } : number(prestep) };
      const key = JSON.stringify(state), iteration = states.length + 1;
      states.push({ iteration, ...state, step: number(step), returns: step === prestep || step === 0 || !isFinite(step) });
      if (seen.has(key)) { repeat = { first: seen.get(key), repeated: iteration, period: iteration - seen.get(key) }; throw stop; }
      seen.set(key, iteration);
      if (iteration >= 16) throw new Error("No repeat in the diagnostic's 16-step limit.");
    };
    const nice = new Function("tickIncrement", "trace", `${bound}\nreturn nice;`)(tickIncrement, trace);
    assert.throws(() => nice(fromBits(a), fromBits(b), count), (e) => e === stop);
    assert.deepEqual(repeat, { first: 2, repeated: 4, period: 2 });
    assert.ok(states.every((s) => !s.returns));
    results.push({ id, repeat, states });
  }
  return save(out, "d3-cycle-diagnostic.json", { classification: "finite control", origin: "own execution; inference conditional on pure deterministic builtins",
    modifiedSourceSha256: sha(modified), boundFunctionSha256: sha(bound), originalSourceSha256: sha(original), results,
    diagnosticBinding: "The module import/export are replaced by an explicit binding to the unchanged imported tickIncrement. The loop body has one added trace hook. Both diagnostic texts and the license are retained.",
    argument: "The full loop-head state (start, stop, fixed count, prestep) repeats bit-for-bit at iterations 2 and 4; neither intervening state returns. The unchanged transition with pure tickIncrement therefore repeats indefinitely. This diagnostic adds a trace/stop hook and is not an unchanged-source verifier proof." });
}

function artifacts(out) {
  const found = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) {
        const name = relative(out, p);
        let classification = "finite control", origin = "own execution or run metadata";
        if (name.endsWith(".report.json")) {
          const outcomes = json(p).outcomes ?? [];
          classification = outcomes.length && outcomes.every((o) => o.status === "verified") ? "universal proof"
            : outcomes.some((o) => o.status === "counterexample" && o.confirmed) ? "solver-confirmed native failure" : "unknown/unsupported";
        } else if (name === "native-harmonic.json" || name === "native-d3.json") classification = "independent native reproducer";
        else if (name === "d3-admission.json" || name.startsWith("native-cycle") || name.endsWith(".failure.json")) classification = "unknown/unsupported";
        else if (name.startsWith("query-inputs/")) origin = "inferred static query plan; not an execution trace";
        found[name] = { sha256: sha(readFileSync(p)), classification, origin };
      }
    }
  };
  walk(out);
  return found;
}

async function campaign(out) {
  const stages = [], claims = [];
  const stage = async (id, fn) => {
    console.log(`Starting ${id}`);
    const startedAt = new Date().toISOString();
    try {
      await fn(); stages.push({ id, status: "PASS", startedAt, finishedAt: new Date().toISOString() });
      console.log(`PASS ${id}`);
    } catch (e) {
      const error = { id, status: "ISSUES", startedAt, finishedAt: new Date().toISOString(), message: e.message,
        stack: e.stack, actual: e.actual, expected: e.expected, code: e.code };
      stages.push(error); save(out, `${id}.failure.json`, error); console.error(e.stack);
    }
    save(out, "stages.json", stages);
  };
  const inputs = inputCheck(), before = save(out, "freeze.before.json", freeze(inputs));
  const checkerBefore = sha(readFileSync(self)), inputsBefore = sha(readFileSync(join(here, "inputs.json")));
  const protectedDiff = git("diff", inputs.preparedParent, "--", ".", `:(exclude)${prefix}/**`);
  assert.equal(protectedDiff, "", "The prepared source tree must be unchanged.");
  const [{ runningIdentity }, api, compiler, proofPlan, harmonic, ramda] = await Promise.all([
    import("../../../manifest.mjs"), import("../../../index.mjs"), import("../../../source.mjs"),
    import("../../../proofs.mjs"), import("../../../examples/simple-statistics/check-harmonic.mjs"),
    import("../../../examples/ramda/check.mjs"),
  ]);
  const identity = save(out, "model.json", { codeHead: git("rev-parse", "HEAD"), ...runningIdentity() });
  assert.equal(identity.disabled, undefined);
  save(out, "api-calls.json", [
    { api: "checkHarmonic({outputDir})", productionChecker: "verify/examples/simple-statistics/check-harmonic.mjs", requests: [
      { file: "harmonic-total.js", timeoutMs: 60000, cache: "fresh temporary directory" },
      { file: "harmonic-total.js", timeoutMs: 60000, cache: "warm" },
      { file: "harmonic-positive.js", timeoutMs: 60000, evidence: true },
      { file: "harmonic-weak.js", timeoutMs: 60000 }],
      replay: ["preferred", "original", "relocated", "stale-source", "stale-model"] },
    { api: "verifyFile(nice.js, {timeoutMs:1000})", requests: 1, annotation: "none", expected: "unsupported, no solver" },
    { api: "checkPredicateSearch()", productionChecker: "verify/examples/ramda/check.mjs", requests: [
      { name: "upstream", timeoutMs: 60000 }, { name: "off-by-one", timeoutMs: 60000 }, { name: "skipped-first", timeoutMs: 60000 }] },
  ]);

  await stage("native-harmonic", async () => {
    const r = childCommand(out, "native-harmonic", [self, "--native-harmonic"], 10000);
    assert.equal(r.status, 0, r.stderr); assert.equal(r.error, undefined);
    const result = save(out, "native-harmonic.json", JSON.parse(r.stdout));
    claims.push({ id: "harmonic-independent-import", classification: "independent native reproducer", origin: "own execution",
      artifact: "native-harmonic.json", result: result.rows.slice(0, 2), sourceModified: false });
  });
  await stage("native-d3", async () => {
    const r = childCommand(out, "native-d3", [self, "--native-nice", "finite"], 10000);
    assert.equal(r.status, 0, r.stderr); assert.equal(r.error, undefined);
    const rows = r.stdout.trim().split("\n").map(JSON.parse).filter((r) => r.event === "returned");
    save(out, "native-d3.json", rows);
    claims.push({ id: "nice-coverage", classification: "independent native reproducer", origin: "own execution",
      sourceModified: false, artifact: "native-d3.json", cases: rows.slice(0, 2) });
    claims.push({ id: "nice-documented-and-fixed-282", classification: "finite control", origin: "own execution",
      artifact: "native-d3.json", cases: rows.slice(2), countedAsBug: false });
  });
  for (const id of Object.keys(cycles)) await stage(`native-${id}`, async () => {
    const r = childCommand(out, `native-${id}`, [self, "--native-nice", id], 2000);
    assert.equal(r.error?.code, "ETIMEDOUT"); assert.equal(r.signal, "SIGKILL"); assert.equal(r.status, null);
    const lines = r.stdout.trim().split("\n").map(JSON.parse);
    assert.equal(lines.length, 1); assert.equal(lines[0].event, "calling"); assert.equal(lines[0].id, id);
    claims.push({ id: `nice-${id}-timeout`, classification: "unknown/unsupported", origin: "own execution",
      artifact: `native-${id}.command.json`, observation: "unchanged module did not return before a 2000 ms subprocess timeout; killed and waited",
      verified: false, provesNontermination: false });
  });
  await stage("cycle-diagnostic", async () => {
    await cycleDiagnostic(out);
    claims.push({ id: "nice-pure-state-repeat", classification: "finite control", origin: "own execution and conditional inference",
      artifact: "d3-cycle-diagnostic.json", verifierProof: false, sourceModified: true });
  });
  await stage("d3-admission", async () => {
    const report = save(out, "d3-admission.json", await api.verifyFile(join(here, "pins/d3-array/nice.js"), { timeoutMs: 1000 }));
    assert.equal(report.outcomes.length, 1);
    const o = report.outcomes[0];
    assert.equal(o.status, "unsupported"); assert.ok(o.file.endsWith("/ticks.js"));
    assert.deepEqual(o.span, { start: 0, end: 73 });
    assert.equal(o.message, "Only ordinary top-level functions and const function expressions are supported.");
    claims.push({ id: "nice-formal-boundary", classification: "unknown/unsupported", origin: "own execution",
      artifact: "d3-admission.json", outcome: o, verified: false, noSolver: true });
  });
  await stage("harmonic", async () => {
    const directory = join(out, "harmonic");
    const result = save(out, "harmonic-result.json", await harmonic.checkHarmonic({ outputDir: directory }));
    assert.equal(result.status, "PASS");
    const r = childCommand(out, "cli-reproduce", [join(root, "verify/bin/jsverify.mjs"), "reproduce", "--json",
      join(directory, "positive.evidence.json"), join(root, "verify/examples/simple-statistics/harmonic-positive.js")], 15000);
    assert.equal(r.status, 0, r.stderr); assert.equal(r.error, undefined);
    assert.equal(JSON.parse(r.stdout).status, "reproduced");
    claims.push({ id: "harmonic-total", classification: "universal proof", origin: "own execution",
      artifact: "harmonic/total.report.json", domain: "all dense singletons with one finite positive binary64 element; no fixed value or reciprocal-finiteness restriction", ensures: "true; total return and termination" });
    claims.push({ id: "harmonic-positivity", classification: "solver-confirmed native failure", origin: "own execution",
      artifact: "harmonic/positive.report.json", evidence: "harmonic/positive.evidence.json", apiAndCliReproduced: true,
      modelIdentity: result.identity, graphSha256: result.graphSha256, sourceModified: false, seededMutant: false });
    claims.push({ id: "harmonic-weak", classification: result.weak.status === "counterexample" ? "solver-confirmed native failure" : "unknown/unsupported",
      origin: "own execution", artifact: "harmonic/weak.report.json", outcome: result.weak });
    claims.push({ id: "harmonic-P-controls", classification: "finite control", origin: "own execution", artifact: "harmonic/checks.json",
      warmReceiptHits: result.warmReceiptHits, staleSource: result.staleSource, staleModel: result.staleModel });
  });
  await stage("ramda", async () => {
    const result = save(out, "ramda.json", await ramda.checkPredicateSearch());
    for (const c of result.checks) save(out, `ramda/${c.name}.report.json`, c);
    claims.push({ id: "ramda-first-match", classification: "universal proof", origin: "own execution", artifact: "ramda/upstream.report.json",
      scope: result.scope, theorem: "integer bounds, matching result, first-match order, absence, and termination; no proof array-length or predicate-table bound" });
    claims.push({ id: "ramda-mutants", classification: "solver-confirmed native failure", origin: "own execution", artifact: "ramda.json",
      seededMutants: ["off-by-one", "skipped-first"], countedAsRealBugs: false });
    claims.push({ id: "ramda-native-comparisons", classification: "finite control", origin: "own execution", artifact: "ramda.json", samples: result.nativeSamples });
  });
  await stage("query-inputs", async () => {
    const { cases } = await ramda.pinnedPredicateCases();
    const targets = [];
    for (const name of ["total", "positive", "weak"]) {
      const p = join(root, `verify/examples/simple-statistics/harmonic-${name}.js`);
      targets.push({ id: `harmonic-${name}`, target: compiler.compile([compiler.parse(p, read(p))]).targets[0] });
    }
    for (const c of cases) {
      save(out, `ramda-sources/${c.name}.json`, c);
      targets.push({ id: `ramda-${c.name}`, target: compiler.compile([compiler.parse(`ramda/${c.name}.js`, c.source)]).targets[0] });
    }
    writeFileSync(join(out, "ramda-sources/LICENSE.txt"), readFileSync(join(root, "verify/examples/ramda/LICENSE.txt")));
    save(out, "ramda-sources/provenance.json", json(join(root, "verify/examples/ramda/provenance.json")));
    for (const { id, target } of targets) save(out, `query-inputs/${id}.json`, {
      origin: "compiled static query plan, not a solver execution trace or certificate", identity: identity.sha256,
      budgetMsPerPublicRequest: 60000,
      queries: proofPlan.phases(target).map(([phase, index]) => proofPlan.obligation(target, phase, index)),
    });
  });
  await stage("freeze-and-model", async () => {
    inputCheck();
    assert.equal(sha(readFileSync(self)), checkerBefore);
    assert.equal(sha(readFileSync(join(here, "inputs.json"))), inputsBefore);
    assert.deepEqual(save(out, "freeze.after.json", freeze(inputs)), before);
    assert.deepEqual(runningIdentity(), Object.fromEntries(Object.entries(identity).filter(([k]) => k !== "codeHead")));
  });
  claims.push({ id: "es-toolkit-inherited", classification: "universal proof", origin: "inherited; not rerun in this campaign",
    source: "verify/examples/es-toolkit/README.md", pin: "1913a7627a2995b095249d6b0b6453b900cdd4bc",
    scope: "empty-input sum returns +0, empty-input mean returns NaN, with termination; no nonempty summation or concatenation law", countsTowardFreshCoverage: false });
  const status = stages.every((s) => s.status === "PASS") ? "PASS" : "ISSUES";
  save(out, "evidence.json", { schema: 1, status, codeHead: identity.codeHead, runtimeEquivalentTo: inputs.runtimeEquivalentTo,
    preparedParent: inputs.preparedParent, modelIdentity: identity.sha256, checkerSha256: checkerBefore, inputsSha256: inputsBefore,
    pinDate: "2026-11-13", qComplete: false, kComplete: false, independentReviewComplete: false,
    noBenchmarkClaim: true, stages, claims, artifacts: artifacts(out),
    trust: "Frontend, source snapshots, source-to-SMT and binary64 encoding, exact specification replay, Z3/WASM, native Node and unmodified standard builtins. Receipts require trusted writers and are not certificates. The diagnostic cycle argument assumes deterministic pure tickIncrement and builtins." });
  console.log(`${status}: campaign evidence in ${out}`);
  process.exitCode = status === "PASS" ? 0 : 1;
}

async function supervise(output) {
  const out = resolve(output ?? join(here, "evidence", new Date().toISOString().replaceAll(":", "-")));
  assert.ok(!existsSync(out), "Use a new output directory; earlier evidence, including failed experiments, is immutable.");
  mkdirSync(out, { recursive: true });
  const argv = ["python3", lane, "--", process.execPath, self, "--run", out];
  const start = new Date().toISOString(), frozen = inputCheck();
  const before = save(out, "supervisor-freeze.before.json", freeze(frozen));
  let dependencyLink;
  try { dependencyLink = readlinkSync(join(root, "node_modules")); } catch { /* an ordinary install is also allowed */ }
  const child = spawn(argv[0], argv.slice(1), { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const stdout = [], stderr = [];
  child.stdout.on("data", (s) => { stdout.push(s); process.stdout.write(s); });
  child.stderr.on("data", (s) => { stderr.push(s); process.stderr.write(s); });
  let timedOut = false;
  const kill = () => { try { process.kill(-child.pid, "SIGKILL"); } catch (e) { if (e.code !== "ESRCH") throw e; } };
  const stop = () => { timedOut = true; kill(); };
  const timer = setTimeout(stop, 600000);
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  let launchError;
  child.once("error", (e) => { launchError = e.message; });
  const completion = await new Promise((resolve) => child.once("close", (code, signal) => resolve({ code, signal })));
  clearTimeout(timer); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  let remainingGroup = false;
  try { process.kill(-child.pid, 0); remainingGroup = true; kill(); } catch (e) { if (e.code !== "ESRCH") throw e; }
  writeFileSync(join(out, "stdout.txt"), Buffer.concat(stdout));
  writeFileSync(join(out, "stderr.txt"), Buffer.concat(stderr));
  const after = save(out, "supervisor-freeze.after.json", freeze(frozen));
  save(out, "run.json", { argv, invokedAs: process.argv, cwd: root, codeHead: git("rev-parse", "HEAD"),
    start, end: new Date().toISOString(), wallLimitMs: 600000, timedOut, launchError, ...completion,
    supervisorPid: process.pid, lanePid: child.pid, remainingProcessGroupAfterWait: remainingGroup,
    dependencyLink, protectedFilesUnchanged: JSON.stringify(before) === JSON.stringify(after),
    status: completion.code === 0 && !timedOut && !remainingGroup && JSON.stringify(before) === JSON.stringify(after) ? "PASS" : "ISSUES",
    artifacts: artifacts(out) });
  assert.equal(remainingGroup, false, "A campaign process leaked; its process group was killed.");
  assert.deepEqual(after, before);
  process.exitCode = completion.code === 0 && !timedOut ? 0 : 1;
}

try {
  if (process.argv[2] === "--native-nice") await nativeNice(process.argv[3]);
  else if (process.argv[2] === "--native-harmonic") await nativeHarmonic();
  else if (process.argv[2] === "--run") await campaign(resolve(process.argv[3]));
  else await supervise(process.argv[2]);
} catch (e) { console.error(e.stack); process.exitCode = 1; }
