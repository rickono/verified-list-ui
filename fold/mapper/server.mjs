// The content mapper for .fold files (TypeScript 7.1, contentMappers).
//
// TypeScript sends JSON-RPC requests over stdio with Content-Length
// framing: initialize, openProject, transform, closeProject.  transform
// runs the builder in soft mode under Rocq (fold/src/index.mjs, analyze)
// and answers with the TypeScript module Rocq printed, span mappings into
// the .fold source, and a diagnostic for each parse, check, or proof
// failure.  The protocol is described in microsoft/TypeScript#63800.
//
// Options (contentMappers[].options), paths relative to the tsconfig:
//   rocq      the rocq binary      (default: <repo>/_opam/bin/rocq)
//   theories  the compiled theory  (default: <repo>/_build/default/theories)
//
// dynamicConfig: the result also depends on the compiled theory and on the
// builder's own source, so openProject returns their hash as configIdentity
// and lists them in watchedFiles.

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, rocqPaths } from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const builderDir = path.resolve(here, "../src");
const debug = process.env.FOLD_MAPPER_DEBUG ? (...a) => console.error("[fold]", ...a) : () => {};

// --- framing -------------------------------------------------------------

let buf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const sep = buf.indexOf("\r\n\r\n");
    if (sep < 0) return;
    const header = buf.subarray(0, sep).toString("ascii");
    const m = /content-length:\s*(\d+)/i.exec(header);
    if (!m) {
      buf = buf.subarray(sep + 4);
      continue;
    }
    const len = Number(m[1]);
    if (buf.length < sep + 4 + len) return;
    const body = buf.subarray(sep + 4, sep + 4 + len).toString("utf8");
    buf = buf.subarray(sep + 4 + len);
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }
    dispatch(msg);
  }
});
process.stdin.on("end", () => process.exit(0));

