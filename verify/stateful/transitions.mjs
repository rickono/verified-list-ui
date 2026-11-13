import { compileAstUnit } from "../source.mjs";
import { fail } from "../error.mjs";
import { id, member, reference, transform, span, walk, sha256 } from "./ast.mjs";

const clause = (c, ast) => ({ ...c, ast });
const undef = (at) => id("undefined", at);
const returning = (argument, at) => ({ type: "ReturnStatement", argument, ...span(at) });
const record = (fields, at) => ({ type: "ObjectExpression", properties: fields.map(([name, value]) => ({ type: "Property", key: id(name, at), value,
  kind: "init", method: false, shorthand: false, computed: false, ...span(at) })), ...span(at) });
const onCells = (machine, owner) => (n, p, k) => reference(n, p, k) && machine.cells.has(n.name) ? member(owner, n.name, n) : undefined;
const rename = (names) => (n, p, k) => reference(n, p, k) && names.has(n.name) ? id(names.get(n.name), n) : undefined;
const captures = (entry, k) => entry.awaits[k].captures;

/** Construct init / arbitrary step / arbitrary other-representative keeps.
 * There are no concrete activation slots or trace bounds in these units.
 */
export function transitionsOf(machine) {
  const units = [], cells = [...machine.cells.values()], at = machine.state[0]?.span ?? machine.always[0].span;
  const stateType = { kind: "object", fields: cells.map((c) => ({ name: c.name, type: c.type, optional: false })) };
  const stateParam = { name: "$s", type: stateType, node: id("$s", at) };
  const state = (owner) => machine.state.map((c) => clause(c, transform(c.ast, onCells(machine, owner))));
  const always = () => machine.always.map((c) => clause(c, transform(c.ast, onCells(machine, "$s"))));
  const emit = (u) => {
    const body = { type: "BlockStatement", body: u.body, ...u.span };
    const fn = { type: "FunctionDeclaration", id: id(u.name, u.span), params: u.params.map((p) => p.node), body, async: false, generator: false, ...u.span };
    const header = { name: u.name, top: fn, fn, params: u.params, requires: u.requires, ensures: u.ensures, modifies: u.modifies };
    const target = compileAstUnit(machine, header);
    for (const binding of u.outputCaptures ?? []) {
      const field = target.resultType.fields?.find((f) => f.name === binding.name);
      if (field?.type !== binding.type || field.optional) fail(`Captured ${binding.name} does not have its declared scalar type.`, binding.node);
    }
    units.push({ ...u, target });
  };
  const initial = state("result");
  if (!initial.length) initial.push({ kind: "ensures", text: "true", span: at, ast: { type: "Literal", value: true, raw: "true", ...at } });
  emit({ name: "$init", kind: "init", span: at, params: [], requires: [], modifies: [], ensures: initial,
    body: [returning(record(cells.map((c) => [c.name, c.init]), at), at)] });
  const steps = [];
  for (const entry of machine.entries) entry.segments.forEach((segment, k) => {
    const before = entry.awaits[k - 1], after = entry.awaits[k];
    const self = before ? [...captures(entry, k - 1), { name: before.binding ?? "$resolved", type: before.op.result, node: before.bindingNode ?? before.statement }] : entry.params;
    const params = [stateParam, ...self.map((p) => ({ ...p, node: id(p.name, p.node) }))];
    const requires = state("$s");
    if (before) {
      requires.push(...before.pending.map((c) => clause(c, transform(c.ast, onCells(machine, "$s")))));
      const names = new Map([["result", before.binding ?? "$resolved"], ...before.op.params.map((p, i) => [p.name, `$request_${i}`])]);
      requires.push(...before.op.resolves.map((c) => clause(c, transform(c.ast, rename(names)))));
    }
    const ensures = [...state("$s"), ...always()];
    const body = segment.map((s) => transform(s, (n, p, key) => {
      if (n.type === "ReturnStatement") {
        // Keep evaluation of explicit return expressions; entry return values
        // are not properties of this stateful slice.
        if (!n.argument) return returning(undef(n), n);
        return { type: "BlockStatement", body: [{ type: "ExpressionStatement", expression: transform(n.argument, onCells(machine, "$s")), ...span(n.argument) }, returning(undef(n), n)], ...span(n) };
      }
      return onCells(machine, "$s")(n, p, key);
    }));
    const at = segment.length ? { start: segment[0].start, end: segment.at(-1).end } : span(after ?? before ?? entry);
    if (after) {
      const live = captures(entry, k);
      const names = new Map(entry.live[k].map((p) => [p.name, member("result", p.name, p.node)]));
      ensures.push(...after.pending.map((c) => clause(c, transform(c.ast, (n, p, key) =>
        onCells(machine, "$s")(n, p, key) ?? (reference(n, p, key) ? names.get(n.name) : undefined)))));
      body.push(returning(record(live.map((p) => [p.name, p.argument ? transform(p.node, onCells(machine, "$s")) : id(p.name, p.node)]), after), after));
    } else if (segment.at(-1)?.type !== "ReturnStatement") body.push(returning(undef(at), at));
    const writes = new Map();
    for (const s of segment) walk(s, (n) => {
      const target = n.type === "AssignmentExpression" ? n.left : n.type === "UpdateExpression" ? n.argument : undefined;
      if (target?.type === "Identifier" && machine.cells.has(target.name)) writes.set(target.name, target);
    });
    const modifies = [...writes].map(([name, node]) => ({ kind: "modifies", text: name, span: span(node), ast: member("$s", name, node) }));
    steps.push({ name: `${entry.name}$${k}`, kind: k === 0 ? "entry" : "resume", entry: entry.name, segment: k, span: at,
      params, requires, ensures, modifies, body, outputCaptures: after ? captures(entry, k) : [] });
  });
  // An unhandled rejection discards the resumed activation and changes no
  // cells. It must still establish always and keep every other representative.
  if ([...machine.environment.values()].some((op) => op.rejects)) steps.push({ name: "$reject", kind: "stutter", span: at,
    params: [stateParam], requires: state("$s"), ensures: [...state("$s"), ...always()], modifies: [], body: [returning(undef(at), at)] });
  for (const step of steps) emit(step);
  for (const step of steps) for (const entry of machine.entries) entry.awaits.forEach((w, j) => {
    if (!w.pending.length) return;
    const other = captures(entry, j).map((p) => ({ ...p, name: `$o_${p.name}`, node: id(`$o_${p.name}`, p.node) }));
    const names = new Map(captures(entry, j).map((p, i) => [p.name, other[i].name]));
    const pending = w.pending.map((c) => clause(c, transform(c.ast, (n, p, key) =>
      onCells(machine, "$s")(n, p, key) ?? rename(names)(n, p, key))));
    emit({ ...step, name: `${step.name}$keeps$${entry.name}$${j + 1}`, kind: "interference", keeps: { entry: entry.name, span: span(w) },
      params: [...step.params, ...other], requires: [...step.requires, ...pending], ensures: pending });
  });
  return { units, sha256: sha256(JSON.stringify(units.map(({ target }) => ({ id: target.id, declarations: target.declarations,
    pre: target.pre, preDefined: target.preDefined, postconditions: target.postconditions })))) };
}
