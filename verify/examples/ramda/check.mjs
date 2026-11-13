import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";
import { Parser, tokenizer } from "acorn";
import { verify } from "../../index.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tokens = (source) => [...tokenizer(source, { ecmaVersion: 2022 })].map((t) => source.slice(t.start, t.end));
const replaceOnce = (source, from, to) => {
  assert.equal(source.split(from).length, 2, `Expected one mutation site: ${from}`);
  return source.replace(from, to);
};

export function predicateCases(bytes, provenance) {
  assert.equal(hash(bytes), provenance.sha256, "The pinned Ramda source changed.");
  const source = bytes.toString(), found = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "FunctionExpression" && node.id?.name === provenance.declaration) found.push(node);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") walk(value);
  };
  walk(Parser.parse(source, { ecmaVersion: 2022, sourceType: "module" }));
  assert.equal(found.length, 1, "Expected one eager search function.");
  const fn = found[0], implementation = source.slice(fn.start, fn.end);
  assert.equal(hash(implementation), provenance.declarationSha256, "The extracted Ramda declaration changed.");
  const loop = fn.body.body.find((n) => n.type === "WhileStatement"), at = loop.start - fn.start;
  const clauses = ["invariant Number.isInteger(idx) && 0 <= idx && idx <= len",
    "invariant list.every((value, i) => idx <= i || !fn(value))", "decreases real(len) - real(idx)"];
  const insertion = clauses.map((line, i) => `${i ? "  " : ""}// ${line}\n`).join("") + "  ";
  const annotated = implementation.slice(0, at) + insertion + implementation.slice(at);
  assert.equal(annotated.slice(0, at) + annotated.slice(at + insertion.length), implementation);
  assert.deepEqual(tokens(annotated), tokens(implementation));
  const prelude = `/** @param {(x: number) => boolean} fn\n * @param {number[]} list */
// ensures Number.isInteger(result) && -1 <= result && result < list.length
// ensures result === -1 || (0 <= result && result < list.length && fn(list[result]))
// ensures list.every((value, i) => result !== -1 && result <= i || !fn(value))
`;
  return [
    { name: "upstream", implementation, source: prelude + annotated + "\n" },
    ...[["off-by-one", "return idx;", "return idx + 1;"],
      ["skipped-first", "if (fn(list[idx]))", "if (fn(list[idx]) && idx > 0)"]].map(([name, from, to]) => ({
      name, implementation: replaceOnce(implementation, from, to), source: prelude + replaceOnce(annotated, from, to) + "\n",
    })),
  ];
}

export async function pinnedPredicateCases() {
  const [bytes, license, metadata] = await Promise.all([
    readFile(new URL("./findIndex.upstream.js", import.meta.url)), readFile(new URL("./LICENSE.txt", import.meta.url)),
    readFile(new URL("./provenance.json", import.meta.url), "utf8"),
  ]);
  const provenance = JSON.parse(metadata);
  assert.equal(hash(license), provenance.licenseSha256, "The pinned Ramda license changed.");
  const cases = predicateCases(bytes, provenance);
  const exported = await readFile(new URL("./search.js", import.meta.url), "utf8");
  assert.equal(exported, cases[0].source.replace("function findIndex(", "export function findIndex("), "The annotated import fixture changed.");
  return { provenance, cases };
}

// Independent report-table decoder: no compiler/materializer helpers.
export function replayPredicate(table) {
  return (x) => {
    assert.equal(typeof x, "number", "Predicate argument is outside its numeric domain.");
    const entry = table.entries.find(([args]) => Object.is(Number(args[0]), x));
    return (entry?.[1] ?? table.else) === "true";
  };
}

export async function checkPredicateSearch() {
  const { provenance, cases } = await pinnedPredicateCases(), checks = [];
  for (const target of cases) {
    const report = await verify(target.source, { file: `ramda/${target.name}.js`, timeoutMs: 60_000 });
    assert.equal(report.outcomes.length, 1);
    checks.push({ name: target.name, ...report });
  }
  assert.deepEqual(checks.map((c) => c.outcomes[0].status), ["verified", "counterexample", "counterexample"]);
  for (let i = 1; i < checks.length; i++) {
    const broken = checks[i].outcomes[0];
    assert.equal(broken.confirmed, true);
    const list = broken.inputs.list.map(Number), predicate = replayPredicate(broken.inputs.fn);
    const actual = new Script(`(${cases[i].implementation})`).runInNewContext()(predicate, list);
    assert.equal(actual, Number(broken.result));
    assert.notEqual(actual, list.findIndex(predicate));
    assert.ok(broken.failed.length);
  }
  const original = new Script(`(${cases[0].implementation})`).runInNewContext();
  const arrays = [[], [0], [-0], [NaN], [1, 2, 1], [NaN, -0, 0, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE]];
  const predicates = [(x) => x > 0, (x) => x > 7, (x) => Object.is(x, -0), Number.isNaN, Number.isFinite, () => true, () => false];
  let nativeSamples = 0;
  for (const list of arrays) for (const predicate of predicates) {
    assert.equal(original(predicate, list), list.findIndex(predicate));
    nativeSamples++;
  }
  return { provenance, nativeSamples, scope: "Exact eager function, wrappers/currying/dispatch excluded; every native dense numeric-array length and every admitted pure total unary numeric predicate (no NaN-payload inspection).", checks };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await checkPredicateSearch(), null, 2));
}
