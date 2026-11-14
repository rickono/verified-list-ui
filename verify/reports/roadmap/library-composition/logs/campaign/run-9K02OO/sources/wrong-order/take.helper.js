/** @param {number[]} array
 * @param {number} n */
// requires Number.isSafeInteger(n) && n >= 0
// ensures result.length === (n < array.length ? n : array.length)
// ensures result.every((value, index) => Object.is(value, array[index]))
const takeImplementation =                              (
  array   ,
  n        ,
)              => (n < 0 ? [] : array.slice(0, n));
export { takeImplementation as take };
