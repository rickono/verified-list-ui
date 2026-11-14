import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { machineOf } from "../../verify/stateful/machine.mjs";
import { transitionsOf } from "../../verify/stateful/transitions.mjs";
import { validateProtocolUnits } from "../../verify/stateful/protocol-rules.mjs";
import { solve } from "../../verify/proofs.mjs";
import { compileAstUnit } from "../../verify/source.mjs";
import { checkStateful } from "../../verify/stateful/index.mjs";
import { replayTrace, traceOf, decodeValue, encodeValue } from "../../verify/stateful/traces.mjs";
import { handleValue as h } from "../../verify/stateful/protocol-values.mjs";

const read = (name) => readFileSync(new URL(`./fixtures/stateful/protocols/${name}.ts`, import.meta.url), "utf8");
const listener = read("listeners"), advisory = read("advisory");
const inputs = [{ id: "10", signal: "11", aborted: false }, { id: "20", signal: "21", aborted: false }];
const call = (entry, args = [], extra = {}) => ({ kind: "call", entry, args, ...extra });
const dispatch = { kind: "dispatch", target: h("target", "1"), event: "x" };
const cleanup = (id) => ({ kind: "invoke", handle: h("remover", id) });
const resolve = { kind: "resolve", request: 1, op: "lookup", value: 1 };
const search = call("search", [0, h("signal", "11")]);
const dispose = call("dispose", [h("controller", "10")]);
const replay = (source, actions, graph = inputs) => { const m = machineOf("fixture.ts", source); return replayTrace(m.file, source, traceOf(m, actions, { inputs: graph })); };
const shown = (r) => decodeValue(r.trace.steps.at(-1).state.shown);

test("both corrected complete verticals prove over full domains with no witness search", async () => {
  for (const source of [listener, advisory]) {
    const result = await checkStateful("fixture.ts", source, { maxDepth: 0 });
    assert.equal(result.status, "verified", JSON.stringify(result));
    assert.equal(result.assumptions.eventBound, null); assert.equal(result.searched, undefined);
    assert.ok(result.units.every((u) => u.status === "verified"));
    assert.ok(result.units.some((u) => u.unit.includes("occurrence-index")));
    assert.ok(result.units.some((u) => u.unit.includes("index-occurrence")));
    const proof = transitionsOf(machineOf("fixture.ts", source));
    assert.doesNotMatch(JSON.stringify(proof.units.map((u) => u.target)), /maxDepth|activationCount|eventBound|poolSize/);
  }
});

test("two closure evaluations, duplicate no-op, alias removal and repeated cleanup give native 2/1/0", async () => {
  const source = listener.replace('return () => events.removeEventListener("x", handler);', 'const alias = handler; return () => events.removeEventListener("x", alias);');
  assert.equal((await checkStateful("alias.ts", source, { maxDepth: 0 })).status, "verified");
  const actions = [call("bind", [], { returns: "100" }), call("bind", [], { returns: "101" }), dispatch, cleanup("100"), cleanup("100"), dispatch, cleanup("101"), dispatch];
  const result = await replay(source, actions, []);
  assert.equal(result.status, "ok", JSON.stringify(result)); assert.equal(result.violation, undefined);
  assert.deepEqual(result.trace.steps.filter((s) => s.action.kind === "dispatch").map((s) => s.cuts.filter((c) => c.kind === "handler").length), [2, 1, 0]);
  assert.deepEqual(result.registrations, [{ id: 1, live: false }, { id: 2, live: false }]);
  const again = await replayTrace("fixture.ts", source, result.trace); assert.deepEqual(again, result);
  const many = await replay(listener, [...Array.from({ length: 24 }, () => call("bind")), dispatch], []);
  assert.equal(many.status, "ok"); assert.equal(many.trace.steps.at(-1).cuts.length, 24);
});

test("fresh same-body removal retains the listener, while its existing safety property still proves", async () => {
  const source = listener.replace('return () => events.removeEventListener("x", handler);', 'return () => events.removeEventListener("x", () => { if (!disposed) shown = value; });');
  const proof = await checkStateful("fresh.ts", source, { maxDepth: 0 }); assert.equal(proof.status, "verified", JSON.stringify(proof));
  const r = await replay(source, [call("bind", [], { returns: "100" }), cleanup("100"), dispatch], []);
  assert.equal(r.status, "ok"); assert.equal(r.violation, undefined); assert.deepEqual(r.registrations, [{ id: 1, live: true }]);
  assert.equal(r.trace.steps.at(-1).cuts.length, 1);
});

