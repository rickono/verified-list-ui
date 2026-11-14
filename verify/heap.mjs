// Identity-indexed heap with immutable shapes and persistent content versions.
// Refs are SMT Ints. The shape layer (has / sort tag / nested ref) is one
// immutable set of UFs, because writes are restricted to existing, required,
// present primitive fields. Only primitive contents are versioned; every
// version is a define-fun over its predecessor, so the encoding stays
// quantifier free and needs only Int beyond the current theories.
import { fail } from "./error.mjs";
import { and, or, not, numberView, bool, literal } from "./data.mjs";

export const HEAP = Symbol("heap");
const slotKey = (key) => Buffer.from(key).toString("hex");
const FP = "(_ FloatingPoint 11 53)";
const TAG = { undefined: 0, number: 1, boolean: 2, object: 3, array: 4 };
const ENCODING = Object.freeze({ arrayKind: 1, tags: TAG,
  kind: "heap_kind", length: "heap_length", element: "heap_element",
  dense: "heap_array_dense", has: "heap_array_has", hasRaw: "heap_array_has_raw",
  arrayNum: "heap_array_num", arrayBool: "heap_array_bool" });
const fieldSymbols = (name) => {
  const key = slotKey(name);
  return { name, has: `heap_has_${key}`, tag: `heap_sort_${key}`, ref: `heap_ref_${key}`,
    number: `heap_num_${key}`, numberView: `heap_num0_${key}`, boolean: `heap_bool_${key}` };
};
const ite = (c, a, b) => c === "true" || a === b ? a : c === "false" ? b : `(ite ${c} ${a} ${b})`;

// Content provenance belongs to the registry, independently of each state's
// ownership history. The private symbol survives source.mjs's role-only spreads.
const OWNERSHIP = Symbol("heap write ownership"), owners = new WeakMap();
const auditError = (message) => { throw new Error(`Heap write audit: ${message}`); };
function ownerFor(unit) {
  const reg = registry(unit);
  if (!owners.has(reg)) owners.set(reg, { versions: new Map() });
  return owners.get(reg);
}
function ownership(state) {
  const owned = state[OWNERSHIP];
  if (!owned) auditError("missing state ownership");
  return owned;
}
const isElements = (l) => l.kind === undefined ? l.key === "@elements" : l.kind === "elements";
const locationKey = (l) => JSON.stringify([l.ref, l.key, l.sort, l.kind]);
const sameSlot = (a, b) => a.kind === b.kind && a.key === b.key;
const baseFn = ({kind, key}) => key === undefined
  ? kind === "num" ? `${ENCODING.arrayNum}0` : kind === "bool" ? ENCODING.arrayBool : ENCODING.has
  : kind === "num" ? fieldSymbols(key).numberView : fieldSymbols(key).boolean;
function provenance(owner, slot, name) {
  if (name === baseFn(slot)) return;
  const p = owner.versions.get(name);
  if (!p) auditError(`unknown content version ${name}`);
  if (!sameSlot(slot, p.slot)) auditError(`wrong content slot for ${name}`);
  return p;
}

// The only constructor for content functions. Every writer supplies its exact
// locations and predecessor; joins supply both predecessors. No SMT assumption
// is introduced, and names/declarations retain the previous encoding.
function contentVersion(unit, slot, body, change) {
  const owner = ownerFor(unit), {kind, key} = slot;
  if (!change || !["write", "havoc", "allocation", "join"].includes(change.kind)) auditError("missing content provenance");
  if (!Array.isArray(change.parents) || change.parents.length !== (change.kind === "join" ? 2 : 1)) auditError("missing content predecessors");
  change.parents.forEach((p) => provenance(owner, slot, p));
  const locations = change.kind === "join" ? [] : change.locations;
  if (!Array.isArray(locations) || (change.kind !== "join" && !locations.length)) auditError("missing write location");
  for (const l of locations) {
    if (!l || typeof l.ref !== "string" || !l.ref.trim() || typeof l.key !== "string" || !["number", "boolean"].includes(l.sort)
      || l.key !== (key ?? "@elements") || (kind !== "has" && kindOf(l.sort) !== kind)
      || (l.kind !== undefined && l.kind !== (key === undefined ? "elements" : "field"))) auditError("invalid write location for content slot");
  }
  const name = `heap_${key === undefined ? `array_${kind}` : `${kind}_${slotKey(key)}`}_v${++registry(unit).versions}`;
  unit.declarations.push(`(define-fun ${name} ((r Int)${key === undefined ? " (i (_ BitVec 32))" : ""}) ${kind === "num" ? FP : "Bool"} ${body})`);
  owner.versions.set(name, { slot: {...slot}, kind: change.kind, parents: [...change.parents],
    locations: locations.map((l) => Object.freeze({ref: l.ref, key: l.key, sort: l.sort, kind: key === undefined ? "elements" : "field"})) });
  return name;
}

