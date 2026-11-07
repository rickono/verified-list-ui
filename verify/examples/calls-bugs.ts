// requires value > 0
// ensures result > 0
export const positive = (value: number) => value;

// ensures true
export const unsafe = (value: number) => positive(value);

// ensures true
export const weakIdentity = (flag: boolean) => flag;

// ensures result === flag
export const contractGap = (flag: boolean) => weakIdentity(flag);