test("both real guard removals produce legally confirmed native property failures", async () => {
  for (const source of [listener.replace("if (!disposed) shown", "shown"), advisory.replace("  if (disposed || signal.aborted) return;\n", "")]) {
    const r = await checkStateful("unguarded.ts", source, { timeoutMs: 30000, maxDepth: 3 });
    assert.equal(r.status, "counterexample", JSON.stringify(r)); assert.equal(r.violated.kind, "always");
    const confirmed = await replayTrace("unguarded.ts", source, r.trace); assert.equal(confirmed.status, "ok"); assert.ok(confirmed.violation);
  }
  const onlySignal = advisory.replace("disposed || signal.aborted", "disposed");
  assert.equal((await checkStateful("only-disposed.ts", onlySignal, { maxDepth: 0 })).status, "verified");
});

test("per-handler non-transitive relation observes 0/1/2 with no dispatch endpoint theorem", async () => {
  const weak = `// @environment\n// protocol node22-event-target-v1\ndeclare const events: EventTarget;
let x=0;
// state 0 <= x && x <= 2
// always x - old(x) <= 1
export function bind() { const handler=()=>{if(x<2)x=x+1;}; events.addEventListener("x",handler); }
export function noop() {}`;
  const gap = await checkStateful("weak-cuts.ts", weak, { maxDepth: 0 });
  assert.equal(gap.status, "unknown"); assert.equal(gap.reason, "induction-gap");
  const source = weak.replace("// state 0 <= x && x <= 2", "// state 0 <= x && x <= 2\n// state x === 0 || x === 1 || x === 2");
  const report = await checkStateful("cuts.ts", source, { maxDepth: 0 }); assert.equal(report.status, "verified", JSON.stringify(report));
  const r = await replay(source, [call("bind"), call("bind"), dispatch], []);
  assert.equal(r.status, "ok"); assert.equal(r.violation, undefined);
  assert.deepEqual(r.trace.steps.at(-1).cuts.map((c) => decodeValue(c.state.x)), [1, 2]);
  const c1 = `let x=0;\n// state 0 <= x && x <= 2\n// always x-old(x)<=1\nexport function entry(){if(x<2)x=x+1;if(x<2)x=x+1;}`;
  assert.equal((await checkStateful("c1.ts", c1)).status, "counterexample");
});

test("advisory late responses, same/different controllers, already-aborted and settled-not-resumed", async () => {
  for (const controller of ["10", "20"]) {
    const r = await replay(advisory, [search, call("dispose", [h("controller", controller)]), resolve]);
    assert.equal(r.status, "ok", JSON.stringify(r)); assert.equal(r.violation, undefined); assert.equal(shown(r), 0); assert.equal(r.requests[0].settled, true);
    assert.equal(r.signals.find((s) => s.owner === controller).aborted, true);
  }
  const already = await replay(advisory, [search, resolve], [{ id: "10", signal: "11", aborted: true }]);
  assert.equal(already.status, "ok"); assert.equal(shown(already), 0);
  const selected = await replay(advisory, [search, { ...resolve, kind: "settle-abort", controller: h("controller", "10") }]);
  assert.equal(selected.status, "ok", JSON.stringify(selected)); assert.equal(shown(selected), 0); assert.equal(selected.requests[0].settled, true);
  const completed = await replay(advisory, [search, resolve, { kind: "abort", controller: h("controller", "10") }]);
  assert.equal(completed.status, "ok"); assert.equal(shown(completed), 1); assert.equal(completed.signals[0].aborted, true);
  const rejected = await replay(advisory, [search, { kind: "reject", request: 1, op: "lookup" }]); assert.equal(rejected.status, "ok");
});

test("input aliases are compatible; native allocations are fresh, own stable signal aliases", async () => {
  const source = advisory.replace("export function dispose", "export function allocate() { const c = new AbortController(); return c; }\nexport function dispose");
  assert.equal((await checkStateful("constructors.ts", source, { maxDepth: 0 })).status, "verified");
  const r = await replay(source, [call("allocate", [], { returns: "1000000000" }), call("allocate", [], { returns: "1000000002" }), search, search, resolve, { ...resolve, request: 2 }]);
  assert.equal(r.status, "ok", JSON.stringify(r));
  assert.equal(new Set(r.signals.map((s) => s.signal)).size, 4); assert.equal(new Set(r.signals.map((s) => s.owner)).size, 4);
  const alias = advisory.replace("const value = await lookup(q, signal);", "const s = signal;\n  const value = await lookup(q, s);").replace("signal.aborted", "s.aborted");
  assert.equal((await checkStateful("signal-alias.ts", alias, { maxDepth: 0 })).status, "verified");
  const a = await replay(alias, [search, dispose, resolve]); assert.equal(a.status, "ok"); assert.equal(shown(a), 0);
});

