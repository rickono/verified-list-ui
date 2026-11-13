import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSumMean } from "../../verify/examples/es-toolkit/check.mjs";

test("pinned unchanged es-toolkit sum and mean prove the documented empty-array results and catch wrong claims", async () => {
  const report = await checkSumMean();
  assert.equal(report.provenance.commit, "1913a7627a2995b095249d6b0b6453b900cdd4bc");
  assert.equal(report.provenance.files.sum.sha256, "932fb45fe749f343a198e093a9c4fc1628aa8c21204957cf481e038903347507");
  assert.equal(report.provenance.files.mean.sha256, "b0445d7e281b1e8b646c9729efa1d3d4806217c93dc9954cc434261690573ca7");
  assert.match(report.annotated.sum, /\n  let result = 0;\n/);
  assert.deepEqual(report.checks.map((c) => [c.name, c.outcomes.map((o) => `${o.fn}:${o.status}`)]), [
    ["composed-empty", ["sum:verified", "mean:verified"]],
    ["weakened-sum-summary", ["sum:verified", "mean:unknown"]],
    ["negative-zero-sum-claim", ["sum:counterexample"]],
    ["zero-mean-claim", ["sum:verified", "mean:counterexample"]],
    ["return-plus-one-mutant", ["sum:counterexample"]],
  ]);
  assert.equal(report.nativeSamples.length, 11);
});
