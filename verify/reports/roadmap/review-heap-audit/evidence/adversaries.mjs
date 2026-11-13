// Independent heap-audit adversaries against immutable archives.
// No solver. Parent is eaf23c0; child is 7444276.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as child from "/tmp/heap-review/child/verify/heap.mjs";
import * as parent from "/tmp/heap-review/parent/verify/heap.mjs";
import * as data from "/tmp/heap-review/child/verify/data.mjs";
import { single } from "/tmp/heap-review/child/verify/modules.mjs";
import { compile as compileChild } from "/tmp/heap-review/child/verify/source.mjs";
import { compile as compileParent } from "/tmp/heap-review/parent/verify/source.mjs";
import { cases, nativeRows } from "/tmp/heap-review/child/tests/verify/fixtures/heap-write-cases.mjs";

const findings = [];
const note = (name, detail) => {
  const row = { check: name, ...detail };
  if (Object.hasOwn(row, "name")) { row.errorName = row.name; delete row.name; }
  findings.push(row);
  console.log(JSON.stringify(row));
};
const pass = (name, detail = {}) => note(name, { result: "pass", ...detail });
const fail = (name, detail) => note(name, { result: "FAIL", ...detail });

const symOf = (state) => Object.getOwnPropertySymbols(state).find((s) => s.description === "heap write ownership");
const writesOf = (state) => state[symOf(state)].writes;
const ownerOf = (state) => state[symOf(state)].owner;
const fresh = (h = child) => { const unit = { declarations: [] }; return { h, unit, entry: h.entryState(unit) }; };
const loc = (ref, key = "x", sort = "number", kind = key === "@elements" ? "elements" : "field") => ({ ref, key, sort, kind });
const frame = (h, head, backs, exits) => h.loopWrites(head, backs, exits);
const mustThrow = (fn, pattern) => {
  try { const value = fn(); return { threw: false, value }; }
  catch (e) { const ok = pattern ? pattern.test(String(e)) : true; return { threw: true, ok, name: e.name, message: String(e.message ?? e).slice(0, 240) }; }
};
const decls = (unit, h) => {
  const done = h.finish(unit);
  return { ops: unit.declarations.join("\n"), head: done.head.join("\n"), tail: done.tail.join("\n") };
};

function check(name, cond, detail) {
  if (cond) pass(name, detail); else fail(name, detail);
}

// --- parent/child SMT for source-shaped operations ---
function runShape(h, footprint) {
  const { unit, entry } = fresh(h);
  const written = h.write(unit, entry, "a", "x", data.literal(1));
  const indexed = h.writeIndex(unit, written, "xs", "#x00000000", data.literal(-0));
  const made = h.alloc(unit, indexed, data.record([["y", { hasKey: "true", value: data.bool("true") }]]));
  const arr = h.alloc(unit, made.state, data.array([data.literal(0)]));
  const joined = h.join(unit, "flag", indexed, written);
  const summary = h.havoc(unit, arr.state, footprint, false).state;
  const refCall = h.havoc(unit, arr.state, footprint, true).state;
  const text = decls(unit, h);
  return { text, summaryRole: summary.role, refNext: refCall.next, entryNext: entry.next, joinedSame: joined === indexed || joined === written };
}

const sourceFootprint = [
  { ref: "xs", key: "@elements", sort: "number", path: ["xs"] },
  { ref: "a", key: "x", sort: "number", path: ["a", "x"] },
];
const parentShape = runShape(parent, sourceFootprint);
const childShape = runShape(child, sourceFootprint);
check("source-shaped declarations match parent",
  parentShape.text.ops === childShape.text.ops && parentShape.text.head === childShape.text.head && parentShape.text.tail === childShape.text.tail,
  { opsEqual: parentShape.text.ops === childShape.text.ops, headEqual: parentShape.text.head === childShape.text.head, tailEqual: parentShape.text.tail === childShape.text.tail, opsBytes: childShape.text.ops.length });
check("source-shaped ops introduce no assert", !childShape.text.ops.includes("(assert"), { sample: childShape.text.ops.slice(0, 120) });

