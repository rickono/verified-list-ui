import { Script, createContext } from "node:vm";
import { reference, walk } from "./ast.mjs";
import { decodeValue, encodeValue } from "./values.mjs";

// Only observation expressions are rendered. Application execution uses the
// unchanged type-stripped source, with export keywords blanked at their spans.
function expression(machine, ast, names, pre) {
  const edits = [];
  walk(ast, (n, p, key) => {
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "old") {
      edits.push([n.start, n.end, `(${expression(machine, n.arguments[0], pre, pre)})`]); return false;
    }
    if (reference(n, p, key) && names.has(n.name)) {
      edits.push([n.start, n.end, names.get(n.name)]); return false;
    }
  });
  edits.sort((a, b) => a[0] - b[0]);
  let text = "", cursor = ast.start;
  for (const [start, end, replacement] of edits) { text += machine.source.slice(cursor, start) + replacement; cursor = end; }
  return text + machine.source.slice(cursor, ast.end);
}
class IllegalAction extends Error {}
const illegal = (message) => { throw new IllegalAction(message); };
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
const shape = (value, type) => typeof value === type;

/** Synchronous native run, called only within the owned containment process. */
export function executeNative(machine, envelope, timeoutMs) {
  const steps = [];
  try {
    for (const [key, expected] of Object.entries({ version: 1, sourceSha256: machine.sourceSha256, executableSha256: machine.executableSha256, assumptionsSha256: machine.assumptions.sha256 }))
      if (envelope?.[key] !== expected) illegal(`Trace ${key} mismatch.`);
    if (!Array.isArray(envelope.actions)) illegal("Trace actions must be an array.");
    const context = createContext(Object.create(null), { microtaskMode: "afterEvaluate", codeGeneration: { strings: false, wasm: false } });
    const run = (text, filename = "stateful-replay-harness") => new Script(`"use strict";\n${text}`, { filename }).runInContext(context, { timeout: timeoutMs });
    run(`const $requests = [], $faults = [], $rejection = Object.freeze({environmentRejection: true});
      let $returned, $args, $value, $pre, $post;
      const $fault = e => { if(e !== $rejection) $faults.push(String(e?.message ?? e)); };`);
    for (const op of machine.environment.values()) {
      run(`globalThis[${JSON.stringify(op.name)}] = (...args) => {
        if (args.length !== ${op.params.length} || ![${op.params.map((p, i) => `typeof args[${i}] === ${JSON.stringify(p.type)}`).join(",")}].every(Boolean)) throw new Error("Environment request argument domain violation");
        return new Promise((resolve,reject) => $requests.push({seq:$requests.length+1, op:${JSON.stringify(op.name)}, args, resolve, reject, settled:false}));
      };`);
    }
    run(machine.executable, machine.file);
    const observe = () => run(`({${[...machine.cells.keys()].join(",")}})`);
    const encodedState = (state) => Object.fromEntries([...machine.cells.keys()].map((name) => [name, encodeValue(state[name])]));
    const postNames = new Map([...machine.cells.keys()].map((name) => [name, `$post.${name}`]));
    const preNames = new Map([...machine.cells.keys()].map((name) => [name, `$pre.${name}`]));
    const check = (pre, post) => {
      context.$pre = pre; context.$post = post;
      // Read harness values into lexical bindings via a timed realm invocation.
      run("$pre = globalThis.$pre; $post = globalThis.$post;");
      for (const c of [...machine.state, ...(pre ? machine.always : [])]) {
        if (run(`(${expression(machine, c.ast, postNames, preNames)})`) !== true) return { kind: c.kind, text: c.text, span: c.span };
      }
    };
    let state = observe(), violation = check(undefined, state);
    steps.push({ step: 0, action: { kind: "init" }, state: encodedState(state) });
    const open = () => run("$requests.map(({seq,op,args,settled})=>({seq,op,args,settled}))")
      .map((r) => ({ ...r, args: [...r.args].map(encodeValue) }));
    let firstViolation = violation;
    for (const action of envelope.actions) {
      const pre = state;
      if (action?.kind === "call") {
        if (!keys(action, ["kind", "entry", "args"]) || typeof action.entry !== "string" || !Array.isArray(action.args)) illegal("Invalid call action shape.");
        const entry = machine.entries.find((e) => e.name === action.entry);
        if (!entry || action.args.length !== entry.params.length) illegal("Invalid entry or argument count.");
        let args;
        try { args = action.args.map(decodeValue); } catch { illegal("Invalid argument encoding."); }
        if (!entry.params.every((p, i) => shape(args[i], p.type))) illegal("Invalid entry argument domain.");
        context.$args = args; run("$args = globalThis.$args;");
        run(`try { $returned = ${entry.name}(...$args); if($returned instanceof Promise) $returned.catch($fault); } catch(e) { $fault(e); }`);
      } else if (action?.kind === "resolve" || action?.kind === "reject") {
        if (!keys(action, action.kind === "resolve" ? ["kind", "request", "op", "value"] : ["kind", "request", "op"]) || !Number.isSafeInteger(action.request) || action.request < 1 || typeof action.op !== "string") illegal("Invalid settlement action shape.");
        const request = run(`$requests[${action.request - 1}]`);
        if (!request || request.settled || request.op !== action.op) illegal("Request identity is not pending or its operation differs.");
        const op = machine.environment.get(request.op);
        if (action.kind === "reject") {
          if (!op.rejects) illegal("Environment never-rejects assumption forbids rejection.");
          run(`$requests[${action.request - 1}].settled = true; $requests[${action.request - 1}].reject($rejection);`);
        } else {
          let value;
          try { value = decodeValue(action.value); } catch { illegal("Invalid resolution encoding."); }
          if (!shape(value, op.result)) illegal("Invalid resolution result domain.");
          context.$value = value; run("$value = globalThis.$value;");
          const names = new Map([["result", "$value"], ...op.params.map((p, i) => [p.name, `$requests[${action.request - 1}].args[${i}]`])]);
          for (const c of op.resolves) if (run(`(${expression(machine, c.ast, names)})`) !== true) illegal("Resolution violates the declared resolves assumption.");
          run(`$requests[${action.request - 1}].settled = true; $requests[${action.request - 1}].resolve($value);`);
        }
      } else illegal("Unknown action type.");
      run("void 0;"); // Explicit timed microtask drain, also after invocation.
      state = observe(); violation = check(pre, state);
      steps.push({ step: steps.length, action, state: encodedState(state) });
      firstViolation ??= violation;
      const faults = run("$faults.slice()");
      if (faults.length) return { status: "unknown", reason: "replay-runtime", faults: [...faults], trace: { ...envelope, steps }, requests: open() };
    }
    if (envelope.steps && JSON.stringify(envelope.steps) !== JSON.stringify(steps)) illegal("Trace observations differ from unchanged-source replay.");
    return { status: "ok", trace: { ...envelope, steps }, ...(firstViolation ? { violation: firstViolation } : {}), requests: open() };
  } catch (e) {
    if (e instanceof IllegalAction) return { status: "illegal-environment-action", reason: "invalid-trace", message: e.message };
    return { status: "unknown", reason: e.code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ? "replay-timeout" : "replay-runtime", message: e.message };
  }
}
