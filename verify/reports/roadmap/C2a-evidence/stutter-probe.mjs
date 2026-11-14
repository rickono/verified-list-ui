import {writeFileSync} from 'node:fs';
import {machineOf} from '../../../stateful/machine.mjs';
import {transitionsOf} from '../../../stateful/transitions.mjs';
import {solve} from '../../../proofs.mjs';
import {checkStateful} from '../../../stateful/index.mjs';
import {traceOf,replayTrace} from '../../../stateful/traces.mjs';
import {handleValue} from '../../../stateful/protocol-values.mjs';
const source=`let x=false;
// state true
// always x !== old(x)
export function flip(controller:AbortController){x=!x;}`;
const file='abort-stutter.ts',m=machineOf(file,source),trace=traceOf(m,[{kind:'abort',controller:handleValue('controller','10')}],{inputs:[{id:'10',signal:'11',aborted:false}]});
const t=transitionsOf(m),remaining=t.units.filter(u=>u.name!=="$stutter"),ablation=await solve(remaining.map(u=>u.target),30000);
const report=await checkStateful(file,source,{maxDepth:0}),native=await replayTrace(file,source,trace);
writeFileSync(process.argv[2],JSON.stringify({source,sourceSha256:m.sourceSha256,expected:'never verified: legal external abort is a cell-state stutter and violates this non-reflexive always relation',report,native,privateStutterDeletion:{allRemainingVerified:ablation.every(r=>r.status==="verified"),units:remaining.map((u,i)=>({unit:u.name,...ablation[i]}))}},null,2)+'\n');
console.log(report.status,native.status,native.violation);
