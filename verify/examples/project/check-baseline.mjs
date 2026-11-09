// Compare without solving or changing a checkout. Temporary baseline modules
// stay in this worktree and are always removed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile, parse } from "../../source.mjs";
import { load } from "../../modules.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const baseline = process.argv[2] ?? "ff2518cd7494300084f2ab54da71f4d79185e586";
const directory = await mkdtemp(join(root, ".ready-C-baseline-"));
try {
  for (const name of ["source.mjs", "data.mjs", "error.mjs", "modules.mjs"]) {
    const source = execFileSync("git", ["show", `${baseline}:verify/${name}`], { cwd: root });
    await writeFile(join(directory, name), source);
  }
  await symlink(join(root, "node_modules"), join(directory, "node_modules"));
  const previous = await import(pathToFileURL(join(directory, "source.mjs")));
  const snapshots = await import(pathToFileURL(join(directory, "modules.mjs")));
  const source = await readFile(new URL("../remeda/take.helper.js", import.meta.url), "utf8");
  const semantic = ({ pre, post, declarations, executable, resultType }) => ({ pre, post, declarations, executable, resultType });
  const before = semantic(previous.compile([previous.parse("take.js", source, () => assert.fail("No imports expected"))]).targets[0]);
  const after = semantic(compile([parse("take.js", source, () => assert.fail("No imports expected"))]).targets[0]);
  assert.deepEqual(after, before, "The pinned helper's proof and executable must retain baseline semantics.");
  const graphs = [];
  for (const fixture of ["composed.js", "shifted.js"]) {
    const file = fileURLToPath(new URL(`../remeda/${fixture}`, import.meta.url));
    const before = snapshots.load(file), after = load(file);
    if (before.error) throw before.error;
    if (after.error) throw after.error;
    const payload = (t) => ({ ...semantic(t), id: t.id, callees: t.callees, params: t.params.map(({ name, type, model }) => ({ name, type, model })) });
    assert.deepEqual(compile(after.records).targets.map(payload), previous.compile(before.records).targets.map(payload), `${fixture} must preserve every baseline obligation, witness model and dependency.`);
    graphs.push(fixture);
  }
  console.log(JSON.stringify({ baseline, equal: true, obligationsSha256: createHash("sha256").update(JSON.stringify(after)).digest("hex"), equalGraphs: graphs }));
} finally { await rm(directory, { recursive: true, force: true }); }
