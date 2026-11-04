// From the syntax tree to a Fold.v program (the IR), with the invariants
// as Rocq propositions.  Nothing here is trusted: Rocq checks the program
// with [fwfb] and proves the invariants.  These checks are only there so
// mistakes are reported on the right line, in .fold terms, before Rocq runs.

import { FoldError } from "./lex.mjs";

const MAX_SAFE = 9007199254740991n;
// A nat literal in a generated .v file is unary until Rocq's number
// notation converts it, so keep the ones that reach [nat] small.
export const NAT_LIMIT = 5000n;

const RESERVED = new Set([
  "Model", "Saved", "SavedJson", "Message", "initialModel", "restore", "flags", "init", "fire",
  "update", "can", "model", "message", "next", "n", "it", "store", "text", "args", "saved",
  "Effect", "Option", "Schema", "KeyValueStore", "Command", "defineMessageUnion", "Return", "Math",
]);
const UNION_RESERVED = new Set([
  "make", "match", "matchOrElse", "cases", "ast", "members", "subset", "guards", "isAnyOf",
  "Type", "Encoded",
]);
const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;

const err = (msg, node, code = 2) => new FoldError(msg, node.start, node.end, code);

export function check(ast) {
  const consts = new Map(); // name -> { k: "num", v } | { k: "list", v: [[id, label]] }
  const exported = [];
  let model = null;
  let store = null;
  const rules = [];
  const invariants = [];
  const seen = new Map();
  const declare = (name, node, what) => {
    if (seen.has(name)) throw err(`${name} is already declared as ${seen.get(name)}.`, node);
    seen.set(name, what);
  };

  for (const it of ast.items) {
    if (it.kind === "const") {
      if (!IDENT.test(it.name)) throw err("Names start with a letter.", it.nameSpan);
      if (RESERVED.has(it.name)) throw err(`${it.name} is reserved in the generated module.`, it.nameSpan);
      declare(it.name, it.nameSpan, "a constant");
      if (it.value.k === "array") {
        if (it.exported) throw err("Only number constants can be exported.", it.nameSpan);
        consts.set(it.name, { k: "list", v: items(it.value, consts), node: it });
      } else {
        const v = constNum(it.value, consts);
        if (it.exported && v > NAT_LIMIT) throw err(`An exported constant is at most ${NAT_LIMIT}.`, it.value);
        consts.set(it.name, { k: "num", v, node: it });
        if (it.exported) exported.push({ name: it.name, value: v, span: it.nameSpan });
      }
    } else if (it.kind === "model") {
      if (model) throw err("There is already a model block.", it.headSpan);
      model = it;
    } else if (it.kind === "store") {
      if (store) throw err("There is already a store block.", it.headSpan);
      store = it;
    } else if (it.kind === "rule") rules.push(it);
    else invariants.push(it);
  }
  if (!model) throw new FoldError("A program needs a model block.", 0, 0);

  // The model.
  const fields = new Map(); // name -> { kind, ... }
  const flags = [], nums = [], opts = [], lists = [];
  const saved = [];
  const refs = [];
  for (const f of model.fields) {
    if (!IDENT.test(f.name)) throw err("Names start with a letter.", f.nameSpan);
    if (RESERVED.has(f.name)) throw err(`${f.name} is reserved in the generated module.`, f.nameSpan);
    declare(f.name, f.nameSpan, "a model field");
    const t = f.type;
    let field;
    if (t.k === "bool") {
      if (f.init.k !== "bool") throw err("A boolean field starts as true or false.", f.init);
      field = { kind: "flag", name: f.name, init: f.init.v };
      flags.push(field);
    } else if (t.k === "nat") {
      const max = t.max ? constNum(t.max, consts) : MAX_SAFE;
      if (max > MAX_SAFE) throw err(`The maximum is at most Number.MAX_SAFE_INTEGER (${MAX_SAFE}).`, t.max);
      if (t.nullable) {
        const init = f.init.k === "null" ? null : natInit(f.init, consts, max);
        field = { kind: "opt", name: f.name, init, max };
        opts.push(field);
      } else {
        if (f.init.k === "null") throw err("This field is not nullable. Add | null to its type.", f.init);
        field = { kind: "num", name: f.name, init: natInit(f.init, consts, max), max };
        nums.push(field);
      }
    } else if (t.k === "idof") {
      const l = model.fields.find((g) => g.name === t.list);
      if (!l || l.type.k !== "items") throw err(`${t.list} is not a list field of the model.`, t.listSpan);
      if (!t.nullable) throw err("A model field that refers to an item is nullable: IdOf<list> | null.", t);
      if (f.saved !== l.saved) {
        throw err(`${f.name} refers to ${t.list}, so they are saved together or not at all.`, f.nameSpan);
      }
      const max = constNum(l.type.max, consts);
      if (f.init.k !== "null") throw err("A reference starts as null.", f.init);
      field = { kind: "opt", name: f.name, init: null, max };
      opts.push(field);
      refs.push([f.name, t.list]);
    } else {
      const max = constNum(t.max, consts);
      if (max > MAX_SAFE) throw err(`The maximum is at most Number.MAX_SAFE_INTEGER (${MAX_SAFE}).`, t.max);
      const init = listValue(f.init, consts);
      const ids = new Set();
      for (const [id] of init) {
        if (id > max) throw err(`Item id ${id} is above the maximum ${max}.`, f.init);
        if (ids.has(id)) throw err(`Item id ${id} appears twice.`, f.init);
        ids.add(id);
      }
      field = { kind: "list", name: f.name, init, max };
      lists.push(field);
    }
    field.span = f.nameSpan;
    field.saved = f.saved;
    fields.set(f.name, field);
    if (f.saved) saved.push(f.name);
  }
  const maxes = [...nums, ...opts, ...lists].map((f) => [f.name, f.max]);

  // The store.
  if (saved.length && !store) throw err("Saved fields need a store block.", model.headSpan);
  if (store && !saved.length) throw err("Nothing is saved. Mark fields saved, or drop the store.", store.headSpan);
  let storeIR = null;
  if (store) {
    if (!IDENT.test(store.key)) throw err("The store key is a name: letters, digits, and _, starting with a letter.", store.keySpan);
    const cmd = store.save.name;
    if (!IDENT.test(cmd) || RESERVED.has(cmd)) throw err(`${cmd} cannot name the save command.`, store.save.span);
    if (seen.has(cmd)) throw err(`${cmd} is already declared as ${seen.get(cmd)}.`, store.save.span);
    if (store.done.name === store.failed.name) throw err("done and failed are different messages.", store.failed.span);
    storeIR = { key: store.key, cmd, done: store.done.name, failed: store.failed.name, store };
  }

  // Messages and clauses.
  const messages = [];
  const update = [];
  const clauses = [];
  const tags = new Map();
  for (const r of rules) {
    if (!IDENT.test(r.tag) || !/^[A-Z]/.test(r.tag)) throw err("A message name starts with a capital letter.", r.tagSpan);
    if (UNION_RESERVED.has(r.tag)) throw err(`${r.tag} is reserved by Schema's tagged unions.`, r.tagSpan);
    if (RESERVED.has(r.tag)) throw err(`${r.tag} is reserved in the generated module.`, r.tagSpan);
    if (tags.has(r.tag)) throw err(`There is already a rule for ${r.tag}. Use if / else if in one rule.`, r.tagSpan);
    if (fields.has(r.tag) || consts.has(r.tag)) throw err(`${r.tag} is already declared as ${seen.get(r.tag)}.`, r.tagSpan);
    let schema = { k: "none" };
    if (r.param) {
      const pt = r.param.type;
      // The printed message carries its payload as n (Message.Tag({ n })),
      // so the source uses the same name.
      if (r.param.name !== "n") {
        throw err(`Name the parameter n: the printed message carries it as n, as in Message.${r.tag}({ n }).`, r.param.span);
      }
      if (pt.k === "nat" && !pt.nullable) schema = { k: "nat", max: pt.max ? constNum(pt.max, consts) : MAX_SAFE };
      else if (pt.k === "idof" && !pt.nullable) {
        const l = fields.get(pt.list);
        if (!l || l.kind !== "list") throw err(`${pt.list} is not a list field of the model.`, pt.listSpan);
        schema = { k: "nat", max: l.max };
      } else throw err("A message parameter is Nat, Nat<max>, or IdOf<list>.", pt);
      if (schema.max > MAX_SAFE) throw err(`The maximum is at most Number.MAX_SAFE_INTEGER (${MAX_SAFE}).`, pt);
    }
    if (storeIR && (r.tag === storeIR.done || r.tag === storeIR.failed) && schema.k !== "none") {
      throw err(`${r.tag} is the store's result message, so it has no parameter.`, r.tagSpan);
    }
    tags.set(r.tag, schema);
    messages.push([r.tag, schema]);
    const env = { fields, consts, param: r.param ? r.param.name : null, store: storeIR, rule: r };
    const cs = ruleClauses(r, env);
    cs.forEach((c, i) => {
      c.tag = r.tag;
      c.index = i;
      c.id = `${r.tag}_${i}`;
      clauses.push(c);
    });
    update.push([r.tag, cs]);
  }
  if (storeIR) {
    for (const t of [storeIR.done, storeIR.failed]) if (!tags.has(t)) messages.push([t, { k: "none" }]);
  }

  // Invariants.
  const invs = [];
  const invNames = new Set();
  for (const inv of invariants) {
    if (!IDENT.test(inv.name)) throw err("Names start with a letter.", inv.nameSpan);
    if (invNames.has(inv.name)) throw err(`There is already an invariant named ${inv.name}.`, inv.nameSpan);
    invNames.add(inv.name);
    const used = new Set();
    const prop = invProp(inv.expr, { fields, consts, used });
    if (prop.t !== "prop") throw err("An invariant is a condition, like model.count < limit.", inv.expr);
    invs.push({ name: inv.name, prop: prop.s, flags: [...used], node: inv });
  }

  return {
    flags, nums, opts, lists, maxes, saved, refs, store: storeIR,
    consts: exported, messages, update, clauses, invariants: invs, rules,
  };
}

