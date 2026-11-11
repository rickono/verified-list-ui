import assert from "node:assert/strict";
import { Script } from "node:vm";
import { mkdtemp, mkdir, readdir, copyFile, writeFile, readFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as originalVerifier from "../index.mjs";
import { restoreAliases } from "./aliases.mjs";
const decode = (v) => Array.isArray(v) ? v.map(decode) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])) : v === "undefined" ? undefined : v === "true" ? true : v === "false" ? false : Number(v);
const sources = {
  alias: `/** @param {{x:number}} a @param {{x:number}} b */
// modifies a.x
// ensures Object.is(result,old(b.x))
function f(a,b){a.x=1;return b.x;}`,
  optional: `/** @param {{x:number}} a @param {{x:number,y?:number}} b */
// modifies a.x
// ensures Object.is(result,old(b.x))
function f(a,b){a.x=1;return b.x;}`,
  array: `/** @param {number[]} a @param {number[]} b */
// requires a.length>0
// modifies a
// ensures Object.is(result,old(b[0]))
function f(a,b){a[0]=1;return b[0];}`,
  restored: `/** @param {{x:number}} a */
// ensures true
function f(a){const x=a.x;a.x=1;a.x=x;return true;}`,
  inclusion: `/** @param {{x:number}} a */
// modifies a.x
// ensures a.x===1
function set(a){a.x=1;return true;}
/** @param {{x:number}} a */
// ensures true
function f(a){return set(a);}`,
  copy: `/** @param {{x:number,q:{v:number}}} a */
// ensures result!==a
// ensures result.q===a.q
function f(a){return {...a};}`,
  snapshot: `/** @param {number[]} a */
// requires a.length>0
// modifies a
// ensures Object.is(result,old(a[0]))
function f(a){const b=a.slice();a[0]=7;return b[0];}`,
};
const names = (id) => ["alias","optional","array"].includes(id) ? ["a","b"] : ["a"];
const expected = (id) => ["copy","snapshot"].includes(id) ? "verified" : "counterexample";
const native = (id, args) => {
  const before=structuredClone(args), writes=[];
  // Independent native oracle for frame fixtures. Only one input record is
  // observed, no compiler/replay frame logic is imported.
  if(["restored","inclusion"].includes(id)) args[0]=new Proxy(args[0],{set(o,k,v){writes.push(k);return Reflect.set(o,k,v);}});
  const f=new Script(`(()=>{${sources[id]}\nreturn f;})()`).runInNewContext();
  const result=f(...args);
  const holds=["alias","optional"].includes(id)?Object.is(result,before[1].x):id==="array"?Object.is(result,before[1][0])
    :id==="copy"?result!==args[0]&&result.q===args[0].q:id==="snapshot"?Object.is(result,before[0][0]):writes.length===0;
  return {holds,writes};
};
export async function runHeapConformance(verifier=originalVerifier, selected=Object.keys(sources)) {
  const evidence={fixtures:[],nativeSamples:0,reproducedCounterexamples:0};
  for(const id of selected){
    const report=await verifier.verify(sources[id],{file:`heap-${id}.js`,timeoutMs:30000}), outcome=report.outcomes.at(-1);
    assert.equal(outcome.status,expected(id),JSON.stringify({id,outcome}));
    if(outcome.status==="counterexample"){
      assert.equal(outcome.confirmed,true);
      const values=restoreAliases(decode(outcome.inputs),outcome.aliases), args=names(id).map(n=>values[n]);
      assert.equal(native(id,args).holds,false,`${id}: reported witness did not fail independent native oracle`);
      evidence.reproducedCounterexamples++;
    }
    const samples=id==="array"?[[[0],[0]],[[-0],[NaN]]]:id==="snapshot"?[[[NaN]],[[-0]],[ [Infinity,1] ]]
      :id==="copy"?[[{x:NaN,q:{v:-0}}],[{x:1,q:{v:Infinity}}]]:names(id).length===2?[[{x:0},{x:0}],[{x:NaN},{x:-0}]]:[[{x:0}],[{x:NaN}]];
    if(names(id).length===2){const shared=id==="array"?[0]:{x:0};samples.push([shared,shared]);}
    for(const args of samples){const result=native(id,args); if(expected(id)==="verified")assert.equal(result.holds,true);evidence.nativeSamples++;}
    evidence.fixtures.push({id,status:outcome.status,reason:outcome.reason,aliases:outcome.aliases??[]});
  }
  return evidence;
}
const mutants=[
  {id:"input-aliases-erased",fixture:"alias",file:"heap.mjs",from:'reg.asserts.push(typing(unit, type, symbol, "heap_next0"));',to:'reg.asserts.push(typing(unit, type, symbol, "heap_next0")); for(const r of reg.roots.slice(0,-1))reg.asserts.push(`(distinct ${r} ${symbol})`);'},
  {id:"store-permission-erased",fixture:"restored",file:"source.mjs",from:'safe: heap.permission(cx.unit.frame ?? [], owner.ref, key)',to:'safe: "true"'},
  {id:"call-frame-inclusion-erased",fixture:"inclusion",file:"source.mjs",from:'const inclusion = and(...locs.map((l) => or(l.key === "@elements" ? `(= (heap_length ${l.ref}) #x00000000)` : "false", heap.permission(unit.frame ?? [], l.ref, l.key))));',to:'const inclusion = "true";'},
];
export async function runHeapMutations(){
  const out=[];
  for(const mutant of mutants){
    await runHeapConformance(originalVerifier,[mutant.fixture]);
    const root=await mkdtemp(join(tmpdir(),"jsverify-heap-mutant-"));
    try{
      await mkdir(join(root,"verify"));
      for(const name of (await readdir(new URL("../",import.meta.url))).filter(n=>n.endsWith(".mjs")))await copyFile(new URL(`../${name}`,import.meta.url),join(root,"verify",name));
      await symlink(fileURLToPath(new URL("../../node_modules",import.meta.url)),join(root,"node_modules"),"dir");
      const path=join(root,"verify",mutant.file),code=await readFile(path,"utf8");assert.equal(code.split(mutant.from).length,2,`Mutation drift: ${mutant.id}`);
      await writeFile(path,code.replace(mutant.from,mutant.to));
      const verifier=await import(pathToFileURL(join(root,"verify/index.mjs")).href);
      const report=await verifier.verify(sources[mutant.fixture],{file:"mutant.js",timeoutMs:30000}),o=report.outcomes.at(-1);
      assert.notEqual(o.status,"counterexample",`Surviving heap mutant ${mutant.id}`);
      assert.ok(o.status==="verified"||o.status==="unknown"&&o.reason==="replay-mismatch",JSON.stringify(o));
      const shared={x:0};assert.equal(native(mutant.fixture,names(mutant.fixture).length===2?[shared,shared]:[shared]).holds,false);
      out.push({id:mutant.id,detected:true,status:o.status,reason:o.reason});
    }finally{await rm(root,{recursive:true,force:true});}
  }
  return out;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify({corpus:await runHeapConformance(),mutants:process.argv.includes("--mutations")?await runHeapMutations():undefined},null,2));
