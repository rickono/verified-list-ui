// @environment
// resolves Number.isFinite(result)
// settles eventually
declare function op(): Promise<number>;
let latest = 9007199254740991;
// state true
// leads work completes
export async function work() {
  const id: number = latest + 1;
  latest = id;
  await op();
}