function logged(state, names) {
  const {owner, writes} = ownership(state), next = new Map(writes);
  for (const name of names) {
    const p = owner.versions.get(name);
    if (!p || !p.locations.length) auditError(`missing writer provenance for ${name}`);
    next.set(name, p.locations.map((l) => ({...l})));
  }
  return {...state, [OWNERSHIP]: {owner, writes: next}};
}
function mergeOwnership(left, right) {
  const a = ownership(left), b = ownership(right);
  if (a.owner !== b.owner) auditError("cannot join different heap owners");
  return {owner: a.owner, writes: new Map([...a.writes, ...b.writes])};
}

export const isRecordType = (t) => !!t && typeof t === "object" && t.kind === "object";
export const isReferenceType = (t) => !!t && ["object", "array"].includes(t.kind);
export const isRef = (v) => ["object", "array"].includes(v?.sort) && typeof v.ref === "string";
export const fieldType = (f) => f.optional && f.type?.kind === "optional" ? f.type.type : f.type;
export const sameType = (a, b) => JSON.stringify(a, (k,v) => k === "allowUndefined" && !v ? undefined : v) === JSON.stringify(b, (k,v) => k === "allowUndefined" && !v ? undefined : v);

// One registry per unit (shared by loop trial units): the key universe, the
// per-key declarations (emitted first), deferred exactness facts and entry
// typing (emitted after all versions), and witness root types.
export function registry(unit) {
  if (!unit.heap) unit.heap = {
    keys: new Set(), exact: [], asserts: [], versions: 0, roots: [], rootTypes: [],
    decls: [
      "(declare-const heap_next0 Int)",
      `(declare-fun ${ENCODING.kind} (Int) Int)`,
      `(declare-fun ${ENCODING.length} (Int) (_ BitVec 32))`,
      `(declare-fun ${ENCODING.element} (Int) Int)`,
      `(declare-fun ${ENCODING.arrayNum} (Int (_ BitVec 32)) (_ BitVec 64))`,
      `(declare-fun ${ENCODING.arrayBool} (Int (_ BitVec 32)) Bool)`,
      `(declare-fun ${ENCODING.dense} (Int) Bool)`,
      `(declare-fun ${ENCODING.hasRaw} (Int (_ BitVec 32)) Bool)`,
      `(define-fun ${ENCODING.has} ((r Int) (i (_ BitVec 32))) Bool (or (${ENCODING.dense} r) (${ENCODING.hasRaw} r i)))`,
      `(define-fun ${ENCODING.arrayNum}0 ((r Int) (i (_ BitVec 32))) ${FP} ((_ to_fp 11 53) (${ENCODING.arrayNum} r i)))`,
    ],
  };
  return unit.heap;
}

