import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyFile } from "../../index.mjs";
import { takeCases } from "../remeda/check.mjs";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));

export async function checkProject() {
  const [upstream, metadata, fixture] = await Promise.all([
    readFile(join(here, "../remeda/take.upstream.ts"), "utf8"),
    readFile(join(here, "../remeda/provenance.json"), "utf8"),
    readFile(join(here, "vendor/take/index.js"), "utf8"),
  ]);
  const provenance = JSON.parse(metadata);
  const expected = takeCases(upstream, provenance).find((c) => c.name === "exact-length-and-prefix").source + "export { takeImplementation as take };\n";
  assert.equal(fixture, expected, "Keep the hash-checked real declaration and executable body unchanged.");
  const d3 = JSON.parse(await readFile(join(here, "vendor/d3/provenance.json"), "utf8"));
  const identity = await readFile(join(here, "vendor/d3/identity.upstream.js"), "utf8");
  assert.equal(createHash("sha256").update(identity).digest("hex"), d3.sha256);
  assert.equal(await readFile(join(here, "vendor/d3/identity.js"), "utf8"), "/** @param {number} x */\n// ensures Object.is(result, x)\n" + identity, "Only specification comments precede the unchanged complete D3 module.");
  const directory = await mkdtemp(join(tmpdir(), "verify-project-"));
  try {
    await cp(here, directory, { recursive: true });
    await mkdir(join(directory, "node_modules/@ready"), { recursive: true });
    await symlink("../../vendor/take", join(directory, "node_modules/@ready/take"));
    await symlink("../../vendor/d3", join(directory, "node_modules/@ready/d3"));
    const report = await verifyFile(join(directory, "entry.ts"), { tsconfig: join(directory, "tsconfig.json"), timeoutMs: 60_000 });
    assert.deepEqual(report.outcomes.map((o) => [o.fn, o.status]), [["takeImplementation", "verified"], ["unwrap", "verified"], ["identity", "verified"], ["inspect", "verified"]], JSON.stringify(report.outcomes));
    assert.deepEqual(report.dependencies.map((d) => d.kind), ["tsconfig", "package", "package"]);
    const assumptions = report.outcomes.find((o) => o.fn === "inspect").assumptions;
    assert.deepEqual(assumptions[0].typeAliases.map((a) => a.name), ["Packet", "Box", "Vector"]);
    assert.equal(assumptions[1].typeAliases[0].name, "Count");
    return { provenance, d3, report };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await checkProject(), null, 2));
}
