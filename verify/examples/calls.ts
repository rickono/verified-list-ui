// requires Number.isFinite(value)
// ensures 0 <= result && result <= 1
export const clamp01 = (value: number) => clamp(value, 0, 1);

// requires Number.isFinite(value) && Number.isFinite(min) && Number.isFinite(max)
// requires min <= max
// ensures min <= result && result <= max
export function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// requires values.length > 0
// ensures Object.is(result, values[0])
export const first = (values: number[]) => values[0];

// requires values.length > 0
// ensures Object.is(result, values[0])
export const wrappedFirst = (values: number[]) => first(values);
