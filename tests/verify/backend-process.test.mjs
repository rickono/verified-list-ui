import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createBackend, CAPABILITIES, BackendError } from "../../verify/backend.mjs";
import { verify } from "../../verify/index.mjs";
import { solve } from "../../verify/proofs.mjs";
import { single } from "../../verify/modules.mjs";
import { compile } from "../../verify/source.mjs";

const fixture = new URL("./fixtures/backend-worker.mjs", import.meta.url);
const query = (mode) => ({ target: "fixture#f", phase: "postcondition", domain: "full", declarations: "", assertions: [mode], models: [{ kind: "number", symbol: "x" }] });

test("worker errors, signal exits, invalid verdicts, ids, and witnesses fail closed", async () => {
  for (const mode of ["crash", "signal", "error", "verdict", "wrong-id", "bad-witness", "missing-witness"]) {
    const backend = createBackend({ worker: fixture });
    try {
      const descriptor = await backend.start(10_000);
      assert.ok(CAPABILITIES.every((c) => descriptor.capabilities.includes(c)));
      await assert.rejects(backend.check(query(mode), 10_000), (e) => e.reason === (["crash", "signal", "error"].includes(mode) ? "worker-error" : "invalid-response"));
    } finally { await backend.close(); }
  }
});

for (const timeoutMs of [25, 180_000]) test(`a controlled ${timeoutMs} ms hard deadline interrupts and reaps an unresponsive worker`, async () => {
  let fire;
  const timers = { setTimeout: (callback, ms) => { assert.ok(ms === 100 || ms === timeoutMs); fire = callback; return callback; }, clearTimeout: () => {} };
  const backend = createBackend({ worker: fixture, timers });
  try {
    await backend.start(100);
    const pending = backend.check(query("hang"), timeoutMs);
    const rejected = assert.rejects(pending, (e) => e.reason === "worker-timeout");
    await assert.rejects(backend.check(query("unknown"), timeoutMs), (e) => e.reason === "worker-error");
    fire();
    await rejected;
  } finally { await backend.close(); }
});

