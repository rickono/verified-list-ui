"""Run the default campaign with only the unpublished Git object unavailable."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

here = Path(__file__).resolve().parent
root = here.parents[5]
package = root / "verify/reports/roadmap/library-campaigns"
digest = lambda data: hashlib.sha256(data).hexdigest()
real_git = shutil.which("git")
head = subprocess.check_output([real_git, "rev-parse", "HEAD"], cwd=root, text=True).strip()
tree = subprocess.check_output([real_git, "rev-parse", "HEAD^{tree}"], cwd=root, text=True).strip()
argv = [shutil.which("node"), str(package / "check.mjs"), str(here / "campaign")]
started = datetime.now(timezone.utc).isoformat()
with tempfile.TemporaryDirectory(prefix=".no-private-git-", dir=package) as temporary:
    shim = Path(temporary) / "git"
    shutil.copyfile(package / "git-no-private-history.mjs", shim)
    shim.chmod(0o755)
    env = dict(os.environ, PATH=str(shim.parent) + os.pathsep + os.environ["PATH"], CAMPAIGN_REAL_GIT=real_git)
    env.pop("CAMPAIGN_GIT_CWD", None)
    normal = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, env=env, capture_output=True)
    missing = subprocess.run(["git", "show", "a83f50762005ae47edfe3e07295f3840b485687b:unneeded"], cwd=root, env=env, capture_output=True)
    assert normal.returncode == 0 and normal.stdout.decode().strip() == head
    assert missing.returncode == 128 and b"fixture: historical object unavailable" in missing.stderr
    (here / "missing-object.stderr.txt").write_bytes(missing.stderr)
    with (here / "launch.stdout.txt").open("wb") as stdout, (here / "launch.stderr.txt").open("wb") as stderr:
        process = subprocess.Popen(argv, cwd=root, env=env, stdout=stdout, stderr=stderr)
        status = process.wait()  # check.mjs owns the 600-second guard and process-group cleanup.
    alive = False
    try:
        os.kill(process.pid, 0)
        alive = True
    except ProcessLookupError:
        pass
    assert not alive
    record = dict(argv=argv, cwd=str(root), codeHead=head, codeTree=tree,
                  start=started, end=datetime.now(timezone.utc).isoformat(),
                  pid=process.pid, status=status, aliveAfterWait=alive,
                  gitShimSha256=digest(shim.read_bytes()), realGit=real_git,
                  noPrivateObjectProbe=dict(argv=["git", "show", "a83f50762005ae47edfe3e07295f3840b485687b:unneeded"], status=missing.returncode),
                  normalGitProbe=dict(argv=["git", "rev-parse", "HEAD"], status=normal.returncode, observed=head),
                  serialLane="The default checker launches serial-verify.py; the wrapper does not acquire a second lane lock.",
                  laneSha256=digest(Path("/Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py").read_bytes()),
                  stdoutSha256=digest((here / "launch.stdout.txt").read_bytes()),
                  stderrSha256=digest((here / "launch.stderr.txt").read_bytes()),
                  temporaryGitShimRemovedOnExit=True)
    (here / "launch.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(dict(status=status, codeHead=head, campaign=str(here / "campaign"))))
raise SystemExit(status)
