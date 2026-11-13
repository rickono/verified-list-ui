// Adversarial probes against stateful C1 at 5d8415aa. Owned scratch only.
import { writeFileSync } from "node:fs";
import { machineOf } from "/tmp/c1-review-stateful/verify/stateful/machine.mjs";
import { transitionsOf } from "/tmp/c1-review-stateful/verify/stateful/transitions.mjs";
import { checkStateful } from "/tmp/c1-review-stateful/verify/stateful/index.mjs";
import { solve } from "/tmp/c1-review-stateful/verify/proofs.mjs";
import { executeNative } from "/tmp/c1-review-stateful/verify/stateful/native.mjs";
import { traceOf, decodeValue } from "/tmp/c1-review-stateful/verify/stateful/values.mjs";

const idEnv = `// @environment
// resolves result === query
declare function id(query: number): Promise<number>;
`;
const look = `// @environment
// resolves Number.isFinite(result)
declare function lookup(query: number): Promise<number>;
`;
const lookReject = `// @environment
// resolves Number.isFinite(result)
// rejects
declare function lookup(query: number): Promise<number>;
`;

const cases = [];
const add = (id, source, actions, note) => cases.push({ id, source, actions, note });

add("old-decrease", `let x = 5;\n// always x >= old(x)\nexport function f(q: number) { x = 1; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "reachable decrease; old must be pre-step");
add("old-increment-inductive", `let x = 0;\n// state x >= 0\n// always x >= old(x)\nexport function f(q: number) { x = x + 1; }\n`,
  [{ kind: "call", entry: "f", args: [0] }, { kind: "call", entry: "f", args: [0] }], "positive control if inductive");
