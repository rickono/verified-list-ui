// Imported from e581b413:verify/reports/roadmap/judgment-K/scripts/heap-cases.mjs; original authorship retained.
// Heap/loop probes. expect: "reject" = must not verify (native violation exists),
// "verify" = sound positive control, "unsupported" = shape outside the slice.
// post(result, argsAfter, argsBefore) evaluates the ensures (or frame) natively.
const R = "// requires Number.isInteger(n) && 0 <= n && n <= 2\n";
const INV = "  // invariant Number.isInteger(i) && 0 <= i && i <= n\n  // decreases real(n)-real(i)\n";
const ns = [[0], [1], [2]];
const zero = (r) => r === 0;
export const cases = [
  // Coordinator's three cases, verbatim.
  { id: "H01-fresh-array", group: "coordinator", expect: "reject", inputs: ns, post: zero, source: `// requires Number.isInteger(n) && 0 <= n && n <= 2
// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n
  // decreases real(n)-real(i)
  while(i<n) {xs[0]=1; i++;}
  return xs[0];
}` },
  { id: "H02-fresh-record", group: "coordinator", expect: "reject", inputs: ns, post: zero, source: `// requires Number.isInteger(n) && 0 <= n && n <= 2
// ensures result === 0
function f(n:number) {
  const box={x:0}; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n
  // decreases real(n)-real(i)
  while(i<n) {box.x=1; i++;}
  return box.x;
}` },
  { id: "H03-fresh-array-boolean", group: "coordinator", expect: "reject", inputs: [[false], [true]], post: zero, source: `// ensures result === 0
function f(flag:boolean) {
  const xs=[0]; const n=flag?1:0; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n
  // decreases real(n)-real(i)
  while(i<n) {xs[0]=1; i++;}
  return xs[0];
}` },
  // Positive controls for the same shapes.
  { id: "H04-fresh-array-pos", group: "fresh", expect: "verify", inputs: ns, post: (r, [n]) => r === (n > 0 ? 1 : 0), source: `${R}// ensures result === (n > 0 ? 1 : 0)
function f(n:number) {
  const xs=[0]; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && xs[0] === (i > 0 ? 1 : 0)
  // decreases real(n)-real(i)
  while(i<n) {xs[0]=1; i++;}
  return xs[0];
}` },
  { id: "H05-fresh-record-pos", group: "fresh", expect: "verify", inputs: ns, post: (r, [n]) => r === (n > 0 ? 1 : 0), source: `${R}// ensures result === (n > 0 ? 1 : 0)
function f(n:number) {
  const box={x:0}; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && box.x === (i > 0 ? 1 : 0)
  // decreases real(n)-real(i)
  while(i<n) {box.x=1; i++;}
  return box.x;
}` },
  { id: "H06-alias-local", group: "alias", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; const ys=xs; let i=0;
${INV}  while(i<n) {ys[0]=1; i++;}
  return xs[0];
}` },
  { id: "H07-alias-param", group: "alias", expect: "reject",
    inputs: [() => { const a = [0]; return [a, a, 1]; }, [[0], [0], 1], [[0], [0], 0]],
    post: (r, _after, before) => Object.is(r, before[1][0]), source: `// requires a.length > 0 && b.length > 0 && Number.isInteger(n) && 0 <= n && n <= 2
// modifies a
// ensures Object.is(result, old(b[0]))
function f(a:number[], b:number[], n:number) {
  let i=0;
${INV}  while(i<n) {a[0]=1; i++;}
  return b[0];
}` },
  { id: "H08-alias-param-pos", group: "alias", expect: "verify",
    inputs: [() => { const a = [0]; return [a, a, 1]; }, [[0], [0], 1], [[5], [7], 0], () => { const a = [3]; return [a, a, 0]; }],
    post: (r, [a, b, n], before) => Object.is(r, n > 0 && a === b ? 1 : before[1][0]), source: `// requires a.length > 0 && b.length > 0 && Number.isInteger(n) && 0 <= n && n <= 2
// modifies a
// ensures Object.is(result, n > 0 && a === b ? 1 : old(b[0]))
function f(a:number[], b:number[], n:number) {
  const a0 = a[0]; const b0 = b[0]; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && (i === 0 ? Object.is(a[0], a0) && Object.is(b[0], b0) : a[0] === 1 && (a === b || Object.is(b[0], b0)))
  // decreases real(n)-real(i)
  while(i<n) {a[0]=1; i++;}
  return b[0];
}` },
  { id: "H09-seq-copy", group: "sequential", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; const ys=[0]; let i=0;
${INV}  while(i<n) {xs[0]=1; i++;}
  let j=0;
  // invariant Number.isInteger(j) && 0 <= j && j <= n
  // decreases real(n)-real(j)
  while(j<n) {ys[0]=xs[0]; j++;}
  return ys[0];
}` },
  { id: "H10-seq-first-write", group: "sequential", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; const ys=[0]; let i=0;
${INV}  while(i<n) {xs[0]=1; i++;}
  let j=0;
  // invariant Number.isInteger(j) && 0 <= j && j <= n
  // decreases real(n)-real(j)
  while(j<n) {ys[0]=1; j++;}
  return xs[0];
}` },
  { id: "H11-seq-frame-pos", group: "sequential", expect: "verify", inputs: ns, post: (r, [n]) => r === (n > 0 ? 1 : 0), source: `${R}// ensures result === (n > 0 ? 1 : 0)
