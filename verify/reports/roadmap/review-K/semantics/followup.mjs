// Follow-up probes for admitted index forms and the witness-string check.
import { pathToFileURL } from "node:url";

const archive = process.env.K_ARCHIVE ?? "/tmp/k-sem-00e5fc4";
const root = pathToFileURL(`${archive}/`);
const { verify } = await import(new URL("verify/index.mjs", root));
const { compile, parse } = await import(new URL("verify/source.mjs", root));
const { obligation } = await import(new URL("verify/proofs.mjs", root));

const rows = [];
const note = (name, row) => { const out = { name, ...row }; rows.push(out); console.log(JSON.stringify(out)); };
const brief = (report) => report.outcomes.map((o) => ({ fn: o.fn, status: o.status, reason: o.reason, phase: o.phase, confirmed: o.confirmed, message: o.message }));

async function run(name, source, timeoutMs = 25_000) {
  const started = Date.now();
  const report = await verify(source, { file: `${name}.ts`, timeoutMs });
  const outcomes = brief(report);
  const verified = outcomes.some((o) => o.status === "verified");
  note(name, { ms: Date.now() - started, outcomes, verified });
}

const local = `// ensures result === 1
function f() {
  const xs = [0]; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && xs[0] === (i > 0 ? 1 : 0)
  // decreases real(1) - real(i)
  while (i < 1) { xs[0] = 1; i++; }
  return xs[0];
}`;
const target = compile([parse("inspect.ts", local)]).targets[0];
const feasibility = obligation(target, "feasibility", 0);
const post = obligation(target, "postcondition", 0);
const witnessPhase = obligation(target, "feasibility-witness", 0);
note("witness-placement", {
  smallWitness: target.smallWitness,
  pre: target.pre,
  equalBecauseBothTrue: target.smallWitness === "true" && target.pre === "true",
  feasibilityHasWitness: feasibility.assertions.includes(target.smallWitness),
  postHasDistinctWitness: post.assertions.some((a) => a === target.smallWitness && target.smallWitness !== "true"),
  witnessPhaseHasBound: witnessPhase.assertions.includes(target.smallWitness),
  replayGuardCount: target.replayGuards.length,
  guardInPost: target.replayGuards.some((g) => post.assertions.includes(g)),
});

await run("computed-nan-index", `// requires Number.isNaN(n)
// requires xs.length > 0 && xs[0] === 0
// modifies xs
// ensures xs[0] === 1
function f(xs:number[], n:number) { xs[n] = 1; return 0; }`);

await run("computed-fractional-index", `// requires n === 1.5
// requires xs.length > 1 && xs[1] === 0
// modifies xs
// ensures xs[1] === 1
function f(xs:number[], n:number) { xs[n] = 1; return 0; }`);

await run("index-side-effect-store", `// ensures result === 7
function f() { const xs = [0, 0]; let k = 0; xs[(k = 1, 0)] = 7; return xs[0]; }`);

await run("index-side-effect-later-read", `// ensures result === 0
function f() { const xs = [0, 0]; let k = 0; xs[(k = 1, 0)] = 7; return xs[k]; }`);

await run("admitted-short-circuit", `// ensures result === 0
function f(flag:boolean) {
  const xs = [0]; let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real(1) - real(i)
  while (i < 1) { flag && ((xs[0] = 1) > 0); i++; }
  return xs[0];
}`);

const failed = rows.filter((r) => r.verified);
note("summary", { failed: failed.map((r) => r.name), ok: failed.length === 0 });
process.exitCode = failed.length ? 1 : 0;