function havocOnly(h, footprint) {
  const { unit, entry } = fresh(h);
  const summary = h.havoc(unit, entry, footprint, false).state;
  return { ops: unit.declarations.join("\n"), array: { ...summary.array }, numKeys: [...summary.num.keys()] };
}
const marked = [{ ref: "obj", key: "@elements", sort: "number", kind: "field" }];
const raw = [{ ref: "obj", key: "@elements", sort: "number" }];
const parentMarked = havocOnly(parent, marked);
const childMarked = havocOnly(child, marked);
const parentRaw = havocOnly(parent, raw);
const childRaw = havocOnly(child, raw);
check("kind-field @elements is a field on the child and an array on the parent",
  childMarked.numKeys.includes("@elements") && !("num" in childMarked.array) && parentMarked.numKeys.length === 0 && parentMarked.array.num,
  { childNum: childMarked.numKeys, childArray: childMarked.array, parentNum: parentMarked.numKeys, parentArrayKeys: Object.keys(parentMarked.array) });
check("kind-absent @elements footprint matches parent array havoc",
  parentRaw.ops === childRaw.ops && !childRaw.numKeys.includes("@elements") && childRaw.array.num,
  { equal: parentRaw.ops === childRaw.ops, childArray: childRaw.array.num, childNum: childRaw.numKeys });

// permission stays key-based and identical
{
  const locs = [loc("a", "x"), loc("xs", "@elements")];
  check("permission text unchanged",
    parent.permission(locs, "r", "x") === child.permission(locs, "r", "x")
    && parent.permission(locs, "r", "@elements") === child.permission(locs, "r", "@elements"));
}

// --- audit adversaries ---
{
  const { h, unit, entry } = fresh();
  const sym = symOf(entry);
  const desc = Object.getOwnPropertyDescriptor(entry, sym);
  const spread = { ...entry, role: "current" };
  check("ownership symbol is enumerable and survives a role-only spread",
    desc.enumerable === true && spread[sym] === entry[sym] && writesOf(spread).size === 0);

  const head = h.loopHead(unit, entry, []);
  check("empty loopHead does not alias a later write into the entry log", writesOf(entry).size === 0 && writesOf(head).size === 0);
  const once = h.write(unit, head, "a", "x", data.literal(1));
  const twice = h.write(unit, once, "a", "x", data.literal(2));
  check("entry log stays empty after child writes", writesOf(entry).size === 0 && writesOf(head).size === 0 && writesOf(twice).size === 2);
  const repeated = frame(h, head, [twice]);
  check("repeated same-cell writes dedupe to one checked location",
    repeated.locations.length === 1 && repeated.allocated === false && repeated.locations[0].kind === "field");
  const dropSecond = { ...twice, [sym]: { owner: ownerOf(twice), writes: new Map([...writesOf(twice)].filter(([name]) => name !== twice.num.get("x"))) } };
  const dropped = mustThrow(() => h.loopWrites(head, [dropSecond]));
  check("deleting only the later same-cell version fails closed", dropped.threw && dropped.ok && /missing ownership/.test(dropped.message), dropped);

  const before = h.write(unit, entry, "p", "x", data.literal(0));
  const cut = h.loopHead(unit, before, [loc("p")]);
  const again = h.write(unit, cut, "p", "x", data.literal(3));
  const seen = frame(h, cut, [again]);
  check("prior head history does not hide the new store", seen.locations.length === 1 && seen.locations[0].ref === "p" && !frame(h, cut, [cut]).locations.length);
  const unloggedNew = { ...again, [sym]: { owner: ownerOf(again), writes: new Map(writesOf(cut)) } };
  const hidden = mustThrow(() => h.loopWrites(cut, [unloggedNew]));
  check("new version without its own log is not an empty frame", hidden.threw && /missing ownership/.test(hidden.message), hidden);

  const value = h.focus(unit, cut, { sort: "object", ref: "p", type: { kind: "object", fields: [{ name: "x", type: "number" }] } }).fields.get("x").value;
  const mid = h.write(unit, cut, "p", "x", data.literal(7));
  const restored = h.write(unit, mid, "p", "x", value);
  check("restored store still reports the cell", frame(h, cut, [restored]).locations.length === 1);
  const dropMid = { ...restored, [sym]: { owner: ownerOf(restored), writes: new Map([...writesOf(restored)].filter(([name]) => name !== mid.num.get("x"))) } };
  const midMiss = mustThrow(() => h.loopWrites(cut, [dropMid]));
  check("restored store fails closed when the intervening version is unlogged", midMiss.threw && /missing ownership/.test(midMiss.message), midMiss);
  const noop = h.write(unit, cut, "p", "x", value);
  check("no-op store creates a distinct version and a location", noop.num.get("x") !== cut.num.get("x") && frame(h, cut, [noop]).locations.length === 1);
}