function f(n:number) {
  const xs=[0]; const ys=[0]; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && xs[0] === (i > 0 ? 1 : 0)
  // decreases real(n)-real(i)
  while(i<n) {xs[0]=1; i++;}
  let j=0;
  // invariant Number.isInteger(j) && 0 <= j && j <= n
  // decreases real(n)-real(j)
  while(j<n) {ys[0]=2; j++;}
  return xs[0];
}` },
  { id: "H12-nested", group: "sequential", expect: "unsupported", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {
    let j=0;
    // invariant Number.isInteger(j) && 0 <= j && j <= n
    // decreases real(n)-real(j)
    while(j<n) {xs[0]=1; j++;}
    i++;
  }
  return xs[0];
}` },
  { id: "H13-branch-flag", group: "branch", expect: "reject", inputs: [[1, true], [1, false], [2, true]], post: zero, source: `${R}// ensures result === 0
function f(n:number, flag:boolean) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {if (flag) xs[0]=1; i++;}
  return xs[0];
}` },
  { id: "H14-false-guard", group: "branch", expect: "no-false-verify", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {if (false) xs[0]=1; i++;}
  return xs[0];
}` },
  { id: "H15-short-circuit", group: "branch", expect: "reject", inputs: [[1, true], [1, false]], post: zero, source: `${R}// ensures result === 0
function f(n:number, flag:boolean) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {flag && ((xs[0]=1) > 0); i++;}
  return xs[0];
}` },
  { id: "H16-ternary-write", group: "branch", expect: "reject", inputs: [[1, true], [1, false]], post: zero, source: `${R}// ensures result === 0
function f(n:number, flag:boolean) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {const t = flag ? (xs[0]=1) : 0; i++;}
  return xs[0];
}` },
  { id: "H17-break-write", group: "exits", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {if (i === 0) {xs[0]=1; break;} i++;}
  return xs[0];
}` },
  { id: "H18-continue-write", group: "exits", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {i++; if (i > 0) {xs[0]=1; continue;} xs[0]=0;}
  return xs[0];
}` },
  { id: "H19-return-prev-iteration", group: "exits", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {if (i === 1) return xs[0]; xs[0]=1; i++;}
  return 0;
}` },
  { id: "H20-return-write", group: "exits", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {xs[0]=1; if (i === 0) return xs[0]; i++;}
  return 0;
}` },
  { id: "H21-for-update-write", group: "exits", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0];
${INV}  for (let i=0; i<n; i = (xs[0] = i + 1)) {}
  return xs[0];
}` },
  { id: "H22-test-write", group: "exits", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while((xs[0] = i) < n) {i++;}
  return xs[0];
}` },
  { id: "H23-call-writer-fresh", group: "calls", expect: "reject", inputs: ns, post: zero, source: `// requires xs.length > 0
