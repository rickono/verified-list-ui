import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { verify, verifyFile } from "../../verify/index.mjs";
import { runtime, rational, snapshot } from "../../verify/specifications.mjs";

const check = (source) => verify(source, { timeoutMs: 30_000 });
const statuses = (report) => report.outcomes.map((o) => o.status);
const expect = (report, expected) => assert.deepEqual(statuses(report), expected, JSON.stringify(report.outcomes));

test("exact replay decomposes binary64 and computes fractions without native rounding", () => {
  assert.equal(String(runtime.real(0.1)), "3602879701896397/36028797018963968");
  assert.equal(String(runtime.real(Number.MIN_VALUE)), `1/${1n << 1074n}`);
  assert.equal(String(runtime.real(Number.MAX_VALUE)), String(((1n << 53n) - 1n) << 971n));
  assert.equal(String(runtime.real(-0)), "0");
  assert.equal(String(rational("-1.25e2")), "-125");
  assert.equal(String(rational("1/-3")), "-1/3");
  assert.equal(String(runtime.binary("+", rational("1/3"), rational("1/6"))), "1/2");
  assert.equal(runtime.binary("===", runtime.real(0.1 + 0.2), runtime.binary("+", runtime.real(0.1), runtime.real(0.2))), false);
  assert.equal(runtime.binary("===", runtime.real(0.1), rational("0.1")), false);
  for (const value of [NaN, Infinity, -Infinity, undefined]) assert.throws(() => runtime.real(value), { code: "SPEC_UNDEFINED" });
  assert.throws(() => runtime.binary("/", rational("1"), rational("0")), { code: "SPEC_UNDEFINED" });
});

test("entry snapshots preserve missing keys, undefined, NaN, signed zero and nested data", () => {
  const entry = { explicit: undefined, nan: NaN, zero: -0, nested: { values: [undefined, NaN, -0] } };
  const old = snapshot(entry);
  entry.nested.values[2] = 7;
  entry.later = 9;
  assert.equal(Object.hasOwn(old, "missing"), false);
  assert.equal(Object.hasOwn(old, "later"), false);
  assert.equal(Object.hasOwn(old, "explicit"), true);
  assert.equal(old.explicit, undefined);
  assert.ok(Number.isNaN(old.nan));
  assert.ok(Object.is(old.zero, -0));
  assert.deepEqual(old.nested.values, [undefined, NaN, -0]);
});

test("finite binary64 comparisons agree with exact embedded rational order", () => {
  const values = [-Number.MAX_VALUE, -0.5, -Number.MIN_VALUE, -0, 0, Number.MIN_VALUE, 0.1, 0.5, Number.MAX_VALUE];
  for (const op of ["<", "<=", ">", ">=", "===", "!=="]) {
    const native = Function("a", "b", `return a ${op} b;`);
    for (const a of values) for (const b of values) {
      assert.equal(runtime.binary(op, runtime.real(a), runtime.real(b)), native(a, b), `${a} ${op} ${b}`);
    }
  }
});

test("exact decimal, fractional, and binary64 operands have distinct meanings", async () => {
  const report = await check(`// ensures real("0.1") + real("0.2") === real("0.3")
// ensures real("1/3") * real("3") === real("1")
// ensures -(+real("-1/2")) === real(".5")
// ensures real("1/3") - real("-2/5") === real("11/15")
// ensures real("1/3") / real("-2/5") === real("-5/6")
// ensures real("1/3") > real("-2/5") && real("1/3") >= real("1/3")
// ensures real("-2/5") < real("1/3") && real("1/3") <= real("1/3")
// ensures real("1/3") != real("1/2") && real("1/3") == real("2/6")
// ensures real(0.1) !== real("0.1")
// ensures real("1e308") * real("2") === real("2e308")
const exact = () => true;
// ensures real(result) === real(0.1) + real(0.2)
const roundedOperands = () => 0.1 + 0.2;
// ensures real(result) === real("0.3")
const roundedDecimal = () => 0.1 + 0.2;
// ensures real(result) === real(0.1 + 0.2)
const runtimeOperands = () => 0.1 + 0.2;`);
  expect(report, ["verified", "counterexample", "counterexample", "verified"]);
  for (const i of [1, 2]) {
    assert.equal(report.outcomes[i].confirmed, true);
    assert.equal(report.outcomes[i].result, "0.30000000000000004");
  }
});

