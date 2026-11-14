type Box = { value: number };
// ensures true
function host(box: Box, n: number) { const cb = (v: number): boolean => (box.value = v) === v; return cb(n); }