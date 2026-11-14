#!/usr/bin/env node
import { relative } from "node:path";
import { openSync, fstatSync, readFileSync, closeSync, writeFileSync } from "node:fs";
import { verifyFile, reproduce } from "../index.mjs";
import { MAX_ENTRY_BYTES } from "../cache.mjs";

const files = [];
let json = false, timeoutMs = 10_000, tsconfig, cacheDir, cacheMode, plan = false, evidencePath;
const targets = [];
const args = process.argv.slice(2);
const command = ["reproduce", "replay"].includes(args[0]) ? args.shift() : "verify";
const value = (i, option) => { if (!args[i] || args[i].startsWith("--")) { console.error(`${option} requires a value.`); process.exit(2); } return args[i]; };
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--help") {
    console.log("Usage: node verify/bin/jsverify.mjs [--json] [--timeout MS] [--project TSCONFIG] [--target NAME_OR_ID] [--cache DIR] [--cache-mode readwrite|readonly|audit] [--plan] [--evidence JSON] FILE...\n       node verify/bin/jsverify.mjs reproduce [--json] [--target NAME_OR_ID] EVIDENCE_JSON [FILE]\nChecks requires/ensures comments on the supported JS/TS source subset.\n--timeout accepts integers from 1 to 180000 ms (default 10000), shared by all solver targets and phases.\nTargets include transitive callees. Plan runs no solver and creates no cache files.\nReceipts trust cache integrity; readonly is not authenticity. Audit re-solves proofs.\nEvidence records confirmed bugs for current-source native replay; proofs reproduce by fresh verification/audit.\nExit 0 means every function was verified, a plan succeeded, or every requested bug reproduced; other outcomes exit 1.");
    process.exit(0);
  } else if (args[i] === "--json") json = true;
  else if (args[i] === "--timeout") timeoutMs = Number(value(++i, "--timeout"));
  else if (args[i] === "--target") targets.push(value(++i, "--target"));
  else if (args[i] === "--cache") cacheDir = value(++i, "--cache");
  else if (args[i] === "--cache-mode") cacheMode = value(++i, "--cache-mode");
  else if (args[i] === "--evidence") evidencePath = value(++i, "--evidence");
  else if (args[i] === "--plan") plan = true;
  else if (args[i] === "--project") { tsconfig = args[++i]; if (!tsconfig) { console.error("--project requires a tsconfig path."); process.exit(2); } }
  else if (args[i].startsWith("-")) { console.error(`Unknown option ${args[i]}`); process.exit(2); }
  else files.push(args[i]);
}
if (cacheMode && !cacheDir || evidencePath && files.length !== 1 || evidencePath && plan || command !== "verify" && (cacheDir || evidencePath || plan || targets.length > 1 || files.length > 2)) {
  console.error("Invalid option combination: cache mode needs --cache; evidence needs one entry and no --plan; reproduce accepts one evidence file, optional entry and one target."); process.exit(2);
}
if (!files.length) { console.error("Provide at least one JS/TS source file. Use --help for usage."); process.exit(2); }
const reports = [];
const show = (value) => typeof value === "string" ? value : JSON.stringify(value);
try {
  if (command !== "verify") {
    const fd = openSync(files[0], "r");
    let artifact;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > MAX_ENTRY_BYTES) throw new TypeError("Invalid or oversized evidence file.");
      artifact = JSON.parse(readFileSync(fd, "utf8"));
    } finally { closeSync(fd); }
    const result = reproduce(files[1] ?? artifact.entry, artifact, { tsconfig, target: targets[0] });
    console.log(json ? JSON.stringify(result, null, 2) : `${result.status}${result.message ? `: ${result.message}` : ""}`);
    process.exitCode = result.status === "reproduced" ? 0 : 1;
  } else {
  for (const file of files) {
    const report = await verifyFile(file, { timeoutMs, tsconfig, targets: targets.length ? targets : undefined,
      cache: cacheDir ? { dir: cacheDir, mode: cacheMode } : undefined, plan, evidence: !!evidencePath });
    if (evidencePath) writeFileSync(evidencePath, JSON.stringify(report.evidence ?? { error: "No bug evidence was generated." }, null, 2) + "\n");
    const entry = report.modules[0]?.file;
    const where = (f) => f === entry ? file : relative(process.cwd(), f);
    reports.push(report);
    if (!json && report.plan) for (const t of report.plan.targets) console.log(`${t.needsSolve ? "solve" : "pending replay"} ${t.target}${t.waitingOn.length ? `; waiting on ${t.waitingOn.join(", ")}` : ""}`);
    if (!json && report.cache) {
      const c = report.cache;
      console.log(`cache: ${c.hits.length} provisional hits, ${c.solved.length} solved, ${c.written.length} written${c.disabled ? `; disabled: ${c.disabled}` : ""}`);
      if (c.hits.length) console.log(`  trust: ${c.trust}`);
      for (const d of c.disagreements ?? []) console.log(`  audit disagreement: ${d.target} (${d.kind})`);
    }
    if (!json) for (const o of report.outcomes) {
      console.log(`${where(o.file)}:${o.line}:${o.column} ${o.status} ${o.fn ?? ""}`.trimEnd());
      if (o.reason) console.log(`  reason: ${o.reason}`);
      if (o.message) console.log(`  ${o.message}`);
      if (o.reason === "induction-gap") {
        console.log(`  loop check: ${o.phase}`);
        console.log(`  candidate inputs (not a confirmed bug): ${Object.entries(o.candidate).map(([k, v]) => `${k} = ${show(v)}`).join(", ") || "(none)"}`);
      }
      if (o.obligation) {
        const part = o.obligation.postcondition ? ` ${o.obligation.postcondition}/${o.obligation.postconditionCount}` : "";
        console.log(`  obligation: ${o.obligation.phase}${part} (${o.obligation.domain}, ${o.obligation.backend}); queries attempted: ${o.attempts}`);
      }
      if (o.solverReason) console.log(`  solver detail: ${o.solverReason}`);
      if (o.status === "counterexample") {
        console.log(`  inputs: ${Object.entries(o.inputs).map(([k, v]) => `${k} = ${show(v)}`).join(", ") || "(none)"}`);
        if (o.aliases?.length) console.log(`  shared references: ${o.aliases.map((group) => group.join(" === ")).join(", ")}`);
        if (o.phase === "requires-definedness") console.log("  requires evaluation is undefined (confirmed by specification replay)");
        if (o.call?.frameWrite || o.call?.frameInclusion || o.call?.storeDomain) {
          for (const c of o.call.violated) console.log(`  failed ${c.kind}: ${c.text} (observed in JavaScript)`);
        } else if (o.call?.callback) {
          console.log(`  callback: ${o.call.callback}(${o.call.arguments.map(show).join(", ")}) (replayed in JavaScript)`);
          for (const c of o.call.violated) console.log(`  failed callback check: ${c.kind}`);
        } else if (o.call) {
          if (o.call.admission) console.log(`  callback admission: ${o.call.admission.parameter} passed to ${o.call.admission.callee} (probe replay)`);
          const actual = Object.entries(o.call.arguments).map(([k, v]) => `${k} = ${show(v)}`).join(", ");
          console.log(`  call: ${o.call.callee}(${actual})${o.call.calleeFile === o.file ? "" : ` in ${where(o.call.calleeFile)}`} (replayed in JavaScript)`);
          for (const c of o.call.violated) console.log(c.text ? `  failed call requires: ${c.text}${c.file && c.file !== o.file ? ` (${where(c.file)})` : ""}` : `  failed parameter domain: ${c.name}`);
        } else {
          if (o.phase !== "requires-definedness") console.log(`  returned: ${show(o.result)} (replayed in JavaScript)`);
          for (const c of o.failed) console.log(`  failed: ${c.text}`);
        }
      }
      if (o.status === "vacuous") console.log("  The preconditions contradict each other; this is not reported as verified.");
    }
  }
  if (json) console.log(JSON.stringify(reports, null, 2));
  process.exitCode = reports.every((r) => !r.cache?.disagreements?.length && (r.plan || r.outcomes.length && r.outcomes.every((o) => o.status === "verified"))) ? 0 : 1;
  }
} catch (e) { console.error(e.message); process.exitCode = 2; }
