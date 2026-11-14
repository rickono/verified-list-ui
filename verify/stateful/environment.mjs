import { fail } from "../error.mjs";
import { sha256, references } from "./ast.mjs";

export const globals = new Set(["Number", "Math", "Object", "Array", "NaN", "Infinity", "undefined"]);
export const handles = new Set(["EventTarget", "AbortController", "AbortSignal"]);
export const primitives = new Set(["number", "boolean"]);
export function environmentOf(declarations, clauses, source) {
  const environment = new Map(), targets = new Map(), used = new Set();
  for (const declaration of declarations) {
    if (environment.has(declaration.name) || targets.has(declaration.name)) fail("Duplicate environment declaration.", declaration);
    const block = [];
    let cursor = declaration.start;
    for (const c of clauses.filter((c) => c.comment.end <= cursor).reverse()) {
      if (source.slice(c.comment.end, cursor).trim()) break;
      block.unshift(c); cursor = c.comment.start;
    }
    const marker = block.findIndex((c) => c.kind === "@environment");
    if (marker < 0) fail("Ambient functions require an @environment block.", declaration);
    const own = block.slice(marker);
    const seen = new Set();
    for (const c of own) {
      if (!["@environment", "resolves", "rejects", "settles", "protocol", "abort"].includes(c.kind)) fail("Unknown line in environment block.", c.comment);
      if (seen.has(c.kind) && c.kind !== "resolves") fail(`Duplicate ${c.kind} clause.`, c.span);
      seen.add(c.kind); used.add(c);
      if (c.kind === "resolves") for (const name of references(c.ast))
        if (name !== "result" && !globals.has(name) && !declaration.params?.some((p) => p.name === name)) fail(`Unknown resolves binding ${name}.`, c.span);
    }
    if (declaration.type === "EventTarget") {
      if (own.length !== 2 || !seen.has("protocol")) fail("EventTarget needs exactly the pinned protocol block.", declaration);
      targets.set(declaration.name, declaration); continue;
    }
    if (seen.has("protocol")) fail("protocol belongs to an ambient EventTarget.", declaration);
    const abort = own.find((c) => c.kind === "abort");
    if (abort && !declaration.params?.some((p) => p.name === abort.text.split(" ")[1] && p.type === "AbortSignal")) fail("Advisory abort must name a signal parameter.", abort.span);
    if (declaration.params.some((p) => handles.has(p.type)) && !abort) fail("Signal operations need an advisory abort clause.", declaration);
    for (const c of own.filter((c) => c.kind === "resolves")) for (const name of references(c.ast))
      if (declaration.params.some((p) => p.name === name && handles.has(p.type))) fail("Handle reads in resolves are unsupported.", c.span);
    if (environment.has(declaration.name)) fail("Duplicate environment operation.", declaration);
    environment.set(declaration.name, { ...declaration, resolves: own.filter((c) => c.kind === "resolves"), rejects: seen.has("rejects"), settles: seen.has("settles") ? "eventually" : "may-never-settle", order: "any", ...(abort ? { abort: { mode: "advisory", parameter: abort.text.split(" ")[1] } } : {}) });
  }
  return { environment, targets, used };
}

export function assumptionsOf(machine) {
  const record = {
    numericDomain: "JavaScript binary64 (including NaN, infinities, signed zero and 2^53 identity collisions)",
    eventBound: null,
    scheduler: "JS run-to-completion; external actions with microtasks drained before the next environment action",
    entryCalls: "external only; no entry-to-entry or recursive calls; unboundedly repeated",
    activationPool: "unbounded multiset; distinct identities per invocation, unary pending invariants",
    initial: Object.fromEntries([...machine.cells].map(([name, c]) => [name, machine.source.slice(c.init.start, c.init.end)])),
    environment: [...machine.environment.values()].map((op) => ({ op: op.name, params: op.params.map(({ name, type }) => ({ name, type })), result: op.result,
      resolves: op.resolves.map((c) => c.text), rejects: op.rejects ? "may-reject" : "never-rejects", settles: op.settles,
      settlementOrder: "any", settlementCount: "at most once per request", settlesUse: op.settles === "eventually" ? "declared-unused for safety" : "not declared; no progress guarantee" })),
    entries: machine.entries.map((e) => ({ entry: e.name, params: e.params.map(({ name, type }) => ({ name, type })) })),
    fairness: "none used by safety; settles eventually is recorded only",
    unsupported: ["references", "imports", "handlers", "cancellation", "ordering/abort contracts", "entry contracts", "liveness", "pairwise/uniqueness/count induction", "nested awaits", "entry-to-entry calls", "unverified helpers"],
  };
  if (machine.protocol) {
    record.protocol = machine.protocol;
    record.observationCuts = machine.targets.size ? "adjacent source handlers; empty dispatch stutters; no outer nonempty-dispatch check" : "C1 action cuts";
    record.handleInputs = "compatible inputs may alias; signals may already be aborted; controller.signal has one stable owner; signals excluded from EventTarget domain";
    record.environment = record.environment.map((op) => ({ ...op, abort: machine.environment.get(op.op).abort ?? "none" }));
    record.unsupported = ["imports", "general reference stores", "mutable captures", "async listeners", "payloads", "options", "handler registration mutation", "reentrancy", "EventEmitter", "signal-as-target", "reject-on-abort", "counts/uniqueness/temporal clauses"];
  }
  return { ...record, sha256: sha256(JSON.stringify(record)) };
}
