// @environment
// resolves Number.isFinite(result)
// rejects
// settles eventually
declare function op(): Promise<number>;
let n = 0;
// state n >= 0
// fairness resumptions weak
// leads work completes
export async function work() {
  // pending n >= 0
  const a = await op();
  if (a === 0) return;
  n = 1;
}
