// Unchanged pinned nice.js. The parent must impose the timeout.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const nicePath = join(here, "../../library-campaigns/pins/d3-array/nice.js");
const { default: nice } = await import(pathToFileURL(nicePath).href);
const [startBits, stopBits, count] = process.argv.slice(2);
const start = Buffer.from(startBits, "hex").readDoubleBE(0);
const stop = Buffer.from(stopBits, "hex").readDoubleBE(0);
console.log(JSON.stringify({
  event: "calling",
  sourceSha256: createHash("sha256").update(readFileSync(nicePath)).digest("hex"),
  startBits, stopBits, count: Number(count),
}));
const result = nice(start, stop, Number(count));
console.log(JSON.stringify({ event: "returned", result }));
