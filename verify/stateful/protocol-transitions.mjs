import { compileAstUnit } from "../source.mjs";
import { fail } from "../error.mjs";
import { id, member, reference, references, transform, span, walk, sha256 } from "./ast.mjs";
import { handles, primitives } from "./environment.mjs";
import { protocolRules, validateProtocolUnits } from "./protocol-rules.mjs";
import { advisoryAbort, abortClauses } from "./protocol-abort.mjs";
import { variable, map, read, update, constant, equal, neg, projection } from "./projection.mjs";

const clause = (c, ast) => ({ ...c, ast });
const ret = (argument, at) => ({ type: "ReturnStatement", argument, ...span(at) });
const record = (fields, at) => ({ type: "ObjectExpression", properties: fields.map(([name, value]) => ({ type: "Property", key: id(name, at), value, kind: "init", method: false, shorthand: false, computed: false, ...span(at) })), ...span(at) });
const eq = (left, right, at) => ({ type: "BinaryExpression", operator: "===", left, right, ...span(at) });
const factOf = (b) => b.init?.type === "Literal" && primitives.has(typeof b.init.value) ? b.init : undefined;
const sortOf = (type) => ({ EventTarget: "target", AbortController: "controller", AbortSignal: "signal", closure: "closure" })[type];

export function protocolTransitionsOf(machine) {
  const units = [], cells = [...machine.cells.values()], at = machine.state[0]?.span ?? machine.always[0].span;
  const onCells = (n, p, k) => reference(n, p, k) && machine.cells.has(n.name) ? member("$s", n.name, n) : undefined;
  const state = () => machine.state.map((c) => clause(c, transform(c.ast, onCells)));
  const always = () => machine.always.map((c) => clause(c, transform(c.ast, onCells)));
  const stateParam = { name: "$s", node: id("$s", at), type: { kind: "object", fields: cells.map((c) => ({ name: c.name, type: c.type, optional: false })) } };
  const emit = (u) => {
    const body = { type: "BlockStatement", body: u.body.at(-1)?.type === "ReturnStatement" ? u.body : [...u.body, ret(id("undefined", u.span), u.span)], ...u.span };
    const fn = { type: "FunctionDeclaration", id: id(u.name, u.span), params: u.params.map((p) => p.node), body, async: false, generator: false, ...u.span };
    const target = compileAstUnit(machine, { ...u, top: fn, fn });
    for (const b of u.outputCaptures ?? []) {
      const f = target.resultType.fields?.find((f) => f.name === b.field);
      if (f?.type !== b.type || f.optional) fail(`Captured ${b.name} does not have its declared scalar type.`, b.node);
    }
    units.push({ ...u, target });
  };
  emit({ name: "$init", kind: "init", span: at, params: [], requires: [], modifies: [], body: [ret(record(cells.map((c) => [c.name, c.init]), at), at)],
    ensures: machine.state.map((c) => clause(c, transform(c.ast, (n, p, k) => reference(n, p, k) && machine.cells.has(n.name) ? member("result", n.name, n) : undefined))) });
  protocolRules(emit, at);
  const steps = [];
  for (const entry of machine.entries) {
    const variables = [], maps = [map("$signalOf", ["controller"], "signal"), map("$aborted", ["signal"], "boolean"),
      map("$pending", ["request"], "boolean"), map("$settled", ["request"], "boolean"), map("$running", ["invocation"], "boolean")];
    const observer = variable("$abort_observer", "signal"), request = variable("$abort_request", "request"), invocation = variable("$abort_invocation", "invocation");
    variables.push(observer, request, invocation);
    const terms = new Map();
    for (const b of entry.bindings.values()) if (sortOf(b.type)) {
      const t = variable(`$binding_${b.node.start}`, sortOf(b.type)); variables.push(t); terms.set(b.name, t);
    }
    let signalOf = (...args) => read(maps[0], ...args);
    let protocolState = { aborted: (...args) => read(maps[1], ...args), pending: (...args) => read(maps[2], ...args),
      settled: (...args) => read(maps[3], ...args), running: (...args) => read(maps[4], ...args) };
    const term = (n) => {
      if (n.type === "Identifier" && terms.has(n.name)) return terms.get(n.name);
      if (n.type === "MemberExpression" && !n.computed && n.property.name === "signal") return signalOf(term(n.object));
      fail("Unresolved handle identity projection.", n);
    };
    const rewrite = (node, extra = new Map()) => transform(node, (n, p, k) => {
      if (n.type === "ReturnStatement" && !n.argument) return ret(id("undefined", n), n);
      if (n.type === "MemberExpression" && !n.computed && n.property.name === "aborted" && n.object.type === "Identifier" && entry.bindings.get(n.object.name)?.type === "AbortSignal") return projection(protocolState.aborted(term(n.object)), n);
      if (n.type === "BinaryExpression" && ["===", "!=="].includes(n.operator) && (sortOf(entry.bindings.get(n.left.name)?.type) || n.left.type === "MemberExpression" && n.left.property.name === "signal")) {
        const comparison = equal(term(n.left), term(n.right)); return projection(n.operator === "!==" ? neg(comparison) : comparison, n);
      }
      return onCells(n, p, k) ?? (reference(n, p, k) && extra.has(n.name) ? extra.get(n.name) : undefined);
    });
    entry.segments.forEach((segment, k) => {
      if (k) protocolState = { ...protocolState, aborted: (...args) => read(maps[1], ...args) }; // contents may change across suspension
      const before = entry.awaits[k - 1], after = entry.awaits[k];
      const self = before ? [...before.captures, { name: before.binding ?? "$resolved", type: before.op.result, node: before.bindingNode ?? before.statement }] : entry.params;
      const params = [stateParam, ...self.filter((p) => primitives.has(p.type)).map((p) => ({ ...p, node: id(p.name, p.node) }))];
      const requires = state(), ensures = [...state(), ...always()], body = [], outputCaptures = [], protocolAborts = [];
      if (before) {
        for (const [i, arg] of before.call.arguments.entries()) if (handles.has(before.op.params[i].type)) {
          // The request's immutable handle argument is an alias, not a fresh
          // name. Its actual identity is retained through suspension.
          const t = term(arg); terms.set(`$request_${i}`, t);
        }
        requires.push(...before.pending.map((c) => clause(c, rewrite(c.ast))));
        const names = new Map([["result", id(before.binding ?? "$resolved", before)], ...before.op.params.filter((p) => primitives.has(p.type)).map((p) => [p.name, id(`$request_${before.op.params.indexOf(p)}`, p.node)])]);
        requires.push(...before.op.resolves.map((c) => clause(c, rewrite(c.ast, names))));
      }
      for (const statement of segment) {
        const action = entry.actions.get(statement);
        if (action?.kind === "alias") terms.set(action.binding.name, term(action.value));
        else if (action?.kind === "allocate") {
          const sig = variable(`$allocated_signal_${action.node.start}`, "signal"); variables.push(sig);
          signalOf = update(signalOf, [terms.get(action.binding.name)], sig);
          protocolState = { ...protocolState, aborted: update(protocolState.aborted, [sig], constant(false)) };
        } else if (action?.kind === "abort") {
          const signal = signalOf(term(action.receiver)), beforeState = protocolState;
          protocolState = advisoryAbort(beforeState, signal);
          const proof = { id: `${entry.name}$${k}$abort$${action.node.start}`, property: "source", span: span(action.node),
            before: beforeState, after: protocolState, signal, observer, request, invocation };
          protocolAborts.push(proof); ensures.push(...abortClauses(proof).ensures);
        }
        else if (action?.kind === "closure") {
          for (const b of action.closure.captures.filter((b) => primitives.has(b.type))) {
            const field = `$capture_${action.closure.node.start}_${b.name}`;
            outputCaptures.push({ ...b, field, value: id(b.name, b.node) });
            const fact = factOf(b);
            if (fact) ensures.push({ text: "immutable capture creation", span: span(b.node), ast: eq(member("result", field, b.node), fact, b.node) });
          }
        } else if (action?.kind === "return-remover") {
          // A new callback evaluated by a remover still closes over this
          // invocation's immutable captures. Check their creation at bind.
          for (const c of entry.closures.filter((c) => c.kind === "handler" && c.start >= statement.start && c.end <= statement.end)) for (const b of c.captures.filter((b) => primitives.has(b.type))) {
            const field = `$capture_${c.node.start}_${b.name}`; outputCaptures.push({ ...b, field, value: id(b.name, b.node) });
            if (factOf(b)) ensures.push({ text: "immutable capture creation", span: span(b.node), ast: eq(member("result", field, b.node), factOf(b), b.node) });
          }
        } else if (!action) body.push(rewrite(statement));
      }
      if (after) {
        for (const b of after.captures.filter((b) => primitives.has(b.type))) outputCaptures.push({ ...b, field: b.name, value: b.argument ? rewrite(b.node) : id(b.name, b.node) });
        const names = new Map(outputCaptures.map((b) => [b.name, member("result", b.field, b.node)]));
        ensures.push(...after.pending.map((c) => clause(c, rewrite(c.ast, names))));
      }
      if (outputCaptures.length) body.push(ret(record(outputCaptures.map((b) => [b.field, b.value]), at), at));
      const writes = new Map();
      for (const s of segment) if (!entry.actions.has(s)) walk(s, (n) => {
        const target = n.type === "AssignmentExpression" ? n.left : n.type === "UpdateExpression" ? n.argument : undefined;
        if (target?.type === "Identifier" && machine.cells.has(target.name)) writes.set(target.name, target);
      });
      const modifies = [...writes].map(([name, n]) => ({ text: name, span: span(n), ast: member("$s", name, n) }));
      const protocolActions = segment.map((s) => entry.actions.get(s)).filter(Boolean).map((a) => ({ kind: a.kind, span: span(a.node ?? a.closure?.node ?? a.binding?.node ?? entry),
        rules: a.kind === "add" ? ["$registry$creation", "$registry$duplicate$occurrence-index", "$registry$duplicate$index-occurrence"]
          : a.kind === "remove" || a.kind === "return-remover" ? ["$registry$remove$occurrence-index", "$registry$remove$index-occurrence", "$registry$absent-remove$occurrence-index"]
          : a.kind === "allocate" ? ["$handles$allocation", "$handles$keeps-unary", "$handles$keeps-pair"]
          : a.kind === "abort" ? ["$abort$contents", "$request$abort-keeps", "$request$selected-keeps"]
          : a.kind === "closure" ? ["$closure$allocation"] : [] }));
      if (after) protocolActions.push({ kind: "request-creation", span: span(after), rules: ["$request$creation"] });
      if (before) protocolActions.push({ kind: "request-resume", span: span(before), rules: ["$request$settlement"] });
      const protocolEffects = { writes: protocolActions.some((a) => ["add", "remove", "abort", "return-remover", "request-creation", "request-resume"].includes(a.kind)),
        reads: protocolActions.some((a) => ["alias", "return-handle"].includes(a.kind)), allocates: protocolActions.some((a) => ["allocate", "closure", "return-remover"].includes(a.kind)) };
      steps.push({ protocolActions, protocolEffects, protocolAborts, name: `${entry.name}$${k}`, kind: k ? "resume" : "entry", span: span(entry), params, requires, ensures, modifies, body, outputCaptures,
        protocolProjection: { variables: [...variables], maps }, rewrite });
    });
  }
  steps.push({ name: "$stutter", kind: "stutter", span: at, params: [stateParam], requires: state(), ensures: [...state(), ...always()], modifies: [], body: [] });
  const handlers = [];
  for (const e of machine.entries) for (const c of e.closures.filter((c) => c.kind === "handler")) {
    const captures = c.captures.filter((b) => primitives.has(b.type));
    const facts = captures.filter(factOf).map((b) => ({ text: "created immutable capture", span: span(b.node), ast: eq(id(b.name, b.node), factOf(b), b.node) }));
    const modifies = [...new Set([...references(c.node.body)].filter((n) => machine.cells.has(n)))].map((name) => ({ text: name, span: span(c.node), ast: member("$s", name, c.node) }));
    const body = c.node.body.type === "BlockStatement" ? c.node.body.body : [{ type: "ExpressionStatement", expression: c.node.body, ...span(c.node.body) }];
    const step = { name: c.name, kind: "handler", span: span(c.node), params: [stateParam, ...captures.map((b) => ({ ...b, node: id(b.name, b.node) }))], requires: [...state(), ...facts], ensures: [...state(), ...always()], modifies,
      body: body.map((s) => transform(s, (n, p, k) => n.type === "ReturnStatement" && !n.argument ? ret(id("undefined", n), n) : onCells(n, p, k))) };
    handlers.push({ step, facts }); steps.push(step);
  }
  for (const step of steps) emit(step);
  // Immutable closure captures have one checked creation predicate, retained
  // by arbitrary entry/handler interference. Pair preservation is the product
  // of these unary facts; protocol identity pairs are checked above separately.
  for (const step of steps) for (const { step: handler, facts } of handlers) {
    const names = new Map(handler.params.slice(1).map((p) => [p.name, `$other_${handler.name}_${p.name}`]));
    const pending = facts.map((c) => clause(c, transform(c.ast, (n, p, k) => reference(n, p, k) && names.has(n.name) ? id(names.get(n.name), n) : undefined)));
    emit({ ...step, name: `${step.name}$keeps$${handler.name}`, kind: "interference", params: [...step.params, ...handler.params.slice(1).map((p) => ({ ...p, name: names.get(p.name), node: id(names.get(p.name), p.node) }))], requires: [...step.requires, ...pending], ensures: pending });
  }
  for (const step of steps) for (const e of machine.entries) for (const w of e.awaits) if (w.pending.length) {
    const captures = w.captures.filter((p) => primitives.has(p.type));
    const names = new Map(captures.map((p) => [p.name, id(`$other_${e.name}_${p.name}`, p.node)]));
    const facts = w.pending.map((c) => clause(c, transform(c.ast, (n, p, k) => onCells(n, p, k) ?? (reference(n, p, k) ? names.get(n.name) : undefined))));
    // Protocol-reading pending lemmas need versioned identity projections in
    // both observers, a later relational schema; never snapshot such a read.
    for (const c of w.pending) walk(c.ast, (n) => { if (n.type === "MemberExpression") fail("Protocol-reading pending clauses are outside C2a.", c.span); });
    emit({ ...step, name: `${step.name}$keeps$${e.name}$${w.start}`, kind: "interference", params: [...step.params, ...captures.map((p) => ({ ...p, name: names.get(p.name).name, node: names.get(p.name) }))], requires: [...step.requires, ...facts], ensures: facts });
  }
  validateProtocolUnits(units, machine);
  return { units, sha256: sha256(JSON.stringify(units.map(({ target }) => ({ id: target.id, declarations: target.declarations, pre: target.pre, preDefined: target.preDefined, postconditions: target.postconditions })))) };
}
