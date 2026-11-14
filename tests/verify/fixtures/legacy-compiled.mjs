import assert from "node:assert/strict";

// K adds a boolean allocation effect used by loop admission. Compare every
// pre-existing field exactly; the K tests check the new effect's meaning.
export function legacyTargets(targets) {
  return targets.map(({ allocates, ...target }) => {
    assert.equal(typeof allocates, "boolean");
    return target;
  });
}
