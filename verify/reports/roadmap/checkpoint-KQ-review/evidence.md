# Commands and evidence pointers

Review checkout `/Users/rick/.t3/worktrees/verified-list-ui/t3-c0b853fe` at start `c47bbc1bfe15461b27380c9226dcfe07b486d424`. No `serial-verify.py` invocation. No process left running.

## Commands

- `git rev-parse HEAD` → `c47bbc1bfe15461b27380c9226dcfe07b486d424`
- `git merge-base --is-ancestor 32bd5b260aa116ca88642a1479bed8d3fc447f4b HEAD` → exit 0
- `test -d verify` → present
- `git log -1 --format='%H %P %ci %s' e364946706b2790bf6a8029d3b5db83f27b00f47` → parents `77c95f374742f9a78b931a2310c8bb1147f3c4d6` `6832cb1cdb9d3a1a46294d43d6f3d446f7613c5c`
- `git diff --stat 1faef4b c47bbc1` → five files: audit TSV, roadmap json, roadmap md, plan.md, KQ-landing.md
- `gh pr view 14 --repo rickono/verified-list-ui --json state,mergeCommit,headRefOid,mergedAt,url` → `MERGED`, merge `e364946706b2790bf6a8029d3b5db83f27b00f47`, head `6832cb1cdb9d3a1a46294d43d6f3d446f7613c5c`, mergedAt `2026-11-14T05:02:56Z`
- Python compared `doneWhen` strings in `docs/verification-roadmap.json` at `32bd5b2`, `bd0d957`, `e364946`, and HEAD
- Python compared `a1dda609:.audit/roadmap-20261113.tsv` as a byte prefix of `.audit/roadmap-20261113.tsv` (43 lines, 70 lines now)
- Python blob-compared code paths (`verify/` and `tests/` excluding `verify/reports/` and `verify/design/`, plus `package.json` and `pnpm-lock.yaml`) for `59ee1dc`, `7feca28`, `045139c`, `6832cb1`, `e364946`, and HEAD
- `git merge-base --is-ancestor 045139c e364946` → exit 0
- `git merge-base --is-ancestor 7feca28 e364946` → exit 1
- `git merge-base --is-ancestor 20ff205 HEAD` → exit 1
- `git hash-object` style SHA-256 of `pnpm-lock.yaml` and `package.json` at `7feca28`, `045139c`, `6832cb1`, `e364946`, and HEAD → identical; lock prefix `8a0e19b686e00939`
- `git ls-files package-lock.json` → empty
- `git grep -n "REPLAY_LIMIT =" 7feca28 e364946 -- verify/data.mjs` → line 5, value 256
- `git cat-file -e HEAD:verify/stateful/temporal.mjs` and the same at `e364946` → absent; present at `20ff205` and `1926a8a`
- Python SHA-256 compared `1926a8a` focused and full receipt maps with blobs at `20ff205` and `5f0fb47`

## Trailers read in place

- `verify/reports/roadmap/K-integration/final/full.log` and `receipt.json`
- `verify/reports/roadmap/composition-budget/full-final.txt`, `full-final.run.json`, `focused.txt`, `receipt.json`, `proof-comparison.json`, `production-cold.json`, `production-warm.json`, `production-audit.json`
- `verify/reports/roadmap/K-integration/composition-current/cold.json`
- `verify/reports/roadmap/library-campaigns/maintenance-evidence/04-current/campaign/stages.json`
- `verify/reports/roadmap/library-campaigns/maintenance-evidence/05-focused/result.json`
- `verify/reports/roadmap/library-campaigns/maintenance-evidence/06-audit/result.json`
- `verify/reports/roadmap/library-campaigns/maintenance-SHA256SUMS` (345 lines)
- `verify/reports/roadmap/library-campaigns/maintenance-evidence/04-current/campaign/native-harmonic.json`
- `verify/reports/roadmap/K-integration/native-containment/receipt.json`
- `git show 1926a8a:verify/reports/roadmap/conditional-completion-evidence/full-final/run.txt`
- `git show 1926a8a:verify/reports/roadmap/conditional-completion-evidence/focused-final/run.txt`
- `git show 1926a8a:verify/reports/roadmap/conditional-completion-evidence/full-final/receipt.json`
- `git show 1926a8a:verify/reports/roadmap/conditional-completion-evidence/focused-final/receipt.json`
- `/Users/rick/verification-vibes/artifacts/roadmap-20261113/combined-C2a/initial/tests.log`
- `/Users/rick/verification-vibes/artifacts/roadmap-20261113/combined-C2a/baseline-correction/tests.log`
- `/Users/rick/verification-vibes/artifacts/roadmap-20261113/combined-C2a/unbound-abort-red.txt`
- `/Users/rick/verification-vibes/artifacts/roadmap-20261113/combined-integration/merged-state.json`

## Parent thread

`<t3-thread://v2/a77123eb-c55f-4b51-83af-db8d1f1daf8d/1cdc229e-ad5a-4769-989f-7e1c11a49497>`

Messages after position 8680 through 9680, view `messages`. Activity after position 9600 through 9652, view `activity`. Provider `codex`, model `gpt-6.1-sol`.