test("private deletion of keeps or either index direction fails structural completeness", () => {
  const m = machineOf("fixture.ts", listener), t = transitionsOf(m);
  for (const pattern of [/keeps/, /occurrence-index/, /index-occurrence/]) {
    assert.throws(() => validateProtocolUnits(t.units.filter((u) => !pattern.test(u.name)), m), /Incomplete protocol induction/);
  }
});

test("grammar reserves all new/future words and rejects Unicode, case, typo, blocks and punctuation at original spans", async () => {
  for (const word of ["Protocol", "protcol", "protоcol", "protocоl", "prоtоcоl", "pro\u200btocol", "protocol:", "protocol(false)", "Event", "delivers", "count", "counts", "unique", "uniqueness", "leads", "fairness", "rank", "enabledness", "until", "temporal"]) {
    const source = listener.replace("// protocol node22-event-target-v1", `// ${word} node22-event-target-v1`);
    const r = await checkStateful("grammar.ts", source); assert.equal(r.status, "unsupported", word); assert.equal(r.span.start, source.indexOf("//", source.indexOf("//") + 1));
  }
  for (const replacement of ["/* protocol node22-event-target-v1 */", "// protocol event-emitter"]) assert.equal((await checkStateful("bad.ts", listener.replace("// protocol node22-event-target-v1", replacement))).status, "unsupported");
  for (const word of ["abort rejects signal", "Abort advisory signal", "abort advisory", "abort advisory unknown", "abort advisory signal!"]) assert.equal((await checkStateful("bad.ts", advisory.replace("abort advisory signal", word))).status, "unsupported");
});

test("unsupported listener syntax/effects fail closed, including H helpers and payload assumptions", async () => {
  const cases = [
    listener.replace('"x", handler)', '"x", handler, {once:true})'), listener.replace('const value: number', 'let value: number'),
    listener.replace('const handler = ()', 'const handler = async ()'), listener.replace('const handler = ()', 'const handler = (event)'),
    listener.replace('if (!disposed) shown = value;', 'events.removeEventListener("x",handler);'), listener.replace('if (!disposed) shown = value;', 'events.dispatchEvent(new Event("x"));'),
    listener.replace('const value: number = 1;', 'const value: number = 1; const f = (x:number):boolean => x>0;'),
    listener.replace('return () => events.removeEventListener("x", handler);', 'return () => { events.removeEventListener("x",handler); };'),
    'import x from "foo";\n'+listener, listener.replace('if (!disposed) shown = value;', 'shown = helper(value);'),
    advisory.replace('resolves result === 1', 'resolves signal.aborted || result === 1'),
    listener.replace('const value: number = 1;', 'const value: number = 1; const AbortController = 1;'),
  ];
  for (const source of cases) { const r = await checkStateful("rejected.ts", source); assert.equal(r.status, "unsupported", JSON.stringify(r)); assert.ok(r.span.end > r.span.start); }
});

test("hashes, domain, suffix, identity, ownership and duplicate settlements are checked independently", async () => {
  const m = machineOf("fixture.ts", advisory), valid = traceOf(m, [search, dispose, resolve], { inputs });
  for (const hash of ["sourceSha256", "executableSha256", "assumptionsSha256", "protocolSha256", "replaySchemaSha256"]) assert.equal((await replayTrace(m.file, advisory, { ...valid, [hash]: "0".repeat(64) })).status, "illegal-environment-action");
  const bad = [
    [search, resolve, resolve], [search, { ...resolve, value: true }], [search, { ...resolve, value: NaN }],
    [call("search", [0, h("signal", "99")])], [call("dispose", [h("signal", "11")])],
    [cleanup("100")], [{ kind: "allocate", controller: "10", signal: "99" }],
    [search, { ...resolve, op: "other" }], [search, { ...resolve, extra: true }],
  ];
  for (const actions of bad) assert.equal((await replay(advisory, actions)).status, "illegal-environment-action", JSON.stringify(actions));
  const unguarded = advisory.replace("  if (disposed || signal.aborted) return;\n", "");
  assert.equal((await replay(unguarded, [search, dispose, resolve, resolve])).status, "illegal-environment-action");
  assert.equal((await replay(advisory.replace("// rejects\n", ""), [search, { kind: "reject", op: "lookup", request: 1 }])).status, "illegal-environment-action");
  const ownership = [{ id: "10", signal: "11", aborted: false }, { id: "20", signal: "11", aborted: false }];
  assert.equal((await replay(advisory, [], ownership)).status, "illegal-environment-action");
  const r = await replay(advisory, [search, resolve]); r.trace.steps.at(-1).state.shown = encodeValue(2);
  assert.equal((await replayTrace("fixture.ts", advisory, r.trace)).status, "illegal-environment-action");
});