// A compiler trial shares this owner with the pre-loop states. Roll back its
// registry universe as well as its facts: finish() quantifies exact shapes over
// keys and emits decls/asserts even when no returned state mentions the trial.
// Content names are never reused. Discarded provenance is removed, so keeping
// a discarded state by mistake fails the normal unknown-version audit.
export function trial(unit) {
  const reg = registry(unit), owner = ownerFor(unit);
  const saved = { ...reg, keys: new Set(reg.keys), exact: [...reg.exact],
    asserts: [...reg.asserts], decls: [...reg.decls], roots: [...reg.roots], rootTypes: [...reg.rootTypes] };
  const names = new Set(owner.versions.keys());
  let active = true;
  return {
    commit() { if (!active) auditError("trial already ended"); active = false; },
    rollback() {
      if (!active) auditError("trial already ended");
      active = false;
      const versions = reg.versions;
      for (const key of Object.keys(reg)) delete reg[key];
      Object.assign(reg, saved, { versions });
      for (const name of owner.versions.keys()) if (!names.has(name)) owner.versions.delete(name);
    },
  };
}

function touch(unit, k) {
  const reg = registry(unit);
  if (reg.keys.has(k)) return;
  reg.keys.add(k);
  reg.decls.push(
    `(declare-fun ${fieldSymbols(k).has} (Int) Bool)`, `(declare-fun ${fieldSymbols(k).tag} (Int) Int)`, `(declare-fun ${fieldSymbols(k).ref} (Int) Int)`,
    `(declare-fun ${fieldSymbols(k).number} (Int) (_ BitVec 64))`, `(declare-fun ${fieldSymbols(k).boolean} (Int) Bool)`,
    `(define-fun ${fieldSymbols(k).numberView} ((r Int)) ${FP} ((_ to_fp 11 53) (${fieldSymbols(k).number} r)))`);
}

function writableState(state) {
  if (!["entry", "current"].includes(state.role)) throw new Error("A post-call summary must be committed before a heap update.");
}

export function entryState(unit) {
  registry(unit);
  return { role: "entry", next: "heap_next0", num: new Map(), bool: new Map(), array: {},
    [OWNERSHIP]: {owner: ownerFor(unit), writes: new Map()} };
}

const contentFn = (s, kind, k) => s[kind].get(k) ?? (kind === "num" ? fieldSymbols(k).numberView : fieldSymbols(k).boolean);
const kindOf = (sort) => sort === "number" ? "num" : "bool";

// Deferred exactness: no universe key outside `keys` is an own key of r.
function exact(unit, r, keys) {
  const reg = registry(unit);
  const name = `heap_exact${reg.exact.length}`;
  reg.exact.push({ name, keys: new Set(keys) });
  return `(${name} ${r})`;
}

// Static typing of a ref against a record type. Version independent: it reads
// only the immutable shape layer (plus presence for optional array conformance). Two refs of different static types may be
// equal unless their shapes genuinely conflict; no disjointness is assumed.
// Entry dense arrays use a definitional presence flag instead of a redundant
// forall; all dense native arrays have this representation. Call conformance
// can still establish density from optional element values at the current state.
export function typing(unit, type, r, bound, state) {
  const parts = [`(>= ${r} 0)`, ...(bound ? [`(< ${r} ${bound})`] : []), `(= (${ENCODING.kind} ${r}) ${type.kind === "array" ? 1 : 0})`];
  if (type.kind === "array") return and(...parts,
    `(=> (bvugt (${ENCODING.length} ${r}) #x00000000) (= (${ENCODING.element} ${r}) ${TAG[type.element]}))`,
    type.allowUndefined ? "true" : !state ? `(${ENCODING.dense} ${r})` : `(forall ((i (_ BitVec 32))) (=> (bvult i (${ENCODING.length} ${r})) (${arrayFn(state, "has")} ${r} i)))`);
  for (const f of type.fields) {
    touch(unit, f.name);
    const k = f.name, t = fieldType(f), has = `(${fieldSymbols(k).has} ${r})`, tag = `(${fieldSymbols(k).tag} ${r})`;
    if (isReferenceType(t)) {
      parts.push(has, `(= ${tag} ${TAG[t.kind]})`, typing(unit, t, `(${fieldSymbols(k).ref} ${r})`, bound, state));
    } else {
      const sort = typeof t === "string" ? t : t.type;
      const allowsUndefined = f.optional || t?.kind === "optional" || sort === "undefined";
      const ok = allowsUndefined ? `(or (= ${tag} 0) (= ${tag} ${TAG[sort]}))` : `(= ${tag} ${TAG[sort]})`;
      parts.push(f.optional ? `(=> ${has} ${ok})` : and(has, ok));
    }
  }
  parts.push(exact(unit, r, type.fields.map((f) => f.name)));
  return and(...parts);
}

