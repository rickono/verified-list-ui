import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compile} from '../../../source.mjs';
import {load} from '../../../modules.mjs';
import {phases,obligation} from '../../../proofs.mjs';
import {sha256} from '../../../stateful/ast.mjs';
const base='77c95f3',root=process.cwd(),temporary=mkdtempSync(join(root,'verify/.c2a-baseline-')),rows=[];
try {
 const paths=execFileSync('git',['ls-tree','-r','--name-only',base,'verify'],{encoding:'utf8'}).trim().split('\n').filter(p=>/^verify\/[^/]+\.mjs$/.test(p));
 for(const p of paths)writeFileSync(join(temporary,p.slice('verify/'.length)),execFileSync('git',['show',base+':'+p]));
 const old=await import(pathToFileURL(join(temporary,'source.mjs'))),modules=await import(pathToFileURL(join(temporary,'modules.mjs'))),proofs=await import(pathToFileURL(join(temporary,'proofs.mjs')));
 for(const name of readdirSync(join(root,'verify/examples')).filter(p=>p.endsWith('.ts')).sort()) {
  const file=join(root,'verify/examples',name),before=old.compile(modules.load(file).records),after=compile(load(file).records);
  assert.deepEqual(after,before);
  const oldQueries=before.targets.flatMap(t=>proofs.phases(t).map(([p,i])=>proofs.obligation(t,p,i))),queries=after.targets.flatMap(t=>phases(t).map(([p,i])=>obligation(t,p,i)));
  assert.deepEqual(queries,oldQueries);
  rows.push({file,sourceSha256:sha256(readFileSync(file)),targets:after.targets.length,queries:queries.length,beforeArtifactSha256:sha256(JSON.stringify(before)),afterArtifactSha256:sha256(JSON.stringify(after)),beforeQueriesSha256:sha256(JSON.stringify(oldQueries)),afterQueriesSha256:sha256(JSON.stringify(queries)),exact:true});
 }
 writeFileSync(process.argv[2],JSON.stringify({base:execFileSync('git',['rev-parse',base],{encoding:'utf8'}).trim(),testedHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),rows},null,2)+'\n');
 console.log('exact public-main compiler/query parity:',rows.length,'examples');
} finally {rmSync(temporary,{recursive:true,force:true});}
