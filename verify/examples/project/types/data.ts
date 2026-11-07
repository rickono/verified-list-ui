export type Box<T> = { readonly value: T };
export type Vector<T> = readonly T[];
export type Packet<T> = { payload: Box<T>; values: Vector<T> };
