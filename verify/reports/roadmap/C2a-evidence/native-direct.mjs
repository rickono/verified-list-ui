import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {getEventListeners} from 'node:events';
import {Script,createContext} from 'node:vm';
import {machineOf} from '../../../stateful/machine.mjs';
import {sha256} from '../../../stateful/ast.mjs';
const source=readFileSync('tests/verify/fixtures/stateful/protocols/listeners.ts','utf8');
const out=[];
for(const [variant,text] of [['original',source],['fresh-remover',source.replace('return () => events.removeEventListener("x", handler);','return () => events.removeEventListener("x", () => { if (!disposed) shown = value; });')]]) {
 const m=machineOf('native-direct.ts',text),events=new EventTarget(),context=createContext({events});
 const run=(code)=>new Script('"use strict";\n'+code).runInContext(context,{timeout:100});
 run(m.executable);
 const first=run('bind()'),second=run('bind()');
 const counts=[];
 const dispatch=()=>{const actual=getEventListeners(events,'x'); assert.ok(actual.every(cb=>typeof cb==='function'));counts.push(actual.length);events.dispatchEvent(new Event('x'));};
 dispatch();first();first();dispatch();second();dispatch();
 assert.deepEqual(counts,variant==='original'?[2,1,0]:[2,2,2]);
 out.push({variant,sourceSha256:sha256(text),executableSha256:m.executableSha256,counts,shown:run('shown'),callbacks:'native registrations contain the original closure instances; no wrappers or observer listeners'});
}
const events=new EventTarget(),order=[];
events.addEventListener('x',()=>{order.push('first');queueMicrotask(()=>order.push('microtask'));});
events.addEventListener('x',()=>order.push('second'));
events.dispatchEvent(new Event('x'));await Promise.resolve();
assert.deepEqual(order,['first','second','microtask']);
writeFileSync(process.argv[2],JSON.stringify({node:process.version,comparisons:out,microtaskOrder:order},null,2)+'\n');
