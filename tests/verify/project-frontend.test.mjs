import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verify, verifyFile } from "../../verify/index.mjs";
import { load } from "../../verify/modules.mjs";
import { compile } from "../../verify/source.mjs";
import { checkProject } from "../../verify/examples/project/check-project.mjs";

const yes = "// ensures result\nexport const yes = () => true;";
const identity = "// ensures Object.is(result, x)\nexport default function identity(x: number) { return x; }";
const verified = (r) => assert.ok(r.outcomes.length && r.outcomes.every((o) => o.status === "verified"), JSON.stringify(r));
const rejected = (r, message) => {
  assert.equal(r.outcomes.length, 1, JSON.stringify(r));
  assert.ok(["error", "unsupported"].includes(r.outcomes[0].status), JSON.stringify(r));
  assert.match(r.outcomes[0].message, message);
  return r.outcomes[0];
};
async function fixture(files, run) {
  const directory = realpathSync.native(await mkdtemp(join(tmpdir(), "verify-frontend-")));
  try {
    for (const [name, source] of Object.entries(files)) {
      await mkdir(dirname(join(directory, name)), { recursive: true });
      await writeFile(join(directory, name), source);
    }
    await run(directory, (options = {}) => verifyFile(join(directory, "entry.ts"), options));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
const pkg = (exports, extra = {}) => JSON.stringify({ type: "module", exports, ...extra });

test("a pinned unchanged real implementation loads through the offline project frontend", async () => {
  const { provenance, report } = await checkProject();
  assert.equal(provenance.commit, "004b09194f6d39f727118c0a71adc9986bcc13e1");
  assert.equal(report.modules.length, 7);
});

test("source-local aliases expand concrete generic records, arrays and optional primitives", async () => {
  const report = await verify(`
    type Scalar = number;
    type Box<T>={ value: T };
    type Values<T> = ReadonlyArray<T>;
    type Maybe<T> = T | undefined;
    type Input = { box: Box<Scalar>; flags: Values<boolean>; lower?: Maybe<number> };
    // ensures Object.is(result.value, input.box.value)
    // ensures result.count === input.flags.length
    // ensures Object.is(result.lower, input.lower)
    const read = (input: Readonly<Input>) => ({value: input.box.value, count: input.flags.length, lower: input.lower});
  `);
  verified(report);
  assert.deepEqual(report.dependencies, []);
  assert.deepEqual(report.outcomes[0].assumptions[0].typeAliases.map((a) => a.name), ["Input", "Scalar", "Box", "Values", "Maybe"]);
});

test("type imports and export aliases retain defining spans and clause provenance", async () => {
  await fixture({
    "types.ts": "\nexport type Box<T> = { value: T };\nexport type Count = number;",
    "barrel.ts": "export type { Box as Crate, Count } from './types.ts';",
    "helper.ts": "import type { Crate } from './barrel.ts';\n// requires x.value > 0\n// ensures result > 0\nconst positive = (x: Crate<number>) => x.value;\nexport {positive as default};",
    "entry.ts": "import need from './helper.ts';\nimport {type Count} from './barrel.ts';\n// ensures true\nconst bad = (x: Count) => need({value: 0});",
  }, async (dir, check) => {
    const report = await check();
    const helper = report.outcomes.find((o) => o.fn === "positive");
    assert.equal(helper.status, "verified");
    const alias = helper.assumptions[0].typeAliases[0];
    assert.equal(alias.file, join(dir, "types.ts"));
    assert.equal(alias.span.start, 1);
    const bad = report.outcomes.find((o) => o.fn === "bad");
    assert.equal(bad.status, "counterexample");
    assert.equal(bad.confirmed, true);
    assert.equal(bad.call.calleeFile, join(dir, "helper.ts"));
    assert.equal(bad.failed[0].file, join(dir, "helper.ts"));
    assert.equal(bad.failed[0].text, "x.value > 0");
  });
});

test("named defaults, imported local re-exports and duplicate star paths keep function identity", async () => {
  await fixture({
    "helper.ts": identity,
    "left.ts": "import same from './helper.ts'; export {same as value};",
    "right.ts": "export {default as value} from './helper.ts';",
    "barrel.ts": "export * from './left.ts'; export * from './right.ts';",
    "entry.ts": "import {value} from './barrel.ts';\n// ensures Object.is(result, x)\nconst caller = (x: number) => value(x);",
  }, async (_, check) => {
    const report = await check();
    verified(report);
    assert.equal(report.outcomes.filter((o) => o.fn === "identity").length, 1);
  });
});

test("default expression exports respect JavaScript const initialization order", async () => {
  await assert.rejects(import(`data:text/javascript,${encodeURIComponent("export default f; const f=()=>true;")}`), ReferenceError);
  rejected(await verify("export default f;\n// ensures result\nconst f=()=>true;"), /uninitialized const/);
  verified(await verify("export default f;\n// ensures result\nfunction f() {return true;}"));
  verified(await verify("export {f as default};\n// ensures result\nconst f=()=>true;"));
});

test("ambiguous/missing exports and unresolved unused type imports fail explicitly", async () => {
  const cases = [
    [{"left.ts": yes, "right.ts": yes, "barrel.ts": "export * from './left.ts'; export * from './right.ts';", "entry.ts": "import {yes} from './barrel.ts';"}, /Ambiguous exported value yes/],
    [{"helper.ts": yes, "entry.ts": "import missing from './helper.ts';"}, /no exported function default/],
    [{"helper.ts": yes, "entry.ts": "import type {Missing} from './helper.ts';"}, /no exported type Missing/],
    [{"entry.ts": "import type {Missing} from './absent.ts';"}, /Cannot resolve/],
    [{"helper.ts": yes, "entry.ts": "export type {Missing} from './helper.ts';"}, /No local type binding Missing/],
    [{"entry.ts": "type A = number; export type {A as X, A as X};"}, /Duplicate exported type X/],
  ];
  for (const [files, pattern] of cases) await fixture(files, async (_, check) => rejected(await check(), pattern));
});

test("explicit barrel exports override conflicting stars; star exports exclude default", async () => {
  await fixture({
    "left.ts": yes, "right.ts": yes,
    "barrel.ts": "export * from './left.ts'; export * from './right.ts'; export {yes} from './left.ts';",
    "entry.ts": "import {yes} from './barrel.ts';\n// ensures result\nconst f = () => yes();",
  }, async (_, check) => verified(await check()));
  await fixture({"helper.ts": identity, "barrel.ts": "export * from './helper.ts';", "entry.ts": "import id from './barrel.ts';"}, async (_, check) => rejected(await check(), /no exported function default/));
});

test("type and runtime local collisions and reserved builtin aliases are rejected", async () => {
  for (const entry of [
    "type Box = number; import type {Box} from './types.ts';",
    "import type {Box as Math} from './types.ts';",
    "import type {Box as ReadonlyArray} from './types.ts';",
    "import type {Box as Readonly} from './types.ts';",
    "type Number = number;",
    "type Array = number;",
    "type f = number; // ensures true\nconst f = () => true;",
    "import {yes as Array} from './helper.ts';",
  ]) await fixture({"types.ts": "export type Box = number;", "helper.ts": yes, "entry.ts": entry}, async (_, check) => rejected(await check(), /reserved|Reserved/));
});

test("unsupported recursive, unresolved and nonconcrete type forms never verify", async () => {
  for (const [prefix, annotation, message] of [
    ["type Loop = {next: Loop};", "number", /Recursive type alias Loop/],
    ["type A<T> = B<T>; type B<T> = A<T>;", "number", /Recursive type alias/],
    ["type Broken<T> = {value: U};", "number", /Unresolved type U/],
    ["type Box<T> = {value: T};", "Box", /exactly 1 concrete/],
    ["type Box<T> = {value: T};", "Box<number, boolean>", /exactly 1 concrete/],
    ["type Box<T> = {value: T};", "Box<T>", /Unresolved type T/],
    ["type Box<T extends number> = {value:T};", "number", /constraints and defaults/],
    ["type Box<T=number> = {value:T};", "number", /constraints and defaults/],
    ["type Bad = { [key: string]: number };", "number", /Record fields/],
    ["interface Box {value: number}", "number", /erased declaration interface/],
    ["declare const ambient: number;", "number", /erased declaration declare/],
    ["type Box<T> = T[];", "Box<{value:number}>", /Array inputs/],
    ["type Maybe<T> = T | undefined;", "Maybe<{value:number}>", /Optional references/],
  ]) {
    const report = await verify(`${prefix}\n// ensures true\nconst f = (x: ${annotation}) => true;`);
    rejected(report, message);
  }
  for (const source of [
    "// ensures true\nconst f = <T>(x:number) => true;",
    "// ensures true\nfunction f<T>(x:number) {return true;}",
    "// ensures true\nconst f = (x:number) => Number.isFinite<number>(x);",
    "// ensures true\nfunction f /* ( */ <T>(x:number) {return true;}",
    "// ensures true\nconst f = (x:number) => Number.isFinite /* comment */ <number>(x);",
    "// ensures true\nconst f = (x:number) => x as Missing;",
    "// ensures true\nconst f = (x:number) => x!;",
    "// ensures true\nconst f = (x:number) => {type T=number;return x;};",
  ]) rejected(await verify(source), /Runtime generic/);
  for (const source of [
    "// ensures true\nconst f = (x:number):Missing => x;",
    "// ensures true\nconst f = (x:number) => {const y:Missing=x;return y;};",
  ]) rejected(await verify(source), /Unresolved type Missing/);
});

test("concrete return/local annotations validate without overriding inferred runtime shapes", async () => {
  verified(await verify(`type Box<T>=Readonly<{value:T}>;
// ensures Object.is(result.value, x.value)
const f=(x:Box<number>):Box<number>=>{const y /* = */:Box<number>=x;return y;};`));
});

test("errors in imported type aliases keep the defining file and source offset", async () => {
  const source = "\n\nexport type Bad = Missing;";
  await fixture({"types.ts": source, "entry.ts": "import type {Bad} from './types.ts';\n// ensures true\nconst f = (x:Bad) => true;"}, async (dir, check) => {
    const o = rejected(await check(), /Unresolved type Missing/);
    assert.equal(o.file, join(dir, "types.ts"));
    assert.equal(o.span.start, source.indexOf("export"));
    assert.equal(o.line, 3);
  });
});

test("source-string verification performs no resolution, including unused types and barrels", async () => {
  for (const source of [
    "import type {Missing} from '/does/not/exist.ts';",
    "export type {Missing} from './absent.ts';",
    "export * from 'missing-package';",
  ]) rejected(await verify(source, {file: "/missing/project.ts"}), /verifyFile/);
});

test("strict opt-in tsconfig paths support exact keys and longest-prefix wildcards", async () => {
  await fixture({
    "tsconfig.json": JSON.stringify({compilerOptions: {baseUrl: "src", paths: {"@app": ["yes.ts"], "@lib/*": ["*.ts"], "@lib/deep/*": ["nested/*.ts"]}}}),
    "src/yes.ts": yes, "src/nested/helper.ts": identity,
    "entry.ts": "import {yes} from '@app'; import same from '@lib/deep/helper';\n// ensures result\nconst caller = () => yes() && same(1) === 1;",
  }, async (dir, check) => {
    verified(await check({tsconfig: join(dir, "tsconfig.json")}));
    rejected(await check(), /Unsupported package specifier @app/);
    const cli = fileURLToPath(new URL("../../verify/bin/jsverify.mjs", import.meta.url));
    const run = spawnSync(process.execPath, [cli, "--json", "--project", join(dir, "tsconfig.json"), join(dir, "entry.ts")], {encoding: "utf8", timeout: 15_000});
    assert.equal(run.status, 0, run.stderr + run.stdout);
    assert.equal(JSON.parse(run.stdout)[0].dependencies[0].kind, "tsconfig");
  });
});

test("unsupported configs, fallback arrays, and tied paths fail closed", async () => {
  const configs = [
    [{extends: "./base.json", compilerOptions: {}}, /only compilerOptions/],
    [{compilerOptions: {moduleResolution: "bundler"}}, /Unsupported tsconfig option/],
    [{compilerOptions: {paths: {"@app": ["a.ts", "b.ts"]}}}, /one target/],
    [{compilerOptions: {paths: {"@app": ["a"]}}}, /exact supported/],
    [{compilerOptions: {paths: {"@*": ["*.ts"], "@*x": ["*.ts"]}}}, /Ambiguous tsconfig path/],
  ];
  for (const [config, message] of configs) await fixture({"tsconfig.json": JSON.stringify(config), "entry.ts": "import {yes} from '@ax';"}, async (dir, check) => rejected(await check({tsconfig: join(dir, "tsconfig.json")}), message));
  await fixture({"tsconfig.json": "{ /* JSONC */ }", "entry.ts": yes}, async (dir, check) => {
    const o = rejected(await check({tsconfig: join(dir, "tsconfig.json")}), /Invalid strict JSON/);
    assert.equal(o.file, join(dir, "tsconfig.json"));
  });
});

test("package exports select exact subpaths and honor Node import/default condition order", async () => {
  await fixture({
    "node_modules/fixture/package.json": pkg({".": {default: "./yes.ts", import: "./missing.ts"}, "./identity": "./identity.mts"}),
    "node_modules/fixture/yes.ts": yes, "node_modules/fixture/identity.mts": identity,
    "entry.ts": "import {yes} from 'fixture'; import same from 'fixture/identity';\n// ensures result\nconst f = () => yes() && same(1) === 1;",
  }, async (_, check) => verified(await check()));
});

test("unsupported or missing package exports and effectful helpers cannot become stubs", async () => {
  for (const [exports, body, message, extra] of [
    [{"./other": "./index.ts"}, yes, /no selected export/],
    [{import: ["./index.ts", "./other.ts"]}, yes, /ambiguous package conditions/],
    [{node: "./index.ts", default: "./index.ts"}, yes, /ambiguous package conditions/],
    [{"./*": "./index.ts"}, yes, /Unsupported package export map/],
    ["../index.ts", yes, /Unsupported package export target/],
    ["./index.cjs", yes, /Unsupported package export target/],
    ["./index.ts", yes, /must declare type: module/, {type: "commonjs"}],
    ["./index.ts", `${yes}\n// ensures true\nexport const unused = () => fetch('url');`, /Unknown function fetch/],
    ["./index.ts", `${yes}\nconsole.log('side effect');`, /Only ordinary top-level/],
  ]) await fixture({"node_modules/fixture/package.json": pkg(exports, extra), "node_modules/fixture/index.ts": body, "entry.ts": "import {yes} from 'fixture';\n// ensures true\nconst f=()=>true;"}, async (_, check) => rejected(await check(), message));
  await fixture({"node_modules/fixture/package.json": JSON.stringify({main: "./index.ts"}), "entry.ts": "import {yes} from 'fixture';"}, async (_, check) => rejected(await check(), /explicit exports/));
});

test("metadata edits invalidate graph identity while entry bytes stay unchanged", async () => {
  await fixture({
    "tsconfig.json": JSON.stringify({compilerOptions: {paths: {"@app": ["yes.ts"]}}}),
    "yes.ts": yes, "no.ts": "// ensures result\nexport const yes = () => false;",
    "entry.ts": "import {yes} from '@app';\n// ensures result\nconst f=()=>yes();",
  }, async (dir, check) => {
    const options = {tsconfig: join(dir, "tsconfig.json")};
    const before = await check(options);
    verified(before);
    await writeFile(options.tsconfig, JSON.stringify({compilerOptions: {paths: {"@app": ["no.ts"]}}}));
    const after = await check(options);
    assert.equal(before.sha256, after.sha256);
    assert.notEqual(before.graphSha256, after.graphSha256);
    assert.notEqual(before.dependencies[0].sha256, after.dependencies[0].sha256);
    const caller = after.outcomes.find((o) => o.fn === "f");
    assert.equal(caller.status, "unknown");
    assert.equal(caller.reason, "dependency-violation");
    assert.equal(after.outcomes.find((o) => o.fn === "yes").status, "counterexample");
  });
  await fixture({
    "node_modules/fixture/package.json": pkg("./yes.ts"), "node_modules/fixture/yes.ts": yes,
    "entry.ts": "import {yes} from 'fixture';\n// ensures result\nconst f=()=>yes();",
  }, async (dir, check) => {
    const before = await check();
    await writeFile(join(dir, "node_modules/fixture/package.json"), pkg("./yes.ts", {description: "metadata changed"}));
    const after = await check();
    verified(before); verified(after);
    assert.equal(before.sha256, after.sha256);
    assert.notEqual(before.graphSha256, after.graphSha256);
    assert.notEqual(before.dependencies[0].sha256, after.dependencies[0].sha256);
  });
});

test("canonical metadata is read once across package aliases and snapshots survive disk edits", async () => {
  await fixture({
    "vendor/package.json": pkg("./index.ts"), "vendor/index.ts": yes,
    "entry.ts": "import {yes as a} from 'one'; import {yes as b} from 'two';\n// ensures result\nconst f=()=>a() && b();",
  }, async (dir) => {
    await mkdir(join(dir, "node_modules"));
    await symlink("../vendor", join(dir, "node_modules/one"));
    await symlink("../vendor", join(dir, "node_modules/two"));
    const snap = load(join(dir, "entry.ts"));
    assert.equal(snap.error, undefined);
    assert.equal(snap.dependencies.length, 1);
    assert.equal(snap.files.length, 2);
    await writeFile(join(dir, "vendor/index.ts"), "BROKEN AFTER SNAPSHOT");
    await writeFile(join(dir, "vendor/package.json"), "BROKEN AFTER SNAPSHOT");
    const program = compile(snap.records);
    assert.equal(program.targets.length, 2);
    assert.match(program.targets[0].executable, /true/);
  });
});

test("package targets cannot escape or silently cross a nested package scope", async () => {
  await fixture({
    "node_modules/fixture/package.json": pkg("./nested/index.ts"),
    "node_modules/fixture/nested/package.json": JSON.stringify({type: "commonjs"}),
    "node_modules/fixture/nested/index.ts": yes,
    "entry.ts": "import {yes} from 'fixture';",
  }, async (_, check) => rejected(await check(), /Nested package scopes/));
  await fixture({
    "outside.ts": yes,
    "node_modules/fixture/package.json": pkg("./index.ts"),
    "entry.ts": "import {yes} from 'fixture';",
  }, async (dir, check) => {
    await symlink("../../outside.ts", join(dir, "node_modules/fixture/index.ts"));
    rejected(await check(), /escapes its canonical package directory/);
  });
  await fixture({
    "metadata.json": pkg("./index.ts"), "node_modules/fixture/index.ts": yes,
    "entry.ts": "import {yes} from 'fixture';",
  }, async (dir, check) => {
    await symlink("../../metadata.json", join(dir, "node_modules/fixture/package.json"));
    rejected(await check(), /Symlinked package metadata/);
  });
});

test("local package scope metadata is captured and a stale CommonJS mode cannot verify", async () => {
  await fixture({"package.json": JSON.stringify({type: "module"}), "entry.ts": yes}, async (dir, check) => {
    const before = await check();
    verified(before);
    assert.equal(before.dependencies[0].file, join(dir, "package.json"));
    await writeFile(join(dir, "package.json"), JSON.stringify({type: "commonjs"}));
    const after = await check();
    rejected(after, /Only ES module source/);
    assert.equal(before.sha256, after.sha256);
    assert.notEqual(before.graphSha256, after.graphSha256);
  });
});

test("Node builtins and package self-references cannot resolve to installed stubs", async () => {
  await fixture({
    "node_modules/fs/package.json": pkg("./index.ts"), "node_modules/fs/index.ts": yes,
    "entry.ts": "import {yes} from 'fs';\n// ensures true\nconst f=()=>true;",
  }, async (_, check) => rejected(await check(), /Node builtin module fs/));
  await fixture({
    "package.json": pkg("./actual.ts", {name: "fixture"}), "actual.ts": yes,
    "node_modules/fixture/package.json": pkg("./index.ts"), "node_modules/fixture/index.ts": yes,
    "entry.ts": "import {yes} from 'fixture';",
  }, async (_, check) => rejected(await check(), /Package self-references/));
});

test("wildcard config paths substitute filename characters literally", async () => {
  await fixture({
    "tsconfig.json": JSON.stringify({compilerOptions: {paths: {"@path/*": ["literal/*.ts"]}}}),
    "literal/$&.ts": yes,
    "entry.ts": "import {yes} from '@path/$&';\n// ensures result\nconst f=()=>yes();",
  }, async (dir) => {
    const snapshot = load(join(dir, "entry.ts"), {tsconfig: join(dir, "tsconfig.json")});
    assert.equal(snapshot.error, undefined);
    assert.equal(compile(snapshot.records).targets[0].file, join(dir, "literal/$&.ts"));
  });
});
