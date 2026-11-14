import test from "node:test";
import assert from "node:assert/strict";
import { compile, parse } from "../../verify/source.mjs";
import { verify } from "../../verify/index.mjs";

const source = `// requires !flag
// modifies box.value
// ensures Object.is(result, 0)
function reset(box: {value: number}, flag: boolean) {
  let i = 0;
  let optional = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // invariant i === 0 || Object.is(box.value, 0)
  // decreases real(1) - real(i)
  while (i < 1) {
    box.value = 0;
    if (flag) throw new Error("stopped");
    optional = undefined;
    i++;
  }
  return box.value;
}`;

test("heap-frame growth and optional widening commit one attributed throw check", async () => {
  const [target] = compile([parse("loop-throw.ts", source)]).targets;
  const checks = target.obligations.filter((o) => o.kind === "throw-unreachable");
  assert.equal(checks.length, 1);
  assert.equal(checks[0].abstract, true);
  assert.match(source.slice(checks[0].span.start, checks[0].span.end), /^throw new Error/);
  assert.match(source.slice(checks[0].loop.start, checks[0].loop.end), /^while/);
  assert.ok(checks[0].loop.start < checks[0].span.start);
  assert.ok(checks[0].loop.end > checks[0].span.end);
  const report = await verify(source, { file: "loop-throw.ts", timeoutMs: 20_000 });
  assert.equal(report.outcomes[0].status, "verified", JSON.stringify(report.outcomes));
  const reachable = await verify(source.replace("// requires !flag\n", ""), { file: "loop-throw.ts", timeoutMs: 20_000 });
  assert.notEqual(reachable.outcomes[0].status, "verified", JSON.stringify(reachable.outcomes));
});
