// Independent review checks for the pinned numerical campaign.
// No solver. CPU-heavy work is one hard-killed native call.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Parser, tokenizer } from "acorn";
import { compile, parse } from "../../../../source.mjs";
import { load } from "../../../../modules.mjs";
import { SourceError } from "../../../../error.mjs";
import { runningIdentity } from "../../../../manifest.mjs";
import { reproduce } from "../../../../index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const review = dirname(here);
const root = join(review, "../../../..");
const pkg = join(root, "verify/reports/roadmap/library-campaigns");
const out = join(review, "logs");
mkdirSync(out, { recursive: true });
const sha = (data) => createHash("sha256").update(data).digest("hex");
const read = (file) => readFileSync(file, "utf8");
const bits = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
const fromBits = (s) => Buffer.from(s, "hex").readDoubleBE(0);
const git = (...args) => {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
};
const save = (name, value) => { writeFileSync(join(out, name), JSON.stringify(value, null, 2) + "\n"); return value; };
const result = { classificationNotes: [], commands: [] };

function note(id, value) { result[id] = value; }

const EXPECTED = "13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106";
const GRAPH = "48f186e1e6a863fc581597ff8f49aba20831ad1e474567773caa457170c70469";
const PARENT = "203ad818169be544432b3bad93ff1c4f01ef20a3";
const TESTED = "42567fc7b286e2a8e838279396fcb444e1118253";
const TIP = "7e6d9b56c36e89dac9d9b7943771feb8af4dd0ab";

note("checkout", {
  head: git("rev-parse", "HEAD"),
  branch: git("branch", "--show-current"),
  baselineAncestor: (git("merge-base", "--is-ancestor", "32bd5b260aa116ca88642a1479bed8d3fc447f4b", "HEAD"), true),
  verifyExists: existsSync(join(root, "verify")),
  packageBlobEqualToTip: git("diff", "--stat", TIP, "HEAD", "--", "verify/reports/roadmap/library-campaigns") === "",
});

const identity = runningIdentity();
note("modelIdentity", {
  sha256: identity.sha256 ?? null,
  disabled: identity.disabled ?? null,
  matchesRecorded: identity.sha256 === EXPECTED,
  runtime: identity.runtime,
  origin: "new run of runningIdentity(); no solver",
});

const harmonicDir = join(root, "verify/examples/simple-statistics");
const original = read(join(harmonicDir, "harmonic_mean.js"));
const total = read(join(harmonicDir, "harmonic-total.js"));
const positive = read(join(harmonicDir, "harmonic-positive.js"));
const weak = read(join(harmonicDir, "harmonic-weak.js"));
const strip = (s) => s.split("\n").filter((l) => !/^\s*\/\/ (requires|ensures|invariant|decreases) /.test(l)).join("\n");
const tokens = (s) => [...tokenizer(s, { ecmaVersion: 2022, sourceType: "module" })].map((t) => s.slice(t.start, t.end));
const compiled = {};
for (const [name, source] of [["total", total], ["positive", positive], ["weak", weak]]) {
  const [t] = compile([parse(join(harmonicDir, `harmonic-${name}.js`), source)]).targets;
  compiled[name] = {
    obligationKinds: t.obligations.map((o) => o.kind),
    requires: t.requires.map((c) => c.text),
    ensures: t.ensures.map((c) => c.text),
    pre: t.pre,
    throwSpans: t.obligations.filter((o) => o.kind === "throw-unreachable").map((o) => o.span),
  };
}
note("harmonicContracts", {
  origin: "new compile of current sources; no solver",
  stripEqualsOriginal: [total, positive, weak].every((s) => strip(s) === original),
  tokensEqual: [total, positive, weak].every((s) => JSON.stringify(tokens(s)) === JSON.stringify(tokens(original))),
  positiveIsTotalWithEnsures: total.replace("// ensures true", "// ensures result > 0") === positive,
  weakDropsOnlyReciprocalInvariant: weak === positive.split("\n").filter((l) => !(l.includes("// invariant") && l.includes("reciprocalSum"))).join("\n"),
  preEqual: compiled.total.pre === compiled.positive.pre && compiled.total.pre === compiled.weak.pre,
  preHasReciprocalFiniteness: /fp\.div/.test(compiled.total.pre),
  kinds: compiled,
  sourceSha256: sha(original),
  licenseSha256: sha(readFileSync(join(harmonicDir, "LICENSE"))),
});

