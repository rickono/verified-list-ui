import { take as prefix } from "./take.helper.js";

/** @param {number[]} array */
// requires array.length > 2
// ensures result.length === 2
// ensures result.every((value, index) => Object.is(value, array[index]))
export const shifted = (array) => prefix(array.slice(1), 2);
