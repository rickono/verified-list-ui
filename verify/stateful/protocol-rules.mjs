import { variable as v, constant as b, equal as eq, all, neg, implies, choose, map, read, update, projection } from "./projection.mjs";

// These are finite induction schemas over arbitrary representatives. A schema's
// arity does not bound the finite sets in a runtime configuration. Every map
// update is a definition (ite), not an axiom about the resulting registry.
export function protocolRules(emit, at) {
  const variables = [], maps = [];
  const variable = (name, sort) => { const t = v(`$${name}`, sort); variables.push(t); return t; };
  const fn = (name, inputs, output) => { const m = map(`$${name}`, inputs, output); maps.push(m); return (...args) => read(m, ...args); };
  const t = variable("target", "target"), e = variable("event", "event"), c = variable("callback", "closure");
  const u = variable("otherTarget", "target"), f = variable("otherEvent", "event"), d = variable("otherCallback", "closure");
  const r = variable("occurrence", "registration"), s = variable("otherOccurrence", "registration"), n = variable("freshOccurrence", "registration");
  const live = fn("live", ["registration"], "boolean"), occupied = fn("occupied", ["target", "event", "closure"], "boolean");
  const index = fn("index", ["target", "event", "closure"], "registration");
  const target = fn("targetOf", ["registration"], "target"), event = fn("eventOf", ["registration"], "event"), callback = fn("callbackOf", ["registration"], "closure");
  const history = fn("registrationHistory", ["registration"], "boolean");
  const key = [t, e, c], otherKey = [u, f, d];
  const before = { live, occupied, index, target, event, callback, history };
  const keyOf = (a, x) => [a.target(x), a.event(x), a.callback(x)];
  const same = (a, k) => all(...a.map((x, i) => eq(x, k[i])));
  const forward = (a, x) => implies(a.live(x), all(a.occupied(...keyOf(a, x)), eq(a.index(...keyOf(a, x)), x)));
  const reverse = (a, k) => implies(a.occupied(...k), all(a.live(a.index(...k)), same(keyOf(a, a.index(...k)), k)));
  const unary = (a, x) => implies(a.live(x), a.history(x));
  const pair = (a) => implies(all(a.live(r), a.live(s), same(keyOf(a, r), keyOf(a, s))), eq(r, s));
  const p = { variables, maps };
  const unit = (name, requires, ensures) => emit({ name, kind: "protocol-rule", span: at, params: [], body: [], modifies: [], protocolProjection: p,
    requires: requires.map((x) => ({ text: name, span: at, ast: projection(x, at) })), ensures: ensures.map((x) => ({ text: name, span: at, ast: projection(x, at) })) });
  const empty = { ...before, live: () => b(false), occupied: () => b(false) };
  unit("$registry$init", [], [forward(empty, r), reverse(empty, key), unary(empty, r), pair(empty)]);
  const created = { live: update(live, [n], b(true)), occupied: update(occupied, key, b(true)), index: update(index, key, n),
    target: update(target, [n], t), event: update(event, [n], e), callback: update(callback, [n], c), history: update(history, [n], b(true)) };
  const removed = { ...before, live: update(live, [index(...key)], b(false)), occupied: update(occupied, key, b(false)) };
  for (const [operation, after, own] of [
    ["create", created, [neg(occupied(...key)), neg(history(n)), unary(before, n)]],
    ["duplicate", before, [occupied(...key)]],
    ["remove", removed, [occupied(...key), reverse(before, key)]],
    ["absent-remove", before, [neg(occupied(...key))]],
  ]) {
    unit(`$registry$${operation}$occurrence-index`, [...own, forward(before, r)], [forward(after, r)]);
    unit(`$registry$${operation}$index-occurrence`, [...own, reverse(before, otherKey)], [reverse(after, otherKey)]);
    unit(`$registry$${operation}$keeps-unary`, [...own, unary(before, r)], [unary(after, r)]);
    unit(`$registry$${operation}$keeps-pair`, [...own, forward(before, r), forward(before, s)], [pair(after)]);
  }
  unit("$registry$creation", [neg(occupied(...key)), neg(history(n)), unary(before, n)], [forward(created, n), reverse(created, key), unary(created, n)]);
  unit("$registry$uniqueness", [forward(before, r), forward(before, s)], [pair(before)]);

  // Controller/signal ownership is an inverse relation, including external
  // aliases. Fresh allocation excludes the historical sets, not binding names.
  const ctrl = variable("controller", "controller"), sig = variable("signal", "signal");
  const nc = variable("freshController", "controller"), ns = variable("freshSignal", "signal");
  const signal = fn("signalOf", ["controller"], "signal"), owner = fn("ownerOf", ["signal"], "controller");
  const hc = fn("controllerHistory", ["controller"], "boolean"), hs = fn("signalHistory", ["signal"], "boolean");
  const aborted = fn("aborted", ["signal"], "boolean");
  const nextSignal = update(signal, [nc], ns), nextOwner = update(owner, [ns], nc);
  const fresh = [neg(hc(nc)), neg(hs(ns))];
  unit("$handles$allocation", fresh, [eq(nextOwner(nextSignal(nc)), nc), eq(nextSignal(nextOwner(ns)), ns), neg(choose(eq(ns, ns), b(false), aborted(ns)))]);
  unit("$handles$keeps-unary", [...fresh, hc(ctrl), hs(signal(ctrl)), eq(owner(signal(ctrl)), ctrl)], [eq(nextOwner(nextSignal(ctrl)), ctrl)]);
  unit("$handles$keeps-pair", [...fresh, hs(sig), hc(owner(sig)), eq(signal(owner(sig)), sig)], [eq(nextSignal(nextOwner(sig)), sig)]);
  unit("$handles$alias-ownership", [eq(owner(signal(ctrl)), ctrl), eq(signal(owner(sig)), sig)], [implies(eq(signal(ctrl), sig), eq(ctrl, owner(sig))), implies(eq(ctrl, owner(sig)), eq(signal(ctrl), sig))]);
  const afterAbort = update(aborted, [signal(ctrl)], b(true));
  unit("$abort$contents", [], [afterAbort(signal(ctrl)), implies(neg(eq(sig, signal(ctrl))), eq(afterAbort(sig), aborted(sig))), implies(aborted(sig), afterAbort(sig))]);
  const req = variable("request", "request"), nr = variable("freshRequest", "request"), run = variable("invocation", "invocation");
  const requestHistory = fn("requestHistory", ["request"], "boolean"), pending = fn("pending", ["request"], "boolean"), settled = fn("settled", ["request"], "boolean"), running = fn("running", ["invocation"], "boolean");
  const pendingNew = update(pending, [nr], b(true)), settledNew = update(settled, [nr], b(false));
  unit("$request$creation", [neg(requestHistory(nr))], [pendingNew(nr), neg(settledNew(nr)), implies(neg(eq(req, nr)), eq(pendingNew(req), pending(req)))]);
  const pendingSettled = update(pending, [req], b(false)), selected = update(settled, [req], b(true));
  unit("$request$settlement", [pending(req), neg(settled(req))], [neg(pendingSettled(req)), selected(req)]);
  unit("$request$abort-keeps", [], [eq(pending(req), pending(req)), eq(settled(req), settled(req)), eq(running(run), running(run))]);
  unit("$request$selected-keeps", [settled(req)], [settled(req)]);
  const closure = variable("freshClosure", "closure"), oldClosure = variable("oldClosure", "closure");
  const ch = fn("closureHistory", ["closure"], "boolean");
  unit("$closure$allocation", [neg(ch(closure)), ch(oldClosure)], [neg(eq(closure, oldClosure)), update(ch, [closure], b(true))(closure)]);
}

