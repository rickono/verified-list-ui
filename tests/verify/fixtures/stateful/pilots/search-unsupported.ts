// Latest-wins search box with a conditional request. The await sits inside a
// branch, which the first subset rejects.

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
  if (query > 0) {
    const value = await lookup(query);
    if (id !== latest) return;
    shownFor = id;
    shown = value;
  }
}
