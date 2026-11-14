import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compile, parse } from "../../verify/source.mjs";
import * as heap from "../../verify/heap.mjs";
import * as data from "../../verify/data.mjs";
import { obligation } from "../../verify/proofs.mjs";

const fixture = `// ensures result===(x>0)
function positive(x:number){return x>0;}
// ensures result===p(x)
function apply(p:(x:number)=>boolean,x:number){return p(x);}
// modifies a.x
// ensures a.x===1 && result===1
function poke(a:{x:number, extra?:number}){a.x=1;return 1;}
// requires a.x===0
// modifies a.x
// ensures result
function f(a:{x:number}) {
  let last=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // invariant a.x===(i===0?0:1)
  // invariant last===undefined || Number.isFinite(last)
  // decreases real(1)-real(i)
  for(let i=0;i<1;i++){apply(positive,i);poke(a);last=undefined;}
  return true;
}`;

// Compare actual committed SMT, obligations, facts and dependency order after
// alpha-renaming only generated symbols. Input and field names stay literal.
function canonical(target) {
  const symbols=[...target.declarations.matchAll(/\((?:declare-const|declare-fun|define-fun) (\S+)/g)].map((m)=>m[1]);
  const names=new Map();
  for(const name of symbols) if (/^(loop|call|predicate|probe|every_q|heap_.*_v\d|heap_.*havoc\d)/.test(name)) {
    const root=/^(predicate\d+)/.exec(name)?.[1] ?? name;
    if(!names.has(root)) names.set(root,`generated_${names.size}`);
  }
  const rewrite=(s)=>s.replace(/[^\s()]+/g,(word)=>{
    if(names.has(word)) return names.get(word);
    const pred=/^(predicate\d+)(_.+)$/.exec(word);
    return pred && names.has(pred[1]) ? names.get(pred[1])+pred[2] : word;
  });
  return JSON.stringify({declarations:target.declarations, obligations:target.obligations,
    queries:target.postconditions.map((_,i)=>obligation(target,"postcondition",i)), callees:target.callees, effects:target.effects, allocates:target.allocates, loops:target.loops},(_key,value)=>typeof value==="string"?rewrite(value):value);
}
const compileFixture=(compiler)=>compiler.compile([compiler.parse("trial.ts",fixture)]).targets.at(-1);

async function scratch(change, run) {
  const dir=await mkdtemp(join(tmpdir(),"loop-trial-"));
  try {
    const source=await readFile(new URL("../../verify/source.mjs",import.meta.url),"utf8");
    const changed=change(source).replace('from "acorn"', `from ${JSON.stringify(import.meta.resolve("acorn"))}`).replaceAll(/from "(\.\/[^\"]+)"/g,(_all,p)=>`from ${JSON.stringify(new URL(`../../verify/${p.slice(2)}`,import.meta.url).href)}`);
    const file=join(dir,"source.mjs");await writeFile(file,changed);
    await run(await import(pathToFileURL(file).href));
  } finally { await rm(dir,{recursive:true,force:true}); }
}
const once=(s,from,to)=>{assert.equal(s.split(from).length,2,from);return s.replace(from,to);};

test("a real first discarded trial leaves the same ordered queries as starting at the fixed point",async(t)=>{
  const trials=[];
  const capture=(unit,checks,own,r,widen,grow)=>trials.push({events:unit.events.map((e)=>e.label.kind),
    declarations:unit.declarations.length, checks:checks.length, facts:unit.events.filter((e)=>e.assume!=="true").length,
    dependencies:[...unit.dependencies], functions:unit.functions.size, probes:unit.probes.length,
    keys:[...unit.heap.keys], widen:[...widen], grow:grow.length, returns:own.length});
  globalThis.__K_captureTrial=capture;
  let retried, seeded;
  try {
    await scratch((s)=>once(s,"    if (widen.length || grow.length) {","    globalThis.__K_captureTrial(unit, checks, own, r, widen, grow);\n    if (widen.length || grow.length) {"), (c)=>{retried=compileFixture(c);});
    await scratch((s)=>once(s,"  const frame = [];",'  optional.add("last");\n  const frame = [{ref:"input_0_ref",key:"x",sort:"number",kind:"field"}];'),(c)=>{seeded=compileFixture(c);});
  } finally { delete globalThis.__K_captureTrial; }
  assert.equal(trials.length,2);assert.equal(trials[0].grow,1);assert.deepEqual(trials[0].widen,["last"]);
  assert.equal(trials[1].grow,0);assert.deepEqual(trials[1].widen,[]);
  assert.ok(trials[0].events.includes("callback-fact"));assert.ok(trials[0].events.includes("call"));
  assert.ok(trials[0].dependencies.length>0); assert.equal(trials[0].functions,1); assert.ok(trials[0].probes>0);
  assert.ok(trials[0].keys.includes("extra"));
  assert.equal(canonical(retried),canonical(seeded));
  assert.equal(retried.obligations.filter((o)=>o.kind==="invariant-init").length,1);
  const kinds=retried.obligations.map((o)=>o.kind);
  assert.ok(kinds.indexOf("invariant-init")<kinds.indexOf("call"));
  assert.ok(kinds.lastIndexOf("call")<kinds.indexOf("invariant-preserve"));
  t.diagnostic(JSON.stringify({trials,committedObligations:kinds,queries:retried.postconditions.length,
    committedFacts:(retried.declarations.match(/define-fun call_fact/g)??[]).length}));
});

test("discarded compiler trials cannot publish registry-only fields, roots, assertions or declarations",async()=>{
  const expected=canonical(compileFixture({compile,parse}));
  // Inject real heap operations into the first discovery trial. They have no
  // returned state, but finish() would still emit their universe and assertions.
  const poison=`if (!frame.length) {
    heap.refInput(unit,{kind:"object",fields:[{name:"discarded_only",type:"number"}]},"discarded_root");
    heap.alloc(unit,r.head,data.record([["discarded_only",{hasKey:"true",value:data.literal(3)}]]));
    heap.registry(unit).asserts.push("false");
    unit.declarations.push("(declare-const discarded_symbol Bool)");
    unit.events.push({guard:"true",safe:"false",assume:"false",label:{kind:"discarded"}});
    unit.dependencies.add("discarded_dependency"); checks.push("false");
    unit.functions.set("discarded_function",{declaration:"(assert false)"});
    unit.emittedFunctions.add("discarded_function");
    unit.pendingAxioms.push({guard:"true",safe:"false",assume:"false",label:{kind:"discarded"}});
    unit.probes.push({models:[]});unit.replayGuards.push("discarded_symbol");
  }`;
  await scratch((s)=>once(s,"    if (widen.length || grow.length) {",`    ${poison}\n    if (widen.length || grow.length) {`),(c)=>{
    const target=compileFixture(c);
    assert.equal(canonical(target),expected);
    assert.ok(!JSON.stringify(target).includes("discarded"));
  });
  // Negative control: the same real first trial without heap rollback leaks.
  await scratch((s)=>once(once(s,"    if (widen.length || grow.length) {",`    ${poison}\n    if (widen.length || grow.length) {`),
    "      transaction.rollback();\n      widen.forEach", "      transaction.commit();\n      widen.forEach"),(c)=>{
    const target=compileFixture(c);
    assert.notEqual(canonical(target),expected);
    assert.match(target.declarations,/discarded_only|6469736361726465645f6f6e6c79|\(assert false\)/);
  });
});

test("the heap owner rolls back field boundaries and provenance without reusing version names",()=>{
  const unit={declarations:[]},entry=heap.entryState(unit);
  const before=structuredClone(heap.finish(unit)),tx=heap.trial(unit);
  const discarded=heap.write(unit,entry,"a","discarded_only",data.literal(1));
  const counter=unit.heap.versions;
  heap.refInput(unit,{kind:"object",fields:[{name:"ghost",type:"boolean"}]},"ghost");
  tx.rollback();
  assert.deepEqual(heap.finish(unit),before);assert.equal(unit.heap.versions,counter);
  assert.throws(()=>heap.loopWrites(entry,[discarded]),/unknown content version/);
  const live=heap.write(unit,entry,"a","x",data.literal(1));
  assert.ok(unit.heap.versions>counter);assert.equal(heap.loopWrites(entry,[live]).locations.length,1);
  assert.throws(()=>tx.rollback(),/already ended/);
});
