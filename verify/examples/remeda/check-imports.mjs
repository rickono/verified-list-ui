import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyFile } from "../../index.mjs";
import { takeCases } from "./check.mjs";

const here = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));
const outcome = (report, fn) => report.outcomes.find((o) => o.fn === fn);
const helperHash = (report) => report.modules.find((m) => m.file.endsWith("/take.helper.js")).sha256;

export async function checkTakeImports() {
  const [source, metadata, helper] = await Promise.all(
    ["take.upstream.ts", "provenance.json", "take.helper.js"].map((file) => readFile(here(file), "utf8")),
  );
  const provenance = JSON.parse(metadata);
  const expected = takeCases(source, provenance).find((c) => c.name === "exact-length-and-prefix").source
    + "export { takeImplementation as take };\n";
  assert.equal(helper, expected, "The helper must preserve the hash-checked eager declaration and add only an export alias.");

  const composed = await verifyFile(here("composed.js"), { timeoutMs: 60_000 });
  assert.equal(outcome(composed, "takeImplementation")?.status, "verified", JSON.stringify(composed.outcomes));
  assert.equal(outcome(composed, "firstTwo")?.status, "verified", JSON.stringify(composed.outcomes));
  const shifted = await verifyFile(here("shifted.js"), { timeoutMs: 60_000 });
  assert.equal(outcome(shifted, "takeImplementation")?.status, "verified", JSON.stringify(shifted.outcomes));
  const bad = outcome(shifted, "shifted");
  assert.equal(bad?.status, "counterexample", JSON.stringify(shifted.outcomes));
  assert.equal(bad.confirmed, true);
  assert.equal(bad.result.length, 2);
  assert.equal(bad.failed.length, 1);
  assert.match(bad.failed[0].text, /every/);
  assert.ok(bad.result.map(Number).some((v, i) => !Object.is(v, bad.inputs.array.map(Number)[i])));

  const directory = await mkdtemp(join(tmpdir(), "verify-take-imports-"));
  let weakened;
  try {
    await copyFile(here("composed.js"), join(directory, "composed.js"));
    const exactLength = "ensures result.length === (n < array.length ? n : array.length)";
    assert.equal(helper.split(exactLength).length, 2);
    await writeFile(join(directory, "take.helper.js"), helper.replace(exactLength, "ensures result.length <= array.length"));
    weakened = await verifyFile(join(directory, "composed.js"), { timeoutMs: 60_000 });
    assert.equal(weakened.sha256, composed.sha256, "The caller bytes stay unchanged.");
    assert.notEqual(helperHash(weakened), helperHash(composed));
    assert.notEqual(weakened.graphSha256, composed.graphSha256);
    assert.equal(outcome(weakened, "takeImplementation")?.status, "verified", JSON.stringify(weakened.outcomes));
    assert.equal(outcome(weakened, "firstTwo")?.status, "unknown", JSON.stringify(weakened.outcomes));
    assert.equal(outcome(weakened, "firstTwo").reason, "contract-gap");
  } finally { await rm(directory, { recursive: true, force: true }); }

  return {
    provenance,
    scope: "Named local imports of the unchanged eager take body over numeric dense arrays of every native length. Callers use contracts and fresh results. Weaker helper contracts change the graph hash and remove the caller's proof.",
    checks: [{ name: "composed-prefix", ...composed }, { name: "shifted-wrapper", ...shifted }, { name: "weakened-helper", ...weakened }],
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await checkTakeImports(), null, 2));
}
