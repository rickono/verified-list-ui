// Authored campaign adapter. Runtime implementations come from maintained pins.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import { Parser, tokenizer } from "acorn";
import { reverseCases, contracts, annotations } from "../K-evidence/pilot/check.mjs";
import { takeCases } from "../../../examples/remeda/check.mjs";

export const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const tokens = (source) => [...tokenizer(source, { ecmaVersion: 2022, sourceType: "module" })]
  .map((t) => source.slice(t.start, t.end));
const imports = (source) => Parser.parse(source, { ecmaVersion: 2022, sourceType: "module" }).body
  .filter((n) => n.type === "ImportDeclaration").map((n) => n.source.value);
export const CONTENT = "result.every((value, index) => Object.is(value, old(array.slice())[array.length - 1 - index]))";
export const rankAdaptation = {
  before: "decreases real(arr.length) - real(i)",
  after: "decreases real(arr.length - 0) - real(i)",
  authored: true,
  rationale: "The inspected rank obligation retains FP finiteness tests for raw length. Subtracting zero is exact for every native length and gives the maintained numeric owner an explicit signed-integer expression before embedding it. Same rank, same entry replay measure, no input bound. The unrun real(length - i) and real(length + 0) - real(i) candidates retained FP rank comparisons and were rejected after query inspection.",
};
export const caller = `// Authored composition glue, distributed with this GPL-3.0 report fixture.
import { Reverse } from "./Reverse.helper.js";
import { take } from "./take.helper.js";

/** @param {number[]} array */
// modifies array
// ensures result.length === (array.length < 2 ? array.length : 2)
// ensures ${CONTENT}
export const reverseFirstTwo = (array) => take(Reverse(array), 2);
`;

export async function pinnedFixtures({ write = false } = {}) {
  const reverseRoot = here("../K-evidence/pilot/");
  const takeRoot = here("../../../examples/remeda/");
  const [reverseBytes, reverseMeta, reverseLicense, takeBytes, takeMeta, takeLicense] = await Promise.all([
    readFile(reverseRoot + "Reverse.upstream.js"), readFile(reverseRoot + "provenance.json", "utf8"),
    readFile(reverseRoot + "LICENSE"), readFile(takeRoot + "take.upstream.ts"),
    readFile(takeRoot + "provenance.json", "utf8"), readFile(takeRoot + "LICENSE"),
  ]);
  const reversePin = JSON.parse(reverseMeta), takePin = JSON.parse(takeMeta);
  assert.equal(reversePin.commit, "636017ca51dad05339cde3b5c66cbe1d71957f7e");
  assert.equal(reversePin.sha256, "8049944060cfc7e8a3a95cc65f5e097ebb07469c5e8b871b678f151312e88e46");
  assert.equal(hash(reverseLicense), reversePin.licenseSha256);
  assert.equal(hash(takeLicense), "acf30083045d768ce20640237313ee31a45d548d66ef76df5bb5fb0745479535");
  assert.equal(takePin.commit, "004b09194f6d39f727118c0a71adc9986bcc13e1");
  assert.equal(takePin.sha256, "64ccd5ad15d4c387b2aa57cb6173a541b8bd79dcdfa06cc57e0136141e539bdf");
  // Maintained adapters check source/declaration hashes and comment-only insertion
  // for Reverse, and Node's exact type erasure for the eager take declaration.
  const reverse = reverseCases(reverseBytes, reversePin)[0];
  assert.equal(reverse.source.split(rankAdaptation.before).length, 2);
  const annotatedReverseSource = reverse.source.replace(rankAdaptation.before, rankAdaptation.after);
  assert.deepEqual(tokens(annotatedReverseSource), tokens(reverse.source));
  assert.equal(annotatedReverseSource.replace(rankAdaptation.after, rankAdaptation.before), reverse.source);
  const take = takeCases(takeBytes.toString(), takePin).find((c) => c.name === "exact-length-and-prefix");
  assert.ok(take);
  assert.equal(take.source + "export { takeImplementation as take };\n", await readFile(takeRoot + "take.helper.js", "utf8"));
  const sources = {
    "Reverse.helper.js": annotatedReverseSource + "export { Reverse };\n",
    "take.helper.js": take.source + "export { takeImplementation as take };\n",
    "caller.js": caller,
  };
  const fixtureRoot = here("./fixtures/gpl-3.0/");
  if (write) {
    for (const [name, source] of Object.entries(sources)) await writeFile(fixtureRoot + name, source);
    await copyFile(reverseRoot + "LICENSE", fixtureRoot + "LICENSE");
    await copyFile(takeRoot + "LICENSE", fixtureRoot + "LICENSE.remeda");
  }
  for (const [name, source] of Object.entries(sources)) assert.equal(await readFile(fixtureRoot + name, "utf8"), source, name);
  assert.equal(hash(await readFile(fixtureRoot + "LICENSE")), hash(reverseLicense));
  assert.equal(hash(await readFile(fixtureRoot + "LICENSE.remeda")), hash(takeLicense));
  const annotatedReverse = Parser.parse(sources["Reverse.helper.js"], { ecmaVersion: 2022, sourceType: "module" }).body
    .find((n) => n.type === "VariableDeclaration");
  assert.ok(annotatedReverse);
  assert.deepEqual(tokens(sources["Reverse.helper.js"].slice(annotatedReverse.start, annotatedReverse.end)), tokens(reverse.implementation));
  const strippedTake = stripTypeScriptTypes(takeBytes.toString(), { mode: "strip" });
  const decl = Parser.parse(strippedTake, { ecmaVersion: 2022, sourceType: "module" }).body
    .find((n) => n.type === "VariableDeclaration" && n.declarations[0]?.id.name === "takeImplementation");
  assert.ok(decl);
  const takeImplementation = strippedTake.slice(decl.start, decl.end);
  const pins = {
    reverse: { ...reversePin, reusedSource: "../K-evidence/pilot/Reverse.upstream.js",
      reusedProvenance: "../K-evidence/pilot/provenance.json", reusedLicense: "../K-evidence/pilot/LICENSE",
      sourceSha256: hash(reverseBytes), tokenSha256: hash(JSON.stringify(tokens(reverse.implementation))),
      sourceImports: imports(reverseBytes.toString()), contracts, annotations, rankAdaptation,
      adapter: "../K-evidence/pilot/check.mjs", adapterSha256: hash(await readFile(reverseRoot + "check.mjs")) },
    take: { ...takePin, reusedSource: "../../../examples/remeda/take.upstream.ts",
      reusedProvenance: "../../../examples/remeda/provenance.json", reusedLicense: "../../../examples/remeda/LICENSE",
      sourceSha256: hash(takeBytes), erasedSourceSha256: hash(strippedTake),
      tokenSha256: hash(JSON.stringify(tokens(takeImplementation))), licenseSha256: hash(takeLicense),
      sourceImports: imports(strippedTake), extractedDeclarationImports: [],
      adapter: "../../../examples/remeda/check.mjs", adapterSha256: hash(await readFile(takeRoot + "check.mjs")) },
    fixtures: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name,
      { sha256: hash(source), tokenSha256: hash(JSON.stringify(tokens(source))), imports: imports(source),
        origin: name === "caller.js" ? "authored" : "maintained pin adapter; annotations and export only" }])),
  };
  return { sources, pins, reverseImplementation: reverse.implementation, takeImplementation };
}
