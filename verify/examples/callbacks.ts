import { findIndex } from "./ramda/search.js";

// ensures result === -1 || values[result] > threshold
// ensures values.every((value, i) => result !== -1 && result <= i || !(value > threshold))
export function firstAbove(values: readonly number[], threshold: number) {
  const matches = (value: number): boolean => value > threshold;
  return findIndex(matches, values);
}

// ensures result === -1 || Number.isNaN(values[result])
// ensures values.every((value, i) => result !== -1 && result <= i || !Number.isNaN(value))
export function firstNaN(values: readonly number[]) {
  const matches = (value: number): boolean => Number.isNaN(value);
  return findIndex(matches, values);
}

// ensures result === Object.is(value, -0)
export function isNegativeZero(value: number) {
  return Object.is(value, -0);
}

// ensures result === -1 || Object.is(values[result], -0)
// ensures values.every((value, i) => result !== -1 && result <= i || !Object.is(value, -0))
export function firstNegativeZero(values: readonly number[]) {
  return findIndex(isNegativeZero, values);
}
