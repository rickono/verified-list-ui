import { fail } from "./error.mjs";
import { and, bool, builtin, not, need, natOf, predecessorOf, literal, binary as nativeBinary } from "./data.mjs";

const real = (smt) => ({ sort: "real", smt, present: "true" });
const integer = (n) => n < 0n ? `(- ${-n})` : String(n);

export function embed(value, node, require) {
  if (value.sort !== "number") fail("real(...) requires a JavaScript number or an exact rational string literal.", node);
  require(builtin("Number.isFinite", [value], node).smt);
  return { ...real(`(fp.to_real ${value.smt})`), embedded: value,
    linear: { terms: new Map([[need(value, "number", node), { view: value, coeff: 1n }]]), constant: 0n } };
}

export function exact(text, node) {
  let value;
  try { value = rational(text); }
  catch (e) { fail(e.message, node); }
  return { ...real(`(/ ${integer(value.n)} ${integer(value.d)})`), constant: value,
    ...(value.d === 1n ? { linear: { terms: new Map(), constant: value.n } } : {}) };
}

function nativeOperand(value) {
  if (value.embedded) return value.embedded;
  if (!value.constant) return;
  const { n, d } = value.constant, candidate = Number(n) / Number(d);
  if (!Number.isFinite(candidate)) return;
  const exact = fromNumber(candidate);
  // The approximation only proposes a candidate. This integer check is the
  // evidence that replacing a real comparison with a finite FP comparison is exact.
  if (exact.n * d === n * exact.d) return literal(candidate);
}

export function unary(op, value, node) {
  if (op === "+") return value;
  if (op === "-") return { ...real(`(- ${value.smt})`),
    ...(value.linear ? { linear: combineLinear({ terms: new Map(), constant: 0n }, value.linear, -1n) } : {}) };
  return fail(`Unsupported real unary operator ${op}.`, node);
}

export function binary(op, a, b, node, require) {
  if (a.sort !== "real" || b.sort !== "real") fail("Real operations require two real operands; embed JavaScript numbers explicitly.", node);
  if (["<", "<=", ">", ">=", "===", "==", "!==", "!="].includes(op)) {
    const left = nativeOperand(a), right = nativeOperand(b);
    // Finite embeddings preserve order and numerical equality, including both
    // zero signs. Their separate definedness obligations remain mandatory.
    if (left && right) return nativeBinary(op, left, right, node);
  }
  const args = `${a.smt} ${b.smt}`;
  if (["+", "-", "*", "/"].includes(op)) {
    if (op === "/") require(not(`(= ${b.smt} 0.0)`));
    return { ...real(`(${op} ${args})`),
      ...(["+", "-"].includes(op) && a.linear && b.linear ? { linear: combineLinear(a.linear, b.linear, op === "+" ? 1n : -1n) } : {}) };
  }
  if (["<", "<=", ">", ">="].includes(op)) return bool(`(${op} ${args})`);
  if (["===", "==", "!==", "!="].includes(op)) {
    const eq = `(= ${args})`;
    return bool(op.includes("!") ? not(eq) : eq);
  }
  return fail(`Unsupported real operator ${op}.`, node);
}

function combineLinear(a, b, sign) {
  const terms = new Map([...a.terms].map(([key, term]) => [key, { ...term }]));
  for (const [key, term] of b.terms) terms.set(key, { view: term.view, coeff: (terms.get(key)?.coeff ?? 0n) + sign * term.coeff });
  return { terms, constant: a.constant + sign * b.constant };
}

