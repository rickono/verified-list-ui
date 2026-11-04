#!/usr/bin/env node
// The fold/ command line.
//
//   foldc v <file.fold> [--soft] [--file <label>]   print the generated .v
//   foldc ts <file.fold> [--file <label>]           strict build; print the TS
//   foldc check <file.fold>...                      diagnostics, as tsc prints them
//   foldc decode [<rocq-output>]                    the TS in Rocq's [Eval] output
//
// --file is the name the headers print (default: the path as given).
// Rocq and the theories default to ./_opam/bin/rocq and
// ./_build/default/theories under the repository; override them with
// FOLD_ROCQ and FOLD_THEORIES.

import fs from "node:fs";
import { analyze, build, compile, decodeString, formatDiagnostic, FoldBuildError, FoldError } from "../src/index.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  if (i < 0) return null;
  const v = rest[i + 1];
  rest.splice(i, 2);
  return v;
};
const has = (name) => {
  const i = rest.indexOf(name);
  if (i >= 0) rest.splice(i, 1);
  return i >= 0;
};
const rocqOpts = () => ({ rocq: process.env.FOLD_ROCQ, theories: process.env.FOLD_THEORIES });
const usage = () => {
  console.error("usage: foldc v|ts|check|decode ... (see fold/bin/foldc.mjs)");
  process.exit(2);
};

const read = (f) => fs.readFileSync(f, "utf8");
const report = (src, file, diags) => {
  for (const d of diags) console.error(formatDiagnostic(src, file, d));
};

switch (cmd) {
  case "v": {
    const soft = has("--soft");
    const label = flag("--file");
    const [f] = rest;
    if (!f) usage();
    const src = read(f);
    try {
      process.stdout.write(build(src, { file: label ?? f, mode: soft ? "soft" : "strict" }).v);
    } catch (e) {
      if (!(e instanceof FoldError)) throw e;
      report(src, f, [{ start: e.start, length: e.end - e.start, code: e.code, messageText: e.message }]);
      process.exit(1);
    }
    break;
  }
  case "ts": {
    const label = flag("--file");
    const [f] = rest;
    if (!f) usage();
    const src = read(f);
    try {
      process.stdout.write((await compile(src, { file: label ?? f, ...rocqOpts() })).ts);
    } catch (e) {
      if (!(e instanceof FoldBuildError)) throw e;
      report(src, f, e.diagnostics);
      process.exit(1);
    }
    break;
  }
  case "check": {
    if (!rest.length) usage();
    let bad = 0;
    for (const f of rest) {
      const src = read(f);
      const { diagnostics } = await analyze(src, { file: f, ...rocqOpts() });
      report(src, f, diagnostics);
      bad += diagnostics.length;
    }
    if (bad) {
      console.error(`\nFound ${bad} problem${bad > 1 ? "s" : ""}.`);
      process.exit(1);
    }
    break;
  }
  case "decode": {
    const out = rest[0] ? read(rest[0]) : fs.readFileSync(0, "utf8");
    const ts = decodeString(out);
    if (ts === null) {
      console.error("No string value in the Rocq output.");
      process.exit(1);
    }
    process.stdout.write(`${ts}\n`);
    break;
  }
  default:
    usage();
}
