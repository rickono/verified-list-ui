import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { verify, verifyFile, affected, reproduce } from "../../verify/index.mjs";
import { openCache, proofKey, witnessModels } from "../../verify/cache.mjs";
import { validWitness } from "../../verify/backend.mjs";
import { runningIdentity } from "../../verify/manifest.mjs";
import { compile } from "../../verify/source.mjs";
import { load } from "../../verify/modules.mjs";

const BASE = {
  "helper.ts": "// requires x > 0\n// ensures result > 0\nexport const positive = (x: number) => x;\n// ensures true\nexport const echo = (x: number) => x;\n",
  "specs.ts": "// @spec\n// ensures true\nexport const ok = (x: number) => x >= 0;\n",
  "types.ts": "export type Point = { x: number };\n",
  "entry.ts": `import { positive, echo } from './helper.ts';
import { ok } from './specs.ts';
import type { Point } from './types.ts';
// requires y > 1
// ensures result > 0
export const caller = (y: number) => positive(y);
// requires x >= 0
// ensures ok(result)
export const keep = (x: number) => x;
// ensures Object.is(result, p.x)
export const getX = (p: Point) => p.x;
// ensures true
export const useEcho = (y: number) => echo(y);
// ensures Object.is(result, z)
export const unrelated = (z: number) => z;
`,
};
const names = (ids) => ids.map((id) => id.split("#").at(-1)).sort();
const out = (r, fn) => r.outcomes.find((o) => o.fn === fn);
const statuses = (r) => r.outcomes.map(({ fn, status, reason }) => ({ fn, status, reason }));
const allVerified = (r) => r.outcomes.forEach((o) => assert.equal(o.status, "verified", JSON.stringify(o)));
const hex = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
function setup(t, files = BASE) {
  const root = mkdtempSync(join(tmpdir(), "jsverify-p-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (files) => { for (const [name, text] of Object.entries(files)) { const p = join(root, name); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); } };
  write(files);
  const entry = join(root, "entry.ts"), dir = join(root, "cache");
  return { root, entry, dir, write, check: (opts = {}) => verifyFile(entry, { timeoutMs: 30_000, cache: { dir }, ...opts }) };
}
const receipt = (report, dir, fn) => {
  const [id, key] = Object.entries(report.cache.keys).find(([id]) => id.endsWith(`#${fn}`));
  const file = openCache(dir, { mode: "readonly" }).path(key);
  return { id, key, file, value: JSON.parse(readFileSync(file, "utf8")) };
};

test("cold/warm/audit, API default, source/label changes and equivalent-query sharing", async (t) => {
  const p = setup(t), baseline = await verifyFile(p.entry, { timeoutMs: 30_000 });
  assert.equal(baseline.cache, undefined);
  const cold = await p.check(); allVerified(cold);
  assert.deepEqual(statuses(cold), statuses(baseline));
  assert.equal(cold.cache.solved.length, 8); assert.equal(cold.cache.written.length, 8);
  const warm = await p.check(); assert.equal(warm.cache.hits.length, 8); assert.deepEqual(warm.cache.solved, []);
  assert.deepEqual(warm.outcomes, cold.outcomes); assert.match(warm.trusted.at(-1), /integrity.*no certificates/);
  const audit = await p.check({ cache: { dir: p.dir, mode: "audit" } });
  assert.equal(audit.cache.solved.length, 8); assert.deepEqual(audit.cache.disagreements, []); assert.deepEqual(audit.cache.written, []);
  p.write({ ...BASE, "entry.ts": "\n// offset only\n" + BASE["entry.ts"] + "// ensures Object.is(result,w)\nexport const added=(w:number)=>w;" });
  const moved = await p.check(); allVerified(moved); assert.equal(moved.cache.solved.length, 0);
  assert.notEqual(moved.graphSha256, cold.graphSha256);
  const src = "// ensures Object.is(result,x)\nconst id=(x:number)=>x;";
  const a = await verify(src, { file: "a.ts", cache: { dir: p.dir } });
  const b = await verify(src, { file: "renamed.ts", cache: { dir: p.dir } });
  assert.deepEqual(Object.values(a.cache.keys), Object.values(b.cache.keys)); assert.equal(b.cache.hits.length, 1);
  const change = await verify(src.replace("=>x;", "=>x*1;"), { cache: { dir: p.dir } });
  assert.notDeepEqual(Object.values(a.cache.keys), Object.values(change.cache.keys));
});

test("source, spec, helper contract/shape and type changes invalidate exactly the translated obligations", async (t) => {
  const p = setup(t), cold = await p.check(); allVerified(cold);
  const cases = [
    ["helper.ts", "=> x;", "=> x * 1;", ["positive"]],
    ["helper.ts", "requires x > 0", "requires x > 1", ["caller", "positive"]],
    ["helper.ts", "ensures result > 0", "ensures result > -1", ["caller", "positive"]],
    ["helper.ts", "export const echo = (x: number) => x;", "export const echo = (x: number) => x > 0;", ["useEcho"]],
    ["specs.ts", "x >= 0;", "x >= 0 && x !== 7;", ["keep"]],
    ["types.ts", "{ x: number }", "{ x: number, y: number }", ["getX"]],
  ];
  for (const [file, from, to, expected] of cases) {
    p.write({ ...BASE, [file]: BASE[file].replace(from, to) });
    const plan = await affected(p.entry, { cache: { dir: p.dir } });
    assert.deepEqual(names(plan.plan.targets.filter((t) => t.needsSolve).map((t) => t.target)), expected, file + to);
    const run = await p.check({ cache: { dir: p.dir, mode: "readonly" } });
    assert.deepEqual(names(run.cache.solved), expected);
    const plain = await verifyFile(p.entry, { timeoutMs: 30_000 });
    assert.deepEqual(statuses(run), statuses(plain));
    const audit = await p.check({ cache: { dir: p.dir, mode: "audit" } });
    assert.deepEqual(audit.cache.disagreements, []);
  }
});

test("tsconfig redirects preserve equal queries and invalidate changed contracts", async (t) => {
  const project = {
    "entry.ts": "import { positive } from '@lib/helper';\n// requires y>1\n// ensures result>0\nexport const caller=(y:number)=>positive(y);",
    "a.ts": BASE["helper.ts"].split("// ensures true")[0],
    "b.ts": BASE["helper.ts"].split("// ensures true")[0],
    "c.ts": BASE["helper.ts"].split("// ensures true")[0].replace("x > 0", "x > 2"),
  };
  const p = setup(t, project), tsconfig = join(p.root, "tsconfig.json");
  const redirect = (f) => p.write({ "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@lib/helper": [f] } } }) });
  redirect("a.ts"); const cold = await p.check({ tsconfig }); allVerified(cold);
  redirect("b.ts"); const same = await p.check({ tsconfig }); assert.equal(same.cache.solved.length, 0); assert.notEqual(same.graphSha256, cold.graphSha256);
  redirect("c.ts"); const changed = await p.check({ tsconfig });
  assert.deepEqual(names(changed.cache.solved), ["caller", "positive"]); assert.equal(out(changed, "caller").status, "counterexample");
});

