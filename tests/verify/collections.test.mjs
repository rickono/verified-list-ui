import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { verify } from "../../verify/index.mjs";

const one = async (source, options) => (await verify(source, options)).outcomes[0];
const literal = (v) => Object.is(v, -0) ? "-0" : String(v);

test("array and object examples verify against ordinary source", async () => {
  const source = await readFile(new URL("../../verify/examples/collections.ts", import.meta.url), "utf8");
  const report = await verify(source, { timeoutMs: 60_000 });
  assert.deepEqual(report.outcomes.map((o) => [o.fn, o.status]), [
    ["first", "verified"], ["swapPair", "verified"], ["take", "verified"],
    ["clamp", "verified"], ["copyPoint", "verified"], ["lowerBound", "verified"],
  ]);
  assert.ok(report.outcomes[0].assumptions[0].domain.includes("Dense"));
  assert.ok(report.outcomes[3].assumptions[1].domain.includes("enumerable"));
});

test("an empty array is a concrete undefined counterexample", async () => {
  const o = await one("// ensures result !== undefined\nconst first = (xs: number[]) => xs[0];");
  assert.equal(o.status, "counterexample");
  assert.deepEqual(o.inputs.xs, []);
  assert.equal(o.result, "undefined");
  assert.equal(o.confirmed, true);
});

test("undefined remains distinct from NaN, including after arithmetic", async () => {
  const source = `// requires xs.length === 0
// ensures result === undefined && !Number.isNaN(result)
const read = (xs: number[]) => xs[0];
// requires xs.length === 0
// ensures Number.isNaN(result)
const add = (xs: number[]) => xs[0] + 1;
// requires xs.length === 0
// ensures result === 10
const fallback = (xs: number[]) => xs[0] ?? 10;`;
  const report = await verify(source);
  assert.deepEqual(report.outcomes.map((o) => o.status), ["verified", "verified", "verified"]);
});

test("out-of-range, fractional, infinite and NaN indices give undefined", async () => {
  const values = [-1, -0.5, 0.5, 2, 2 ** 32, Infinity, -Infinity, NaN];
  const source = values.map((v, i) => `// requires xs.length === 2
// ensures result === undefined
const read${i} = (xs: number[]) => xs[${literal(v)}];`).join("\n");
  const report = await verify(source);
  for (const o of report.outcomes) assert.equal(o.status, "verified", JSON.stringify(o));
});

test("array element witnesses preserve NaN and signed zero", async () => {
  const o = await one(`// requires xs.length === 2
// requires Object.is(xs[0], -0) && Number.isNaN(xs[1])
// ensures false
const copy = (xs: number[]) => [...xs];`);
  assert.equal(o.status, "counterexample");
  assert.deepEqual(o.inputs.xs, ["-0", "NaN"]);
  assert.deepEqual(o.result, ["-0", "NaN"]);
  assert.equal(o.confirmed, true);
});

test("an undefined index with a cached integer payload cannot read an array element", async () => {
  const source = `// ensures result === undefined
const read = (xs: number[]) => xs[[1][99]];
// ensures Object.is(result, xs[1])
const incorrectClaim = (xs: number[]) => xs[[1][99]];`;
  const report = await verify(source);
  assert.equal(report.outcomes[0].status, "verified");
  const bad = report.outcomes[1];
  assert.equal(bad.status, "counterexample");
  assert.ok(bad.inputs.xs.length > 1);
  assert.equal(bad.result, "undefined");
  assert.equal(bad.confirmed, true);
});

test("slice normalization agrees with V8 for numeric edge cases", async () => {
  const edges = [NaN, Infinity, -Infinity, 0, -0, 0.5, -0.5, 1.5, -1.5, 2, -2, 5, -5, 2 ** 32, -(2 ** 32), 1e300, -1e300];
  const cases = [...edges.map((s) => [s, undefined]), ...edges.map((e) => [undefined, e]),
    [-1.5, -0.5], [-0.5, 1.5], [2, 1], [Infinity, Infinity], [-Infinity, Infinity]];
  const source = cases.map(([start, end], i) => {
    const expected = [10, 20, 30].slice(start, end);
    const checks = [`result.length === ${expected.length}`, ...expected.map((v, j) => `result[${j}] === ${v}`)];
    return `// ensures ${checks.join(" && ")}
const slice${i} = () => [10, 20, 30].slice(${literal(start)}, ${literal(end)});`;
  }).join("\n");
  const report = await verify(source, { timeoutMs: 30_000 });
  assert.equal(report.outcomes.length, cases.length);
  for (const o of report.outcomes) assert.equal(o.status, "verified", JSON.stringify(o));
});

test("array length proofs include the full native length range", async () => {
  const report = await verify(`// ensures result >= 0 && result <= 4294967295
const size = (xs: number[]) => xs.length;`);
  assert.equal(report.outcomes[0].status, "verified");
  const large = await one(`// requires xs.length === 4294967295
// ensures false
const size = (xs: number[]) => xs.length;`);
  assert.equal(large.status, "unknown");
  assert.equal(large.reason, "witness-too-large");
});

