from pathlib import Path
import subprocess,json,sys
base=Path(__file__).parent
commands=[
 ["node","--test","--test-concurrency=1","tests/verify/stateful-protocols.test.mjs"],
 ['node',str(base/'capture-final.mjs'),str(base/'proof-final.json')],
 ['node',str(base/'native-direct.mjs'),str(base/'native-direct.json')],
 ['node',str(base/'fp-probe.mjs'),str(base/'fp-after.json')],
 ['node',str(base/'return-probe.mjs'),str(base/'return-after.json')],
 ['node',str(base/'baseline-compare.mjs'),str(base/'baseline-compare.json')],
 ['node',str(base/'stutter-probe.mjs'),str(base/'stutter-control.json')],
 ['make','test-verify'],
]
names=['protocol-final-focused','proof-final','native-direct','fp-after','return-after','baseline-compare','stutter-control','full-final']
receipt=[]
for name,cmd in zip(names,commands):
 print('Running',name,flush=True)
 with (base/(name+'.log.txt')).open('w') as log:
  result=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT,check=False)
 receipt.append({'name':name,'command':cmd,'exit':result.returncode})
 (base/'final-commands.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(name,'exit',result.returncode,flush=True)
 if result.returncode:sys.exit(result.returncode)
