# Reconstruct the small pre-snapshot runtime deltas from the earliest archived
# source and recorded corrections. These are labelled reconstructions, not
# falsely dated live snapshots. The original outputs remain in separate logs.
from pathlib import Path
import io,hashlib,json,tarfile,subprocess
base=Path(__file__).parent
with tarfile.open(base/'focused-first.sources.tar.gz') as archive:
 files={m.name:archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}
native_names=['ast','clauses','environment','machine','native','protocol-machine','protocol-native','protocol-values','values','traces','replay-worker']
native={f'verify/stateful/{n}.mjs':files[f'verify/stateful/{n}.mjs'] for n in native_names}
native['verify/stateful/protocol-native.mjs']=native['verify/stateful/protocol-native.mjs'].replace(b'  Object.setPrototypeOf(AbortSignal, EventTarget);\n',b'')
native['verify/stateful/traces.mjs']=subprocess.check_output(['git','show','07c6485:verify/stateful/traces.mjs'])
proof_names=['ast','clauses','environment','machine','projection','protocol-machine','protocol-rules','protocol-transitions','transitions']
proof={f'verify/stateful/{n}.mjs':files[f'verify/stateful/{n}.mjs'] for n in proof_names}
proof['verify/source.mjs']=files['verify/source.mjs']
proof['verify/stateful/protocol-transitions.mjs']=proof['verify/stateful/protocol-transitions.mjs'].replace(b'      if (k) aborted = (...args) => read(maps[1], ...args); // contents may change across suspension\n',b'')
for label,content,note in [
 ('native-first-reconstructed',native,'Earliest archive minus the AbortSignal superclass correction; traces restored from prepared parent because protocol BFS was added after this probe.'),
 ('prove-first-reconstructed',proof,'Earliest archive minus the later suspension-content reset. Unchanged root compiler dependencies are pinned by prepared parent 07c6485.'),
]:
 with tarfile.open(base/(label+'.sources.tar.gz'),'w:gz') as out:
  for name,data in sorted(content.items()):
   info=tarfile.TarInfo(name);info.size=len(data);out.addfile(info,io.BytesIO(data))
 (base/(label+'.sha256.json')).write_text(json.dumps({'provenance':'reconstructed from focused-first archive and recorded small corrective deltas','note':note,'files':{n:hashlib.sha256(d).hexdigest() for n,d in content.items()}},indent=2)+'\n')