test("a current broken callee gates an otherwise reusable caller, including target selection", async (t) => {
  const p = setup(t); await p.check();
  p.write({ "helper.ts": BASE["helper.ts"].replace("=> x;", "=> x - 1;") });
  const r = await p.check({ targets: ["caller"] });
  assert.deepEqual(names(r.selection.included), ["caller", "positive"]);
  assert.deepEqual(names(r.cache.hits), ["caller"]); assert.deepEqual(names(r.cache.solved), ["positive"]);
  assert.equal(out(r, "positive").status, "counterexample"); assert.equal(out(r, "caller").reason, "dependency");
  assert.deepEqual(names(r.cache.dependencies.find((x) => x.target.endsWith("#caller")).blockedBy), ["positive"]);
  await assert.rejects(p.check({ targets: ["missing"] }), /Unknown proof target/);
});

test("readonly/audit/plan never create an absent cache; failures and residuals never hit", async (t) => {
  const p = setup(t, { "entry.ts": `// requires n>=0
// ensures result<100
export const bug=(n:number)=>n*2;
// requires false
// ensures true
export const vacuous=(n:number)=>n;
// ensures Object.is(result,n)
export const fine=(n:number)=>n;` });
  for (const mode of ["readonly", "audit"]) {
    const dir = join(p.root, mode, "missing"); const r = await p.check({ cache: { dir, mode } });
    assert.equal(existsSync(dirname(dir)), false); assert.equal(r.cache.written.length, 0);
  }
  const dir = join(p.root, "plan", "absent");
  const plan = await affected(p.entry, { cache: { dir } }); assert.equal(plan.plan.noSolver, true); assert.equal(existsSync(dirname(dir)), false);
  for (let i = 0; i < 2; i++) {
    const r = await p.check(); assert.deepEqual(names(r.cache.written), i ? [] : ["fine"]);
    assert.equal(r.cache.hits.some((id) => /#(bug|vacuous)$/.test(id)), false);
  }
  const absent = join(p.root, "unsupported");
  const unsupported = await verify("// ensures true\nconst f=(x:string)=>x;", { cache: { dir: absent } });
  assert.equal(unsupported.outcomes[0].status, "unsupported"); assert.equal(existsSync(absent), false);
  const timeout = await verify("// ensures Object.is(result,n)\nconst f=(n:number)=>n;", { timeoutMs: 1, cache: { dir: join(p.root, "tiny") } });
  assert.equal(timeout.outcomes[0].status, "unknown"); assert.deepEqual(timeout.cache.written, []);
});

test("judge's nine malformed/oversized forgeries are rejected, re-solved once and repaired", async (t) => {
  const p = setup(t, { "entry.ts": `type Point={value:number,label:number};
// modifies point.value
// ensures Object.is(point.value,value)
export function setValue(point:Point,value:number){point.value=value;return point;}
// ensures result===pred(x)
export const apply=(pred:(v:number)=>boolean,x:number)=>pred(x);
// ensures Object.is(result,xs.length)
export const len=(xs:readonly number[])=>xs.length;` });
  const cold = await p.check(); allVerified(cold);
  const targets = new Map(compile(load(p.entry).records).targets.map((t) => [t.name, t]));
  const fixtures = [
    ["setValue", (w) => w.with(2, "garbage")], ["setValue", (w) => w.with(2, {})],
    ["setValue", (w) => w.with(0, "x")], ["setValue", (w) => w.with(0, "7")],
    ["apply", (w) => w.with(0, "garbage")], ["apply", (w) => w.with(0, {})],
    ["len", (w) => w.with(0, [hex(0)])],
    ...[257, 200_000].map((n) => ["len", (w) => { w[1].nodes[w[0]].values = Array(n).fill(["num", hex(0)]); return w; }]),
    ["setValue", (w) => { w[2].nodes[w[0]].fields.value = ["bool", "true"]; return w; }],
  ];
  for (const [fn, mutate] of fixtures) {
    const original = receipt(cold, p.dir, fn), forged = { ...original.value, witness: mutate(structuredClone(original.value.witness)) };
    assert.ok(validWitness(witnessModels(targets.get(fn)), forged.witness));
    writeFileSync(original.file, JSON.stringify(forged));
    const audit = await p.check({ targets: [fn], cache: { dir: p.dir, mode: "audit" } });
    assert.ok(audit.cache.disagreements.some((d) => d.kind === "validation")); assert.deepEqual(audit.cache.written, []);
    assert.deepEqual(JSON.parse(readFileSync(original.file, "utf8")), forged);
    const repaired = await p.check({ targets: [fn] }); allVerified(repaired);
    assert.equal(repaired.cache.rejected[0].reason, "witness-shape"); assert.deepEqual(names(repaired.cache.solved), [fn]); assert.deepEqual(names(repaired.cache.written), [fn]);
    assert.equal(validWitness(witnessModels(targets.get(fn)), receipt(cold, p.dir, fn).value.witness), undefined);
    const warm = await p.check({ targets: [fn] }); assert.deepEqual(names(warm.cache.hits), [fn]);
  }
});

test("unparseable, schema, identity, key, format and replay failures are repaired; audit reports them", async (t) => {
  const p = setup(t, { "entry.ts": "// requires x>0\n// ensures result>0\nexport const f=(x:number)=>x;" });
  const cold = await p.check(), original = receipt(cold, p.dir, "f");
  const corruptions = ["{", JSON.stringify({ ...original.value, status: "verified" }), JSON.stringify({ ...original.value, identity: "0".repeat(64) }), JSON.stringify({ ...original.value, key: "0".repeat(64) }), JSON.stringify({ ...original.value, format: 999 }), JSON.stringify({ ...original.value, witness: [hex(0)] })];
  for (const text of corruptions) {
    writeFileSync(original.file, text);
    const audit = await p.check({ cache: { dir: p.dir, mode: "audit" } });
    assert.equal(audit.cache.disagreements.length, 1); assert.equal(readFileSync(original.file, "utf8"), text);
    const repaired = await p.check(); allVerified(repaired); assert.equal(repaired.cache.solved.length, 1); assert.equal(repaired.cache.rejected.length, 1); assert.equal(repaired.cache.written.length, 1);
    const warm = await p.check(); assert.equal(warm.cache.solved.length, 0);
  }
});

test("benign forgery is a visible cache-integrity trust assumption; audit independently catches stale naive spec evidence", async (t) => {
  const p = setup(t), cold = await p.check(), original = receipt(cold, p.dir, "keep");
  const naive = (t) => createHash("sha256").update(JSON.stringify([t.executable, t.requires, t.ensures])).digest("hex");
  const before = compile(load(p.entry).records).targets.find((t) => t.name === "keep");
  p.write({ "specs.ts": BASE["specs.ts"].replace("x >= 0;", "x >= 0 && x !== 7;") });
  const after = compile(load(p.entry).records).targets.find((t) => t.name === "keep");
  assert.equal(naive(before), naive(after));
  const identity = runningIdentity().sha256, key = proofKey(after, identity);
  assert.notEqual(key, original.key);
  // Deliberately transplant old evidence under the current key, modeling the
  // stale answer a naive key would return. It is not a solver certificate.
  const forged = { ...original.value, key, witness: [hex(0)] };
  const file = openCache(p.dir).path(key); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(forged));
  const hit = await p.check({ targets: ["keep"], cache: { dir: p.dir, mode: "readonly" } });
  assert.equal(out(hit, "keep").status, "verified"); assert.match(hit.cache.trust, /Readonly does not authenticate/);
  const audit = await p.check({ targets: ["keep"], cache: { dir: p.dir, mode: "audit" } });
  assert.equal(out(audit, "keep").status, "counterexample"); assert.ok(audit.cache.disagreements.some((d) => d.kind === "logical"));
});

test("bug evidence keeps original witness, greedily shrinks and natively reproduces; stale or forged evidence refuses", async (t) => {
  const source = "// requires n>=0\n// ensures result<100\nexport const bug=(n:number)=>n*2;";
  const p = setup(t, { "entry.ts": source });
  const r = await p.check({ evidence: true }); assert.equal(out(r, "bug").status, "counterexample");
  const artifact = JSON.parse(JSON.stringify(r.evidence)), item = Object.values(artifact.witnesses)[0];
  assert.ok(item.witness); assert.equal(item.shrunk.greedy, true); assert.ok(item.shrunk.replays <= item.shrunk.limit);
  const reproduced = reproduce(p.entry, artifact); assert.equal(reproduced.status, "reproduced");
  assert.equal(reproduced.outcomes[0].inputs.n, "50");
  assert.equal(reproduce(p.entry, artifact, { shrunk: false }).status, "reproduced");
  const invalid = structuredClone(artifact); Object.values(invalid.witnesses)[0].witness = [];
  assert.equal(reproduce(p.entry, invalid).status, "invalid-evidence");
  const key = structuredClone(artifact); Object.values(key.witnesses)[0].key = "0".repeat(64);
  assert.equal(reproduce(p.entry, key).status, "invalid-evidence");
  const identity = { ...artifact, identity: "0".repeat(64) }; assert.equal(reproduce(p.entry, identity).status, "invalid-evidence");
  p.write({ "entry.ts": source + "\n// changed source" }); assert.equal(reproduce(p.entry, artifact).status, "stale");
});

test("heap and predicate counterexamples reproduce and explicitly skip unsupported shrinking", async (t) => {
  for (const source of ["// ensures true\nexport function bug(a:{x:number}){a.x=1;return true;}", "// ensures result\nexport function bug(p:(x:number)=>boolean){return p(1)===p(2);}"]) {
    const p = setup(t, { "entry.ts": source }); const r = await p.check({ evidence: true });
    assert.equal(out(r, "bug").status, "counterexample"); const item = Object.values(r.evidence.witnesses)[0];
    assert.match(item.shrunk.skipped, /heap.*predicate/); assert.equal(reproduce(p.entry, r.evidence).status, "reproduced");
  }
});
