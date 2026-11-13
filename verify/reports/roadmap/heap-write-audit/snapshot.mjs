// Usage: node snapshot.mjs <verifier-tree> <output-directory>
// Run through serial-verify.py. Capture full public default reports and every
// synchronous proof/witness query, without reducing queries to solver verdicts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { cases, nativeRows } from "../../../../tests/verify/fixtures/heap-write-cases.mjs";

const [treeArg,outArg] = process.argv.slice(2), tree=realpathSync(resolve(treeArg)), out=resolve(outArg);
const moduleAt = (p) => import(pathToFileURL(join(tree,p)).href);
const [{ compile, parse, SourceError }, { obligation }, { single, load }, { verify }, { annotatedSources, nativeSamples }] = await Promise.all([
  moduleAt("verify/source.mjs"), moduleAt("verify/proofs.mjs"), moduleAt("verify/modules.mjs"), moduleAt("verify/index.mjs"), moduleAt("verify/examples/es-toolkit/check.mjs"),
]);
const phases=["requires-definedness","requires-definedness-witness","feasibility","feasibility-witness","postcondition","counterexample-witness"];
const queries=[], runtime=[], native=[], sources=[];
const sha = (s) => createHash("sha256").update(s).digest("hex");
function capture(id, snapshot) {
  sources.push({ id, files: snapshot.files.map((f) => ({file:isAbsolute(f.file)?relative(tree,f.file):f.file,sha256:f.sha256})) });
  try {
    if(snapshot.error) throw snapshot.error;
    for(const t of compile(snapshot.records).targets) for(const phase of phases) {
      const count=["postcondition","counterexample-witness"].includes(phase)?t.postconditions.length:1;
      for(let i=0;i<count;i++) {
        const query=obligation(t,phase,i);
        // Only target attribution has a tree-dependent file path. SMT strings
        // and model descriptors are captured without any normalization.
        queries.push({id,query:{...query,target:query.target.replaceAll(tree,"<tree>")}});
      }
    }
  } catch(e) {
    if (!(e instanceof SourceError)) throw e;
    queries.push({id,error:{name:e.name,message:e.message.replaceAll(tree,"<tree>"),status:e.status,span:e.span,file:e.file?.replaceAll(tree,"<tree>")}});
  }
}
for(const c of cases) {
  const file=`heap-write-audit/${c.id}.js`;
  capture(c.id,single(file,c.source));
  const report=await verify(c.source,{file}); // Default runtime and timeout options.
  for(const o of report.outcomes) {
    assert.equal(o.status,c.status??"verified",JSON.stringify({id:c.id,o}));
    if(c.reason) { assert.equal(o.reason,c.reason); assert.equal(o.confirmed,true); }
  }
  runtime.push({id:c.id,report});
  const rows=nativeRows(c); assert.ok(rows.every((r) => r.holds),c.id); native.push({id:c.id,rows});
}
async function walk(dir) {
  for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const p=join(dir,e.name);
    if(e.isDirectory()) await walk(p);
    else if(/\.(ts|js)$/.test(e.name)) capture(relative(tree,p),load(p));
  }
}
await walk(join(tree,"verify/examples"));
const dir=join(tree,"verify/examples/es-toolkit");
const pinned=Object.fromEntries(await Promise.all(["sum","mean"].map(async (name)=>[name,await readFile(join(dir,`${name}.upstream.ts`),"utf8")])));
const annotated=annotatedSources(pinned,JSON.parse(await readFile(join(dir,"provenance.json"),"utf8")));
capture("annotated-es-toolkit",{files:[],records:[parse("es/sum.ts",annotated.sum),parse("es/mean.ts",annotated.mean,()=>"es/sum.ts")]});
const sumReport=await verify(annotated.sum,{file:"es/sum.ts"});
assert.ok(sumReport.outcomes.length && sumReport.outcomes.every((o)=>o.status==="verified"),JSON.stringify(sumReport));
runtime.push({id:"es-toolkit-sum-default",report:sumReport});
const specs=Object.fromEntries(await Promise.all(["sum","mean"].map(async(name)=>[`${name}Spec`,await readFile(join(dir,`${name}.spec.upstream.ts`),"utf8")])));
native.push({id:"es-toolkit-native",rows:await nativeSamples({...pinned,...specs})});
await mkdir(out,{recursive:true});
const encode=(_k,v)=>typeof v==="number"?(Number.isNaN(v)?"NaN":Object.is(v,-0)?"-0":Number.isFinite(v)?v:String(v)):v;
const smt=queries.filter((q)=>q.query).map(({id,query:q})=>({id,phase:q.phase,declarations:q.declarations,assertions:q.assertions}));
for(const [name,value] of Object.entries({queries,smt,runtime,native,sources})) {
  const text=JSON.stringify(value,encode)+"\n"; await writeFile(join(out,`${name}.json`),text);
  console.log(JSON.stringify({name,rows:value.length,bytes:Buffer.byteLength(text),sha256:sha(text)}));
}
