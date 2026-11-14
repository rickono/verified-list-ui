import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile } from "../../verify/source.mjs";
import { single, load } from "../../verify/modules.mjs";
import { verify, verifyFile } from "../../verify/index.mjs";
import { legacyTargets } from "./fixtures/legacy-compiled.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const parent = "8fa17d652d3b6e5b7ebbccc42b2d81e90ead701e";
function legacyArtifact(compiled) {
  return { ...compiled, targets: legacyTargets(compiled.targets) };
}
test("default examples keep exact compiled obligations, graph hashes and outcome reports", async () => {
  const temporary = mkdtempSync(join(root, "verify/.stateful-baseline-"));
  try {
    const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", parent, "verify"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter((p) => /^verify\/[^/]+\.mjs$/.test(p));
    for (const path of paths) writeFileSync(join(temporary, path.slice("verify/".length)), execFileSync("git", ["show", `${parent}:${path}`], { cwd: root }));
    const original = await import(pathToFileURL(join(temporary, "source.mjs")));
    const oldModules = await import(pathToFileURL(join(temporary, "modules.mjs")));
    const oldIndex = await import(pathToFileURL(join(temporary, "index.mjs")));
    for (const name of readdirSync(join(root, "verify/examples")).filter((p) => p.endsWith(".ts")).sort()) {
      const source = readFileSync(join(root, "verify/examples", name), "utf8");
      const entry = join(root, "verify/examples", name);
      const before = original.compile(oldModules.load(entry).records), after = compile(load(entry).records);
      assert.deepEqual(legacyArtifact(after), before, `${name}: complete legacy compiled artifact`);
      const previous = await oldIndex.verifyFile(entry, { timeoutMs: 30_000 });
      const current = await verifyFile(entry, { timeoutMs: 30_000 });
      assert.deepEqual(current, previous, `${name}: complete report`);
    }
    const entry = join(root, "verify/examples/valid.ts");
    const standalone = readFileSync(entry, "utf8");
    assert.deepEqual(await verify(standalone), await oldIndex.verify(standalone));
    assert.deepEqual(legacyArtifact(compile(single("input.ts", standalone).records)), original.compile(oldModules.single("input.ts", standalone).records));
    assert.deepEqual(await verifyFile(entry), await oldIndex.verifyFile(entry));
    const cli = JSON.parse(execFileSync(process.execPath, [join(root, "verify/bin/jsverify.mjs"), "--json", entry], { cwd: root, encoding: "utf8" }));
    assert.deepEqual(cli, [await verifyFile(entry)]);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
