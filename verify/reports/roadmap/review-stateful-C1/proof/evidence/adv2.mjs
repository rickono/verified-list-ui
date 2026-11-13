import { machineOf } from "/tmp/c1-review-stateful/verify/stateful/machine.mjs";
import { transitionsOf } from "/tmp/c1-review-stateful/verify/stateful/transitions.mjs";
import { solve } from "/tmp/c1-review-stateful/verify/proofs.mjs";
import { executeNative } from "/tmp/c1-review-stateful/verify/stateful/native.mjs";
import { traceOf, decodeValue } from "/tmp/c1-review-stateful/verify/stateful/values.mjs";
import { checkStateful } from "/tmp/c1-review-stateful/verify/stateful/index.mjs";

const cases = [
  ["negzero-init", `let x = -0;\n// state Object.is(x, 0)\nexport function f(q: number) {}\n`, []],
  ["negzero-write", `let x = 0;\n// state Object.is(x, 0)\nexport function f(q: number) { x = -0; }\n`, [{ kind: "call", entry: "f", args: [0] }]],
  ["y-postfix", `let x = 0;\nlet y = 0;\n// state y === 1\nexport function f(q: number) { y = x++; }\n`, [{ kind: "call", entry: "f", args: [0] }]],
  ["chain-cells", `let x = 0;\nlet y = 0;\n// state x === 0 || y === 0\nexport function f(q: number) { x = y = 1; }\n`, [{ kind: "call", entry: "f", args: [0] }]],
  ["comma-write", `let x = 0;\nlet y = 0;\n// state x === 0\nexport function f(q: number) { x = 1, y = 1; }\n`, [{ kind: "call", entry: "f", args: [0] }]],
  ["cond-expr", `let x = 0;\n// state x === 0\nexport function f(q: number) { x = q ? 1 : 0; }\n`, [{ kind: "call", entry: "f", args: [1] }]],
  ["homo-true", `let x = 0;\n// st\u0430te x === 1\n// state true\nexport function f(q: number) {}\n`, []],
  ["homo-only-check", `let x = 0;\n// st\u0430te x === 1\nexport function f(q: number) {}\n`, []],
  ["load-then-add", `let x = 0;\n// state Number.isFinite(x)\nexport function load(q: number) { x = q; }\nexport function step() { x = x + x; }\n`,
    [{ kind: "call", entry: "load", args: [1.7976931348623157e308] }, { kind: "call", entry: "step", args: [] }]],
];
for (const [id, source, actions] of cases) {
  const row = { id };
  try {
    const machine = machineOf(id + ".ts", source);
    row.properties = machine.state.map((c) => c.text).concat(machine.always.map((c) => c.text));
    const t = transitionsOf(machine);
    const solved = await solve(t.units.map((u) => u.target), 25_000);
    row.statuses = t.units.map((u, i) => [u.name, solved[i].status]);
    row.allPass = solved.every((s) => s.status === "verified" || s.status === "vacuous");
    if (row.allPass) {
      const native = executeNative(machine, traceOf(machine, actions), 1000);
      const last = native.trace?.steps?.at(-1)?.state;
      row.native = { status: native.status, violation: native.violation ?? null,
        state: last && Object.fromEntries(Object.entries(last).map(([k, v]) => [k, decodeValue(v)])) };
      row.falseProof = !!(native.violation || native.status !== "ok");
    }
  } catch (e) {
    row.error = e.constructor.name; row.message = e.message; row.status = e.status;
  }
  console.log(JSON.stringify(row));
}
const homo = `let x = 0;\n// st\u0430te x === 1\n// state true\nexport function f(q: number) {}\n`;
const report = await checkStateful("homo.ts", homo, { timeoutMs: 20_000, maxDepth: 0 });
console.log(JSON.stringify({ id: "checkStateful-homo", status: report.status, properties: report.properties, units: report.units?.map((u) => [u.unit, u.status]) }));