const { default: mean } = await import(pathToFileURL(join(harmonicDir, "harmonic_mean.js")).href);
const nativeRows = [Number.MIN_VALUE, 2 ** -1024, 2 ** -1022, 49].map((x) => ({
  inputBits: bits(x), reciprocal: String(1 / x), resultBits: bits(mean([x])),
}));
note("harmonicNative", {
  origin: "new native import of unchanged harmonic_mean.js",
  rows: nativeRows,
  minValueIsPlusZero: nativeRows[0].resultBits === "0000000000000000" && nativeRows[0].reciprocal === "Infinity",
  subnormal1024IsPlusZero: nativeRows[1].resultBits === "0000000000000000" && nativeRows[1].reciprocal === "Infinity",
  smallestNormalRoundTrip: nativeRows[2].resultBits === nativeRows[2].inputBits,
  fortyNineUlp: (BigInt(`0x${nativeRows[3].resultBits}`) - BigInt(`0x${nativeRows[3].inputBits}`)).toString(),
  documented: mean([2, 3]).toFixed(2),
});

if (identity.sha256 === EXPECTED) {
  const evidence = JSON.parse(read(join(pkg, "evidence/03-final/harmonic/positive.evidence.json")));
  const entry = join(harmonicDir, "harmonic-positive.js");
  const replay = reproduce(entry, evidence);
  const scratch = join(out, "stale-positive.js");
  writeFileSync(scratch, positive + "\n// review stale-source control\n");
  const staleSource = reproduce(scratch, evidence);
  const staleModel = reproduce(entry, { ...evidence, identity: "0".repeat(64) });
  const warm = JSON.parse(read(join(pkg, "evidence/03-final/harmonic/total.warm.json")));
  note("harmonicReplay", {
    freshReproduce: { origin: "new reproduce() call; reproduce does not call solve", status: replay.status, result: replay.outcomes?.[0]?.result, confirmed: replay.outcomes?.[0]?.confirmed, graphSha256: replay.graphSha256 },
    staleSource: { origin: "new run", status: staleSource.status, graphSha256: staleSource.graphSha256 },
    staleModel: { origin: "new run", status: staleModel.status, message: staleModel.message },
    warmReceipt: { origin: "inherited log, not re-executed", status: warm.outcomes[0].status, solved: warm.cache.solved, hits: warm.cache.hits.length, identity: warm.cache.identity },
    recordedGraph: GRAPH,
  });
} else {
  note("harmonicReplay", { skipped: "model identity did not match; no reproduce call" });
}

