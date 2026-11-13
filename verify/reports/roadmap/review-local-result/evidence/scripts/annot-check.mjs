// Independent provenance and annotation check for the es-toolkit pilot.
// Usage: node annot-check.mjs <archived-head-dir> <download-dir>
// The download directory holds untrusted upstream bytes; they are only read and hashed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

const [head, downloads] = process.argv.slice(2);
const acorn = createRequire(join(head, "package.json"))("acorn");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const dir = join(head, "verify/examples/es-toolkit");
const out = [];
const ok = (name, detail = "") => out.push(`PASS ${name}${detail ? `: ${detail}` : ""}`);

// 1. Pinned bytes versus two independent downloads (release commit and main).
const pairs = { "sum.upstream.ts": "src_math_sum.ts", "mean.upstream.ts": "src_math_mean.ts",
  "sum.spec.upstream.ts": "src_math_sum.spec.ts", "mean.spec.upstream.ts": "src_math_mean.spec.ts", LICENSE: "LICENSE" };
const pinned = {};
for (const [local, remote] of Object.entries(pairs)) {
  pinned[local] = await readFile(join(dir, local));
  for (const at of ["at-1913a76", "at-main-4d5963e"]) {
    const up = await readFile(join(downloads, at, remote));
    assert.ok(pinned[local].equals(up), `${local} differs from ${at}`);
  }
  ok(`bytes ${local}`, `${pinned[local].length} B sha256 ${sha(pinned[local])} == upstream@1913a76 == upstream@4d5963e`);
}

// 2. provenance.json numbers recomputed without acorn: declaration = 'export function NAME(' .. final '}'.
const provenance = JSON.parse(await readFile(join(dir, "provenance.json"), "utf8"));
assert.equal(provenance.commit, "1913a7627a2995b095249d6b0b6453b900cdd4bc");
assert.equal(provenance.release, "v1.53.2");
assert.equal(sha(pinned.LICENSE), provenance.licenseSha256);
for (const [key, entry] of Object.entries(provenance.files)) {
  const bytes = pinned[entry.local];
  assert.equal(bytes.length, entry.bytes, key);
  assert.equal(sha(bytes), entry.sha256, key);
  if (entry.declaration) {
    const text = bytes.toString("utf8");
    const start = text.indexOf(`export function ${entry.declaration}(`);
    const decl = text.slice(start, text.lastIndexOf("}") + 1);
    assert.equal(sha(decl), entry.declarationSha256, `${key} declaration`);
  }
}
ok("provenance.json", "bytes, sha256, declaration sha256 and license hash recomputed");

// 3. Build the annotation independently, by whole-line insertion, from the README's documented text.
const sum = pinned["sum.upstream.ts"].toString("utf8"), mean = pinned["mean.upstream.ts"].toString("utf8");
const insertBefore = (text, lineStart, lines) => {
  const all = text.split("\n");
  const at = all.findIndex((l) => l.startsWith(lineStart));
  assert.ok(at > 0 && all.findIndex((l, i) => i > at && l.startsWith(lineStart)) === -1, lineStart);
  return [...all.slice(0, at), ...lines, ...all.slice(at)].join("\n");
};
const SUM_LINES = ["// ensures nums.length !== 0 || Object.is(result, 0)"];
const LOOP_LINES = ["  // invariant i !== 0 || Object.is(result, 0)", "  // invariant Number.isInteger(i) && 0 <= i && i <= nums.length",
  "  // decreases real(nums.length) - real(i)"];
const MEAN_LINES = ["// ensures nums.length !== 0 || Number.isNaN(result)"];
const mine = {
  sum: insertBefore(insertBefore(sum, "export function sum(", SUM_LINES), "  for (let i = 0; i < nums.length; i++) {", LOOP_LINES),
  mean: insertBefore(mean, "export function mean(", MEAN_LINES),
};

