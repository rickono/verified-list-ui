import { fail } from "./error.mjs";

export const REPLAY_LIMIT = 256;
const MAX_LENGTH = 0xffff_ffff;
export const and = (...xs) => xs.includes("false") ? "false" : join("and", xs.filter((x) => x !== "true"), "true");
const or = (...xs) => xs.includes("true") ? "true" : join("or", xs.filter((x) => x !== "false"), "false");
const join = (op, xs, empty) => !xs.length ? empty : xs.length === 1 ? xs[0] : `(${op} ${xs.join(" ")})`;
export const not = (x) => x === "true" ? "false" : x === "false" ? "true" : `(not ${x})`;
const ite = (c, a, b) => c === "true" || a === b ? a : c === "false" ? b : `(ite ${c} ${a} ${b})`;
const bv = (n) => `#x${n.toString(16).padStart(8, "0")}`;
const num = (smt, present = "true", u32) => ({ sort: "number", smt, present, u32 });
export const bool = (smt, present = "true") => ({ sort: "boolean", smt, present });
export const undef = () => ({ sort: "undefined", present: "false" });
const isReference = (v) => v.sort === "array" || v.sort === "object";

export function literal(value) {
  if (typeof value === "boolean") return bool(String(value));
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleBE(value);
  return num(`((_ to_fp 11 53) #x${bytes.toString("hex")})`, "true",
    Number.isInteger(value) && value >= 0 && value <= MAX_LENGTH ? bv(value) : undefined);
}

export function need(v, sort, node) {
  if (sort === "boolean" && v.sort === "undefined") return "false";
  if (sort === "number" && v.sort === "undefined") return literal(NaN).smt;
  if (v.sort !== sort) fail(`Expected ${sort}; this JavaScript coercion is unsupported.`, node);
  return sort === "boolean" ? and(v.present, v.smt) : ite(v.present, v.smt, literal(NaN).smt);
}

export function merge(c, a, b, node) {
  if (c === "true") return a;
  if (c === "false") return b;
  if (a.sort === "undefined" && ["number", "boolean"].includes(b.sort)) a = { ...b, present: "false" };
  if (b.sort === "undefined" && ["number", "boolean"].includes(a.sort)) b = { ...a, present: "false" };
  if (a.sort !== b.sort) fail("These branches return incompatible types. Optional references are unsupported.", node);
  if (a.sort === "undefined") return undef();
  if (a.sort === "object") {
    const keys = new Set([...a.fields.keys(), ...b.fields.keys()]);
    return record([...keys].map((k) => {
      const x = a.fields.get(k), y = b.fields.get(k);
      return [k, { hasKey: ite(c, x?.hasKey ?? "false", y?.hasKey ?? "false"),
        value: merge(c, x?.value ?? undef(), y?.value ?? undef(), node) }];
    }));
  }
  if (a.sort === "array") {
    if (a.empty) a = { ...a, element: b.element };
    if (b.empty) b = { ...b, element: a.element };
    if (a.element !== b.element) fail("Array branches must have the same primitive element type.", node);
    return { sort: "array", element: a.element, length: merge(c, a.length, b.length, node),
      at: (i) => merge(c, a.at(i), b.at(i), node), allowUndefined: a.allowUndefined || b.allowUndefined, empty: a.empty && b.empty };
  }
  return { sort: a.sort, smt: ite(c, a.smt, b.smt), present: ite(c, a.present, b.present),
    u32: a.u32 && b.u32 ? ite(c, a.u32, b.u32) : undefined };
}

function equal(a, b, sameValue, node) {
  if (isReference(a) || isReference(b)) fail("Array/object reference identity is unsupported. Compare fields or elements instead.", node);
  const payload = a.sort !== b.sort || a.sort === "undefined" ? "false"
    : `(${a.sort === "number" && !sameValue ? "fp.eq" : "="} ${a.smt} ${b.smt})`;
  return bool(or(and(not(a.present), not(b.present)), and(a.present, b.present, payload)));
}

export function unary(op, a, node) {
  if (op === "!") return bool(not(need(a, "boolean", node)));
  if (op === "+") return num(need(a, "number", node));
  if (op === "-") return num(`(fp.neg ${need(a, "number", node)})`);
  return fail(`Unsupported unary operator ${op}.`, node);
}

export const implies = (a, b) => a === "true" ? b : a === "false" || b === "true" ? "true" : `(=> ${a} ${b})`;

