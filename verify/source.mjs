import { stripTypeScriptTypes } from "node:module";
import { Parser } from "acorn";

const OPTIONS = { ecmaVersion: 2022, sourceType: "module", preserveParens: true };
const BUILTINS = new Set(["Number", "Math", "Object", "Array"]);
const RESERVED = new Set(["result", ...BUILTINS, "NaN", "Infinity", "undefined", "real"]);
const CONSTANTS = new Map([
  ["NaN", NaN], ["Infinity", Infinity],
  ...["MAX_VALUE", "MIN_VALUE", "MAX_SAFE_INTEGER", "MIN_SAFE_INTEGER", "POSITIVE_INFINITY", "NEGATIVE_INFINITY", "NaN"]
    .map((name) => [`Number.${name}`, Number[name]]),
]);

export { SourceError } from "./error.mjs";
import { fail, blame } from "./error.mjs";
import * as data from "./data.mjs";
const { and, not, need, implies } = data;
const SELF = { sort: "function" };

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
  return data.every(owner, bound, (value, index) => {
    const inner = new Map(env);
    callback.params.forEach((p, i) => bind(inner, p, i ? index : value));
    return expression(callback.body, inner, cx);
  }, node);
}

function call(node, env, cx) {
  const name = node.callee.name, unit = cx.unit;
  if (cx.contract) fail("Contracts cannot call source functions yet; only every is supported.", node);
  if (env.has(name)) fail(binding(env, node.callee).value === SELF ? "Recursive calls are unsupported." : `${name} is a local data value, not a top-level function.`, node.callee);
  const callee = cx.scope.names.get(name);
  if (!callee) fail(`Unknown function ${name}. Only top-level functions and named imports can be called.`, node.callee);
  if (node.arguments.some((a) => a.type === "SpreadElement") || node.arguments.length !== callee.params.length) {
    fail(`${name} takes exactly ${callee.params.length} argument(s); spread, missing and extra arguments are unsupported.`, node);
  }
  const args = node.arguments.map((a) => expression(a, env, cx));
  const target = cx.scope.program.build(callee, node);
  const bound = callee.params.map((p, i) => data.argument(p.type, args[i], node.arguments[i], unit.fresh));
  // Callee clauses: caller's SMT unit, callee's lexical scope and blame.
  const { requires, ensures, value } = blame(callee.file, callee.name, () => {
    const spec = { guard: "true", contract: true, unit, scope: cx.scope.program.scopes.get(callee.file) };
    const penv = new Map();
    callee.params.forEach((p, i) => bind(penv, p.node, bound[i].value));
    const clauses = (list) => and(...list.map((c) => need(expression(c.ast, penv, spec), "boolean", c.span)));
    const requires = clauses(callee.requires);
    const fresh = data.input(target.resultType, unit.fresh("call"));
    unit.declarations.push(...fresh.declarations);
    penv.set("result", { kind: "contract", value: fresh.value });
    return { requires, ensures: clauses(callee.ensures), value: fresh.value };
  });
  unit.events.push({ guard: cx.guard, safe: and(...bound.map((b) => b.safe), requires), assume: ensures, callee: callee.id });
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
        value = data.property(value, key, read(p.value));
      }
    }
    return value;
  }
  if (node.type === "UnaryExpression") return data.unary(node.operator, read(node.argument), node);
  if (node.type === "LogicalExpression") return data.logical(node.operator, read(node.left), (runs) => {
    const skipped = new Map(env), taken = new Map(env);
    const value = under(node.right, runs, taken);
    joinEnvironment(env, runs, taken, skipped, node);
    return value;
  }, node);
  if (node.type === "BinaryExpression") return data.binary(node.operator, read(node.left), read(node.right), node);
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
    if (c.object.type === "Identifier" && BUILTINS.has(c.object.name)) return data.builtin(`${c.object.name}.${c.property.name}`, node.arguments.map(read), node);
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
      const match = /^\s*\*?\s*@?(requires|ensures)\b(.*)$/.exec(line);
      if (match) {
        const text = match[2].trim();
        clauses.push(clause(comment, match[1], text, offset + line.indexOf(text, line.indexOf(match[1]) + match[1].length)));
      }
      offset += line.length + 1;
    }
  }
  return { clauses, types };
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

