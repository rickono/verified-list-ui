// @environment
// resolves q > 0 && result > 0
// settles eventually
declare function op(q: number): Promise<number>;
let n = 0;
// state n >= 0
// leads work completes
export async function work(q: number) { await op(q); n = 1; }
