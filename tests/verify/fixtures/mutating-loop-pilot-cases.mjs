// Imported from d9c22c63:verify/reports/roadmap/candidate-K-claude/probes/cases.mjs; original authorship retained.
// K candidate (claude) probe corpus.
// r2 note: r1 (logs/probes-prototype-r1.log) used invariants whose loop index
// lacked a literal 0 lower bound or used a nested-member length bound, so the
// existing E rule havocked it as binary64 and quantified preservation timed out.
// r2 adds the literal bound / hoists scan.values; the programs are unchanged
// except record-flag, which reads scan.values through a const alias. Each case is ordinary TS source given to
// the public verify() entry point of either the baseline verifier or the
// scratch prototype. `predicted` records what the design predicts before the run;
// run.mjs prints measured outcomes next to it. Nothing here is a test gate.
const fill = (invariant, body = "values[i] = x;") => `
// requires Number.isInteger(start) && 0 <= start && start <= values.length
// modifies values
// ensures values.every((v, k) => k < start ? Object.is(v, old(values.slice())[k]) : Object.is(v, x))
function fillFrom(values: number[], start: number, x: number) {
  let i = start;
  // invariant Number.isInteger(i) && 0 <= i && start <= i && i <= values.length
  // invariant ${invariant}
  // decreases real(values.length) - real(i)
  while (i < values.length) {
    ${body}
    i++;
  }
  return i;
}
`;
const FILL_INV = "values.every((v, k) => k < start || k >= i ? Object.is(v, old(values.slice())[k]) : Object.is(v, x))";

const reverseCopy = (bInvariant) => `
// requires a.length === b.length
// modifies a
// ensures a.every((v, k) => Object.is(v, old(b.slice())[a.length - 1 - k]))
function reverseInto(a: number[], b: number[]) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= a.length
  // invariant a.every((v, k) => k >= i || Object.is(v, old(b.slice())[a.length - 1 - k]))${bInvariant ? `\n  // invariant ${bInvariant}` : ""}
  // decreases real(a.length) - real(i)
  while (i < a.length) {
    a[i] = b[a.length - 1 - i];
    i++;
  }
  return i;
}
`;

const incInto = (bInvariant) => `
// requires a.length === b.length
// modifies a
// ensures a.every((v, k) => Object.is(v, old(b.slice())[k] + 1))
function incInto(a: number[], b: number[]) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= a.length
  // invariant a.every((v, k) => k >= i || Object.is(v, old(b.slice())[k] + 1))${bInvariant ? `\n  // invariant ${bInvariant}` : ""}
  // decreases real(a.length) - real(i)
  while (i < a.length) {
    a[i] = b[i] + 1;
    i++;
  }
  return i;
}
`;

export const cases = [
  { name: "old-slice-swap", predicted: { baseline: "verified", prototype: "verified" }, note: "indexed entry contents via old(values.slice()), no callback-local capture",
    source: `
// requires values.length >= 2
// modifies values
// ensures values.every((v, k) => k >= 2 || Object.is(v, old(values.slice())[1 - k]))
// ensures values.every((v, k) => k < 2 || Object.is(v, old(values.slice())[k]))
function swapFirstTwo(values: number[]) {
  const first = values[0];
  values[0] = values[1];
  values[1] = first;
  return 0;
}
` },
  { name: "old-slice-swap-wrong", predicted: { baseline: "counterexample", prototype: "counterexample" }, note: "negative control for the old(slice) spec",
    source: `
// requires values.length >= 2
// modifies values
// ensures values.every((v, k) => k >= 2 || Object.is(v, old(values.slice())[k]))
function swapFirstTwo(values: number[]) {
  const first = values[0];
  values[0] = values[1];
  values[1] = first;
  return 0;
}
` },
  { name: "old-callback-local", predicted: { baseline: "unsupported", prototype: "unsupported" }, note: "old() may not capture the every-callback index",
    source: `
// modifies values
// ensures values.every((v, k) => Object.is(v, old(values[k])))
function keep(values: number[]) {
  return 0;
}
` },
  { name: "fill", predicted: { baseline: "unsupported", prototype: "verified" }, source: fill(FILL_INV) },
  { name: "fill-weak-invariant", predicted: { baseline: "unsupported", prototype: "unknown/induction-gap" }, note: "invariant omits unchanged prefix/suffix",
    source: fill("values.every((v, k) => k < start || k >= i || Object.is(v, x))") },
  { name: "fill-negated-mutant", predicted: { baseline: "unsupported", prototype: "counterexample (confirmed)" }, source: fill(FILL_INV, "values[i] = -x;") },
  { name: "fill-unpermitted-write", predicted: { baseline: "unsupported", prototype: "counterexample frame-write" }, note: "loop writes another array outside modifies",
    source: `
