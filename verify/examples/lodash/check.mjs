import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";
import { Parser, tokenizer } from "acorn";
import { verify } from "../../index.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const contracts = [
  "requires Number.isInteger(fromIndex) && 0 <= fromIndex && fromIndex <= array.length",
  "ensures Number.isInteger(result)",
  "ensures result === -1 || (fromIndex <= result && result < array.length && array[result] === value)",
  "ensures result !== -1 || array.every((element, i) => i < fromIndex || element !== value)",
  "ensures result === -1 || array.every((element, i) => i < fromIndex || i >= result || element !== value)",
];
const annotations = [
  "invariant Number.isInteger(index) && -1 <= index && fromIndex - 1 <= index && index < length",
  "invariant array.every((element, i) => i < fromIndex || i >= index + 1 || element !== value)",
  "decreases real(length) - real(index)",
];
const tokens = (source) => [...tokenizer(source, { ecmaVersion: 2022 })].map((t) => source.slice(t.start, t.end));
const replaceOnce = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Expected one mutation site: ${before}`);
  return source.replace(before, after);
};

export function searchCases(bytes, provenance) {
  assert.equal(hash(bytes), provenance.sha256, "The pinned Lodash source changed.");
  const source = bytes.toString();
  const program = Parser.parse(source, { ecmaVersion: 2022 });
  const fn = program.body.find((node) => node.type === "FunctionDeclaration" && node.id.name === provenance.declaration);
  assert.ok(fn, "The pinned search declaration is missing.");
  const implementation = source.slice(fn.start, fn.end);
  assert.equal(hash(implementation), provenance.declarationSha256, "The extracted Lodash declaration changed.");
  const loop = fn.body.body.find((node) => node.type === "WhileStatement");
  assert.ok(loop, "The search loop is missing.");
  const at = loop.start - fn.start;
  const insertion = annotations.map((line, i) => `${i ? "  " : ""}// ${line}\n`).join("") + "  ";
  const annotated = implementation.slice(0, at) + insertion + implementation.slice(at);
  assert.equal(annotated.slice(0, at) + annotated.slice(at + insertion.length), implementation);
  assert.deepEqual(tokens(annotated), tokens(implementation), "Proof comments must preserve every implementation token.");
  const prelude = "/** @param {number[]} array\n * @param {number} value\n * @param {number} fromIndex */\n"
    + contracts.map((line) => `// ${line}\n`).join("");
  return [
    { name: "upstream", source: prelude + annotated + "\n", implementation },
    { name: "off-by-one-mutant", source: prelude + replaceOnce(annotated, "return index;", "return index + 1;") + "\n",
      implementation: replaceOnce(implementation, "return index;", "return index + 1;") },
    { name: "skipped-first-mutant", source: prelude + replaceOnce(annotated, "array[index] === value", "array[index] === value && index !== fromIndex") + "\n",
      implementation: replaceOnce(implementation, "array[index] === value", "array[index] === value && index !== fromIndex") },
  ];
}

// Independent V8 checks of the actual CJS export, without verifier value helpers.
export function nativeSamples(bytes) {
  const module = { exports: {} };
  new Script(bytes.toString()).runInNewContext({ module }, { timeout: 100 });
  const arrays = [[], [0], [-0], [NaN], [Infinity, -Infinity], [1, 2, 1],
    [-0, 0, NaN, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE]];
  const values = [0, -0, NaN, 1, 2, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE];
  let count = 0;
  for (const array of arrays) for (const value of values) for (const start of [-0, ...array.map((_, i) => i), array.length]) {
    const actual = module.exports(array, value, start);
    assert.ok(Object.is(actual, array.indexOf(value, start)), "The pinned helper differs from native strict search.");
    count++;
  }
  return count;
}

export async function checkSearch() {
  const [bytes, metadata, license] = await Promise.all([
    readFile(new URL("./strictIndexOf.upstream.js", import.meta.url)),
    readFile(new URL("./provenance.json", import.meta.url), "utf8"),
    readFile(new URL("./LICENSE", import.meta.url)),
  ]);
  const provenance = JSON.parse(metadata);
  assert.equal(hash(license), provenance.licenseSha256, "The pinned license changed.");
  const cases = searchCases(bytes, provenance);
  const checks = [];
  for (const target of cases) {
    const report = await verify(target.source, { file: `lodash/${target.name}.js`, timeoutMs: 60_000 });
    assert.equal(report.outcomes.length, 1);
    checks.push({ name: target.name, ...report });
  }
  assert.deepEqual(checks.map((c) => c.outcomes[0].status), ["verified", "counterexample", "counterexample"]);
  for (let i = 1; i < checks.length; i++) {
    const broken = checks[i].outcomes[0];
    assert.equal(broken.confirmed, true);
    const array = broken.inputs.array.map(Number), value = Number(broken.inputs.value), start = Number(broken.inputs.fromIndex);
    assert.ok(Number.isInteger(start) && 0 <= start && start <= array.length);
    const fn = new Script(`(${cases[i].implementation})`).runInNewContext({}, { timeout: 100 });
    const actual = fn(array, value, start);
    assert.ok(Object.is(actual, Number(broken.result)), "The reported result must match native execution.");
    assert.notEqual(actual, array.indexOf(value, start), "A seeded bug must really change the first-match result.");
    assert.ok(broken.failed.length, "A contract must fail, not just an induction hint.");
  }
  return {
    provenance,
    scope: "Unchanged strictIndexOf function plus proof comments; dense numeric arrays of every native length and integer starts in [0, length]. Includes NaN, infinities and signed zeros. The public Lodash wrapper, arbitrary values and sparse arrays are outside this proof.",
    nativeSamples: nativeSamples(bytes),
    checks,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await checkSearch(), null, 2));
}
