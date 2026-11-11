import { stripTypeScriptTypes } from "node:module";
import { Parser, tokenizer } from "acorn";

const OPTIONS = { ecmaVersion: 2022, sourceType: "module", preserveParens: true };
const BUILTINS = new Set(["Number", "Math", "Object", "Array"]);
const RESERVED = new Set(["result", ...BUILTINS, "NaN", "Infinity", "undefined", "real", "old"]);
const CONSTANTS = new Map([
  ["NaN", NaN], ["Infinity", Infinity],
  ...["MAX_VALUE", "MIN_VALUE", "MAX_SAFE_INTEGER", "MIN_SAFE_INTEGER", "POSITIVE_INFINITY", "NEGATIVE_INFINITY", "NaN"]
    .map((name) => [`Number.${name}`, Number[name]]),
]);

export { SourceError } from "./error.mjs";
import { fail, blame } from "./error.mjs";
import * as data from "./data.mjs";
import { frontend, TYPE_BUILTINS } from "./types.mjs";
import * as specifications from "./specifications.mjs";
const { and, or, not, need, implies } = data;
const SELF = { sort: "function" };
const oblige = (cx, safe) => cx.checks.push(implies(cx.guard, safe));

// Builtins resolve only when the owner is not a lexical or module binding.
function builtinOwner(node, env, cx) {
  return node.type === "Identifier" && BUILTINS.has(node.name) && !env.has(node.name) && !cx.scope.names.has(node.name) ? node.name : undefined;
}

function identifiers(node, names) {
  if (!node || typeof node !== "object") return;
  if (node.type === "Identifier") names.add(node.name);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => identifiers(child, names));
    else if (value && typeof value === "object") identifiers(value, names);
  }
}

function preconditions(clauses, env, cx) {
  const values = [], checks = [];
  for (const c of clauses) {
    const value = need(expression(c.ast, env, { ...cx, guard: and(...values), checks }), "boolean", c.span);
    values.push(value);
  }
  return { value: and(...values), defined: and(...checks) };
}

function bind(env, id, value, kind = "contract") {
  if (id.type !== "Identifier" || RESERVED.has(id.name) || env.has(id.name) && env.get(id.name).value !== SELF) {
    fail("Use distinct, nonreserved simple names; shadowing is unsupported.", id);
  }
  env.set(id.name, { declaration: id, kind, value });
}

function binding(env, id) {
  const found = env.get(id.name);
  if (!found) fail(`Unknown local binding ${id.name}.`, id);
  if (found.value === null) fail(`Reading or writing ${id.name} before its declaration is unsupported (TDZ or var hoisting).`, id);
  return found;
}

function writable(node, env, cx) {
  if (cx.contract) fail("Assignments and updates are unsupported in contracts.", node);
  while (node.type === "ParenthesizedExpression") node = node.expression;
  if (node.type !== "Identifier") fail("Only local scalar bindings can be assigned; heap writes and destructuring are unsupported.", node);
  const found = binding(env, node);
  if (!["let", "var"].includes(found.kind)) fail(`Cannot write ${found.kind} binding ${node.name}; parameter contracts describe entry arguments.`, node);
  if (!["number", "boolean", "undefined"].includes(found.value.sort)) fail("Array and record bindings retain immutable views; reference assignments are unsupported.", node);
  return { name: node.name, found };
}

function assign(env, target, value, node) {
  const old = target.found.value;
  if (value.sort === "undefined" && ["number", "boolean"].includes(old.sort)) value = { ...old, present: "false" };
  if (value.sort !== old.sort) fail("Local assignments must preserve the primitive scalar type; type changes are unsupported.", node);
  env.set(target.name, { ...target.found, value });
  return value;
}

function joinEnvironment(env, condition, yes, no, node) {
  for (const [name, original] of env) {
    const a = yes.get(name), b = no.get(name);
    if (a === b) continue;
    env.set(name, { ...original, value: data.merge(condition, a.value, b.value, node) });
  }
}

function every(node, env, cx) {
  if (!cx.contract) fail("every is supported in requires/ensures contracts, not in function bodies.", node);
  const [callback, ...extra] = node.arguments;
  if (extra.length || callback?.type !== "ArrowFunctionExpression" || callback.async || callback.body.type === "BlockStatement" || callback.params.length > 2) {
    fail("every takes one expression-bodied arrow (value, index) => condition, without thisArg or the array parameter.", callback ?? node);
  }
  const owner = expression(node.callee.object, env, cx);
  const bound = cx.unit.fresh("every_q");
  const checks = [];
  const value = data.every(owner, bound, (value, index) => {
    const inner = new Map(env);
    callback.params.forEach((p, i) => bind(inner, p, i ? index : value));
    return expression(callback.body, inner, { ...cx, guard: "true", checks });
  }, node);
  // Definedness has its own universal closure. It must not change polarity
  // when the predicate is negated, nor leak its bound index into a unit event.
  oblige(cx, data.every(owner, bound, () => data.bool(and(...checks)), node).smt);
  return value;
}