// Constants and initial values.

function constNum(e, consts) {
  switch (e.k) {
    case "num":
      return e.v;
    case "id": {
      const c = consts.get(e.name);
      if (!c) throw err(`${e.name} is not a constant declared above.`, e);
      if (c.k !== "num") throw err(`${e.name} is a list, not a number.`, e);
      return c.v;
    }
    case "bin": {
      const a = constNum(e.l, consts), b = constNum(e.r, consts);
      if (e.op === "+") return a + b;
      if (e.op === "*") return a * b;
      if (e.op === "-") {
        if (b > a) throw err(`${a} - ${b} is below 0.`, e);
        return a - b;
      }
    }
    // fallthrough
    default:
      throw err("Expected a number, a constant, or + - * of those.", e);
  }
}

function natInit(e, consts, max) {
  const v = constNum(e, consts);
  if (v > max) throw err(`${v} is above this field's maximum ${max}.`, e);
  if (v > NAT_LIMIT) throw err(`An initial value is at most ${NAT_LIMIT}.`, e);
  return v;
}

function items(arr, consts) {
  return arr.items.map((it) => {
    const id = constNum(it.id, consts);
    if (id > NAT_LIMIT) throw err(`An item id is at most ${NAT_LIMIT}.`, it.id);
    return [id, it.label];
  });
}

