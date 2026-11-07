import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTakeImports } from "../../verify/examples/remeda/check-imports.mjs";

test("a pinned imported take proves composition, catches a shifted prefix and invalidates a weakened summary", async () => {
  const report = await checkTakeImports();
  assert.equal(report.provenance.commit, "004b09194f6d39f727118c0a71adc9986bcc13e1");
  assert.deepEqual(report.checks.map((r) => r.outcomes.find((o) => o.file === r.modules[0].file).status), ["verified", "counterexample", "unknown"]);
});