function call(node, env, cx) {
  const name = node.callee.name, unit = cx.unit;
  if ((name === "real" || name === "old") && !env.has(name) && !cx.scope.names.has(name)) {
    if (!cx.contract) fail(`${name}(...) is specification-only.`, node);
    if (node.arguments.length !== 1 || node.arguments[0].type === "SpreadElement") fail(`${name}(...) takes exactly one expression.`, node);
    const arg = node.arguments[0];
    if (name === "old") {
      if (!["ensures", "invariant", "decreases"].includes(cx.phase)) fail("old(...) is supported only in ensures, invariant and decreases, over entry parameters.", node);
      return expression(arg, cx.entry, { ...cx, phase: "old" });
    }
    if (arg.type === "Literal" && typeof arg.value === "string") return specifications.exact(arg.value, arg);
    return specifications.embed(expression(arg, env, cx), node, (safe) => oblige(cx, safe));
  }
  if (env.has(name)) fail(binding(env, node.callee).value === SELF ? "Recursive calls are unsupported." : `${name} is a local data value, not a top-level function.`, node.callee);
  const callee = cx.scope.names.get(name);
  if (!callee) fail(`Unknown function ${name}. Only top-level functions and named imports can be called.`, node.callee);
  if (cx.contract && !callee.spec) fail("Contracts can call only marked @spec functions.", node);
  if (!cx.contract && callee.spec) fail("@spec functions cannot be called by runtime bodies.", node);
  if (node.arguments.some((a) => a.type === "SpreadElement") || node.arguments.length !== callee.params.length) {
    fail(`${name} takes exactly ${callee.params.length} argument(s); spread, missing and extra arguments are unsupported.`, node);
  }
  const args = node.arguments.map((a) => expression(a, env, cx));
  const target = cx.scope.program.build(callee, node);
  const bound = callee.params.map((p, i) => data.argument(p.type, args[i], node.arguments[i], unit.fresh));
  if (callee.spec) {
    unit.dependencies.add(callee.id);
    return blame(callee.file, callee.name, () => {
      const penv = new Map();
      callee.params.forEach((p, i) => bind(penv, p.node, bound[i].value));
      const spec = { ...cx, scope: cx.scope.program.scopes.get(callee.file), entry: new Map(penv), phase: "body" };
      const pre = preconditions(callee.requires, penv, spec);
      oblige(cx, and(...bound.map((b) => b.safe), pre.defined, pre.value));
      // Definitions are transparent. No ensures clause becomes an assumed fact.
      return expression(callee.fn.body, penv, spec);
    });
  }
  // Callee clauses: caller's SMT unit, callee's lexical scope and blame.
  const { requires, ensures, value } = blame(callee.file, callee.name, () => {
    const spec = { guard: "true", contract: true, checks: [], unit, scope: cx.scope.program.scopes.get(callee.file), phase: "requires" };
    const penv = new Map();
    callee.params.forEach((p, i) => bind(penv, p.node, bound[i].value));
    spec.entry = new Map(penv);
    const clauses = (list) => and(...list.map((c) => need(expression(c.ast, penv, spec), "boolean", c.span)));
    const pre = preconditions(callee.requires, penv, spec);
    const fresh = data.input(target.resultType, unit.fresh("call"));
    unit.declarations.push(...fresh.declarations);
    penv.set("result", { kind: "contract", value: fresh.value });
    spec.phase = "ensures";
    const ensures = clauses(callee.ensures);
    return { requires: and(pre.value, pre.defined), ensures: and(ensures, ...spec.checks), value: fresh.value };
  });
  unit.events.push({ guard: cx.guard, safe: and(...bound.map((b) => b.safe), requires), assume: ensures, callee: callee.id,
    label: { kind: "call", span: { start: node.start, end: node.end }, abstract: unit.cutpoints > 0 } });
  return value;
}

function expression(node, env, cx) {
  const read = (child) => expression(child, env, cx);
  const under = (child, guard, inner) => expression(child, inner, { ...cx, guard: and(cx.guard, guard) });
  if (node.type === "ParenthesizedExpression") return read(node.expression);
  if (node.type === "Literal") {
    if (["number", "boolean"].includes(typeof node.value)) return data.literal(node.value);
    return fail("Only primitive data literals are supported.", node);
  }
  if (node.type === "Identifier") {
    if (env.has(node.name)) {
      const value = binding(env, node).value;
      if (value === SELF) fail("Function values are unsupported; call a top-level function directly.", node);
      return value;
    }
    if (cx.scope.names.has(node.name)) fail("Function values are unsupported; call a top-level function directly.", node);
    if (node.name === "undefined") return data.undef();
    if (CONSTANTS.has(node.name)) return data.literal(CONSTANTS.get(node.name));
    return fail(`Unknown value ${node.name}. Calls and ambient values need explicit support.`, node);
  }
  if (node.type === "MemberExpression" && !node.optional) {
    if (!node.computed && node.object.type === "Identifier") {
      const name = `${node.object.name}.${node.property.name}`;
      if (CONSTANTS.has(name)) return data.literal(CONSTANTS.get(name));
    }
    const owner = read(node.object);
    if (!node.computed) return data.member(owner, node.property.name, node);
    if (owner.sort === "object" && node.property.type === "Literal") return data.member(owner, String(node.property.value), node);
    return data.index(owner, read(node.property), node);
  }
  if (node.type === "ArrayExpression") {
    if (node.elements.some((e) => !e)) fail("Sparse array literals are unsupported.", node);
    if (node.elements.length === 1 && node.elements[0].type === "SpreadElement") {
      const value = read(node.elements[0].argument);
      if (value.sort !== "array") fail("Array spread requires an ordinary array.", node);
      return value;
    }
    if (node.elements.some((e) => e.type === "SpreadElement")) fail("Array spread currently supports copying one array, not concatenation.", node);
    return data.array(node.elements.map(read), node);
  }
  if (node.type === "ObjectExpression") {
    let value = data.record();
    for (const p of node.properties) {
      if (p.type === "SpreadElement") {
        value = data.spread(value, read(p.argument), p);
      } else {
        if (p.kind !== "init" || p.method || p.computed || !["Identifier", "Literal"].includes(p.key.type)) fail("Use ordinary data properties, without methods, accessors, or computed keys.", p);
        const key = p.key.type === "Identifier" ? p.key.name : String(p.key.value);
        if (key === "__proto__") fail("__proto__ is not an ordinary object-literal data field.", p);
        const field = read(p.value);
        if (field.sort === "real") fail("Mathematical values cannot be stored in JavaScript records.", p.value);
        value = data.property(value, key, field);
      }
    }
    return value;
  }
  if (node.type === "UnaryExpression") {
    const value = read(node.argument);
    return value.sort === "real" ? specifications.unary(node.operator, value, node) : data.unary(node.operator, value, node);
  }
  if (node.type === "LogicalExpression") return data.logical(node.operator, read(node.left), (runs) => {
    const skipped = new Map(env), taken = new Map(env);
    const value = under(node.right, runs, taken);
    joinEnvironment(env, runs, taken, skipped, node);
    return value;
  }, node);
  if (node.type === "BinaryExpression") {
    const a = read(node.left), b = read(node.right);
    return a.sort === "real" || b.sort === "real"
      ? specifications.binary(node.operator, a, b, node, (safe) => oblige(cx, safe)) : data.binary(node.operator, a, b, node);
  }
  if (node.type === "ConditionalExpression") {
    const c = need(read(node.test), "boolean", node.test);
    const yes = new Map(env), no = new Map(env);
    const a = under(node.consequent, c, yes), b = under(node.alternate, not(c), no);
    joinEnvironment(env, c, yes, no, node);
    return data.merge(c, a, b, node);
  }
  if (node.type === "AssignmentExpression") {
    const target = writable(node.left, env, cx);
    if (!["=", "+=", "-=", "*=", "/="].includes(node.operator)) fail(`Unsupported compound assignment ${node.operator}.`, node);
    const right = read(node.right);
    const value = node.operator === "=" ? right : data.binary(node.operator.slice(0, -1), target.found.value, right, node);
    return assign(env, target, value, node);
  }
  if (node.type === "UpdateExpression") {
    const target = writable(node.argument, env, cx);
    if (target.found.value.sort !== "number") fail("Increment and decrement require numeric local bindings; other coercions are unsupported.", node);
    const before = data.unary("+", target.found.value, node);
    const after = data.binary(node.operator === "++" ? "+" : "-", before, data.literal(1), node);
    assign(env, target, after, node);
    return node.prefix ? after : before;
  }
  if (node.type === "SequenceExpression") {
    let value;
    for (const child of node.expressions) value = read(child);
    return value;
  }
  if (node.type === "CallExpression" && !node.optional && node.callee.type === "Identifier") return call(node, env, cx);
  if (node.type === "CallExpression" && !node.optional && node.callee.type === "MemberExpression" && !node.callee.computed && !node.callee.optional) {
    const c = node.callee;
    if (c.property.name === "every") return every(node, env, cx);
    if (builtinOwner(c.object, env, cx)) {
      const args = node.arguments.map(read);
      if (args.some((v) => v.sort === "real")) fail("JavaScript builtins do not accept mathematical values.", node);
      return data.builtin(`${c.object.name}.${c.property.name}`, args, node);
    }
    if (c.property.name === "slice") {
      const owner = read(c.object);
      return data.slice(owner, node.arguments.map(read), node);
    }
  }
  return fail(`Unsupported ${node.type}. Only pure, explicitly modeled data operations are accepted.`, node);
}

