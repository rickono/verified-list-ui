import { spawn } from "node:child_process";
import { Script, createContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { compile } from "./source.mjs";
import { SourceError } from "./error.mjs";
import { single, load, graphDigest } from "./modules.mjs";
import { materialize, conforms, display, domain } from "./data.mjs";

const TRUSTED = ["Acorn parser", "Node TypeScript type stripping", "project type and module resolution and source snapshots", "source-to-SMT translation", "Z3 and its WASM bindings", "unmodified standard Number/Math/Object/Array builtins and prototypes", "JavaScript runtime"];

function solve(targets, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("./solver.mjs", import.meta.url))], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "", settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ unknown: "Wall-clock verification budget exhausted." });
    }, timeoutMs);
    child.stdout.on("data", (b) => { out += b; });
    child.stderr.on("data", (b) => { err += b; });
    child.on("error", (e) => done({ error: e.message }));
    child.stdin.on("error", (e) => done({ error: e.message }));
    child.on("close", (code) => {
      if (code !== 0) return done({ error: err.trim() || `Solver process exited ${code}.` });
      try { done(JSON.parse(out)); }
      catch { done({ error: "The solver returned an invalid response." }); }
    });
    child.stdin.end(JSON.stringify({ targets, timeoutMs }));
  });
}

// Replays one root against the whole linked graph. Each module gets its own
// null-prototype realm; every function identity has one host wrapper, bound
// under each local name (declaration or import alias) that refers to it. The
// wrapper checks the callee's domain and requires on actual arguments, runs the
// unchanged original in its own realm, then checks result shape and ensures.
function replay(targets, modules, target, witness) {
  const STOP = Symbol("contract-violation");
  const realms = new Map();
  for (const m of modules) {
    const context = createContext(Object.create(null));
    const run = (text) => new Script(text).runInContext(context, { timeout: 100 });
    const locals = new Set(m.bindings.map(([local]) => local));
    let key = "__verification_invoke";
    while (locals.has(key)) key += "_";
    const invoke = (fn, args) => {
      const previous = context[key];
      context[key] = { fn, args };
      try { return run(`${key}.fn(...${key}.args)`); }
      finally { context[key] = previous; }
    };
    realms.set(m.file, { context, run, invoke });
  }
  const predicate = (realm, t, c, result) => realm.run(`((${[...t.params.map((p) => p.name), ...(result ? ["result"] : [])].join(", ")}) => (${c.text}))`);
  const byId = new Map(targets.map((t) => [t.id, t]));
  const stack = [];
  let violation;
  const stop = (v) => { violation = v; throw STOP; };
  const fns = new Map();
  for (const t of targets) {
    const realm = realms.get(t.file);
    const requires = t.requires.map((c) => [c, predicate(realm, t, c, false)]), ensures = t.ensures.map((c) => [c, predicate(realm, t, c, true)]);
    const original = realm.run(`(${t.executable})`);
    const self = { caller: t.name, callerFile: t.file, broken: t.name };
    const wrapper = (...args) => {
      const c = byId.get(stack.at(-1) ?? target.id);
      const edge = { caller: c.name, callerFile: c.file, callee: t.name, calleeFile: t.file };
      const actual = Object.fromEntries(t.params.map((p, i) => [p.name, display(args[i])]));
      const domain = t.params.filter((p, i) => !conforms(p.type, args[i]));
      if (args.length !== t.params.length || domain.length) stop({ ...edge, arguments: actual, violated: domain.map((p) => ({ kind: "param-type", name: p.name, type: p.type })) });
      const unmet = requires.filter(([, f]) => realm.invoke(f, args) !== true).map(([c]) => c);
      if (unmet.length) stop({ ...edge, arguments: actual, violated: unmet });
      stack.push(t.id);
      let result;
      try { result = realm.invoke(original, args); }
      finally { stack.pop(); }
      if (!conforms(t.resultType, result)) stop({ ...self, arguments: actual, message: "returned a different data shape than its SMT encoding" });
      const failed = ensures.filter(([, f]) => realm.invoke(f, [...args, result]) !== true).map(([c]) => c);
      if (failed.length) stop({ ...self, arguments: actual, result: display(result), violated: failed });
      return result;
    };
    fns.set(t.id, { original, requires, ensures, realm, wrapper });
  }
  for (const m of modules) for (const [local, id] of m.bindings) realms.get(m.file).context[local] = fns.get(id).wrapper;
  const root = fns.get(target.id);
  const values = witness.map((raw, index) => materialize(target.params[index].model, raw));
  const inputs = Object.fromEntries(target.params.map((p, i) => [p.name, display(values[i])]));
  if (!root.requires.every(([, f]) => root.realm.invoke(f, values) === true)) return { mismatch: "The model violates a precondition when replayed in JavaScript." };
  let result;
  try { result = root.realm.invoke(root.original, values); }
  catch (e) {
    if (e !== STOP) throw e;
    return { inputs, violation };
  }
  if (!conforms(target.resultType, result)) return { mismatch: "The source returned a different data shape than its SMT encoding." };
  const failed = root.ensures.filter(([, f]) => root.realm.invoke(f, [...values, result]) !== true).map(([c]) => c);
  return { inputs, result: display(result), failed };
}

/**
 * Verify contracts on supported ordinary JS/TS functions. Parameter types
 * are assumptions at the function boundary, not runtime validation.
 * Every numeric expression is binary64; a verdict trusts the frontend and Z3.
 */
