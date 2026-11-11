type Point = { value: number; label: number };

// modifies point.value
// ensures Object.is(point.value, value)
export function setValue(point: Point, value: number) {
  point.value = value;
  return point;
}

// modifies left.value
// ensures Object.is(result, left === right ? value : old(right.value))
export function sharedArguments(left: Point, right: Point, value: number) {
  setValue(left, value);
  return right.value;
}

// modifies left.value
// ensures Object.is(result, old(right.label))
export function preserveOtherField(left: Point, right: Point) {
  setValue(left, 7);
  return right.label;
}

// ensures result !== point
// ensures result.child === point.child
// ensures Object.is(result.value, point.value)
export function shallowCopy(point: { value: number; child: { count: number } }) {
  return { ...point };
}

// requires values.length >= 2
// modifies values
// ensures Object.is(values[0], old(values[1]))
// ensures Object.is(values[1], old(values[0]))
// ensures values.length === old(values.length)
export function swapFirstTwo(values: number[]) {
  const first = values[0];
  values[0] = values[1];
  values[1] = first;
  return values;
}

// requires values.length > 0
// modifies values
// ensures Object.is(result, old(values[0]))
export function copyBeforeWrite(values: number[]) {
  const copy = values.slice();
  values[0] = 99;
  return copy[0];
}
