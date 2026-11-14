#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Parser, tokenizer } from "acorn";
import { verifyFile, reproduce } from "../../index.mjs";
import { runningIdentity } from "../../manifest.mjs";
import { compile, parse } from "../../source.mjs";
import { openCache } from "../../cache.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (text) => createHash("sha256").update(text).digest("hex");
const read = (name) => readFileSync(join(here, name), "utf8");
const bits = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
const annotations = (s) => s.split("\n").filter((l) => /^\s*\/\/ (requires|ensures|invariant|decreases) /.test(l));
const strip = (s) => s.split("\n").filter((l) => !/^\s*\/\/ (requires|ensures|invariant|decreases) /.test(l)).join("\n");
const tokens = (s) => [...tokenizer(s, { ecmaVersion: 2022, sourceType: "module" })].map((t) => s.slice(t.start, t.end));
const outcome = (r) => { assert.equal(r.outcomes.length, 1); return r.outcomes[0]; };

// This checker drives the current public API. It never substitutes candidate code.
export async function checkHarmonic({ outputDir } = {}) {
  if (outputDir) mkdirSync(outputDir, { recursive: true });
  const save = (name, value) => { if (outputDir) writeFileSync(join(outputDir, name), JSON.stringify(value, null, 2) + "\n"); return value; };
  const identity = runningIdentity();
  assert.equal(identity.disabled, undefined);
  const codeSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  save("model.json", { codeSha, ...identity });
  const pin = JSON.parse(read("provenance.json")), original = read("harmonic_mean.js");
  assert.equal(pin.sha256, "c0bcedc78add016bd1f22ce9eb1a417363ac72d8cb5c0e7dfa4c74062a19f71d");
  assert.equal(pin.licenseSha256, "63b5b6a85bc21476ebee13febd48d0a52056a695754a73aaed1ed7eafb059f29");
  assert.equal(sha(original), pin.sha256);
  assert.equal(sha(read("LICENSE")), pin.licenseSha256);
  assert.equal(pin.commit, "a9ec6767820e3fc7c29ab5f179778308c75a2f47");
  const total = read("harmonic-total.js"), positive = read("harmonic-positive.js"), weak = read("harmonic-weak.js");
  assert.equal(total.replace("// ensures true", "// ensures result > 0"), positive);
  assert.equal(weak, positive.split("\n").filter((l) => !(l.includes("// invariant") && l.includes("reciprocalSum"))).join("\n"));
  assert.deepEqual(annotations(total).map((l) => l.trim()), [
    "// requires x.length === 1",
    "// requires Number.isFinite(x[0]) && x[0] > 0",
    "// ensures true",
    "// invariant x.length === 1",
    "// invariant Number.isFinite(x[0]) && x[0] > 0",
    "// invariant Number.isInteger(i) && 0 <= i && i <= x.length",
    "// invariant (i === 0 && Object.is(reciprocalSum, 0)) || (i === 1 && Object.is(reciprocalSum, 1 / x[0]))",
    "// decreases real(x.length) - real(i)",
  ]);
  const sources = {};
  for (const [name, source] of [["harmonic-total.js", total], ["harmonic-positive.js", positive], ["harmonic-weak.js", weak]]) {
    assert.equal(strip(source), original, "only annotation lines may be added");
    assert.deepEqual(tokens(source), tokens(original), "the original code and export tokens must survive");
    const [t] = compile([parse(join(here, name), source)]).targets;
    const events = t.obligations.filter((o) => o.kind === "throw-unreachable");
    assert.equal(events.length, 2);
    assert.equal(events[0].abstract, false); assert.equal(events[1].abstract, true); assert.ok(events[1].loop);
    assert.match(t.declarations + t.postconditions.join("\n"), /fp\.div RNE/);
    sources[name] = { sha256: sha(source), commentsOnly: true, runtimeTokensEqual: true,
      annotations: annotations(source), throws: events, pre: t.pre, preDefined: t.preDefined,
      postconditionSha256: t.postconditions.map(sha) };
  }
  save("sources.json", { pin, sources });
  const ast = Parser.parse(original, { ecmaVersion: 2022, sourceType: "module" });
  const fn = ast.body.find((n) => n.type === "FunctionDeclaration");
  const native = new Function(`${original.slice(fn.start, fn.end)}\nreturn harmonicMean;`)();
  const nativeBug = (o) => {
    assert.equal(o.status, "counterexample", JSON.stringify(o)); assert.equal(o.confirmed, true);
    assert.equal(o.result, "0"); assert.equal(o.inputs.x.length, 1);
    assert.ok(o.failed.some((c) => c.text === "result > 0"));
    const x = Number(o.inputs.x[0]); assert.ok(Number.isFinite(x) && x > 0);
    assert.equal(1 / x, Infinity); assert.equal(Object.is(native([x]), +0), true);
    return { input: x, inputBits: bits(x), reciprocal: "Infinity", result: "+0", resultBits: bits(native([x])) };
  };
  const rows = [Number.MIN_VALUE, 2 ** -1024, 1, 2, 49].map((x) => ({ x: String(x), inputBits: bits(x),
    reciprocal: String(1 / x), result: String(native([x])), resultBits: bits(native([x])) }));
  assert.ok(rows.slice(0, 2).every((r) => r.reciprocal === "Infinity" && r.resultBits === "0000000000000000"));
  assert.equal(native([1]), 1); assert.equal(native([2]), 2);
  assert.equal(BigInt(`0x${rows[4].resultBits}`) - BigInt(`0x${rows[4].inputBits}`), 1n);
  assert.equal(native([2, 3]).toFixed(2), "2.40");
  const nativeThrows = [];
  for (const [x, message] of [[[], "harmonicMean requires at least one data point"],
    [[-1], "harmonicMean requires only positive numbers as input"], [[0], "harmonicMean requires only positive numbers as input"]]) {
    assert.throws(() => native(x), { name: "Error", message }); nativeThrows.push({ x, message });
  }
  save("native.json", { originalSha256: sha(original), rows, nativeThrows,
    roundingAt49: "one ulp; not the positivity failure", twoElementExample: native([2, 3]) });
  const scratch = mkdtempSync(join(tmpdir(), "jsverify-harmonic-"));
  try {
    const cache = { dir: join(scratch, "cache") };
    const totalFile = join(here, "harmonic-total.js"), positiveFile = join(here, "harmonic-positive.js");
    const proved = save("total.report.json", await verifyFile(totalFile, { timeoutMs: 60_000, cache }));
    assert.equal(outcome(proved).status, "verified"); assert.equal(proved.cache.written.length, 1);
    assert.equal(outcome(proved).inputs, undefined); assert.equal(outcome(proved).result, undefined);
    const key = Object.values(proved.cache.keys)[0];
    save("total.receipt.json", JSON.parse(readFileSync(openCache(cache.dir, { mode: "readonly" }).path(key), "utf8")));
    const warm = save("total.warm.json", await verifyFile(totalFile, { timeoutMs: 60_000, cache }));
    assert.equal(outcome(warm).status, "verified"); assert.equal(warm.cache.hits.length, 1); assert.equal(warm.cache.solved.length, 0);
    assert.deepEqual(warm.outcomes, proved.outcomes);
    const bug = save("positive.report.json", await verifyFile(positiveFile, { timeoutMs: 60_000, cache, evidence: true }));
    const nativeWitness = nativeBug(outcome(bug));
    assert.equal(bug.cache.written.length, 0); assert.equal(bug.cache.hits.length, 0);
    assert.equal(bug.evidence.identity, identity.sha256); assert.equal(bug.evidence.graphSha256, bug.graphSha256);
    assert.equal(Object.keys(bug.evidence.witnesses).length, 1);
    save("positive.evidence.json", bug.evidence);
    const replay = save("positive.reproduced.json", reproduce(positiveFile, JSON.parse(JSON.stringify(bug.evidence))));
    const originalReplay = save("positive.original-reproduced.json", reproduce(positiveFile, bug.evidence, { shrunk: false }));
    for (const r of [replay, originalReplay]) {
      assert.equal(r.status, "reproduced"); assert.equal(r.outcomes[0].reproduced, true); nativeBug(r.outcomes[0]);
    }
    const moved = join(scratch, "verify", "examples", "simple-statistics", basename(positiveFile));
    mkdirSync(dirname(moved), { recursive: true }); writeFileSync(moved, positive);
    // The nearest package scope is part of this fixture's read-once graph.
    writeFileSync(join(scratch, "package.json"), readFileSync(join(root, "package.json")));
    const relocated = save("positive.relocated-reproduced.json", reproduce(moved, bug.evidence));
    assert.equal(relocated.status, "reproduced");
    writeFileSync(moved, positive + "\n// stale source control\n");
    const stale = save("negative.stale-source.json", reproduce(moved, bug.evidence)); assert.equal(stale.status, "stale");
    const oldModel = { ...bug.evidence, identity: "0".repeat(64) };
    const model = save("negative.stale-model.json", reproduce(positiveFile, oldModel));
    assert.equal(model.status, "invalid-evidence"); assert.match(model.message, /model\/backend identity changed/);
    const wr = save("weak.report.json", await verifyFile(join(here, "harmonic-weak.js"), { timeoutMs: 60_000 }));
    const w = outcome(wr);
    if (w.status === "counterexample") nativeBug(w);
    else { assert.equal(w.status, "unknown"); assert.equal(w.reason, "induction-gap"); assert.ok(w.message); }
    assert.deepEqual(runningIdentity(), identity, "the running semantic model must stay static throughout the campaign");
    return save("checks.json", { status: "PASS", codeSha, identity: identity.sha256, graphSha256: bug.graphSha256,
      total: outcome(proved).status, positive: outcome(bug).status, confirmed: outcome(bug).confirmed, nativeWitness,
      warmReceiptHits: warm.cache.hits.length, reproduce: replay.status, originalReproduce: originalReplay.status,
      staleSource: stale.status, staleModel: model.status, weak: { status: w.status, reason: w.reason },
      sourceSha256: pin.sha256, scope: "all dense finite positive singletons", qComplete: false });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const outputDir = process.argv[2] && resolve(process.argv[2]);
  try { console.log(JSON.stringify(await checkHarmonic({ outputDir }), null, 2)); }
  catch (e) { console.error(e.stack); process.exitCode = 1; }
}