function clause(comment, kind, text, start) {
  let ast;
  try {
    ast = Parser.parseExpressionAt(text, 0, OPTIONS);
    if (text.slice(ast.end).trim()) throw new Error("trailing text");
  } catch {
    fail(`Invalid ${kind} expression. Write one boolean expression per contract line.`, { start, end: start + text.length }, "error");
  }
  // Keep diagnostic spans in the original source, including contract nodes.
  const move = (n) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.start === "number") { n.start += start; n.end += start; }
    for (const [key, v] of Object.entries(n)) if (key !== "start" && key !== "end") {
      if (Array.isArray(v)) v.forEach(move); else move(v);
    }
  };
  move(ast);
  return { kind, text, span: { start, end: start + text.length }, ast };
}

function contracts(comments) {
  const clauses = [];
  const types = new Map();
  let spec = false;
  for (const comment of comments) {
    const pattern = /@param\s+\{/g;
    for (let match; (match = pattern.exec(comment.value));) {
      const start = pattern.lastIndex;
      let end = start, depth = 1;
      for (; end < comment.value.length && depth; end++) {
        if (comment.value[end] === "{") depth++;
        if (comment.value[end] === "}") depth--;
      }
      const name = /^\s+([A-Za-z_$][\w$]*)/.exec(comment.value.slice(end));
      if (depth || !name) fail("Invalid JSDoc @param data type.", comment);
      if (types.has(name[1])) fail(`Duplicate @param for ${name[1]}.`, comment);
      types.set(name[1], comment.value.slice(start, end - 1).trim());
      pattern.lastIndex = end;
    }
    let offset = comment.start + 2;
    for (const line of comment.value.split("\n")) {
      if (/^\s*\*?\s*@spec\s*$/.test(line)) spec = true;
      if (/^\s*\*?\s*@?(invariant|decreases)\b/.test(line)) fail("invariant and decreases belong directly above a loop.", comment);
      const match = /^\s*\*?\s*@?(requires|ensures)\b(.*)$/.exec(line);
      if (match) {
        const text = match[2].trim();
        clauses.push(clause(comment, match[1], text, offset + line.indexOf(text, line.indexOf(match[1]) + match[1].length)));
      }
      offset += line.length + 1;
    }
  }
  return { clauses, types, spec };
}

function leadingComments(source, comments, start) {
  const leading = [];
  let cursor = start;
  for (const c of comments.filter((c) => c.end <= start).reverse()) {
    if (source.slice(c.end, cursor).trim()) break;
    leading.unshift(c);
    cursor = c.start;
  }
  return leading;
}

function blockStatements(node) {
  return node.type === "BlockStatement" ? node.body : [node];
}

function readAnnotation(text, node) {
  const first = tokenizer(text, OPTIONS).getToken();
  if (first.type.label === "eof") return undefined;
  if (first.type.label !== ":") fail("Unsupported or optional type annotation; use an explicit primitive | undefined parameter type.", node);
  return text.slice(first.end).trim();
}

function localName(id) {
  if (id.type !== "Identifier" || RESERVED.has(id.name)) fail("Local declarations need simple, nonreserved names.", id);
}

function varBindings(node, env) {
  if (node.type === "VariableDeclaration" && node.kind === "var") {
    for (const d of node.declarations) {
      localName(d.id);
      if (env.has(d.id.name) && env.get(d.id.name).value !== SELF) fail("Repeated var declarations and var redeclarations of parameters are unsupported.", d.id);
      env.set(d.id.name, { declaration: d.id, kind: "var", value: null });
    }
  } else if (node.type === "BlockStatement") node.body.forEach((n) => varBindings(n, env));
  else if (node.type === "IfStatement") {
    varBindings(node.consequent, env);
    if (node.alternate) varBindings(node.alternate, env);
  }
}

function lexicalBindings(list, outer, functionBody) {
  const env = new Map(outer), names = new Set();
  for (const node of list) if (node.type === "VariableDeclaration" && node.kind !== "var") {
    for (const d of node.declarations) {
      localName(d.id);
      if (names.has(d.id.name) || functionBody && env.has(d.id.name) && env.get(d.id.name).value !== SELF) fail("Duplicate local declaration in this scope.", d.id);
      names.add(d.id.name);
      env.set(d.id.name, { declaration: d.id, kind: node.kind, value: null });
    }
  }
  return env;
}

// Scope exit keeps writes to outer declaration identities. Break and continue
// states collected inside this scope leave it by the same rule.
function restore(outer, inner) {
  return new Map([...outer].map(([name, original]) => {
    const current = inner.get(name);
    return [name, current.declaration === original.declaration ? current : original];
  }));
}

function scopedStatements(list, states, returns, cx, functionBody = false) {
  return states.flatMap((s) => {
    const env = lexicalBindings(list, s.env, functionBody);
    const leave = (v) => ({ path: v.path, env: restore(s.env, v.env) });
    const marks = cx.loop ? [cx.loop.breaks.length, cx.loop.continues.length] : [];
    const out = statements(list, [{ path: s.path, env }], returns, cx).map(leave);
    if (cx.loop) {
      cx.loop.breaks.splice(marks[0], Infinity, ...cx.loop.breaks.slice(marks[0]).map(leave));
      cx.loop.continues.splice(marks[1], Infinity, ...cx.loop.continues.slice(marks[1]).map(leave));
    }
    return out;
  });
}

// Continuations remain disjoint paths. Binding replacement preserves captured
// values, while scope exit keeps writes to outer declaration identities.
function statements(list, states, returns, cx) {
  const at = (s) => ({ ...cx, guard: s.path });
  for (const node of list) {
    if (!states.length) fail("Unreachable statements are outside the supported source subset.", node);
    if (node.type === "ReturnStatement") {
      if (!node.argument) fail("Every path must return a supported value.", node);
      for (const s of states) returns.push({ path: s.path, value: expression(node.argument, s.env, at(s)) });
      states = [];
    } else if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) {
        if (!d.init) fail("Uninitialized local declarations are unsupported; provide an initializer.", d);
        const assignment = cx.scope.tokens.find((t) => t.start >= d.id.end && t.start < d.init.start && t.value === "=");
        const annotation = readAnnotation(cx.scope.source.slice(d.id.end, assignment.start), d.id);
        if (annotation !== undefined) cx.scope.validateType(annotation, d.id);
        for (const s of states) {
          const value = expression(d.init, s.env, at(s));
          s.env.set(d.id.name, { declaration: d.id, kind: node.kind, value });
        }
      }
    } else if (node.type === "IfStatement") {
      const next = [];
      for (const s of states) {
        const condition = need(expression(node.test, s.env, at(s)), "boolean", node.test);
        const yes = scopedStatements(blockStatements(node.consequent), [{ env: new Map(s.env), path: and(s.path, condition) }], returns, cx);
        const no = node.alternate
          ? scopedStatements(blockStatements(node.alternate), [{ env: new Map(s.env), path: and(s.path, not(condition)) }], returns, cx)
          : [{ env: new Map(s.env), path: and(s.path, not(condition)) }];
        next.push(...yes, ...no);
      }
      states = next;
    } else if (node.type === "BlockStatement") {
      states = scopedStatements(node.body, states, returns, cx);
    } else if (node.type === "ExpressionStatement") {
      for (const s of states) expression(node.expression, s.env, at(s));
    } else if (node.type === "EmptyStatement") {
      continue;
    } else if (node.type === "WhileStatement" || node.type === "ForStatement") {
      states = loop(node, states, returns, cx);
    } else if ((node.type === "BreakStatement" || node.type === "ContinueStatement") && !node.label) {
      if (!cx.loop) fail(`${node.type} outside a supported loop.`, node);
      (node.type === "BreakStatement" ? cx.loop.breaks : cx.loop.continues).push(...states);
      states = [];
    } else {
      fail(`Unsupported ${node.type}. do-while, for-in/of, labels, heap effects, and unmodeled calls are rejected.`, node);
    }
    if (states.length + returns.length > 128) fail("This function exceeds the first slice's 128-path limit.", node);
  }
  return states;
}


