import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verify, verifyFile, reproduce, affected } from "../../verify/index.mjs";
import { parse, compile } from "../../verify/source.mjs";
import { phases, obligation, solve } from "../../verify/proofs.mjs";
import { runningIdentity } from "../../verify/manifest.mjs";
import { legacyTargets } from "./fixtures/legacy-compiled.mjs";

// Adapted from candidate A f5473537 and independent judgment e97d03d.
const beforeThrows = "dedde91b9f6e1fec3a30f5e39cae65f5381b6b26";
const root = fileURLToPath(new URL("../../", import.meta.url));
const opts = { file: "throws.js", timeoutMs: 20_000 };
const out = (r, name) => name ? r.outcomes.find((o) => o.fn === name) : r.outcomes[0];
const targets = (text, api = { parse, compile }) => api.compile([api.parse(opts.file, text)]).targets;
const throws = (t) => t.obligations.filter((o) => o.kind === "throw-unreachable");
const gate = (requires = "", ensures = "true") => `/** @param {boolean} flag */
${requires ? `// requires ${requires}\n` : ""}// ensures ${ensures}
function gate(flag) { if (flag) throw new Error("boom"); return 0; }`;
const check = (source) => verify(source, opts);
const mismatch = (o) => {
  assert.equal(o.status, "unknown", JSON.stringify(o));
  assert.equal(o.reason, "replay-mismatch");
  assert.equal(o.confirmed, undefined);
};

async function privateVerifier(t, mode) {
  const scratch = mkdtempSync(join(tmpdir(), "jsverify-throws-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const dir = join(scratch, "verify"); mkdirSync(dir);
  for (const f of readdirSync(join(root, "verify")).filter((f) => f.endsWith(".mjs"))) cpSync(join(root, "verify", f), join(dir, f));
  symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"), "dir");
  if (mode === "parent") {
    for (const f of ["source.mjs", "index.mjs", "proofs.mjs"]) {
      writeFileSync(join(dir, f), execFileSync("git", ["show", `${beforeThrows}:verify/${f}`], { cwd: root }));
    }
  } else {
    const file = join(dir, "source.mjs"), source = readFileSync(file, "utf8");
    const from = 'for (const s of states) cx.unit.events.push({ guard: s.path, safe: "false", assume: "true",';
    assert.equal(source.split(from).length, 2, "private mutation site drifted");
    writeFileSync(file, source.replace(from, 'for (const s of states) cx.unit.events.push({ guard: s.path, safe: "true", assume: "true",'));
  }
  return { scratch, index: await import(pathToFileURL(join(dir, "index.mjs"))),
    source: await import(pathToFileURL(join(dir, "source.mjs"))),
    proofs: await import(pathToFileURL(join(dir, "proofs.mjs"))),
    manifest: await import(pathToFileURL(join(dir, "manifest.mjs"))) };
}

test("guarded throws require unreachability; native exceptions stay unconfirmed", async () => {
  assert.equal(out(await check(gate("!flag", "result === 0"))).status, "verified");
  for (const requires of ["", "flag"]) {
    const r = await check(gate(requires)); mismatch(out(r));
    assert.match(out(r).message, /JavaScript replay failed: boom/);
  }
  mismatch(out(await check(gate("", "false"))));
  const r = out(await check(gate("!flag", "false")));
  assert.equal(r.status, "counterexample"); assert.equal(r.confirmed, true);
  assert.equal(r.inputs.flag, "false"); assert.equal(r.result, "0");
  const branch = `/** @param {boolean} a @param {boolean} b */
// ensures true
function branch(a,b) { if (a) { if (b) throw new Error("branch"); return 1; } else { return 2; } }`;
  mismatch(out(await check(branch)));
  const [t] = targets(gate());
  assert.equal(t.pre, "true"); assert.equal(throws(t).length, 1);
  assert.equal(throws(t)[0].abstract, false);
  assert.equal(t.postconditions[0], "(=> input_0 false)");
  assert.doesNotMatch(t.declarations, /call_fact/);
  assert.deepEqual(obligation(t, "feasibility").assertions, ["true"]);
  assert.deepEqual(obligation(t, "postcondition").assertions, [t.pre, `(not ${t.postconditions[0]})`]);
  assert.equal(obligation(t, "postcondition").domain, "full");
});

test("requires-only feasibility and definedness run before throw obligations", async () => {
  assert.equal(out(await check(gate("false"))).status, "vacuous");
  const partial = `/** @param {number} x */
