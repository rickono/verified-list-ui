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
    // PROTOTYPE heap: a ref is its Int identity; the heap is the entry graph
    // reachable from the root refs, one node per identity (aliases share).
    if (m.kind === "ref") return String(model.eval(ctx.Int.const(m.symbol), true).value());
    if (m.kind === "heap") return graph(m);
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
  const graph = (m) => {
    const slotKey = (key) => Buffer.from(key).toString("hex");
    const fn = (name, sort) => ctx.Function.declare(name, ctx.Int.sort(), sort);
    const at = (name, sort, id) => model.eval(fn(name, sort).call(ctx.Int.val(BigInt(id))), true);
    const roots = m.roots.map((symbol) => String(model.eval(ctx.Int.const(symbol), true).value()));
    const nodes = {}, queue = [...roots];
    while (queue.length) {
      const id = queue.shift();
      if (Object.hasOwn(nodes, id)) continue;
      if (Object.keys(nodes).length >= REPLAY_LIMIT) return tooLarge;
      if (String(at("heap_kind", ctx.Int.sort(), id)) === "1") {
        const length = Number(at("heap_length", ctx.BitVec.sort(32), id).value());
        if (length > REPLAY_LIMIT) return tooLarge;
        const element = String(at("heap_element", ctx.Int.sort(), id)) === "2" ? "boolean" : "number", values = [];
        const cell = (name, sort, i) => model.eval(ctx.Function.declare(name, ctx.Int.sort(), ctx.BitVec.sort(32), sort).call(ctx.Int.val(BigInt(id)), ctx.BitVec.val(i,32)), true);
        for (let i = 0; i < length; i++) values.push((String(at("heap_array_dense", ctx.Bool.sort(), id)) !== "true" && String(cell("heap_array_has_raw", ctx.Bool.sort(), i)) !== "true") ? ["undef"] : element === "number"
          ? ["num", cell("heap_array_num", ctx.BitVec.sort(64), i).value().toString(16).padStart(16,"0")] : ["bool", String(cell("heap_array_bool", ctx.Bool.sort(), i))]);
        nodes[id] = { kind: "array", element, values };
      } else {
        const fields = {}; nodes[id] = { kind: "object", fields };
        for (const k of m.keys) {
          if (String(at(`heap_has_${slotKey(k)}`, ctx.Bool.sort(), id)) !== "true") continue;
          const tag = Number(at(`heap_sort_${slotKey(k)}`, ctx.Int.sort(), id).value());
          if (tag === 1) fields[k] = ["num", at(`heap_num_${slotKey(k)}`, ctx.BitVec.sort(64), id).value().toString(16).padStart(16,"0")];
          else if (tag === 2) fields[k] = ["bool", String(at(`heap_bool_${slotKey(k)}`, ctx.Bool.sort(), id))];
          else if (tag === 3 || tag === 4) { const r = String(at(`heap_ref_${slotKey(k)}`,ctx.Int.sort(),id).value()); fields[k] = ["ref",r]; queue.push(r); }
          else fields[k] = ["undef"];
        }
      }
    }
    return { roots, nodes };
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
