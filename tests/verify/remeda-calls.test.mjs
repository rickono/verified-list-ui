import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTakeCalls } from "../../verify/examples/remeda/check-calls.mjs";

test("a real take helper composes through contracts and catches a length-correct shifted wrapper", async () => {
  const report = await checkTakeCalls();
  assert.equal(report.provenance.commit, "004b09194f6d39f727118c0a71adc9986bcc13e1");
  assert.equal(report.checks[0].outcomes.find((o) => o.fn === "firstTwo").status, "verified");
  const bad = report.checks[1].outcomes.find((o) => o.fn === "shifted");
  assert.equal(bad.status, "counterexample");
  assert.equal(bad.confirmed, true);
  assert.equal(bad.result.length, 2);
  assert.equal(bad.failed.length, 1);
});
