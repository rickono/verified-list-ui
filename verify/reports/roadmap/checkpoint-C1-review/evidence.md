# Commands and measured results

Checkout `/Users/rick/.t3/worktrees/verified-list-ui/t3-cd4134db`. HEAD at review time `bd0d9570e8f910a8cf7db14cf517728ba3fd673e`.

## Identity

`git merge-base --is-ancestor 32bd5b260aa116ca88642a1479bed8d3fc447f4b HEAD` exit 0. Same for main `41079c5d22ba889005075d23ffd5ef5ca7a1e600`. `git merge-base --is-ancestor 41079c5 HEAD` exit 0.

Python blob compare of top-level `verify/*.mjs` plus `verify/bin/` and `verify/stateful/`: 28 runtime modules identical, 11 bin/stateful paths identical, only-head and only-main empty.

`git diff --name-only 41079c5..HEAD` outside `.audit/`, `docs/`, `scripts/render-verification-roadmap.py`, `verify/design/`, and `verify/reports/roadmap/`: empty.

## TAP lines read, not rerun

```
P-integration/combined-numeric/full.log: # tests 322 # pass 322 # fail 0 # skipped 0
P-evidence/logs/full-final.log: # tests 278 # pass 278 # fail 0 # skipped 0
C1-integration/final/focused.log: # tests 49 # pass 49 # fail 0 # skipped 0
C1-integration/final/full.log: # tests 371 # pass 371 # fail 0 # skipped 0
C1-integration/first-attempt/focused.log: # tests 49 # pass 48 # fail 1 # skipped 0
stateful-C1-evidence/focused-02.log: # tests 47 # pass 47 # fail 0
stateful-C1-evidence/full-final.log: # tests 304 # pass 304 # fail 0
review-unicode-before.log: # tests 1 # pass 0 # fail 1
review-unicode-production.log: # tests 5 # pass 5 # fail 0
review-loop-fix.log: # tests 11 # pass 11 # fail 0
```

`git show 7692103:verify/reports/roadmap/throws-evidence/full.log` ends `# tests 331 # pass 331 # fail 0 # skipped 0`. `focused-P.log` is 37/37.

`git show 7a98698:verify/reports/roadmap/K-evidence/receipt.json` tap rows include `full-final.tap` 418/418 and `full-before-oracle-update.tap` 418 tests, 417 pass, 1 fail. `git diff --name-only 00e5fc4 7a98698 -- verify` excluding reports and design: `verify/README.md` only.

`historical-evidence.log` line 2 is `"status": "invalid-evidence"`.

First-attempt log names `AssertionError` at `callback-bugs.ts: complete compiled artifact`. `run-receipt.json` says `fullStarted: false`.

## SHA-256 against git show

| Manifest | Compared head | Result | Versus HEAD |
| --- | --- | --- | --- |
| `C1-integration/final/runtime-SHA256SUMS` | `0345a9a` | 18/18 | 0 differ |
| `C1-integration/final/stateful-SHA256SUMS` | `0345a9a` | 10/10 | 0 differ |
| `C1-integration/first-attempt/runtime-SHA256SUMS` | `74c3747` | 18/18 | 0 differ |
| `P-integration/combined-numeric/runtime-SHA256SUMS` | `dedde91` | 18/18 | `verify/source.mjs` only |
| `P-integration/runtime-SHA256SUMS` | `b908127` | 18/18 | differs on `data.mjs` and `source.mjs` |
| same P-integration manifest | `c9c4511` | 17/18 | `heap.mjs` `25bccf21…` vs `3a833de6…` |
| same | `dedde91` | 17/18 | `data.mjs` `6c53f2fc…` vs `63f39ff7…` |

`verify/source.mjs`: `5d8415a` `bf990306…`; `c9c4511` and `dedde91` `38bbea4d…`; `0345a9a`, main, and HEAD `6f8568d6…`.

A scan of `git rev-list --all -n 400` plus named tips found 11 commits whose 18 blobs match `P-integration/runtime-SHA256SUMS`, including `b908127` and `8cf7178`. `dedde91` is not among them.

## Renderer

`python3 scripts/render-verification-roadmap.py` then `git diff --quiet -- docs/verification-roadmap.md`: quiet. Loading `ac84980:docs/verification-roadmap.json` and indexing `result["fullSuite"]` raises `KeyError: 'fullSuite'`. At `06360e4`, P has no `result` and `workflowDelivery` is present. Current nodes K,Q,R,S,T,U,V,W have `integrated` false and no `result`. P has `integrated` true, `deliveryStatus` finished, no `result`.

## Merges and review openings

`git log -1 --format='%P %s'` for `58ecbe4`, `0d7c39c`, `b908127`, `8fa17d6`, `41079c5` shows the PR #8–#12 merge subjects. Each is an ancestor of main.

`git show` openings: `b0b1f70` PASS, `92aa740` PASS, `3555ee0` PASS, `33ffffd` PASS, `b00f56a` PASS, `d812b7a` ISSUES, `bd790ea` ISSUES, `04ba933` ISSUES with acceptance and limits, `6627c16` throws production review PASS.

## Transcript reads

`t3_thread_read` on parent `1cdc229e-ad5a-4769-989f-7e1c11a49497`:

- messages `afterPosition` 7300, 7700, and 8000 through `nextPosition` 8681
- activity `afterPosition` 7988, items 7989–7996, including command execution of the archived Unicode frontend test, printed `exit 1` and `not ok 1`

`t3_thread_read` on the V recon thread: `status` failed, run completed `2026-11-13T23:12:39Z`, two items, no delivered target result.

`t3_thread_read` on the throws production review: `status` completed `2026-11-13T23:54:27Z`, final message PASS, report commit `6627c16`.

`pending-coordinator-audit.json` is `[]`. Applied file has six rows whose `result` strings match the `00:22:23Z` TSV rows.

## Cleanup

`git status --short` empty before this report. `find verify -maxdepth 3 -type l` printed nothing. No `serial-verify.py` process was started.
