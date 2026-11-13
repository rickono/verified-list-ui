// Heap transport has one schema. SMT encoding stays in heap.mjs; this boundary
// validates graphs and interns identities before any source execution.
const id = (x) => typeof x === "string" && /^(0|[1-9][0-9]*)$/.test(x);
const num = (x) => typeof x === "string" && /^[0-9a-f]{16}$/.test(x);
const boolean = (x) => x === "true" || x === "false";
const tuple = (v, nodes) => Array.isArray(v) && (v[0] === "num" ? v.length === 2 && num(v[1])
  : v[0] === "bool" ? v.length === 2 && boolean(v[1]) : v[0] === "ref" ? v.length === 2 && id(v[1]) && Object.hasOwn(nodes, v[1]) : v[0] === "undef" && v.length === 1);

export function validHeap(plan, raw, limit) {
  if (!raw || !Array.isArray(raw.roots) || raw.roots.length !== plan.types.length || !raw.roots.every(id)) return false;
  const nodes = raw.nodes;
  if (!nodes || typeof nodes !== "object" || Array.isArray(nodes) || Object.keys(nodes).length > limit) return false;
  for (const [key, node] of Object.entries(nodes)) {
    if (!id(key) || !node || typeof node !== "object") return false;
    if (node.kind === "array") {
      if (!["number", "boolean"].includes(node.element) || !Array.isArray(node.values) || node.values.length > limit || !node.values.every((v) => tuple(v, nodes) && v[0] !== "ref")) return false;
    } else if (node.kind !== "object" || !node.fields || typeof node.fields !== "object" || Array.isArray(node.fields) ||
      !Object.entries(node.fields).every(([k, v]) => plan.keys.includes(k) && k !== "__proto__" && tuple(v, nodes))) return false;
  }
  const seen = new Set(), visited = new Set();
  const value = (type, v) => {
    if (type?.kind === "optional") return v[0] === "undef" || value(type.type, v);
    if (typeof type === "string") return v[0] === ({ number: "num", boolean: "bool", undefined: "undef" })[type];
    return v[0] === "ref" && reference(type, v[1]);
  };
  const reference = (type, key) => {
    const node = nodes[key];
    if (!node || type.kind !== node.kind) return false;
    const token = JSON.stringify([type, key]);
    if (seen.has(token)) return true;
    seen.add(token); visited.add(key);
    if (type.kind === "array") return (!node.values.length || type.element === node.element) && node.values.every((v) => type.allowUndefined && v[0] === "undef" || value(type.element, v));
    return Object.keys(node.fields).every((k) => type.fields.some((f) => f.name === k)) &&
      type.fields.every((f) => Object.hasOwn(node.fields, f.name) ? value(f.type, node.fields[f.name]) : f.optional);
  };
  return raw.roots.every((key, i) => reference(plan.types[i], key)) && visited.size === Object.keys(nodes).length;
}

export function materializeHeap(raw) {
  const objects = new Map(Object.entries(raw.nodes).map(([id, node]) => [id, node.kind === "array" ? [] : {}]));
  const read = (v) => v[0] === "num" ? Buffer.from(v[1], "hex").readDoubleBE() : v[0] === "bool" ? v[1] === "true" : v[0] === "ref" ? objects.get(v[1]) : undefined;
  for (const [id, node] of Object.entries(raw.nodes)) {
    const object = objects.get(id);
    if (node.kind === "array") node.values.forEach((v) => object.push(read(v)));
    else for (const [k, v] of Object.entries(node.fields)) Object.defineProperty(object, k, { value: read(v), writable: true, enumerable: true, configurable: true });
  }
  return objects;
}

