// @environment
// resolves Number.isFinite(result)
// rejects
// settles eventually
declare function op(): Promise<number>;
// @environment
// resolves false
// settles eventually
declare function unused(): Promise<number>;
let n = 0;
// state n >= 0
// fairness resumptions weak
// leads work completes
// leads disturb completes
export async function work() {
  // pending n >= 0
  const a: number = await op();
  n = 1;
  // pending n >= 0
  const b: number = await op();
  if (a === 0) { if (b === 0) return; }
  n = 2;
}
export function disturb() { n = 3; }
