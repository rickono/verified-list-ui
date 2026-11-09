import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { verify, verifyFile } from "../../verify/index.mjs";
import { solve } from "../../verify/proofs.mjs";

const verified = report => assert.ok(report.outcomes.length && report.outcomes.every(o => o.status === "verified"), JSON.stringify(report));

test("aliases, scalar updates and old entry values compose", async () => {
  verified(await verify(`type Count = number;
// ensures Object.is(result, old(x) + 1)
const increment = (x: Count) => { let value: Count = x; value++; return value; };`));
  verified(await verify(`type Count = number;
// ensures real(result) === (old(flag) ? real("2") : real("3"))
const increment = (flag: boolean) => { var value: Count = flag ? 1 : 2; value += 1; return value; };`));
});

test("checked specs imported through type-aware barrels support mutable scalar bodies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "verify-integrated-"));
  try {
    const files = {
      "types.ts": "export type Flag = boolean;",
      "spec.ts": `import type { Flag } from './types.ts';
// @spec
// ensures result === flag
const same = (flag: Flag) => flag;
export { same as default };`,
      "barrel.ts": "export { default as same } from './spec.ts';",
      "entry.ts": `import { same } from './barrel.ts';
import type { Flag } from './types.ts';
// ensures result === same(flag)
const twice = (flag: Flag) => { let value: Flag = flag; value = !value; value = !value; return value; };`,
    };
    for (const [name, source] of Object.entries(files)) {
      await mkdir(dirname(join(directory, name)), { recursive: true });
      await writeFile(join(directory, name), source);
    }
    const report = await verifyFile(join(directory, "entry.ts"));
    verified(report);
    assert.equal(report.outcomes.find(o => o.fn === "twice").assumptions[0].typeAliases[0].name, "Flag");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("mathematical requires remain definedness obligations before feasibility", async () => {
  const report = await verify(`type Input = number;
// requires real(x) > real("0")
// ensures true
const bad = (x: Input) => true;`);
  const result = report.outcomes[0];
  assert.equal(result.status, "counterexample", JSON.stringify(report));
  assert.equal(result.phase, "requires-definedness");
  assert.equal(result.confirmed, true);
  assert.equal(Number.isFinite(Number(result.inputs.x)), false);
});

test("guarded exact contracts preserve scalar branch effects and entry snapshots", async () => {
  verified(await verify(`type Input = number;
// requires flag || Number.isFinite(x)
// ensures flag || real(result) === real(old(x))
const guarded = (flag: boolean, x: Input) => { let value: Input = x; if (flag) { value = NaN; } return value; };`));
  const report = await verify(`type Input = number;
// requires Object.is(x, 0)
// ensures real(result) === real(old(x)) + real("0.1")
const rounded = (x: Input) => { let value: Input = x; value += 0.1; return value; };`);
  assert.equal(report.outcomes[0].status, "counterexample", JSON.stringify(report));
  assert.equal(report.outcomes[0].confirmed, true);
});

test("backend definedness searches never assume requires or use witness bounds as proofs", async () => {
  const target = { id: "definedness", declarations: "", params: [], pre: "false", preDefined: "false", postconditions: ["true"], smallWitness: "small" };
  for (const oversized of [false, true]) {
    const queries = [];
    const backend = {
      async start() { return { name: "controlled" }; },
      async check(query) {
        queries.push(query);
        return queries.length === 1 ? oversized ? { status: "sat", oversized: true } : { status: "sat", witness: [] } : { status: "unsat" };
      },
      async close() {},
    };
    const [outcome] = await solve([target], 1000, { connect: () => backend });
    assert.deepEqual(queries[0].assertions, ["(not false)"]);
    if (oversized) {
      assert.deepEqual(queries[1].assertions, ["(not false)", "small"]);
      assert.equal(outcome.status, "unknown");
      assert.equal(outcome.reason, "witness-too-large");
    } else {
      assert.equal(outcome.status, "counterexample");
      assert.equal(outcome.phase, "requires-definedness");
    }
  }
});
