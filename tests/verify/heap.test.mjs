import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verify, verifyFile } from "../../verify/index.mjs";
import { parse, compile } from "../../verify/source.mjs";
import { obligation } from "../../verify/proofs.mjs";
import { createBackend } from "../../verify/backend.mjs";
import { validHeap } from "../../verify/heap-witness.mjs";
import { restoreAliases } from "../../verify/conformance/aliases.mjs";

const check = (source) => verify(source, { file: "heap.ts", timeoutMs: 30_000 });
const status = (o, expected) => assert.equal(o.status, expected, JSON.stringify(o));
const allVerified = (r) => r.outcomes.forEach((o) => status(o,"verified"));
const decode = (v) => Array.isArray(v) ? v.map(decode) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])) : v === "undefined" ? undefined : v === "true" ? true : v === "false" ? false : Number(v);
const inputs = (o) => restoreAliases(decode(o.inputs), o.aliases);
const setter = `// modifies a.x
// ensures Object.is(a.x,v)
function setX(a:{x:number,y:number},v:number){a.x=v;return 0;}
`;

test("arbitrary shared record arguments obey writes and reconstruct a real alias witness",async()=>{
  allVerified(await check(`// modifies a.x
// ensures Object.is(result,a===b?1:old(b.x))
function f(a:{x:number},b:{x:number}){a.x=1;return b.x;}`));
  const o=(await check(`// modifies a.x
// ensures Object.is(result,old(b.x))
function f(a:{x:number},b:{x:number}){a.x=1;return b.x;}`)).outcomes[0];
  status(o,"counterexample"); assert.equal(o.confirmed,true);
  const {a,b}=inputs(o), before=b.x; assert.equal(a,b); a.x=1; assert.ok(!Object.is(b.x,before));
});

test("overlapping optional schemas do not imply distinct identities, including explicit undefined",async()=>{
  const o=(await check(`// modifies a.x
// ensures Object.is(result,old(b.x))
function f(a:{x:number},b:{x:number,y?:number}){a.x=1;return b.x;}`)).outcomes[0];
  status(o,"counterexample"); const decoded=inputs(o); assert.equal(decoded.a,decoded.b);
  allVerified(await check(`// requires Object.is(a.x,undefined)
// ensures result===undefined
function f(a:{x?:number}){return a.x;}`));
  const r=await check(`// ensures a!==b
function f(a:{x?:number},b:{x?:boolean}){return true;}`);
  status(r.outcomes[0],"counterexample");
});

test("modifies is a write permission and native monitoring catches no-op and restored writes",async()=>{
  for(const body of ["a.x=a.x;return true;","const x=a.x;a.x=1;a.x=x;return true;"]){
    const o=(await check(`// ensures true\nfunction f(a:{x:number}){${body}}`)).outcomes[0];
    status(o,"counterexample"); assert.equal(o.confirmed,true); assert.equal(o.reason,"frame-write");
  }
});

test("callee footprint inclusion precedes its own facts and has a distinct confirmed diagnostic",async()=>{
  const o=(await check(setter+`// ensures true
function f(a:{x:number,y:number}){return setX(a,1);}`)).outcomes.at(-1);
  status(o,"counterexample"); assert.equal(o.reason,"frame-inclusion"); assert.equal(o.confirmed,true);
  const own=await check(`// requires x>10
// ensures x>10
function h(x:number){return x;}
// ensures true
function f(){return h(1);}`);
  status(own.outcomes.at(-1),"counterexample"); assert.equal(own.outcomes.at(-1).call.callee,"h");
});

test("opaque summaries preserve disjoint fields and allow input-result aliases",async()=>{
  allVerified(await check(setter+`// modifies a.x
// ensures Object.is(result,old(b.y))
function f(a:{x:number,y:number},b:{x:number,y:number}){setX(a,1);return b.y;}`));
  const o=(await check(`// ensures result===a
function id(a:{x:number}){return a;}
// ensures result!==a
function wrong(a:{x:number}){return id(a);}`)).outcomes.at(-1);
  status(o,"counterexample"); assert.equal(o.confirmed,true);
});

test("old scalars freeze entry contents while old references retain their native identity",async()=>{
  allVerified(await check(`// modifies a.x
// ensures old(a)===a
// ensures old(a.q)===a.q
// ensures Object.is(a.x,old(a.x)+1)
// ensures Object.is(result,old(a).x)
function f(a:{x:number,q:{v:number}}){a.x=a.x+1;return a.x;}`));
});

test("fresh shallow copies preserve nested sharing and checked contracts permit fresh helper results",async()=>{
  allVerified(await check(`// ensures result!==a
// ensures result.q===a.q
function copy(a:{x:number,q:{v:number}}){return {...a};}
// ensures Object.is(a.x,old(a.x))
function caller(a:{x:number,q:{v:number}}){const b=copy(a);b.x=3;return a.x;}`));
  const o=(await check(`// ensures a.q.v===old(a.q.v)
function f(a:{q:{v:number}}){const b={...a};b.q.v=7;return true;}`)).outcomes[0];
  status(o,"counterexample"); assert.equal(o.reason,"frame-write");
});

