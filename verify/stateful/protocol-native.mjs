import { Script, createContext, runInContext } from "node:vm";
import { expression } from "./native.mjs";
import { replaySchemaSha256, isHandle } from "./protocol-values.mjs";
import { encodeValue, decodeValue } from "./values.mjs";

const nativeAdd = EventTarget.prototype.addEventListener, nativeRemove = EventTarget.prototype.removeEventListener;

class Illegal extends Error {}
const illegal = (s) => { throw new Illegal(s); };
const keys = (v, list) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === list.length && list.every((k) => Object.hasOwn(v, k));
const decimal = (s) => typeof s === "string" && /^[1-9][0-9]*$/.test(s);
const wireSort = (s) => ({ EventTarget: "target", AbortController: "controller", AbortSignal: "signal" })[s];

// Native Node APIs retain their actual implementations and receive the real
// application closures. Rehome every exposed function's prototype into the
// code-generation-disabled realm, including accessors and symbol methods. No
// host callback or host Function constructor is exposed to application code.
function installNative(context) {
  EventTarget.prototype.addEventListener = nativeAdd;
  EventTarget.prototype.removeEventListener = nativeRemove;
  const realm = runInContext("({object:Object.prototype, fn:Function.prototype})", context);
  const seen = new Set();
  const harden = (fn) => {
    if (typeof fn !== "function" || seen.has(fn)) return;
    seen.add(fn); Object.setPrototypeOf(fn, realm.fn);
    for (const d of Reflect.ownKeys(fn).map((k) => Object.getOwnPropertyDescriptor(fn,k))) {
      if (typeof d.value === "function") harden(d.value);
      harden(d.get); harden(d.set);
    }
  };
  for (const klass of [EventTarget, Event, AbortController, AbortSignal]) {
    harden(klass);
    for (const d of Reflect.ownKeys(klass.prototype).map((k) => Object.getOwnPropertyDescriptor(klass.prototype,k))) {
      harden(d.value); harden(d.get); harden(d.set);
    }
  }
  Object.setPrototypeOf(AbortSignal, EventTarget);
  Object.setPrototypeOf(EventTarget.prototype, realm.object);
  Object.setPrototypeOf(Event.prototype, realm.object);
  Object.setPrototypeOf(AbortController.prototype, realm.object);
  Object.assign(context, { EventTarget, Event, AbortController, AbortSignal });
}

