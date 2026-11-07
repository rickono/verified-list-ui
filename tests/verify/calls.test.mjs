import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { verify } from "../../verify/index.mjs";

const check = (source) => verify(source, { timeoutMs: 60_000 });
const byName = (report) => Object.fromEntries(report.outcomes.map((o) => [o.fn, o]));

test("the module examples prove a bounded clamp wrapper and a nonempty first-element wrapper", async () => {
  const source = await readFile(new URL("../../verify/examples/calls.ts", import.meta.url), "utf8");
  const report = await check(source);
  const outcomes = byName(report);
  assert.deepEqual(Object.keys(outcomes).sort(), ["clamp", "clamp01", "first", "wrappedFirst"]);
  for (const outcome of report.outcomes) assert.equal(outcome.status, "verified", JSON.stringify(report.outcomes));
});

test("callers reuse verified scalar contracts through forward references and chains", async () => {
  const report = await check(`// ensures Object.is(result, x)
const outer = (x: number) => middle(x);
// ensures Object.is(result, x)
function middle(x: number) { return identity(x); }
// ensures Object.is(result, x)
const identity = (x: number) => x;`);
  const outcomes = byName(report);
  for (const name of ["outer", "middle", "identity"]) {
    assert.equal(outcomes[name]?.status, "verified", JSON.stringify(report.outcomes));
  }
});

