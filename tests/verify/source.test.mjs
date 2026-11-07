import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verify } from "../../verify/index.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const one = async (source, options) => (await verify(source, options)).outcomes[0];
const literal = (x) => Object.is(x, -0) ? "-0" : String(x);

test("ordinary TypeScript: bounded doubling and all clamp branches verify", async () => {
  const source = await readFile(new URL("../../verify/examples/valid.ts", import.meta.url), "utf8");
  const report = await verify(source);
  assert.deepEqual(report.outcomes.map((o) => [o.fn, o.status]), [["double", "verified"], ["clamp", "verified"]]);
  assert.equal(report.outcomes[0].assumptions[0].type, "number");
  assert.ok(report.trusted.some((s) => s.includes("Z3")));
});

test("the user's exact double contract fails on NaN", async () => {
  const o = await one("// ensures x * 2 == result\nconst double = (x: number) => x * 2;");
  assert.equal(o.status, "counterexample");
  assert.equal(o.inputs.x, "NaN");
  assert.equal(o.result, "NaN");
  assert.equal(o.confirmed, true);
  assert.equal(o.failed[0].text, "x * 2 == result");
});

test("equality alone permits overflow when NaN is excluded", async () => {
  const o = await one("// requires !Number.isNaN(x)\n// ensures x * 2 === result\nconst double = (x: number) => x * 2;");
  assert.equal(o.status, "verified");
  assert.equal(1e308 * 2, Infinity);
});

test("finite-result contract finds an actual overflow from a finite input", async () => {
  const o = await one("// requires Number.isFinite(x)\n// ensures Number.isFinite(result)\nconst double = (x: number) => x * 2;");
  assert.equal(o.status, "counterexample");
  const x = Number(o.inputs.x);
  assert.ok(Number.isFinite(x));
  assert.ok(!Number.isFinite(x * 2));
  assert.equal(o.result, String(x * 2));
  assert.equal(o.confirmed, true);
});

test("a branch bug is confirmed against the original source", async () => {
  const source = await readFile(new URL("../../verify/examples/bugs.ts", import.meta.url), "utf8");
  const report = await verify(source);
  const o = report.outcomes.find((o) => o.fn === "brokenClamp");
  assert.equal(o.status, "counterexample");
  const { x, lo, hi } = Object.fromEntries(Object.entries(o.inputs).map(([k, v]) => [k, Number(v)]));
  assert.ok([x, lo, hi].every(Number.isFinite));
  assert.ok(lo <= hi);
  const r = x < lo ? lo : x;
  assert.ok(!(lo <= r && r <= hi));
  assert.equal(o.result, String(r));
});

test("JavaScript with JSDoc types verifies without rewriting the function", async () => {
  const source = `/** @param {number} x */
// ensures Object.is(result, x)
export function identity(x) { return x; }`;
  assert.equal((await one(source, { file: "identity.js" })).status, "verified");
});

test("signed zero survives solving, JSON-safe reporting, and actual replay", async () => {
  const o = await one("// requires x === 0\n// ensures result === Infinity\nconst reciprocal = (x: number) => 1 / x;");
  assert.equal(o.status, "counterexample");
  assert.equal(o.inputs.x, "-0");
  assert.equal(o.result, "-Infinity");
  assert.equal(o.confirmed, true);
});

test("Object.is distinguishes zero signs while numeric equality does not", async () => {
  const source = `// requires x === 0
// ensures result === 0
const equality = (x: number) => -x;
// requires x === 0
// ensures Object.is(x, result)
const identity = (x: number) => -x;`;
  const { outcomes } = await verify(source);
  assert.deepEqual(outcomes.map((o) => o.status), ["verified", "counterexample"]);
});

test("local constants, nested returns, booleans, and block scopes retain their meaning", async () => {
  const source = `// ensures result === (flag ? x + 1 : x - 1)
function step(flag: boolean, x: number): number {
  if (flag) { const next = x + 1; return next; }
  { const next = x - 1; return next; }
}`;
  // NaN makes numeric reflexivity false, so constrain the numeric input.
  const withPre = "// requires Number.isFinite(x)\n" + source;
  assert.equal((await one(withPre)).status, "verified");
});

test("internal replay bindings cannot collide with source parameters", async () => {
  const source = `// ensures Object.is(result, __verification_args)
const identity = (__verification_args: number) => __verification_args;`;
  assert.equal((await one(source)).status, "verified");
});

test("contradictory requirements are vacuous, never verified", async () => {
  const o = await one("// requires x > 0 && x < 0\n// ensures result === 999\nconst identity = (x: number) => x;");
  assert.equal(o.status, "vacuous");
});

