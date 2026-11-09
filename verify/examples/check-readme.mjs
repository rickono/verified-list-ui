import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verify } from "../index.mjs";

const markdown = await readFile(new URL("README.md", import.meta.url), "utf8");
const examples = [...markdown.matchAll(/<!-- verify: ([^\n]+) -->\n```ts\n([\s\S]*?)\n```/g)];
assert.ok(examples.length > 0, "The README must contain executable examples.");
assert.equal(examples.length, [...markdown.matchAll(/^```ts$/gm)].length,
	"Every TypeScript snippet needs a verify marker with expected verdicts.");

let functions = 0;
for (const [index, [, verdicts, source]] of examples.entries()) {
	const expected = Object.fromEntries(verdicts.split(" ").map((entry) => entry.split("=")));
	const report = await verify(source, { file: `readme-example-${index + 1}.ts`, timeoutMs: 60_000 });
	assert.deepEqual(report.outcomes.map((outcome) => outcome.fn).sort(), Object.keys(expected).sort(),
		`Example ${index + 1} must report every documented function.`);
	for (const outcome of report.outcomes) {
		assert.equal(outcome.status, expected[outcome.fn], JSON.stringify(outcome));
		if (outcome.status === "counterexample") {
			assert.equal(outcome.confirmed, true, `${outcome.fn}: counterexample must reproduce.`);
		}
		console.log(`${outcome.status} ${outcome.fn}`);
		functions++;
	}
}
console.log(`Checked ${examples.length} README examples, ${functions} function verdicts.`);
