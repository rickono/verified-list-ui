import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile, mkdtemp, rm, cp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { compile, parse } from "../../verify/source.mjs";
import { cases } from "./fixtures/mutating-loop-cases.mjs";

const dirURL=new URL("../../verify/",import.meta.url);
const fromId=(id)=>cases.find((c)=>c.id.startsWith(id)).source;
const control=(source)=>compile([parse("audit.ts",source)]);
const booleanJoin=`// modifies a.x,b.x
// ensures true
function f(a:{x:number},b:{x:number},flag:boolean){let i=0;
// invariant Number.isInteger(i) && 0 <= i && i <= 1
// decreases real(1)-real(i)
while(i<1){flag?(a.x=1):(b.x=2);i++;}return true;}`;
const helper=`// modifies a.x
// ensures true
function poke(a:{x:number}){a.x=1;return true;}
// modifies a.x
// ensures true
function f(a:{x:number}){let i=0;
// invariant Number.isInteger(i) && 0 <= i && i <= 1
// decreases real(1)-real(i)
while(i<1){poke(a);i++;}return true;}`;
const restore=`// modifies a.x
// ensures true
function f(a:{x:number}){let i=0;
// invariant Number.isInteger(i) && 0 <= i && i <= 1
// decreases real(1)-real(i)
while(i<1){const v=a.x;a.x=1;a.x=v;i++;}return true;}`;

for(const [id,from,to,sources] of [
  ["record-ownership","return logged(next, [name]);","return next;",[restore]],
  ["array-ownership","return logged(s, [valueName, hasName]);","return s;",[fromId("H01"),fromId("H17"),fromId("H20")]],
  ["summary-ownership",'s[kind].set(k, name);\n      s = logged(s, [name]);','s[kind].set(k, name);',[helper]],
  ["join-left","mergeOwnership(a, b)","mergeOwnership(b, b)",[booleanJoin]],
  ["join-right","mergeOwnership(a, b)","mergeOwnership(a, a)",[booleanJoin]],
]) test(`K compiler fails closed on ${id} mutation`,async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),"loop-audit-"));
  try {
    sources.forEach((s)=>assert.doesNotThrow(()=>control(s)));
    await cp(fileURLToPath(dirURL),join(dir,"verify"),{recursive:true,filter:(p)=>!p.includes("/reports") && !p.includes("/examples")});
    await symlink(fileURLToPath(new URL("../../node_modules",import.meta.url)),join(dir,"node_modules"));
    const file=join(dir,"verify/heap.mjs"),text=await readFile(file,"utf8");
    assert.equal(text.split(from).length,2);
    const mutant=text.replace(from,to);await writeFile(file,mutant);
    const c=await import(pathToFileURL(join(dir,"verify/source.mjs")).href);
    for(const source of sources) assert.throws(()=>c.compile([c.parse("audit.ts",source)]),/Heap write audit: missing ownership/);
    t.diagnostic(JSON.stringify({id,controls:sources.length,detected:sources.length,sha256:createHash("sha256").update(mutant).digest("hex")}));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