// ---- Loop cutpoints -------------------------------------------------------
const LOOP_TYPES = new Set(["WhileStatement", "ForStatement", "DoWhileStatement", "ForInStatement", "ForOfStatement"]);

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (node.type) visit(node);
  for (const [key, v] of Object.entries(node)) if (key !== "start" && key !== "end") {
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit)); else if (v && typeof v === "object") walk(v, visit);
  }
}

// Syntactic over-approximation, including false-guarded and shadowed writes.
function writtenNames(nodes) {
  const names = new Set();
  for (const n of nodes) walk(n, (x) => {
    let t = x.type === "AssignmentExpression" ? x.left : x.type === "UpdateExpression" ? x.argument : null;
    while (t?.type === "ParenthesizedExpression") t = t.expression;
    if (t?.type === "Identifier") names.add(t.name);
  });
  return names;
}

// Disjoint incoming paths join exactly into one cutpoint entry.
function mergeStates(states, node) {
  const last = states.at(-1);
  const env = new Map(last.env);
  for (const s of states.slice(0, -1).reverse()) {
    for (const [name, b] of env) {
      const a = s.env.get(name);
      if (a === b || a.value === b.value) continue;
      if (a.value === null || b.value === null || a.declaration !== b.declaration) fail("Loop entry states disagree on a binding.", node);
      env.set(name, { ...b, value: data.merge(s.path, a.value, b.value, node) });
    }
  }
  return { path: or(...states.map((s) => s.path)), env };
}

// Normal expression typing keeps native arithmetic rounded; only explicit real
// arithmetic carries the exact linear form owned by specifications.mjs.
function measure(clause, env, cx) {
  const checks = [];
  const scx = { ...cx, guard: "true", checks, phase: "decreases" };
  let value = expression(clause.ast, env, scx);
  if (value.sort === "number") value = specifications.embed(value, clause.span, (safe) => checks.push(safe));
  if (value.sort !== "real") fail("decreases requires a number or a real-valued specification expression.", clause.span);
  return { value, defined: and(...checks) };
}

const strip = (n) => { while (n.type === "ParenthesizedExpression") n = n.expression; return n; };
const conjuncts = (n) => (n = strip(n)).type === "LogicalExpression" && n.operator === "&&" ? [...conjuncts(n.left), ...conjuncts(n.right)] : [n];
const named = (n, name) => strip(n).type === "Identifier" && strip(n).name === name;
const zero = (n) => strip(n).type === "Literal" && strip(n).value === 0;
const minusOne = (n) => (n = strip(n)).type === "UnaryExpression" && n.operator === "-" && strip(n.argument).type === "Literal" && strip(n.argument).value === 1;

// Provenance for a u32 havoc: unconditional invariant conjuncts that the init
// and preservation checks prove: Number.isInteger(x), 0 <= x, and x <(=) b where
// b is a u32 array length, a u32 literal, or an earlier name with this
// provenance. Every state the head admits is then a u32, so the narrower havoc
// loses nothing. -0 stays representable (as index 0).
// Predecessor mode instead proves -1 <= x < b and represents x + 1 as u32.
// Stable local u32 values can anchor either range; circular bounds cannot.
function u32Names(invariants, { candidates, written }, env, cx, predecessor = false) {
  const cs = invariants.flatMap((c) => conjuncts(c.ast)).map(strip);
  const integer = (name) => cs.some((c) => c.type === "CallExpression" && c.callee.type === "MemberExpression" && !c.callee.computed && !c.optional && builtinOwner(c.callee.object, env, cx) === "Number"
    && c.callee.property.name === "isInteger" && c.arguments.length === 1 && named(c.arguments[0], name));
  const lowerBound = predecessor ? minusOne : zero;
  const lower = (name) => cs.some((c) => c.type === "BinaryExpression" && (c.operator === "<=" && lowerBound(c.left) && named(c.right, name) || c.operator === ">=" && named(c.left, name) && lowerBound(c.right)));
  const bound = (r, ok) => {
    r = strip(r);
    if (r.type === "Literal" && Number.isInteger(r.value) && r.value >= 0 && r.value <= 0xffffffff) return true;
    if (r.type === "Identifier") return !predecessor && ok.has(r.name) || !written.includes(r.name) && env.get(r.name)?.value.present === "true" && !!env.get(r.name).value.u32;
    if (r.type !== "MemberExpression" || r.computed || r.property.name !== "length" || strip(r.object).type !== "Identifier") return false;
    const owner = env.get(strip(r.object).name)?.value;
    return owner?.sort === "array" && !!owner.length.u32 && !written.includes(strip(r.object).name);
  };
  const upper = (name, ok) => cs.some((c) => c.type === "BinaryExpression" && ((predecessor ? c.operator === "<" : ["<", "<="].includes(c.operator)) && named(c.left, name) && bound(c.right, ok)
    || (predecessor ? c.operator === ">" : [">", ">="].includes(c.operator)) && named(c.right, name) && bound(c.left, ok)));
  const ok = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const name of candidates) if (!ok.has(name) && integer(name) && lower(name) && upper(name, ok)) { ok.add(name); grew = true; }
  }
  return ok;
}

