import { fail } from "./error.mjs";
import { TABLE, PREDICATE_DOMAIN, predicateFromTable } from "./predicate-witness.mjs";
export { TABLE } from "./predicate-witness.mjs";

export const REPLAY_LIMIT = 256;
const MAX_LENGTH = 0xffff_ffff;
export const and = (...xs) => xs.includes("false") ? "false" : join("and", xs.filter((x) => x !== "true"), "true");
export const or = (...xs) => xs.includes("true") ? "true" : join("or", xs.filter((x) => x !== "false"), "false");
const join = (op, xs, empty) => !xs.length ? empty : xs.length === 1 ? xs[0] : `(${op} ${xs.join(" ")})`;
export const not = (x) => x === "true" ? "false" : x === "false" ? "true" : `(not ${x})`;
const ite = (c, a, b) => c === "true" || a === b ? a : c === "false" ? b : `(ite ${c} ${a} ${b})`;
const bv = (n) => `#x${n.toString(16).padStart(8, "0")}`;
const num = (smt, present = "true", u32, nat) => ({ sort: "number", smt, present, u32, nat });
export const numberView = (smt) => num(smt);
// An exact natural shadow: a present number numerically equal to this unsigned
// bit-vector (either zero sign). Widths stay <= 53, so binary64 sums are exact.
export const natOf = (v) => v.sort !== "number" || v.present !== "true" ? undefined : v.nat ?? (v.u32 ? { smt: v.u32, width: 32 } : undefined);
// Numeric value = unsigned shadow - 1, including either zero sign. The
// predecessor itself has no u32 cache; only its exact successor can index fast.
export const predecessorOf = (v) => v.sort === "number" && v.present === "true" ? v.predecessor : undefined;
const literalIs = (v, value) => v.sort === "number" && v.present === "true" && v.literal === value;
const integerOf = (v) => {
  const n = natOf(v), p = predecessorOf(v);
  return n ? { ...n, offset: 0 } : p ? { ...p, offset: -1 }
    : v.sort === "number" && v.present === "true" && v.literal === -1 ? { smt: bv(0), width: 32, offset: -1 } : undefined;
};
const widen = (n, w) => n.width === w ? n.smt : `((_ zero_extend ${w - n.width}) ${n.smt})`;
const natPair = (a, b) => { if (!a.nat && !b.nat) return; const x = natOf(a), y = natOf(b); if (!x || !y) return; const w = Math.max(x.width, y.width); return [widen(x, w), widen(y, w), w]; };
// Shift both exact integers above zero, with one extra bit to prevent wrap.
// This keeps a predecessor (-1 included) comparable with ordinary u32 indices.
const integerPair = (a, b) => {
  if (!a.nat && !b.nat && !a.predecessor && !b.predecessor) return;
  const x = integerOf(a), y = integerOf(b);
  if (!x || !y) return;
  const offset = Math.min(x.offset, y.offset), width = Math.max(x.width, y.width) + Number(x.offset !== y.offset);
  const shift = (n) => n.offset === offset ? widen(n, width) : `(bvadd ${widen(n, width)} (_ bv1 ${width}))`;
  return [shift(x), shift(y)];
};
export const bool = (smt, present = "true") => ({ sort: "boolean", smt, present });
export const undef = () => ({ sort: "undefined", present: "false" });
const isReference = (v) => v.sort === "array" || v.sort === "object";
const isRef = (v) => ["object", "array"].includes(v?.sort) && typeof v.ref === "string";
const FP = "(_ FloatingPoint 11 53)";
// Function values: {sort:"function", kind:"symbol"|"closure"|"named", type?}.
// They are immutable, never stored, merged, compared or returned.
export const isFunctionType = (t) => !!t && typeof t === "object" && t.kind === "function";
export const sameSignature = (a, b) => a.params.length === b.params.length && a.params.every((p, i) => p === b.params[i]) && a.result === b.result;
const noFunctions = (v, node, what) => { if (v.sort === "function") fail(`Function values cannot be ${what}; pass them directly as call arguments.`, node); };

