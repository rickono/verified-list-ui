import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { checkStateful } from "../../verify/stateful/index.mjs";
import { replayTrace, decodeValue } from "../../verify/stateful/traces.mjs";

const fixtures = new URL("./fixtures/stateful/", import.meta.url);
const evidence = new URL("../../verify/reports/roadmap/stateful-C1-evidence/", import.meta.url);
const read = (name) => readFileSync(new URL(name, fixtures), "utf8");
const cases = [
  ["pilots/search.ts", "verified"], ["pilots/search-stale.ts", "counterexample"],
  ["pilots/search-gap.ts", "unknown"], ["pilots/search-env.ts", "counterexample"],
  ["pilots/search-overclaim.ts", "counterexample"], ["pilots/search-unsupported.ts", "unsupported"],
  ...["V1-leads-no-settles", "V1b-leads-settles", "V2-entry-ensures-false", "V3-state-colon-typo", "V4-block-comment-state", "V5-no-properties", "V5b-no-properties-no-pending", "V9-resolves-typo", "V10-rejects-sometimes", "V14-entry-calls-entry", "V15-old-in-state", "V16-undeclared-write"].map((n) => [`variants/${n}.ts`, "unsupported"]),
  ["variants/V6-inflight-count.ts", "unknown"], ["variants/V18-two-awaits.ts", "unknown"],
  ...["V7-latest-2p53", "V8-second-entry-clear", "V11-rejects", "V18b-two-awaits-annotated"].map((n) => [`variants/${n}.ts`, "verified"]),
  ["variants/V8b-second-entry-reset.ts", "counterexample"],
];
test("six pilots and all corrected judge variants run through production", async (t) => {
  mkdirSync(evidence, { recursive: true });
  for (const [file, expected] of cases) await t.test(file, async () => {
    const source = read(file), report = await checkStateful(file, source, { timeoutMs: 30_000 });
    writeFileSync(new URL(file.replaceAll("/", "-").replace(/\.ts$/, ".json"), evidence), `${JSON.stringify({ expected, ...report }, null, 2)}\n`);
    assert.equal(report.status, expected, JSON.stringify(report));
    if (file.startsWith("pilots/") && expected !== "unsupported") {
      const expectedUnits = ["$init", "search$0", "search$1", "search$0$keeps$search$1", "search$1$keeps$search$1"];
      assert.deepEqual(report.units.map((u) => u.unit), expectedUnits);
      const statuses = expectedUnits.map(() => "verified");
      if (file.includes("search-gap")) { statuses[1] = "counterexample"; statuses[2] = "counterexample"; }
      else if (file.includes("search-overclaim")) statuses[3] = "counterexample";
      else if (expected === "counterexample") statuses[2] = "counterexample";
      assert.deepEqual(report.units.map((u) => u.status), statuses);
    }
    if (expected === "verified") {
      assert.equal(report.searched, undefined); assert.equal(report.assumptions.eventBound, null);
      assert.ok(report.units.every((u) => ["verified", "vacuous"].includes(u.status)));
    }
    if (expected === "unknown") assert.equal(report.reason, "induction-gap");
    if (expected === "unsupported") assert.ok(report.line > 0 && report.column > 0 && report.span.end > report.span.start);
    if (file.includes("search-unsupported")) assert.equal(report.line, 20);
    if (expected === "counterexample") {
      assert.equal((await replayTrace(file, source, report.trace)).violation.text, report.violated.text);
      assert.equal(report.trace.sourceSha256, report.sourceSha256);
      assert.equal(report.trace.assumptionsSha256, report.assumptions.sha256);
    }
    if (file.includes("search-stale") || file.includes("search-overclaim")) {
      assert.deepEqual(report.trace.actions.map((a) => a.kind), ["call", "call", "resolve", "resolve"]);
      assert.deepEqual(report.trace.actions.slice(2).map((a) => a.request), [2, 1]);
      assert.equal(report.violated.kind, "always");
    }
    if (file.includes("search-env")) {
      assert.equal(report.trace.actions.length, 2); assert.equal(report.violated.text, "Number.isFinite(shown)");
      assert.ok(Number.isNaN(decodeValue(report.trace.steps.at(-1).state.shown)));
    }
    if (file.includes("V8b")) assert.equal(report.trace.actions.length, 3);
  });
});
test("binary64 request IDs really collide at 2^53 without violating the stated properties", async () => {
  const file = "variants/V7-latest-2p53.ts", source = read(file);
  const { machineOf } = await import("../../verify/stateful/machine.mjs");
  const { traceOf } = await import("../../verify/stateful/traces.mjs");
  const machine = machineOf(file, source);
  const report = await replayTrace(file, source, traceOf(machine, [
    { kind: "call", entry: "search", args: [0] }, { kind: "call", entry: "search", args: [1] },
    { kind: "resolve", request: 2, op: "lookup", value: 20 }, { kind: "resolve", request: 1, op: "lookup", value: 10 },
  ]));
  assert.equal(report.status, "ok"); assert.equal(report.violation, undefined);
  assert.equal(decodeValue(report.trace.steps.at(-1).state.shown), 10);
  assert.equal(decodeValue(report.trace.steps.at(-1).state.shownFor), 2 ** 53);
});
test("real solver budget exhaustion remains unknown/solver and attributes the request budget", async () => {
  const report = await checkStateful("budget.ts", read("pilots/search.ts"), { timeoutMs: 1, maxDepth: 0 });
  assert.equal(report.status, "unknown"); assert.equal(report.reason, "solver");
  assert.ok(report.solver.every((s) => s.reason === "request-timeout" && s.obligation.domain === "full"));
});
test("witness depth cannot authorize a proof", async () => {
  const source = read("pilots/search-stale.ts");
  const report = await checkStateful("stale.ts", source, { timeoutMs: 30_000, maxDepth: 0 });
  assert.equal(report.status, "unknown"); assert.equal(report.reason, "induction-gap");
  assert.equal(report.searched.maxDepth, 0);
  assert.ok(report.units.some((u) => u.status === "counterexample"));
});
