from pathlib import Path
from datetime import datetime, timezone
import json, re, subprocess, sys
receipt=Path(sys.argv[1]); assert not receipt.exists(); command=sys.argv[2:]
start=datetime.now(timezone.utc)
result=subprocess.run(['/usr/bin/caffeinate','-i',*command])
end=datetime.now(timezone.utc)
events=[]
for line in subprocess.check_output(['pmset','-g','log'],text=True).splitlines():
 m=re.match(r'^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [+-]\d{4})\s+(Sleep|DarkWake|Wake)\s+(.+)$',line)
 if not m or m[3].startswith(('Requests','Details','Time')):continue
 t=datetime.strptime(m[1],'%Y-%m-%d %H:%M:%S %z')
 if start<=t<=end:events.append({'time':t.isoformat(),'kind':m[2],'summary':m[3].strip()[:200]})
slept=any(e['kind']=='Sleep' for e in events)
data={'command':['/usr/bin/caffeinate','-i',*command],'startedAt':start.isoformat(),'finishedAt':end.isoformat(),'exitCode':result.returncode,'powerEvents':events,'sleepObserved':slept,'status':'PASS' if result.returncode==0 and not slept else 'FAIL','scope':'Temporary idle-sleep assertion scoped to this utility; no display or global sleep-setting change. Explicit sleep can still occur.'}
receipt.write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({'awakeStatus':data['status'],'sleepObserved':slept,'exitCode':result.returncode,'receipt':str(receipt)}),flush=True)
sys.exit(result.returncode or (3 if slept else 0))
