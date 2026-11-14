// p1-guard.ts
// @environment
// protocol event-target
// event "input"
// delivers Number.isFinite(value)
declare const input: EventTarget;
let shown = 0;
let open = 1;
// state Number.isFinite(shown)
// state open === 0 || open === 1
// always open === 1 || shown === old(shown)
const onValue = (value: number) => { if (open === 1) shown = value; };
export function start() { input.addEventListener("input", onValue); }
export function stop() { open = 0; }
