"""Audit this maintenance run without importing the verifier or starting solvers.

Usage: python3 .../audit.py NEW_OUTPUT_DIRECTORY [--historical]
       python3 .../audit.py --inventory
Historical object checks are explicit and are not campaign prerequisites.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback

here = Path(__file__).resolve().parent
package = here.parent
root = here.parents[4]
prefix = package.relative_to(root).as_posix()
prepared = "5f0fb47a0a822d62537f296ef804d5037eebba5c"
baseline = "32bd5b260aa116ca88642a1479bed8d3fc447f4b"
digest = lambda data: hashlib.sha256(data).hexdigest()
compact = lambda data: json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
load = lambda path: json.loads(path.read_text())
write = lambda path, data: path.write_text(json.dumps(data, indent=2) + "\n")

if sys.argv[1:] == ["--inventory"]:
    inventory = package / "maintenance-SHA256SUMS"
    checked = here / "checksum-check.json"
    paths = sorted(path for path in package.rglob("*") if path.is_file() and path not in (inventory, checked))
    assert not any(part.startswith(".") for path in paths for part in path.relative_to(package).parts)
    inventory.write_text("".join(f"{digest(path.read_bytes())}  {path.relative_to(root).as_posix()}\n" for path in paths))
    argv = ["shasum", "-a", "256", "-c", str(inventory.relative_to(root))]
    r = subprocess.run(argv, cwd=root, capture_output=True)
    write(checked, dict(argv=argv, cwd=str(root), at=datetime.now(timezone.utc).isoformat(), status=r.returncode,
                        entries=len(paths), inventorySha256=digest(inventory.read_bytes()),
                        stdoutSha256=digest(r.stdout), stderr=r.stderr.decode(),
                        allEntriesOK=r.stdout.count(b": OK\n") == len(paths),
                        exclusions=[str(inventory.relative_to(root)), str(checked.relative_to(root))]))
    assert r.returncode == 0 and r.stdout.count(b": OK\n") == len(paths), r.stderr.decode()
    print(f"PASS: {len(paths)} current inventory entries; only the inventory and its derived check record excluded")
    raise SystemExit(0)

out = Path(sys.argv[1]).resolve()
assert root in out.parents and not out.exists(), "Use a new output directory in this checkout."
out.mkdir(parents=True)
commands, checks = [], []


def command(argv, data=None):
    r = subprocess.run(argv, cwd=root, input=data, capture_output=True)
    commands.append(dict(argv=argv, cwd=str(root), status=r.returncode,
                         stdinSha256=digest(data) if data is not None else None,
                         stdoutSha256=digest(r.stdout), stderr=r.stderr.decode()))
    assert r.returncode == 0, r.stderr.decode()
    return r.stdout


def git(*args):
    return command(["git", *args]).decode().strip()


def blobs(ref, paths):
    raw = command(["git", "cat-file", "--batch"], "".join(f"{ref}:{p}\n" for p in paths).encode())
    found, at = {}, 0
    for path in paths:
        end = raw.index(b"\n", at)
        _, kind, size = raw[at:end].split()
        assert kind == b"blob"
        at = end + 1
        found[path] = raw[at:at + int(size)]
        at += int(size)
        assert raw[at:at + 1] == b"\n"
        at += 1
    assert at == len(raw)
    return found


def passed(name, detail):
    checks.append(dict(name=name, status="PASS", detail=detail))


try:
    campaign = here / "04-current/campaign"
    run = load(campaign / "run.json")
    launch = load(here / "04-current/launch.json")
    model = load(campaign / "model.json")
    evidence = load(campaign / "evidence.json")
    focused = load(here / "05-focused/result.json")
    git("merge-base", "--is-ancestor", baseline, prepared)
    git("merge-base", "--is-ancestor", prepared, run["codeHead"])
    assert (root / "verify").is_dir()
    assert git("diff", prepared, "--", ".", f":(exclude){prefix}/**") == ""
    assert git("diff", "HEAD", "--", prefix) == ""
    untracked = git("ls-files", "--others", "--exclude-standard").splitlines()
    assert all(path.startswith(prefix + "/") for path in untracked)
    passed("scope-and-baseline", dict(preparedHead=prepared, testedHead=run["codeHead"], baseline=baseline,
                                     productionLockfileCanonicalAndOtherPathsUnchanged=True))

    snapshots = [load(campaign / name) for name in ("freeze.before.json", "freeze.after.json", "supervisor-freeze.before.json", "supervisor-freeze.after.json")]
    before = snapshots[0]
    assert all(snapshot == before for snapshot in snapshots)
    assert before["head"] == run["codeHead"] == model["codeHead"] == focused["codeHead"]
    assert before["headTree"] == git("rev-parse", run["codeHead"] + "^{tree}") == model["codeTree"]
    assert before["trackedChanges"] == ""
    assert digest(compact({k: v for k, v in before.items() if k != "snapshotSha256"})) == before["snapshotSha256"]
    assert before["snapshotSha256"] == model["inputSnapshotSha256"] == run["inputSnapshotSha256"] == focused["inputSnapshotSha256"]
    assert load(here / "05-focused/freeze.before.json") == load(here / "05-focused/freeze.after.json") == before
    for category in ("trackedFiles", "currentRuntime", "checker"):
        for path, expected in before[category].items():
            assert digest((root / path).read_bytes()) == expected, path
    identity_fields = ("schema", "files", "packages", "builtins", "runtime", "protocol")
    assert digest(compact({k: model[k] for k in identity_fields})) == model["sha256"]
    for path, expected in model["files"]:
        assert before["currentRuntime"]["verify/" + path] == expected
    assert model["sha256"] == evidence["modelIdentity"]
    old_identity = load(package / "evidence/03-final/model.json")["sha256"]
    assert model["sha256"] != old_identity
    passed("current-frozen-inputs-and-model", dict(head=before["head"], tree=before["headTree"], snapshotSha256=before["snapshotSha256"],
           trackedFiles=len(before["trackedFiles"]), currentRuntimeFiles=len(before["currentRuntime"]), checkerInputs=len(before["checker"]),
           modelIdentity=model["sha256"], historicalIdentity=old_identity, allFourCampaignAndTwoFocusedSnapshotsEqual=True))

    comparisons = 0
    for container in (run, evidence):
        for name, entry in container["artifacts"].items():
            assert digest((campaign / name).read_bytes()) == entry["sha256"], name
            comparisons += 1
    assert run["status"] == evidence["status"] == "PASS" and launch["status"] == 0
    expected_stages = ["native-harmonic", "native-d3", "native-cycle100", "native-cycle5", "cycle-diagnostic", "d3-admission", "harmonic", "ramda", "query-inputs", "freeze-and-model"]
    assert [s["id"] for s in evidence["stages"]] == expected_stages
    assert all(s["status"] == "PASS" for s in evidence["stages"])
    assert evidence["qComplete"] is evidence["kComplete"] is evidence["independentReviewComplete"] is False
    assert focused["status"] == "PASS" and len(focused["checks"]) == 12
    assert all(c["status"] == "PASS" for c in focused["checks"])
    boundary = load(campaign / "input-boundary.json")
    assert boundary["history"] == dict(requested=False, checked=False)
    assert boundary["documentation"]["freshDownload"] is False
    assert boundary["documentation"]["checkedDocumentBytesThisRun"] is False
    assert launch["noPrivateObjectProbe"]["status"] == 128 and launch["normalGitProbe"]["status"] == 0
    passed("stages-focused-controls-and-artifact-hashes", dict(stages=expected_stages, focusedChecks=12, recordedArtifactHashComparisons=comparisons,
           defaultCampaignPassedWithoutPrivateObject=True, inheritedDocumentAttestationNotFreshDownload=True))

    harmonic = load(campaign / "harmonic/checks.json")
    receipt = load(campaign / "harmonic/total.receipt.json")
    proof = load(campaign / "harmonic/total.report.json")
    warm = load(campaign / "harmonic/total.warm.json")
    positive = load(campaign / "harmonic/positive.evidence.json")
    assert harmonic["status"] == "PASS" and harmonic["identity"] == receipt["identity"] == positive["identity"] == model["sha256"]
    assert proof["outcomes"][0]["status"] == warm["outcomes"][0]["status"] == "verified"
    assert len(proof["cache"]["written"]) == len(warm["cache"]["hits"]) == 1 and warm["cache"]["solved"] == []
    assert load(campaign / "harmonic/positive.report.json")["cache"]["written"] == []
    assert harmonic["confirmed"] is True and harmonic["positive"] == "counterexample"
    assert harmonic["staleSource"] == "stale" and harmonic["staleModel"] == "invalid-evidence"
    assert load(campaign / "cli-reproduce.stdout.txt")["status"] == "reproduced"
    weak = load(campaign / "harmonic/weak.report.json")["outcomes"][0]
    assert (weak["status"] == "unknown" and weak["reason"] == "induction-gap") or (weak["status"] == "counterexample" and weak["confirmed"])
    ramda = load(campaign / "ramda.json")
    assert [r["outcomes"][0]["status"] for r in ramda["checks"]] == ["verified", "counterexample", "counterexample"]
    assert all(r["outcomes"][0]["confirmed"] for r in ramda["checks"][1:]) and ramda["nativeSamples"] == 42
    queries = list((campaign / "query-inputs").glob("*.json"))
    assert len(queries) == 6 and all(load(path)["identity"] == model["sha256"] for path in queries)
    passed("fresh-proofs-replays-and-current-receipt", dict(harmonic=harmonic, weakStatus=weak["status"], ramdaTheoremAndBothMutants=True,
           ramdaNativeComparisons=42, queryPlans=6, totalReceiptKey=receipt["key"], receiptIsCertificate=False))

    for name in ("native-cycle100", "native-cycle5"):
        row = load(campaign / (name + ".command.json"))
        assert row["error"]["code"] == "ETIMEDOUT" and row["signal"] == "SIGKILL" and row["timeoutMs"] == 2000
        assert row["aliveAfterWait"] is False
    admission = load(campaign / "d3-admission.json")["outcomes"][0]
    assert admission["status"] == "unsupported" and admission["span"] == dict(start=0, end=73)
    diagnostic = load(campaign / "d3-cycle-diagnostic.json")
    assert all(r["repeat"] == dict(first=2, repeated=4, period=2) for r in diagnostic["results"])
    passed("d3-unknowns-stay-unknown", dict(nativeTimeouts=2, timeoutMs=2000, classification="unknown/unsupported", admission=admission,
                                         cycleArgument="Separate instrumented finite diagnostic, conditional on pure deterministic builtins; no source-verifier proof"))

    historical = [f"{prefix}/{name}" for name in ("report.md", "manifest.json", "integrity.json", "cleanup.json", "SHA256SUMS", "bugs.md", "pins", "evidence")]
    assert git("diff", prepared, "--", *historical) == ""
    if "--historical" in sys.argv[2:]:
        owner = "7e6d9b56c36e89dac9d9b7943771feb8af4dd0ab"
        inventory = (package / "SHA256SUMS").read_bytes()
        assert command(["git", "show", owner + ":" + prefix + "/SHA256SUMS"]) == inventory
        rows = [line.split("  ", 1) for line in inventory.decode().splitlines()]
        assert len(rows) == 161
        old_blobs = blobs(owner, [path for _, path in rows])
        assert all(digest(old_blobs[path]) == expected for expected, path in rows)
        integrity = load(package / "integrity.json")
        parent = "203ad818169be544432b3bad93ff1c4f01ef20a3"
        paths = command(["git", "ls-tree", "-r", "--name-only", "-z", parent]).decode().rstrip("\0").split("\0")
        old_parent = blobs(parent, paths)
        old_digest = digest(compact([[path, digest(old_parent[path])] for path in paths]))
        assert len(paths) == integrity["preparedFilesHashed"] == 825
        assert old_digest == integrity["preparedFilesDigest"]
        red = load(here / "01-red/result.json")
        assert digest(blobs(prepared, [prefix + "/check.mjs"])[prefix + "/check.mjs"]) == red["checkerSha256"]
        passed("explicit-historical-owner-audit", dict(inventoryOwner=owner, inventoryRows=len(rows), preparedParent=parent,
               historicalParentFiles=len(paths), historicalParentDigest=old_digest, originalREDCheckerHash=red["checkerSha256"]))
    passed("historical-records-unchanged", dict(paths=historical, original161EntryInventoryUnmodified=True,
           validation="at its owning head only; not asserted against the maintained checker"))

    pids = {launch["pid"], run["supervisorPid"], run["lanePid"]}
    for path in campaign.glob("*.command.json"):
        row = load(path)
        assert row["aliveAfterWait"] is False
        if row.get("pid"):
            pids.add(row["pid"])
    for name in ("02-focused", "03-focused", "05-focused"):
        for row in load(here / name / "commands.json"):
            assert row["aliveAfterWait"] is False
            if row.get("pid"):
                pids.add(row["pid"])
    live = []
    for pid in sorted(pids):
        try:
            os.kill(pid, 0)
            live.append(pid)
        except ProcessLookupError:
            pass
    assert not live, live
    try:
        os.kill(-run["lanePid"], 0)
        raise AssertionError("Campaign process group still exists")
    except ProcessLookupError:
        pass
    assert run["remainingProcessGroupAfterWait"] is launch["aliveAfterWait"] is False
    assert run["protectedFilesUnchanged"] is True
    assert not os.path.lexists(root / "node_modules")
    scratch = sorted(str(path) for path in package.iterdir() if path.name.startswith((".maintenance-test-", ".red-fixture-", ".no-private-git-")))
    assert not scratch
    ps = command(["ps", "-ax", "-o", "pid=,ppid=,pgid=,state=,command="]).decode()
    matches = [line for line in ps.splitlines() if str(root) in line and int(line.split()[0]) not in (os.getpid(), os.getppid())]
    assert not matches, matches
    passed("cleanup-and-no-raw-source-mutation", dict(checkedPids=sorted(pids), liveKnownPids=live, liveOwnedCommandMatches=matches,
           laneProcessGroupAbsent=True, dependencyLinkRemoved=True, dependencyLinkDuringRun=run["dependencyLink"], scratchDirectories=scratch,
           noRawSourceMutation=True, protectedSnapshotUnchanged=True))
    write(out / "result.json", dict(status="PASS", classification="measured checks of retained artifacts and live state", at=datetime.now(timezone.utc).isoformat(), checks=checks))
except Exception as error:
    write(out / "result.json", dict(status="ISSUES", checks=checks, error=str(error), traceback=traceback.format_exc()))
    raise
finally:
    write(out / "commands.json", commands)
print(f"PASS: {len(checks)} audit groups; no verifier import or solver")
