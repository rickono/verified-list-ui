import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, utimesSync, existsSync, symlinkSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { openCache, STALE_TEMP_MS, MAX_ENTRY_BYTES } from "../../verify/cache.mjs";
import { compile } from "../../verify/source.mjs";
import { single } from "../../verify/modules.mjs";
const fixture = new URL("./fixtures/cache-io-worker.mjs", import.meta.url);
const HEX = "0000000000000000", key = "ab" + "0".repeat(62), identity = "1".repeat(64);
const HOST = createHash("sha256").update(hostname()).digest("hex").slice(0, 16);
const target = compile(single("io.ts", "// ensures Object.is(result,x)\nconst f=(x:number)=>x;").records).targets[0];
function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "jsverify-cache-io-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, "cache"), config = join(root, "config.json");
  return { root, dir, config, write: (target, witnesses) => writeFileSync(config, JSON.stringify({ target, witnesses, key, identity })) };
}
function worker(p, mode, count) {
  const child = spawn(process.execPath, [fixture.pathname, mode, p.dir, p.config, String(count)], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (d) => { stdout += d; }); child.stderr.on("data", (d) => { stderr += d; });
  const closed = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr })); });
  return { child, closed };
}

test("independent OS writers and readers never observe torn receipt bytes or lose other keys", async (t) => {
  const p = setup(t); p.write(target, [[HEX], ["3ff0000000000000"], ["8000000000000000"]]);
  const store = openCache(p.dir); assert.equal(store.put(key, target, identity, [HEX]).written, true);
  const jobs = [...Array.from({ length: 4 }, () => worker(p, "writer", 150)), ...Array.from({ length: 3 }, () => worker(p, "reader", 2500))];
  t.after(async () => { for (const j of jobs) j.child.kill("SIGKILL"); await Promise.allSettled(jobs.map((j) => j.closed)); });
  for (const job of jobs) { const result = await job.closed; assert.equal(result.code, 0, result.stderr); }
  assert.ok(store.get(key, target, identity).hit); assert.deepEqual(readdirSync(join(p.dir, "ab")), [`${key}.json`]);
  const other = "cd" + "2".repeat(62); assert.equal(store.put(other, target, identity, [HEX]).written, true);
  assert.ok(store.get(key, target, identity).hit); assert.ok(store.get(other, target, identity).hit);
});

test("mid-write SIGKILL leaves absent/complete entries; dead stale temps sweep while active, foreign and unrelated files remain", async (t) => {
  const p = setup(t); mkdirSync(join(p.dir, "ab"), { recursive: true });
  const types = Array.from({ length: 256 }, () => ({ kind: "array", element: "number" }));
  const bigTarget = { id: "io.ts#large", params: types.map(() => ({ model: { kind: "ref" } })), heapModel: { kind: "heap", types, keys: [] } };
  const roots = types.map((_, i) => String(i)), nodes = Object.fromEntries(roots.map((id) => [id, { kind: "array", element: "number", values: Array.from({ length: 256 }, () => ["num", HEX]) }]));
  p.write(bigTarget, [[...roots, { roots, nodes }]]);
  const job = worker(p, "crash", 1);
  const stopped = new Promise((resolve, reject) => {
    job.child.once("message", resolve);
    job.closed.then((done) => reject(new Error(`The crash writer exited before its partial write: ${done.stderr}`)));
  });
  t.after(async () => { job.child.kill("SIGKILL"); await job.closed; });
  const message = await stopped; assert.equal(message.midWrite, true);
  const partials = readdirSync(join(p.dir, "ab")).filter((n) => n.endsWith(".tmp") && n.includes(`.${job.child.pid}.`));
  assert.equal(partials.length, 1);
  const orphan = join(p.dir, "ab", partials[0]);
  assert.throws(() => JSON.parse(readFileSync(orphan, "utf8")), SyntaxError);
  job.child.kill("SIGKILL"); assert.equal((await job.closed).signal, "SIGKILL");
  const store = openCache(p.dir, { mode: "readonly" }), got = store.get(key, bigTarget, identity);
  assert.ok(got.hit || got.miss, JSON.stringify(got));
  const old = new Date(Date.now() - STALE_TEMP_MS * 2); utimesSync(orphan, old, old);
  const dir = join(p.dir, "ab"), active = join(dir, `${key}.json.${HOST}.${process.pid}.${"a".repeat(32)}.tmp`);
  const foreign = join(dir, `${key}.json.${"0".repeat(16)}.999999.${"a".repeat(32)}.tmp`), unrelated = join(dir, "user.tmp");
  for (const f of [active, foreign, unrelated]) { writeFileSync(f, "keep"); utimesSync(f, old, old); }
  openCache(p.dir, { mode: "readonly" }); assert.equal(existsSync(orphan), true);
  const write = openCache(p.dir); assert.equal(write.put(key, target, identity, [HEX]).written, true);
  assert.equal(existsSync(orphan), false); for (const f of [active, foreign, unrelated]) assert.equal(existsSync(f), true, f);
});

test("size caps, symlinks, schema and invalid writes fail closed and leave no temporary files", (t) => {
  const p = setup(t), store = openCache(p.dir);
  assert.ok(store.put(key, target, identity, []).error); assert.equal(existsSync(p.dir), false);
  assert.equal(store.put(key, target, identity, [HEX]).written, true);
  const file = store.path(key); writeFileSync(file, " ".repeat(MAX_ENTRY_BYTES + 1)); assert.equal(store.get(key, target, identity).rejected, "oversized");
  rmSync(file); mkdirSync(file); assert.equal(store.get(key, target, identity).rejected, "not-a-file"); rmSync(file, { recursive: true });
  const unrelated = join(p.root, "unrelated.json"); writeFileSync(unrelated, "{}"); symlinkSync(unrelated, file);
  assert.equal(store.get(key, target, identity).rejected, "not-a-file");
  assert.throws(() => store.get("../../bad", target, identity), /Invalid proof key/);
});
