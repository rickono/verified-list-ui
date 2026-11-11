import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { verify, verifyFile } from "../../verify/index.mjs";
import { compile, parse } from "../../verify/source.mjs";
import { obligation } from "../../verify/proofs.mjs";
import { createBackend } from "../../verify/backend.mjs";
import { literal } from "../../verify/data.mjs";
import { embed, rankDecrease } from "../../verify/specifications.mjs";

const examples = await readFile(new URL("../../verify/examples/loops.ts", import.meta.url), "utf8");
const check = (source) => verify(source, { timeoutMs: 30_000 });
const allVerified = (report) => assert.ok(report.outcomes.length && report.outcomes.every((o) => o.status === "verified"), JSON.stringify(report.outcomes));
const gap = (outcome, phase) => {
	assert.equal(outcome.status, "unknown", JSON.stringify(outcome));
	assert.equal(outcome.reason, "induction-gap");
	assert.equal(outcome.phase, phase);
	assert.ok(outcome.span.end > outcome.span.start);
};

const counter = `// requires Number.isInteger(n) && 0 <= n && n <= 4294967295
// ensures result === n
function count(n: number) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n
  // decreases real(n) - real(i)
  while (i < n) { i++; }
  return i;
}`;

test("array search proves bounds, absence and first match; counting supports continue", async () => {
	allVerified(await check(examples));
	allVerified(await check(counter));
});

test("an off-by-one return is a replay-confirmed source bug", async () => {
	const report = await check(examples.replace("return i;", "return i + 1;"));
	const outcome = report.outcomes.find((o) => o.fn === "indexOf");
	assert.equal(outcome.status, "counterexample", JSON.stringify(outcome));
	assert.equal(outcome.confirmed, true);
	assert.ok(outcome.failed.length);
});

test("verified loop helpers compose across module boundaries", async () => {
	const directory = await mkdtemp(join(tmpdir(), "loop-import-"));
	try {
		await writeFile(join(directory, "scan.ts"), examples);
		const entry = join(directory, "entry.ts");
		await writeFile(entry, `import {indexOf} from './scan.ts';
// ensures result === -1 || (0 <= result && result < xs.length && xs[result] === target)
// ensures result !== -1 || xs.every((v) => v !== target)
const search = (xs: number[], target: number) => indexOf(xs, target);`);
		allVerified(await verifyFile(entry, { timeoutMs: 30_000 }));
	} finally { await rm(directory, { recursive: true, force: true }); }
});

test("the CLI distinguishes located induction gaps from confirmed bugs", () => {
	const result = spawnSync(process.execPath, ["verify/bin/jsverify.mjs", "--timeout", "30000", "verify/examples/loop-gaps.ts"], { encoding: "utf8", timeout: 60_000 });
	assert.equal(result.status, 1, result.stderr);
	assert.match(result.stdout, /unknown wrongInvariant/);
	assert.match(result.stdout, /loop check: invariant-preserve/);
	assert.match(result.stdout, /loop check: rank/);
	assert.match(result.stdout, /candidate inputs \(not a confirmed bug\)/);
	assert.doesNotMatch(result.stdout, /counterexample|returned:/);
});

test("wrong initialization, preservation and constant ranks give located induction gaps", async () => {
	const bounded = counter.replace("4294967295", "100");
	gap((await check(bounded.replace("let i = 0;", "let i = -1;"))).outcomes[0], "invariant-init");
	const incorrect = bounded.replace("i <= n\n", "i <= 1\n").replace("return i;", "return n;");
	gap((await check(incorrect)).outcomes[0], "invariant-preserve");
	gap((await check(bounded.replace("decreases real(n) - real(i)", 'decreases real("0")'))).outcomes[0], "rank");
});

test("native rank arithmetic stays rounded; explicit real arithmetic is exact", async () => {
	const source = (measure) => `// requires n === 1152921504606846976
// ensures result === 10
function f(n: number) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 10
  // decreases ${measure}
  while (i < 10) { i++; }
  return i;
}`;
	for (const rank of ["(n - i) - n + 10", "real((n - i) - n + 10)"]) {
		gap((await check(source(rank))).outcomes[0], "rank");
	}
	allVerified(await check(source('real(n) - real(i) - real(n) + real("10")')));
});

