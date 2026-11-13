// Trusted-code identity for the optional proof cache. A cache entry is only
// reusable under the exact code that produced it: every verifier module that
// index.mjs can load, every package that code imports (hashed whole, with its
// declared dependencies), and the Node runtime. The closure is read with Acorn
// from the files on disk. Loading forms it cannot follow disable the cache.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "acorn";

export const SCHEMA = 1;
const HERE = fileURLToPath(new URL(".", import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
// node:module names that only inspect or strip source. createRequire, register
// and friends load code outside this closure, so any other use disables.
const LOADER_SAFE = new Set(["isBuiltin", "stripTypeScriptTypes", "builtinModules"]);

class Disabled extends Error {}
const disable = (message) => { throw new Disabled(message); };

const text = (node) => node?.type === "Literal" && typeof node.value === "string" ? node.value
  : node?.type === "TemplateLiteral" && !node.expressions.length ? node.quasis[0].value.cooked : undefined;
const metaUrl = (node) => node?.type === "MemberExpression" && !node.computed && node.object.type === "MetaProperty" &&
  node.object.meta.name === "import" && node.object.property.name === "meta" && node.property.name === "url";
const named = (s) => s.type === "ImportSpecifier" && LOADER_SAFE.has(s.imported.name ?? s.imported.value);
const LOADER = new Set(["module", "node:module"]);

// Every dependency one ES module names: [{specifier, form}], where form is
// "import" (static, side-effect, re-export or literal dynamic import) or "url"
// (new URL(literal, import.meta.url), as used for the solver worker).
export function dependencies(source, where) {
  let ast;
  try { ast = parse(source, { ecmaVersion: "latest", sourceType: "module" }); }
  catch (e) { disable(`The trusted-code manifest could not parse ${where}: ${e.message}`); }
  const found = [], metas = [], recognized = new Set(), stack = [ast];
  const add = (specifier, form) => found.push({ specifier, form });
  while (stack.length) {
    const node = stack.pop();
    if (node.type === "ImportDeclaration") {
      if (LOADER.has(node.source.value) && !node.specifiers.every(named)) disable(`${where} imports code-loading names from ${node.source.value}.`);
      add(node.source.value, "import");
    } else if ((node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") && node.source) {
      if (LOADER.has(node.source.value)) disable(`${where} re-exports ${node.source.value}.`);
      add(node.source.value, "import");
    } else if (node.type === "ImportExpression") {
      const specifier = text(node.source);
      if (specifier === undefined) disable(`${where} has a dynamic import with a computed specifier.`);
      if (LOADER.has(specifier)) disable(`${where} dynamically imports ${specifier}.`);
      add(specifier, "import");
    } else if (node.type === "NewExpression" && node.callee.type === "Identifier" && node.callee.name === "URL" && metaUrl(node.arguments[1])) {
      const specifier = text(node.arguments[0]);
      if (specifier === undefined || node.arguments.length !== 2) disable(`${where} builds a module URL from a computed specifier.`);
      recognized.add(node.arguments[1].object);
      add(specifier, "url");
    } else if (node.type === "MetaProperty") metas.push(node);
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) { for (const child of value) if (typeof child?.type === "string") stack.push(child); }
      else if (key !== "loc" && typeof value?.type === "string") stack.push(value);
    }
  }
  if (metas.some((m) => !recognized.has(m))) disable(`${where} uses import.meta outside new URL(literal, import.meta.url).`);
  return found;
}

// Node's bare-specifier search: <dir>/node_modules/<name>, walking upward.
function findPackage(from, name) {
  for (let dir = from; ; dir = dirname(dir)) {
    if (!dir.endsWith(`${sep}node_modules`)) {
      const candidate = join(dir, "node_modules", name);
      try { if (statSync(candidate).isDirectory()) return realpathSync(candidate); } catch { /* keep searching */ }
    }
    if (dirname(dir) === dir) return undefined;
  }
}
const packageName = (specifier) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");

// Every file in an installed package, by package-relative path, excluding its
// own node_modules (declared dependencies are hashed as packages themselves).
function packageFiles(root) {
  const files = [], seen = new Set();
  const walk = (dir, prefix) => {
    const real = realpathSync(dir);
    if (seen.has(real)) return;
    seen.add(real);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!prefix && entry.name === "node_modules") continue;
      const path = join(dir, entry.name), name = prefix + entry.name;
      let kind = entry;
      if (entry.isSymbolicLink()) {
        try { kind = statSync(path); } catch { files.push([name, `dangling:${readlinkSync(path)}`]); continue; }
      }
      if (kind.isDirectory()) walk(path, `${name}/`);
      else if (kind.isFile()) files.push([name, sha256(readFileSync(path))]);
      else disable(`The installed package at ${root} contains a non-file entry ${name}.`);
    }
  };
  walk(root, "");
  return files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}

