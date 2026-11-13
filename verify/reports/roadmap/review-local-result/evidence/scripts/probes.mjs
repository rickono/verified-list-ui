// Adversarial namespace probes for body-local `result`, run against an archived head.
// Usage: node probes.mjs <archived-head-dir> <scratch-dir>
// kind "holds":  a true claim; verified outcomes are also sampled natively.
// kind "wrong":  a false claim a namespace leak would prove; it must be a confirmed
//                counterexample that native V8 reproduces, or a non-proof.
// kind "reject": a binding the verifier must refuse; acceptance is checked natively.
// unknown/unsupported is recorded as NON-PROOF, never as a pass or a false proof.
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";

const [head, scratch] = process.argv.slice(2);
const { verify, verifyFile } = await import(pathToFileURL(join(head, "verify/index.mjs")).href);
// Multi-file probes are verified from a temporary directory that is removed afterwards.
async function graph(files, entry) {
  await mkdir(join(scratch, "probes-tmp"), { recursive: true });
  const directory = realpathSync.native(await mkdtemp(join(scratch, "probes-tmp", "graph-")));
  try {
    for (const [name, text] of Object.entries(files)) await writeFile(join(directory, name), text);
    return await verifyFile(join(directory, entry), { timeoutMs: 60_000 });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const value = (t) => Array.isArray(t) ? t.map(value) : t === "true" ? true : t === "false" ? false : t === "undefined" ? undefined : Number(t);
function native(source, name, args) {
  const script = stripTypeScriptTypes(source).replace(/^export /gm, "");
  try { return { value: runInNewContext(`${script}\n;${name}(...__args)`, { __args: args }, { timeout: 1000 }) }; }
  catch (error) { return { threw: String(error) }; }
}
const X = [0, -0, 1, -1, 0.5, 2, 3, 1e308, -1e308, Infinity, -Infinity, NaN, 5e-324].map((x) => [x]);
const N = [0, 1, 2, 3, 7, 50, 99, 100].map((n) => [n]);
const BOUNDED = (n) => Number.isInteger(n) && 0 <= n && n <= 100;
const LOOP = "// requires Number.isInteger(n) && 0 <= n && n <= 100";
const APPLY = "/** @param {(y: number) => boolean} p */\n// ensures result === p(x)\nfunction apply(p, x: number) { return p(x); }\n";

const probes = [];
const pair = (id, fn, samples, body, right, wrong, pre = () => true) => {
  probes.push({ id: `${id}`, kind: "holds", fn, samples, pre, source: body(right[0]), claim: right[1] });
  probes.push({ id: `${id}-wrong`, kind: "wrong", fn, samples, pre, source: body(wrong[0]), claim: wrong[1] });
};

pair("early-return-block-shadow", "f", X, (e) => `// ensures ${e}
function f(x: number) {
  if (x > 0) { const result = x + 1; return result; }
  let result = -1;
  return result;
}`, ["x > 0 ? result === x + 1 : result === -1", (r, x) => x > 0 ? r === x + 1 : r === -1], ["result === -1", (r) => r === -1]);

pair("loop-body-block-shadow", "f", N, (e) => `${LOOP}
// ensures ${e}
function f(n: number) {
  let result = 0;
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && result === i
  // decreases real(n) - real(i)
  while (i < n) { { const result = 100; i = i + result - 100; } result = result + 1; i++; }
  return result;
}`, ["result === n", (r, n) => r === n], ["result === n + 1", (r, n) => r === n + 1], BOUNDED);

pair("caller-local-helper-call", "f", X, (e) => `// ensures Object.is(result, x)
function id(x: number) { const result = 0; return x; }
// ensures ${e}
function f(x: number) { const result = 0; return id(x); }`, ["Object.is(result, x)", (r, x) => Object.is(r, x)], ["Object.is(result, 0)", (r) => Object.is(r, 0)]);

pair("helper-local-summary-chain", "g", X, (e) => `// ensures Object.is(result, x + 1)
function inc(x: number) { let result = x; result = result + 1; return result; }
// ensures ${e}
function g(x: number) { const result = inc(x); return inc(result); }`, ["Object.is(result, (x + 1) + 1)", (r, x) => Object.is(r, (x + 1) + 1)], ["Object.is(result, x + 1)", (r, x) => Object.is(r, x + 1)]);

pair("var-in-block-read-after", "f", X, (e) => `// ensures ${e}
function f(x: number) { { var result = 3; } return result; }`, ["result === 3", (r) => r === 3], ["result === x", (r, x) => r === x]);

pair("typed-local", "f", X, (e) => `// ensures ${e}
function f(x: number) { let result: number = 0; return x; }`, ["Object.is(result, x)", (r, x) => Object.is(r, x)], ["Object.is(result, 0)", (r) => Object.is(r, 0)]);

// A leak would make the first claim false (local 0) and the second true (local x).
probes.push(
  { id: "old-with-local", kind: "holds", fn: "f", samples: X, claim: (r, x) => Object.is(r, x),
    source: "// ensures Object.is(result, old(x))\nfunction f(x: number) { let result = 0; return x; }" },
  { id: "old-with-local-wrong", kind: "wrong", fn: "f", samples: X, claim: (r, x) => Object.is(r, x),
    source: "// ensures Object.is(result, old(x))\nfunction f(x: number) { let result = x; return 0; }" },
);

pair("loop-early-return-inner-shadow", "f", N, (e) => `${LOOP}
// ensures ${e}
function f(n: number) {
  let result = 0;
  // invariant Number.isInteger(result) && 0 <= result && result <= n
  // decreases real(n) - real(result)
  while (result < n) { if (result === n - 1) { const result = n; return result; } result++; }
  return result;
}`, ["result === n", (r, n) => r === n], ["result === 0", (r) => r === 0], BOUNDED);

pair("multi-declarator", "f", X, (e) => `// ensures ${e}
function f(x: number) { let a = 1, result = a + x; return x; }`, ["Object.is(result, x)", (r, x) => Object.is(r, x)], ["Object.is(result, 1 + x)", (r, x) => Object.is(r, 1 + x)]);

pair("block-arrow-export", "f", X, (e) => `// ensures ${e}
export const f = (x: number) => { const result = 0; return x; };`, ["Object.is(result, x)", (r, x) => Object.is(r, x)], ["Object.is(result, 0)", (r) => Object.is(r, 0)]);

pair("function-expression-var", "f", X, (e) => `// ensures ${e}
export const f = function (x: number) { var result = 0; return x; };`, ["Object.is(result, x)", (r, x) => Object.is(r, x)], ["Object.is(result, 0)", (r) => Object.is(r, 0)]);

pair("closure-value-named-result", "f", X, (e) => `${APPLY}
// ensures ${e}
function f(x: number) {
  const result = (y: number): boolean => y === 0;
  return apply(result, x);
}`, ["result === (x === 0)", (r, x) => r === (x === 0)], ["result === (x === 1)", (r, x) => r === (x === 1)]);

pair("branch-return-other-expression", "f", X, (e) => `// ensures ${e}
function f(x: number) { let result = 5; if (x > 0) { return x; } result = 0; return result; }`,
["x > 0 ? Object.is(result, x) : Object.is(result, 0)", (r, x) => x > 0 ? Object.is(r, x) : Object.is(r, 0)],
["x > 0 ? result === 5 : Object.is(result, 0)", (r, x) => x > 0 ? r === 5 : Object.is(r, 0)]);


pair("dead-var-after-return", "f", X, (e) => `// ensures ${e}
function f(x: number) { return x; var result = 5; }`, ["Object.is(result, x)", (r, x) => Object.is(r, x)], ["result === undefined", (r) => r === undefined]);

const UNKNOWN = (name) => new RegExp(`Unknown (?:local binding|value) ${name}\\b`);
probes.push(
  { id: "other-local-in-ensures", kind: "reject", fn: "f", samples: X, message: UNKNOWN("y"), claim: () => true,
    source: "// ensures y === 1\nfunction f(x: number) { const y = 1; return x; }" },
  { id: "other-local-in-ensures-loop-path", kind: "reject", fn: "f", samples: N, pre: BOUNDED, message: UNKNOWN("y"), claim: (r, n) => r === n,
    source: `${LOOP}\n// ensures result === n && y === 1\nfunction f(n: number) {\n  const y = 1;\n  let i = 0;\n  // invariant Number.isInteger(i) && 0 <= i && i <= n\n  // decreases real(n) - real(i)\n  while (i < n) { i++; }\n  return i;\n}` },
  { id: "other-local-in-requires", kind: "reject", fn: "f", samples: X, message: UNKNOWN("y"), claim: () => true,
    source: "// requires y === 1\n// ensures true\nfunction f(x: number) { const y = 1; return true; }" },
  { id: "hoisted-var-read-before-declaration", kind: "reject", fn: "f", samples: X, message: /before its declaration/, claim: (r, x) => x > 0 ? r === 1 : r === 2,
    source: "// ensures x > 0 ? result === 1 : result === 2\nfunction f(x: number) { if (x > 0) { return result; } var result = 1; return 2; }" },
  { id: "tdz-read-from-nested-block", kind: "reject", fn: "f", samples: X, message: /before its declaration/, claim: (r) => r === 1,
    source: "// ensures result === 1\nfunction f(x: number) { { if (x > 0) { return result; } } let result = 1; return result; }" },
  { id: "loop-body-local-unavailable-to-invariant", kind: "reject", fn: "f", samples: N, pre: BOUNDED, message: UNKNOWN("result"), claim: (r, n) => r === n,
    source: `${LOOP}\n// ensures result === n\nfunction f(n: number) {\n  let i = 0;\n  // invariant Number.isInteger(i) && 0 <= i && i <= n && result === i\n  // decreases real(n) - real(i)\n  while (i < n) { const result = i; i++; }\n  return i;\n}` },
  { id: "callback-param-named-result", kind: "reject", fn: "f", samples: X, message: /Callback parameters need simple, nonreserved names/, claim: () => true,
    source: `${APPLY}// ensures true\nfunction f(x: number) { return apply((result: number): boolean => result === 0, x); }` },
  { id: "every-param-named-result-in-ensures", kind: "reject", fn: "f", samples: [[[]], [[1, 2]]], message: /nonreserved simple names; shadowing is unsupported/, claim: () => true,
    source: "// ensures nums.every((result) => result === result)\nfunction f(nums: readonly number[]) { return true; }" },
  { id: "every-param-named-result-in-invariant", kind: "reject", fn: "f", samples: [[[]], [[1, 2]]], message: /nonreserved simple names; shadowing is unsupported/, claim: () => true,
    source: "// ensures true\nfunction f(nums: readonly number[]) {\n  let result = 0;\n  // invariant Number.isInteger(i) && 0 <= i && i <= nums.length && nums.every((result) => result === result)\n  // decreases real(nums.length) - real(i)\n  for (let i = 0; i < nums.length; i++) { result = result + 1; }\n  return result;\n}" },
  { id: "destructured-local-named-result", kind: "reject", fn: "f", samples: [[[]], [[1, 2]]], message: /Local declarations need simple, nonreserved names/, claim: () => true,
    source: "// ensures true\nfunction f(nums: readonly number[]) { const [result] = nums; return true; }" },
  { id: "import-binding-named-result", kind: "reject", fn: "f", message: /Duplicate or reserved module binding result/, entry: "b.ts",
    files: { "a.ts": "// ensures Object.is(result, x)\nexport function g(x: number) { return x; }\n",
      "b.ts": "import { g as result } from './a.ts';\n// ensures true\nexport function f(x: number) { return result(x) === x; }\n" } },
);

const rows = [];
let falseProofs = 0;
for (const p of probes) {
  const started = Date.now();
  const report = p.files ? await graph(p.files, p.entry) : await verify(p.source, { timeoutMs: 60_000 });
  const ms = Date.now() - started;
  const o = report.outcomes.find((x) => x.fn === p.fn) ?? report.outcomes.find((x) => x.status !== "verified") ?? report.outcomes[0];
  const others = report.outcomes.filter((x) => x !== o).map((x) => `${x.fn}:${x.status}`).join(",");
  const pre = p.pre ?? (() => true);
  const violations = () => p.samples.filter((args) => pre(...args)).map((args) => [args, native(p.source, p.fn, args)])
    .filter(([args, n]) => n.threw || !p.claim(n.value, ...args));
  let verdict, detail = "";
  if (o.status === "verified" && p.files) { verdict = "UNEXPECTED-ACCEPT"; detail = "multi-file reject probe verified"; }
  else if (o.status === "verified") {
    const bad = violations();
    if (bad.length) { verdict = "FALSE-PROOF"; falseProofs++; detail = `native violates claim at ${JSON.stringify(bad[0][0])} -> ${JSON.stringify(bad[0][1])}`; }
    else if (p.kind === "holds") { verdict = "PASS"; detail = `native samples hold (${p.samples.filter((a) => pre(...a)).length})`; }
    else { verdict = p.kind === "reject" ? "UNEXPECTED-ACCEPT" : "UNSOUND?"; detail = "verified; no native sample violates the claim"; }
  } else if (o.status === "counterexample") {
    const args = Object.keys(o.inputs ?? {}).map((k) => value(o.inputs[k]));
    const n = native(p.source, p.fn, args);
    const reproduced = o.confirmed === true && !n.threw && Object.is(n.value, value(o.result)) && p.claim(n.value, ...args) === false;
    verdict = p.kind === "wrong" ? (reproduced ? "PASS" : "CEX-NOT-REPRODUCED") : (reproduced ? "PROBE-ERROR" : "FALSE-COUNTEREXAMPLE");
    detail = `inputs ${JSON.stringify(o.inputs)} reported ${o.result} native ${n.threw ?? String(n.value)} confirmed=${o.confirmed}`;
  } else if (["error", "unsupported"].includes(o.status)) {
    verdict = p.kind === "reject" ? (p.message.test(o.message) ? "PASS" : "REJECT-OTHER-GATE") : "NON-PROOF";
    detail = o.message;
  } else {
    verdict = "NON-PROOF";
    detail = `${o.reason ?? ""} ${o.phase ?? ""} ${o.message ?? ""}`.trim();
  }
  rows.push({ id: p.id, kind: p.kind, status: o.status, reason: o.reason, verdict, ms, others, detail });
  console.log(`${verdict.padEnd(20)} ${p.id.padEnd(42)} ${p.kind.padEnd(6)} ${String(o.status).padEnd(14)} ${String(ms).padStart(6)}ms ${others ? `[${others}] ` : ""}${detail}`);
}
const tally = rows.reduce((t, r) => ({ ...t, [r.verdict]: (t[r.verdict] ?? 0) + 1 }), {});
console.log(`probes=${rows.length} ${JSON.stringify(tally)} falseProofs=${falseProofs}`);
await rm(join(scratch, "probes-tmp"), { recursive: true, force: true });
process.exitCode = falseProofs ? 1 : 0;
