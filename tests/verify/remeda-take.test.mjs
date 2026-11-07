import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { checkTake, takeCases } from "../../verify/examples/remeda/check.mjs";

test("the unchanged Remeda eager take preserves its prefix and a shifted slice fails on contents", async () => {
  const report = await checkTake();
  assert.equal(report.provenance.commit, "004b09194f6d39f727118c0a71adc9986bcc13e1");
  assert.deepEqual(report.checks.map((c) => [c.name, c.outcomes[0].status]), [
    ["prefix", "verified"], ["exact-length-and-prefix", "verified"], ["shifted-prefix-mutant", "counterexample"],
  ]);
  const outcome = report.checks[2].outcomes[0];
  assert.equal(outcome.confirmed, true);
  assert.equal(outcome.result.length, Number(outcome.inputs.n));
  assert.ok(outcome.failed[0].text.includes("every"));
});

test("the Remeda proof fixture rejects source or extracted-declaration drift", async () => {
  const root = new URL("../../verify/examples/remeda/", import.meta.url);
  const source = await readFile(new URL("take.upstream.ts", root), "utf8");
  const provenance = JSON.parse(await readFile(new URL("provenance.json", root), "utf8"));
  assert.throws(() => takeCases(source + "\n", provenance), /pinned Remeda source changed/);
  assert.throws(() => takeCases(source, { ...provenance, declarationSha256: "changed" }), /stripped eager take declaration changed/);
});
