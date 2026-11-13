// Latest-wins search box. Every call issues a lookup; only the response to the
// most recent request may be displayed.

// @environment
// resolves Number.isFinite(result)
declare function lookup(query: number): Promise<number>;

let latest = 0;
let shownFor = 0;
let shown = 0;


export async function search(query: number) {
  const id: number = latest + 1;
  latest = id;
  // pending 1 <= id && id <= latest
  const value = await lookup(query);
  if (id !== latest) return;
  shownFor = id;
  shown = value;
}
