import assert from "node:assert/strict";
import { test } from "node:test";
import { verify } from "../../verify/index.mjs";
import { compile, parse } from "../../verify/source.mjs";
import { obligation } from "../../verify/proofs.mjs";
import { cases } from "./fixtures/mutating-loop-cases.mjs";
const byId=(id)=>cases.find((c)=>c.id.startsWith(id)).source;
const check=(source)=>verify(source,{file:"loop-edges.ts",timeoutMs:30_000});
const positive=(id,source)=>test(`K ${id}`,async()=>{
  const r=await check(source);
  assert.ok(r.outcomes.length>0 && r.outcomes.every((o)=>o.status==="verified"),JSON.stringify(r.outcomes));
});
positive("test stores keep the false-test exit value",byId("H22").replace("ensures result === 0","ensures result === n"));
positive("update stores keep the next head value",byId("H21").replace("ensures result === 0","ensures result === n").replace("i <= n\n","i <= n && xs[0] === i\n"));
for(const id of ["H25","H26"]) positive(`${id} helper writes in test or update`,byId(id)
  .replace("ensures result === 0","ensures result === (n > 0 ? 1 : 0)")
  .replace("i <= n\n","i <= n && xs[0] === (i > 0 ? 1 : 0)\n"));
positive("continue performs update stores",`// ensures result===1
function f(){const xs=[0];
// invariant Number.isInteger(i) && 0 <= i && i <= 1 && xs[0]===i
// decreases real(1)-real(i)
for(let i=0;i<1;(xs[0]=1,i++)){continue;}return xs[0];}`);
positive("boolean array contents share head havoc",`// ensures result
function f(){const xs=[false];const alias=xs;
// invariant Number.isInteger(i) && 0 <= i && i <= 1 && alias[0]===(i>0)
// decreases real(1)-real(i)
for(let i=0;i<1;i++){xs[0]=true;}return alias[0];}`);

test("K a callee's missing write permission blocks its loop caller",async()=>{
  const r=await check(`// ensures a.x===1
function poke(a:{x:number}){a.x=1;return true;}
// modifies a.x
// ensures true
function f(a:{x:number}){let i=0;
// invariant Number.isInteger(i) && 0 <= i && i <= 1
// decreases real(1)-real(i)
while(i<1){poke(a);i++;}return true;}`);
  assert.equal(r.outcomes[0].status,"counterexample",JSON.stringify(r.outcomes));
  assert.equal(r.outcomes[0].reason,"frame-write");assert.equal(r.outcomes[0].confirmed,true);
  const caller=r.outcomes.at(-1);
  assert.equal(caller.status,"unknown",JSON.stringify(caller));assert.equal(caller.reason,"dependency-violation");
});

test("K full proof assertions do not contain replay bounds",()=>{
  const t=compile([parse("edges.ts",byId("H38"))]).targets[0];
  for(const phase of ["feasibility","postcondition"]) for(let i=0;i<t.postconditions.length;i++) {
    const q=obligation(t,phase,i);
    assert.ok(!q.assertions.includes(t.smallWitness));
    for(const guard of t.replayGuards) assert.ok(!q.assertions.includes(guard));
  }
  assert.ok(t.declarations.includes("loop_replay"));
  assert.ok(t.replayGuards.length>0);
});

for(const inTest of [false,true]) test(`K rejects transitive runtime allocation in ${inTest?"test":"body"} calls`,async()=>{
  const r=await check(`// ensures result===1
function leaf(){const box={x:1};return box.x;}
// ensures result===1
function allocate(){return leaf();}
// ensures true
function f(){let i=0;
// invariant i===0
// decreases real(1)
while(${inTest?"allocate()===1":"i===0"}){${inTest?"":"allocate();"}break;}return true;}`);
  const o=r.outcomes.at(-1);
  assert.equal(o.status,"unsupported",JSON.stringify(o)); assert.equal(o.fn,"f");
  assert.match(o.message,/allocating/); assert.ok(o.span.end>o.span.start);
});
