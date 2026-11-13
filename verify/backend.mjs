import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { REPLAY_LIMIT } from "./data.mjs";
import { validHeap } from "./heap-witness.mjs";
import { validPredicateTable } from "./predicate-witness.mjs";

// Conservative theory/model profile required by the current source compiler.
export const CAPABILITIES = Object.freeze(["smtlib2", "binary64", "bitvectors", "reals", "fp-to-real", "uninterpreted-functions", "quantifiers", "models", "integers"]);
export const Z3 = Object.freeze({ name: "z3", protocol: 1, capabilities: CAPABILITIES, certificates: false });

export class BackendError extends Error {
  constructor(reason, message) { super(message); this.reason = reason; }
}

function descriptor(value) {
  if (!value || typeof value.name !== "string" || value.protocol !== 1 || !Array.isArray(value.capabilities)) {
    throw new BackendError("invalid-response", "Invalid backend capability descriptor.");
  }
  const missing = CAPABILITIES.filter((c) => !value.capabilities.includes(c));
  if (missing.length) throw new BackendError("backend-capability", `Backend ${value.name} lacks ${missing.join(", ")}.`);
  return value;
}

function witness(model, value) {
  if (model.kind === "undefined") return value === null;
  if (model.kind === "optional") return value === null || witness(model.value, value);
  if (model.kind === "number") return typeof value === "string" && /^[0-9a-f]{16}$/.test(value);
  if (model.kind === "boolean") return value === "true" || value === "false";
  if (model.kind === "function") {
    return model.params.length === 1 && model.params[0] === "number" && model.result === "boolean" && validPredicateTable(value, REPLAY_LIMIT);
  }
  if (model.kind === "ref") return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
  if (model.kind === "heap") return validHeap(model, value, REPLAY_LIMIT);
  if (model.kind === "array") return Array.isArray(value) && value.length <= REPLAY_LIMIT && value.every((v) => witness({ kind: model.element }, v));
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => model.fields.some((f) => f.name === key)) &&
    model.fields.every((f) => Object.hasOwn(value, f.name) ? witness(f.model, value[f.name]) : !!f.keyFlag);
}

const INVALID = "The backend returned an invalid query result or witness.";
const HEAP_TYPES = Object.freeze({ reason: "witness-invalid", message: "The backend heap witness does not conform to its reference types." });
const SHAPE = Object.freeze({ reason: "invalid-response", message: INVALID });
const ROOTS = Object.freeze({ reason: "witness-invalid", message: "The heap graph roots disagree with parameter identities." });

// The whole replay-witness contract for one query's models: value shapes,
// replay caps, predicate tables, heap reference types, and root identities.
// Returns undefined for a conforming witness, otherwise the failure it is.
// Live backend answers and persisted cache witnesses share this one check.
export function validWitness(models, value) {
  const heapAt = models.findIndex((m) => m.kind === "heap");
  if (heapAt !== -1 && Array.isArray(value) && !validHeap(models[heapAt], value[heapAt], REPLAY_LIMIT)) return HEAP_TYPES;
  if (!Array.isArray(value) || value.length !== models.length || !models.every((m, i) => witness(m, value[i]))) return SHAPE;
  if (heapAt !== -1) {
    const roots = models.flatMap((m, i) => m.kind === "ref" ? [value[i]] : []);
    if (JSON.stringify(roots) !== JSON.stringify(value[heapAt].roots)) return ROOTS;
  }
}

function answer(value, models) {
  const invalid = () => { throw new BackendError("invalid-response", INVALID); };
  if (!value || !["sat", "unsat", "unknown"].includes(value.status)) invalid();
  if (value.status === "sat") {
    if (value.oversized === true && !Object.hasOwn(value, "witness")) return value;
    const failure = validWitness(models, value.witness);
    if (failure === HEAP_TYPES) throw new BackendError(failure.reason, failure.message);
    if (value.oversized || failure === SHAPE) invalid();
    if (failure) throw new BackendError(failure.reason, failure.message);
  } else if (Object.hasOwn(value, "witness") || Object.hasOwn(value, "oversized") || value.status === "unknown" && typeof value.reason !== "string") invalid();
  return value;
}

// One connection per worker slot. Construction options stay out of verify().
export function createBackend({ worker = new URL("./solver.mjs", import.meta.url), timers = { setTimeout, clearTimeout } } = {}) {
  let child, closed, pending, failure, sequence = 0;
  const fail = (error) => {
    failure ??= error;
    pending?.reject(failure);
  };
  const exchange = (timeoutMs, send) => new Promise((resolve, reject) => {
    if (failure) return reject(failure);
    if (pending) return reject(new BackendError("worker-error", "A backend connection accepts only one active query."));
    const timer = timers.setTimeout(() => fail(new BackendError("worker-timeout", "The backend worker exceeded its wall-clock query budget.")), timeoutMs);
    const finish = (fn) => (value) => { timers.clearTimeout(timer); pending = undefined; fn(value); };
    pending = { resolve: finish(resolve), reject: finish(reject) };
    send?.();
  });
  return {
    async start(timeoutMs) {
      child = spawn(process.execPath, [fileURLToPath(worker)], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
      let stderr = "";
      child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-8192); });
      child.on("error", (e) => fail(new BackendError("worker-error", e.message)));
      closed = new Promise((resolve) => child.on("close", (code, signal) => {
        fail(new BackendError("worker-error", stderr.trim() || `Backend worker exited ${signal ?? code}.`));
        resolve();
      }));
      child.on("message", (message) => {
        if (!pending) return fail(new BackendError("invalid-response", "Unexpected backend message."));
        pending.resolve(message);
      });
      const message = await exchange(timeoutMs);
      if (message?.type !== "ready") throw new BackendError("invalid-response", "The backend did not announce its capabilities.");
      return descriptor(message.backend);
    },
    async check(query, timeoutMs) {
      const id = ++sequence;
      const message = await exchange(timeoutMs, () => child.send({ type: "check", id, query, timeoutMs }, (e) => {
        if (e) fail(new BackendError("worker-error", e.message));
      }));
      if (message?.id !== id) throw new BackendError("invalid-response", "The backend returned a result for a different query.");
      if (message.type === "error" && typeof message.message === "string") throw new BackendError("worker-error", message.message);
      if (message.type !== "result") throw new BackendError("invalid-response", "The backend returned an invalid response.");
      return answer(message.answer, query.models);
    },
    async close() {
      if (!child) return;
      child.kill("SIGKILL");
      await closed;
    },
  };
}
