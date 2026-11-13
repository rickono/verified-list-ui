import test from "node:test";
import assert from "node:assert/strict";
import { machineOf } from "../../verify/stateful/machine.mjs";
import { transitionsOf } from "../../verify/stateful/transitions.mjs";
import { checkStateful } from "../../verify/stateful/index.mjs";
import { replayTrace, traceOf } from "../../verify/stateful/traces.mjs";

test("unsupported stateful loops return original source diagnostics instead of throwing", async () => {
  const cases = [
    ["let x = 0;\n// state x >= 0\nexport function entry() { while (false) { x = 1; } }", "while"],
    ["// @environment\ndeclare function op(): Promise<number>;\nlet x = 0;\n// state x === 0\nexport async function entry() { await op(); for (;;) {} }", "for"],
  ];
  for (const [source, keyword] of cases) {
    const report = await checkStateful("unsupported-loop.ts", source);
    assert.equal(report.status, "unsupported");
    assert.match(report.message, /loops without parsed contracts/);
    assert.equal(report.span.start, source.indexOf(`${keyword} (`));
    assert.ok(report.span.end > report.span.start);
    const prefix = source.slice(0, report.span.start).split("\n");
    assert.equal(report.line, prefix.length);
    assert.equal(report.column, prefix.at(-1).length + 1);
  }
});

test("original compiler rejects a false capture annotation before it can become a resumption assumption", async () => {
  const source = `// @environment\ndeclare function op(q: number): Promise<number>;
let x = 0;
// state x >= 0
export async function entry() {
  const id: number = false;
  await op(id);
  if (id >= 0) x = id;
}`;
  const result = await checkStateful("wrong-capture.ts", source);
  assert.equal(result.status, "unsupported"); assert.match(result.message, /declared scalar type/);
  assert.equal(result.line, 6);
});
test("request parameter assumptions use the captured request value across interference", async () => {
  const source = `// @environment
// resolves result === q
declare function op(q: number): Promise<number>;
let current = 0;
let shown = 0;
// state shown >= 0
export async function entry(q: number) {
  current = 1;
  // pending current >= 0
  const value = await op(current);
  shown = value;
}
export function reset() { current = -1; }`;
  // The pending lemma deliberately fails keeps; native resolution must still
  // use the original argument 1, never the changed cell -1.
  const m = machineOf("argument.ts", source), units = transitionsOf(m);
  assert.ok(units.units.some((u) => u.name === "reset$0$keeps$entry$1"));
  const prefix = [{ kind: "call", entry: "entry", args: [0] }, { kind: "call", entry: "reset", args: [] }];
  const good = await replayTrace("argument.ts", source, traceOf(m, [...prefix, { kind: "resolve", request: 1, op: "op", value: 1 }]));
  assert.equal(good.status, "ok"); assert.equal(good.violation, undefined);
  const illegal = await replayTrace("argument.ts", source, traceOf(m, [...prefix, { kind: "resolve", request: 1, op: "op", value: -1 }]));
  assert.equal(illegal.status, "illegal-environment-action");
});
test("always-only properties use pre-step old, including rejection stutter", async () => {
  for (const rejects of ["", "// rejects\n"]) {
    const source = `// @environment\n${rejects}declare function op(): Promise<number>;\nlet x = 0;\n// always x >= old(x)\nexport async function entry() { x = 1; await op(); }`;
    const result = await checkStateful("old.ts", source, { timeoutMs: 20_000, maxDepth: 0 });
    // Entry from arbitrary x includes >1: there is no strengthening state
    // invariant. A proof must not accidentally read post-state for old.
    assert.equal(result.status, "unknown"); assert.equal(result.reason, "induction-gap");
    if (rejects) assert.ok(result.units.some((u) => u.unit === "$reject"));
  }
});
test("unsupported clauses and source constructs retain exact original spans", async () => {
  const base = "let x = 0;\n// state x >= 0\nexport function entry() { x = 0; }";
  for (const source of [
    base.replace("x = 0; }", "entry(); }"), base.replace("x = 0; }", "ghost = 1; }"),
    base.replace("x = 0; }", "x = Math.random(); }"), "import x from './x';\n" + base,
    base.replace("x = 0; }", "try { x = 0; } catch {} }"),
    base.replace("x = 0; }", "const f = () => x; x = f(); }"),
  ]) {
    const report = await checkStateful("span.ts", source);
    assert.equal(report.status, "unsupported");
    assert.ok(report.span.end > report.span.start);
    const prefix = source.slice(0, report.span.start).split("\n");
    assert.equal(report.line, prefix.length); assert.equal(report.column, prefix.at(-1).length + 1);
  }
});
