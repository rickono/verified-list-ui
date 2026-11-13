import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as heap from "../../verify/heap.mjs";
import * as data from "../../verify/data.mjs";
import { verify } from "../../verify/index.mjs";
import { cases, nativeRows } from "./fixtures/heap-write-cases.mjs";

const loc = (ref, key="x", sort="number", kind=key === "@elements" ? "elements" : "field") => ({ref,key,sort,kind});
const fresh = (h=heap) => { const unit={declarations:[]}; return {unit,entry:h.entryState(unit)}; };
const locations = (h,head,backs,exits=[]) => h.loopWrites(head,backs,exits).locations;
const recordType = {kind:"object",fields:[{name:"x",type:"number"},{name:"b",type:"boolean"},{name:"maybe",type:"number",optional:true}]};

test("record, boolean, indexed and summary writers have checked location ownership", () => {
  const {unit,entry}=fresh(), head=heap.loopHead(unit,entry,[]);
  const a=heap.write(unit,head,"a","x",data.literal(1));
  const b=heap.write(unit,a,"b","b",data.bool("false"));
  const c=heap.writeIndex(unit,b,"xs","#x00000000",data.literal(-0));
  const footprint=[loc("a"),loc("ys","@elements","boolean")];
  const summary=heap.havoc(unit,c,footprint,false).state;
  assert.equal(summary.role,"summary");
  assert.throws(()=>heap.write(unit,summary,"a","x",data.literal(2)),/summary must be committed/);
  const current={...summary,role:"current"};
  assert.deepEqual(locations(heap,head,[current]),[loc("a"),loc("b","b","boolean"),loc("xs","@elements"),loc("ys","@elements","boolean")]);
  assert.equal(heap.loopWrites(head,[current]).allocated,false);
  assert.deepEqual(locations(heap,head,[head]),[]);
  assert.equal(entry.role,"entry"); assert.equal(entry.num.size,0); assert.deepEqual(entry.array,{});
});

test("both symbolic join arms retain record and array ownership; concrete joins select one arm", () => {
  const {unit,entry:head}=fresh();
  const a=heap.writeIndex(unit,heap.write(unit,head,"a","x",data.literal(1)),"xs","#x00000000",data.literal(1));
  const b=heap.writeIndex(unit,heap.write(unit,head,"b","x",data.literal(2)),"ys","#x00000001",data.literal(2));
  const joined=heap.join(unit,"flag",a,b);
  assert.deepEqual(new Set(locations(heap,head,[joined]).map(JSON.stringify)),new Set([loc("a"),loc("b"),loc("xs","@elements"),loc("ys","@elements")].map(JSON.stringify)));
  assert.equal(heap.join(unit,"true",a,b),a); assert.equal(heap.join(unit,"false",a,b),b); assert.equal(heap.join(unit,"flag",a,a),a);
  assert.deepEqual(locations(heap,head,[heap.join(unit,"true",a,b)]),[loc("a"),loc("xs","@elements")]);
  // An unchanged arm still cannot hide a store in the other arm.
  assert.deepEqual(locations(heap,head,[heap.join(unit,"flag",a,head)]),[loc("a"),loc("xs","@elements")]);
  assert.deepEqual(locations(heap,head,[heap.join(unit,"flag",head,b)]),[loc("b"),loc("ys","@elements")]);
});

test("intervals distinguish repeated locations, no-op attempts and restored values from prior writes", () => {
  const {unit,entry}=fresh();
  const before=heap.write(unit,entry,"a","x",data.literal(0));
  const head=heap.loopHead(unit,before,[loc("a")]);
  const ref={sort:"object",ref:"a",type:recordType};
  const value=heap.focus(unit,head,ref).fields.get("x").value;
  const noop=heap.write(unit,head,"a","x",value);
  const restored=heap.write(unit,heap.write(unit,head,"a","x",data.literal(7)),"a","x",value);
  assert.deepEqual(locations(heap,head,[head]),[]);
  assert.deepEqual(locations(heap,head,[noop]),[loc("a")]);
  assert.deepEqual(locations(heap,head,[restored]),[loc("a")]);
  const nextHead=heap.loopHead(unit,restored,[]);
  assert.deepEqual(locations(heap,nextHead,[nextHead]),[]);
  assert.deepEqual(locations(heap,nextHead,[heap.write(unit,nextHead,"a","x",data.literal(1))]),[loc("a")]);
  assert.equal(heap.written,undefined,"No competing unchecked frame reader");
});

test("exit writes are audited without flowing into the back-edge frame", () => {
  const {unit,entry:head}=fresh();
  const back=heap.write(unit,head,"a","x",data.literal(1));
  const exit=heap.write(unit,head,"b","x",data.literal(2));
  assert.deepEqual(locations(heap,head,[back],[exit]),[loc("a")]);
  assert.deepEqual(locations(heap,head,[],[exit]),[]);
  const broken={...exit,num:new Map(exit.num).set("x","unowned_exit")};
  assert.throws(()=>heap.loopWrites(head,[back],[broken]),/Heap write audit: unknown content version/);
});

