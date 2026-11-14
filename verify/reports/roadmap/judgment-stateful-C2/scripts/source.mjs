import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { machineOf } from '../.snapshots/current/verify/stateful/machine.mjs';
import { transitionsOf } from '../.snapshots/current/verify/stateful/transitions.mjs';
import { checkStateful } from '../.snapshots/current/verify/stateful/index.mjs';
import { traceOf, replayTrace, decodeValue } from '../.snapshots/current/verify/stateful/traces.mjs';
import { sha256 } from '../.snapshots/current/verify/stateful/ast.mjs';
import { compile } from '../.snapshots/current/verify/source.mjs';
import { single } from '../.snapshots/current/verify/modules.mjs';
import { verify } from '../.snapshots/current/verify/index.mjs';
import { obligation } from '../.snapshots/current/verify/proofs.mjs';

const base = new URL('../', import.meta.url);
const frontierOnly = process.argv.includes('--frontier-only');
const rows = frontierOnly ? JSON.parse(readFileSync(new URL('logs/source-first.json', base), 'utf8')).rows : [];
const req = createRequire('/Users/rick/verification-vibes/verified-list-ui/package.json');
const metadata = { codeHead: 'bd0d9570e8f910a8cf7db14cf517728ba3fd673e', node: process.version,
  dependencies: Object.fromEntries(['acorn', 'z3-solver'].map(n => [n, req(`${n}/package.json`).version])),
  scope: 'Actual current C1 and H/G seams; no C2 implementation, injected connection, handwritten SMT, or verdict substitution' };
