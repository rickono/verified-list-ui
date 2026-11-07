import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as verifier from "../../verify/index.mjs";

async function fixture(files, run) {
  const directory = await mkdtemp(join(tmpdir(), "verify-imports-"));
  try {
    for (const [name, source] of Object.entries(files)) await writeFile(join(directory, name), source);
    await run(directory, (name = "entry.ts", options) => verifier.verifyFile(join(directory, name), options));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const identity = "// ensures Object.is(result, x)\nexport const identity = (x: number) => x;";
const outcome = (report, name) => report.outcomes.find((o) => o.fn === name);
const verified = (report) => assert.ok(report.outcomes.length && report.outcomes.every((o) => o.status === "verified"), JSON.stringify(report));

test("named imports and export aliases preserve distinct module scopes", async () => {
  await fixture({
    "left.ts": `// ensures result === true\nconst hidden = () => true;\n// ensures result === true\nconst f = () => Number.isFinite(1) && hidden();\nexport { f as value, f as Number };`,
    "right.ts": `// ensures result === false\nconst hidden = () => false;\n// ensures result === false\nexport const f = () => hidden();`,
    "entry.ts": `import { value as left, Number as alsoLeft } from './left.ts';\nimport { f as right } from './right.ts';\n// ensures result\nexport const combined = () => left() && alsoLeft() && !right();`,
  }, async (directory, check) => {
    const report = await check();
    verified(report);
    const hidden = report.outcomes.filter((o) => o.fn === "hidden");
    assert.equal(hidden.length, 2);
    assert.equal(new Set(hidden.map((o) => o.file)).size, 2);
    assert.equal(outcome(report, "combined").file, realpathSync.native(join(directory, "entry.ts")));
  });
});

test("cross-file call counterexamples report the callee requires and file", async () => {
  await fixture({
    "helper.ts": "// requires x > 0\n// ensures result > 0\nexport const positive = (x: number) => x;",
    "entry.ts": "import { positive as need } from './helper.ts';\n// ensures true\nconst bad = () => need(0);",
  }, async (directory, check) => {
    const report = await check(), bad = outcome(report, "bad");
    assert.equal(bad.status, "counterexample", JSON.stringify(report));
    assert.equal(bad.confirmed, true);
    assert.equal(bad.call.callee, "positive");
    assert.equal(bad.call.calleeFile, realpathSync.native(join(directory, "helper.ts")));
    assert.equal(bad.failed[0].text, "x > 0");
    assert.equal(bad.failed[0].file, bad.call.calleeFile);
  });
});

test("changing only a helper changes provenance and blocks its caller", async () => {
  await fixture({
    "helper.ts": "// ensures result\nexport const yes = () => true;",
    "entry.ts": "import { yes } from './helper.ts';\n// ensures result\nconst caller = () => yes();",
  }, async (directory, check) => {
    const before = await check();
    verified(before);
    await writeFile(join(directory, "helper.ts"), "// ensures result\nexport const yes = () => false;");
    const after = await check();
    assert.equal(before.sha256, after.sha256);
    const helperHash = (r) => r.modules.find((m) => m.file.endsWith("/helper.ts")).sha256;
    assert.notEqual(helperHash(before), helperHash(after));
    assert.notEqual(before.graphSha256, after.graphSha256);
    assert.equal(outcome(after, "yes").status, "counterexample");
    assert.equal(outcome(after, "caller").status, "unknown");
  });
});

test("weak imported contracts stay opaque and unused bad helpers are still reported", async () => {
  await fixture({
    "helper.ts": "// ensures true\nexport const weak = (flag: boolean) => flag;\n// ensures result\nexport const bad = () => false;",
    "entry.ts": "import { weak, bad } from './helper.ts';\n// ensures result === flag\nconst gap = (flag: boolean) => weak(flag);\n// ensures result\nconst independent = () => true;",
  }, async (_, check) => {
    const report = await check();
    assert.equal(outcome(report, "gap").reason, "contract-gap");
    assert.equal(outcome(report, "bad").status, "counterexample");
    assert.equal(outcome(report, "independent").status, "verified");
  });
});

test("diamonds and symlink aliases load one canonical module", async () => {
  await fixture({
    "helper.ts": identity,
    "left.ts": "import { identity } from './helper.ts';\n// ensures Object.is(result, x)\nexport const left = (x: number) => identity(x);",
    "right.ts": "import { identity } from './alias.ts';\n// ensures Object.is(result, x)\nexport const right = (x: number) => identity(x);",
    "entry.ts": "import { left } from './left.ts';\nimport { right } from './right.ts';\n// ensures Object.is(result, x)\nconst diamond = (x: number) => left(right(x));",
  }, async (directory, check) => {
    await symlink("helper.ts", join(directory, "alias.ts"));
    const report = await check();
    verified(report);
    assert.equal(report.modules.length, 4);
    assert.equal(report.outcomes.filter((o) => o.fn === "identity").length, 1);
  });
});

test("replay invocation storage cannot collide with an imported local", async () => {
  await fixture({
    "helper.ts": identity,
    "entry.ts": "import { identity as __verification_invoke } from './helper.ts';\n// ensures Object.is(result, x)\nconst caller = (x: number) => __verification_invoke(x);",
  }, async (_, check) => verified(await check()));
});

test("source-string verification rejects imports without loading dependencies", async () => {
  const report = await verifier.verify("import { identity } from './missing.ts';\n// ensures true\nconst f = () => true;", { file: "/missing/entry.ts" });
  assert.equal(report.outcomes[0].status, "unsupported");
  assert.match(report.outcomes[0].message, /verifyFile/);
});

test("import syntax and local builtin shadowing fail closed", async () => {
  for (const statement of [
    "import {} from './helper.ts';", "import * as helpers from './helper.ts';",
    "import { identity } from 'package';", "import { identity } from '/helper.ts';",
    "import { identity as Number } from './helper.ts';", "import { identity as result } from './helper.ts';",
    "import './helper.ts';", "export * as helpers from './helper.ts';",
  ]) await fixture({ "helper.ts": identity, "entry.ts": `${statement}\n// ensures true\nconst f = () => true;` }, async (_, check) => {
    const report = await check();
    assert.equal(report.outcomes[0].status, "unsupported", statement + JSON.stringify(report));
    assert.equal(report.outcomes[0].span.start, 0);
  });
});

test("missing files, missing exports and import cycles identify the importing file", async () => {
  for (const files of [
    { "entry.ts": "import { identity } from './missing.ts';" },
    { "helper.ts": identity, "entry.ts": "import { missing } from './helper.ts';" },
    { "entry.ts": "import { b } from './helper.ts';\n// ensures true\nexport const a = () => true;", "helper.ts": "import { a } from './entry.ts';\n// ensures true\nexport const b = () => true;" },
  ]) await fixture(files, async (_, check) => {
    const report = await check(), error = report.outcomes[0];
    assert.ok(["error", "unsupported"].includes(error.status), JSON.stringify(report));
    assert.match(error.file, /\/(entry|helper)\.ts$/);
    assert.equal(error.span.start, 0);
  });
});

test("dependency syntax errors keep dependency offsets and files", async () => {
  await fixture({ "helper.ts": "\n\n// ensures true\nexport const bad = () => fetch('url');", "entry.ts": "import { bad } from './helper.ts';\n// ensures true\nconst f = () => true;" }, async (_, check) => {
    const report = await check(), error = report.outcomes[0];
    assert.equal(error.status, "unsupported");
    assert.match(error.file, /\/helper.ts$/);
    assert.equal(error.fn, "bad");
    assert.equal(error.span.start, 43);
  });
});

test("type-only imports resolve files, including unused imported bindings", async () => {
  await fixture({ "entry.ts": "import type { Missing } from './absent.ts';\n// ensures result\nexport const okay = () => true;" }, async (_, check) => {
    const report = await check();
    assert.equal(report.outcomes[0].status, "error");
    assert.match(report.outcomes[0].message, /Cannot resolve/);
    assert.equal(report.modules.length, 1);
  });
  await fixture({ "entry.ts": "import type { Box } from './absent.ts';\n// ensures true\nconst bad = (x: Box) => true;" }, async (_, check) => {
    const report = await check();
    assert.equal(report.outcomes[0].status, "error");
    assert.match(report.outcomes[0].message, /Cannot resolve/);
  });
});

test("exact extensions do not remap JavaScript imports or guess filenames", async () => {
  for (const path of ["./helper.js", "./helper", "./helper.ts?version=1", "./helper?version.ts", "./helper#part.ts", "./helper%20name.ts"]) {
    await fixture({ "helper.ts": identity, "entry.ts": `import { identity } from '${path}';\n// ensures true\nconst f = () => true;` }, async (_, check) => {
      const report = await check();
      assert.ok(["error", "unsupported"].includes(report.outcomes[0].status));
      assert.equal(report.outcomes[0].span.start, 0);
    });
  }
});

test("JavaScript and TypeScript modules can mix; all type specifiers resolve", async () => {
  await fixture({
    "helper.mjs": "/** @param {number} x */\n// ensures Object.is(result, x)\nexport function identity(x) { return x; }",
    "types.ts": "export type Box<T> = {value: T};",
    "entry.mts": "import { identity } from './helper.mjs';\nimport type {Box} from './types.ts';\n// ensures Object.is(result, x.value)\nconst f = (x: Box<number>) => identity(x.value);",
  }, async (_, check) => verified(await check("entry.mts")));
  await fixture({ "helper.ts": `${identity}\nexport type Box = number;`, "entry.ts": "import { type Box } from './helper.ts';\n// ensures true\nconst f = () => true;" }, async (_, check) => {
    const report = await check();
    verified(report);
  });
});

test("file hashes cover raw UTF-8 bytes and BOM offsets remain intact", async () => {
  const source = "\uFEFF// ensures result\nexport const yes = () => true;";
  await fixture({ "entry.ts": source }, async (_, check) => {
    const report = await check();
    verified(report);
    assert.equal(report.sha256, createHash("sha256").update(Buffer.from(source)).digest("hex"));
    assert.equal(report.outcomes[0].span.start, source.indexOf("export"));
    assert.equal(report.outcomes[0].line, 2);
    assert.equal(report.outcomes[0].column, 1);
  });
  for (const files of [
    { "entry.ts": Buffer.from([0xff]) },
    { "entry.ts": "import { f } from './helper.ts';", "helper.ts": Buffer.from([0xff]) },
  ]) await fixture(files, async (_, check) => {
    const report = await check();
    assert.equal(report.outcomes[0].status, "error");
    assert.match(report.outcomes[0].message, /UTF-8/);
    assert.equal(report.outcomes[0].line, 1);
    assert.equal(report.outcomes[0].span.start, 0);
  });
});

test("data locals shadow import aliases and imported functions remain non-values", async () => {
  await fixture({ "helper.ts": identity, "entry.ts": "import { identity as flag } from './helper.ts';\n// ensures result === flag\nconst local = (flag: boolean) => flag;" }, async (_, check) => verified(await check()));
  for (const body of ["identity", "(identity: boolean) => identity(0)"]) {
    const functionText = body.startsWith("(") ? body : `() => ${body}`;
    await fixture({ "helper.ts": identity, "entry.ts": `import { identity } from './helper.ts';\n// ensures true\nconst f = ${functionText};` }, async (_, check) => {
      const report = await check();
      assert.equal(report.outcomes[0].status, "unsupported");
    });
  }
});
