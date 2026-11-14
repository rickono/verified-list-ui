/**
 * The [Harmonic Mean](https://en.wikipedia.org/wiki/Harmonic_mean) is
 * a mean function typically used to find the average of rates.
 * This mean is calculated by taking the reciprocal of the arithmetic mean
 * of the reciprocals of the input numbers.
 *
 * This is a [measure of central tendency](https://en.wikipedia.org/wiki/Central_tendency):
 * a method of finding a typical or central value of a set of numbers.
 *
 * This runs in `O(n)`, linear time, with respect to the length of the array.
 *
 * @param {Array<number>} x sample of one or more data points
 * @returns {number} harmonic mean
 * @throws {Error} if x is empty
 * @throws {Error} if x contains a negative number
 * @example
 * harmonicMean([2, 3]).toFixed(2) // => '2.40'
 */
// requires x.length === 1
// requires Number.isFinite(x[0]) && x[0] > 0
// ensures result > 0
function harmonicMean(x) {
    if (x.length === 0) {
        throw new Error("harmonicMean requires at least one data point");
    }

    let reciprocalSum = 0;

    // invariant x.length === 1
    // invariant Number.isFinite(x[0]) && x[0] > 0
    // invariant Number.isInteger(i) && 0 <= i && i <= x.length
    // invariant (i === 0 && Object.is(reciprocalSum, 0)) || (i === 1 && Object.is(reciprocalSum, 1 / x[0]))
    // decreases real(x.length) - real(i)
    for (let i = 0; i < x.length; i++) {
        // the harmonic mean is only valid for positive numbers
        if (x[i] <= 0) {
            throw new Error(
                "harmonicMean requires only positive numbers as input"
            );
        }

        reciprocalSum += 1 / x[i];
    }

    // divide n by the reciprocal sum
    return x.length / reciprocalSum;
}

export default harmonicMean;

// review stale-source control