// Every numeric value admitted by the proven u32 invariant is represented,
// including both zero signs. The exact BV shadow is not an input assumption.
export function natural(prefix, predecessor = false) {
  const u = `${prefix}_u32`, z = `${prefix}_negative_zero`;
  const payload = `((_ to_fp_unsigned 11 53) RNE ${u})`;
  if (predecessor) return {
    declarations: [`(declare-const ${u} (_ BitVec 32))`, `(declare-const ${z} Bool)`],
    value: { ...num(`(ite (and ${z} (= ${u} #x00000001)) (_ -zero 11 53) (fp.sub RNE ${payload} ${literal(1).smt}))`), predecessor: { smt: u, width: 32 } },
  };
  return {
    declarations: [`(declare-const ${u} (_ BitVec 32))`, `(declare-const ${z} Bool)`],
    value: num(`(ite (and ${z} (= ${u} #x00000000)) (_ -zero 11 53) ((_ to_fp_unsigned 11 53) RNE ${u}))`, "true", u, { smt: u, width: 32 }),
  };
}

export function literal(value) {
  if (typeof value === "boolean") return bool(String(value));
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleBE(value);
  return { ...num(`((_ to_fp 11 53) #x${bytes.toString("hex")})`, "true",
    Number.isInteger(value) && value >= 0 && value <= MAX_LENGTH ? bv(value) : undefined), literal: value };
}

export function need(v, sort, node) {
  if (sort === "boolean" && v.sort === "undefined") return "false";
  if (sort === "number" && v.sort === "undefined") return literal(NaN).smt;
  if (v.sort !== sort) fail(`Expected ${sort}; this JavaScript coercion is unsupported.`, node);
  return sort === "boolean" ? and(v.present, v.smt) : ite(v.present, v.smt, literal(NaN).smt);
}

function joinType(a, b, node) {
  if (JSON.stringify(a) === JSON.stringify(b)) return a;
  const optional = (t) => typeof t === "string" ? t === "undefined" ? t : { kind: "optional", type: t } : t;
  if (a === "undefined") return optional(b);
  if (b === "undefined") return optional(a);
  const base = (t) => t?.kind === "optional" ? t.type : t;
  if (base(a) === base(b)) return optional(base(a));
  if (a.kind === "array" && b.kind === "array" && a.element === b.element) return { kind: "array", element: a.element, allowUndefined: a.allowUndefined || b.allowUndefined };
  if (a.kind === "object" && b.kind === "object") {
    const names = new Set([...a.fields, ...b.fields].map((f) => f.name));
    return { kind: "object", fields: [...names].map((name) => {
      const x = a.fields.find((f) => f.name === name), y = b.fields.find((f) => f.name === name);
      const type = joinType(x?.type ?? "undefined", y?.type ?? "undefined", node);
      const optional = !x || !y || x.optional || y.optional;
      if (optional && ["array", "object"].includes(type?.kind)) fail("Optional reference fields are outside the supported heap slice.", node);
      return { name, type, optional };
    }) };
  }
  fail("These reference branches have incompatible field or element types.", node);
}

export function merge(c, a, b, node) {
  if (c === "true") return a;
  if (c === "false") return b;
  if (a.sort === "function" || b.sort === "function") fail("Conditional merges of function values are unsupported.", node);
  if (a.sort === "undefined" && ["number", "boolean"].includes(b.sort)) a = { ...b, present: "false" };
  if (b.sort === "undefined" && ["number", "boolean"].includes(a.sort)) b = { ...a, present: "false" };
  if (a.sort !== b.sort) fail("These branches return incompatible types. Optional references are unsupported.", node);
  if (a.sort === "undefined") return undef();
  if (isRef(a) || isRef(b)) {
    if (!isRef(a) || !isRef(b)) fail("Reference and value branches cannot be joined.", node);
    if (a.sort === "array" && (a.empty || b.empty)) {
      if (a.empty) a = { ...a, type: { ...a.type, element: b.type.element } };
      if (b.empty) b = { ...b, type: { ...b.type, element: a.type.element } };
    }
    const type = joinType(a.type, b.type, node), ref = ite(c, a.ref, b.ref);
    if (a.spec && b.spec) {
      const { ref: ar, type: at, spec: as, ...av } = a, { ref: br, type: bt, spec: bs, ...bv } = b;
      return { ...merge(c, av, bv, node), ref, type, spec: true };
    }
    return { sort: a.sort, ref, type, empty: a.empty && b.empty,
      ...(a.sort === "array" && a.length && b.length ? { length: merge(c, a.length, b.length, node) } : {}) };
  }
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
    u32: a.u32 && b.u32 ? ite(c, a.u32, b.u32) : undefined,
    nat: a.sort === "number" && natPair(a, b) ? (([x, y, width]) => ({ smt: ite(c, x, y), width }))(natPair(a, b)) : undefined };
}

