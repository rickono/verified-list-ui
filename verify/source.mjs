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
import * as heap from "./heap.mjs";
const { and, or, not, need, implies } = data;
// One heap-state binding per environment, keyed by a symbol so
// scope exit (restore) and joins treat it like an outer declaration.
const { HEAP } = heap;
const HEAP_DECL = Object.freeze({ type: "HeapState" });
function getHeap(env, node) {
  const found = env.get(HEAP);
  if (!found) fail("Heap contents are unavailable in this context.", node);
  return found.value;
}
const setHeap = (env, state) => env.set(HEAP, { ...env.get(HEAP), value: state });
function focused(v, env, cx, node) {
  if (!heap.isRef(v)) return v;
  if (cx.pure) fail("Pure callbacks cannot read the heap; capture a primitive snapshot (const v = a.x) instead.", node);
  if (!cx.contract) heap.registry(cx.unit).reads = true;
  return heap.focus(cx.unit, getHeap(env, node), v);
}
// Evaluate `modifies` paths in a contract environment at one heap state.
function footprint(clauses, env, cx) {
  const checks = [];
  return clauses.flatMap((c) => heap.footprintPaths(c)).map((p) => {
    const scx = { ...cx, contract: true, phase: "requires", checks };
    let owner = expression(p.object, env, scx), key = p.key, path = pathOf(p.object);
    if (p.expression && owner.sort === "object") {
      const field = focused(owner, env, scx, p.node).fields.get(key)?.value;
      if (field?.sort === "array") { owner = field; path = pathOf(p.expression); key = undefined; }
    }
    if (!heap.isRef(owner)) fail("modifies paths must start at a collection parameter.", p.node);
    if (checks.some((c) => c !== "true")) fail("modifies paths must be total (required fields only).", p.node);
    if (owner.sort === "array" && key === undefined) return { ref: owner.ref, key: "@elements", sort: owner.type.element, path };
    if (owner.sort === "array") fail("Array modifies paths name the whole array; length and shape changes are unsupported.", p.node);
    if (p.whole) fail("A record modifies path must name a primitive field.", p.node);
    return { ref: owner.ref, key, sort: heap.writableField(owner.type, key, p.node), path };
  });
}

function allocateView(view, node, env, cx) {
  if (cx.contract) {
    const ref = `(- ${cx.unit.specRefs = (cx.unit.specRefs ?? 0) + 1})`;
    return { ...view, ref, type: data.valueType(view), spec: true };
  }
  if (cx.pure) fail("Pure callbacks cannot allocate collections.", node);
  if (cx.loop) fail("Loops that allocate collections are outside the first heap slice.", node);
  const made = heap.alloc(cx.unit, getHeap(env, node), view, node);
  cx.unit.events.push({ guard: cx.guard, safe: "true", assume: made.facts, label: { kind: "alloc", span: { start: node.start, end: node.end } } });
  heap.registry(cx.unit).allocated = true;
  setHeap(env, made.state);
  return made.value;
}
const SELF = Symbol("named-function-self");
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
  if (env.get(HEAP)?.value.role === "summary") fail("Requires must read the pre-call heap, not its summary.", clauses[0]?.span);
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

function joinEnvironment(env, condition, yes, no, node, unit) {
  for (const [name, original] of env) {
    const a = yes.get(name), b = no.get(name);
    if (a === b) continue;
    if (name === HEAP) { env.set(HEAP, { ...original, value: heap.join(unit, condition, a.value, b.value) }); continue; }
    env.set(name, { ...original, value: data.merge(condition, a.value, b.value, node) });
  }
}

