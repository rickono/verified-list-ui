/** @param {number[]} array
 * @param {number} n */
// requires Number.isSafeInteger(n) && n >= 0
// ensures result.length === (n < array.length ? n : array.length)
const takeImplementation =                              (
  array   ,
  n        ,
)              => (n < 0 ? [] : array.slice(0, n));
export { takeImplementation as take };
