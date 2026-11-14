from pathlib import Path
import hashlib
import json
import os
import signal
import subprocess

root = Path('/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator')
out = Path('/Users/rick/verification-vibes/artifacts/roadmap-20261113/combined-integration/native-containment')
out.mkdir(parents=True, exist_ok=True)
checker = root / 'verify/reports/roadmap/library-campaigns/check.mjs'
command = ['node', str(checker), '--native-nice', 'cycle5']
child = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
timed_out = False
try:
    stdout, stderr = child.communicate(timeout=0.8)
except subprocess.TimeoutExpired:
    timed_out = True
    os.killpg(child.pid, signal.SIGKILL)
    stdout, stderr = child.communicate()
try:
    os.kill(child.pid, 0)
    alive = True
except ProcessLookupError:
    alive = False
(out / 'stdout.txt').write_bytes(stdout)
(out / 'stderr.txt').write_bytes(stderr)
record = {'command': command, 'serialLane': True, 'timeoutMs': 800, 'observedTimeout': timed_out,
          'returnCode': child.returncode, 'waited': True, 'pidAbsentAfterWait': not alive,
          'classification': 'unknown; observed timeout, not a nontermination proof or performance measurement',
          'checkerSha256': hashlib.sha256(checker.read_bytes()).hexdigest()}
(out / 'receipt.json').write_text(json.dumps(record, indent=2) + '\n')
assert timed_out and child.returncode == -signal.SIGKILL and not alive
assert b'"event":"calling"' in stdout and b'"event":"returned"' not in stdout
print(json.dumps(record))
