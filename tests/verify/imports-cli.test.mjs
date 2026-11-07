import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { test } from "node:test";

const cli = fileURLToPath(new URL("../../verify/bin/jsverify.mjs", import.meta.url));

test("the CLI uses each dependency's source positions and names cross-file call failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "verify-import-cli-"));
  try {
    const helper = join(directory, "helper.ts"), entry = join(directory, "entry.ts");
    await writeFile(helper, "\n\n// requires x > 0\n// ensures result > 0\nexport const positive = (x: number) => x;");
    await writeFile(entry, "import { positive as need } from './helper.ts';\n// ensures true\nconst bad = () => need(0);");
    const run = (flags = []) => spawnSync(process.execPath, [cli, ...flags, entry], { encoding: "utf8", timeout: 10_000 });
    const result = run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /helper\.ts:5:1 verified positive/);
    assert.match(result.stdout, /entry\.ts:3:1 counterexample bad/);
    assert.match(result.stdout, /call: positive\(x = 0\) in .*helper\.ts \(replayed in JavaScript\)/);
    assert.match(result.stdout, /failed call requires: x > 0 \(.*helper\.ts\)/);
    const brokenSource = "\n\n// ensures true\nexport const positive = () => { while (true) {} return true; };";
    await writeFile(helper, brokenSource);
    const broken = run(["--json"]);
    assert.equal(broken.error, undefined);
    assert.equal(broken.status, 1, broken.stderr);
    const error = JSON.parse(broken.stdout)[0].outcomes[0];
    assert.equal(error.file, realpathSync.native(helper));
    assert.equal(error.line, 4);
    assert.equal(error.span.start, brokenSource.indexOf("while"));
    assert.equal(error.column, brokenSource.split("\n")[3].indexOf("while") + 1);
    assert.equal(error.status, "unsupported");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("post-replay dependency gating uses file identity through multiple same-named functions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "verify-import-gate-"));
  try {
    let predicate = "true";
    for (let i = 5; i >= 0; i--) predicate = `xs.every((v${i}) => ${predicate})`;
    await writeFile(join(directory, "slow.ts"), `// requires xs.length === 256\n// requires ${predicate}\n// ensures result\nexport const f = (xs: boolean[]) => true;`);
    await writeFile(join(directory, "middle.ts"), "import { f as expensive } from './slow.ts';\n// ensures result === false\nexport const f = () => false && expensive([]);");
    await writeFile(join(directory, "unrelated.ts"), "// ensures result\nexport const f = () => true;");
    const entry = join(directory, "entry.ts");
    await writeFile(entry, "import { f as middle } from './middle.ts';\nimport { f as unused } from './unrelated.ts';\n// ensures result === false\nconst f = () => middle();");
    const run = spawnSync(process.execPath, [cli, "--json", entry], { encoding: "utf8", timeout: 10_000 });
    assert.equal(run.error, undefined, "Timed replay must finish, including across module realms.");
    assert.equal(run.status, 1, run.stderr);
    const outcomes = JSON.parse(run.stdout)[0].outcomes;
    const at = (name) => outcomes.find((o) => o.file.endsWith(`/${name}.ts`));
    assert.equal(at("slow").reason, "replay-timeout");
    assert.equal(at("middle").reason, "dependency");
    assert.equal(at("entry").reason, "dependency");
    assert.equal(at("unrelated").status, "verified");
    assert.ok(outcomes.every((o) => o.fn === "f"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