function loop(node, states, returns, cx) {
  const spec = cx.loops.get(node);
  if (cx.loop) fail("Nested loops are outside this slice.", node);
  if (!spec.decreases) fail("A loop needs one decreases clause directly above it; verified functions must terminate.", node);
  if (node.type === "ForStatement" && !node.test) fail("for loops need an explicit test.", node);
  walk(node, (x) => { if (x !== node && LOOP_TYPES.has(x.type)) fail("Nested loops are outside this slice.", x);
    if (x.type === "VariableDeclaration" && x.kind === "var") fail("var declarations inside loops are unsupported; use let or const.", x); });
  const before = mergeStates(states, node);
  const init = node.type === "ForStatement" && node.init
    ? [node.init.type === "VariableDeclaration" ? node.init : { type: "ExpressionStatement", expression: node.init, start: node.init.start, end: node.init.end }] : [];
  const [entry] = statements(init, [{ path: before.path, env: lexicalBindings(init, before.env, false) }], returns, cx);
  const written = [...writtenNames([node.test, node.update, node.body])].filter((name) => entry.env.has(name));
  for (const name of written) {
    const b = entry.env.get(name);
    // Only scalar cells get a fresh cutpoint value; anything else would keep a stale entry value.
    if (!["let", "var"].includes(b.kind) || !b.value || !["number", "boolean", "undefined"].includes(b.value.sort)) fail(`A loop may write only number or boolean let bindings; ${name} is not one.`, node);
    if (b.value.sort === "undefined") fail(`${name} starts as undefined; give it a number or boolean type at loop entry.`, node);
  }
  const optional = new Set(written.filter((name) => entry.env.get(name).value.present !== "true"));
  cx.unit.cutpoints++;
  for (;;) {
    // A trial shares fresh names but owns its log; nothing to roll back.
    const unit = { ...cx.unit, events: [], declarations: [], dependencies: new Set(), replayGuards: [] };
    const own = [];
    const checks = [];
    const r = iterate(node, spec, entry, written, optional, { ...cx, unit, checks }, own);
    const widen = written.filter((n) => !optional.has(n) && r.backs.some((b) => b.env.get(n).value.present !== "true"));
    if (widen.length) { widen.forEach((n) => optional.add(n)); continue; }
    cx.unit.events.push(...unit.events);
    cx.unit.declarations.push(...unit.declarations);
    unit.dependencies.forEach((d) => cx.unit.dependencies.add(d));
    cx.checks.push(...checks);
    cx.unit.replayGuards.push(...unit.replayGuards);
    returns.push(...own);
    cx.unit.loops.push({ start: node.start, end: node.end });
    return r.exits.filter((x) => x.path !== "false").map((x) => ({ path: x.path, env: restore(before.env, x.env) }));
  }
}

function iterate(node, spec, entry, written, optional, cx, returns) {
  const unit = cx.unit;
  const contract = { ...cx, contract: true, checks: [], phase: "invariant", loop: undefined };
  const label = (kind, span) => ({ kind, span, loop: { start: node.start, end: node.end }, abstract: true });
  const invariant = (env) => { const v = preconditions(spec.invariants, env, contract); return and(v.defined, v.value); };
  unit.events.push({ guard: entry.path, safe: invariant(entry.env), assume: "true", label: label("invariant-init", spec.span) });
  const entryRank = measure(spec.decreases, entry.env, contract);
  const replayGuard = unit.fresh("loop_replay");
  const manageable = implies(and(entry.path, entryRank.defined), specifications.rankAtMost(entryRank.value, data.REPLAY_LIMIT));
  // A definitional flag is model-readable without asserting that the bound
  // holds. Only a witness query asserts this flag; full proofs remain unbounded.
  unit.declarations.push(`(declare-const ${replayGuard} Bool)`, `(assert (= ${replayGuard} ${manageable}))`);
  unit.replayGuards.push(replayGuard);
  const env = new Map(entry.env);
  const ranges = { candidates: written.filter((n) => !optional.has(n) && entry.env.get(n).value.sort === "number"), written };
  const narrow = u32Names(spec.invariants, ranges, entry.env, cx);
  const predecessor = u32Names(spec.invariants, ranges, entry.env, cx, true);
  for (const name of written) {
    const b = env.get(name);
    if (!optional.has(name) && b.value.sort === "number" && (narrow.has(name) || predecessor.has(name))) {
      const fresh = data.natural(unit.fresh("loop"), !narrow.has(name));
      unit.declarations.push(...fresh.declarations);
      env.set(name, { ...b, value: fresh.value });
      continue;
    }
    const fresh = data.input(optional.has(name) ? { kind: "optional", type: b.value.sort } : b.value.sort, unit.fresh("loop"));
    unit.declarations.push(...fresh.declarations);
    env.set(name, { ...b, value: fresh.value });
  }
  const head = and(entry.path, invariant(env));
  const rank = measure(spec.decreases, env, contract);
  const tested = new Map(env);
  const c = need(expression(node.test, tested, { ...cx, guard: head }), "boolean", node.test);
  const collectors = { breaks: [], continues: [] };
  const done = scopedStatements(blockStatements(node.body), [{ path: and(head, c), env: new Map(tested) }], returns, { ...cx, loop: collectors });
  const backs = [...done, ...collectors.continues];
  if (node.update) for (const b of backs) expression(node.update, b.env, { ...cx, guard: b.path });
  for (const b of backs) {
    unit.events.push({ guard: b.path, safe: invariant(b.env), assume: "true", label: label("invariant-preserve", spec.span) });
    const next = measure(spec.decreases, b.env, contract);
    unit.events.push({ guard: b.path, assume: "true", label: label("rank", spec.decreases.span),
      safe: and(rank.defined, next.defined, specifications.rankDecrease(rank.value, next.value)) });
  }
  return { backs, exits: [{ path: and(head, not(c)), env: tested }, ...collectors.breaks] };
}

const CONTRACT_LINE = /^\s*\*?\s*@?(requires|ensures|invariant|decreases)\b(.*)$/;

