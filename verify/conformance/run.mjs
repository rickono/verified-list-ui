#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { DEFAULT_SEED } from "./corpus.mjs";
import { runCorpus } from "./runner.mjs";
import { runMutations } from "./mutations.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let seed = DEFAULT_SEED, mutations = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--seed" && process.argv[i + 1] !== undefined) seed = Number(process.argv[++i]);
    else if (process.argv[i] === "--mutations") mutations = true;
    else throw new Error(`Unknown or incomplete argument: ${process.argv[i]}`);
  }
  const evidence = await runCorpus({seed});
  if (mutations && !evidence.failures.length) {
    evidence.mutations = await runMutations({seed});
  }
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = evidence.failures.length ? 1 : 0;
}