function listValue(e, consts) {
  if (e.k === "array") return items(e, consts);
  if (e.k === "id") {
    const c = consts.get(e.name);
    if (!c) throw err(`${e.name} is not a constant declared above.`, e);
    if (c.k !== "list") throw err(`${e.name} is a number, not a list of items.`, e);
    return c.v;
  }
  throw err('Expected a list of items, like [{ id: 1, label: "Alpha" }], or a constant naming one.', e);
}

// Rules.

function ruleClauses(r, env) {
  const b = r.body;
  if (b.k === "stmts") {
    return [{ ...emptyConds(), ...body(b.stmts, env), headSpan: r.headSpan, bodySpan: b }];
  }
  const out = b.branches.map((br) => ({
    ...conds(br.cond, env),
    ...body(br.body.stmts, env),
    headSpan: br.headSpan,
    condSpan: br.cond,
    bodySpan: br.body,
  }));
  if (b.otherwise) {
    out.push({ ...emptyConds(), ...body(b.otherwise.body.stmts, env), headSpan: b.otherwise.headSpan, bodySpan: b.otherwise.body, isElse: true });
  }
  return out;
}

const emptyConds = () => ({ when: [], guard: { k: "true" }, conds: [] });

function conjuncts(e) {
  return e.k === "bin" && e.op === "&&" ? [...conjuncts(e.l), ...conjuncts(e.r)] : [e];
}

