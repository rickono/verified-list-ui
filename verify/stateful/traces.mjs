import { fork } from "node:child_process";
import { performance } from "node:perf_hooks";
import { machineOf } from "./machine.mjs";
import { encodeValue, decodeValue, traceOf } from "./values.mjs";
export { encodeValue, decodeValue, traceOf } from "./values.mjs";

export function replaySession(machine, { timeoutMs = 100 } = {}) {
  let child, closed, pending, sequence = 0, failed;
  const failure = (reason, message) => {
    failed ??= { status: "unknown", reason, message };
    pending?.(failed); child?.kill("SIGKILL");
  };
  const exchange = (message) => new Promise((resolve) => {
    if (failed) return resolve(failed);
    const id = ++sequence;
    const timer = setTimeout(() => failure("replay-timeout", "Native replay containment deadline exceeded."), Math.min(700, Math.max(300, timeoutMs + 200)));
    pending = (value) => { clearTimeout(timer); pending = undefined; resolve(value); };
    child.send({ ...message, id }, (e) => { if (e) failure("replay-runtime", e.message); });
  });
  return {
    async start() {
      child = fork(new URL("./replay-worker.mjs", import.meta.url), [], { stdio: ["ignore", "ignore", "ignore", "ipc"], execArgv: [], serialization: "advanced" });
      closed = new Promise((resolve) => child.on("close", () => { if (pending) failure("replay-runtime", "Replay worker exited."); resolve(); }));
      child.on("error", (e) => failure("replay-runtime", e.message));
      child.on("message", (message) => {
        if (message?.id !== sequence) return failure("replay-runtime", "Replay worker returned a different request identity.");
        pending?.(message.result ?? (message.ready ? { status: "ready" } : { status: "unknown", reason: "replay-runtime" }));
      });
      return exchange({ type: "init", file: machine.file, source: machine.source });
    },
    execute(trace) { return exchange({ type: "replay", trace, timeoutMs }); },
    async close() { if (child) { child.kill("SIGKILL"); await closed; } },
  };
}

export async function replayTrace(file, source, trace, options) {
  const session = replaySession(machineOf(file, source), options);
  try { const started = await session.start(); return started.status === "ready" ? await session.execute(trace) : started; }
  finally { await session.close(); }
}

const unique = (xs) => xs.filter((v, i) => xs.findIndex((w) => Object.is(v, w)) === i);
/** Finite BFS can confirm a property failure, never authorize a proof. */
export async function searchWitness(machine, { maxDepth = 4, seeds = [], deadline = Infinity } = {}) {
  const pool = unique([0, 1, NaN, Infinity, -Infinity, -0, ...seeds]).slice(0, 10);
  const bounds = { maxDepth, numbers: pool.map(encodeValue), entryArguments: [0, 1], maxExecutions: 5_000 };
  const session = replaySession(machine);
  let executions = 0, layer = [{ actions: [], requests: [] }];
  try {
    const started = await session.start();
    if (started.status !== "ready") return { ...started, searched: { ...bounds, executions } };
    const initial = await session.execute(traceOf(machine, [])); executions++;
    if (initial.violation) return { ...initial, searched: { ...bounds, executions } };
    for (let depth = 1; depth <= maxDepth; depth++) {
      const next = [];
      for (const node of layer) {
        const calls = machine.entries.flatMap((e) => {
          const args = e.params.length === 0 ? [[]] : [0, 1].map((v) => e.params.map((p) => p.type === "boolean" ? !!v : v));
          return args.map((args) => ({ kind: "call", entry: e.name, args }));
        });
        const options = [...calls, ...node.requests.filter((r) => !r.settled).flatMap((r) => {
          const op = machine.environment.get(r.op);
          const values = op.result === "boolean" ? [false, true] : pool;
          return [...values.map((value) => ({ kind: "resolve", request: r.seq, op: r.op, value })), ...(op.rejects ? [{ kind: "reject", request: r.seq, op: r.op }] : [])];
        })];
        for (const action of options) {
          if (performance.now() >= deadline || executions >= bounds.maxExecutions) return { status: "unknown", reason: "witness-budget", searched: { ...bounds, depth, executions } };
          const actions = [...node.actions, action], result = await session.execute(traceOf(machine, actions)); executions++;
          if (result.violation || result.status === "unknown") return { ...result, searched: { ...bounds, depth, executions } };
          if (result.status === "illegal-environment-action") continue;
          next.push({ actions, requests: result.requests });
        }
      }
      layer = next;
    }
    return { status: "exhausted", searched: { ...bounds, executions } };
  } finally { await session.close(); }
}
