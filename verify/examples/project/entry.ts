import prefix, { read as unbox } from "./barrel.ts";
import type { Packet } from "./barrel.ts";
import { type Count } from "@ready/take";
import same from "@ready/d3";
// ensures Object.is(result.value, input.payload.value)
// ensures result.size === 0
export const inspect = (input: Packet<number>, count: Count) => ({
  value: same(unbox(input.payload)),
  size: prefix(input.values, 0).length,
});