// 4. The checker's annotation must be byte-identical to mine, with the reported hashes.
const check = await import(pathToFileURL(join(dir, "check.mjs")).href);
const theirs = check.annotatedSources({ sum, mean }, provenance);
assert.equal(theirs.sum, mine.sum);
assert.equal(theirs.mean, mine.mean);
assert.equal(sha(theirs.sum), "1533bbc2c48962471467f1e9f20f892f71b201983a656d050f19ada968c6de71");
assert.equal(Buffer.byteLength(theirs.sum), 739);
assert.equal(sha(theirs.mean), "aa4bf214a3b04c95172c5b8d220086ea9d34942ed41aedcde8f1f80e4ddae5b9");
assert.equal(Buffer.byteLength(theirs.mean), 524);
assert.equal(check.SUM_CONTRACT, SUM_LINES[0].slice(3));
assert.equal(check.MEAN_CONTRACT, MEAN_LINES[0].slice(3));
assert.deepEqual(check.SUM_LOOP, LOOP_LINES.map((l) => l.slice(5)));
ok("annotation", `checker output == independent line insertion; sum ${sha(theirs.sum)} 739 B, mean ${sha(theirs.mean)} 524 B`);

// 5. Deleting exactly the inserted lines recovers the pinned bytes.
const inserted = new Set([...SUM_LINES, ...LOOP_LINES, ...MEAN_LINES]);
for (const [name, original] of [["sum", sum], ["mean", mean]]) {
  const kept = theirs[name].split("\n").filter((l) => !inserted.has(l)).join("\n");
  assert.equal(kept, original, name);
  assert.equal(theirs[name].split("\n").length - original.split("\n").length, name === "sum" ? 4 : 1);
}
ok("line diff", "only the 4 (sum) and 1 (mean) inserted comment lines differ");

// 6. Same executable AST (positions removed) and the comment list grows only by the inserted line comments.
const strip = (node) => JSON.parse(JSON.stringify(node, (k, v) => (k === "start" || k === "end" || k === "loc" || k === "range" ? undefined : v)));
for (const [name, original] of [["sum", sum], ["mean", mean]]) {
  const parse = (text) => { const comments = []; const ast = acorn.parse(stripTypeScriptTypes(text), { ecmaVersion: "latest", sourceType: "module", onComment: comments }); return { ast: strip(ast), comments }; };
  const a = parse(original), b = parse(theirs[name]);
  assert.deepEqual(b.ast, a.ast, `${name} AST`);
  const extra = b.comments.filter((c) => !a.comments.some((d) => d.type === c.type && d.value === c.value));
  assert.equal(b.comments.length - a.comments.length, extra.length);
  assert.ok(extra.every((c) => c.type === "Line" && (inserted.has(`// ${c.value.trimStart()}`) || inserted.has(`  // ${c.value.trimStart()}`))), JSON.stringify(extra));
  assert.equal(extra.length, name === "sum" ? 4 : 1);
}
ok("AST", "type-stripped ESTree identical; extra comments are only the inserted Line comments");

// 7. The original import and the accumulator name are unchanged; both texts behave identically natively.
assert.ok(mean.startsWith("import { sum } from './sum.ts';\n") && theirs.mean.startsWith("import { sum } from './sum.ts';\n"));
assert.ok(theirs.sum.includes("\n  let result = 0;\n"));
const graph = (s, m) => (args) => runInNewContext(`${stripTypeScriptTypes(s).replace(/^export /gm, "")}\n${stripTypeScriptTypes(m).replace(/^import .*\n/, "").replace(/^export /gm, "")}\n;[sum(__a), mean(__a)]`, { __a: args }, { timeout: 1000 });
for (const arr of [[], [-0], [0], [1, 2, 3, 4], [-1, -2, -3, 4], [NaN], [Infinity, -Infinity], [0.1, 0.2], [1e308, 1e308]]) {
  const [s0, m0] = graph(sum, mean)(arr), [s1, m1] = graph(theirs.sum, theirs.mean)(arr);
  assert.ok(Object.is(s0, s1) && Object.is(m0, m1), JSON.stringify(arr));
}
const [emptySum, emptyMean] = graph(sum, mean)([]);
assert.ok(Object.is(emptySum, 0) && Number.isNaN(emptyMean));
ok("native", "import './sum.ts' and 'let result = 0;' kept; original and annotated agree on 9 arrays; sum([]) is +0, mean([]) is NaN");

console.log(out.join("\n"));
