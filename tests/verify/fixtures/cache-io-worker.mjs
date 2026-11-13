// Exercises real atomic cache I/O in separate OS processes, without a solver.
import fs, { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { openCache } from "../../../verify/cache.mjs";
const [mode, dir, configFile, countText] = process.argv.slice(2);
const { target, witnesses, key, identity } = JSON.parse(readFileSync(configFile, "utf8"));
if (mode === "crash") {
  // Fault injection only at the filesystem boundary: write real partial bytes,
  // then stop the OS process so the parent can kill it before atomic rename.
  fs.writeFileSync = (fd, data) => {
    fs.writeSync(fd, data.slice(0, Math.floor(data.length / 2)));
    process.send({ midWrite: true });
    process.kill(process.pid, "SIGSTOP");
    throw new Error("The interrupted writer must be killed, never resumed.");
  };
  syncBuiltinESMExports();
}
const store = openCache(dir, { mode: mode === "reader" ? "readonly" : "readwrite" });
if (mode === "reader") {
  let hits = 0, absent = 0;
  for (let i = 0; i < Number(countText); i++) {
    const got = store.get(key, target, identity);
    if (got.hit) hits++;
    else if (got.miss) absent++;
    else throw new Error(JSON.stringify(got));
  }
  console.log(JSON.stringify({ hits, absent }));
} else for (let i = 0; i < Number(countText); i++) {
  const got = store.put(key, target, identity, witnesses[i % witnesses.length]);
  if (!got.written) throw new Error(JSON.stringify(got));
}