// A record parameter: one Int symbol, typed below the entry allocator.
export function refInput(unit, type, prefix, node) {
  const reg = registry(unit), symbol = `${prefix}_ref`;
  reg.used = true; reg.roots.push(symbol); reg.rootTypes.push(type);
  reg.asserts.push(typing(unit, type, symbol, "heap_next0"));
  return { value: { sort: type.kind, ref: symbol, type }, declarations: [`(declare-const ${symbol} Int)`], model: { kind: "ref", symbol, type } };
}

// Focus: an H-style content view of one ref at one heap version. Existing
// record operations (member, spread) run unchanged on the view.
const arrayFn = (s, kind) => s.array[kind] ?? (kind === "num" ? `${ENCODING.arrayNum}0` : kind === "bool" ? ENCODING.arrayBool : ENCODING.has);
export function focus(unit, state, v) {
  if (v.spec) return v;
  if (v.sort === "array") {
    const r = v.ref, len = `(${ENCODING.length} ${r})`;
    return { sort: "array", element: v.type.element, allowUndefined: v.type.allowUndefined,
      length: v.length ?? { ...numberView(`((_ to_fp_unsigned 11 53) RNE ${len})`), u32: len },
      at: (i) => v.type.element === "number"
        ? { ...numberView(`(${arrayFn(state, "num")} ${r} ${i})`), present: v.type.allowUndefined ? `(${arrayFn(state, "has")} ${r} ${i})` : "true" }
        : bool(`(${arrayFn(state, "bool")} ${r} ${i})`, v.type.allowUndefined ? `(${arrayFn(state, "has")} ${r} ${i})` : "true") };
  }
  const fields = new Map();
  for (const f of v.type.fields) {
    touch(unit, f.name);
    const k = f.name, t = fieldType(f), r = v.ref, tag = `(${fieldSymbols(k).tag} ${r})`;
    const hasKey = f.optional ? `(${fieldSymbols(k).has} ${r})` : "true";
    let value;
    if (isReferenceType(t)) value = { sort: t.kind, ref: `(${fieldSymbols(k).ref} ${r})`, type: t };
    else {
      const sort = typeof t === "string" ? t : t.type;
      const present = f.optional || t?.kind === "optional" ? `(= ${tag} ${TAG[sort]})` : "true";
      if (sort === "undefined") value = { sort: "undefined", present: "false" };
      else value = sort === "number" ? { ...numberView(`(${contentFn(state, "num", k)} ${r})`), present } : bool(`(${contentFn(state, "bool", k)} ${r})`, present);
    }
    fields.set(k, { hasKey, value });
  }
  return { sort: "object", fields };
}

function copy(s, unit) {
  const owned = ownership(s);
  if (owned.owner !== ownerFor(unit)) auditError("content update uses a different heap owner");
  return { role: "current", next: s.next, num: new Map(s.num), bool: new Map(s.bool), array: { ...s.array }, [OWNERSHIP]: owned };
}

// One primitive store; a new content version for one key.
export function write(unit, state, ref, key, value) {
  return recordStore(unit, state, ref, key, value, "write");
}

function recordStore(unit, state, ref, key, value, purpose) {
  writableState(state);
  touch(unit, key);
  const kind = kindOf(value.sort);
  const parent = contentFn(state, kind, key);
  const name = contentVersion(unit, {kind, key}, `(ite (= r ${ref}) ${value.smt} (${parent} r))`,
    {kind: purpose, parents: [parent], locations: [{ ref, key, sort: value.sort }]});
  const next = copy(state, unit);
  next[kind].set(key, name);
  return logged(next, [name]);
}

