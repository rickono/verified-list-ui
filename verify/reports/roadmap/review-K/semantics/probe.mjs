// Independent Gate 3 semantics probe. Imports the archived tested tree only.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const archive = process.env.K_ARCHIVE ?? "/tmp/k-sem-00e5fc4";
const root = pathToFileURL(`${archive}/`);
const { verify } = await import(new URL("verify/index.mjs", root));
const { compile, parse } = await import(new URL("verify/source.mjs", root));
const { obligation } = await import(new URL("verify/proofs.mjs", root));
const { reverseCases, nativeSamples } = await import(new URL("verify/reports/roadmap/K-evidence/pilot/check.mjs", root));
const dataText = readFileSync(new URL("verify/data.mjs", root), "utf8");
const sourceText = readFileSync(new URL("verify/source.mjs", root), "utf8");

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pinBytes = readFileSync(new URL("verify/reports/roadmap/K-evidence/pilot/Reverse.upstream.js", root));
const pinMeta = JSON.parse(readFileSync(new URL("verify/reports/roadmap/K-evidence/pilot/provenance.json", root), "utf8"));
const license = readFileSync(new URL("verify/reports/roadmap/K-evidence/pilot/LICENSE", root));
const cases = reverseCases(pinBytes, pinMeta);
const samples = nativeSamples(cases[0].implementation);
const declared = cases[0].implementation;
const rows = [];
const note = (name, row) => {
  const out = { name, ...row };
  rows.push(out);
  console.log(JSON.stringify(out));
};

note("archive", {
  sourceSha256: hash(sourceText),
  dataSha256: hash(dataText),
  indexBitsExport: /^export\s+(?:async\s+)?(?:function|const|class|let|var)\s+indexBits\b/m.test(dataText),
  sourceMentionsIndexBits: sourceText.includes("indexBits"),
  storeUsesIndexCallback: sourceText.includes("data.index({ ...view, at:"),
  reverseSha256: hash(pinBytes),
  licenseSha256: hash(license),
  declarationSha256: hash(declared),
  nativeSamples: samples,
  licenseIsGpl3: license.includes("GNU GENERAL PUBLIC LICENSE") && license.includes("Version 3, 29 June 2007"),
  commit: pinMeta.commit,
});

function native(source, args) {
  const fn = Function(`${stripTypeScriptTypes(source, { mode: "strip" })}\nreturn f;`)();
  const copy = structuredClone(args);
  const result = fn(...copy);
  return { result, args: copy };
}

function brief(report) {
  return (report.outcomes ?? []).map((o) => ({
    fn: o.fn, status: o.status, reason: o.reason, phase: o.phase, confirmed: o.confirmed,
    message: o.message, failed: o.failed?.map((f) => f.kind ?? f.text ?? f).slice(0, 4),
  }));
}

async function run(name, source, { timeoutMs = 25_000, expect, nativeArgs, nativeCheck } = {}) {
  const started = Date.now();
  let report, error;
  try { report = await verify(source, { file: `${name}.ts`, timeoutMs }); }
  catch (e) { error = e instanceof Error ? e.message : String(e); }
  const outcomes = report ? brief(report) : [];
  const row = { ms: Date.now() - started, outcomes, error };
  if (nativeArgs) {
    try { row.native = native(source, nativeArgs); }
    catch (e) { row.nativeError = e instanceof Error ? e.message : String(e); }
  }
  if (nativeCheck) {
    try { row.native = nativeCheck(); }
    catch (e) { row.nativeError = e instanceof Error ? e.message : String(e); }
  }
  const bad = [];
  if (expect?.status && outcomes[0]?.status !== expect.status) bad.push(`status ${outcomes[0]?.status} !== ${expect.status}`);
  if (expect?.reason && outcomes.at(expect.at ?? 0)?.reason !== expect.reason) bad.push(`reason ${outcomes.at(expect.at ?? 0)?.reason}`);
  if (expect?.confirmed !== undefined && outcomes[0]?.confirmed !== expect.confirmed) bad.push("confirmed");
  if (expect?.notVerified && outcomes.some((o) => o.fn === (expect.fn ?? "f") && o.status === "verified")) bad.push("verified");
  if (expect?.allVerified && !outcomes.every((o) => o.status === "verified")) bad.push("not all verified");
  if (expect?.fnStatus) {
    const found = outcomes.find((o) => o.fn === expect.fnStatus.fn) ?? outcomes.at(expect.fnStatus.at ?? -1);
    if (found?.status !== expect.fnStatus.status || (expect.fnStatus.reason && found?.reason !== expect.fnStatus.reason)) bad.push(`fn ${found?.fn} ${found?.status}/${found?.reason}`);
  }
  row.verdict = bad.length ? "FAIL" : "ok";
  if (bad.length) row.bad = bad;
  note(name, row);
  return row;
}