const modelField = (e) =>
  e.k === "member" && e.obj.k === "id" && e.obj.name === "model" ? e.prop : null;

function conds(c, env) {
  const when = [];
  const cs = [];
  const guards = [];
  for (const p of conjuncts(c)) {
    const w = whenPart(p, env);
    if (w) {
      if (when.some(([f]) => f === w[0])) throw err(`model.${w[0]} is already tested in this condition.`, p);
      when.push(w);
      continue;
    }
    const k = condPart(p, env);
    if (k) {
      cs.push(k);
      continue;
    }
    guards.push(guard(p, env));
  }
  const g = guards.length ? guards.reduce((a, b) => ({ k: "and", a, b })) : { k: "true" };
  return { when, guard: g, conds: cs };
}

function flagOf(e, env) {
  const f = modelField(e);
  if (!f) return null;
  const fd = env.fields.get(f);
  return fd && fd.kind === "flag" ? f : null;
}

function whenPart(p, env) {
  let f = flagOf(p, env);
  if (f) return [f, true];
  if (p.k === "not" && (f = flagOf(p.arg, env))) return [f, false];
  if (p.k === "bin" && (p.op === "===" || p.op === "!==")) {
    let fl = flagOf(p.l, env), b = p.r;
    if (!fl) {
      fl = flagOf(p.r, env);
      b = p.l;
    }
    if (fl && b.k === "bool") return [fl, p.op === "===" ? b.v : !b.v];
    if (fl) throw err("Compare a boolean field with true or false.", p);
  }
  return null;
}

function condPart(p, env) {
  // model.o !== null
  if (p.k === "bin" && (p.op === "!==" || p.op === "===")) {
    const o = modelField(p.l) ?? modelField(p.r);
    const other = modelField(p.l) ? p.r : p.l;
    const fd = o && env.fields.get(o);
    if (fd && fd.kind === "opt") {
      if (other.k !== "null") throw err(`model.${o} can be null; test model.${o} !== null first.`, p);
      if (p.op === "===") throw err(`Only model.${o} !== null can be tested; give the null case its own else branch.`, p);
      return { k: "set", o };
    }
  }
  // model.l.some((it) => it.id === e)
  if (p.k === "call" && p.callee.k === "member" && p.callee.prop === "some") {
    const l = modelField(p.callee.obj);
    const fd = l && env.fields.get(l);
    if (!fd || fd.kind !== "list") throw err(".some is for a list field: model.items.some((it) => it.id === id).", p);
    const a = p.args[0];
    const bad = () => err(`Write model.${l}.some((it) => it.id === <number>).`, p);
    if (p.args.length !== 1 || a.k !== "arrow") throw bad();
    lambdaParam(a, env);
    const b = a.body;
    if (b.k !== "bin" || b.op !== "===") throw bad();
    const isId = (x) => x.k === "member" && x.obj.k === "id" && x.obj.name === a.param && x.prop === "id";
    const e = isId(b.l) ? b.r : isId(b.r) ? b.l : null;
    if (!e) throw bad();
    return { k: "has", l, e: expr(e, env) };
  }
  return null;
}

function guard(p, env) {
  if (p.k === "bool" && p.v) return { k: "true" };
  if (p.k === "not") return { k: "not", a: guard(p.arg, env) };
  if (p.k === "bin") {
    const ex = (x) => expr(x, env);
    switch (p.op) {
      case "&&":
        return { k: "and", a: guard(p.l, env), b: guard(p.r, env) };
      case "<":
        return { k: "lt", a: ex(p.l), b: ex(p.r) };
      case "<=":
        return { k: "le", a: ex(p.l), b: ex(p.r) };
      case ">":
        return { k: "lt", a: ex(p.r), b: ex(p.l) };
      case ">=":
        return { k: "le", a: ex(p.r), b: ex(p.l) };
      case "===": {
        const a = ex(p.l), b = ex(p.r);
        return { k: "and", a: { k: "le", a, b }, b: { k: "le", a: b, b: a } };
      }
      case "!==": {
        const a = ex(p.l), b = ex(p.r);
        return { k: "not", a: { k: "and", a: { k: "le", a, b }, b: { k: "le", a: b, b: a } } };
      }
      case "||":
        throw err("A rule's condition cannot use ||. Split it into else if branches.", p.opSpan);
    }
  }
  throw err("Expected a condition on the model and the parameter, like model.count + n < limit.", p);
}