test("missing capabilities and invalid startup messages cannot support proofs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "proof-worker-"));
  try {
    for (const message of [{ type: "ready", backend: { name: "incomplete", protocol: 1, capabilities: ["models"] } }, { type: "result", answer: { status: "unsat" } }]) {
      const file = join(directory, "worker.mjs");
      await writeFile(file, `process.send(${JSON.stringify(message)}); process.on('message', () => {});`);
      const backend = createBackend({ worker: pathToFileURL(file) });
      try { await assert.rejects(backend.start(10_000), (e) => ["backend-capability", "invalid-response"].includes(e.reason)); }
      finally { await backend.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("independent concurrent requests keep proofs, vacuity, and replay witnesses isolated", async () => {
  const sources = [
    "// ensures Object.is(result, x)\nconst f = (x: number) => x;",
    "// requires Object.is(x, -0)\n// ensures result === Infinity\nconst f = (x: number) => 1 / x;",
    "// requires false\n// ensures true\nconst f = (x: number) => x;",
  ];
  const reports = await Promise.all(sources.map((source) => verify(source, { timeoutMs: 30_000 })));
  assert.deepEqual(reports.map((r) => r.outcomes[0].status), ["verified", "counterexample", "vacuous"]);
  assert.equal(reports[1].outcomes[0].confirmed, true);
  assert.equal(reports[1].outcomes[0].inputs.x, "-0");
  assert.equal(reports[1].outcomes[0].result, "-Infinity");
});

test("real Z3 queries isolate assertions even when target symbols have the same names", async () => {
  const backend = createBackend();
  try {
    await backend.start(10_000);
    const base = { target: "isolation", phase: "feasibility", domain: "full", declarations: "(declare-const x Bool)", models: [{ kind: "boolean", symbol: "x" }] };
    const first = await backend.check({ ...base, assertions: ["x"] }, 10_000);
    const second = await backend.check({ ...base, assertions: ["(not x)"] }, 10_000);
    assert.deepEqual(first, { status: "sat", witness: ["true"] });
    assert.deepEqual(second, { status: "sat", witness: ["false"] });
  } finally { await backend.close(); }
});

test("an unreplayable callee blocks callers transitively while an independent target verifies", async () => {
  const source = `// requires xs.length === 257
// ensures result
const large = (xs: boolean[]) => true;
// ensures result === false
const middle = () => false && large([]);
// ensures result === false
const outer = () => middle();
// ensures result
const independent = () => true;`;
  const { outcomes } = await verify(source, { timeoutMs: 30_000 });
  assert.deepEqual(outcomes.map((o) => o.status), ["unknown", "unknown", "unknown", "verified"]);
  assert.equal(outcomes[0].reason, "witness-too-large");
  assert.equal(outcomes[0].obligation.phase, "feasibility-witness");
  assert.equal(outcomes[0].obligation.domain, "replay-witness");
  assert.equal(outcomes[1].reason, "dependency");
  assert.equal(outcomes[2].reason, "dependency");
  const directory = await mkdtemp(join(tmpdir(), "proof-attribution-"));
  try {
    const file = join(directory, "large.ts");
    await writeFile(file, source);
    const cli = fileURLToPath(new URL("../../verify/bin/jsverify.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [cli, file], { encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /obligation: feasibility-witness \(replay-witness, z3\); queries attempted: 2/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("real Z3 evidence survives a controlled costly obligation in both target orders", async () => {
  for (const names of [["costly", "cheap"], ["cheap", "costly"]]) {
    const source = names.map((name) => `// ensures result\nconst ${name} = () => true;`).join("\n");
    const { targets } = compile(single("partial.ts", source).records);
    let clock = 0;
    const cheapDone = Promise.withResolvers();
    const results = await solve(targets, 10_000, {
      now: () => clock,
      connect: () => {
        const real = createBackend();
        return {
          async start(budget) { const descriptor = await real.start(budget); clock++; return descriptor; },
          async check(query, budget) {
            if (query.target.endsWith("#costly") && query.phase === "postcondition") {
              await cheapDone.promise;
              clock = 10_000;
              throw new BackendError("worker-timeout", "controlled costly obligation");
            }
            const answer = await real.check(query, budget);
            clock++;
            if (query.target.endsWith("#cheap") && query.phase === "postcondition") cheapDone.resolve();
            return answer;
          },
          close: () => real.close(),
        };
      },
    });
    const outcomes = Object.fromEntries(names.map((name, i) => [name, results[i]]));
    assert.equal(outcomes.cheap.status, "verified");
    assert.deepEqual(outcomes.cheap.witness, []);
    assert.equal(outcomes.costly.status, "unknown");
    assert.equal(outcomes.costly.obligation.phase, "postcondition");
    assert.ok(clock <= 10_000);
  }
});

test("all source postconditions are required and oversized counterexamples name their clause", async () => {
  const { outcomes } = await verify(`// ensures result === flag
// ensures !result || flag
const good = (flag: boolean) => flag;
// ensures result === flag
// ensures !result
const bad = (flag: boolean) => flag;
// ensures result >= 0
// ensures result <= 256
const size = (xs: boolean[]) => xs.length;`, { timeoutMs: 30_000 });
  assert.deepEqual(outcomes.map((o) => o.status), ["verified", "counterexample", "unknown"]);
  assert.equal(outcomes[1].confirmed, true);
  assert.equal(outcomes[1].inputs.flag, "true");
  assert.deepEqual(outcomes[1].failed.map((c) => c.text), ["!result"]);
  assert.equal(outcomes[2].reason, "witness-too-large");
  assert.equal(outcomes[2].obligation.phase, "counterexample-witness");
  assert.equal(outcomes[2].obligation.postcondition, 2);
  assert.equal(outcomes[2].obligation.postconditionCount, 2);
});
