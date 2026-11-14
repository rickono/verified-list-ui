// ensures true
function effect(x: number) { const box = {value: x}; return box.value > 0; }
// ensures true
function host(n: number) { const cb = (v: number): boolean => effect(v); return cb(n); }