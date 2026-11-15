"""Check recorded evidence and source bytes without solving or admitting receipts."""
from pathlib import Path
import gzip,hashlib,json,subprocess,sys,tarfile
here=Path(__file__).resolve().parent;root=here.parents[3]
assert sys.argv[1:] in ([],['--current'])
sha=lambda b:hashlib.sha256(b).hexdigest()
meta=json.loads((here/'summary.json').read_text());archives={}
for name,entry in meta['archives'].items():
 assert sha((here/name).read_bytes())==entry['sha256']
 with tarfile.open(here/name,'r:gz') as packed:
  raw={}
  for member in packed:
   p=Path(member.name);assert member.isfile() and not p.is_absolute() and '..' not in p.parts
   raw[member.name]=packed.extractfile(member).read()
 get=lambda name:json.loads(raw[name]);archives[entry['runId']]=raw
 for stage in ['full',*(['loop-controls','campaign-command'] if entry['status']=='PASS' else [])]:
  receipt=get(stage+'/receipt.json');assert receipt['status']==entry['status'];assert receipt['inputsUnchanged']
  assert receipt['diffBefore']==receipt['diffAfter']==''
  assert get(stage+'/inputs.before.json')==get(stage+'/inputs.after.json')
  assert sha(raw[stage+'/command.log'])==receipt['logSha256']
  if entry['status']=='PASS':assert receipt['exitCode']==0 and receipt['head']==meta['testedCodeHead']
 if entry['status']=='PASS':
  run,evidence,model=get('campaign/run.json'),get('campaign/evidence.json'),get('campaign/model.json')
  assert run['status']==evidence['status']=='PASS' and run['code']==0
  assert not run['timedOut'] and not run['remainingProcessGroupAfterWait'] and run['protectedFilesUnchanged']
  assert len(evidence['stages'])==10 and all(s['status']=='PASS' for s in evidence['stages'])
  assert model['sha256']==evidence['modelIdentity']==meta['currentModel']
  assert get('campaign/freeze.before.json')==get('campaign/freeze.after.json')==get('campaign/supervisor-freeze.before.json')==get('campaign/supervisor-freeze.after.json')
  for manifest in [run,evidence]:
   for filename,record in manifest['artifacts'].items():assert sha(raw['campaign/'+filename])==record['sha256'],filename
  totals={}
  for line in raw['full/command.log'].decode().splitlines():
   for key in ['tests','pass','fail','skipped','cancelled']:
    if line.startswith('# '+key+' '):totals[key]=int(line.split()[-1])
  assert totals=={'tests':535,'pass':535,'fail':0,'skipped':0,'cancelled':0}
  subprocess.run(['git','merge-base','--is-ancestor',meta['testedCodeHead'],'HEAD'],cwd=root,check=True)
  inputs=get('full/inputs.before.json')
  selected={name:digest for name,digest in inputs.items() if name.startswith(('tests/verify/','.github/')) or name in ['scripts/serial-verify.py','scripts/record-verifier-run.py'] or name in ['package.json','pnpm-lock.yaml','Makefile'] or name.startswith('verify/') and '/reports/' not in name and '/design/' not in name and not name.endswith('.md') or name.startswith('verify/reports/roadmap/library-campaigns/') and name.endswith(('.mjs','.js','.ts','inputs.json'))}
  for filename,digest in selected.items():
   recorded=subprocess.check_output(['git','show',meta['testedCodeHead']+':'+filename],cwd=root);assert sha(recorded)==digest,filename
   if '--current' in sys.argv:assert sha((root/filename).read_bytes())==digest,'Current validation input differs: '+filename
if '--current' in sys.argv:
  subprocess.run(['node','verify/reports/roadmap/library-campaigns/check.mjs','--inputs-only'],cwd=root,stdout=subprocess.DEVNULL,check=True)
for folder in (here/'local').iterdir():
 r=json.loads((folder/'receipt.json').read_text());assert r['inputsUnchanged'];assert json.loads((folder/'inputs.before.json').read_text())==json.loads((folder/'inputs.after.json').read_text());assert sha(gzip.decompress((folder/'tests.log.gz').read_bytes()))==r['logSha256']
for line in (here/'SHA256SUMS').read_text().splitlines():
 expected,name=line.split(maxsplit=1);p=Path(name);assert not p.is_absolute() and '..' not in p.parts;assert sha((here/p).read_bytes())==expected,name
print(json.dumps({'status':'PASS','hostedTests':535,'loopControls':4,'campaignStages':10,'currentInputsChecked':'--current' in sys.argv,'scope':meta['scope']}))
