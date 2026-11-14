import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

const [moduleFile, variant, outcome, expectationsFile] = process.argv.slice(2);
const expectations = JSON.parse(readFileSync(expectationsFile, 'utf8'));
const expected = expectations.cases.find(c => c.variant === variant && c.outcome === outcome);
assert.ok(expected, 'Only the four frozen cases may execute');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(moduleFile);
const pEvent = require(moduleFile);
const pTimeout = require('p-timeout');
const dependencyFile = require.resolve('p-timeout');
const emitter = new EventEmitter();
const checks = [], order = [], identities = new WeakMap();
let sequence = 0;
function callerErrorControl() {}
identities.set(callerErrorControl, 'caller:error');
const identity = fn => {
  if (!identities.has(fn)) identities.set(fn, `managed:${++sequence}:${fn.name}`);
  return identities.get(fn);
};
const channels = { event: expectations.event, error: 'error' };
const snapshot = stage => {
  order.push(stage);
  return Object.fromEntries(Object.entries(channels).map(([key, event]) => [key, {
    count: emitter.listenerCount(event),
    listeners: emitter.listeners(event).map(fn => ({
      id: identity(fn), name: fn.name, owner: fn === callerErrorControl ? 'caller' : 'managed'
    }))
  }]));
};
const check = (name, actual, expected) => checks.push({ name, actual, expected, pass: isDeepStrictEqual(actual, expected) });
const result = {
  classification: 'measured', variant, outcome, expected,
  pid: process.pid, node: process.version, nodeVersions: process.versions,
  source: { file: moduleFile, sha256: sha256(readFileSync(moduleFile)) },
  dependency: { file: dependencyFile, sha256: sha256(readFileSync(dependencyFile)),
    name: 'p-timeout', version: JSON.parse(readFileSync(require.resolve('p-timeout/package.json'), 'utf8')).version },
  schedule: { timeoutMs: outcome === 'timeout' ? expectations.timeoutMs : expectations.successTimeoutMs,
    eventDelayMs: expectations.eventDelayMs, event: expectations.event, value: expectations.value },
  order, checks, pristine: snapshot('pristine')
};
emitter.on('error', callerErrorControl);
result.beforeRegistration = snapshot('before-registration');
let eventTimer, managed = [], eventEmitted = false;
try {
  // Match the upstream 50/200 ms timeout and 200/250 ms success schedules.
  // The scheduled late event is cancelled only after retaining all assertions.
  eventTimer = setTimeout(() => {
    eventEmitted = true;
    emitter.emit(expectations.event, expectations.value);
  }, expectations.eventDelayMs);
  const promise = pEvent(emitter, expectations.event, { timeout: result.schedule.timeoutMs });
  result.afterRegistration = snapshot('after-registration');
  managed = Object.values(channels).flatMap(event => emitter.listeners(event)
    .filter(fn => fn !== callerErrorControl).map(fn => ({ event, fn })));
  try {
    const value = await promise;
    result.settlement = { kind: 'fulfilled', value };
  } catch (error) {
    result.settlement = { kind: 'rejected', name: error.name, message: error.message,
      isPinnedTimeoutError: error instanceof pTimeout.TimeoutError,
      exactPinnedConstructor: error.constructor === pTimeout.TimeoutError };
  }
  result.afterAwaitedOutcome = snapshot('after-awaited-outcome');
  result.eventEmittedAtObservation = eventEmitted;
  // This is the actual upstream issue7 assertion, recorded before cleanup.
  try {
    assert.equal(emitter.listenerCount(expectations.event), 0);
    result.upstreamAssertion = { expression: "emitter.listenerCount('🦄') === 0", pass: true, actual: 0, expected: 0 };
  } catch (error) {
    result.upstreamAssertion = { expression: "emitter.listenerCount('🦄') === 0", pass: false,
      actual: error.actual, expected: error.expected, name: error.name, code: error.code };
  }
  order.push('upstream-assertion-retained');
  result.identityChecks = managed.map(({ event, fn }) => ({ event, id: identity(fn),
    registeredSameFunctionRetained: emitter.listeners(event).includes(fn) }));
  result.callerControlSameFunctionRetained = emitter.listeners('error').includes(callerErrorControl);
  for (const [key, count] of Object.entries(expectations.beforeRegistration)) {
    check(`before registration ${key} count`, result.beforeRegistration[key].count, count);
    check(`after registration ${key} count`, result.afterRegistration[key].count, expectations.afterRegistration[key]);
  }
  check('settlement', result.settlement.kind, expected.settlement);
  check('upstream assertion result', result.upstreamAssertion.pass, expected.upstreamEventCleanupAssertionPass);
  check('managed event count after outcome', result.afterAwaitedOutcome.event.count, expected.managedEventAfter);
  check('managed error count after outcome', result.afterAwaitedOutcome.error.count - 1, expected.managedErrorAfter);
  check('caller error control identity preserved', result.callerControlSameFunctionRetained, true);
  check('two distinct managed function identities', new Set(managed.map(({ fn }) => identity(fn))).size, 2);
  for (const row of result.identityChecks) {
    check(`registered identity ${row.id}`, row.registeredSameFunctionRetained, variant === 'before' && outcome === 'timeout');
  }
  check('event emitted before observation', eventEmitted, outcome === 'success');
  if (outcome === 'timeout') {
    check('error name', result.settlement.name, expected.errorName);
    check('original error message', result.settlement.message, expected.errorMessage);
    check('pinned TimeoutError instance', result.settlement.isPinnedTimeoutError, true);
    check('exact pinned error constructor', result.settlement.exactPinnedConstructor, true);
  } else check('successful event value', result.settlement.value, expectations.value);
  result.loadedCommonJS = Object.keys(require.cache).sort().map(file => ({ file, sha256: sha256(readFileSync(file)) }));
  check('only original p-event and pinned p-timeout executed as CommonJS', result.loadedCommonJS.map(x => x.file).sort(), [moduleFile, dependencyFile].sort());
} catch (error) {
  result.harnessError = { name: error.name, message: error.message, stack: error.stack };
} finally {
  // Cleanup cannot make the retained assertion pass retroactively.
  clearTimeout(eventTimer);
  for (const { event, fn } of managed) emitter.removeListener(event, fn);
  emitter.removeListener('error', callerErrorControl);
  result.afterHarnessCleanup = snapshot('after-harness-cleanup');
  check('cleanup event count', emitter.listenerCount(expectations.event), 0);
  check('cleanup error count', emitter.listenerCount('error'), 0);
  result.eventTimerCancelled = true;
}
result.allExpectedObservations = !result.harnessError && checks.every(c => c.pass);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.allExpectedObservations ? 0 : 1;