// modifies xs
// ensures xs[0] === 1
function poke(xs:number[]) { xs[0] = 1; return 0; }
${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {poke(xs); i++;}
  return xs[0];
}` },
  { id: "H24-call-writer-param", group: "calls", expect: "reject", inputs: [[[0], 1], [[0], 0]], post: (_r, [a], [b]) => Object.is(a[0], b[0]), source: `// requires xs.length > 0
// modifies xs
// ensures xs[0] === 1
function poke(xs:number[]) { xs[0] = 1; return 0; }
// requires a.length > 0 && Number.isInteger(n) && 0 <= n && n <= 2
// modifies a
// ensures Object.is(a[0], old(a[0]))
function f(a:number[], n:number) {
  let i=0;
${INV}  while(i<n) {poke(a); i++;}
  return 0;
}` },
  { id: "H25-call-in-test", group: "calls", expect: "reject", inputs: ns, post: zero, source: `// requires xs.length > 0
// modifies xs
// ensures xs[0] === 1 && result === 0
function poke(xs:number[]) { xs[0] = 1; return 0; }
${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n && poke(xs) === 0) {i++;}
  return xs[0];
}` },
  { id: "H26-call-in-update", group: "calls", expect: "reject", inputs: ns, post: zero, source: `// requires xs.length > 0
// modifies xs
// ensures xs[0] === 1 && result === 0
function poke(xs:number[]) { xs[0] = 1; return 0; }
${R}// ensures result === 0
function f(n:number) {
  const xs=[0];
${INV}  for (let i=0; i<n; i = i + 1 + poke(xs)) {}
  return xs[0];
}` },
  { id: "H27-frame-write-unlisted", group: "permission", expect: "reject", inputs: [[[0], 1]], post: (_r, [a], [b]) => Object.is(a[0], b[0]), source: `// requires a.length > 0 && Number.isInteger(n) && 0 <= n && n <= 2
// ensures true
function f(a:number[], n:number) {
  let i=0;
${INV}  while(i<n) {a[0]=1; i++;}
  return true;
}` },
  { id: "H28-frame-alias-permission", group: "permission", expect: "reject", inputs: [[{ x: 0 }, { x: 0 }, 1]], post: (_r, [a, b], [, b0]) => a === b || b.x === b0.x, source: `// requires Number.isInteger(n) && 0 <= n && n <= 2
// modifies a.x
// ensures true
function f(a:{x:number}, b:{x:number}, n:number) {
  let i=0;
${INV}  while(i<n) {b.x=1; i++;}
  return true;
}` },
  { id: "H29-frame-mixed-pos", group: "permission", expect: "verify", inputs: [[[0], 0], [[0], 1], [[0], 2]], post: (r, [, n]) => r === (n > 0 ? 2 : 0), source: `// requires a.length > 0 && Number.isInteger(n) && 0 <= n && n <= 2
// modifies a
// ensures result === (n > 0 ? 2 : 0)
function f(a:number[], n:number) {
  const xs=[0]; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && (i === 0 ? xs[0] === 0 : xs[0] === 2 && a[0] === 1)
  // decreases real(n)-real(i)
  while(i<n) {a[0]=1; xs[0]=2; i++;}
  return xs[0];
}` },
  { id: "H30-loop-chosen-target", group: "targets", expect: "unsupported", inputs: [[[0], [0], 1]], post: () => true, source: `// requires a.length > 0 && b.length > 0 && Number.isInteger(n) && 0 <= n && n <= 2
// modifies a
// modifies b
// ensures true
function f(a:number[], b:number[], n:number) {
  let i=0;
${INV}  while(i<n) {(i === 0 ? a : b)[0]=1; i++;}
  return true;
}` },
  { id: "H31-preloop-ternary-target", group: "targets", expect: "reject", inputs: [[1, true], [1, false]], post: zero, source: `${R}// ensures result === 0
