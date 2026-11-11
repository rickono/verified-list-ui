// One process per isolated backend connection, owned and reaped by its parent.
// This adapter answers isolated SMT queries. It never issues source verdicts.
import { init } from "z3-solver";
import { performance } from "node:perf_hooks";
import { REPLAY_LIMIT } from "./data.mjs";
import { Z3 } from "./backend.mjs";
import { floatBits, validPredicateTable } from "./predicate-witness.mjs";

const api = await init();
const ctx = new api.Context("source_verification");
const tooLarge = Symbol("witness-too-large");
const incomplete = Symbol("function-witness-incomplete");
// A function model is replayable only as a finite table of VALUE entries with
// a constant fallback. Anything else is an honest unknown, never a guess.
function table(model, m) {
  const decl = model.decls().find((d) => d.name() === m.symbol);
  const constant = (kind, v) => {
    if (kind === "number") return ctx.isFPVal(v) ? floatBits(v.sexpr()) ?? incomplete : incomplete;
    const text = String(v);
    return text === "true" || text === "false" ? text : incomplete;
  };
  if (!decl) return { entries: [], else: "false" };
  const interp = model.get(decl);
  if (!ctx.isFuncInterp(interp)) return incomplete;
  if (interp.numEntries() > REPLAY_LIMIT) return incomplete;
  const entries = [];
  for (let i = 0; i < interp.numEntries(); i++) {
    const e = interp.entry(i);
    const args = m.params.map((kind, j) => constant(kind, e.argValue(j)));
    const value = constant(m.result, e.value());
    if (args.includes(incomplete) || value === incomplete) return incomplete;
    entries.push([args, value]);
  }
  const fallback = constant(m.result, interp.elseValue());
  const result = { entries, else: fallback };
  return fallback === incomplete || !validPredicateTable(result, REPLAY_LIMIT) ? incomplete : result;
}

function inputs(solver, models, replayGuards) {
  const model = solver.model();
  if (replayGuards.some((symbol) => String(model.eval(ctx.Bool.const(symbol), true)) !== "true")) return { oversized: true };
  const read = (m) => {
    if (m.kind === "undefined") return null;
    if (m.kind === "optional") return String(model.eval(ctx.Bool.const(m.flag), true)) === "true" ? read(m.value) : null;
    if (m.kind === "number") return model.eval(ctx.BitVec.const(m.symbol, 64), true).value().toString(16).padStart(16, "0");
    if (m.kind === "boolean") return String(model.eval(ctx.Bool.const(m.symbol), true));
    if (m.kind === "function") return table(model, m);
    if (m.kind === "array") {
      const length = Number(model.eval(ctx.BitVec.const(m.length, 32), true).value());
      if (length > REPLAY_LIMIT) return tooLarge;
      const f = ctx.Function.declare(m.at, ctx.BitVec.sort(32), m.element === "number" ? ctx.BitVec.sort(64) : ctx.Bool.sort());
      return Array.from({ length }, (_, i) => {
        const v = model.eval(f.call(ctx.BitVec.val(i, 32)), true);
        return m.element === "number" ? v.value().toString(16).padStart(16, "0") : String(v);
      });
    }
    const fields = m.fields.filter((f) => !f.keyFlag || String(model.eval(ctx.Bool.const(f.keyFlag), true)) === "true")
      .map((f) => [f.name, read(f.model)]);
    return fields.some(([, v]) => v === tooLarge) ? tooLarge : Object.fromEntries(fields);
  };
  const values = models.map(read);
  if (values.some((v) => v === incomplete)) return { incomplete: true };
  return values.some((v) => v === tooLarge) ? { oversized: true } : { witness: values };
}

let busy = false;
process.on("message", async (message) => {
  if (busy || message?.type !== "check") process.exit(2);
  busy = true;
  let solver;
  try {
    const { query, timeoutMs } = message;
    const deadline = performance.now() + timeoutMs;
    solver = new ctx.Solver();
    solver.fromString(`${query.declarations}\n${query.assertions.map((a) => `(assert ${a})`).join("\n")}`);
    // Leave time for reason/model extraction and IPC within the parent's hard
    // turn budget. No grace period extends the shared request deadline.
    solver.set("timeout", Math.max(1, Math.floor(deadline - performance.now() - Math.min(100, timeoutMs / 10))));
    const status = await solver.check();
    const read = status === "sat" ? inputs(solver, query.models, query.replayGuards ?? []) : undefined;
    const answer = read?.incomplete ? { status: "unknown", reason: "function-witness-incomplete" }
      : status === "sat" ? { status, ...read }
      : status === "unknown" ? { status, reason: solver.reasonUnknown() } : { status };
    process.send({ type: "result", id: message.id, answer });
  } catch (e) {
    process.send({ type: "error", id: message.id, message: e.message });
  } finally {
    solver?.release();
    busy = false;
  }
});
process.send({ type: "ready", backend: Z3 });
