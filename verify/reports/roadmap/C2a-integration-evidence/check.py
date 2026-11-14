"""Check recorded C2a test evidence; never solve or admit a proof receipt."""
from pathlib import Path
import gzip, hashlib, json, subprocess, sys

here = Path(__file__).resolve().parent
root = here.parents[3]
summary = json.loads((here / 'summary.json').read_text())
assert sys.argv[1:] in ([], ['--current'])
sha = lambda data: hashlib.sha256(data).hexdigest()
for row in summary['runs']:
    folder = here / row['label']
    receipt = json.loads((folder / 'receipt.json').read_text())
    before = json.loads((folder / 'inputs.before.json').read_text())
    after = json.loads((folder / 'inputs.after.json').read_text())
    assert before == after and receipt['inputsUnchanged']
    text = gzip.decompress((folder / 'tests.log.gz').read_bytes())
    assert sha(text) == receipt['logSha256'] == row['logSha256']
    tap = {}
    for line in text.decode().splitlines():
        for key in ['tests', 'pass', 'fail', 'cancelled', 'skipped']:
            if line.startswith('# ' + key + ' '):
                tap[key] = int(line.split()[-1])
    assert tap == row['tap'] and receipt['exitCode'] == row['exitCode']

final = json.loads((here / 'full-final/receipt.json').read_text())
inputs = json.loads((here / 'full-final/inputs.before.json').read_text())
assert final['head'] == summary['testedCodeHead'] == 'e1a76a3eed05674cee184c69ef15efae54bf3ad4'
assert final['exitCode'] == 0 and final['diffBefore'] == final['diffAfter'] == ''
assert summary['runs'][-1]['tap'] == {'tests': 510, 'pass': 510, 'fail': 0, 'cancelled': 0, 'skipped': 0}
subprocess.run(['git', 'merge-base', '--is-ancestor', final['head'], 'HEAD'], cwd=root, check=True)
for name, expected in inputs.items():
    p = Path(name)
    assert not p.is_absolute() and '..' not in p.parts
    assert name.startswith(('verify/', 'tests/verify/'))
    recorded = subprocess.check_output(['git', 'show', final['head'] + ':' + name], cwd=root)
    assert sha(recorded) == expected, 'Recorded source mismatch: ' + name
    if '--current' in sys.argv:
        assert sha((root / name).read_bytes()) == expected, 'Current source differs: ' + name

inventory = here / 'SHA256SUMS'
if inventory.exists():
    for line in inventory.read_text().splitlines():
        expected, name = line.split(maxsplit=1)
        p = Path(name)
        assert not p.is_absolute() and '..' not in p.parts
        assert sha((here / p).read_bytes()) == expected, 'Evidence mismatch: ' + name
print(json.dumps({'status': 'PASS', 'runs': len(summary['runs']), 'committedInputs': len(inputs),
                  'currentInputsChecked': '--current' in sys.argv,
                  'scope': 'Recorded bytes, run classifications and ancestry; no new solver or receipt admission.'}))
