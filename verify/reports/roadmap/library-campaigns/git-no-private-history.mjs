#!/usr/bin/env node
// Object-availability fixture: deny only this unpublished object, forward all other git commands.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const old = "a83f50762005ae47edfe3e07295f3840b485687b";
const args = process.argv.slice(2);
if (args.some((arg) => arg === old || arg.startsWith(`${old}:`) || arg.startsWith(`${old}^{`))) {
  console.error(`fixture: historical object unavailable: ${old}`);
  process.exit(128);
}
const git = process.env.CAMPAIGN_REAL_GIT;
assert.ok(git?.startsWith("/"), "Set CAMPAIGN_REAL_GIT to the real git executable.");
const result = spawnSync(git, args, { cwd: process.env.CAMPAIGN_GIT_CWD, stdio: "inherit" });
if (result.error) throw result.error;
assert.equal(result.signal, null);
process.exit(result.status);
