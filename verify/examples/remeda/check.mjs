import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Parser } from "acorn";
import { verify } from "../../index.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const prefix = "result.every((value, index) => Object.is(value, array[index]))";
const types = "/** @param {number[]} array\n * @param {number} n */\n";

export function takeCases(source, provenance) {
  assert.equal(hash(source), provenance.sha256, "The pinned Remeda source changed.");
  const stripped = stripTypeScriptTypes(source, { mode: "strip" });
  const program = Parser.parse(stripped, { ecmaVersion: 2022, sourceType: "module" });
  const declaration = program.body.find((node) => node.type === "VariableDeclaration"
    && node.declarations.length === 1 && node.declarations[0].id.name === provenance.declaration);
  assert.ok(declaration, "The pinned eager take declaration is missing.");
  const implementation = stripped.slice(declaration.start, declaration.end);
  assert.equal(hash(implementation), provenance.declarationSha256, "The stripped eager take declaration changed.");
  const original = "array.slice(0, n)";
  assert.equal(implementation.split(original).length, 2, "The slice mutation must have exactly one target.");
  const shifted = implementation.replace(original, "array.slice(1, n + 1)");
  assert.notEqual(shifted, implementation);
  const contract = (lines, body = implementation) => types + lines.map((line) => `// ${line}\n`).join("") + body + "\n";
  return [
    { name: "prefix", source: contract([
      "ensures result.length <= array.length",
      "ensures n < 0 ? result.length === 0 : true",
      `ensures ${prefix}`,
    ]) },
    { name: "exact-length-and-prefix", source: contract([
      "requires Number.isSafeInteger(n) && n >= 0",
      "ensures result.length === (n < array.length ? n : array.length)",
      `ensures ${prefix}`,
    ]) },
    { name: "shifted-prefix-mutant", source: contract([
      "requires Number.isSafeInteger(n) && n > 0 && n < array.length",
      "ensures result.length === n",
      `ensures ${prefix}`,
    ], shifted) },
  ];
}

export async function checkTake() {
  const [source, metadata] = await Promise.all([
    readFile(new URL("./take.upstream.ts", import.meta.url), "utf8"),
    readFile(new URL("./provenance.json", import.meta.url), "utf8"),
  ]);
  const provenance = JSON.parse(metadata);
  const checks = [];
  for (const target of takeCases(source, provenance)) {
    const report = await verify(target.source, { file: `remeda/${target.name}.js`, timeoutMs: 60_000 });
    assert.equal(report.outcomes.length, 1);
    checks.push({ name: target.name, ...report });
  }
  assert.deepEqual(checks.map((c) => c.outcomes[0].status), ["verified", "verified", "counterexample"]);
  const broken = checks[2].outcomes[0];
  assert.equal(broken.confirmed, true);
  assert.deepEqual(broken.failed.map((c) => c.text), [prefix], "The mutation must fail on contents alone.");
  const input = broken.inputs.array.map(Number);
  const result = broken.result.map(Number);
  const count = Number(broken.inputs.n);
  assert.equal(result.length, count);
  assert.ok(result.some((value, index) => !Object.is(value, input[index])));
  return {
    provenance,
    scope: "Unchanged eager body after TypeScript stripping, numeric dense arrays of every native length; wrappers, lazy pipelines, and reference identity are outside this proof.",
    checks,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await checkTake(), null, 2));
}
