// Judge variant: a count property over unboundedly many activations.

// @environment
// resolves Number.isFinite(result)
declare function fetchResult(q: number): Promise<number>;

let inflight = 0;
let shown = 0;

// state 0 <= inflight
export async function search(q: number) {
  inflight = inflight + 1;
  // pending 1 <= inflight
  const r = await fetchResult(q);
  inflight = inflight - 1;
  shown = r;
}