// The value and call obligations share the same short-circuit condition.
export function logical(op, a, right, node) {
  const runs = op === "??" ? (a.sort === "undefined" ? "true" : isReference(a) ? "false" : not(a.present))
    : op === "&&" ? need(a, "boolean", node) : not(need(a, "boolean", node));
  const b = right(runs);
  if (op !== "??") need(b, "boolean", node);
  return merge(runs, b, a, node);
}

export function binary(op, a, b, node) {
  if (["??", "&&", "||"].includes(op)) return logical(op, a, () => b, node);
  if (["==", "===", "!=", "!=="].includes(op)) {
    if (["==", "!="].includes(op) && a.sort !== b.sort && a.sort !== "undefined" && b.sort !== "undefined") {
      fail("Loose equality between different types would require unsupported coercion.", node);
    }
    const eq = equal(a, b, false, node);
    return op.includes("!") ? bool(not(eq.smt)) : eq;
  }
  const ops = { "+": "add", "-": "sub", "*": "mul", "/": "div", "<": "lt", "<=": "leq", ">": "gt", ">=": "geq" };
  if (!(op in ops)) fail(`${op} is unsupported. Numeric operations must retain their JavaScript meaning.`, node);
  const args = `${need(a, "number", node)} ${need(b, "number", node)}`;
  return ["+", "-", "*", "/"].includes(op) ? num(`(fp.${ops[op]} RNE ${args})`) : bool(`(fp.${ops[op]} ${args})`);
}

export function builtin(name, args, node) {
  if (name === "Object.is" && args.length === 2) return equal(args[0], args[1], true, node);
  if (name === "Array.isArray" && args.length === 1) return bool(String(args[0].sort === "array"));
  if (args.length !== 1) fail(`Unsupported builtin call ${name}.`, node);
  const v = args[0];
  if (name === "Math.abs") return num(`(fp.abs ${need(v, "number", node)})`);
  if (!["Number.isFinite", "Number.isNaN", "Number.isInteger", "Number.isSafeInteger"].includes(name)) fail(`Unsupported builtin call ${name}.`, node);
  if (v.sort !== "number") return bool("false");
  if (name === "Number.isNaN") return bool(and(v.present, `(fp.isNaN ${v.smt})`));
  const finite = and(v.present, not(`(or (fp.isNaN ${v.smt}) (fp.isInfinite ${v.smt}))`));
  if (name === "Number.isFinite") return bool(finite);
  const integer = and(finite, `(fp.eq (fp.roundToIntegral RTZ ${v.smt}) ${v.smt})`);
  return bool(name === "Number.isInteger" ? integer : and(integer, `(fp.leq (fp.abs ${v.smt}) ${literal(Number.MAX_SAFE_INTEGER).smt})`));
}

export function record(fields = []) {
  return { sort: "object", fields: new Map(fields) };
}

export function property(owner, key, value) {
  return record(new Map(owner.fields).set(key, { hasKey: "true", value }));
}

export function spread(owner, addition, node) {
  if (addition.sort !== "object") fail("Record spread requires a plain data record.", node);
  const fields = new Map(owner.fields);
  for (const [key, field] of addition.fields) {
    const old = fields.get(key);
    fields.set(key, { hasKey: or(old?.hasKey ?? "false", field.hasKey),
      value: merge(field.hasKey, field.value, old?.value ?? undef(), node) });
  }
  return record(fields);
}

export function member(owner, key, node) {
  if (owner.sort === "array" && key === "length") return owner.length;
  if (owner.sort === "object" && owner.fields.has(key)) {
    const field = owner.fields.get(key);
    if (field.hasKey !== "true" && Object.hasOwn(Object.prototype, key)) fail("An absent optional field with this name exposes a prototype property.", node);
    return field.hasKey === "true" ? field.value : merge(field.hasKey, field.value, undef(), node);
  }
  return fail(`Unknown data property ${key}. Prototype properties are not modeled.`, node);
}

export function array(values, node) {
  const element = values.find((v) => v.sort !== "undefined")?.sort ?? "number";
  if (!["number", "boolean"].includes(element) || values.some((v) => v.sort !== element && v.sort !== "undefined")) fail("Arrays currently contain one primitive type, optionally undefined in constructed arrays.", node);
  return { sort: "array", element, length: literal(values.length), empty: !values.length,
    allowUndefined: values.some((v) => v.present !== "true"),
    at(i) {
      let value = undef();
      for (let k = values.length - 1; k >= 0; k--) value = merge(`(= ${i} ${bv(k)})`, values[k], value, node);
      return value;
    } };
}

