// @environment
declare function op(): Promise<number>;
let x = 0;
// state x === 0
export async function entry() { await op(); for (;;) {} }