function equal(a, b, sameValue, node) {
  if (a.sort === "function" || b.sort === "function") fail("Function identity is not modeled; compare results instead.", node);
  // G heap slice: record identity is ref equality; a record is never a primitive.
  if (isRef(a) && isRef(b)) return bool(`(= ${a.ref} ${b.ref})`);
  if (isRef(a) && !isReference(b) || isRef(b) && !isReference(a)) return bool("false");
  if (isReference(a) || isReference(b)) fail("Array/object reference identity is unsupported. Compare fields or elements instead.", node);
  const pair = !sameValue && integerPair(a, b);
  const payload = a.sort !== b.sort || a.sort === "undefined" ? "false" : pair ? `(= ${pair[0]} ${pair[1]})`
    : `(${a.sort === "number" && !sameValue ? "fp.eq" : "="} ${a.smt} ${b.smt})`;
  return bool(or(and(not(a.present), not(b.present)), and(a.present, b.present, payload)));
}

export function unary(op, a, node) {
  if (op === "!") return bool(not(need(a, "boolean", node)));
  // ToNumber of a present number is the identity, so exact shadows survive.
  if (op === "+") return a.sort === "number" && a.present === "true" && (a.nat || a.predecessor) ? a : num(need(a, "number", node));
  if (op === "-") return { ...num(`(fp.neg ${need(a, "number", node)})`), ...(a.sort === "number" && a.present === "true" && a.literal !== undefined ? { literal: -a.literal } : {}) };
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
  if (op === "-" && literalIs(b, 1) && a.nat && natOf(a)) return { ...num(`(fp.sub RNE ${args})`), predecessor: natOf(a) };
  if (op === "+") {
    const p = literalIs(b, 1) ? predecessorOf(a) : literalIs(a, 1) ? predecessorOf(b) : undefined;
    if (p) return num(`(fp.add RNE ${args})`, "true", p.width === 32 ? p.smt : undefined, p);
  }
  const pair = natPair(a, b);
  if (pair && op === "+" && pair[2] < 53) {
    const w = pair[2] + 1, sum = `(bvadd ((_ zero_extend 1) ${pair[0]}) ((_ zero_extend 1) ${pair[1]}))`;
    return num(`(fp.add RNE ${args})`, "true", undefined, { smt: sum, width: w });
  }
  const bvops = { "<": "bvult", "<=": "bvule", ">": "bvugt", ">=": "bvuge" };
  const comparison = integerPair(a, b);
  if (comparison && op in bvops) return bool(`(${bvops[op]} ${comparison[0]} ${comparison[1]})`);
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
  if ((v.nat && natOf(v)?.width <= 53) || predecessorOf(v)?.width <= 53) return bool("true");
  const finite = and(v.present, not(`(or (fp.isNaN ${v.smt}) (fp.isInfinite ${v.smt}))`));
  if (name === "Number.isFinite") return bool(finite);
  const integer = and(finite, `(fp.eq (fp.roundToIntegral RTZ ${v.smt}) ${v.smt})`);
  return bool(name === "Number.isInteger" ? integer : and(integer, `(fp.leq (fp.abs ${v.smt}) ${literal(Number.MAX_SAFE_INTEGER).smt})`));
}