function send(msg) {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  if (id === undefined) {
    if (method === "exit") process.exit(0);
    return;
  }
  try {
    const handler = handlers[method];
    if (!handler) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${method}` } });
      return;
    }
    send({ jsonrpc: "2.0", id, result: (await handler(params ?? {})) ?? null });
  } catch (e) {
    debug(method, e);
    send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(e && e.stack ? e.stack : e) } });
  }
}

// --- state ---------------------------------------------------------------

let encoding = "utf-16";
const projects = new Map(); // handle -> { dir, rocq, theories, identity }
const cache = new Map(); // identity + content hash -> analysis
const lastGood = new Map(); // fileName -> printed TS

const sha = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex");
};

// At most one Rocq per core.
let running = 0;
const queue = [];
async function limited(fn) {
  if (running >= Math.max(1, os.cpus().length)) await new Promise((r) => queue.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    queue.shift()?.();
  }
}

function configFiles(theories) {
  const files = [];
  try {
    for (const f of fs.readdirSync(theories)) if (f.endsWith(".vo")) files.push(path.join(theories, f));
  } catch {}
  for (const f of fs.readdirSync(builderDir)) if (f.endsWith(".mjs")) files.push(path.join(builderDir, f));
  return files.sort();
}

function identityOf(rocq, theories, files) {
  const parts = [rocq, theories];
  for (const f of files) {
    try {
      parts.push(f, fs.readFileSync(f));
    } catch {
      parts.push(f, "missing");
    }
  }
  return sha(...parts);
}

// --- positions -----------------------------------------------------------

// UTF-16 offsets (JavaScript string indices) to UTF-8 byte offsets, when
// TypeScript asks for UTF-8.
function toEncoding(text) {
  if (encoding === "utf-16" || /^[\x00-\x7f]*$/.test(text)) return (i) => i;
  const prefix = new Uint32Array(text.length + 1);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const isHigh = c >= 0xd800 && c <= 0xdbff;
    prefix[i + 1] = prefix[i] + (c < 0x80 ? 1 : c < 0x800 ? 2 : isHigh ? 4 : c >= 0xdc00 && c <= 0xdfff ? 0 : 3);
  }
  return (i) => prefix[Math.min(i, text.length)];
}

// The name the printed header gives the file.
function label(dir, fileName) {
  const rel = path.relative(dir, fileName);
  return rel.startsWith("..") || path.isAbsolute(rel) ? path.basename(fileName) : rel.split(path.sep).join("/");
}

// --- handlers ------------------------------------------------------------

const handlers = {
  initialize(params) {
    const offered = params.positionEncodings ?? ["utf-16"];
    encoding = offered.includes("utf-16") ? "utf-16" : "utf-8";
    return { positionEncoding: encoding, diagnosticSource: "fold" };
  },

  openProject(params) {
    const dir = params.configFileName ? path.dirname(params.configFileName) : process.cwd();
    const options = params.options ?? {};
    const optionDiagnostics = [];
    for (const key of Object.keys(options)) {
      if (key !== "rocq" && key !== "theories") {
        optionDiagnostics.push({ path: [key], messageText: `Unknown option ${key}. The options are rocq and theories.`, code: 7 });
      } else if (typeof options[key] !== "string") {
        optionDiagnostics.push({ path: [key], messageText: `${key} is a path, relative to this tsconfig.`, code: 7 });
      }
    }
    const str = (k) => (typeof options[k] === "string" ? path.resolve(dir, options[k]) : undefined);
    const { rocq, theories } = rocqPaths({ rocq: str("rocq"), theories: str("theories") });
    if (!fs.existsSync(rocq)) optionDiagnostics.push({ path: options.rocq ? ["rocq"] : [], messageText: `Rocq is not at ${rocq}. Run make setup, or set the rocq option.`, code: 7 });
    if (!fs.existsSync(path.join(theories, "FoldAuto.vo"))) {
      optionDiagnostics.push({ path: options.theories ? ["theories"] : [], messageText: `The compiled theory is not at ${theories}. Run make proofs, or set the theories option.`, code: 7 });
    }
    const watchedFiles = configFiles(theories);
    const identity = identityOf(rocq, theories, watchedFiles);
    projects.set(params.projectHandle, { dir, rocq, theories, identity });
    debug("open", params.projectHandle, dir, identity.slice(0, 12));
    return { configIdentity: identity, watchedFiles, ...(optionDiagnostics.length ? { optionDiagnostics } : {}) };
  },

  async transform(params) {
    const p = projects.get(params.projectHandle);
    if (!p) throw new Error(`Unknown project ${params.projectHandle}`);
    const { fileName, content } = params;
    const key = sha(p.identity, content);
    let a = cache.get(key);
    if (!a) {
      const t0 = Date.now();
      a = await limited(() =>
        analyze(content, { file: label(p.dir, fileName), rocq: p.rocq, theories: p.theories }),
      );
      debug("transform", fileName, `${Date.now() - t0} ms`, `${a.diagnostics.length} diagnostics`);
      cache.set(key, a);
      if (cache.size > 200) cache.delete(cache.keys().next().value);
    }
    let text = a.ts;
    let mappings = a.mappings;
    if (text === null) {
      // The file does not parse or check: keep the last module Rocq printed
      // for it, unmapped, so importers keep their types.
      text = lastGood.get(fileName) ?? "export {};\n";
      mappings = [];
    } else {
      lastGood.set(fileName, text);
    }
    const o = toEncoding(content);
    const v = toEncoding(text);
    return {
      text,
      extension: ".ts",
      mappings: mappings.map(([vs, vl, os_, ol, k]) => [v(vs), v(vs + vl) - v(vs), o(os_), o(os_ + ol) - o(os_), k]),
      diagnostics: a.diagnostics.map((d) => ({ ...d, start: o(d.start), length: o(d.start + d.length) - o(d.start) })),
    };
  },

  closeProject(params) {
    projects.delete(params.projectHandle);
    return null;
  },

  shutdown() {
    return null;
  },
};
