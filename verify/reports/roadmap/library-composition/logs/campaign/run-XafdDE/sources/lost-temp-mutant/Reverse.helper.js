/** @param {number[]} arr */
// modifies arr
// ensures result === arr
// ensures arr.every((v, k) => Object.is(v, old(arr.slice())[arr.length - 1 - k]))
const Reverse = (arr) => {
  // limit specifies the amount of Reverse actions
  // invariant Number.isInteger(i) && 0 <= i && i <= arr.length
  // invariant Number.isInteger(j) && -1 <= j && j < arr.length && j === arr.length - 1 - i
  // invariant arr.every((v, k) => k < i || k > j ? Object.is(v, old(arr.slice())[arr.length - 1 - k]) : Object.is(v, old(arr.slice())[k]))
  // decreases real(arr.length - 0) - real(i)
  for (let i = 0, j = arr.length - 1; i < arr.length / 2; i++, j--) {
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = arr[i]
  }
  return arr
}
export { Reverse };
