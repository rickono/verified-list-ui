import {readFileSync,writeFileSync} from 'node:fs';
import {machineOf} from '../../../stateful/machine.mjs';
import {traceOf,replayTrace} from '../../../stateful/traces.mjs';
const source=readFileSync('tests/verify/fixtures/stateful/protocols/listeners.ts','utf8').replace('export function bind() {','export function bind(skip: boolean) {\n  if (skip) return;').replace('shown = value','shown = 1');
const m=machineOf('return.ts',source),trace=traceOf(m,[{kind:'call',entry:'bind',args:[true],returns:'100'}]);
const result=await replayTrace(m.file,source,trace);
writeFileSync(process.argv[2],JSON.stringify({source,sourceSha256:m.sourceSha256,expected:'illegal-environment-action for requested remover absent on this return path',result},null,2)+'\n');
console.log(result.status,result.message??'');