export function every(owner, bound, callback, node) {
  if (owner.sort !== "array" || !owner.length.u32) fail("every requires an ordinary array with an indexed length.", node);
  // Native callback indices are present unsigned integers below 2^32. Binary64
  // represents them exactly, so indexing can use the cached u32 without coercion.
  const index = num(`((_ to_fp_unsigned 11 53) RNE ${bound})`, "true", bound);
  const holds = need(callback(owner.at(bound), index), "boolean", node);
  return bool(holds === "true" ? "true"
    : `(forall ((${bound} (_ BitVec 32))) (=> (bvult ${bound} ${owner.length.u32}) ${holds}))`);
}

export function index(owner, value, node) {
  if (owner.sort !== "array") fail("Computed indexing currently requires an array.", node);
  const x = need(value, "number", node);
  const i = value.u32 ?? `((_ fp.to_ubv 32) RTZ ${x})`;
  const valid = value.u32 ? and(value.present, `(bvult ${i} ${owner.length.u32})`)
    : and(`(fp.geq ${x} ${literal(0).smt})`, `(fp.lt ${x} ${owner.length.smt})`, `(fp.eq (fp.roundToIntegral RTZ ${x}) ${x})`);
  return merge(valid, owner.at(i), undef(), node);
}

export function slice(owner, args, node) {
  if (owner.sort !== "array" || args.length > 2) fail("slice supports an ordinary array and zero to two numeric arguments.", node);
  const normalize = (v, fallback) => {
    if (!v || v.sort === "undefined") return fallback;
    const x = `(fp.roundToIntegral RTZ ${need(v, "number", node)})`;
    const negative = `(fp.lt ${x} ${literal(0).smt})`;
    const neg = ite(`(fp.leq ${x} (fp.neg ${owner.length.smt}))`, bv(0),
      `(bvsub ${owner.length.u32} ((_ fp.to_ubv 32) RTZ (fp.neg ${x})))`);
    const pos = ite(`(fp.lt ${x} ${owner.length.smt})`, `((_ fp.to_ubv 32) RTZ ${x})`, owner.length.u32);
    return ite(v.present, ite(`(fp.isNaN ${x})`, bv(0), ite(negative, neg, pos)), fallback);
  };
  const start = normalize(args[0], bv(0)), end = normalize(args[1], owner.length.u32);
  const length = ite(`(bvult ${start} ${end})`, `(bvsub ${end} ${start})`, bv(0));
  return { sort: "array", element: owner.element,
    length: num(`((_ to_fp_unsigned 11 53) RNE ${length})`, "true", length),
    at: (i) => owner.at(`(bvadd ${start} ${i})`), allowUndefined: owner.allowUndefined, empty: owner.empty };
}

