// Authored independent native comparisons. Fresh workers load the real modules.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";

const hex = (v) => { const b = Buffer.alloc(8); b.writeDoubleBE(v); return b.toString("hex"); };
const equal = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function samples() {
  const numbers = [NaN, 0, -0, Infinity, -Infinity, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, 1, -1, 2.5];
  const inputs = [[]];
  for (const x of numbers) inputs.push([x]);
  for (const x of numbers) for (const y of numbers) inputs.push([x, y]);
  for (const length of [...Array.from({ length: 16 }, (_, i) => i + 3), 255, 256, 257, 1024]) {
    inputs.push(Array.from({ length }, (_, i) => numbers[(i * 5 + length) % numbers.length]));
  }
  inputs.push([1, 2, 3], [1, 2, 3, 4]);
  return inputs;
}
if (!isMainThread) {
  const { reverseFirstTwo } = await import(pathToFileURL(workerData.entry).href);
  const checks = samples().map((input) => {
    const before = input.slice();
    const result = reverseFirstTwo(input);
    const fullReverse = before.toReversed(), expected = fullReverse.slice(0, 2);
    const length = result.length === Math.min(before.length, 2);
    const contents = equal(result, expected);
    return { before: before.map(hex), result: result.map(hex), after: input.map(hex), length, contents,
      wrapperHolds: length && contents, inputFullyReversed: equal(input, fullReverse), resultFresh: result !== input,
      inputLengthPreserved: input.length === before.length,
      noExtraInputProperties: Object.keys(input).length === before.length };
  });
  parentPort.postMessage({ encoding: "binary64 big-endian hex; comparison uses Object.is (NaNs compare equal)",
    count: checks.length, failures: checks.filter((c) => !c.wrapperHolds).length, checks });
}
export async function nativeComparisons(entry) {
  const worker = new Worker(new URL(import.meta.url), { workerData: { entry } });
  try {
    return await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (code) => { if (code !== 0) reject(new Error(`Native worker exited ${code}`)); });
    });
  } finally { await worker.terminate(); }
}
