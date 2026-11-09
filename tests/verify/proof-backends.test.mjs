import assert from "node:assert/strict";
import { test } from "node:test";
import { solve, obligation } from "../../verify/proofs.mjs";
import { BackendError, Z3 } from "../../verify/backend.mjs";

const target = (id) => ({ id, declarations: "", pre: "true", post: "true", postconditions: ["true"], smallWitness: "small", params: [] });
const sat = { status: "sat", witness: [] };
const unsat = { status: "unsat" };

function controlled(run, { initialization = 0 } = {}) {
  let time = 0, connections = 0, closed = 0, peak = 0;
  const queries = [];
  return {
    options: {
      now: () => time,
      connect: () => {
        connections++;
        peak = Math.max(peak, connections - closed);
        return {
          async start(budget) { time += Math.min(initialization, budget); return Z3; },
          async check(query, budget) {
            queries.push({ query, budget, time });
            return run(query, budget, (cost) => { time += cost; });
          },
          async close() { closed++; },
        };
      },
    },
    get queries() { return queries; },
    get time() { return time; },
    get connections() { return connections; },
    get closed() { return closed; },
    get peak() { return peak; },
  };
}

for (const hard of [false, true]) for (const names of [["costly", "cheap"], ["cheap", "costly"]]) {
  test(`${hard ? "hard" : "solver"} deadline preserves a cheap target in order ${names.join(", ")}`, async () => {
    const cheapDone = Promise.withResolvers();
    const harness = controlled(async (query, budget, consume) => {
      if (query.target === "costly" && query.phase === "postcondition") {
        await cheapDone.promise;
        consume(100 - harness.time);
        if (hard) throw new BackendError("worker-timeout", "controlled deadline");
        return { status: "unknown", reason: "timeout" };
      }
      consume(1);
      if (query.target === "cheap" && query.phase === "postcondition") cheapDone.resolve();
      return query.phase === "feasibility" ? sat : unsat;
    }, { initialization: 2 });
    const outcomes = await solve(names.map(target), 100, harness.options);
    const byName = Object.fromEntries(names.map((name, i) => [name, outcomes[i]]));
    assert.equal(byName.cheap.status, "verified");
    assert.equal(byName.costly.status, "unknown");
    assert.equal(byName.costly.reason, "request-timeout");
    assert.equal(byName.costly.obligation.phase, "postcondition");
    assert.equal(byName.costly.obligation.domain, "full");
    assert.match(byName.costly.solverReason, hard ? /deadline/ : /timeout/);
    assert.ok(harness.queries.some(({ query }) => query.target === "cheap" && query.phase === "postcondition"));
    assert.ok(harness.time <= 100, "worker restarts must use the original request budget");
    assert.equal(harness.closed, harness.connections, "every worker must be reaped");
    assert.ok(harness.peak <= 2, "the worker count must not grow with the target count");
  });
}

test("a deferred proof retains completed obligations and uses time freed by cheap targets", async () => {
  let first = true;
  let cheapCount = 0;
  const cheapDone = Promise.withResolvers();
  const harness = controlled(async (query, budget, consume) => {
    if (query.target === "costly" && query.phase === "postcondition" && query.postcondition === 2 && first) {
      first = false;
      await cheapDone.promise;
      consume(50 - harness.time);
      return { status: "unknown", reason: "timeout" };
    }
    consume(1);
    if (query.target !== "costly" && query.phase === "postcondition" && ++cheapCount === 2) cheapDone.resolve();
    return query.phase === "feasibility" ? sat : unsat;
  });
  const costly = { ...target("costly"), postconditions: ["true", "(= #b0 #b0)"] };
  const outcomes = await solve([costly, target("cheap"), target("alsoCheap")], 100, harness.options);
  assert.deepEqual(outcomes.map((o) => o.status), ["verified", "verified", "verified"]);
  assert.equal(harness.queries.filter(({ query }) => query.target === "costly" && query.phase === "feasibility").length, 1);
  assert.equal(harness.queries.filter(({ query }) => query.target === "costly" && query.phase === "postcondition" && query.postcondition === 1).length, 1);
});

test("a cheap target behind two costly targets gets a turn within the original budget", async () => {
  let firstTimeout = true;
  const cheapDone = Promise.withResolvers();
  const harness = controlled(async (query, budget, consume) => {
    if (query.phase === "feasibility") { consume(1); return sat; }
    if (query.target === "cheap") { consume(1); cheapDone.resolve(); return unsat; }
    if (firstTimeout) {
      firstTimeout = false;
      consume(50 - harness.time);
    } else {
      await cheapDone.promise;
      consume(100 - harness.time);
    }
    return { status: "unknown", reason: "timeout" };
  });
  const outcomes = await solve([target("costlyOne"), target("costlyTwo"), target("cheap")], 100, harness.options);
  assert.deepEqual(outcomes.map((o) => o.status), ["unknown", "unknown", "verified"]);
  assert.ok(harness.time <= 100);
  assert.ok(harness.peak <= 2);
  assert.equal(harness.closed, harness.connections);
});

