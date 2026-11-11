import assert from "node:assert/strict";
import { test } from "node:test";
import { verify } from "../../verify/index.mjs";

const check = (source) => verify(source, { timeoutMs: 60_000 });
const one = async (source) => (await check(source)).outcomes[0];
const verified = async (source) => {
  const report = await check(source);
  for (const o of report.outcomes) assert.equal(o.status, "verified", JSON.stringify(o));
  return report;
};
const literal = (value) => Object.is(value, -0) ? "-0" : String(value);

test("local updates retain earlier reads and assignment expression values", async () => {
  await verified(`// ensures Object.is(result.before, x)
// ensures Object.is(result.assigned, x + 1)
// ensures Object.is(result.after, x + 1)
function step(x: number) {
  let value = x;
  const before = value;
  const assigned = (value = x + 1);
  return { before, assigned, after: value };
}
// ensures result.value === 5 && result.after === 4
function leftFirst() {
  let value = 1;
  const sum = value + (value = 4);
  return { value: sum, after: value };
}
// ensures result.value === 5 && result.after === 5
function compoundLeftFirst() {
  let value = 1;
  const sum = (value += (value = 4));
  return { value: sum, after: value };
}`);
});

test("prefix and postfix results use the correct old and new binary64 values", async () => {
  await verified(`// ensures Object.is(result.post, x)
// ensures Object.is(result.pre, (x + 1) + 1)
// ensures Object.is(result.after, (x + 1) + 1)
function increase(x: number) {
  let value = x;
  const post = value++;
  const pre = ++value;
  return { post, pre, after: value };
}
// ensures Object.is(result.post, x)
// ensures Object.is(result.pre, (x - 1) - 1)
// ensures Object.is(result.after, (x - 1) - 1)
function decrease(x: number) {
  var value = x;
  var post = value--, pre = --value;
  return { post, pre, after: value };
}`);
});

test("multiple declarators and sequence expressions run left to right", async () => {
  await verified(`// ensures result.a === 7 && result.b === 3 && result.c === 3 && result.d === 6
function declarators() {
  var a = 1, b = (a += 2), c = a;
  let d = (a = 5, a++, a);
  a++;
  ;
  return { a, b, c, d };
}`);
});

test("branch joins retain writes and early returns keep their own state", async () => {
  await verified(`// ensures Object.is(result, flag ? x + 1 : x - 1)
function joined(flag: boolean, x: number) {
  let value = x;
  if (flag) { value += 1; } else { value -= 1; }
  return value;
}
// ensures Object.is(result, flag ? x : x + 1)
function early(flag: boolean, x: number) {
  let value = x;
  if (flag) return value++;
  ++value;
  return value;
}
// ensures result === (flag ? 4 : 2)
function testWrites(flag: boolean) {
  let selected = false, value = 1;
  if (selected = flag) { value = 3; }
  if (selected) { value++; } else { value++; }
  return value;
}`);
});

test("conditional expressions fork writes after evaluating their test", async () => {
  await verified(`// ensures result.chosen === (flag ? 4 : 9)
// ensures result.after === result.chosen && result.test === flag
function choose(flag: boolean) {
  let value = 0, test = false;
  const chosen = (test = flag) ? (value = 4) : (value = 9);
  return { chosen, after: value, test };
}`);
});

test("block scope restores shadows and preserves writes to outer bindings", async () => {
  await verified(`// ensures Object.is(result.entry, x)
// ensures result.local === 3 && result.outer === 8 && result.functionScoped === 7
function scopes(x: number) {
  let outer = 1, local = 0;
  {
    let x = 2;
    x++;
    local = x;
    outer = 8;
    var functionScoped = 7;
  }
  return { entry: x, local, outer, functionScoped };
}
// ensures result === (flag ? 2 : 3)
function nested(flag: boolean) {
  let value = 1;
  if (flag) { { value = 2; } } else { { value = 3; } }
  { let value = 99; value++; }
  return value;
}`);
});

