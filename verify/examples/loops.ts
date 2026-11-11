// ensures result === -1 || (0 <= result && result < values.length && values[result] === target)
// ensures result !== -1 || values.every((value) => value !== target)
// ensures result === -1 || values.every((value, index) => index >= result || value !== target)
export function indexOf(values: readonly number[], target: number): number {
	// invariant Number.isInteger(i) && 0 <= i && i <= values.length
	// invariant values.every((value, index) => index >= i || value !== target)
	// decreases real(values.length) - real(i)
	for (let i = 0; i < values.length; i++) {
		if (values[i] === target) return i;
	}
	return -1;
}

// ensures Number.isInteger(result) && 0 <= result && result <= values.length
export function countPositive(values: readonly number[]): number {
	let count = 0;
	// invariant Number.isInteger(i) && 0 <= i && i <= values.length
	// invariant Number.isInteger(count) && 0 <= count && count <= i
	// decreases real(values.length) - real(i)
	for (let i = 0; i < values.length; i++) {
		if (!(values[i] > 0)) continue;
		count++;
	}
	return count;
}
