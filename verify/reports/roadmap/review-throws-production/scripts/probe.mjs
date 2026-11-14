// Independent probes of archived b16d07b. Not the implementation's test file.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
const testedRoot = process.env.TESTED_ROOT;
const parentRoot = process.env.PARENT_ROOT;
const mutantRoot = process.env.MUTANT_ROOT;
const outDir = process.env.OUT_DIR;
const results = [];
const sha = (text) => createHash("sha256").update(text).digest("hex");
const bitsOf = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
const fromBits = (hex) => Buffer.from(hex, "hex").readDoubleBE(0);
const read = (path) => readFileSync(path, "utf8");
const one = (report, name) => {
  const found = name ? report.outcomes.filter((o) => o.fn === name) : report.outcomes;
  assert.equal(found.length, 1, JSON.stringify(report.outcomes.map((o) => ({ fn: o.fn, status: o.status, reason: o.reason, message: o.message }))));
  return found[0];
};
const summary = (o) => ({ status: o.status, reason: o.reason ?? null, phase: o.phase ?? null, confirmed: o.confirmed ?? null, message: o.message ?? null, result: o.result ?? null, inputs: o.inputs ?? null, span: o.span ?? null, loop: o.loop ?? null });

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail: detail ?? null });
    console.log(`ok ${name}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - started, error: e?.stack ?? String(e) });
    console.error(`FAIL ${name}\n${e?.stack ?? e}`);
  }
}

const { Parser, tokenizer } = await import(pathToFileURL(join(testedRoot, "node_modules/acorn/dist/acorn.mjs")).href);
const tested = await import(pathToFileURL(join(testedRoot, "verify/index.mjs")).href);
const testedSource = await import(pathToFileURL(join(testedRoot, "verify/source.mjs")).href);
const testedProofs = await import(pathToFileURL(join(testedRoot, "verify/proofs.mjs")).href);
const testedManifest = await import(pathToFileURL(join(testedRoot, "verify/manifest.mjs")).href);
const parent = await import(pathToFileURL(join(parentRoot, "verify/index.mjs")).href);
const parentSource = await import(pathToFileURL(join(parentRoot, "verify/source.mjs")).href);
const parentProofs = await import(pathToFileURL(join(parentRoot, "verify/proofs.mjs")).href);
const parentManifest = await import(pathToFileURL(join(parentRoot, "verify/manifest.mjs")).href);

const from = 'for (const s of states) cx.unit.events.push({ guard: s.path, safe: "false", assume: "true",';
const mutantSourceText = read(join(mutantRoot, "verify/source.mjs"));
assert.equal(mutantSourceText.split(from).length, 2);
writeFileSync(join(mutantRoot, "verify/source.mjs"), mutantSourceText.replace(from, 'for (const s of states) cx.unit.events.push({ guard: s.path, safe: "true", assume: "true",'));
const mutant = await import(pathToFileURL(join(mutantRoot, "verify/index.mjs")).href);
const mutantSource = await import(pathToFileURL(join(mutantRoot, "verify/source.mjs")).href);
const mutantProofs = await import(pathToFileURL(join(mutantRoot, "verify/proofs.mjs")).href);

const opts = { file: "probe.js", timeoutMs: 20_000 };
const gate = (requires = "", ensures = "true") => `/** @param {boolean} flag */
${requires ? `// requires ${requires}\n` : ""}// ensures ${ensures}
function gate(flag) { if (flag) throw new Error("boom"); return 0; }`;
const targetsOf = (text, api = testedSource) => api.compile([api.parse(opts.file, text)]).targets;
const throwsOf = (t) => t.obligations.filter((o) => o.kind === "throw-unreachable");
const loop = (inside, after, requires = "") => `/** @param {boolean} flag */
${requires ? `// requires ${requires}\n` : ""}// ensures true
function loop(flag) {
  let y = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) { ${inside} }
  ${after}
  return 0;
}`;

await check("admission emits one guarded false event and drops the path", async () => {
  const [t] = targetsOf(gate());
  const events = throwsOf(t);
  assert.equal(events.length, 1);
  assert.equal(events[0].abstract, false);
  assert.equal(events[0].loop, undefined);
  assert.equal(t.pre, "true");
  assert.equal(t.postconditions[0], "(=> input_0 false)");
  assert.doesNotMatch(t.postconditions[0], /result|call_fact/);
  // ensures true is the SMT constant true, so the ordered list keeps only the throw.
  assert.deepEqual(t.postconditions, ["(=> input_0 false)"]);
  assert.equal(t.ensures[0].text, "true");
  assert.equal(t.resultType, "number");
  assert.deepEqual(testedProofs.obligation(t, "feasibility").assertions, ["true"]);
  assert.equal(testedProofs.phases(t)[0][0], "feasibility");
  const post = testedProofs.obligation(t, "postcondition", 0);
  assert.equal(post.domain, "full");
  assert.deepEqual(post.assertions, ["true", "(not (=> input_0 false))"]);
  const source = read(join(testedRoot, "verify/source.mjs"));
  const index = read(join(testedRoot, "verify/index.mjs"));
  assert.equal(source.includes('safe: "false", assume: "true"'), true);
  assert.equal(source.includes("CANDIDATE_THROW_MUTANT"), false);
  assert.equal(/process\.env/.test(source), false);
  assert.equal(/process\.env/.test(index), false);
  return { postconditions: t.postconditions.length, first: t.postconditions[0] };
});

await check("guarded throw verifies; reachable native exception stays unconfirmed", async () => {
  const proved = one(await tested.verify(gate("!flag", "result === 0"), opts));
  assert.equal(proved.status, "verified");
  assert.equal(proved.inputs, undefined);
  assert.equal(proved.result, undefined);
  const reachable = one(await tested.verify(gate(), opts));
  assert.equal(reachable.status, "unknown");
  assert.equal(reachable.reason, "replay-mismatch");
  assert.equal(reachable.confirmed, undefined);
  assert.match(reachable.message, /JavaScript replay failed: boom/);
  const ensuresFalse = one(await tested.verify(gate("", "false"), opts));
  assert.equal(ensuresFalse.status, "unknown");
  assert.equal(ensuresFalse.reason, "replay-mismatch");
  assert.equal(ensuresFalse.confirmed, undefined);
  return { proved: proved.status, reachable: summary(reachable) };
});

await check("false requires stay vacuous and definedness precedes the throw", async () => {
  const vacuous = one(await tested.verify(gate("false"), opts));
  assert.equal(vacuous.status, "vacuous");
  const partial = `/** @param {number} x */
