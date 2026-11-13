#!/bin/sh
# Run only through serial-verify.py; keep the complete final workflow in one lane.
set -eu
printf 'Tested code HEAD: '
git rev-parse HEAD
make test-verify > verify/reports/roadmap/P-evidence/logs/full-final.log 2>&1
python3 - <<'PY'
from pathlib import Path
import json
log=Path('verify/reports/roadmap/P-evidence/logs/baseline-real-workflows-final.log')
records=[json.loads(line) for line in log.read_text().splitlines() if line.startswith('{')]
item=next(r for r in records if r.get('check')=='real-buggy-fixture-evidence-reproduce')
assert item['reproduced']['status']=='reproduced'
Path('verify/reports/roadmap/P-evidence/bugs.json').write_text(json.dumps(item['evidence'],indent=2)+'\n')
PY
node verify/bin/jsverify.mjs reproduce --json verify/reports/roadmap/P-evidence/bugs.json verify/examples/bugs.ts > verify/reports/roadmap/P-evidence/logs/saved-artifact-cli.log 2>&1
