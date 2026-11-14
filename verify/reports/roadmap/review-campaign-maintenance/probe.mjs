#!/usr/bin/env node
// Independent boundary probe. Reads the prepared checkout and writes only this directory plus /tmp.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const pkg = "verify/reports/roadmap/library-campaigns";
const campaign = join(root, pkg, "maintenance-evidence/04-current/campaign");
const oldObject = "a83f50762005ae47edfe3e07295f3840b485687b";
const impl = "524d03a44a7c5b8e151489673753c0a4c6afa2c7";
const evidenceCommit = "8364bfc92a79e231bc556d5521cb59c5f67d8e11";
const importedImpl = "ea9896f6d2e7bc9eabb0d33b57d92d0af7368f6a";
const expectedIdentity = "09d21829d8ea449858782577b32ed5531b112b3fa2b9cfbe06ced64f767b28ef";
const historicalIdentity = "13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106";
const sha = (data) => createHash("sha256").update(data).digest("hex");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const checks = [];
const commands = [];
const startedAt = new Date().toISOString();

function record(name, detail) {
  checks.push({ name, status: "PASS", detail });
  console.log(`PASS ${name}`);
}
function run(name, argv, options = {}) {
  const started = new Date().toISOString();
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd ?? root,
    env: options.env,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    timeout: options.timeout ?? 60000,
    killSignal: "SIGKILL",
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
  });
  commands.push({
    name, argv, cwd: options.cwd ?? root, started, finished: new Date().toISOString(),
    status: result.status, signal: result.signal, error: result.error?.message ?? null,
  });
  if (result.error) throw result.error;
  return result;
}

const temps = [];
function temp(prefix) {
  const dir = mkdtempSync(join("/tmp", prefix));
  temps.push(dir);
  return dir;
}

