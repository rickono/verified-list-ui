# Commands

Prepared checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-02f145c7` at `5f0fb47a0a822d62537f296ef804d5037eebba5c`.
Evidence checkout, read only: `/Users/rick/.t3/worktrees/verified-list-ui/t3-105287a3` at `6f464327f9d5d7ea48706f334ac13e24d3cad632`.
Tested code: `c1df5f6a7302dc70ede1c43649aa61295d3d80f7`, tree `e6ab0ad2fa9b16633ac86795d0a5bd0c285e4f17`.
Node: v22.23.1. Solver lane: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py`.

## Archive

```
git -C /Users/rick/.t3/worktrees/verified-list-ui/t3-105287a3 archive --format=tar c1df5f6a7302dc70ede1c43649aa61295d3d80f7 | tar -x -C /tmp/c2a-measure
ln -sfn /Users/rick/verification-vibes/verified-list-ui/node_modules /tmp/c2a-measure/node_modules
```

The archive is measurement only. It is not a second worktree.

## Identity and receipts

```
git -C /Users/rick/.t3/worktrees/verified-list-ui/t3-02f145c7 rev-parse HEAD
git -C /Users/rick/.t3/worktrees/verified-list-ui/t3-02f145c7 merge-base --is-ancestor 32bd5b260aa116ca88642a1479bed8d3fc447f4b HEAD
git -C /Users/rick/.t3/worktrees/verified-list-ui/t3-105287a3 rev-parse HEAD
git -C /Users/rick/.t3/worktrees/verified-list-ui/t3-105287a3 rev-parse c1df5f6a7302dc70ede1c43649aa61295d3d80f7^{tree}
cd /Users/rick/.t3/worktrees/verified-list-ui/t3-105287a3/verify/reports/roadmap/C2a-evidence && shasum -a 256 -c SHA256SUMS
```

Observed: ancestor check succeeded; evidence HEAD equals the named tip; tree equals `e6ab0ad2fa9b16633ac86795d0a5bd0c285e4f17`; `shasum` exited 0 with 97 OK (`logs/shasum.txt`). `final-fourth.sha256.json` matched the archive on 27 of 27 paths. Baseline `baseline-compare.json`: 11 rows, all `exact: true`, target sum 40, query sum 296.

## Probes

Failed experiment, before `node_modules` was linked into each mutant. No output file was written. Log: `logs/probe-first-failure.log`.

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/c2a-proof-probe.mjs
```

Observed: `ERR_MODULE_NOT_FOUND: Cannot find package 'acorn' imported from /private/tmp/omit-stutter/verify/stateful/machine.mjs`.

Successful rerun after the probe's `mutant()` called `symlinkSync` for `node_modules`. The committed `probe.mjs` is that rerun script, byte-identical to the executed file.

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/c2a-proof-probe.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/c2a-proof-followup.mjs
```

Observed: both exited 0. Outputs are `logs/probe-out.json` and `logs/followup.json`. Predictions inside `probe.mjs` were not edited after execution.

To repeat from this directory after recreating the archive:

```
C2A_ROOT=/tmp/c2a-measure C2A_OUT=/tmp/c2a-proof-out.json python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node probe.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node followup.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node reprove.mjs
```

`followup.mjs` and `reprove.mjs` read `/tmp/c2a-measure` and the follow-up writes `/tmp/c2a-proof-followup.json`. `reprove.mjs` solves every listener and advisory unit with a 60000 ms timeout.

Executed re-solve:

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/c2a-reprove.mjs
```

Observed exit 0 (`logs/reprove.log`): listeners 38 `verified`, advisory 34 `verified`, `bad` empty for both. The lane printed `Waiting for the shared solver test lane.` and then `Acquired the solver test lane.`

## Not rerun

The 390-test suite and the 18-test focused file were not executed again. Counts come from `full-final.log.txt` and `protocol-final-focused.log.txt` in the evidence directory.
