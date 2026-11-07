// Module snapshot: the only code that reads files. Each run reads every
// canonical file once; proofs and replay use exactly this captured text.
import { readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve as lexical, sep } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "./source.mjs";
import { fail, SourceError } from "./error.mjs";

const EXTENSION = /\.(?:js|mjs|ts|mts)$/;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

function snapshot(files, build) {
  try { return { files, records: build() }; }
  catch (e) {
    if (!(e instanceof SourceError)) throw e;
    return { files, records: [], error: e };
  }
}

/** Source-string API: the label never authorizes I/O, so imports are rejected. */
export function single(file, source) {
  const files = [{ file, source, sha256: sha256(source), imports: [] }];
  return snapshot(files, () => [parse(file, source, (specifier, node) =>
    fail(`verify(source) never reads files; use verifyFile(entry) to import ${specifier}.`, node))]);
}

/** Entry I/O errors throw (as before); dependency errors are outcomes at the import. */
export function load(entry) {
  const root = realpathSync.native(entry);
  const first = readFileSync(root); // entry I/O errors still reject the request
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const files = [], records = new Map(), open = new Set();
  const visit = (file, node) => {
    let bytes = node ? undefined : first;
    try { bytes ??= readFileSync(file); }
    catch (e) { if (!node) throw e; fail(`Cannot read ${file}: ${e.code ?? e.message}.`, node, "error"); }
    const record = { file, source: "", sha256: sha256(bytes), imports: [] };
    files.push(record);
    try { record.source = decoder.decode(bytes); }
    catch { fail(`${file} is not valid UTF-8.`, node, "error"); }
    open.add(file);
    const resolve = (specifier, at) => {
      if (!/^\.\.?\//.test(specifier)) fail(`Only relative imports are supported; ${specifier} is bare, absolute or a URL.`, at);
      if (/[%?#\\]/.test(specifier)) fail("Import paths cannot contain URL escapes, queries, fragments or backslashes.", at);
      if (!EXTENSION.test(specifier)) fail(`Write the exact .js, .mjs, .ts or .mts file; ${specifier} is never guessed.`, at);
      let target;
      try { target = realpathSync.native(lexical(dirname(file), specifier)); }
      catch (e) { fail(`Cannot resolve ${specifier}: ${e.code ?? e.message}.`, at, "error"); }
      if (!EXTENSION.test(target)) fail(`${specifier} resolves to ${target}, which is not a .js, .mjs, .ts or .mts file.`, at);
      if (open.has(target)) fail(`Import cycle through ${specifier} is unsupported.`, at);
      if (!records.has(target)) visit(target, at);
      record.imports.push(target);
      return target;
    };
    records.set(file, parse(file, record.source, resolve));
    open.delete(file);
  };
  // Provenance lists files in discovery order (entry first); records are
  // dependency-first, so helpers are solved before callers, as in one file.
  return snapshot(files, () => { visit(root, null); return [...records.values()]; });
}

/** Deterministic digest over entry-relative paths, content hashes and edges. */
export function graphDigest(files) {
  const base = dirname(files[0].file);
  const rel = (f) => relative(base, f).split(sep).join("/");
  return sha256(JSON.stringify(files.map((f) => [rel(f.file), f.sha256, f.imports.map(rel)])));
}