// Lower exact linear ranks, never native arithmetic. Directed rounding gives
// the least/greatest binary64 threshold satisfying the exact real inequality.
function rankAtLeast(value, k) {
  if (!value.linear) return `(>= ${value.smt} ${integer(k)})`;
  k -= value.linear.constant;
  const live = [...value.linear.terms.values()].filter((term) => term.coeff !== 0n);
  if (!live.length) return String(k <= 0n);
  const lit = (n) => literal(Number(n));
  if (k >= -(2n ** 53n) && k <= 2n ** 53n) {
    if (live.length === 1 && live[0].coeff === 1n) return nativeBinary(">=", live[0].view, lit(k)).smt;
    if (live.length === 1 && live[0].coeff === -1n) return nativeBinary("<=", live[0].view, lit(-k)).smt;
    if (live.length === 2) {
      const [x, y] = live[0].coeff === 1n ? live : [live[1], live[0]];
      const a = need(x.view, "number"), b = need(y.view, "number");
      if (x.coeff === 1n && y.coeff === -1n) {
        if (k === 0n) return nativeBinary(">=", x.view, y.view).smt;
        if (k > 0n && k <= 0xffffffffn && natOf(x.view) && (natOf(y.view) || predecessorOf(y.view))) {
          const sum = nativeBinary("+", y.view, lit(k));
          if (natOf(sum)) return nativeBinary(">=", x.view, sum).smt;
        }
        return `(fp.geq ${a} (fp.add RTP ${b} ${lit(k).smt}))`;
      }
      if (x.coeff === 1n && y.coeff === 1n) return `(fp.geq ${a} (fp.sub RTP ${lit(k).smt} ${b}))`;
      if (x.coeff === -1n && y.coeff === -1n) return `(fp.leq ${a} (fp.sub RTN ${lit(-k).smt} ${b}))`;
    }
  }
  const terms = live.map((term) => `(* ${integer(term.coeff)} (fp.to_real ${need(term.view, "number")}))`);
  return `(>= (+ 0.0 ${terms.join(" ")}) ${integer(k)})`;
}

// Each back-edge starts nonnegative and drops by at least one exact unit.
// Strict decrease without this minimum would not be a well-founded real rank.
export function rankDecrease(previous, next) {
  const difference = binary("-", previous, next);
  return and(rankAtLeast(previous, 0n), rankAtLeast(difference, 1n));
}

// A witness preference only. The proof query never assumes this bound.
export function rankAtMost(value, limit) {
  return rankAtLeast(unary("-", value), -BigInt(limit));
}

class Rational {
  constructor(n, d = 1n) {
    if (d === 0n) throw undefinedSpec("Mathematical division by zero.");
    if (d < 0n) { n = -n; d = -d; }
    let x = n < 0n ? -n : n, y = d;
    while (y) [x, y] = [y, x % y];
    this.n = n / x;
    this.d = d / x;
    Object.freeze(this);
  }
  toString() { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
}

export const isReal = (value) => value instanceof Rational;
const undefinedSpec = (message) => Object.assign(new Error(message), { code: "SPEC_UNDEFINED" });
export const isUndefinedSpec = (error) => error?.code === "SPEC_UNDEFINED";

// This parser uses decimal digits, never Number(text), so its operands are exact.
export function rational(text) {
  if (typeof text !== "string" || text.length > 1024) throw new Error("Exact rational literals need at most 1024 characters.");
  if (/^[+-]?\d+\/[+-]?\d+$/.test(text)) {
    const [n, d] = text.split("/").map(BigInt);
    if (!d) throw new Error("An exact rational literal cannot have a zero denominator.");
    return new Rational(n, d);
  }
  const m = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!m) throw new Error("Use an exact decimal or integer/integer string literal in real(...).");
  const exponent = Number(m[3] ?? 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 1000) throw new Error("An exact decimal exponent must be between -1000 and 1000.");
  const [whole, fraction = ""] = m[2].split(".");
  const n = BigInt(`${m[1]}${whole}${fraction}`), scale = fraction.length - exponent;
  return scale >= 0 ? new Rational(n, 10n ** BigInt(scale)) : new Rational(n * 10n ** BigInt(-scale));
}