{
  const { h, unit, entry } = fresh();
  const head = h.loopHead(unit, entry, []);
  const a = h.writeIndex(unit, h.write(unit, head, "a", "x", data.literal(1)), "xs", "#x00000000", data.literal(1));
  const b = h.writeIndex(unit, h.write(unit, head, "b", "y", data.bool("false")), "ys", "#x00000001", data.bool("true"));
  const joined = h.join(unit, "flag", a, b);
  const both = frame(h, head, [joined]);
  const keys = new Set(both.locations.map((l) => `${l.kind}:${l.ref}:${l.key}:${l.sort}`));
  check("symbolic join keeps both arm locations",
    ["field:a:x:number", "elements:xs:@elements:number", "field:b:y:boolean", "elements:ys:@elements:boolean"].every((k) => keys.has(k)) && both.allocated === false,
    { keys: [...keys] });
  for (const [label, arm] of [["a", a], ["b", b]]) {
    const other = arm === a ? b : a;
    const forged = { ...joined, [symOf(joined)]: { owner: ownerOf(joined), writes: new Map(writesOf(other)) } };
    const got = mustThrow(() => h.loopWrites(head, [forged]));
    const onExit = mustThrow(() => h.loopWrites(head, [], [forged]));
    check(`forged join without arm ${label} fails on a back edge and an exit`, got.threw && onExit.threw && /missing ownership/.test(got.message) && /missing ownership/.test(onExit.message), { got, onExit });
  }
  check("concrete joins keep one arm", h.join(unit, "true", a, b) === a && h.join(unit, "false", a, b) === b);
  const back = h.write(unit, head, "a", "x", data.literal(4));
  const exit = h.write(unit, head, "z", "x", data.literal(5));
  const mixed = frame(h, head, [back], [exit]);
  check("exit location is audited out of the frame", mixed.locations.length === 1 && mixed.locations[0].ref === "a" && mixed.allocated === false);
  const badExit = { ...exit, num: new Map(exit.num).set("x", "not_a_version") };
  const bad = mustThrow(() => h.loopWrites(head, [back], [badExit]));
  check("corrupt exit fails closed instead of returning the back frame", bad.threw && /unknown content version/.test(bad.message), bad);
}

{
  const { h, unit, entry } = fresh();
  const made = h.alloc(unit, entry, data.record([["@elements", { hasKey: "true", value: data.literal(0) }], ["n", { hasKey: "true", value: data.literal(0) }]]));
  const arr = h.alloc(unit, made.state, data.array([data.literal(0)]));
  const head = h.loopHead(unit, arr.state, []);
  const after = h.write(unit, head, made.value.ref, "@elements", data.literal(1));
  const indexed = h.writeIndex(unit, after, arr.value.ref, "#x00000000", data.literal(2));
  const got = frame(h, head, [indexed]);
  const kinds = got.locations.map((l) => `${l.kind}:${l.key}:${l.ref}`);
  check("record key @elements stays a field beside real array elements",
    kinds.includes(`field:@elements:${made.value.ref}`) && kinds.includes(`elements:@elements:${arr.value.ref}`) && got.allocated === false,
    { kinds });
  const next = h.loopHead(unit, arr.state, got.locations);
  check("cutpoint havoc uses the discriminator both ways",
    next.num.get("@elements") !== arr.state.num.get("@elements") && next.array.num !== arr.state.array.num && frame(h, next, [next]).locations.length === 0,
    { fieldChanged: next.num.get("@elements") !== arr.state.num.get("@elements"), arrayChanged: next.array.num !== arr.state.array.num });
  const sourceLike = h.loopHead(unit, arr.state, [{ ref: made.value.ref, key: "@elements", sort: "number", path: ["a"] }]);
  check("source-like footprint without kind still selects array havoc",
    sourceLike.array.num !== arr.state.array.num && sourceLike.num.get("@elements") === arr.state.num.get("@elements"));
}

