#!/usr/bin/env python3
"""Capture a serialized verifier command and prove its core stayed static."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
SERIAL = "/Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py"

def core():
    paths = sorted((ROOT / "verify").glob("*.mjs")) + sorted((ROOT / "verify/bin").glob("*.mjs"))
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}

label, *command = sys.argv[1:]
if command[:1] == ["--"]:
    command = command[1:]
assert label.replace("-", "").isalnum() and command
log = HERE / (label + ".log")
metadata = {"command": ["python3", SERIAL, "--", *command], "cwd": str(ROOT),
            "codeSha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "started": datetime.datetime.now(datetime.timezone.utc).isoformat(), "coreBefore": core()}
with log.open("w") as output:
    result = subprocess.run(metadata["command"], cwd=ROOT, stdout=output, stderr=subprocess.STDOUT)
metadata.update(exitCode=result.returncode, finished=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                coreAfter=core(), logSha256=hashlib.sha256(log.read_bytes()).hexdigest())
metadata["coreUnchanged"] = metadata["coreBefore"] == metadata["coreAfter"]
(HERE / (label + ".run.json")).write_text(json.dumps(metadata, indent=2) + "\n")
print(json.dumps({k: metadata[k] for k in ["codeSha", "exitCode", "coreUnchanged", "logSha256"]}))
sys.exit(result.returncode if metadata["coreUnchanged"] else 1)
