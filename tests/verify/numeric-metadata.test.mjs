import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { verify, verifyFile } from "../../verify/index.mjs";
import { cases } from "./fixtures/numeric-metadata-cases.mjs";
import { runMutations } from "../../verify/reports/roadmap/numeric-metadata/scripts/mutations.mjs";
import { checkValidity, obligations } from "../../verify/reports/roadmap/numeric-metadata/scripts/validity.mjs";
import { binary, literal, merge, natural, unary } from "../../verify/data.mjs";

const selected = ["N01-", "N08-", "N17-", "N21-", "N21b-", "N23-", "N24-", "N41-"];
for (const c of cases.filter((c) => selected.some((prefix) => c.id.startsWith(prefix)))) {
  test(`numeric gate ${c.id}: public proof and unchanged native source`, async () => {
    const fn = Function(stripTypeScriptTypes(c.source) + "\nreturn f;")();
    const native = c.inputs.map((input) => {
      const args = structuredClone(input), before = structuredClone(args);
      return c.post(fn(...args), args, before);
    });
    assert.equal(native.includes(false), c.expect === "reject", c.id);
    const report = await verify(c.source, { timeoutMs: 30_000 });
    const o = report.outcomes[0];
    assert.equal(o.status, c.expect === "verify" ? "verified" : "counterexample", JSON.stringify(o));
    if (c.expect === "reject") assert.equal(o.confirmed, true, JSON.stringify(o));
    if (c.id.startsWith("N01-")) assert.equal(o.inputs.n, String(Number.MAX_SAFE_INTEGER));
  });
}

