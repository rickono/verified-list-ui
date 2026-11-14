// @environment
// resolves Number.isFinite(result)
// rejects
// abort advisory
declare function lookup(query: number, signal: AbortSignal): Promise<number>;
let shown = 0;
// state Number.isFinite(shown)
export async function search(query: number) {
  const controller = new AbortController();
  const value = await lookup(query, controller.signal);
  shown = value;
}
