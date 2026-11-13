// Review diagnostics for Gate 1 numeric metadata. Not a production encoding.
// Archive root is an immutable git archive of b00b08ea. Solver work is invoked
// only through serial-verify.py by the caller.
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const archive = process.argv[2];
const logPath = process.argv[3];
const base = pathToFileURL(archive.endsWith("/") ? archive : archive + "/");
const log = (row) => {
  const line = JSON.stringify({ t: new Date().toISOString(), ...row });
  appendFileSync(logPath, line + "\n");
  console.log(line);
};
const dataText = readFileSync(new URL("verify/data.mjs", base), "utf8");
log({ kind: "identity", dataSha256: createHash("sha256").update(dataText).digest("hex"),
  intWidth: (dataText.match(/const INT_WIDTH = (\d+);/) || [])[1] });

const { binary, builtin, index, literal, merge, natural, unary } = await import(new URL("verify/data.mjs", base));
const { compile } = await import(new URL("verify/source.mjs", base));
const { single } = await import(new URL("verify/modules.mjs", base));
const { obligation } = await import(new URL("verify/proofs.mjs", base));
const { verify } = await import(new URL("verify/index.mjs", base));
const { cases } = await import(new URL("tests/verify/fixtures/numeric-metadata-cases.mjs", base));

const fpBits = (n) => {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleBE(n);
  return `#x${bytes.toString("hex")}`;
};
const identity = (n) => ((n / 2) + 1) - (n / 2);
const nativeOf = (source, inputs, post) => {
  const fn = Function(stripTypeScriptTypes(source) + "\nreturn f;")();
  return inputs.map((input) => {
    const args = structuredClone(input);
    const result = fn(...args);
    return { input, result, post: post(result, args, input) };
  });
};

const hand = [2, 0, 1, 0, Number.MAX_SAFE_INTEGER];
const other = [268505086, 134287360, 1610550338, 1476332610, 9007199120693249];
const n12 = cases.find((c) => c.id === "N12-mixed-width-eq");
log({ kind: "native-n12", hand: nativeOf(n12.source, [hand], n12.post)[0],
  baselineModel: nativeOf(n12.source, [other], n12.post)[0] });
log({ kind: "native-identity", rows: [2 ** 51 - 1, 2 ** 52 - 1, 2 ** 52, 2 ** 53 - 3, 2 ** 53 - 2, 2 ** 53 - 1]
  .map((n) => ({ n: String(n), result: identity(n) })) });

const nat = (name, width) => natural(name, false, width).value;
const w52 = nat("w52", 52), w53 = nat("w53", 53), w51 = nat("w51", 51), w40 = nat("w40", 40);
const diff52 = binary("-", w52, nat("v52", 52));
const direct52 = binary("/", w52, literal(2));
const direct53 = binary("/", w53, literal(2));
const cancel = (v) => binary("-", binary("+", binary("/", v, literal(2)), literal(1)), binary("/", v, literal(2)));
const pred = natural("pred", true, 53).value;
const eq54 = binary("===", w53, pred);
const sub53 = binary("-", w53, nat("u53", 53));
const add53 = binary("+", w53, nat("t53", 53));
const owner = { sort: "array", element: "number", length: literal(2),
  at: (i) => ({ sort: "number", present: "true", smt: `(el ${i})` }) };
const read = (int) => index(owner, { sort: "number", present: "true", smt: "fp", int });
const big = read({ pos: "(_ bv4294967296 33)", neg: "(_ bv0 33)", width: 33, low: "#x00000000" });
const neg1 = read({ pos: "(_ bv0 33)", neg: "(_ bv1 33)", width: 33, low: "#xffffffff" });
const small = read({ pos: "(_ bv1 33)", neg: "(_ bv0 33)", width: 33, low: "#x00000001" });
const absent = merge("c", diff52, { ...diff52, present: "false" });
log({ kind: "structure",
  diff52: { width: diff52.int?.width ?? null, halves: diff52.halves ?? null, u32: diff52.u32 ?? null },
  divOfDiff52: directHalves(binary("/", diff52, literal(2))),
  div52: directHalves(direct52), div53: directHalves(direct53),
  cancel40: directHalves(cancel(w40)), cancel51: directHalves(cancel(w51)), cancel52: directHalves(cancel(w52)),
  sub53: sub53.int ?? null, add53: { nat: add53.nat ?? null, int: add53.int ?? null },
  eq54: eq54.smt, eqSort: eq54.sort,
  isSafeDiff: builtin("Number.isSafeInteger", [diff52]).smt,
  isSafeHalf: builtin("Number.isSafeInteger", [direct52]).smt.startsWith("(and"),
  isIntHalf: builtin("Number.isInteger", [direct52]).smt.startsWith("(and"),
  objectIs: builtin("Object.is", [unary("-", literal(0)), literal(0)]).smt,
  numericEq: binary("===", unary("-", literal(0)), literal(0)).smt,
  absentKeys: ["int", "halves", "nat", "u32", "predecessor"].filter((k) => absent[k] !== undefined),
  absentPresent: absent.present,
  indexBig: big.present, indexNeg: neg1.present, indexSmall: small.present,
  indexResultHasU32: big.u32 ?? null });

