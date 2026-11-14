// @environment
// protocol node22-event-target-v1
declare const events: EventTarget;
let disposed = false;
let shown = 0;
// state shown === 0 || shown === 1
// always !old(disposed) || shown === old(shown)
export function bind() {
  const value: number = 1;
  const handler = () => { if (!disposed) shown = value; };
  events.addEventListener("x", handler);
  events.addEventListener("x", handler);
  return () => events.removeEventListener("x", handler);
}
export function dispose() { disposed = true; }