{
  const { h, unit, entry } = fresh();
  const object = h.alloc(unit, entry, data.record([["x", { hasKey: "true", value: data.literal(0) }]]));
  const array = h.alloc(unit, object.state, data.array([data.bool("false")]));
  const head = h.loopHead(unit, array.state, []);
  const bodyAlloc = h.alloc(unit, head, data.record([["x", { hasKey: "true", value: data.literal(1) }]]));
  const onlyAlloc = frame(h, head, [bodyAlloc.state]);
  check("in-loop record allocation sets allocated and adds no field location", onlyAlloc.allocated === true && onlyAlloc.locations.length === 0, onlyAlloc);
  const written = h.write(unit, bodyAlloc.state, bodyAlloc.value.ref, "x", data.literal(2));
  const both = frame(h, head, [written]);
  check("later store of a fresh record is visible and still allocated", both.allocated === true && both.locations.length === 1 && both.locations[0].kind === "field", { locations: both.locations });
  const exitAlloc = h.alloc(unit, head, data.array([]));
  const exits = frame(h, head, [head], [exitAlloc.state]);
  check("exit-only allocation does not enter the back-edge frame", exits.locations.length === 0 && exits.allocated === true);
  const pre = frame(h, entry, [array.state]);
  check("allocation before the supplied head is existing storage", pre.allocated === true && frame(h, head, [head]).allocated === false && head.next === array.state.next);
}

{
  const { h, unit, entry } = fresh();
  const head = h.loopHead(unit, h.write(unit, entry, "a", "x", data.literal(0)), []);
  const indexed = h.writeIndex(unit, head, "xs", "#x00000000", data.literal(1));
  const sym = symOf(indexed);
  const names = [...writesOf(indexed).keys()];
  const hasName = indexed.array.has;
  const valueName = indexed.array.num;
  const dropHas = { ...indexed, [sym]: { owner: ownerOf(indexed), writes: new Map([...writesOf(indexed)].filter(([name]) => name !== hasName)) } };
  const half = mustThrow(() => h.loopWrites(head, [dropHas]));
  check("unlogged array-presence version fails closed", half.threw && /missing ownership/.test(half.message) && names.includes(hasName) && names.includes(valueName), half);
  const summary = h.havoc(unit, head, [loc("ys", "@elements", "boolean")], false).state;
  const dropHavoc = { ...summary, [symOf(summary)]: { owner: ownerOf(summary), writes: new Map(writesOf(head)) } };
  const havocMiss = mustThrow(() => h.loopWrites(head, [{ ...dropHavoc, role: "current" }]));
  check("unlogged array summary havoc fails closed", havocMiss.threw && /missing ownership/.test(havocMiss.message), havocMiss);
  const made = h.alloc(unit, head, data.array([data.literal(0)]));
  const dropAllocLog = { ...made.state, [symOf(made.state)]: { owner: ownerOf(made.state), writes: new Map(writesOf(head)) } };
  const allocMiss = mustThrow(() => h.loopWrites(head, [dropAllocLog]));
  check("unlogged array allocation content fails closed before an allocated flag", allocMiss.threw && /missing ownership/.test(allocMiss.message), allocMiss);
  const rec = h.alloc(unit, head, data.record([["x", { hasKey: "true", value: data.literal(1) }]]));
  const dropRec = { ...rec.state, [symOf(rec.state)]: { owner: ownerOf(rec.state), writes: new Map(writesOf(head)) } };
  const recMiss = mustThrow(() => h.loopWrites(head, [dropRec]));
  check("unlogged record allocation content fails closed", recMiss.threw && /missing ownership/.test(recMiss.message), recMiss);
}

