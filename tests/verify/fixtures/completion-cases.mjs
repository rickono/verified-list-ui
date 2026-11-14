import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
export const readCompletion = (name) => readFileSync(new URL(`./stateful/completion/${name}.ts`, import.meta.url), "utf8");
export function recordCompletion(name, value) {
  if (!process.env.COMPLETION_EVIDENCE) return;
  mkdirSync(process.env.COMPLETION_EVIDENCE, { recursive: true });
  writeFileSync(join(process.env.COMPLETION_EVIDENCE, `${name}.json`), JSON.stringify(value, null, 2) + "\n");
}
