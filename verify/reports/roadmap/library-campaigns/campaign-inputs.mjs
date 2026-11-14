// This boundary uses only builtins. Reject fixed-input drift before loading any verifier code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const prefix = "verify/reports/roadmap/library-campaigns";
const baseline = "32bd5b260aa116ca88642a1479bed8d3fc447f4b";
const sha = (data) => createHash("sha256").update(data).digest("hex");
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const sorted = (paths) => [...paths].sort();
const hashes = (root, paths) => Object.fromEntries(sorted(paths).map((path) => [path, sha(readFileSync(join(root, path)))]));

export function checkInputs(root, { checkHistory = false } = {}) {
  const inputs = json(join(root, prefix, "inputs.json"));
  assert.equal(inputs.schema, 2, "Use the separate immutable/current input model.");
  assert.equal(inputs.baseline, baseline);
  assert.deepEqual(Object.keys(inputs).sort(), ["baseline", "currentRuntime", "immutable", "schema"]);
  assert.deepEqual(Object.keys(inputs.immutable).sort(), ["adapters", "documentation", "licenses", "provenance", "sources"]);
  assert.equal(inputs.currentRuntime, "snapshot-current-tree-and-runtime-before-and-after; fresh-solve-and-replay");
  git(root, "merge-base", "--is-ancestor", baseline, "HEAD");
  assert.ok(existsSync(join(root, "verify")));
  const fixed = Object.assign({}, ...Object.values(inputs.immutable));
  for (const [path, expected] of Object.entries(fixed)) {
    assert.equal(sha(readFileSync(join(root, path))), expected, `Source/provenance drift: ${path}`);
  }
  const provenance = json(join(root, prefix, "provenance.json")), d3 = provenance.d3Array;
  for (const [name, entry] of Object.entries(d3.sources)) {
    const path = `${prefix}/pins/d3-array/${name}`;
    assert.equal(fixed[path], entry.sha256, `The vendored source must have an immutable pin: ${path}`);
    assert.equal(sha(readFileSync(join(root, path))), entry.sha256);
  }
  const license = `${prefix}/${d3.licensePath}`;
  assert.equal(fixed[license], d3.licenseSha256);
  assert.equal(sha(readFileSync(join(root, license))), d3.licenseSha256);
  const contract = d3.publishedContract;
  assert.match(contract.fullDocumentSha256, /^[0-9a-f]{64}$/);
  assert.equal(contract.attestation.kind, "inherited-document-attestation");
  assert.equal(fixed[contract.attestation.reviewPath], contract.attestation.reviewSha256);
  assert.equal(contract.provenanceOnly, true);
  const history = { requested: checkHistory, checked: false };
  if (checkHistory) {
    const old = (path) => execFileSync("git", ["show", `${provenance.inheritedCommit}:${path}`], { cwd: root });
    for (const [name, entry] of Object.entries(d3.sources)) {
      assert.deepEqual(old(entry.inheritedPath), readFileSync(join(root, prefix, "pins/d3-array", name)));
    }
    assert.equal(sha(old(d3.inheritedLicensePath)), d3.licenseSha256);
    const docs = old(contract.inheritedPath);
    assert.equal(sha(docs), contract.fullDocumentSha256);
    assert.ok(docs.toString().includes(contract.quotedFragment));
    assert.ok(docs.toString().includes("d3.nice(1, 9, 5) // [0, 10]"));
    history.checked = true;
  }
  return {
    schema: inputs.schema, baseline, immutable: inputs.immutable,
    immutableSha256: sha(JSON.stringify(inputs.immutable)),
    sources: "Reviewed vendored source and license bytes match the fixed provenance digests. No download.",
    documentation: { ...contract.attestation, fullDocumentSha256: contract.fullDocumentSha256,
      checkedDocumentBytesThisRun: history.checked, freshDownload: false },
    history,
  };
}

export function freeze(root) {
  // HEAD/tree name the actual start, and these inventories describe actual working bytes.
  // Include the current tracked set, even files added since the historical campaign.
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const runtime = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (path !== join(root, "verify/reports")) walk(path);
      } else if (entry.isFile()) runtime.push(relative(root, path));
      else assert.fail(`Runtime snapshot requires ordinary files: ${path}`);
    }
  };
  walk(join(root, "verify"));
  const checker = readdirSync(join(root, prefix)).filter((name) => name.endsWith(".mjs") || ["inputs.json", "provenance.json"].includes(name))
    .map((name) => `${prefix}/${name}`);
  const body = {
    schema: 2, head: git(root, "rev-parse", "HEAD"), headTree: git(root, "rev-parse", "HEAD^{tree}"),
    trackedChanges: git(root, "diff", "--binary", "HEAD"),
    trackedFiles: hashes(root, tracked), currentRuntime: hashes(root, runtime), checker: hashes(root, checker),
    node: { version: process.version, platform: process.platform, arch: process.arch },
  };
  return { ...body, snapshotSha256: sha(JSON.stringify(body)) };
}

export function bindModel(snapshot, identity) {
  assert.equal(identity.disabled, undefined);
  for (const [path, digest] of identity.files) {
    assert.equal(snapshot.currentRuntime[`verify/${path}`], digest, `Model is outside the frozen runtime: ${path}`);
  }
  assert.deepEqual(identity.runtime, { node: snapshot.node.version, platform: snapshot.node.platform, arch: snapshot.node.arch });
  return { codeHead: snapshot.head, codeTree: snapshot.headTree, inputSnapshotSha256: snapshot.snapshotSha256, ...identity };
}