const upstream = readFileSync(join(root, "verify/examples/ramda/findIndex.upstream.js"));
const provenance = JSON.parse(read(join(root, "verify/examples/ramda/provenance.json")));
const parsed = Parser.parse(upstream.toString(), { ecmaVersion: 2022, sourceType: "module" });
const found = [];
const walk = (node) => {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionExpression" && node.id?.name === "findIndex") found.push(node);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") walk(value);
};
walk(parsed);
const implementation = upstream.toString().slice(found[0].start, found[0].end);
const ramdaReport = JSON.parse(read(join(pkg, "evidence/03-final/ramda/upstream.report.json")));
const ramdaJson = JSON.parse(read(join(pkg, "evidence/03-final/ramda.json")));
note("ramda", {
  origin: "new source extraction; solver receipt inherited",
  fileSha256: sha(upstream),
  fileShaMatchesPin: sha(upstream) === provenance.sha256,
  declarationBytes: Buffer.byteLength(implementation),
  declarationSha256: sha(implementation),
  declarationShaMatchesPin: sha(implementation) === provenance.declarationSha256,
  commitNamedByPin: provenance.commit,
  commitObjectPresent: spawnSync("git", ["cat-file", "-t", provenance.commit], { cwd: root }).status === 0,
  licenseSha256: sha(readFileSync(join(root, "verify/examples/ramda/LICENSE.txt"))),
  licenseShaMatchesPin: sha(readFileSync(join(root, "verify/examples/ramda/LICENSE.txt"))) === provenance.licenseSha256,
  licenseHead: read(join(root, "verify/examples/ramda/LICENSE.txt")).slice(0, 40),
  upstreamStatus: ramdaReport.outcomes[0].status,
  callbackDomain: ramdaReport.outcomes[0].assumptions[0].domain,
  arrayDomain: ramdaReport.outcomes[0].assumptions[1].domain,
  ensures: ramdaReport.outcomes[0].assumptions.length,
  mutantStatuses: ramdaJson.checks.filter((c) => c.name !== "upstream").map((c) => ({
    name: c.name, status: c.outcomes[0].status, confirmed: c.outcomes[0].confirmed, result: c.outcomes[0].result,
    nativeInputs: c.outcomes[0].inputs,
  })),
  countedAsRealBugsInManifest: false,
});

const inherited = "a83f50762005ae47edfe3e07295f3840b485687b";
const pin = "24c015e4d894ee44af6cf6a2cc9e300b1885b0d9";
const d3 = {};
for (const name of ["nice.js", "ticks.js"]) {
  const local = readFileSync(join(pkg, "pins/d3-array", name));
  const old = spawnSync("git", ["show", `${inherited}:verify/reports/roadmap/upstream-validation/sources/d3-array/${pin}/src/${name}`], { cwd: root });
  d3[name] = { local: sha(local), inherited: sha(old.stdout), equal: sha(local) === sha(old.stdout) && Buffer.compare(local, old.stdout) === 0 };
}
const license = readFileSync(join(pkg, "pins/d3-array/LICENSE"));
const oldLicense = spawnSync("git", ["show", `${inherited}:verify/reports/roadmap/upstream-validation/sources/d3-array/${pin}/LICENSE`], { cwd: root });
const docs = spawnSync("git", ["show", `${inherited}:verify/reports/roadmap/upstream-validation/sources/d3-docs/ticks.md`], { cwd: root });
const ticks = read(join(pkg, "pins/d3-array/ticks.js"));
note("d3Bytes", {
  origin: "new git show of a83f507 objects versus pin bytes",
  sources: d3,
  licenseEqual: Buffer.compare(license, oldLicense.stdout) === 0,
  licenseSha256: sha(license),
  docsSha256: sha(docs.stdout),
  docsQuotePresent: docs.stdout.toString().includes("covering the given interval"),
  ticksPrefix: JSON.stringify(ticks.slice(0, 73)),
  ticksPrefixLength: ticks.slice(0, 73).length,
});

const loaded = load(join(pkg, "pins/d3-array/nice.js"));
const admissionError = loaded.error;
let admission;
if (admissionError) {
  admission = {
    during: "load",
    name: admissionError.name,
    status: admissionError.status,
    message: admissionError.message,
    file: admissionError.file,
    span: admissionError.span,
    line: admissionError.file ? read(admissionError.file).slice(0, admissionError.span.start).split("\n").length : null,
    solverInvoked: false,
    compileCalled: false,
  };
} else {
  try {
    compile(loaded.records);
    admission = { threw: false, compileCalled: true, solverInvoked: false };
  } catch (e) {
    admission = { during: "compile", name: e.name, status: e.status, message: e.message, file: e.file, span: e.span, solverInvoked: false, compileCalled: true };
  }
}
note("d3Admission", { origin: "new module load; solve() not called. A top-level rejection is returned by load before compile.", ...admission });