export async function verify(source, { file = "input.ts", timeoutMs = 10_000 } = {}) {
  if (typeof source !== "string" || typeof file !== "string" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new TypeError("Expected source/file strings and a timeoutMs integer between 1 and 60000.");
  }
  return check(single(file, source), file, timeoutMs);
}

/** Verify an entry file and every module it imports, read once into a snapshot. */
export async function verifyFile(entry, { timeoutMs = 10_000, tsconfig } = {}) {
  if (typeof entry !== "string" || tsconfig !== undefined && typeof tsconfig !== "string" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new TypeError("Expected entry/tsconfig path strings and a timeoutMs integer between 1 and 60000.");
  }
  return check(load(entry, { tsconfig }), entry, timeoutMs);
}

async function check({ files, dependencies, records, error }, file, timeoutMs) {
  const text = new Map([...files, ...dependencies].map((f) => [f.file, f.source]));
  const position = (where, offset) => {
    const prefix = (text.get(where) ?? "").slice(0, offset).split("\n");
    return { line: prefix.length, column: prefix.at(-1).length + 1 };
  };
  const report = {
    file, sha256: files[0]?.sha256, trusted: [...TRUSTED],
    modules: files.map((f) => ({ file: f.file, sha256: f.sha256, imports: f.imports })),
    dependencies: dependencies.map(({ file, sha256, kind }) => ({ file, sha256, kind })),
    graphSha256: graphDigest(files, dependencies), outcomes: [],
  };
  let targets, modules;
  try { if (error) throw error; ({ targets, modules } = compile(records)); }
  catch (e) {
    if (!(e instanceof SourceError)) throw e;
    const where = e.file ?? files[0].file;
    report.outcomes.push({ fn: e.fn ?? null, file: where, status: e.status, span: e.span, ...position(where, e.span.start), message: e.message });
    return report;
  }
  const byId = new Map(targets.map((t) => [t.id, t]));
  const label = (t) => t.file === files[0].file ? t.name : `${t.name} (${t.file})`;
  const results = await solve(targets, timeoutMs);
  const own = new Map(), broken = new Map();
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const base = {
      fn: t.name, file: t.file, span: t.span, ...position(t.file, t.span.start),
      assumptions: [
        ...t.params.map(({ name, type, typeAliases }) => ({ kind: "param-type", name, type, ...(typeAliases.length ? { typeAliases } : {}), ...(domain(type) ? { domain: domain(type) } : {}) })),
        ...t.requires,
      ],
    };
    const put = (o) => own.set(t.id, { ...base, ...o });
    if (results.error || results.unknown) { put({ status: results.error ? "error" : "unknown", message: results.error ?? results.unknown }); continue; }
    const r = results[i];
    if (r.status === "vacuous" || r.status === "unknown") { put(r); continue; }
    try {
      const actual = replay(targets, modules, t, r.witness);
      const v = actual.violation;
      const culprit = v && byId.get(`${v.callerFile}#${v.caller}`);
      if (actual.mismatch) put({ status: "unknown", reason: "replay-mismatch", message: actual.mismatch });
      else if (v?.broken || (v && culprit !== t)) {
        // The failure is inside a helper: its contract, not this root, is wrong.
        broken.set(culprit.id, v);
        put({ status: "unknown", reason: "dependency-violation", message: `${label(culprit)} violated its contract during replay.`, inputs: actual.inputs, violation: v });
      } else if (v) {
        const callee = byId.get(`${v.calleeFile}#${v.callee}`);
        put(r.status === "counterexample"
          ? { status: "counterexample", confirmed: true, inputs: actual.inputs, failed: v.violated.filter((c) => c.text), call: v,
              message: `${t.name} calls ${label(callee)} with arguments outside its parameter types or requires.` }
          : { status: "unknown", reason: "replay-mismatch", message: `The proof says every call is safe, but replay found a bad call to ${label(callee)}.` });
      } else if (r.status === "counterexample" && !actual.failed.length) {
        put(t.callees.length
          ? { status: "unknown", reason: "contract-gap", message: "The counterexample relies on abstract helper results that the actual helpers did not produce. A helper ensures may be too weak." }
          : { status: "unknown", reason: "replay-mismatch", message: "The solver's counterexample did not fail in JavaScript. This indicates a verifier discrepancy." });
      } else if (r.status === "verified" && actual.failed.length) {
        put({ status: "unknown", reason: "replay-mismatch", message: "The solver's counterexample did not fail in JavaScript. This indicates a verifier discrepancy." });
      } else if (r.status === "counterexample") put({ status: "counterexample", inputs: actual.inputs, result: actual.result, failed: actual.failed, confirmed: true });
      else put({ status: "verified" });
    } catch (e) {
      put(e.code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
        ? { status: "unknown", reason: "replay-timeout", message: "JavaScript replay exceeded its execution budget." }
        : { status: "unknown", reason: "replay-mismatch", message: `JavaScript replay failed: ${e.message}` });
    }
  }
  // Final status, callees first. Only a verified callee can support a proof.
  const done = new Map();
  const final = (id) => {
    if (done.has(id)) return done.get(id);
    let o = own.get(id);
    if (o.status === "verified" && broken.has(id)) o = { ...o, status: "unknown", reason: "replay-mismatch", message: "Replay observed this verified function violating its contract." };
    const bad = byId.get(id).callees.map((c) => [c, final(c)]).find(([, f]) => f.status !== "verified");
    if (o.status === "verified" && bad) o = { ...o, status: "unknown", reason: "dependency", message: `Relies on ${label(byId.get(bad[0]))}, whose final status is ${bad[1].status}.` };
    done.set(id, o);
    return o;
  };
  report.outcomes.push(...targets.map((t) => final(t.id)));
  return report;
}
