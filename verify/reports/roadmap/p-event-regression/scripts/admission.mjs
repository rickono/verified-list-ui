import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Parser, version as parserVersion } from 'acorn';
import { verifyFile } from '../../../../index.mjs';
import { checkStateful } from '../../../../stateful/index.mjs';

const base = new URL('../', import.meta.url);
const expectations = JSON.parse(readFileSync(new URL('expectations.json', base), 'utf8'));
const hash = source => createHash('sha256').update(source).digest('hex');
function walk(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type) out.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, out));
    else if (value && typeof value === 'object') walk(value, out);
  }
  return out;
}
const rows = [], inspections = [];
for (const variant of ['before', 'fixed']) {
  const file = fileURLToPath(new URL(`pins/p-event/${variant}/index.js`, base));
  const source = readFileSync(file, 'utf8');
  // Use the current production public APIs on the complete unchanged source.
  // No annotations, prefix stripping, function substitution or solver injection.
  const stateless = await verifyFile(file, { timeoutMs: 1000 });
  const stateful = await checkStateful(file, source, { timeoutMs: 1000, maxDepth: 0 });
  const row = { classification: 'measured', variant, file, sourceSha256: hash(source), stateless, stateful,
    statelessSourceAtSpans: stateless.outcomes.map(o => source.slice(o.span.start, o.span.end)),
    statefulSourceAtSpan: source.slice(stateful.span.start, stateful.span.end) };
  rows.push(row);
  assert.equal(stateless.sha256, row.sourceSha256);
  assert.equal(stateless.outcomes.length, 1);
  for (const result of [stateless.outcomes[0], stateful]) {
    assert.equal(result.status, 'unsupported');
    assert.deepEqual(result.span, expectations.admission.firstSpan);
    assert.equal(source.slice(result.span.start, result.span.end), expectations.admission.sourceAtSpan);
  }
  const ast = Parser.parse(source, { ecmaVersion: 2022, sourceType: 'script' });
  const nodes = walk(ast);
  const at = node => {
    assert.ok(node);
    const prefix = source.slice(0, node.start).split('\n');
    return { start: node.start, end: node.end, line: prefix.length, column: prefix.at(-1).length + 1,
      sha256: hash(source.slice(node.start, node.end)), text: source.slice(node.start, node.end) };
  };
  const find = predicate => nodes.find(predicate);
  const binding = name => find(n => n.type === 'VariableDeclarator' && n.id.name === name);
  const cancel = find(n => n.type === 'AssignmentExpression' && n.left.name === 'cancel');
  const exported = find(n => n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.name === 'module');
  const timeout = find(n => n.type === 'IfStatement' && source.slice(n.test.start, n.test.end) === "typeof opts.timeout === 'number'");
  inspections.push({ classification: 'inferred from read-only source inspection; not additional admission diagnostics', variant,
    boundary: at(exported),
    commonJSDependencyBinding: at(binding('pTimeout')),
    promiseConstruction: at(binding('ret')),
    mutableCancelBinding: at(binding('cancel')),
    smallestUnchangedCleanupAssignment: at(cancel),
    resolveHandlerCleanupOrdering: at(binding('resolveHandler')),
    rejectHandlerCleanupOrdering: at(binding('rejectHandler')),
    timeoutRejectionOrderingAndRethrow: at(timeout) });
}
assert.equal(inspections[0].smallestUnchangedCleanupAssignment.sha256, inspections[1].smallestUnchangedCleanupAssignment.sha256);
console.log(JSON.stringify({ classification: 'measured admission plus explicitly inferred gap mapping', node: process.version,
  parserVersion, rows, inspections,
  resolutionLog: globalThis.pEventAdmissionResolutions,
  scope: 'Complete pinned modules rejected before proof; unchanged nested declarations inspected only; no extracted/reimplemented proof or second semantic model' }, null, 2));
