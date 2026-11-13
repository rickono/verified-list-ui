// Bug evidence is source-bound replay data. It never supplies a solver verdict.
import { validWitness } from "./backend.mjs";
import { witnessModels } from "./cache.mjs";

export const EVIDENCE_FORMAT = 1;
export const signature = (o) => JSON.stringify([o.status, o.reason ?? null, o.phase ?? null,
  (o.failed ?? []).map((c) => c.text ?? c.kind),
  o.call ? [o.call.callee ?? null, (o.call.violated ?? []).map((c) => c.text ?? c.kind)] : null]);
const num = (h) => Buffer.from(h, "hex").readDoubleBE();
const hex = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b.toString("hex"); };
const supports = (m) => ["number", "boolean", "undefined"].includes(m.kind) ||
  m.kind === "optional" && supports(m.value) || m.kind === "array" && supports({ kind: m.element }) ||
  m.kind === "object" && m.fields.every((f) => supports(f.model));
function cost(m, raw) {
  if (raw === null) return 0;
  if (m.kind === "number") {
    const n = num(raw);
    return Number.isNaN(n) ? 3000 : !Number.isFinite(n) ? 2999 : n === 0 ? (Object.is(n, -0) ? 0.5 : 0)
      : 1 + Math.log2(1 + Math.abs(n)) + (Number.isInteger(n) ? 0 : 1) + (n < 0 ? 0.25 : 0);
  }
  if (m.kind === "boolean") return raw === "true" ? 1 : 0;
  if (m.kind === "optional") return 1 + cost(m.value, raw);
  if (m.kind === "array") return 1e4 * raw.length + raw.reduce((s, v) => s + cost({ kind: m.element }, v), 0);
  if (m.kind === "object") return m.fields.reduce((s, f) => s + (Object.hasOwn(raw, f.name) ? 1 + cost(f.model, raw[f.name]) : 0), 0);
  return 0;
}
function* candidates(m, raw) {
  if (m.kind === "number") {
    const n = num(raw), halfExponent = Number.isFinite(n) && n !== 0 ? Math.sign(n) * 2 ** Math.floor(Math.log2(Math.abs(n)) / 2) : n;
    const far = Number.isNaN(n) ? [Number.MAX_VALUE, -Number.MAX_VALUE] : !Number.isFinite(n) ? [Math.sign(n) * Number.MAX_VALUE] : [];
    for (const c of [0, 1, -1, ...far, Math.trunc(n), halfExponent, Math.trunc(n / 2), n / 2, Math.trunc(n * 0.75), n - Math.sign(n), -n]) yield hex(c);
  } else if (m.kind === "boolean") yield "false";
  else if (m.kind === "optional") { yield null; if (raw !== null) yield* candidates(m.value, raw); }
  else if (m.kind === "array") {
    yield [];
    for (let i = 0; i < raw.length; i++) yield raw.toSpliced(i, 1);
    for (let i = 0; i < raw.length; i++) for (const c of candidates({ kind: m.element }, raw[i])) yield raw.with(i, c);
  } else if (m.kind === "object") for (const f of m.fields) if (Object.hasOwn(raw, f.name)) {
    if (f.keyFlag) { const { [f.name]: omitted, ...rest } = raw; yield rest; }
    for (const c of candidates(f.model, raw[f.name])) yield { ...raw, [f.name]: c };
  }
}

// A bounded amount of replay work, never a proof bound or a minimality claim.
// Keep the original separately, and only keep smaller, validated witnesses that
// reproduce the same confirmed failure. Complex identity/table witnesses skip.
export function shrink(target, result, oracle, limit = 300) {
  const models = witnessModels(target);
  if (target.heapModel || target.probes?.length || !models.every(supports)) return { skipped: "heap, callback-probe or predicate-table witness" };
  const original = oracle(result), goal = signature(original);
  if (original.status !== "counterexample" || !original.confirmed) return { skipped: "not a confirmed bug" };
  let witness = result.witness, replays = 0, improved = true;
  while (improved && replays < limit) {
    improved = false;
    outer: for (let i = 0; i < witness.length; i++) for (const candidate of candidates(models[i], witness[i])) {
      if (replays >= limit) break outer;
      if (cost(models[i], candidate) >= cost(models[i], witness[i])) continue;
      const next = witness.with(i, candidate);
      if (validWitness(models, next)) continue;
      replays++;
      const o = oracle({ ...result, witness: next });
      if (o.confirmed && signature(o) === goal) { witness = next; improved = true; break outer; }
    }
  }
  return { witness, replays, limit, changed: JSON.stringify(witness) !== JSON.stringify(result.witness), greedy: true };
}

const plain = (o) => o !== null && typeof o === "object" && !Array.isArray(o);
const digest = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
// Validate every witness in a bundle before executing any one of them.
export function validateEvidence(evidence, targets, identity) {
  if (!plain(evidence) || evidence.format !== EVIDENCE_FORMAT || evidence.kind !== "jsverify-bugs" ||
      !digest(evidence.graphSha256) || !digest(evidence.identity) || !plain(evidence.witnesses)) return "Invalid evidence envelope.";
  if (evidence.identity !== identity.sha256) return "The verification model/backend identity changed.";
  if (Object.keys(evidence.witnesses).length > targets.size) return "Too many evidence targets.";
  for (const [id, item] of Object.entries(evidence.witnesses)) {
    const target = targets.get(id);
    if (!target || !plain(item) || !digest(item.key) || typeof item.signature !== "string" || item.signature.length > 1_000_000 ||
        item.phase !== undefined && item.phase !== "requires-definedness") return `Invalid evidence target ${id}.`;
    const models = witnessModels(target), failure = validWitness(models, item.witness);
    if (failure) return `${id}: ${failure.message}`;
    if (item.shrunk !== undefined) {
      if (!plain(item.shrunk)) return `${id}: invalid shrink record.`;
      if (Object.hasOwn(item.shrunk, "witness")) {
        const invalid = validWitness(models, item.shrunk.witness);
        if (invalid) return `${id}: ${invalid.message}`;
      } else if (typeof item.shrunk.skipped !== "string") return `${id}: invalid shrink record.`;
    }
  }
}
