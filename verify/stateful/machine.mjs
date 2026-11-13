import { stripTypeScriptTypes } from "node:module";
import { Parser, tokenizer } from "acorn";
import { blame, fail } from "../error.mjs";
import { options, references, walk, sha256, span } from "./ast.mjs";
import { parseClauses } from "./clauses.mjs";
import { environmentOf, assumptionsOf, primitives, globals } from "./environment.mjs";

const reserved = new Set([...globals, "Object", "Array", "result", "old", "real"]);
function named(name, at, used) {
  if (name.startsWith("$") || reserved.has(name) || used.has(name)) fail(`Duplicate, shadowed or reserved binding ${name}.`, at);
  used.add(name);
}
function syntaxOf(source, stripped, program, strippedTokens) {
  const ambient = [], types = new Map(), ranges = [];
  let tokens;
  try { tokens = [...tokenizer(source, options)].map((t) => ({ ...t, text: source.slice(t.start, t.end) })); }
  catch (e) { fail(`Unsupported TypeScript token: ${e.message}`, { start: e.pos, end: e.pos + 1 }); }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].text !== "declare" || source.slice(tokens[i].start, tokens[i].end) === stripped.slice(tokens[i].start, tokens[i].end)) continue;
    const start = tokens[i].start;
    const expect = (text) => { const t = tokens[i++]; if (t?.text !== text) fail(`Environment declaration expected ${text}.`, t ?? { start, end: start + 1 }); return t; };
    const name = () => { const t = tokens[i++]; if (!t || !/^[A-Za-z_$][\w$]*$/.test(t.text)) fail("Expected a simple binding name.", t); return { type: "Identifier", name: t.text, start: t.start, end: t.end }; };
    expect("declare"); expect("function"); const operation = name(); expect("(");
    const params = [], seen = new Set();
    while (tokens[i]?.text !== ")") {
      const node = name(); named(node.name, node, seen); expect(":");
      const t = tokens[i++]; if (!primitives.has(t?.text)) fail("Environment parameters require scalar types.", t);
      params.push({ name: node.name, node, type: t.text });
      if (tokens[i]?.text === ")") break;
      expect(",");
    }
    expect(")"); expect(":"); expect("Promise"); expect("<");
    const t = tokens[i++]; if (!primitives.has(t?.text)) fail("Environment results require scalar types.", t);
    expect(">"); const end = expect(";").end;
    ambient.push({ name: operation.name, params, result: t.text, start, end }); ranges.push({ start, end });
    i--;
  }
  const annotation = (id, until) => {
    const text = source.slice(id.end, until).trim();
    if (!text) return;
    const match = /^:\s*(number|boolean)$/.exec(text);
    if (!match) fail("Only scalar annotations are supported; optional/default/rest parameters and assertions are unsupported.", id);
    types.set(id.end, match[1]); ranges.push({ start: id.end, end: until });
  };
  walk(program, (n) => {
    if (n.type === "FunctionDeclaration") {
      for (const p of n.params) {
        if (p.type !== "Identifier") fail("Entry parameters require simple scalar bindings.", p);
        annotation(p, strippedTokens.find((t) => t.start >= p.end).start);
      }
      const close = [...strippedTokens].reverse().find((t) => t.start < n.body.start && t.end > (n.params.at(-1)?.end ?? n.start) && t.type.label === ")");
      const text = source.slice(close.end, n.body.start).trim();
      if (text) {
        if (!/^:\s*(?:(?:number|boolean|void)|Promise\s*<\s*(?:number|boolean|void)\s*>)$/.test(text)) fail("Unsupported entry return annotation.", n);
        ranges.push({ start: close.end, end: n.body.start });
      }
    }
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init) {
      const equals = strippedTokens.find((t) => t.start >= n.id.end && t.start < n.init.start && t.value === "=");
      if (equals) annotation(n.id, equals.start);
    }
  });
  for (const t of tokens) for (let i = t.start; i < t.end; i++)
    if (source[i] !== stripped[i] && !ranges.some((r) => i >= r.start && i < r.end)) fail("Unmodeled erased runtime syntax is unsupported.", t);
  return { ambient, types };
}

