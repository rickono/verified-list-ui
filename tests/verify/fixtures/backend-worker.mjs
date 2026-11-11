// Controlled IPC peer. It never invokes a solver or supplies real proof evidence.
import { Z3 } from "../../../verify/backend.mjs";
import { REPLAY_LIMIT } from "../../../verify/data.mjs";
process.send({ type: "ready", backend: Z3 });
process.on("message", ({ id, query }) => {
  const mode = query.assertions[0];
  if (mode === "hang") return;
  if (mode === "crash") { process.stderr.write("controlled crash\n"); process.exit(7); }
  if (mode === "signal") { process.kill(process.pid, "SIGKILL"); return; }
  if (mode === "error") { process.send({ type: "error", id, message: "controlled adapter error" }); return; }
  const answer = mode === "verdict" ? { status: "verified" }
    : mode === "predicate-too-many" ? { status: "sat", witness: [{ entries: Array.from({ length: REPLAY_LIMIT + 1 }, () => [["0000000000000000"], "true"]), else: "false" }] }
    : mode === "predicate-conflict" ? { status: "sat", witness: [{ entries: [[["7ff8000000000000"], "true"], [["7ff0000000000001"], "false"]], else: "false" }] }
    : mode === "heap-wrong-sort" ? { status: "sat", witness: ["0", { roots: ["0"], nodes: { "0": { kind: "object", fields: { x: ["bool", "true"] } } } }] }
    : mode === "bad-witness" ? { status: "sat", witness: ["not-a-number"] }
    : mode === "missing-witness" ? { status: "sat" }
    : mode === "unknown" ? { status: "unknown", reason: "incomplete" }
    : { status: "unsat" };
  process.send({ type: "result", id: mode === "wrong-id" ? id + 1 : id, answer });
});