const save = () => writeFileSync(new URL('logs/source.json', base), JSON.stringify({ ...metadata, rows }, null, 2) + '\n');
const record = (id, expected, observed) => { rows.push({ id, expected, observed }); save(); console.log(id, JSON.stringify(observed)); };
const fixture = (name, source) => { writeFileSync(new URL(`fixtures/${name}.ts`, base), source); return `verify/reports/roadmap/judgment-stateful-C2/fixtures/${name}.ts`; };
const fromA = name => readFileSync(new URL(`.snapshots/A/verify/reports/roadmap/candidate-stateful-C2-codex/pilots/${name}.ts`, base), 'utf8');
const calls = [{ kind: 'call', entry: 'search', args: [0] }, { kind: 'call', entry: 'dispose', args: [] }, { kind: 'resolve', request: 1, op: 'lookup', value: 1 }];
mkdirSync(new URL('fixtures/', base), { recursive: true });
mkdirSync(new URL('logs/queries/', base), { recursive: true });
if (!frontierOnly) {
const guarded = fromA('dispose-guarded'), file = fixture('A-dispose-guarded', guarded);
const machine = machineOf(file, guarded), transitions = transitionsOf(machine);
const fullQueries = transitions.units.map(u => ({ unit: u.name, feasibility: obligation(u.target, 'feasibility'), postconditions: u.target.postconditions.map((_, i) => obligation(u.target, 'postcondition', i)) }));
writeFileSync(new URL('logs/queries/guarded.json', base), JSON.stringify(fullQueries, null, 2) + '\n');
const structure = { sourceSha256: machine.sourceSha256, assumptions: machine.assumptions, unitsSha256: transitions.sha256,
  units: transitions.units.map(u => ({ name: u.name, kind: u.kind, span: u.span, effects: u.target.effects, standaloneExecutable: u.target.executable !== undefined })),
  segments: machine.entries.map(e => ({ name: e.name, captures: e.awaits.map(a => a.captures.map(c => ({ name: c.name, type: c.type, kind: c.kind }))),
    segments: e.segments.map(seg => seg.map(n => ({ start: n.start, end: n.end, text: guarded.slice(n.start, n.end) }))) })),
  proofMentionsSearchCap: /maxDepth|eventBound|activationCount|maxExecutions|sampleLimit/.test(JSON.stringify(fullQueries)) };
record('C1-unbounded-representation', 'Init, entry/resume/reject, four keeps; no event or activation proof cap', structure);
assert.equal(transitions.units.length, 9); assert.equal(structure.proofMentionsSearchCap, false);
const proof = await checkStateful(file, guarded, { timeoutMs: 20000, maxDepth: 0 });
record('C1-guarded-proof', 'verified unbounded C1 safety, no witness search', proof);
assert.equal(proof.status, 'verified'); assert.equal(proof.searched, undefined); assert.equal(proof.assumptions.eventBound, null);

async function replay(id, source, actions, options = {}) {
  const path = fixture(id, source), m = machineOf(path, source), start = performance.now();
  const result = await replayTrace(path, source, traceOf(m, actions), options);
  record(id, 'Native result; original property spans and hashes retained', { sourceSha256: m.sourceSha256, ms: performance.now() - start, ...result,
    final: result.trace && Object.fromEntries(Object.entries(result.trace.steps.at(-1).state).map(([k, v]) => [k, decodeValue(v)])) });
  return result;
}
const good = await replay('C1-guarded-native', guarded, calls); assert.equal(good.violation, undefined); assert.equal(good.status, 'ok');
const unsafe = fromA('dispose-unguarded');
const bad = await replay('C1-unguarded-native', unsafe, calls); assert.equal(bad.status, 'ok'); assert.equal(bad.violation.text, '!old(disposed) || shown === old(shown)');
assert.equal(unsafe.slice(bad.violation.span.start, bad.violation.span.end).includes(bad.violation.text), true);
const stale = readFileSync(new URL('.snapshots/current/tests/verify/fixtures/stateful/pilots/search-stale.ts', base), 'utf8');
const c = { kind: 'call', entry: 'search', args: [1] };
const staleRun = await replay('C1-stale-native', stale, [c, c, { kind: 'resolve', request: 2, op: 'lookup', value: 20 }, { kind: 'resolve', request: 1, op: 'lookup', value: 10 }]);
assert.equal(staleRun.violation.text, 'shownFor >= old(shownFor)');
const suffix = await replay('C1-illegal-suffix', unsafe, [...calls, calls[2]]); assert.equal(suffix.status, 'illegal-environment-action');
const illegalDomain = await replay('C1-illegal-domain', guarded, [calls[0], { ...calls[2], value: 2 }]); assert.equal(illegalDomain.status, 'illegal-environment-action');
const tamper = await replayTrace(file, guarded, { ...traceOf(machine, calls), assumptionsSha256: '0'.repeat(64) });
record('C1-tampered-hash', 'illegal-environment-action', tamper); assert.equal(tamper.status, 'illegal-environment-action');
const noRejects = guarded.replace('// rejects\n', '');
const rejected = await replay('C1-unmarked-reject', noRejects, [calls[0], { kind: 'reject', request: 1, op: 'lookup' }]);
assert.equal(rejected.status, 'illegal-environment-action');

const pair = 'let x = 0;\n// state 0 <= x && x <= 2\n// always x - old(x) <= 1\nexport function pair() { if (x < 2) x = x + 1; if (x < 2) x = x + 1; }\n';
const pairResult = await replay('C1-action-cut', pair, [{ kind: 'call', entry: 'pair', args: [] }]);
assert.equal(pairResult.violation.text, 'x - old(x) <= 1');

const loop = '// @environment\ndeclare function op(): Promise<number>;\nlet x = 0;\n// state x === 0\nexport async function entry() { await op(); for (;;) {} }';
const timed = await replay('C1-containment', loop, [{ kind: 'call', entry: 'entry', args: [] }, { kind: 'resolve', request: 1, op: 'op', value: 0 }]);
assert.equal(timed.status, 'unknown'); assert.equal(timed.reason, 'replay-timeout'); assert.ok(rows.at(-1).observed.ms < 1000);
const budget = await checkStateful(file, guarded, { timeoutMs: 1, maxDepth: 0 });
record('C1-resource-budget', 'unknown/solver; wall time budgets proving too, without restricting its domain', budget);
assert.equal(budget.status, 'unknown'); assert.equal(budget.reason, 'solver');

const narrow = `// ensures result === fn(x)
function applyPredicate(fn: (value: number) => boolean, x: number) { return fn(x); }
// requires x > 0
// ensures result === (x > 1)
function big(x: number) { return x > 1; }
// ensures true
function caller() { return applyPredicate(big, 1); }
`;
const total = await verify(narrow, { file: fixture('H-totality', narrow), timeoutMs: 20000 });
record('H-full-domain-admission', 'Even actual positive argument cannot license a narrow numeric predicate', total);
const outcome = total.outcomes.find(o => o.fn === 'caller');
assert.equal(outcome.status, 'counterexample'); assert.equal(outcome.confirmed, true); assert.equal(outcome.call.violated[0].text, 'x > 0');

function compileOnly(source, name) {
  const path = fixture(name, source);
  try { const snap = single(path, source); if (snap.error) throw snap.error;
    return { status: 'compiled-only', targets: compile(snap.records).targets.map(t => ({ name: t.name, effects: t.effects })) };
  } catch (e) { return { status: e.status, message: e.message, span: e.span }; }
}
const pure = '// ensures true\nfunction host(n: number) { const cell = 1; const cb = (v: number): boolean => v > cell; return cb(n); }';
const mutable = pure.replace('const cell', 'let cell');
const reference = 'type Box = { value: number };\n// ensures true\nfunction host(box: Box, n: number) { const cb = (v: number): boolean => (box.value = v) === v; return cb(n); }';
const helper = '// ensures true\nfunction effect(x: number) { const box = {value: x}; return box.value > 0; }\n// ensures true\nfunction host(n: number) { const cb = (v: number): boolean => effect(v); return cb(n); }';
const effects = [pure, mutable, reference, helper].map((s, i) => compileOnly(s, `H-effects-${i}`));
record('H-effect-boundary', 'Primitive capture compiles pure; mutable/reference/heap-helper capture fails', effects);
assert.equal(effects[0].targets[0].effects.kind, 'pure');
for (const e of effects.slice(1)) assert.equal(e.status, 'unsupported');
assert.equal(structure.units.find(u => u.name === 'search$0').effects.kind, 'heap');
assert.equal(structure.units.find(u => u.name === 'search$1').effects.kind, 'writes');
assert.equal(structure.units.find(u => u.name === 'dispose$0').effects.kind, 'writes');
}

