import assert from "node:assert/strict";
import { test } from "node:test";
import { verify } from "../../verify/index.mjs";

const check = (source, options) => verify(source, { timeoutMs: 30_000, ...options });
const statuses = (report) => report.outcomes.map((o) => o.status);

test("copy contracts quantify over every numeric and boolean array element", async () => {
  const report = await check(`// ensures result.every((value, index) => Object.is(value, xs[index]))
const numbers = (xs: number[]) => xs.slice();
// ensures result.every((value, index) => value === xs[index])
const flags = (xs: boolean[]) => [...xs];`);
  assert.deepEqual(statuses(report), ["verified", "verified"], JSON.stringify(report.outcomes));
});

test("every matches JavaScript on empty and dense undefined arrays", async () => {
  const report = await check(`// ensures result.every(() => false)
const empty = () => [];
// requires xs.length === 0
// ensures result.length === 1 && result.every((value) => value === undefined)
const undefinedElement = (xs: number[]) => [xs[0]];
// requires xs.length === 0
// ensures result.every((value) => value)
const undefinedPredicate = (xs: boolean[]) => [xs[0]];`);
  assert.deepEqual(statuses(report), ["verified", "verified", "counterexample"], JSON.stringify(report.outcomes));
  assert.deepEqual(report.outcomes[2].result, ["undefined"]);
  assert.equal(report.outcomes[2].confirmed, true);
});

test("element equality preserves NaN, infinities, and signed zero", async () => {
  const report = await check(`// ensures result.every((value, index) => Object.is(value, [NaN, -0, Infinity, -Infinity][index]))
const sameValue = () => [NaN, -0, Infinity, -Infinity];
// ensures result.every((value, index) => value === [NaN, -0][index])
const strictEquality = () => [NaN, -0];
// ensures result.every((value) => Object.is(value, -0))
const changedZero = () => [0];`);
  assert.deepEqual(statuses(report), ["verified", "counterexample", "counterexample"], JSON.stringify(report.outcomes));
  assert.equal(report.outcomes[1].confirmed, true);
  assert.deepEqual(report.outcomes[2].result, ["0"]);
  assert.equal(report.outcomes[2].confirmed, true);
});

test("every composes with quantified requirements and both Boolean polarities", async () => {
  const report = await check(`// requires xs.every((value) => value > 0)
// ensures xs.length === 0 || result > 0
const positiveFirst = (xs: number[]) => xs[0];
// requires !xs.every(() => false)
// ensures result !== undefined
const nonemptyFirst = (xs: number[]) => xs[0];
// ensures result.every((value) => value) === xs.every((value) => value)
const equivalent = (xs: boolean[]) => xs.slice();
// ensures flag ? result.every((value, index) => Object.is(value, xs[index])) : !result.every(() => true)
const conditional = (xs: number[], flag: boolean) => xs.slice();
// ensures !result.every(() => true)
const negated = () => [];
// requires xs.every((value) => value > 0)
// requires !xs.every((value) => value > 0)
// ensures true
const contradictory = (xs: number[]) => xs;`);
  assert.deepEqual(statuses(report), ["verified", "verified", "verified", "counterexample", "counterexample", "vacuous"], JSON.stringify(report.outcomes));
  assert.equal(report.outcomes[3].inputs.flag, "false");
  assert.equal(report.outcomes[3].confirmed, true);
  assert.equal(report.outcomes[4].confirmed, true);
});

test("nested callbacks retain outer bindings without index capture", async () => {
  const report = await check(`// ensures result.every((value, index) => xs.every((other, position) => position !== index || Object.is(value, other)))
const copy = (xs: number[]) => xs.slice();
// ensures result.every((value) => [value].every((item) => Object.is(item, value)))
const literal = (xs: number[]) => xs.slice();`);
  assert.deepEqual(statuses(report), ["verified", "verified"], JSON.stringify(report.outcomes));
});

test("callback indices are native positive-zero integers and cannot capture input symbols", async () => {
  const report = await check(`// ensures result.every((value, index) => Number.isInteger(index) && index >= 0 && index < result.length && !Object.is(index, -0))
const indices = () => [true, false];
// ensures result.every((input_0, every_q1) => Object.is(input_0, every_q0[every_q1]))
const names = (every_q0: number[]) => every_q0.slice();`);
  assert.deepEqual(statuses(report), ["verified", "verified"], JSON.stringify(report.outcomes));
});

test("proofs are not restricted to the replay witness length limit", async () => {
  const report = await check(`// ensures result.every((value, index) => index < 256)
const tooLong = (xs: boolean[]) => xs.slice();`);
  assert.equal(report.outcomes[0].status, "unknown", JSON.stringify(report.outcomes));
  assert.equal(report.outcomes[0].reason, "witness-too-large");
});

test("every rejects callbacks outside the modeled subset with source spans", async () => {
  const expressions = [
    "result.every()",
    "result.every((value) => { return true; })",
    "result.every(function (value) { return true; })",
    "result.every(async (value) => true)",
    "result.every((value) => true, xs)",
    "result.every((value, index, array) => true)",
    "result.every(([value]) => true)",
    "result.every((value = 0) => true)",
    "result.every((...value) => true)",
    "result.every((value, value) => true)",
    "result.every((Object) => Object.is(Object, 0))",
    "result.every((Number) => Number.isFinite(Number))",
    "result.every((xs) => true)",
    "result.every((result) => true)",
    "result.every((value) => xs.every((value) => true))",
    "result.every((value) => value)",
    "result.every((value) => xs[0] = value)",
    "({ x: 1 }).every((value) => true)",
  ];
  for (const expression of expressions) {
    const source = `// ensures ${expression}\nconst copy = (xs: number[]) => xs.slice();`;
    const outcome = (await check(source)).outcomes[0];
    // Duplicate arrow parameters are a JavaScript syntax error before compilation.
    assert.equal(outcome.status, expression.includes("value, value") ? "error" : "unsupported", expression);
    assert.ok(outcome.span.end > outcome.span.start, expression);
    assert.ok(outcome.span.start >= source.indexOf(expression), expression);
    assert.ok(outcome.span.end <= source.indexOf(expression) + expression.length, expression);
  }
});

test("every remains contract-only and budget exhaustion remains unknown", async () => {
  const bodies = [
    "const f = (xs: number[]) => xs.every((value) => true);",
    "function f(xs: number[]) { const all = xs.every((value) => true); return all; }",
    "function f(xs: number[]) { if (xs.every((value) => true)) return 1; return 0; }",
  ];
  for (const body of bodies) {
    const report = await check(`// ensures true\n${body}`);
    assert.equal(report.outcomes[0].status, "unsupported");
    assert.match(report.outcomes[0].message, /contracts/);
  }
  const report = await check(`// ensures result.every((value, index) => Object.is(value, xs[index]))
const copy = (xs: number[]) => xs.slice();`, { timeoutMs: 1 });
  assert.equal(report.outcomes[0].status, "unknown");
});