test("number bridges check finiteness, presence, and signed zero", async () => {
  const report = await check(`// ensures real(x) === real(x)
const unguarded = (x: number) => x;
// ensures !Number.isFinite(x) || real(x) === real(x)
const guarded = (x: number | undefined) => x;
// requires Object.is(x, -0)
// ensures real(result) === real("0") && Object.is(old(x), -0)
const zero = (x: number) => x;
// requires Object.is(x, Infinity)
// ensures real(x) > real("0")
const infinite = (x: number) => x;
// requires Number.isNaN(x)
// ensures real(x) === real("0")
const nan = (x: number) => x;`);
  expect(report, ["counterexample", "verified", "verified", "counterexample", "counterexample"]);
  for (const i of [0, 3, 4]) assert.equal(report.outcomes[i].confirmed, true);
  assert.equal(report.outcomes[2].status, "verified");
});

test("requires definedness is checked before feasibility and uses only earlier guards", async () => {
  const report = await check(`// requires real(x) > real("0")
// ensures true
const unsafe = (x: number) => x;
// requires Number.isFinite(x)
// requires real(x) === real("1/2")
// ensures result === 0.5
const ordered = (x: number) => x;
// requires real(x) === real("1/2")
// requires Number.isFinite(x)
// ensures true
const lateGuard = (x: number) => x;
// requires Number.isFinite(x) && real(x) === real("1/2")
// ensures result === 0.5
const shortCircuit = (x: number) => x;
// requires false
// requires real(x) > real("0")
// ensures false
const impossible = (x: number) => x;`);
  expect(report, ["counterexample", "verified", "counterexample", "verified", "vacuous"]);
  for (const i of [0, 2]) {
    assert.equal(report.outcomes[i].phase, "requires-definedness");
    assert.equal(report.outcomes[i].confirmed, true);
  }
});

test("mathematical division is partial even under negation", async () => {
  const report = await check(`// requires Number.isFinite(x)
// ensures real(x) === real("0") || real("1") / real(x) * real(x) === real("1")
const guarded = (x: number) => x;
// ensures !(real("1") / real("0") === real("1"))
const invalid = () => true;
// requires real("1") / real("0") > real("0")
// ensures true
const invalidPre = () => true;`);
  expect(report, ["verified", "counterexample", "counterexample"]);
  assert.equal(report.outcomes[1].confirmed, true);
  assert.equal(report.outcomes[2].phase, "requires-definedness");
});

test("runtime rounding and overflow violate exact result contracts", async () => {
  const report = await check(`// requires x === 9007199254740992
// ensures real(result) === real(x) + real("1")
const rounded = (x: number) => x + 1;
// requires x === 1e308
// ensures real(result) === real(x) * real("2")
const overflow = (x: number) => x * 2;
// ensures real(result) === real(Number.MIN_VALUE) / real("2")
const underflow = () => Number.MIN_VALUE / 2;
// requires x === 0.5
// ensures real(result) === real(x) + real("1/2")
const exact = (x: number) => x + 0.5;`);
  expect(report, ["counterexample", "counterexample", "counterexample", "verified"]);
  assert.equal(report.outcomes[0].result, "9007199254740992");
  assert.equal(report.outcomes[1].result, "Infinity");
  assert.equal(report.outcomes[2].result, "0");
  assert.equal(report.outcomes[0].confirmed, true);
  assert.equal(report.outcomes[1].confirmed, true);
  assert.equal(report.outcomes[2].confirmed, true);
});

test("old uses entry parameters in root and opaque helper contracts", async () => {
  const report = await check(`// ensures Object.is(result.value, old(point.value))
// ensures result.values.every((v, i) => Object.is(v, old(point).values[i]))
const copy = (point: { value?: number; values: number[] }) => ({ ...point, values: point.values.slice() });
// ensures Object.is(result.value, old(point.value))
// ensures result.values.every((v, i) => Object.is(v, old(point).values[i]))
const caller = (point: { value?: number; values: number[] }) => copy(point);
// ensures Object.is(result, old(x))
const names = (__specification: number, __entry_values: number, x: number | undefined) => x;`);
  expect(report, ["verified", "verified", "verified"]);
  const escaped = await check(String.raw`// requires \u005f_specification === 0.5
// ensures real(result) === real(old(\u005f_specification))
const f = (\u005f_specification: number) => 0.5;`);
  expect(escaped, ["verified"]);
});

