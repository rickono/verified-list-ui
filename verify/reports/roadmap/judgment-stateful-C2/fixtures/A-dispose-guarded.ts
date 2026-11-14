// C1 seam only: primitive disposal safety; no cancellation or event protocol.
// @environment
// resolves result === 1
// rejects
declare function lookup(query: number): Promise<number>;
let disposed = false;
let shown = 0;
// state shown === 0 || shown === 1
// always !old(disposed) || shown === old(shown)
export async function search(query: number) {
  const snapshot: number = shown;
  // pending snapshot === 0 || snapshot === 1
  const value = await lookup(query);
  if (disposed) return;
  shown = value;
}
export function dispose() {
  disposed = true;
}
