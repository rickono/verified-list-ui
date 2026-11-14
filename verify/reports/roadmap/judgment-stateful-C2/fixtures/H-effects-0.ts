// ensures true
function host(n: number) { const cell = 1; const cb = (v: number): boolean => v > cell; return cb(n); }