"""Record a command and its unchanged repository inputs, including failures."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys

output = Path(sys.argv[1]).resolve()
command = sys.argv[2:]
if command and command[0] == "--":
    command = command[1:]
if not command:
    raise SystemExit("Usage: record-verifier-run.py NEW_OUTPUT_DIRECTORY -- COMMAND [ARG ...]")
root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
output.mkdir(parents=True, exist_ok=False)
sha = lambda data: hashlib.sha256(data).hexdigest()

def freeze():
    paths = set(subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")) - {""}
    paths.update(str(p.relative_to(root)) for p in (root / "verify").glob("*.mjs"))
    paths.update(str(p.relative_to(root)) for p in (root / "verify/stateful").glob("*.mjs"))
    return {p: sha((root / p).read_bytes()) for p in sorted(paths) if (root / p).is_file()}

before = freeze()
(output / "inputs.before.json").write_text(json.dumps(before, indent=2) + "\n")
receipt = {
    "head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
    "tree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=root, text=True).strip(),
    "command": command,
    "startedAt": datetime.now(timezone.utc).isoformat(),
    "platform": platform.system(), "architecture": platform.machine(),
    "node": subprocess.check_output(["node", "--version"], text=True).strip(),
    "diffBefore": subprocess.check_output(["git", "diff", "--binary", "HEAD"], cwd=root, text=True),
    "github": {k: os.environ[k] for k in ["GITHUB_REPOSITORY", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_SHA"] if k in os.environ},
}
with (output / "command.log").open("wb") as log:
    child = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    for line in child.stdout:
        log.write(line)
        sys.stdout.buffer.write(line)
        sys.stdout.buffer.flush()
    code = child.wait()
after = freeze()
(output / "inputs.after.json").write_text(json.dumps(after, indent=2) + "\n")
receipt.update(exitCode=code, finishedAt=datetime.now(timezone.utc).isoformat(), inputsUnchanged=before == after,
               logSha256=sha((output / "command.log").read_bytes()),
               diffAfter=subprocess.check_output(["git", "diff", "--binary", "HEAD"], cwd=root, text=True))
receipt["status"] = "PASS" if code == 0 and before == after and not receipt["diffBefore"] and not receipt["diffAfter"] else "FAIL"
(output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"status": receipt["status"], "exitCode": code, "inputsUnchanged": before == after, "output": str(output)}))
raise SystemExit(code or (0 if receipt["status"] == "PASS" else 1))
