import assert from "node:assert/strict";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { verify } from "../../verify/index.mjs";
import { cases } from "./fixtures/mutating-loop-cases.mjs";
import { cases as pilots } from "./fixtures/mutating-loop-pilot-cases.mjs";

const check = (source) => verify(source, { file: "mutating-loop.ts", timeoutMs: 60_000 });
const brief = (o) => ({status:o.status, reason:o.reason, phase:o.phase, confirmed:o.confirmed, message:o.message});
function unproved(o) {
  assert.ok(o.status === "counterexample" && o.confirmed || o.status === "unknown" && ["induction-gap", "request-timeout"].includes(o.reason), JSON.stringify(o));
}

for (const c of cases) test(`K judgment ${c.id}`, async (t) => {
  const fn = Function(stripTypeScriptTypes(c.source, { mode: "strip" }) + "\nreturn f;")();
  const native = c.inputs.map((mk) => {
    const args = typeof mk === "function" ? mk() : structuredClone(mk);
    const before = structuredClone(args);
    return c.post(fn(...args), args, before);
  });
  if (c.expect === "reject") assert.ok(native.includes(false), "The negative control must really fail natively");
  if (c.expect === "verify") assert.ok(native.every(Boolean));
  const r = await check(c.source), o = r.outcomes.find((o) => o.fn === "f") ?? r.outcomes.at(-1);
  t.diagnostic(JSON.stringify({id:c.id, expect:c.expect, native, ...brief(o)}));
  if (c.expect === "verify") assert.ok(r.outcomes.every((o) => o.status === "verified"), JSON.stringify(r.outcomes));
  else if (c.expect === "unsupported") {
    assert.equal(o.status, "unsupported", JSON.stringify(o));
    assert.ok(o.span.end > o.span.start);
  } else if (c.expect === "no-false-verify") {
    assert.ok(native.every(Boolean));
    assert.ok(o.status === "verified" || o.status === "unknown", JSON.stringify(o));
  } else {
    unproved(o);
    if (/H0[123]-/.test(c.id)) { assert.equal(o.status, "counterexample"); assert.equal(o.confirmed, true); }
  }
});

for (const c of pilots) test(`K candidate ${c.name}`, async (t) => {
  const r = await check(c.source), o = r.outcomes.at(-1), expected = c.predicted.prototype;
  t.diagnostic(JSON.stringify({id:c.name, expect:expected, ...brief(o)}));
  if (expected === "verified") assert.ok(r.outcomes.every((o) => o.status === "verified"), JSON.stringify(r.outcomes));
  else if (expected.startsWith("unsupported")) {
    assert.equal(o.status, "unsupported", JSON.stringify(o));
    assert.ok(o.span.end > o.span.start);
  } else if (expected.startsWith("unknown")) {
    assert.equal(o.status, "unknown", JSON.stringify(o));
    assert.ok(["induction-gap", "request-timeout"].includes(o.reason));
  } else unproved(o);
});

const loop = (body, invariant = "true", test = "i < 1", update = "i++") => `// modifies a.x
// ensures true
function f(a:{x:number}, b:{x:number}) {
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // invariant ${invariant}
  // decreases real(1)-real(i)
  for(let i=0; ${test}; ${update}) { ${body} }
  return true;
}`;

for (const [name, source, diagnostic] of [
  ["dynamic exit target", loop("(i===0 ? a : b).x=1; return true;"), /chosen inside/],
  ["dynamic helper target", `// modifies a.x\n// ensures true\nfunction poke(a:{x:number}){a.x=1;return true;}\n` + loop("poke(i===0 ? a : b);"), /chosen inside/],
  ["body allocation", loop("const c={x:1};"), /allocate/],
  ["test allocation", loop("", "true", "([1]).length > 0"), /allocate/],
  ["update allocation", loop("", "true", "i < 1", "(i++, {x:1})"), /allocate/],
  ["length change", `// ensures true
function f(xs:number[]){let i=0;
// invariant i===0
// decreases real(1)
while(i===0){xs.push(2);break;}return true;}`, /length/],
  ["reference store", `// ensures true\nfunction f(a:{child:{x:number}},b:{x:number}){let i=0;
// invariant i===0
// decreases real(1)
while(i===0){a.child=b;break;}return true;}`, /Reference stores/],
  ["reference call in test", `// ensures result===a\nfunction identity(a:{x:number}){return a;}\n` + loop("", "true", "identity(a).x > 0"), /reference-returning/],
]) test(`K exclusion ${name}`, async () => {
  const o = (await check(source)).outcomes.at(-1);
  assert.equal(o.status, "unsupported", JSON.stringify(o));
  assert.match(o.message, diagnostic); assert.ok(o.span.end > o.span.start);
  assert.equal(o.fn,"f");
});

for (const restored of [false,true]) test(`K ${restored ? "restored" : "no-op"} stores still require permission`, async () => {
  const o = (await check(`// ensures true
function f(a:{x:number}){let i=0;
// invariant Number.isInteger(i) && 0 <= i && i <= 1
// decreases real(1)-real(i)
while(i<1){const oldX=a.x; ${restored ? "a.x=7;" : ""} a.x=oldX;i++;}return true;}`)).outcomes.at(-1);
  assert.equal(o.status,"counterexample",JSON.stringify(o)); assert.equal(o.confirmed,true); assert.equal(o.reason,"frame-write");
});

const helper = `// requires a.x===1
// modifies a.x
// ensures a.x===1 && result===true
function poke(a:{x:number}){a.x=1;return true;}
`;
test("K writing helper results cannot establish their own requires", async () => {
  const r=await check(helper+`// ensures true
function f(){const a={x:0};let i=0;
// invariant Number.isInteger(i) && 0 <= i && i <= 1 && a.x===0
// decreases real(1)-real(i)
while(i<1){poke(a);i++;}return true;}`);
  const o=r.outcomes.at(-1);
  assert.equal(o.status,"counterexample",JSON.stringify(o)); assert.equal(o.confirmed,true); assert.ok(o.failed.some((c)=>c.kind==="requires"),JSON.stringify(o));
});
test("K writing helper facts cannot establish invariant initialization", async () => {
  const r=await check(helper.replace("// requires a.x===1\n","")+`// ensures true
function f(){const a={x:0};let i=0;
// invariant Number.isInteger(i) && 0 <= i && i <= 1 && a.x===1
// decreases real(1)-real(i)
while(i<1){poke(a);i++;}return true;}`);
  const o=r.outcomes.at(-1);
  assert.equal(o.status,"unknown",JSON.stringify(o)); assert.equal(o.reason,"induction-gap"); assert.equal(o.phase,"invariant-init");
});
