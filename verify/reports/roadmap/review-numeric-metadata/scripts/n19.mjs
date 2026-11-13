// Exact N19 store-domain query executed against the b00b08e archive.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const archive = process.argv[2] ?? "/tmp/nm-review-src";
const logPath = process.argv[3] ?? new URL("../logs/probes.jsonl", import.meta.url);
const base = pathToFileURL(archive.endsWith("/") ? archive : `${archive}/`);
const { verify } = await import(new URL("verify/index.mjs", base));
const { cases } = await import(new URL("tests/verify/fixtures/numeric-metadata-cases.mjs", base));
const c = cases.find((x) => x.id === "N19-store-wrap-2p32");
const fn = Function(`${stripTypeScriptTypes(c.source)}\nreturn f;`)();
const native = c.inputs.map((input) => {
  const args = structuredClone(input);
  const result = fn(...args);
  return { input, result, after: args, post: c.post(result, args, input) };
});
const report = await verify(c.source, { timeoutMs: 20000 });
const outcome = report.outcomes[0];
const row = { t: new Date().toISOString(), kind: "verify", id: c.id, expect: c.expect,
  status: outcome.status, confirmed: outcome.confirmed ?? null,
  failed: (outcome.failed ?? []).map((f) => f.kind), native,
  falseVerified: outcome.status === "verified" && native.some((n) => !n.post) };
appendFileSync(logPath, `${JSON.stringify(row)}\n`);
console.log(JSON.stringify(row));
