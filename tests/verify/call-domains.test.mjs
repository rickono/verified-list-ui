import assert from "node:assert/strict";
import { test } from "node:test";
import { Script } from "node:vm";
import { conforms } from "../../verify/data.mjs";
import { verify } from "../../verify/index.mjs";

test("call-time domain proofs agree with concrete replay checks", async () => {
  const cases = [
    ["number", "NaN", true], ["number", "-0", true], ["number", "Infinity", true],
    ["number", "undefined", false], ["number | undefined", "undefined", true],
    ["boolean", "false", true], ["boolean", "undefined", false],
    ["boolean | undefined", "undefined", true], ["undefined", "undefined", true],
    ["undefined", "1", false],
    ["{ min?: number }", "{}", true], ["{ min?: number }", "{ min: undefined }", true],
    ["{ min?: number }", "{ min: NaN }", true], ["{ x: number }", "{ x: undefined }", false],
    ["{ x: number }", "{ x: 1, extra: 2 }", false],
    ["number[]", "[]", true], ["number[]", "[0, NaN, -0]", true],
    ["number[]", "[undefined]", false], ["boolean[]", "[]", true],
    ["boolean[]", "[false, true]", true],
    ["{ inner: { x: number }, values: boolean[] }", "{ inner: { x: -0 }, values: [true] }", true],
  ];
  for (const [type, literal, accepted] of cases) {
    const source = `// ensures result\nconst helper = (value: ${type}) => true;\n// ensures result\nconst caller = () => helper(${literal});`;
    const report = await verify(source);
    const helper = report.outcomes.find((o) => o.fn === "helper");
    const caller = report.outcomes.find((o) => o.fn === "caller");
    assert.equal(helper?.status, "verified", JSON.stringify(report.outcomes));
    assert.equal(caller?.status, accepted ? "verified" : "counterexample", `${type}, ${literal}: ${JSON.stringify(report.outcomes)}`);
    const actual = new Script(`(${literal})`).runInNewContext();
    assert.equal(conforms(helper.assumptions[0].type, actual), accepted, `${type}, ${literal}`);
    if (!accepted) {
      assert.equal(caller.confirmed, true);
      assert.equal(caller.call.callee, "helper");
      assert.ok(caller.call.violated.some((c) => c.kind === "param-type"));
    }
  }
});