{
  const { h, unit, entry } = fresh();
  const wrote = h.write(unit, entry, "a", "x", data.literal(1));
  const head = h.loopHead(unit, wrote, []);
  const sym = symOf(wrote);
  const casesBad = [
    ["missing symbol", () => h.loopWrites(head, [{ role: "current", next: head.next, num: new Map(wrote.num), bool: new Map(), array: {} }])],
    ["unknown version", () => h.loopWrites(head, [{ ...wrote, num: new Map(wrote.num).set("x", "heap_evil") }])],
    ["wrong slot", () => h.loopWrites(head, [{ ...wrote, bool: new Map([["b", wrote.num.get("x")]]) }])],
    ["malformed map", () => h.loopWrites(head, [{ ...wrote, num: { x: wrote.num.get("x") } }])],
    ["extra array slot", () => h.loopWrites(head, [{ ...wrote, array: { ...wrote.array, length: "heap_length" } }])],
    ["non-descendant", () => h.loopWrites(head, [entry])],
    ["other owner", () => h.loopWrites(head, [fresh().entry])],
    ["location mismatch", () => {
      const forged = new Map(writesOf(wrote));
      forged.set(wrote.num.get("x"), [{ ref: "other", key: "x", sort: "number", kind: "field" }]);
      return h.loopWrites(head, [{ ...wrote, [sym]: { owner: ownerOf(wrote), writes: forged } }]);
    }],
    ["detached log", () => {
      const extra = h.write(unit, wrote, "b", "x", data.literal(2));
      const forged = new Map(writesOf(wrote));
      forged.set(extra.num.get("x"), writesOf(extra).get(extra.num.get("x")));
      return h.loopWrites(head, [{ ...wrote, [sym]: { owner: ownerOf(wrote), writes: forged } }]);
    }],
    ["json round trip", () => h.loopWrites(head, [JSON.parse(JSON.stringify(wrote))])],
  ];
  for (const [label, fn] of casesBad) {
    const got = mustThrow(fn, /Heap write audit:|JSON/);
    // JSON.stringify drops maps AND symbols; the result is a plain object. Either audit or a map-read throw is fail-closed.
    check(`invalid ${label} does not return a frame`, got.threw === true, got);
  }
  const after = h.write(unit, head, "a", "x", data.literal(2));
  const version = after.num.get("x");
  const record = ownerOf(after).versions.get(version);
  const saved = [...record.parents];
  record.parents.push(version);
  const cyc = mustThrow(() => h.loopWrites(head, [after]));
  record.parents.splice(0, record.parents.length, ...saved);
  check("parent cycle throws and does not return locations", cyc.threw === true && cyc.value === undefined, cyc);
}