function directHalves(v) {
  return v.halves ? { width: v.halves.width, int: v.int?.width ?? null } : { width: null, int: v.int?.width ?? null };
}

const { createBackend } = await import(new URL("verify/backend.mjs", base));
const backend = createBackend();
const started = await backend.start(20_000);
log({ kind: "backend", name: started.name });
try {
  const { targets } = compile(single("numeric/N12.ts", n12.source).records);
  const target = targets[0];
  const post = obligation(target, "postcondition", 0);
  const blob = post.assertions.join("\n");
  log({ kind: "n12-shape", assertionBytes: blob.length,
    fpAdd: (blob.match(/fp\.add/g) || []).length,
    bvadd: (blob.match(/bvadd/g) || []).length,
    innerBv: blob.includes("(not (= (bvadd"),
    outerFp: blob.includes("(fp.eq (ite (ite (fp.eq (fp.add RNE (fp.sub RNE") });
  const pin = async (id, values) => {
    const [a, b, c, d, n] = values;
    const assertions = [...post.assertions,
      `(= parameter0_u32 (_ bv${a} 32))`, `(= parameter0_negative_zero false)`,
      `(= parameter1_u32 (_ bv${b} 32))`, `(= parameter1_negative_zero false)`,
      `(= parameter2_u32 (_ bv${c} 32))`, `(= parameter2_negative_zero false)`,
      `(= parameter3_u32 (_ bv${d} 32))`, `(= parameter3_negative_zero false)`,
      `(= parameter4_u53 (_ bv${n} 53))`, `(= parameter4_negative_zero false)`,
      ...values.map((value, i) => `(= input_${i} ${fpBits(value)})`)];
    const result = await backend.check({ ...post, assertions }, 20_000);
    log({ kind: "constrained-witness", id, values: values.map(String), status: result.status,
      reason: result.reason ?? null, note: "pinned model of the final postcondition query; not a universal proof" });
  };
  await pin("hand-max-safe", hand);
  await pin("baseline-model", other);
} finally {
  await backend.close();
}

const runCase = async (c, timeoutMs = 20_000) => {
  const native = nativeOf(c.source, c.inputs, c.post);
  const report = await verify(c.source, { timeoutMs });
  const o = report.outcomes[0];
  log({ kind: "verify", id: c.id, expect: c.expect, status: o.status, confirmed: o.confirmed ?? null,
    reason: o.reason ?? null, nativeViolation: native.some((row) => !row.post),
    falseVerified: o.status === "verified" && native.some((row) => !row.post),
    detail: c.id.startsWith("N01-") ? o.inputs : undefined });
};

for (const id of ["N01-challenge-safe-eq", "N03-challenge-neg-side", "N08-half-signed-zero", "N14-int-safe-pos",
  "N18-index-wrap-neg-2p32", "N21-index-int-pos", "N21b-index-int-pos", "N22-index-fp-half", "N22-index-fp-inf",
  "N23-index-fp-nan", "N24-index-negzero-pos", "N27-neg-zero-is", "N28-neg-zero-eq-pos", "N41-optional-field"]) {
  await runCase(cases.find((c) => c.id === id));
}

await runCase({ id: "half-isInteger", expect: "reject",
  source: `// requires Number.isInteger(n) && 0 <= n && n <= 4294967295\n// ensures Number.isInteger(result)\nfunction f(n:number) { return n / 2; }`,
  inputs: [[0], [1]], post: (r) => Number.isInteger(r) });
await runCase({ id: "half-isSafeInteger", expect: "reject",
  source: `// requires Number.isInteger(n) && 0 <= n && n <= 4294967295\n// ensures result\nfunction f(n:number) { return Number.isSafeInteger(n / 2); }`,
  inputs: [[0], [1]], post: (r) => r === true });
await runCase({ id: "nested-merge", expect: "verify", timeoutMs: 30_000,
  source: `// requires Number.isInteger(n) && 0 <= n && n <= 4294967295\n// requires Number.isInteger(m) && 0 <= m && m <= 4294967295\n// ensures result === 1\nfunction f(n:number, m:number, first:boolean, second:boolean) {\n  const d = first ? n - m : m - n;\n  const h = second ? d / 2 : -d / 2;\n  const merged = first ? h : (second ? -h : +h);\n  return (+merged + 1) - merged;\n}`,
  inputs: [[0, 1, true, false], [4294967295, 0, false, true]], post: (r) => r === 1 }, 30_000);

const { runMutations } = await import(new URL("verify/reports/roadmap/numeric-metadata/scripts/mutations.mjs", base));
const mutants = await runMutations();
log({ kind: "mutants", results: mutants.map((r) => ({ id: r.id, case: r.case, detected: r.detected,
  detection: r.detection, control: r.control, observed: r.observed,
  sourceSha256: r.sourceSha256, mutantSha256: r.mutantSha256 })) });
log({ kind: "done" });
