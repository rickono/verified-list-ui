// fold/, the untrusted builder: .fold source -> generated .v -> Rocq.
//
// Nothing here is part of the trusted base.  Rocq checks whatever .v the
// builder writes (fold/apps/dune, AppsSame.v), so these tests check that the
// builder is useful: it rejects what it should with a diagnostic on the
// right span, it reports failed proofs on the rule that breaks them, its
// span mappings are well formed, and the TypeScript Rocq prints for the
// .fold apps is the module the Foldkit tests run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyze, build, compile, FoldBuildError, FoldError, parse, spanMappings } from "../../fold/src/index.mjs";

const read = (p) => readFileSync(resolve(p), "utf8");
const counter = read("foldkit-web/src/counter.fold");
const list = read("foldkit-web/src/list.fold");
const out = resolve(process.env.FOLDKIT_OUT ?? "_build/default/foldkit");

// The FoldError [build] throws for [src], or null.
const rejection = (src) => {
  try {
    build(src);
    return null;
  } catch (e) {
    if (!(e instanceof FoldError)) throw e;
    return e;
  }
};

const small = (rules, invariants = "") => `
export const cap = 10;
model({
  level: saved(nat(cap), 0),
  open: local(bool, true),
});
store("level", { save: "SaveLevel", done: "SavedLevel", failed: "FailedLevel" });
${rules}
${invariants}
`;

// Each case: the source, the text the error is on, its code, its message.
// The span is on one occurrence of the text (the second rule, for a
// repeated name).
const rejects = (cases) => {
  for (const [src, at, code, message] of cases) {
    const e = rejection(src);
    assert.ok(e, `accepted: ${at}`);
    assert.equal(e.code, code, e.message);
    assert.match(e.message, message);
    const starts = [];
    for (let i = src.indexOf(at); i >= 0; i = src.indexOf(at, i + 1)) starts.push(i);
    assert.ok(starts.includes(e.start), `${e.message} at ${e.start}, expected one of ${starts}`);
    assert.equal(src.slice(e.start, e.end), at);
  }
};

test("rejects source it cannot translate, on the offending span", () => {
  rejects([
    [small(`on("Up", nat(cap), (n) => { if (model.level == n) { next.level = n; } });`), "==", 1, /===/],
    [small(`on("Up", nat(cap), (n) => { next.levl = n; });`), "levl", 2, /no field levl/],
    [small(`on("Up", nat(cap), (by) => { next.level = by; });`), "by", 2, /Name the parameter n/],
    [small(`on("Down", nat(cap), (n) => { next.level = model.level - n; });`), "-", 2, /Math\.max\(0, a - b\)/],
    [small(`on("Up", nat(cap), (n) => { if (model.open || n < 2) { next.level = n; } });`), "||", 2, /else if/],
    [small(`on("Up", () => { next.level = 1; });\non("Up", () => { next.level = 2; });`), "Up", 2, /already a rule for Up/],
    [small(`on("Up", () => { next.level = 1; });`).replace("saved(nat", "local(nat"), "store", 2, /Nothing is saved/],
  ]);
});

test("rejects JavaScript that .fold gives no meaning to", () => {
  rejects([
    [small(`on("Up", nat(cap), (n) => { next.level += n; });`), "next.level += n", 1, /with =, not \+=/],
    [small(`on("Up", () => { next.level++; });`), "next.level++", 1, /\+\+ is not supported/],
    [small(`on("Up", () => { const x = 1; next.level = x; });`), "const", 1, /Expected next\.<field>/],
    [small(`on("Up", () => { if (model.open) next.level = 1; });`), "next.level = 1;", 1, /braces/],
    [small(`on("Up", () => { if (model.open) { if (model.open) { next.level = 1; } } });`), "if", 1, /do not nest/],
    [small(`on("Up", () => { next.level = model["level"]; });`), 'model["level"]', 1, /\[ \]/],
    [small(`on("Up", () => { next.level = model?.level; });`), "model?.level", 1, /\?\./],
    [small(`on("Up", () => { next.level = 0x1; });`), "0x1", 1, /decimal/],
    [small(`on("Up", () => { next.level = model.open ? 1 : 0; });`), "model.open ? 1 : 0", 1, /\?:/],
    [small(`function up() {}`), "function", 1, /Expected const, model/],
    [small(`let x = 1;`), "let", 1, /Use const/],
    [small(`const nat = 3;`), "nat", 2, /part of \.fold/],
    [small(`invariant("low", () => { return model.level < cap; });`), 'invariant("low", () => { return model.level < cap; })', 1, /\(\) => condition/],
    // The old syntax is not JavaScript.
    [small(`on Up() { next.level = 1; }`), "Up", 1, /^Unexpected token\.$/],
  ]);
});

test("numbers are read exactly, from their digits", () => {
  const [c] = parse("const big = 9_007_199_254_740_993;").items;
  assert.equal(c.value.v, 9007199254740993n);
});

