"""Check owned snapshots/processes, then remove only disposable owned blobs."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

out = Path(__file__).resolve().parents[1]
rows = json.loads((out / "logs/snapshot-manifest.json").read_text())
for row in rows:
    data = (out / ".snapshots" / row["snapshot"] / row["path"]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == row["sha256"], row
links = [str(p) for p in out.rglob("*") if p.is_symlink()]
assert not links, links
processes = []
for line in subprocess.check_output(["ps", "-axo", "pid=,ppid=,command="], text=True).splitlines():
    fields = line.strip().split(None, 2)
    if len(fields) == 3:
        processes.append((int(fields[0]), int(fields[1]), fields[2]))
parents = {pid: parent for pid, parent, _ in processes}
exclude = {os.getpid()}
parent = os.getppid()
while parent and parent not in exclude:
    exclude.add(parent)
    parent = parents.get(parent, 0)
owned = [(pid, command) for pid, _, command in processes if str(out) in command and pid not in exclude]
assert not owned, owned
shutil.rmtree(out / ".snapshots")
receipt = {"immutableSnapshotsChecked": len(rows), "changedSnapshots": 0,
           "snapshotsRemoved": True, "dependencyLinks": links,
           "ownedProcessesRemaining": owned,
           "productionChanged": bool(subprocess.check_output(["git", "diff", "--name-only", "HEAD", "--", ".", ":(exclude)verify/reports/roadmap/judgment-stateful-C2"], text=True).strip()),
           "reportWords": len((out / "judgment.md").read_text().split())}
assert not receipt["productionChanged"]
assert receipt["reportWords"] <= 2200
(out / "logs/cleanup.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt))
