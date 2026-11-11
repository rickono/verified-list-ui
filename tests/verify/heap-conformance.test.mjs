import assert from "node:assert/strict";
import { test } from "node:test";
import { runHeapConformance, runHeapMutations } from "../../verify/conformance/heap.mjs";

test("independent native heap executions reproduce alias and write-permission witnesses",async()=>{
  const evidence=await runHeapConformance();
  assert.equal(evidence.fixtures.length,7);
  assert.equal(evidence.reproducedCounterexamples,5);
  assert.ok(evidence.nativeSamples>=15);
});
test("heap alias, store permission and call-frame mutants cannot retain expected outcomes",async()=>{
  const mutations=await runHeapMutations();
  assert.equal(mutations.length,3);
  assert.ok(mutations.every(m=>m.detected));
});