function loopContracts(fn, source, comments) {
  const loops = new Map(), owned = new Set();
  walk(fn.body, (node) => {
    if (!LOOP_TYPES.has(node.type)) return;
    const invariants = [], decreases = [];
    for (const comment of leadingComments(source, comments, node.start)) {
      let offset = comment.start + 2;
      for (const line of comment.value.split("\n")) {
        const m = CONTRACT_LINE.exec(line);
        if (m) {
          if (!["invariant", "decreases"].includes(m[1])) fail(`${m[1]} belongs above a function, not a loop.`, comment);
          const text = m[2].trim();
          (m[1] === "invariant" ? invariants : decreases).push(clause(comment, m[1], text, offset + line.indexOf(text, line.indexOf(m[1]) + m[1].length)));
          owned.add(comment);
        }
        offset += line.length + 1;
      }
    }
    if (decreases.length > 1) fail("Use one decreases clause per loop; lexicographic measures are unsupported.", decreases[1].span);
    const span = invariants.length ? { start: invariants[0].span.start, end: invariants.at(-1).span.end } : { start: node.start, end: node.start };
    loops.set(node, { invariants, decreases: decreases[0], span });
  });
  for (const c of comments) if (c.start >= fn.start && c.end <= fn.end && !owned.has(c) && c.value.split("\n").some((l) => CONTRACT_LINE.test(l))) {
    fail("Contract comments inside a function must directly precede a while or for loop and use invariant or decreases.", c);
  }
  return loops;
}

// Header: everything a caller needs except the result shape, which comes from
// compiling the body (memoized, dependency-first, cycles rejected at the call).
function header(top, file, source, stripped, comments, tokens) {
  const declaration = ["ExportNamedDeclaration", "ExportDefaultDeclaration"].includes(top.type) ? top.declaration : top;
  let fn, name;
  if (declaration?.type === "FunctionDeclaration" && declaration.id) {
    fn = declaration; name = fn.id.name;
  } else if (declaration?.type === "VariableDeclaration" && declaration.kind === "const" && declaration.declarations.length === 1) {
    const d = declaration.declarations[0];
    if (d.id.type === "Identifier" && ["ArrowFunctionExpression", "FunctionExpression"].includes(d.init?.type)) {
      fn = d.init; name = d.id.name;
    }
  }
  if (!fn || fn.async || fn.generator) fail("Only ordinary top-level functions and const function expressions are supported.", top);
  if (RESERVED.has(name) || (fn.id && RESERVED.has(fn.id.name))) fail("A function cannot shadow a verifier builtin.", top);
  const assignment = declaration.type === "VariableDeclaration" ? tokens.find((t) => t.start >= declaration.declarations[0].id.end && t.value === "=") : null;
  return blame(file, name, () => {
    const info = contracts(leadingComments(source, comments, top.start));
    if (info.spec && fn.body.type === "BlockStatement") fail("@spec functions need a single expression body.", fn.body);
    if (!info.clauses.some((c) => c.kind === "ensures")) fail("A function needs at least one ensures contract.", top, "error");
    const params = fn.params.map((p) => {
      if (p.type !== "Identifier") fail("Parameters need simple names, without defaults or destructuring.", p);
      const after = tokens.find((t) => t.start >= p.end);
      const annotation = readAnnotation(source.slice(p.end, after.start), p);
      const text = annotation ?? info.types.get(p.name);
      if (!text) fail(`Give ${p.name} a supported data annotation or a JSDoc @param type. Types are input assumptions.`, p);
      return { name: p.name, node: p, text, typeSpan: { start: p.end, end: after.start } };
    });
    const annotations = [];
    if (assignment) {
      const binding = readAnnotation(source.slice(declaration.declarations[0].id.end, assignment.start), declaration.declarations[0].id);
      if (binding !== undefined) annotations.push({ text: binding, node: { start: declaration.declarations[0].id.end, end: assignment.start } });
    }
    const close = tokens.find((t) => t.start >= (fn.params.at(-1)?.end ?? fn.start) && t.start < fn.body.start && t.type.label === ")");
    if (close) {
      const next = tokens.find((t) => t.start >= close.end);
      const result = readAnnotation(source.slice(close.end, next.start), close);
      if (result !== undefined) annotations.push({ text: result, node: { start: close.end, end: next.start } });
    }
    // Account for erased tokens explicitly. Unmodeled syntax must not become
    // an ordinary verified function merely because Node removed it first.
    const ranges = [...params.map((p) => p.typeSpan), ...annotations.map((a) => a.node)];
    const locals = (n) => {
      if (!n || typeof n !== "object") return;
      if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init) {
        const eq = tokens.find((t) => t.start >= n.id.end && t.start < n.init.start && t.value === "=");
        if (eq) ranges.push({ start: n.id.end, end: eq.start });
      }
      for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(locals); else if (v && typeof v === "object") locals(v);
    };
    locals(fn.body);
    for (const t of tokenizer(source.slice(top.start, top.end), OPTIONS)) {
      const start = top.start + t.start, end = top.start + t.end;
      const unmodeled = Array.from({ length: end - start }, (_, i) => start + i)
        .some((i) => source[i] !== stripped[i] && !ranges.some((r) => i >= r.start && i < r.end));
      if (unmodeled) {
        fail("Runtime generic arguments, type assertions, non-null assertions and unmodeled erased runtime syntax are unsupported.", { start, end });
      }
    }
    const own = (kind) => info.clauses.filter((c) => c.kind === kind).map((c) => ({ ...c, file }));
    const loops = loopContracts(fn, source, comments);
    return { id: `${file}#${name}`, file, name, top, fn, params, annotations, spec: info.spec, requires: own("requires"), ensures: own("ensures"), loops };
  });
}