test("rank drops larger than one are accepted; positive fractional drops are insufficient", async () => {
	allVerified(await check(`// ensures result === 10
function two() {
  let i = 0;
  // invariant Number.isInteger(i) && Number.isInteger(i / 2) && 0 <= i && i <= 10
  // decreases real("10") - real(i)
  while (i < 10) { i += 2; }
  return i;
}`));
	gap((await check(`// ensures result === 1
function half() {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases i === 0 ? real("1/2") : real("0")
  while (i < 1) { i++; }
  return i;
}`)).outcomes[0], "rank");
});

test("old in loop contracts refers only to function-entry parameters", async () => {
	allVerified(await check(counter.replace("i <= n\n", "i <= old(n)\n").replace("real(n) - real(i)", "real(old(n)) - real(i)")));
});

test("a binary64 increment that stalls at 2^53 cannot verify termination", async () => {
	const report = await check(`// ensures result === 9007199254740994
function stalled() {
  let i = 9007199254740992;
  // invariant Number.isInteger(i) && 0 <= i && i <= 9007199254740994
  // decreases real(9007199254740994) - real(i)
  while (i < 9007199254740994) { i++; }
  return i;
}`);
	assert.equal(report.outcomes[0].status, "unknown", JSON.stringify(report));
	assert.equal(report.outcomes[0].reason, "replay-timeout");
	assert.equal(report.outcomes[0].phase, "rank");
});

test("loop-head havoc preserves optional values and both signs of zero", async () => {
	allVerified(await check(`// ensures result === undefined || result > 0
function lastPositive(values: number[]) {
  let last = values[0];
  if (!(last > 0)) last = undefined;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length
  // invariant last === undefined || last > 0
  // decreases real(values.length) - real(i)
  for (let i = 0; i < values.length; i++) { if (values[i] > 0) last = values[i]; }
  return last;
}`));
	const result = await check(`// ensures Object.is(result, 0)
function signedZero() {
  let i = -0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 0
  // decreases real("0") - real(i)
  while (i < 0) { i++; }
  return i;
}`);
	assert.equal(result.outcomes[0].status, "counterexample", JSON.stringify(result));
	assert.equal(result.outcomes[0].confirmed, true);
	assert.equal(result.outcomes[0].result, "-0");
});

test("a scalar that becomes undefined is widened before checking loop exits", async () => {
	const report = await check(`// requires values.length > 0
// ensures result !== undefined
function optional(values: number[], flag: boolean) {
  let last = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length
  // decreases real(values.length) - real(i)
  for (let i = 0; i < values.length; i++) { last = flag ? undefined : values[i]; }
  return last;
}`);
	const outcome = report.outcomes[0];
	assert.ok(["counterexample", "unknown"].includes(outcome.status), JSON.stringify(outcome));
	if (outcome.status === "counterexample") assert.equal(outcome.confirmed, true);
	else assert.equal(outcome.reason, "induction-gap");
});

test("break restores shadowed locals and does not run a for update", async () => {
	allVerified(await check(`// ensures result === 0
function exit(values: number[]) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length && i === 0
  // decreases real(values.length) - real(i)
  for (; i < values.length; i++) { { let i = 10; i++; break; } }
  return i;
}`));
	allVerified(await check(`// ensures Object.is(result, x)
function early(x: number) {
  // invariant true
  // decreases 0
  while (true) { return x; }
}`));
});

test("continue exits block scope before running the outer for update", async () => {
	allVerified(await check(`// ensures result === 1
function continued() {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real("1") - real(i)
  for (; i < 1; i++) { { let i = 99; i++; continue; } }
  return i;
}`));
});

test("writes under false guards do not freeze loop-carried state", async () => {
	allVerified(await check(`// ensures Object.is(result, x)
function captured(x: number) {
  let value = x;
  // invariant Number.isInteger(i) && 0 <= i && i <= 1 && Object.is(value, old(x))
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) { false && ((value = 1) > 0); }
  return value;
}`));
});

test("calls inside loop iterations still require replay-confirmed domain safety", async () => {
	const report = await check(`// requires x >= 0
// ensures result === x
function need(x: number) { return x; }
// ensures result === 0
function caller() {
  // invariant Number.isInteger(i) && 0 <= i && i <= 1
  // decreases real("1") - real(i)
  for (let i = 0; i < 1; i++) { need(-1); }
  return 0;
}`);
	assert.equal(report.outcomes[0].status, "verified");
	assert.equal(report.outcomes[1].status, "counterexample", JSON.stringify(report));
	assert.equal(report.outcomes[1].confirmed, true);
	assert.equal(report.outcomes[1].call.callee, "need");
});