// requires real(x) > real("0") && false
// ensures true
function partial(x) { if (x <= 0) throw new Error("domain"); return 0; }`;
  const [t] = targetsOf(partial);
  assert.equal(testedProofs.phases(t)[0][0], "requires-definedness");
  const phaseNames = testedProofs.phases(t).map(([p]) => p);
  assert.ok(phaseNames.indexOf("requires-definedness") < phaseNames.indexOf("feasibility"));
  assert.ok(phaseNames.indexOf("feasibility") < phaseNames.indexOf("postcondition"));
  const o = one(await tested.verify(partial, opts));
  assert.equal(o.status, "counterexample");
  assert.equal(o.confirmed, true);
  assert.equal(o.phase, "requires-definedness");
  for (const source of [
    "// ensures true\nfunction always() { throw new Error('always'); }",
    gate().replace("return 0;", 'else throw new Error("also");'),
  ]) {
    const u = one(await tested.verify(source, opts));
    assert.equal(u.status, "unsupported");
    assert.match(u.message, /Every syntactic path must return/);
  }
  return { vacuous: vacuous.status, definedness: summary(o) };
});

await check("earlier facts can be used and later facts or caller ensures cannot discharge a throw", async () => {
  const earlier = `// ensures false
function impossible() { return 0; }
/** @param {boolean} flag */
// ensures true
function caller(flag) { impossible(); if (flag) throw new Error("earlier"); return 0; }`;
  const et = targetsOf(earlier).find((t) => t.name === "caller");
  const ek = et.obligations.findIndex((o) => o.kind === "throw-unreachable");
  assert.match(et.postconditions[ek], /call_fact0/);
  assert.doesNotMatch(et.postconditions[ek], /call_fact1/);
  const er = await tested.verify(earlier, opts);
  assert.equal(one(er, "impossible").status, "counterexample");
  assert.equal(one(er, "caller").status, "unknown");
  assert.equal(one(er, "caller").reason, "dependency-violation");
  assert.notEqual(one(er, "caller").status, "verified");
  const later = `// ensures false
