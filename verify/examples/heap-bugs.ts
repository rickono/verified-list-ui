// modifies left.value
// ensures Object.is(result, old(right.value))
export function forgottenAlias(left: { value: number }, right: { value: number }) {
  left.value = 1;
  return right.value;
}

// ensures true
export function restoredOutsideFrame(point: { value: number }) {
  const original = point.value;
  point.value = 1;
  point.value = original;
  return true;
}

// requires values.length === 0
// modifies values
// ensures true
export function growsOutsideDomain(values: number[]) {
  values[0] = 1;
  return values;
}
