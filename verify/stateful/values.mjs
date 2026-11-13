// A JSON-safe scalar wire format. Decimal/string coercion loses NaN and -0.
export function encodeValue(value) {
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value !== "number") throw new TypeError("Only scalar numbers and booleans are trace values.");
  const bytes = Buffer.alloc(8); bytes.writeDoubleBE(value);
  return { type: "number", bits: bytes.toString("hex") };
}
export function decodeValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2) throw new TypeError("Invalid scalar trace encoding.");
  if (value.type === "boolean" && typeof value.value === "boolean") return value.value;
  if (value.type === "number" && typeof value.bits === "string" && /^[a-f0-9]{16}$/.test(value.bits)) return Buffer.from(value.bits, "hex").readDoubleBE();
  throw new TypeError("Invalid scalar trace encoding.");
}
export function traceOf(machine, actions) {
  return { version: 1, sourceSha256: machine.sourceSha256, executableSha256: machine.executableSha256, assumptionsSha256: machine.assumptions.sha256,
    actions: actions.map((a) => a.kind === "call" ? { ...a, args: a.args.map(encodeValue) }
      : a.kind === "resolve" ? { ...a, value: encodeValue(a.value) } : { ...a }) };
}