const { default: nice } = await import(pathToFileURL(join(pkg, "pins/d3-array/nice.js")).href);
const { tickIncrement } = await import(pathToFileURL(join(pkg, "pins/d3-array/ticks.js")).href);
const finite = [];
for (const count of [1, 5000]) {
  const start = 0.9299999999999999, stop = 0.93;
  const resultRow = nice(start, stop, count);
  finite.push({ id: `coverage-${count}`, result: resultRow.map(bits), covers: resultRow[0] <= start && stop <= resultRow[1], incrementBits: bits(tickIncrement(start, stop, count)) });
}
const example = nice(1, 9, 5);
const fixedStart = 0.9299999999999999, fixedStop = 1.07;
const fixed = nice(fixedStart, fixedStop, 5000);
note("d3Finite", {
  origin: "new native import of pinned unchanged modules",
  coverage: finite,
  documented: example.map(bits),
  documentedEquals0and10: example[0] === 0 && example[1] === 10,
  fixedIssue282Covers: fixed[0] <= fixedStart && fixedStop <= fixed[1],
});

const cycles = { cycle5: ["3fbcc42ba089e7d0", "3fbcc42ba089e7d1", 5] };
const [a, b, count] = cycles.cycle5;
const hang = spawnSync(process.execPath, [join(here, "hang-nice.mjs"), a, b, String(count)], {
  cwd: root, encoding: "utf8", timeout: 800, killSignal: "SIGKILL",
});
let alive = false;
if (hang.pid) { try { process.kill(hang.pid, 0); alive = true; } catch (e) { if (e.code !== "ESRCH") throw e; } }
writeFileSync(join(out, "hang-nice-rerun.stdout.txt"), hang.stdout ?? "");
writeFileSync(join(out, "hang-nice-rerun.stderr.txt"), hang.stderr ?? "");
note("hangPathAttempt1", {
  origin: "retained failed reviewer command; unchanged",
  error: "ERR_MODULE_NOT_FOUND for verify/reports/library-campaigns/pins/d3-array/nice.js",
  logs: ["hang-nice-attempt1.stdout.txt", "hang-nice-attempt1.stderr.txt", "hang-nice.stderr.txt"],
  effect: "The first relative path never called nice. It is not evidence about termination.",
});
note("d3Timeout", {
  origin: "new run of unchanged nice.js; hard 800 ms SIGKILL; not a solver and not a nontermination proof",
  classification: "unknown",
  argv: [process.execPath, "scripts/hang-nice.mjs", a, b, String(count)],
  timeoutMs: 800,
  status: hang.status,
  signal: hang.signal,
  error: hang.error && { code: hang.error.code, message: hang.error.message },
  aliveAfterWait: alive,
  stdout: hang.stdout,
});
result.commands.push("node scripts/hang-nice.mjs 3fbcc42ba089e7d0 3fbcc42ba089e7d1 5 with spawnSync timeout 800 SIGKILL");

function transition(start, stop, n, prestep) {
  const step1 = tickIncrement(start, stop, n);
  const step2 = tickIncrement(start, stop, n);
  const returns = step1 === prestep || step1 === 0 || !isFinite(step1);
  let nextStart = start, nextStop = stop, nextPre = prestep;
  if (!returns && step1 > 0) {
    const i = Math.ceil(start / step1), j = Math.floor(stop / step1);
    nextStart = (i - (i * step1 > start)) * step1;
    nextStop = (j + (j * step1 < stop)) * step1;
    nextPre = step1;
  } else if (!returns && step1 < 0) {
    const s = -step1, i = Math.ceil(start * s), j = Math.floor(stop * s);
    nextStart = (i - (i / s > start)) / s;
    nextStop = (j + (j / s < stop)) / s;
    nextPre = step1;
  }
  return { stepBits: bits(step1), pureRepeat: Object.is(step1, step2), returns, nextStartBits: bits(nextStart), nextStopBits: bits(nextStop), nextPreBits: nextPre === undefined ? "undefined" : bits(nextPre) };
}
const states = [];
{
  let start = fromBits(a), stop = fromBits(b), prestep;
  const seen = new Map();
  for (let i = 1; i <= 8; i++) {
    const key = JSON.stringify([bits(start), bits(stop), count, prestep === undefined ? "undefined" : bits(prestep)]);
    const row = { iteration: i, ...transition(start, stop, count, prestep), repeated: seen.has(key) ? seen.get(key) : null };
    states.push(row);
    if (seen.has(key)) break;
    seen.set(key, i);
    if (row.returns) break;
    start = fromBits(row.nextStartBits); stop = fromBits(row.nextStopBits); prestep = fromBits(row.nextPreBits);
  }
}
note("d3Diagnostic", {
  origin: "new pure-state walk using pinned tickIncrement and the original loop formulas; conditional on deterministic pure builtins",
  classification: "finite control plus conditional mathematical argument; not an unchanged-source solver theorem",
  states,
  tickIncrementName: tickIncrement.name,
  period: states.at(-1)?.repeated ? states.length - states.at(-1).repeated : null,
});

