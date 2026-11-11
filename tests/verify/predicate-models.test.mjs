import assert from "node:assert/strict";
import { test } from "node:test";
import { createBackend } from "../../verify/backend.mjs";
import { REPLAY_LIMIT, materialize, display } from "../../verify/data.mjs";
import { floatBits, validPredicateTable } from "../../verify/predicate-witness.mjs";

const model = { kind: "function", symbol: "p", params: ["number"], result: "boolean" };
const declaration = "(declare-fun p ((_ FloatingPoint 11 53)) Bool)";
const fp = (bits) => `((_ to_fp 11 53) #x${bits})`;

test("floating-point table keys preserve every number class, without numerical API conversion", () => {
  for (const bits of ["3ff0000000000000", "3fe0000000000000", "bff0000000000000", "0000000000000000", "8000000000000000",
    "7ff0000000000000", "fff0000000000000", "7ff0000000000001", "0000000000000001", "7fefffffffffffff"]) {
    const n = BigInt(`0x${bits}`), sign = n >> 63n, exponent = (n >> 52n) & 2047n, fraction = n & ((1n << 52n) - 1n);
    const term = `(fp #b${sign} #b${exponent.toString(2).padStart(11, "0")} #x${fraction.toString(16).padStart(13, "0")})`;
    assert.equal(floatBits(term), bits);
  }
  for (const [tag, bits] of [["+zero", "0000000000000000"], ["-zero", "8000000000000000"], ["NaN", "7ff8000000000000"],
    ["+oo", "7ff0000000000000"], ["-oo", "fff0000000000000"]]) assert.equal(floatBits(`(_ ${tag} 11 53)`), bits);
  assert.equal(floatBits("(fp.lt x y)"), undefined);
});

test("native table lookup separates signed zeros and merges NaN payloads", () => {
  const raw = { entries: [[["8000000000000000"], "true"], [["7ff0000000000001"], "true"]], else: "false" };
  assert.equal(validPredicateTable(raw, REPLAY_LIMIT), true);
  const fn = materialize(model, raw);
  assert.equal(fn(-0), true);
  assert.equal(fn(0), false);
  assert.equal(fn(NaN), true);
  assert.equal(fn(Buffer.from("7ff8000000000002", "hex").readDoubleBE()), true);
  assert.equal(fn(1), false);
  assert.deepEqual(display(fn), { entries: [[["-0"], "true"], [["NaN"], "true"]], else: "false" });
  assert.equal(validPredicateTable({ ...raw, entries: [...raw.entries, [["7ff8000000000000"], "false"]] }, REPLAY_LIMIT), false);
  assert.equal(validPredicateTable({ entries: Array.from({ length: REPLAY_LIMIT + 1 }, () => [["0000000000000000"], "true"]), else: "false" }, REPLAY_LIMIT), false);
});

test("real solver function witnesses replay concrete FP keys and report unsupported interpretations honestly", async () => {
  const backend = createBackend();
  try {
    await backend.start(10_000);
    const values = ["3ff0000000000000", "3fe0000000000000", "8000000000000000", "7ff8000000000000", "7ff0000000000000", "fff0000000000000", "0000000000000001", "7fefffffffffffff"];
    for (const bits of values) {
      const answer = await backend.check({ declarations: declaration, assertions: [`(p ${fp(bits)})`, `(not (p ${fp("0000000000000000")}))`], models: [model] }, 10_000);
      assert.equal(answer.status, "sat", JSON.stringify(answer));
      const fn = materialize(model, answer.witness[0]);
      assert.equal(fn(Buffer.from(bits, "hex").readDoubleBE()), true);
      assert.equal(fn(0), false);
    }
    const unconstrained = await backend.check({ declarations: declaration, assertions: ["true"], models: [model] }, 10_000);
    assert.deepEqual(unconstrained.witness[0], { entries: [], else: "false" });
    const nonconstant = await backend.check({ declarations: declaration,
      assertions: ["(forall ((x (_ FloatingPoint 11 53))) (= (p x) (fp.gt x (_ +zero 11 53))))"], models: [model] }, 10_000);
    assert.equal(nonconstant.status, "unknown");
    assert.equal(nonconstant.reason, "function-witness-incomplete");
    const points = Array.from({ length: (REPLAY_LIMIT + 1) * 2 }, (_, i) => {
      const b = Buffer.alloc(8); b.writeDoubleBE(i);
      const term = `(p ${fp(b.toString("hex"))})`;
      return i % 2 ? `(not ${term})` : term;
    });
    const oversized = await backend.check({ declarations: declaration, assertions: points, models: [model] }, 20_000);
    assert.equal(oversized.status, "unknown", JSON.stringify(oversized));
    assert.equal(oversized.reason, "function-witness-incomplete");
  } finally { await backend.close(); }
});

test("an oversized or malformed predicate table is rejected at the IPC seam", async () => {
  const backend = createBackend({ worker: new URL("./fixtures/backend-worker.mjs", import.meta.url) });
  try {
    await backend.start(10_000);
    for (const mode of ["predicate-too-many", "predicate-conflict"]) {
      await assert.rejects(backend.check({ declarations: "", assertions: [mode], models: [model] }, 10_000), (e) => e.reason === "invalid-response");
    }
  } finally { await backend.close(); }
});