test("a call must establish the helper's requires before using its ensures", async () => {
  const report = await check(`// requires Number.isFinite(x)
// ensures Number.isFinite(result)
const finiteIdentity = (x: number) => x;
// requires Number.isFinite(x)
// ensures Number.isFinite(result)
const safe = (x: number) => finiteIdentity(x);
// ensures true
const unsafe = (x: number) => finiteIdentity(x);
// requires x > 10
// ensures x > 10
const needsLarge = (x: number) => x;
// ensures true
const circularClaim = () => needsLarge(0);`);
  const outcomes = byName(report);
  assert.equal(outcomes.finiteIdentity?.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(outcomes.safe?.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(outcomes.unsafe?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(outcomes.unsafe.confirmed, true);
  assert.equal(Number.isFinite(Number(outcomes.unsafe.inputs.x)), false);
  assert.equal(outcomes.circularClaim?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(outcomes.circularClaim.confirmed, true);
});

test("branches and short circuits check only calls that execute", async () => {
  const report = await check(`// requires x > 0
// ensures result === true
const positive = (x: number) => x > 0;
// ensures result === (x > 0)
const conjunction = (x: number) => x > 0 && positive(x);
// ensures result === true
const disjunction = (x: number) => !(x > 0) || positive(x);
// ensures result === (x > 0)
const conditional = (x: number) => x > 0 ? positive(x) : false;
// ensures result === false
const skipped = () => false && positive(0);
// requires value !== undefined
// ensures Object.is(result, value)
const present = (value: boolean | undefined) => value ?? positive(0);
// ensures result === (x > 0)
function branch(x: number) { if (x > 0) return positive(x); return false; }`);
  for (const outcome of report.outcomes) assert.equal(outcome.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(report.outcomes.length, 7);
});

test("weak helper contracts are opaque and produce proof gaps rather than false bugs", async () => {
  const source = `// ensures true
const identity = (flag: boolean) => flag;
// ensures result === flag
const caller = (flag: boolean) => identity(flag);`;
  const weak = byName(await check(source));
  assert.equal(weak.identity?.status, "verified");
  assert.equal(weak.caller?.status, "unknown", JSON.stringify(weak));
  assert.equal(weak.caller.reason, "contract-gap");
  const strong = byName(await check(source.replace("// ensures true", "// ensures result === flag")));
  assert.equal(strong.identity?.status, "verified");
  assert.equal(strong.caller?.status, "verified", JSON.stringify(strong));
});

test("calls in array elements and builtin arguments retain their execution guards", async () => {
  const report = await check(`// ensures Object.is(result, x)
const identity = (x: number) => x;
// ensures Object.is(result[0], x)
const wrap = (x: number) => [identity(x)];
// ensures result === Number.isFinite(x)
const finite = (x: number) => Number.isFinite(identity(x));
// ensures result
const same = (x: number) => Object.is(identity(x), x);`);
  for (const outcome of report.outcomes) assert.equal(outcome.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(report.outcomes.length, 4);
});

test("slice receivers precede argument calls when selecting an unverified dependency", async () => {
  const report = await check(`// ensures true
const arrayValue = () => [0];
// ensures result.length === 1
const receiver = () => arrayValue();
// ensures true
const numberValue = () => 0;
// ensures result === 0
const argument = () => numberValue();
// ensures true
const caller = () => receiver().slice(argument());`);
  const outcomes = byName(report);
  assert.equal(outcomes.receiver?.reason, "contract-gap", JSON.stringify(report.outcomes));
  assert.equal(outcomes.argument?.reason, "contract-gap", JSON.stringify(report.outcomes));
  assert.equal(outcomes.caller?.status, "unknown", JSON.stringify(report.outcomes));
  assert.equal(outcomes.caller.reason, "dependency");
  assert.match(outcomes.caller.message, /receiver/);
});

test("incompatible branch facts cannot erase a caller's failing postcondition", async () => {
  const report = await check(`// requires flag
// ensures flag && result === flag
const yes = (flag: boolean) => flag;
// requires !flag
// ensures !flag && result === flag
const no = (flag: boolean) => flag;
// ensures result === flag
function choose(flag: boolean) { if (flag) return yes(flag); return no(flag); }
// ensures false
function incorrect(flag: boolean) { if (flag) return yes(flag); else return no(flag); }`);
  const outcomes = byName(report);
  assert.equal(outcomes.choose?.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(outcomes.incorrect?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(outcomes.incorrect.confirmed, true);
});

test("nested calls and contradictory helper requirements remain real call violations", async () => {
  const report = await check(`// requires x > 10
// ensures result > 10
const need = (x: number) => x;
// ensures true
const nested = (x: number) => need(need(x));
// requires false
// ensures false
const impossible = (x: number) => x;
// ensures true
const caller = () => impossible(0);`);
  const outcomes = byName(report);
  assert.equal(outcomes.need?.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(outcomes.nested?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(outcomes.nested.confirmed, true);
  assert.equal(Number(outcomes.nested.inputs.x) > 10, false);
  assert.equal(outcomes.impossible?.status, "vacuous", JSON.stringify(report.outcomes));
  assert.equal(outcomes.caller?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(outcomes.caller.call.callee, "impossible");
  assert.equal(outcomes.caller.confirmed, true);
});

test("undefined elements in fresh arrays must meet a dense callee's domain", async () => {
  const report = await check(`// ensures result.length === 1 && Object.is(result[0], xs[0])
const wrap = (xs: number[]) => [xs[0]];
// ensures result === xs.length
const size = (xs: number[]) => xs.length;
// ensures true
const unsafe = (xs: number[]) => size(wrap(xs));
// requires xs.length > 0
// ensures result === 1
const safe = (xs: number[]) => size(wrap(xs));`);
  const outcomes = byName(report);
  assert.equal(outcomes.unsafe?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(outcomes.unsafe.call.callee, "size");
  assert.deepEqual(outcomes.unsafe.call.arguments.xs, ["undefined"]);
  assert.equal(outcomes.unsafe.confirmed, true);
  assert.equal(outcomes.safe?.status, "verified", JSON.stringify(report.outcomes));
});

test("named function expressions allow data bindings to shadow their private self name", async () => {
  const report = await check(`// ensures Object.is(result, inner)
const parameter = function inner(inner: number) { return inner; };
// ensures Object.is(result, x)
const local = function inner(x: number) { const inner = x; return inner; };
// ensures Object.is(result, x)
const caller = (x: number) => parameter(local(x));`);
  for (const outcome of report.outcomes) assert.equal(outcome.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(report.outcomes.length, 3);
});

test("replay keeps helper, parameter, and private invocation names separate", async () => {
  const report = await check(`// ensures Object.is(result, __proto__)
function __proto__(__proto__: number) { return __proto__; }
// ensures Object.is(result, value)
const __verification_invoke = (value: number) => __proto__(value);
// ensures Object.is(result, value)
const caller = (value: number) => __verification_invoke(value);`);
  for (const outcome of report.outcomes) assert.equal(outcome.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(report.outcomes.length, 3);
});

test("violations inside a helper are attributed to that helper rather than the outer caller", async () => {
  const report = await check(`// requires x > 0
// ensures result > 0
const positive = (x: number) => x;
// ensures true
const middle = (x: number) => positive(x);
// requires x === 0
// ensures true
const outer = (x: number) => middle(x);`);
  const outcomes = byName(report);
  assert.equal(outcomes.middle?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(outcomes.middle.call.callee, "positive");
  assert.equal(outcomes.outer?.status, "unknown", JSON.stringify(report.outcomes));
  assert.equal(outcomes.outer.reason, "dependency-violation");
  assert.equal(outcomes.outer.violation.caller, "middle");
  assert.equal(outcomes.outer.violation.callee, "positive");
});

test("a failed helper contract cannot support a verified caller or a transitive caller", async () => {
  const report = await check(`// ensures false
const broken = (flag: boolean) => flag;
// ensures result === flag
const middle = (flag: boolean) => broken(flag);
// ensures result === flag
const outer = (flag: boolean) => middle(flag);`);
  const outcomes = byName(report);
  assert.equal(outcomes.broken?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(outcomes.middle?.status, "unknown", JSON.stringify(report.outcomes));
  assert.equal(outcomes.outer?.status, "unknown", JSON.stringify(report.outcomes));
});

test("fresh helper arrays retain undefined elements and optional scalar arguments need definedness", async () => {
  const report = await check(`// ensures result.length === 1 && Object.is(result[0], xs[0])
const wrap = (xs: number[]) => [xs[0]];
// ensures result
const incorrect = (xs: number[]) => wrap(xs)[0] !== undefined;
// ensures Object.is(result, xs[0])
const read = (xs: number[]) => xs[0];
// ensures Object.is(result, x)
const identity = (x: number) => x;
// ensures true
const unsafe = (xs: number[]) => identity(read(xs));
// requires xs.length > 0
// ensures Object.is(result, xs[0])
const safe = (xs: number[]) => identity(read(xs));`);
  const outcomes = byName(report);
  assert.equal(outcomes.wrap?.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(outcomes.incorrect?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.deepEqual(outcomes.incorrect.inputs.xs, []);
  assert.equal(outcomes.incorrect.confirmed, true);
  assert.equal(outcomes.unsafe?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.deepEqual(outcomes.unsafe.inputs.xs, []);
  assert.equal(outcomes.unsafe.confirmed, true);
  assert.equal(outcomes.safe?.status, "verified", JSON.stringify(report.outcomes));
});

test("record arguments establish required own fields and preserve optional results", async () => {
  const report = await check(`// ensures Object.is(result, point.x)
const getX = (point: { x: number }) => point.x;
// ensures Object.is(result, x)
const good = (x: number) => getX({ x });
// ensures true
const missing = (x: number, flag: boolean) => getX(flag ? { x } : {});
// ensures Object.is(result.value, point.value)
const copyOptional = (point: { value?: number }) => ({ ...point });
// ensures Object.is(result.value, point.value)
const outer = (point: { value?: number }) => copyOptional(point);`);
  const outcomes = byName(report);
  assert.equal(outcomes.getX?.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(outcomes.good?.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(outcomes.missing?.status, "counterexample", JSON.stringify(report.outcomes));
  assert.equal(outcomes.missing.inputs.flag, "false");
  assert.equal(outcomes.missing.confirmed, true);
  assert.equal(outcomes.copyOptional?.status, "verified", JSON.stringify(report.outcomes));
  assert.equal(outcomes.outer?.status, "verified", JSON.stringify(report.outcomes));
});

test("unresolved, recursive, wrong-arity and shadowed calls remain unsupported", async () => {
  const sources = [
    "// ensures true\nconst f = (x: number) => f(x);",
    "// ensures true\nconst f = (x: number) => g(x);\n// ensures true\nconst g = (x: number) => f(x);",
    "// ensures true\nconst f = (x: number) => unknown(x);",
    "// ensures true\nconst helper = (x: number) => x;\n// ensures true\nconst f = () => helper();",
    "// ensures true\nconst helper = (x: number) => x;\n// ensures true\nconst f = (helper: number) => helper(1);",
    "// ensures true\nconst g = (x: number) => x;\n// ensures true\nconst f = function g(x: number) { return g(x); };",
    "// ensures true\nconst helper = (x: number) => x;\n// ensures true\nconst f = () => helper;",
    "// ensures true\nconst helper = (x: number) => x;\n// ensures helper(x) === x\nconst f = (x: number) => x;",
  ];
  for (const source of sources) {
    const report = await check(source);
    assert.equal(report.outcomes[0].status, "unsupported", JSON.stringify(report.outcomes));
    assert.ok(report.outcomes[0].span.end > report.outcomes[0].span.start);
  }
});