export function paths(names, values) {
  const seen = new Map();
  const walk = (v, path) => {
    if (!v || typeof v !== "object") return;
    if (seen.has(v)) { seen.get(v).push(path); return; }
    seen.set(v, [path]);
    for (const [k, x] of Object.entries(v)) walk(x, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`);
  };
  values.forEach((v, i) => walk(v, names[i]));
  return seen;
}

const elements = (key, owner) => Array.isArray(owner) && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < owner.length;
export function nativeFootprint(target, args) {
  const out = new Map();
  for (const f of target.footprint ?? []) {
    let owner = args[target.params.findIndex((p) => p.name === f.path[0])];
    for (const k of f.path.slice(1)) owner = owner?.[k];
    if (owner && typeof owner === "object") out.set(owner, new Set([...(out.get(owner) ?? []), f.key]));
  }
  return out;
}
const allowed = (frame, owner, key) => !frame.reachable.has(owner) || frame.permitted.get(owner)?.has(key) ||
  frame.permitted.get(owner)?.has("@elements") && elements(String(key), owner);

// Only input graph objects are proxied. Wrapping newly allocated native objects
// at call boundaries would change === against caller locals. Those retain their
// identity; unchanged-source snapshot checks catch net changes, and an unobserved
// transient write remains unknown rather than a fabricated counterexample.
export function writeMonitor(objects, fail) {
  const proxies = new WeakMap(), frames = [];
  const wrap = (object) => proxies.get(object) ?? object;
  for (const object of objects.values()) {
    const proxy = new Proxy(object, {
      get: (target, key, receiver) => wrap(Reflect.get(target, key, receiver)),
      set(target, key, value) {
        const owner = proxies.get(target), frame = frames.at(-1);
        if (Array.isArray(target) && !elements(String(key), target)) fail({ caller: frame?.target.name, callerFile: frame?.target.file, storeDomain: true,
          violated: [{ kind: "store-domain", text: "Array store is outside the fixed-length dense domain.", span: frame.target.span }] });
        const before = Reflect.get(target, key);
        if (["number", "boolean"].includes(typeof before) && typeof value !== typeof before) fail({ caller: frame.target.name, callerFile: frame.target.file, storeDomain: true,
          violated: [{ kind: "store-domain", text: "Store changes a required primitive cell's type or presence.", span: frame.target.span }] });
        if (frame && !allowed(frame, owner, String(key))) {
          const location = `${frame.reachable.get(owner)?.[0] ?? "?"}${Array.isArray(owner) ? `[${String(key)}]` : `.${String(key)}`}`;
          fail({ caller: frame.target.name, callerFile: frame.target.file, frameWrite: true,
            violated: [{ kind: "frame-write", location, text: `${frame.target.name} writes ${location} outside its modifies frame`, span: frame.target.span }] });
        }
        return Reflect.set(target, key, value, target);
      },
    });
    proxies.set(object, proxy);
  }
  return {
    wrap,
    enter(target, args) {
      const frame = { target, reachable: paths(target.params.map((p) => p.name), args), permitted: nativeFootprint(target, args) };
      frames.push(frame); return () => { if (frames.pop() !== frame) throw new Error("Heap replay frame stack mismatch."); };
    },
    inclusion(target, args) {
      const caller = frames.at(-1);
      if (!caller) return undefined;
      for (const [owner, keys] of nativeFootprint(target, args)) for (const key of keys) {
        const permitted = key === "@elements" ? owner.length === 0 || !caller.reachable.has(owner) || caller.permitted.get(owner)?.has(key) : allowed(caller, owner, key);
        if (!permitted) return { caller: caller.target.name, callerFile: caller.target.file, callee: target.name, calleeFile: target.file,
          frameInclusion: true, violated: [{ kind: "frame-inclusion", text: `${target.name}'s modifies frame exceeds ${caller.target.name}'s frame`, span: target.span }] };
      }
    },
  };
}

export function frameDiff(target, entry, display) {
  if (!entry.pairs) return [];
  const args = entry.map((v) => entry.live.get(v) ?? v), permitted = nativeFootprint(target, args), names = paths(target.params.map((p) => p.name), args), out = [];
  for (const [live, before] of entry.pairs) for (const key of new Set([...Object.keys(before), ...Object.keys(live)])) {
    const old = before[key] && typeof before[key] === "object" ? entry.live.get(before[key]) : before[key];
    if (Object.hasOwn(before, key) === Object.hasOwn(live, key) && Object.is(old, live[key])) continue;
    if (permitted.get(live)?.has(key) || permitted.get(live)?.has("@elements") && elements(key, live)) continue;
    const location = `${names.get(live)?.[0] ?? "?"}${Array.isArray(live) ? `[${key}]` : `.${key}`}`;
    out.push({ kind: "frame-write", location, before: display(old), after: display(live[key]), text: `${target.name} changed ${location} outside its modifies frame`, span: target.span });
  }
  return out;
}
