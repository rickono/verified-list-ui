let shown = 0;
// state shown === 0
export function bind() {
  const target = new EventTarget();
  const handler = () => { shown = 1; };
  target.addEventListener("x", handler);
  target.removeEventListener("x", handler);
}
