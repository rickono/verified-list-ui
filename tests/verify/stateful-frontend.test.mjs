import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { machineOf } from "../../verify/stateful/machine.mjs";

const fixtures = new URL("./fixtures/stateful/", import.meta.url);
const read = (name) => readFileSync(new URL(name, fixtures), "utf8");
const source = read("pilots/search.ts");
test("all recovered pilots/variants are audited by the production frontend", () => {
  const reject = /^(V1-|V1b-|V2-|V3-|V4-|V5-|V5b-|V9-|V10-|V14-|V15-|V16-)/;
  for (const name of readdirSync(new URL("variants/", fixtures))) {
    if (reject.test(name)) assert.throws(() => machineOf(name, read(`variants/${name}`)), (e) => e.status === "unsupported" && e.span.end > e.span.start, name);
    else assert.ok(machineOf(name, read(`variants/${name}`)).entries.length, name);
  }
  assert.throws(() => machineOf("unsupported.ts", read("pilots/search-unsupported.ts")), (e) => e.status === "unsupported" && read("pilots/search-unsupported.ts").slice(0, e.span.start).split("\n").length === 20);
});
test("closed grammar rejects case, colon, edit distance, block and unknown environment lines", () => {
  for (const keyword of ["State", "state:", "state:false", "state(false)", "state//false", "stat", "staet", "stxte", "invariant", "safety:", "liveness", "fairness", "requires", "ensures"]) {
    assert.throws(() => machineOf("bad.ts", source.replace("// state 0", `// ${keyword} 0`)), /clause|expression/);
  }
  for (const line of ["nonsense", "resolve Number.isFinite(result)", "rejects sometimes", "order fifo", "abort advisory", "settles soon"]) {
    assert.throws(() => machineOf("bad-env.ts", source.replace("// resolves Number.isFinite(result)", `// ${line}`)), /clause|environment/);
  }
  assert.throws(() => machineOf("bad.ts", source.replace("// state 0 <= shownFor && shownFor <= latest", "/* state false */")), /block/);
  for (const keyword of ["pending", "resolves", "state"]) {
    const original = keyword === "pending" ? "1 <= id && id <= latest" : keyword === "resolves" ? "Number.isFinite(result)" : "0 <= shownFor && shownFor <= latest";
    assert.throws(() => machineOf("old.ts", source.replace(`// ${keyword} ${original}`, `// ${keyword} old(latest) === latest`)), /old/);
  }
});
test("assumptions expose defaults, declared-unused settling and canonical identity", () => {
  const base = machineOf("search.ts", source), again = machineOf("search.ts", source);
  assert.deepEqual(base.assumptions, again.assumptions);
  assert.equal(base.assumptions.eventBound, null);
  assert.match(base.assumptions.numericDomain, /binary64.*2\^53/);
  assert.equal(base.assumptions.environment[0].settles, "may-never-settle");
  assert.equal(base.assumptions.environment[0].rejects, "never-rejects");
  for (const line of ["rejects", "settles eventually"]) {
    const changed = machineOf("search.ts", source.replace("// @environment", `// @environment\n// ${line}`));
    assert.notEqual(changed.assumptions.sha256, base.assumptions.sha256);
    assert.equal(changed.assumptions.environment[0].settlesUse, line === "settles eventually" ? "declared-unused for safety" : "not declared; no progress guarantee");
  }
  assert.throws(() => machineOf("x.ts", {}), TypeError);
});
test("module state, ambient signatures, binding identities and nested awaits fail closed", () => {
  for (const [before, after] of [
    ["let latest = 0", "let latest = {}"], ["query: number", "query: any"],
    ["const id: number", "const latest: number"], ["Promise<number>", "number"],
    ["shown = value", "undeclared = value"], ["const id: number = latest + 1", "const id = latest + 1"],
    ["const id: number = latest + 1", "let id: number = latest + 1"],
  ]) assert.throws(() => machineOf("bad.ts", source.replace(before, after)), (e) => e.status === "unsupported");
});

test("Unicode edits in clause keywords cannot silently discard properties", () => {
  const words = ["st\u0430te", "st\u200bate", "st\uff41te", "st\u{1d41a}te", "st\u{1f9ea}ate", "st\u200b\u200bate", "st\u0430te(false)", "\uff53\uff54\uff41\uff54\uff45"];
  for (const word of words) {
    const input = `let x = 0;\n// ${word} x === 1\n// state true\nexport function entry() {}`;
    assert.throws(() => machineOf("unicode.ts", input), (error) => error.status === "unsupported" && error.span.start === input.indexOf("//") && /clause|expression/.test(error.message), word);
  }
  const prose = "let x = 0;\n// Stale-response documentation\n// Пример обычного комментария\n// state true\nexport function entry() {}";
  assert.deepEqual(machineOf("prose.ts", prose).state.map((clause) => clause.text), ["true"]);
});
