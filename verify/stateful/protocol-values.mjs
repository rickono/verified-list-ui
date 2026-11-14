import { sha256 } from "./ast.mjs";
import { encodeValue } from "./values.mjs";
export const replaySchemaSha256 = sha256("C2a-trace-v2:typed-interned-handles;owned-input-graph;call;invoke;allocate;abort;dispatch;resolve;reject;settle-abort;all-suffixes;adjacent-handler-cuts;FP64-bits");
export const handleValue = (sort, id) => ({ type: "handle", sort, id });
export const isHandle = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 3 && v.type === "handle" && ["target", "controller", "signal", "remover"].includes(v.sort) && typeof v.id === "string" && /^[1-9][0-9]*$/.test(v.id);
export const encodeProtocolValue = (v) => isHandle(v) ? { ...v } : encodeValue(v);
export function protocolTraceOf(machine, actions, { inputs = [], targets = Object.fromEntries([...machine.targets.keys()].map((name, i) => [name, String(i + 1)])) } = {}) {
  return { version: 2, sourceSha256: machine.sourceSha256, executableSha256: machine.executableSha256, assumptionsSha256: machine.assumptions.sha256,
    protocolSha256: machine.protocol.sha256, replaySchemaSha256, inputs, targets,
    actions: actions.map((a) => a.kind === "call" ? { ...a, args: a.args.map(encodeProtocolValue) } : a.kind === "resolve" || a.kind === "settle-abort" ? { ...a, value: encodeValue(a.value) } : { ...a }) };
}
