"""Retained finite input-refusal controls. Never runs source verification on copies."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import shutil
import signal
import subprocess
import tempfile

root = Path(__file__).resolve().parents[6]
pkg = root / 'verify/reports/roadmap/library-campaigns'
out = Path(__file__).resolve().parent
inputs = json.loads((pkg / 'inputs.json').read_text())
node = shutil.which('node')
lane = '/Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py'
checks = []
for name, target in [('source', 'pins/d3-array/nice.js'), ('provenance', 'provenance.json')]:
    scratch = Path(tempfile.mkdtemp(prefix='.drift-control-', dir=pkg))
    try:
        for file in inputs['files']:
            dest = scratch / file
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / file, dest)
        copied = scratch / 'verify/reports/roadmap/library-campaigns'
        shutil.copyfile(pkg / 'inputs.json', copied / 'inputs.json')
        file = copied / target
        before = file.read_bytes()
        if name == 'source':
            file.write_bytes(before + b'\n// byte drift control\n')
        else:
            data = json.loads(before)
            data['d3Array']['release'] = 'intentional-drift-control'
            file.write_text(json.dumps(data, indent=2) + '\n')
        delta = subprocess.run(['diff', '-u', str(pkg / target), str(file)], capture_output=True, text=True)
        (out / f'{name}.patch').write_text(delta.stdout)
        argv = [node, str(copied / 'check.mjs'), str(scratch / 'output')]
        start = datetime.datetime.now(datetime.timezone.utc).isoformat()
        p = subprocess.Popen(argv, cwd=scratch, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        timed_out = False
        try:
            stdout, stderr = p.communicate(timeout=20)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(p.pid, signal.SIGKILL)
            stdout, stderr = p.communicate()
        (out / f'{name}.stdout.txt').write_text(stdout)
        (out / f'{name}.stderr.txt').write_text(stderr)
        alive = False
        try:
            os.killpg(p.pid, 0)
            alive = True
            os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        expected = f'Source/provenance drift: verify/reports/roadmap/library-campaigns/{target}'
        check = {'id': name, 'classification': 'finite control', 'origin': 'own execution',
                 'argv': argv, 'cwd': str(scratch), 'start': start,
                 'end': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 'codeHead': subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
                 'checkerSha256': hashlib.sha256((copied/'check.mjs').read_bytes()).hexdigest(),
                 'timeoutSeconds': 20, 'exitCode': p.returncode, 'timedOut': timed_out,
                 'remainingProcessGroup': alive, 'expectedDiagnostic': expected,
                 'originalSha256': hashlib.sha256(before).hexdigest(),
                 'changedSha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                 'noSourceVerification': 'Refusal before semantic imports; checked by the exact drift diagnostic below.',
                 'cpuScope': 'Only builtin imports, Git ancestry and hashes of 47 small inputs. No parser, source verification or solver is reached. This finite input-gate check is not CPU-heavy.',
                 'stdoutSha256': hashlib.sha256(stdout.encode()).hexdigest(),
                 'stderrSha256': hashlib.sha256(stderr.encode()).hexdigest()}
        check['status'] = 'PASS' if p.returncode == 1 and expected in stderr and not timed_out and not alive else 'ISSUES'
        checks.append(check)
    finally:
        shutil.rmtree(scratch)
        if checks and checks[-1]['id'] == name:
            checks[-1]['scratchRemoved'] = not scratch.exists()
(out / 'result.json').write_text(json.dumps({'status': 'PASS' if all(c['status']=='PASS' for c in checks) else 'ISSUES',
    'command': ['python3', str(Path(__file__).resolve())], 'checks': checks}, indent=2)+'\n')
print(json.dumps([(c['id'],c['status'],c['exitCode']) for c in checks]))
assert all(c['status']=='PASS' for c in checks)