test("logical operators suppress writes under the same guards as their values", async () => {
  await verified(`// ensures result.afterAnd === flag && result.afterOr === !flag
// ensures result.andValue === flag && result.orValue
function shortCircuits(flag: boolean) {
  let written = false;
  const andValue = flag && (written = true);
  const afterAnd = written;
  written = false;
  const orValue = flag || (written = true);
  return { afterAnd, afterOr: written, andValue, orValue };
}
// ensures Object.is(result.value, x ?? 9)
// ensures result.written === (x === undefined)
function nullish(x: number | undefined) {
  let value = x, written = false;
  const resultValue = value ?? (written = true, value = 9);
  return { value: resultValue, written };
}
// ensures result === 0
function skipped() {
  let value = 0;
  false && (value++ > 0);
  true || (++value > 0);
  5 ?? value++;
  return value;
}`);
});

test("undefined assignments and postfix numeric conversion preserve presence", async () => {
  await verified(`// ensures result.before === undefined && Number.isNaN(result.converted)
// ensures Number.isNaN(result.after)
function absent() {
  let value = 1;
  const before = (value = undefined);
  const converted = value++;
  return { before, converted, after: value };
}
// ensures Object.is(result.before, +x)
// ensures Object.is(result.after, x + 1)
function optional(x: number | undefined) {
  let value = x;
  const before = value++;
  return { before, after: value };
}
// ensures result === !flag
function booleans(flag: boolean) {
  let value = flag;
  value = undefined;
  value = !flag;
  return value;
}`);
});

test("mutable scalar locals can read immutable arrays and records", async () => {
  await verified(`// ensures Object.is(result.first, xs[0]) && Object.is(result.field, point.x)
function views(xs: number[], point: { x: number }) {
  let array = xs, record = point;
  let first = array[0], field = record.x;
  first = xs[0];
  field = point.x;
  return { first, field };
}
// ensures result.length === 2 && result.after === 2
// ensures result.first === 1 && result.second === 2
function receiver() {
  let value = 0;
  const sliced = [1, 2, 3].slice(value++, ++value);
  return { length: sliced.length, after: value, first: sliced[0], second: sliced[1] };
}`);
});

test("local data shadows module functions only within its lexical scope", async () => {
  await verified(`// ensures Object.is(result, x)
const helper = (x: number) => x;
// ensures Object.is(result, x)
function outer(x: number) {
  { let helper = 3; helper++; }
  return helper(x);
}
// ensures result === 4
function data() { let helper = 3; helper++; return helper; }`);
  for (const declaration of ["let", "const", "var"]) {
    const report = await check(`// ensures true
const helper = (x: number) => x;
// ensures true
function caller() { helper(1); ${declaration} helper = 0; return helper; }`);
    assert.equal(report.outcomes[0].status, "unsupported", JSON.stringify(report));
    assert.match(report.outcomes[0].message, /before its declaration/);
  }
  const called = await one(`// ensures true
const helper = () => 1;
// ensures true
function caller() { let helper = 0; return helper(); }`);
  assert.equal(called.status, "unsupported");
  assert.match(called.message, /local data/);
});

test("argument effects retain earlier values and short circuits suppress unsafe calls", async () => {
  await verified(`// requires !first && second
// ensures result
const ordered = (first: boolean, second: boolean) => !first && second;
// ensures result
function caller() { let value = false; return ordered(value, value = true); }
// requires x > 0
// ensures result
const positive = (x: number) => x > 0;
// ensures !result.called && result.value === 0
function skipped() {
  let value = 0, called = false;
  false && (value = 1, called = positive(0));
  true || (value = 2, called = positive(0));
  true ? (value = 0) : (called = positive(0), value = 3);
  return { value, called };
}`);
});

test("earlier argument call facts justify requirements and later effects cannot repair a bad call", async () => {
  const report = await check(`// ensures result === flag
const identity = (flag: boolean) => flag;
// requires flag
// ensures flag && result
const needsTrue = (flag: boolean) => flag;
// ensures result === (a && b)
const both = (a: boolean, b: boolean) => a && b;
// ensures result
function earlier() {
  let value = false;
  return needsTrue(value = identity(true)) && value;
}
// ensures true
function later() {
  let value = false;
  return both(needsTrue(value), value = identity(true));
}`);
  const outcomes = Object.fromEntries(report.outcomes.map((o) => [o.fn, o]));
  for (const name of ["identity", "needsTrue", "both", "earlier"]) assert.equal(outcomes[name].status, "verified", JSON.stringify(report));
  assert.equal(outcomes.later.status, "counterexample", JSON.stringify(report));
  assert.equal(outcomes.later.confirmed, true);
  assert.equal(outcomes.later.call.callee, "needsTrue");
  assert.deepEqual(outcomes.later.call.arguments, { flag: "false" });
});