function impossible() { return 0; }
/** @param {boolean} flag */
// ensures true
function caller(flag) { if (flag) throw new Error("later"); return impossible(); }`;
  const lt = targetsOf(later).find((t) => t.name === "caller");
  assert.equal(lt.postconditions[0], "(=> input_0 false)");
  assert.doesNotMatch(lt.postconditions[0], /call_fact/);
  const lr = one(await tested.verify(later, opts), "caller");
  assert.equal(lr.status, "unknown");
  assert.equal(lr.reason, "replay-mismatch");
  const unmet = gate("!flag", "false");
  const ur = one(await tested.verify(unmet, opts));
  assert.equal(ur.status, "counterexample");
  assert.equal(ur.confirmed, true);
  assert.equal(ur.result, "0");
  assert.equal(ur.inputs.flag, "false");
  return { earlier: summary(one(er, "caller")), later: summary(lr), ensuresSeparate: summary(ur) };
});

await check("throws inside and after loops are abstract gaps", async () => {
  const rows = [];
  for (const inside of [true, false]) {
    const statement = 'if (y !== 0) throw new Error("weak");';
    const source = loop(inside ? `${statement} y = 0;` : "y = 0;", inside ? "" : statement);
    const [t] = targetsOf(source);
    const [event] = throwsOf(t);
    assert.equal(throwsOf(t).length, 1);
    assert.equal(event.abstract, true);
    assert.match(source.slice(event.span.start, event.span.end), /^throw new Error/);
    if (inside) assert.match(source.slice(event.loop.start, event.loop.end), /^for /);
    else assert.equal(event.loop, undefined);
    const o = one(await tested.verify(source, opts));
    assert.equal(o.status, "unknown");
    assert.equal(o.reason, "induction-gap");
    assert.equal(o.phase, "throw-unreachable");
    assert.equal(o.confirmed, undefined);
    assert.equal(o.message, "The throw path may be reachable under the loop invariant; unchanged-source replay did not confirm a failure.");
    rows.push({ inside, abstract: event.abstract, loop: Boolean(event.loop) });
  }
  return rows;
});

await check("widening retry commits one throw and no second replay bound", async () => {
  const source = loop('if (flag) throw new Error("retry"); y = undefined;', "", "!flag");
  const [t] = targetsOf(source);
  assert.equal(throwsOf(t).length, 1);
  assert.equal(throwsOf(t)[0].abstract, true);
  assert.ok(throwsOf(t)[0].loop);
  const guards = t.declarations.match(/declare-const loop_replay\d+ Bool/g) ?? [];
  assert.equal(guards.length, 1);
  const index = t.obligations.findIndex((o) => o.kind === "throw-unreachable");
  const obligation = testedProofs.obligation(t, "postcondition", index);
  assert.equal(obligation.domain, "full");
  assert.ok(!obligation.assertions.some((a) => a.includes("loop_replay")));
  const o = one(await tested.verify(source, opts));
  assert.equal(o.status, "verified");
  assert.equal(o.inputs, undefined);
  return { replayGuards: guards.length, status: o.status };
});

await check("other throw forms and Error bindings reject at the throw span", async () => {
  const values = ['new Error(flag ? "a" : "b")', "new Error(`literal`)", "new Error()", 'new Error("a", "b")', 'Error("a")', 'new TypeError("a")', '"value"', "flag", '(flag = false, new Error("a"))', 'new globalThis.Error("a")'];
  const sources = values.map((v) => gate("!flag").replace('new Error("boom")', v));
  sources.push(gate("!flag").replace("if (flag)", "const Error = 1; if (flag)"));
  sources.push("// ensures true\nfunction Error() { return 0; }\n" + gate("!flag"));
  sources.push(gate("!flag").replace("{boolean} flag", "{boolean} flag @param {number} Error").replace("gate(flag)", "gate(flag, Error)"));
  const multiline = gate("!flag").replace('new Error("boom")', 'new Error(\n    flag ? "a" : "b"\n  )');
  sources.push(multiline);
  for (const source of sources) {
    const o = one(await tested.verify(source, opts));
    assert.equal(o.status, "unsupported", source);
    assert.match(o.message, /Throw admission requires unshadowed/);
    assert.equal(o.span.start, source.indexOf("throw "));
    assert.equal(o.span.end, source.indexOf(";", o.span.start) + 1);
  }
  const caught = '// ensures true\nfunction caught() { try { throw new Error("caught"); } catch (e) { return 0; } }';
  const o = one(await tested.verify(caught, opts));
  assert.equal(o.status, "unsupported");
  assert.match(o.message, /TryStatement/);
  assert.equal(o.span.start, caught.indexOf("try "));
  const paren = one(await tested.verify(gate("!flag").replace('throw new Error("boom")', 'throw (new Error("boom"))'), opts));
  assert.equal(paren.status, "unsupported");
  assert.match(paren.message, /Throw admission requires unshadowed/);
  return { rejected: sources.length + 2, paren: paren.status };
});

await check("in-loop false helper fact does not verify the caller", async () => {
  const source = `// ensures false
