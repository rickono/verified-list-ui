import {readFileSync,writeFileSync} from 'node:fs';
import {machineOf} from '../../../stateful/machine.mjs';
import {traceOf,replayTrace} from '../../../stateful/traces.mjs';
import {handleValue as h} from '../../../stateful/protocol-values.mjs';
const out=[];
for(const name of ['listeners','advisory']) {
 const file='tests/verify/fixtures/stateful/protocols/'+name+'.ts',source=readFileSync(file,'utf8'),m=machineOf(file,source);
 const actions=name==='listeners'?[
 {kind:'call',entry:'bind',args:[],returns:'100'}, {kind:'call',entry:'bind',args:[],returns:'101'}, {kind:'dispatch',target:h('target','1'),event:'x'},
 {kind:'invoke',handle:h('remover','100')},{kind:'invoke',handle:h('remover','100')},{kind:'dispatch',target:h('target','1'),event:'x'},
 {kind:'invoke',handle:h('remover','101')},{kind:'dispatch',target:h('target','1'),event:'x'}]:[
 {kind:'call',entry:'search',args:[0,h('signal','11')]},{kind:'call',entry:'dispose',args:[h('controller','10')]},{kind:'resolve',request:1,op:'lookup',value:1}];
 const trace=traceOf(m,actions,{inputs:name==='advisory'?[{id:'10',signal:'11',aborted:false}]:[]});
 const r=await replayTrace(file,source,trace);out.push(r);console.log(name,JSON.stringify(r));
}
writeFileSync(process.argv[2],JSON.stringify(out,null,2)+'\n');
