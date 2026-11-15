import test from "node:test";
import assert from "node:assert/strict";
import { machineOf } from "../../verify/stateful/machine.mjs";
import { checkStateful } from "../../verify/stateful/index.mjs";
import { readCompletion as read } from "./fixtures/completion-cases.mjs";

test("one grammar rejects reserved temporal prose, typos, confusables, case, punctuation and block clauses at original spans", () => {
  const clauses = ["completes", "completion", "fair settlement", "commits shown", "commit", "count pending", "rank 1", "ranks 1", "abort",
    "leads work succeeds", "leads work commits", "leads work completes soon", "leads ghost completes", "leads work Completes",
    "fairness", "fairness resumptions strong", "fairness settlement weak", "scheduler c2", "protocol c2a", "success",
    "LEADS work completes", "lead work completes", "leeds work completes", "leads: work completes", "leads(work)",
    "fairnes resumptions weak", "FAIRNESS resumptions weak", "fairness. resumptions weak", "fаirnеss resumptions weak",
    "lеаds work completes", "соmрlеtеs", "cоmmitѕ x", "сount pending", "rаnk 1", "completes\u200b",
    "leads_work completes", "leads-work completes", "leeads work completes", "future work completes"];
  for (const text of clauses) {
    const source = read("zero").replace("// leads work completes", `// ${text}`);
    assert.throws(() => machineOf("grammar.ts", source), (e) => e.status === "unsupported"
      && e.span.start === source.indexOf(`// ${text}`) && e.span.end > e.span.start, text);
  }
  for (const text of ["leads work completes", "completes", "fair settlement", "rank 1", "count pending"]) {
    const source = read("zero").replace("// leads work completes", `/*\n * ${text}\n */`);
    assert.throws(() => machineOf("block.ts", source), (e) => e.status === "unsupported" && source.slice(e.span.start).startsWith("/*"), text);
  }
  assert.throws(() => machineOf("unknown.ts", read("zero").replace("// leads", "// wishful thinking\n// leads")), /Unknown line in temporal/);
  assert.throws(() => machineOf("fairness.ts", read("zero").replace("// leads work completes", "// fairness resumptions weak")), /requires a completion/);
});

test("totality never assumes termination of loops, helpers, effects, handlers or Promise adoption", async () => {
  for (const body of ["while (false) {}", "for (;;) {}", "Math.random();", "const a = {};", "return Promise.resolve(0);",
    "try {} catch {}", "const f = () => 0; f();", "work();", "return {then: 0};"]) {
    const source = read("zero").replace("done = true;", body);
    const report = await checkStateful("unsupported.ts", source);
    assert.equal(report.status, "unsupported", body); assert.equal(report.completion, undefined);
    assert.ok(report.span.end > report.span.start);
  }
});

test("empty bodies, all-tail branches and normal fallthrough have compiler-covered terminal exits", async () => {
  for (const body of ["", "if (done) return; else return;", "if (done) { if (done) return 1; } return 0;"]) {
    const source = read("zero").replace("done = true;", body);
    const r = await checkStateful("tails.ts", source, { timeoutMs: 10_000 });
    assert.equal(r.status, "verified", JSON.stringify(r));
    assert.equal(r.completion.goals[0].rank.birth, "1"); assert.equal(r.completion.goals[0].rank.terminal, "0");
  }
});