function body(h, scope) {
  const { fn, name, top } = h;
  return blame(h.file, name, () => {
    let next = 0;
    const unit = { declarations: [], events: [], dependencies: new Set(), fresh: (tag) => `${tag}${next++}`, cutpoints: 0, loops: [], replayGuards: [] };
    const env = new Map();
    if (fn.type === "FunctionExpression" && fn.id) bind(env, fn.id, SELF, "self");
    const declarations = [], lengths = [];
    const params = h.params.map((p, index) => {
      const value = data.input(p.type, `input_${index}`);
      bind(env, p.node, value.value, "parameter");
      declarations.push(...value.declarations);
      lengths.push(...value.lengths);
      return { name: p.name, type: p.type, typeAliases: p.typeAliases, model: value.model };
    });
    const spec = { guard: "true", contract: true, unit, scope, checks: [], entry: new Map(env), phase: "requires" };
    const pre = preconditions(h.requires, env, spec);
    if (h.loops.size) {
      // Reparameterize only domains explicitly established by requires. Links
      // are guarded by definedness as well, so malformed preconditions keep
      // all their original counterexamples in the first solver phase.
      const bounded = u32Names(h.requires, { candidates: h.params.filter((p) => p.type === "number").map((p) => p.name), written: [] }, env, spec);
      const legal = and(pre.defined, pre.value);
      for (const name of bounded) {
        const old = env.get(name), fresh = data.natural(unit.fresh("parameter"));
        unit.declarations.push(...fresh.declarations, `(assert ${implies(legal, `(= ${old.value.smt} ${fresh.value.smt})`)})`);
        env.set(name, { ...old, value: fresh.value });
      }
      if (bounded.size) {
        const equivalent = preconditions(h.requires, env, { ...spec, checks: [] });
        unit.declarations.push(`(assert ${implies(legal, equivalent.value)})`);
        spec.entry = new Map(env);
      }
    }
    const returns = [];
    const cx = { ...spec, contract: h.spec, phase: "body", checks: [], loops: h.loops };
    if (fn.body.type === "BlockStatement") {
      const bodyEnv = new Map(env);
      varBindings(fn.body, bodyEnv);
      const remaining = scopedStatements(fn.body.body, [{ env: bodyEnv, path: "true" }], returns, cx, true);
      if (remaining.length || !returns.length) fail("Every syntactic path must return a supported value.", fn.body);
    } else returns.push({ path: "true", value: expression(fn.body, env, cx) });
    let result = returns.at(-1).value;
    for (const r of returns.slice(0, -1).reverse()) result = data.merge(r.path, r.value, result, fn.body);
    const callerEvents = unit.events;
    env.set("result", { kind: "contract", value: result });
    spec.phase = "ensures";
    const abstract = unit.cutpoints > 0;
    // With cutpoints, each return proves ensures with its own exact value view
    // under its own path; a merged result would lose the per-path shadows.
    const conclude = (value, guard) => {
      const checks = [], at = new Map(env).set("result", { kind: "contract", value }), scx = { ...spec, checks };
      const list = h.ensures.map((c) => ({ smt: need(expression(c.ast, at, scx), "boolean", c.span), guard, label: { kind: "ensures", span: c.span, abstract } }));
      return [...checks.map((smt) => ({ smt, guard, label: { kind: "definedness", span: h.ensures[0].span, abstract } })), ...list];
    };
    const ensures = abstract ? [] : h.ensures.map((c) => ({ smt: need(expression(c.ast, env, spec), "boolean", c.span), label: { kind: "ensures", span: c.span, abstract } }));
    // Call k and loop check k hold under earlier facts only; ensures uses every fact.
    const facts = [], defs = [];
    const obligations = callerEvents.map((e, k) => {
      const safe = implies(and(e.guard, ...facts), e.safe);
      const fact = implies(e.guard, e.assume);
      if (fact !== "true") { defs.push(`(define-fun call_fact${k} () Bool ${fact})`); facts.push(`call_fact${k}`); }
      return { smt: safe, label: e.label };
    });
    const allFacts = and(...facts);
    // Abstract loop iterations do not return; result is meaningful only on a return path.
    const returned = abstract ? or(...returns.map((r) => r.path)) : "true";
    // Body checks carry their own path guards; result checks need a return.
    const defined = (list, guard) => list.map((smt) => ({ smt, guard, label: { kind: "definedness", span: h.ensures[0].span, abstract } }));
    const conclusions = abstract
      ? [...defined(cx.checks, allFacts), ...returns.flatMap((r) => conclude(r.value, and(r.path, allFacts)))]
      : [...defined(cx.checks, allFacts), ...defined(spec.checks, and(returned, allFacts)),
        ...(abstract ? conclude(result, and(returned, allFacts)) : ensures.map((e) => ({ ...e, guard: and(returned, allFacts) })))];
    const items = [...obligations, ...conclusions.map((c) => ({ smt: implies(c.guard, c.smt), label: c.label }))].filter((c) => c.smt !== "true");
    const post = abstract ? and(...items.map((c) => c.smt))
      : and(...obligations.map((o) => o.smt), implies(allFacts, and(...cx.checks, ...spec.checks, ...ensures.map((e) => e.smt))));
    const postconditions = items.map((c) => c.smt);
    const names = new Set(scope.names.keys());
    identifiers(fn, names);
    for (const c of [...h.requires, ...h.ensures]) identifiers(c.ast, names);
    let library = "__specification", entry = "__entry_values";
    while (names.has(library)) library += "_";
    while (names.has(entry)) entry += "_";
    const replay = { library, entry, params: params.map((p) => p.name) };
    return {
      id: h.id, file: h.file, name, span: { start: top.start, end: top.end }, params, resultType: data.valueType(result),
      requires: h.requires.map(({ ast, ...c }) => c), ensures: h.ensures.map(({ ast, ...c }) => c),
      callees: [...new Set([...callerEvents.filter((e) => e.callee).map((e) => e.callee), ...unit.dependencies])],
      loops: unit.loops, obligations: items.map((c) => c.label),
      spec: h.spec,
      predicates: {
        ...replay,
        requires: h.requires.map((c) => specifications.replayExpression(c.ast, replay)),
        ensures: h.ensures.map((c) => specifications.replayExpression(c.ast, replay)),
        ...(h.spec ? { body: specifications.replayExpression(fn.body, replay) } : {}),
      },
      executable: scope.stripped.slice(fn.start, fn.end),
      declarations: [...declarations, ...unit.declarations, ...defs].join("\n"),
      smallWitness: and(...lengths.map((len) => `(bvule ${len} (_ bv${data.REPLAY_LIMIT} 32))`)),
      replayGuards: unit.replayGuards,
      pre: pre.value, preDefined: pre.defined, post, postconditions: postconditions.length ? postconditions : ["true"],
    };
  });
}

