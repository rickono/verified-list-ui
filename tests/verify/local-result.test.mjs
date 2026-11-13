import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { verify, verifyFile } from "../../verify/index.mjs";

// Public-API regression checks for an ordinary body-local binding named result.
// In ensures, result is the returned value. In loop invariants and decreases it
// is the live local. Every other result binder keeps its rejection.
const check = (source) => verify(source, { timeoutMs: 60_000 });
const only = (report) => {
  assert.equal(report.outcomes.length, 1, JSON.stringify(report.outcomes));
  return report.outcomes[0];
};
const verified = (report) => assert.ok(report.outcomes.length && report.outcomes.every((o) => o.status === "verified"), JSON.stringify(report.outcomes));
const rejected = (report, message) => {
  const o = only(report);
  assert.ok(["error", "unsupported"].includes(o.status), JSON.stringify(o));
  assert.match(o.message, message);
  return o;
};
// The current frontend says "Unknown value" for an identifier absent from the
// active environment; either wording is the same rejection.
const UNKNOWN_RESULT = /Unknown (?:local binding|value) result\b/;
const value = (text) => Array.isArray(text) ? text.map(value) : text === "true" ? true : text === "false" ? false : Number(text);

// Independent V8 execution of the type-stripped source, without verifier helpers.
// A classic script has no export keyword, so only that leading keyword is dropped.
function native(source, name, args) {
  const script = stripTypeScriptTypes(source).replace(/^export (?=function )/gm, "");
  return runInNewContext(`${script}\n;${name}(...__args)`, { __args: args }, { timeout: 1_000 });
}
function confirmed(report, name, params, claim) {
  const o = report.outcomes.find((x) => x.fn === name);
  assert.equal(o?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(o.confirmed, true, JSON.stringify(o));
  const args = params.map((p) => value(o.inputs[p]));
  const actual = native(report.source, name, args);
  assert.ok(Object.is(actual, value(o.result)), `native ${String(actual)} differs from the reported ${o.result}`);
  assert.equal(claim(actual, ...args), false, `The native return ${String(actual)} must violate the claim for ${JSON.stringify(o.inputs)}.`);
  return o;
}
const withSource = async (source) => ({ ...(await check(source)), source });

const sum = (ensures) => `// ensures ${ensures}
export function sum(nums: readonly number[]): number {
  let result = 0;

  // invariant i !== 0 || Object.is(result, 0)
  // invariant Number.isInteger(i) && 0 <= i && i <= nums.length
  // decreases real(nums.length) - real(i)
  for (let i = 0; i < nums.length; i++) {
    result += nums[i];
  }

  return result;
}`;

test("ordinary const, let, var, block and for-init locals named result verify against the actual return", async () => {
  verified(await check("// ensures Object.is(result, x)\nfunction f(x: number) { const result = 0; return x; }"));
  verified(await check("// ensures Object.is(result, x + 1)\nfunction f(x: number) { let result = x; result = result + 1; return result; }"));
  verified(await check("// ensures x > 0 ? result === 2 : result === 1\nfunction f(x: number) { var result = 1; if (x > 0) { result = 2; } return result; }"));
  verified(await check("// ensures Object.is(result, x)\nfunction f(x: number) { { const result = 7; } return x; }"));
  // Scope exit restores the outer declaration identity; the inner write is dropped.
  verified(await check("// ensures result === 1\nfunction f(x: number) { let result = 1; if (x > 0) { const result = 2; } return result; }"));
  verified(await check(`// requires Number.isInteger(n) && 0 <= n && n <= 100
// ensures result === n
function f(n: number) {
  let count = 0;
  // invariant Number.isInteger(result) && 0 <= result && result <= n && count === result
  // decreases real(n) - real(result)
  for (let result = 0; result < n; result++) { count++; }
  return count;
}`));
  verified(await check(sum("nums.length !== 0 || Object.is(result, 0)")));
});

test("incorrect return claims that a namespace leak would prove are native counterexamples", async () => {
  // A leak to the local would make this true; the returned x is not always +0.
  confirmed(await withSource("// ensures Object.is(result, 0)\nfunction f(x: number) { const result = 0; return x; }"), "f", ["x"], (r) => Object.is(r, 0));
  confirmed(await withSource("// ensures Object.is(result, 0)\nfunction f(x: number) { let result = 0; return x; }"), "f", ["x"], (r) => Object.is(r, 0));
  confirmed(await withSource("// ensures result === 7\nfunction f(x: number) { { const result = 7; } return x; }"), "f", ["x"], (r) => r === 7);
  // Abstract loop returns use their own exact value under each path.
  // n >= 1 keeps the exit witness away from a -0 counter, so replay can confirm it.
  confirmed(await withSource(`// requires Number.isInteger(n) && 1 <= n && n <= 100
// ensures Object.is(result, 0)
function f(n: number) {
  let result = 0;
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && Object.is(result, 0)
  // decreases real(n) - real(i)
  while (i < n) { result = result * 0; i++; }
  return i;
}`), "f", ["n"], (r) => Object.is(r, 0));
  const empty = confirmed(await withSource(sum("nums.length !== 0 || Object.is(result, 1)")), "sum", ["nums"], (r, nums) => nums.length !== 0 || Object.is(r, 1));
  assert.deepEqual(empty.inputs.nums, []);
  // A return mutant of the pinned shape changes the empty-array value.
  const mutant = sum("nums.length !== 0 || Object.is(result, 0)").replace("return result;", "return result + 1;");
  const bumped = confirmed(await withSource(mutant), "sum", ["nums"], (r, nums) => nums.length !== 0 || Object.is(r, 0));
  assert.deepEqual(bumped.inputs.nums, []);
});

test("closures capture the live const result lexically and never see a contract result", async () => {
  const helper = `/** @param {(y: number) => boolean} p */
// ensures result === p(x)
function apply(p, x: number) { return p(x); }
`;
  const body = (ensures, decl) => `${helper}
// ensures ${ensures}
function f(x: number) {
  ${decl}
  const p = (y: number): boolean => y === result;
  return apply(p, x);
}`;
  verified(await check(body("result === (x === 0)", "const result = 0;")));
  // Inside apply's summary result is apply's return, so a leak there or to f's
  // boolean return would make p constant false.
  confirmed(await withSource(body("result === false", "const result = 0;")), "f", ["x"], (r) => r === false);
  confirmed(await withSource(body("result === (x === 1)", "const result = 0;")), "f", ["x"], (r, x) => r === (x === 1));
  const reports = await Promise.all([
    check(body("result === false", "")),
    check(body("result === false", "let result = 0;")),
    check(`${helper}\n// ensures result === false\nfunction f(x: number) {\n  const p = (y: number): boolean => y === result;\n  const result = 0;\n  return apply(p, x);\n}`),
    check(`${helper}\n// ensures result\nfunction f(x: number) {\n  const p = (result: number): boolean => result === result;\n  return apply(p, x);\n}`),
  ]);
  const [missing, mutable, early, param] = reports.map((r) => r.outcomes.find((o) => o.fn === "f"));
  for (const o of [missing, mutable, early, param]) assert.ok(["unsupported", "error"].includes(o?.status), JSON.stringify(reports.map((r) => r.outcomes)));
  assert.match(missing.message, UNKNOWN_RESULT);
  assert.match(mutable.message, /Callback captures let binding result/);
  assert.match(early.message, /before its declaration/);
  assert.match(param.message, /Callback parameters need simple, nonreserved names/);
});

test("every callbacks read the live local in invariants and the return in ensures", async () => {
  const max = (ret) => `// requires nums.length > 0 && nums.every((v) => !Number.isNaN(v))
// ensures nums.every((v) => v <= result)
function max(nums: readonly number[]) {
  let result = nums[0];
  // invariant Number.isInteger(i) && 0 <= i && 1 <= i && i <= nums.length
  // invariant nums.every((v, j) => j >= i || v <= result)
  // decreases real(nums.length) - real(i)
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] > result) { result = nums[i]; }
  }
  return ${ret};
}`;
  verified(await check(max("result")));
  confirmed(await withSource(max("nums[0]")), "max", ["nums"], (r, nums) => nums.every((v) => v <= r));
  for (const source of [
    "// ensures [x].every((result) => result === x)\nfunction f(x: number) { return x; }",
    "// ensures [x].every((result) => result === x)\nfunction f(x: number) { const result = 0; return x; }",
    max("result").replace("nums.every((v, j) => j >= i || v <= result)", "nums.every((result, j) => j >= i || result <= nums[0])"),
  ]) rejected(await check(source), /nonreserved/);
});

test("TDZ, hoisting and scope exit still bound a local result", async () => {
  const cases = [
    ["// ensures Object.is(result, x)\nfunction f(x: number) { const y = result; const result = x; return y; }", /before its declaration/],
    ["// ensures Object.is(result, x)\nfunction f(x: number) { const y = result; var result = x; return y; }", /before its declaration/],
    [`// requires Number.isInteger(n) && 0 <= n && n <= 100
// ensures result === n
function f(n: number) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && result === 0
  // decreases real(n) - real(i)
  while (i < n) { i++; }
  const result = 0;
  return i;
}`, /before its declaration/],
    ["// ensures result === 7\nfunction f(x: number) { { const result = 7; } return result; }", UNKNOWN_RESULT],
    [`// requires Number.isInteger(n) && 0 <= n && n <= 100
// ensures result === n
function f(n: number) {
  // invariant Number.isInteger(result) && 0 <= result && result <= n
  // decreases real(n) - real(result)
  for (let result = 0; result < n; result++) {}
  return result;
}`, UNKNOWN_RESULT],
    [`// requires Number.isInteger(n) && 0 <= n && n <= 100
// ensures result === n
function f(n: number) {
  { const result = 7; }
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && result === 7
  // decreases real(n) - real(i)
  while (i < n) { i++; }
  return i;
}`, UNKNOWN_RESULT],
    ["// ensures result === 1\nfunction f(x: number) { const result = 1; result = 2; return result; }", /Cannot write const binding result/],
  ];
  for (const [source, message] of cases) rejected(await check(source), message);
});

test("a wrong invariant about the local result is an induction gap, not a proof", async () => {
  const o = only(await check(sum("nums.length !== 0 || Object.is(result, 0)").replace("i !== 0 || Object.is(result, 0)", "Object.is(result, 0)")));
  assert.equal(o.status, "unknown", JSON.stringify(o));
  assert.equal(o.reason, "induction-gap");
  assert.equal(o.phase, "invariant-preserve");
});

test("parameter, entry, function, module, type and other reserved-name gates are unchanged", async () => {
  const cases = [
    ["// ensures Object.is(result, result)\nfunction f(result: number) { return result; }", /nonreserved|shadowing/],
    ["// requires result > 0\n// ensures true\nfunction f(x: number) { const result = x; return true; }", UNKNOWN_RESULT],
    ["// ensures Object.is(old(result), result)\nfunction f(x: number) { const result = x; return x; }", UNKNOWN_RESULT],
    [`// requires Number.isInteger(n) && 0 <= n && n <= 100
// ensures result === n
function f(n: number) {
  let result = 0;
  // invariant Number.isInteger(result) && 0 <= result && result <= n && old(result) === 0
  // decreases real(n) - real(result)
  while (result < n) { result++; }
  return result;
}`, UNKNOWN_RESULT],
    ["// ensures Object.is(result, x)\nfunction result(x: number) { return x; }", /cannot shadow a verifier builtin/],
    ["// ensures Object.is(result, x)\nconst result = (x: number) => x;", /cannot shadow a verifier builtin/],
    ["// ensures Object.is(result, x)\nconst f = function result(x: number) { return x; };", /cannot shadow a verifier builtin/],
    // Top-level data constants are outside the subset before any name check.
    ["const result = 1;\n// ensures Object.is(result, x)\nfunction f(x: number) { return x; }", /Only ordinary top-level functions/],
    ["// ensures Object.is(result, x)\nexport const result = (x: number) => x;", /cannot shadow a verifier builtin/],
    ["type result = number;\n// ensures Object.is(result, x)\nfunction f(x: number) { return x; }", /Reserved type binding result/],
    ...["old", "real", "Number", "Math", "Object", "Array", "NaN", "Infinity", "undefined"].flatMap((name) => [
      [`// ensures Object.is(result, x)\nfunction f(x: number) { const ${name} = 1; return x; }`, /Local declarations need simple, nonreserved names/],
      [`// ensures Object.is(result, x)\nfunction f(x: number) { let ${name} = 1; return x; }`, /Local declarations need simple, nonreserved names/],
      [`// ensures Object.is(result, x)\nfunction f(x: number) { var ${name} = 1; return x; }`, /Local declarations need simple, nonreserved names/],
    ]),
  ];
  for (const [source, message] of cases) rejected(await check(source), message);

  const directory = realpathSync.native(await mkdtemp(join(tmpdir(), "verify-local-result-")));
  try {
    await writeFile(join(directory, "helper.ts"), "// ensures Object.is(result, x)\nexport function id(x: number) { return x; }");
    await writeFile(join(directory, "entry.ts"), "import { id as result } from './helper.ts';\n// ensures Object.is(result, x)\nexport function f(x: number) { return x; }");
    rejected(await verifyFile(join(directory, "entry.ts"), { timeoutMs: 60_000 }), /reserved module binding result/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
