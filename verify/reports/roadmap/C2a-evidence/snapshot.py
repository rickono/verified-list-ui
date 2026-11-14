from pathlib import Path
import hashlib,json,subprocess,sys,tarfile
label=sys.argv[1]
paths=[Path('verify/source.mjs'),*sorted(Path('verify/stateful').glob('*.mjs')),*sorted(Path('tests/verify').glob('stateful-*.test.mjs')),*sorted(Path('tests/verify/fixtures/stateful/protocols').glob('*.ts'))]
base=Path(__file__).parent/label
base.with_suffix('.sha256.json').write_text(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},indent=2)+'\n')
with tarfile.open(base.with_suffix('.sources.tar.gz'),'w:gz') as out:
 for p in paths:out.add(p,arcname=str(p))
base.with_suffix('.head.txt').write_text(subprocess.check_output(['git','rev-parse','HEAD'],text=True))
