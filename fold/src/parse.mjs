// The reader for .fold files.  A .fold file is JavaScript syntax, and so
// also TypeScript syntax: acorn parses it, and this file accepts only the
// forms below.  It turns them into a syntax tree whose nodes carry
// [start, end) source offsets, and check.mjs gives that tree meaning.
// Anything else is rejected here, on its own span, instead of being read
// loosely.
//
//   file   := item*
//   item   := 'export'? 'const' NAME '=' expr ';'
//           | 'model' '(' '{' (NAME ':' ('saved' | 'local') '(' type ',' expr ')' ',')* '}' ')' ';'
//           | 'store' '(' STRING ',' '{' 'save' ':' STRING ',' 'done' ':' STRING ',' 'failed' ':' STRING '}' ')' ';'
//           | 'on' '(' STRING ',' ('(' ')' | type ',' '(' NAME ')') '=>' body ')' ';'
//           | 'invariant' '(' STRING ',' '(' ')' '=>' expr ')' ';'
//   type   := 'bool' | 'nat' '(' expr? ')' | 'idOf' '(' STRING ')'
//           | 'nullable' '(' ('nat' '(' expr? ')' | 'idOf' '(' STRING ')') ')'
//           | 'items' '(' expr ')'
//   body   := '{' (stmt* | if) '}'
//   if     := 'if' '(' expr ')' block ('else' 'if' '(' expr ')' block)* ('else' block)?
//   block  := '{' stmt* '}'
//   stmt   := 'next' '.' NAME '=' expr ';' | 'save' '(' ')' ';'
//
// Expressions are numbers (decimal, with _ only between digits), strings
// (printable ASCII, no escapes), true, false, null, names, a.b, calls,
// (x) => e as an argument, arrays of { id, label } items, !, * + -,
// < <= > >=, === !==, &&, and ||.  Semicolons follow JavaScript's rules.

import { Parser } from "acorn";
import { FoldError } from "./error.mjs";

const OPTIONS = { ecmaVersion: 2022, sourceType: "module", preserveParens: true };

// The names the reader gives meaning to.  A constant cannot take one, so a
// name always means the same thing to the reader and to the editor.
const BUILTINS = new Set([
  "model", "store", "on", "invariant", "saved", "local", "bool", "nat", "nullable", "idOf", "items",
  "next", "save",
]);

const BINARY = new Set(["*", "+", "-", "<", "<=", ">", ">=", "===", "!==", "&&", "||"]);

const TYPES =
  'The types are bool, nat(), nat(max), idOf("list"), nullable(nat(max)), nullable(idOf("list")), and items(max).';

const span = (n) => ({ start: n.start, end: n.end });
const fail = (msg, n, code = 1) => {
  throw new FoldError(msg, n.start, n.end, code);
};
const calls = (n, name) =>
  n && n.type === "CallExpression" && !n.optional && n.callee.type === "Identifier" && n.callee.name === name;

