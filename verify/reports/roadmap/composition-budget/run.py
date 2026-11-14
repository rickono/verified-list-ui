"""Record one exact command through the required shared solver lane."""
import json
from pathlib import Path
import subprocess
import sys
import time

here = Path(__file__).resolve().parent
root = here.parents[3]
name, *command = sys.argv[1:]
lane = ["python3", "/Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py", "--", *command]
head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
diff = subprocess.check_output(["git", "diff", "--", "verify", "tests/verify"], cwd=root, text=True)
started = time.time()
with (here / f"{name}.txt").open("w") as log:
    result = subprocess.run(lane, cwd=root, stdout=log, stderr=subprocess.STDOUT, check=False)
record = {"command": lane, "cwd": str(root), "head": head, "startedUnix": started,
          "elapsedIncludingQueueSeconds": time.time() - started, "exitCode": result.returncode,
          "log": f"{name}.txt", "trackedDiff": diff}
(here / f"{name}.run.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({key: value for key, value in record.items() if key != "trackedDiff"}))
raise SystemExit(result.returncode)
