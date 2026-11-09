// Oracles use native JavaScript, never compiler/data-model helpers.
export const DEFAULT_SEED = 0x5eed_d00d;
export const BASELINE = "ff2518cd7494300084f2ab54da71f4d79185e586";

export function literal(value) {
  if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`;
  if (value && typeof value === "object") return `({${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${literal(v)}`).join(", ")}})`;
  return Object.is(value, -0) ? "-0" : String(value);
}

function matches(expression, value) {
  if (Array.isArray(value)) return [`${expression}.length === ${value.length}`, ...value.map((v, i) => matches(`${expression}[${i}]`, v))].join(" && ");
  if (value && typeof value === "object") return Object.entries(value).map(([k, v]) => matches(`${expression}[${JSON.stringify(k)}]`, v)).join(" && ") || "true";
  return `Object.is(${expression}, ${literal(value)})`;
}

const sample = (...args) => ({ args, expect: "pass" });
const fn = (name, params, expression, options) => ({
  name, params, expression, requires: [], samples: [], expected: { status: "verified" },
  ...options,
});
export function source(functions) {
  return functions.map((f) => [
    ...f.params.map(([name, type]) => `/** @param {${type}} ${name} */`),
    ...f.requires.map((p) => `// requires ${p}`),
    ...f.ensures.map((p) => `// ensures ${p}`),
    `export const ${f.name} = (${f.params.map(([name]) => name).join(", ")}) => ${f.expression};`,
  ].join("\n")).join("\n\n");
}

function fixture(id, family, functions, provenance) {
  return { id, family, provenance, mode: "source", files: { "entry.mjs": { functions, imports: [] } } };
}

// xorshift32 and raw bit patterns make the seed independent of Math.random.
function randomNumbers(seed) {
  let state = seed || 0x9e3779b9;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  return Array.from({ length: 6 }, () => {
    const bytes = Buffer.alloc(8);
    bytes.writeUInt32BE(next()); bytes.writeUInt32BE(next(), 4);
    return bytes.readDoubleBE();
  });
}

function concrete(name, params, expression, args, options = {}) {
  const expected = Function(...params.map(([p]) => p), `return (${expression});`)(...args);
  return fn(name, params, expression, {
    requires: params.map(([p], i) => matches(p, args[i])),
    ensures: [matches("result", expected)], samples: [sample(...args)], ...options,
  });
}

export function buildCorpus(seed = DEFAULT_SEED) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new TypeError("seed must be a uint32");
  const fixtures = [];
  const numbers = [NaN, Infinity, -Infinity, 0, -0, Number.MIN_VALUE, -Number.MIN_VALUE,
    Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, 2 ** 53, 0.5, -1.5, ...randomNumbers(seed)];
  const pairs = [[0.5, 1], [-0, 0], [0, -0], [Infinity, -Infinity], [NaN, NaN],
    [Number.MAX_VALUE, Number.MAX_VALUE], [Number.MIN_VALUE, 0.5], [2 ** 53, 1],
    ...randomNumbers(seed).map((n, i) => [n, numbers[(i * 3 + 5) % numbers.length]])];
  for (const op of ["+", "-", "*", "/", "<", "<=", ">", ">=", "==", "===", "!=", "!=="]) {
    fixtures.push(fixture(`binary-${op}`, "scalar", pairs.map((args, i) =>
      concrete(`binary${i}`, [["x", "number"], ["y", "number"]], `x ${op} y`, args)),
    "V8 evaluation of each original binary expression; explicit edges plus seeded raw binary64 pairs"));
  }
  for (const [id, expression] of [["plus", "+x"], ["negate", "-x"], ["abs", "Math.abs(x)"],
    ["finite", "Number.isFinite(x)"], ["nan", "Number.isNaN(x)"],
    ["integer", "Number.isInteger(x)"], ["safe", "Number.isSafeInteger(x)"],
    ["composition", "(x + 1) * 0.5 - x / 2"]]) {
    fixtures.push(fixture(`unary-${id}`, "scalar", numbers.map((x, i) =>
      concrete(`unary${i}`, [["x", "number"]], expression, [x])),
    "V8 evaluation of original unary/builtin/composed expression over exceptional and seeded numbers"));
  }
  fixtures.push(fixture("same-value", "scalar", [
    concrete("negativeZero", [["x", "number"]], "1 / x", [-0]),
    concrete("nanIdentity", [["x", "number"]], "x", [NaN]),
    fn("universalIdentity", [["x", "number"]], "x", { ensures: ["Object.is(result, x)"], samples: numbers.map((x) => sample(x)) }),
  ], "Native SameValue, reciprocal zero signs, and universal identity with independent native samples"));
  fixtures.push(fixture("scalar-control", "scalar", [
    fn("blockReturns", [["x", "number"], ["flag", "boolean"]], "{ if (flag) { const next = x + 1; return next; } { const next = x - 1; return next; } }", {
      ensures: ["Object.is(result, flag ? x + 1 : x - 1)"], samples: numbers.flatMap((x) => [sample(x, true), sample(x, false)]),
    }),
  ], "Original block scopes, local constants, branch guards, and early returns executed across both native branches"));
  fixtures.push(fixture("numeric-constants", "scalar", ["MAX_VALUE", "MIN_VALUE", "MAX_SAFE_INTEGER", "MIN_SAFE_INTEGER", "POSITIVE_INFINITY", "NEGATIVE_INFINITY", "NaN"].map((key, i) =>
    concrete(`constant${i}`, [], `Number.${key}`, [])), "V8 supplies each allowlisted Number constant"));

  const optional = [];
  for (const x of [true, false, undefined]) for (const y of [true, false, undefined]) {
    for (const expression of ["x && y", "x || y", "x ?? y", "!x", "x ? y : !y", "x === y", "x == y", "Object.is(x, y)"]) {
      optional.push(concrete(`optional${optional.length}`, [["x", "boolean | undefined"], ["y", "boolean | undefined"]], expression, [x, y]));
    }
  }
  fixtures.push(fixture("optional-booleans", "undefined", optional,
    "Exhaustive native truth table on true/false/undefined; no Boolean coercion formula copied"));
  fixtures.push(fixture("undefined-numbers", "undefined", [undefined, NaN, -0, Infinity].flatMap((x, i) =>
    ["x + 1", "+x", "-x", "x ?? 7", "Number.isNaN(x)", "Number.isFinite(x)", "Number.isInteger(x)", "Number.isSafeInteger(x)", "x === undefined"].map((expression, j) =>
      concrete(`defined${i}_${j}`, [["x", "number | undefined"]], expression, [x]))),
  "V8 distinguishes an absent scalar from NaN before and after numeric coercion"));

  const arrays = [[NaN, -0, Infinity, -Infinity, 4], [], [true, false], [undefined, -0, NaN]];
  const edges = [undefined, NaN, -Infinity, -4294967296, -5, -1.5, -0.5, -0, 0.5, 1.5, 5, 4294967296, Infinity];
  const slices = [];
  for (const xs of arrays) for (let i = 0; i < edges.length; i++) {
    const start = edges[i], end = edges[(i * 5 + 3) % edges.length];
    // Array literals keep constructed undefined elements in the accepted subset.
    slices.push(concrete(`slice${slices.length}`, [], `${literal(xs)}.slice(${literal(start)}, ${literal(end)})`, []));
  }
  fixtures.push(fixture("slice-edges", "collection", slices, "Native slice on numeric/boolean/constructed-undefined arrays with crossed normalization edges"));
  fixtures.push(fixture("slice-default", "collection", [
    concrete("copy", [], "[NaN, -0, Infinity].slice()", []),
    concrete("spread", [], "[...[NaN, -0, Infinity]]", []),
    concrete("booleanCopy", [], "[...[false, true]]", []),
    concrete("arrayTest", [], "Array.isArray([undefined])", []),
    concrete("recordTest", [], "Array.isArray({x: 1})", []),
  ], "V8 spread, default slice, and array classification"));
  fixtures.push(fixture("index-edges", "collection", [...edges, 0, 1, 2].map((x, i) =>
    concrete(`index${i}`, [], `[NaN, -0, Infinity][${literal(x)}]`, [])), "Native numeric property access, including negative zero, NaN, fractions, and huge indices"));
  fixtures.push(fixture("optional-index", "collection", [
    fn("read", [["flag", "boolean"]], "[NaN, -0][flag ? 0 : undefined]", {ensures: ["Object.is(result, flag ? NaN : undefined)"], samples: [sample(true), sample(false)]}),
  ], "Native indexing must respect the definedness of a conditionally absent integer index"));
  fixtures.push(fixture("record-spread", "collection", [
    concrete("absent", [], "({...{x: 1}, ...{}})", []),
    concrete("ownUndefined", [], "({...{x: 1}, ...{x: undefined}})", []),
    concrete("lastWrite", [], "({...{x: -0}, ...{x: NaN}, x: Infinity})", []),
    concrete("nested", [], "({...{inner: {x: -0}, flags: [false, true]}})", []),
    fn("optionalCopy", [["box", "{ x?: number }"]], "({...box})", {
      ensures: ["Object.is(result.x, box.x)"], samples: [{}, {x: undefined}, {x: NaN}, {x: -0}].map((box) => sample(box)),
    }),
  ], "Native object enumeration/overwrite; samples distinguish absent own keys from own undefined"));
  fixtures.push(fixture("every-native", "collection", [
    fn("copy", [["xs", "number[]"]], "xs.slice()", { ensures: ["result.length === xs.length", "result.every((v, i) => Object.is(v, xs[i]))"], samples: [[], [NaN, -0, Infinity], [1, 2]].map((xs) => sample(xs)) }),
    fn("flags", [["xs", "boolean[]"]], "[...xs]", { ensures: ["result.every((v, i) => v === xs[i]) === true"], samples: [sample([]), sample([false, true])] }),
    fn("negation", [], "[]", { ensures: ["!result.every(() => false) === false"], samples: [sample()] }),
    fn("undefinedVisit", [], "[undefined]", { ensures: ["result.every((v) => v === undefined)"], samples: [sample()] }),
  ], "Native every verifies callback visits, emptiness, polarity, index bindings, and value preservation"));

  const bugs = [
    ["zeroSign", "1 / Math.abs(x)", [["x", "number"]], [-0], "Object.is(result, -Infinity)"],
    ["roundedAway", "x + 1", [["x", "number"]], [2 ** 53], "result > x"],
    ["droppedElement", "[NaN, -0].slice(1)", [], [], "result.length === 2"],
    ["overwritten", "({...{x: 1}, ...{x: undefined}})", [], [], "result.x === 1"],
    ["emptyRead", "[][0]", [], [], "result !== undefined"],
    ["booleanSwap", "x || y", [["x", "boolean"], ["y", "boolean"]], [false, true], "result === false"],
  ].map(([name, expression, params, args, contract]) => fn(name, params, expression, {
    requires: params.map(([p], i) => matches(p, args[i])), ensures: [contract],
    expected: {status: "counterexample"}, samples: [{args, expect: "fail"}],
  }));
  bugs.push(fn("optionalOverwrite", [["box", "{ x?: number }"]], "({...{x: 1}, ...box})", {
    requires: ["box.x === undefined"], ensures: ["result.x === 1"], expected: {status: "counterexample"},
    samples: [sample({}), {args: [{x: undefined}], expect: "fail"}],
  }));
  fixtures.push(fixture("source-bugs", "source-mutation", bugs, "Seven deliberate implementation/contract bugs; each has a native failing execution"));

  const domains = [
    ["number", undefined, "typeof value === 'number'"], ["number", NaN, "typeof value === 'number'"],
    ["number | undefined", undefined, "value === undefined || typeof value === 'number'"],
    ["boolean", undefined, "typeof value === 'boolean'"], ["undefined", 0, "value === undefined"],
    ["number[]", [undefined], "Array.isArray(value) && value.every(v => typeof v === 'number')"],
    ["number[]", [NaN, -0], "Array.isArray(value) && value.every(v => typeof v === 'number')"],
    ["{ x?: number }", {}, "Object.keys(value).every(k => k === 'x') && (!Object.hasOwn(value, 'x') || value.x === undefined || typeof value.x === 'number')"],
    ["{ x?: number }", {x: undefined}, "Object.keys(value).every(k => k === 'x') && (!Object.hasOwn(value, 'x') || value.x === undefined || typeof value.x === 'number')"],
    ["{ x: number }", {x: undefined}, "Object.keys(value).length === 1 && Object.hasOwn(value, 'x') && typeof value.x === 'number'"],
    ["{ x: number }", {x: 1, extra: undefined}, "Object.keys(value).length === 1 && Object.hasOwn(value, 'x') && typeof value.x === 'number'"],
  ];
  domains.forEach(([type, value, oracle], i) => {
    const accepted = Function("value", `return (${oracle});`)(value);
    const valid = type.endsWith("[]") ? [] : type.startsWith("{") ? {x: 1} : type === "boolean" ? true : type === "undefined" ? undefined : NaN;
    fixtures.push(fixture(`call-domain-${i}`, "call", [
      fn("need", [["value", type]], "true", { ensures: ["result"], samples: [sample(accepted ? value : valid)] }),
      fn("caller", [], `need(${literal(value)})`, { ensures: ["result"], samples: [sample()], expected: {status: accepted ? "verified" : "counterexample"},
        call: {file: "entry.mjs", fn: "need", args: [value], domainOracle: oracle} }),
    ], "Independent native typeof/own-key/dense-element oracle, separate from verifier conforms/argument"));
  });
  fixtures.push(fixture("call-guards", "call", [
    fn("need", [["x", "number"]], "true", { requires: ["x > 0"], ensures: ["result"], samples: [sample(1)] }),
    fn("guarded", [["x", "number"]], "x > 0 && need(x)", { ensures: ["result === (x > 0)"], samples: numbers.map((x) => sample(x)) }),
    fn("skipped", [], "false && need(0)", { ensures: ["result === false"], samples: [sample()] }),
    fn("badRequires", [], "need(0)", { ensures: ["result"], samples: [sample()], expected: {status: "counterexample"},
      call: {file: "entry.mjs", fn: "need", args: [0], domainOracle: "typeof value === 'number'"} }),
  ], "Native guarded calls and a concrete unmet helper precondition"));
  fixtures.push(fixture("opaque-summary", "policy", [
    fn("weak", [["flag", "boolean"]], "flag", { ensures: ["true"], samples: [sample(true), sample(false)] }),
    fn("caller", [["flag", "boolean"]], "weak(flag)", { ensures: ["result === flag"], samples: [sample(true), sample(false)], expected: {status: "unknown", reason: "contract-gap"} }),
  ], "Original helper returns its argument, but its summary intentionally omits that fact"));
  fixtures.push(fixture("verdicts", "policy", [
    fn("vacuous", [["x", "number"]], "x", { requires: ["x > 0 && x < 0"], ensures: ["false"], expected: {status: "vacuous"}, samples: [{args: [0], expect: "precondition-false"}] }),
  ], "Contradictory requirements are not a verified result"));
  fixtures.push(fixture("full-length-domain", "policy", [
    fn("tooLong", [["xs", "boolean[]"]], "xs.length", { ensures: ["result <= 256"], expected: {status: "unknown", reason: "witness-too-large"}, samples: [sample([]), {args: [Array(257).fill(false)], expect: "fail"}] }),
  ], "257 dense native elements refute the contract; 256 is only a replay materialization limit"));

  let expensive = "true";
  for (let i = 0; i < 6; i++) expensive = `xs.every((v${i}) => ${expensive})`;
  fixtures.push({ id: "final-dependency", family: "policy", mode: "files", provenance: "Native timed predicate plus inactive syntactic calls through same-named module functions; final replay statuses must gate transitively", files: {
    "slow.mjs": { imports: [], functions: [fn("f", [["xs", "boolean[]"]], "true", { requires: ["xs.length === 256", expensive], ensures: ["result"], expected: {status: "unknown", reason: "replay-timeout"}, samples: [{args: [Array(256).fill(true)], expect: "requires-timeout"}] })] },
    "middle.mjs": { imports: ["slow.mjs"], prelude: "import {f as slow} from './slow.mjs';", functions: [fn("f", [], "false && slow([])", {ensures: ["result === false"], samples: [sample()], expected: {status: "unknown", reason: "dependency"}})] },
    "independent.mjs": { imports: [], functions: [fn("f", [], "true", {ensures: ["result"], samples: [sample()]})] },
    "entry.mjs": { imports: ["middle.mjs", "independent.mjs"], prelude: "import {f as middle} from './middle.mjs';\nimport {f as independent} from './independent.mjs';", functions: [fn("f", [], "middle()", {ensures: ["result === false"], samples: [sample()], expected: {status: "unknown", reason: "dependency"}})] },
  }});
  fixtures.push({ id: "module-identities", family: "import", mode: "files", provenance: "Native ESM identities and aliases; equal declaration names retain separate lexical modules", files: {
    "left.mjs": { imports: [], functions: [fn("f", [], "true", {ensures: ["result"], samples: [sample()]})] },
    "right.mjs": { imports: [], functions: [fn("f", [], "false", {ensures: ["result === false"], samples: [sample()]})] },
    "entry.mjs": { imports: ["left.mjs", "right.mjs"], prelude: "import {f as left} from './left.mjs';\nimport {f as right} from './right.mjs';", functions: [fn("combined", [], "left() && !right()", {ensures: ["result"], samples: [sample()]})] },
  }});
  const edited = structuredClone(fixtures.at(-1));
  edited.id = "module-source-edit";
  edited.compareWith = "module-identities";
  edited.provenance = "Only right.mjs changes; entry bytes stay identical, graph identity changes, and the broken helper blocks its caller";
  const right = edited.files["right.mjs"].functions[0];
  right.expression = "true";
  right.expected = {status: "counterexample"};
  right.samples = [{args: [], expect: "fail"}];
  const combined = edited.files["entry.mjs"].functions[0];
  combined.expected = {status: "unknown", reason: "dependency-violation"};
  combined.samples = [{args: [], expect: "fail"}];
  fixtures.push(edited);
  fixtures.push({id: "unused-broken-import", family: "import", mode: "files", provenance: "An unused bad imported function is checked without blocking an unrelated function", files: {
    "helper.mjs": {imports: [], functions: [fn("bad", [], "false", {ensures: ["result"], expected: {status: "counterexample"}, samples: [{args: [], expect: "fail"}]})]},
    "entry.mjs": {imports: ["helper.mjs"], prelude: "import {bad} from './helper.mjs';", functions: [fn("independent", [], "true", {ensures: ["result"], samples: [sample()]})]},
  }});
  fixtures.push(fixture("unsupported", "policy", [fn("unmodeled", [], "Math.random()", {ensures: ["true"], expected: {status: "unsupported"}})], "An unmodeled operation must not verify"));
  fixtures.push({id: "syntax-error", family: "policy", mode: "source", provenance: "Invalid JavaScript must be an error", files: {"entry.mjs": {imports: [], text: "// ensures true\nexport const broken = () => (;", functions: [fn(null, [], "", {ensures: ["true"], expected: {status: "error"}})]}}});
  return fixtures;
}