// Static shape preservation: `key` is a declared, required, present primitive
// of the owner's static type and keeps its sort.
export function writableField(type, key, node) {
  const f = type.fields.find((x) => x.name === key);
  if (!f) fail(`Heap writes may target only declared fields; ${key} is not one (no key additions).`, node);
  const t = fieldType(f);
  if (f.optional || t?.kind === "optional") fail(`Heap writes may target only required present fields; ${key} may be absent or undefined.`, node);
  if (isReferenceType(t)) fail("Reference stores are outside the first heap slice; only primitive contents may change.", node);
  if (!["number", "boolean"].includes(t)) fail(`Heap writes need a number or boolean field; ${key} is ${JSON.stringify(t)}.`, node);
  return t;
}

export function checkStore(type, key, value, node) {
  const t = writableField(type, key, node);
  if (isRef(value)) fail("Reference stores are outside the first heap slice; only primitive contents may change.", node);
  if (value.sort === "undefined") fail(`Storing undefined into required field ${key} would change its shape.`, node);
  if (value.sort !== t) fail(`Heap writes must preserve the field sort (${t}).`, node);
  return t;
}

// Fresh allocation from an H-view record (literal or spread). Shape facts are
// about the never-constrained region at `next`; contents are versions.
export function alloc(unit, state, view, node) {
  writableState(state);
  const reg = registry(unit); reg.used = true;
  if (view.sort === "array") return allocArray(unit, state, view);
  const n = state.next, facts = [`(>= ${n} 0)`, `(= (${ENCODING.kind} ${n}) 0)`], fields = [];
  let s = state;
  for (const [k, field] of view.fields) {
    touch(unit, k);
    const v = field.value;
    facts.push(field.hasKey === "true" ? `(${fieldSymbols(k).has} ${n})` : `(= (${fieldSymbols(k).has} ${n}) ${field.hasKey})`);
    let t;
    if (isRef(v)) {
      if (field.hasKey !== "true") fail("Optional reference fields are unsupported.", node);
      facts.push(`(= (${fieldSymbols(k).tag} ${n}) ${TAG[v.sort]})`, `(= (${fieldSymbols(k).ref} ${n}) ${v.ref})`);
      t = v.type;
    } else if (v.sort === "number" || v.sort === "boolean") {
      facts.push(`(= (${fieldSymbols(k).tag} ${n}) ${ite(v.present, String(TAG[v.sort]), "0")})`);
      s = recordStore(unit, s, n, k, v, "allocation");
      t = v.present === "true" ? v.sort : { kind: "optional", type: v.sort };
    } else if (v.sort === "undefined") { facts.push(`(= (${fieldSymbols(k).tag} ${n}) 0)`); t = "undefined"; }
    else fail(`Heap slice: a ${v.sort} cannot be stored in a record.`, node);
    fields.push({ name: k, type: t, optional: field.hasKey !== "true" });
  }
  facts.push(exact(unit, n, [...view.fields.keys()]));
  const nextName = `heap_next_v${++reg.versions}`;
  unit.declarations.push(`(define-fun ${nextName} () Int (+ ${n} 1))`);
  return { state: { ...s, next: nextName }, value: { sort: "object", ref: n, type: { kind: "object", fields } }, facts: and(...facts) };
}

