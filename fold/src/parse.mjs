// Parser for .fold files.  The result is a syntax tree whose nodes carry
// [start, end) source offsets; check.mjs gives it meaning.
//
//   file      := item*
//   item      := 'export'? 'const' NAME '=' expr ';'
//              | 'model' '{' field* '}'
//              | 'store' STRING '{' ('save' | 'done' | 'failed') ':' NAME ';' ... '}'
//              | 'on' TAG '(' (NAME ':' type)? ')' body
//              | 'invariant' NAME ':' expr ';'
//   field     := 'saved'? NAME ':' type '=' expr ';'
//   type      := 'boolean' | 'Nat' ('<' sum '>')? ('|' 'null')?
//              | 'IdOf' '<' NAME '>' ('|' 'null')? | 'Item' '<' sum '>' '[' ']'
//   body      := '{' (stmt* | if) '}'
//   if        := 'if' '(' expr ')' block ('else' 'if' '(' expr ')' block)* ('else' block)?
//   block     := '{' stmt* '}'
//   stmt      := 'next' '.' NAME '=' expr ';' | 'save' '(' ')' ';'
//
// Expressions use JavaScript's precedence: ! binds tightest, then *, then
// + and -, then < <= > >=, then === !==, then &&, then ||.  Calls, member
// access, arrow functions (it) => ..., and arrays of { id, label } items
// are parsed generally and checked later.

import { lex, FoldError } from "./lex.mjs";

const describe = (t) =>
  t.t === "eof" ? "the end of the file" : t.t === "str" ? "a string" : `"${t.v}"`;