function kinds(source) {
  const target = compile([parse("inspect.ts", source)]).targets[0];
  const text = target.declarations;
  const indexes = [...text.matchAll(/\(= i ([^)\n]+)\)/g)].map((m) => m[1]).slice(0, 8);
  const proof = [];
  for (const phase of ["feasibility", "postcondition"]) {
    for (let i = 0; i < target.postconditions.length; i++) {
      const q = obligation(target, phase, i);
      const guards = target.replayGuards.filter((g) => q.assertions.includes(g));
      proof.push({ phase, i, kind: target.obligations[i]?.kind, replayGuardsInProof: guards.length, witnessInProof: q.assertions.includes(target.smallWitness) });
    }
  }
  return {
    obligations: target.obligations.map((o) => o.kind),
    indexes,
    allocates: target.allocates,
    effects: target.effects,
    replayGuards: target.replayGuards.length,
    proof,
  };
}

const loop = (body, extra = "") => `// ensures result === 1
function f() {
  const xs = [0];
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && xs[0] === i
  // decreases real(1) - real(i)
  while (i < 1) { ${body} i++; }
  return xs[0];
  ${extra}
}`;

note("inspect-signed-index", kinds(`// requires xs.length > 0
// modifies xs
// ensures result === 7
function f(xs:number[]) { const j = xs.length - 1; xs[j] = 7; return xs[j]; }`));

note("inspect-wrapped-index", kinds(`// requires Number.isInteger(n) && n === 4294967296
// requires xs.length > 0 && xs[0] === 0
// modifies xs
// ensures xs[0] === 0
function f(xs:number[], n:number) { xs[n] = 1; return 0; }`));

note("inspect-compound", kinds(`// ensures result === 6
function f() { const xs = [1]; xs[0] += (xs[0] = 5); return xs[0]; }`));

note("inspect-witness", (() => {
  const info = kinds(`// ensures result === 1
function f() {
  const xs = [0];
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && xs[0] === (i > 0 ? 1 : 0)
  // decreases real(1) - real(i)
  while (i < 1) { xs[0] = 1; i++; }
  return xs[0];
}`);
  info.witnessClean = info.proof.every((p) => !p.witnessInProof && p.replayGuardsInProof === 0);
  return info;
})());

await run("literal-wrap", `// ensures result === 0
function f() { const xs = [0]; xs[4294967296] = 1; return xs[0]; }`, {
  expect: { status: "unsupported" },
  nativeCheck: () => {
    const xs = [0]; xs[4294967296] = 1; return { result: xs[0], named: Object.hasOwn(xs, "4294967296"), length: xs.length };
  },
});

await run("computed-wrap-not-element", `// requires Number.isInteger(n) && n === 4294967296
// requires xs.length > 0 && xs[0] === 0
// modifies xs
// ensures xs[0] === 1
function f(xs:number[], n:number) { xs[n] = 1; return 0; }`, {
  expect: { notVerified: true },
  nativeCheck: () => { const xs = [0]; xs[4294967296] = 1; return { element0: xs[0], named: xs[4294967296] }; },
});

await run("fractional-index", `// requires xs.length > 1 && xs[1] === 0
// modifies xs
// ensures xs[1] === 1
function f(xs:number[]) { xs[1.5] = 1; return 0; }`, {
  expect: { notVerified: true },
  nativeCheck: () => { const xs = [0, 0]; xs[1.5] = 1; return { element1: xs[1], named: xs[1.5] }; },
});

await run("nan-index", `// requires xs.length > 0 && xs[0] === 0
// modifies xs
// ensures xs[0] === 1
function f(xs:number[]) { xs[NaN] = 1; return 0; }`, {
  expect: { notVerified: true },
  nativeCheck: () => { const xs = [0]; xs[NaN] = 1; return { element0: xs[0], named: xs.NaN }; },
});

