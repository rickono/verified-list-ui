import { performance } from "node:perf_hooks";
import { createBackend } from "./backend.mjs";

const SMALL = new Set(["requires-definedness-witness", "feasibility-witness", "counterexample-witness"]);
const DEFINED = new Set(["requires-definedness", "requires-definedness-witness"]);
const POST = new Set(["postcondition", "counterexample-witness"]);
const attribution = (target, phase, index) => ({
  target: target.id, phase, domain: SMALL.has(phase) ? "replay-witness" : "full",
  ...(POST.has(phase) ? { postcondition: index + 1, postconditionCount: target.postconditions.length } : {}),
});

// The scheduler and proof identity use the same finite state graph. Terminals
// are outcomes, not queries. Small-witness queries never restrict a proof.
function plan(target) {
  const nodes = [];
  const add = (phase, index, unsat, sat, oversized) => nodes.push({ phase, index, unsat, sat, oversized });
  const ce = { status: "counterexample" }, tooLarge = { status: "witness-too-large" };
  if (target.preDefined && target.preDefined !== "true") {
    const defined = { ...ce, phase: "requires-definedness" };
    add("requires-definedness", 0, "feasibility:0", defined, "requires-definedness-witness:0");
    add("requires-definedness-witness", 0, tooLarge, defined, tooLarge);
  }
  add("feasibility", 0, { status: "vacuous" }, "postcondition:0", "feasibility-witness:0");
  add("feasibility-witness", 0, tooLarge, "postcondition:0", tooLarge);
  for (let i = 0; i < target.postconditions.length; i++) {
    add("postcondition", i, i + 1 === target.postconditions.length ? { status: "verified" } : `postcondition:${i + 1}`, ce, `counterexample-witness:${i}`);
    add("counterexample-witness", i, tooLarge, ce, tooLarge);
  }
  return nodes;
}
export const phases = (target) => plan(target).map(({ phase, index }) => [phase, index]);

export function obligation(target, phase, index = 0) {
  return {
    ...attribution(target, phase, index),
    declarations: target.declarations,
    assertions: [DEFINED.has(phase) ? `(not ${target.preDefined})` : target.pre,
      ...(POST.has(phase) ? [`(not ${target.postconditions[index]})`] : []),
      ...(SMALL.has(phase) ? [target.smallWitness, ...(!DEFINED.has(phase) ? target.replayGuards ?? [] : [])] : [])],
    models: [...target.params.map((p) => p.model), ...(target.probes ?? []).flatMap((p) => p.models), ...(target.heapModel ? [target.heapModel] : [])],
    replayGuards: DEFINED.has(phase) ? [] : target.replayGuards ?? [],
  };
}

// Returns provisional outcomes. Only index.mjs can confirm them by replay and
// resolve final dependencies. The injectable connection/clock are internal.
export async function solve(targets, timeoutMs, { connect = createBackend, now = () => performance.now() } = {}) {
  const deadline = now() + timeoutMs;
  const states = targets.map((target) => {
    const nodes = plan(target);
    return { target, nodes, phase: nodes[0].phase, postcondition: nodes[0].index, attempts: 0 };
  });
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
          } else {
            const node = s.nodes.find((n) => n.phase === s.phase && n.index === s.postcondition);
            const edge = result.status === "unsat" ? node.unsat : result.oversized ? node.oversized : node.sat;
            if (typeof edge === "string") {
              if (result.status === "sat" && !result.oversized && s.phase.startsWith("feasibility")) s.witness = result.witness;
              const next = s.nodes.find((n) => `${n.phase}:${n.index}` === edge);
              s.phase = next.phase; s.postcondition = next.index;
            } else if (edge.status === "witness-too-large") {
              s.outcome = diagnostic(s, "witness-too-large", s.phase === "requires-definedness-witness"
                ? "No replayable definedness witness was found; the proof domain was not bounded."
                : "No replayable witness was found; the proof domain was not bounded.");
            } else s.outcome = { ...edge, ...(edge.status === "verified" ? { witness: s.witness }
              : edge.status === "counterexample" ? { witness: result.witness } : {}) };
          }
        }
        active.delete(s);
        if (!s.outcome) queue.push(s);
      }
    } finally { await close(); }
  };
  await Promise.all(Array.from({ length: width }, slot));
  // Source labels let index.mjs tell an unconfirmed loop abstraction from a bug.
  return states.map((s) => {
    const o = s.outcome ?? diagnostic(s, "request-timeout", "The shared wall-clock verification budget was exhausted.", s.detail);
    const label = POST.has(s.phase) ? s.target.obligations?.[s.postcondition] : undefined;
    return label ? { ...o, label } : o;
  });
}
