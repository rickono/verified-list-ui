import { performance } from "node:perf_hooks";
import { SourceError } from "../error.mjs";
import { solve } from "../proofs.mjs";
import { machineOf } from "./machine.mjs";
import { transitionsOf } from "./transitions.mjs";
import { searchWitness } from "./traces.mjs";
import { decodeValue } from "./values.mjs";
import { sha256 } from "./ast.mjs";

const trusted = ["Acorn and Node type stripping", "closed stateful frontend and AST binding rewrites", "existing source body/expression/heap compiler", "representative init/step/keeps induction", "existing proof scheduler and Z3 binary64 backend", "strict native JavaScript replay and timed process containment"];
function seedsIn(value, out = []) {
  if (typeof value === "string" && /^[a-f0-9]{16}$/.test(value)) out.push(decodeValue({ type: "number", bits: value }));
  else if (value && typeof value === "object") for (const v of Object.values(value)) seedsIn(v, out);
  return out;
}
export async function checkStateful(file, source, { timeoutMs = 60_000, maxDepth = 4 } = {}) {
  if (typeof file !== "string" || typeof source !== "string") throw new TypeError("checkStateful accepts a file name and source text, never a transition relation.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxDepth) || maxDepth < 0) throw new TypeError("timeoutMs must be a positive integer; maxDepth must be a nonnegative witness-search depth.");
  const deadline = performance.now() + timeoutMs;
  const report = { file, sourceSha256: sha256(source), trusted };
  let machine, transitions;
  try { machine = machineOf(file, source); transitions = transitionsOf(machine); }
  catch (e) {
    if (!(e instanceof SourceError)) throw e;
    const prefix = source.slice(0, e.span.start).split("\n");
    return { ...report, status: e.status, message: e.message, span: e.span, line: prefix.length, column: prefix.at(-1).length + 1 };
  }
  Object.assign(report, { executableSha256: machine.executableSha256, assumptions: machine.assumptions, unitsSha256: transitions.sha256,
    properties: [...machine.state, ...machine.always].map(({ kind, text, span }) => ({ kind, text, span })) });
  const outcomes = await solve(transitions.units.map((u) => u.target), Math.max(1, Math.floor(deadline - performance.now())));
  report.units = transitions.units.map((u, i) => ({ unit: u.name, kind: u.kind, span: u.span, ...(u.keeps ? { keeps: u.keeps } : {}),
    scope: "abstract induction obligation; satisfiable is not an application counterexample", ...outcomes[i] }));
  const bad = report.units.filter((u) => !["verified", "vacuous"].includes(u.status));
  if (!bad.length) return { ...report, status: "verified", scope: "safety for arbitrary-length sequences and unboundedly many activations under the recorded assumptions" };
  const errors = bad.filter((u) => u.status === "error");
  if (errors.length) return { ...report, status: "error", reason: errors[0].reason, message: errors[0].message };
  const abstract = bad.map((u) => u.unit);
  if (performance.now() < deadline) {
    const witness = await searchWitness(machine, { maxDepth, seeds: seedsIn(outcomes), deadline });
    if (witness.status === "ok" && witness.violation) return { ...report, status: "counterexample", confirmed: "strict native replay of the unchanged executable source",
      violated: witness.violation, trace: witness.trace, searched: witness.searched, abstract };
    if (witness.reason === "replay-timeout" || witness.reason === "replay-runtime") return { ...report, status: "unknown", reason: witness.reason, searched: witness.searched, abstract, message: witness.message };
    report.searched = witness.searched;
  } else report.searched = { maxDepth, executions: 0, stopped: "request-budget" };
  const uncertain = bad.filter((u) => u.status === "unknown");
  if (uncertain.length) return { ...report, status: "unknown", reason: "solver", abstract,
    solver: uncertain.map(({ unit, reason, obligation, solverReason, message }) => ({ unit, reason, obligation, solverReason, message })) };
  return { ...report, status: "unknown", reason: "induction-gap", abstract,
    message: "An abstract induction obligation is satisfiable. Bounded native search found no property failure; its exhaustion is not a proof." };
}