test("checked pure specifications compose exact definitions and Boolean lemmas", async () => {
  const report = await check(`// @spec
// ensures result === real("1/3")
const third = () => real("1") / real("3");
// @spec
// requires Number.isFinite(x)
// ensures result
const lemma = (x: number) => real(x) + third() - third() === real(x);
// @spec
// requires Number.isFinite(x)
// ensures result
const chain = (x: number) => lemma(x);
// requires Number.isFinite(x)
// ensures chain(old(x))
const consumer = (x: number) => x;
// @spec
// ensures result === xs.every((v) => Number.isFinite(v))
const allFinite = (xs: number[]) => xs.every((v) => Number.isFinite(v));
// requires allFinite(xs)
// ensures result
const arrayConsumer = (xs: number[]) => true;`);
  expect(report, ["verified", "verified", "verified", "verified", "verified", "verified"]);
});

test("real conditionals keep branch definedness and exact return values", async () => {
  const report = await check(`// @spec
// ensures result === (flag ? real("1/3") : real("1/2"))
const choose = (flag: boolean) => flag ? real("1/3") : real("1/2");
// ensures choose(flag) > real("0")
// ensures flag ? real("1") === real(result) : true
const consumer = (flag: boolean) => flag ? 1 : Infinity;`);
  expect(report, ["verified", "verified"]);
});

test("specification calls enforce domains and requires before any postcondition", async () => {
  const report = await check(`// @spec
// requires x > 0
// ensures result
const positive = (x: number) => x > 0;
// requires positive(0)
// ensures true
const unsafePre = () => true;
// ensures positive(0)
const unsafePost = () => true;
// @spec
// ensures result
const present = (point: { value: number }) => true;
// ensures present(flag ? { value: 0 } : { value: undefined })
const missing = (flag: boolean) => true;`);
  expect(report, ["verified", "counterexample", "counterexample", "verified", "counterexample"]);
  assert.equal(report.outcomes[1].phase, "requires-definedness");
  for (const i of [1, 2, 4]) assert.equal(report.outcomes[i].confirmed, true);
  assert.equal(report.outcomes[4].call.violated[0].kind, "param-type");
});

test("false, vacuous and later lemma postconditions never become assumptions", async () => {
  const report = await check(`// @spec
// ensures false
const falseClaim = () => true;
// requires falseClaim()
// ensures false
const nonvacuous = () => true;
// ensures falseClaim()
const blocked = () => true;
// ensures true || falseClaim()
const inactive = () => true;
// @spec
// requires false
// ensures result
const vacuousLemma = () => true;
// ensures vacuousLemma()
const unsafe = () => true;`);
  assert.equal(report.outcomes[0].status, "counterexample");
  assert.equal(report.outcomes[1].status, "unknown", JSON.stringify(report.outcomes));
  assert.notEqual(report.outcomes[1].status, "vacuous");
  assert.equal(report.outcomes[2].status, "unknown");
  assert.equal(report.outcomes[3].status, "unknown");
  assert.equal(report.outcomes[3].reason, "dependency");
  assert.equal(report.outcomes[4].status, "vacuous");
  assert.equal(report.outcomes[5].status, "counterexample");
  assert.equal(report.outcomes[5].confirmed, true);
});

test("real obligations and specification domains retain quantifier polarity and nested scope", async () => {
  const report = await check(`// @spec
// requires Number.isFinite(x)
// ensures result
const reflexive = (x: number) => real(x) === real(x);
// ensures xs.every((v) => !Number.isFinite(v) || reflexive(v))
// ensures !xs.every((v) => Number.isFinite(v) && real(v) !== real(v)) || xs.length === 0
// ensures xs.every((v) => [v].every((inner) => !Number.isFinite(inner) || real(inner) === real(v)))
const nested = (xs: number[]) => xs;
// ensures ![NaN].every((v) => real(v) === real(v))
const negatedUndefined = () => true;
// ensures ![0].every((v) => reflexive(v + Infinity))
const negatedUnsafeLemma = () => true;`);
  expect(report, ["verified", "verified", "counterexample", "counterexample"]);
  assert.equal(report.outcomes[2].confirmed, true);
  assert.equal(report.outcomes[3].confirmed, true);
});