export function record(fields = []) {
  return { sort: "object", fields: new Map(fields) };
}

export function property(owner, key, value) {
  noFunctions(value, undefined, "stored in records");
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
  values.forEach((v) => noFunctions(v, node, "stored in arrays"));
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
  const n = !value.u32 && natOf(value);
  if (n && owner.length.u32) {
    const len = widen({ smt: owner.length.u32, width: 32 }, n.width);
    return merge(`(bvult ${n.smt} ${len})`, owner.at(`((_ extract 31 0) ${n.smt})`), undef(), node);
  }
  const i = value.u32 ?? `((_ fp.to_ubv 32) RTZ ${x})`;
  const valid = value.u32 ? and(value.present, `(bvult ${i} ${owner.length.u32})`)
    : and(`(fp.geq ${x} ${literal(0).smt})`, `(fp.lt ${x} ${owner.length.smt})`, `(fp.eq (fp.roundToIntegral RTZ ${x}) ${x})`);
  return merge(valid, owner.at(i), undef(), node);
}

export function slice(owner, args, node) {
  if (owner.sort !== "array" || args.length > 2) fail("slice supports an ordinary array and zero to two numeric arguments.", node);
  const normalize = (v, fallback) => {
    if (!v || v.sort === "undefined") return fallback;
    const natural = natOf(v);
    if (natural) {
      const width = Math.max(32, natural.width), n = widen(natural, width), len = widen({ smt: owner.length.u32, width: 32 }, width);
      const low = natural.width === 32 ? natural.smt : natural.width < 32 ? widen(natural, 32) : `((_ extract 31 0) ${natural.smt})`;
      return ite(`(bvult ${n} ${len})`, low, owner.length.u32);
    }
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
export function parseType(text, node, resolve) {
  text = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, " ");
  const tokens = [];
  const re = /\s*(=>|[A-Za-z_$][\w$]*|[{}\[\]<>:;,?()|])/y;
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
    const ident = (x) => /^[A-Za-z_$][\w$]*$/.test(x ?? "");
    if (tokens[i] === "(" && (tokens[i + 1] === ")" && tokens[i + 2] === "=>" || ident(tokens[i + 1]) && tokens[i + 2] === ":")) {
      // (x: number, ...) => boolean: a pure total callback over primitives.
      i++;
      const params = [];
      while (!take(")")) {
        if (!ident(tokens[i])) fail("Callback type parameters need simple names.", node);
        i++; expect(":");
        const p = type();
        if (!["number", "boolean"].includes(p)) fail("Callback parameters are present numbers or booleans in this slice.", node);
        params.push(p);
        if (tokens[i] !== ")") expect(",");
      }
      expect("=>");
      const result = type();
      if (params.length !== 1 || params[0] !== "number" || result !== "boolean") fail("This callback slice supports only (x: number) => boolean: one present number and a present boolean result.", node);
      return { kind: "function", params, result };
    }
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
        if (isFunctionType(value)) fail("Function-valued record fields are unsupported (no function storage).", node);
        if (isOptional && !primitive(value) && value.kind !== "optional") fail("Optional record fields currently hold primitives only.", node);
        fields.push({ name, type: isOptional && primitive(value) ? optional(value) : value, optional: isOptional });
        if (tokens[i] !== "}") { if (!take(";") && !take(",")) fail("Separate record fields with ; or ,.", node); }
      }
      t = { kind: "object", fields };
    } else {
      const name = tokens[i++];
      if (primitive(name)) t = name;
      else if (["Array", "ReadonlyArray", "Readonly"].includes(name)) { expect("<"); const inner = type(); expect(">"); t = name === "Readonly" ? inner : arr(inner); }
      else {
        const args = [];
        if (take("<")) {
          do { args.push(type()); } while (take(","));
          expect(">");
        }
        if (!resolve) fail(`Unsupported or unresolved type ${name ?? "(missing)"}.`, node);
        t = resolve(name, args, node);
      }
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
  if (type.kind === "function") {
    // The uninterpreted symbol ranges over binary64 VALUES, not bit patterns:
    // It separates +0/-0; the admitted predicate domain excludes NaN-payload inspection.
    return { value: { sort: "function", kind: "symbol", symbol: prefix, type, purity: { kind: "assumed", domain: PREDICATE_DOMAIN } },
      declarations: [`(declare-fun ${prefix} (${FP}) Bool)`],
      model: { kind: "function", symbol: prefix, params: type.params, result: type.result }, lengths: [] };
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
  if (isRef(v)) return v.type;
  if (v.sort === "function") return v.type;
  if (v.sort === "array") return { kind: "array", element: v.element, allowUndefined: v.allowUndefined };
  if (v.sort === "object") return { kind: "object", fields: [...v.fields].map(([name, field]) => ({ name, type: valueType(field.value), optional: field.hasKey !== "true" })) };
  return v.present !== "true" && v.sort !== "undefined" ? { kind: "optional", type: v.sort } : v.sort;
}

export function materialize(model, raw) {
  if (model.kind === "undefined" || (model.kind === "optional" && raw === null)) return undefined;
  if (model.kind === "optional") return materialize(model.value, raw);
  if (model.kind === "number") return Buffer.from(raw, "hex").readDoubleBE();
  if (model.kind === "boolean") return raw === "true";
  if (model.kind === "function") {
    return predicateFromTable(raw);
  }
  if (model.kind === "array") return raw.map((v) => materialize({ kind: model.element }, v));
  return Object.fromEntries(model.fields.filter((f) => Object.hasOwn(raw, f.name))
    .map((f) => [f.name, materialize(f.model, raw[f.name])]));
}

export function conforms(type, v) {
  if (typeof type === "string") return typeof v === type;
  if (type.kind === "function") return typeof v === "function";
  if (type.kind === "optional") return v === undefined || conforms(type.type, v);
  if (type.kind === "array") return Array.isArray(v) && Array.from({ length: v.length }, (_, i) => Object.hasOwn(v, i) && (type.allowUndefined && v[i] === undefined || typeof v[i] === type.element)).every(Boolean);
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = new Set(type.fields.map((f) => f.name));
  return Object.keys(v).every((k) => keys.has(k)) && type.fields.every((f) => f.optional && !Object.hasOwn(v, f.name) || Object.hasOwn(v, f.name) && conforms(f.type, v[f.name]));
}

export function display(v) {
  if (typeof v === "function") return v[TABLE] ?? "[function]";
  if (Array.isArray(v)) return Array.from(v, display);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, display(value)]));
  return Object.is(v, -0) ? "-0" : String(v);
}

