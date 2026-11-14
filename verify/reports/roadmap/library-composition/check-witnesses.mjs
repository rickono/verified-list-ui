#!/usr/bin/env node
// Check the wrapper itself at recorded helper and caller witnesses.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { here, pinnedFixtures } from "./fixture.mjs";
import { nativeComparisons } from "./native.mjs";

const { sources } = await pinnedFixtures();
const root = here("./fixtures/gpl-3.0/"), records = [];
const historical = here("./logs/campaign/run-XafdDE/");
try {
  for (const name of ["wrong-order", "lost-temp", "lost-temp-warm", "lost-temp-audit"]) {
    const record = JSON.parse(await readFile(historical + name + ".json", "utf8"));
    const helperFailure = name.startsWith("lost-temp");
    const fn = helperFailure ? "Reverse" : "reverseFirstTwo";
    const outcome = record.report.outcomes.find((o) => o.fn === fn);
    assert.equal(outcome.confirmed, true);
    const snapshot = helperFailure ? "lost-temp-mutant" : "wrong-order";
    for (const file of Object.keys(sources)) await writeFile(root + file, await readFile(historical + "sources/" + snapshot + "/" + file));
    const input = (outcome.inputs.arr ?? outcome.inputs.array).map(Number);
    const native = await nativeComparisons(root + "caller.js", [input, [1, 2], [1, 2, 3, 4]]);
    if (helperFailure) {
      assert.equal(native.checks[0].wrapperHolds, true, "The recorded four-element helper witness does not fail the wrapper property.");
      assert.equal(native.checks[1].wrapperHolds, false, "The actual seeded wrapper fails on [1, 2].");
      assert.equal(record.report.outcomes.find((o) => o.fn === "reverseFirstTwo").status, "unknown");
    } else {
      assert.equal(native.checks[0].wrapperHolds, false);
      assert.equal(native.checks[0].length, true);
    }
    records.push({ name, confirmedFunction: fn,
      classification: helperFailure
        ? "Confirmed seeded helper failure; caller is dependency unknown. That helper witness passes the wrapper. A separate native [1,2] wrapper failure is demonstrated."
        : "Confirmed authored wrong-order wrapper failure at the exact replay witness; length still holds.", native });
  }
  await writeFile(here("./logs/08-native-witnesses.json"), JSON.stringify({ status: "PASS", records }, null, 2) + "\n");
  console.log(JSON.stringify({ status: "PASS", checkedReports: records.length, nativeExecutions: records.length * 3 }));
} finally {
  for (const [name, source] of Object.entries(sources)) await writeFile(root + name, source);
  await pinnedFixtures();
}
