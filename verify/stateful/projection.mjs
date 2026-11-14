// Internal typed terms only. Source expressions still use source.mjs. These
// maps describe protocol identities, never JavaScript Numbers or user tables.
export const sorts = ["target", "event", "closure", "registration", "invocation", "request", "controller", "signal"];
export const variable = (name, sort) => ({ kind: "variable", name, sort });
export const constant = (value) => ({ kind: "constant", value, sort: "boolean" });
export const equal = (a, b) => ({ kind: "equal", a, b, sort: "boolean" });
export const choose = (test, yes, no) => ({ kind: "choose", test, yes, no, sort: yes.sort });
export const all = (...args) => ({ kind: "and", args, sort: "boolean" });
export const neg = (arg) => ({ kind: "not", arg, sort: "boolean" });
export const implies = (a, b) => ({ kind: "or", args: [neg(a), b], sort: "boolean" });
export const map = (name, inputs, output) => ({ name, inputs, output });
export const read = (fn, ...args) => ({ kind: "read", fn, args, sort: fn.output });
export const update = (fn, key, value) => (...args) => choose(all(...args.map((a, i) => equal(a, key[i]))), value, typeof fn === "function" ? fn(...args) : read(fn, ...args));
export const projection = (term, at) => ({ type: "StatefulProjection", term, start: at.start, end: at.end });