test("array aliases and fresh slice/spread copies use one mutable store with native lengths",async()=>{
  allVerified(await check(`// requires a.length>0
// modifies a
// ensures Object.is(result,a===b?1:old(b[0]))
function f(a:number[],b:number[]){a[0]=1;return b[0];}`));
  const o=(await check(`// requires a.length>0
// modifies a
// ensures Object.is(result,old(b[0]))
function f(a:number[],b:number[]){a[0]=1;return b[0];}`)).outcomes[0];
  status(o,"counterexample"); const {a,b}=inputs(o); assert.equal(a,b); const before=b[0];a[0]=1;assert.ok(!Object.is(b[0],before));
  allVerified(await check(`// requires xs.length>0
// modifies xs
// ensures Object.is(result,old(xs[0]))
function f(xs:number[]){const ys=xs.slice();xs[0]=7;return ys[0];}
// ensures result!==xs
// ensures result.every((v,i)=>Object.is(v,xs[i]))
function copy(xs:number[]){return [...xs];}`));
});

test("primitive arguments freeze early; reference arguments and method contents see later writes",async()=>{
  allVerified(await check(`// ensures Object.is(result,x)
function first(x:number,y:number){return x;}
// ensures Object.is(result,a[0])
function read(a:number[],x:number){return a[0];}
// requires a.length>0
// modifies a
// ensures Object.is(result,old(a[0]))
function primitive(a:number[]){return first(a[0],(a[0]=1,a[0]));}
// requires a.length>0
// modifies a
// ensures result===1
function reference(a:number[]){return read(a,(a[0]=1,0));}
// requires a.length>0
// modifies a
// ensures result[0]===7
// ensures result!==a
function receiver(a:number[]){return a.slice((a[0]=7,0));}`));
});

test("array slots preserve booleans and signed zero, with nested array footprints",async()=>{
  allVerified(await check(`// requires box.items.length>0
// modifies box.items
// ensures box.items[0]===false
function booleans(box:{items:boolean[]}){box.items[0]=false;return box;}
// requires a.length>0
// modifies a
// ensures Object.is(a[0],-0)
function zero(a:number[]){a[0]=-0;return a;}`));
  const o=(await check(`// requires a.length===0
// modifies a
// ensures true
function grow(a:number[]){a[0]=1;return a;}`)).outcomes[0];
  status(o,"counterexample");assert.equal(o.reason,"store-domain");
  const empty=(await check(`// requires a.length===0 && b.length===0
// ensures a!==b
function f(a:number[],b:boolean[]){return true;}`)).outcomes[0];
  status(empty,"counterexample"); const decoded=inputs(empty); assert.equal(decoded.a,decoded.b);
});

test("derived effects reject transitive writers as callbacks but keep primitive captures immutable",async()=>{
  const r=await check(`// ensures result===p(x)
function apply(p:(x:number)=>boolean,x:number){return p(x);}
// modifies a.x
// ensures true
function poke(a:{x:number}){a.x=1;return true;}
// ensures true
function cb(x:number){const a={x};return poke(a);}
// ensures true
function f(x:number){return apply(cb,x);}`);
  status(r.outcomes[0],"unsupported");assert.match(r.outcomes[0].message,/effects/);
  allVerified(await check(`// ensures result===p(x)
function apply(p:(x:number)=>boolean,x:number){return p(x);}
// modifies a.x
// ensures result===(x>old(a.x))
function f(a:{x:number},x:number){const k=a.x;const match=(n:number):boolean=>n>k;a.x=7;return apply(match,x);}`));
});

test("heap writes cannot bypass the mutating-loop restriction through helpers or early returns",async()=>{
  for(const body of ["a.x=1;return true;","return poke(a);","const b={x:1};return true;"]){
    const r=await check(`// modifies a.x
// ensures true
function poke(a:{x:number}){a.x=1;return true;}
// modifies a.x
// ensures true
function f(a:{x:number}){let i=0;
// invariant i===0
// decreases real(1)-real(i)
while(i===0){${body}}return true;}`);
    status(r.outcomes[0],"unsupported");
  }
});

