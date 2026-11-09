import type { Box } from "@model/data";
// ensures Object.is(result, box.value)
const unwrap = (box: Box<number>) => box.value;
export { unwrap as read };
