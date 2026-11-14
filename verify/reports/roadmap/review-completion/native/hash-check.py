"""Hash-check retained completion receipts without solving or rewriting them."""
import hashlib
import json
import subprocess
from pathlib import Path

prepared = Path("/Users/rick/.t3/worktrees/verified-list-ui/t3-09fc5ec2")
archive = Path("/Users/rick/.t3/worktrees/verified-list-ui/t3-64551363")
evidence = archive / "verify/reports/roadmap/conditional-completion-evidence"
implementation = "20ff20556fe19a72f73ccf3708d7bd7329ec2bc0"
out = prepared / "verify/reports/roadmap/review-completion/native/hash-check.json"


def git_blob(commit, path):
    return subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=archive)


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def tail_counts(path):
    text = path.read_text(errors="replace")
    counts = {}
    for line in text.splitlines():
        for key in ("tests", "pass", "fail", "cancelled", "skipped"):
            prefix = f"# {key} "
            if line.startswith(prefix):
                counts[key] = int(line[len(prefix):])
    return counts, text.count("\nnot ok "), "not ok" in text


sums = []
mismatches = []
for line in (evidence / "SHA256SUMS").read_text().splitlines():
    if not line.strip():
        continue
    digest, path = line.split("  ", 1)
    actual = sha_file(archive / path)
    sums.append(path)
    if actual != digest:
        mismatches.append({"path": path, "sums": digest, "archive": actual})

receipts = {}
for label in ("focused-1", "focused-2", "focused-final", "full-final"):
    receipt = json.loads((evidence / label / "receipt.json").read_text())
    counts, not_ok, has_failure = tail_counts(evidence / label / "run.txt")
    compared = []
    for path, expected in receipt["sha256"].items():
        blob = sha_bytes(git_blob(implementation, path))
        working = sha_file(archive / path)
        compared.append({
            "path": path,
            "receipt": expected,
            "matchesImplementation": blob == expected,
            "matchesArchive": working == expected,
        })
    receipts[label] = {
        "exitCode": receipt["exitCode"],
        "runHead": receipt["runHead"],
        "preparedHead": receipt["preparedHead"],
        "coreUnchangedDuringRun": receipt["coreUnchangedDuringRun"],
        "counts": counts,
        "notOkMarkers": not_ok,
        "preservesFailureText": has_failure,
        "hashMismatchesAgainstImplementation": [row["path"] for row in compared if not row["matchesImplementation"]],
        "hashMismatchesAgainstArchive": [row["path"] for row in compared if not row["matchesArchive"]],
    }

result = {
    "implementation": implementation,
    "archiveHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=archive, text=True).strip(),
    "sha256sumsEntries": len(sums),
    "sha256sumsMismatches": mismatches,
    "receipts": receipts,
    "focusedFinalIs61": receipts["focused-final"]["counts"].get("tests") == 61 and receipts["focused-final"]["counts"].get("pass") == 61 and receipts["focused-final"]["counts"].get("fail") == 0 and receipts["focused-final"]["exitCode"] == 0,
    "fullFinalIs496": receipts["full-final"]["counts"].get("tests") == 496 and receipts["full-final"]["counts"].get("pass") == 496 and receipts["full-final"]["counts"].get("fail") == 0 and receipts["full-final"]["exitCode"] == 0,
    "focused1PreservedFailure": receipts["focused-1"]["exitCode"] == 1 and receipts["focused-1"]["counts"].get("fail") == 6 and receipts["focused-1"]["preservesFailureText"],
}
out.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({
    "sha256sumsEntries": result["sha256sumsEntries"],
    "sha256sumsMismatches": len(mismatches),
    "focusedFinalIs61": result["focusedFinalIs61"],
    "fullFinalIs496": result["fullFinalIs496"],
    "focused1PreservedFailure": result["focused1PreservedFailure"],
    "focused1DiffersFromImplementation": len(receipts["focused-1"]["hashMismatchesAgainstImplementation"]),
    "finalReceiptMismatches": {
        label: receipts[label]["hashMismatchesAgainstImplementation"]
        for label in ("focused-final", "full-final")
    },
}, indent=2))
