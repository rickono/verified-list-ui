// The only filesystem reader. All proof, replay, and provenance use this
// canonical read-once snapshot, including configuration/package metadata.
import { readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve as lexical, sep, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { isBuiltin } from "node:module";
import { parse } from "./source.mjs";
import { blame, fail, SourceError } from "./error.mjs";

const EXTENSION = /\.(?:js|mjs|ts|mts)$/;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const plain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const inside = (base, file) => { const p = relative(base, file); return p !== ".." && !p.startsWith(`..${sep}`) && !isAbsolute(p); };

function snapshot(files, dependencies, build) {
  try { return { files, dependencies, records: build() }; }
  catch (e) {
    if (!(e instanceof SourceError)) throw e;
    return { files, dependencies, records: [], error: e };
  }
}

/** The source label never authorizes I/O, including for type imports. */
export function single(file, source) {
  const files = [{ file, source, sha256: sha256(source), imports: [] }];
  return snapshot(files, [], () => [parse(file, source, (specifier, node) =>
    fail(`verify(source) never reads files; use verifyFile(entry) to import ${specifier}.`, node))]);
}

export function load(entry, { tsconfig } = {}) {
  const root = realpathSync.native(entry);
  const first = readFileSync(root); // entry I/O errors still reject the request
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const files = [], dependencies = [], captured = new Map(), records = new Map(), open = new Set(), packageBases = new Map(), sourceScopes = new Map();
  function capture(file, kind, node, bytes) {
    if (captured.has(file)) return captured.get(file);
    try { bytes ??= readFileSync(file); }
    catch (e) { fail(`Cannot read ${file}: ${e.code ?? e.message}.`, node, "error"); }
    const record = { file, source: "", sha256: sha256(bytes), ...(kind === "source" ? { imports: [] } : { kind }) };
    captured.set(file, record);
    (kind === "source" ? files : dependencies).push(record);
    try { record.source = decoder.decode(bytes); }
    catch { fail(`${file} is not valid UTF-8.`, node, "error"); }
    return record;
  }
  function canonical(path, node) {
    try { return realpathSync.native(path); }
    catch (e) { fail(`Cannot resolve ${path}: ${e.code ?? e.message}.`, node, "error"); }
  }
  function json(file, kind, node) {
    const record = capture(file, kind, node);
    return blame(file, undefined, () => {
      try { return JSON.parse(record.source.replace(/^\uFEFF/, "")); }
      catch { fail(`Invalid strict JSON in ${kind}.`, null, "error"); }
    });
  }
  function sourceScope(file, node, forResolution = false) {
    if (sourceScopes.has(file)) return sourceScopes.get(file);
    if (!forResolution && !/\.(?:js|ts)$/.test(file)) return;
    let directory = dirname(file);
    while (true) {
      let metadata;
      try { metadata = realpathSync.native(lexical(directory, "package.json")); }
      catch (e) { if (!["ENOENT", "ENOTDIR"].includes(e.code)) fail(`Cannot inspect source package scope: ${e.code}.`, node, "error"); }
      if (metadata) {
        const pkg = json(metadata, "package", node);
        blame(metadata, undefined, () => {
          if (!plain(pkg) || /\.(?:js|ts)$/.test(file) && pkg.type !== undefined && pkg.type !== "module") fail("Only ES module source is supported; this package scope does not declare type: module.");
        });
        sourceScopes.set(file, pkg);
        return pkg;
      }
      const parent = dirname(directory);
      if (parent === directory) { sourceScopes.set(file, null); return null; }
      directory = parent;
    }
  }
  function config() {
    if (tsconfig === undefined) return null;
    const file = canonical(lexical(tsconfig), null), value = json(file, "tsconfig", null);
    return blame(file, undefined, () => {
      if (!plain(value) || Object.keys(value).some((k) => k !== "compilerOptions") || !plain(value.compilerOptions)) fail("Supported tsconfig contains only compilerOptions.baseUrl and compilerOptions.paths.");
      const opts = value.compilerOptions;
      if (Object.keys(opts).some((k) => !["baseUrl", "paths"].includes(k)) || opts.baseUrl !== undefined && typeof opts.baseUrl !== "string" || opts.paths !== undefined && !plain(opts.paths)) fail("Unsupported tsconfig option; only baseUrl and paths are supported.");
      if (opts.baseUrl?.includes("\\") || opts.baseUrl && isAbsolute(opts.baseUrl)) fail("tsconfig baseUrl must be relative without backslashes.");
      const paths = Object.entries(opts.paths ?? {}).map(([key, targets]) => {
        if (!key || key.startsWith(".") || key.startsWith("/") || /[%?#\\]/.test(key) || key.split("*").length > 2 || !Array.isArray(targets) || targets.length !== 1 || typeof targets[0] !== "string") fail("Each tsconfig path needs one target and at most one wildcard.");
        const target = targets[0];
        if (/[%?#\\]/.test(target) || isAbsolute(target) || target.split("*").length !== key.split("*").length || !EXTENSION.test(target)) fail("Path targets need matching wildcards and an exact supported file extension.");
        return { key, target, prefix: key.split("*")[0], suffix: key.includes("*") ? key.split("*")[1] : null };
      });
      return { base: lexical(dirname(file), opts.baseUrl ?? "."), paths };
    });
  }
  function packageSource(base, file, node) {
    if (base === file) fail("A package target must be a source file, not its package directory.", node);
    if (!inside(base, file)) fail("Relative imports from a package cannot escape its canonical package directory.", node);
    if (packageBases.has(file) && packageBases.get(file) !== base) fail("Ambiguous canonical package roots are unsupported.", node);
    let directory = dirname(file);
    while (directory !== base) {
      let metadata;
      try { metadata = realpathSync.native(lexical(directory, "package.json")); }
      catch (e) { if (!["ENOENT", "ENOTDIR"].includes(e.code)) fail(`Cannot inspect package scope: ${e.code}.`, node, "error"); }
      if (metadata) {
        capture(metadata, "package", node);
        fail("Nested package scopes are unsupported.", node);
      }
      directory = dirname(directory);
    }
    const pkg = json(lexical(base, "package.json"), "package", node);
    if (/\.(?:js|ts)$/.test(file) && pkg.type !== "module") fail("Package must declare type: module for .js/.ts sources.", node);
    packageBases.set(file, base);
    return file;
  }
  function packageTarget(specifier, from, kind, node) {
    const parts = specifier.split("/");
    const count = specifier.startsWith("@") ? 2 : 1;
    const name = parts.slice(0, count).join("/"), subpath = parts.slice(count).join("/");
    if (parts.length < count || parts.some((p) => !p || p === "." || p === "..") || !/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+$/.test(name) || name.startsWith(".")) fail(`Unsupported package specifier ${specifier}.`, node);
    const scope = sourceScope(from, node, true);
    if (scope?.name === name && scope.exports !== undefined) fail("Package self-references are unsupported.", node);
    let directory = dirname(from), packageFile, base;
    while (true) {
      const candidate = lexical(directory, "node_modules", name, "package.json");
      try {
        packageFile = realpathSync.native(candidate);
        base = realpathSync.native(dirname(candidate));
        break;
      }
      catch (e) { if (!["ENOENT", "ENOTDIR"].includes(e.code)) fail(`Cannot resolve package ${specifier}: ${e.code}.`, node, "error"); }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    if (!packageFile) fail(`Package ${name} is unavailable; only installed packages with explicit exports are supported.`, node);
    if (packageFile !== lexical(base, "package.json")) fail("Symlinked package metadata is unsupported; link the whole package directory instead.", node);
    const pkg = json(packageFile, "package", node);
    if (!plain(pkg) || pkg.exports === undefined) fail(`Package ${name} requires explicit exports; main fallback is unsupported.`, node);
    let target = pkg.exports;
    if (plain(target) && Object.keys(target).some((k) => k.startsWith("."))) {
      if (Object.keys(target).some((k) => k !== "." && (!k.startsWith("./") || /[*%?#\\]/.test(k) || k.split("/").some((p) => p === "..")))) fail(`Unsupported package export map for ${name}.`, node);
      target = target[subpath ? `./${subpath}` : "."];
    } else if (subpath) target = undefined;
    if (target === undefined || target === null) fail(`Package ${specifier} has no selected export.`, node, "error");
    if (plain(target)) {
      if (Object.keys(target).some((k) => !["types", "import", "default"].includes(k)) || Object.values(target).some((v) => typeof v !== "string")) fail(`Unsupported or ambiguous package conditions for ${specifier}.`, node);
      target = kind === "type" && target.types !== undefined ? target.types : Object.entries(target).find(([k]) => k === "import" || k === "default")?.[1];
    }
    if (typeof target !== "string" || !target.startsWith("./") || /[*%?#\\]/.test(target) || target.split("/").slice(1).some((p) => ["", ".", "..", "node_modules"].includes(p)) || !EXTENSION.test(target)) fail(`Unsupported package export target for ${specifier}; use one exact .js/.mjs/.ts/.mts path.`, node);
    const resolved = canonical(lexical(base, target), node);
    if (!inside(base, resolved)) fail(`Package export ${specifier} escapes its canonical package directory.`, node);
    return packageSource(base, resolved, node);
  }
  return snapshot(files, dependencies, () => {
    // Capture entry first so provenance and error presentation stay stable.
    capture(root, "source", null, first);
    const project = config();
    const visit = (file, node) => {
      const record = capture(file, "source", node);
      sourceScope(file, node);
      open.add(file);
      const resolve = (specifier, at, kind) => {
        if (isBuiltin(specifier)) fail(`Node builtin module ${specifier} is unsupported.`, at);
        if (/[%?#\\]/.test(specifier) || isAbsolute(specifier) || /^\w+:/.test(specifier)) fail("Import paths cannot be absolute, URLs, or contain escapes, queries, fragments or backslashes.", at);
        let target;
        if (/^\.\.?\//.test(specifier)) {
          if (!EXTENSION.test(specifier)) fail(`Write the exact .js, .mjs, .ts or .mts file; ${specifier} is never guessed.`, at);
          target = canonical(lexical(dirname(file), specifier), at);
          if (packageBases.has(file)) packageSource(packageBases.get(file), target, at);
        } else {
          const matches = (project?.paths ?? []).filter((p) => p.suffix === null ? p.key === specifier : specifier.startsWith(p.prefix) && specifier.endsWith(p.suffix) && specifier.length >= p.prefix.length + p.suffix.length);
          const exact = matches.filter((p) => p.suffix === null);
          const ordered = (exact.length ? exact : matches).sort((a, b) => b.prefix.length - a.prefix.length);
          if (ordered.length > 1 && ordered[0].prefix.length === ordered[1].prefix.length) fail(`Ambiguous tsconfig path ${specifier}.`, at);
          if (ordered.length) {
            const p = ordered[0], middle = p.suffix === null ? "" : specifier.slice(p.prefix.length, specifier.length - p.suffix.length);
            if (middle.split("/").some((part) => part === "." || part === "..")) fail(`Path substitution cannot traverse directories: ${specifier}.`, at);
            target = canonical(lexical(project.base, p.target.replace("*", () => middle)), at);
          } else target = packageTarget(specifier, file, kind, at);
        }
        if (!EXTENSION.test(target)) fail(`${specifier} resolves to an unsupported file extension.`, at);
        if (open.has(target)) fail(`Import cycle through ${specifier} is unsupported.`, at);
        if (!records.has(target)) visit(target, at);
        if (!record.imports.includes(target)) record.imports.push(target);
        return target;
      };
      records.set(file, parse(file, record.source, resolve));
      open.delete(file);
    };
    visit(root, null);
    return [...records.values()];
  });
}

/** Deterministic digest includes every captured semantic dependency. */
export function graphDigest(files, dependencies = []) {
  const base = dirname(files[0].file);
  const rel = (f) => relative(base, f).split(sep).join("/");
  return sha256(JSON.stringify([
    files.map((f) => [rel(f.file), f.sha256, f.imports.map(rel)]),
    dependencies.map((f) => [rel(f.file), f.kind, f.sha256]),
  ]));
}
