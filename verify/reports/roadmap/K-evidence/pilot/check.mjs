// K candidate (claude) pilot: the unchanged TheAlgorithms Reverse declaration,
// pinned by commit and hash, plus proof comments only.
// Imported from d9c22c63; adapted to the production verifier for Gate 3.
// Run through serial-verify.py: node .../pilot/check.mjs [--dump DIR]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { Script } from "node:vm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { Parser, tokenizer } from "acorn";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const contracts = [
  "modifies arr",
  "ensures result === arr",
  "ensures arr.every((v, k) => Object.is(v, old(arr.slice())[arr.length - 1 - k]))",
];
// Two proof-comment variants for the same unchanged code. "ternary" states the
// reversal as one quantified invariant; "split" states the same facts as three.
const INVARIANTS = {
  ternary: ["invariant arr.every((v, k) => k < i || k > j ? Object.is(v, old(arr.slice())[arr.length - 1 - k]) : Object.is(v, old(arr.slice())[k]))"],
  split: [
    "invariant arr.every((v, k) => k >= i || Object.is(v, old(arr.slice())[arr.length - 1 - k]))",
    "invariant arr.every((v, k) => k <= j || Object.is(v, old(arr.slice())[arr.length - 1 - k]))",
    "invariant arr.every((v, k) => k < i || k > j || Object.is(v, old(arr.slice())[k]))",
  ],
};
export const variant = process.env.K_PILOT_INVARIANT ?? "ternary";
assert.ok(variant in INVARIANTS, "K_PILOT_INVARIANT must be ternary or split.");
export const annotations = [
  "invariant Number.isInteger(i) && 0 <= i && i <= arr.length",
  "invariant Number.isInteger(j) && -1 <= j && j < arr.length && j === arr.length - 1 - i",
  ...INVARIANTS[variant],
  "decreases real(arr.length) - real(i)",
];
const tokens = (source) => [...tokenizer(source, { ecmaVersion: 2022, sourceType: "module" })].map((t) => source.slice(t.start, t.end));
const replaceOnce = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Expected one mutation site: ${before}`);
  return source.replace(before, after);
};
export const MUTANTS = [
  { name: "lost-temp-mutant", before: "arr[j] = temp", after: "arr[j] = arr[i]" },
  { name: "short-bound-mutant", before: "i < arr.length / 2", after: "i < arr.length / 2 - 1" },
  { name: "over-swap-mutant", before: "i < arr.length / 2", after: "i <= arr.length / 2" },
];

export function reverseCases(bytes, provenance) {
  assert.equal(hash(bytes), provenance.sha256, "The pinned Reverse.js bytes changed.");
  const source = bytes.toString();
  const program = Parser.parse(source, { ecmaVersion: 2022, sourceType: "module" });
  const top = program.body.find((n) => n.type === "VariableDeclaration" && n.declarations[0]?.id.name === provenance.declaration);
  assert.ok(top, "The pinned Reverse declaration is missing.");
  const implementation = source.slice(top.start, top.end);
  assert.equal(hash(implementation), provenance.declarationSha256, "The extracted Reverse declaration changed.");
  const fn = top.declarations[0].init;
  const loop = fn.body.body.find((n) => n.type === "ForStatement");
  assert.ok(loop, "The reversal loop is missing.");
  const at = loop.start - top.start;
  const insertion = annotations.map((line, i) => `${i ? "  " : ""}// ${line}\n`).join("") + "  ";
  const annotated = implementation.slice(0, at) + insertion + implementation.slice(at);
  assert.equal(annotated.slice(0, at) + annotated.slice(at + insertion.length), implementation);
  assert.deepEqual(tokens(annotated), tokens(implementation), "Proof comments must preserve every implementation token.");
  const prelude = "/** @param {number[]} arr */\n" + contracts.map((line) => `// ${line}\n`).join("");
  return [
    { name: "upstream", source: prelude + annotated + "\n", implementation },
    ...MUTANTS.map((m) => ({ name: m.name, source: prelude + replaceOnce(annotated, m.before, m.after) + "\n",
      implementation: replaceOnce(implementation, m.before, m.after) })),
  ];
}

