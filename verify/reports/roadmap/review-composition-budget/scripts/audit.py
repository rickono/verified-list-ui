"""Read-only audit of the composition-budget evidence. Writes one JSON log."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

review = Path(__file__).resolve().parents[1]
evidence = review.parents[0] / "composition-budget"
root = review.parents[3]
out = review / "logs" / "artifact-audit.json"

def load(path):
    return json.loads(path.read_text())

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def git(*args):
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()

def tap(path):
    text = path.read_text()
    summary = {key: int(re.search(rf"^# {key} (\d+)$", text, re.M)[1])
               for key in ["tests", "pass", "fail", "cancelled", "skipped", "todo"]}
    return {"summary": summary, "ok": len(re.findall(r"^ok \d+ ", text, re.M)),
            "notOk": len(re.findall(r"^not ok \d+ ", text, re.M))}

findings = []
def check(name, ok, detail):
    findings.append({"check": name, "ok": bool(ok), "detail": detail})

sums = []
for line in (evidence / "SHA256SUMS").read_text().splitlines():
    expected, name = line.split("  ", 1)
    actual = sha256(evidence / name)
    sums.append({"name": name, "match": actual == expected})
check("sha256sums", all(row["match"] for row in sums) and len(sums) == 67,
      {"files": len(sums), "mismatches": [row["name"] for row in sums if not row["match"]]})

code_inputs = load(evidence / "code-inputs.json")
code_mismatches = []
for name, expected in code_inputs.items():
    blob = subprocess.check_output(["git", "show", f"7feca2830d90e237227fc1522e77e1a11ce3abee:{name}"], cwd=root)
    if hashlib.sha256(blob).hexdigest() != expected:
        code_mismatches.append(name)
    work = hashlib.sha256((root / name).read_bytes()).hexdigest()
    if work != expected:
        code_mismatches.append(f"worktree:{name}")
check("code-inputs-match-7feca28-and-worktree", not code_mismatches,
      {"files": len(code_inputs), "mismatches": code_mismatches})

focused = tap(evidence / "focused.txt")
full = tap(evidence / "full-final.txt")
check("focused-46", focused["summary"] == {"tests": 46, "pass": 46, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0}
      and focused["notOk"] == 0, focused)
check("full-483", full["summary"] == {"tests": 483, "pass": 483, "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0}
      and full["notOk"] == 0, {"summary": full["summary"], "okLines": full["ok"], "notOk": full["notOk"]})

runs = {name: load(evidence / f"{name}.run.json") for name in
        ["focused", "full-final", "production180", "scratch180", "parent-red", "parent-model-drift", "harmonic-current"]}
check("full-suite-committed-clean", runs["full-final"]["head"] == "7feca2830d90e237227fc1522e77e1a11ce3abee"
      and runs["full-final"]["exitCode"] == 0 and runs["full-final"]["trackedDiff"] == "",
      {"head": runs["full-final"]["head"], "exit": runs["full-final"]["exitCode"],
       "elapsedIncludingQueueSeconds": runs["full-final"]["elapsedIncludingQueueSeconds"]})
check("focused-is-parent-plus-dirty-diff", runs["focused"]["head"] == "2809e885ef01e09da906ddc31e070fde1df180a2"
      and runs["focused"]["exitCode"] == 0 and "timeoutMs > 180_000" in runs["focused"]["trackedDiff"]
      and "budgets.test.mjs" not in runs["focused"]["trackedDiff"],
      {"head": runs["focused"]["head"], "exit": runs["focused"]["exitCode"]})

queries = load(evidence / "queries.json")
parent_queries = load(evidence / "parent-queries.json")
rows = queries["rows"]
historical_dir = root / "verify/reports/roadmap/library-composition/logs/second-obligations"
historical = []
for row in rows:
    file = historical_dir / row["name"]
    actual = sha256(file) if file.is_file() else None
    historical.append({"name": row["name"], "recordedEqual": row["equal"],
                       "fileSha": actual, "recordedHistorical": row["historicalSha256"],
                       "recordedCurrent": row["currentSha256"],
                       "fileMatchesRecord": actual == row["historicalSha256"] == row["currentSha256"]})
check("fifteen-postcondition-strings", len(rows) == 15 and queries["allIdentical"] and all(item["fileMatchesRecord"] for item in historical)
      and all(a["currentSha256"] == b["currentSha256"] for a, b in zip(rows, parent_queries["rows"])),
      {"count": len(rows), "historicalFiles": len(list(historical_dir.glob('*.smt2'))),
       "mismatches": [item["name"] for item in historical if not item["fileMatchesRecord"]]})
check("thirty-six-phases", len(queries["allPhases"]) == 36 and queries["allPhases"] == parent_queries["allPhases"],
      {"current": len(queries["allPhases"]), "parent": len(parent_queries["allPhases"]),
       "currentHead": queries["head"], "parentHead": parent_queries["head"],
       "currentIdentity": queries["identity"], "parentIdentity": parent_queries["identity"]})

comparison = load(evidence / "proof-comparison.json")
production_cold = load(evidence / "production-cold.json")
root_cold = load(evidence / "root-60s/cold.json")
check("graph-and-module-hash", production_cold["graphSha256"] == root_cold["graphSha256"] == comparison["graphSha256"]
      == "c59463e822bf9ad28cb373d08d2d36389d364573a4f7697f4c177e0311ad38e2"
      and [m["sha256"] for m in production_cold["modules"]] == [m["sha256"] for m in root_cold["modules"]],
      {"graph": production_cold["graphSha256"]})

def outcome(report):
    return [{k: o.get(k) for k in ["fn", "status", "reason"]} | {"phase": (o.get("obligation") or {}).get("phase"),
            "postcondition": (o.get("obligation") or {}).get("postcondition"),
            "postconditionCount": (o.get("obligation") or {}).get("postconditionCount"),
            "attempts": o.get("attempts"), "label": (o.get("label") or {}).get("kind")} for o in report["outcomes"]]

root_outcomes = outcome(root_cold)
check("historical-60s-unknown", root_outcomes[0]["fn"] == "Reverse" and root_outcomes[0]["status"] == "unknown"
      and root_outcomes[0]["reason"] == "request-timeout" and root_outcomes[0]["postcondition"] == 6
      and root_outcomes[0]["postconditionCount"] == 9 and root_outcomes[0]["label"] == "invariant-preserve"
      and root_outcomes[0]["attempts"] == 10, root_outcomes)

production = load(evidence / "production-receipt.json")
scratch = load(evidence / "scratch-receipt.json")
cold, warm, audit = (load(evidence / f"production-{name}.json") for name in ["cold", "warm", "audit"])
check("production-requests", [(r["name"], r["elapsedMs"], r["hits"], r["solved"], r["written"]) for r in production["receipts"]]
      == [("cold", 36139.706917, 0, 3, 3), ("warm", 94.79954199999338, 3, 0, 0), ("audit", 35429.267167000005, 3, 3, 0)]
      and all(o["status"] == "verified" for report in (cold, warm, audit) for o in report["outcomes"])
      and audit["cache"]["disagreements"] == [] and audit["cache"]["written"] == []
      and production["identity"]["sha256"] == "09d21829d8ea449858782577b32ed5531b112b3fa2b9cfbe06ced64f767b28ef",
      {"receipts": production["receipts"], "auditDisagreements": audit["cache"]["disagreements"]})
check("scratch-cold-only", scratch["receipts"][0]["elapsedMs"] == 33149.001291 and len(scratch["receipts"]) == 1
      and scratch["identity"]["sha256"] == production["identity"]["sha256"]
      and sha256(evidence / "scratch-cold.json") == sha256(evidence / "production-cold.json"),
      {"elapsedMs": scratch["receipts"][0]["elapsedMs"], "identity": scratch["identity"]["sha256"]})

ipc = load(evidence / "scratch-ipc.json")
pending, paired = {}, []
for event in ipc:
    if event.get("event") == "query":
        pending.setdefault(event["worker"], []).append(event)
    elif event.get("event") == "response" and event.get("id"):
        query = pending[event["worker"]].pop(0)
        paired.append({**query, "elapsedMs": event.get("elapsedMs"), "status": (event.get("answer") or {}).get("status")})
reverse = [{"phase": q["phase"], "postcondition": q.get("postcondition"), "domain": q["domain"],
            "budgetMs": q["budgetMs"], "sentAtMs": q["sentAtMs"], "elapsedMs": q["elapsedMs"],
            "status": q["status"], "querySha256": q["querySha256"]}
           for q in paired if q.get("target", "").endswith("#Reverse")]
preserve = next(q for q in reverse if q["phase"] == "postcondition" and q["postcondition"] == 6)
earlier = [q for q in reverse if q["sentAtMs"] < preserve["sentAtMs"]]
check("ipc-first-turn", reverse[0]["budgetMs"] == 89951 and preserve["budgetMs"] == 86719
      and abs(preserve["elapsedMs"] - 29165.535) < 0.01 and preserve["status"] == "unsat"
      and abs(sum(q["elapsedMs"] for q in earlier) - 3300) < 200,
      {"firstBudget": reverse[0]["budgetMs"], "preserve": preserve,
       "earlierElapsedMs": sum(q["elapsedMs"] for q in earlier), "reverseQueries": len(reverse),
       "spawned": sum(1 for e in ipc if e.get("event") == "spawn"),
       "closed": sum(1 for e in ipc if e.get("event") == "close")})

parent_artifact = root / "verify/reports/roadmap/library-campaigns/evidence/03-final/harmonic/positive.evidence.json"
parent_bytes = load(parent_artifact)
recorded_refusal = load(evidence / "harmonic-parent-invalid.json")
check("parent-138-artifact", sha256(parent_artifact) == recorded_refusal["artifactSha256"]
      == "402863e3a122ccef199c13b66bd9f2dddb4feb8f4fcd500bf3b28fefab444ab1"
      and parent_bytes["identity"] == recorded_refusal["parentIdentity"]
      == "13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106"
      and recorded_refusal["currentIdentity"].startswith("09d21829")
      and recorded_refusal["result"]["status"] == "invalid-evidence",
      {"artifactIdentity": parent_bytes["identity"], "result": recorded_refusal["result"]})

harmonic = load(evidence / "harmonic-receipt.json")
weak = load(evidence / "harmonic/weak.report.json")
old = load(evidence / "harmonic-old-invalid.json")
check("harmonic-09", harmonic["status"] == "PASS" and harmonic["identity"].startswith("09d21829")
      and harmonic["total"] == "verified" and harmonic["positive"] == "counterexample" and harmonic["confirmed"]
      and harmonic["qComplete"] is False and weak["outcomes"][0]["status"] == "counterexample"
      and old["status"] == "invalid-evidence",
      {"identity": harmonic["identity"], "weak": weak["outcomes"][0]["status"], "old": old,
       "native": harmonic["nativeWitness"]})

full_text = (evidence / "full-final.txt").read_text()
check("suite-weak-not-relabeled", '"weak":{"status":"unknown","reason":"induction-gap"}' in full_text
      and '"id":"alias-inc-into-no-suffix"' in full_text and '"reason":"request-timeout"' in full_text,
      {"dedicatedWeak": weak["outcomes"][0]["status"], "suiteContainsUnknownWeak": True})

inputs = load(root / "verify/reports/roadmap/library-campaigns/inputs.json")
production_names = [name for name in inputs["files"] if name.startswith("verify/") and (name.count("/") == 1 or name.startswith("verify/bin/"))]
production_names += ["pnpm-lock.yaml", "package.json"]
diff = subprocess.check_output(["git", "diff", "--name-only", inputs["runtimeEquivalentTo"], "HEAD", "--", *production_names], cwd=root, text=True).splitlines()
pin_mismatches = []
for name in ["verify/index.mjs", "verify/bin/jsverify.mjs"]:
    if sha256(root / name) != inputs["files"][name]:
        pin_mismatches.append(name)
check("campaign-runner-cap-interaction", diff == ["verify/bin/jsverify.mjs", "verify/index.mjs"] and pin_mismatches == ["verify/index.mjs", "verify/bin/jsverify.mjs"],
      {"runtimeEquivalentTo": inputs["runtimeEquivalentTo"], "diff": diff, "pinMismatches": pin_mismatches,
       "note": "Cap-specific interaction only. The historical runner hash/private-commit dependency is not repaired here."})

policy = {
    "indexCeilingOnly": git("diff", "7feca28^", "7feca28", "--", "verify/index.mjs").count("180_000") == 1,
    "unchanged": {name: git("rev-parse", f"7feca28^:{name}") == git("rev-parse", f"HEAD:{name}")
                  for name in ["verify/proofs.mjs", "verify/backend.mjs", "verify/solver.mjs", "verify/data.mjs", "verify/cache.mjs"]},
}
check("scheduler-blobs-unchanged", all(policy["unchanged"].values()), policy)

prepared = git("rev-parse", "HEAD")
ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", "32bd5b260aa116ca88642a1479bed8d3fc447f4b", "HEAD"], cwd=root).returncode == 0
check("prepared-checkout", prepared == "5f0fb47a0a822d62537f296ef804d5037eebba5c" and ancestor and (root / "verify").is_dir(),
      {"preparedHead": prepared, "baselineAncestor": ancestor})

impl_blobs = {}
for name in ["verify/index.mjs", "verify/bin/jsverify.mjs", "tests/verify/budgets.test.mjs", "tests/verify/proof-backends.test.mjs", "tests/verify/backend-process.test.mjs", "verify/README.md"]:
    impl_blobs[name] = git("rev-parse", f"7feca28:{name}") == git("rev-parse", f"045139c:{name}") == git("rev-parse", f"HEAD:{name}")
evidence_same = subprocess.run(["git", "diff", "--exit-code", "c84aeab73ad34b9aa1a83f3b2ee4e682e39bcba3", "6e0843e9b216b053ceae09cf052ba13447af505c", "--", "verify/reports/roadmap/composition-budget"], cwd=root).returncode == 0
check("imported-blobs", all(impl_blobs.values()) and evidence_same, {"files": impl_blobs, "evidenceTreeIdentical": evidence_same})

report = {"status": "PASS" if all(item["ok"] for item in findings) else "ISSUES", "findings": findings}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"status": report["status"], "checks": len(findings), "failed": [item["check"] for item in findings if not item["ok"]]}))