// requires other.length === values.length
// modifies values
// ensures values.every((v) => Object.is(v, 0))
function clearBoth(values: number[], other: number[]) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length
  // invariant values.every((v, k) => k >= i || Object.is(v, 0))
  // decreases real(values.length) - real(i)
  while (i < values.length) {
    values[i] = 0;
    other[i] = 0;
    i++;
  }
  return i;
}
` },
  { name: "alias-inc-into", predicted: { baseline: "unsupported", prototype: "verified" }, note: "a and b may alias; suffix-of-b invariant", source: incInto("b.every((v, k) => k < i || Object.is(v, old(b.slice())[k]))") },
  { name: "alias-inc-into-no-suffix", predicted: { baseline: "unsupported", prototype: "unknown/induction-gap" }, note: "without b suffix the a===b head is havocked; JS is correct under aliasing", source: incInto(null) },
  { name: "alias-reverse-copy", predicted: { baseline: "unsupported", prototype: "counterexample with aliases (or induction-gap if the model picks equal elements)" }, note: "correct only when a and b are distinct",
    source: reverseCopy("b.every((v, k) => Object.is(v, old(b.slice())[k]))") },
  { name: "replace-first-return", predicted: { baseline: "unsupported", prototype: "verified" }, note: "write only on the return path; derived frame stays empty",
    source: `
// modifies values
// ensures result === -1 || Number.isInteger(result) && 0 <= result && result < values.length && Object.is(values[result], y) && Object.is(old(values.slice())[result], x)
// ensures values.every((v, k) => k === result || Object.is(v, old(values.slice())[k]))
// ensures result !== -1 || values.every((v) => !Object.is(v, x))
function replaceFirst(values: number[], x: number, y: number) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length
  // invariant values.every((v, k) => k >= i || !Object.is(v, x))
  // decreases real(values.length) - real(i)
  while (i < values.length) {
    if (Object.is(values[i], x)) {
      values[i] = y;
      return i;
    }
    i++;
  }
  return -1;
}
` },
  { name: "clamp-break-continue", predicted: { baseline: "unsupported", prototype: "verified" }, note: "writes on continue and normal back edges, break exit",
    source: `
// modifies values
// ensures Number.isInteger(result) && 0 <= result && result <= values.length
// ensures values.every((v, k) => k >= result ? Object.is(v, old(values.slice())[k]) : old(values.slice())[k] > 1 ? Object.is(v, 1) : Object.is(v, old(values.slice())[k]))
// ensures result === values.length || Number.isNaN(values[result])
function clampUntilNaN(values: number[]) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length
  // invariant values.every((v, k) => k >= i ? Object.is(v, old(values.slice())[k]) : old(values.slice())[k] > 1 ? Object.is(v, 1) : Object.is(v, old(values.slice())[k]))
  // decreases real(values.length) - real(i)
  for (; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) break;
    if (v > 1) {
      values[i] = 1;
      continue;
    }
  }
  return i;
}
` },
  { name: "record-flag", predicted: { baseline: "unsupported", prototype: "verified" }, note: "record field write in a loop; unwritten nested array contents framed automatically",
    source: `
type Scan = { values: number[]; seen: boolean };
// modifies scan.seen
// ensures scan.seen === (old(scan.seen) || !scan.values.every((v) => !(v < 0)))
function markNegative(scan: Scan) {
  const values = scan.values;
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length
  // invariant scan.seen === (old(scan.seen) || !values.every((v, k) => k >= i || !(v < 0)))
  // decreases real(values.length) - real(i)
  while (i < values.length) {
    if (values[i] < 0) scan.seen = true;
    i++;
  }
  return i;
}
` },
  { name: "pre-loop-write-entry-old", predicted: { baseline: "unsupported", prototype: "verified" }, note: "old() is function entry, not the loop's pre-state; head havoc needs the pre-loop write restated",
    source: `