test("imported specification aliases use defining scopes and final statuses", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jsverify-spec-"));
  try {
    await writeFile(join(directory, "spec.ts"), `// @spec
// ensures result === real("1/2")
export const half = () => real("1") / real("2");`);
    const entry = join(directory, "entry.ts");
    await writeFile(entry, `import { half as ratio } from "./spec.ts";
// ensures real(result) === ratio()
const f = () => 0.5;`);
    expect(await verifyFile(entry, { timeoutMs: 30_000 }), ["verified", "verified"]);
    await writeFile(join(directory, "spec.ts"), `// @spec
// ensures result === real("2")
export const half = () => real("1") / real("2");`);
    const failed = await verifyFile(entry, { timeoutMs: 30_000 });
    assert.equal(failed.outcomes[0].status, "counterexample");
    assert.equal(failed.outcomes[1].status, "unknown");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("CLI reports precondition definedness without claiming the body ran", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jsverify-spec-cli-"));
  try {
    const entry = join(directory, "input.ts");
    await writeFile(entry, `// requires real(x) > real("0")\n// ensures true\nconst f = (x: number) => x;`);
    const result = spawnSync(process.execPath, ["verify/bin/jsverify.mjs", entry], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /counterexample f/);
    assert.match(result.stdout, /requires evaluation is undefined/);
    assert.doesNotMatch(result.stdout, /returned:/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("recursive specifications and cycles through requires or ensures fail closed", async () => {
  const sources = [
    `// @spec\n// ensures result\nconst self = () => self();`,
    `// @spec\n// ensures result\nconst a = () => b();\n// @spec\n// ensures result\nconst b = () => a();`,
    `// @spec\n// requires a()\n// ensures result\nconst a = () => true;`,
    `// @spec\n// ensures b()\nconst a = () => true;\n// @spec\n// ensures a()\nconst b = () => true;`,
  ];
  for (const source of sources) expect(await check(source), ["unsupported"]);
});

test("unsupported mathematical and entry syntax cannot escape into runtime JavaScript", async () => {
  const sources = [
    `// ensures true\nconst f = (x: number) => real(x);`,
    `// ensures true\nconst f = (x: number) => old(x);`,
    `// requires old(x) > 0\n// ensures true\nconst f = (x: number) => x;`,
    `// ensures old(result) === result\nconst f = () => 1;`,
    `// ensures old(y) === result\nconst f = (x: number) => { const y = x; return y; };`,
    `// ensures [1].every((v) => old(v) === 1)\nconst f = () => 1;`,
    `// ensures real("1") + 2 === real("3")\nconst f = () => 3;`,
    `// ensures Object.is(real("0"), real("0"))\nconst f = () => 0;`,
    `// ensures Number.isFinite(real("1"))\nconst f = () => 1;`,
    `// ensures real("1/0") === real("0")\nconst f = () => 0;`,
    `// ensures real("NaN") === real("0")\nconst f = () => 0;`,
    `// ensures real("1e1001") === real("0")\nconst f = () => 0;`,
    `// ensures real() === real("0")\nconst f = () => 0;`,
    `// ensures real(1, 2) === real("0")\nconst f = () => 0;`,
    `// ensures real("1") % real("2") === real("0")\nconst f = () => 0;`,
    `// @spec\n// ensures true\nconst f = () => [real("1")];`,
    `// @spec\n// ensures true\nconst f = () => ({ x: real("1") });`,
    `// @spec\n// ensures true\nconst f = (x: real) => x;`,
    `// @spec\n// ensures true\nconst f = () => { return true; };`,
    `// @spec\n// ensures result\nconst lemma = () => true;\n// ensures true\nconst f = () => lemma();`,
    `// ensures result\nconst runtimeHelper = () => true;\n// @spec\n// ensures result\nconst f = () => runtimeHelper();`,
  ];
  for (const source of sources) expect(await check(source), ["unsupported"]);
});
