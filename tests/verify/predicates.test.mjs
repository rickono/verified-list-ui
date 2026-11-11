import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { verify, verifyFile } from "../../verify/index.mjs";
import { compile, parse } from "../../verify/source.mjs";
import { obligation } from "../../verify/proofs.mjs";
import { pinnedPredicateCases, replayPredicate } from "../../verify/examples/ramda/check.mjs";

const { cases: [{ source: search }] } = await pinnedPredicateCases();
const check = (source) => verify(source, { file: "predicates.ts", timeoutMs: 30_000 });
const get = (report, name) => report.outcomes.find((o) => o.fn === name) ?? report.outcomes[0];
const status = (o, expected) => assert.equal(o.status, expected, JSON.stringify(o));
const verified = (report) => report.outcomes.forEach((o) => status(o, "verified"));
const apply = `// ensures result === fn(x)
function applyPredicate(fn: (value: number) => boolean, x: number) { return fn(x); }
`;
const narrow = `// requires x > 0
// ensures result === (x > 1)
function big(x: number) { return x > 1; }
`;

test("a generic upstream contract proves first-above-threshold through an immutable closure and alias", async () => {
  const report = await check(search + `// ensures result === -1 || xs[result] > threshold
// ensures xs.every((x, i) => result !== -1 && result <= i || !(x > threshold))
function above(xs: number[], threshold: number) {
  const matches = (x: number): boolean => x > threshold;
  const alias = matches;
  return findIndex(alias, xs);
}`);
  verified(report);
});

test("predicate types resolve through aliases and captures retain boolean/undefined semantics", async () => {
  verified(await check(`type Predicate = (value: number) => boolean;
// ensures result === predicate(x)
function invoke(predicate: Predicate, x: number) { return predicate(x); }
// ensures result === (enabled && (x > threshold))
function captured(x: number, enabled: boolean, threshold: number | undefined) {
  const match = (n: number): boolean => enabled && n > threshold;
  return invoke(match, x);
}`));
});

test("named NaN and negative-zero callbacks compose without losing numerical identity", async () => {
  verified(await check(apply + `// ensures result === Number.isNaN(x)
function isNaNLike(x: number) { return Number.isNaN(x); }
// ensures result === Object.is(x, -0)
function isNegativeZero(x: number) { return Object.is(x, -0); }
// ensures result === Number.isNaN(x)
function nan(x: number) { return applyPredicate(isNaNLike, x); }
// ensures result === Object.is(x, -0)
function zero(x: number) { return applyPredicate(isNegativeZero, x); }`));
});

test("distinct predicate applications get distinct results and replay real table witnesses", async () => {
  for (const [a, b] of [["1", "2"], ["-0", "0"], ["NaN", "0"]]) {
    const report = await check(`// ensures result
function differs(p: (x: number) => boolean) { return p(${a}) === p(${b}); }`);
    const o = get(report, "differs");
    status(o, "counterexample");
    assert.equal(o.confirmed, true);
    const p = replayPredicate(o.inputs.p);
    assert.notEqual(p(Number(a)), p(Number(b)));
    assert.match(o.assumptions[0].domain, /Pure total predicates/);
  }
});

test("applications inside every stay closed under quantifiers and logical polarity", async () => {
  verified(await check(`// ensures xs.length === 0 ? result === false : result === p(xs[0])
function any(p: (x: number) => boolean, xs: number[]) {
  return xs.length === 0 ? false : p(xs[0]);
}`));
  verified(await check(`// ensures !xs.every((x) => !p(x)) === false
// requires xs.every((x) => !p(x))
function allFalse(p: (x: number) => boolean, xs: number[]) { return true; }`));
});

test("a callback cannot use its own contradictory fact to prove full-domain admission", async () => {
  for (const contract of ["result === (x > 1)", "result !== result"]) {
    const report = await check(apply + narrow.replace("result === (x > 1)", contract) + `// ensures true
function caller() { return applyPredicate(big, 1); }`);
    const o = get(report, "caller");
    status(o, "counterexample");
    assert.equal(o.confirmed, true);
    assert.equal(o.call.admission.callee, "applyPredicate");
    assert.equal(o.call.violated[0].text, "x > 0");
    assert.ok(!(Number(o.call.arguments.x) > 0));
  }
});

test("a helper's narrow domain inside a closure is checked by direct callback probe replay", async () => {
  const report = await check(apply + narrow + `// ensures true
function caller() { const matches = (x: number): boolean => big(x); return applyPredicate(matches, 2); }`);
  const o = get(report, "caller");
  status(o, "counterexample");
  assert.equal(o.confirmed, true);
  assert.equal(o.call.caller, "caller");
  assert.equal(o.call.admission.parameter, "fn");
});

test("admission probes match the executing call site, not an unreachable call to the same helper", async () => {
  const source = apply + narrow + `// requires x < 0
// ensures result
function negative(x: number) { return true; }
// requires !flag
// ensures true
function caller(flag: boolean) {
  if (flag) return applyPredicate(big, 1);
  return applyPredicate(negative, -1);
}`;
  const report = await check(source), o = get(report, "caller");
  status(o, "counterexample");
  assert.equal(o.confirmed, true);
  assert.equal(o.call.callee, "negative");
  assert.equal(o.call.admission.site.start, source.indexOf("applyPredicate(negative"));
  assert.equal(o.call.admission.argument.start, source.indexOf("negative, -1"));
});

