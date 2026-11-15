from pathlib import Path
import datetime, hashlib, json, subprocess, sys
root=Path.cwd(); out=Path(__file__).resolve().parent/sys.argv[1]; out.mkdir(exist_ok=False)
command=sys.argv[2:]
paths=sorted({p for base in ['verify','tests/verify'] for p in (root/base).rglob('*') if p.is_file() and 'reports' not in p.relative_to(root).parts} | {root/'package.json',root/'pnpm-lock.yaml'})
def freeze(): return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before=freeze(); (out/'inputs.before.json').write_text(json.dumps(before,indent=2)+'\n')
receipt={'command':command,'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diffBefore':subprocess.check_output(['git','diff','--binary','HEAD'],text=True)}
with (out/'tests.log').open('w') as log: result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
after=freeze(); (out/'inputs.after.json').write_text(json.dumps(after,indent=2)+'\n')
receipt.update(exitCode=result.returncode,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),inputsUnchanged=before==after,diffAfter=subprocess.check_output(['git','diff','--binary','HEAD'],text=True),logSha256=hashlib.sha256((out/'tests.log').read_bytes()).hexdigest())
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
for line in (out/'tests.log').read_text().splitlines():
 if line.startswith(('not ok','# tests ','# pass ','# fail ','# skipped ','# cancelled ')): print(line)
print(json.dumps({'exitCode':result.returncode,'inputsUnchanged':before==after,'out':str(out)}))
assert before==after
sys.exit(result.returncode)