function every(node, env, cx) {
  if (!cx.contract) fail("every is supported in requires/ensures contracts, not in function bodies.", node);
  const [callback, ...extra] = node.arguments;
  if (extra.length || callback?.type !== "ArrowFunctionExpression" || callback.async || callback.body.type === "BlockStatement" || callback.params.length > 2) {
    fail("every takes one expression-bodied arrow (value, index) => condition, without thisArg or the array parameter.", callback ?? node);
  }
  const owner = focused(expression(node.callee.object, env, cx), env, cx, node);
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

// Pure numeric predicate values.
// A function value is never stored, merged, compared or returned. Applications
// produce terms plus closed checks; under binders they never become events.
const FP_SORT = "(_ FloatingPoint 11 53)";
const { isFunctionType } = data;

function freeNames(node, bound, out) {
  if (!node || typeof node !== "object") return out;
  if (node.type === "Identifier") { if (!bound.has(node.name)) out.add(node.name); return out; }
  if (node.type === "MemberExpression") { freeNames(node.object, bound, out); if (node.computed) freeNames(node.property, bound, out); return out; }
  if (node.type === "Property") { if (node.computed) freeNames(node.key, bound, out); freeNames(node.value, bound, out); return out; }
  if (["ArrowFunctionExpression", "FunctionExpression"].includes(node.type)) fail("Nested callback values are unsupported in this slice.", node);
  if (node.type === "ThisExpression") fail("Callbacks cannot read this.", node);
  for (const v of Object.values(node)) if (Array.isArray(v)) v.forEach((c) => freeNames(c, bound, out)); else if (v && typeof v === "object" && v.type) freeNames(v, bound, out);
  return out;
}

// Arrow -> closure value: defining scope, captured declarations, annotations.
function closure(node, env, cx) {
  if (cx.contract) fail("Callback values are unsupported inside contracts; use every for quantified predicates.", node);
  if (node.async || node.generator) fail("Callbacks must be synchronous, non-generator arrows.", node);
  if (node.body.type === "BlockStatement") fail("Callbacks are expression-bodied arrows in this slice.", node.body);
  if (node.params.length !== 1) fail("Numeric predicates take one parameter in this slice.", node);
  const params = new Set();
  const captures = [];
  for (const p of node.params) {
    if (p.type !== "Identifier" || RESERVED.has(p.name)) fail("Callback parameters need simple, nonreserved names.", p);
    if (params.has(p.name) || env.has(p.name)) fail("Callback parameters cannot shadow other bindings.", p);
    params.add(p.name);
  }
  for (const name of freeNames(node.body, params, new Set())) {
    if (!env.has(name)) continue;
    const b = binding(env, { type: "Identifier", name, start: node.start, end: node.end });
    if (b.value === SELF) fail("Recursive callbacks are unsupported.", node);
    if (!["const", "parameter"].includes(b.kind)) fail(`Callback captures ${b.kind} binding ${name}; only immutable const/parameter captures are supported.`, node);
    if (!["number", "boolean", "undefined"].includes(b.value.sort)) fail(`Callback captures ${name}, a ${b.value.sort} reference or function; only number/boolean/undefined captures are supported.`, node);
    captures.push({ declaration: b.declaration, kind: b.kind, value: b.value });
  }
  const { source, tokens } = cx.scope;
  const arrow = tokens.find((t) => t.start >= (node.params.at(-1)?.end ?? node.start) && t.type.label === "=>");
  const ann = (text, at) => { const a = readAnnotation(text, at); return a === undefined ? undefined : cx.scope.validateType(a, at); };
  const annotations = {
    params: node.params.map((p) => ann(source.slice(p.end, tokens.find((t) => t.start >= p.end).start), p)),
    result: (() => {
      const close = [...tokens].reverse().find((t) => t.end <= arrow.start && t.start >= node.start && t.type.label === ")");
      return close && close.end > (node.params.at(-1)?.end ?? node.start) ? ann(source.slice(close.end, arrow.start), close) : undefined;
    })(),
  };
  const complete = annotations.params.every((t) => t !== undefined) && annotations.result !== undefined;
  if (annotations.params.some((t) => t !== undefined && t !== "number") || annotations.result !== undefined && annotations.result !== "boolean") fail("Numeric predicates take one number and return a present boolean.", node);
  return { sort: "function", kind: "closure", node, env: new Map(env), scope: cx.scope, owner: cx.unit.owner, annotations,
    purity: { kind: "checked", origin: "closure", captures },
    type: complete ? { kind: "function", params: annotations.params, result: annotations.result } : undefined };
}

// Named top-level/imported function used as a value. Identity is the header id.
function namedValue(h, node, cx) {
  if (h.spec) fail("@spec functions cannot be passed as callbacks.", node);
  const target = cx.scope.program.build(h, node);
  if (h.params.length !== 1 || h.params[0].type !== "number" || target.resultType !== "boolean") fail(`Named predicate ${h.name} must take one number and return a present boolean.`, node);
  if (target.effects?.kind !== "pure") fail(`Named predicate ${h.name} has derived heap effects (${target.effects?.kind}); only pure functions can be callbacks.`, node);
  cx.unit.dependencies.add(h.id);
  return { sort: "function", kind: "named", callee: h, purity: { kind: "checked", origin: "named", target: h.id }, type: { kind: "function", params: ["number"], result: "boolean" } };
}

function callbackRequires(h, args, cx) {
  return blame(h.file, h.name, () => {
    const penv = new Map();
    h.params.forEach((p, i) => bind(penv, p.node, args[i]));
    const spec = { guard: "true", contract: true, checks: [], unit: cx.unit,
      scope: cx.scope.program.scopes.get(h.file), phase: "requires", entry: new Map(penv) };
    return preconditions(h.requires, penv, spec);
  });
}

// Named-function summary, one UF per callee id per unit, emitted as an ordered
// guarded fact after admission, so it never affects requires
// definedness or feasibility. It is a consistent theory when the callee is
// verified; final status is gated on that.
function namedSymbol(h, cx) {
  const unit = cx.unit;
  if (!unit.functions.has(h.id)) {
    const symbol = unit.fresh("predicate");
    const sort = (t) => t === "number" ? FP_SORT : "Bool";
    const vars = h.params.map((p, i) => `${symbol}_x${i}`);
    const penv = new Map();
    h.params.forEach((p, i) => bind(penv, p.node, p.type === "number" ? data.numberView(vars[i]) : data.bool(vars[i])));
    const before = [unit.events.length, unit.declarations.length];
    const axiom = blame(h.file, h.name, () => {
      const spec = { guard: "true", contract: true, checks: [], unit, scope: cx.scope.program.scopes.get(h.file), phase: "requires", entry: new Map(penv) };
      const pre = preconditions(h.requires, penv, spec);
      const target = cx.scope.program.build(h, h.top);
      const app = `(${symbol} ${vars.join(" ")})`;
      penv.set("result", { kind: "contract", value: target.resultType === "number" ? data.numberView(app) : data.bool(app) });
      spec.phase = "ensures";
      const ens = and(...h.ensures.map((c) => need(expression(c.ast, penv, spec), "boolean", c.span)));
      return { pre: pre.value, defined: pre.defined, post: and(ens, ...spec.checks) };
    });
    if (unit.events.length !== before[0] || unit.declarations.length !== before[1]) fail(`The contract of ${h.name} is not closed-form; it cannot summarize a callback.`, h.top);
    const binders = vars.map((v, i) => `(${v} ${sort(h.params[i].type)})`).join(" ");
    const flag = `${symbol}_contract`;
    unit.functions.set(h.id, { symbol, declaration: `(declare-fun ${symbol} (${h.params.map((p) => sort(p.type)).join(" ")}) Bool)\n(define-fun ${flag} () Bool (forall (${binders}) ${implies(and(axiom.defined, axiom.pre), axiom.post)}))`, fact: flag });
  }
  const entry = unit.functions.get(h.id);
  const guard = cx.callbackGuard ?? "true", key = JSON.stringify([h.id, guard]);
  if (guard !== "false" && !unit.emittedFunctions.has(key)) {
    unit.emittedFunctions.add(key);
    unit.pendingAxioms.push({ guard, safe: "true", assume: entry.fact, label: { kind: "callback-fact", span: { start: h.top.start, end: h.top.start } } });
  }
  return entry.symbol;
}

function flushAxioms(unit) { if (unit.pendingAxioms?.length) unit.events.push(...unit.pendingAxioms.splice(0)); }

// Value of applying a function value to argument views (already checked
// against the parameter types). Returns {value, checks}; checks are closed.
function applyValue(f, args, node, cx) {
  if (!f.purity) fail("A predicate needs checked source purity or an explicit input-domain assumption.", node);
  const view = (t, smt) => t === "number" ? data.numberView(smt) : data.bool(smt);
  if (f.kind === "symbol") return { value: view(f.type.result, `(${f.symbol} ${args.map((a) => a.smt).join(" ")})`), checks: [] };
  if (f.kind === "named") {
    const symbol = namedSymbol(f.callee, cx);
    const pre = callbackRequires(f.callee, args, cx);
    return { value: data.bool(`(${symbol} ${args[0].smt})`), checks: [pre.defined, pre.value] };
  }
  // Closure: inline the unchanged body in its defining scope and blame owner.
  return blame(f.scope.file, f.owner, () => {
    const inner = new Map(f.env);
    f.node.params.forEach((p, i) => bind(inner, p, args[i], "parameter"));
    const checks = [];
    const value = expression(f.node.body, inner, { ...cx, scope: f.scope, guard: "true", checks, contract: false, pure: true, phase: "body", loop: undefined });
    const want = f.type.result;
    if (value.sort === "undefined") fail("This callback can return undefined; callbacks must return a present value.", f.node.body);
    if (value.sort !== want) fail(`This callback returns ${value.sort}, not ${want}.`, f.node.body);
    if (value.present !== "true") fail("This predicate may return undefined; a present boolean is required.", f.node.body);
    return { value: view(want, value.smt), checks: [...checks, value.present] };
  });
}

// Application f(args) at a call expression whose callee is a function value.
function apply(f, node, env, cx) {
  if (!f.type) fail("Annotate this callback's parameter and result types before calling it directly.", node);
  if (node.arguments.some((a) => a.type === "SpreadElement") || node.arguments.length !== f.type.params.length) fail("Callbacks take exactly their declared arguments; spread, missing and extra arguments are unsupported.", node);
  const args = node.arguments.map((a) => expression(a, env, cx));
  if (args.some((a) => a.sort === "real")) fail("Callbacks do not accept mathematical values.", node);
  const bound = f.type.params.map((p, i) => data.argument(p, args[i], node.arguments[i], cx.unit.fresh));
  if (f.kind === "closure" && !cx.contract && !cx.pure && bound.some((b) => b.safe !== "true")) fail("A direct local predicate call may receive undefined; this slice requires a present number.", node);
  const { value, checks } = applyValue(f, bound.map((b) => b.value), node, cx);
  const safe = and(...bound.map((b) => b.safe), ...checks);
  if (cx.contract || cx.pure) oblige(cx, safe);
  else { cx.unit.events.push({ guard: cx.guard, safe, assume: "true", ...(f.kind === "named" ? { callee: f.callee.id } : {}),
    label: { kind: "callback", span: { start: node.start, end: node.end }, abstract: cx.unit.cutpoints > 0 } }); flushAxioms(cx.unit); }
  return value;
}

// Passing-site totality: the concrete callback must return a present result
// for EVERY argument of its parameter types. The fresh probe is universal by
// negation; its model is replayed directly against the native callback.
function totality(f, type, callee, index, argNode, callNode, cx) {
  if (f.kind === "symbol") return "true";
  const unit = cx.unit;
  const probes = type.params.map((t) => data.input(t, unit.fresh("probe")));
  probes.forEach((p) => unit.declarations.push(...p.declarations));
  unit.probes.push({ callee: callee.id, param: index, site: { start: callNode.start, end: callNode.end }, span: { start: argNode.start, end: argNode.end }, models: probes.map((p) => p.model), types: type.params });
  const { checks } = applyValue(f, probes.map((p) => p.value), argNode, { ...cx, guard: "true", callbackGuard: cx.guard });
  return and(...checks);
}

function refArgument(type, v, node, env, cx) {
  if (!heap.isRef(v) || v.sort !== type.kind) fail("Collection parameters need a reference of the same collection kind.", node);
  if (v.spec) {
    const { ref, type: _type, spec, ...view } = v;
    const checked = data.argument(type, view, node, cx.unit.fresh);
    return { value: { ...checked.value, ref, type, spec }, safe: checked.safe };
  }
  if (heap.sameType(v.type, type)) return { value: { ...v, type }, safe: "true" };
  return { value: { ...v, type }, safe: heap.typing(cx.unit, type, v.ref, undefined, getHeap(env, node)) };
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
  if (env.has(name)) {
    const local = binding(env, node.callee).value;
    if (local.sort === "function" && local !== SELF) return apply(local, node, env, cx);
    fail(local === SELF ? "Recursive calls are unsupported." : `${name} is a local data value, not a top-level function.`, node.callee);
  }
  const callee = cx.scope.names.get(name);
  if (!callee) fail(`Unknown function ${name}. Only top-level functions and named imports can be called.`, node.callee);
  if (cx.contract && !callee.spec) fail("Contracts can call only marked @spec functions.", node);
  if (!cx.contract && callee.spec) fail("@spec functions cannot be called by runtime bodies.", node);
  if (node.arguments.some((a) => a.type === "SpreadElement") || node.arguments.length !== callee.params.length) {
    fail(`${name} takes exactly ${callee.params.length} argument(s); spread, missing and extra arguments are unsupported.`, node);
  }
  if (cx.pure && !callee.spec) {
    // Helper call inside a callback body: closed axiom route, no event.
    if (callee.params.some((p) => isFunctionType(p.type))) fail("Higher-order calls inside callbacks are unsupported in this slice.", node);
    return apply(namedValue(callee, node.callee, cx), node, env, cx);
  }
  const args = node.arguments.map((a) => expression(a, env, cx));
  const target = cx.scope.program.build(callee, node);
  if (cx.loop && (target.effects?.kind === "writes" || heap.isReferenceType(target.resultType))) fail("Loops cannot call heap-writing or reference-returning helpers in this slice.", node);
  const bound = callee.params.map((p, i) => heap.isReferenceType(p.type) ? refArgument(p.type, args[i], node.arguments[i], env, cx) : data.argument(p.type, args[i], node.arguments[i], unit.fresh));
  if (callee.spec && bound.some((b) => b.value.sort === "function")) fail("Function values cannot be passed to @spec functions in this slice.", node);
  if (callee.spec) {
    unit.dependencies.add(callee.id);
    return blame(callee.file, callee.name, () => {
      const penv = new Map();
      callee.params.forEach((p, i) => bind(penv, p.node, bound[i].value));
      if (env.has(HEAP)) penv.set(HEAP, { ...env.get(HEAP), value: { ...getHeap(env, node), role: "current" } });
      const spec = { ...cx, scope: cx.scope.program.scopes.get(callee.file), entry: new Map(penv), phase: "body" };
      const pre = preconditions(callee.requires, penv, spec);
      oblige(cx, and(...bound.map((b) => b.safe), pre.defined, pre.value));
      // Definitions are transparent. No ensures clause becomes an assumed fact.
      return expression(callee.fn.body, penv, spec);
    });
  }
  // Admission precedes the callback's own facts, including when its contract is inconsistent.
  const total = callee.params.map((p, i) => isFunctionType(p.type) ? totality(bound[i].value, p.type, callee, i, node.arguments[i], node, cx) : "true");
  if (total.some((t) => t !== "true")) unit.events.push({ guard: cx.guard, safe: and(...bound.map((b) => b.safe), ...total), assume: "true", callee: callee.id,
    label: { kind: "call", span: { start: node.start, end: node.end }, abstract: unit.cutpoints > 0 } });
  // Callee clauses: caller's SMT unit, callee's lexical scope and blame.
  const { requires, inclusion, ensures, value, state } = blame(callee.file, callee.name, () => {
    const spec = { guard: "true", contract: true, checks: [], unit, scope: cx.scope.program.scopes.get(callee.file), phase: "requires", callbackGuard: cx.guard };
    const penv = new Map();
    callee.params.forEach((p, i) => bind(penv, p.node, bound[i].value));
    const pre0 = env.has(HEAP) ? getHeap(env, node) : undefined;
    if (pre0) penv.set(HEAP, { declaration: HEAP_DECL, kind: "heap", value: pre0 });
    spec.entry = new Map(penv);
    const clauses = (list) => and(...list.map((c) => need(expression(c.ast, penv, spec), "boolean", c.span)));
    const pre = preconditions(callee.requires, penv, spec);
    // Call-time frame inclusion: callee footprint within caller footprint or
    // caller-fresh refs. It is a safe part, so no callee ensures can prove it.
    const locs = pre0 ? footprint(callee.modifies, penv, spec) : [];
    const inclusion = and(...locs.map((l) => or(l.key === "@elements" ? heap.elementsEmpty(l.ref) : "false", heap.permission(unit.frame ?? [], l.ref, l.key))));
    let state, facts = "true", fresh;
    if (pre0) {
      const refResult = heap.isReferenceType(target.resultType);
      ({ state, facts } = heap.havoc(unit, pre0, locs, refResult));
      penv.set(HEAP, { declaration: HEAP_DECL, kind: "heap", value: state });
      if (refResult) {
        const symbol = `${unit.fresh("call")}_ref`;
        unit.declarations.push(`(declare-const ${symbol} Int)`);
        // Not fresh: any typed ref below the post-call allocator.
        facts = and(facts, heap.typing(unit, target.resultType, symbol, state.next, state), heap.resultDomain({ sort: target.resultType.kind, ref: symbol, type: target.resultType }, args, pre0.next));
        fresh = { value: { sort: target.resultType.kind, ref: symbol, type: target.resultType } };
      }
      if (target.effects?.kind === "writes") heap.registry(unit).writes = true;
      else if (target.effects?.kind === "heap") heap.registry(unit).reads = true;
    }
    if (!fresh) { fresh = data.input(target.resultType, unit.fresh("call")); unit.declarations.push(...fresh.declarations); }
    penv.set("result", { kind: "contract", value: fresh.value });
    spec.phase = "ensures";
    const ensures = clauses(callee.ensures);
    return { requires: and(pre.value, pre.defined), inclusion, ensures: and(facts, ensures, ...spec.checks), value: fresh.value, state };
  });
  flushAxioms(unit);
  const label = { kind: "call", span: { start: node.start, end: node.end }, abstract: unit.cutpoints > 0 };
  unit.events.push({ guard: cx.guard, safe: and(...bound.map((b) => b.safe), requires), assume: inclusion === "true" ? ensures : "true", callee: callee.id, label });
  if (inclusion !== "true") unit.events.push({ guard: cx.guard, safe: inclusion, assume: ensures, callee: callee.id,
    label: { ...label, kind: "frame-inclusion", callee: callee.name } });
  if (state) setHeap(env, { ...state, role: "current" });
  return value;
}

// One primitive heap store. JS order: owner reference, then (compound) the
// current value, then the right side, then the store at the post-RHS state.
function store(node, left, operator, rhs, env, cx, prefix) {
  if (cx.contract) fail("Assignments and updates are unsupported in contracts.", node);
  if (cx.pure) fail("Pure callbacks cannot write the heap.", node);
  if (cx.loop) fail("Loops that write the heap are outside the first heap slice.", node);
  if (left.optional) fail("Optional heap writes are unsupported.", left);
  const owner = expression(left.object, env, cx);
  if (!heap.isRef(owner)) fail("Heap writes need a collection reference.", left);
  let key, index, valid = "true", current;
  if (owner.sort === "array") {
    if (!left.computed) fail("Array writes must use an in-bounds numeric index; length changes are unsupported.", left);
    const at = expression(left.property, env, cx), view = focused(owner, env, cx, left);
    if (at.sort !== "number") fail("Array writes require a numeric index.", left);
    if (at.literal !== undefined && (!Number.isInteger(at.literal) || at.literal < 0 || at.literal >= 4294967295)) fail("Named/out-of-range array properties are unsupported.", left);
    valid = and(at.present, data.builtin("Number.isInteger", [at], left).smt, data.binary(">=", at, data.literal(0), left).smt, data.binary("<", at, view.length, left).smt);
    index = at.u32 ?? `((_ fp.to_ubv 32) RTZ ${at.smt})`; key = "@elements";
    current = operator === "=" ? undefined : data.index(view, at, left);
  } else {
    if (left.computed && left.property.type !== "Literal") fail("Record writes need a fixed field name.", left);
    key = left.computed ? String(left.property.value) : left.property.name;
    heap.writableField(owner.type, key, left);
    current = operator === "=" ? undefined : data.member(focused(owner, env, cx, left), key, left);
  }
  let value, out;
  if (rhs) {
    const right = expression(rhs, env, cx);
    value = operator === "=" ? right : data.binary(operator.slice(0, -1), current, right, node); out = value;
  } else {
    if (current.sort !== "number") fail("Increment and decrement require numeric cells.", node);
    const before = data.unary("+", current, node);
    value = data.binary(operator === "++" ? "+" : "-", before, data.literal(1), node); out = prefix ? value : before;
  }
  if (owner.sort === "array") {
    if (value.sort !== owner.type.element) fail("Array stores must preserve the primitive element type.", node);
  } else heap.checkStore(owner.type, key, value, node);
  const label = { span: { start: node.start, end: node.end }, abstract: cx.unit.cutpoints > 0 };
  cx.unit.events.push({ guard: cx.guard, safe: and(valid, value.present), assume: "true", label: { ...label, kind: "store-domain" } });
  cx.unit.events.push({ guard: cx.guard, safe: heap.permission(cx.unit.frame ?? [], owner.ref, key), assume: "true", label: { ...label, kind: "frame-write", key } });
  setHeap(env, owner.sort === "array" ? heap.writeIndex(cx.unit, getHeap(env, node), owner.ref, index, value) : heap.write(cx.unit, getHeap(env, node), owner.ref, key, value));
  heap.registry(cx.unit).writes = true;
  return out;
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
      if (value === SELF) fail("A named function expression cannot reference itself (recursion is unsupported).", node);
      return value;
    }
    if (cx.scope.names.has(node.name)) {
      if (cx.contract) fail("Named function values are unsupported inside contracts.", node);
      return namedValue(cx.scope.names.get(node.name), node, cx);
    }
    if (node.name === "undefined") return data.undef();
    if (CONSTANTS.has(node.name)) return data.literal(CONSTANTS.get(node.name));
    return fail(`Unknown value ${node.name}. Calls and ambient values need explicit support.`, node);
  }
  if (node.type === "MemberExpression" && !node.optional) {
    if (!node.computed && node.object.type === "Identifier") {
      const name = `${node.object.name}.${node.property.name}`;
      if (CONSTANTS.has(name)) return data.literal(CONSTANTS.get(name));
    }
    const reference = read(node.object);
    const literalKey = reference.sort === "object" && node.property.type === "Literal";
    const index = node.computed && !literalKey ? read(node.property) : undefined;
    const owner = focused(reference, env, cx, node);
    if (!node.computed) return data.member(owner, node.property.name, node);
    if (owner.sort === "object" && node.property.type === "Literal") return data.member(owner, String(node.property.value), node);
    return data.index(owner, index, node);
  }
  if (node.type === "ArrayExpression") {
    if (node.elements.some((e) => !e)) fail("Sparse array literals are unsupported.", node);
    if (node.elements.length === 1 && node.elements[0].type === "SpreadElement") {
      const value = focused(read(node.elements[0].argument), env, cx, node);
      if (value.sort !== "array") fail("Array spread requires an ordinary array.", node);
      return allocateView(value, node, env, cx);
    }
    if (node.elements.some((e) => e.type === "SpreadElement")) fail("Array spread currently supports copying one array, not concatenation.", node);
    const elements = node.elements.map(read);
    if (elements.some(heap.isRef)) fail("Arrays of heap records are outside the first heap slice.", node);
    return allocateView(data.array(elements, node), node, env, cx);
  }
  if (node.type === "ObjectExpression") {
    let value = data.record();
    for (const p of node.properties) {
      if (p.type === "SpreadElement") {
        value = data.spread(value, focused(read(p.argument), env, cx, p), p);
      } else {
        if (p.kind !== "init" || p.method || p.computed || !["Identifier", "Literal"].includes(p.key.type)) fail("Use ordinary data properties, without methods, accessors, or computed keys.", p);
        const key = p.key.type === "Identifier" ? p.key.name : String(p.key.value);
        if (key === "__proto__") fail("__proto__ is not an ordinary object-literal data field.", p);
        const field = read(p.value);
        if (field.sort === "real") fail("Mathematical values cannot be stored in JavaScript records.", p.value);
        value = data.property(value, key, field);
      }
    }
    return allocateView(value, node, env, cx);
  }
  if (node.type === "UnaryExpression") {
    const value = read(node.argument);
    return value.sort === "real" ? specifications.unary(node.operator, value, node) : data.unary(node.operator, value, node);
  }
  if (node.type === "LogicalExpression") return data.logical(node.operator, read(node.left), (runs) => {
    const skipped = new Map(env), taken = new Map(env);
    const value = under(node.right, runs, taken);
    joinEnvironment(env, runs, taken, skipped, node, cx.unit);
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
    joinEnvironment(env, c, yes, no, node, cx.unit);
    return data.merge(c, a, b, node);
  }
  if (node.type === "AssignmentExpression" && strip(node.left).type === "MemberExpression") {
    if (!["=", "+=", "-=", "*=", "/="].includes(node.operator)) fail(`Unsupported compound assignment ${node.operator}.`, node);
    return store(node, strip(node.left), node.operator, node.right, env, cx);
  }
  if (node.type === "UpdateExpression" && strip(node.argument).type === "MemberExpression") {
    return store(node, strip(node.argument), node.operator, null, env, cx, node.prefix);
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
  if (node.type === "ArrowFunctionExpression") return closure(node, env, cx);
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
      const args = node.arguments.map(read);
      return allocateView(data.slice(focused(owner, env, cx, node), args, node), node, env, cx);
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
      const match = /^\s*\*?\s*@?(requires|ensures|modifies)\b(.*)$/.exec(line);
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
      for (const s of states) {
        const value = expression(node.argument, s.env, at(s));
        if (value.sort === "function") fail("Function-valued returns are unsupported.", node.argument);
        returns.push({ path: s.path, value, heap: s.env.get(HEAP)?.value });
      }
      states = [];
    } else if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) {
        if (!d.init) fail("Uninitialized local declarations are unsupported; provide an initializer.", d);
        const assignment = cx.scope.tokens.find((t) => t.start >= d.id.end && t.start < d.init.start && t.value === "=");
        const annotation = readAnnotation(cx.scope.source.slice(d.id.end, assignment.start), d.id);
        if (annotation !== undefined) cx.scope.validateType(annotation, d.id);
        for (const s of states) {
          const value = expression(d.init, s.env, at(s));
          if (value.sort === "function" && node.kind !== "const") fail("Function values can be bound only with const.", d);
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
      for (const s of states) if (expression(node.expression, s.env, at(s)).sort === "function") fail("Unused function values are unsupported.", node);
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
function mergeStates(states, node, unit) {
  const last = states.at(-1);
  const env = new Map(last.env);
  for (const s of states.slice(0, -1).reverse()) {
    for (const [name, b] of env) {
      const a = s.env.get(name);
      if (a === b || a.value === b.value) continue;
      if (name === HEAP) { env.set(HEAP, { ...b, value: heap.join(unit, s.path, a.value, b.value) }); continue; }
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

function strip(n) { while (n.type === "ParenthesizedExpression") n = n.expression; return n; }
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
// Safe mode instead covers the complete nonnegative safe-integer domain with
// 53 bits. Its upper bound is supplied by Number.isSafeInteger itself.
function naturalNames(invariants, { candidates, written }, env, cx, mode = "u32") {
  const predecessor = mode === "predecessor";
  const cs = invariants.flatMap((c) => conjuncts(c.ast)).map(strip);
  const integer = (name) => cs.some((c) => c.type === "CallExpression" && c.callee.type === "MemberExpression" && !c.callee.computed && !c.optional && builtinOwner(c.callee.object, env, cx) === "Number"
    && (mode === "safe" ? c.callee.property.name === "isSafeInteger" : ["isInteger", "isSafeInteger"].includes(c.callee.property.name)) && c.arguments.length === 1 && named(c.arguments[0], name));
  const lowerBound = predecessor ? minusOne : zero;
  const lower = (name) => cs.some((c) => c.type === "BinaryExpression" && (c.operator === "<=" && lowerBound(c.left) && named(c.right, name) || c.operator === ">=" && named(c.left, name) && lowerBound(c.right) || !predecessor && (c.operator === "<" && zero(c.left) && named(c.right, name) || c.operator === ">" && named(c.left, name) && zero(c.right))));
  const bound = (r, ok) => {
    r = strip(r);
    if (r.type === "Literal" && Number.isInteger(r.value) && r.value >= 0 && r.value <= 0xffffffff) return true;
    if (r.type === "Identifier") return !predecessor && ok.has(r.name) || !written.includes(r.name) && env.get(r.name)?.value.present === "true" && !!env.get(r.name).value.u32;
    if (r.type !== "MemberExpression" || r.computed || r.property.name !== "length" || strip(r.object).type !== "Identifier") return false;
    const owner = env.get(strip(r.object).name)?.value;
    return owner?.sort === "array" && !!focused(owner, env, cx, r).length.u32 && !written.includes(strip(r.object).name);
  };
  const upper = (name, ok) => mode === "safe" || cs.some((c) => c.type === "BinaryExpression" && ((predecessor ? c.operator === "<" : ["<", "<="].includes(c.operator)) && named(c.left, name) && bound(c.right, ok)
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
  const before = mergeStates(states, node, cx.unit);
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
    const unit = { ...cx.unit, events: [], declarations: [], dependencies: new Set(), replayGuards: [], probes: [],
      functions: new Map(cx.unit.functions), emittedFunctions: new Set(cx.unit.emittedFunctions), pendingAxioms: [] };
    const own = [];
    const checks = [];
    const reg = cx.unit.heap, marks = reg && [reg.exact.length, reg.asserts.length];
    const r = iterate(node, spec, entry, written, optional, { ...cx, unit, checks }, own);
    const widen = written.filter((n) => !optional.has(n) && r.backs.some((b) => b.env.get(n).value.present !== "true"));
    if (widen.length) {
      if (reg) { reg.exact.length = marks[0]; reg.asserts.length = marks[1]; }
      widen.forEach((n) => optional.add(n)); continue;
    }
    // G first slice: loops may read the heap and call footprint-free helpers,
    // but a back edge or exit with a different heap state is rejected.
    if (entry.env.has(HEAP) && [...r.backs, ...r.exits].some((b) => !heap.sameState(b.env.get(HEAP).value, entry.env.get(HEAP).value))) {
      fail("Loops that write, allocate or call heap-modifying helpers are outside the first heap slice.", node);
    }
    cx.unit.events.push(...unit.events);
    cx.unit.declarations.push(...unit.declarations);
    unit.dependencies.forEach((d) => cx.unit.dependencies.add(d));
    cx.checks.push(...checks);
    cx.unit.replayGuards.push(...unit.replayGuards);
    cx.unit.probes.push(...unit.probes);
    unit.functions.forEach((value, id) => cx.unit.functions.set(id, value));
    unit.emittedFunctions.forEach((id) => cx.unit.emittedFunctions.add(id));
    cx.unit.pendingAxioms.push(...unit.pendingAxioms);
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
  const narrow = naturalNames(spec.invariants, ranges, entry.env, cx);
  const predecessor = naturalNames(spec.invariants, ranges, entry.env, cx, "predecessor");
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

const CONTRACT_LINE = /^\s*\*?\s*@?(requires|ensures|modifies|invariant|decreases)\b(.*)$/;

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
      if (n.type === "ArrowFunctionExpression") {
        for (const p of n.params) ranges.push({ start: p.end, end: tokens.find((t) => t.start >= p.end).start });
        const arrow = tokens.find((t) => t.start >= (n.params.at(-1)?.end ?? n.start) && t.type.label === "=>");
        const close = [...tokens].reverse().find((t) => t.end <= arrow.start && t.start >= n.start && t.type.label === ")");
        if (close) ranges.push({ start: close.end, end: arrow.start });
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
    const modifies = own("modifies");
    if (modifies.length && info.spec) fail("@spec functions are pure; they cannot declare modifies.", modifies[0].span);
    return { id: `${file}#${name}`, file, name, top, fn, params, annotations, spec: info.spec, requires: own("requires"), ensures: own("ensures"), modifies, loops };
  });
}

// A footprint owner path as [parameter, field...] for native frame replay.
function pathOf(n) {
  n = strip(n);
  if (n.type === "Identifier") return [n.name];
  if (n.type === "MemberExpression" && !n.computed) return [...pathOf(n.object), n.property.name];
  return fail("modifies paths must start at a parameter.", n);
}

function body(h, scope) {
  const { fn, name, top } = h;
  return blame(h.file, name, () => {
    let next = 0;
    const unit = { declarations: [], events: [], dependencies: new Set(), fresh: (tag) => `${tag}${next++}`, cutpoints: 0, loops: [], replayGuards: [],
      probes: [], functions: new Map(), emittedFunctions: new Set(), pendingAxioms: [], owner: name };
    const env = new Map();
    if (fn.type === "FunctionExpression" && fn.id) bind(env, fn.id, SELF, "self");
    const declarations = [], lengths = [];
    heap.registry(unit);
    const params = h.params.map((p, index) => {
      const value = heap.isReferenceType(p.type) ? { ...heap.refInput(unit, p.type, `input_${index}`, p.node), lengths: heap.inputLengths(p.type, `input_${index}_ref`) } : data.input(p.type, `input_${index}`);
      bind(env, p.node, value.value, "parameter");
      declarations.push(...value.declarations);
      lengths.push(...value.lengths);
      return { name: p.name, type: p.type, typeAliases: p.typeAliases, model: value.model };
    });
    const entryHeap = heap.entryState(unit);
    env.set(HEAP, { declaration: HEAP_DECL, kind: "heap", value: entryHeap });
    const spec = { guard: "true", contract: true, unit, scope, checks: [], entry: new Map(env), phase: "requires" };
    unit.frame = footprint(h.modifies, env, spec);
    if (unit.frame.length) heap.registry(unit).writes = true;
    const pre = preconditions(h.requires, env, spec);
    {
      // Reparameterize only domains explicitly established by requires. Links
      // are guarded by definedness as well, so malformed preconditions keep
      // all their original counterexamples in the first solver phase.
      const bounded = naturalNames(h.requires, { candidates: h.params.filter((p) => p.type === "number").map((p) => p.name), written: [] }, env, spec);
      const legal = and(pre.defined, pre.value);
      const safe = naturalNames(h.requires, { candidates: h.params.filter((p) => p.type === "number").map((p) => p.name), written: [] }, env, spec, "safe");
      const widths = new Map([...bounded].map((name) => [name, 32]));
      for (const name of safe) if (!widths.has(name)) widths.set(name, 53);
      for (const [name, width] of widths) {
        const old = env.get(name), fresh = data.natural(unit.fresh("parameter"), false, width);
        unit.declarations.push(...fresh.declarations, `(assert ${implies(legal, `(= ${old.value.smt} ${fresh.value.smt})`)})`);
        env.set(name, { ...old, value: fresh.value });
      }
      if (widths.size) {
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
    } else {
      const bodyEnv = new Map(env);
      const value = expression(fn.body, bodyEnv, cx);
      returns.push({ path: "true", value, heap: bodyEnv.get(HEAP)?.value });
    }
    if (returns.some((r) => r.value.sort === "function")) fail("Function-valued returns are unsupported.", fn.body);
    if (returns.some((r) => r.value.sort === "object" && !heap.isRef(r.value))) fail("Runtime records are returned by reference.", fn.body);
    let result = returns.at(-1).value;
    for (const r of returns.slice(0, -1).reverse()) result = data.merge(r.path, r.value, result, fn.body);
    const callerEvents = unit.events;
    env.set("result", { kind: "contract", value: result });
    {
      let final = returns.at(-1).heap;
      for (const r of returns.slice(0, -1).reverse()) final = heap.join(unit, r.path, r.heap, final);
      env.set(HEAP, { declaration: HEAP_DECL, kind: "heap", value: final });
    }
    spec.phase = "ensures";
    const abstract = unit.cutpoints > 0;
    // With cutpoints, each return proves ensures with its own exact value view
    // under its own path; a merged result would lose the per-path shadows.
    const conclude = (value, guard, state) => {
      const checks = [], at = new Map(env).set("result", { kind: "contract", value }), scx = { ...spec, checks };
      at.set(HEAP, { declaration: HEAP_DECL, kind: "heap", value: state });
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
      ? [...defined(cx.checks, allFacts), ...returns.flatMap((r) => conclude(r.value, and(r.path, allFacts), r.heap))]
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
    const finished = heap.finish(unit);
    return {
      id: h.id, file: h.file, name, span: { start: top.start, end: top.end }, params, resultType: data.valueType(result),
      // Derived, not certified: any direct store, nonempty modifies, or call to
      // a non-pure callee makes this function "writes". Built callee-first.
      effects: { kind: unit.heap?.writes ? "writes" : unit.heap?.reads || unit.heap?.allocated ? "heap" : "pure" }, executableStart: fn.start,
      modifies: h.modifies.map(({ ast, ...c }) => c),
      footprint: unit.frame.map(({ path, key }) => ({ path, key })),
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
      declarations: [...[...unit.functions.values()].map((f) => f.declaration), ...finished.head, ...declarations, ...unit.declarations, ...finished.tail, ...defs].join("\n"),
      heapModel: finished.model,
      probes: unit.probes,
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
