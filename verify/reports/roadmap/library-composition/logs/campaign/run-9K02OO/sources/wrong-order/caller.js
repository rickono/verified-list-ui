// Authored composition glue, distributed with this GPL-3.0 report fixture.
import { Reverse } from "./Reverse.helper.js";
import { take } from "./take.helper.js";

/** @param {number[]} array */
// modifies array
// ensures result.length === (array.length < 2 ? array.length : 2)
// ensures result.every((value, index) => Object.is(value, old(array.slice())[array.length - 1 - index]))
export const reverseFirstTwo = (array) => Reverse(take(array, 2));
