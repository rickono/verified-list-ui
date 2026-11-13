import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, cpSync, symlinkSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { trustedIdentity, dependencies, runningIdentity } from "../../verify/manifest.mjs";
import { verifyFile } from "../../verify/index.mjs";
const HERE = fileURLToPath(new URL("../../verify/", import.meta.url));
const MODULES = fileURLToPath(new URL("../../node_modules/", import.meta.url));
function fixture(t, copySolver = false) {
  const root = mkdtempSync(join(tmpdir(), "jsverify-manifest-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const verify = join(root, "verify"); mkdirSync(verify);
  for (const name of readdirSync(HERE).filter((f) => f.endsWith(".mjs"))) cpSync(join(HERE, name), join(verify, name));
  const modules = join(root, "node_modules"); mkdirSync(modules);
  for (const name of readdirSync(MODULES).filter((f) => !f.startsWith("."))) {
    if (name === "z3-solver" && copySolver) cpSync(realpathSync(join(MODULES, name)), join(modules, name), { recursive: true, dereference: true });
    else symlinkSync(realpathSync(join(MODULES, name)), join(modules, name));
  }
  if (copySolver) {
    const siblings = dirname(realpathSync(join(MODULES, "z3-solver")));
    for (const name of readdirSync(siblings).filter((n) => !n.startsWith(".") && n !== "z3-solver")) {
      if (!readdirSync(modules).includes(name)) symlinkSync(realpathSync(join(siblings, name)), join(modules, name));
    }
  }
  return { root, verify, modules };
}
const plan = (root, dir) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
import {verifyFile} from ${JSON.stringify(pathToFileURL(join(root, "verify/index.mjs")).href)};
const r=await verifyFile(${JSON.stringify(join(root, "entry.ts"))},{cache:{dir:${JSON.stringify(dir)}},plan:true});
console.log(JSON.stringify({cache:r.cache,plan:r.plan}));`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));

test("AST closure follows static, side-effect, re-export, literal dynamic/template imports and worker URLs", async (t) => {
  const p = fixture(t), entry = join(p.root, "entry.ts"), dir = join(p.root, "cache");
  writeFileSync(entry, "// ensures Object.is(result,x)\nexport const f=(x:number)=>x;");
  const cold = await verifyFile(entry, { cache: { dir } }); assert.equal(cold.cache.written.length, 1);
  const initial = trustedIdentity(p.verify); assert.equal(initial.disabled, undefined);
  assert.equal(initial.sha256, runningIdentity().sha256);
  assert.equal(plan(p.root, dir).plan.targets[0].needsSolve, false);
  const index = join(p.verify, "index.mjs"), original = readFileSync(index, "utf8");
  for (const form of ["import './extra.mjs';", "import {x} from './extra.mjs';", "export {x} from './extra.mjs';", "export * from './extra.mjs';", "const extra=import('./extra.mjs');", "const extra=import(`./extra.mjs`);", "const worker=new URL('./extra.mjs',import.meta.url);", "import './extra.js';"]) {
    writeFileSync(join(p.verify, "extra.mjs"), "export const x=1;");
    writeFileSync(join(p.verify, "extra.js"), "export const x=1;");
    writeFileSync(join(p.root, "package.json"), '{"type":"module"}');
    writeFileSync(index, original + "\n" + form);
    const a = trustedIdentity(p.verify); assert.equal(a.disabled, undefined, form); assert.notEqual(a.sha256, initial.sha256);
    assert.ok(a.files.some(([name]) => name === (form.includes("extra.js") ? "extra.js" : "extra.mjs")), form);
    const changed = plan(p.root, dir); assert.equal(changed.plan.targets[0].needsSolve, true, form);
    const path = join(p.verify, form.includes("extra.js") ? "extra.js" : "extra.mjs"); writeFileSync(path, "export const x=2;");
    assert.notEqual(trustedIdentity(p.verify).sha256, a.sha256, form);
  }
  writeFileSync(index, original);
  for (const name of ["index.mjs", "cache.mjs", "source.mjs", "proofs.mjs", "heap-witness.mjs", "evidence.mjs"]) {
    const file = join(p.verify, name), text = readFileSync(file, "utf8"); writeFileSync(file, text + "\n// semantic build drift\n");
    assert.notEqual(trustedIdentity(p.verify).sha256, initial.sha256, name); assert.equal(plan(p.root, dir).plan.targets[0].needsSolve, true, name);
    writeFileSync(file, text);
  }
});

test("computed imports, loader APIs, computed worker URLs and transitive unresolved dynamic code disable reuse", (t) => {
  const p = fixture(t), index = join(p.verify, "index.mjs"), original = readFileSync(index, "utf8");
  writeFileSync(join(p.root, "entry.ts"), "// ensures true\nexport const f=()=>true;");
  for (const form of ["const path='./extra.mjs'; import(path);", "const path='./extra.mjs'; new URL(path,import.meta.url);", "import {createRequire} from 'node:module';", "const loader=import.meta.resolve;", "import 'data:text/javascript,import%20%22./elsewhere.mjs%22';"]) {
    writeFileSync(index, original + "\n" + form);
    assert.match(trustedIdentity(p.verify).disabled, /computed|code-loading|import.meta|inline/);
  }
  writeFileSync(index, original + "\nimport './extra.mjs';"); writeFileSync(join(p.verify, "extra.mjs"), "export const dynamic=p=>import(p);");
  assert.match(trustedIdentity(p.verify).disabled, /dynamic import.*computed/);
  // A nonliteral import need not execute to make the public API fail closed.
  writeFileSync(join(p.verify, "extra.mjs"), "export const dynamic=p=>import(p);");
  const got = plan(p.root, join(p.root, "absent")); assert.match(got.cache.disabled, /computed/); assert.equal(got.plan.targets[0].needsSolve, true);
  assert.equal(dependencies("const s=\"import('./phantom.mjs')\"; // import './other.mjs'", "literal").length, 0);
});

test("whole solver package JS, wasm and transitive dependencies, runtime and protocol bind receipt identity", async (t) => {
  const p = fixture(t, true), initial = trustedIdentity(p.verify);
  const entry = join(p.root, "entry.ts"), dir = join(p.root, "cache");
  writeFileSync(entry, "// ensures Object.is(result,x)\nexport const f=(x:number)=>x;");
  const cold = await verifyFile(entry, { cache: { dir } }); assert.equal(cold.cache.written.length, 1);
  assert.equal(plan(p.root, dir).plan.targets[0].needsSolve, false);
  assert.deepEqual(initial.runtime, { node: process.version, platform: process.platform, arch: process.arch }); assert.match(initial.protocol, /receipt.*query/);
  for (const name of ["build/node.js", "build/z3-built.js", "build/high-level/high-level.js", "build/z3-built.wasm", "package.json"]) {
    const file = join(p.modules, "z3-solver", name), bytes = readFileSync(file);
    // Whitespace is valid in package JSON; a trailing byte change is sufficient
    // for wasm identity without attempting to execute a damaged backend.
    writeFileSync(file, Buffer.concat([bytes, Buffer.from(name.endsWith(".wasm") ? [0] : "\n ")]));
    const changed = trustedIdentity(p.verify); assert.equal(changed.disabled, undefined, name); assert.notEqual(changed.sha256, initial.sha256, name); assert.notEqual(changed.backend.sha256, initial.backend.sha256, name);
    assert.equal(plan(p.root, dir).plan.targets[0].needsSolve, true, name);
    writeFileSync(file, bytes);
  }
  assert.ok(initial.packages.some((p) => p.name === "acorn")); assert.ok(initial.packages.some((p) => p.name === "async-mutex"));
});

test("editing a loaded semantic module disables the running API rather than naming new disk bytes", (t) => {
  const p = fixture(t), index = pathToFileURL(join(p.verify, "index.mjs")).href;
  writeFileSync(join(p.root, "entry.ts"), "// ensures true\nexport const f=()=>true;");
  const text = execFileSync(process.execPath, ["--input-type=module", "-e", `
import {verifyFile} from ${JSON.stringify(index)};
import {appendFileSync} from 'node:fs';
appendFileSync(${JSON.stringify(join(p.verify, "cache.mjs"))},'\\n// changed after load');
const r=await verifyFile(${JSON.stringify(join(p.root, "entry.ts"))},{cache:{dir:${JSON.stringify(join(p.root, "cache"))}},plan:true});
console.log(JSON.stringify(r.cache));`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(JSON.parse(text).disabled, /changed on disk.*restart/);
});
