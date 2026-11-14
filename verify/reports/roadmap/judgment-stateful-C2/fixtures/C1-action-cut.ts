let x = 0;
// state 0 <= x && x <= 2
// always x - old(x) <= 1
export function pair() { if (x < 2) x = x + 1; if (x < 2) x = x + 1; }