function expr(e, env) {
  switch (e.k) {
    case "num":
      if (e.v > NAT_LIMIT) throw err(`A number in a rule is at most ${NAT_LIMIT}. Use a field's maximum for larger bounds.`, e);
      return { k: "num", v: e.v };
    case "id": {
      if (env.param && e.name === env.param) return { k: "arg" };
      const c = env.consts.get(e.name);
      if (c && c.k === "num") {
        if (c.v > NAT_LIMIT) throw err(`${e.name} is ${c.v}; a number in a rule is at most ${NAT_LIMIT}.`, e);
        return { k: "num", v: c.v, name: e.name };
      }
      if (env.fields.has(e.name)) throw err(`Write model.${e.name}.`, e);
      throw err(`${e.name} is not the parameter or a number constant.`, e);
    }
    case "member": {
      const f = modelField(e);
      if (!f) throw err("Expected model.<field>.", e);
      const fd = env.fields.get(f);
      if (!fd) throw err(`The model has no field ${f}.`, e.propSpan);
      if (fd.kind !== "num") throw err(`model.${f} is not a number field.`, e);
      return { k: "var", x: f };
    }
    case "bin":
      if (e.op === "+") return { k: "add", a: expr(e.l, env), b: expr(e.r, env) };
      if (e.op === "-") {
        throw err(`Subtraction stops at 0 in the model. Write Math.max(0, a - b), and the printed code does the same.`, e.opSpan);
      }
      if (e.op === "*") throw err("Rules cannot multiply.", e.opSpan);
      break;
    case "call":
      if (e.callee.k === "member" && e.callee.obj.k === "id" && e.callee.obj.name === "Math" && e.callee.prop === "max") {
        const [z, d] = e.args;
        if (e.args.length === 2 && z.k === "num" && z.v === 0n && d.k === "bin" && d.op === "-") {
          return { k: "sub", a: expr(d.l, env), b: expr(d.r, env) };
        }
        throw err("Only Math.max(0, a - b) is supported.", e);
      }
      break;
  }
  throw err("Expected a number expression: numbers, constants, the parameter, model.<field>, +, and Math.max(0, a - b).", e);
}

function body(stmts, env) {
  const out = { flags: [], nums: [], opts: [], lists: [], save: false, stmts: [] };
  const done = new Set();
  for (const s of stmts) {
    if (s.k === "save") {
      if (!env.store) throw err("save() needs a store block.", s);
      if (out.save) throw err("save() is already called in this branch.", s);
      out.save = true;
      out.saveSpan = s;
      continue;
    }
    const f = env.fields.get(s.field);
    if (!f) throw err(`The model has no field ${s.field}.`, s.fieldSpan);
    if (done.has(s.field)) throw err(`next.${s.field} is already set in this branch.`, s.fieldSpan);
    done.add(s.field);
    const v = s.value;
    if (f.kind === "flag") {
      if (v.k !== "bool") throw err(`next.${s.field} is set to true or false.`, v);
      out.flags.push([s.field, v.v]);
    } else if (f.kind === "num") {
      out.nums.push([s.field, expr(v, env)]);
    } else if (f.kind === "opt") {
      if (v.k === "null") out.opts.push([s.field, { k: "null" }]);
      else out.opts.push([s.field, { k: "some", e: expr(v, env) }]);
    } else {
      out.lists.push([s.field, listExpr(v, f, env)]);
    }
  }
  return out;
}