export function executeProtocolNative(machine, envelope, timeoutMs) {
  const steps = [];
  try {
    if (process.versions.node !== "22.23.1") return { status: "unknown", reason: "replay-runtime", message: "Pinned protocol requires Node v22.23.1." };
    const rootKeys = ["version", "sourceSha256", "executableSha256", "assumptionsSha256", "protocolSha256", "replaySchemaSha256", "inputs", "targets", "actions", ...(envelope?.steps ? ["steps"] : [])];
    if (!keys(envelope, rootKeys)) illegal("Invalid trace envelope shape.");
    for (const [key, value] of Object.entries({ version: 2, sourceSha256: machine.sourceSha256, executableSha256: machine.executableSha256, assumptionsSha256: machine.assumptions.sha256, protocolSha256: machine.protocol.sha256, replaySchemaSha256 })) if (envelope[key] !== value) illegal(`Trace ${key} mismatch.`);
    if (!Array.isArray(envelope.inputs) || !Array.isArray(envelope.actions) || !keys(envelope.targets, [...machine.targets.keys()])) illegal("Invalid input graph, targets or actions.");
    const context = createContext(Object.create(null), { microtaskMode: "afterEvaluate", codeGeneration: { strings: false, wasm: false } });
    installNative(context);
    const run = (code, filename = "protocol-replay-harness") => new Script(`"use strict";\n${code}`, { filename }).runInContext(context, { timeout: timeoutMs });
    const post = new Map([...machine.cells.keys()].map((n) => [n, `$post.${n}`]));
    const pre = new Map([...machine.cells.keys()].map((n) => [n, `$pre.${n}`]));
    const tests = [...machine.state, ...machine.always].map((c) => `if (${c.kind === "always" ? "$pre && " : ""}!( ${expression(machine, c.ast, post, pre)} )) return ${JSON.stringify({ kind: c.kind, text: c.text, span: c.span })};`).join("\n");
    run(`const $handles=new Map(), $reverse=new Map(), $requests=[], $invocations=[], $faults=[], $registrations=[], $cuts=[], $rejection=Object.freeze({environmentRejection:true});
      const $NativeAbortController=AbortController, $Promise=Promise, $String=String, $Error=Error;
      const $ArrayBuffer=ArrayBuffer, $DataView=DataView, $parseInt=parseInt;
      const $number=hex=>{const bytes=new $ArrayBuffer(8), view=new $DataView(bytes);for(let i=0;i<8;i++)view.setUint8(i,$parseInt(hex.slice(2*i,2*i+2),16));return view.getFloat64(0,false);};
      let $returned, $args, $value, $firstViolation, $cutPre, $dispatching=false, $dispatchCount=0, $registrationSequence=0, $invocationSequence=0, $activeInvocation;
      const $nativeAdd=EventTarget.prototype.addEventListener, $nativeRemove=EventTarget.prototype.removeEventListener, $nativeDispatch=EventTarget.prototype.dispatchEvent;
      const $signalGet=Object.getOwnPropertyDescriptor(AbortController.prototype,'signal').get;
      const $abortedGet=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
      const $read=()=>({${[...machine.cells.keys()].join(",")}});
      const $check=($pre,$post)=>{${tests}};
      const $observe=(kind, registration)=>{const state=$read(); $firstViolation ??= $check($cutPre,state); $cuts.push({kind,registration,invocation:kind==='handler'?++$invocationSequence:null,state}); $cutPre=state;};
      const $put=(id,sort,value)=>{if($handles.has(id)||$reverse.has(value)) throw new $Error('Duplicate handle identity'); $handles.set(id,{sort,value});$reverse.set(value,id);};
      const $fault=e=>{if(e!==$rejection)$faults.push($String(e?.message??e));};
      EventTarget.prototype.addEventListener=function(type,callback){
        if ($dispatching) throw new $Error('Registration mutation during synchronous delivery');
        $nativeAdd.call(this,type,callback);
        if($registrations.some(r=>r.live&&r.target===this&&r.type===type&&r.callback===callback))return;
        const r={id:++$registrationSequence,target:this,type,callback,live:true,observer:undefined};
        r.observer=()=>{if(!$dispatching) throw new $Error('Illegal native delivery'); ++$dispatchCount; $observe('handler',r.id);};
        $registrations.push(r);$nativeAdd.call(this,type,r.observer);
      };
      EventTarget.prototype.removeEventListener=function(type,callback){
        if ($dispatching) throw new $Error('Registration mutation during synchronous delivery');
        $nativeRemove.call(this,type,callback);
        const r=$registrations.find(r=>r.live&&r.target===this&&r.type===type&&r.callback===callback);
        if(r){r.live=false;$nativeRemove.call(this,type,r.observer);}
      };`);
    const registry = new Map(), ownership = new Map();
    const register = (id, sort) => { if (!decimal(id) || registry.has(id)) illegal("Duplicate or malformed handle identity."); registry.set(id, sort); };
    for (const input of envelope.inputs) {
      if (!keys(input, ["id", "signal", "aborted"]) || !decimal(input.id) || !decimal(input.signal) || typeof input.aborted !== "boolean") illegal("Invalid controller/signal input ownership graph.");
      register(input.id, "controller"); register(input.signal, "signal"); ownership.set(input.signal, input.id);
      run(`{const c=new $NativeAbortController();$put(${JSON.stringify(input.id)},'controller',c);$put(${JSON.stringify(input.signal)},'signal',$signalGet.call(c));${input.aborted ? "c.abort();" : ""}}`);
    }
    for (const [name, id] of Object.entries(envelope.targets)) {
      if (!decimal(id)) illegal("Invalid ambient target identity.");
      if (registry.has(id) && registry.get(id) !== "target") illegal("Signal-as-target overlap is excluded.");
      if (!registry.has(id)) { register(id, "target"); run(`$put(${JSON.stringify(id)},'target',new EventTarget());`); }
      run(`const ${name}=$handles.get(${JSON.stringify(id)}).value;`);
    }
    const handle = (value, expected) => {
      if (!isHandle(value) || value.sort !== expected || registry.get(value.id) !== expected) illegal("Fabricated handle or incompatible handle sort.");
      return `$handles.get(${JSON.stringify(value.id)}).value`;
    };
    const scalar = (value, expected) => {
      let decoded; try { decoded = decodeValue(value); } catch { illegal("Invalid scalar encoding."); }
      if (typeof decoded !== expected) illegal("Invalid scalar domain.");
      // Decode all 64 bits inside the realm, including NaN payloads. Host
      // objects and host arrays never cross into application code.
      return expected === "boolean" ? String(decoded) : `$number(${JSON.stringify(value.bits)})`;
    };
    const value = (wire, type) => wireSort(type) ? handle(wire, wireSort(type)) : scalar(wire, type);
    for (const op of machine.environment.values()) run(`const ${op.name}=(...args)=>{
      if(args.length!==${op.params.length}||![${op.params.map((p, i) => wireSort(p.type) ? `$reverse.has(args[${i}])&&$handles.get($reverse.get(args[${i}])).sort===${JSON.stringify(wireSort(p.type))}` : `typeof args[${i}]===${JSON.stringify(p.type)}`).join(",")}].every(Boolean)) throw new $Error('Environment request argument domain violation');
      return new $Promise((resolve,reject)=>$requests.push({seq:$requests.length+1,op:${JSON.stringify(op.name)},args,resolve,reject,settled:false,invocation:$activeInvocation}));};`);
    run(`let $nextInternal=1000000000n;
      const $auto=(sort,value)=>{while($handles.has($String($nextInternal)))++$nextInternal;const id=$String($nextInternal++);$put(id,sort,value);return id;};
      globalThis.AbortController=function(){const c=new $NativeAbortController();$auto('controller',c);$auto('signal',$signalGet.call(c));return c;};
      AbortController.prototype=$NativeAbortController.prototype;`);
    run(machine.executable, machine.file);
    const encodedState = (s) => Object.fromEntries([...machine.cells.keys()].map((name) => [name, encodeValue(s[name])]));
    run("$cutPre=$read();$firstViolation=$check(undefined,$cutPre);");
    steps.push({ step: 0, action: { kind: "init" }, state: encodedState(run("$read()")) });
    const settle = (a) => {
      const request = run(`$requests[${a.request - 1}]`);
      if (!Number.isSafeInteger(a.request) || a.request < 1 || !request || request.settled || request.op !== a.op) illegal("Request identity is not pending or operation differs.");
      const op = machine.environment.get(a.op);
      if (a.kind === "reject") {
        if (!op.rejects) illegal("Unmarked rejection is forbidden.");
        return `$requests[${a.request - 1}].settled=true;$requests[${a.request - 1}].reject($rejection);`;
      }
      const source = scalar(a.value, op.result);
      const names = new Map([["result", "$value"], ...op.params.map((p, i) => [p.name, `$requests[${a.request - 1}].args[${i}]`])]);
      run(`$value=${source};`);
      for (const c of op.resolves) if (run(`(${expression(machine, c.ast, names)})`) !== true) illegal("Resolution violates resolves assumption.");
      return `$requests[${a.request - 1}].settled=true;$requests[${a.request - 1}].resolve($value);`;
    };
    const syncHandles = () => {
      for (const h of run("[...$handles].map(([id,{sort,value}])=>({id,sort,owner:sort==='signal'?[...$handles].find(([,x])=>x.sort==='controller'&&$signalGet.call(x.value)===value)?.[0]:undefined}))")) {
        if (!registry.has(h.id)) registry.set(h.id,h.sort);
        if (h.owner) ownership.set(h.id,h.owner);
      }
    };
    for (const a of envelope.actions) {
      const start = run("$cuts.length");
      if (a?.kind === "call") {
        if (!keys(a, ["kind", "entry", "args", ...(Object.hasOwn(a, "returns") ? ["returns"] : [])]) || !Array.isArray(a.args)) illegal("Invalid call action shape.");
        const entry = machine.entries.find((e) => e.name === a.entry);
        if (!entry || a.args.length !== entry.params.length) illegal("Invalid entry or arity.");
        const args = a.args.map((v, i) => value(v, entry.params[i].type));
        run(`{const inv={id:++$invocationSequence,entry:${JSON.stringify(entry.name)},phase:'running'};$invocations.push(inv);$activeInvocation=inv.id;
          try{$returned=${entry.name}(${args.join(",")});if($returned instanceof $Promise){inv.phase='awaiting';$returned.then(()=>{inv.phase='completed';},e=>{inv.phase='rejected';$fault(e);});}else inv.phase='completed';}catch(e){inv.phase='faulted';$fault(e);}finally{$activeInvocation=undefined;}}`);
        syncHandles();
        if (Object.hasOwn(a, "returns")) {
          if (!decimal(a.returns)) illegal("Invalid returned handle identity.");
          const kind = [...entry.actions.values()].find((v) => v.kind === "return-remover" || v.kind === "return-handle");
          if (!kind) illegal("Entry has no admitted handle return.");
          const sort = kind.kind === "return-remover" ? "remover" : wireSort(entry.bindings.get(kind.value.name)?.type ?? "AbortSignal");
          if (sort === "remover") {
            if (run("typeof $returned") !== "function") illegal("Entry did not return a callable remover on this path.");
          } else if (!run(`$reverse.has($returned) && $handles.get($reverse.get($returned)).sort === ${JSON.stringify(sort)}`)) {
            illegal("Entry did not return an owned handle of the declared sort.");
          }
          const existing = run("$reverse.get($returned)");
          if (existing !== undefined) { if (existing !== a.returns) illegal("Returned alias must retain its identity."); }
          else { register(a.returns, sort); run(`$put(${JSON.stringify(a.returns)},${JSON.stringify(sort)},$returned);`); }
        }
        run("$observe('action',null);");
      } else if (a?.kind === "invoke") {
        if (!keys(a, ["kind", "handle"])) illegal("Invalid invoke action.");
        const fn = handle(a.handle, "remover"); run(`try{${fn}();}catch(e){$fault(e);}$observe('action',null);`);
      } else if (a?.kind === "allocate") {
        if (!keys(a, ["kind", "controller", "signal"])) illegal("Invalid allocation action.");
        register(a.controller, "controller"); register(a.signal, "signal"); ownership.set(a.signal, a.controller);
        run(`{const c=new $NativeAbortController();$put(${JSON.stringify(a.controller)},'controller',c);$put(${JSON.stringify(a.signal)},'signal',$signalGet.call(c));}$observe('action',null);`);
      } else if (a?.kind === "abort") {
        if (!keys(a, ["kind", "controller"])) illegal("Invalid abort action.");
        run(`${handle(a.controller, "controller")}.abort();$observe('action',null);`);
      } else if (a?.kind === "dispatch") {
        if (!keys(a, ["kind", "target", "event"]) || typeof a.event !== "string") illegal("Invalid dispatch action.");
        const target = handle(a.target, "target");
        run(`if($dispatching)throw new $Error('Reentrant dispatch');$dispatching=true;$dispatchCount=0;
          $nativeDispatch.call(${target},new Event(${JSON.stringify(a.event)}));$dispatching=false;
          if(!$dispatchCount)$observe('empty-dispatch',null);`);
      } else if (["resolve", "reject", "settle-abort"].includes(a?.kind)) {
        if (!keys(a, ["kind", "request", "op", ...(a.kind !== "reject" ? ["value"] : []), ...(a.kind === "settle-abort" ? ["controller"] : [])])) illegal("Invalid settlement action shape.");
        const code = settle(a);
        const abort = a.kind === "settle-abort" ? `${handle(a.controller, "controller")}.abort();` : "";
        run(code + abort); // one real producer turn: selected outcome, abort, then continuation
        run("$observe('action',null);");
      } else illegal("Unknown protocol action.");
      run("void 0;"); // explicit timed afterEvaluate microtask drain
      const cuts = run(`$cuts.slice(${start})`);
      steps.push({ step: steps.length, action: a, state: encodedState(run("$read()")), cuts: cuts.map((c) => ({ ...c, state: encodedState(c.state) })) });
    }
    const faults = run("$faults.slice()");
    const requests = run("$requests.map(({seq,op,args,settled,invocation})=>({seq,op,invocation,args:args.map(x=>$reverse.has(x)?{type:'handle',sort:$handles.get($reverse.get(x)).sort,id:$reverse.get(x)}:x),settled}))").map((r) => ({ ...r, args: [...r.args].map((x) => isHandle(x) ? { ...x } : encodeValue(x)) }));
    const signals = [...ownership].map(([signal, owner]) => ({ signal, owner, aborted: run(`$abortedGet.call($handles.get(${JSON.stringify(signal)}).value)`) }));
    if (envelope.steps && JSON.stringify(envelope.steps) !== JSON.stringify(steps)) illegal("Trace observations differ from native source replay.");
    const trace = { ...envelope, steps };
    if (faults.length) return { status: "unknown", reason: "replay-runtime", faults, trace, requests };
    const violation = run("$firstViolation");
    return { status: "ok", trace, requests, signals, invocations: run("$invocations.map(i=>({...i}))"), registrations: run("$registrations.map(r=>({id:r.id,live:r.live}))"), ...(violation ? { violation: { ...violation } } : {}) };
  } catch (e) {
    if (e instanceof Illegal) return { status: "illegal-environment-action", reason: "invalid-trace", message: e.message };
    return { status: "unknown", reason: e.code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ? "replay-timeout" : "replay-runtime", message: e.message };
  }
}
