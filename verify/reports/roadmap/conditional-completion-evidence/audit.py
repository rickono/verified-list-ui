"""Recheck the final artifact without solving or promoting unknown results."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[4]
package = Path(__file__).resolve().parent
implementation = "20ff20556fe19a72f73ccf3708d7bd7329ec2bc0"
prepared = "5f0fb47a0a822d62537f296ef804d5037eebba5c"
baseline = "32bd5b260aa116ca88642a1479bed8d3fc447f4b"


def sha(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


for commit in [baseline, prepared, implementation]:
    subprocess.run(["git", "merge-base", "--is-ancestor", commit, "HEAD"], cwd=root, check=True)
assert (root / "verify").is_dir()
assert not git("diff", "--name-only", implementation, "--", "verify/source.mjs", "verify/stateful", "tests/verify")
receipts = {label: json.loads((package / label / "receipt.json").read_text())
            for label in ["focused-1", "focused-2", "focused-final", "full-final"]}
assert receipts["focused-1"]["exitCode"] == 1
for label in ["focused-2", "focused-final", "full-final"]:
    assert receipts[label]["exitCode"] == 0, label
assert all(r["coreUnchangedDuringRun"] for r in receipts.values())
final = receipts["full-final"]
assert final["runHead"] == implementation
for path, expected in final["sha256"].items():
    assert sha(root / path) == expected, path
    committed = subprocess.check_output(["git", "show", f"{implementation}:{path}"], cwd=root)
    assert hashlib.sha256(committed).hexdigest() == expected, path

observations = package / "full-final/observations"
expected = {"zero": "verified", "one": "verified", "two": "verified", "branching-prefix": "verified",
            "two-async-entries": "verified", "boolean-outcome": "verified", "correlated-outcome": "verified",
            "reachable-partial-domain": "verified", "positive-outcome": "verified", "rejection-only": "verified",
            "false": "unknown", "partial": "unknown", "missing-settlement": "unknown", "saturation": "verified",
            "wrong-safety": "counterexample", "max-depth-zero": "unknown", "timeout-one": "unknown"}
for name, status in expected.items():
    row = json.loads((observations / f"{name}.json").read_text())
    report = row["report"]
    assert report["status"] == status, name
    assert report["sourceSha256"] == hashlib.sha256(row["source"].encode()).hexdigest()
    assert report["completion"]["nativeConfirmed"] is False
    assert all(g["nativeConfirmed"] is False for g in report["completion"]["goals"])
for name in ["false", "partial"]:
    report = json.loads((observations / f"{name}.json").read_text())["report"]
    assert report["safety"]["status"] == "verified"
    assert report["completion"]["goals"][0]["reason"] == "outcome-viability"
native = json.loads((observations / "native-two.json").read_text())["result"]
assert [s["action"]["kind"] for s in native["trace"]["steps"]] == ["init", "call", "resolve", "resolve"]
assert [s["state"]["n"]["bits"] for s in native["trace"]["steps"]] == ["0000000000000000", "0000000000000000", "3ff0000000000000", "4000000000000000"]
assert native["trace"]["steps"][-1]["activations"][0]["status"] == "returned"
parity = json.loads((observations / "parity.json").read_text())
assert parity["prepared"] == prepared

packages = {}
dependencies = root / "node_modules"
if not dependencies.exists():
    dependencies = Path(os.environ.get("COMPLETION_PROBE_DEPS", "/Users/rick/verification-vibes/verified-list-ui/node_modules"))


def dependency(path):
    path = path.resolve()
    meta = json.loads((path / "package.json").read_text())
    identity = f"{meta['name']}@{meta['version']}"
    if identity in packages:
        return
    files = {str(p.relative_to(path)): sha(p) for p in sorted(path.rglob("*"))
             if p.is_file() and "node_modules" not in p.relative_to(path).parts}
    packages[identity] = {"path": str(path), "files": files}
    for name in meta.get("dependencies", {}):
        candidate = path.parent / name
        if not (candidate / "package.json").exists():
            candidate = dependencies / name
        dependency(candidate)


for name in ["acorn", "z3-solver"]:
    dependency(dependencies / name)
processes = subprocess.check_output(["ps", "-eo", "pid=,ppid=,command="], text=True).splitlines()
owned = [p for p in processes if str(root) in p and any(x in p for x in ["/verify/solver.mjs", "/stateful/replay-worker.mjs", "node --test "])]
assert not owned, owned
assert not (root / "node_modules").is_symlink(), "Remove the task-owned dependency link before final audit"
summary = {"status": "PASS", "baselineAncestor": baseline, "preparedSnapshot": prepared, "implementation": implementation,
           "implementationTree": git("rev-parse", f"{implementation}^{{tree}}"),
           "checkout": str(root), "runtime": subprocess.check_output(["node", "--version"], text=True).strip(),
           "packageSnapshots": packages, "finalSourceAndTestFiles": len(final["sha256"]),
           "publicReportControls": expected, "parity": parity, "ownedProcesses": owned,
           "coreUnchangedDuringAllRuns": True, "nativeInfiniteConfirmed": False,
           "cleanup": "temporary dependency link removed; solver/replay/test processes reaped"}

if "--write" in sys.argv:
    (package / "implementation-tree.txt").write_text(git("ls-tree", "-r", implementation, "verify", "tests/verify") + "\n")
    (package / "validation.json").write_text(json.dumps(summary, indent=2) + "\n")
    paths = sorted(set(root / p for p in final["sha256"])
                   | set(p for p in package.rglob("*") if p.is_file() and p.name != "SHA256SUMS")
                   | {package.parent / "conditional-completion-implementation.md"})
    (package / "SHA256SUMS").write_text("".join(f"{sha(p)}  {p.relative_to(root)}\n" for p in paths))
else:
    for line in (package / "SHA256SUMS").read_text().splitlines():
        expected_hash, path = line.split("  ", 1)
        assert sha(root / path) == expected_hash, path
print(json.dumps({"status": "PASS", "sourceAndTestFiles": len(final["sha256"]), "controls": len(expected),
                  "parityDefaults": len(parity["defaults"]), "parityStateful": len(parity["stateful"]), "ownedProcesses": owned}))
