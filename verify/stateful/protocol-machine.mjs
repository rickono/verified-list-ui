import { fail } from "../error.mjs";
import { references, reference, walk, span, sha256 } from "./ast.mjs";
import { globals, handles, primitives } from "./environment.mjs";

export function protocolOf(machine) {
  const record = { version: "C2a-1", event: machine.targets.size ? "node22-event-target-v1" : "none", runtime: "v22.23.1",
    registry: "initially empty; source-owned; outside mutation excluded", capture: false,
    delivery: "synchronous registration order; no external actions or microtasks between handlers",
    abort: "advisory contents only; no request or invocation deletion", scalarStutters: "external allocation and abort observe stutters of module cells", identity: "unbounded; allocation history; compatible inputs may alias",
    counts: "unsupported", temporal: "unsupported" };
  return { ...record, sha256: sha256(JSON.stringify(record)) };
}

export function protocolEntryOf(machine, fn, types, clauses, used, moduleNames) {
  if (fn.generator) fail("Generators are unsupported.", fn);
  const names = new Set([...moduleNames, "AbortController", "AbortSignal", "EventTarget", "Event", ...globals, "result", "old", "real"]);
  const bindings = new Map([...machine.targets].map(([name, t]) => [name, { name, type: "EventTarget", node: t.node, kind: "ambient" }]));
  const declare = (node, type, kind, init) => {
    if (node.type !== "Identifier" || node.name.startsWith("$") || names.has(node.name)) fail("Duplicate, shadowed or reserved protocol binding.", node);
    names.add(node.name);
    const b = { name: node.name, type, kind, node, init, declaration: { file: machine.file, sourceSha256: machine.sourceSha256, ...span(node) } };
    bindings.set(node.name, b); return b;
  };
  const params = fn.params.map((p) => {
    const type = types.get(p.end);
    if (!primitives.has(type) && !handles.has(type)) fail("Entry parameters need scalar or protocol handle annotations.", p);
    if (type === "EventTarget") fail("C2a targets are ambient, source-owned protocol declarations.", p);
    return declare(p, type, "parameter");
  });
  const closures = [], actions = new Map(), knownCalls = new Set(), knownAwaits = new Set();
  const typeOf = (n) => n?.type === "Identifier" ? bindings.get(n.name)?.type ?? machine.cells.get(n.name)?.type
    : n?.type === "Literal" ? typeof n.value : n?.type === "UnaryExpression" && ["-", "+"].includes(n.operator) && n.argument.type === "Literal" ? typeof n.argument.value
    : n?.type === "MemberExpression" && !n.computed && !n.optional && n.property.name === "signal" && typeOf(n.object) === "AbortController" ? "AbortSignal" : undefined;
  const handle = (n) => {
    if (!handles.has(typeOf(n))) fail("Expected a resolved protocol handle or immutable alias.", n);
    return typeOf(n);
  };
  const closureOf = (node, remover = false) => {
    if (node.async || node.generator || node.params.length) fail("C2a handlers/removers are synchronous arrows without parameters or payload access.", node);
    const captures = [];
    for (const name of references(node.body)) {
      if (machine.cells.has(name) || globals.has(name)) continue;
      const b = bindings.get(name);
      if (!b || !["const", "parameter", "ambient"].includes(b.kind) || !remover && !primitives.has(b.type)) fail(`Unsupported or mutable closure capture ${name}.`, node);
      captures.push(b);
    }
    if (remover) {
      if (node.body.type !== "CallExpression") fail("Only a simple expression-bodied returned remover is admitted.", node.body);
      registration(node.body, true);
    } else walk(node.body, (n) => {
      if (["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration", "AwaitExpression", "NewExpression", "VariableDeclaration", "ThisExpression", "TryStatement"].includes(n.type)) fail("Unsupported handler syntax/effects in C2a.", n);
      if (n.type === "CallExpression" && !(n.callee.type === "MemberExpression" && !n.callee.computed && n.callee.object.type === "Identifier" && ["Number", "Math", "Object"].includes(n.callee.object.name))) fail("Handlers cannot mutate registrations, reenter dispatch or call helpers.", n);
      const target = n.type === "AssignmentExpression" ? n.left : n.type === "UpdateExpression" ? n.argument : undefined;
      if (target && (target.type !== "Identifier" || !machine.cells.has(target.name))) fail("Handlers may write only declared scalar module cells.", target);
    });
    const c = { name: `$closure_${node.start}`, node, captures, kind: remover ? "remover" : "handler", ...span(node) };
    closures.push(c); return c;
  };
  function registration(call, removeOnly = false) {
    const c = call.callee;
    if (c.type !== "MemberExpression" || c.computed || c.optional || call.optional || typeOf(c.object) !== "EventTarget" || !["addEventListener", "removeEventListener"].includes(c.property.name)) fail("Only resolved EventTarget registration methods are admitted.", call);
    if (removeOnly && c.property.name !== "removeEventListener") fail("Returned remover must remove a listener.", call);
    if (call.arguments.length !== 2 || call.arguments[0].type !== "Literal" || typeof call.arguments[0].value !== "string") fail("Event names are literals; listener options are unsupported.", call);
    const cb = call.arguments[1];
    const closure = cb.type === "ArrowFunctionExpression" ? closureOf(cb) : cb.type === "Identifier" && bindings.get(cb.name)?.closure;
    if (!closure || closure.kind !== "handler") fail("Listener must be a resolved source closure or its immutable alias.", cb);
    knownCalls.add(call);
    return { kind: c.property.name === "addEventListener" ? "add" : "remove", receiver: c.object, event: call.arguments[0].value, callback: cb, closure, node: call };
  }
  const awaits = [], segments = [[]];
  for (const statement of fn.body.body) {
    const d = statement.type === "VariableDeclaration" && statement.declarations.length === 1 ? statement.declarations[0] : undefined;
    const aw = d?.init?.type === "AwaitExpression" ? d.init : statement.type === "ExpressionStatement" && statement.expression.type === "AwaitExpression" ? statement.expression : undefined;
    if (aw) {
      if (!fn.async || aw.argument.type !== "CallExpression" || aw.argument.callee.type !== "Identifier" || !machine.environment.has(aw.argument.callee.name)) fail("Only top-level declared environment awaits are admitted.", aw);
      const call = aw.argument, op = machine.environment.get(call.callee.name);
      if (call.arguments.length !== op.params.length || call.arguments.some((a, i) => typeOf(a) !== op.params[i].type)) fail("Environment request argument domain mismatch.", call);
      if (d && (statement.kind !== "const" || types.get(d.id.end) && types.get(d.id.end) !== op.result)) fail("Await result needs a const scalar binding of the declared type.", d);
      const pending = []; let cursor = statement.start;
      for (const c of clauses.filter((c) => c.comment.end <= cursor).reverse()) {
        if (machine.source.slice(c.comment.end, cursor).trim()) break;
        if (c.kind === "pending") { pending.unshift(c); used.add(c); }
        cursor = c.comment.start;
      }
      const w = { op, call, statement, binding: d?.id.name, bindingNode: d?.id, pending, ...span(statement) };
      // Retain all visible immutable bindings, an overapproximation in proof
      // arity, never a bound on the number of pending requests.
      w.captures = [...bindings.values()].filter((b) => b.kind !== "ambient");
      for (const b of w.captures) if (!["parameter", "const"].includes(b.kind) || !primitives.has(b.type) && !handles.has(b.type)) fail("Await captures require immutable scalar/handle bindings.", b.node);
      w.captures.push(...op.params.map((p, i) => ({ name: `$request_${i}`, type: p.type, node: call.arguments[i], argument: true })));
      awaits.push(w); knownCalls.add(call); knownAwaits.add(aw); segments.push([]);
      if (d) declare(d.id, op.result, "const", aw);
      continue;
    }
    if (d) {
      if (!d.init || statement.declarations.length !== 1) fail("Use one initialized declaration per statement.", statement);
      let b;
      if (d.init.type === "ArrowFunctionExpression") {
        if (statement.kind !== "const") fail("Closure bindings are immutable.", d);
        const closure = closureOf(d.init); b = declare(d.id, "closure", "const", d.init); b.closure = closure;
        actions.set(statement, { kind: "closure", binding: b, closure });
      } else if (d.init.type === "NewExpression") {
        if (statement.kind !== "const" || d.init.callee.type !== "Identifier" || d.init.callee.name !== "AbortController" || d.init.arguments.length) fail("Only unshadowed zero-argument AbortController constructors are admitted.", d.init);
        b = declare(d.id, "AbortController", "const", d.init); actions.set(statement, { kind: "allocate", binding: b, node: d.init });
      } else if (handles.has(typeOf(d.init)) || typeOf(d.init) === "closure") {
        if (statement.kind !== "const") fail("Handle aliases must be immutable.", d);
        const type = typeOf(d.init); handleOrClosure(d.init);
        b = declare(d.id, type, "const", d.init); b.closure = bindings.get(d.init.name)?.closure;
        actions.set(statement, { kind: "alias", binding: b, value: d.init });
      } else b = declare(d.id, types.get(d.id.end) ?? typeOf(d.init), statement.kind, d.init);
      if (types.has(d.id.end) && types.get(d.id.end) !== b.type) fail("Declaration annotation mismatches its protocol/scalar initializer.", d);
    } else if (statement.type === "ExpressionStatement" && statement.expression.type === "CallExpression") {
      const call = statement.expression, c = call.callee;
      if (c.type === "MemberExpression" && ["addEventListener", "removeEventListener"].includes(c.property.name)) actions.set(statement, registration(call));
      else if (c.type === "MemberExpression" && !c.computed && !c.optional && c.property.name === "abort" && typeOf(c.object) === "AbortController" && !call.optional && !call.arguments.length) {
        knownCalls.add(call); actions.set(statement, { kind: "abort", receiver: c.object, node: call });
      }
    } else if (statement.type === "ReturnStatement" && statement.argument) {
      if (statement.argument.type === "ArrowFunctionExpression") actions.set(statement, { kind: "return-remover", closure: closureOf(statement.argument, true) });
      else if (handles.has(typeOf(statement.argument))) { handle(statement.argument); actions.set(statement, { kind: "return-handle", value: statement.argument }); }
      else if (typeOf(statement.argument) === "closure") fail("Return the simple remover expression directly.", statement);
    }
    segments.at(-1).push(statement);
  }
  function handleOrClosure(n) { if (typeOf(n) === "closure") return; handle(n); }
  // No nested protocol operations or erased/unvisited effects. The ordinary
  // compiler separately checks every remaining scalar expression.
  walk(fn.body, (n, p, key) => {
    if (closures.some((c) => c.node === n)) return false;
    if (["FunctionDeclaration", "FunctionExpression", "ClassDeclaration", "ClassExpression", "TryStatement", "ImportExpression", "NewExpression"].includes(n.type) && ![...actions.values()].some((a) => a.node === n && a.kind === "allocate")) fail("Unsupported protocol source syntax/effects.", n);
    if (n.type === "AwaitExpression" && !knownAwaits.has(n)) fail("await must be top-level.", n);
    if (n.type === "ArrowFunctionExpression") fail("Unadmitted callback value; protocol callbacks cannot be H predicates.", n);
    if (n.type === "CallExpression" && !knownCalls.has(n) && !(n.callee.type === "MemberExpression" && !n.callee.computed && n.callee.object.type === "Identifier" && ["Number", "Math", "Object"].includes(n.callee.object.name))) fail("Unadmitted protocol call/helper/effect.", n);
    const target = n.type === "AssignmentExpression" ? n.left : n.type === "UpdateExpression" ? n.argument : undefined;
    if (target && (target.type !== "Identifier" || !machine.cells.has(target.name) && !primitives.has(bindings.get(target.name)?.type))) fail("Reference stores and handle mutation are unsupported.", target);
    if (n.type === "MemberExpression" && !n.computed && reference(n.object, n, "object") && handles.has(typeOf(n.object)) && !knownCalls.has(p)) {
      if (!(typeOf(n.object) === "AbortSignal" && n.property.name === "aborted" || typeOf(n.object) === "AbortController" && n.property.name === "signal")) fail("Unsupported handle property read.", n);
    }
  });
  if (awaits.length > 1) fail("Multiple awaits in a protocol entry need continuation-owned request identities; C1 scalar entries remain supported.", awaits[1]);
  for (let k = 0; k < awaits.length; k++) for (const s of segments[k]) walk(s, (n) => { if (n.type === "ReturnStatement") fail("Returns before later awaits are unsupported.", n); });
  return { name: fn.id.name, fn, params, segments, awaits, bindings, closures, actions, ...span(fn) };
}
