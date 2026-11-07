import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_SEED, buildCorpus } from "./corpus.mjs";
import { runCorpus } from "./runner.mjs";

const mutants = [
  {id: "addition-is-subtraction", file: "data.mjs", fixture: "binary-+", fn: "binary0",
    from: '"+": "add"', to: '"+": "sub"', status: "unknown", reason: "replay-mismatch"},
  {id: "samevalue-is-numeric-equality", file: "data.mjs", fixture: "same-value", fn: "negativeZero",
    from: 'return equal(args[0], args[1], true, node)', to: 'return equal(args[0], args[1], false, node)', status: "unknown", reason: "replay-mismatch"},
  {id: "slice-default-skips-first", file: "data.mjs", fixture: "slice-default", fn: "copy",
    from: 'const start = normalize(args[0], bv(0))', to: 'const start = normalize(args[0], bv(1))', status: "unknown", reason: "replay-mismatch"},
  {id: "spread-ignores-own-undefined", file: "data.mjs", fixture: "record-spread", fn: "ownUndefined",
    from: 'value: merge(field.hasKey, field.value, old?.value ?? undef(), node)', to: 'value: merge(field.value.present ?? "true", field.value, old?.value ?? undef(), node)', status: "unknown", reason: "replay-mismatch"},
  {id: "call-obligations-erased", file: "source.mjs", fixture: "call-domain-0", fn: "caller",
    from: 'const safe = implies(and(e.guard, ...facts), e.safe)', to: 'const safe = "true"', status: "unknown", reason: "replay-mismatch"},
  {id: "unconfirmed-bug-accepted", file: "index.mjs", fixture: "opaque-summary", fn: "caller",
    from: 'r.status === "counterexample" && !actual.failed.length', to: 'false', status: "counterexample", failure: "non-reproducing-counterexample"},
  {id: "final-dependency-gate-erased", file: "index.mjs", fixture: "final-dependency", fn: "f", outcomeFile: "middle.mjs",
    from: 'o.status === "verified" && bad', to: 'false', status: "verified"},
  {id: "replay-limit-becomes-proof-bound", file: "solver.mjs", fixture: "full-length-domain", fn: "tooLong",
    from: '${small ? `(assert ${target.smallWitness})` : ""}', to: '(assert ${target.smallWitness})', status: "verified", failure: "false-verification"},
];

export async function runMutations({seed = DEFAULT_SEED} = {}) {
  const fixtures = buildCorpus(seed), results = [];
  for (const mutant of mutants) {
    const fixture = fixtures.find((f) => f.id === mutant.fixture);
    assert.ok(fixture, `Missing fixture ${mutant.fixture}`);
    const control = await runCorpus({seed, fixtures: [fixture]});
    assert.deepEqual(control.failures, [], `Unmodified control failed for ${mutant.id}`);
    const scratch = await mkdtemp(join(tmpdir(), "jsverify-mutant-"));
    try {
      await mkdir(join(scratch, "verify"));
      for (const file of ["index.mjs", "source.mjs", "data.mjs", "modules.mjs", "solver.mjs", "error.mjs"]) {
        await copyFile(new URL(`../${file}`, import.meta.url), join(scratch, "verify", file));
      }
      await symlink(fileURLToPath(new URL("../../node_modules", import.meta.url)), join(scratch, "node_modules"), "dir");
      const path = join(scratch, "verify", mutant.file), text = await readFile(path, "utf8");
      assert.equal(text.split(mutant.from).length, 2, `Mutation site drifted for ${mutant.id}`);
      await writeFile(path, text.replace(mutant.from, mutant.to));
      const verifier = await import(pathToFileURL(join(scratch, "verify/index.mjs")).href);
      const observed = await runCorpus({seed, verifier, fixtures: [fixture]});
      const target = observed.fixtures[0].functions.find((f) => f.fn === mutant.fn && f.file === (mutant.outcomeFile ?? "entry.mjs"));
      assert.ok(observed.failures.length, `Surviving mutant ${mutant.id}`);
      assert.equal(target?.actual?.status, mutant.status, JSON.stringify({mutant: mutant.id, observed}));
      if (mutant.reason) assert.equal(target.actual.reason, mutant.reason);
      if (mutant.failure) assert.ok(observed.failures.some((f) => f.kind === mutant.failure), `${mutant.id}: missing independent behavioral detection`);
      assert.ok(observed.fixtures.flatMap((f) => f.functions).every((f) => f.actual && f.actual.status !== "error" &&
        !(f.actual.status === "unknown" && !f.actual.reason)), "Crashes or solver exhaustion cannot count as mutant detection");
      results.push({id: mutant.id, file: mutant.file, patch: {from: mutant.from, to: mutant.to},
        control: {status: control.fixtures[0].functions.find((f) => f.fn === mutant.fn && f.file === (mutant.outcomeFile ?? "entry.mjs")).actual.status},
        observed: {status: target.actual.status, reason: target.actual.reason}, detected: true, failures: observed.failures});
    } finally { await rm(scratch, {recursive: true, force: true}); }
  }
  return results;
}
