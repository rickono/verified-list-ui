// Optional content-addressed proof receipts. A receipt says only that every
// full-domain query of one exact query set was unsat under one trusted-code
// identity, and which feasibility witness replay used. It never stores a
// verdict: index.mjs replays every hit against current source and re-gates its
// dependencies. Receipts carry no certificate; their integrity is trusted.
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { obligation, phases } from "./proofs.mjs";
import { validWitness } from "./backend.mjs";

export const FORMAT = 1;
export const MODES = Object.freeze(["readwrite", "readonly", "audit"]);
export const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
// A writer renames its temp file immediately after writing it. Only temps this
// much older than any live write are removed.
export const STALE_TEMP_MS = 60 * 60 * 1000;
const FIELDS = ["format", "identity", "key", "target", "witness"];
const SHARD = /^[0-9a-f]{2}$/;
const TEMP = /^([0-9a-f]{64})\.json\.([0-9a-f]{16})\.([1-9][0-9]*)\.[0-9a-f]{32}\.tmp$/;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const HOST = sha256(hostname()).slice(0, 16);
const validKey = (key) => typeof key === "string" && /^[0-9a-f]{64}$/.test(key);

// Attribution names the target and phase in diagnostics; it is never sent to
// the solver as formula text. Every other obligation field is solver input,
// including any field added later, so it is part of the key by default.
const ATTRIBUTION = new Set(["target", "phase", "domain", "postcondition", "postconditionCount"]);
export const solverInput = (query) => Object.fromEntries(Object.entries(query).filter(([k]) => !ATTRIBUTION.has(k)));

// The exact input of every query solve() can send for this target, under one
// trusted-code identity. Paths, spans and names are not solver input, so a
// relocated project or an alpha-equivalent function shares a receipt.
export function proofKey(target, identity) {
  return sha256(JSON.stringify([FORMAT, identity, phases(target).map(([phase, i]) => [phase, i, solverInput(obligation(target, phase, i))])]));
}
// A verified outcome's witness is its feasibility model; every phase of one
// target has the same models.
export const witnessModels = (target) => obligation(target, "feasibility").models;

function read(file) {
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { rejected: "not-a-file" };
    if (stat.size > MAX_ENTRY_BYTES) return { rejected: "oversized" };
    // Writers only rename complete files into place, so an entry's bytes do not
    // change after open. Bytes another process changes are still checked whole.
    const buffer = Buffer.alloc(stat.size);
    let length = 0, n;
    while (length < buffer.length && (n = readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += n;
    return { text: buffer.toString("utf8", 0, length) };
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return { miss: "absent" };
    if (e.code === "ELOOP" || e.code === "EISDIR") return { rejected: "not-a-file" };
    return { error: { op: "read", code: e.code ?? null, message: e.message } };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Removes only recognized temp files that are regular, in a recognized shard,
// named for that shard, and stale. Every failure leaves the file alone.
function sweep(dir, now) {
  let shards;
  try { shards = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const shard of shards) {
    if (!shard.isDirectory() || !SHARD.test(shard.name)) continue;
    let names;
    try { names = readdirSync(join(dir, shard.name)); } catch { continue; }
    for (const name of names) {
      const temp = TEMP.exec(name);
      if (!temp || temp[1].slice(0, 2) !== shard.name || temp[2] !== HOST) continue;
      const file = join(dir, shard.name, name);
      try {
        const stat = lstatSync(file);
        if (!stat.isFile() || now - stat.mtimeMs <= STALE_TEMP_MS) continue;
        // Age alone cannot distinguish a paused writer. Delete only local-host
        // writers whose process has ended; foreign/unknown owners stay untouched.
        try { process.kill(Number(temp[3]), 0); continue; }
        catch (e) { if (e.code !== "ESRCH") continue; }
        const again = lstatSync(file);
        if (again.ino === stat.ino && again.mtimeMs === stat.mtimeMs) unlinkSync(file);
      } catch { /* a concurrent writer or sweeper owns it */ }
    }
  }
}

// readwrite reads, writes and sweeps stale temps; readonly and audit only
// read. Nothing is created on disk except by a readwrite put.
export function openCache(dir, { mode = "readwrite" } = {}) {
  if (typeof dir !== "string" || !dir) throw new TypeError("Expected a cache directory string.");
  if (!MODES.includes(mode)) throw new TypeError(`Expected cache mode ${MODES.join(", ")}.`);
  dir = resolve(dir);
  const shard = (key) => join(dir, key.slice(0, 2));
  const path = (key) => join(shard(key), `${key}.json`);

  return {
    mode, dir, path,
    // {hit: witness} | {miss: "absent"} | {rejected: reason, detail?} | {error}
    get(key, target, identity) {
      if (!validKey(key)) throw new TypeError("Invalid proof key.");
      const got = read(path(key));
      if (!("text" in got)) return got;
      let entry;
      try { entry = JSON.parse(got.text); } catch { return { rejected: "unparseable" }; }
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join() !== FIELDS.join()) return { rejected: "schema" };
      if (entry.format !== FORMAT) return { rejected: "format" };
      if (entry.key !== key) return { rejected: "key-mismatch" };
      if (entry.identity !== identity) return { rejected: "identity-mismatch" };
      if (typeof entry.target !== "string") return { rejected: "schema" };
      const invalid = validWitness(witnessModels(target), entry.witness);
      return invalid ? { rejected: "witness-shape", detail: invalid.message } : { hit: entry.witness };
    },
    // {written: true} | {error}. Never throws; a failed put leaves no file of its own.
    put(key, target, identity, witness) {
      if (mode !== "readwrite") return { error: { op: "write", code: null, message: `The cache is open in ${mode} mode.` } };
      if (!validKey(key)) throw new TypeError("Invalid proof key.");
      const invalid = validWitness(witnessModels(target), witness);
      if (invalid) return { error: { op: "write", code: "witness-shape", message: invalid.message } };
      const text = JSON.stringify({ format: FORMAT, identity, key, target: target.id, witness });
      if (Buffer.byteLength(text) > MAX_ENTRY_BYTES) return { error: { op: "write", code: "oversized", message: "The receipt exceeds the cache entry size limit." } };
      sweep(dir, Date.now());
      const temp = `${path(key)}.${HOST}.${process.pid}.${randomBytes(16).toString("hex")}.tmp`;
      let fd, created = false;
      try {
        mkdirSync(shard(key), { recursive: true });
        fd = openSync(temp, "wx", 0o600); created = true;
        writeFileSync(fd, text);
        closeSync(fd); fd = undefined;
        renameSync(temp, path(key));
        return { written: true };
      } catch (e) {
        if (fd !== undefined) closeSync(fd);
        if (created) try { unlinkSync(temp); } catch { /* already gone */ }
        return { error: { op: "write", code: e.code ?? null, message: e.message } };
      }
    },
  };
}