async function mutant(from, to, run) {
  const dir = await mkdtemp(join(tmpdir(), "heap-review-mutant-"));
  try {
    await run(child, (fn) => { fn(); });
    let source = await readFile("/tmp/heap-review/child/verify/heap.mjs", "utf8");
    const parts = source.split(from);
    if (parts.length !== 2) return { unique: false, parts: parts.length };
    source = source.replace(from, to)
      .replaceAll('"./error.mjs"', JSON.stringify(new URL("/tmp/heap-review/child/verify/error.mjs", import.meta.url).href))
      .replaceAll('"./data.mjs"', JSON.stringify(new URL("/tmp/heap-review/child/verify/data.mjs", import.meta.url).href));
    const sha256 = createHash("sha256").update(source).digest("hex");
    const path = join(dir, "heap.mjs");
    await writeFile(path, source);
    const h = await import(pathToFileURL(path).href);
    let caught = null;
    try { await run(h, (fn) => { fn(); }); }
    catch (e) { caught = { name: e.name, message: String(e.message).slice(0, 240) }; }
    return { unique: true, sha256, caught };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const arrayHavoc = await mutant(
  "s.array[kind] = name;\n      s = logged(s, [name]);",
  "s.array[kind] = name;",
  (h, expect) => {
    const { unit, entry } = fresh(h);
    const changed = h.havoc(unit, entry, [loc("ys", "@elements", "number")], false).state;
    expect(() => h.loopWrites(entry, [changed]));
  },
);
check("private array-summary omission is rejected and its control passes",
  arrayHavoc.unique && arrayHavoc.caught && /missing ownership/.test(arrayHavoc.caught.message), arrayHavoc);

const halfIndex = await mutant(
  "return logged(s, [valueName, hasName]);",
  "return logged(s, [valueName]);",
  (h, expect) => {
    const { unit, entry } = fresh(h);
    const made = h.alloc(unit, entry, data.array([data.literal(0)]));
    const head = h.loopHead(unit, made.state, []);
    const changed = h.writeIndex(unit, head, made.value.ref, "#x00000000", data.literal(1));
    expect(() => h.loopWrites(head, [changed]));
  },
);
check("private half-logged indexed store is rejected and its control passes",
  halfIndex.unique && halfIndex.caught && /missing ownership/.test(halfIndex.caught.message), halfIndex);

const arrayAlloc = await mutant(
  "...logged(s, [valueName, hasName])",
  "...s",
  (h, expect) => {
    const { unit, entry } = fresh(h);
    const made = h.alloc(unit, entry, data.array([data.literal(0)]));
    expect(() => h.loopWrites(entry, [made.state]));
  },
);
check("private array-allocation omission is rejected and its control passes",
  arrayAlloc.unique && arrayAlloc.caught && /missing ownership/.test(arrayAlloc.caught.message), arrayAlloc);

const recordAlloc = await mutant(
  "return logged(next, [name]);",
  "return next;",
  (h, expect) => {
    const { unit, entry } = fresh(h);
    const made = h.alloc(unit, entry, data.record([["x", { hasKey: "true", value: data.literal(1) }]]));
    expect(() => h.loopWrites(entry, [made.state]));
    const head = h.loopHead(unit, entry, []);
    const changed = h.write(unit, head, "a", "x", data.literal(1));
    expect(() => h.loopWrites(head, [changed]));
  },
);
check("private record-store omission rejects allocation and ordinary writes",
  recordAlloc.unique && recordAlloc.caught && /missing ownership/.test(recordAlloc.caught.message), recordAlloc);

// native alias rows, no solver
for (const id of ["record-alias", "array-alias", "call-frame", "element-marker-field", "noop-store", "restored-store"]) {
  const c = cases.find((x) => x.id === id);
  const rows = nativeRows(c);
  check(`native ${id}`, rows.every((r) => r.holds === true), { n: rows.length, holds: rows.map((r) => r.holds) });
}

function compiled(compile, source) {
  const snap = single("review.js", source);
  if (snap.error) return { phase: "parse", message: snap.error.message, status: snap.error.status };
  try { const built = compile(snap.records); return { phase: "compiled", declarations: built.targets.map((t) => t.declarations).join("\n\n") }; }
  catch (e) { return { phase: "compile", name: e.name, message: e.message, status: e.status }; }
}
const programs = {
  marker: `// ensures result===1\nfunction f(){const a={"@elements":0};a["@elements"]=1;return a["@elements"];}`,
  alias: `/** @param {{x:number}} a @param {{x:number}} b */\n// modifies a.x\n// ensures Object.is(result,a===b?1:old(b.x))\nfunction f(a,b){a.x=1;return b.x;}`,
  readLoop: `/** @param {{x:number}} a */\n// ensures true\nfunction f(a){let i=0;\n// invariant i===0\n// decreases real(1)-real(i)\nwhile(i===0){i=a.x>0?1:1;}return true;}`,
  writeLoop: `/** @param {{x:number}} a */\n// modifies a.x\n// ensures true\nfunction poke(a){a.x=1;return true;}\n/** @param {{x:number}} a */\n// modifies a.x\n// ensures true\nfunction f(a){let i=0;\n// invariant i===0\n// decreases real(1)-real(i)\nwhile(i===0){a.x=1;return true;}return true;}`,
  callLoop: `/** @param {{x:number}} a */\n// modifies a.x\n// ensures true\nfunction poke(a){a.x=1;return true;}\n/** @param {{x:number}} a */\n// modifies a.x\n// ensures true\nfunction f(a){let i=0;\n// invariant i===0\n// decreases real(1)-real(i)\nwhile(i===0){return poke(a);}return true;}`,
  allocLoop: `/** @param {{x:number}} a */\n// ensures true\nfunction f(a){let i=0;\n// invariant i===0\n// decreases real(1)-real(i)\nwhile(i===0){const b={x:1};return true;}return true;}`,
};
for (const [id, source] of Object.entries(programs)) {
  const a = compiled(compileParent, source);
  const b = compiled(compileChild, source);
  const same = JSON.stringify({ phase: a.phase, message: a.message, status: a.status, declarations: a.declarations })
    === JSON.stringify({ phase: b.phase, message: b.message, status: b.status, declarations: b.declarations });
  check(`compiler output matches parent for ${id}`, same, { parent: { phase: a.phase, status: a.status, message: a.message }, child: { phase: b.phase, status: b.status, message: b.message }, declBytes: b.declarations?.length ?? 0 });
}

const failed = findings.filter((f) => f.result === "FAIL");
console.log(JSON.stringify({ summary: { checks: findings.length, failed: failed.length, names: failed.map((f) => f.check) } }));
process.exit(failed.length ? 1 : 0);