// Opaque call: fresh contents at footprint slots. The allocator moves only
// when the result is a reference; scalar-result callee allocations are
// unreachable from the caller, so an empty footprint keeps the state.
export function havoc(unit, state, footprint, refResult) {
  writableState(state);
  if (!footprint.length && !refResult) return { state, facts: "true" };
  const reg = registry(unit);
  if (refResult) reg.used = true;
  let s = copy(state, unit);
  for (const l of footprint.filter(isElements)) {
    const q = "i";
    for (const kind of [kindOf(l.sort), "has"]) {
      const fn = `heap_array_havoc${++reg.versions}`;
      unit.declarations.push(`(declare-fun ${fn} ((_ BitVec 32)) ${kind === "num" ? FP : "Bool"})`);
      const parent = arrayFn(s, kind);
      const name = contentVersion(unit, {kind}, `(ite (= r ${l.ref}) ${kind === "has" ? `(or (${parent} r ${q}) (${fn} ${q}))` : `(${fn} ${q})`} (${parent} r ${q}))`,
        {kind: "havoc", parents: [parent], locations: [l]});
      s.array[kind] = name;
      s = logged(s, [name]);
    }
  }
  for (const kind of ["num", "bool"]) {
    const byKey = new Map();
    for (const l of footprint.filter((l) => !isElements(l) && kindOf(l.sort) === kind)) byKey.set(l.key, [...(byKey.get(l.key) ?? []), l]);
    for (const [k, locs] of byKey) {
      touch(unit, k);
      let body = `(${contentFn(s, kind, k)} r)`;
      for (const l of [...locs].reverse()) {
        const fresh = `heap_havoc${++reg.versions}`;
        unit.declarations.push(`(declare-const ${fresh} ${kind === "num" ? FP : "Bool"})`);
        body = `(ite (= r ${l.ref}) ${fresh} ${body})`;
      }
      const name = contentVersion(unit, {kind, key: k}, body,
        {kind: "havoc", parents: [contentFn(s, kind, k)], locations: locs});
      s[kind].set(k, name);
      s = logged(s, [name]);
    }
  }
  if (!refResult) return { state: { ...s, role: "summary" }, facts: "true" };
  const next = `heap_next_v${++reg.versions}`;
  unit.declarations.push(`(declare-const ${next} Int)`);
  return { state: { ...s, role: "summary", next }, facts: `(>= ${next} ${state.next})` };
}

export function join(unit, c, a, b) {
  if (a === b || c === "true") return a;
  if (c === "false") return b;
  const out = { role: "current", next: ite(c, a.next, b.next), num: new Map(), bool: new Map(), array: {}, [OWNERSHIP]: mergeOwnership(a, b) };
  if (ownership(out).owner !== ownerFor(unit)) auditError("join uses a different heap owner");
  for (const kind of ["num", "bool", "has"]) {
    const fa = arrayFn(a, kind), fb = arrayFn(b, kind);
    out.array[kind] = fa === fb ? fa : contentVersion(unit, {kind}, `(ite ${c} (${fa} r i) (${fb} r i))`, {kind: "join", parents: [fa, fb]});
  }
  for (const kind of ["num", "bool"]) {
    for (const k of new Set([...a[kind].keys(), ...b[kind].keys()])) {
      const fa = contentFn(a, kind, k), fb = contentFn(b, kind, k);
      out[kind].set(k, fa === fb ? fa : contentVersion(unit, {kind, key: k}, `(ite ${c} (${fa} r) (${fb} r))`, {kind: "join", parents: [fa, fb]}));
    }
  }
  return out;
}

export const sameState = (a, b) => a.next === b.next && ["num", "bool", "has"].every((k) => arrayFn(a,k) === arrayFn(b,k)) && ["num", "bool"].every((kind) =>
  new Set([...a[kind].keys(), ...b[kind].keys()]).size === 0 ||
  [...new Set([...a[kind].keys(), ...b[kind].keys()])].every((k) => contentFn(a, kind, k) === contentFn(b, kind, k)));

// Write permission: an entry footprint location, or a ref allocated after
// entry (refs >= heap_next0 are unreachable from every caller).
export function permission(locs, ref, key) {
  return or(...locs.filter((l) => l.key === key).map((l) => `(= ${ref} ${l.ref})`), `(>= ${ref} heap_next0)`);
}