test("existing fresh allocations are writable while allocation and content changes stay distinct", () => {
  const {unit,entry}=fresh();
  const object=heap.alloc(unit,entry,data.record([ ["x",{hasKey:"true",value:data.literal(0)}] ]));
  const array=heap.alloc(unit,object.state,data.array([data.literal(0)]));
  const empty=heap.alloc(unit,array.state,data.array([]));
  assert.equal(object.value.ref,entry.next); assert.equal(array.value.ref,object.state.next);
  assert.notEqual(object.value.ref,array.value.ref); assert.notEqual(array.value.ref,empty.value.ref);
  const allocation=heap.loopWrites(entry,[empty.state]);
  assert.equal(allocation.allocated,true); assert.deepEqual(allocation.locations,[]);
  const head=heap.loopHead(unit,empty.state,[]);
  const changed=heap.writeIndex(unit,heap.write(unit,head,object.value.ref,"x",data.literal(1)),array.value.ref,"#x00000000",data.literal(1));
  assert.deepEqual(locations(heap,head,[changed]),[loc(object.value.ref),loc(array.value.ref,"@elements")]);
  assert.equal(heap.loopWrites(head,[changed]).allocated,false);
  const refSummary=heap.havoc(unit,head,[],true).state;
  assert.equal(refSummary.role,"summary"); assert.equal(heap.loopWrites(head,[],[refSummary]).allocated,true);
});

test("cutpoints preserve allocator, roles, shape, presence, identity and prior views", () => {
  const {unit,entry}=fresh();
  const {value:ref}=heap.refInput(unit,recordType,"input_0");
  const array={sort:"array",ref:"xs",type:{kind:"array",element:"number",allowUndefined:true}};
  const old=heap.focus(unit,entry,ref), oldArray=heap.focus(unit,entry,array);
  const x=old.fields.get("x").value.smt, absent=old.fields.get("maybe");
  const head=heap.loopHead(unit,entry,[loc(ref.ref),loc(array.ref,"@elements")]);
  const current=heap.focus(unit,head,ref), currentArray=heap.focus(unit,head,array);
  assert.equal(head.next,entry.next); assert.equal(head.role,"current"); assert.equal(entry.role,"entry");
  assert.equal(ref.ref,"input_0_ref"); assert.equal(old.fields.get("x").value.smt,x);
  assert.notEqual(current.fields.get("x").value.smt,x);
  assert.deepEqual(current.fields.get("maybe"),absent); assert.deepEqual(current.fields.get("b"),old.fields.get("b"));
  assert.deepEqual(currentArray.length,oldArray.length);
  assert.equal(oldArray.at("#x00000000").present,"(heap_array_has xs #x00000000)");
  assert.notEqual(currentArray.at("#x00000000").present,oldArray.at("#x00000000").present);
  assert.deepEqual(locations(heap,head,[head]),[]);
  const declarations=unit.declarations.join("\n");
  assert.ok(!declarations.includes("(define-fun heap_length"));
  assert.ok(!declarations.includes("(define-fun heap_kind"));
});

test("unknown versions, owners, missing tracking and heaps outside the interval fail internally", () => {
  const {unit,entry}=fresh(), head=heap.loopHead(unit,heap.write(unit,entry,"a","x",data.literal(0)),[]);
  for(const state of [
    {...head,num:new Map(head.num).set("x","unknown_number")},
    {...head,bool:new Map().set("b","unknown_boolean")},
    {...head,array:{num:"unknown_array"}},
    {...head,array:{num:undefined}},
    {...head,array:{length:"new_length"}},
    {...head,num:new Map().set("x",undefined)},
    {role:"current",next:head.next,num:new Map(),bool:new Map(),array:{}},
    fresh().entry,
  ]) assert.throws(()=>heap.loopWrites(head,[state]),/Heap write audit:/);
  assert.throws(()=>heap.loopWrites(head,[entry]),/Heap write audit: .*loop head/);
  // Removing a known version is also a failure, rather than an empty interval.
  assert.throws(()=>heap.loopWrites(head,[{...head,num:new Map()}]),/Heap write audit:/);
});

test("a record named @elements cannot be confused with whole-array contents at a cutpoint", () => {
  const {unit,entry}=fresh();
  const made=heap.alloc(unit,entry,data.record([["@elements",{hasKey:"true",value:data.literal(0)}]]));
  const head=heap.loopHead(unit,made.state,[]);
  const after=heap.write(unit,head,made.value.ref,"@elements",data.literal(1));
  const frame=locations(heap,head,[after]);
  assert.deepEqual(frame,[loc(made.value.ref,"@elements","number","field")]);
  const next=heap.loopHead(unit,made.state,frame);
  assert.notEqual(next.num.get("@elements"),made.state.num.get("@elements"));
  assert.deepEqual(next.array,made.state.array);
  assert.deepEqual(locations(heap,next,[next]),[]);
});

