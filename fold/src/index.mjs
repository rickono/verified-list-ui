// The builder: .fold source -> IR -> generated .v (strict or soft).

import { createHash } from "node:crypto";
import { FoldError } from "./lex.mjs";
import { parse } from "./parse.mjs";
import { check } from "./check.mjs";
import { emitV, obligations } from "./emit-v.mjs";
import { decodeString, parseSoft, rocqPaths, runRocq } from "./rocq.mjs";
import { diagnoseSoft } from "./diagnose.mjs";
import { spanMappings } from "./mappings.mjs";

export { FoldError, parse, check, emitV, obligations, decodeString, parseSoft, rocqPaths, runRocq, diagnoseSoft, spanMappings };

export const sourceHash = (src) => createHash("sha256").update(src).digest("hex").slice(0, 16);

// file: the name printed in the headers, e.g. "foldkit-web/src/counter.fold".
export function build(src, { file, mode = "strict" } = {}) {
  const ast = parse(src);
  const ir = check(ast);
  const meta = { file: file ?? "input.fold", sha: sourceHash(src) };
  return { ast, ir, meta, v: emitV(ir, meta, mode) };
}

export const errorDiagnostic = (e) => ({
  start: e.start,
  length: Math.max(0, e.end - e.start),
  code: e.code,
  messageText: e.message,
});

// What the content mapper reports for one .fold file: Rocq's printed
// TypeScript (null when the file does not parse or check), mappings into
// the source, and a diagnostic for each parse, check, or proof failure.
// Rocq runs the soft build, so every obligation is tried even when one
// fails; a file with no diagnostics also passes the strict build.
export async function analyze(src, { file, rocq, theories, timeoutMs } = {}) {
  let built;
  try {
    built = build(src, { file, mode: "soft" });
  } catch (e) {
    if (e instanceof FoldError) return { ts: null, mappings: [], diagnostics: [errorDiagnostic(e)] };
    throw e;
  }
  const r = await runRocq(built.v, { ...rocqPaths({ rocq, theories }), timeoutMs });
  const soft = parseSoft(r.out);
  const diagnostics = diagnoseSoft(built.ir, soft, r);
  const ts = soft.ts === null ? null : `${soft.ts}\n`;
  const mappings = ts === null ? [] : spanMappings(ts, src, built.ast, built.ir);
  return { ts, mappings, diagnostics };
}

export class FoldBuildError extends Error {
  constructor(message, diagnostics) {
    super(message);
    this.diagnostics = diagnostics;
  }
}

// The strict build: Rocq checks fwfb and every proof, then prints the
// TypeScript.  Throws FoldBuildError, with diagnostics from the soft build,
// when anything fails.
export async function compile(src, { file, rocq, theories, timeoutMs } = {}) {
  let built;
  try {
    built = build(src, { file, mode: "strict" });
  } catch (e) {
    if (e instanceof FoldError) throw new FoldBuildError(e.message, [errorDiagnostic(e)]);
    throw e;
  }
  const paths = rocqPaths({ rocq, theories });
  const r = await runRocq(`${built.v}\nSet Printing Width 4000.\nEval vm_compute in ts.\n`, { ...paths, timeoutMs });
  const ts = r.code === 0 ? decodeString(r.out) : null;
  if (ts !== null) return { ts: `${ts}\n`, v: built.v, meta: built.meta };
  const a = await analyze(src, { file, rocq, theories, timeoutMs });
  const diagnostics = a.diagnostics.length
    ? a.diagnostics
    : [{ start: 0, length: 0, code: 6, messageText: `The strict build failed, but the soft build found nothing.\n${(r.err || r.out).trim()}` }];
  throw new FoldBuildError(`${diagnostics.length} problem${diagnostics.length > 1 ? "s" : ""} in ${built.meta.file}`, diagnostics);
}

// "file:line:col - error fold<code>: message", as tsc prints them.
export function formatDiagnostic(src, file, d) {
  const before = src.slice(0, d.start).split("\n");
  const line = before.length;
  const col = before[before.length - 1].length + 1;
  return `${file}:${line}:${col} - error fold${d.code}: ${d.messageText}`;
}
