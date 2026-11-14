import { constant, equal, implies, neg, projection, update } from "./projection.mjs";

// Source lowering and induction use this same persistent state transition.
export function advisoryAbort(state, signal) {
  return { ...state, aborted: update(state.aborted, [signal], constant(true)) };
}

export function abortClauses(proof) {
  const { before, after, signal, observer, request, invocation, property, id, span } = proof;
  const contents = [after.aborted(signal),
    implies(neg(equal(observer, signal)), equal(after.aborted(observer), before.aborted(observer))),
    implies(before.aborted(observer), after.aborted(observer))];
  const frames = [equal(after.pending(request), before.pending(request)),
    equal(after.settled(request), before.settled(request)),
    equal(after.running(invocation), before.running(invocation))];
  let requires = [], ensures;
  if (property === "contents") ensures = contents;
  else if (property === "keeps") ensures = [...contents, ...frames];
  else if (property === "selected") { requires = [before.settled(request)]; ensures = [...contents, after.settled(request), ...frames]; }
  else if (property === "source") ensures = [...contents, ...frames, implies(before.settled(request), after.settled(request))];
  else throw new Error("Incomplete protocol induction: invalid advisory abort property");
  const clause = (term) => ({ text: `advisory abort ${property}`, span, abortProof: id, ast: projection(term, span) });
  return { requires: requires.map(clause), ensures: ensures.map(clause) };
}

export function validateAbortClauses(unit, proof) {
  const expected = abortClauses(proof);
  for (const kind of ["requires", "ensures"]) {
    const actual = (unit[kind] ?? []).filter((c) => c.abortProof === proof.id);
    if ((unit.kind === "protocol-rule" && unit[kind].length !== expected[kind].length) ||
        JSON.stringify(actual.map((c) => c.ast)) !== JSON.stringify(expected[kind].map((c) => c.ast))) {
      throw new Error(`Incomplete protocol induction: unbound advisory abort ${proof.id} ${kind}`);
    }
  }
}
