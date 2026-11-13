import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { checkPredicateSearch, predicateCases } from "../../verify/examples/ramda/check.mjs";

test("the exact Ramda eager search verifies for any pure predicate; both source mutations replay", async (t) => {
  const report = await checkPredicateSearch();
  assert.equal(report.provenance.commit, "980b3bf7712adb8ad8b5d9b2c6aca525cb3cf143");
  assert.deepEqual(report.checks.map((c) => c.outcomes[0].status), ["verified", "counterexample", "counterexample"]);
  assert.equal(report.nativeSamples, 42);
  t.diagnostic(JSON.stringify({ nativeSamples: report.nativeSamples, bugs: report.checks.slice(1).map((c) => ({ name: c.name, inputs: c.outcomes[0].inputs, result: c.outcomes[0].result })) }));
});

test("the predicate fixture rejects raw source or declaration drift", async () => {
  const root = new URL("../../verify/examples/ramda/", import.meta.url);
  const bytes = await readFile(new URL("findIndex.upstream.js", root));
  const metadata = JSON.parse(await readFile(new URL("provenance.json", root), "utf8"));
  assert.throws(() => predicateCases(Buffer.concat([bytes, Buffer.from("\n")]), metadata), /pinned Ramda source changed/);
  assert.throws(() => predicateCases(bytes, { ...metadata, declarationSha256: "wrong" }), /extracted Ramda declaration changed/);
});