test("nested signed and half-integer merges retain exact numerical cancellation", async () => {
  const source = `// requires Number.isInteger(n) && 0 <= n && n <= 4294967295
// requires Number.isInteger(m) && 0 <= m && m <= 4294967295
// ensures result === 1
export function f(n: number, m: number, first: boolean, second: boolean) {
  const d = first ? n - m : m - n;
  const h = second ? d / 2 : -d / 2;
  const merged = first ? h : (second ? -h : +h);
  return (+merged + 1) - merged;
}`;
  const f = Function(stripTypeScriptTypes(source.replace("export function", "function")) + "\nreturn f;")();
  for (const n of [0, -0, 1, 4294967295]) for (const m of [0, 1, 4294967295]) {
    for (const a of [false, true]) for (const b of [false, true]) assert.equal(f(n, m, a, b), 1);
  }
  const directory = await mkdtemp(join(tmpdir(), "numeric-metadata-file-"));
  try {
    const entry = join(directory, "index.ts");
    await writeFile(entry, source);
    const report = await verifyFile(entry, { timeoutMs: 30_000 });
    assert.equal(report.outcomes[0].status, "verified", JSON.stringify(report.outcomes));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("uncertain arithmetic, unary, builtin and index consumers preserve absence and special numbers", async () => {
  const bodies = ["+v", "-v", "v + 1", "v - 1", "v * 0", "v / 2", "Math.abs(v)"];
  const source = bodies.map((body, i) => `// ensures Number.isNaN(result)
function absent${i}(flag: boolean) { const v = flag ? undefined : undefined; return ${body}; }`).join("\n");
  const report = await verify(source, { timeoutMs: 30_000 });
  assert.ok(report.outcomes.every((o) => o.status === "verified"), JSON.stringify(report.outcomes));
  for (const value of ["NaN", "Infinity", "-Infinity"]) {
    const r = await verify(`// ensures !Number.isInteger(result)
function f() { const v = ${value}; return v - v; }`);
    assert.equal(r.outcomes[0].status, "verified", JSON.stringify(r.outcomes));
  }
});

test("mixed present and absent nested merges never acquire finite integer facts", async () => {
  const source = `// requires Number.isInteger(n) && 0 <= n && n <= 4294967295
// ensures !outer || !inner ? Number.isNaN(result) : result === 1
function f(n: number, outer: boolean, inner: boolean) {
  const d = n - n;
  const h = outer ? (inner ? d / 2 : undefined) : undefined;
  return (+h + 1) - h;
}`;
  const r = await verify(source, { timeoutMs: 30_000 });
  assert.equal(r.outcomes[0].status, "verified", JSON.stringify(r.outcomes));
});

test("derived optional indices and optional array elements retain undefined", async () => {
  const source = `// ensures flag ? Object.is(result, xs[0]) : result === undefined
function optionalIndex(xs: number[], flag: boolean) {
  const i = flag ? 1 - 1 : undefined;
  return xs[i];
}
// ensures result === undefined
function optionalElement() { const xs = [undefined, 5]; return xs[(1 - 0) - 1]; }`;
  const optionalIndex = Function(stripTypeScriptTypes(source) + "\nreturn optionalIndex;")();
  for (const xs of [[], [NaN], [-0], [0], [Infinity]]) {
    assert.equal(optionalIndex(xs, false), undefined);
    assert.ok(Object.is(optionalIndex(xs, true), xs[0]));
  }
  const report = await verify(source, { timeoutMs: 30_000 });
  assert.deepEqual(report.outcomes.map((o) => o.status), ["verified", "verified"], JSON.stringify(report.outcomes));
});

test("straight-line and loop stores keep their domain obligation; loop allocation stays unsupported", async () => {
  const source = `// requires xs.length > 0
// requires Number.isInteger(n) && 0 <= n && n <= 4294967295
// requires Number.isInteger(m) && 0 <= m && m <= 4294967295
// requires n === 4294967295 && m === 1
// modifies xs
// ensures true
function f(xs: number[], n: number, m: number) { xs[(n + m) - 0] = 1; return 0; }`;
  const r = await verify(source, { timeoutMs: 30_000 });
  assert.equal(r.outcomes[0].status, "counterexample", JSON.stringify(r.outcomes));
  assert.equal(r.outcomes[0].confirmed, true);
  assert.ok(r.outcomes[0].failed.some((f) => f.kind === "store-domain"));
  const loop = await verify(`// modifies xs
// ensures true
function f(xs: number[]) {
  // invariant true
  // decreases 1
  while (false) { xs[0] = 1; }
  return 0;
}`);
  assert.equal(loop.outcomes[0].status, "verified", JSON.stringify(loop.outcomes));
  const writing = await verify(source.replace("xs[(n + m) - 0] = 1; return 0;", `let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1)-real(i)
  while(i<1){xs[(n + m) - 0] = 1;i++;}return 0;`), { timeoutMs: 30_000 });
  assert.equal(writing.outcomes[0].status, "counterexample", JSON.stringify(writing.outcomes));
  assert.equal(writing.outcomes[0].confirmed, true);
  assert.ok(writing.outcomes[0].failed.some((f) => f.kind === "store-domain"));
  const allocating = await verify(`// ensures true
function f() {
  // invariant true
  // decreases 1
  while (false) { const xs = [1]; }
  return 0;
}`);
  assert.equal(allocating.outcomes[0].status, "unsupported", JSON.stringify(allocating.outcomes));
  assert.match(allocating.outcomes[0].message, /allocate/);
});

test("width and index guard mutants are killed by native-refuted public proofs", async (t) => {
  const results = await runMutations();
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.detected && r.detection === "false-verification"));
  t.diagnostic(JSON.stringify(results));
});

test("symbolic small-width shadow shortcuts agree with their original FP terms", async (t) => {
  const results = await checkValidity(obligations(2), 10_000);
  assert.ok(results.every((r) => r.status === "unsat"), JSON.stringify(results));
  t.diagnostic(JSON.stringify(results));
});

test("metadata selection and uncertainty obey the component width invariant", () => {
  const a = natural("a").value, b = natural("b").value;
  const signed = binary("-", a, b), half = binary("/", signed, literal(2));
  assert.equal(signed.int.width, 33);
  assert.equal(half.halves.width, 33);
  const nested = merge("outer", merge("inner", half, unary("-", half)), unary("+", half));
  assert.equal(nested.halves.width, half.halves.width, "selection needs no carry bit");
  for (const v of [merge("c", signed, { ...signed, present: "false" }),
    merge("c", half, literal(NaN)), merge("c", a, { ...a, present: "false" }),
    binary("+", half, literal(Infinity)), binary("*", signed, literal(2)),
    binary("/", signed, literal(3)), unary("-", { ...signed, present: "maybe" })]) {
    for (const key of ["int", "halves", "nat", "predecessor", "u32"]) assert.equal(v[key], undefined, key);
  }
  const largest = natural("largest", false, 53).value;
  assert.equal(binary("-", largest, a).int, undefined);
  assert.equal(binary("/", largest, literal(2)).halves, undefined);
});
