"""Materialize pinned git blobs only below this report; no dependencies installed."""
import hashlib
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parents[1]
ROOT = OUT.parents[3]
SPECS = {
    "current": ("bd0d9570e8f910a8cf7db14cf517728ba3fd673e", ["verify", "tests/verify/fixtures/stateful", "tests/verify/stateful-replay.test.mjs", "tests/verify/stateful-boundaries.test.mjs"]),
    "A": ("d87f70040f05c4b2449476334936feabe727ba01", ["verify/reports/roadmap/candidate-stateful-C2-codex"]),
    "B": ("d764ed854be9fec825871b39b494875a4c7de2af", ["verify/reports/roadmap/candidate-stateful-C2-grok"]),
}
manifest = []
for label, (commit, paths) in SPECS.items():
    listing = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", commit, "--", *paths], cwd=ROOT, text=True).splitlines()
    for relative in listing:
        if label == "current" and relative.startswith("verify/reports/"):
            continue
        data = subprocess.check_output(["git", "show", f"{commit}:{relative}"], cwd=ROOT)
        target = OUT / ".snapshots" / label / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        manifest.append({"snapshot": label, "commit": commit, "path": relative, "sha256": hashlib.sha256(data).hexdigest()})
(OUT / "logs").mkdir(exist_ok=True)
(OUT / "logs" / "snapshot-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"snapshots": {label: commit for label, (commit, _) in SPECS.items()}, "files": len(manifest)}))
