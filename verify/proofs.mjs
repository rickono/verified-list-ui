import { performance } from "node:perf_hooks";
import { createBackend } from "./backend.mjs";

const SMALL = new Set(["feasibility-witness", "counterexample-witness"]);
const POST = new Set(["postcondition", "counterexample-witness"]);
const attribution = (target, phase, index) => ({
  target: target.id, phase, domain: SMALL.has(phase) ? "replay-witness" : "full",
  ...(POST.has(phase) ? { postcondition: index + 1, postconditionCount: target.postconditions.length } : {}),
});

export function obligation(target, phase, index = 0) {
  return {
    ...attribution(target, phase, index),
    declarations: target.declarations,
    assertions: [target.pre,
      ...(POST.has(phase) ? [`(not ${target.postconditions[index]})`] : []),
      ...(SMALL.has(phase) ? [target.smallWitness] : [])],
    models: target.params.map((p) => p.model),
  };
}

// Returns provisional outcomes. Only index.mjs can confirm them by replay and
// resolve final dependencies. The injectable connection/clock are internal.
export async function solve(targets, timeoutMs, { connect = createBackend, now = () => performance.now() } = {}) {
  const deadline = now() + timeoutMs;
  const states = targets.map((target) => ({ target, phase: "feasibility", postcondition: 0, attempts: 0 }));
  const queue = [...states];
  const width = Math.min(2, targets.length), active = new Set();
  const remaining = () => Math.max(0, Math.floor(deadline - now()));
  const diagnostic = (s, reason, message, detail) => ({
    status: reason === "worker-error" || reason === "invalid-response" || reason === "backend-capability" ? "error" : "unknown",
    reason, message, obligation: { ...attribution(s.target, s.phase, s.postcondition), backend: s.backend ?? "z3" },
    attempts: s.attempts, ...(detail ? { solverReason: detail } : {}),
  });
  const slot = async () => {
    let backend, name;
    const close = async () => { if (backend) { await backend.close(); backend = undefined; } };
    try {
      while (queue.length && remaining() > 0) {
        const s = queue.shift();
        active.add(s);
        if (!backend) {
          backend = connect();
          try { name = (await backend.start(remaining())).name; }
          catch (e) {
            s.outcome = diagnostic(s, e.reason === "worker-timeout" ? "request-timeout" : e.reason ?? "worker-error", `Backend initialization failed: ${e.message}`);
            active.delete(s);
            await close();
            continue;
          }
        }
        s.backend = name;
        const rounds = Math.max(1, Math.ceil((queue.length + active.size) / width));
        const turnDeadline = Math.min(deadline, now() + Math.max(1, Math.floor(remaining() / rounds)));
        while (!s.outcome && Math.floor(turnDeadline - now()) > 0 && remaining() > 0) {
          const budget = Math.min(remaining(), Math.floor(turnDeadline - now()));
          let result;
          try { s.attempts++; result = await backend.check(obligation(s.target, s.phase, s.postcondition), budget); }
          catch (e) {
            await close();
            if (e.reason === "worker-timeout") { s.detail = e.message; break; }
            s.outcome = diagnostic(s, e.reason ?? "worker-error", e.message);
            break;
          }
          if (now() > deadline) { s.detail = "The query response arrived after the request deadline."; break; }
          if (result.status === "unknown") {
            s.detail = result.reason;
            if (/^(timeout|canceled)$/.test(result.reason)) break;
            s.outcome = diagnostic(s, "solver-unknown", "The solver could not decide this obligation.", result.reason);
          } else if (s.phase === "feasibility") {
            if (result.status === "unsat") s.outcome = { status: "vacuous" };
            else if (result.oversized) s.phase = "feasibility-witness";
            else { s.witness = result.witness; s.phase = "postcondition"; }
          } else if (s.phase === "postcondition") {
            if (result.status === "unsat") {
              if (++s.postcondition === s.target.postconditions.length) s.outcome = { status: "verified", witness: s.witness };
            } else if (result.oversized) s.phase = "counterexample-witness";
            else s.outcome = { status: "counterexample", witness: result.witness };
          } else if (result.status === "unsat" || result.oversized) {
            s.outcome = diagnostic(s, "witness-too-large", "No replayable witness was found; the proof domain was not bounded.");
          } else if (s.phase === "feasibility-witness") {
            s.witness = result.witness; s.phase = "postcondition";
          } else s.outcome = { status: "counterexample", witness: result.witness };
        }
        active.delete(s);
        if (!s.outcome) queue.push(s);
      }
    } finally { await close(); }
  };
  await Promise.all(Array.from({ length: width }, slot));
  return states.map((s) => s.outcome ?? diagnostic(s, "request-timeout", "The shared wall-clock verification budget was exhausted.", s.detail));
}
