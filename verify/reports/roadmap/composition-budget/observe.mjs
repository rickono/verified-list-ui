// Diagnostic-only IPC observer. It forwards every argument/answer unchanged.
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";

export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const smt = (query) => `${query.declarations}\n${query.assertions.map((a) => `(assert ${a})`).join("\n")}\n(check-sat)\n`;

export function observe() {
  const original = childProcess.spawn, events = [];
  let sequence = 0;
  childProcess.spawn = (...args) => {
    const child = original(...args);
    if (!args[1]?.some((a) => typeof a === "string" && a.endsWith("/verify/solver.mjs"))) return child;
    const worker = ++sequence, send = child.send, started = performance.now(), pending = new Map();
    events.push({ event: "spawn", worker, pid: child.pid });
    child.send = function (...values) {
      const message = values[0];
      if (message?.type === "check") {
        const { target, phase, domain, postcondition, postconditionCount } = message.query;
        const row = { event: "query", worker, id: message.id, target, phase, domain, postcondition, postconditionCount,
          budgetMs: message.timeoutMs, querySha256: sha(smt(message.query)), sentAtMs: performance.now() - started };
        pending.set(message.id, performance.now()); events.push(row);
      }
      return send.apply(this, values);
    };
    child.on("message", (message) => events.push({ event: "response", worker, ...message,
      elapsedMs: message.id ? performance.now() - pending.get(message.id) : performance.now() - started }));
    child.on("close", (code, signal) => events.push({ event: "close", worker, code, signal, elapsedMs: performance.now() - started }));
    return child;
  };
  syncBuiltinESMExports();
  return { events, stop() { childProcess.spawn = original; syncBuiltinESMExports(); } };
}
