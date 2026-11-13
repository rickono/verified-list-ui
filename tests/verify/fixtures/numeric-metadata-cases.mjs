// Adapted from e581b4134b845b98387ad9f0f92f98d2e9093064:verify/reports/roadmap/judgment-K/scripts/numeric-cases.mjs.
// N21 corrected: === is false for NaN; N21b tests SameValue identity.
// Numeric/index probes for A's int/half shadows. expect "reject" = a native
// counterexample exists among the inputs, so "verified" is a false verification.
const U = (x) => `Number.isInteger(${x}) && 0 <= ${x} && ${x} <= 4294967295`;
const S = (x) => `Number.isSafeInteger(${x}) && 0 <= ${x}`;
const T = 20_000;
const eq1 = (r) => r === 1;
const one = (r) => r >= 1 && r <= 1;
const same0 = (r, [xs]) => Object.is(r, xs[0]);
const wrap = [[[5], 0, 0, 0], [[5], 4294967295, 1, 0]];
const WRAP = `xs.length > 0 && ${U("n")} && ${U("m")} && ${U("k")} && ((n === 0 && m === 0 && k === 0) || (n === 4294967295 && m === 1 && k === 0))`;
export const cases = [
  // Coordinator's safe-integer half-arithmetic challenge and its comparison form.
  { id: "N01-challenge-safe-eq", group: "halves", expect: "reject", timeoutMs: T, inputs: [[0], [1], [9007199254740990], [9007199254740991]], post: eq1,
    source: `// requires ${S("n")}\n// ensures result === 1\nfunction f(n:number) { return ((n/2)+1)-(n/2); }` },
  { id: "N02-challenge-safe-cmp", group: "halves", expect: "reject", timeoutMs: T, inputs: [[0], [9007199254740991]], post: one,
    source: `// requires ${S("n")}\n// ensures result >= 1 && result <= 1\nfunction f(n:number) { return ((n/2)+1)-(n/2); }` },
  { id: "N03-challenge-neg-side", group: "halves", expect: "reject", timeoutMs: T, inputs: [[0], [-1], [-9007199254740991]], post: (r) => r === -1,
    source: `// requires Number.isSafeInteger(n) && n <= 0\n// ensures result === -1\nfunction f(n:number) { return ((n/2)-1)-(n/2); }` },
  { id: "N04-challenge-merge-wide", group: "halves", expect: "reject", timeoutMs: T, inputs: [[9007199254740991, 3, true], [9007199254740991, 3, false]], post: one,
    source: `// requires ${S("n")} && Number.isInteger(m) && 0 <= m && m <= 100\n// ensures result >= 1 && result <= 1\nfunction f(n:number, m:number, flag:boolean) { const z = flag ? n : m; return ((z/2)+1)-(z/2); }` },
  { id: "N05-u32-halves-eq-pos", group: "halves", expect: "verify", timeoutMs: T, inputs: [[0], [1], [4294967295]], post: eq1,
    source: `// requires ${U("n")}\n// ensures result === 1\nfunction f(n:number) { return ((n/2)+1)-(n/2); }` },
  { id: "N06-u32-halves-cmp-pos", group: "halves", expect: "verify", timeoutMs: T, inputs: [[0], [1], [4294967295]], post: one,
    source: `// requires ${U("n")}\n// ensures result >= 1 && result <= 1\nfunction f(n:number) { return ((n/2)+1)-(n/2); }` },
  { id: "N07-int-halves-merge-pos", group: "halves", expect: "verify", timeoutMs: T, inputs: [[7, 3, 1, true], [0, 4294967295, 4294967295, false]], post: one,
    source: `// requires ${U("n")} && ${U("m")} && ${U("k")}\n// ensures result >= 1 && result <= 1\nfunction f(n:number, m:number, k:number, flag:boolean) { const z = flag ? n - k : m - k; return ((z/2)+1)-(z/2); }` },
  { id: "N08-half-signed-zero", group: "halves", expect: "reject", timeoutMs: T, inputs: [[-0], [0], [3]], post: (r) => Object.is(r, 0) || r > 0,
    source: `// requires ${U("x")}\n// ensures Object.is(result, 0) || result > 0\nfunction f(x:number) { return x/2; }` },
  // Width bounds near 2^53 (safe naturals carry no int shadow; FP must decide).
  { id: "N09-sum-sub-safe", group: "width", expect: "reject", timeoutMs: T, inputs: [[1, 2], [9007199254740991, 2]], post: (r, [a]) => r === a,
    source: `// requires ${S("a")} && ${S("b")}\n// ensures result === a\nfunction f(a:number, b:number) { return (a + b) - b; }` },
  { id: "N10-sum-bound-safe", group: "width", expect: "reject", timeoutMs: T, inputs: [[9007199254740991, 1]], post: (r) => r < 9007199254740992,
    source: `// requires ${S("a")} && ${S("b")}\n// ensures result < 9007199254740992\nfunction f(a:number, b:number) { return a + b; }` },
  { id: "N11-mixed-width-exactness", group: "width", expect: "reject", timeoutMs: T, inputs: [[2, 0, 1], [2, 0, 9007199254740991]], post: (r, [a, b]) => r === a - b,
    source: `// requires ${U("a")} && ${U("b")} && ${S("n")}\n// ensures result === a - b\nfunction f(a:number, b:number, n:number) { return ((a - b) + n) - n; }` },
  { id: "N12-mixed-width-eq", group: "width", expect: "reject", timeoutMs: T, inputs: [[2, 0, 1, 0, 9007199254740991]], post: (r) => r === 0,
    source: `// requires ${U("a")} && ${U("b")} && ${U("c")} && ${U("d")} && ${S("n")}\n// ensures result === 0\nfunction f(a:number, b:number, c:number, d:number, n:number) { return ((a - b) + n === (c - d) + n) && a - b !== c - d ? 1 : 0; }` },
  { id: "N13-safe-succ", group: "width", expect: "reject", timeoutMs: T, inputs: [[0], [9007199254740991]], post: (r) => r === true,
    source: `// requires ${S("n")}\n// ensures result\nfunction f(n:number) { return Number.isSafeInteger(n + 1); }` },
  { id: "N14-int-safe-pos", group: "width", expect: "verify", timeoutMs: T, inputs: [[0, 4294967295], [4294967295, 0]], post: (r) => r === true,
    source: `// requires ${U("a")} && ${U("b")}\n// ensures result\nfunction f(a:number, b:number) { return Number.isSafeInteger(a - b); }` },
  { id: "N15-int-chain-pos", group: "width", expect: "verify", timeoutMs: T, inputs: [[4294967295, 0], [0, 4294967295]], post: (r, [a, b]) => r === 8 * (a - b),
    source: `// requires ${U("a")} && ${U("b")}\n// ensures result === 8 * (a - b)\nfunction f(a:number, b:number) { const d = a - b; const e = d + d; const g = e + e; return g + g; }` },
  { id: "N16-u32-succ-pos", group: "width", expect: "verify", timeoutMs: T, inputs: [[0], [4294967295]], post: (r) => r === true,
    source: `// requires ${U("n")}\n// ensures result\nfunction f(n:number) { return Number.isSafeInteger(n + 1) && (n + 1) - 1 === n; }` },
  // Index range guard over modular 32-bit index bits.
  { id: "N17-index-wrap-pos-2p32", group: "index", expect: "reject", timeoutMs: T, inputs: wrap, post: same0,
    source: `// requires ${WRAP}\n// ensures Object.is(result, xs[0])\nfunction f(xs:number[], n:number, m:number, k:number) { return xs[(n + m) - k]; }` },
  { id: "N18-index-wrap-neg-2p32", group: "index", expect: "reject", timeoutMs: T, inputs: wrap, post: same0,
    source: `// requires ${WRAP}\n// ensures Object.is(result, xs[0])\nfunction f(xs:number[], n:number, m:number, k:number) { return xs[k - (n + m)]; }` },
  { id: "N19-store-wrap-2p32", group: "index", expect: "reject", timeoutMs: T, inputs: wrap, post: (_r, [xs]) => xs[0] === 1,
    source: `// requires ${WRAP}\n// modifies xs\n// ensures xs[0] === 1\nfunction f(xs:number[], n:number, m:number, k:number) { xs[(n + m) - k] = 1; return 0; }` },
  { id: "N20-index-predecessor", group: "index", expect: "reject", timeoutMs: T, inputs: [[[5, 6], 0], [[5, 6], 1]], post: (r, [xs, i]) => Object.is(r, i === 0 ? xs[0] : xs[i - 1]),
    source: `// requires xs.length > 0 && Number.isInteger(i) && 0 <= i && i < xs.length\n// ensures Object.is(result, i === 0 ? xs[0] : xs[i - 1])\nfunction f(xs:number[], i:number) { return xs[i - 1]; }` },
  { id: "N21-index-int-pos", group: "index", expect: "reject", timeoutMs: T, inputs: [[[5, 6, 7], 2, 1], [[NaN], 0, 0]], post: (r, [xs, n, m]) => r === xs[n - m],
    source: `// requires ${U("n")} && ${U("m")} && m <= n && n - m < xs.length\n// ensures result === xs[n - m]\nfunction f(xs:number[], n:number, m:number) { return xs[(n + 1) - (m + 1)]; }` },
  ...[["2p32", "4294967296"], ["neg2p32", "-4294967296"], ["2p53", "9007199254740992"], ["2p64", "18446744073709551616"], ["half", "0.5"], ["inf", "1/0"], ["u32max", "4294967295"]]
    .map(([tag, x]) => ({ id: `N22-index-fp-${tag}`, group: "index", expect: "reject", timeoutMs: T, inputs: [[[5], 0], [[5], Function(`return ${x}`)()]], post: same0,
      source: `// requires xs.length > 0 && (k === 0 || k === ${x})\n// ensures Object.is(result, xs[0])\nfunction f(xs:number[], k:number) { return xs[k]; }` })),
  { id: "N23-index-fp-nan", group: "index", expect: "reject", timeoutMs: T, inputs: [[[5], 0], [[5], NaN]], post: same0,
    source: `// requires xs.length > 0 && (k === 0 || Number.isNaN(k))\n// ensures Object.is(result, xs[0])\nfunction f(xs:number[], k:number) { return xs[k]; }` },
  { id: "N24-index-negzero-pos", group: "index", expect: "verify", timeoutMs: T, inputs: [[[5], -0], [[NaN], -0]], post: same0,
    source: `// requires xs.length > 0 && Object.is(k, -0)\n// ensures Object.is(result, xs[0])\nfunction f(xs:number[], k:number) { return xs[k]; }` },
  { id: "N25-store-u32max", group: "index", expect: "reject", timeoutMs: T, inputs: [[[0], 0], [[0], 4294967295]], post: (_r, [xs]) => xs[0] === 1,
    source: `// requires xs.length > 0 && (k === 0 || k === 4294967295)\n// modifies xs\n// ensures xs[0] === 1\nfunction f(xs:number[], k:number) { xs[k] = 1; return 0; }` },
  // Object.is vs numerical equality (signed zero).
  { id: "N26-mul-zero-is", group: "zero", expect: "reject", timeoutMs: T, inputs: [[3], [-3]], post: (r) => Object.is(r, 0),
    source: `// requires Number.isInteger(x)\n// ensures Object.is(result, 0)\nfunction f(x:number) { return x * 0; }` },
  { id: "N27-neg-zero-is", group: "zero", expect: "reject", timeoutMs: T, inputs: [[0], [-0]], post: (r) => Object.is(r, 0),
    source: `// requires x === 0\n// ensures Object.is(result, 0)\nfunction f(x:number) { return -x; }` },
  { id: "N28-neg-zero-eq-pos", group: "zero", expect: "verify", timeoutMs: T, inputs: [[0], [-0]], post: (r) => r === 0,
    source: `// requires x === 0\n// ensures result === 0\nfunction f(x:number) { return -x; }` },
  { id: "N29-sub-zero-is", group: "zero", expect: "reject", timeoutMs: T, inputs: [[0], [-0]], post: (r) => Object.is(r, 0),
    source: `// requires x === 0\n// ensures Object.is(result, 0)\nfunction f(x:number) { return x - 0; }` },
  { id: "N30-self-sub-is-pos", group: "zero", expect: "verify", timeoutMs: T, inputs: [[3], [-0], [0]], post: (r) => Object.is(r, 0),
    source: `// requires Number.isInteger(x)\n// ensures Object.is(result, 0)\nfunction f(x:number) { return x - x; }` },
  { id: "N31-zero-sub-is-pos", group: "zero", expect: "verify", timeoutMs: T, inputs: [[0], [-0]], post: (r) => Object.is(r, 0),
    source: `// requires x === 0\n// ensures Object.is(result, 0)\nfunction f(x:number) { return 0 - x; }` },
  { id: "N32-nat-roundtrip-is", group: "zero", expect: "reject", timeoutMs: T, inputs: [[-0], [0], [7]], post: (r, [x]) => Object.is(r, x),
    source: `// requires ${U("x")}\n// ensures Object.is(result, x)\nfunction f(x:number) { return (x + 1) - 1; }` },
  { id: "N33-nat-roundtrip-eq-pos", group: "zero", expect: "verify", timeoutMs: T, inputs: [[-0], [0], [7]], post: (r, [x]) => r === x,
    source: `// requires ${U("x")}\n// ensures result === x\nfunction f(x:number) { return (x + 1) - 1; }` },
  { id: "N34-int-roundtrip-is", group: "zero", expect: "reject", timeoutMs: T, inputs: [[-0, 0], [0, 0], [7, 3]], post: (r, [x]) => Object.is(r, x),
    source: `// requires ${U("x")} && ${U("y")}\n// ensures Object.is(result, x)\nfunction f(x:number, y:number) { return (x - y) + y; }` },
  { id: "N35-int-roundtrip-eq-pos", group: "zero", expect: "verify", timeoutMs: T, inputs: [[-0, 0], [0, 0], [7, 3]], post: (r, [x]) => r === x,
    source: `// requires ${U("x")} && ${U("y")}\n// ensures result === x\nfunction f(x:number, y:number) { return (x - y) + y; }` },
  // NaN / infinity / presence.
  { id: "N36-nan-inf-self-sub", group: "nan", expect: "reject", timeoutMs: T, inputs: [[3], [NaN], [Infinity]], post: (r) => Number.isInteger(r),
    source: `// ensures Number.isInteger(result)\nfunction f(x:number) { return x - x; }` },
  { id: "N37-finite-self-sub-pos", group: "nan", expect: "verify", timeoutMs: T, inputs: [[3], [0.5]], post: (r) => Number.isInteger(r),
    source: `// requires Number.isFinite(x)\n// ensures Number.isInteger(result)\nfunction f(x:number) { return x - x; }` },
  { id: "N38-range-not-integer", group: "nan", expect: "reject", timeoutMs: T, inputs: [[0.5], [3]], post: (r) => r === true,
    source: `// requires 0 <= x && x <= 10\n// ensures result\nfunction f(x:number) { return Number.isInteger(x); }` },
  { id: "N39-absent-int-merge", group: "nan", expect: "reject", timeoutMs: T, inputs: [[3, 1, true], [3, 1, false]], post: (r) => Number.isInteger(r),
    source: `// requires ${U("n")} && ${U("m")}\n// ensures Number.isInteger(result)\nfunction f(n:number, m:number, flag:boolean) { const v = flag ? n - m : undefined; return v; }` },
  { id: "N40-absent-nat-merge", group: "nan", expect: "reject", timeoutMs: T, inputs: [[3, true], [3, false]], post: (r) => Number.isInteger(r),
    source: `// requires ${U("n")}\n// ensures Number.isInteger(result)\nfunction f(n:number, flag:boolean) { const v = flag ? n : undefined; return v; }` },
  { id: "N41-optional-field", group: "nan", expect: "reject", timeoutMs: T, inputs: [[{ x: 3 }], [{}]], post: (r) => Number.isInteger(r),
    source: `// ensures Number.isInteger(result)\nfunction f(a:{x?:number}) { return a.x; }` },
];

const n21 = cases.find((c) => c.id === "N21-index-int-pos");
cases.push({ ...n21, id: "N21b-index-int-pos", expect: "verify",
  source: n21.source.replace("result === xs[n - m]", "Object.is(result, xs[n - m])"),
  post: (r, [xs, n, m]) => Object.is(r, xs[n - m]) });
