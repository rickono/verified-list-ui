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
  return { role: "entry", next: "heap_next0", num: new Map(), bool: new Map(), array: {} };
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

function version(unit, kind, k, body) {
  const reg = registry(unit);
  const name = `heap_${kind}_${slotKey(k)}_v${++reg.versions}`;
  unit.declarations.push(`(define-fun ${name} ((r Int)) ${kind === "num" ? FP : "Bool"} ${body})`);
  return name;
}

const copy = (s) => ({ role: "current", next: s.next, num: new Map(s.num), bool: new Map(s.bool), array: { ...s.array } });

// One primitive store; a new content version for one key.
export function write(unit, state, ref, key, value) {
  writableState(state);
  touch(unit, key);
  const kind = kindOf(value.sort);
  const name = version(unit, kind, key, `(ite (= r ${ref}) ${value.smt} (${contentFn(state, kind, key)} r))`);
  const next = copy(state);
  next[kind].set(key, name);
  return next;
}

// Static shape preservation: `key` is a declared, required, present primitive
// of the owner's static type and keeps its sort.
export function writableField(type, key, node) {
  const f = type.fields.find((x) => x.name === key);
  if (!f) fail(`Heap writes may target only declared fields; ${key} is not one (no key additions).`, node);
  const t = fieldType(f);
  if (f.optional || t?.kind === "optional") fail(`Heap writes may target only required present fields; ${key} may be absent or undefined.`, node);
  if (isRecordType(t)) fail("Reference stores are outside the first heap slice; only primitive contents may change.", node);
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
      s = write(unit, s, n, k, v);
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
  const s = copy(state);
  for (const l of footprint.filter((l) => l.key === "@elements")) {
    const q = "i";
    for (const kind of [kindOf(l.sort), "has"]) {
      const fn = `heap_array_havoc${++reg.versions}`;
      unit.declarations.push(`(declare-fun ${fn} ((_ BitVec 32)) ${kind === "num" ? FP : "Bool"})`);
      s.array[kind] = arrayVersion(unit, kind, `(ite (= r ${l.ref}) ${kind === "has" ? `(or (${arrayFn(s, kind)} r ${q}) (${fn} ${q}))` : `(${fn} ${q})`} (${arrayFn(s, kind)} r ${q}))`);
    }
  }
  for (const kind of ["num", "bool"]) {
    const byKey = new Map();
    for (const l of footprint.filter((l) => l.key !== "@elements" && kindOf(l.sort) === kind)) byKey.set(l.key, [...(byKey.get(l.key) ?? []), l]);
    for (const [k, locs] of byKey) {
      touch(unit, k);
      let body = `(${contentFn(s, kind, k)} r)`;
      for (const l of [...locs].reverse()) {
        const fresh = `heap_havoc${++reg.versions}`;
        unit.declarations.push(`(declare-const ${fresh} ${kind === "num" ? FP : "Bool"})`);
        body = `(ite (= r ${l.ref}) ${fresh} ${body})`;
      }
      s[kind].set(k, version(unit, kind, k, body));
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
  const out = { role: "current", next: ite(c, a.next, b.next), num: new Map(), bool: new Map(), array: {} };
  for (const kind of ["num", "bool", "has"]) {
    const fa = arrayFn(a, kind), fb = arrayFn(b, kind);
    out.array[kind] = fa === fb ? fa : arrayVersion(unit, kind, `(ite ${c} (${fa} r i) (${fb} r i))`);
  }
  for (const kind of ["num", "bool"]) {
    for (const k of new Set([...a[kind].keys(), ...b[kind].keys()])) {
      const fa = contentFn(a, kind, k), fb = contentFn(b, kind, k);
      out[kind].set(k, fa === fb ? fa : version(unit, kind, k, `(ite ${c} (${fa} r) (${fb} r))`));
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

function arrayVersion(unit, kind, body) {
  const name = `heap_array_${kind}_v${++registry(unit).versions}`;
  unit.declarations.push(`(define-fun ${name} ((r Int) (i (_ BitVec 32))) ${kind === "num" ? FP : "Bool"} ${body})`);
  return name;
}

function allocArray(unit, state, view) {
  const reg = registry(unit), n = state.next, s = copy(state), at = view.at("i");
  s.array[kindOf(view.element)] = arrayVersion(unit, kindOf(view.element), `(ite (= r ${n}) ${at.smt ?? literal(0).smt} (${arrayFn(state, kindOf(view.element))} r i))`);
  s.array.has = arrayVersion(unit, "has", `(ite (= r ${n}) ${at.present} (${arrayFn(state, "has")} r i))`);
  const next = `heap_next_v${++reg.versions}`;
  unit.declarations.push(`(define-fun ${next} () Int (+ ${n} 1))`);
  return { state: { ...s, next }, value: { sort: "array", ref: n, type: { kind: "array", element: view.element, allowUndefined: !!view.allowUndefined }, empty: !!view.empty, length: view.length },
    facts: and(`(>= ${n} 0)`, `(= (${ENCODING.kind} ${n}) 1)`, `(= (${ENCODING.length} ${n}) ${view.length.u32})`,
      `(=> (bvugt (${ENCODING.length} ${n}) #x00000000) (= (${ENCODING.element} ${n}) ${TAG[view.element]}))`) };
}

export function writeIndex(unit, state, ref, index, value) {
  writableState(state);
  const s = copy(state), kind = kindOf(value.sort), condition = `(and (= r ${ref}) (= i ${index}))`;
  s.array[kind] = arrayVersion(unit, kind, `(ite ${condition} ${value.smt} (${arrayFn(state, kind)} r i))`);
  s.array.has = arrayVersion(unit, "has", `(ite ${condition} true (${arrayFn(state, "has")} r i))`);
  return s;
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