test("bad named callbacks block callers after replay, including callers of callers", async () => {
  const report = await check(apply + `// ensures result === (x > 0)
function wrong(x: number) { return x > 1; }
// ensures result === (x > 0)
function middle(x: number) { return applyPredicate(wrong, x); }
// ensures result === (x > 0)
function outer(x: number) { return middle(x); }`);
  status(get(report, "wrong"), "counterexample");
  assert.notEqual(get(report, "middle").status, "verified");
  assert.notEqual(get(report, "outer").status, "verified");
});

test("import aliases preserve distinct callback identities even when paths sanitize to the same name", async () => {
  const directory = await mkdtemp(join(tmpdir(), "predicate-identities-"));
  try {
    await writeFile(join(directory, "a-b.ts"), "// ensures result\nexport function f(x: number) { return true; }");
    await writeFile(join(directory, "a_b.ts"), "// ensures !result\nexport function f(x: number) { return false; }");
    const entry = join(directory, "entry.ts");
    await writeFile(entry, `import {f as left} from './a-b.ts';
import {f as right} from './a_b.ts';
${apply}
// ensures x === 0 || result
function wrong(x: number) { const a = applyPredicate(left, x); return applyPredicate(right, x); }`);
    const report = await verifyFile(entry, { timeoutMs: 30_000 }), o = get(report, "wrong");
    status(o, "counterexample");
    assert.equal(o.confirmed, true);
    assert.notEqual(Number(o.inputs.x), 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unsafe direct local closure calls fail explicitly, while typed predicate boundaries replay undefined", async () => {
  const direct = await check(`// ensures true
function direct(xs: number[], t: number) { const m = (x: number): boolean => x > t; return m(xs[0]); }`);
  status(get(direct, "direct"), "unsupported");
  assert.match(get(direct, "direct").message, /may receive undefined/);
  const typed = await check(`// ensures true
function typed(p: (x: number) => boolean) { return p(undefined); }`);
  status(get(typed, "typed"), "counterexample");
  assert.equal(get(typed, "typed").call.violated[0].kind, "callback-domain");
});

test("unsupported callback captures, signatures, erased syntax and function-value contexts fail closed", async () => {
  const bodies = [
    "let t = 0; const m = (x: number): boolean => x > t; return applyPredicate(m, 1);",
    "const t = [0]; const m = (x: number): boolean => x > t[0]; return applyPredicate(m, 1);",
    "const m = (x: number): boolean => x > 0 ? true : undefined; return applyPredicate(m, 1);",
    "const m = (x: number): boolean => m(x); return applyPredicate(m, 1);",
    "const m = async (x: number) => x > 0; return applyPredicate(m, 1);",
    "const m = (x: number): boolean => this; return applyPredicate(m, 1);",
    "const m = (x: number): boolean => (x as number) > 0; return applyPredicate(m, 1);",
    "const m = (x: number): boolean => x > 0; return [m];",
    "const m = (x: number): boolean => x > 0; return {m};",
    "const m = (x: number): boolean => x > 0; return m;",
    "const m = (x: number): boolean => x > 0; return m === m;",
    "let m = (x: number): boolean => x > 0; return m(1);",
  ];
  for (const body of bodies) {
    const report = await check(apply + `// ensures true\nfunction unsupported() { ${body} }`);
    status(report.outcomes[0], "unsupported");
  }
  for (const type of ["() => boolean", "(x: number, y: number) => boolean", "(x: boolean) => boolean", "(x: number) => number", "(x: number) => boolean | undefined"]) {
    status((await check(`// ensures true\nfunction bad(p: ${type}) { return true; }`)).outcomes[0], "unsupported");
  }
});

test("predicate witness limits do not enter proofs and data-only reports need no table trust", async () => {
  const { targets: [target] } = compile([parse("input.ts", search)]);
  for (const phase of ["feasibility", "postcondition"]) {
    assert.ok(!obligation(target, phase).assertions.includes(target.smallWitness));
    assert.ok(target.replayGuards.every((guard) => !obligation(target, phase).assertions.includes(guard)));
  }
  const report = await check("// ensures Object.is(result, x)\nfunction identity(x: number) { return x; }");
  verified(report);
  assert.ok(!report.trusted.some((line) => /predicate tables/.test(line)));
});

test("the CLI serializes tables and reports callback-domain failures without exposing function source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "predicate-cli-"));
  try {
    const entry = join(directory, "entry.ts");
    await writeFile(entry, "// ensures true\nfunction bad(p: (x: number) => boolean) { return p(undefined); }");
    const text = spawnSync(process.execPath, ["verify/bin/jsverify.mjs", entry], { encoding: "utf8", timeout: 30_000 });
    assert.equal(text.status, 1, text.stderr);
    assert.match(text.stdout, /callback: p\(undefined\)/);
    assert.match(text.stdout, /failed callback check: callback-domain/);
    assert.doesNotMatch(text.stdout, /return |=>|call: undefined/);
    const json = spawnSync(process.execPath, ["verify/bin/jsverify.mjs", "--json", entry], { encoding: "utf8", timeout: 30_000 });
    assert.equal(json.status, 1, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout)[0].outcomes[0].inputs.p, { entries: [], else: "false" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
