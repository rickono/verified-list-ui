// ensures x * 2 == result
export const equalityAlone = (x: number): number => x * 2;

// requires Number.isFinite(x)
// ensures Number.isFinite(result)
export const finiteDouble = (x: number): number => x * 2;

// requires Number.isFinite(x) && Number.isFinite(lo) && Number.isFinite(hi)
// requires lo <= hi
// ensures lo <= result && result <= hi
export function brokenClamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return x;
  return x;
}
