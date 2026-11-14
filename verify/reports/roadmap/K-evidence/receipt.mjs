// Regenerate from the checkout root after all recorded commands have ended.
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const root=process.cwd(),base="verify/reports/roadmap/K-evidence";
const git=(...args)=>execFileSync("git",args,{encoding:"utf8"}).trim();
const hash=(b)=>createHash("sha256").update(b).digest("hex");
const files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=`${dir}/${entry.name}`;
  if(entry.isDirectory())await walk(path);
  else if(!["receipt.json","SHA256SUMS"].includes(entry.name))files.push(path);
}}
await walk(base);
const sources=["verify/README.md","verify/source.mjs","verify/heap.mjs","verify/data.mjs","verify/index.mjs","verify/proofs.mjs","pnpm-lock.yaml",
  ...git("diff","--name-only","dedde91b","--","tests/verify").split("\n").filter(Boolean),"verify/reports/roadmap/K-implementation.md"];
const inputs=[];
for(const path of [...new Set([...sources,...files])].sort()){
  const bytes=await readFile(path);inputs.push({path,bytes:bytes.length,sha256:hash(bytes)});
}
const tap=[];
for(const file of files.filter((p)=>p.endsWith(".tap"))){
  const text=await readFile(file,"utf8"),value=(name)=>Number(new RegExp(`^# ${name} (\\d+)$`,"m").exec(text)?.[1]??0);
  tap.push({path:file,tests:value("tests"),pass:value("pass"),fail:value("fail"),skipped:value("skipped")});
}
assert.equal(git("show","dedde91b:verify/data.mjs"), (await readFile("verify/data.mjs","utf8")).trimEnd(),"Numeric gate must stay byte-identical apart from git's stdout trim");
const unchanged=["verify/data.mjs","verify/index.mjs","verify/proofs.mjs","verify/cache.mjs","verify/manifest.mjs","verify/evidence.mjs",
  "verify/design/mutating-loops.md","docs/verification-roadmap.json",".audit"];
assert.equal(git("diff","dedde91b","--",...unchanged),"");
const frozen=JSON.parse(await readFile(`${base}/final-inputs.json`,"utf8"));
for(const [path,sha256] of Object.entries(frozen.files)) assert.equal(hash(await readFile(path)),sha256,`Changed during final run: ${path}`);
const full=await readFile(`${base}/logs/full-final.tap`,"utf8");
const publicCases=[];
for(const line of full.split("\n")) if(line.startsWith('# {"id":')) {
  const row=JSON.parse(line.slice(2).replaceAll("\\#","#"));
  if(row.id.startsWith("H") || ["old-slice-swap","fill"].includes(row.id) || row.expect!==undefined) publicCases.push(row);
}
assert.equal(publicCases.length,64);
const receipt={codeSha:git("rev-parse",process.argv[2]??"HEAD"),receiptParent:git("rev-parse","HEAD"),branch:git("branch","--show-current"),checkout:root,
  baseline:"32bd5b260aa116ca88642a1479bed8d3fc447f4b",preparedParent:"dedde91b9f6e1fec3a30f5e39cae65f5381b6b26",
  runtime:process.version,platform:process.platform,arch:process.arch,generatedAt:new Date().toISOString(),
  unchanged,tap,publicCases,inputs};
await writeFile(`${base}/receipt.json`,JSON.stringify(receipt,null,2)+"\n");
await writeFile(`${base}/SHA256SUMS`,inputs.map((x)=>`${x.sha256}  ${x.path}`).join("\n")+"\n");
console.log(JSON.stringify({codeSha:receipt.codeSha,files:inputs.length,tap,publicCases:publicCases.length}));
