import {readFileSync,writeFileSync} from 'node:fs';
import {machineOf} from '../../../stateful/machine.mjs';
import {transitionsOf} from '../../../stateful/transitions.mjs';
import {solve} from '../../../proofs.mjs';
const output=[];
for(const name of ['listeners','advisory']) {
 const file='tests/verify/fixtures/stateful/protocols/'+name+'.ts',source=readFileSync(file,'utf8'),m=machineOf(file,source),t=transitionsOf(m);
 const outcomes=await solve(t.units.map(u=>u.target),60000);
 const rows=t.units.map((u,i)=>({unit:u.name,...outcomes[i]}));
 output.push({file,sourceSha256:m.sourceSha256,unitsSha256:t.sha256,outcomes:rows});
 console.log(name,rows.map(r=>[r.unit,r.status]).filter(r=>r[1]!=='verified'));
}
writeFileSync(process.argv[2],JSON.stringify(output,null,2)+'\n');
