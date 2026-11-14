// @environment
// resolves result === 1
// rejects
// abort advisory signal
declare function lookup(q: number, signal: AbortSignal): Promise<number>;
let disposed = false;
let shown = 0;
// state shown === 0 || shown === 1
// always !old(disposed) || shown === old(shown)
export async function search(q: number, signal: AbortSignal) {
  const value = await lookup(q, signal);
  if (disposed || signal.aborted) return;
  shown = value;
}
export function dispose(controller: AbortController) {
  disposed = true;
  controller.abort();
}
