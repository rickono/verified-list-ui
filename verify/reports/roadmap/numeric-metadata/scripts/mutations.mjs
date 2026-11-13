// Private scratch mutations, never production flags. Execute through the lane.
import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";
import { createHash } from "node:crypto";
import { verify } from "../../../../index.mjs";
import { cases } from "../../../../../tests/verify/fixtures/numeric-metadata-cases.mjs";

export async function runMutations() {
  const results = [];
  const mutations = [
    { id: "cap64", prefix: "N02-", from: "const INT_WIDTH = 53;", to: "const INT_WIDTH = 64;" },
    { id: "index-guard", prefix: "N17-",
      from: 'return merge(valid, owner.at(z.low), undef(), node);',
      to: 'return merge(`(bvult ${z.low} ${owner.length.u32})`, owner.at(z.low), undef(), node);' },
  ];
  for (const m of mutations) {
    const c = cases.find((c) => c.id.startsWith(m.prefix));
    const fn = Function(stripTypeScriptTypes(c.source) + "\nreturn f;")();
    assert.ok(c.inputs.some((input) => {
      const args = structuredClone(input);
      return !c.post(fn(...args), args, input);
    }), `${m.id}: missing independent native failure`);
    const control = (await verify(c.source, { timeoutMs: 30_000 })).outcomes[0];
    assert.equal(control.status, "counterexample", JSON.stringify(control));
    assert.equal(control.confirmed, true);
    const scratch = await mkdtemp(join(tmpdir(), "numeric-metadata-mutant-"));
    try {
      await mkdir(join(scratch, "verify"));
      for (const name of (await readdir(new URL("../../../../", import.meta.url))).filter((n) => n.endsWith(".mjs"))) {
        await copyFile(new URL(`../../../../${name}`, import.meta.url), join(scratch, "verify", name));
      }
      await symlink(fileURLToPath(new URL("../../../../../node_modules", import.meta.url)), join(scratch, "node_modules"), "dir");
      const path = join(scratch, "verify/data.mjs"), text = await readFile(path, "utf8");
      assert.equal(text.split(m.from).length, 2, `Mutation site drifted for ${m.id}`);
      const changed = text.replace(m.from, m.to);
      await writeFile(path, changed);
      const mutant = await import(pathToFileURL(join(scratch, "verify/index.mjs")).href);
      const observed = (await mutant.verify(c.source, { timeoutMs: 30_000 })).outcomes[0];
      // Only the native-refuted proof kills these mutants. An error, unsupported
      // result, unconfirmed witness or timeout does not count as detection.
      assert.equal(observed.status, "verified", JSON.stringify(observed));
      results.push({ id: m.id, case: c.id, patch: { from: m.from, to: m.to },
        sourceSha256: createHash("sha256").update(text).digest("hex"),
        mutantSha256: createHash("sha256").update(changed).digest("hex"),
        control: { status: control.status, confirmed: control.confirmed },
        observed: { status: observed.status }, detection: "false-verification", detected: true });
    } finally { await rm(scratch, { recursive: true, force: true }); }
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await runMutations(), null, 2));