function scopedStatements(list, states, returns, cx, functionBody = false) {
  return states.flatMap((s) => {
    const env = lexicalBindings(list, s.env, functionBody);
    return statements(list, [{ path: s.path, env }], returns, cx).map((v) => ({
      path: v.path,
      env: new Map([...s.env].map(([name, original]) => {
        const current = v.env.get(name);
        return [name, current.declaration === original.declaration ? current : original];
      })),
    }));
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
    } else {
      fail(`Unsupported ${node.type}. Loops, heap effects, and unmodeled calls are rejected.`, node);
    }
    if (states.length + returns.length > 128) fail("This function exceeds the first slice's 128-path limit.", node);
  }
  return states;
}

// Header: everything a caller needs except the result shape, which comes from
// compiling the body (memoized, dependency-first, cycles rejected at the call).
function header(top, file, source, comments, tokens) {
  const declaration = top.type === "ExportNamedDeclaration" ? top.declaration : top;
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
  return blame(file, name, () => {
    const info = contracts(leadingComments(source, comments, top.start));
    if (!info.clauses.some((c) => c.kind === "ensures")) fail("A function needs at least one ensures contract.", top, "error");
    const params = fn.params.map((p) => {
      if (p.type !== "Identifier") fail("Parameters need simple names, without defaults or destructuring.", p);
      const after = tokens.find((t) => t.start >= p.end);
      const annotation = source.slice(p.end, after.start).trim();
      if (annotation && !annotation.startsWith(":")) fail("Optional parameters are unsupported; use an explicit primitive | undefined type.", p);
      const text = annotation ? annotation.slice(1).trim() : info.types.get(p.name);
      if (!text) fail(`Give ${p.name} a supported data annotation or a JSDoc @param type. Types are input assumptions.`, p);
      return { name: p.name, node: p, type: data.parseType(text, p) };
    });
    const own = (kind) => info.clauses.filter((c) => c.kind === kind).map((c) => ({ ...c, file }));
    return { id: `${file}#${name}`, file, name, top, fn, params, requires: own("requires"), ensures: own("ensures") };
  });
}

function body(h, scope) {
  const { fn, name, top } = h;
  return blame(h.file, name, () => {
    let next = 0;
    const unit = { declarations: [], events: [], fresh: (tag) => `${tag}${next++}` };
    const env = new Map();
    if (fn.type === "FunctionExpression" && fn.id) bind(env, fn.id, SELF, "self");
    const declarations = [], lengths = [];
    const params = h.params.map((p, index) => {
      const value = data.input(p.type, `input_${index}`);
      bind(env, p.node, value.value, "parameter");
      declarations.push(...value.declarations);
      lengths.push(...value.lengths);
      return { name: p.name, type: p.type, model: value.model };
    });
    const spec = { guard: "true", contract: true, unit, scope };
    const pre = and(...h.requires.map((c) => need(expression(c.ast, env, spec), "boolean", c.span)));
    const returns = [];
    const cx = { guard: "true", contract: false, unit, scope };
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
    const ensures = and(...h.ensures.map((c) => need(expression(c.ast, env, spec), "boolean", c.span)));
    // Call k is safe under earlier facts only; ensures uses every fact.
    const facts = [], defs = [];
    const obligations = callerEvents.map((e, k) => {
      const safe = implies(and(e.guard, ...facts), e.safe);
      const fact = implies(e.guard, e.assume);
      if (fact !== "true") { defs.push(`(define-fun call_fact${k} () Bool ${fact})`); facts.push(`call_fact${k}`); }
      return safe;
    });
    const post = and(...obligations, implies(and(...facts), ensures));
    return {
      id: h.id, file: h.file, name, span: { start: top.start, end: top.end }, params, resultType: data.valueType(result),
      requires: h.requires.map(({ ast, ...c }) => c), ensures: h.ensures.map(({ ast, ...c }) => c),
      callees: [...new Set(callerEvents.map((e) => e.callee))],
      executable: scope.stripped.slice(fn.start, fn.end),
      declarations: [...declarations, ...unit.declarations, ...defs].join("\n"),
      smallWitness: and(...lengths.map((len) => `(bvule ${len} (_ bv${data.REPLAY_LIMIT} 32))`)),
      pre, post,
    };
  });
}