test("worker errors preserve finished outcomes and let later independent targets run", async () => {
  const harness = controlled((query, budget, consume) => {
    consume(1);
    if (query.target === "broken") throw new BackendError("worker-error", "controlled crash");
    return query.phase === "feasibility" ? sat : unsat;
  });
  const outcomes = await solve([target("before"), target("broken"), target("after")], 100, harness.options);
  assert.deepEqual(outcomes.map((o) => o.status), ["verified", "error", "verified"]);
  assert.equal(outcomes[1].obligation.phase, "feasibility");
  assert.equal(outcomes[1].reason, "worker-error");
  assert.ok(harness.connections >= 2);
  assert.equal(harness.closed, harness.connections);
  assert.ok(harness.peak <= 2);
});

test("initialization, late responses, and unattempted targets consume one request budget", async () => {
  const startup = controlled(() => assert.fail("no query can run after startup exhausts the budget"), { initialization: 100 });
  const init = await solve([target("a"), target("b")], 10, startup.options);
  assert.ok(init.every((o) => o.status === "unknown" && o.reason === "request-timeout" && o.attempts === 0));
  const late = controlled((query, budget, consume) => {
    consume(query.phase === "feasibility" ? 1 : budget + 1);
    return query.phase === "feasibility" ? sat : unsat;
  });
  assert.equal((await solve([target("a")], 10, late.options))[0].status, "unknown");
});

test("initialization failure cannot erase another worker's useful outcomes", async () => {
  const harness = controlled((query, budget, consume) => {
    consume(1);
    return query.phase === "feasibility" ? sat : unsat;
  });
  const connect = harness.options.connect;
  let starts = 0;
  const options = { ...harness.options, connect: () => {
    const backend = connect();
    if (++starts === 2) backend.start = async () => { throw new BackendError("worker-error", "cannot restart"); };
    return backend;
  } };
  const outcomes = await solve([target("before"), target("cannotStart")], 100, options);
  assert.deepEqual(outcomes.map((o) => o.status), ["verified", "error"]);
  assert.match(outcomes[1].message, /initialization/);
  assert.equal(harness.closed, 2);
});

test("uncertainty and bounded witness infeasibility never become proofs or vacuity", async () => {
  for (const boundedPhase of ["feasibility-witness", "counterexample-witness"]) {
    const harness = controlled((query, budget, consume) => {
      consume(1);
      if (query.phase === boundedPhase) return unsat;
      if (query.phase === "feasibility" && boundedPhase === "counterexample-witness") return sat;
      return { status: "sat", oversized: true };
    });
    const [outcome] = await solve([target("large")], 100, harness.options);
    assert.equal(outcome.status, "unknown");
    assert.equal(outcome.reason, "witness-too-large");
    assert.equal(outcome.obligation.phase, boundedPhase);
    for (const { query } of harness.queries) {
      assert.equal(query.assertions.includes("small"), query.domain === "replay-witness");
    }
  }
  for (const reason of ["incomplete quantifiers", "max. resource limit exceeded", "interrupted"]) {
    const uncertain = controlled((query, budget, consume) => { consume(1); return { status: "unknown", reason }; });
    const [outcome] = await solve([target("incomplete")], 100, uncertain.options);
    assert.equal(outcome.status, "unknown");
    assert.equal(outcome.reason, "solver-unknown");
    assert.equal(outcome.solverReason, reason);
  }
});

test("full-domain infeasibility stays vacuous and sat postconditions retain counterexample evidence", async () => {
  const harness = controlled((query, budget, consume) => {
    consume(1);
    return query.target === "vacuous" ? unsat : sat;
  });
  const outcomes = await solve([target("vacuous"), target("bug")], 100, harness.options);
  assert.deepEqual(outcomes, [{ status: "vacuous" }, { status: "counterexample", witness: [] }]);
  assert.deepEqual(obligation(target("bug"), "postcondition").assertions, ["true", "(not true)"]);
});

test("separate postconditions expose a cheap failing clause when the grouped query is costly", async () => {
  const t = { ...target("clauses"), post: "(and true false)", postconditions: ["true", "false"] };
  const harness = controlled((query, budget, consume) => {
    consume(1);
    if (query.phase === "feasibility") return sat;
    if (query.assertions.includes("(not true)")) return unsat;
    if (query.assertions.includes("(not false)")) return sat;
    return { status: "unknown", reason: "controlled grouped-query exhaustion" };
  });
  const [outcome] = await solve([t], 100, harness.options);
  assert.equal(outcome.status, "counterexample");
  assert.deepEqual(outcome.witness, []);
});