function bad() { return 0; }
/** @param {boolean} flag */
// requires !flag
// ensures true
function caller(flag) {
  let y = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) { bad(); if (flag) throw new Error("x"); y = 0; }
  return 0;
}`;
  const report = await tested.verify(source, opts);
  assert.equal(one(report, "bad").status, "counterexample");
  const caller = one(report, "caller");
  assert.notEqual(caller.status, "verified");
  assert.equal(caller.status, "unknown");
  assert.ok(caller.reason === "dependency" || caller.reason === "dependency-violation");
  return summary(caller);
});

await check("private safe-true mutant false-verifies and native execution detects it", async () => {
  const source = gate();
  const normal = one(await tested.verify(source, opts));
  assert.equal(normal.status, "unknown");
  assert.equal(normal.reason, "replay-mismatch");
  const report = await mutant.verify(source, opts);
  const m = one(report);
  assert.equal(m.status, "verified");
  assert.equal(m.inputs, undefined);
  assert.equal(m.result, undefined);
  const [target] = targetsOf(source, mutantSource);
  assert.equal(throwsOf(target).length, 0);
  const [provisional] = await mutantProofs.solve([target], opts.timeoutMs);
  assert.equal(provisional.status, "verified");
  assert.deepEqual(provisional.witness, ["false"]);
  const native = new Function(`${source}\nreturn gate;`)();
  assert.equal(native(false), 0);
  assert.throws(() => native(true), /boom/);
  const falseVerification = m.status === "verified" && (() => { try { native(true); return false; } catch { return true; } })();
  assert.equal(falseVerification, true);
  assert.equal(read(join(testedRoot, "verify/source.mjs")).includes('safe: "false"'), true);
  return { mutant: m.status, witness: provisional.witness, nativeTrue: "throws" };
});

await check("old source reports and queries match; semantic identity changes", async () => {
  const old = `/** @param {number} x */
// ensures Object.is(result, x)
function identity(x) { return x; }
// ensures result === 1
function one() {
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) {}
  return 1;
}`;
  const heap = `/** @param {{x: number}} box */
// ensures result === box.x
function read(box) { return box.x; }`;
  const numeric = `/** @param {number} x */