// requires values.length >= 1
// modifies values
// ensures Object.is(values[0], 7)
// ensures values.every((v, k) => k === 0 || Object.is(v, old(values.slice())[k] * 2))
function headThenDouble(values: number[]) {
  values[0] = 7;
  let i = 1;
  // invariant Number.isInteger(i) && 0 <= i && 1 <= i && i <= values.length && Object.is(values[0], 7)
  // invariant values.every((v, k) => k === 0 || (k < i ? Object.is(v, old(values.slice())[k] * 2) : Object.is(v, old(values.slice())[k])))
  // decreases real(values.length) - real(i)
  while (i < values.length) {
    values[i] = values[i] * 2;
    i++;
  }
  return i;
}
` },
  { name: "pre-loop-write-forgotten", predicted: { baseline: "unsupported", prototype: "unknown/induction-gap" }, note: "same, invariant forgets values[0]",
    source: `
// requires values.length >= 1
// modifies values
// ensures Object.is(values[0], 7)
function headThenDouble(values: number[]) {
  values[0] = 7;
  let i = 1;
  // invariant Number.isInteger(i) && 0 <= i && 1 <= i && i <= values.length
  // invariant values.every((v, k) => k === 0 || k < i || Object.is(v, old(values.slice())[k]))
  // decreases real(values.length) - real(i)
  while (i < values.length) {
    values[i] = values[i] * 2;
    i++;
  }
  return i;
}
` },
  { name: "loop-calls-writer", predicted: { baseline: "unsupported", prototype: "verified" }, note: "footprint-writing scalar helper inside a loop; inclusion and requires from earlier facts",
    source: `
// requires Number.isInteger(k) && 0 <= k && k < values.length
// modifies values
// ensures values.every((v, m) => m === k ? Object.is(v, 0) : Object.is(v, old(values.slice())[m]))
function clearAt(values: number[], k: number) {
  values[k] = 0;
  return 0;
}

// modifies values
// ensures values.every((v) => Object.is(v, 0))
function clearAll(values: number[]) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length
  // invariant values.every((v, k) => k >= i || Object.is(v, 0))
  // decreases real(values.length) - real(i)
  while (i < values.length) {
    clearAt(values, i);
    i++;
  }
  return i;
}
` },
  { name: "loop-call-outside-frame", predicted: { baseline: "unsupported", prototype: "counterexample frame-inclusion" },
    source: `
// requires Number.isInteger(k) && 0 <= k && k < values.length
// modifies values
// ensures Object.is(values[k], 0)
function clearAt(values: number[], k: number) {
  values[k] = 0;
  return 0;
}

// requires other.length === values.length
// modifies values
// ensures Number.isInteger(result)
function clearOther(values: number[], other: number[]) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length
  // decreases real(values.length) - real(i)
  while (i < values.length) {
    clearAt(other, i);
    i++;
  }
  return i;
}
` },
  { name: "write-wrong-rank", predicted: { baseline: "unsupported", prototype: "unknown/induction-gap rank" },
    source: fill(FILL_INV).replace("decreases real(values.length) - real(i)", "decreases real(i)") },
  { name: "excluded-alloc-in-loop", predicted: { baseline: "unsupported", prototype: "unsupported (allocation)" },
    source: `
// modifies values
// ensures Number.isInteger(result)
function copyEach(values: number[]) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i && i <= values.length
  // decreases real(values.length) - real(i)
  while (i < values.length) {
    const t = values.slice();
    values[i] = t.length;
    i++;
  }
  return i;
}
` },
  { name: "excluded-loop-chosen-target", predicted: { baseline: "unsupported", prototype: "unsupported (loop-chosen write target)" },
    source: `
// requires a.length === b.length
// modifies a, b
// ensures Number.isInteger(result)
function alternate(a: number[], b: number[]) {
  let i = 0;
  let left = true;
  // invariant Number.isInteger(i) && 0 <= i && i <= a.length
  // decreases real(a.length) - real(i)
  while (i < a.length) {
    const t = left ? a : b;
    t[i] = 0;
    left = !left;
    i++;
  }
  return i;
}
` },
  { name: "excluded-length-change", predicted: { baseline: "unsupported", prototype: "unsupported (length change)" },
    source: `
// modifies values
// ensures Number.isInteger(result)
function grow(values: number[]) {
  let i = 0;
  // invariant Number.isInteger(i) && 0 <= i
  // decreases real(3) - real(i)
  while (i < 3) {
    values.push(i);
    i++;
  }
  return i;
}
` },
];