export function parse(src) {
  const toks = lex(src);
  let k = 0;
  const peek = (o = 0) => toks[Math.min(k + o, toks.length - 1)];
  const next = () => toks[k++];
  const is = (v, o = 0) => {
    const t = peek(o);
    return (t.t === "p" || t.t === "id") && t.v === v;
  };
  const fail = (msg, t = peek()) => {
    throw new FoldError(msg, t.start, t.end);
  };
  const expect = (v, what = `"${v}"`) => (is(v) ? next() : fail(`Expected ${what} but found ${describe(peek())}.`));
  const name = (what) => (peek().t === "id" ? next() : fail(`Expected ${what} but found ${describe(peek())}.`));
  const span = (t) => ({ start: t.start, end: t.end });

  function file() {
    const items = [];
    while (peek().t !== "eof") items.push(item());
    return { items, end: src.length };
  }

  function item() {
    if (is("export") || is("const")) return constItem();
    if (is("model")) return modelItem();
    if (is("store")) return storeItem();
    if (is("on")) return ruleItem();
    if (is("invariant")) return invariantItem();
    return fail(`Expected const, model, store, on, or invariant but found ${describe(peek())}.`);
  }

  function constItem() {
    const start = peek().start;
    let exported = false;
    if (is("export")) {
      next();
      exported = true;
    }
    expect("const");
    const n = name("a constant name");
    expect("=");
    const value = expr();
    const semi = expect(";");
    return { kind: "const", exported, name: n.v, nameSpan: span(n), value, start, end: semi.end };
  }

  function modelItem() {
    const kw = next();
    expect("{");
    const fields = [];
    while (!is("}")) {
      if (peek().t === "eof") fail("This model block is never closed.", kw);
      const start = peek().start;
      let saved = false;
      if (is("saved") && peek(1).t === "id") {
        next();
        saved = true;
      }
      const n = name("a field name");
      expect(":");
      const type = typeExpr();
      expect("=", '"=" and the initial value');
      const init = expr();
      const semi = expect(";");
      fields.push({ saved, name: n.v, nameSpan: span(n), type, init, start, end: semi.end });
    }
    const close = next();
    return { kind: "model", fields, headSpan: span(kw), start: kw.start, end: close.end };
  }

  function typeExpr() {
    const t = name("a type");
    const nullable = () => {
      if (!is("|")) return null;
      next();
      return expect("null");
    };
    switch (t.v) {
      case "boolean":
        return { k: "bool", start: t.start, end: t.end };
      case "Nat": {
        let max = null;
        let end = t.end;
        if (is("<")) {
          next();
          max = sum();
          end = expect(">").end;
        }
        const nl = nullable();
        return { k: "nat", max, nullable: !!nl, start: t.start, end: nl ? nl.end : end };
      }
      case "IdOf": {
        expect("<");
        const l = name("a list field");
        const gt = expect(">");
        const nl = nullable();
        return { k: "idof", list: l.v, listSpan: span(l), nullable: !!nl, start: t.start, end: nl ? nl.end : gt.end };
      }
      case "Item": {
        expect("<");
        const max = sum();
        expect(">");
        expect("[");
        const close = expect("]");
        return { k: "items", max, start: t.start, end: close.end };
      }
      default:
        return fail(`Unknown type ${t.v}. The types are boolean, Nat, Nat<max>, Nat<max> | null, IdOf<list> | null, and Item<max>[].`, t);
    }
  }

  function storeItem() {
    const kw = next();
    const key = peek();
    if (key.t !== "str") fail(`Expected the store key, a string, but found ${describe(key)}.`);
    next();
    expect("{");
    const entries = {};
    while (!is("}")) {
      const kname = name("save, done, or failed");
      if (!["save", "done", "failed"].includes(kname.v)) fail("A store has save, done, and failed entries.", kname);
      if (entries[kname.v]) fail(`The store already has a ${kname.v} entry.`, kname);
      expect(":");
      const v = name("a name");
      expect(";");
      entries[kname.v] = { name: v.v, span: span(v) };
    }
    const close = next();
    for (const e of ["save", "done", "failed"]) {
      if (!entries[e]) throw new FoldError(`The store needs a ${e} entry.`, kw.start, close.end);
    }
    return { kind: "store", key: key.v, keySpan: span(key), ...entries, headSpan: { start: kw.start, end: key.end }, start: kw.start, end: close.end };
  }

  function ruleItem() {
    const kw = next();
    const tag = name("a message name");
    expect("(");
    let param = null;
    if (!is(")")) {
      const p = name("a parameter name");
      expect(":");
      param = { name: p.v, span: span(p), type: typeExpr() };
    }
    const rp = expect(")");
    const body = ruleBody();
    return { kind: "rule", tag: tag.v, tagSpan: span(tag), param, headSpan: { start: kw.start, end: rp.end }, body, start: kw.start, end: body.end };
  }

  function ruleBody() {
    const open = expect("{");
    if (!is("if")) {
      const stmts = statements(true);
      const close = expect("}");
      return { k: "stmts", stmts, start: open.start, end: close.end };
    }
    const branches = [];
    let otherwise = null;
    for (;;) {
      const kw = expect("if");
      expect("(");
      const cond = expr();
      const rp = expect(")");
      const body = block();
      branches.push({ cond, headSpan: { start: kw.start, end: rp.end }, body, start: kw.start, end: body.end });
      if (!is("else")) break;
      const el = next();
      if (is("if")) continue;
      const b = block();
      otherwise = { headSpan: span(el), body: b, start: el.start, end: b.end };
      break;
    }
    if (!is("}")) fail("An if chain must be the whole body of a rule.");
    const close = next();
    return { k: "if", branches, otherwise, start: open.start, end: close.end };
  }

  function block() {
    const open = expect("{");
    const stmts = statements(false);
    const close = expect("}");
    return { stmts, start: open.start, end: close.end };
  }

  function statements(top) {
    const out = [];
    while (!is("}") && peek().t !== "eof") {
      if (is("if")) fail(top ? "An if chain must be the whole body of a rule." : "Ifs do not nest. Use else if.");
      out.push(statement());
    }
    return out;
  }

  function statement() {
    if (is("save")) {
      const s = next();
      expect("(");
      expect(")");
      const semi = expect(";");
      return { k: "save", start: s.start, end: semi.end };
    }
    if (is("next")) {
      const n = next();
      expect(".");
      const f = name("a field name");
      expect("=");
      const value = expr();
      const semi = expect(";");
      return { k: "assign", field: f.v, fieldSpan: span(f), value, start: n.start, end: semi.end };
    }
    return fail(`Expected next.<field> = ...; or save(); but found ${describe(peek())}.`);
  }

  function invariantItem() {
    const kw = next();
    const n = name("an invariant name");
    expect(":");
    const e = expr();
    const semi = expect(";");
    return { kind: "invariant", name: n.v, nameSpan: span(n), expr: e, start: kw.start, end: semi.end };
  }

  // Expressions.
  const level = (ops, sub) => () => {
    let l = sub();
    while (ops.some((o) => is(o))) {
      const op = next();
      const r = sub();
      l = { k: "bin", op: op.v, l, r, opSpan: span(op), start: l.start, end: r.end };
    }
    return l;
  };
  const product = level(["*"], unary);
  const sum = level(["+", "-"], product);
  const relation = level(["<", "<=", ">", ">="], sum);
  const equality = level(["===", "!=="], relation);
  const conjunction = level(["&&"], equality);
  const expr = level(["||"], conjunction);

  function unary() {
    if (is("!")) {
      const b = next();
      const arg = unary();
      return { k: "not", arg, start: b.start, end: arg.end };
    }
    if (is("-")) fail("Numbers are never negative here.");
    return postfix();
  }

  function postfix() {
    let e = primary();
    for (;;) {
      if (is(".")) {
        next();
        const p = name("a name");
        e = { k: "member", obj: e, prop: p.v, propSpan: span(p), start: e.start, end: p.end };
      } else if (is("(")) {
        next();
        const args = [];
        if (!is(")")) {
          args.push(argument());
          while (is(",")) {
            next();
            args.push(argument());
          }
        }
        const rp = expect(")");
        e = { k: "call", callee: e, args, start: e.start, end: rp.end };
      } else return e;
    }
  }

  function argument() {
    if (is("(") && peek(1).t === "id" && is(")", 2) && is("=>", 3)) {
      const lp = next();
      const p = next();
      next();
      next();
      const body = expr();
      return { k: "arrow", param: p.v, paramSpan: span(p), body, start: lp.start, end: body.end };
    }
    if (peek().t === "id" && is("=>", 1)) {
      const p = next();
      next();
      const body = expr();
      return { k: "arrow", param: p.v, paramSpan: span(p), body, start: p.start, end: body.end };
    }
    return expr();
  }

  function primary() {
    const t = peek();
    if (t.t === "num") {
      next();
      return { k: "num", v: t.v, start: t.start, end: t.end };
    }
    if (t.t === "str") {
      next();
      return { k: "str", v: t.v, start: t.start, end: t.end };
    }
    if (t.t === "id") {
      next();
      if (t.v === "true" || t.v === "false") return { k: "bool", v: t.v === "true", start: t.start, end: t.end };
      if (t.v === "null") return { k: "null", start: t.start, end: t.end };
      return { k: "id", name: t.v, start: t.start, end: t.end };
    }
    if (is("(")) {
      const lp = next();
      const e = expr();
      const rp = expect(")");
      return { ...e, start: lp.start, end: rp.end };
    }
    if (is("[")) {
      const lb = next();
      const items = [];
      while (!is("]")) {
        items.push(itemLiteral());
        if (!is(",")) break;
        next();
      }
      const rb = expect("]");
      return { k: "array", items, start: lb.start, end: rb.end };
    }
    return fail(`Expected an expression but found ${describe(t)}.`);
  }

  function itemLiteral() {
    const lb = expect("{", 'an item like { id: 1, label: "Alpha" }');
    const fields = {};
    while (!is("}")) {
      const key = name("id or label");
      if (key.v !== "id" && key.v !== "label") fail("An item has an id and a label.", key);
      if (fields[key.v]) fail(`This item already has a ${key.v}.`, key);
      expect(":");
      if (key.v === "id") fields.id = sum();
      else {
        const s = peek();
        if (s.t !== "str") fail(`Expected the label, a string, but found ${describe(s)}.`);
        next();
        fields.label = s;
      }
      if (!is(",")) break;
      next();
    }
    const rb = expect("}");
    if (!fields.id || !fields.label) throw new FoldError("An item has an id and a label.", lb.start, rb.end);
    return { k: "item", id: fields.id, label: fields.label.v, labelSpan: span(fields.label), start: lb.start, end: rb.end };
  }

  return file();
}
