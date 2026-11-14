import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, Script } from 'node:vm';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const base = new URL('../', import.meta.url);
const rows = [];
const hash = text => createHash('sha256').update(text).digest('hex');
const save = () => writeFileSync(new URL('logs/native.json', base), JSON.stringify({
  node: process.version, scope: 'finite native controls and explicitly labeled design countermodels; no C2 verifier', rows,
}, null, 2) + '\n');
function record(id, expected, observed) { rows.push({ id, expected, observed }); save(); console.log(id, JSON.stringify(observed)); }
mkdirSync(new URL('fixtures/', base), { recursive: true });

// Exact fenced fixture from B; only TS/export erasure before native execution.
const contracts = readFileSync(new URL('.snapshots/B/verify/reports/roadmap/candidate-stateful-C2-grok/contracts.md', base), 'utf8');
const guard = [...contracts.matchAll(/```ts\n([\s\S]*?)```/g)].map(m => m[1]).find(s => s.startsWith('// p1-guard.ts'));
assert.ok(guard);
writeFileSync(new URL('fixtures/B-p1-guard.ts', base), guard);
const forgotten = guard.replace('open = 0; input.removeEventListener("input", onValue);', 'open = 0;');
assert.notEqual(forgotten, guard);
writeFileSync(new URL('fixtures/B-p1-forgotten.ts', base), forgotten);
function runB(source, actions) {
  const input = new EventTarget();
  const context = createContext({ input, Event }, { microtaskMode: 'afterEvaluate', codeGeneration: { strings: false, wasm: false } });
  const run = text => new Script('"use strict";\n' + text).runInContext(context, { timeout: 100 });
  const executable = stripTypeScriptTypes(source).replace(/\bexport\s+/g, s => ' '.repeat(s.length));
  run(executable);
  for (const action of actions) run(action);
  const observed = run('({shown, open, finite: Number.isFinite(shown), onValue})');
  const result = { sourceSha256: hash(source), executableSha256: hash(executable), shownType: typeof observed.shown,
    shownIsEvent: observed.shown instanceof Event, shown: typeof observed.shown === 'number' ? observed.shown : '<Event>',
    finite: observed.finite, open: observed.open, retained: getEventListeners(input, 'input').includes(observed.onValue) };
  input.removeEventListener('input', observed.onValue);
  return result;
}
const payload = runB(guard, ['start()', 'input.dispatchEvent(new Event("input"))']);
record('B-event-domain', 'Actual Event object; declared finite number is false', payload);
assert.equal(payload.shownIsEvent, true); assert.equal(payload.finite, false);
const forgottenResult = runB(forgotten, ['start()', 'stop()', 'input.dispatchEvent(new Event("input"))']);
record('B-forgotten-removal', 'Listener remains but closed guard blocks shown write', forgottenResult);
assert.equal(forgottenResult.retained, true); assert.equal(forgottenResult.shown, 0); assert.equal(forgottenResult.open, 0);
const removedResult = runB(guard, ['start()', 'stop()', 'input.dispatchEvent(new Event("input"))']);
record('B-removed-dispatch', 'Whole-target dispatch remains legal and empty; removed-id invocation would be illegal', removedResult);
assert.equal(removedResult.retained, false); assert.equal(removedResult.shown, 0);

