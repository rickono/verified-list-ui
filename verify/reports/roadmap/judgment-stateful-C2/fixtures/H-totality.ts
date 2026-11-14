// ensures result === fn(x)
function applyPredicate(fn: (value: number) => boolean, x: number) { return fn(x); }
// requires x > 0
// ensures result === (x > 1)
function big(x: number) { return x > 1; }
// ensures true
function caller() { return applyPredicate(big, 1); }
