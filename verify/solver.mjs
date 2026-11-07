// One process per verification request: the parent owns the wall-clock
// budget, and process exit also releases Z3's WASM worker threads.
import { init, killThreads } from "z3-solver";
import { REPLAY_LIMIT } from "./data.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const api = await init();
try {
  const ctx = new api.Context("source_verification");
  const outcomes = [];
  const tooLarge = Symbol("witness-too-large");
  const deadline = Date.now() + request.timeoutMs;
  for (const target of request.targets) {
    const makeSolver = (post, small = false) => {
      const s = new ctx.Solver();
      s.fromString(`${target.declarations}\n(assert ${target.pre})\n${post ? `(assert (not ${target.post}))` : ""}\n${small ? `(assert ${target.smallWitness})` : ""}`);
      return s;
    };
    let solver = makeSolver(false);
    const check = async () => {
      solver.set("timeout", Math.max(1, deadline - Date.now()));
      const status = await solver.check();
      return { status, reason: status === "unknown" ? solver.reasonUnknown() : undefined };
    };
    const inputs = () => {
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
      const result = target.params.map((p) => read(p.model));
      return result.some((v) => v === tooLarge) ? null : result;
    };
    // Bounds are added only to a second, satisfiable witness search. Every
    // proof and the initial feasibility query retain the full input domain.
    const witness = async (post) => {
      const first = inputs();
      if (first) return { witness: first };
      solver.release(); solver = makeSolver(post, true);
      const small = await check();
      if (small.status === "sat") {
        const value = inputs();
        if (value) return { witness: value };
      }
      return { status: "unknown", reason: small.status === "unknown" ? small.reason : "witness-too-large" };
    };
    const feasible = await check();
    if (feasible.status === "unsat") outcomes.push({ status: "vacuous" });
    else if (feasible.status === "unknown") outcomes.push({ status: "unknown", reason: feasible.reason });
    else {
      const before = await witness(false);
      if (!before.witness) outcomes.push(before);
      else {
        solver.release(); solver = makeSolver(true);
        const result = await check();
        if (result.status === "unsat") outcomes.push({ status: "verified", witness: before.witness });
        else if (result.status === "unknown") outcomes.push({ status: "unknown", reason: result.reason });
        else {
          const counterexample = await witness(true);
          outcomes.push(counterexample.witness ? { status: "counterexample", witness: counterexample.witness } : counterexample);
        }
      }
    }
    solver.release();
  }
  process.stdout.write(JSON.stringify(outcomes));
} catch (e) {
  process.stdout.write(JSON.stringify({ error: e.message }));
} finally {
  await killThreads(api.em);
}