const run = (implementation, input) => new Script(`${implementation}\nReverse`).runInNewContext({}, { timeout: 100 })(input);
const reversed = (before, after) => after.length === before.length && after.every((v, k) => Object.is(v, before[before.length - 1 - k]));

// Independent V8 checks of the pinned declaration, without verifier helpers.
export function nativeSamples(implementation) {
  const special = [0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE, 1, 2];
  const inputs = [[]];
  for (let n = 1; n <= 7; n++) inputs.push(Array.from({ length: n }, (_, k) => special[(k * 5 + n) % special.length]));
  inputs.push([-0, 0], [0, -0], [NaN, NaN, 1]);
  for (const input of inputs) {
    const before = [...input], out = run(implementation, input);
    assert.equal(out, input, "Reverse must return the same array.");
    assert.ok(reversed(before, input), "The pinned declaration differs from native reversal.");
  }
  return inputs.length;
}

async function main() {
  const [flag, dir] = process.argv.slice(2);
  const here = (p) => new URL(p, import.meta.url);
  const [bytes, metadata, license] = await Promise.all([readFile(here("./Reverse.upstream.js")), readFile(here("./provenance.json"), "utf8"), readFile(here("./LICENSE"))]);
  const provenance = JSON.parse(metadata);
  assert.equal(hash(license), provenance.licenseSha256, "The pinned license changed.");
  const cases = reverseCases(bytes, provenance);
  if (flag === "--dump") {
    const { compile } = await import("../../../../source.mjs");
    const { single } = await import("../../../../modules.mjs");
    const { obligation } = await import("../../../../proofs.mjs");
    await mkdir(dir, { recursive: true });
    for (const c of cases) for (const t of compile(single(`thealgorithms/${c.name}.js`, c.source).records).targets) {
      for (let i = 0; i < t.postconditions.length; i++) {
        const o = obligation(t, "postcondition", i);
        const file = `${dir}/${c.name}.p${i + 1}.${t.obligations[i]?.kind ?? "ensures"}.smt2`;
        await writeFile(file, `${o.declarations}\n${o.assertions.map((a) => `(assert ${a})`).join("\n")}\n(check-sat)\n`);
        console.log(file);
      }
    }
    return;
  }
  const { verify } = await import("../../../../index.mjs");
  const samples = nativeSamples(cases[0].implementation);
  const checks = [];
  for (const c of cases) {
    const t0 = Date.now();
    const report = await verify(c.source, { file: `thealgorithms/${c.name}.js`, timeoutMs: 60_000 });
    const outcomes = report.outcomes.map((o) => {
      const native = o.confirmed && o.inputs?.arr ? (() => { const input = o.inputs.arr.map(Number), before = [...input]; run(c.implementation, input); return { nativeReversed: reversed(before, input), length: before.length }; })() : undefined;
      return { status: o.status, reason: o.reason, phase: o.phase, line: o.line, message: o.message, confirmed: o.confirmed,
        failed: o.failed?.map((f) => f.text ?? f.kind), inputs: o.inputs, result: o.result, native, obligation: o.obligation };
    });
    checks.push({ name: c.name, ms: Date.now() - t0, sha256: report.sha256, outcomes });
    console.log(JSON.stringify(checks.at(-1)));
  }
  const receipt = { codeSha:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
    runtime:process.version, budgetMs:60_000, variant, provenance, nativeSamples:samples, contracts, annotations, mutants:MUTANTS, checks };
  await writeFile(here("../pilot-results.json"),JSON.stringify(receipt,null,2)+"\n");
  const outcome = (name) => checks.find((c) => c.name === name).outcomes[0];
  assert.equal(outcome("upstream").status,"verified",JSON.stringify(outcome("upstream")));
  for (const name of ["lost-temp-mutant","over-swap-mutant"]) {
    assert.equal(outcome(name).status,"counterexample"); assert.equal(outcome(name).confirmed,true);
    assert.equal(outcome(name).native.nativeReversed,false);
  }
  assert.ok(outcome("short-bound-mutant").status === "counterexample" && outcome("short-bound-mutant").confirmed
    || outcome("short-bound-mutant").status === "unknown" && outcome("short-bound-mutant").reason === "request-timeout",
    JSON.stringify(outcome("short-bound-mutant")));
  console.log(JSON.stringify({acceptance:"PASS",nativeSamples:samples,cases:checks.length}));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