test("a callback parameter may not hide model, next, n, or a constant", () => {
  // In (model) => model.id !== model.selected, TypeScript reads model.selected
  // as the item's field, so the builder must not translate it as the model's.
  const cases = [
    [list.replace("(it) => it.id !== model.selected", "(model) => model.id !== model.selected"), "(model) =>"],
    [list.replace("(it) => it.id === n", "(n) => n.id === n"), ".some((n) =>"],
    [list.replace("(it) => it.id === n", "(maxId) => maxId.id === n"), "(maxId) =>"],
  ];
  for (const [src, at] of cases) {
    const e = rejection(src);
    assert.ok(e, `accepted: ${at}`);
    assert.equal(e.code, 2, e.message);
    assert.match(e.message, /hides the outer/);
    assert.equal(e.start, src.indexOf(at) + at.lastIndexOf("(") + 1);
  }
  // Any other name is fine.
  assert.equal(rejection(list.replace("(it) => it.id !== model.selected", "(item) => item.id !== model.selected")), null);
});

test("the .fold apps print the module the Foldkit tests run", async () => {
  for (const [src, name, file] of [
    [counter, "counter", "foldkit-web/src/counter.fold"],
    [list, "list", "foldkit-web/src/list.fold"],
  ]) {
    const { ts } = await compile(src, { file });
    const printed = read(join(out, `${name}.program.ts`));
    const body = (s) => s.slice(s.indexOf("\n") + 1);
    assert.equal(body(ts), body(printed), name);
    assert.match(ts.split("\n")[0], new RegExp(`^// Generated by Rocq from ${file} \\(sha256 [0-9a-f]{16}\\)`));
  }
});

test("the .fold apps check cleanly", async () => {
  for (const src of [counter, list]) {
    const { ts, diagnostics } = await analyze(src);
    assert.deepEqual(diagnostics, []);
    assert.ok(ts.startsWith("// Generated by Rocq"));
  }
});

test("a rule that can break an invariant is reported on that rule", async () => {
  const src = small(
    `on("Up", nat(cap), (n) => {
  if (model.level + n <= cap) {
    next.level = model.level + n;
    save();
  } else {
    next.level = 0;
  }
});
on("Close", () => { next.open = false; });`,
    `invariant("belowCap", () => model.level < cap);`,
  );
  const { ts, diagnostics } = await analyze(src);
  assert.ok(ts, "Rocq still prints the module");
  assert.equal(diagnostics.length, 2, JSON.stringify(diagnostics, null, 2));
  const [rule, stored] = diagnostics;
  assert.equal(rule.code, 3);
  assert.equal(src.slice(rule.start, rule.start + rule.length), "if (model.level + n <= cap)");
  assert.match(rule.messageText, /^belowCap might not hold after this branch of Up\./);
  assert.match(rule.messageText, /needs: {2}\(model\.level \+ n\) < 10/);
  assert.match(rule.messageText, /model\.level \+ n <= 10 {3}\(the condition\)/);
  assert.match(rule.messageText, /model\.level < 10 {3}\(belowCap before\)/);
  // level is saved with Schema maximum cap, so a stored 10 breaks it too.
  assert.equal(stored.code, 4);
  assert.equal(src.slice(stored.start, stored.start + stored.length), "belowCap");
  assert.match(stored.messageText, /might not hold for a stored value/);
});

test("an invariant that fails initially is reported on the invariant", async () => {
  const src = small(`on("Close", () => { next.open = false; });`, `invariant("opened", () => !model.open);`)
    .replace("saved(nat", "local(nat")
    .replace(/store\(.*\n/, "");
  const { diagnostics } = await analyze(src);
  assert.deepEqual(
    diagnostics.map((d) => [d.code, src.slice(d.start, d.start + d.length)]),
    [[4, "opened"]],
  );
  assert.match(diagnostics[0].messageText, /^opened does not hold for the initial model\./);
});

test("the strict build refuses a failed proof, with the soft build's diagnostics", async () => {
  const src = small(`on("Up", nat(cap), (n) => { next.level = n; save(); });`, `invariant("small", () => model.level < 5);`);
  await assert.rejects(compile(src), (e) => {
    assert.ok(e instanceof FoldBuildError);
    assert.deepEqual(e.diagnostics.map((d) => d.code).sort(), [3, 4]);
    // A rule with no condition is reported on its head.
    const rule = e.diagnostics.find((d) => d.code === 3);
    assert.equal(src.slice(rule.start, rule.start + rule.length), 'on("Up", nat(cap), (n) =>');
    return true;
  });
});

test("span mappings are in range, do not overlap, and Verbatim spans match", () => {
  for (const src of [counter, list]) {
    const { ast, ir } = build(src);
    const ts = read(join(out, src === counter ? "counter.program.ts" : "list.program.ts"));
    const maps = spanMappings(ts, src, ast, ir);
    assert.ok(maps.length > 20);
    let end = 0;
    for (const [vs, vl, os, ol, kind] of [...maps].sort((a, b) => a[0] - b[0])) {
      assert.ok(vs >= end, "virtual spans overlap");
      end = vs + vl;
      assert.ok(end <= ts.length && os + ol <= src.length);
      if (kind === 0) assert.equal(ts.slice(vs, vs + vl), src.slice(os, os + ol));
    }
    // Each rule's tag in the switch maps to the rule's name.
    for (const r of ir.rules) {
      const v = ts.indexOf(`case "${r.tag}"`) + 6;
      assert.ok(maps.some(([vs, , os]) => vs === v && os === r.tagSpan.start), r.tag);
    }
  }
});
