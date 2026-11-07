import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { Script } from "node:vm";
import * as defaultVerifier from "../index.mjs";
import { BASELINE, DEFAULT_SEED, buildCorpus, source } from "./corpus.mjs";

// This deliberately does not use display/materialize/conforms from data.mjs.
export function encode(value) {
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  return Object.is(value, -0) ? "-0" : String(value);
}
function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  if (value === "undefined") return undefined;
  if (value === "true" || value === "false") return value === "true";
  return Number(value);
}
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const predicate = (text, f, args, result) => new Script(`(${text})`).runInNewContext(
  Object.assign(Object.create(null), Object.fromEntries(f.params.map(([name], i) => [name, args[i]])), {result}), {timeout: 100});
const clauses = (list, f, args, result) => list.map((p) => predicate(p, f, args, result));
const isTimeout = (e) => e.code === "ERR_SCRIPT_EXECUTION_TIMEOUT";

export async function runCorpus({seed = DEFAULT_SEED, verifier = defaultVerifier, fixtures = buildCorpus(seed), onFixture} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "jsverify-conformance-"));
  const evidence = { baseline: BASELINE, seed, runtime: {node: process.version, v8: process.versions.v8},
    trust: "Finite independent V8 checks; not a translator soundness proof or a Rocq certificate.",
    environment: ["Unmodified standard builtins and prototypes", "Dense ordinary input arrays with no extra properties; all native lengths remain in proof domains", "Plain own enumerable data records with no extra properties, accessors, proxies, or custom prototypes", "number includes NaN, infinities, signed zeros, subnormals, and all other binary64 values"],
    fixtures: [], failures: [] };
  try {
    for (let index = 0; index < fixtures.length; index++) {
      const fixture = fixtures[index], root = join(directory, String(index));
      await mkdir(root);
      const texts = Object.fromEntries(Object.entries(fixture.files).map(([file, definition]) => [file,
        definition.text ?? `${definition.prelude ?? ""}\n${source(definition.functions)}`]));
      for (const [file, text] of Object.entries(texts)) await writeFile(join(root, file), text);
      const report = fixture.mode === "files"
        ? await verifier.verifyFile(join(root, "entry.mjs"), {timeoutMs: 60_000})
        : await verifier.verify(texts["entry.mjs"], {file: "entry.mjs", timeoutMs: 60_000});
      const record = { id: fixture.id, family: fixture.family, provenance: fixture.provenance,
        files: texts, graphSha256: report.graphSha256, modules: [], functions: [] };
      evidence.fixtures.push(record);
      const fail = (kind, fn, details) => evidence.failures.push({fixture: fixture.id, kind, fn, ...details});
      const local = (file) => fixture.mode === "files" ? relative(realpathSync.native(root), file) : file;
      const modules = new Map(report.modules.map((m) => [local(m.file), m]));
      if (modules.size !== Object.keys(texts).length) fail("provenance", null, {message: "Wrong source snapshot size"});
      for (const [file, text] of Object.entries(texts)) {
        const module = modules.get(file);
        const actual = module && {file, sha256: module.sha256, imports: module.imports.map(local).sort()};
        record.modules.push(actual);
        if (!module || module.sha256 !== sha256(text) || JSON.stringify(actual.imports) !== JSON.stringify([...fixture.files[file].imports].sort())) {
          fail("provenance", null, {message: `Wrong raw source hash/import identity for ${file}`});
        }
      }
      if (fixture.compareWith) {
        const previous = evidence.fixtures.find((f) => f.id === fixture.compareWith);
        if (!previous || previous.files["entry.mjs"] !== texts["entry.mjs"] ||
          previous.graphSha256 === record.graphSha256 ||
          previous.modules.find((m) => m.file === "right.mjs")?.sha256 === modules.get("right.mjs")?.sha256) {
          fail("provenance", null, {message: "A helper-only edit did not invalidate graph identity with unchanged entry bytes"});
        }
      }
      const expectedCount = Object.values(fixture.files).reduce((n, f) => n + f.functions.length, 0);
      if (report.outcomes.length !== expectedCount) fail("outcome-count", null, {expected: expectedCount, actual: report.outcomes.length});
      const namespaces = new Map();
      const execute = async (file, f, args) => {
        if (!namespaces.has(file)) namespaces.set(file, await import(pathToFileURL(join(root, file)).href));
        return namespaces.get(file)[f.name](...args);
      };
      for (const [file, definition] of Object.entries(fixture.files)) for (const f of definition.functions) {
        const outcome = report.outcomes.find((o) => local(o.file) === file && o.fn === f.name);
        const checked = {file, fn: f.name, params: f.params, requires: f.requires, ensures: f.ensures,
          expected: f.expected, actual: outcome, native: [], counterexample: null};
        if (f.call) checked.callOracle = {...f.call, args: encode(f.call.args)};
        record.functions.push(checked);
        if (!outcome || Object.entries(f.expected).some(([k, v]) => outcome[k] !== v)) {
          fail("verdict", `${file}#${f.name}`, {expected: f.expected, actual: outcome && {status: outcome.status, reason: outcome.reason}});
        }
        for (const item of f.samples) {
          const observation = {inputs: encode(item.args)};
          try {
            observation.requires = clauses(f.requires, f, item.args);
            if (observation.requires.some((v) => v !== true)) observation.kind = "precondition-false";
            else {
              const value = await execute(file, f, item.args);
              observation.result = encode(value);
              observation.ensures = clauses(f.ensures, f, item.args, value);
              observation.kind = observation.ensures.every((v) => v === true) ? "pass" : "fail";
            }
          } catch (e) {
            observation.kind = isTimeout(e) && !observation.requires ? "requires-timeout" : "exception";
            observation.message = e.message;
          }
          checked.native.push(observation);
          if (observation.kind !== item.expect) fail("native-oracle", `${file}#${f.name}`, {expected: item.expect, actual: observation});
          if (outcome?.status === "verified" && observation.kind !== "pass") fail("false-verification", `${file}#${f.name}`, {actual: observation});
        }
        if (outcome?.status === "verified" && !f.samples.length) fail("missing-native-check", `${file}#${f.name}`, {});
        if (outcome?.status !== "counterexample") continue;
        try {
          assert.equal(outcome.confirmed, true);
          const args = f.params.map(([name]) => decode(outcome.inputs[name]));
          assert.ok(clauses(f.requires, f, args).every((p) => p === true), "Reported input violates native requires");
          const value = await execute(file, f, args);
          const checks = clauses(f.ensures, f, args, value);
          checked.counterexample = {inputs: encode(args), result: encode(value), ensures: checks};
          if (outcome.call) {
            assert.ok(f.call, "No independent call trace oracle for this counterexample");
            const callee = fixture.files[f.call.file].functions.find((c) => c.name === f.call.fn);
            const callArgs = callee.params.map(([name]) => decode(outcome.call.arguments[name]));
            assert.equal(outcome.call.callee, f.call.fn);
            assert.equal(local(outcome.call.calleeFile), f.call.file);
            assert.deepEqual(callArgs, f.call.args, "Reported call arguments differ from the original literal call");
            const domain = new Script(`(${f.call.domainOracle})`).runInNewContext({value: callArgs[0]}, {timeout: 100});
            const requires = clauses(callee.requires, callee, callArgs);
            assert.ok(domain === false || requires.some((p) => p !== true), "Reported call violation satisfies the independent domain and requires");
            checked.counterexample.call = {callee: `${f.call.file}#${callee.name}`, args: encode(callArgs), domain, requires};
          } else {
            assert.deepEqual(encode(value), outcome.result, "Reported result differs from original JavaScript");
            assert.ok(checks.some((p) => p !== true), "Reported counterexample does not fail in original JavaScript");
            const failed = f.ensures.filter((p, i) => checks[i] !== true).sort();
            assert.deepEqual(outcome.failed.map((p) => p.text).sort(), failed, "Reported failed clauses differ from JavaScript");
          }
        } catch (e) {
          fail("non-reproducing-counterexample", `${file}#${f.name}`, {message: e.message});
        }
      }
      // Normalize source locations without changing the verifier's original report.
      for (const f of record.functions) if (f.actual) {
        f.actual = structuredClone(f.actual);
        f.actual.file = local(f.actual.file);
        for (const clause of [...(f.actual.assumptions ?? []), ...(f.actual.failed ?? [])]) if (clause.file) clause.file = local(clause.file);
        if (f.actual.call) {
          f.actual.call.callerFile = local(f.actual.call.callerFile);
          f.actual.call.calleeFile = local(f.actual.call.calleeFile);
          for (const clause of f.actual.call.violated) if (clause.file) clause.file = local(clause.file);
        }
      }
      onFixture?.(record);
    }
    evidence.counts = {
      fixtures: evidence.fixtures.length,
      functions: evidence.fixtures.reduce((n, f) => n + f.functions.length, 0),
      nativeSamples: evidence.fixtures.flatMap((f) => f.functions).reduce((n, f) => n + f.native.length, 0),
      counterexamples: evidence.fixtures.flatMap((f) => f.functions).filter((f) => f.counterexample).length,
    };
    return evidence;
  } finally { await rm(directory, {recursive: true, force: true}); }
}
