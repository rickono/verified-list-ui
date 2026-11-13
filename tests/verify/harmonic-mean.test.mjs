import assert from "node:assert/strict";
import { test } from "node:test";
import { checkHarmonic } from "../../verify/examples/simple-statistics/check-harmonic.mjs";

test("pinned harmonicMean proves total positive-singleton return and reproduces reciprocal-overflow +0 through P", async (t) => {
  const result = await checkHarmonic();
  assert.equal(result.status, "PASS");
  t.diagnostic(JSON.stringify(result));
});