export function machineOf(file, source) {
  if (typeof file !== "string" || typeof source !== "string") throw new TypeError("checkStateful accepts a file name and source text, never a transition relation.");
  return blame(file, undefined, () => {
    let stripped;
    try { stripped = stripTypeScriptTypes(source, { mode: "strip" }); }
    catch (e) { fail(`TypeScript stripping failed: ${e.message}`, { start: 0, end: 1 }); }
    if (stripped.length !== source.length) fail("Type stripping changed source offsets.");
    const comments = [], tokens = [];
    let program;
    try { program = Parser.parse(stripped, { ...options, onComment: comments, onToken: tokens }); }
    catch (e) { fail(e.message, { start: e.pos, end: e.pos + 1 }); }
    const syntax = syntaxOf(source, stripped, program, tokens);
    const clauses = parseClauses(comments), { environment, used } = environmentOf(syntax.ambient, clauses, source);
    const cells = new Map(), functions = [], names = new Set();
    for (const op of environment.values()) named(op.name, op, names);
    for (const top of program.body) {
      if (top.type === "VariableDeclaration" && top.kind === "let") {
        for (const d of top.declarations) {
          if (d.id.type !== "Identifier" || !d.init) fail("Module state requires literal-initialized scalar let cells.", d);
          named(d.id.name, d.id, names);
          const literal = d.init.type === "UnaryExpression" && ["-", "+"].includes(d.init.operator) ? d.init.argument : d.init;
          if (literal.type !== "Literal" || !primitives.has(typeof literal.value) || d.init !== literal && typeof literal.value !== "number") fail("Module cell initializers must be number or boolean literals.", d.init);
          const type = syntax.types.get(d.id.end) ?? typeof literal.value;
          if (!primitives.has(type) || type !== typeof literal.value) fail("Module cell type must match its scalar initializer.", d);
          cells.set(d.id.name, { name: d.id.name, type, init: d.init, node: d.id, ...span(d) });
        }
      } else if (top.type === "ExportNamedDeclaration" && top.declaration?.type === "FunctionDeclaration") {
        const fn = top.declaration;
        named(fn.id.name, fn.id, names); functions.push(fn);
      } else if (top.type !== "EmptyStatement") fail(`Unsupported stateful top-level ${top.type}.`, top);
    }
    if (!cells.size || !functions.length) fail("Stateful modules require scalar cells and exported entries.", program);
    const inside = (c) => functions.some((f) => c.comment.start >= f.start && c.comment.end <= f.end);
    const state = [], always = [];
    for (const c of clauses) if (["state", "always"].includes(c.kind)) {
      if (inside(c)) fail("State and always properties belong at module scope.", c.span);
      for (const name of references(c.ast)) if (!cells.has(name) && !globals.has(name) && !(name === "old" && c.kind === "always")) fail(`Unknown property binding ${name}.`, c.span);
      (c.kind === "state" ? state : always).push(c); used.add(c);
    }
    if (!state.length && !always.length) fail("No state or always property; pending clauses alone cannot establish safety.", program);
    const machine = { file, source, stripped, program, tokens, clauses, environment, cells, state, always, sourceSha256: sha256(source), entries: [] };
    for (const fn of functions) machine.entries.push(entryOf(machine, fn, syntax.types, clauses, used, names));
    for (const c of clauses) if (c.kind && !used.has(c)) fail(`Misplaced ${c.kind} clause.`, c.span);
    let executable = stripped;
    for (const top of program.body) if (top.type === "ExportNamedDeclaration") executable = executable.slice(0, top.start) + " ".repeat(top.declaration.start - top.start) + executable.slice(top.declaration.start);
    machine.executable = executable;
    machine.executableSha256 = sha256(executable);
    machine.assumptions = assumptionsOf(machine);
    return machine;
  });
}

