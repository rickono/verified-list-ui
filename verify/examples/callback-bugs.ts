import { findIndex } from "./ramda/search.js";

// requires value > 0
// ensures result === (value > 1)
function positiveOnly(value: number) {
  return value > 1;
}

// ensures Number.isInteger(result)
export function narrowPredicate(values: readonly number[]) {
  // The generic requires a predicate for every number. This callback's
  // contract excludes zero, negative numbers, NaN and negative infinity.
  return findIndex(positiveOnly, values);
}
