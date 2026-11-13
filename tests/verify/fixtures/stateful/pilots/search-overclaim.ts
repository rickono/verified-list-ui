// Stale-response bug hidden behind an overclaiming pending invariant: it says
// every pending lookup is the latest one. Interference units must refute this.

// @environment
// resolves Number.isFinite(result)
declare function lookup(query: number): Promise<number>;

let latest = 0;
let shownFor = 0;
let shown = 0;

// state 0 <= shownFor && shownFor <= latest
// state Number.isFinite(shown)
// always shownFor >= old(shownFor)

export async function search(query: number) {
  const id: number = latest + 1;
  latest = id;
  // pending id === latest
  const value = await lookup(query);
  shownFor = id;
  shown = value;
}
