// Predicate witnesses use SameValue keys: the two zeros differ, NaNs do not.
// Keep decoding and table validation shared by the solver, IPC and replay.
export const TABLE = Symbol("predicate-witness-table");
export const PREDICATE_DOMAIN = "Pure total predicates from every binary64 number to a present boolean: includes NaN, infinities, signed zeros and subnormals; excludes undefined, effects, exceptions and mutable captures. NaN payloads are not distinguished; function identity, properties and this are unsupported.";

export function floatBits(text) {
  const special = { "+zero": "0000000000000000", "-zero": "8000000000000000", "+oo": "7ff0000000000000", "-oo": "fff0000000000000", NaN: "7ff8000000000000" };
  const literal = text.trim().replace(/\s+/g, " ");
  const tag = /^\(_ (\+zero|-zero|\+oo|-oo|NaN) 11 53\)$/.exec(literal);
  if (tag) return special[tag[1]];
  const parts = /^\(fp (#b[01]+|#x[\da-f]+) (#b[01]+|#x[\da-f]+) (#b[01]+|#x[\da-f]+)\)$/i.exec(literal);
  if (!parts) return undefined;
  const bits = parts.slice(1).map((p) => BigInt(p[1].toLowerCase() === "b" ? `0b${p.slice(2)}` : `0x${p.slice(2)}`));
  if (bits[0] > 1n || bits[1] >= 2048n || bits[2] >= 1n << 52n) return undefined;
  return ((bits[0] << 63n) | (bits[1] << 52n) | bits[2]).toString(16).padStart(16, "0");
}

const number = (bits) => typeof bits === "string" && /^[\da-f]{16}$/.test(bits);
const boolean = (value) => value === "true" || value === "false";
const key = (bits) => Number.isNaN(Buffer.from(bits, "hex").readDoubleBE()) ? "NaN" : bits;

export function validPredicateTable(table, limit) {
  if (!table || typeof table !== "object" || !Array.isArray(table.entries) || table.entries.length > limit || !boolean(table.else)) return false;
  const seen = new Map();
  for (const entry of table.entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || !Array.isArray(entry[0]) || entry[0].length !== 1 || !number(entry[0][0]) || !boolean(entry[1])) return false;
    const at = key(entry[0][0]);
    if (seen.has(at) && seen.get(at) !== entry[1]) return false;
    seen.set(at, entry[1]);
  }
  return true;
}

export function predicateFromTable(raw) {
  const entries = raw.entries.map(([args, value]) => [Buffer.from(args[0], "hex").readDoubleBE(), value === "true"]);
  const fallback = raw.else === "true";
  const predicate = (value) => {
    for (const [at, result] of entries) if (Object.is(at, value)) return result;
    return fallback;
  };
  const display = (x) => Object.is(x, -0) ? "-0" : String(x);
  Object.defineProperty(predicate, TABLE, { value: { entries: entries.map(([at, value]) => [[display(at)], String(value)]), else: String(fallback) } });
  return predicate;
}