// Observers are separate native listeners. Original application closures are
// never wrapped or replaced. This only covers the restricted no-mutation slice.
async function cuts(instrumented) {
  const target = new EventTarget(), observations = [], order = [];
  let x = 0;
  const make = () => () => { order.push('handler'); if (x < 2) x = x + 1; queueMicrotask(() => order.push('microtask')); };
  const first = make(), second = make();
  const afterFirst = () => observations.push(x), afterSecond = () => observations.push(x);
  target.addEventListener('x', first);
  if (instrumented) target.addEventListener('x', afterFirst);
  target.addEventListener('x', second);
  if (instrumented) target.addEventListener('x', afterSecond);
  target.addEventListener('x', first);
  assert.equal(getEventListeners(target, 'x').filter(f => f === first).length, 1);
  target.dispatchEvent(new Event('x')); order.push('dispatch-return');
  const beforeDrain = order.slice();
  await Promise.resolve();
  target.removeEventListener('x', first); target.removeEventListener('x', afterFirst);
  const alias = second;
  target.removeEventListener('x', alias); target.removeEventListener('x', afterSecond);
  target.dispatchEvent(new Event('x'));
  return { x, observations, beforeDrain, order, distinctClosures: first !== second, aliasSame: alias === second, remaining: getEventListeners(target, 'x').length };
}
const plainCuts = await cuts(false), observedCuts = await cuts(true);
const relation = (before, after) => after - before <= 1;
record('observation-cuts', '0→1→2 satisfies adjacent R, not outer R; identity and run-to-completion preserved', {
  plain: plainCuts, observed: observedCuts, adjacentR: [relation(0, 1), relation(1, 2)], outerR: relation(0, 2),
  limit: 'Extra observers are a finite native feasibility control, not a contained C2 adapter or proof of async cuts',
});
assert.deepEqual(observedCuts.observations, [1, 2]); assert.equal(plainCuts.x, observedCuts.x);
assert.deepEqual(plainCuts.beforeDrain, ['handler', 'handler', 'dispatch-return']);
assert.deepEqual(plainCuts.order, observedCuts.order); assert.equal(relation(0, 2), false);
assert.equal(observedCuts.remaining, 0);

{
  const target = new EventTarget(); let calls = 0;
  const make = () => () => { calls++; };
  const matching = make(), other = make();
  target.addEventListener('x', matching); target.addEventListener('x', other); target.addEventListener('x', matching);
  target.dispatchEvent(new Event('x'));
  const live = getEventListeners(target, 'x');
  const advice = live.map(f => f === matching ? 'noop' : 'fresh');
  // Deliberately broken finite index examples test the two directions, not a
  // proposed third implementation. Native live occurrences supply the oracle.
  const complete = new Map(live.map(f => [f, f]));
  const missing = new Map([[matching, matching]]);
  const phantom = make(), extra = new Map([...complete, [phantom, phantom]]);
  const directions = index => ({ liveToKey: live.every(f => index.get(f) === f), keyToLive: [...index].every(([k, f]) => k === f && live.includes(f)) });
  const result = { calls, liveCount: live.length, adviceFromBProse: advice, anyMatching: live.some(f => f === matching),
    complete: directions(complete), missing: directions(missing), phantom: directions(extra),
    limit: 'Advice/index rows are finite countermodels to stated design premises, not executed C2 rules' };
  record('global-absence-and-index', 'Nonmatching other does not license fresh; both index directions necessary', result);
  assert.equal(calls, 2); assert.deepEqual(advice, ['noop', 'fresh']);
  assert.deepEqual(result.missing, { liveToKey: false, keyToLive: true });
  assert.deepEqual(result.phantom, { liveToKey: true, keyToLive: false });
  target.removeEventListener('x', matching); target.removeEventListener('x', matching);
  target.removeEventListener('x', make()); calls = 0; target.dispatchEvent(new Event('x'));
  assert.equal(calls, 1);
  target.removeEventListener('x', other);
}

{
  const c1 = new AbortController(), c2 = new AbortController(), signal = c1.signal;
  const alias = signal, before = signal.aborted;
  const read = () => ({ frozen: before, current: alias.aborted });
  const start = read(); c1.abort(); const end = read();
  const result = { start, end, alias: alias === c1.signal, distinct: c1 !== c2 && c1.signal !== c2.signal,
    signalIsEventTarget: signal instanceof EventTarget, compatibleInputsMayAlias: ((a, b) => a === b)(signal, alias) };
  record('capture-and-alias', 'Primitive snapshot stays false; handle observes true; signal/target domains overlap', result);
  assert.deepEqual(end, { frozen: false, current: true }); assert.equal(result.signalIsEventTarget, true);
}