test("loop initialization cannot use a later helper's postcondition", async () => {
	const source = `// ensures result === 5
function five(x: number) { return 5; }
// requires Number.isInteger(n) && 1 <= n && n <= 10
// ensures result === 5
function settle(n: number) {
  let value = 0, i = 0;
  // invariant value === 5 && Number.isInteger(i) && 0 <= i && i <= n
  // decreases real(n) - real(i)
  while (i < n) { i++; value = five(i); }
  return value;
}`;
	const report = await check(source);
	assert.equal(report.outcomes[0].status, "verified");
	gap(report.outcomes[1], "invariant-init");
});

test("partial real invariants and rank expressions must be defined", async () => {
	const bounded = counter.replace("4294967295", "100");
	gap((await check(bounded.replace("Number.isInteger(i) && 0 <= i && i <= n", 'real(i) / real("0") > real("0")'))).outcomes[0], "invariant-init");
	gap((await check(bounded.replace("decreases real(n) - real(i)", 'decreases real(n) / real("0")'))).outcomes[0], "rank");
});

test("loop witness preferences never become proof bounds", async () => {
	const { targets: [target] } = compile([parse("input.ts", counter)]);
	assert.equal(target.replayGuards.length, 1);
	for (const phase of ["feasibility", "postcondition"]) {
		assert.ok(!obligation(target, phase).assertions.includes(target.smallWitness));
		assert.ok(target.replayGuards.every((guard) => !obligation(target, phase).assertions.includes(guard)));
	}
	assert.ok(obligation(target, "feasibility-witness").assertions.includes(target.smallWitness));
	assert.ok(target.replayGuards.every((guard) => obligation(target, "feasibility-witness").assertions.includes(guard)));
	assert.deepEqual(obligation(target, "requires-definedness-witness").replayGuards, []);
	const long = await check(counter.replace("Number.isInteger(n) && 0 <= n && n <= 4294967295", "n === 1000000"));
	assert.equal(long.outcomes[0].status, "unknown", JSON.stringify(long));
	assert.equal(long.outcomes[0].reason, "witness-too-large");
});

test("precondition definedness replay does not inherit an unexecuted loop's rank preference", async () => {
	const source = counter.replace("Number.isInteger(n) && 0 <= n && n <= 4294967295", 'n === 1000000\n// requires real(x) > real("0")')
		.replace("function count(n: number)", "function count(n: number, x: number)");
	const outcome = (await check(source)).outcomes[0];
	assert.equal(outcome.status, "counterexample", JSON.stringify(outcome));
	assert.equal(outcome.phase, "requires-definedness");
	assert.equal(outcome.confirmed, true);
});

test("rank thresholds agree with exact integer arithmetic at the 53-bit shadow limit", async () => {
	const backend = createBackend();
	try {
		await backend.start(10_000);
		const largest = 9007199254740991n;
		for (const [a, b] of [[largest, largest], [largest, largest - 1n], [largest - 2n, largest - 1n], [largest, 0n]]) {
			const view = (n) => ({ ...literal(Number(n)), nat: { smt: `(_ bv${n} 53)`, width: 53 } });
			const predicate = rankDecrease(embed(view(a), {}, () => {}), embed(view(b), {}, () => {}));
			const expected = a >= 0n && a - b >= 1n;
			const answer = await backend.check({ declarations: "", assertions: [expected ? `(not ${predicate})` : predicate], models: [] }, 10_000);
			assert.equal(answer.status, "unsat", `${a} -> ${b}: ${JSON.stringify(answer)}`);
		}
	} finally { await backend.close(); }
});

test("unsupported loop shapes, writes and misplaced contracts fail closed", async () => {
	const sources = [
		counter.replace("  // decreases real(n) - real(i)\n", ""),
		counter.replace("while (i < n)", "do").replace("{ i++; }", "{ i++; } while (i < n);"),
		counter.replace("{ i++; }", "{ while (false) {} i++; }"),
		counter.replace("{ i++; }", "{ var local = 1; i++; }"),
		counter.replace("{ i++; }", "{ const values = [0]; values[0] = 1; i++; }"),
		counter.replace("  // invariant", "  // ensures true\n  // invariant"),
		counter.replace("  while", "  i++;\n  while"),
		counter.replace("{ i++; }", "{ let Number = 0; i++; }"),
		counter.replace("decreases real(n) - real(i)", "decreases old(i)"),
	];
	for (const source of sources) {
		assert.equal((await check(source)).outcomes[0].status, "unsupported", source);
	}
});