// The accepted type grammar describes plain data, rather than all of TS.
export function parseType(text, node) {
  const tokens = [];
  const re = /\s*([A-Za-z_$][\w$]*|[{}\[\]<>:;,?()|])/y;
  let offset = 0;
  while (text.slice(offset).trim()) {
    re.lastIndex = offset;
    const m = re.exec(text);
    if (!m) fail("Unsupported data type syntax. Use primitive arrays or inline data records.", node);
    tokens.push(m[1]); offset = re.lastIndex;
  }
  let i = 0;
  const take = (token) => tokens[i] === token ? (++i, true) : false;
  const expect = (token) => { if (!take(token)) fail(`Expected ${token} in the data type.`, node); };
  const primitive = (t) => ["number", "boolean", "undefined"].includes(t);
  const optional = (t) => { if (!primitive(t)) fail("Optional references are unsupported; optional fields must be primitive.", node); return t === "undefined" ? t : { kind: "optional", type: t }; };
  const arr = (t) => { if (!["number", "boolean"].includes(t)) fail("Array inputs currently contain numbers or booleans, without holes or undefined elements.", node); return { kind: "array", element: t }; };
  function type() {
    take("readonly");
    let t;
    if (take("(")) { t = type(); expect(")"); }
    else if (take("{")) {
      const fields = [];
      while (!take("}")) {
        if (tokens[i] === "readonly" && ![":", "?"].includes(tokens[i + 1])) i++;
        const name = tokens[i++];
        if (!name || !/^[A-Za-z_$][\w$]*$/.test(name) || name === "__proto__" || fields.some((f) => f.name === name)) fail("Record fields need unique ordinary names, excluding __proto__.", node);
        const isOptional = take("?"); expect(":");
        const value = type();
        if (isOptional && Object.hasOwn(Object.prototype, name)) fail("Optional fields must not expose inherited Object.prototype properties.", node);
        if (isOptional && !primitive(value) && value.kind !== "optional") fail("Optional record fields currently hold primitives only.", node);
        fields.push({ name, type: isOptional && primitive(value) ? optional(value) : value, optional: isOptional });
        if (tokens[i] !== "}") { if (!take(";") && !take(",")) fail("Separate record fields with ; or ,.", node); }
      }
      t = { kind: "object", fields };
    } else {
      const name = tokens[i++];
      if (primitive(name)) t = name;
      else if (["Array", "ReadonlyArray", "Readonly"].includes(name)) { expect("<"); const inner = type(); expect(">"); t = name === "Readonly" ? inner : arr(inner); }
      else fail(`Unsupported type ${name ?? "(missing)"}. Use inline data types; aliases are not resolved yet.`, node);
    }
    while (take("[")) { expect("]"); t = arr(t); }
    if (take("|")) {
      const right = type();
      if (right === "undefined") t = optional(t);
      else if (t === "undefined") t = optional(right);
      else fail("Only primitive | undefined unions are supported.", node);
    }
    return t;
  }
  const result = type();
  if (i !== tokens.length) fail("Unsupported trailing data type syntax.", node);
  return result;
}

export function input(type, prefix) {
  if (type === "undefined") return { value: undef(), declarations: [], model: { kind: "undefined" }, lengths: [] };
  if (type === "number" || type === "boolean") {
    return { value: type === "number" ? num(`((_ to_fp 11 53) ${prefix})`) : bool(prefix),
      declarations: [`(declare-const ${prefix} ${type === "number" ? "(_ BitVec 64)" : "Bool"})`], model: { kind: type, symbol: prefix }, lengths: [] };
  }
  if (type.kind === "optional") {
    const child = input(type.type, `${prefix}_value`), flag = `${prefix}_defined`;
    if (child.value.sort === "undefined") return child;
    return { ...child, value: { ...child.value, present: flag },
      declarations: [`(declare-const ${flag} Bool)`, ...child.declarations], model: { kind: "optional", flag, value: child.model } };
  }
  if (type.kind === "array") {
    const len = `${prefix}_length`, at = `${prefix}_at`, has = `${prefix}_has`;
    const present = (i) => type.allowUndefined ? `(${has} ${i})` : "true";
    return { value: { sort: "array", element: type.element,
      length: num(`((_ to_fp_unsigned 11 53) RNE ${len})`, "true", len),
      at: (i) => type.element === "number" ? num(`((_ to_fp 11 53) (${at} ${i}))`, present(i)) : bool(`(${at} ${i})`, present(i)), allowUndefined: !!type.allowUndefined, empty: false },
      declarations: [`(declare-const ${len} (_ BitVec 32))`, `(declare-fun ${at} ((_ BitVec 32)) ${type.element === "number" ? "(_ BitVec 64)" : "Bool"})`,
        ...(type.allowUndefined ? [`(declare-fun ${has} ((_ BitVec 32)) Bool)`] : [])],
      model: { kind: "array", element: type.element, length: len, at }, lengths: [len] };
  }
  const fields = type.fields.map((f, i) => ({ ...f,
    keyFlag: f.optional ? `${prefix}_field${i}_hasKey` : undefined,
    input: input(f.optional && f.type.kind !== "optional" ? { kind: "optional", type: f.type } : f.type, `${prefix}_field${i}`) }));
  return { value: record(fields.map((f) => [f.name, { hasKey: f.keyFlag ?? "true", value: f.input.value }])),
    declarations: fields.flatMap((f) => [...(f.keyFlag ? [`(declare-const ${f.keyFlag} Bool)`] : []), ...f.input.declarations]),
    lengths: fields.flatMap((f) => f.input.lengths),
    model: { kind: "object", fields: fields.map((f) => ({ name: f.name, keyFlag: f.keyFlag, model: f.input.model })) } };
}