await run("undefined-index", `// ensures result === 0
function f() { const xs = [0]; xs[undefined] = 1; return xs[0]; }`, {
  expect: { status: "unsupported" },
});

await run("negative-zero-index", `// ensures result === 7
function f() { const xs = [0]; xs[-0] = 7; return xs[0]; }`, {
  expect: { allVerified: true },
  nativeCheck: () => { const xs = [0]; xs[-0] = 7; return xs[0]; },
});

await run("read-negative-zero-index", `// ensures result === 7
function f() { const xs = [0]; xs[0] = 7; return xs[-0]; }`, {
  expect: { allVerified: true },
  nativeCheck: () => { const xs = [0]; xs[0] = 7; return xs[-0]; },
});

await run("compound-before-rhs", `// ensures result === 6
function f() { const xs = [1]; xs[0] += (xs[0] = 5); return xs[0]; }`, {
  expect: { allVerified: true },
  nativeCheck: () => { const xs = [1]; xs[0] += (xs[0] = 5); return xs[0]; },
});

await run("owner-before-index", `// ensures result === 1
function f() { const a = [0]; const b = [9]; let p = a; p[(p = b, 0)] = 1; return a[0]; }`, {
  expect: { allVerified: true },
  nativeCheck: () => { const a = [0]; const b = [9]; let p = a; p[(p = b, 0)] = 1; return { a: a[0], b: b[0] }; },
});

await run("owner-index-other-array", `// ensures result === 9
function f() { const a = [0]; const b = [9]; let p = a; p[(p = b, 0)] = 1; return b[0]; }`, {
  expect: { allVerified: true },
});

await run("increment-captures-current", loop("xs[0]++;"), { expect: { allVerified: true }, nativeCheck: () => { const xs = [0]; xs[0]++; return xs[0]; } });

await run("alias-fresh-array", `// ensures result === 1
function f() {
  const xs = [0]; const alias = xs; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && alias[0] === i
  // decreases real(1) - real(i)
  while (i < 1) { xs[0] = 1; i++; }
  return alias[0];
}`, { expect: { allVerified: true } });

await run("fresh-boolean", `// ensures result === true
function f() {
  const xs = [false]; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && xs[0] === (i > 0)
  // decreases real(1) - real(i)
  while (i < 1) { xs[0] = true; i++; }
  return xs[0];
}`, { expect: { allVerified: true } });

await run("fresh-record", `// ensures result === 1
function f() {
  const box = { x: 0 }; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && box.x === i
  // decreases real(1) - real(i)
  while (i < 1) { box.x = 1; i++; }
  return box.x;
}`, { expect: { allVerified: true } });

await run("early-return-frame", `// ensures true
function f(a:{x:number}) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1) - real(i)
  while (i < 1) { a.x = 1; return true; }
  return true;
}`, { expect: { status: "counterexample", reason: "frame-write", confirmed: true } });

await run("helper-requires-not-self-proved", `// requires a.x === 1
// modifies a.x
// ensures a.x === 1 && result === true
function poke(a:{x:number}) { a.x = 1; return true; }
// ensures true
function f() {
  const a = { x: 0 }; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && a.x === 0
  // decreases real(1) - real(i)
  while (i < 1) { poke(a); i++; }
  return true;
}`, { expect: { fnStatus: { fn: "f", status: "counterexample" } } });

await run("invariant-init-preloop", `// ensures result === 1
function f() {
  const xs = [0]; xs[0] = 1; let i = 0;
  // invariant xs[0] === 0
  // decreases real(1) - real(i)
  while (i < 1) { i++; }
  return xs[0];
}`, { expect: { notVerified: true }, nativeCheck: () => { const xs = [0]; xs[0] = 1; return xs[0]; } });

await run("invariant-init-sees-write", `// ensures result === 1
function f() {
  const xs = [0]; xs[0] = 1; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && xs[0] === 1
  // decreases real(1) - real(i)
  while (i < 1) { i++; }
  return xs[0];
}`, { expect: { allVerified: true } });