function collect(entry, includePackages = true) {
  const files = new Map(), packages = new Map(), builtins = new Set(), queue = [entry];
  const addPackage = (from, name, required) => {
    if (!includePackages) return null;
    const root = findPackage(from, name);
    if (!root) {
      if (required) disable(`The trusted-code manifest cannot resolve package ${name} from ${from}.`);
      return null;
    }
    if (!packages.has(root)) {
      const meta = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      const record = { name, version: String(meta.version), files: packageFiles(root), dependencies: [] };
      packages.set(root, record);
      for (const [field, needed] of [["dependencies", true], ["optionalDependencies", false], ["peerDependencies", false]]) {
        for (const dep of Object.keys(meta[field] ?? {}).sort()) {
          const found = addPackage(root, dep, needed);
          record.dependencies.push([dep, found && `${found.name}@${found.version}`]);
        }
      }
    }
    return packages.get(root);
  };
  while (queue.length) {
    const file = queue.shift();
    if (files.has(file)) continue;
    const bytes = readFileSync(file);
    files.set(file, sha256(bytes));
    if (![".mjs", ".js"].includes(extname(file))) continue;
    for (const { specifier, form } of dependencies(bytes.toString("utf8"), file)) {
      if (form === "import" && (specifier.startsWith("node:") || isBuiltin(specifier))) { builtins.add(specifier.replace(/^(node:)?/, "node:")); continue; }
      if (specifier.startsWith("data:")) disable(`${file} imports inline code whose dependencies are not followed.`);
      if (/^[a-z][a-z0-9+.-]*:/i.test(specifier) || specifier.startsWith("#") || specifier.startsWith("/")) disable(`${file} loads ${specifier}, which the manifest does not follow.`);
      if (form === "import" && !specifier.startsWith("./") && !specifier.startsWith("../")) { addPackage(dirname(file), packageName(specifier), true); continue; }
      const url = new URL(specifier, pathToFileURL(file));
      if (form === "url" && url.pathname.endsWith("/")) continue; // a directory, not a module
      let target;
      try { target = realpathSync(fileURLToPath(url)); }
      catch { disable(`${file} names ${specifier}, which does not resolve to a file.`); }
      if (form === "import" && ![".mjs", ".js", ".json"].includes(extname(target))) disable(`${file} imports ${specifier}; the manifest follows only .mjs modules.`);
      queue.push(target);
    }
  }
  return { files, packages, builtins };
}

// A pure disk walk from verifyDir/index.mjs. Returns the identity, or
// {disabled: reason} when the closure cannot be bound to exact bytes.
export function trustedIdentity(verifyDir) {
  try {
    const root = realpathSync(verifyDir);
    const { files, packages, builtins } = collect(join(root, "index.mjs"));
    const path = (p) => relative(root, p).split(sep).join("/");
    const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    const records = [...packages.values()].map((p) => ({ ...p, sha256: sha256(JSON.stringify(p.files)) }))
      .sort((a, b) => order(`${a.name}@${a.version}:${a.sha256}`, `${b.name}@${b.version}:${b.sha256}`));
    const body = {
      schema: SCHEMA,
      files: [...files].map(([p, h]) => [path(p), h]).sort(([a], [b]) => order(a, b)),
      packages: records.map(({ name, version, sha256: digest, dependencies: deps }) => ({ name, version, sha256: digest, dependencies: deps })),
      builtins: [...builtins].sort(),
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      protocol: "jsverify-receipt-1/query-1",
    };
    const z3 = records.filter((p) => p.name === "z3-solver");
    if (z3.length !== 1) disable("The trusted-code closure does not load exactly one z3-solver package.");
    return {
      ...body, sha256: sha256(JSON.stringify(body)),
      backend: { package: `z3-solver@${z3[0].version}`, sha256: z3[0].sha256, files: z3[0].files, ...body.runtime },
    };
  } catch (e) {
    return { disabled: e instanceof Disabled ? e.message : `The trusted-code manifest could not be read: ${e.message}` };
  }
}

// The identity of the verifier running in this process. Disabled when a
// verifier module on disk is not the one this process loaded.
export function runningIdentity() {
  const identity = trustedIdentity(HERE);
  if (identity.disabled) return identity;
  const changed = drift(identity);
  return changed ? { disabled: changed } : identity;
}

// Capture the local semantic closure at module initialization, before any API
// can use a receipt. Packages are read per request (the solver is a new child).
const LOADED = (() => {
  try { return collect(join(HERE, "index.mjs"), false).files; }
  catch { return undefined; }
})();

// Fail closed if the running modules no longer match the named disk closure.
export function drift(identity) {
  if (!LOADED) return "The loaded verifier sources could not be read, so the cache cannot bind them.";
  for (const [path, hash] of identity.files) {
    const full = fileURLToPath(new URL(path, pathToFileURL(HERE)));
    if (hash !== LOADED.get(full)) return `The verifier module ${path} changed on disk after this process loaded it; restart to use the proof cache.`;
  }
}