// Called once at the end of a unit: declarations first, then exactness over
// the final universe and entry typing (domain assertions, like param types).
export function finish(unit) {
  const reg = unit.heap;
  if (!reg) return { head: [], tail: [], model: undefined };
  const tail = reg.exact.map((e) => `(define-fun ${e.name} ((r Int)) Bool ${and(...[...reg.keys].filter((k) => !e.keys.has(k)).map((k) => not(`(${fieldSymbols(k).has} r)`)))})`);
  tail.push(...reg.asserts.map((a) => `(assert ${a})`));
  // No record touched: no heap witness, so scalar targets keep their witness lists.
  const used = reg.used;
  return { head: reg.decls, tail, model: used ? { kind: "heap", keys: [...reg.keys], roots: [...reg.roots], types: [...reg.rootTypes], encoding: { ...ENCODING, fields: [...reg.keys].map(fieldSymbols) } } : undefined };
}

// A plain array path denotes its elements; a primitive member denotes one field.
export function footprintPaths(clause) {
  let list = clause.ast;
  while (list.type === "ParenthesizedExpression") list = list.expression;
  return (list.type === "SequenceExpression" ? list.expressions : [list]).map((e) => {
    while (e.type === "ParenthesizedExpression") e = e.expression;
    if (e.type === "Identifier") return { object: e, node: e, whole: true };
    if (e.type !== "MemberExpression" || e.computed || e.optional) fail("modifies lists parameter paths such as a.x or box.values (array elements).", e);
    return { object: e.object, key: e.property.name, expression: e, node: e };
  });
}

function allocArray(unit, state, view) {
  const reg = registry(unit), n = state.next, s = copy(state, unit), at = view.at("i"), kind = kindOf(view.element);
  const locations = [{ref: n, key: "@elements", sort: view.element}];
  const valueName = contentVersion(unit, {kind}, `(ite (= r ${n}) ${at.smt ?? literal(0).smt} (${arrayFn(state, kind)} r i))`,
    {kind: "allocation", parents: [arrayFn(state, kind)], locations});
  const hasName = contentVersion(unit, {kind: "has"}, `(ite (= r ${n}) ${at.present} (${arrayFn(state, "has")} r i))`,
    {kind: "allocation", parents: [arrayFn(state, "has")], locations});
  s.array[kind] = valueName;
  s.array.has = hasName;
  const next = `heap_next_v${++reg.versions}`;
  unit.declarations.push(`(define-fun ${next} () Int (+ ${n} 1))`);
  return { state: { ...logged(s, [valueName, hasName]), next }, value: { sort: "array", ref: n, type: { kind: "array", element: view.element, allowUndefined: !!view.allowUndefined }, empty: !!view.empty, length: view.length },
    facts: and(`(>= ${n} 0)`, `(= (${ENCODING.kind} ${n}) 1)`, `(= (${ENCODING.length} ${n}) ${view.length.u32})`,
      `(=> (bvugt (${ENCODING.length} ${n}) #x00000000) (= (${ENCODING.element} ${n}) ${TAG[view.element]}))`) };
}

export function writeIndex(unit, state, ref, index, value) {
  writableState(state);
  const s = copy(state, unit), kind = kindOf(value.sort), condition = `(and (= r ${ref}) (= i ${index}))`;
  const locations = [{ref, key: "@elements", sort: value.sort}];
  const valueName = contentVersion(unit, {kind}, `(ite ${condition} ${value.smt} (${arrayFn(state, kind)} r i))`,
    {kind: "write", parents: [arrayFn(state, kind)], locations});
  const hasName = contentVersion(unit, {kind: "has"}, `(ite ${condition} true (${arrayFn(state, "has")} r i))`,
    {kind: "write", parents: [arrayFn(state, "has")], locations});
  s.array[kind] = valueName;
  s.array.has = hasName;
  return logged(s, [valueName, hasName]);
}

// Result references may come from arguments (recursively) or new allocation.
export function reachable(value) {
  if (!isRef(value)) return [];
  const out = [value.ref];
  if (value.type.kind === "object") for (const f of value.type.fields) if (isReferenceType(f.type)) {
    out.push(...reachable({ sort: f.type.kind, type: f.type, ref: `(${fieldSymbols(f.name).ref} ${value.ref})` }));
  }
  return out;
}
export function resultDomain(value, args, bound) {
  const permitted = args.flatMap(reachable);
  return and(...reachable(value).map((r) => or(`(>= ${r} ${bound})`, ...permitted.map((p) => `(= ${r} ${p})`))));
}

