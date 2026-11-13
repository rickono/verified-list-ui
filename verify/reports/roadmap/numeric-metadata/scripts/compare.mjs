// Compare full saved obligations and exact native observations, without changing
// the existing conformance runner's comparison or reducing obligation fields.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const [before, after] = process.argv.slice(2);
const rows = (path) => readFileSync(join(path, "corpus.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const baseline = rows(before), final = rows(after), changed = [], outcomes = [];
const sha = (s) => createHash("sha256").update(s).digest("hex");
assert.deepEqual(baseline.map((c) => c.id), final.map((c) => c.id));
for (let i = 0; i < final.length; i++) {
  const a = baseline[i], b = final[i];
  assert.equal(a.sourceSha256, b.sourceSha256);
  assert.deepEqual(a.native, b.native, `${a.id}: native observations changed`);
  const old = gunzipSync(readFileSync(join(before, `${a.id}.queries.json.gz`))).toString();
  const now = gunzipSync(readFileSync(join(after, `${a.id}.queries.json.gz`))).toString();
  if (old !== now) changed.push({ id: a.id, before: sha(old), after: sha(now) });
  if (a.outcome.status !== b.outcome.status || a.outcome.reason !== b.outcome.reason) outcomes.push({ id: a.id,
    before: { status: a.outcome.status, reason: a.outcome.reason }, after: { status: b.outcome.status, reason: b.outcome.reason } });
}
console.log(JSON.stringify({ cases: final.length, nativeEqual: true, changedObligations: changed, changedOutcomes: outcomes }, null, 2));