// requires real(x) > real("0") && false
// ensures true
function partial(x) { if (x <= 0) throw new Error("domain"); return 0; }`;
  const [t] = targets(partial);
  assert.equal(phases(t)[0][0], "requires-definedness");
  assert.deepEqual(obligation(t, "requires-definedness").assertions, [`(not ${t.preDefined})`]);
  const o = out(await check(partial));
  assert.equal(o.status, "counterexample"); assert.equal(o.confirmed, true);
  assert.equal(o.phase, "requires-definedness");
  for (const source of ["// ensures true\nfunction always() { throw new Error('always'); }",
    gate().replace('return 0;', 'else throw new Error("also");')]) {
    const o = out(await check(source));
    assert.equal(o.status, "unsupported"); assert.match(o.message, /Every syntactic path must return/);
  }
});

test("throw checks use preceding helper facts only and wait for final dependencies", async () => {
  const no = `/** @param {boolean} flag */
// ensures result === false
function no(flag) { return false; }
/** @param {boolean} flag */
// ensures result === 0
function caller(flag) { if (no(flag)) throw new Error("earlier"); return 0; }`;
  const r = await check(no); assert.ok(r.outcomes.every((o) => o.status === "verified"), JSON.stringify(r.outcomes));
  const caller = targets(no).find((t) => t.name === "caller");
  const k = caller.obligations.findIndex((o) => o.kind === "throw-unreachable");
  assert.equal(caller.pre, "true"); assert.match(caller.postconditions[k], /call_fact0/);
  assert.doesNotMatch(caller.postconditions[k], /call_fact1/);
  const impossible = `// ensures false
function impossible() { return 0; }
/** @param {boolean} flag */
// ensures true
function caller(flag) { BODY }`;
  const later = impossible.replace("BODY", 'if (flag) throw new Error("later"); return impossible();');
  const lt = targets(later).find((t) => t.name === "caller");
  assert.equal(lt.postconditions[0], "(=> input_0 false)");
  mismatch(out(await check(later), "caller"));
  const earlier = impossible.replace("BODY", 'impossible(); if (flag) throw new Error("earlier"); return 0;');
  const et = targets(earlier).find((t) => t.name === "caller");
  assert.match(et.postconditions[et.obligations.findIndex((o) => o.kind === "throw-unreachable")], /call_fact0/);
  const er = await check(earlier);
  assert.equal(out(er, "caller").status, "unknown");
  assert.equal(out(er, "caller").reason, "dependency-violation");
  assert.equal(out(er, "impossible").status, "counterexample");
  const helper = gate().replaceAll("gate", "helper") + `
/** @param {boolean} flag */
// ensures true
function caller(flag) { if (flag) return 0; return helper(flag); }`;
  const hr = await check(helper); mismatch(out(hr, "helper"));
  assert.equal(out(hr, "caller").status, "unknown"); assert.equal(out(hr, "caller").reason, "dependency");
  const requires = `/** @param {number} x */
