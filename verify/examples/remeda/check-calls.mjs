import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verify } from "../../index.mjs";
import { takeCases } from "./check.mjs";

export async function checkTakeCalls() {
  const [source, metadata] = await Promise.all([
    readFile(new URL("./take.upstream.ts", import.meta.url), "utf8"),
    readFile(new URL("./provenance.json", import.meta.url), "utf8"),
  ]);
  const provenance = JSON.parse(metadata);
  const helper = takeCases(source, provenance).find((c) => c.name === "exact-length-and-prefix").source;
  const checks = [];
  const examples = [
    { name: "composed-prefix", caller: "firstTwo", source: `${helper}
/** @param {number[]} array */
// ensures result.length === (array.length < 2 ? array.length : 2)
// ensures result.every((value, index) => Object.is(value, array[index]))
const firstTwo = (array) => takeImplementation(takeImplementation(array, 3), 2);` },
    { name: "shifted-wrapper", caller: "shifted", source: `${helper}
/** @param {number[]} array */
// requires array.length > 2
// ensures result.length === 2
// ensures result.every((value, index) => Object.is(value, array[index]))
const shifted = (array) => takeImplementation(array.slice(1), 2);` },
  ];
  for (const example of examples) {
    const report = await verify(example.source, { file: `remeda/${example.name}.js`, timeoutMs: 60_000 });
    assert.equal(report.outcomes.find((o) => o.fn === "takeImplementation")?.status, "verified", JSON.stringify(report.outcomes));
    checks.push({ name: example.name, caller: example.caller, ...report });
  }
  const good = checks[0].outcomes.find((o) => o.fn === "firstTwo");
  assert.equal(good?.status, "verified", JSON.stringify(checks[0].outcomes));
  const bad = checks[1].outcomes.find((o) => o.fn === "shifted");
  assert.equal(bad?.status, "counterexample", JSON.stringify(checks[1].outcomes));
  assert.equal(bad.confirmed, true);
  assert.equal(bad.result.length, 2);
  assert.equal(bad.failed.length, 1);
  assert.match(bad.failed[0].text, /every/);
  const input = bad.inputs.array.map(Number);
  assert.ok(bad.result.map(Number).some((value, index) => !Object.is(value, input[index])));
  return {
    provenance,
    scope: "Same-module direct calls over numeric dense arrays of every native length. The pinned eager take body is unchanged; caller proofs use its contracts and fresh results, with no body inlining.",
    checks,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await checkTakeCalls(), null, 2));
}