if (frontierOnly) {
  const prior = rows.find(r => r.id === 'C1-unbounded-representation').observed;
  assert.equal(prior.units.find(u => u.name === 'search$0').effects.kind, 'heap');
  assert.equal(prior.units.find(u => u.name === 'search$1').effects.kind, 'writes');
  assert.equal(prior.units.find(u => u.name === 'dispose$0').effects.kind, 'writes');
  record('judge-expectation-correction', 'Read-only capture entry is heap, actual setters are writes', {
    priorRun: 'source-first.json', freshProofs: false,
    effects: prior.units.filter(u => ['search$0', 'search$1', 'dispose$0'].includes(u.name)).map(u => [u.name, u.effects.kind]),
  });
}

const baseSource = 'let x = 0;\n// state true\nexport function entry() {}\n';
const lines = ['protocol event-target', 'event "x"', 'delivers Number.isFinite(value)', 'count x === 1', 'uniqueness true', 'prоtocol event-target', 'stаte false', 'leads true', 'fairness true'];
const grammar = lines.map((line, i) => {
  const source = baseSource.replace('// state true', `// ${line}\n// state true`), path = fixture(`grammar-${i}`, source);
  try { const m = machineOf(path, source); return { line, status: 'parsed-only', clauseKinds: m.clauses.filter(c => c.kind).map(c => c.kind) }; }
  catch (e) { return { line, status: e.status, message: e.message, span: e.span, sourceAtSpan: source.slice(e.span.start, e.span.end) }; }
});
record('C1-grammar-frontier', 'C1 future words may be prose; existing Unicode/fairness gates fail closed; no C2 verdict', grammar);
assert.equal(grammar.find(r => r.line === 'stаte false').status, 'unsupported');
for (const name of ['cancel-contract', 'listener-identity']) {
  const source = fromA(name), result = await checkStateful(fixture(`A-${name}`, source), source, { timeoutMs: 1000, maxDepth: 0 });
  record(`C1-reject-${name}`, 'Original-span unsupported; no silent C2 admission', result); assert.equal(result.status, 'unsupported');
}
console.log('SOURCE_CONTROLS_PASS');