test("imported footprints retain defining identities and derived effects",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"heap-import-"));
  try{
    await writeFile(join(directory,"set.ts"),setter.replace("function setX","export function setX"));
    await writeFile(join(directory,"entry.ts"),`import {setX as set} from './set.ts';
// modifies a.x
// ensures a.x===1
function f(a:{x:number,y:number}){set(a,1);return a;}`);
    allVerified(await verifyFile(join(directory,"entry.ts"),{timeoutMs:30000}));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test("heap witness validation checks types, optional overlap, dangling edges and witness-only limits",()=>{
  const object={kind:"object",fields:[{name:"x",type:"number",optional:false}]};
  const plan={keys:["x"],types:[object,object]},raw={roots:["0","0"],nodes:{0:{kind:"object",fields:{x:["num","8000000000000000"]}}}};
  assert.equal(validHeap(plan,raw,256),true);
  assert.equal(validHeap(plan,{...raw,nodes:{0:{kind:"object",fields:{x:["bool","false"]}}}},256),false);
  assert.equal(validHeap(plan,{...raw,roots:["0","1"]},256),false);
  assert.equal(validHeap(plan,raw,0),false);
  const target=compile([parse("heap.ts","// ensures result===a\nfunction f(a:number[]){return a;}")]).targets[0];
  for(const phase of ["feasibility","postcondition"]){assert.ok(!obligation(target,phase).assertions.includes(target.smallWitness));}
});

test("generated symbols cannot collide with user field names that resemble heap versions",async()=>{
  allVerified(await check(`// modifies a.x
// ensures a.x===1
// ensures Object.is(a.x_v1,old(a.x_v1))
function f(a:{x:number,x_v1:number}){a.x=1;return a;}`));
});


test("optional reference joins remain unsupported and malformed worker graph types stay unknown", async () => {
  assert.throws(() => compile([parse("heap.ts", "// ensures true\nfunction f(flag:boolean){return flag ? {child:{x:1}} : {};} ")]), /Optional reference/);
  const backend=createBackend({worker:new URL("./fixtures/backend-worker.mjs",import.meta.url)});
  const type={kind:"object",fields:[{name:"x",type:"number",optional:false}]};
  try{
    await backend.start(10000);
    await assert.rejects(backend.check({declarations:"",assertions:["heap-wrong-sort"],models:[{kind:"ref",symbol:"a",type},{kind:"heap",keys:["x"],roots:["a"],types:[type]}]},10000),e=>e.reason==="witness-invalid");
  }finally{await backend.close();}
});


test("string-literal record keys keep their supported lookup semantics", async () => {
  allVerified(await check(`// ensures Object.is(result["x"],a["x"])
function f(a:{x:number}){return {...a};}`));
});

test("possibly absent values cannot silently change a required heap cell's domain", async () => {
  for (const source of [
    `// requires a.length>0 && b.length===0
// modifies a
// ensures true
function f(a:number[],b:number[]){a[0]=b[0];return true;}`,
    `// requires b.length===0
// modifies a.x
// ensures true
function f(a:{x:number},b:number[]){a.x=b[0];return true;}`,
  ]) {
    const o=(await check(source)).outcomes[0];
    status(o,"counterexample"); assert.equal(o.confirmed,true); assert.equal(o.reason,"store-domain");
  }
});


test("heap-free callback certificates include transitive reads and allocations", async () => {
  const r=await check(`// ensures result===p(x)
function apply(p:(x:number)=>boolean,x:number){return p(x);}
// ensures result===(x>0)
function leaf(x:number){const box={x};return box.x>0;}
// ensures result===(x>0)
function middle(x:number){return leaf(x);}
// ensures result===(x>0)
function f(x:number){return apply(middle,x);}`);
  status(r.outcomes[0],"unsupported");assert.match(r.outcomes[0].message,/effects/);
});


test("required fields cannot erase undefined when joining reference-valued branches", async () => {
  for (const child of ["{x:1}", "[1]"]) {
    const report=await check(`// ensures result.child !== undefined
function f(flag:boolean){return flag?{child:undefined}:{child:${child}};}`);
    status(report.outcomes[0],"unsupported");
    assert.match(report.outcomes[0].message,/Optional reference/);
  }
});


test("indirect fresh results preserve old identity in every helper replay context", async () => {
  const source=`// ensures result.x===0
function make(){return {x:0};}
// ensures old(a)===a
function id(a:{x:number}){return a;}
// ensures true
function f(){return id(make());}`;
  const targets=compile([parse("heap.ts",source)]).targets;
  assert.ok(targets.find(t=>t.name==="f").heapModel);
  allVerified(await check(source));
});

test("quantified dynamic record conformance keeps exactness checks inside their binder", async () => {
  allVerified(await check(`// @spec
// ensures Object.is(result,a.x)
const get=(a:{x:number,y?:number})=>a.x;
// requires b.x===1 && c.x===1
// ensures a.every((v,i)=>get(i===0?b:c)===1)
function f(a:number[],b:{x:number},c:{x:number},d:{z:number}){return true;}`));
});


test("new aggregates inside old preserve contained entry-reference identities", async () => {
  for (const type of ["{child:{x:number}}", "{child:number[]}"]) {
    allVerified(await check(`// ensures old({nested:{leaf:a.child}}).nested.leaf===a.child
function f(a:${type}){return true;}`));
  }
});


test("array length footprints fail explicitly while ordinary record length fields remain writable", async () => {
  status((await check(`// modifies a.length
// ensures true
function f(a:number[]){return a;}`)).outcomes[0],"unsupported");
  allVerified(await check(`// modifies a.length
// ensures a.length===1
function f(a:{length:number}){a.length=1;return a;}`));
});