let linkedModules = false;
let extraRuntime;
try {
  const head = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}");
  run("baseline-ancestor", ["git", "merge-base", "--is-ancestor", "32bd5b260aa116ca88642a1479bed8d3fc447f4b", "HEAD"]);
  assert.equal(existsSync(join(root, "verify")), true);
  record("prepared-checkout", {
    head, tree, baselineAncestor: true, verifyExists: true,
    node: process.version, platform: process.platform, arch: process.arch,
    implTree: git("rev-parse", `${impl}^{tree}`),
    evidenceCommit, importedImpl, importedEvidence: head,
  });

  const changed = git("diff", "--name-only", "e5d040dff6d443cb3be80a9a82dfa652d612a379", "HEAD").split("\n").filter(Boolean);
  assert.ok(changed.every((path) => path.startsWith(`${pkg}/`)));
  assert.equal(changed.length, 189);
  const outside = git("diff", "--name-only", impl, "HEAD", "--", ".", `:(exclude)${pkg}`, `:(exclude)${pkg}/**`).split("\n").filter(Boolean);
  record("package-scope", { changedPaths: changed.length, allUnderLibraryCampaigns: true, nonPackageDiffSinceImplementation: outside });

  const productionSinceReceipt = git("diff", "--name-only", "7feca2830d90e237227fc1522e77e1a11ce3abee", "HEAD", "--", "verify", ":(exclude)verify/reports").split("\n").filter(Boolean);
  const lockDrift = git("diff", "--name-only", "7feca2830d90e237227fc1522e77e1a11ce3abee", "HEAD", "--", "package.json", "package-lock.json").split("\n").filter(Boolean);
  record("production-since-483-receipt", { productionSinceReceipt, lockDrift });

  // Exact package bytes: implementation and evidence commits versus the imported commits.
  const names = git("diff", "--name-only", "5f0fb47a0a822d62537f296ef804d5037eebba5c", evidenceCommit).split("\n").filter(Boolean);
  let blobMismatch = 0;
  for (const path of names) {
    const source = git("rev-parse", `${evidenceCommit}:${path}`);
    const prepared = git("rev-parse", `HEAD:${path}`);
    if (source !== prepared) blobMismatch += 1;
  }
  const implNames = git("diff", "--name-only", "5f0fb47a0a822d62537f296ef804d5037eebba5c", impl).split("\n").filter(Boolean);
  let implMismatch = 0;
  for (const path of implNames) {
    if (git("rev-parse", `${impl}:${path}`) !== git("rev-parse", `${importedImpl}:${path}`)) implMismatch += 1;
  }
  const treeA = git("ls-tree", "-r", evidenceCommit, pkg);
  const treeB = git("ls-tree", "-r", "HEAD", pkg);
  record("exact-package-bytes", {
    evidencePaths: names.length, blobMismatch, implPaths: implNames.length, implMismatch,
    libraryCampaignTreeEqual: treeA === treeB,
  });

  // Historical inventory belongs to its owning tip, not this checkout.
  const historicalSums = readFileSync(join(root, pkg, "SHA256SUMS"), "utf8").split("\n").filter(Boolean);
  assert.equal(historicalSums.length, 161);
  let historicalMismatch = 0;
  for (const line of historicalSums) {
    const digest = line.slice(0, 64);
    const path = line.slice(66);
    const blob = execFileSync("git", ["show", `7e6d9b56c36e89dac9d9b7943771feb8af4dd0ab:${path}`], { cwd: root });
    if (sha(blob) !== digest) historicalMismatch += 1;
  }
  const currentSums = readFileSync(join(root, pkg, "maintenance-SHA256SUMS"), "utf8").split("\n").filter(Boolean);
  const sumCheck = run("maintenance-shasum", ["shasum", "-a", "256", "-c", join(pkg, "maintenance-SHA256SUMS")]);
  record("inventories", {
    historicalLines: historicalSums.length, historicalMismatchAgainst7e6d9b5: historicalMismatch,
    maintenanceLines: currentSums.length, maintenanceShasumStatus: sumCheck.status,
    maintenanceShasumTail: (sumCheck.stdout || "").trim().split("\n").slice(-1)[0],
    historicalCheckerStillPinned: historicalSums.some((line) => line.startsWith("577bc3463fd9606de15c948199d812b6532b233a65155e5090fcf7902e03d17e")),
    currentChecker: sha(readFileSync(join(root, pkg, "check.mjs"))),
    currentInputs: sha(readFileSync(join(root, pkg, "inputs.json"))),
  });
  assert.equal(sumCheck.status, 0);

  // Recompute the retained campaign snapshot from the implementation tree.
  const stored = json(join(campaign, "freeze.before.json"));
  const specs = Object.keys(stored.trackedFiles);
  let snapshotMismatch = 0;
  const missingFromTree = [];
  for (let offset = 0; offset < specs.length; offset += 200) {
    const chunk = specs.slice(offset, offset + 200);
    const batched = spawnSync("git", ["cat-file", "--batch"], {
      cwd: root, input: chunk.map((path) => `${impl}:${path}`).join("\n") + "\n", maxBuffer: 256 * 1024 * 1024,
    });
    commands.push({ name: `cat-file-snapshot-${offset}`, status: batched.status, count: chunk.length });
    assert.equal(batched.status, 0);
    let buf = batched.stdout, cursor = 0;
    for (const path of chunk) {
      const newline = buf.indexOf(0x0a, cursor);
      const header = buf.subarray(cursor, newline).toString();
      const [id, type, sizeText] = header.split(" ");
      const size = Number(sizeText);
      const body = buf.subarray(newline + 1, newline + 1 + size);
      cursor = newline + 1 + size + 1;
      if (type !== "blob" || sha(body) !== stored.trackedFiles[path]) {
        snapshotMismatch += 1;
        if (snapshotMismatch <= 5) missingFromTree.push({ path, header, got: type === "blob" ? sha(body) : type });
      }
    }
  }
  const body = {
    schema: stored.schema, head: stored.head, headTree: stored.headTree, trackedChanges: stored.trackedChanges,
    trackedFiles: stored.trackedFiles, currentRuntime: stored.currentRuntime, checker: stored.checker, node: stored.node,
  };
  const recomputed = sha(JSON.stringify(body));
  const runtimeUntracked = Object.keys(stored.currentRuntime).filter((path) => stored.trackedFiles[path] !== stored.currentRuntime[path]);
  const freezeFiles = [
    "freeze.before.json", "freeze.after.json", "supervisor-freeze.before.json", "supervisor-freeze.after.json",
  ].map((name) => sha(readFileSync(join(campaign, name))));
  const focusedFreeze = sha(readFileSync(join(root, pkg, "maintenance-evidence/05-focused/freeze.before.json")));
  record("campaign-snapshot", {
    storedHead: stored.head, storedTree: stored.headTree, trackedChangesEmpty: stored.trackedChanges === "",
    trackedFiles: specs.length, snapshotMismatch, sample: missingFromTree,
    recomputedSnapshot: recomputed, storedSnapshot: stored.snapshotSha256, snapshotHashMatches: recomputed === stored.snapshotSha256,
    runtimeFiles: Object.keys(stored.currentRuntime).length, runtimeNotEqualTracked: runtimeUntracked,
    campaignFreezeHashes: freezeFiles, focusedBeforeEqualsCampaignBefore: focusedFreeze === freezeFiles[0],
    node: stored.node,
  });

  const stages = json(join(campaign, "stages.json"));
  const evidence = json(join(campaign, "evidence.json"));
  const model = json(join(campaign, "model.json"));
  const launch = json(join(root, pkg, "maintenance-evidence/04-current/launch.json"));
  const runRecord = json(join(campaign, "run.json"));
  const harmonic = json(join(campaign, "harmonic/checks.json"));
  const ramda = json(join(campaign, "ramda.json"));
  const admission = json(join(campaign, "d3-admission.json")).outcomes[0];
  const diagnostic = json(join(campaign, "d3-cycle-diagnostic.json"));
  const cycle5 = json(join(campaign, "native-cycle5.command.json"));
  const cycle100 = json(join(campaign, "native-cycle100.command.json"));
  const warm = json(join(campaign, "harmonic/total.warm.json"));
  const launchStdout = readFileSync(join(root, pkg, "maintenance-evidence/04-current/launch.stdout.txt"));
  const campaignStdout = readFileSync(join(campaign, "stdout.txt"));
  record("retained-campaign-receipt", {
    stages: stages.map((stage) => `${stage.id}:${stage.status}`),
    evidenceStatus: evidence.status, modelIdentity: evidence.modelIdentity, codeHead: evidence.codeHead,
    codeTree: evidence.codeTree, inputSnapshot: evidence.inputSnapshotSha256,
    claims: evidence.claims.map((claim) => ({ id: claim.id, classification: claim.classification, outcome: claim.outcome?.status, weak: claim.outcome?.reason })),
    harmonic, ramda: { nativeSamples: ramda.nativeSamples, scope: ramda.scope, checks: ramda.checks.map((item) => ({ name: item.name, status: item.outcomes?.[0]?.status })) },
    admission: { status: admission.status, span: admission.span, message: admission.message, file: admission.file.endsWith("/ticks.js") },
    diagnostic: diagnostic.results.map((item) => item.repeat),
    cycles: { cycle5: { signal: cycle5.signal, error: cycle5.error?.code, alive: cycle5.aliveAfterWait }, cycle100: { signal: cycle100.signal, error: cycle100.error?.code, alive: cycle100.aliveAfterWait } },
    warm: { hits: warm.cache.hits.length, solved: warm.cache.solved.length, identity: warm.cache.identity, status: warm.outcomes.map((item) => item.status) },
    launch: { status: launch.status, codeHead: launch.codeHead, shim: launch.gitShimSha256, probe: launch.noPrivateObjectProbe, argv: launch.argv.map((part) => part.split("/").slice(-2).join("/")) },
    run: { status: runRecord.status, code: runRecord.code, argv0: runRecord.argv.slice(0, 3), mode: runRecord.argv.slice(-3), lanePid: runRecord.lanePid, supervisorPid: runRecord.supervisorPid, protected: runRecord.protectedFilesUnchanged },
    stdoutEqual: sha(launchStdout) === sha(campaignStdout), launchStdoutSha: sha(launchStdout), recordedStdoutSha: launch.stdoutSha256,
    shimMatchesFile: launch.gitShimSha256 === sha(readFileSync(join(root, pkg, "git-no-private-history.mjs"))),
    laneHash: sha(readFileSync("/Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py")),
    recordedLaneHash: launch.laneSha256,
    campaignStdoutMentionsOldObject: campaignStdout.includes(oldObject) || campaignStdout.includes("fixture:"),
    campaignStderrBytes: readFileSync(join(campaign, "stderr.txt")).length,
    modelSha: model.sha256, oldIdentityInModelFiles: JSON.stringify(model).includes(historicalIdentity),
  });

  // Logging shim with the campaign's unset-CAMPAIGN_GIT_CWD behavior.
  const shimDir = temp("campaign-shim-");
  const shimLog = join(here, "shim-argv.log");
  writeFileSync(shimLog, "");
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const shim = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
appendFileSync(${JSON.stringify(shimLog)}, JSON.stringify(process.argv.slice(2)) + "\\n");
const old = ${JSON.stringify(oldObject)};
const args = process.argv.slice(2);
if (args.some((arg) => arg === old || arg.startsWith(old + ":") || arg.startsWith(old + "^{"))) {
  console.error("fixture: historical object unavailable: " + old);
  process.exit(128);
}
const git = process.env.CAMPAIGN_REAL_GIT;
const result = spawnSync(git, args, { cwd: process.env.CAMPAIGN_GIT_CWD, stdio: "inherit" });
process.exit(result.status ?? 1);
`;
  writeFileSync(join(shimDir, "git"), shim);
  chmodSync(join(shimDir, "git"), 0o755);
  const shimEnv = { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, CAMPAIGN_REAL_GIT: realGit };
  delete shimEnv.CAMPAIGN_GIT_CWD;
  const readShim = () => readFileSync(shimLog, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const inputsOnly = run("inputs-only-under-shim", [process.execPath, join(root, pkg, "check.mjs"), "--inputs-only"], { env: shimEnv });
  const defaultShimArgs = readShim();
  writeFileSync(shimLog, "");
  const historyDenied = run("history-under-shim", [process.execPath, join(root, pkg, "check.mjs"), "--inputs-only", "--check-history"], { env: shimEnv });
  const historyShimArgs = readShim();
  writeFileSync(shimLog, "");
  const historyPresent = run("history-without-shim", [process.execPath, join(root, pkg, "check.mjs"), "--inputs-only", "--check-history"]);
  const boundary = await import(join(root, pkg, "campaign-inputs.mjs"));
  const previousPath = process.env.PATH;
  const previousReal = process.env.CAMPAIGN_REAL_GIT;
  const previousCwd = process.env.CAMPAIGN_GIT_CWD;
  process.env.PATH = shimEnv.PATH;
  process.env.CAMPAIGN_REAL_GIT = realGit;
  delete process.env.CAMPAIGN_GIT_CWD;
  let liveFreeze;
  try { liveFreeze = boundary.freeze(root); }
  finally {
    process.env.PATH = previousPath;
    if (previousReal === undefined) delete process.env.CAMPAIGN_REAL_GIT; else process.env.CAMPAIGN_REAL_GIT = previousReal;
    if (previousCwd === undefined) delete process.env.CAMPAIGN_GIT_CWD; else process.env.CAMPAIGN_GIT_CWD = previousCwd;
  }
  const freezeShimArgs = readShim();
  const sawOld = (args) => args.some((group) => group.some((arg) => String(arg).includes(oldObject.slice(0, 12))));
  const defaultParsed = JSON.parse(inputsOnly.stdout);
  record("live-boundary-under-shim", {
    inputsOnlyStatus: inputsOnly.status,
    freshDownload: defaultParsed.documentation.freshDownload,
    checkedDocumentBytes: defaultParsed.documentation.checkedDocumentBytesThisRun,
    historyRequested: defaultParsed.history,
    attestationKind: defaultParsed.documentation.kind,
    historyDeniedStatus: historyDenied.status,
    historyDeniedStderr: historyDenied.stderr.trim(),
    historyPresentStatus: historyPresent.status,
    historyPresentChecked: historyPresent.status === 0 ? JSON.parse(historyPresent.stdout).documentation.checkedDocumentBytesThisRun : historyPresent.stderr.trim(),
    liveHead: liveFreeze.head, liveTree: liveFreeze.headTree, liveChangesEmpty: liveFreeze.trackedChanges === "",
    liveTracked: Object.keys(liveFreeze.trackedFiles).length, liveRuntime: Object.keys(liveFreeze.currentRuntime).length,
    defaultShimCommands: [...new Set(defaultShimArgs.map((args) => args.slice(0, 3).join(" ")))],
    defaultShimSawOldObject: sawOld(defaultShimArgs),
    historyShimSawOldObject: sawOld(historyShimArgs),
    freezeShimCommands: [...new Set(freezeShimArgs.map((args) => args.slice(0, 3).join(" ")))],
    freezeShimSawOldObject: sawOld(freezeShimArgs),
  });

  // Inheritance shape used by supervise() and serial-verify.py, without taking the solver lane.
  const hopDir = temp("path-hop-");
  writeFileSync(join(hopDir, "hop.py"), `import subprocess, sys
