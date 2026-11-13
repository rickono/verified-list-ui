/** @param {(x: number) => boolean} fn
 * @param {number[]} list */
// ensures Number.isInteger(result) && -1 <= result && result < list.length
// ensures result === -1 || (0 <= result && result < list.length && fn(list[result]))
// ensures list.every((value, i) => result !== -1 && result <= i || !fn(value))
export function findIndex(fn, list) {
  var idx = 0;
  var len = list.length;
  // invariant Number.isInteger(idx) && 0 <= idx && idx <= len
  // invariant list.every((value, i) => idx <= i || !fn(value))
  // decreases real(len) - real(idx)
  while (idx < len) {
    if (fn(list[idx])) {
      return idx;
    }
    idx += 1;
  }
  return -1;
}
