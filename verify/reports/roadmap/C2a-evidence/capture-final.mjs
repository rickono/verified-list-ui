import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {machineOf} from '../../../stateful/machine.mjs';
import {transitionsOf} from '../../../stateful/transitions.mjs';
import {checkStateful} from '../../../stateful/index.mjs';
import {phases,obligation} from '../../../proofs.mjs';
const output=[];
for(const name of ['listeners','advisory']) {
 const file='tests/verify/fixtures/stateful/protocols/'+name+'.ts',source=readFileSync(file,'utf8'),m=machineOf(file,source),t=transitionsOf(m);
 const report=await checkStateful(file,source,{timeoutMs:60000,maxDepth:0});
 assert.equal(report.status,'verified'); assert.ok(report.units.every(u=>u.status==='verified'));
 output.push(report);
 writeFileSync(new URL('./'+name+'-full-queries.json.gz',import.meta.url),gzipSync(JSON.stringify(t.units.map(u=>({name:u.name,kind:u.kind,span:u.span,effects:u.target.effects,queries:phases(u.target).filter(([phase])=>!phase.endsWith('witness')).map(([phase,i])=>obligation(u.target,phase,i))})))));
 console.log(name,report.status,report.units.length,report.unitsSha256);
}
writeFileSync(process.argv[2],JSON.stringify(output,null,2)+'\n');