// Each mutant changes only a private heap copy. The rejected state has the
// same content-version change a future writer could accidentally leave unlogged.
async function mutant(from,to,run,t) {
  const dir=await mkdtemp(join(tmpdir(),"heap-write-audit-"));
  try {
    let source=await readFile(new URL("../../verify/heap.mjs",import.meta.url),"utf8");
    assert.equal(source.split(from).length,2,`Mutation drift: ${from}`);
    source=source.replace(from,to);
    const sha256=createHash("sha256").update(source).digest("hex");
    source=source.replaceAll('"./error.mjs"',JSON.stringify(new URL("../../verify/error.mjs",import.meta.url).href))
      .replaceAll('"./data.mjs"',JSON.stringify(new URL("../../verify/data.mjs",import.meta.url).href));
    const path=join(dir,"heap.mjs"); await writeFile(path,source);
    const h=await import(pathToFileURL(path).href); await run(h);
    t.diagnostic(JSON.stringify({sha256,detected:true}));
  } finally { await rm(dir,{recursive:true,force:true}); }
}

test("private record writer-log omission is detected even for an already-written location", async (t) => {
  await mutant("return logged(next, [name]);","return next;",(h) => {
    const {unit,entry}=fresh(h), head=h.loopHead(unit,entry,[loc("a")]);
    const changed=h.write(unit,head,"a","x",data.literal(1));
    assert.throws(()=>h.loopWrites(head,[changed]),/Heap write audit: missing ownership for/);
    // It also cannot be laundered into a trusted baseline at the next cutpoint.
    assert.throws(()=>h.loopHead(unit,changed,[]),/Heap write audit: missing ownership for/);
  },t);
});

test("private summary writer-log omission is detected at the same audit boundary", async (t) => {
  await mutant('s[kind].set(k, name);\n      s = logged(s, [name]);','s[kind].set(k, name);',(h) => {
    const {unit,entry}=fresh(h), changed=h.havoc(unit,entry,[loc("a")],false).state;
    assert.throws(()=>h.loopWrites(entry,[changed]),/Heap write audit: missing ownership for/);
  },t);
});

test("private indexed writer-log omission fails for an existing fresh array", async (t) => {
  await mutant("return logged(s, [valueName, hasName]);","return s;",(h) => {
    const {unit,entry}=fresh(h), made=h.alloc(unit,entry,data.array([data.literal(0)]));
    const head=h.loopHead(unit,made.state,[]), changed=h.writeIndex(unit,head,made.value.ref,"#x00000000",data.literal(1));
    assert.throws(()=>h.loopWrites(head,[changed]),/Heap write audit: missing ownership for/);
  },t);
});

for(const arm of ["a","b"]) test(`private join-log omission of arm ${arm} fails for its concrete target`, async (t) => {
  await mutant("mergeOwnership(a, b)",`mergeOwnership(${arm === "a" ? "b, b" : "a, a"})`,(h) => {
    const {unit,entry:head}=fresh(h);
    const a=h.write(unit,head,"a","x",data.literal(1)), b=h.writeIndex(unit,head,"xs","#x00000000",data.literal(2));
    const joined=h.join(unit,"flag",a,b);
    assert.throws(()=>h.loopWrites(head,[joined]),/Heap write audit: missing ownership for/);
    assert.throws(()=>h.loopWrites(head,[],[joined]),/Heap write audit: missing ownership for/);
  },t);
});

test("private missing location data cannot construct a new content version", async (t) => {
  await mutant("locations: [{ ref, key, sort: value.sort }]","locations: []",(h) => {
    const {unit,entry}=fresh(h);
    assert.throws(()=>h.write(unit,entry,"a","x",data.literal(1)),/Heap write audit: .*location/);
  },t);
});

test("public straightline scenarios agree with independent native execution", async (t) => {
  for(const c of cases) await t.test(c.id,async () => {
    const report=await verify(c.source,{file:`heap-write-audit/${c.id}.js`});
    assert.ok(report.outcomes.length);
    for(const o of report.outcomes) {
      assert.equal(o.status,c.status??"verified",JSON.stringify(o));
      if(c.reason) { assert.equal(o.reason,c.reason); assert.equal(o.confirmed,true); }
    }
    const rows=nativeRows(c); assert.ok(rows.every((r)=>r.holds));
    t.diagnostic(JSON.stringify({id:c.id,outcomes:report.outcomes.map(({fn,status,reason,confirmed})=>({fn,status,reason,confirmed})),nativeSamples:rows.length}));
  });
});
