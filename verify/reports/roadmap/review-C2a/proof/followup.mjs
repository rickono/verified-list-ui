import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const root = "/tmp/c2a-measure";
const load = (rel) => import(pathToFileURL(join(root, rel)).href);
const { machineOf } = await load("verify/stateful/machine.mjs");
const { transitionsOf } = await load("verify/stateful/transitions.mjs");
const { solve } = await load("verify/proofs.mjs");
const listener = await import("node:fs").then((fs) => fs.readFileSync(join(root, "tests/verify/fixtures/stateful/protocols/listeners.ts"), "utf8"));
const base = machineOf("listeners.ts", listener);
const units = transitionsOf(base).units;
const pick = (name) => units.find((u) => u.name === name);
const text = (u) => ({ pre: u.target.pre, post: u.target.postconditions });
const handler = units.find((u) => u.kind === "handler");
const entry = units.find((u) => u.name === "bind$0");
const out = {
  handlerPre: handler.target.pre,
  handlerPostTail: handler.target.postconditions.slice(0, 4),
  entryPost: entry.target.postconditions.filter((s) => s.includes("capture") || s.includes("1.0") || s.includes("(_ to_fp")),
  requestCreation: text(pick("$request$creation")),
  closureAlloc: text(pick("$closure$allocation")),
};
async function prove(id, source) {
  const machine = machineOf(id + ".ts", source);
  const transitions = transitionsOf(machine);
  const outcomes = await solve(transitions.units.map((u) => u.target), 20000);
  const bad = transitions.units.map((u, i) => ({ name: u.name, status: outcomes[i].status })).filter((u) => !["verified", "vacuous"].includes(u.status));
  return { proved: bad.length === 0, bad };
}
const target = `// @environment\n// protocol node22-event-target-v1\ndeclare const events: EventTarget;\n`;
const src = (property, expr) => `${target}let shown = 0;\n// state ${property}\nexport function bind() {\n  const value: number = ${expr};\n  const handler = () => { shown = value; };\n  events.addEventListener("x", handler);\n}\n`;
out.plusLoose = await prove("plus-loose", src("shown === 0 || shown === 1", "1 + 1"));
out.plusExact = await prove("plus-exact", src("shown === 0 || shown === 2", "1 + 1"));
out.plusAlias = await prove("plus-alias", src("shown === 0 || shown === 1", "shown"));
const nan = `let x = 0;\n// state x === 0 || Number.isNaN(x)\nexport function f(signal: AbortSignal) { x = 0 / 0; }\n`;
out.nanOr = await prove("nan-or", nan);
writeFileSync("/tmp/c2a-proof-followup.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({ plusLoose: out.plusLoose, plusExact: out.plusExact, plusAlias: out.plusAlias, nanOr: out.nanOr, handlerPre: out.handlerPre, requestPost: out.requestCreation.post, closurePost: out.closureAlloc.post }, null, 2));