// requires x > 0
// ensures result === x
function helper(x) { return x; }
/** @param {number} x */
// ensures true
function caller(x) { if (!(x > 0)) throw new Error("before call"); return helper(x); }`;
  mismatch(out(await check(requires), "caller"));
});

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

test("throws inside and after a loop retain abstract attribution and gap messages", async () => {
  for (const inside of [true, false]) {
    const statement = 'if (y !== 0) throw new Error("weak");';
    const source = loop(inside ? `${statement} y = 0;` : "y = 0;", inside ? "" : statement);
    const [t] = targets(source), [event] = throws(t);
    assert.equal(event.abstract, true);
    assert.equal(throws(t).length, 1);
    assert.match(source.slice(event.span.start, event.span.end), /^throw new Error/);
    if (inside) {
      assert.match(source.slice(event.loop.start, event.loop.end), /^for /);
      assert.ok(event.loop.start < event.span.start && event.loop.end > event.span.end);
    } else assert.equal(event.loop, undefined);
    const o = out(await check(source));
    assert.equal(o.status, "unknown"); assert.equal(o.reason, "induction-gap");
    assert.equal(o.phase, "throw-unreachable"); assert.deepEqual(o.span, event.span);
    assert.deepEqual(o.loop, event.loop);
    assert.equal(o.message, "The throw path may be reachable under the loop invariant; unchanged-source replay did not confirm a failure.");
  }
});

test("optional-widening retries commit exactly one throw check", async () => {
  const source = loop('if (flag) throw new Error("retry"); y = undefined;', "", "!flag");
  const [t] = targets(source);
  assert.equal(throws(t).length, 1); assert.equal(throws(t)[0].abstract, true);
  assert.ok(throws(t)[0].loop);
  assert.equal(out(await check(source)).status, "verified");
});

test("unsupported throw values and shadowed Error reject at the original throw span, even when dead", async () => {
  const values = ['new Error(flag ? "a" : "b")', 'new Error(`literal`)', 'new Error()',
    'new Error("a", "b")', 'Error("a")', 'new TypeError("a")', '"value"', 'flag',
    '(flag = false, new Error("a"))', 'new globalThis.Error("a")', 'new Error["x"]("a")'];
  const sources = values.map((v) => gate("!flag").replace('new Error("boom")', v));
  sources.push(gate("!flag").replace('if (flag)', 'const Error = 1; if (flag)'));
  sources.push(gate("!flag").replace('return 0;', 'const Error = 1; return 0;'));
  sources.push('// ensures true\nfunction Error() { return 0; }\n' + gate("!flag"));
  sources.push(gate("!flag").replace('{boolean} flag', '{boolean} flag @param {number} Error').replace('gate(flag)', 'gate(flag, Error)'));
  for (const source of sources) {
    const o = out(await check(source));
    assert.equal(o.status, "unsupported", source);
    assert.match(o.message, /Throw admission requires unshadowed/);
    assert.equal(o.span.start, source.indexOf("throw "));
    assert.equal(o.span.end, source.indexOf(";", o.span.start) + 1);
  }
  const caught = '// ensures true\nfunction caught() { try { throw new Error("caught"); } catch (e) { return 0; } }';
  const o = out(await check(caught)); assert.equal(o.status, "unsupported");
  assert.match(o.message, /TryStatement/); assert.equal(o.span.start, caught.indexOf("try "));
});

test("a private dropped-event mutant false-verifies and the native check detects it", async (t) => {
  const source = gate(), normal = out(await check(source)); mismatch(normal);
  const mutant = await privateVerifier(t, "drop");
  const report = await mutant.index.verify(source, opts);
  const m = out(report); assert.equal(m.status, "verified");
  assert.equal(m.inputs, undefined); assert.equal(m.result, undefined);
  const [target] = targets(source, mutant.source);
  assert.equal(throws(target).length, 0);
  const [provisional] = await mutant.proofs.solve([target], opts.timeoutMs);
  assert.equal(provisional.status, "verified");
  assert.deepEqual(provisional.witness, ["false"]);
  const native = new Function(`${source}\nreturn gate;`)();
  assert.equal(native(false), 0); assert.throws(() => native(true), /boom/);
  const assertSound = (o) => assert.ok(o.status !== "verified" || ![false, true].some((flag) => {
    try { native(flag); return false; } catch { return true; }
  }), "false-verification: native legal input throws");
  assertSound(normal);
  assert.throws(() => assertSound(m), /false-verification/);
  t.diagnostic(JSON.stringify({ mutant: m.status, witness: provisional.witness, nativeFalse: native(false), nativeTrue: "throws boom", detected: true }));
});

test("old reports and exact queries match P; its old evidence and receipts become stale", async (t) => {
  const parent = await privateVerifier(t, "parent");
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
  const a = targets(old), b = targets(old, parent.source);
  assert.deepEqual(legacyTargets(a), b);
  for (let j = 0; j < a.length; j++) {
    assert.deepEqual(phases(a[j]), parent.proofs.phases(b[j]));
    for (const [phase, index] of phases(a[j])) assert.deepEqual(obligation(a[j], phase, index), parent.proofs.obligation(b[j], phase, index));
  }
  assert.deepEqual(await check(old), await parent.index.verify(old, opts));
  const file = join(parent.scratch, "bug.js"), dir = join(parent.scratch, "cache");
  writeFileSync(file, "/** @param {number} x */\n// ensures Object.is(result,x)\nfunction id(x) { return x; }\n// ensures false\nfunction bug() { return 0; }");
  const oldReport = await parent.index.verifyFile(file, { evidence: true, cache: { dir }, timeoutMs: 20_000 });
  assert.equal(oldReport.cache.written.length, 1);
  assert.equal(parent.index.reproduce(file, oldReport.evidence).status, "reproduced");
  assert.notEqual(parent.manifest.runningIdentity().sha256, runningIdentity().sha256);
  const refused = reproduce(file, oldReport.evidence);
  assert.equal(refused.status, "invalid-evidence"); assert.match(refused.message, /model\/backend identity changed/);
  const plan = await affected(file, { cache: { dir } });
  assert.ok(plan.plan.targets.every((t) => t.needsSolve));
  const fresh = await verifyFile(file, { evidence: true, cache: { dir }, timeoutMs: 20_000 });
  assert.equal(fresh.cache.hits.length, 0); assert.equal(fresh.cache.solved.length, 2);
  assert.equal(reproduce(file, fresh.evidence).status, "reproduced");
  t.diagnostic(JSON.stringify({ oldIdentity: oldReport.evidence.identity, newIdentity: fresh.evidence.identity, oldEvidence: refused.status, oldReceiptHits: fresh.cache.hits.length }));
});
