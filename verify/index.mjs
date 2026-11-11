import { Script, createContext } from "node:vm";
import { compile } from "./source.mjs";
import { SourceError } from "./error.mjs";
import { single, load, graphDigest } from "./modules.mjs";
import { materialize, conforms, display, domain, TABLE } from "./data.mjs";
import { runtime, snapshotAll, isReal, isUndefinedSpec } from "./specifications.mjs";
import { solve } from "./proofs.mjs";
import { materializeHeap, paths, frameDiff, writeMonitor } from "./heap-witness.mjs";

const TRUSTED = ["Acorn parser", "Node TypeScript type stripping", "project type and module resolution and source snapshots", "source-to-SMT translation", "exact rational specification replay", "Z3 and its WASM bindings", "unmodified standard Number/Math/Object/Array builtins and prototypes", "JavaScript runtime"];

// Replays one root against the whole linked graph. Each module gets its own
// null-prototype realm; every function identity has one host wrapper, bound
// under each local name (declaration or import alias) that refers to it. The
// wrapper checks the callee's domain and requires on actual arguments, then
// checks result shape and ensures. Native bodies stay unchanged; specification
// bodies and predicates use the exact replay interpretation.
function replay(targets, modules, target, witness, phase) {
  const STOP = Symbol("contract-violation");
  const heapMode = !!target.heapModel;
  const graph = heapMode ? materializeHeap(witness.at(-1)) : undefined;
  const realms = new Map();
  for (const m of modules) {
    const context = createContext(Object.create(null));
    const run = (text, filename) => new Script(text, { filename }).runInContext(context, { timeout: 100 });
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
  const predicate = (realm, t, text, result = false) => realm.run(`((${[t.predicates.library, t.predicates.entry, ...t.params.map((p) => p.name), ...(result ? ["result"] : [])].join(", ")}) => (${text}))`);
  const test = (realm, f, entry, args) => {
    try { return { ok: realm.invoke(f, [runtime, entry, ...args]) === true }; }
    catch (e) { if (isUndefinedSpec(e)) return { ok: false, undefined: true }; throw e; }
  };
  const precondition = (realm, clauses, entry, args) => {
    for (const [c, f] of clauses) {
      const result = test(realm, f, entry, args);
      if (!result.ok) return { clause: c, undefined: result.undefined };
    }
  };
  const shape = (t, value) => t.resultType === "real" ? isReal(value) : conforms(t.resultType, value);
  const show = (value) => isReal(value) ? String(value) : display(value);
  const changedDomain = (t, args) => t.params.filter((p, i) => !conforms(p.type, args[i])).map((p) => ({ kind: "store-domain", name: p.name,
    text: `${t.name} changed ${p.name} outside its parameter's fixed data domain`, span: t.span }));
  const byId = new Map(targets.map((t) => [t.id, t]));
  const locations = new Map(targets.map((t, i) => {
    const text = `(${t.executable})`;
    return [t.id, { filename: `jsverify_${i}`, starts: [0, ...[...text.matchAll(/\n/g)].map((m) => m.index + 1)] }];
  }));
  const callOffset = (t) => {
    const location = locations.get(t.id);
    const at = new RegExp(`${location.filename}:(\\d+):(\\d+)`).exec(new Error().stack);
    if (!at) return undefined;
    return t.executableStart + location.starts[Number(at[1]) - 1] + Number(at[2]) - 2;
  };
  const stack = [];
  let violation, admission;
  const stop = (v) => { violation = { ...v, ...(admission ? { admission } : {}) }; throw STOP; };
  const monitor = writeMonitor(graph ?? new Map(), stop);
  // Callback guard: the applier must pass arguments of the callback's parameter
  // types; the passer (whose closure/named value this is) must return a present
  // result without throwing. Helper calls inside the callback are the passer's.
  const guard = (f, type, applier, passer, name) => {
    const wrapped = (...cargs) => {
      if (cargs.length !== type.params.length || type.params.some((p, i) => !conforms(p, cargs[i]))) {
        stop({ caller: applier.name, callerFile: applier.file, callback: name, arguments: cargs.map(display), violated: [{ kind: "callback-domain", name, type }] });
      }
      if (passer) stack.push(passer.id);
      let r;
      try { r = f(...cargs); }
      catch (e) {
        if (e === STOP || !passer) throw e;
        stop({ caller: passer.name, callerFile: passer.file, callback: name, arguments: cargs.map(display), violated: [{ kind: "callback-throws", name, message: String(e?.message ?? e) }] });
      } finally { if (passer) stack.pop(); }
      if (!conforms(type.result, r)) stop({ caller: (passer ?? applier).name, callerFile: (passer ?? applier).file, callback: name, arguments: cargs.map(display), violated: [{ kind: "callback-result", name, result: display(r) }] });
      return r;
    };
    if (f[TABLE]) Object.defineProperty(wrapped, TABLE, { value: f[TABLE] });
    return wrapped;
  };
  const probeValues = target.probes ? (() => {
    let at = target.params.length;
    return target.probes.map((p) => ({ ...p, values: p.models.map((m) => materialize(m, witness[at++])) }));
  })() : [];
  const fns = new Map();
  for (const t of targets) {
    const realm = realms.get(t.file);
    const requires = t.requires.map((c, i) => [c, predicate(realm, t, t.predicates.requires[i])]);
    const ensures = t.ensures.map((c, i) => [c, predicate(realm, t, t.predicates.ensures[i], true)]);
    const original = t.spec ? predicate(realm, t, t.predicates.body) : realm.run(`(${t.executable})`, locations.get(t.id).filename);
    const invoke = (entry, args) => realm.invoke(original, t.spec ? [runtime, entry, ...args] : args);
    const self = { caller: t.name, callerFile: t.file, broken: t.name };
    const wrapper = (...raw) => {
      const c = byId.get(stack.at(-1) ?? target.id);
      const edge = { caller: c.name, callerFile: c.file, callee: t.name, calleeFile: t.file };
      const actual = Object.fromEntries(t.params.map((p, i) => [p.name, display(raw[i])]));
      const domain = t.params.filter((p, i) => !conforms(p.type, raw[i]));
      if (raw.length !== t.params.length || domain.length) stop({ ...edge, arguments: actual, violated: domain.map((p) => ({ kind: "param-type", name: p.name, type: p.type })) });
      const args = raw.map((a, i) => t.params[i].type?.kind === "function" ? guard(a, t.params[i].type, t, c, t.params[i].name) : a);
      // Direct probe replay: the root's universally checked callback arguments
      // run against the native callback before the callee sees it.
      if (c.id === target.id && probeValues.some((p) => p.callee === t.id)) {
        const offset = callOffset(c);
        if (offset === undefined) return stop({ ...edge, callbackLocation: true });
        for (const p of probeValues) if (p.callee === t.id && p.site.start === offset) {
          admission = { caller: c.name, callerFile: c.file, callee: t.name, calleeFile: t.file, site: p.site, argument: p.span, parameter: t.params[p.param].name };
          try { args[p.param](...p.values); } finally { admission = undefined; }
        }
      }
      stack.push(t.id);
      try {
        const entry = snapshotAll(args, heapMode);
        const unmet = precondition(realm, requires, entry, args);
        if (unmet) stop({ ...edge, arguments: actual, violated: [unmet.clause] });
        const inclusion = monitor.inclusion(t, args);
        if (inclusion) stop({ ...inclusion, arguments: actual });
        const leave = monitor.enter(t, args);
        let result;
        try { result = invoke(entry, args); }
        catch (e) {
          if (!isUndefinedSpec(e)) throw e;
          stop({ ...self, arguments: actual, violated: [{ kind: "spec-definedness", text: e.message, span: t.span }] });
        } finally { leave(); }
        const domainAfter = changedDomain(t, args);
        if (domainAfter.length) stop({ ...self, storeDomain: true, arguments: actual, violated: domainAfter });
        if (!shape(t, result)) stop({ ...self, arguments: actual, message: "returned a different data shape than its SMT encoding" });
        const failed = [...ensures.filter(([, f]) => !test(realm, f, entry, [...args, result]).ok).map(([c]) => c), ...frameDiff(t, entry, display)];
        if (failed.length) stop({ ...self, arguments: actual, result: show(result), violated: failed });
        return result;
      } finally { stack.pop(); }
    };
    fns.set(t.id, { invoke, requires, ensures, realm, wrapper });
  }
  for (const m of modules) for (const [local, id] of m.bindings) realms.get(m.file).context[local] = fns.get(id).wrapper;
  const root = fns.get(target.id);
  const values = target.params.map((p, index) => {
    const v = p.model.kind === "ref" ? monitor.wrap(graph.get(witness[index])) : materialize(p.model, witness[index]);
    return p.type?.kind === "function" ? guard(v, p.type, target, null, p.name) : v;
  });
  const inputs = Object.fromEntries(target.params.map((p, i) => [p.name, display(values[i])]));
  const aliases = heapMode ? [...paths(target.params.map((p) => p.name), values).values()].filter((p) => p.length > 1) : [];
  const shown = aliases.length ? { inputs, aliases } : { inputs };
  const entry = snapshotAll(values, heapMode);
  const leave = monitor.enter(target, values);
  try {
    const unmet = precondition(root.realm, root.requires, entry, values);
    if (unmet) {
      if (phase === "requires-definedness" && unmet.undefined) return { inputs, failed: [unmet.clause] };
      return { mismatch: "The model violates a precondition when replayed in JavaScript." };
    }
    if (phase === "requires-definedness") return { mismatch: "The precondition's undefined operation was not reproduced during exact replay." };
    let result;
    try { result = root.invoke(entry, values); }
    catch (e) {
      if (!isUndefinedSpec(e)) throw e;
      return { inputs, failed: [{ kind: "spec-definedness", text: e.message, span: target.span }] };
    }
    const domainAfter = changedDomain(target, values);
    if (domainAfter.length) stop({ caller: target.name, callerFile: target.file, storeDomain: true, violated: domainAfter });
    if (!shape(target, result)) return { mismatch: "The source returned a different data shape than its SMT encoding." };
    const failed = [...root.ensures.filter(([, f]) => !test(root.realm, f, entry, [...values, result]).ok).map(([c]) => c), ...frameDiff(target, entry, display)];
    return { ...shown, result: show(result), failed };
  } catch (e) {
    if (e === STOP) return { ...shown, violation };
    throw e;
  } finally { leave(); }
}

/**
 * Verify contracts on supported ordinary JS/TS functions. Parameter types
 * are assumptions at the function boundary, not runtime validation.
 * Runtime numbers are binary64; explicit real(...) specifications are exact.
 * A verdict trusts the frontend, replay interpretation, and Z3.
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

const GAP = {
  "invariant-init": "The loop invariant may not hold on entry, and replay did not confirm a contract failure.",
  "invariant-preserve": "The loop invariant may not be preserved by one iteration, and replay did not confirm a contract failure. Strengthen or correct it.",
  rank: "The decreases measure may not stay nonnegative and drop by at least 1, and replay did not confirm nontermination.",
  call: "A call inside or after a loop may be unsafe under the invariant; replay did not confirm it.",
  ensures: "The ensures may not follow from the loop invariant at exit; replay did not confirm a failure. Strengthen the invariant.",
  definedness: "A result contract may be undefined under the loop invariant; replay did not confirm it.",
  callback: "A predicate application may be unsafe under the invariant; native replay did not confirm it.",
};
// A loop abstraction failure is evidence about the invariant, not about JavaScript.
const gap = (label, candidate) => ({ status: "unknown", reason: "induction-gap", phase: label.kind, span: label.span,
  ...(label.loop ? { loop: label.loop } : {}), candidate, message: GAP[label.kind] });

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
  if (targets.some((t) => t.heapModel)) report.trusted.push("solver-model heap graphs replayed with shared identities and a write-monitoring Proxy membrane");
  if (targets.some((t) => t.params.some((p) => p.model.kind === "function"))) report.trusted.push("solver-model predicate tables replayed as pure total JavaScript functions using Object.is");
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
    const put = (o) => own.set(t.id, { ...base, ...o, ...(o.span ? position(t.file, o.span.start) : {}) });
    const r = results[i];
    if (r.status === "vacuous" || r.status === "unknown" || r.status === "error") {
      put({ ...r, ...(r.label?.abstract ? { phase: r.label.kind, span: r.label.span, ...(r.label.loop ? { loop: r.label.loop } : {}) } : {}) });
      continue;
    }
    try {
      const actual = replay(targets, modules, t, r.witness, r.phase);
      const v = actual.violation;
      const culprit = v && byId.get(`${v.callerFile}#${v.caller}`);
      if (actual.mismatch) put({ status: "unknown", reason: "replay-mismatch", message: actual.mismatch });
      else if (v?.callbackLocation) {
        put({ status: "unknown", reason: "callback-probe-location", message: "The callback admission witness could not be matched to its native source call site." });
      } else if (v?.broken || (v && culprit !== t)) {
        // The failure is inside a helper: its contract, not this root, is wrong.
        broken.set(culprit.id, v);
        put({ status: "unknown", reason: "dependency-violation", message: `${label(culprit)} violated its contract during replay.`, inputs: actual.inputs, violation: v });
      } else if (v?.frameWrite || v?.frameInclusion || v?.storeDomain) {
        const reason = v.frameInclusion ? "frame-inclusion" : v.frameWrite ? "frame-write" : "store-domain";
        put(r.status === "counterexample" ? { status: "counterexample", reason, confirmed: true, inputs: actual.inputs, ...(actual.aliases?.length ? { aliases: actual.aliases } : {}), failed: v.violated, call: v, message: v.violated[0].text }
          : { status: "unknown", reason: "replay-mismatch", message: `The source violated ${reason} during replay of a proved obligation.` });
      } else if (v?.callback) {
        put(r.status === "counterexample"
          ? { status: "counterexample", ...(r.phase ? { phase: r.phase } : {}), confirmed: true, inputs: actual.inputs, call: v,
              message: v.violated[0].kind === "callback-domain" ? `${t.name} applies callback ${v.callback} outside its parameter types.`
                : `${t.name} passes a callback that is not a pure total function of its type (${v.violated[0].kind}).` }
          : { status: "unknown", reason: "replay-mismatch", message: `The proof says callback ${v.callback} is used safely, but replay found a violation.` });
      } else if (v) {
        const callee = byId.get(`${v.calleeFile}#${v.callee}`);
        put(r.status === "counterexample"
          ? { status: "counterexample", ...(r.phase ? { phase: r.phase } : {}), confirmed: true, inputs: actual.inputs, failed: v.violated.filter((c) => c.text), call: v,
              message: v.admission ? `${t.name} passes a predicate to ${v.admission.callee} that fails its domain at a replayed probe input.`
                : `${t.name} calls ${label(callee)} with arguments outside its parameter types or requires.` }
          : { status: "unknown", reason: "replay-mismatch", message: `The proof says every call is safe, but replay found a bad call to ${label(callee)}.` });
      } else if (r.status === "counterexample" && !actual.failed.length) {
        if (["frame-write", "frame-inclusion", "store-domain"].includes(r.label?.kind)) {
          put({ status: "unknown", reason: r.label.kind, message: "The abstract heap obligation failed, but unchanged-source replay did not observe that violation.", inputs: actual.inputs }); continue;
        }
        put(r.label?.abstract ? gap(r.label, actual.inputs) : t.callees.length
          ? { status: "unknown", reason: "contract-gap", message: "The counterexample relies on abstract helper results that the actual helpers did not produce. A helper ensures may be too weak." }
          : { status: "unknown", reason: "replay-mismatch", message: "The solver's counterexample did not fail in JavaScript. This indicates a verifier discrepancy." });
      } else if (r.status === "verified" && actual.failed.length) {
        put({ status: "unknown", reason: "replay-mismatch", message: "The solver's counterexample did not fail in JavaScript. This indicates a verifier discrepancy." });
      } else if (r.status === "counterexample") put({ status: "counterexample", ...(r.phase ? { phase: r.phase } : {}), inputs: actual.inputs, ...(actual.aliases ? { aliases: actual.aliases } : {}), result: actual.result, failed: actual.failed, confirmed: true });
      else put({ status: "verified" });
    } catch (e) {
      put(e.code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
        ? { status: "unknown", reason: "replay-timeout", message: "JavaScript replay exceeded its execution budget.", ...(r.label?.abstract ? { phase: r.label.kind, span: r.label.span, loop: r.label.loop } : {}) }
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
