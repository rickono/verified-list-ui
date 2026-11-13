import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "../../verify/source.mjs";
import { single } from "../../verify/modules.mjs";
import { solve } from "../../verify/proofs.mjs";

test("a real terminal verified proof carries no pending-obligation label", async () => {
  const { targets } = compile(single("phase.ts", "// ensures Object.is(result,x)\nconst identity=(x:number)=>x;").records);
  assert.equal(targets[0].obligations.at(-1).kind, "ensures");
  const [result] = await solve(targets, 10_000);
  assert.equal(result.status, "verified");
  // The original scheduler advanced past its last postcondition before return.
  // Keeping that label can misattribute a subsequent native replay timeout.
  assert.equal(result.label, undefined);
});
