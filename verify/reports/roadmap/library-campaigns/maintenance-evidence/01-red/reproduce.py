"""Reproduce the two pre-maintenance gates. Run before changing check.mjs."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone

here = Path(__file__).resolve().parent
root = here.parents[5]
package = Path("verify/reports/roadmap/library-campaigns")
real_git = shutil.which("git")
old = "a83f50762005ae47edfe3e07295f3840b485687b"
digest = lambda data: hashlib.sha256(data).hexdigest()


def run(name, argv, cwd=root, env=None):
    started = datetime.now(timezone.utc).isoformat()
    result = subprocess.run(argv, cwd=cwd, env=env, capture_output=True, timeout=20)
    (here / f"{name}.stdout.txt").write_bytes(result.stdout)
    (here / f"{name}.stderr.txt").write_bytes(result.stderr)
    record = dict(argv=argv, cwd=str(cwd), started=started,
                  finished=datetime.now(timezone.utc).isoformat(),
                  status=result.returncode, stdoutSha256=digest(result.stdout),
                  stderrSha256=digest(result.stderr), waited=True)
    (here / f"{name}.command.json").write_text(json.dumps(record, indent=2) + "\n")
    return result


head = subprocess.check_output([real_git, "rev-parse", "HEAD"], cwd=root, text=True).strip()
assert head == "5f0fb47a0a822d62537f296ef804d5037eebba5c"
first = run("default", ["node", str(package / "check.mjs"), str(here / "default-output")])
assert first.returncode == 1
assert b"Source/provenance drift: verify/bin/jsverify.mjs" in first.stderr

inputs = json.loads((root / package / "inputs.json").read_text())
with tempfile.TemporaryDirectory(prefix=".red-fixture-", dir=root / package) as temporary:
    fixture = Path(temporary)
    updated = []
    for path, expected in inputs["files"].items():
        target = fixture / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / path, target)
        actual = digest(target.read_bytes())
        if actual != expected:
            updated.append(dict(path=path, historical=expected, current=actual))
            inputs["files"][path] = actual
    (fixture / package / "inputs.json").write_text(json.dumps(inputs, indent=2) + "\n")
    shim = fixture / "bin" / "git"
    shim.parent.mkdir()
    shim.write_text("#!/usr/bin/env python3\nimport os, sys\n"
                    f"old = {old!r}\n"
                    "if sys.argv[1:2] == ['show'] and any(a.startswith(old + ':') for a in sys.argv[2:]):\n"
                    "    sys.stderr.write('fixture: historical object unavailable: ' + old + '\\n')\n"
                    "    sys.exit(128)\n"
                    f"os.execv({real_git!r}, [{real_git!r}, '-C', {str(root)!r}, *sys.argv[1:]])\n")
    shim.chmod(0o755)
    (here / "git-shim.py.txt").write_text(shim.read_text())
    env = dict(os.environ, PATH=str(shim.parent) + os.pathsep + os.environ["PATH"])
    assert run("shim-normal", ["git", "rev-parse", "HEAD"], fixture, env).stdout.decode().strip() == head
    second = run("no-private-history", ["node", str(fixture / package / "check.mjs"),
                                       str(fixture / "output")], fixture, env)
    assert second.returncode == 1
    assert b"fixture: historical object unavailable" in second.stderr
    assert b"at inputCheck" in second.stderr
    (here / "result.json").write_text(json.dumps(dict(
        status="PASS", meaning="Both original failures reproduced before editing",
        codeHead=head, checkerSha256=digest((root / package / "check.mjs").read_bytes()),
        firstExpected="Source/provenance drift before semantic imports",
        secondExpected="Missing private history before semantic imports",
        fixtureOnlyHashUpdates=updated, fixtureRemovedOnExit=True,
        shim="Fails only git show of the named old object; forwards other git to the prepared repository",
        limitations="The second control bypasses only historical runtime hash drift in a disposable copy. No solver or semantic verifier import ran."
    ), indent=2) + "\n")
print("PASS: both original failures reproduced; fixture removed")
