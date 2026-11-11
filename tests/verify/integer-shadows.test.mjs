import assert from "node:assert/strict";
import { test } from "node:test";
import { createBackend } from "../../verify/backend.mjs";
import { verify } from "../../verify/index.mjs";
import { and, binary, builtin, literal, natural, natOf, predecessorOf, unary } from "../../verify/data.mjs";
import { embed, rankDecrease } from "../../verify/specifications.mjs";

const check = (source) => verify(source, { timeoutMs: 30_000 });
const outcome = (report, status) => assert.equal(report.outcomes[0].status, status, JSON.stringify(report.outcomes));
const emptyLoop = `
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 0
  // decreases 0
  while (i < 0) { i++; }
`;

test("exact predecessor views agree with native arithmetic, comparisons, ranks and signed zeros at the u32 edges", async () => {
  const views = [];
  for (const u of [0, 1, 2, 0x80000000, 0xffffffff]) for (const negativeZero of [false, true]) for (const predecessor of [false, true]) {
    const original = natural("sample", predecessor).value;
    const source = JSON.stringify(original).replaceAll("sample_u32", `#x${u.toString(16).padStart(8, "0")}`)
      .replaceAll("sample_negative_zero", String(negativeZero));
    const value = JSON.parse(source);
    let expected = predecessor ? u - 1 : u;
    if (negativeZero && expected === 0) expected = -0;
    views.push({ value, expected });
  }
  const facts = [];
  const same = (view, expected) => facts.push(builtin("Object.is", [view, literal(expected)]).smt);
  const operators = { "<": (a, b) => a < b, "<=": (a, b) => a <= b, ">": (a, b) => a > b,
    ">=": (a, b) => a >= b, "===": (a, b) => a === b, "!==": (a, b) => a !== b };
  for (const { value, expected } of views) {
    same(value, expected);
    same(unary("+", value), +expected);
    same(binary("+", value, literal(1)), expected + 1);
    same(binary("+", literal(1), value), 1 + expected);
    same(binary("-", value, literal(1)), expected - 1);
    facts.push(builtin("Number.isInteger", [value]).smt, builtin("Number.isFinite", [value]).smt, builtin("Number.isSafeInteger", [value]).smt);
    for (const other of [...views, { value: unary("-", literal(1)), expected: -1 }]) {
      for (const [op, native] of Object.entries(operators)) {
        const term = binary(op, value, other.value).smt;
        facts.push(native(expected, other.expected) ? term : `(not ${term})`);
      }
      const rank = rankDecrease(embed(value, {}, () => {}), embed(other.value, {}, () => {}));
      facts.push(expected >= 0 && expected - other.expected >= 1 ? rank : `(not ${rank})`);
    }
  }
  const backend = createBackend();
  try {
    await backend.start(10_000);
    const result = await backend.check({ declarations: "", assertions: [`(not ${and(...facts)})`], models: [] }, 10_000);
    assert.equal(result.status, "unsat", JSON.stringify(result));
  } finally { await backend.close(); }
});

test("absence disables integer shadows and constant-one arithmetic shortcuts", async () => {
  const predecessor = natural("p", true).value, nat = natural("n").value;
  const absent = { ...predecessor, present: "false" };
  const absentOne = { ...literal(1), present: "false" };
  assert.equal(predecessorOf(absent), undefined);
  assert.equal(natOf(binary("+", absent, literal(1))), undefined);
  assert.equal(natOf(binary("+", predecessor, absentOne)), undefined);
  assert.equal(predecessorOf(binary("-", nat, absentOne)), undefined);
  const facts = [binary("!==", absent, literal(-1)).smt, `(not ${builtin("Number.isInteger", [absent]).smt})`,
    builtin("Number.isNaN", [binary("+", absent, literal(1))]).smt,
    builtin("Number.isNaN", [binary("-", nat, absentOne)]).smt];
  const backend = createBackend();
  try {
    await backend.start(10_000);
    const result = await backend.check({ declarations: [...natural("p", true).declarations, ...natural("n").declarations].join("\n"),
      assertions: [`(not ${and(...facts)})`], models: [] }, 10_000);
    assert.equal(result.status, "unsat", JSON.stringify(result));
  } finally { await backend.close(); }
});

test("bounded loop parameters preserve negative zero and old values", async () => {
  const source = `// requires Number.isInteger(n) && 0 <= n && n <= 4294967295 && Object.is(n, -0)
// ensures Object.is(result, old(n))
function preserved(n: number) { ${emptyLoop} return n; }`;
  outcome(await check(source), "verified");
  const report = await check(source.replace("Object.is(result, old(n))", "Object.is(result, 0)"));
  outcome(report, "counterexample");
  assert.equal(report.outcomes[0].confirmed, true);
  assert.equal(report.outcomes[0].inputs.n, "-0");
});

test("fractional or disjunctive parameter domains never acquire integer assumptions", async () => {
  for (const requires of ["0 <= n && n <= 1", "n === 0.5 || (Number.isInteger(n) && 0 <= n && n <= 1)"]) {
    const report = await check(`// requires ${requires}
// ensures Number.isInteger(result)
function fractional(n: number) { ${emptyLoop} return n; }`);
    outcome(report, "counterexample");
    assert.equal(report.outcomes[0].confirmed, true);
    assert.ok(!Number.isInteger(Number(report.outcomes[0].inputs.n)));
  }
});

test("bounded parameter links cannot hide an undefined precondition", async () => {
  const report = await check(`// requires real(x) > real("0")
// requires Number.isInteger(n) && 0 <= n && n <= 4294967295
// ensures result === n
function partial(n: number, x: number) { ${emptyLoop} return n; }`);
  outcome(report, "counterexample");
  assert.equal(report.outcomes[0].phase, "requires-definedness");
  assert.equal(report.outcomes[0].confirmed, true);
});

test("a u32 predecessor initialization retains its -1 sentinel and both zero signs", async () => {
  for (const start of ["0", "-0", "1", "4294967295"]) {
    const report = await check(`// requires Number.isInteger(n) && 0 <= n && n <= 4294967295 && Object.is(n, ${start})
// ensures Object.is(result, old(n) - 1)
function predecessor(n: number) {
  let i = n - 1;
  // invariant Number.isInteger(i) && -1 <= i && i < 4294967295 && Object.is(i, old(n) - 1)
  // decreases 0
  while (false) { i++; }
  return i;
}`);
    outcome(report, "verified");
  }
});

test("a changing optional bound cannot narrow another loop variable to its entry range", async () => {
  const report = await check(`// requires !flag
// ensures result <= 4294967295
function changedBound(flag: boolean) {
  let limit = 1, i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= limit
  // decreases real("1") - real(i)
  while (i < 1) {
    limit = flag ? undefined : 4294967296;
    i = 4294967296;
  }
  return i;
}`);
  outcome(report, "counterexample");
  assert.equal(report.outcomes[0].confirmed, true);
  assert.equal(report.outcomes[0].result, "4294967296");
});
