import { take } from "./take.helper.js";

/** @param {number[]} array */
// ensures result.length === (array.length < 2 ? array.length : 2)
// ensures result.every((value, index) => Object.is(value, array[index]))
export const firstTwo = (array) => take(take(array, 3), 2);
