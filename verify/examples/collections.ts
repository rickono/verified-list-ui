// requires values.length > 0
// ensures result !== undefined
// ensures Object.is(result, values[0])
export function first(values: readonly number[]) {
  return values[0];
}

// requires values.length === 2
// ensures result.length === 2
// ensures Object.is(result[0], values[1]) && Object.is(result[1], values[0])
export const swapPair = (values: readonly number[]) => [values[1], values[0]];

// requires Number.isInteger(n) && n >= 0 && n <= values.length
// ensures result.length === n
// ensures n === 0 || Object.is(result[0], values[0])
export const take = (values: readonly number[], n: number) => values.slice(0, n);

// requires Number.isFinite(x) && Number.isFinite(bounds.min) && Number.isFinite(bounds.max)
// requires bounds.min <= bounds.max
// ensures bounds.min <= result && result <= bounds.max
export function clamp(x: number, bounds: { min: number; max: number }) {
  if (x < bounds.min) return bounds.min;
  if (x > bounds.max) return bounds.max;
  return x;
}

// ensures Object.is(result.x, point.x) && Object.is(result.y, point.y)
export const copyPoint = (point: { x: number; y: number }) => ({ ...point });

// requires Number.isFinite(x)
// requires bounds.min === undefined || Number.isFinite(bounds.min)
// ensures Number.isFinite(result)
// ensures bounds.min === undefined || bounds.min <= result
export const lowerBound = (x: number, bounds: { min?: number }) =>
  bounds.min !== undefined && x < bounds.min ? bounds.min : x;