function entryOf(machine, fn, types, clauses, used, moduleNames) {
  if (fn.generator) fail("Generators are unsupported.", fn);
  const names = new Set(moduleNames), bindings = new Map();
  const params = fn.params.map((p) => {
    if (p.type !== "Identifier" || !primitives.has(types.get(p.end))) fail("Entry parameters need simple names and scalar annotations.", p);
    named(p.name, p, names);
    const binding = { name: p.name, type: types.get(p.end), node: p, kind: "parameter" };
    bindings.set(p.name, binding); return binding;
  });
  const awaits = [], segments = [[]], known = new Set(), visible = new Map(bindings);
  for (const statement of fn.body.body) {
    const d = statement.type === "VariableDeclaration" && statement.declarations.length === 1 ? statement.declarations[0] : undefined;
    const awaitNode = d?.init?.type === "AwaitExpression" ? d.init
      : statement.type === "ExpressionStatement" && statement.expression.type === "AwaitExpression" ? statement.expression : undefined;
    if (!awaitNode) { segments.at(-1).push(statement); continue; }
    const call = awaitNode.argument;
    if (call.type !== "CallExpression" || call.optional || call.callee.type !== "Identifier" || !machine.environment.has(call.callee.name)) fail("Only top-level await of a declared environment operation is supported.", awaitNode);
    const op = machine.environment.get(call.callee.name);
    if (call.arguments.length !== op.params.length) fail(`Environment operation ${op.name} has the wrong arity.`, call);
    if (d && (statement.kind !== "const" || d.id.type !== "Identifier" || types.get(d.id.end) && types.get(d.id.end) !== op.result)) fail("Await results need const scalar bindings of the declared result type.", d);
    const pending = [];
    let cursor = statement.start;
    for (const c of clauses.filter((c) => c.comment.end <= cursor).reverse()) {
      if (machine.source.slice(c.comment.end, cursor).trim()) break;
      if (c.kind === "pending") { pending.unshift(c); used.add(c); }
      cursor = c.comment.start;
    }
    known.add(awaitNode); known.add(call);
    awaits.push({ op, call, binding: d?.id.name, bindingNode: d?.id, statement, pending, ...span(statement) });
    segments.push([]);
  }
  walk(fn.body, (n) => {
    if (["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration", "ClassExpression", "ClassDeclaration", "TryStatement"].includes(n.type)) fail("Closures, handlers and classes are outside C1.", n);
    if (n.type === "AwaitExpression" && !known.has(n)) fail("await must be a top-level const binding or expression statement.", n);
    if (n.type === "VariableDeclarator") {
      if (n.id.type !== "Identifier") fail("Destructuring is unsupported.", n.id);
      named(n.id.name, n.id, names);
      bindings.set(n.id.name, { name: n.id.name, node: n.id, type: types.get(n.id.end), kind: "local" });
    }
    if (n.type === "CallExpression" && n.callee.type === "Identifier") {
      if (moduleNames.has(n.callee.name) && !known.has(n)) fail("Entries cannot call entries; environment operations must be awaited.", n);
    }
    const target = n.type === "AssignmentExpression" ? n.left : n.type === "UpdateExpression" ? n.argument : undefined;
    if (target && (target.type !== "Identifier" || !machine.cells.has(target.name) && !bindings.has(target.name))) fail("Only declared scalar bindings may be written.", target);
  });
  for (const w of awaits) if (w.binding) bindings.set(w.binding, { ...bindings.get(w.binding), type: w.op.result, kind: "const" });
  // Captures come from lexical declarations, not textual identifier matching
  // across a global site slot. Distinct invocations retain distinct values.
  const live = [];
  for (let k = 0; k < segments.length; k++) {
    for (const s of segments[k]) {
      if (k < awaits.length) walk(s, (n) => { if (n.type === "ReturnStatement") fail("Returns before a later await are outside C1.", n); });
      if (s.type === "VariableDeclaration") for (const d of s.declarations) visible.set(d.id.name, { ...bindings.get(d.id.name), kind: s.kind });
    }
    const w = awaits[k];
    if (!w) continue;
    for (const [i, arg] of w.call.arguments.entries()) {
      const type = arg.type === "Identifier" ? machine.cells.get(arg.name)?.type ?? visible.get(arg.name)?.type
        : arg.type === "Literal" ? typeof arg.value
        : arg.type === "UnaryExpression" && ["+", "-"].includes(arg.operator) && arg.argument.type === "Literal" && typeof arg.argument.value === "number" ? "number" : undefined;
      if (type !== w.op.params[i].type) fail("Request arguments require scalar literals or visible bindings of the declared type.", arg);
    }
    for (const c of w.pending) for (const name of references(c.ast))
      if (!machine.cells.has(name) && !visible.has(name) && !globals.has(name)) fail(`Pending clause refers to unavailable binding ${name}.`, c.span);
    const later = new Set([
      ...segments.slice(k + 1).flat().flatMap((s) => [...references(s)]),
      ...awaits.slice(k + 1).flatMap((w) => [...references(w.call)]),
      ...awaits.slice(k).flatMap((w) => w.pending.flatMap((c) => [...references(c.ast)])),
    ]);
    const captures = [...visible.values()].filter((b) => later.has(b.name));
    for (const b of captures) if (!primitives.has(b.type) || !["const", "parameter"].includes(b.kind)) fail(`Captured ${b.name} requires an immutable annotated scalar binding.`, w.statement);
    live.push(captures);
    w.captures = [...captures, ...w.op.params.map((p, i) => ({ name: `$request_${i}`, type: p.type, node: w.call.arguments[i], argument: true }))];
    if (w.binding) visible.set(w.binding, bindings.get(w.binding));
  }
  return { name: fn.id.name, fn, params, segments, awaits, live, bindings, ...span(fn) };
}
