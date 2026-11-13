// Execute only the independent obligations skipped after the original backend
// wall-clock timeouts. Never repeat a query that already returned a status.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkValidity, obligations } from "./validity.mjs";
const [directory] = process.argv.slice(2);
const previous = readFileSync(join(directory, "validity.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
for (const row of previous.filter((r) => r.status === "not-run")) {
  const query = obligations(row.width).find((q) => q.id === row.id);
  await checkValidity([query], 5_000, join(directory, "validity"));
}
