import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildCorpus, DEFAULT_SEED } from "../../verify/conformance/corpus.mjs";

let evidence;
function cliEvidence() {
  if (!evidence) {
    const cli = fileURLToPath(new URL("../../verify/conformance/run.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [cli, "--mutations"], {encoding: "utf8", timeout: 180_000, maxBuffer: 8 * 1024 * 1024});
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    evidence = JSON.parse(result.stdout);
  }
  return evidence;
}

test("the seeded corpus compares accepted semantics and reported witnesses with independent native execution", async (t) => {
  const evidence = cliEvidence();
  assert.deepEqual(evidence.failures, []);
  assert.ok(evidence.counts.functions > 400);
  assert.ok(evidence.counts.counterexamples >= 10);
  t.diagnostic(JSON.stringify({seed: evidence.seed, ...evidence.counts}));
});

test("semantic and verdict-policy mutants are detected in isolated verifier copies after passing controls", async (t) => {
  const evidence = cliEvidence().mutations;
  assert.equal(evidence.length, 10);
  assert.ok(evidence.every((m) => m.detected));
  t.diagnostic(JSON.stringify(evidence.map(({id, observed}) => ({id, observed}))));
});

test("the seed reproduces corpus sources and changes sampled numeric inputs", () => {
  assert.deepEqual(buildCorpus(DEFAULT_SEED), buildCorpus(DEFAULT_SEED));
  assert.notDeepEqual(buildCorpus(DEFAULT_SEED)[0], buildCorpus(DEFAULT_SEED + 1)[0]);
  assert.throws(() => buildCorpus(-1), /uint32/);
});
