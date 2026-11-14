# Rerun the pinned library campaigns

From the repository root, with the existing locked dependencies available, run:

```sh
node verify/reports/roadmap/library-campaigns/check.mjs /tmp/library-campaigns-fresh
```

Use a new output directory each time. `check.mjs` launches every solver and native
check through `/Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py`.
The internal `--run` and `--native-*` modes belong to that launcher. The launcher
has a 600-second outer limit. It kills the process group on that limit or an
interrupt, waits for its child, and rejects a remaining process group.

Exit 0 means the required outcomes and controls held. A source-verifier timeout
never satisfies a proof or a detected-bug requirement. The two deliberately
bounded native `nice` calls produce **observed timeouts**, recorded as
`unknown/unsupported`. They do not become verified results when this checker
passes. The [report](report.md) gives the executed results and limits.

`inputs.json` pins the production modules, existing campaign checkers, source,
contracts, provenance, licenses, package metadata, lockfile, and this checker.
The checker refuses drift. An intentional pin or runtime update requires an
explicit manifest update and a new run with review. The checker also hashes all
825 files of prepared parent `203ad818169be544432b3bad93ff1c4f01ef20a3` before and
after a run. It permits changes only within this package. Do not edit source
during a run.

The retained numerical provenance comes from
`a83f50762005ae47edfe3e07295f3840b485687b`, read with `git show`. The checker
compares the d3 pin and published-contract digest to those local Git objects.
Keep that commit available. No network access or new upstream search is needed.
For example, the exact extraction command for `nice.js` is:

```sh
git show a83f50762005ae47edfe3e07295f3840b485687b:verify/reports/roadmap/upstream-validation/sources/d3-array/24c015e4d894ee44af6cf6a2cc9e300b1885b0d9/src/nice.js
```

The two other copied blobs are the sibling `src/ticks.js` and `LICENSE` at that
same pin. Their original bytes and ISC notice remain in `pins/d3-array/`.
Published documentation is retained as provenance and a short quoted fragment,
without copying the old admission prototype or its obsolete harmonic result.

The run creates the following evidence:

- `run.json` records exact launcher arguments, checkout head, budgets, log hashes,
  the dependency-link location if used, process cleanup, and the protected tree.
- `evidence.json` separates universal proofs, solver-confirmed native failures,
  independent native reproducers, unknown or unsupported results, and finite
  controls. It distinguishes fresh execution, inherited evidence, and inference.
- `harmonic/` contains the current public `checkHarmonic` results, model-bound P
  evidence, original and preferred API reproductions, a warm positive receipt,
  relocated replay, and stale-source and stale-model controls. The separate CLI
  reproduction uses that same fresh evidence.
- `ramda/` contains the current `checkPredicateSearch` reports, with its original
  callback and first-match contracts. The two seeded mutants are controls.
- Native command records include exact arguments, deadlines, exit or signal,
  stdout, stderr, and a liveness check after `spawnSync` has waited for the child.
  These native subprocesses start no workers. Production solver connections
  kill and await their workers on close. The outer launcher checks the whole
  process group after the campaign exits.
- `diagnostic/` contains a modified `nice` copy with a loop-head trace hook and
  its ISC license. It is a diagnostic, never an unchanged-source verifier proof.
- `query-inputs/` contains complete compiler-generated query plans for the three
  harmonic and three Ramda cases. These are reproducible static inputs, including
  full-domain and replay-witness phases. They are **not solver transcripts** or
  proof certificates. Raw API reports and command stdout and stderr are retained
  separately. No internal solver response hook or patched verifier is used.

Keep failed run directories. The checker refuses to overwrite them. This package
does not complete Q or K. Independent review and final integration belong to the
coordinator. The separate composition campaign owns Reverse and helper integration.