/** Parse captured source without executing it or reading dependencies directly. */
export function parse(file, source, resolve) {
  return blame(file, undefined, () => {
    let stripped = source;
    if (/\.[cm]?ts$/.test(file)) {
      try {
        const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
        stripped = bom + stripTypeScriptTypes(source.slice(bom.length), { mode: "strip" });
      } catch (e) { fail(`TypeScript type stripping failed: ${e.message}`, null, "error"); }
      if (stripped.length !== source.length) fail("Type stripping changed source offsets.", null);
    }
    let program;
    const comments = [], tokens = [];
    try { program = Parser.parse(stripped, { ...OPTIONS, onComment: comments, onToken: tokens }); }
    catch (e) { fail(e.message, { start: e.pos ?? 0, end: (e.pos ?? 0) + 1 }, "error"); }
    const syntax = frontend(file, source, program);
    const headers = new Map(), imports = [], exports = [...syntax.exports];
    const locals = new Set(syntax.aliases.keys());
    const bindLocal = (name, node) => {
      if (RESERVED.has(name) || locals.has(name)) fail(`Duplicate or reserved module binding ${name}.`, node);
      locals.add(name);
    };
    for (const name of syntax.aliases.keys()) if (RESERVED.has(name)) fail(`Reserved type binding ${name}.`, syntax.aliases.get(name).node);
    for (const imp of syntax.imports) {
      for (const b of imp.bindings) {
        if (b.kind === "type" && TYPE_BUILTINS.has(b.local)) fail(`Reserved type import binding ${b.local}.`, imp.node);
        bindLocal(b.local, imp.node);
      }
      for (const kind of new Set(imp.bindings.map((b) => b.kind))) {
        imports.push({ ...imp, file: resolve(imp.specifier, imp.node, kind), bindings: imp.bindings.filter((b) => b.kind === kind) });
      }
    }
    for (const top of program.body) {
      if (syntax.handled.has(top)) continue;
      const h = header(top, file, source, stripped, comments, tokens);
      bindLocal(h.name, top);
      headers.set(h.name, h);
      if (top.type === "ExportNamedDeclaration" || top.type === "ExportDefaultDeclaration") {
        exports.push({ local: h.name, exported: top.type === "ExportDefaultDeclaration" ? "default" : h.name, kind: "value", node: top });
      }
    }
    for (const e of exports) if (e.specifier) e.file = resolve(e.specifier, e.node, e.kind);
    if (!headers.size && !syntax.aliases.size && !imports.length && !exports.length) fail("No functions or types to verify.", null, "error");
    return { file, source, stripped, tokens, headers, aliases: syntax.aliases, imports, exports };
  });
}

/** Link type and runtime namespaces, then compile every loaded function. */
export function compile(records) {
  const byFile = new Map(records.map((r) => [r.file, r]));
  const built = new Map(), scopes = new Map();
  const local = (r, name, kind, at) => {
    const own = (kind === "type" ? r.aliases : r.headers).get(name);
    if (own) return own;
    const imp = r.imports.find((i) => i.bindings.some((b) => b.kind === kind && b.local === name));
    if (imp) {
      const b = imp.bindings.find((b) => b.kind === kind && b.local === name);
      return exported(byFile.get(imp.file), b.imported, kind, at);
    }
    return undefined;
  };
  const exported = (r, name, kind, at) => {
    const entries = r.exports.filter((e) => !e.star && e.kind === kind && e.exported === name);
    if (entries.length > 1) fail(`Duplicate exported ${kind} ${name}.`, entries[1].node, "error");
    if (entries.length) {
      const e = entries[0];
      return blame(r.file, undefined, () => (e.file ? exported(byFile.get(e.file), e.local, kind, e.node) : local(r, e.local, kind, e.node))
        ?? fail(`No local ${kind} binding ${e.local} to export.`, e.node, "error"));
    }
    if (name === "default") return undefined;
    const found = r.exports.filter((e) => e.star && (e.kind === kind || e.kind === "value" && kind === "type"))
      .map((e) => blame(r.file, undefined, () => exported(byFile.get(e.file), name, kind, e.node))).filter(Boolean);
    if (new Set(found.map((h) => h.id)).size > 1) fail(`Ambiguous exported ${kind} ${name}.`, at, "error");
    return found[0];
  };
  // Validate explicit bindings, including unused type imports and re-exports.
  for (const r of records) blame(r.file, undefined, () => {
    for (const imp of r.imports) for (const b of imp.bindings) {
      if (!exported(byFile.get(imp.file), b.imported, b.kind, imp.node)) fail(`${imp.specifier} has no exported ${b.kind === "value" ? "function" : "type"} ${b.imported}.`, imp.node, "error");
    }
    for (const e of r.exports) if (!e.star) {
      const h = r.headers.get(e.local);
      if (e.evaluated && h && h.top.start > e.node.start && h.fn.type !== "FunctionDeclaration") fail("Default export reads an uninitialized const function binding.", e.node);
      exported(r, e.exported, e.kind, e.node);
    }
  });
  const expand = (r, text, node, args, stack, used) => data.parseType(text, node, (name, actual, at) => {
    if (args.has(name)) {
      if (actual.length) fail(`Type parameter ${name} is not generic.`, at);
      return args.get(name);
    }
    const a = local(r, name, "type", at);
    if (!a) fail(`Unresolved type ${name}; use a declared alias or explicit type import.`, at);
    used.set(a.id, { file: a.file, name: a.name, span: a.node });
    return blame(a.file, undefined, () => {
      if (stack.includes(a.id)) fail(`Recursive type alias ${a.name} is unsupported.`, a.node);
      if (actual.length !== a.params.length) fail(`Type alias ${a.name} needs exactly ${a.params.length} concrete type argument(s).`, a.node);
      return expand(byFile.get(a.file), a.text, a.node, new Map(a.params.map((p, i) => [p, actual[i]])), [...stack, a.id], used);
    });
  });
  for (const r of records) blame(r.file, undefined, () => {
    // Validate generic templates with primitive placeholders. Each actual use
    // is expanded and checked again with its concrete argument shapes.
    for (const a of r.aliases.values()) expand(r, a.text, a.node, new Map(a.params.map((p) => [p, "number"])), [a.id], new Map());
    for (const h of r.headers.values()) blame(r.file, h.name, () => {
      for (const a of h.annotations) expand(r, a.text, a.node, new Map(), [], new Map());
      h.params = h.params.map((p) => {
        const used = new Map();
        const type = expand(r, p.text, p.node, new Map(), [], used);
        return { ...p, type, typeAliases: [...used.values()] };
      });
    });
  });
  const program = {
    scopes,
    build(h, node) {
      if (!built.has(h.id)) { built.set(h.id, null); built.set(h.id, body(h, scopes.get(h.file))); }
      return built.get(h.id) ?? fail(`Recursive call to ${h.name} is unsupported.`, node);
    },
  };
  for (const r of records) blame(r.file, undefined, () => {
    const names = new Map(r.headers);
    for (const imp of r.imports) for (const b of imp.bindings) if (b.kind === "value") names.set(b.local, exported(byFile.get(imp.file), b.imported, "value", imp.node));
    scopes.set(r.file, { file: r.file, source: r.source, names, stripped: r.stripped, tokens: r.tokens, program,
      validateType: (text, at) => expand(r, text, at, new Map(), [], new Map()),
    });
  });
  const targets = records.flatMap((r) => [...r.headers.values()].map((h) => program.build(h, h.top)));
  if (!targets.length) blame(records.at(-1).file, undefined, () => fail("No functions to verify.", null, "error"));
  return { targets, modules: records.map((r) => ({ file: r.file, bindings: [...scopes.get(r.file).names].map(([local, h]) => [local, h.id]) })) };
}