await run("old-is-function-entry", `// requires xs.length > 0
// modifies xs
// ensures Object.is(xs[0], old(xs.slice())[0])
function f(xs:number[]) {
  xs[0] = 1; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && xs[0] === 1
  // decreases real(1) - real(i)
  while (i < 1) { i++; }
  return 0;
}`, { expect: { notVerified: true }, nativeCheck: () => { const xs = [0]; const old = xs.slice(); xs[0] = 1; return Object.is(xs[0], old[0]); } });

await run("signed-last-index", `// requires xs.length > 0
// modifies xs
// ensures result === 7
function f(xs:number[]) { const j = xs.length - 1; xs[j] = 7; return xs[j]; }`, {
  expect: { allVerified: true },
  nativeCheck: () => { const xs = [1, 2, 3]; const j = xs.length - 1; xs[j] = 7; return xs[j]; },
});

await run("signed-negative-index", `// requires xs.length > 0 && xs[0] === 0
// modifies xs
// ensures xs[0] === 1
function f(xs:number[]) { const j = (xs.length - 1) - (xs.length - 1) - 1; xs[j] = 1; return xs[0]; }`, {
  expect: { notVerified: true },
  nativeCheck: () => { const xs = [0, 1]; const j = (xs.length - 1) - (xs.length - 1) - 1; xs[j] = 1; return { j, element0: xs[0] }; },
});

await run("short-circuit-write", `// ensures result === 0
function f(flag:boolean) {
  const xs = [0]; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1) - real(i)
  while (i < 1) { flag && (xs[0] = 1); i++; }
  return xs[0];
}`, { expect: { notVerified: true }, nativeCheck: () => { const xs = [0]; true && (xs[0] = 1); return xs[0]; } });

await run("ternary-write", `// ensures result === 0
function f(flag:boolean) {
  const xs = [0, 0]; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1) - real(i)
  while (i < 1) { flag ? xs[0] = 1 : xs[1] = 1; i++; }
  return xs[0];
}`, { expect: { notVerified: true } });

await run("continue-update", `// ensures result === 1
function f() {
  const xs = [0];
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && xs[0] === i
  // decreases real(1) - real(i)
  for (let i = 0; i < 1; (xs[0] = 1, i++)) { continue; }
  return xs[0];
}`, { expect: { allVerified: true } });

await run("sequential-loops", `// ensures result === 1
function f() {
  const xs = [0]; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && xs[0] === i
  // decreases real(1) - real(i)
  while (i < 1) { xs[0] = 1; i++; }
  let j = 0;
  // invariant Number.isInteger(j) && 0 <= j && j <= 1 && xs[0] === 1
  // decreases real(1) - real(j)
  while (j < 1) { j++; }
  return xs[0];
}`, { expect: { allVerified: true } });

await run("dependency-gate", `// ensures a.x === 1
function poke(a:{x:number}) { a.x = 1; return true; }
// modifies a.x
// ensures true
function f(a:{x:number}) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1) - real(i)
  while (i < 1) { poke(a); i++; }
  return true;
}`, {
  expect: { fnStatus: { fn: "f", status: "unknown", reason: "dependency-violation" } },
});

await run("transitive-allocating-helper", `// ensures result === 1
function leaf() { const box = { x: 1 }; return box.x; }
// ensures result === 1
function mid() { return leaf(); }
// ensures true
function f() {
  let i = 0;
  // invariant i === 0
  // decreases 1
  while (i === 0) { mid(); break; }
  return true;
}`, { expect: { fnStatus: { fn: "f", status: "unsupported" } } });

await run("requires-rejects-store", `// requires (xs[0] = 1) === 1
// ensures true
function f(xs:number[]) { return true; }`, { expect: { status: "unsupported" } });

const over = cases.find((c) => c.name === "over-swap-mutant");
await run("over-swap-pilot", over.source, {
  timeoutMs: 60_000,
  expect: { status: "counterexample", reason: "store-domain", confirmed: true },
  nativeCheck: () => {
    const input = [];
    const before = [...input];
    const out = Function(`${over.implementation}\nreturn Reverse;`)()(input);
    return { sameObject: out === input, length: input.length, changed: input.length !== before.length };
  },
});

const failed = rows.filter((r) => r.verdict === "FAIL");
note("summary", { cases: rows.length, failed: failed.map((r) => r.name), ok: failed.length === 0 });
process.exitCode = failed.length ? 1 : 0;