test("protocol native timeout is contained, strict, and workers are reaped", async () => {
  const looping = listener.replace("if (!disposed) shown = value;", "while (true) {}");
  const r = await replay(looping, [call("bind"), dispatch], []);
  assert.equal(r.status, "unknown"); assert.equal(r.reason, "replay-timeout");
  const strict = listener.replace('export function dispose() { disposed = true; }', 'export function dispose() { if (this !== undefined || typeof process !== "undefined") shown=1; }');
  const s = await replay(strict, [call("dispose")], []); assert.equal(s.status, "ok"); assert.equal(shown(s), 0);
  const uncertain = await checkStateful("budget.ts", listener, { timeoutMs: 1, maxDepth: 0 }); assert.equal(uncertain.status, "unknown"); assert.equal(uncertain.reason, "solver");
});

test("protocol writes/allocation and projected reads never acquire pure effects after scalar lowering", () => {
  const source = `let x=0;\n// state true\nexport function abort(controller:AbortController){controller.abort();}\nexport function alloc(){const controller=new AbortController();}`;
  const t = transitionsOf(machineOf("effects.ts",source));
  assert.equal(t.units.find((u)=>u.name==='abort$0').target.effects.kind,'writes');
  assert.equal(t.units.find((u)=>u.name==='alloc$0').target.effects.kind,'heap');
  assert.ok(t.units.find((u)=>u.name==='abort$0').protocolActions.some((a)=>a.kind==='abort'));
});


test("correspondence VCs reject private missing absence and inverse-preservation premises", async () => {
  const m = machineOf("fixture.ts",listener), t = transitionsOf(m);
  const targets = [
    ["$registry$create$occurrence-index", (cs) => cs.slice(1)],
    ["$registry$create$index-occurrence", (cs) => cs.slice(0,-1)],
    ["$registry$remove$index-occurrence", (cs) => cs.filter((_,i) => i !== 1)],
  ].map(([name,remove]) => {
    const u = t.units.find((u)=>u.name===name), at = u.span;
    const fn = {type:"FunctionDeclaration",id:{type:"Identifier",name:"$private",...at},params:[],async:false,generator:false,...at,
      body:{type:"BlockStatement",...at,body:[{type:"ReturnStatement",argument:{type:"Identifier",name:"undefined",...at},...at}]}};
    return compileAstUnit(m,{...u,name:"$private",fn,top:fn,requires:remove(u.requires)});
  });
  const results=await solve(targets,30000);
  assert.deepEqual(results.map((r)=>r.status),targets.map(()=>"counterexample"));
});

test("protocol scalar transport retains all input bits, including noncanonical NaN payloads", async () => {
  const source=advisory.replace('// resolves result === 1\n',''),m=machineOf('bits.ts',source);
  for(const bits of ['7ff8000000000042','fff8000000000037','8000000000000000','7ff0000000000000','fff0000000000000','0000000000000001']) {
    const trace=traceOf(m,[search,resolve],{inputs});trace.actions[1].value.bits=bits;
    const r=await replayTrace(m.file,source,trace);assert.equal(r.status,'ok',JSON.stringify(r));
    assert.equal(r.trace.steps.at(-1).state.shown.bits,bits);
  }
});

test("returned handle admission checks the actual path's callability and owned sort", async () => {
  const source=listener.replace('export function bind() {','export function bind(skip: boolean) {\n  if (skip) return;').replace('shown = value','shown = 1');
  assert.equal((await checkStateful('returns.ts',source,{maxDepth:0})).status,'verified');
  const bad=await replay(source,[call('bind',[true],{returns:'100'})],[]);
  assert.equal(bad.status,'illegal-environment-action');assert.match(bad.message,/callable/);
  const good=await replay(source,[call('bind',[false],{returns:'100'}),cleanup('100'),dispatch],[]);
  assert.equal(good.status,'ok');assert.equal(good.registrations[0].live,false);
});
