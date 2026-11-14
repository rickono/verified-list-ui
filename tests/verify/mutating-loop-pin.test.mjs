import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { reverseCases, nativeSamples } from "../../verify/reports/roadmap/K-evidence/pilot/check.mjs";

test("the GPL report pilot preserves pinned bytes, declaration tokens and native semantics",async(t)=>{
  const here=new URL("../../verify/reports/roadmap/K-evidence/pilot/",import.meta.url);
  const bytes=await readFile(new URL("Reverse.upstream.js",here));
  const meta=JSON.parse(await readFile(new URL("provenance.json",here),"utf8"));
  const license=await readFile(new URL("LICENSE",here));
  assert.equal(meta.commit,"636017ca51dad05339cde3b5c66cbe1d71957f7e");
  assert.equal(meta.sha256,"8049944060cfc7e8a3a95cc65f5e097ebb07469c5e8b871b678f151312e88e46");
  assert.equal(createHash("sha256").update(license).digest("hex"),meta.licenseSha256);
  const cases=reverseCases(bytes,meta);
  const samples=nativeSamples(cases[0].implementation);
  for(const c of cases.slice(1)) {
    const input=c.name==="over-swap-mutant"?[]:[1,2], before=[...input];
    const result=Function(c.implementation+"\nreturn Reverse;")()(input);
    assert.ok(input.length!==before.length || input.some((v,k)=>!Object.is(v,before[before.length-1-k])));
    assert.equal(result,input);
  }
  t.diagnostic(JSON.stringify({bytes:bytes.length,sha256:meta.sha256,nativeSamples:samples,mutants:3}));
});