// A callback's parameter must not hide a name the body also uses: in
// (model) => model.id !== model.selected, TypeScript reads model.selected as
// the item's field, so the builder must not read it as the model's.
function lambdaParam(a, env) {
  const x = a.param;
  if (x === "model" || x === "next" || x === env.param || env.consts.has(x)) {
    throw err(`The parameter ${x} hides the outer ${x}. Name it something else, such as it.`, a.paramSpan);
  }
}

function listExpr(v, f, env) {
  // model.l.filter((it) => it.id !== model.o)
  if (v.k === "call" && v.callee.k === "member" && v.callee.prop === "filter") {
    const l = modelField(v.callee.obj);
    const bad = () => err(`Write model.${f.name}.filter((it) => it.id !== model.<field>), where the field is IdOf<${f.name}> | null.`, v);
    if (l !== f.name || v.args.length !== 1 || v.args[0].k !== "arrow") throw bad();
    const a = v.args[0];
    lambdaParam(a, env);
    const b = a.body;
    if (b.k !== "bin" || b.op !== "!==") throw bad();
    const isId = (x) => x.k === "member" && x.obj.k === "id" && x.obj.name === a.param && x.prop === "id";
    const other = isId(b.l) ? b.r : isId(b.r) ? b.l : null;
    const o = other && modelField(other);
    const fd = o && env.fields.get(o);
    if (!fd || fd.kind !== "opt") throw bad();
    return { k: "drop", o };
  }
  const l = listValue(v, env.consts);
  return { k: "lit", v: l, node: v };
}

// Invariants, as Rocq propositions over Z.

function invProp(e, env) {
  const P = (s) => ({ t: "prop", s });
  const Z = (s) => ({ t: "z", s });
  const B = (s) => ({ t: "bool", s });
  const prop = (x) => {
    const r = invProp(x, env);
    if (r.t === "bool") return `bt ${r.s}`;
    if (r.t !== "prop") throw err("Expected a condition here.", x);
    return r.s;
  };
  const num = (x) => {
    const r = invProp(x, env);
    if (r.t !== "z") throw err("Expected a number here.", x);
    return r.s;
  };
  switch (e.k) {
    case "num":
      return Z(`${e.v}`);
    case "bool":
      return P(e.v ? "True" : "False");
    case "id": {
      const c = env.consts.get(e.name);
      if (c && c.k === "num") return Z(`${c.v}`);
      if (env.fields.has(e.name)) throw err(`Write model.${e.name}.`, e);
      throw err(`${e.name} is not a number constant.`, e);
    }
    case "member": {
      const f = modelField(e);
      if (!f) throw err("Expected model.<field>.", e);
      const fd = env.fields.get(f);
      if (!fd) throw err(`The model has no field ${f}.`, e.propSpan);
      if (fd.kind === "flag") {
        env.used.add(f);
        return B(`(flag m "${f}")`);
      }
      if (fd.kind === "num") return Z(`(Z.of_nat (num m "${f}"))`);
      throw err("Invariants are about boolean and number fields for now.", e);
    }
    case "not":
      return P(`(~ ${prop(e.arg)})`);
    case "bin": {
      const op = e.op;
      if (op === "&&") return P(`(${prop(e.l)} /\\ ${prop(e.r)})`);
      if (op === "||") return P(`(${prop(e.l)} \\/ ${prop(e.r)})`);
      if (op === "+" || op === "-" || op === "*") return Z(`(${num(e.l)} ${op} ${num(e.r)})`);
      const zop = { "<": "<", "<=": "<=", ">": ">", ">=": ">=" }[op];
      if (zop) return P(`(${num(e.l)} ${zop} ${num(e.r)})%Z`);
      if (op === "===" || op === "!==") {
        const l = invProp(e.l, env), r = invProp(e.r, env);
        let s;
        if (l.t === "z" && r.t === "z") s = `(${l.s} = ${r.s})%Z`;
        else if (l.t !== "z" && r.t !== "z") {
          const asProp = (x) => (x.t === "bool" ? `bt ${x.s}` : x.s);
          s = `(${asProp(l)} <-> ${asProp(r)})`;
        } else throw err("Compare numbers with numbers and conditions with conditions.", e);
        return P(op === "===" ? s : `(~ ${s})`);
      }
    }
  }
  throw err("Expected a condition on boolean and number fields.", e);
}