r = subprocess.run(["node", "-e", "console.log(process.env.CAMPAIGN_MARKER); console.log(process.env.PATH.split(':')[0])"], capture_output=True, text=True)
sys.stdout.write(r.stdout)
raise SystemExit(r.returncode)
`);
  writeFileSync(join(hopDir, "hop-parent.mjs"), `import { spawnSync } from "node:child_process";
const env = { ...process.env, PATH: process.argv[2] + ":" + process.env.PATH, CAMPAIGN_MARKER: "present" };
const child = spawnSync("python3", [process.argv[3]], { env });
process.stdout.write(child.stdout ?? "");
process.stderr.write(child.stderr ?? "");
process.exit(child.status ?? 1);
`);
  const hop = run("path-inheritance", [process.execPath, join(hopDir, "hop-parent.mjs"), hopDir, join(hopDir, "hop.py")]);
  record("path-inheritance", { status: hop.status, stdout: hop.stdout.trim(), stderr: hop.stderr.trim(), shimDir: hopDir });

  // Historical checker, outside the repository, against current bytes.
  const oldRoot = temp("old-red-");
  const oldPkg = join(oldRoot, pkg);
  mkdirSync(oldPkg, { recursive: true });
  const oldInputs = JSON.parse(execFileSync("git", ["show", `5f0fb47a0a822d62537f296ef804d5037eebba5c:${pkg}/inputs.json`], { cwd: root, encoding: "utf8" }));
  for (const path of Object.keys(oldInputs.files)) {
    mkdirSync(dirname(join(oldRoot, path)), { recursive: true });
    copyFileSync(join(root, path), join(oldRoot, path));
  }
  writeFileSync(join(oldPkg, "check.mjs"), execFileSync("git", ["show", `5f0fb47a0a822d62537f296ef804d5037eebba5c:${pkg}/check.mjs`], { cwd: root }));
  writeFileSync(join(oldPkg, "inputs.json"), JSON.stringify(oldInputs, null, 2) + "\n");
  writeFileSync(join(oldPkg, "provenance.json"), execFileSync("git", ["show", `5f0fb47a0a822d62537f296ef804d5037eebba5c:${pkg}/provenance.json`], { cwd: root }));
  const oldGit = join(oldRoot, "bin/git");
  mkdirSync(dirname(oldGit));
  const oldLog = join(here, "old-red-git.log");
  writeFileSync(oldLog, "");
  writeFileSync(oldGit, `#!/usr/bin/env python3