function f(n:number, flag:boolean) {
  const xs=[0]; const ys=[0]; const t = flag ? xs : ys; let i=0;
${INV}  while(i<n) {t[0]=1; i++;}
  return xs[0];
}` },
  { id: "H32-loop-alloc", group: "targets", expect: "unsupported", inputs: ns, post: () => true, source: `${R}// ensures result === 0
function f(n:number) {
  let i=0;
${INV}  while(i<n) {const ys=[1]; i++;}
  return 0;
}` },
  { id: "H33-invariant-init", group: "cutpoint", expect: "reject", inputs: ns, post: (r) => r === 1, source: `${R}// ensures result === 1
function f(n:number) {
  const xs=[0]; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && xs[0] === 1
  // decreases real(n)-real(i)
  while(i<n) {xs[0]=1; i++;}
  return xs[0];
}` },
  { id: "H34-invariant-preserve", group: "cutpoint", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= n && xs[0] === 0
  // decreases real(n)-real(i)
  while(i<n) {xs[0]=1; i++;}
  return xs[0];
}` },
  { id: "H35-frame-precision-pos", group: "cutpoint", expect: "verify", inputs: ns, post: (r) => r === 5, source: `${R}// ensures result === 5
function f(n:number) {
  const xs=[0]; const ys=[5]; let i=0;
${INV}  while(i<n) {xs[0]=1; i++;}
  return ys[0];
}` },
  { id: "H36-index-write", group: "index", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0,0,0]; let i=0;
${INV}  while(i<n) {xs[i]=1; i++;}
  return xs[0];
}` },
  { id: "H37-index-write-growth", group: "index", expect: "reject", inputs: ns, post: (r) => r === 1, source: `${R}// ensures result === 1
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {xs[i]=1; i++;}
  return xs.length;
}` },
  { id: "H38-index-every-pos", group: "index", expect: "verify", inputs: [[[0, 0, 0]], [[5]], [[]]], post: (r, [xs]) => xs.every((v) => v === 1), source: `// modifies xs
// ensures xs.every((v) => v === 1)
function f(xs:number[]) {
  let i=0;
  // invariant Number.isInteger(i) && 0 <= i && i <= xs.length && xs.every((v, k) => k >= i || v === 1)
  // decreases real(xs.length)-real(i)
  while(i<xs.length) {xs[i]=1; i++;}
  return true;
}` },
  { id: "H39-old-in-loop", group: "old", expect: "reject", inputs: [[[0], 1], [[0], 0]], post: (_r, [a], [b]) => Object.is(a[0], b[0]), source: `// requires a.length > 0 && Number.isInteger(n) && 0 <= n && n <= 2
// modifies a
// ensures Object.is(a[0], old(a[0]))
function f(a:number[], n:number) {
  let i=0;
${INV}  while(i<n) {a[0]=1; i++;}
  return 0;
}` },
  { id: "H40-nested-field-param", group: "old", expect: "reject", inputs: [[{ items: [0] }, 1]], post: (_r, [box], [b]) => Object.is(box.items[0], b.items[0]), source: `// requires box.items.length > 0 && Number.isInteger(n) && 0 <= n && n <= 2
// modifies box.items
// ensures Object.is(box.items[0], old(box.items[0]))
function f(box:{items:number[]}, n:number) {
  let i=0;
${INV}  while(i<n) {box.items[0]=1; i++;}
  return 0;
}` },
  { id: "H41-do-while", group: "shape", expect: "unsupported", inputs: ns, post: () => true, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  do {xs[0]=1; i++;} while(i<n);
  return 0;
}` },
  { id: "H42-compound-write", group: "shape", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const xs=[0]; let i=0;
${INV}  while(i<n) {xs[0] += 1; i++;}
  return xs[0];
}` },
  { id: "H43-increment-write", group: "shape", expect: "reject", inputs: ns, post: zero, source: `${R}// ensures result === 0
function f(n:number) {
  const box={x:0}; let i=0;
${INV}  while(i<n) {box.x++; i++;}
  return box.x;
}` },
];
