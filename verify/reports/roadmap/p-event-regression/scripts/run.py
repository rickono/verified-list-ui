"""Offline, four-case issue7 pilot. Invoke only through the shared serial lane."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile

OWNED = Path(__file__).resolve().parents[1]
REPO = OWNED.parents[3]
RELATIVE = str(OWNED.relative_to(REPO))
FROZEN_EXPECTATIONS = "2ef1d38ab326c7ab0d3a000cc8049b8125fc22bdc27ed4bab4ca37472cebe500"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", required=True, help="New evidence directory inside this pilot")
args = parser.parse_args()
output = Path(args.output).resolve()
assert output.is_relative_to(OWNED) and not output.exists(), "Use a new task-owned output directory"
output.mkdir(parents=True)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(name, value):
    (output / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


git_commands = []


def git(*arguments):
    command = ["git", *arguments]
    result = subprocess.run(command, cwd=REPO, capture_output=True, check=False)
    git_commands.append({"command": command, "exitCode": result.returncode,
                         "stdout": result.stdout.decode(), "stderr": result.stderr.decode()})
    assert result.returncode == 0, git_commands[-1]
    return result.stdout


def runtime_manifest():
    paths = git("ls-files", "-z", "verify").decode().split("\0")
    paths = [p for p in paths if p.endswith(".mjs") and not p.startswith("verify/reports/")]
    paths += ["package.json", "pnpm-lock.yaml"]
    return {p: sha((REPO / p).read_bytes()) for p in sorted(paths)}


def group_exists(pid):
    try:
        os.killpg(pid, 0)
        return True
    except ProcessLookupError:
        return False


children = []
processes = []
temporary = None
summary = {"classification": "measured", "scope": "p-event historical issue7 only",
           "startedUTC": datetime.now(timezone.utc).isoformat(), "taskStatus": "BLOCKED"}
try:
    provenance = json.loads((OWNED / "provenance.json").read_text())
    expectations_bytes = (OWNED / "expectations.json").read_bytes()
    assert sha(expectations_bytes) == FROZEN_EXPECTATIONS, "Frozen expectations changed"
    expectations = json.loads(expectations_bytes)
    summary["preparedHead"] = provenance["preparedHead"]
    summary["executedHead"] = git("rev-parse", "HEAD").decode().strip()
    summary["baseline"] = provenance["baseline"]
    git("merge-base", "--is-ancestor", provenance["baseline"], "HEAD")
    git("merge-base", "--is-ancestor", provenance["preparedHead"], "HEAD")
    assert (REPO / "verify").is_dir()
    git("diff", "--exit-code", provenance["preparedHead"], "--", ".", f":(exclude){RELATIVE}")
    summary["baselineAncestor"] = True
    summary["verifyPresent"] = True
    summary["coordinatorFullSuite"] = provenance["coordinatorFullSuite"]
    implementation_before = runtime_manifest()
    save("implementation-before.json", implementation_before)
    inputs = {str(p.relative_to(OWNED)): sha(p.read_bytes())
              for p in sorted(OWNED.rglob("*"))
              if p.is_file() and (p.is_relative_to(OWNED / "pins") or p.is_relative_to(OWNED / "scripts")
                                  or p.name in ["expectations.json", "provenance.json"])}
    save("frozen-inputs.json", {"expectationsSha256": FROZEN_EXPECTATIONS, "files": inputs})
    fidelity = []
    for snapshot in provenance["snapshotValidation"]:
        path = OWNED / snapshot["path"]
        data = path.read_bytes()
        assert sha(data) == snapshot["sha256"] and len(data) == snapshot["bytes"], str(path)
        fidelity.append({"path": snapshot["path"], "sha256": sha(data), "matches": True})
    temporary = tempfile.TemporaryDirectory(prefix=".runtime-", dir=OWNED)
    private = Path(temporary.name)
    package_validation = []
    for package in provenance["packages"]:
        blob = (OWNED / package["tarballFile"]).read_bytes()
        algorithm, encoded = package["integrity"].split("-", 1)
        assert sha(blob) == package["tarballSha256"]
        assert hashlib.sha1(blob).hexdigest() == package["sha1"]
        assert base64.b64encode(hashlib.new(algorithm, blob).digest()).decode() == encoded
        destination = private / "node_modules" / package["name"]
        extracted = {}
        with tarfile.open(OWNED / package["tarballFile"]) as archive:
            for member in archive.getmembers():
                path = PurePosixPath(member.name)
                assert not path.is_absolute() and path.parts[0] == "package" and ".." not in path.parts
                assert member.isdir() or member.isfile(), "No links or special archive entries"
                if not member.isfile():
                    continue
                relative = str(PurePosixPath(*path.parts[1:]))
                data = archive.extractfile(member).read()
                digest = {"bytes": len(data), "sha256": sha(data)}
                assert digest == package["members"][relative], relative
                target = destination / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                extracted[relative] = digest
        assert extracted == package["members"]
        metadata = json.loads((destination / "package.json").read_text())
        assert metadata["name"] == package["name"] and metadata["version"] == package["version"]
        assert not metadata.get("dependencies") and not metadata.get("optionalDependencies")
        assert not metadata.get("bundledDependencies")
        package_validation.append({"name": package["name"], "version": package["version"],
                                   "tarballSha256": sha(blob), "allMembersVerified": True,
                                   "runtimeDependencies": metadata.get("dependencies", {}), "lifecycleScriptsRun": False})
    for variant in ["before", "fixed"]:
        shutil.copytree(OWNED / "pins/p-event" / variant, private / variant)
        for name in ["index.js", "package.json", "license", "test.js"]:
            assert (private / variant / name).read_bytes() == (OWNED / "pins/p-event" / variant / name).read_bytes()
    save("fidelity.json", {"sourceFiles": fidelity, "packages": package_validation,
                           "privateCopiesByteIdentical": True, "upstreamTestFilesExecuted": False})
    node = Path(shutil.which("node")).resolve()
    summary["nodeExecutable"] = str(node)
    summary["nodeExecutableSha256"] = sha(node.read_bytes())
    summary["checkout"] = str(REPO)
    summary["runnerCommand"] = [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]]
    environment = os.environ.copy()
    removed_environment = {k: k in environment for k in ["NODE_OPTIONS", "NODE_PATH"]}
    for key in removed_environment:
        environment.pop(key, None)

    def child(label, command, extra_environment=None):
        env = {**environment, **(extra_environment or {})}
        process = subprocess.Popen(command, cwd=REPO, env=env, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        children.append(process)
        row = {"label": label, "command": command, "cwd": str(REPO), "pid": process.pid,
               "deadlineSeconds": expectations["subprocessDeadlineSeconds"],
               "removedEnvironmentKeysWerePresent": removed_environment, "deadlineExceeded": False}
        processes.append(row)
        try:
            stdout, stderr = process.communicate(timeout=expectations["subprocessDeadlineSeconds"])
        except subprocess.TimeoutExpired:
            row["deadlineExceeded"] = True
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate(timeout=2)
        row["returnCode"] = process.wait(timeout=2)
        row["waitCompleted"] = True
        try:
            os.kill(process.pid, 0)
            row["pidAbsentAfterWait"] = False
        except ProcessLookupError:
            row["pidAbsentAfterWait"] = True
        row["processGroupAbsentAfterWait"] = not group_exists(process.pid)
        (output / f"{label}.stdout.txt").write_bytes(stdout)
        (output / f"{label}.stderr.txt").write_bytes(stderr)
        save("processes.json", processes)
        if not row["processGroupAbsentAfterWait"]:
            os.killpg(process.pid, signal.SIGKILL)
        assert row["pidAbsentAfterWait"] and row["processGroupAbsentAfterWait"], row
        assert row["returnCode"] == 0 and not row["deadlineExceeded"], row
        result = json.loads(stdout)
        save(f"{label}.json", result)
        return result

    native = []
    for case in expectations["cases"]:
        variant, outcome = case["variant"], case["outcome"]
        observation = child(f"native-{variant}-{outcome}", [str(node), "--unhandled-rejections=strict",
                            str(OWNED / "scripts/native.mjs"), str(private / variant / "index.js"),
                            variant, outcome, str(OWNED / "expectations.json")])
        assert observation["allExpectedObservations"]
        assert observation["source"]["sha256"] == inputs[f"pins/p-event/{variant}/index.js"]
        package = next(p for p in provenance["packages"] if p["name"] == "p-timeout")
        assert observation["dependency"]["sha256"] == package["members"]["index.js"]["sha256"]
        assert observation["dependency"]["version"] == package["version"]
        native.append({"variant": variant, "outcome": outcome, "settlement": observation["settlement"],
                       "upstreamAssertion": observation["upstreamAssertion"],
                       "afterAwaitedOutcome": observation["afterAwaitedOutcome"],
                       "allExpectedObservations": observation["allExpectedObservations"]})
    admission = child("admission", [str(node), "--unhandled-rejections=strict", "--import",
                       str(OWNED / "scripts/resolve-acorn.mjs"), str(OWNED / "scripts/admission.mjs")],
                      {"P_EVENT_ACORN_MODULE": (private / "node_modules/acorn/dist/acorn.mjs").as_uri()})
    for row in admission["rows"]:
        assert row["sourceSha256"] == inputs[f"pins/p-event/{row['variant']}/index.js"]
    assert admission["parserVersion"] == "8.19.0"
    assert not any(r["specifier"] == "z3-solver" or r["url"].endswith("/verify/solver.mjs") for r in admission["resolutionLog"])
    implementation_after = runtime_manifest()
    save("implementation-after.json", implementation_after)
    assert implementation_before == implementation_after
    for path, digest in inputs.items():
        assert sha((OWNED / path).read_bytes()) == digest, f"Input changed during execution: {path}"
    git("diff", "--exit-code", provenance["preparedHead"], "--", ".", f":(exclude){RELATIVE}")
    summary.update({"taskStatus": "PASS", "native": native, "productionAdmission": "unsupported for both complete unchanged modules through both production APIs",
                    "formalProof": "not admitted; no proof claim", "solverStarted": False,
                    "implementationRuntimeBytesUnchanged": True, "frozenInputsUnchanged": True})
except BaseException as error:
    summary["error"] = {"type": type(error).__name__, "message": str(error)}
    raise
finally:
    for process in children:
        if group_exists(process.pid):
            os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=2)
    private_path = Path(temporary.name) if temporary else None
    if temporary:
        temporary.cleanup()
    save("cleanup.json", {"classification": "measured", "allChildrenWaited": all(p.returncode is not None for p in children),
                          "allChildProcessGroupsAbsent": all(not group_exists(p.pid) for p in children),
                          "privateDependencyDirectory": str(private_path) if private_path else None,
                          "privateDependencyDirectoryRemoved": private_path is None or not private_path.exists(),
                          "rootInstallOrLockfileEdit": False, "lifecycleScriptsRun": False})
    save("git-commands.json", git_commands)
    summary["finishedUTC"] = datetime.now(timezone.utc).isoformat()
    save("summary.json", summary)
print(json.dumps({"taskStatus": summary["taskStatus"], "output": str(output), "nativeCases": len(summary.get("native", [])),
                  "productionAdmission": summary.get("productionAdmission"), "cleanup": "private dependencies removed; all five native subprocesses waited and reaped"}))
