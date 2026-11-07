// requires Number.isFinite(x)
// requires Math.abs(x) <= Number.MAX_VALUE / 2
// ensures Number.isFinite(result)
// ensures x * 2 === result
export const double = (x: number): number => x * 2;

// requires Number.isFinite(x) && Number.isFinite(lo) && Number.isFinite(hi)
// requires lo <= hi
// ensures lo <= result && result <= hi
export function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
