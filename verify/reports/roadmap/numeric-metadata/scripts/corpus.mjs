// Run through serial-verify.py. Arguments: output directory, optional id regexp.
// Every row retains the full native executions, verdict, and unprojected proof
// obligations. Unknown is evidence, never a proof or a successful negative test.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { cases } from "../../../../../tests/verify/fixtures/numeric-metadata-cases.mjs";

const [directory, filter, runtime] = process.argv.slice(2);
const base = runtime ? pathToFileURL(resolve(runtime) + "/") : new URL("../../../../", import.meta.url);
const { verify } = await import(new URL("index.mjs", base));
const { compile } = await import(new URL("source.mjs", base));
const { single } = await import(new URL("modules.mjs", base));
const { obligation } = await import(new URL("proofs.mjs", base));
const out = resolve(directory);
mkdirSync(out, { recursive: true });
const enc = (_k, v) => typeof v === "number" && (Object.is(v, -0) || !Number.isFinite(v))
  ? Object.is(v, -0) ? "-0" : String(v) : v === undefined ? "undefined" : v;
const json = (v) => JSON.stringify(v, enc);
writeFileSync(join(out, "corpus.jsonl"), "");
for (const c of cases) {
  if (filter && !new RegExp(filter).test(c.id)) continue;
  const file = `numeric/${c.id}.ts`;
  const native = [];
  const fn = Function(stripTypeScriptTypes(c.source) + "\nreturn f;")();
  for (const input of c.inputs) {
    const args = structuredClone(input), before = structuredClone(args);
    const result = fn(...args);
    native.push({ args: before, result, after: args, post: c.post(result, args, before) });
  }
  const { targets } = compile(single(file, c.source).records);
  const queries = targets.flatMap((t) => [obligation(t, "requires-definedness"), obligation(t, "feasibility"),
    ...t.postconditions.map((_, i) => obligation(t, "postcondition", i))]);
  writeFileSync(join(out, `${c.id}.queries.json.gz`), gzipSync(JSON.stringify(queries, null, 2) + "\n"));
  const report = await verify(c.source, { file, timeoutMs: c.timeoutMs });
  const outcome = report.outcomes.find((o) => o.fn === "f");
  const falseVerified = outcome.status === "verified" && native.some((n) => !n.post);
  const row = { id: c.id, expect: c.expect, source: c.source,
    sourceSha256: createHash("sha256").update(c.source).digest("hex"), native, falseVerified, outcome };
  appendFileSync(join(out, "corpus.jsonl"), json(row) + "\n");
  console.log(json({ id: c.id, expect: c.expect, status: outcome.status, confirmed: outcome.confirmed,
    reason: outcome.reason, falseVerified, nativeViolation: native.some((n) => !n.post) }));
  assert.equal(falseVerified, false, c.id);
  assert.ok(!["error", "unsupported"].includes(outcome.status), json(row));
}