export function domain(type) {
  if (typeof type === "string" || type.kind === "optional") return undefined;
  if (type.kind === "function") return PREDICATE_DOMAIN;
  return type.kind === "array" ? "Dense ordinary arrays, standard prototypes, no extra properties; every native array length is included. References may be shared across parameters and fields."
    : "Plain records with declared own enumerable data fields; no extra properties, accessors, proxies, or custom prototypes. Collection fields obey the same domain recursively. References may be shared across parameters and fields.";
}

const placeholder = (sort) => sort === "number" ? num(literal(0).smt, "false") : bool("false", "false");

// A caller value enters a parameter domain. Sort mismatches are static
// errors; presence, element definedness and own keys become obligations.
export function argument(type, v, node, fresh) {
  const wrong = () => fail(`This argument does not have the parameter's data type ${JSON.stringify(type)}.`, node);
  if (isFunctionType(type)) {
    if (v.sort !== "function") return wrong();
    // Closures take the contextual type; annotations must agree with it.
    if (v.kind === "closure") {
      const ann = v.annotations;
      if (ann.params.length !== type.params.length || ann.params.some((p, i) => p !== undefined && p !== type.params[i]) || ann.result !== undefined && ann.result !== type.result) wrong();
      return { value: { ...v, type }, safe: "true" };
    }
    if (!sameSignature(v.type, type)) return wrong();
    return { value: v, safe: "true" };
  }
  if (v.sort === "function") return wrong();
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