function fromNumber(value) {
  if (!Number.isFinite(value)) throw undefinedSpec("real(number) requires a present finite number.");
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleBE(value);
  const bits = bytes.readBigUInt64BE(), exponent = Number((bits >> 52n) & 0x7ffn);
  let n = bits & 0xfffffffffffffn;
  if (exponent) n |= 1n << 52n;
  if (bits >> 63n) n = -n;
  const power = exponent ? exponent - 1023 - 52 : -1074;
  return power >= 0 ? new Rational(n << BigInt(power)) : new Rational(n, 1n << BigInt(-power));
}

// Concrete replay is independent of SMT. Both ordinary operands retain native
// JS operations; a mathematical operand selects reduced BigInt arithmetic.
export const runtime = Object.freeze({
  real: (value) => typeof value === "string" ? rational(value) : fromNumber(value),
  unary(op, value) {
    if (isReal(value)) return op === "-" ? new Rational(-value.n, value.d) : value;
    return op === "-" ? -value : +value;
  },
  binary(op, a, b) {
    if (isReal(a) || isReal(b)) {
      if (!isReal(a) || !isReal(b)) throw new Error("Mixed mathematical and JavaScript operands.");
      const left = a.n * b.d, right = b.n * a.d;
      switch (op) {
        case "+": return new Rational(left + right, a.d * b.d);
        case "-": return new Rational(left - right, a.d * b.d);
        case "*": return new Rational(a.n * b.n, a.d * b.d);
        case "/": return new Rational(a.n * b.d, a.d * b.n);
        case "==": case "===": return left === right;
        case "!=": case "!==": return left !== right;
        case "<": return left < right;
        case "<=": return left <= right;
        case ">": return left > right;
        case ">=": return left >= right;
      }
    } else {
      switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "==": return a == b;
        case "===": return a === b;
        case "!=": return a != b;
        case "!==": return a !== b;
        case "<": return a < b;
        case "<=": return a <= b;
        case ">": return a > b;
        case ">=": return a >= b;
      }
    }
    throw new Error(`Unsupported replay operator ${op}.`);
  },
});

export function snapshot(value) {
  if (Array.isArray(value)) return value.map(snapshot);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, snapshot(v)]));
  return value;
}

// The compiler validates this AST first. Hidden lexical parameters are chosen
// outside the source's identifiers; no specification helpers enter user scope.
export function replayExpression(node, { library, entry, params }) {
  const read = (child) => replayExpression(child, { library, entry, params });
  switch (node.type) {
    case "Identifier": return node.name;
    case "Literal": return node.raw;
    case "ParenthesizedExpression": return `(${read(node.expression)})`;
    case "UnaryExpression": return node.operator === "!" ? `(!${read(node.argument)})`
      : `${library}.unary(${JSON.stringify(node.operator)}, ${read(node.argument)})`;
    case "BinaryExpression": return `${library}.binary(${JSON.stringify(node.operator)}, ${read(node.left)}, ${read(node.right)})`;
    case "LogicalExpression": return `(${read(node.left)} ${node.operator} ${read(node.right)})`;
    case "ConditionalExpression": return `(${read(node.test)} ? ${read(node.consequent)} : ${read(node.alternate)})`;
    case "MemberExpression": return node.computed ? `(${read(node.object)})[${read(node.property)}]` : `(${read(node.object)}).${node.property.name}`;
    case "CallExpression": {
      if (node.callee.name === "real") return `${library}.real(${read(node.arguments[0])})`;
      if (node.callee.name === "old") return `((${params.join(", ")}) => (${read(node.arguments[0])}))(...${entry})`;
      return `${read(node.callee)}(${node.arguments.map(read).join(", ")})`;
    }
    case "ArrayExpression": return `[${node.elements.map(read).join(", ")}]`;
    case "SpreadElement": return `...${read(node.argument)}`;
    case "ObjectExpression": return `({${node.properties.map(read).join(", ")}})`;
    case "Property": return `${node.key.type === "Identifier" ? node.key.name : node.key.raw}: ${read(node.value)}`;
    case "ArrowFunctionExpression": return `((${node.params.map(read).join(", ")}) => (${read(node.body)}))`;
    default: throw new Error(`Missing specification replay for ${node.type}.`);
  }
}
