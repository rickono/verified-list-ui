"""Bind this historical evidence and its code inputs. This never admits proofs."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

here = Path(__file__).resolve().parent
root = here.parents[3]
read = lambda name: json.loads((here / name).read_text())
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()

if "--check" in sys.argv:
    for line in (here / "SHA256SUMS").read_text().splitlines():
        expected, name = line.split("  ", 1)
        assert digest(here / name) == expected, name
    for name, expected in read("code-inputs.json").items():
        assert digest(root / name) == expected, name
    print("PASS: evidence hashes and recorded verifier/test bytes match. No solver or receipt admission.")
    raise SystemExit(0)

for name, expected in {"parent-red": 1, "parent-inspect": 0, "scratch180": 0,
                       "focused": 0, "production180": 0, "harmonic-current": 0,
                       "full-final": 0, "parent-model-drift": 0}.items():
    assert read(f"{name}.run.json")["exitCode"] == expected, name
full = read("full-final.run.json")
assert full["trackedDiff"] == ""
code = full["head"]
assert code == "7feca2830d90e237227fc1522e77e1a11ce3abee"
names = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", code, "--", "verify", "tests/verify"], cwd=root, text=True).splitlines()
names = [name for name in names if not name.startswith("verify/reports/")]
subprocess.run(["git", "diff", "--exit-code", code, "--", *names], cwd=root, check=True)
(here / "code-inputs.json").write_text(json.dumps({name: digest(root / name) for name in names}, indent=2) + "\n")

def tests(name):
    text = (here / f"{name}.txt").read_text()
    values = {key: int(re.search(rf"^# {key} (\d+)$", text, re.M)[1])
              for key in ["tests", "pass", "fail", "cancelled", "skipped"]}
    assert values["tests"] == values["pass"]
    assert values["fail"] == values["cancelled"] == values["skipped"] == 0
    return values

unknowns = []
for line in (here / "full-final.txt").read_text().splitlines():
    if line.startswith("# {"):
        # TAP escapes a hash even inside a serialized JSON diagnostic.
        value = json.loads(line[2:].replace("\\#", "#"))
        if value.get("status") == "unknown":
            unknowns.append({key: value[key] for key in ["id", "status", "reason", "phase"] if key in value})
        if value.get("weak", {}).get("status") == "unknown":
            unknowns.append({"id": "full-suite-harmonic-weak", **value["weak"]})
comparison = read("proof-comparison.json")
assert comparison["byteEquality"] and comparison["allPhaseQueriesModelsReplayGuardsIdentical"]
assert read("parent-queries.json")["allPhases"] == read("queries.json")["allPhases"]
production = read("production-receipt.json")
assert production["head"] == code and production["status"] == "PASS"
for name in ["cold", "warm", "audit"]:
    report = read(f"production-{name}.json")
    assert {o["fn"] for o in report["outcomes"]} == {"Reverse", "takeImplementation", "reverseFirstTwo"}
    assert all(o["status"] == "verified" for o in report["outcomes"])
    assert report["graphSha256"] == comparison["graphSha256"]
assert not read("production-audit.json")["cache"]["disagreements"]
for name in ["scratch", "production"]:
    native = read(f"{name}-native.json")
    assert native["count"] == 179 and native["failures"] == 0
    assert all(c["wrapperHolds"] for c in native["checks"])
drift = read("harmonic-parent-invalid.json")
assert drift["parentIdentity"] == comparison["parentIdentity"]
assert drift["currentIdentity"] == comparison["currentIdentity"]
assert drift["result"]["status"] == "invalid-evidence"
harmonic = read("harmonic-receipt.json")
assert harmonic["status"] == "PASS" and harmonic["codeSha"] == code
assert harmonic["identity"] == comparison["currentIdentity"]
assert harmonic["total"] == "verified" and harmonic["positive"] == "counterexample" and harmonic["confirmed"]
assert harmonic["reproduce"] == harmonic["originalReproduce"] == "reproduced"
assert read("harmonic/positive.evidence.json")["identity"] == comparison["currentIdentity"]
assert not (root / "node_modules").is_symlink()
assert not (here / ".scratch").exists()
assert read("cleanup.json")["ownedProcesses"] == []
receipt = {
    "status": "PASS", "scope": "Budget correction and recorded source checks; no repeatability or roadmap-completion claim.",
    "parent": "2809e885ef01e09da906ddc31e070fde1df180a2", "testedCodeHead": code,
    "defaultMs": 10000, "minMs": 1, "maxMs": 180000,
    "focused": tests("focused"), "full": tests("full-final"), "fullRuns": 1,
    "comparison": comparison, "graphRequests": production["receipts"],
    "cause": "The public ceiling rejected a working larger whole-graph request. Initial turns share the request budget. Changed SMT semantics are excluded for this graph; intrinsic query cost above 60s is not established.",
    "harmonic": harmonic, "parentArtifact": drift, "remainingFullSuiteUnknowns": unknowns,
    "limits": ["Original composition remains historical ISSUES at 60000ms.",
               "Future solver completion within 180000ms is not established.",
               "Existing induction gaps and explicit 60000ms request timeouts remain unknown."],
    "cleanup": read("cleanup.json"),
}
(here / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
files = sorted(p for p in here.rglob("*") if p.is_file() and p.name != "SHA256SUMS")
(here / "SHA256SUMS").write_text("".join(f"{digest(p)}  {p.relative_to(here)}\n" for p in files))
print(json.dumps({"status": "PASS", "testedCodeHead": code, "focused": receipt["focused"], "full": receipt["full"], "boundFiles": len(files)}))
