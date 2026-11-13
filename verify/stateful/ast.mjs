import { createHash } from "node:crypto";

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
export const options = { ecmaVersion: 2022, sourceType: "module", preserveParens: true };
export const span = (node) => ({ start: node.start, end: node.end });
export function walk(node, visit, parent, key) {
  if (!node || typeof node.type !== "string" || visit(node, parent, key) === false) return;
  for (const [k, value] of Object.entries(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node, k));
    else if (value && typeof value === "object") walk(value, visit, node, k);
  }
}
export const reference = (n, p, k) => n.type === "Identifier"
  && !(p?.type === "MemberExpression" && k === "property" && !p.computed)
  && !(p?.type === "Property" && k === "key" && !p.computed)
  && !(p?.type === "VariableDeclarator" && k === "id")
  && !(p?.type === "FunctionDeclaration" && (k === "id" || k === "params"));
export function references(node) {
  const names = new Set();
  walk(node, (n, p, k) => { if (reference(n, p, k)) names.add(n.name); });
  return names;
}
export function transform(node, replace, parent, key) {
  if (!node || typeof node.type !== "string") return node;
  const replacement = replace(node, parent, key);
  if (replacement) return replacement;
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k,
    Array.isArray(v) ? v.map((c) => transform(c, replace, node, k))
      : v && typeof v === "object" ? transform(v, replace, node, k) : v]));
}
export const id = (name, at) => ({ type: "Identifier", name, ...span(at) });
export const member = (owner, name, at) => ({ type: "MemberExpression", object: id(owner, at), property: id(name, at), computed: false, optional: false, ...span(at) });
