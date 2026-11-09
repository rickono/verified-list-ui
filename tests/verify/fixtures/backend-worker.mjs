// Controlled IPC peer. It never invokes a solver or supplies real proof evidence.
import { Z3 } from "../../../verify/backend.mjs";
process.send({ type: "ready", backend: Z3 });
process.on("message", ({ id, query }) => {
  const mode = query.assertions[0];
  if (mode === "hang") return;
  if (mode === "crash") { process.stderr.write("controlled crash\n"); process.exit(7); }
  if (mode === "signal") { process.kill(process.pid, "SIGKILL"); return; }
  if (mode === "error") { process.send({ type: "error", id, message: "controlled adapter error" }); return; }
  const answer = mode === "verdict" ? { status: "verified" }
    : mode === "bad-witness" ? { status: "sat", witness: ["not-a-number"] }
    : mode === "missing-witness" ? { status: "sat" }
    : mode === "unknown" ? { status: "unknown", reason: "incomplete" }
    : { status: "unsat" };
  process.send({ type: "result", id: mode === "wrong-id" ? id + 1 : id, answer });
});