test("wrong update and join contracts produce actual-source counterexamples", async () => {
  for (const source of [
    `// ensures result === 2
function postfix() { let value = 1; return value++; }`,
    `// ensures result === 0
function joined(flag: boolean) { let value = 0; if (flag) value = 1; return value; }`,
    `// ensures result === flag
function logical(flag: boolean) { let value = false; flag || (value = true); return value; }`,
    `// ensures Object.is(result, -0)
function signedZero() { let value = -0; value += 0; return value; }`,
  ]) {
    const o = await one(source);
    assert.equal(o.status, "counterexample", JSON.stringify(o));
    assert.equal(o.confirmed, true);
    assert.ok(o.failed.length > 0);
  }
});

test("numeric updates agree with V8 on nonfinite, signed-zero, rounding and subnormal values", async () => {
  const values = [NaN, Infinity, -Infinity, -0, 0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, 2 ** 53, -(2 ** 53)];
  const operations = ["value++", "++value", "value--", "--value", "value += 2", "value -= 2", "value *= 2", "value /= 2"];
  const sources = [];
  for (const x of values) for (const operation of operations) {
    const expected = Function("value", `const returned = (${operation}); return { returned, after: value };`)(x);
    sources.push(`// ensures Object.is(result.returned, ${literal(expected.returned)})
// ensures Object.is(result.after, ${literal(expected.after)})
function edge${sources.length}() { let value = ${literal(x)}; const returned = (${operation}); return { returned, after: value }; }`);
  }
  const report = await verified(sources.join("\n"));
  assert.equal(report.outcomes.length, values.length * operations.length);
});

test("unsupported scalar, scope, contract and heap effects fail closed", async () => {
  const bodies = [
    "let value = 1; value = true; return value;",
    "let value = undefined; value = 1; return value;",
    "const value = 1; value++; return value;",
    "const value = 1; value = 2; return value;",
    "let value = true; value++; return value;",
    "let value = 1; value %= 2; return value;",
    "let value = 1; value <<= 2; return value;",
    "let value = true; value &&= false; return value;",
    "let value = false; value ||= true; return value;",
    "let value = 1; value ??= 2; return value;",
    "let value; value = 1; return value;",
    "var value; return value;",
    "var value = 1; var value = 2; return value;",
    "value = 1; var value = 2; return value;",
    "const prior = value; let value = 1; return prior;",
    "let value = value; return value;",
    "if (flag) { var value = 1; } return value;",
    "{ let value = 1; } return value;",
    "let value = [1]; value = [2]; return value;",
    "let value = { x: 1 }; value = { x: 2 }; return value;",
    "let value = 1; [value] = [2]; return value;",
    "false && (flag = true); return flag;",
    "let value = 1; while (flag) value++; return value;",
  ];
  for (const body of bodies) {
    const o = await one(`// ensures true\nfunction rejected(flag: boolean) { ${body} }`);
    assert.equal(o.status, "unsupported", `${body}\n${JSON.stringify(o)}`);
  }
  for (const update of ["x = 2", "x += 1", "x++", "--x"]) {
    const o = await one(`// ensures Object.is(result, x)\nconst parameter = (x: number) => (${update});`);
    assert.equal(o.status, "unsupported", JSON.stringify(o));
    assert.match(o.message, /parameter/);
  }
  for (const clause of ["(x = 1) === 1", "x++ > 0", "[1].every((value) => ++value > 0)"]) {
    const o = await one(`// ensures ${clause}\nconst contract = (x: number) => x;`);
    assert.equal(o.status, "unsupported", JSON.stringify(o));
    assert.match(o.message, /contracts/);
  }
});

test("write diagnostics identify the original TypeScript target", async () => {
  const source = `// ensures true
function rejected(x: number): number { const value: number = x; value += 1; return value; }`;
  const o = await one(source);
  assert.equal(o.status, "unsupported");
  assert.equal(source.slice(o.span.start, o.span.end), "value");
});


test("fresh local array and record cells may be written without an input footprint", async () => {
  for (const [body, contract] of [
    ["let value = [1]; value[0]++; return value;", "result[0] === 2"],
    ["let value = { x: 1 }; value.x = 2; return value;", "result.x === 2"],
  ]) assert.equal((await one(`// ensures ${contract}\nfunction fresh() { ${body} }`)).status, "verified");
});