// Structural completeness is checked independently of successful solver results.
// A deleted rule can never turn a subset of targets into a verified report.
export function validateProtocolUnits(units, machine) {
  const expected = ["$init", "$registry$init", "$registry$creation", "$registry$uniqueness", "$handles$allocation", "$handles$keeps-unary", "$handles$keeps-pair", "$handles$alias-ownership", "$abort$contents", "$request$creation", "$request$settlement", "$request$abort-keeps", "$request$selected-keeps", "$closure$allocation"];
  for (const op of ["create", "duplicate", "remove", "absent-remove"]) for (const rule of ["occurrence-index", "index-occurrence", "keeps-unary", "keeps-pair"]) expected.push(`$registry$${op}$${rule}`);
  for (const e of machine.entries) {
    e.segments.forEach((_, k) => expected.push(`${e.name}$${k}`));
    for (const c of e.closures) if (c.kind === "handler") {
      expected.push(c.name);
      for (const entry of machine.entries) entry.segments.forEach((_, k) => expected.push(`${entry.name}$${k}$keeps$${c.name}`));
    }
  }
  const steps = [...machine.entries.flatMap((e) => e.segments.map((_, k) => `${e.name}$${k}`)),
    ...machine.entries.flatMap((e) => e.closures.filter((c) => c.kind === "handler").map((c) => c.name)),
    ...(machine.targets.size || [...machine.environment.values()].some((op) => op.rejects) ? ["$stutter"] : [])];
  expected.push(...steps);
  for (const step of steps) for (const e of machine.entries) {
    for (const c of e.closures.filter((c) => c.kind === "handler")) expected.push(`${step}$keeps$${c.name}`);
    for (const w of e.awaits) if (w.pending.length) expected.push(`${step}$keeps$${e.name}$${w.start}`);
  }
  for (const u of units) for (const a of u.protocolActions ?? []) expected.push(...a.rules);
  for (const name of expected) if (!units.some((u) => u.name === name)) throw new Error(`Incomplete protocol induction: missing ${name}`);
}
