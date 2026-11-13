// Usage (through serial-verify.py): node compare.mjs <output-directory>
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, symlink, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const parent="eaf23c0ca4a2e61e9d844a84a876755872eb16e7";
const root=fileURLToPath(new URL("../../../../",import.meta.url));
const snapshot=fileURLToPath(new URL("./snapshot.mjs",import.meta.url));
const out=resolve(process.argv[2]);
const scratch=await mkdtemp(join(tmpdir(),"heap-write-parent-"));
const sha=(bytes)=>createHash("sha256").update(bytes).digest("hex");
await mkdir(out,{recursive:true});
try {
  const archive=execFileSync("git",["archive",parent,"verify","package.json","pnpm-lock.yaml"],{cwd:root,maxBuffer:32*1024*1024});
  execFileSync("tar",["-xf","-","-C",scratch],{input:archive});
  const hashes=[];
  const files=execFileSync("git",["ls-tree","-r","--name-only",parent,"--","verify","package.json","pnpm-lock.yaml"],{cwd:root,encoding:"utf8"}).trim().split("\n");
  for(const file of files) {
    const original=execFileSync("git",["show",`${parent}:${file}`],{cwd:root,maxBuffer:4*1024*1024});
    const actual=await readFile(join(scratch,file)); assert.equal(sha(actual),sha(original),file);
    hashes.push({file,parent:sha(original)});
  }
  for(const file of ["verify/heap.mjs","verify/data.mjs","verify/source.mjs","verify/index.mjs","verify/proofs.mjs","pnpm-lock.yaml"]) hashes.find((h)=>h.file===file).current=sha(await readFile(join(root,file)));
  await writeFile(join(out,"tree-hashes.json"),JSON.stringify({parent,files:hashes},null,2)+"\n");
  await symlink(join(root,"node_modules"),join(scratch,"node_modules"),"dir");
  for(const [label,tree] of [["parent",scratch],["current",root]]) {
    console.log(`SNAPSHOT ${label} ${tree}`);
    execFileSync(process.execPath,[snapshot,tree,join(out,label)],{cwd:root,stdio:"inherit",timeout:180_000});
  }
  for(const name of ["queries","smt","runtime","native","sources"]) {
    const a=await readFile(join(out,"parent",`${name}.json`)), b=await readFile(join(out,"current",`${name}.json`));
    assert.ok(a.equals(b),`${name}: parent/current bytes differ`);
    console.log(JSON.stringify({name,identical:true,sha256:sha(b),bytes:b.length}));
  }
} finally { await rm(scratch,{recursive:true,force:true}); }