import os, sys
open(${JSON.stringify(oldLog)}, "a").write(repr(sys.argv[1:]) + "\\n")
old = ${JSON.stringify(oldObject)}
if sys.argv[1:2] == ["show"] and any(a == old or a.startswith(old + ":") or a.startswith(old + "^{") for a in sys.argv[2:]):
    sys.stderr.write("fixture: historical object unavailable: " + old + "\\n")
    raise SystemExit(128)
os.execv(${JSON.stringify(realGit)}, [${JSON.stringify(realGit)}, "-C", ${JSON.stringify(root)}, *sys.argv[1:]])
`);
  chmodSync(oldGit, 0o755);
  const oldEnv = { ...process.env, PATH: `${dirname(oldGit)}:${process.env.PATH}` };
  const firstRed = run("historical-default", [process.execPath, join(oldPkg, "check.mjs"), join(oldRoot, "out-default")], { cwd: oldRoot, env: oldEnv });
  const firstGitLog = readFileSync(oldLog, "utf8");
  const updated = JSON.parse(JSON.stringify(oldInputs));
  const drifted = [];
  for (const [path, expected] of Object.entries(updated.files)) {
    const actual = sha(readFileSync(join(oldRoot, path)));
    if (actual !== expected) drifted.push(path);
    updated.files[path] = actual;
  }
  writeFileSync(join(oldPkg, "inputs.json"), JSON.stringify(updated, null, 2) + "\n");
  const secondRed = run("historical-private-object", [process.execPath, join(oldPkg, "check.mjs"), join(oldRoot, "out-private")], { cwd: oldRoot, env: oldEnv });
  record("historical-reds", {
    firstStatus: firstRed.status, firstDrift: firstRed.stderr.includes("Source/provenance drift: verify/bin/jsverify.mjs"),
    firstSawShow: firstGitLog.includes("show"), firstGitLog,
    driftedPaths: drifted, secondStatus: secondRed.status,
    secondDenied: secondRed.stderr.includes("fixture: historical object unavailable"),
    secondAtInputCheck: secondRed.stderr.includes("at inputCheck"),
  });

  // Fixed-input and legacy rejection before semantic import, using the current checker bytes.
  const fixture = temp("boundary-fixture-");
  const fixturePkg = join(fixture, pkg);
  mkdirSync(join(fixture, "bin"), { recursive: true });
  const marker = join(fixture, "semantic-imported");
  const laneMarker = join(fixture, "lane-launched");
  copyFileSync(join(root, pkg, "git-no-private-history.mjs"), join(fixture, "bin/git"));
  chmodSync(join(fixture, "bin/git"), 0o755);
  writeFileSync(join(fixture, "bin/python3"), `#!/bin/sh\nprintf unexpected > ${JSON.stringify(laneMarker)}\nexit 97\n`);
  chmodSync(join(fixture, "bin/python3"), 0o755);
  const fixed = json(join(root, pkg, "inputs.json"));
  const fixedPaths = Object.values(fixed.immutable).flatMap((group) => Object.keys(group));
  for (const path of [...new Set([...fixedPaths, `${pkg}/inputs.json`, `${pkg}/check.mjs`, `${pkg}/campaign-inputs.mjs`, `${pkg}/provenance.json`])]) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    copyFileSync(join(root, path), join(fixture, path));
  }
  writeFileSync(join(fixture, "verify/manifest.mjs"), `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "imported"); throw new Error("semantic import trap");\n`);
  const fixtureEnv = { ...process.env, PATH: `${join(fixture, "bin")}:${process.env.PATH}`, CAMPAIGN_REAL_GIT: realGit, CAMPAIGN_GIT_CWD: root };
  function fixtureRun(name, args) {
    return run(name, [process.execPath, join(fixturePkg, "check.mjs"), ...args], { cwd: fixture, env: fixtureEnv });
  }
  const driftResults = [];
  for (const [label, path] of [
    ["library-source", `${pkg}/pins/d3-array/nice.js`],
    ["provenance", `${pkg}/provenance.json`],
    ["license", `${pkg}/pins/d3-array/LICENSE`],
    ["adapter", "verify/examples/simple-statistics/check-harmonic.mjs"],
    ["application-contract", "verify/examples/simple-statistics/harmonic-positive.js"],
    ["inherited-attestation", "verify/reports/roadmap/review-library-campaigns/report.md"],
  ]) {
    const file = join(fixture, path);
    const original = readFileSync(file);
    writeFileSync(file, Buffer.concat([original, Buffer.from("\n// independent drift\n")]));
    const result = fixtureRun(`drift-${label}`, [join(fixture, `out-${label}`)]);
    writeFileSync(file, original);
    driftResults.push({
      label, status: result.status, named: result.stderr.includes(`Source/provenance drift: ${path}`),
      imported: existsSync(marker), lane: existsSync(laneMarker),
    });
  }
  const legacyFile = join(fixturePkg, "inputs.json");
  const legacyOriginal = readFileSync(legacyFile);
  writeFileSync(legacyFile, JSON.stringify({ ...fixed, files: { "verify/index.mjs": "0".repeat(64) } }));
  const legacy = fixtureRun("legacy-files", ["--inputs-only"]);
  writeFileSync(legacyFile, "{");
  const malformed = fixtureRun("malformed-json", ["--inputs-only"]);
  writeFileSync(legacyFile, JSON.stringify({ ...fixed, schema: 1 }));
  const badSchema = fixtureRun("schema-1", ["--inputs-only"]);
  writeFileSync(legacyFile, legacyOriginal);
  const preservedBefore = sha(readFileSync(join(campaign, "evidence.json")));
  const preserve = run("preserve-current-output", [process.execPath, join(root, pkg, "check.mjs"), campaign]);
  const preservedAfter = sha(readFileSync(join(campaign, "evidence.json")));
  const packageStatus = run("package-status-after-preserve", ["git", "status", "--porcelain", "--", pkg]);
  record("independent-rejections", {
    driftResults, legacyStatus: legacy.status, legacyImported: existsSync(marker),
    malformedStatus: malformed.status, schemaStatus: badSchema.status,
    preserveStatus: preserve.status, preserveMessage: preserve.stderr.includes("Use a new output directory"),
    evidenceUnchanged: preservedBefore === preservedAfter, packageStatus: packageStatus.stdout,
  });

  // Queued snapshot mismatch refuses before the first stage, on the real checker.
  const queueOut = temp("queue-mismatch-");
  writeFileSync(join(queueOut, "supervisor-freeze.before.json"), "{}\n");
  const queued = run("queued-snapshot-mismatch", [process.execPath, join(root, pkg, "check.mjs"), "--run", queueOut], { timeout: 120000 });
  record("queued-snapshot-mismatch", {
    status: queued.status,
    refused: queued.stderr.includes("Inputs changed while waiting for the serial lane"),
    startedStage: queued.stdout.includes("Starting native-harmonic"),
  });

  // Identity, added runtime file, historical refusal, fresh native replay.
  const modules = "/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/node_modules";
  if (!existsSync(join(root, "node_modules"))) {
    symlinkSync(modules, join(root, "node_modules"));
    linkedModules = true;
  }
  const { runningIdentity, trustedIdentity } = await import(join(root, "verify/manifest.mjs"));
  const { reproduce } = await import(join(root, "verify/index.mjs"));
  const identity = runningIdentity();
  const currentFreeze = boundary.freeze(root);
  const bound = boundary.bindModel(currentFreeze, identity);
  const broken = structuredClone(currentFreeze);
  broken.currentRuntime["verify/index.mjs"] = "0".repeat(64);
  let bindRejected = false;
  try { boundary.bindModel(broken, identity); } catch (error) { bindRejected = error.message.includes("Model is outside the frozen runtime: index.mjs"); }
  extraRuntime = join(root, "verify/.review-extra-runtime.mjs");
  writeFileSync(extraRuntime, "export const extra = 1;\n");
  const added = boundary.freeze(root);
  const identityWithExtra = runningIdentity();
  unlinkSync(extraRuntime);
  extraRuntime = undefined;
  const restored = boundary.freeze(root);
  const historicalEvidence = json(join(root, pkg, "evidence/03-final/harmonic/positive.evidence.json"));
  const historicalReplay = reproduce(join(root, "verify/examples/simple-statistics/harmonic-positive.js"), historicalEvidence);
  const freshEvidence = json(join(campaign, "harmonic/positive.evidence.json"));
  const freshReplay = reproduce(join(root, "verify/examples/simple-statistics/harmonic-positive.js"), freshEvidence);
  const { default: mean } = await import(join(root, "verify/examples/simple-statistics/harmonic_mean.js"));
  const bits = (value) => {
    const buffer = Buffer.alloc(8);
    buffer.writeDoubleBE(value);
    return buffer.toString("hex");
  };
  const tiny = mean([Number.MIN_VALUE]);
  const { default: nice } = await import(join(root, pkg, "pins/d3-array/nice.js"));
  const coverage = nice(0.9299999999999999, 0.93, 1);
  const { verifyFile } = await import(join(root, "verify/index.mjs"));
  const admitted = await verifyFile(join(root, pkg, "pins/d3-array/nice.js"), { timeoutMs: 1000 });
  record("model-and-native", {
    identity: identity.sha256, disabled: identity.disabled, expectedIdentity,
    identityMatchesCampaign: identity.sha256 === model.sha256,
    historicalEvidenceIdentity: historicalEvidence.identity,
    historicalReplay: { status: historicalReplay.status, message: historicalReplay.message },
    freshReplay: { status: freshReplay.status, confirmed: freshReplay.outcomes?.every((item) => item.reproduced === true) },
    bindCurrent: bound.inputSnapshotSha256 === currentFreeze.snapshotSha256,
    bindRejected, addedRuntimeChangesSnapshot: added.snapshotSha256 !== currentFreeze.snapshotSha256,
    addedRuntimeKeepsIdentity: identityWithExtra.sha256 === identity.sha256,
    restoredMatches: restored.snapshotSha256 === currentFreeze.snapshotSha256,
    nativeMinValueBits: bits(tiny), reciprocalInfinite: 1 / Number.MIN_VALUE === Infinity,
    niceCoverage: coverage,
    admission: { status: admitted.outcomes[0].status, span: admitted.outcomes[0].span, file: admitted.outcomes[0].file.endsWith("/ticks.js") },
    closureOmitsDesignDoc: !identity.files.some(([path]) => path.endsWith("conditional-completion.md")),
  });

  assert.equal(blobMismatch, 0);
  assert.equal(implMismatch, 0);
  assert.equal(historicalMismatch, 0);
  assert.equal(snapshotMismatch, 0);
  assert.equal(recomputed, stored.snapshotSha256);
  assert.equal(stored.head, impl);
  assert.equal(stored.trackedChanges, "");
  assert.ok(freezeFiles.every((digest) => digest === freezeFiles[0]));
  assert.equal(focusedFreeze, freezeFiles[0]);
  assert.equal(stages.length, 10);
  assert.ok(stages.every((stage) => stage.status === "PASS"));
  assert.equal(inputsOnly.status, 0);
  assert.equal(historyDenied.status, 1);
  assert.equal(historyPresent.status, 0);
  assert.equal(sawOld(defaultShimArgs), false);
  assert.equal(sawOld(freezeShimArgs), false);
  assert.equal(sawOld(historyShimArgs), true);
  assert.equal(liveFreeze.head, head);
  assert.equal(liveFreeze.trackedChanges, "");
  assert.equal(firstRed.status, 1);
  assert.equal(firstRed.stderr.includes("Source/provenance drift: verify/bin/jsverify.mjs"), true);
  assert.equal(firstGitLog.includes("show"), false);
  assert.equal(secondRed.status, 1);
  assert.equal(secondRed.stderr.includes("fixture: historical object unavailable"), true);
  assert.ok(driftResults.every((item) => item.status === 1 && item.named && !item.imported && !item.lane));
  assert.equal(legacy.status, 1);
  assert.equal(malformed.status, 1);
  assert.equal(badSchema.status, 1);
  assert.equal(preserve.status, 1);
  assert.equal(preservedBefore, preservedAfter);
  assert.equal(queued.status, 1);
  assert.equal(queued.stderr.includes("Inputs changed while waiting for the serial lane"), true);
  assert.equal(queued.stdout.includes("Starting native-harmonic"), false);
  assert.equal(identity.sha256, expectedIdentity);
  assert.equal(historicalReplay.status, "invalid-evidence");
  assert.equal(freshReplay.status, "reproduced");
  assert.equal(bindRejected, true);
  assert.notEqual(added.snapshotSha256, currentFreeze.snapshotSha256);
  assert.equal(restored.snapshotSha256, currentFreeze.snapshotSha256);
  assert.equal(bits(tiny), "0000000000000000");
  assert.deepEqual(coverage, [0.93, 0.93]);
  assert.equal(admitted.outcomes[0].status, "unsupported");
  assert.equal(hop.status, 0);
  assert.equal(hop.stdout.includes(hopDir), true);
  assert.equal(warm.cache.hits.length, 1);
  assert.equal(warm.cache.solved.length, 0);
  assert.equal(cycle5.signal, "SIGKILL");
  assert.equal(cycle5.aliveAfterWait, false);
  assert.equal(cycle100.signal, "SIGKILL");
  assert.equal(cycle100.aliveAfterWait, false);
  if (linkedModules) {
    unlinkSync(join(root, "node_modules"));
    linkedModules = false;
  }
  const finalStatus = run("final-status", ["git", "status", "--porcelain"]);
  record("cleanup-before-report-commit", {
    status: finalStatus.stdout, extraAbsent: !existsSync(join(root, "verify/.review-extra-runtime.mjs")),
    modulesAbsent: !existsSync(join(root, "node_modules")),
  });
} catch (error) {
  checks.push({ name: "probe", status: "ISSUES", message: error.message, stack: error.stack });
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  if (extraRuntime && existsSync(extraRuntime)) unlinkSync(extraRuntime);
  if (linkedModules) unlinkSync(join(root, "node_modules"));
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  const status = checks.every((check) => check.status === "PASS") && !checks.some((check) => check.name === "probe") ? "PASS" : "ISSUES";
  writeFileSync(join(here, "commands.json"), JSON.stringify(commands, null, 2) + "\n");
  writeFileSync(join(here, "result.json"), JSON.stringify({
    status, startedAt, finishedAt: new Date().toISOString(), head: git("rev-parse", "HEAD"), checks,
  }, null, 2) + "\n");
  console.log(status);
}
