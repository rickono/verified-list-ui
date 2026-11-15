"""Capture an owned serial-lane run; preserve each attempt in a new directory."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[4]
package = Path(__file__).resolve().parent
label, *command = sys.argv[1:]
if command and command[0] == "--":
    command = command[1:]
output = package / label
output.mkdir(exist_ok=False)
environment = os.environ.copy()
environment["COMPLETION_EVIDENCE"] = str(output / "observations")
paths = sorted(set(root.glob("verify/*.mjs")) | set(root.glob("verify/stateful/*.mjs"))
               | set(root.glob("tests/verify/conditional-completion*.mjs"))
               | set(root.glob("tests/verify/fixtures/stateful/completion/*.ts"))
               | {root / "tests/verify/fixtures/completion-cases.mjs"})
hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
receipt = {"command": command, "cwd": str(root), "preparedHead": "5f0fb47a0a822d62537f296ef804d5037eebba5c",
           "runHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
           "started": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sha256": hashes}
(output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
with (output / "run.txt").open("w") as log:
    result = subprocess.run(command, cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT, check=False)
receipt.update({"exitCode": result.returncode, "finished": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "coreUnchangedDuringRun": all(hashlib.sha256((root / p).read_bytes()).hexdigest() == h for p, h in hashes.items())})
(output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"label": label, "exitCode": result.returncode, "log": str(output / "run.txt"),
                  "coreUnchangedDuringRun": receipt["coreUnchangedDuringRun"]}), flush=True)
raise SystemExit(result.returncode)
