// Symbolic validity queries against the original FP terms, not native samples.
// Run through serial-verify.py. Unknown remains unknown and is printed verbatim.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBackend } from "../../../../backend.mjs";
import { and, binary, index, input, literal, merge, natural, unary } from "../../../../data.mjs";

const fp = (s) => `((_ to_fp_unsigned 11 53) RNE ${s})`;
function denotes(v) {
  const s = v.int ?? v.halves;
  assert.ok(s, "Expected a derived shadow, not an FP-only test");
  const difference = `(fp.sub RNE ${fp(s.pos)} ${fp(s.neg)})`;
  const numeric = v.int ? difference : `(fp.div RNE ${difference} ${literal(2).smt})`;
  return and(`(not (fp.isNaN ${v.smt}))`, `(not (fp.isInfinite ${v.smt}))`, `(fp.eq ${v.smt} ${numeric})`);
}

export function obligations(width) {
  const a = natural("a", false, width), b = natural("b", false, width);
  const xs = input({ kind: "array", element: "number" }, "xs");
  const declarations = [...a.declarations, ...b.declarations, ...xs.declarations, "(declare-const choose Bool)"].join("\n");
  const d = binary("-", a.value, b.value), sum = binary("+", d, b.value);
  const h = binary("/", d, literal(2)), plus = binary("+", h, literal(1));
  const selected = merge("choose", plus, unary("-", h));
  const valid = and(`(fp.geq ${d.smt} ${literal(0).smt})`, `(fp.lt ${d.smt} ${xs.value.length.smt})`,
    `(fp.eq (fp.roundToIntegral RTZ ${d.smt}) ${d.smt})`);
  const relation = (op, smt, x, y) => `(= ${binary(op, x, y).smt} (${smt} ${x.smt} ${y.smt}))`;
  return [
    ["signed-sub", denotes(d)], ["signed-add", denotes(sum)],
    ["signed-order", relation("<", "fp.lt", d, a.value)],
    ["signed-equality", relation("===", "fp.eq", sum, a.value)],
    ["half", denotes(h)], ["half-plus", denotes(plus)],
    ["half-order", relation("<=", "fp.leq", h, d)],
    ["half-equality", relation("===", "fp.eq", plus, h)],
    ["half-merge-negation", denotes(selected)],
    ["index-range", `(= ${index(xs.value, d).present} ${valid})`],
    ["index-bits", `(=> ${valid} (= ${d.int.low} ((_ fp.to_ubv 32) RTZ ${d.smt})))`],
  ].map(([id, fact]) => ({ id: `${id}-w${width}`, width, declarations,
    assertions: [`(not ${fact})`], models: [] }));
}

export async function checkValidity(queries, timeoutMs, directory) {
  const results = [];
  const backend = createBackend();
  try {
    await backend.start(timeoutMs);
    for (const query of queries) {
      if (directory) {
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, `${query.id}.smt2`), `${query.declarations}\n${query.assertions.map((a) => `(assert ${a})`).join("\n")}\n(check-sat)\n`);
      }
      let result;
      try { result = await backend.check(query, timeoutMs); }
      catch (e) {
        if (e.reason !== "worker-timeout") throw e;
        result = { status: "unknown", reason: e.reason, message: e.message };
        results.push({ id: query.id, width: query.width, ...result });
        if (directory) console.log(JSON.stringify(results.at(-1)));
        // No retry or alternate formula after a wall-clock timeout.
        break;
      }
      results.push({ id: query.id, width: query.width, ...result });
      if (directory) console.log(JSON.stringify(results.at(-1)));
      assert.notEqual(result.status, "sat", `${query.id}: invalid shadow shortcut`);
    }
  } finally { await backend.close(); }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [directory] = process.argv.slice(2);
  for (const width of [2, 32, 50, 51]) {
    const queries = obligations(width);
    const selected = width === 51 ? queries.filter((q) => !/order|equality|index/.test(q.id)) : queries;
    const results = await checkValidity(selected, 5_000, directory);
    for (const query of selected.slice(results.length)) console.log(JSON.stringify({ id: query.id, width,
      status: "not-run", reason: "earlier worker wall-clock timeout in this group" }));
  }
}