add("identity-after-write", `let x = 0;\n// always x === old(x)\nexport function f(q: number) { x = 1; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "post-state old would prove this");
add("plus-one-relation", `let x = 0;\n// state Number.isFinite(x)\n// always x === old(x) + 1\nexport function f(q: number) { x = x + 1; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "holds on reachable +1; may be non-inductive at the top of binary64");
add("signed-zero-neg", `let x = 0;\n// always Object.is(x, old(x))\nexport function f(q: number) { x = -x; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "negating zero yields -0");
add("mul-zero-sign", `let x = 0;\n// state Object.is(x, 0)\nexport function f(q: number) { x = q * 0; }\n`,
  [{ kind: "call", entry: "f", args: [-1] }], "(-1)*0 is -0");
add("postfix-assign", `let x = 1;\n// always x === old(x) + 1\nexport function f(q: number) { x = x++; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "x = x++ keeps x");
add("postfix-stays", `let x = 1;\n// state x === 2\nexport function f(q: number) { x = x++; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "must not treat postfix as increment");
add("prefix-increments", `let x = 1;\n// state x === 1\nexport function f(q: number) { x = ++x; }\n`,
  [{ kind: "call", entry: "f", args: [0] }, { kind: "call", entry: "f", args: [0] }], "second call leaves 3");
add("dead-else-live", `let x = 0;\n// state x === 0\nexport function f(q: number) { if (false) x = 1; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "dead write must not be required");
add("dead-write-as-live", `let x = 0;\n// state x === 1\nexport function f(q: number) { if (false) x = 1; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "dead write must not happen");
add("and-assign", `let x = 0;\n// state x === 0\nexport function f(q: number) { q > 0 && (x = 1); }\n`,
  [{ kind: "call", entry: "f", args: [1] }], "assignment in && must run");
add("or-assign", `let x = 0;\n// state x === 0\nexport function f(q: number) { q > 0 || (x = 1); }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "assignment in || must run when false");
add("cond-assign", `let x = 0;\n// state x === 0\nexport function f(q: number) { if ((x = 1) === 1) x = x; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "assignment in condition");
add("overflow-sum", `let x = 0;\n// state Number.isFinite(x)\nexport function f(q: number) { x = q + q; }\n`,
  [{ kind: "call", entry: "f", args: [Number.MAX_VALUE] }], "MAX_VALUE+MAX_VALUE is Infinity");
add("nan-sub", `let x = 0;\n// state Number.isFinite(x)\nexport function f(q: number) { x = q - q; }\n`,
  [{ kind: "call", entry: "f", args: [Infinity] }], "Infinity-Infinity is NaN");
add("entry-nan", `let x = 0;\n// state Number.isFinite(x)\nexport function f(q: number) { x = q; }\n`,
  [{ kind: "call", entry: "f", args: [NaN] }], "parameter can be NaN");
add("capture-after-write", idEnv + `let x = 0;\nlet y = 0;\n// state y === 0\nexport async function f(q: number) {\n  x = 1;\n  const value: number = await id(x);\n  y = value;\n}\n`,
  [{ kind: "call", entry: "f", args: [0] }, { kind: "resolve", request: 1, op: "id", value: 1 }],
  "request must see x after the write");
add("second-await-stale", idEnv + `let x = 0;\nlet y = 0;\n// state y === 1\nexport async function f(q: number) {\n  x = 1;\n  const a: number = await id(x);\n  x = 2;\n  const b: number = await id(x);\n  y = b;\n}\n`,
  [{ kind: "call", entry: "f", args: [0] }, { kind: "resolve", request: 1, op: "id", value: 1 }, { kind: "resolve", request: 2, op: "id", value: 2 }],
  "second request must see x === 2");
add("snap-not-cell", idEnv + `let x = 0;\nlet y = 0;\n// state y === 1\nexport async function f(q: number) {\n  const snap: number = x;\n  x = 1;\n  const value: number = await id(snap);\n  y = value;\n}\n`,
  [{ kind: "call", entry: "f", args: [0] }, { kind: "resolve", request: 1, op: "id", value: 0 }],
  "literal correlation uses the const snap, not the updated cell");
add("two-ops", `// @environment
// resolves result === 1
declare function a(query: number): Promise<number>;
// @environment
// resolves result === 2
declare function b(query: number): Promise<number>;
let y = 0;
// state y === 2
export async function f(q: number) {
  const value: number = await a(q);
  y = value;
}
`, [{ kind: "call", entry: "f", args: [0] }, { kind: "resolve", request: 1, op: "a", value: 1 }],
  "await a must not inherit b's resolves");
add("unsat-resolves-hide-write", `// @environment
// resolves result === 0
// resolves result === 1
declare function id(query: number): Promise<number>;
let x = 0;
// state x === 0
export async function f(q: number) {
  x = 1;
  const value: number = await id(q);
  x = 0;
}
`,
  [{ kind: "call", entry: "f", args: [0] }],
  "creation write must not be discharged by later contradictory resolves");
add("reject-strict", lookReject + `let x = 0;\n// always x > old(x)\nexport async function f(q: number) {\n  x = x + 1;\n  const value: number = await lookup(q);\n  x = x + 1;\n}\n`,
  [{ kind: "call", entry: "f", args: [0] }, { kind: "reject", request: 1, op: "lookup" }],
  "rejection stutter must not satisfy a strict increase");
add("conditional-reset", look + `let latest = 0;\nlet shownFor = 0;\nlet shown = 0;\n// state 0 <= shownFor && shownFor <= latest\n// state Number.isFinite(shown)\n// always shownFor >= old(shownFor)\nexport async function search(query: number) {\n  const id: number = latest + 1;\n  latest = id;\n  // pending 1 <= id && id <= latest\n  const value: number = await lookup(query);\n  if (id !== latest) return;\n  shownFor = id;\n  shown = value;\n}\nexport function reset(q: number) { if (q > 0) latest = 0; }\n`,
  [{ kind: "call", entry: "search", args: [0] }, { kind: "resolve", request: 1, op: "lookup", value: 1 }, { kind: "call", entry: "reset", args: [1] }],
  "conditional clear must preserve shownFor <= latest");
add("assign-in-test", look + `let latest = 0;\nlet shownFor = 0;\nlet shown = 0;\n// state 0 <= shownFor && shownFor <= latest\n// state Number.isFinite(shown)\n// always shownFor >= old(shownFor)\nexport async function search(query: number) {\n  const id: number = latest + 1;\n  latest = id;\n  // pending 1 <= id && id <= latest\n  const value: number = await lookup(query);\n  if (id !== latest) return;\n  shownFor = id;\n  shown = value;\n}\nexport function reset(q: number) { if ((latest = 0) === 0) return; }\n`,
  [{ kind: "call", entry: "search", args: [0] }, { kind: "resolve", request: 1, op: "lookup", value: 1 }, { kind: "call", entry: "reset", args: [0] }],
  "assignment in a condition must update the cell");
add("inverted-guard", look + `let latest = 0;\nlet shownFor = 0;\nlet shown = 0;\n// state 0 <= shownFor && shownFor <= latest\n// state Number.isFinite(shown)\n// always shownFor >= old(shownFor)\nexport async function search(query: number) {\n  const id: number = latest + 1;\n  latest = id;\n  // pending 1 <= id && id <= latest\n  const value: number = await lookup(query);\n  if (id === latest) return;\n  shownFor = id;\n  shown = value;\n}\n`,
  [{ kind: "call", entry: "search", args: [0] }, { kind: "call", entry: "search", args: [0] }, { kind: "resolve", request: 2, op: "lookup", value: 1 }, { kind: "resolve", request: 1, op: "lookup", value: 1 }],
  "inverted latest-wins guard displays the stale id");
add("chain-assign", `let x = 0;\n// state x === 5\nexport function f(q: number) { x = (x = 2) + (x = 3) - 3; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "outer assignment stores 2, not the intermediate sum 5");
add("always-false", `let x = 0;\n// always false\nexport function f(q: number) { x = x; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "always false is a real obligation");
add("state-false", `let x = 0;\n// state false\nexport function f(q: number) { x = x; }\n`,
  [], "init must defeat an unsatisfiable invariant");
add("init-mismatch", `let x = 0;\n// state x === 1\nexport function f(q: number) {}\n`,
  [], "initial cells are observed before any call");
add("both-branches-decrement", `let x = 0;\n// state x >= 0\n// always x >= old(x)\nexport function f(q: number) { if (q > 0) x = x - 1; else x = x - 1; }\n`,
  [{ kind: "call", entry: "f", args: [0] }], "both branches decrease");

const grammar = [];
function gram(id, source) { grammar.push({ id, source }); }
const baseCell = `let x = 0;\n// state x >= 0\nexport function f(q: number) { x = -1; }\n`;
gram("homoglyph-state", baseCell.replace("// state x >= 0", "// st\u0430te x === 1\n// state x >= 0"));
gram("only-homoglyph", `let x = 0;\n// st\u0430te x === 1\nexport function f(q: number) { x = 0; }\n`);
gram("block-state", `let x = 0;\n/* state x === 1 */\nexport function f(q: number) {}\n`);
gram("ensures-false", `let x = 0;\n// state x >= 0\n// ensures false\nexport function f(q: number) {}\n`);
gram("no-properties", `let x = 0;\nexport function f(q: number) { x = 1; }\n`);
gram("typo-staet", `let x = 0;\n// staet x === 1\nexport function f(q: number) {}\n`);
gram("env-unknown", `// @environment\n// resolves result === query\n// maybe\ndeclare function id(query: number): Promise<number>;\nlet x = 0;\n// state x >= 0\nexport function f(q: number) {}\n`);
gram("do-while", `let x = 0;\n// state x === 0\nexport function f(q: number) { do { x = 1; } while (false); }\n`);
gram("for-of", `let x = 0;\n// state x === 0\nexport function f(q: number) { for (const v of [1]) x = v; }\n`);
gram("switch", `let x = 0;\n// state x === 0\nexport function f(q: number) { switch (q) { case 1: x = 1; } }\n`);
gram("void-assign", `let x = 0;\n// state x === 0\nexport function f(q: number) { void (x = 1); }\n`);
gram("delete-cell", `let x = 0;\n// state x === 0\nexport function f(q: number) { delete x; }\n`);
gram("shadow-branch", `let x = 0;\n// state x >= 0\nexport function f(q: number) { if (q > 0) { const t: number = 1; } else { const t: number = 2; } }\n`);
gram("while-false", `let x = 0;\n// state x === 0\nexport function f(q: number) { while (false) { x = 1; } }\n`);
gram("for-false", `let x = 0;\n// state x === 0\nexport function f(q: number) { for (; false; ) { x = 1; } }\n`);
gram("while-true-inc", `let x = 0;\n// state x >= 0\nexport function f(q: number) { while (q > 2) { x = x + 1; } }\n`);

const out = { grammar: [], cases: [], api: [] };

for (const g of grammar) {
  const row = { id: g.id };
  try {
    const machine = machineOf(`${g.id}.ts`, g.source);
    let transitions;
    try { transitions = transitionsOf(machine); }
    catch (e) {
      row.phase = "transitions"; row.error = e.constructor.name; row.message = e.message; row.status = e.status;
      row.line = e.stack?.split("\n")[1]?.trim();
      out.grammar.push(row); continue;
    }
    row.phase = "compiled"; row.units = transitions.units.map((u) => u.name);
    const solved = await solve(transitions.units.map((u) => u.target), 20_000);
    row.statuses = transitions.units.map((u, i) => ({ unit: u.name, status: solved[i].status }));
    row.allPass = solved.every((s) => s.status === "verified" || s.status === "vacuous");
  } catch (e) {
    row.phase = row.phase ?? "machine"; row.error = e.constructor.name; row.message = e.message; row.status = e.status;
  }
  out.grammar.push(row);
}

for (const c of cases) {
  const row = { id: c.id, note: c.note };
  try {
    const machine = machineOf(`${c.id}.ts`, c.source);
    const transitions = transitionsOf(machine);
    row.eventBound = machine.assumptions.eventBound;
    row.units = transitions.units.map((u) => u.name);
    const solved = await solve(transitions.units.map((u) => u.target), 25_000);
    row.statuses = transitions.units.map((u, i) => ({ unit: u.name, kind: u.kind, status: solved[i].status, reason: solved[i].reason }));
    row.allPass = solved.every((s) => s.status === "verified" || s.status === "vacuous");
    row.executableCleared = transitions.units.every((u) => u.target.executable === undefined);
    if (row.allPass) {
      const native = executeNative(machine, traceOf(machine, c.actions), 1000);
      row.native = { status: native.status, reason: native.reason, violation: native.violation ?? null,
        state: native.trace?.steps?.at(-1)?.state && Object.fromEntries(Object.entries(native.trace.steps.at(-1).state).map(([k, v]) => [k, decodeValue(v)])) };
      row.falseProof = native.violation != null || native.status !== "ok";
    }
  } catch (e) {
    row.error = e.constructor.name; row.message = e.message; row.status = e.status;
    row.stack = e.stack?.split("\n").slice(0, 4);
  }
  out.cases.push(row);
  console.error(JSON.stringify({ id: row.id, allPass: row.allPass, falseProof: row.falseProof, error: row.error, message: row.message, statuses: row.statuses }));
}

try {
  const source = grammar.find((g) => g.id === "while-false").source;
  await checkStateful("while.ts", source, { timeoutMs: 5_000, maxDepth: 0 });
  out.api.push({ id: "checkStateful-while", threw: false });
} catch (e) {
  out.api.push({ id: "checkStateful-while", name: e.constructor.name, message: e.message, top: e.stack?.split("\n")[1]?.trim() });
}
try {
  machineOf("bad", { not: "text" });
  out.api.push({ id: "machine-nonsource", threw: false });
} catch (e) {
  out.api.push({ id: "machine-nonsource", name: e.constructor.name, message: e.message });
}

writeFileSync("/tmp/c1-adv-results.json", JSON.stringify(out, null, 2));
console.log("wrote results", out.cases.filter((c) => c.falseProof).map((c) => c.id), out.grammar.filter((g) => g.allPass).map((g) => g.id));
