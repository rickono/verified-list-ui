import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

register(new URL("./resolver-hooks.mjs", import.meta.url), { parentURL: import.meta.url });
const archive = "/Users/rick/.t3/worktrees/verified-list-ui/t3-64551363";
const implementation = "20ff20556fe19a72f73ccf3708d7bd7329ec2bc0";
const pinned = ["verify/stateful/temporal.mjs", "verify/stateful/machine.mjs", "verify/stateful/clauses.mjs"];
const pins = {};
for (const path of pinned) {
  const onDisk = readFileSync(`${archive}/${path}`);
  const expected = execFileSync("git", ["show", `${implementation}:${path}`], { cwd: archive });
  if (!onDisk.equals(expected)) throw new Error(`archive ${path} is not 20ff205`);
  pins[path] = createHash("sha256").update(onDisk).digest("hex");
}
const { machineOf } = await import(pathToFileURL(`${archive}/verify/stateful/machine.mjs`).href);
const zero = readFileSync(`${archive}/tests/verify/fixtures/stateful/completion/zero.ts`, "utf8");
const rows = [];
function row(name, source) {
  try {
    const machine = machineOf(`${name}.ts`, source);
    const entry = machine.entries.find((e) => e.name === "work");
    rows.push({
      name,
      status: "parsed",
      goals: machine.temporal?.goals?.map((g) => g.entry) ?? [],
      entries: machine.entries.map((e) => e.name),
      captures: entry?.awaits?.map((w) => w.captures?.filter((c) => !c.argument).map((c) => `${c.kind ?? c.name}:${c.name}`)) ?? [],
    });
  } catch (error) {
    rows.push({ name, status: error.status ?? "throw", message: error.message });
  }
}
row("adjacent-prose", zero.replace("// leads work completes", "// returns a boolean\n// see the note\n// leads work completes"));
row("separated-prose", zero.replace("// leads work completes", "// returns a boolean\n// see the note\nexport function marker() { return 0; }\n// leads work completes"));
const live = `// @environment
// resolves result === q
// settles eventually
declare function op(q: number): Promise<number>;
let n = 0;
// state n >= 0
// leads work completes
export async function work(q: number) {
  REPL
  const a: number = await op(q);
  n = held;
}
`;
row("let-live-across-await", live.replace("REPL", "let held: number = q;"));
row("const-live-across-await", live.replace("REPL", "const held: number = q;"));
row("double-space-leads", zero.replace("// leads work completes", "// leads  work completes"));
const out = {
  archiveHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: archive, encoding: "utf8" }).trim(),
  pinsMatch20ff205: true,
  pins,
  machineUrl: pathToFileURL(`${archive}/verify/stateful/machine.mjs`).href,
  rows,
};
writeFileSync(new URL("./followup.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(rows, null, 2));
