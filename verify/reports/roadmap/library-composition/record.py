#!/usr/bin/env python3
"""Record or check this report's provenance and raw evidence, without a solver."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CODE_HEAD = "b5c8828f0c281df812751371f651603481f3aefb"
BASE = "32bd5b260aa116ca88642a1479bed8d3fc447f4b"
PAIRS = [
    ("85d121d", "9ccd95e"), ("78de466", "d2b7e69"),
    ("098160f", "44a1f7e"), ("bc9fec0", "a892ca0"),
    ("00e5fc4", "c423365"), ("7a98698", "b5c8828"),
]

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT).decode().strip()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def put(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2) + "\n")

def patch_id(commit):
    patch = subprocess.check_output(["git", "show", "--pretty=format:", commit], cwd=ROOT)
    return subprocess.check_output(["git", "patch-id", "--stable"], input=patch, cwd=ROOT).decode().split()[0]

def imports():
    records = []
    for original, imported in PAIRS:
        author = "%an <%ae> %aI"
        assert git("show", "-s", "--format=" + author, original) == git("show", "-s", "--format=" + author, imported)
        first, second = patch_id(original), patch_id(imported)
        assert first == second, (original, imported, "patch identity differs")
        records.append({"original": git("rev-parse", original), "imported": git("rev-parse", imported),
                        "author": git("show", "-s", "--format=" + author, imported), "patchId": first})
    return records

def check_code():
    git("merge-base", "--is-ancestor", BASE, "HEAD")
    assert (ROOT / "verify").is_dir()
    # Importing K must preserve both C1's original-AST entry and its guard.
    source = (ROOT / "verify/source.mjs").read_text()
    assert 'if (!spec) fail("This compiler entry does not support loops without parsed contracts.' in source
    assert "export function compileAstUnit" in source
    paths = git("ls-tree", "-r", "--name-only", CODE_HEAD, "verify", "tests/verify").splitlines()
    core = [p for p in paths if not p.startswith("verify/reports/") and not p.startswith("verify/examples/")]
    git("diff", "--exit-code", CODE_HEAD, "--", *core)
    return {p: sha(ROOT / p) for p in core}

if sys.argv[1:] == ["--check"]:
    check_code()
    imports()
    lines = (HERE / "SHA256SUMS").read_text().splitlines()
    for line in lines:
        digest, file = line.split("  ", 1)
        path = HERE / file
        assert path.is_file() and sha(path) == digest, file
    assert not (HERE / ".work").exists()
    print(json.dumps({"status": "PASS", "artifactHashesChecked": len(lines), "coreUnchangedSince": CODE_HEAD}))
    raise SystemExit(0)
assert sys.argv[1:] == []
put("imports.json", imports())
core = check_code()
put("code-inputs.json", {"codeHead": CODE_HEAD, "preparedHead": "bd0d9570e8f910a8cf7db14cf517728ba3fd673e",
                         "baseline": BASE, "checkout": str(ROOT), "branch": git("branch", "--show-current"),
                         "commonInstructionsSha256": sha(Path("/Users/rick/verification-vibes/artifacts/roadmap-20261113/common.md")),
                         "coreAndTestSha256": core,
                         "c1SourceDifferenceFromK": git("diff", "7a98698", CODE_HEAD, "--", "verify/source.mjs")})

outcomes = []
for file in sorted((HERE / "logs").rglob("*.json")):
    data = json.loads(file.read_text())
    if isinstance(data, dict) and "report" in data and "outcomes" in data["report"]:
        report = data["report"]
        for outcome in report["outcomes"]:
            outcomes.append({"record": str(file.relative_to(HERE)), "adoptedFrom": data.get("adoptedFrom"),
                             "name": data.get("name", file.stem), "budgetMs": data.get("requestBudgetMs"),
                             "ms": data.get("ms"), "fn": outcome.get("fn"), "status": outcome["status"],
                             "reason": outcome.get("reason"), "confirmed": outcome.get("confirmed", False),
                             "obligation": outcome.get("obligation"), "graphSha256": report.get("graphSha256")})
put("measured-outcomes.json", outcomes)
command = "python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- "
check = "node verify/reports/roadmap/library-composition/check.mjs"
commands = [
    {"command": "git cherry-pick 85d121d 78de466 098160f bc9fec0 00e5fc4 7a98698", "exitCode": 0,
     "observed": "Six imported commits; same authors and patch IDs; C1 source guard retained."},
    {"command": command + check + " --write-fixtures", "log": "logs/00-dependency-setup-failure.log", "exitCode": 1,
     "observed": "Wrong temporary dependency link: acorn unavailable. No solver request occurred."},
    {"command": command + check + " --write-fixtures", "log": "logs/01-first-proof.log", "exitCode": 1,
     "observed": "First graph: rank timeout at 60020.589375 ms; take verified, caller dependency. The owned query dumper then threw on string.join."},
    {"command": command + check + " --dump-only", "log": "logs/02-actual-obligations.log", "exitCode": 0,
     "observed": "Actual production obligations inspected, no solver."},
    *[{"command": command + check + " --write-fixtures --dump-only", "log": "logs/" + file, "exitCode": 0,
       "observed": "Proof-only rank candidate compiled and inspected without a solver."}
      for file in ["03-retry-obligation-inspection.log", "03-final-retry-inspection.log", "03-selected-retry-inspection.log"]],
    {"command": command + check, "log": "logs/03-second-proof.log", "exitCode": 0,
     "observed": "Single informed proof retry: all three modules verified at 23594.679583 ms, cold receipts written."},
    {"command": command + check + " --resume-second", "log": "logs/04-campaign.log", "exitCode": 1,
     "observed": "Baseline audit passed. Wrong-order source/native/replay controls passed. A negative-case audit exposed a timeout; an overly specific owned disagreement assertion stopped the campaign."},
    {"command": command + check + " --continue-controls", "log": "logs/05-controls-continuation.log", "exitCode": 1,
     "observed": "Original positive proofs and replay reused with identity/hash checks; weak-contract caller timed out. An owned assertion predicted contract-gap too narrowly."},
    {"command": command + "node --test --test-concurrency=1 --test-name-pattern='GPL report pilot|Remeda proof fixture rejects|unsupported stateful loops|unmodeled top-level execution' tests/verify/mutating-loop-pin.test.mjs tests/verify/remeda-take.test.mjs tests/verify/stateful-boundaries.test.mjs tests/verify/source.test.mjs",
     "log": "logs/06-maintained-checkers.log", "exitCode": 0, "observed": "4 selected maintained checks passed; no full suite or K corpus."},
    {"command": command + check + " --continue-controls", "log": "logs/07-complete-controls.log", "exitCode": 1,
     "observed": "See complete campaign receipt and measured-outcomes.json; resource unknowns remain ISSUES."},
    {"command": command + "node verify/reports/roadmap/library-composition/check-witnesses.mjs", "log": "logs/08-native-witnesses.log", "exitCode": 0,
     "observed": "Four recorded reports, twelve actual wrapper executions. Helper witness passes wrapper; separate [1,2] mutant wrapper fails. Wrong-order wrapper witness fails contents only."},
    {"command": command + "node --check verify/reports/roadmap/library-composition/campaign.mjs", "log": "logs/09-checker-syntax.log", "exitCode": 0,
     "observed": "Final campaign checker syntax accepted."},
    {"command": command + "python3 verify/reports/roadmap/library-composition/record.py", "log": "logs/10-recording.log", "exitCode": 0,
     "observed": "Imported authors and patch identities checked; 129 maintained verifier/test files unchanged; report inventory generated. Repeated without redirect after final documentation and cleanup."},
    {"command": command + "python3 verify/reports/roadmap/library-composition/record.py --check", "exitCode": 0,
     "observed": "Final artifact hashes and unchanged core checked after generation; stdout is in the agent tool result, not a self-hashed output file."},
]
put("commands.json", commands)
put("receipt.json", {"status": "ISSUES", "codeHead": CODE_HEAD, "checkout": str(ROOT),
                     "scope": "Pinned Reverse + eager take composition; no K/Q completion claim.",
                     "evidence": "measured-outcomes.json", "commands": "commands.json",
                     "coreFilesCheckedUnchanged": len(core),
                     "limits": "One initial timeout and later independent P resource unknowns remain visible. No unknown is a proof or an upstream bug.",
                     "cleanup": {"workDirectoryRemoved": not (HERE / ".work").exists(),
                                 "temporaryDependencyLinkRemoved": not (ROOT / "node_modules").is_symlink()}})
assert not (HERE / ".work").exists(), "Finish all runs before recording."
assert not (ROOT / "node_modules").is_symlink(), "Remove the temporary dependency link before final recording."
files = sorted(p for p in HERE.rglob("*") if p.is_file() and p.name != "SHA256SUMS")
(HERE / "SHA256SUMS").write_text("".join(f"{sha(p)}  {p.relative_to(HERE)}\n" for p in files))
print(json.dumps({"status": "ISSUES", "filesHashed": len(files), "outcomesRecorded": len(outcomes)}))
