#!/usr/bin/env node
import { relative } from "node:path";
import { verifyFile } from "../index.mjs";

const files = [];
let json = false, timeoutMs = 10_000, tsconfig;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--help") {
    console.log("Usage: node verify/bin/jsverify.mjs [--json] [--timeout MS] [--project TSCONFIG] FILE...\nChecks requires/ensures comments on the supported JS/TS source subset.\nExit 0 means every function was verified; other outcomes exit 1.");
    process.exit(0);
  } else if (args[i] === "--json") json = true;
  else if (args[i] === "--timeout") timeoutMs = Number(args[++i]);
  else if (args[i] === "--project") { tsconfig = args[++i]; if (!tsconfig) { console.error("--project requires a tsconfig path."); process.exit(2); } }
  else if (args[i].startsWith("-")) { console.error(`Unknown option ${args[i]}`); process.exit(2); }
  else files.push(args[i]);
}
if (!files.length) { console.error("Provide at least one JS/TS source file. Use --help for usage."); process.exit(2); }
const reports = [];
const show = (value) => typeof value === "string" ? value : JSON.stringify(value);
try {
  for (const file of files) {
    const report = await verifyFile(file, { timeoutMs, tsconfig });
    const entry = report.modules[0]?.file;
    const where = (f) => f === entry ? file : relative(process.cwd(), f);
    reports.push(report);
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
        if (o.phase === "requires-definedness") console.log("  requires evaluation is undefined (confirmed by specification replay)");
        if (o.call) {
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
  process.exitCode = reports.every((r) => r.outcomes.length && r.outcomes.every((o) => o.status === "verified")) ? 0 : 1;
} catch (e) { console.error(e.message); process.exitCode = 2; }