export function inputLengths(type, ref) {
  if (type.kind === "array") return [`(${ENCODING.length} ${ref})`];
  return type.kind === "object" ? type.fields.flatMap((f) => isReferenceType(f.type) ? inputLengths(f.type, `(${fieldSymbols(f.name).ref} ${ref})`) : []) : [];
}

export const elementsEmpty = (ref) => `(= (${ENCODING.length} ${ref}) #x00000000)`;

function slots(state) {
  if (!(state.num instanceof Map) || !(state.bool instanceof Map) || !state.array
    || Object.entries(state.array).some(([k,v]) => !["num", "bool", "has"].includes(k) || typeof v !== "string")
    || [state.num, state.bool].some((map) => [...map].some(([k,v]) => typeof k !== "string" || typeof v !== "string"))) auditError("invalid content maps");
  return [ ...["num", "bool", "has"].map((kind) => ({kind})),
    ...["num", "bool"].flatMap((kind) => [...state[kind].keys()].map((key) => ({kind, key}))) ];
}
const atSlot = (state, {kind, key}) => key === undefined ? arrayFn(state, kind) : contentFn(state, kind, key);

// Inspect actual content roots and all their predecessors, independently of the
// ownership log. A missing log or an unknown function is never an empty frame.
function auditState(state) {
  const {owner, writes} = ownership(state), events = new Set(), seen = new Set();
  function visit(slot, name) {
    const p = provenance(owner, slot, name);
    if (!p || seen.has(name)) return;
    seen.add(name);
    p.parents.forEach((parent) => visit(slot, parent));
    if (p.kind !== "join") {
      const actual = writes.get(name);
      if (!actual || actual.length !== p.locations.length || actual.some((l,i) => locationKey(l) !== locationKey(p.locations[i]))) auditError(`missing ownership for ${name}`);
      events.add(name);
    }
  }
  slots(state).forEach((slot) => visit(slot, atSlot(state, slot)));
  for (const name of writes.keys()) if (!events.has(name)) auditError(`ownership detached from content version ${name}`);
  return {owner, events};
}

// The cutpoint uses A's location-derived havoc. Retain the entire provenance:
// the explicit head argument to loopWrites starts a new interval without
// erasing earlier evidence or confusing a prior store with a new one.
export function loopHead(unit, state, locations) {
  writableState(state);
  auditState(state);
  const {state: next} = havoc(unit, state, locations, false);
  const head = {...next, role: "current"};
  auditState(head);
  return head;
}

// Only checked back-edge writes form the frame; exits (including return heaps)
// are audited too. Shape is immutable; allocations/opaque allocator changes
// are reported separately and must be rejected by the future K consumer.
export function loopWrites(head, backs, exits = []) {
  const baseline = auditState(head), locations = new Map();
  let allocated = false;
  for (const [edges, isBack] of [[backs, true], [exits, false]]) for (const state of edges) {
    const checked = auditState(state);
    if (checked.owner !== baseline.owner) auditError("interval uses a different heap owner");
    const memo = new Map();
    function extendsHead(slot, name) {
      if (name === atSlot(head, slot)) return true;
      if (memo.has(name)) return memo.get(name);
      const p = provenance(checked.owner, slot, name);
      const ok = !!p && p.parents.every((parent) => extendsHead(slot, parent));
      memo.set(name, ok);
      return ok;
    }
    for (const slot of [...slots(head), ...slots(state)]) if (!extendsHead(slot, atSlot(state, slot))) auditError("content does not descend from loop head");
    allocated ||= state.next !== head.next;
    for (const [name, locs] of ownership(state).writes) if (!baseline.events.has(name)) {
      const p = checked.owner.versions.get(name);
      if (p.kind === "allocation") allocated = true;
      else if (isBack) for (const l of locs) locations.set(locationKey(l), {...l});
    }
  }
  return {locations: [...locations.values()], allocated};
}
