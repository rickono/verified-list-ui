import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { solve } from "../../../../proofs.mjs";
import { Z3 } from "../../../../backend.mjs";

const target = (id) => ({ id, declarations: "", pre: "true", post: "true", postconditions: ["true"], smallWitness: "small", params: [] });
const sat = { status: "sat", witness: [] };
const unsat = { status: "unsat" };

function controlled(run, { initialization = 0 } = {}) {
  let time = 0, connections = 0, closed = 0, peak = 0;
  const queries = [];
  const harness = {
    options: {
      now: () => time,
      connect: () => {
        connections++;
        peak = Math.max(peak, connections - closed);
        return {
          async start(budget) { time += Math.min(initialization, budget); return Z3; },
          async check(query, budget) {
            const row = { target: query.target, phase: query.phase, postcondition: query.postcondition, budget, time };
            queries.push(row);
            return run(query, budget, (cost) => { time += cost; }, row);
          },
          async close() { closed++; },
        };
      },
    },
    queries, get time() { return time; }, get connections() { return connections; },
    get closed() { return closed; }, get peak() { return peak; },
  };
  return harness;
}

const timeoutMs = 180_000;
const shared = controlled((query, budget, consume) => {
  assert.ok(budget >= 1 && budget <= timeoutMs);
  assert.ok(budget <= timeoutMs - shared.queries.at(-1).time);
  consume(1);
  return query.phase === "feasibility" ? sat : unsat;
});
const outcomes = await solve(["a", "b", "c"].map(target), timeoutMs, shared.options);
assert.deepEqual(outcomes.map((o) => o.status), ["verified", "verified", "verified"]);
assert.equal(shared.queries[0].budget, 90_000);
assert.ok(shared.queries.every((q) => q.budget < timeoutMs));
assert.ok(shared.time <= timeoutMs);
assert.ok(shared.peak <= 2);
assert.equal(shared.closed, shared.connections);

const startup = controlled(() => assert.fail("no query after startup exhausts one deadline"), { initialization: timeoutMs });
const init = await solve([target("a"), target("b")], timeoutMs, startup.options);
assert.ok(init.every((o) => o.status === "unknown" && o.reason === "request-timeout" && o.attempts === 0));
assert.equal(startup.time, timeoutMs);
assert.equal(startup.queries.length, 0);
assert.equal(startup.closed, startup.connections);

const lateBudgets = [];
const late = controlled((query, budget, consume) => {
  lateBudgets.push(budget);
  consume(query.phase === "feasibility" ? 1 : budget + 1);
  return query.phase === "feasibility" ? sat : unsat;
});
const [lateOutcome] = await solve([target("a")], timeoutMs, late.options);
assert.equal(lateOutcome.status, "unknown");
assert.equal(lateOutcome.reason, "request-timeout");
assert.equal(late.closed, late.connections);
assert.equal(lateBudgets[0], timeoutMs);
assert.ok(lateBudgets.every((budget, index) => index === 0 || budget < timeoutMs));

const log = {
  shared: { firstBudget: shared.queries[0].budget, maxBudget: Math.max(...shared.queries.map((q) => q.budget)),
    budgets: shared.queries.map((q) => q.budget), time: shared.time, peak: shared.peak,
    closed: shared.closed, connections: shared.connections },
  startup: { time: startup.time, queries: startup.queries.length, attempts: init.map((o) => o.attempts),
    reasons: init.map((o) => o.reason) },
  late: { budgets: lateBudgets, reason: lateOutcome.reason, closed: late.closed, connections: late.connections },
};
writeFileSync(new URL("../logs/virtual-clock.json", import.meta.url), JSON.stringify(log, null, 2) + "\n");
console.log(JSON.stringify({ status: "PASS", firstBudget: log.shared.firstBudget, maxBudget: log.shared.maxBudget, lateBudgets }));
