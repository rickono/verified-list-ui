// Read-only Git extraction into this unit's disposable runtime directory.
// Existing files must match exactly; candidate directories are never read.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const base = new URL("../.baseline-runtime/", import.meta.url);
const commit = "eaf23c0ca4a2e61e9d844a84a876755872eb16e7";
const git = (...args) => execFileSync("git", args, { cwd: root });
const paths = git("ls-tree", "--name-only", commit, "verify/").toString().trim().split("\n")
  .filter((path) => /^verify\/[^/]+\.mjs$/.test(path));
mkdirSync(base, { recursive: true });
const hashes = [];
for (const path of paths) {
  const bytes = git("show", `${commit}:${path}`), target = new URL(path.slice("verify/".length), base);
  if (existsSync(target)) assert.deepEqual(readFileSync(target), bytes, `${path}: baseline snapshot drift`);
  else writeFileSync(target, bytes);
  hashes.push(`${createHash("sha256").update(bytes).digest("hex")}  ${path}`);
}
const manifest = new URL("../logs/baseline-sources.sha256", import.meta.url);
assert.equal(readFileSync(manifest, "utf8"), hashes.join("\n") + "\n");
console.log(JSON.stringify({ commit, modules: paths.length, mismatches: 0 }));
