// requires Number.isInteger(n) && 0 <= n && n <= 100
// ensures result === n
export function wrongInvariant(n: number): number {
	let i = 0;
	// invariant Number.isInteger(i) && 0 <= i && i <= 1
	// decreases real(n) - real(i)
	while (i < n) { i++; }
	return i;
}

// requires Number.isInteger(n) && 0 <= n && n <= 100
// ensures result === n
export function constantMeasure(n: number): number {
	let i = 0;
	// invariant Number.isInteger(i) && 0 <= i && i <= n
	// decreases real("0")
	while (i < n) { i++; }
	return i;
}
