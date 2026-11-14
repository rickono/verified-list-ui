// Ownership, rollback, and abstract-state probes for K Gate 3.
// Imports the immutable 00e5fc4 archive. Does not solve and does not edit it.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, cp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as heap from "/tmp/k-gate3-00e5fc4/verify/heap.mjs";
import * as data from "/tmp/k-gate3-00e5fc4/verify/data.mjs";
import { compile, parse } from "/tmp/k-gate3-00e5fc4/verify/source.mjs";

const out = [];
const note = (name, detail) => { out.push({ name, ...detail }); console.log("PASS", name, JSON.stringify(detail)); };
const snap = (reg) => ({
  own: Object.getOwnPropertyNames(reg).sort(),
  symbols: Object.getOwnPropertySymbols(reg).map(String),
  keys: [...reg.keys].sort(),
  exact: reg.exact.map((e) => ({ name: e.name, keys: [...e.keys].sort() })),
  asserts: [...reg.asserts],
  decls: [...reg.decls],
  roots: [...reg.roots],
  rootTypes: reg.rootTypes.map((t) => JSON.stringify(t)),
  used: reg.used ?? null,
  allocated: reg.allocated ?? null,
  writes: reg.writes ?? null,
  reads: reg.reads ?? null,
});
const ownershipOf = (state) => {
  const sym = Object.getOwnPropertySymbols(state).find((s) => state[s]?.writes instanceof Map);
  assert.ok(sym, "state has a private ownership record");
  return state[sym];
};
const compileSource = (source, file = "probe.ts") => compile([parse(file, source.replace(/(^|\n)function /g, "$1// ensures true\nfunction "))]);
const fn = (program, name) => {
  const target = program.targets.find((t) => t.name === name);
  assert.ok(target, `missing ${name}`);
  return target;
};
const expectFail = (source, pattern) => {
  assert.throws(() => compileSource(source), (error) => pattern.test(error.message));
};
const versionsIn = (text) => [...new Set([...text.matchAll(/\bheap_(?:[A-Za-z0-9]+_)*v(\d+)\b/g)].map((m) => Number(m[1])),
  [...text.matchAll(/\bheap_(?:array_)?havoc(\d+)\b/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
const gaps = (nums) => nums.length ? [...Array(nums.at(-1) + 1).keys()].filter((n) => n > 0 && !nums.includes(n)) : [];

{
  const unit = { declarations: [] };
  const entry = heap.entryState(unit);
  const reg = unit.heap;
  reg.used = true; reg.writes = true; reg.reads = false; reg.allocated = false;
  const committed = heap.write(unit, entry, "a", "x", data.literal(1));
  const committedNames = [...ownershipOf(committed).writes.keys()];
  const before = snap(reg);
  const beforeFinish = structuredClone(heap.finish(unit));
  const tx = heap.trial(unit);
  reg.used = false; reg.writes = false; reg.reads = true; reg.allocated = true;
  reg.asserts.push("discarded-assert");
  heap.refInput(unit, { kind: "object", fields: [{ name: "ghost_field", type: "boolean" }] }, "ghost");
  const discarded = [];
  let cursor = entry;
  for (let i = 0; i < 8; i++) cursor = heap.write(unit, cursor, "a", "temp_field", data.literal(i));
  discarded.push(cursor);
  const counter = reg.versions;
  const discardedNames = [...ownershipOf(cursor).writes.keys()];
  assert.ok(discardedNames.length >= 8);
  assert.ok(counter >= 9);
  tx.rollback();
  assert.equal(reg.versions, counter);
  assert.deepEqual(snap(reg).keys, before.keys);
  assert.deepEqual(snap(reg).exact, before.exact);
  assert.deepEqual(snap(reg).asserts, before.asserts);
  assert.deepEqual(snap(reg).decls, before.decls);
  assert.deepEqual(snap(reg).roots, before.roots);
  assert.deepEqual(snap(reg).rootTypes, before.rootTypes);
  assert.equal(reg.used, true);
  assert.equal(reg.writes, true);
  assert.equal(reg.reads, false);
  assert.equal(reg.allocated, false);
  assert.deepEqual(Object.getOwnPropertyNames(reg).sort(), before.own.sort());
  assert.deepEqual(heap.finish(unit), beforeFinish);
  assert.equal(heap.finish(unit).head.join("\n").includes(Buffer.from("ghost_field").toString("hex")), false);
  assert.equal(heap.finish(unit).head.join("\n").includes(Buffer.from("temp_field").toString("hex")), false);
  assert.throws(() => heap.loopWrites(entry, [cursor]), /unknown content version/);
  assert.throws(() => heap.loopWrites(entry, [], [cursor]), /unknown content version/);
  assert.deepEqual(heap.loopWrites(entry, [committed]).locations.map((l) => l.key), ["x"]);
  const live = heap.write(unit, entry, "a", "y", data.literal(2));
  assert.ok(reg.versions > counter);
  const liveName = [...ownershipOf(live).writes.keys()].at(-1);
  assert.equal(discardedNames.includes(liveName), false);
  assert.equal(committedNames.includes(liveName), false);
  assert.deepEqual(heap.loopWrites(entry, [live]).locations.map((l) => l.key), ["y"]);
  assert.throws(() => tx.rollback(), /already ended/);
  const again = heap.trial(unit);
  again.commit();
  assert.throws(() => again.commit(), /already ended/);
  note("registry-rollback", { counter, next: reg.versions, discarded: discardedNames.length, liveName, fields: before.own });
}

{
  const unit = { declarations: [] };
  const entry = heap.entryState(unit);
  const left = heap.write(unit, entry, "a", "x", data.literal(1));
  const right = heap.write(unit, entry, "b", "y", data.literal(2));
  const joined = heap.join(unit, "flag", left, right);
  const locations = heap.loopWrites(entry, [joined]).locations.map((l) => l.key).sort();
  assert.deepEqual(locations, ["x", "y"]);
  const owned = ownershipOf(joined);
  const victim = [...owned.writes.keys()][0];
  owned.writes.delete(victim);
  assert.throws(() => heap.loopWrites(entry, [joined]), /missing ownership/);
  note("join-both-arms-omitted-log", { locations, victim });
}

{
  const unit = { declarations: [] };
  const entry = heap.entryState(unit);
  const once = heap.write(unit, entry, "a", "x", data.literal(1));
  const again = heap.write(unit, once, "a", "x", data.literal(1));
  const restored = heap.write(unit, again, "a", "x", data.literal(0));
  const frame = heap.loopWrites(entry, [restored]);
  assert.deepEqual(frame.locations.map((l) => [l.ref, l.key, l.sort]), [["a", "x", "number"]]);
  assert.equal(frame.allocated, false);
  assert.equal(ownershipOf(restored).writes.size, 3);
  const second = [...ownershipOf(again).writes.keys()].at(-1);
  ownershipOf(restored).writes.delete(second);
  assert.throws(() => heap.loopWrites(entry, [restored]), /missing ownership/);
  const called = heap.havoc(unit, entry, [{ ref: "a", key: "x", sort: "number" }], false);
  const callFrame = heap.loopWrites(entry, [called.state]);
  assert.deepEqual(callFrame.locations.map((l) => l.key), ["x"]);
  const callName = [...ownershipOf(called.state).writes.keys()].at(-1);
  ownershipOf(called.state).writes.delete(callName);
  assert.throws(() => heap.loopWrites(entry, [called.state]), /missing ownership/);
  const head = heap.loopHead(unit, entry, [{ ref: "a", key: "x", sort: "number", kind: "field" }]);
  assert.equal(head.role, "current");
  assert.equal(heap.loopWrites(head, [head]).allocated, false);
  note("noop-restore-call-head", { versions: ownershipOf(restored).writes.size, head: head.role });
}

const freshAliasNested = `
function f(): number {
  const box = { inner: { x: 0 } };
  const alias = box;
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1)-real(i)
  while (i < 1) { alias.inner.x = 1; i++; }
  return box.inner.x;
}`;
{
  const target = fn(compileSource(freshAliasNested), "f");
  assert.equal(target.loops.length, 1);
  assert.equal(target.obligations.filter((o) => o.kind === "invariant-init").length, 1);
  assert.match(target.declarations, /heap_havoc/);
  assert.equal(target.footprint.length, 0);
  note("fresh-alias-nested-ref", { loops: target.loops.length, footprint: target.footprint });
}

expectFail(`function f(a:{x:number}, b:{x:number}): number {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1)-real(i)
  while (i < 1) { const t = i === 0 ? a : b; t.x = 1; i++; }
  return 0;
}`, /reference chosen inside the loop/);
note("changing-scalar-target-rejected", {});

{
  const target = fn(compileSource(`function f(a:{x:number}, b:{x:number}, flag:boolean): number {
    let i = 0;
    // invariant Number.isInteger(i) && 0 <= i && i <= 1
    // decreases real(1)-real(i)
    while (i < 1) { const t = flag ? a : b; t.x = 1; i++; }
    return 0;
  }`), "f");
  assert.match(target.declarations, /heap_havoc/);
  assert.match(target.declarations, /ite/);
  note("preloop-flag-target-closed", { havoc: true });
}

for (const [name, source, pattern] of [
  ["alloc-body", `function f(): number { let i=0; // invariant i===0\n// decreases 1\nwhile(i===0){ const xs=[1]; break; } return 0; }`, /allocate/],
  ["alloc-test", `function f(): number { let i=0; // invariant i===0\n// decreases 1\nwhile([1].length===1){ break; } return 0; }`, /allocate/],
  ["alloc-update", `function f(): number { const n=0; // invariant Number.isInteger(i) && 0<=i && i<=1\n// decreases real(1)-real(i)\nfor(let i=0;i<1;i=([1], i+1)){ } return n; }`, /allocate/],
  ["alloc-return", `function f(): number { let i=0; // invariant i===0\n// decreases 1\nwhile(i===0){ const xs=[1]; return xs[0]; } return 0; }`, /allocate/],
  ["alloc-transitive", `function leaf(): number { const box={x:1}; return box.x; }
function allocate(): number { return leaf(); }
function f(): number { let i=0; // invariant i===0\n// decreases 1\nwhile(i===0){ allocate(); break; } return 0; }`, /allocating/],
  ["ref-store", `function f(a:{box:{x:number}}): number { let i=0; // invariant i===0\n// decreases 1\nwhile(i===0){ a.box={x:1}; break; } return 0; }`, /Reference stores/],
  ["shape", `function f(xs:number[]): number { let i=0; // invariant i===0\n// decreases 1\nwhile(i===0){ xs.push(1); break; } return 0; }`, /length\/shape/],
  ["nested-loop", `function f(): number { let i=0; // invariant i===0\n// decreases 1\nwhile(i===0){ while(false){} break; } return 0; }`, /Nested loops/],
]) {
  expectFail(source, pattern);
  note(name, { rejected: pattern.source });
}

{
  const program = compileSource(`// modifies g.z
// requires g.z === 0
function ghost(g:{z:number}): number { g.z = 123456789; return 0; }
function f(g:{z:number}): number {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1)-real(i)
  while (i < 1) { i = ghost(g); }
  return i;
}`);
  const caller = fn(program, "f");
  const callee = fn(program, "ghost");
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleBE(123456789);
  const marker = bytes.toString("hex");
  assert.equal(caller.allocates, false);
  assert.equal(callee.allocates, false);
  assert.equal(callee.effects.kind, "writes");
  assert.equal(caller.declarations.includes(marker), false);
  assert.equal(callee.declarations.includes(marker), true);
  assert.equal(caller.obligations.filter((o) => o.kind === "invariant-init").length, 1);
  const kinds = caller.obligations.map((o) => o.kind);
  const init = kinds.indexOf("invariant-init");
  const call = kinds.indexOf("call");
  const inclusion = kinds.indexOf("frame-inclusion");
  assert.ok(init >= 0 && call > init && inclusion > call);
  assert.equal(caller.postconditions[init].includes("call_fact"), false);
  assert.equal(caller.postconditions[init].includes("heap_havoc"), false);
  assert.equal(caller.postconditions[inclusion].includes("call_fact"), false);
  assert.deepEqual(caller.callees, [callee.id]);
  note("callee-cache-and-init-order", { init, call, callerVersions: versionsIn(caller.declarations), calleeHasConstant: true });
}

{
  const target = fn(compileSource(`function positive(x:number): boolean { return x>0; }
function apply(p:(x:number)=>boolean, x:number): boolean { return p(x); }
function poke(a:{x:number, extra?:number}): number { a.x = 1; return 1; }
function f(a:{x:number}): boolean {
  let last = 0;
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // invariant ({x:1}).x === 1
  // invariant last===undefined || last===0
  // decreases real(1)-real(i)
  while (i < 1) { apply(positive, i); poke(a); last = undefined; i++; }
  return true;
}`), "f");
  const text = `${target.declarations}\n${target.postconditions.join("\n")}`;
  const present = (kind) => [...new Set([...text.matchAll(new RegExp(`\\b${kind}(\\d+)`, "g"))].map((m) => Number(m[1])))].sort((a, b) => a - b);
  const predicates = target.declarations.match(/declare-fun predicate\d+/g) ?? [];
  assert.equal(target.loops.length, 1);
  assert.equal(target.obligations.filter((o) => o.kind === "invariant-init").length, 1);
  assert.equal(predicates.length, 1);
  for (const [kind, nums] of [["loop", present("loop")], ["predicate", present("predicate")], ["call", present("call")]]) {
    assert.ok(nums.length > 0 && nums[0] > 0, `${kind} names were rewound or absent: ${nums}`);
    assert.equal(text.includes(`${kind}0`), false);
  }
  note("discarded-fresh-names", { loops: present("loop"), predicates: present("predicate"), calls: present("call"), obligations: target.obligations.map((o) => o.kind) });
}

{
  const file = "/tmp/k-gate3-00e5fc4/verify/review-scratch-source.mjs";
  try {
    const source = await readFile("/tmp/k-gate3-00e5fc4/verify/source.mjs", "utf8");
    const needle = "    if (widen.length || grow.length) {";
    assert.equal(source.split(needle).length, 2);
    const changed = source.replace(needle, `    globalThis.__ownReview.push({ grow: grow.length, widen: [...widen], trialSpec: unit.specRefs ?? 0,
      outerSpec: cx.unit.specRefs ?? 0, events: unit.events.map((e) => e.label.kind), checks: checks.length,
      returns: own.length, deps: [...unit.dependencies], functions: unit.functions.size, emitted: unit.emittedFunctions.size,
      probes: unit.probes.length, guards: unit.replayGuards.length, axioms: unit.pendingAxioms.length, loops: unit.loops.length });
    if (widen.length || grow.length) {`).replace("    cx.unit.specRefs = unit.specRefs;",
      "    cx.unit.specRefs = unit.specRefs;\n    globalThis.__ownReview.push({ published: cx.unit.specRefs ?? 0, events: cx.unit.events.map((e) => e.label.kind) });");
    await writeFile(file, changed);
    globalThis.__ownReview = [];
    const compiler = await import(pathToFileURL(file).href);
    const program = `// ensures true
function f(a:{x:number}): boolean {
  let last = 0;
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // invariant ({x:1}).x === 1
  // invariant last===undefined || last===0
  // decreases real(1)-real(i)
  while (i < 1) { a.x = 1; last = undefined; i++; }
  return true;
}`;
    compiler.compile([compiler.parse("spec.ts", program)]);
    const rows = globalThis.__ownReview;
    const attempts = rows.filter((row) => !("published" in row));
    const published = rows.filter((row) => "published" in row);
    assert.ok(attempts.length >= 2);
    assert.ok(attempts.slice(0, -1).every((row) => row.grow > 0 || row.widen.length > 0));
    assert.equal(attempts.at(-1).grow, 0);
    assert.equal(attempts.at(-1).widen.length, 0);
    assert.ok(attempts.every((row) => row.outerSpec === 0));
    assert.ok(attempts.every((row) => row.trialSpec > 0));
    assert.equal(published.length, 1);
    assert.equal(published[0].published, attempts.at(-1).trialSpec);
    assert.equal(published[0].events.filter((kind) => kind === "invariant-init").length, 1);
    assert.equal(attempts.at(-1).loops, 0);
    assert.ok(attempts.at(-1).guards >= 1);
    note("spec-ref-commits-once", { attempts: attempts.map(({ trialSpec, outerSpec, grow, widen, events, checks, returns, deps, functions, probes, guards, axioms }) =>
      ({ trialSpec, outerSpec, grow, widen, events, checks, returns, deps, functions, probes, guards, axioms })), published: published[0].published });
  } finally {
    delete globalThis.__ownReview;
    await rm(file, { force: true });
  }
}

{
  const target = fn(compileSource(`function f(a:{x:number}, b:{y:number}, flag:boolean): boolean {
    let i = 0;
    // invariant Number.isInteger(i) && 0 <= i && i <= 1
    // decreases real(1)-real(i)
    while (i < 1) { if (flag) a.x = 1; else b.y = 2; i++; }
    return true;
  }`), "f");
  assert.match(target.declarations, /input_0_ref/);
  assert.match(target.declarations, /input_1_ref/);
  assert.match(target.declarations, /heap_havoc/);
  const inits = target.obligations.filter((o) => o.kind === "invariant-init");
  assert.equal(inits.length, 1);
  note("compiler-join-frame", { obligations: target.obligations.map((o) => o.kind) });
}

{
  const target = fn(compileSource(`function f(a:{x:number}): boolean {
    let i = 0;
    // invariant Number.isInteger(i) && 0 <= i && i <= 1
    // decreases real(1)-real(i)
    while (i < 1) { a.x = 1; break; }
    return true;
  }`), "f");
  assert.equal(/heap_havoc/.test(target.declarations), false);
  assert.match(target.declarations, /_v\d+/);
  assert.equal(target.loops.length, 1);
  note("break-exit-not-head-frame", { versions: versionsIn(target.declarations) });
}

{
  const target = fn(compileSource(`function f(): number {
    const xs = [0];
    // invariant Number.isInteger(i) && 0 <= i && i <= 1
    // decreases real(1)-real(i)
    for (let i = 0; i < 1; (xs[0] = 1, i++)) { continue; }
    return xs[0];
  }`), "f");
  assert.match(target.declarations, /heap_array_havoc|heap_havoc/);
  note("continue-update-back-edge", { versions: versionsIn(target.declarations) });
}

{
  const target = fn(compileSource(`// requires xs.length > 0
// requires Number.isInteger(n) && 0 <= n && n <= 4294967295
// modifies xs
// ensures true
function f(xs:number[], n:number): number {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1)-real(i)
  while (i < 1) { xs[n] = 1; i++; }
  return 0;
}`), "f");
  const kinds = target.obligations.map((o) => o.kind);
  assert.ok(kinds.includes("store-domain"));
  assert.ok(kinds.indexOf("store-domain") < kinds.lastIndexOf("frame-write") || kinds.includes("frame-write"));
  assert.equal(data.indexBits, undefined);
  note("store-domain-boundary", { kinds });
}

{
  const dir = await mkdtemp(join(tmpdir(), "k-own-mutant-"));
  try {
    await cp("/tmp/k-gate3-00e5fc4/verify", join(dir, "verify"), { recursive: true, filter: (p) => !p.includes("/reports") });
    await symlink(fileURLToPath(new URL("/tmp/k-gate3-00e5fc4/node_modules", import.meta.url)), join(dir, "node_modules"));
    const file = join(dir, "verify/heap.mjs");
    const text = await readFile(file, "utf8");
    const from = "return logged(next, [name]);";
    assert.equal(text.split(from).length, 2);
    await writeFile(file, text.replace(from, "return next;"));
    const mutated = await import(pathToFileURL(join(dir, "verify/source.mjs")).href);
    const source = `// ensures true
function f(a:{x:number}): boolean {
      let i = 0;
      // invariant Number.isInteger(i) && 0 <= i && i <= 1
      // decreases real(1)-real(i)
      while (i < 1) { a.x = 1; i++; }
      return true;
    }`;
    assert.doesNotThrow(() => compileSource(source));
    assert.throws(() => mutated.compile([mutated.parse("mutant.ts", source)]), /Heap write audit: missing ownership/);
    note("compiler-omitted-log-mutant", { detected: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ probes: out.length }, null, 2));