export function valueType(v) {
  if (v.sort === "array") return { kind: "array", element: v.element, allowUndefined: v.allowUndefined };
  if (v.sort === "object") return { kind: "object", fields: [...v.fields].map(([name, field]) => ({ name, type: valueType(field.value), optional: field.hasKey !== "true" })) };
  return v.present !== "true" && v.sort !== "undefined" ? { kind: "optional", type: v.sort } : v.sort;
}

export function materialize(model, raw) {
  if (model.kind === "undefined" || (model.kind === "optional" && raw === null)) return undefined;
  if (model.kind === "optional") return materialize(model.value, raw);
  if (model.kind === "number") return Buffer.from(raw, "hex").readDoubleBE();
  if (model.kind === "boolean") return raw === "true";
  if (model.kind === "array") return raw.map((v) => materialize({ kind: model.element }, v));
  return Object.fromEntries(model.fields.filter((f) => Object.hasOwn(raw, f.name))
    .map((f) => [f.name, materialize(f.model, raw[f.name])]));
}

export function conforms(type, v) {
  if (typeof type === "string") return typeof v === type;
  if (type.kind === "optional") return v === undefined || conforms(type.type, v);
  if (type.kind === "array") return Array.isArray(v) && Array.from({ length: v.length }, (_, i) => Object.hasOwn(v, i) && (type.allowUndefined && v[i] === undefined || typeof v[i] === type.element)).every(Boolean);
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = new Set(type.fields.map((f) => f.name));
  return Object.keys(v).every((k) => keys.has(k)) && type.fields.every((f) => f.optional && !Object.hasOwn(v, f.name) || Object.hasOwn(v, f.name) && conforms(f.type, v[f.name]));
}

export function display(v) {
  if (Array.isArray(v)) return Array.from(v, display);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, display(value)]));
  return Object.is(v, -0) ? "-0" : String(v);
}

export function domain(type) {
  if (typeof type === "string" || type.kind === "optional") return undefined;
  return type.kind === "array" ? "Dense ordinary arrays, standard prototypes, no extra properties; every native array length is included."
    : "Plain records with declared own enumerable data fields; no extra properties, accessors, proxies, or custom prototypes. Collection fields obey the same domain recursively.";
}

const placeholder = (sort) => sort === "number" ? num(literal(0).smt, "false") : bool("false", "false");

// A caller value enters a parameter domain. Sort mismatches are static
// errors; presence, element definedness and own keys become obligations.
export function argument(type, v, node, fresh) {
  const wrong = () => fail(`This argument does not have the parameter's data type ${JSON.stringify(type)}.`, node);
  if (type === "undefined") {
    if (v.sort === "undefined") return { value: v, safe: "true" };
    if (v.sort === "number" || v.sort === "boolean") return { value: undef(), safe: not(v.present) };
    return wrong();
  }
  if (type === "number" || type === "boolean" || type.kind === "optional") {
    const sort = typeof type === "string" ? type : type.type;
    if (v.sort === "undefined") return { value: placeholder(sort), safe: type === sort ? "false" : "true" };
    if (v.sort !== sort) return wrong();
    return { value: v, safe: type === sort ? v.present : "true" };
  }
  if (type.kind === "array") {
    if (v.sort !== "array" || (!v.empty && v.element !== type.element) || !v.length.u32) return wrong();
    const value = v.empty ? { ...v, element: type.element } : v;
    if (!v.allowUndefined) return { value, safe: "true" };
    const q = fresh("arg_q");
    const holds = v.at(q).present;
    return { value, safe: holds === "true" ? "true" : `(forall ((${q} (_ BitVec 32))) (=> (bvult ${q} ${v.length.u32}) ${holds}))` };
  }
  if (v.sort !== "object") return wrong();
  const declared = new Set(type.fields.map((f) => f.name));
  const safe = [...v.fields].filter(([k]) => !declared.has(k)).map(([, f]) => not(f.hasKey));
  const fields = type.fields.map((f) => {
    const got = v.fields.get(f.name);
    if (!got && !f.optional) fail(`This argument lacks the required field ${f.name}.`, node);
    const inner = argument(f.type, got?.value ?? undef(), node, fresh);
    const hasKey = got?.hasKey ?? "false";
    safe.push(f.optional ? implies(hasKey, inner.safe) : and(hasKey, inner.safe));
    return [f.name, { hasKey, value: inner.value }];
  });
  return { value: record(fields), safe: and(...safe) };
}