export function parse(src) {
  const tokens = [];
  let program;
  try {
    program = Parser.parse(src, { ...OPTIONS, onToken: tokens });
  } catch (e) {
    if (!(e instanceof SyntaxError) || typeof e.pos !== "number") throw e;
    const end = e.raisedAt > e.pos ? e.raisedAt : e.pos + 1;
    throw new FoldError(`${e.message.replace(/ \(\d+:\d+\)$/, "")}.`, e.pos, Math.min(end, src.length));
  }

  // The first token of [n], for a short span on a long statement.
  const head = (n) => tokens.find((t) => t.start >= n.start) ?? n;
  // The last token that ends at or before [pos] with the given label.
  const tokenBefore = (pos, label) => tokens.findLast((t) => t.end <= pos && t.type.label === label);

  // A string literal's text, and its span without the quotes.  The printed
  // TypeScript writes these names bare (case "Raised"), so mappings from it
  // to the source are verbatim.
  function str(n, what) {
    if (n.type === "TemplateLiteral") fail(`Write ${what} as a plain string, in quotes.`, n);
    if (n.type !== "Literal" || typeof n.value !== "string") fail(`Expected ${what}, a string.`, n);
    for (let i = n.start + 1; i < n.end - 1; i++) {
      const c = src.charCodeAt(i);
      if (c === 0x5c) fail("Strings cannot contain backslashes or escapes.", { start: i, end: i + 1 });
      if (c < 0x20 || c > 0x7e || c === 0x22) fail('Strings hold printable ASCII only, with no " or \\.', { start: i, end: i + 1 });
    }
    return { v: n.value, span: { start: n.start + 1, end: n.end - 1 } };
  }

  // A number, read from its source text: acorn's value is a double, which
  // is not exact above Number.MAX_SAFE_INTEGER.
  function num(n) {
    if (!/^(0|[1-9][0-9]*(_[0-9]+)*)$/.test(n.raw)) fail("Numbers are whole decimal numbers, like 42 or 1_000.", n);
    return { k: "num", v: BigInt(n.raw.replaceAll("_", "")), ...span(n) };
  }

  // name: value, with no computed key, shorthand, method, or spread.
  function propName(p) {
    if (p.type !== "Property" || p.computed || p.method || p.shorthand || p.kind !== "init" || p.key.type !== "Identifier") {
      fail("Write name: value here.", p);
    }
    return p.key.name;
  }

  // Top level.

  function item(s) {
    if (s.type === "ExportNamedDeclaration") {
      if (!s.declaration || s.declaration.type !== "VariableDeclaration") fail("Only export const NAME = value; is supported.", head(s));
      return constant(s.declaration, s, true);
    }
    if (s.type === "VariableDeclaration") return constant(s, s, false);
    if (s.type === "ExpressionStatement") {
      const e = s.expression;
      if (calls(e, "model")) return model(e, s);
      if (calls(e, "store")) return store(e, s);
      if (calls(e, "on")) return rule(e, s);
      if (calls(e, "invariant")) return invariant(e, s);
    }
    return fail("Expected const, model(...), store(...), on(...), or invariant(...).", head(s));
  }

  function constant(d, s, exported) {
    if (d.kind !== "const") fail(`Use const, not ${d.kind}.`, head(d));
    if (d.declarations.length !== 1) fail("Declare one constant per const.", d);
    const [v] = d.declarations;
    if (v.id.type !== "Identifier") fail("Expected a constant name.", v.id);
    if (!v.init) fail("A constant needs a value.", v);
    if (BUILTINS.has(v.id.name)) fail(`${v.id.name} is part of .fold. Name the constant something else.`, v.id, 2);
    return { kind: "const", exported, name: v.id.name, nameSpan: span(v.id), value: expr(v.init), ...span(s) };
  }

  function model(call, s) {
    const [obj] = call.arguments;
    if (call.arguments.length !== 1 || obj.type !== "ObjectExpression") fail("Write model({ field: saved(type, initial), ... }).", call);
    const fields = obj.properties.map((p) => {
      const name = propName(p);
      const v = p.value;
      if (!(calls(v, "saved") || calls(v, "local")) || v.arguments.length !== 2) {
        fail(`Write ${name}: saved(type, initial), or ${name}: local(type, initial) for a field that is not saved.`, v);
      }
      return { saved: v.callee.name === "saved", name, nameSpan: span(p.key), type: type(v.arguments[0]), init: expr(v.arguments[1]), ...span(p) };
    });
    return { kind: "model", fields, headSpan: span(call.callee), ...span(s) };
  }

  function type(n, nullable = false) {
    if (n.type === "Identifier" && n.name === "bool" && !nullable) return { k: "bool", ...span(n) };
    if (calls(n, "nat") && n.arguments.length <= 1) {
      return { k: "nat", max: n.arguments.length ? expr(n.arguments[0]) : null, nullable, ...span(n) };
    }
    if (calls(n, "idOf") && n.arguments.length === 1) {
      const l = str(n.arguments[0], "the name of a list field");
      return { k: "idof", list: l.v, listSpan: l.span, nullable, ...span(n) };
    }
    if (calls(n, "items") && n.arguments.length === 1 && !nullable) return { k: "items", max: expr(n.arguments[0]), ...span(n) };
    if (calls(n, "nullable") && n.arguments.length === 1 && !nullable) return { ...type(n.arguments[0], true), ...span(n) };
    return fail(nullable ? `Only nat and idOf types are nullable. ${TYPES}` : `Unknown type. ${TYPES}`, n);
  }

  function store(call, s) {
    const [k, obj] = call.arguments;
    if (call.arguments.length !== 2 || obj.type !== "ObjectExpression") {
      fail('Write store("key", { save: "SaveCommand", done: "DoneMessage", failed: "FailedMessage" }).', call);
    }
    const key = str(k, "the store key");
    const entries = {};
    for (const p of obj.properties) {
      const e = propName(p);
      if (!["save", "done", "failed"].includes(e)) fail("A store has save, done, and failed entries.", p.key);
      if (entries[e]) fail(`The store already has a ${e} entry.`, p.key);
      const v = str(p.value, e === "save" ? "the save command's name" : "a message name");
      entries[e] = { name: v.v, span: v.span };
    }
    for (const e of ["save", "done", "failed"]) if (!entries[e]) fail(`The store needs a ${e} entry.`, obj);
    return { kind: "store", key: key.v, keySpan: key.span, ...entries, headSpan: span(call.callee), ...span(s) };
  }

  function rule(call, s) {
    const a = call.arguments;
    const fn = a[a.length - 1];
    if ((a.length !== 2 && a.length !== 3) || fn.type !== "ArrowFunctionExpression") {
      fail('Write on("Tag", () => { ... }), or on("Tag", nat(max), (n) => { ... }) for a message that carries a number.', call);
    }
    const tag = str(a[0], "the message name");
    if (fn.async || fn.body.type !== "BlockStatement") fail("A rule's body is a block: () => { ... }.", fn);
    let param = null;
    if (a.length === 3) {
      const [p] = fn.params;
      if (fn.params.length !== 1 || p.type !== "Identifier") fail("This message carries a number. Write (n) => { ... }.", fn);
      param = { name: p.name, span: span(p), type: type(a[1]) };
    } else if (fn.params.length) {
      fail(`This message carries nothing. To carry a number, write on("${tag.v}", nat(max), (n) => { ... }).`, fn.params[0]);
    }
    const arrow = tokenBefore(fn.body.start, "=>");
    return { kind: "rule", tag: tag.v, tagSpan: tag.span, param, headSpan: { start: call.start, end: arrow.end }, body: ruleBody(fn.body), ...span(s) };
  }

  function invariant(call, s) {
    const [n, fn] = call.arguments;
    if (call.arguments.length !== 2 || fn.type !== "ArrowFunctionExpression" || fn.async || fn.params.length || fn.body.type === "BlockStatement") {
      fail('Write invariant("name", () => condition).', call);
    }
    const name = str(n, "the invariant's name");
    return { kind: "invariant", name: name.v, nameSpan: name.span, expr: expr(fn.body), ...span(s) };
  }

  // Rule bodies.

  function ruleBody(b) {
    const [first, second] = b.body;
    if (!first || first.type !== "IfStatement") return { k: "stmts", stmts: statements(b.body, true), ...span(b) };
    if (second) fail("An if chain must be the whole body of a rule.", head(second));
    const branches = [];
    let otherwise = null;
    for (let s = first; ; s = s.alternate) {
      const rp = tokenBefore(s.consequent.start, ")");
      const body = block(s.consequent);
      branches.push({ cond: expr(s.test), headSpan: { start: s.start, end: rp.end }, body, start: s.start, end: body.end });
      if (!s.alternate) break;
      if (s.alternate.type === "IfStatement") continue;
      const el = tokenBefore(s.alternate.start, "else");
      const ob = block(s.alternate);
      otherwise = { headSpan: span(el), body: ob, start: el.start, end: ob.end };
      break;
    }
    return { k: "if", branches, otherwise, ...span(b) };
  }

  function block(b) {
    if (b.type !== "BlockStatement") fail("Put this branch in braces: { ... }.", b);
    return { stmts: statements(b.body, false), ...span(b) };
  }

  function statements(list, top) {
    return list.map((s) => {
      if (s.type === "IfStatement") fail(top ? "An if chain must be the whole body of a rule." : "Ifs do not nest. Use else if.", head(s));
      return statement(s);
    });
  }

  function statement(s) {
    const e = s.type === "ExpressionStatement" ? s.expression : null;
    if (calls(e, "save")) {
      if (e.arguments.length) fail("save() takes no arguments.", e);
      return { k: "save", ...span(s) };
    }
    if (e && e.type === "AssignmentExpression") {
      const l = e.left;
      if (l.type === "MemberExpression" && !l.computed && l.object.type === "Identifier" && l.object.name === "next" && l.property.type === "Identifier") {
        if (e.operator !== "=") fail(`Write next.${l.property.name} = ...; with =, not ${e.operator}.`, e);
        return { k: "assign", field: l.property.name, fieldSpan: span(l.property), value: expr(e.right), ...span(s) };
      }
    }
    if (e && e.type === "UpdateExpression") fail(`${e.operator} is not supported. Write next.<field> = model.<field> + 1;`, e);
    return fail("Expected next.<field> = ...; or save();", s.type === "ExpressionStatement" ? s : head(s));
  }

  // Expressions.

  function expr(n) {
    switch (n.type) {
      case "ParenthesizedExpression":
        return { ...expr(n.expression), ...span(n) };
      case "Literal":
        if (typeof n.value === "number" || typeof n.value === "bigint") return num(n);
        if (typeof n.value === "string") return { k: "str", v: str(n, "a string").v, ...span(n) };
        if (typeof n.value === "boolean") return { k: "bool", v: n.value, ...span(n) };
        if (n.raw === "null") return { k: "null", ...span(n) };
        break;
      case "Identifier":
        return { k: "id", name: n.name, ...span(n) };
      case "MemberExpression":
        if (n.optional) fail("?. is not supported. Use .", n);
        if (n.computed || n.property.type !== "Identifier") fail("Use .name here; [ ] is not supported.", n);
        return { k: "member", obj: expr(n.object), prop: n.property.name, propSpan: span(n.property), ...span(n) };
      case "ChainExpression":
        return fail("?. is not supported. Use .", n);
      case "CallExpression":
        if (n.optional) fail("?. is not supported. Use .", n);
        return { k: "call", callee: expr(n.callee), args: n.arguments.map(argument), ...span(n) };
      case "BinaryExpression":
      case "LogicalExpression": {
        const op = n.operator;
        // The operator is the first token after the left operand (whose
        // span includes any parentheses around it).
        const opSpan = span(tokens.find((t) => t.start >= n.left.end));
        if (op === "==" || op === "!=") fail(`Use ${op}= to compare.`, opSpan);
        if (!BINARY.has(op)) fail(`${op} is not supported.`, opSpan);
        return { k: "bin", op, l: expr(n.left), r: expr(n.right), opSpan, ...span(n) };
      }
      case "UnaryExpression":
        if (n.operator === "!") return { k: "not", arg: expr(n.argument), ...span(n) };
        if (n.operator === "-") fail("Numbers are never negative here.", n);
        return fail(`${n.operator} is not supported.`, n);
      case "ArrayExpression":
        return { k: "array", items: n.elements.map((x) => itemLiteral(x, n)), ...span(n) };
      case "AssignmentExpression":
      case "UpdateExpression":
        return fail("Only a rule's next.<field> = ...; statement changes anything.", n);
      case "ConditionalExpression":
        return fail("?: is not supported. Use if and else in a rule.", n);
      case "TemplateLiteral":
        return fail("Use a plain string, in quotes.", n);
      case "ArrowFunctionExpression":
        return fail("A callback is only an argument, as in model.items.some((it) => it.id === n).", n);
    }
    return fail("Expected a number, a string, true, false, null, a name, a.b, a call, or an operator.", n);
  }

  function argument(n) {
    if (n.type !== "ArrowFunctionExpression") return expr(n);
    const [p] = n.params;
    if (n.async || n.params.length !== 1 || p.type !== "Identifier" || n.body.type === "BlockStatement") {
      fail("A callback is (it) => condition.", n);
    }
    return { k: "arrow", param: p.name, paramSpan: span(p), body: expr(n.body), ...span(n) };
  }

  function itemLiteral(n, array) {
    if (!n || n.type !== "ObjectExpression") fail('Expected an item, like { id: 1, label: "Alpha" }.', n ?? array);
    const fields = {};
    for (const p of n.properties) {
      const key = propName(p);
      if (key !== "id" && key !== "label") fail("An item has an id and a label.", p.key);
      if (fields[key]) fail(`This item already has a ${key}.`, p.key);
      fields[key] = p.value;
    }
    if (!fields.id || !fields.label) fail("An item has an id and a label.", n);
    const label = str(fields.label, "the label");
    return { k: "item", id: expr(fields.id), label: label.v, labelSpan: label.span, ...span(n) };
  }

  return { items: program.body.map(item), end: src.length };
}
