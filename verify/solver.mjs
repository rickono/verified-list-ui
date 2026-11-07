// One process per isolated backend connection, owned and reaped by its parent.
// This adapter answers isolated SMT queries. It never issues source verdicts.
import { init } from "z3-solver";
import { performance } from "node:perf_hooks";
import { REPLAY_LIMIT } from "./data.mjs";
import { Z3 } from "./backend.mjs";

const api = await init();
const ctx = new api.Context("source_verification");
const tooLarge = Symbol("witness-too-large");

function inputs(solver, models) {
  const model = solver.model();
  const read = (m) => {
    if (m.kind === "undefined") return null;
    if (m.kind === "optional") return String(model.eval(ctx.Bool.const(m.flag), true)) === "true" ? read(m.value) : null;
    if (m.kind === "number") return model.eval(ctx.BitVec.const(m.symbol, 64), true).value().toString(16).padStart(16, "0");
    if (m.kind === "boolean") return String(model.eval(ctx.Bool.const(m.symbol), true));
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
    const answer = status === "sat" ? { status, ...inputs(solver, query.models) }
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
