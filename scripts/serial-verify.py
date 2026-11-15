"""One solver lane shared by the checkouts in this Git repository."""
import fcntl
from pathlib import Path
import subprocess
import sys

command = sys.argv[1:]
if command and command[0] == "--":
    command = command[1:]
if not command:
    raise SystemExit("Usage: serial-verify.py -- COMMAND [ARG ...]")
common = Path(subprocess.check_output(
    ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], text=True
).strip())
with (common / "verifier-suite.lock").open("a") as lane:
    print("Waiting for the shared solver test lane.", flush=True)
    fcntl.flock(lane.fileno(), fcntl.LOCK_EX)
    print("Acquired the solver test lane.", flush=True)
    raise SystemExit(subprocess.run(command, check=False).returncode)