test("every supported binary operator agrees with JavaScript on numerical edge cases", async () => {
  const ops = ["+", "-", "*", "/", "<", "<=", ">", ">=", "==", "===", "!=", "!=="];
  const pairs = [[NaN, 1], [Infinity, 0], [0, -0], [-0, 0], [Number.MIN_VALUE, 2], [Number.MAX_VALUE, 2], [2 ** 53, 1], [-1, 2], [1, 0], [-1, Infinity]];
  const sources = [];
  for (const op of ops) for (const [x, y] of pairs) {
    // V8 supplies the independent expected semantics, including NaN and -0.
    const expected = Function("x", "y", `return x ${op} y;`)(x, y);
    sources.push(`// requires Object.is(x, ${literal(x)}) && Object.is(y, ${literal(y)})
// ensures Object.is(result, ${literal(expected)})
const check${sources.length} = (x: number, y: number) => x ${op} y;`);
  }
  const report = await verify(sources.join("\n"), { timeoutMs: 30_000 });
  assert.equal(report.outcomes.length, sources.length);
  for (const o of report.outcomes) assert.equal(o.status, "verified", JSON.stringify(o));
});

test("supported numeric builtins agree with JavaScript", async () => {
  const operations = ["Math.abs", "Number.isFinite", "Number.isNaN", "Number.isInteger", "Number.isSafeInteger"];
  const values = [NaN, Infinity, -Infinity, -0, Number.MIN_VALUE, 0.5, Number.MAX_SAFE_INTEGER, 2 ** 53];
  const sources = [];
  for (const op of operations) for (const x of values) {
    const expected = Function("x", `return ${op}(x);`)(x);
    sources.push(`// requires Object.is(x, ${literal(x)})
// ensures Object.is(result, ${literal(expected)})
const check${sources.length} = (x: number) => ${op}(x);`);
  }
  const report = await verify(sources.join("\n"), { timeoutMs: 30_000 });
  for (const o of report.outcomes) assert.equal(o.status, "verified", JSON.stringify(o));
});

test("unsupported source and specification features fail explicitly", async () => {
  const cases = [
    "const f = (x: number) => Math.random();",
    "const f = (x: number) => x % 2;",
    "const f = (x: number) => ++x;",
    "const f = (x: number) => ({ get x() { return x; } });",
    "function f(x: number) { while (x > 0) {} return x; }",
    "function f(x: number) { if (x) return 1; return 0; }",
    "function f(x: number) { if (x > 0) return 1; }",
    "const f = (x?: number) => x;",
    "const f = (x: number = 1) => x;",
    "const f = (x: number) => true + x;",
    "const f = (Number: number) => Number;",
    "function Math(x: number) { return Math.abs(x); }",
  ];
  for (const body of cases) {
    const o = await one("// ensures true\n" + body);
    assert.equal(o.status, "unsupported", body);
    assert.ok(o.span.end >= o.span.start);
  }
  const math = await one("// ensures real(result) === real(x) * 2\nconst f = (x: number) => x * 2;");
  assert.equal(math.status, "unsupported");
});

test("unmodeled top-level execution and missing contracts cannot be silently ignored", async () => {
  assert.equal((await one("import foo from 'foo';\n// ensures true\nconst f = (x: number) => x;")).status, "unsupported");
  assert.equal((await one("// ensures true\nconst f = (x: number) => x;\nconsole.log('effect');")).status, "unsupported");
  assert.equal((await one("const f = (x: number) => x;")).status, "error");
  assert.equal((await one("// ensures result > 0) || true\nconst f = (x: number) => x;")).status, "error");
  assert.equal((await one("// ensures true\nfunction f(x: number) { return; }")).status, "unsupported");
});

test("unsupported diagnostics point into the original TypeScript source", async () => {
  const source = "// ensures true\nconst f = (x: number): number => Math.random();";
  const o = await one(source);
  assert.equal(o.status, "unsupported");
  assert.equal(source.slice(o.span.start, o.span.end), "Math.random()");
});

test("exhausted resource budget is unknown", async () => {
  const o = await one("// ensures Object.is(result, x)\nconst f = (x: number) => x;", { timeoutMs: 1 });
  assert.equal(o.status, "unknown");
});

test("the CLI exits successfully only for verified files and preserves special values in JSON", () => {
  const cli = "verify/bin/jsverify.mjs";
  const good = spawnSync(process.execPath, [cli, "--json", "verify/examples/valid.ts"], { cwd: root, encoding: "utf8" });
  assert.equal(good.status, 0, good.stderr);
  assert.ok(JSON.parse(good.stdout)[0].outcomes.every((o) => o.status === "verified"));
  const bad = spawnSync(process.execPath, [cli, "--json", "verify/examples/bugs.ts"], { cwd: root, encoding: "utf8" });
  assert.equal(bad.status, 1, bad.stderr);
  assert.equal(JSON.parse(bad.stdout)[0].outcomes[0].inputs.x, "NaN");
});