test("the solver shrinks large models only for witness replay", async () => {
  const o = await one(`// ensures result.length === xs.length
const broken = (xs: number[]) => xs.slice(1);`);
  assert.equal(o.status, "counterexample");
  assert.ok(o.inputs.xs.length > 0 && o.inputs.xs.length <= 256);
  assert.equal(o.result.length, o.inputs.xs.length - 1);
  assert.equal(o.confirmed, true);
});

test("optional record values survive fallback and conditional joins", async () => {
  const report = await verify(`// ensures result.min === (bounds.min ?? 0)
const defaultMin = (bounds: { min?: number }) => ({ min: bounds.min ?? 0 });
// ensures result.x === (flag ? 1 : undefined)
const conditional = (flag: boolean) => flag ? { x: 1 } : {};`);
  // Use SameValue for arbitrary input NaN, rather than numeric reflexivity.
  assert.equal(report.outcomes[0].status, "counterexample");
  assert.equal(report.outcomes[0].inputs.bounds.min, "NaN");
  assert.equal(report.outcomes[1].status, "verified");
});

test("spread distinguishes absent keys from own undefined properties", async () => {
  const source = `// ensures result.min === 1
const absent = () => ({ ...{ min: 1 }, ...{} });
// ensures result.min === undefined
const ownUndefined = () => ({ ...{ min: 1 }, ...{ min: undefined } });
// requires bounds.min === undefined
// ensures result.min === 1
const possiblyOverwritten = (bounds: { min?: number }) => ({ ...{ min: 1 }, ...bounds });`;
  const report = await verify(source);
  assert.deepEqual(report.outcomes.map((o) => o.status), ["verified", "verified", "counterexample"]);
  assert.deepEqual(report.outcomes[2].inputs.bounds, { min: "undefined" });
  assert.deepEqual(report.outcomes[2].result, { min: "undefined" });
});

test("a record-bound bug has a structured, source-confirmed witness", async () => {
  const o = await one(`// requires Number.isFinite(x) && Number.isFinite(b.min) && Number.isFinite(b.max)
// requires b.min <= b.max
// ensures b.min <= result && result <= b.max
const clamp = (x: number, b: { min: number, max: number }) => x < b.min ? b.min : x;`);
  assert.equal(o.status, "counterexample");
  const x = Number(o.inputs.x), lo = Number(o.inputs.b.min), hi = Number(o.inputs.b.max);
  assert.ok(lo <= hi && x > hi);
  assert.equal(Number(o.result), x);
  assert.equal(o.confirmed, true);
});

test("nested records/array fields and balanced-brace JSDoc work", async () => {
  const ts = `// ensures Object.is(result.value, box.inner.value) && result.items.length === box.items.length
const copy = (box: { inner: { value: number }; items: readonly boolean[] }) => ({ ...box.inner, items: box.items.slice() });`;
  const js = `/** @param {{min: number, max: number}} bounds */
// ensures Object.is(result.min, bounds.min)
export const copy = (bounds) => ({ ...bounds });`;
  assert.equal((await one(ts)).status, "verified");
  assert.equal((await one(js, { file: "copy.js" })).status, "verified");
});

test("record field names cannot collide with witness metadata", async () => {
  const o = await one(`// ensures Object.is(result.tooLarge, box.tooLarge)
const copy = (box: { tooLarge: boolean }) => ({ ...box });`);
  assert.equal(o.status, "verified");
});

test("boolean arrays retain false and undefined through logical operators", async () => {
  const source = `// requires xs.length === 0
// ensures result === undefined
const empty = (xs: boolean[]) => xs[0] && xs[1];
// requires xs.length === 2 && xs[0] === false
// ensures result === false
const falseValue = (xs: boolean[]) => xs[0] && xs[1];`;
  const report = await verify(source);
  assert.deepEqual(report.outcomes.map((o) => o.status), ["verified", "verified"]);
});

test("shape-changing methods, sparse arrays, and exotic data remain unsupported", async () => {
  const cases = [
    "// ensures true\nconst f = (xs: number[]) => xs.push(1);",
    "// ensures true\nconst f = () => [1,,3];",
    "// ensures true\nconst f = () => ({ get x() { return 1; } });",
    "// ensures true\nconst f = () => ({ __proto__: {} });",
    "// ensures true\nconst f = (box: { constructor?: number }) => box.constructor;",
    "// ensures true\nconst f = (xs: number[][]) => xs;",
  ];
  for (const source of cases) assert.equal((await one(source)).status, "unsupported", source);
});


test("reference identity verifies and unpermitted array stores produce confirmed violations", async () => {
  for (const source of [
    "// ensures result === xs\nconst f = (xs: number[]) => xs;",
    "// ensures Object.is(result, box)\nconst f = (box: { x: number }) => box;",
  ]) assert.equal((await one(source)).status, "verified");
  const o = await one("// ensures true\nconst f = (xs: number[]) => xs[0] = 1;");
  assert.equal(o.status, "counterexample");
  assert.equal(o.confirmed, true);
});
