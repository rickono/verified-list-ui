// @environment
// resolves false
// settles eventually
declare function op(): Promise<number>;
let n = 0;
// state n >= 0
// leads work completes
export async function work() { await op(); n = 1; }
