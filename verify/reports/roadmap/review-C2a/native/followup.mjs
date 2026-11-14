import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const code = "c1df5f6a7302dc70ede1c43649aa61295d3d80f7";
const repo = "/Users/rick/.t3/worktrees/verified-list-ui/t3-12ed5a98";
const modules = "/Users/rick/verification-vibes/verified-list-ui/node_modules";
const root = join(tmpdir(), `c2a-followup-${process.pid}`);
const source = `// @environment
// resolves true
// abort advisory signal
declare function lookup(q: number, signal: AbortSignal): Promise<boolean>;
let x = false;
// state true
// always x !== old(x)
export async function search(q: number, signal: AbortSignal) {
  x = !x;
  await lookup(q, signal);
  x = !x;
}
`;
const h = (sort, id) => ({ type: "handle", sort, id });
const graph = [{ id: "10", signal: "11", aborted: false }, { id: "20", signal: "21", aborted: false }];
mkdirSync(root, { recursive: true });
const tar = execFileSync("git", ["archive", code, "verify/stateful", "verify/source.mjs", "verify/proofs.mjs", "verify/error.mjs", "verify/solver.mjs", "verify/backend.mjs", "verify/data.mjs", "verify/types.mjs", "verify/specifications.mjs", "verify/heap.mjs", "verify/predicate-witness.mjs", "verify/heap-witness.mjs"], { cwd: repo, maxBuffer: 2_000_000 });
execFileSync("tar", ["-x", "-C", root], { input: tar });
symlinkSync(modules, join(root, "node_modules"));
const base = pathToFileURL(join(root, "verify/stateful/"));
const { machineOf } = await import(new URL("machine.mjs", base));
const { replayTrace, traceOf } = await import(new URL("traces.mjs", base));
const out = [];
try {
  const machine = machineOf("follow.ts", source);
  const call = { kind: "call", entry: "search", args: [0, h("signal", "11")] };
  const play = async (id, actions, mutate) => {
    const trace = traceOf(machine, actions, { inputs: graph });
    mutate?.(trace);
    const result = await replayTrace(machine.file, source, trace);
    out.push({ id, status: result.status, reason: result.reason ?? null, message: result.message ?? null, violation: result.violation ?? null,
      x: result.trace?.steps?.at(-1)?.state?.x ?? null,
      cuts: result.trace?.steps?.filter((step) => step.action.kind !== "init").map((step) => ({ action: step.action.kind, x: step.state.x, cuts: step.cuts?.map((cut) => cut.kind) })),
      requests: result.requests ?? null, signals: result.signals ?? null, invocations: result.invocations ?? null });
  };
  await play("call", [call]);
  await play("abort", [call, { kind: "abort", controller: h("controller", "10") }]);
  await play("settle", [call, { kind: "settle-abort", request: 1, op: "lookup", value: true, controller: h("controller", "10") }]);
  await play("crafted-id", [call], (trace) => { trace.actions[0].args[1] = { type: "handle", sort: "signal", id: "01" }; });
} finally {
  rmSync(root, { recursive: true, force: true });
}
const text = JSON.stringify(out, null, 2);
await import("node:fs").then(({ writeFileSync }) => writeFileSync(new URL("followup.json", import.meta.url), text));
console.log(text);