function importRecord(top, resolve) {
  if (top.specifiers.some((s) => s.type !== "ImportSpecifier")) fail("Only named imports are supported; default and namespace imports are not.", top);
  if (!top.specifiers.length) fail("Side-effect and empty imports are unsupported. For type-only names, use import type { T } from './file.ts'.", top);
  const bindings = top.specifiers.map((s) => {
    if (s.imported.type !== "Identifier" || s.imported.name === "default") fail("Import ordinary named exports; string and default names are unsupported.", top);
    if (RESERVED.has(s.local.name)) fail(`Import local ${s.local.name} cannot shadow a verifier builtin.`, top);
    return { imported: s.imported.name, local: s.local.name, node: top };
  });
  return { specifier: top.source.value, file: resolve(top.source.value, top), bindings };
}

/**
 * One module record, without executing it. `resolve(specifier, node)` returns
 * a canonical file id or throws; the source-string API passes a rejecting one.
 */
export function parse(file, source, resolve) {
  return blame(file, undefined, () => {
    let stripped = source;
    if (/\.[cm]?ts$/.test(file)) {
      try {
        // Node removes a leading BOM. Restore it so every AST offset still
        // indexes the captured source, just as type erasure preserves offsets.
        const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
        stripped = bom + stripTypeScriptTypes(source.slice(bom.length), { mode: "strip" });
      }
      catch (e) { fail(`TypeScript type stripping failed: ${e.message}`, null, "error"); }
      if (stripped.length !== source.length) fail("Type stripping changed source offsets.", null);
    }
    let program;
    const comments = [], tokens = [];
    try { program = Parser.parse(stripped, { ...OPTIONS, onComment: comments, onToken: tokens }); }
    catch (e) { fail(e.message, { start: e.pos ?? 0, end: (e.pos ?? 0) + 1 }, "error"); }
    if (!program.body.length) fail("No functions to verify.", null, "error");
    const headers = new Map(), exports = new Map(), imports = [], lists = [];
    for (const top of program.body) {
      if (top.type === "ImportDeclaration") { imports.push(importRecord(top, resolve)); continue; }
      if (top.type === "ExportNamedDeclaration" && !top.declaration) {
        if (top.source) fail("Re-exports are unsupported; export local function declarations.", top);
        lists.push(top);
        continue;
      }
      const h = header(top, file, source, comments, tokens);
      if (headers.has(h.name)) fail(`Duplicate function ${h.name}.`, top);
      headers.set(h.name, h);
      if (top.type === "ExportNamedDeclaration") exports.set(h.name, h);
    }
    // Export aliases name a declaration; they never create local bindings.
    for (const s of lists.flatMap((top) => top.specifiers)) {
      if (s.exported.type !== "Identifier" || s.exported.name === "default") fail("Export ordinary names; string and default exports are unsupported.", s);
      exports.set(s.exported.name, headers.get(s.local.name) ?? fail(`${s.local.name} is imported; re-exports are unsupported.`, s));
    }
    return { file, source, stripped, headers, exports, imports };
  });
}

/** Link parsed records (imports already resolved and loaded) and compile every function. */
export function compile(records) {
  const byFile = new Map(records.map((r) => [r.file, r]));
  const built = new Map(), scopes = new Map();
  const program = {
    scopes,
    build(h, node) {
      if (!built.has(h.id)) { built.set(h.id, null); built.set(h.id, body(h, scopes.get(h.file))); }
      return built.get(h.id) ?? fail(`Recursive call to ${h.name} is unsupported.`, node);
    },
  };
  for (const r of records) blame(r.file, undefined, () => {
    const names = new Map(r.headers);
    for (const imp of r.imports) for (const b of imp.bindings) {
      names.set(b.local, byFile.get(imp.file).exports.get(b.imported) ?? fail(`${imp.specifier} has no exported function ${b.imported}.`, b.node, "error"));
    }
    scopes.set(r.file, { file: r.file, names, stripped: r.stripped, program });
  });
  const targets = records.flatMap((r) => [...r.headers.values()].map((h) => program.build(h, h.top)));
  return { targets, modules: records.map((r) => ({ file: r.file, bindings: [...scopes.get(r.file).names].map(([local, h]) => [local, h.id]) })) };
}
