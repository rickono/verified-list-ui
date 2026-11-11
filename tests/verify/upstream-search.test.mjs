import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { checkSearch, nativeSamples, searchCases } from "../../verify/examples/lodash/check.mjs";

const root = new URL("../../verify/examples/lodash/", import.meta.url);

test("the unchanged Lodash search proves first match, absence, bounds and termination; seeded bugs replay", async (t) => {
  const report = await checkSearch();
  assert.equal(report.provenance.commit, "c6e281b878b315c7a10d90f9c2af4cdb112d9625");
  assert.deepEqual(report.checks.map((c) => [c.name, c.outcomes[0].status]), [
    ["upstream", "verified"], ["off-by-one-mutant", "counterexample"], ["skipped-first-mutant", "counterexample"],
  ]);
  t.diagnostic(JSON.stringify({ nativeSamples: report.nativeSamples,
    bugs: report.checks.slice(1).map((c) => ({ name: c.name, inputs: c.outcomes[0].inputs, result: c.outcomes[0].result })) }));
});

test("the search fixture rejects source and extracted-function drift", async () => {
  const bytes = await readFile(new URL("strictIndexOf.upstream.js", root));
  const metadata = JSON.parse(await readFile(new URL("provenance.json", root), "utf8"));
  assert.throws(() => searchCases(Buffer.concat([bytes, Buffer.from("\n")]), metadata), /pinned Lodash source changed/);
  assert.throws(() => searchCases(bytes, { ...metadata, declarationSha256: "changed" }), /extracted Lodash declaration changed/);
  assert.equal(searchCases(bytes, metadata).length, 3);
});

test("the raw CJS export agrees with native strict search on numeric edge cases and every valid small start", async () => {
  assert.equal(nativeSamples(await readFile(new URL("strictIndexOf.upstream.js", root))), 261);
});