// These are explicit synthetic request producers, never claims about fetch.
async function race(policy, order) {
  const ctl = new AbortController(), log = [];
  if (order === 'already') ctl.abort();
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const onAbort = () => { log.push('abort-observed'); if (policy === 'reject-pending') reject(new Error('AbortError')); };
  if (ctl.signal.aborted) onAbort(); else ctl.signal.addEventListener('abort', onAbort);
  const done = promise.then(value => ({ outcome: 'fulfilled', value, abortedAtResume: ctl.signal.aborted }), e => ({ outcome: 'rejected', error: e.message }));
  const settle = () => { log.push('resolve-called'); resolve(7); };
  const abort = () => { log.push('abort-called'); ctl.abort(); };
  if (order === 'already') settle();
  if (order === 'queued-before-sync-abort') { queueMicrotask(settle); abort(); }
  if (order === 'settled-before-abort') { settle(); abort(); }
  if (order === 'queue-order') { queueMicrotask(settle); queueMicrotask(abort); }
  const outcome = await done;
  ctl.signal.removeEventListener('abort', onAbort);
  assert.equal(getEventListeners(ctl.signal, 'abort').length, 0);
  return { policy, order, log, ...outcome };
}
const races = [];
for (const [policy, order] of [['advisory', 'already'], ['advisory', 'queued-before-sync-abort'],
  ['reject-pending', 'already'], ['reject-pending', 'queued-before-sync-abort'],
  ['reject-pending', 'settled-before-abort'], ['reject-pending', 'queue-order']]) races.push(await race(policy, order));
record('abort-settlement', 'Advisory fulfills; rejecting producer rejects only if abort settles first', races);
assert.deepEqual(races.map(r => r.outcome), ['fulfilled', 'fulfilled', 'rejected', 'rejected', 'fulfilled', 'fulfilled']);
assert.equal(races[4].abortedAtResume, true);

async function disposal(guarded) {
  const target = new EventTarget(), ctl = new AbortController();
  let disposed = false, shown = 0, starts = 0, resolve, finish;
  const request = new Promise(yes => { resolve = yes; });
  const done = new Promise(yes => { finish = yes; });
  const handler = async () => { starts++; const value = await request; if (!guarded || !disposed) shown = value; finish(); };
  target.addEventListener('x', handler); target.dispatchEvent(new Event('x'));
  disposed = true; target.removeEventListener('x', handler); ctl.abort(); target.dispatchEvent(new Event('x'));
  resolve(9); await done;
  return { guarded, starts, shown, aborted: ctl.signal.aborted, registrations: getEventListeners(target, 'x').length };
}
const disposals = [await disposal(true), await disposal(false)];
record('running-survives-removal', 'One start each; guarded 0, unsafe 9 after removal/abort', disposals);
assert.deepEqual(disposals.map(d => d.shown), [0, 9]);

function duringAdd(withTail) {
  const target = new EventTarget(), log = [];
  const late = () => log.push('late');
  const first = () => { log.push('first'); target.addEventListener('x', late); };
  const tail = () => log.push('tail');
  target.addEventListener('x', first); if (withTail) target.addEventListener('x', tail);
  target.dispatchEvent(new Event('x'));
  for (const f of [first, late, tail]) target.removeEventListener('x', f);
  return log;
}
const additions = { onlyFirst: duringAdd(false), hasTail: duringAdd(true) };
record('add-during-dispatch', 'Native list shape changes result; keep unsupported', additions);
assert.deepEqual(additions, { onlyFirst: ['first'], hasTail: ['first', 'tail', 'late'] });
{
  const emitter = new EventEmitter(), order = [];
  const listener = () => {};
  emitter.on('newListener', name => { if (name === 'x') { order.push(['hook-count', emitter.listenerCount('x')]); emitter.off('x', listener); } });
  emitter.on('x', listener); order.push(['after-count', emitter.listenerCount('x')]); emitter.removeAllListeners();
  record('emitter-reentrancy', 'Native hook precedes store; synthetic control only, no fetched source executed', order);
  assert.deepEqual(order, [['hook-count', 0], ['after-count', 1]]);
}
console.log('NATIVE_CONTROLS_PASS');