// requires Number.isInteger(x) && 0 <= x && x <= 3
// ensures result === x + 1
function inc(x) { return x + 1; }`;
  for (const source of [old, heap, numeric]) {
    const a = targetsOf(source), b = targetsOf(source, parentSource);
    assert.deepEqual(a, b);
    for (let j = 0; j < a.length; j++) {
      assert.deepEqual(testedProofs.phases(a[j]), parentProofs.phases(b[j]));
      for (const [phase, index] of testedProofs.phases(a[j])) {
        assert.deepEqual(testedProofs.obligation(a[j], phase, index), parentProofs.obligation(b[j], phase, index));
      }
    }
  }
  assert.deepEqual(await tested.verify(old, opts), await parent.verify(old, opts));
  const numericReport = one(await tested.verify(numeric, opts));
  assert.equal(numericReport.status, "verified");
  const newId = testedManifest.runningIdentity().sha256;
  const oldId = parentManifest.runningIdentity().sha256;
  assert.notEqual(newId, oldId);
  assert.equal(testedManifest.runningIdentity().sha256, "86f9e10064d037421d83775d3a2d35d8ddaffa18c9c81d590a175a9332007826");
  const dir = join(outDir, "old-cache");
  mkdirSync(dir, { recursive: true });
  const file = join(parentRoot, "probe-bug.js");
  writeFileSync(file, "/** @param {number} x */\n// ensures Object.is(result, x)\nfunction id(x) { return x; }\n// ensures false\nfunction bug() { return 0; }\n");
  const oldReport = await parent.verifyFile(file, { evidence: true, cache: { dir }, timeoutMs: 20_000 });
  assert.equal(one(oldReport, "bug").status, "counterexample");
  assert.equal(parent.reproduce(file, oldReport.evidence).status, "reproduced");
  const refused = tested.reproduce(file, oldReport.evidence);
  assert.equal(refused.status, "invalid-evidence");
  assert.match(refused.message, /model\/backend identity changed/);
  const fresh = await tested.verifyFile(file, { evidence: true, cache: { dir: join(outDir, "new-cache") }, timeoutMs: 20_000 });
  assert.equal(tested.reproduce(file, fresh.evidence).status, "reproduced");
  const plan = await tested.affected(file, { cache: { dir } });
  assert.ok(plan.plan.targets.every((t) => t.needsSolve));
  return { oldIdentity: oldId, newIdentity: newId, refused: refused.status, numeric: numericReport.status, planNeedsSolve: true };
});

const examples = join(testedRoot, "verify/examples/simple-statistics");
const original = read(join(examples, "harmonic_mean.js"));
const total = read(join(examples, "harmonic-total.js"));
const positive = read(join(examples, "harmonic-positive.js"));
const weak = read(join(examples, "harmonic-weak.js"));
const strip = (s) => s.split("\n").filter((l) => !/^\s*\/\/ (requires|ensures|invariant|decreases) /.test(l)).join("\n");
const annotations = (s) => s.split("\n").filter((l) => /^\s*\/\/ (requires|ensures|invariant|decreases) /.test(l)).map((l) => l.trim());
const tokens = (s) => [...tokenizer(s, { ecmaVersion: 2022, sourceType: "module" })].map((t) => s.slice(t.start, t.end));

await check("harmonic pin, license, strip, tokens, and shared singleton domain", async () => {
  const pin = JSON.parse(read(join(examples, "provenance.json")));
  assert.equal(sha(original), "c0bcedc78add016bd1f22ce9eb1a417363ac72d8cb5c0e7dfa4c74062a19f71d");
  assert.equal(sha(read(join(examples, "LICENSE"))), "63b5b6a85bc21476ebee13febd48d0a52056a695754a73aaed1ed7eafb059f29");
  assert.equal(pin.commit, "a9ec6767820e3fc7c29ab5f179778308c75a2f47");
  assert.equal(pin.license, "ISC");
  assert.equal(strip(total), original);
  assert.equal(strip(positive), original);
  assert.equal(strip(weak), original);
  assert.deepEqual(tokens(total), tokens(original));
  assert.deepEqual(tokens(positive), tokens(original));
  assert.deepEqual(tokens(weak), tokens(original));
  assert.equal(total.replace("// ensures true", "// ensures result > 0"), positive);
  assert.equal(weak, positive.split("\n").filter((l) => !(l.includes("// invariant") && l.includes("reciprocalSum"))).join("\n"));
  assert.deepEqual(annotations(total), [
    "// requires x.length === 1",
    "// requires Number.isFinite(x[0]) && x[0] > 0",
    "// ensures true",
    "// invariant x.length === 1",
    "// invariant Number.isFinite(x[0]) && x[0] > 0",
    "// invariant Number.isInteger(i) && 0 <= i && i <= x.length",
    "// invariant (i === 0 && Object.is(reciprocalSum, 0)) || (i === 1 && Object.is(reciprocalSum, 1 / x[0]))",
    "// decreases real(x.length) - real(i)",
  ]);
  assert.ok(tokens(original).includes("export") && tokens(original).includes("default") && tokens(original).includes("harmonicMean"));
  const ast = Parser.parse(original, { ecmaVersion: 2022, sourceType: "module" });
  const fn = ast.body.find((n) => n.type === "FunctionDeclaration");
  const native = new Function(`${original.slice(fn.start, fn.end)}\nreturn harmonicMean;`)();
  const x = fromBits("0000001000008041");
  assert.equal(bitsOf(x), "0000001000008041");
  assert.equal(1 / x, Infinity);
  assert.equal(Object.is(native([x]), +0), true);
  assert.equal(Object.is(native([Number.MIN_VALUE]), +0), true);
  assert.equal(Object.is(native([2 ** -1024]), +0), true);
  assert.equal(native([1]), 1);
  assert.equal(native([2]), 2);
  assert.equal(BigInt(`0x${bitsOf(native([49]))}`) - BigInt(`0x${bitsOf(49)}`), 1n);
  assert.equal(native([49]) > 0, true);
  const weakCandidate = Number("5.006416181641203e-308");
  const weakNative = native([weakCandidate]);
  assert.equal(Object.is(weakNative, +0), false);
  assert.equal(weakNative > 0, true);
  for (const [input, message] of [[[], "harmonicMean requires at least one data point"], [[-1], "harmonicMean requires only positive numbers as input"], [[0], "harmonicMean requires only positive numbers as input"]]) {
    assert.throws(() => native(input), { name: "Error", message });
  }
  for (const [name, source] of [["total", total], ["positive", positive], ["weak", weak]]) {
    const [t] = testedSource.compile([testedSource.parse(join(examples, `harmonic-${name}.js`), source)]).targets;
    const events = throwsOf(t);
    assert.equal(events.length, 2, name);
    assert.equal(events[0].abstract, false);
    assert.equal(events[1].abstract, true);
    assert.ok(events[1].loop);
    assert.match(source.slice(events[0].span.start, events[0].span.end), /at least one data point/);
    assert.match(source.slice(events[1].span.start, events[1].span.end), /only positive numbers/);
    assert.deepEqual(t.requires.map((c) => c.text), ["x.length === 1", "Number.isFinite(x[0]) && x[0] > 0"]);
    const smt = `${t.pre}\n${t.postconditions.join("\n")}`;
    assert.equal(smt.includes("0000001000008041"), false);
    assert.equal(smt.includes("3.3951948877e-313"), false);
    assert.match(t.declarations + smt, /fp\.div RNE/);
  }
  return { witnessBits: "0000001000008041", weakCandidateReturnsItself: weakNative === weakCandidate, ulpAt49: 1 };
});

await check("public verifyFile, P evidence, and CLI show normal-return +0 and refuse changed source or model", async () => {
  const cache = { dir: join(outDir, "harmonic-cache") };
  mkdirSync(cache.dir, { recursive: true });
  const totalFile = join(examples, "harmonic-total.js");
  const positiveFile = join(examples, "harmonic-positive.js");
  const proved = await tested.verifyFile(totalFile, { timeoutMs: 60_000, cache });
  const provedOutcome = one(proved);
  assert.equal(provedOutcome.status, "verified");
  assert.equal(provedOutcome.inputs, undefined);
  assert.equal(provedOutcome.result, undefined);
  assert.equal(proved.cache.written.length, 1);
  const warm = await tested.verifyFile(totalFile, { timeoutMs: 60_000, cache });
  assert.equal(one(warm).status, "verified");
  assert.equal(warm.cache.hits.length, 1);
  assert.equal(warm.cache.solved.length, 0);
  const bug = await tested.verifyFile(positiveFile, { timeoutMs: 60_000, cache, evidence: true });
  const outcome = one(bug);
  assert.equal(outcome.status, "counterexample");
  assert.equal(outcome.confirmed, true);
  assert.equal(outcome.result, "0");
  assert.equal(outcome.phase, undefined);
  assert.ok(outcome.failed.some((c) => c.text === "result > 0" && c.kind === "ensures"));
  assert.equal(bug.cache.written.length, 0);
  const x = Number(outcome.inputs.x[0]);
  const ast = Parser.parse(original, { ecmaVersion: 2022, sourceType: "module" });
  const fn = ast.body.find((n) => n.type === "FunctionDeclaration");
  const native = new Function(`${original.slice(fn.start, fn.end)}\nreturn harmonicMean;`)();
  assert.equal(bitsOf(x), "0000001000008041");
  assert.equal(1 / x, Infinity);
  assert.equal(Object.is(native([x]), +0), true);
  assert.equal(Number.isFinite(x) && x > 0, true);
  assert.equal(bug.evidence.identity, testedManifest.runningIdentity().sha256);
  const replay = tested.reproduce(positiveFile, bug.evidence);
  assert.equal(replay.status, "reproduced");
  assert.equal(replay.outcomes[0].confirmed, true);
  assert.equal(Object.is(native([Number(replay.outcomes[0].inputs.x[0])]), +0), true);
  const evidencePath = join(outDir, "positive.evidence.json");
  writeFileSync(evidencePath, JSON.stringify(bug.evidence));
  const cli = spawnSync(process.execPath, ["verify/bin/jsverify.mjs", "reproduce", "--json", evidencePath, positiveFile], { cwd: testedRoot, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const cliReport = JSON.parse(cli.stdout);
  assert.equal(cliReport.status, "reproduced");
  assert.equal(cliReport.outcomes[0].confirmed, true);
  const scratch = join(outDir, "relocated");
  const moved = join(scratch, "verify/examples/simple-statistics/harmonic-positive.js");
  mkdirSync(dirname(moved), { recursive: true });
  writeFileSync(join(scratch, "package.json"), read(join(testedRoot, "package.json")));
  writeFileSync(moved, positive);
  assert.equal(tested.reproduce(moved, bug.evidence).status, "reproduced");
  writeFileSync(moved, positive + "\n// changed source\n");
  const stale = tested.reproduce(moved, bug.evidence);
  assert.equal(stale.status, "stale");
  const wrongModel = tested.reproduce(positiveFile, { ...bug.evidence, identity: "0".repeat(64) });
  assert.equal(wrongModel.status, "invalid-evidence");
  assert.match(wrongModel.message, /model\/backend identity changed/);
  const wr = await tested.verifyFile(join(examples, "harmonic-weak.js"), { timeoutMs: 60_000 });
  const w = one(wr);
  assert.notEqual(w.status, "verified");
  if (w.status === "counterexample") {
    assert.equal(w.confirmed, true);
    assert.ok(w.failed.some((c) => c.text === "result > 0"));
    const y = Number(w.inputs.x[0]);
    assert.equal(Object.is(native([y]), +0), true);
    assert.equal(1 / y, Infinity);
  } else {
    assert.equal(w.status, "unknown");
    assert.equal(w.reason, "induction-gap");
    assert.equal(w.confirmed, undefined);
    const y = Number(w.candidate.x[0]);
    assert.equal(Object.is(native([y]), +0), false);
    assert.equal(native([y]) > 0, true);
  }
  return {
    total: provedOutcome.status,
    warmHits: warm.cache.hits.length,
    positive: summary(outcome),
    witnessBits: bitsOf(x),
    cli: cliReport.status,
    stale: stale.status,
    wrongModel: wrongModel.status,
    weak: summary(w),
  };
});

const fixture = join(outDir, "import-shadow");
mkdirSync(fixture, { recursive: true });
writeFileSync(join(fixture, "package.json"), '{"type":"module"}\n');
writeFileSync(join(fixture, "shadow.js"), "// ensures result === 0\nexport function Error() { return 0; }\n");
writeFileSync(join(fixture, "gate.js"), 'import { Error } from "./shadow.js";\n/** @param {boolean} flag */\n// requires !flag\n// ensures result === 0\nfunction gate(flag) { if (flag) throw new Error("boom"); return 0; }\n');
writeFileSync(join(fixture, "asserted.ts"), '/** @param {boolean} flag */\n// requires !flag\n// ensures result === 0\nfunction gate(flag: boolean) { if (flag) throw new Error("boom" as string); return 0; }\n');

await check("imported Error and a type-asserted argument stay unsupported", async () => {
  const imported = one(await tested.verifyFile(join(fixture, "gate.js"), { timeoutMs: 20_000 }));
  assert.equal(imported.status, "unsupported");
  assert.match(imported.message, /Throw admission requires unshadowed|Duplicate or reserved/);
  const asserted = one(await tested.verifyFile(join(fixture, "asserted.ts"), { timeoutMs: 20_000 }));
  assert.equal(asserted.status, "unsupported");
  assert.notEqual(asserted.status, "verified");
  return { imported: summary(imported), asserted: summary(asserted) };
});

writeFileSync(join(outDir, "results.json"), JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2));
if (results.some((r) => !r.ok)) process.exitCode = 1;
