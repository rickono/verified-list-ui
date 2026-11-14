import { readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { solve } from "../proofs.mjs";
import { sha256, span, walk } from "./ast.mjs";
import { C1_PROFILE } from "./environment.mjs";
import { ownsCompletionGraph } from "./transitions.mjs";

// Trusted finite-control rule, not an omega search. Fix any invocation. Its
// positive source ordinal decreases on its own call/settlements, and the
// disjoint-identity frame below leaves it unchanged under every other action.
// A nonterminal suffix waits at a reached request. Viability plus per-request
// eventual settlement and the checked same-action drain force another drop.
// Rank zero occurs only after return/rejection, so that suffix is impossible.
const RULE = "c1-per-invocation-completion-1";
const digest = (value) => sha256(JSON.stringify(value));
const implementation = Object.fromEntries([
  ...readdirSync(new URL("./", import.meta.url)).filter((p) => p.endsWith(".mjs")).map((p) => `./${p}`),
  ...readdirSync(new URL("../", import.meta.url)).filter((p) => p.endsWith(".mjs")).map((p) => `../${p}`),
].sort().map((p) => [p, sha256(readFileSync(new URL(p, import.meta.url)))]));
const queryIdentity = (t) => digest({ id: t.id, declarations: t.declarations, pre: t.pre,
  preDefined: t.preDefined, postconditions: t.postconditions, params: t.params, resultType: t.resultType,
  footprint: t.footprint, effects: t.effects, allocates: t.allocates, callees: t.callees, control: t.control });
const scalar = (type) => ["number", "boolean", "undefined"].includes(type);
const scalarRecord = (type) => type?.kind === "object" && type.fields.every((f) => scalar(f.type) && !f.optional);
const identityFrame = (target) => !!target
  && target.params.every((p) => scalar(p.type) || p.name === "$s" && scalarRecord(p.type))
  && (scalar(target.resultType) || scalarRecord(target.resultType))
  && target.footprint.every((f) => f.path[0] === "$s");
const sameSpan = (a, b) => a?.start === b?.start && a?.end === b?.end;
const proved = (o) => o && ["verified", "vacuous"].includes(o.status);

/** Internal only. Required coverage is reconstructed from the original entries,
 * not from the list of obligations that happened to survive compilation. */
export function completionPlan(machine, transitions) {
  const obligations = [], targets = [], units = transitions.units;
  const add = (id, kind, checked, detail = {}) => obligations.push({ id, kind,
    status: checked ? "checked" : "missing", ...detail });
  add("producer", "producer-ownership", ownsCompletionGraph(machine, transitions),
    { rule: "unchanged graph sealed by the source transition producer; same machine and source binding" });
  const unit = (name) => {
    const found = units.filter((u) => u.name === name);
    return found.length === 1 ? found[0] : undefined;
  };
  const init = unit("$init");
  add("init", "init", !!init && init.kind === "init", { safetyUnit: "$init", rule: "initial empty identity support" });
  if ([...machine.environment.values()].some((op) => op.rejects))
    add("rejection-safety", "safety-step", !!unit("$reject"), { safetyUnit: "$reject" });
  const actions = [];
  for (const entry of machine.entries) {
    for (let k = 0; k < entry.segments.length; k++) {
      actions.push({ name: `${entry.name}$${k}`, entry, k, action: k === 0 ? "call" : "resolve", unit: unit(`${entry.name}$${k}`) });
      const before = entry.awaits[k - 1];
      if (before?.op.rejects) {
        const name = `${entry.name}$reject$${k}`;
        const found = transitions.completionRejections?.filter((u) => u.name === name) ?? [];
        actions.push({ name, entry, k, action: "reject", unit: found.length === 1 ? found[0] : undefined });
      }
    }
  }
  // Only scalar cells/local bindings can be written by admitted bodies. The
  // compiler rejects reentrant calls, handlers and unmodeled effects. Control
  // and occurrence identities are private semantic components, not FP64 cells.
  for (const a of actions) {
    const { name, entry, k, action } = a, c = a.unit?.target.control;
    const bound = !!c && c.entry === entry.name && c.segment === k && c.action === action
      && c.rankBefore === entry.segments.length - k && c.cutpoints === 0 && c.callees.length === 0 && c.identityFrame === true && identityFrame(a.unit.target);
    if (action !== "reject") add(`${name}:safety`, "safety-step", !!a.unit, { safetyUnit: name });
    add(`${name}:totality`, "segment-totality", bound && c.checks[0]?.kind === "segment-totality", { unit: name });
    const returns = [];
    if (action !== "reject") for (const s of entry.segments[k]) walk(s, (n) => { if (n.type === "ReturnStatement") returns.push(n); });
    const after = entry.awaits[k], before = entry.awaits[k - 1];
    const exits = c?.exits ?? [];
    const normalReturns = exits.filter((e) => e.kind === "returned");
    const waiting = exits.filter((e) => e.kind === "waiting");
    const rejected = exits.filter((e) => e.kind === "environment-rejected");
    const fallthrough = exits.filter((e) => e.kind === "fallthrough");
    const covered = bound && exits.length > 0 && (action === "reject"
      ? exits.length === 1 && rejected.length === 1 && sameSpan(rejected[0].span, before)
      : returns.every((r) => normalReturns.some((e) => sameSpan(e.span, r)))
        && normalReturns.every((e) => returns.some((r) => sameSpan(e.span, r)))
        && rejected.length === 0 && (after ? waiting.length > 0 && fallthrough.length === 0
          : waiting.length === 0 && fallthrough.every((e) => sameSpan(e.span, a.unit.span))))
      && exits.every((e) => ["returned", "fallthrough", "waiting", "environment-rejected"].includes(e.kind))
      && exits.every((e) => e.kind === "waiting"
        ? sameSpan(e.span, after) && e.site === k && e.rankAfter === entry.awaits.length - k
          && e.rankAfter > 0 && e.request?.op === after.op.name && e.request.result === after.op.result
          && e.request.rejects === after.op.rejects && e.request.resolves.length === after.op.resolves.length
        : e.rankAfter === 0);
    add(`${name}:exits`, "source-exit-coverage", covered, { entry: entry.name, segment: k, action,
      sourceSpan: span(action === "reject" ? before : entry.fn), sourceSha256: machine.sourceSha256 });
    add(`${name}:terminal`, "terminal-equivalence", covered, { rule: "zero iff post-terminal; every live source location is positive" });
    if (action === "call") add(`${name}:creation`, "creation", covered, { rule: "fresh invocation; positive birth ordinal; call executes first segment" });
    if (action === "reject" || !after) add(`${name}:deletion`, "deletion", covered, { rule: "only actor reaches terminal; other identities remain live" });
    if (bound) {
      const target = { ...a.unit.target, postconditions: c.checks.map((o) => o.smt),
        obligations: c.checks.map(({ kind, span, exit }) => ({ kind, span, exit })) };
      const querySha256 = queryIdentity(target);
      targets.push({ unit: name, querySha256, target });
      for (const [i, e] of exits.entries()) {
        for (const [field, kind] of [["progress", "own-progress"], ["nonnegative", "rank-nonnegative"],
          ...(e.kind === "waiting" ? [["viability", "outcome-viability"]] : [])]) {
          const check = c.checks[e[field]];
          add(`${name}:${i}:${kind}`, kind, !!check && check.kind === kind && check.exit === i && sameSpan(check.span, e.span),
            { unit: name, check: e[field], sourceExit: { kind: e.kind, span: e.span, path: e.path,
              rankBefore: String(c.rankBefore), rankAfter: String(e.rankAfter) }, querySha256 });
        }
      }
    }
  }
  for (const observed of machine.entries) observed.awaits.forEach((w, j) => {
    for (const a of actions) {
      const prefix = `${a.name}:observes:${observed.name}:${j}`;
      const own = a.entry === observed && a.action !== "call" && a.k === j + 1;
      const framed = a.unit?.target.control?.identityFrame === true && identityFrame(a.unit.target);
      add(`${prefix}:alias`, "identity-alias", framed, { cases: own ? ["same actor: own progress", "distinct actor: frame"] : ["distinct actor: frame"],
        rule: a.action === "call" ? "allocation is fresh relative to every existing identity" : "request belongs to exactly one invocation; at most one settlement" });
      add(`${prefix}:nonincrease`, "interference-nonincrease", framed,
        { unit: a.name, observed: { entry: observed.name, site: j, rank: String(observed.awaits.length - j) },
          rule: "distinct-identity frame: body writes scalar cells/actor locals; only actor control changes", aliases: `${prefix}:alias` });
    }
    // The legacy shared rejection stutter checks all cells/always/keeps. Each
    // declared site additionally has its own terminal-identity action above.
    for (const step of units.filter((u) => ["entry", "resume", "stutter"].includes(u.kind))) {
      if (!w.pending.length) {
        add(`${step.name}:keeps:${observed.name}:${j}`, "pending-keeps", true, { rule: "empty conjunction; no pending premise" });
      } else {
        const name = `${step.name}$keeps$${observed.name}$${j + 1}`;
        add(`${step.name}:keeps:${observed.name}:${j}`, "pending-keeps", !!unit(name), { safetyUnit: name });
      }
    }
  });
  add("profile", "profile-correspondence", actions.every((a) => !!a.unit?.target.control)
    && obligations.every((o) => o.status === "checked"), { profile: C1_PROFILE,
      rule: "finite total source segments; native settlement and timed microtask drain are the same C1 action" });
  const binding = { sourceSha256: machine.sourceSha256, executableSha256: machine.executableSha256,
    assumptionsSha256: machine.assumptions.sha256, safetyUnitsSha256: transitions.sha256,
    implementationSha256: digest(implementation), runtime: process.version, rule: RULE,
    profileSha256: digest(C1_PROFILE), goalsSha256: digest(machine.temporal.goals) };
  return { binding, implementation, obligations, targets,
    sha256: digest({ binding, obligations, queries: targets.map(({ unit, querySha256 }) => ({ unit, querySha256 })) }) };
}

/** Reconstruct the closed manifest before using any solver evidence. Test-only
 * deletions exercise this private boundary; the public API accepts source only. */
export function concludeCompletion(machine, transitions, plan, evidence, safety) {
  const expected = completionPlan(machine, transitions);
  const closed = plan.sha256 === expected.sha256 && digest(plan.binding) === digest(expected.binding)
    && digest(plan.obligations) === digest(expected.obligations)
    && digest(plan.targets.map(({ unit, target }) => ({ unit, querySha256: queryIdentity(target) })))
      === digest(expected.targets.map(({ unit, querySha256 }) => ({ unit, querySha256 })));
  const obligations = plan.obligations.map((o) => ({ ...o,
    ...(o.safetyUnit ? { status: o.status === "checked" && proved(safety.units?.find((u) => u.unit === o.safetyUnit)) ? "discharged" : "missing" } : {}),
    ...(o.unit && o.check !== undefined ? { status: closed && o.status === "checked" && proved(evidence.find((e) => e.unit === o.unit && e.querySha256 === o.querySha256)) ? "discharged" : "unresolved" } : {}) }));
  const allQueries = closed && expected.targets.length === evidence.length
    && expected.targets.every((t) => evidence.filter((e) => e.unit === t.unit && e.querySha256 === t.querySha256).length === 1
      && proved(evidence.find((e) => e.unit === t.unit)));
  const structural = closed && obligations.every((o) => !["missing", "unresolved"].includes(o.status));
  const ready = safety.status === "verified" && structural && allQueries;
  const profileChecked = closed && expected.obligations.every((o) => o.status === "checked")
    && expected.targets.every((t) => proved(evidence.find((e) => e.unit === t.unit && e.querySha256 === t.querySha256)));
  const goals = machine.temporal.goals.map((goal) => {
    const entry = machine.entries.find((e) => e.name === goal.entry), needed = new Set(entry.awaits.map((w) => w.op.name));
    const missing = [...needed].filter((name) => machine.environment.get(name).settles !== "eventually");
    const status = ready ? missing.length ? "liveness-gap" : "verified" : "unknown";
    const used = status === "verified";
    const assumptions = [...machine.environment.values()].map((op) => ({ kind: "per-reached-request-settlement", op: op.name,
      classification: needed.has(op.name) && op.settles !== "eventually" ? "missing"
        : op.settles === "eventually" ? used && needed.has(op.name) ? "assumed-used" : "assumed-unused" : "assumed-unused",
      declared: op.settles === "eventually", scope: "each reached request occurrence, not operation-kind fairness" }));
    assumptions.push({ kind: "continuing-runtime", classification: used ? "assumed-used" : "assumed-unused" },
      { kind: "total-declared-environment-calls", classification: used && needed.size ? "assumed-used" : "assumed-unused" },
      { kind: "weak-resumption", classification: profileChecked ? used && needed.size ? "discharged-used" : "discharged-unused" : "missing",
        requested: machine.temporal.fairness.length > 0, profileSha256: expected.binding.profileSha256 });
    const failed = evidence.find((e) => !proved(e));
    const reason = safety.status !== "verified" ? "safety-prerequisite" : !closed || expected.obligations.some((o) => o.status === "missing") ? "manifest-gap"
      : failed ? failed.label?.kind === "outcome-viability" ? "outcome-viability" : "completion-obligation"
        : missing.length ? "liveness-gap" : undefined;
    return { entry: goal.entry, goal: "completes", span: goal.span, status, ...(reason ? { reason } : {}),
      scope: "each invocation returns normally (including suppressed writes) or reaches declared environment rejection",
      rank: { domain: "exact source-control integers", birth: String(entry.segments.length),
        waiting: entry.awaits.map((_, j) => String(entry.awaits.length - j)), terminal: "0" },
      assumptions, nativeConfirmed: false,
      ...(status === "liveness-gap" ? { gap: { kind: "missing-per-request-settlement", operations: missing,
        evidence: "symbolic premise gap; no checked infinite word or native infinite confirmation" } } : {}) };
  });
  return { manifestSha256: expected.sha256, binding: expected.binding, closed, profile: C1_PROFILE,
    obligations, units: evidence, goals, nativeConfirmed: false,
    trusted: ["finite-control completion rule and source/identity frame checker", "compiler exit/definedness coverage",
      "C1 native action and timed-drain correspondence", "Z3 including quantified outcome viability"],
    limitations: ["no checked infinite-word realizability", "no global draining/success/commit/count theorem", "protocol temporal mode unsupported"] };
}

export async function complete(machine, transitions, safety, deadline) {
  const plan = completionPlan(machine, transitions);
  let outcomes;
  const remaining = Math.floor(deadline - performance.now());
  if (safety.status === "verified" && remaining > 0 && plan.obligations.every((o) => o.status === "checked"))
    outcomes = await solve(plan.targets.map((t) => t.target), remaining);
  else outcomes = plan.targets.map(() => ({ status: "unknown", reason: remaining <= 0 ? "request-timeout" : "prerequisite" }));
  const evidence = plan.targets.map((t, i) => ({ unit: t.unit, querySha256: t.querySha256, ...outcomes[i] }));
  const completion = concludeCompletion(machine, transitions, plan, evidence, safety);
  const status = safety.status === "verified" && completion.goals.some((g) => g.status !== "verified") ? "unknown" : safety.status;
  return { ...safety, status, ...(safety.status === "verified" && status !== "verified" ? { reason: completion.goals.find((g) => g.status !== "verified").reason } : {}),
    safety: { status: safety.status, scope: safety.scope, ...(safety.reason ? { reason: safety.reason } : {}), assumptionsUse: "temporal premises unused" }, completion };
}