const inputs = JSON.parse(read(join(pkg, "inputs.json")));
const driftDir = join(review, ".tmp-drift");
rmSync(driftDir, { recursive: true, force: true });
const copiedPkg = join(driftDir, "verify/reports/roadmap/library-campaigns");
for (const file of Object.keys(inputs.files)) {
  mkdirSync(dirname(join(driftDir, file)), { recursive: true });
  cpSync(join(root, file), join(driftDir, file));
}
cpSync(join(pkg, "inputs.json"), join(copiedPkg, "inputs.json"));
const mutated = join(copiedPkg, "pins/d3-array/nice.js");
writeFileSync(mutated, readFileSync(mutated, "utf8") + "\n// review byte drift\n");
const driftOut = join(driftDir, "output");
const drift = spawnSync(process.execPath, [join(copiedPkg, "check.mjs"), driftOut], { cwd: driftDir, encoding: "utf8" });
writeFileSync(join(out, "drift.stdout.txt"), drift.stdout ?? "");
writeFileSync(join(out, "drift.stderr.txt"), drift.stderr ?? "");
note("drift", {
  origin: "new run of copied check.mjs on one mutated pin; hash gate only",
  exitCode: drift.status,
  stderrHasDrift: (drift.stderr ?? "").includes("Source/provenance drift: verify/reports/roadmap/library-campaigns/pins/d3-array/nice.js"),
  sawLaneWait: (drift.stdout ?? "").includes("Waiting for the shared solver") || (drift.stderr ?? "").includes("Waiting for the shared solver"),
  outputDirCreatedBeforeRefusal: existsSync(driftOut),
  signal: drift.signal,
});
result.commands.push("node <scratch>/check.mjs <scratch>/output after appending one comment to copied nice.js");
rmSync(driftDir, { recursive: true, force: true });
note("driftScratchRemoved", !existsSync(driftDir));

const lane = spawnSync("python3", ["-c", `
import fcntl
from pathlib import Path
p=Path("/Users/rick/verification-vibes/artifacts/ready-now/solver-suite.lock")
f=open(p,"a")
try:
    fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    print("FREE")
    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
except BlockingIOError:
    print("BUSY")
`], { encoding: "utf8" });
note("solverLane", { probe: (lane.stdout ?? "").trim(), serialVerifyNotCalled: true, reason: "Lane probe was non-blocking. A blocking serial-verify call would wait on the other checkout." });

save("review.json", result);
console.log(JSON.stringify({
  identity: result.modelIdentity.matchesRecorded,
  admission: result.d3Admission.message,
  admissionSpan: result.d3Admission.span,
  timeout: result.d3Timeout.signal,
  alive: result.d3Timeout.aliveAfterWait,
  drift: result.drift.exitCode,
  driftHit: result.drift.stderrHasDrift,
  lane: result.solverLane.probe,
  replay: result.harmonicReplay.freshReproduce?.status,
  declarationBytes: result.ramda.declarationBytes,
}, null, 2));
