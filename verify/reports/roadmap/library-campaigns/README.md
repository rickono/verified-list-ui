# Rerun the pinned library campaigns

From the repository root, with the locked dependencies available, run:

```sh
node verify/reports/roadmap/library-campaigns/check.mjs /tmp/library-campaigns-fresh
```

Use a new output directory. The checker launches every solver and native check
through `/Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py`.
Its internal `--run` and `--native-*` modes belong to that launcher. The outer
limit is 600 seconds, including the lane wait. On timeout or interrupt, the
launcher kills its process group, waits for its child, and rejects remaining
processes. Do not edit files or change HEAD during a run.

Exit 0 means every required outcome and control held. A verifier timeout never
satisfies a proof or detected-bug requirement. The two bounded native `nice`
calls remain observed timeouts classified as `unknown/unsupported`.
[maintenance.md](maintenance.md) records current results and limitations.

## Check fixed inputs before loading verifier code

`inputs.json` schema 2 separates immutable library sources, annotations,
licenses, provenance, adapters, and documentation from the current verifier.
Every fixed digest is checked before semantic verifier imports or lane launch.
The retained independent review is the pinned attestation for the published d3
document digest, coverage sentence, and example. No fresh document download or
document-byte validation is claimed by the default checker.

Inspect this boundary without a solver or verifier import:

```sh
node verify/reports/roadmap/library-campaigns/check.mjs --inputs-only
```

The reviewed d3 source and ISC license bytes are vendored in `pins/d3-array/`.
Default runs need no unpublished Git objects and have no network dependency.
If the historical validation object is available, this optional command also
compares its source, license, and full document bytes:

```sh
node verify/reports/roadmap/library-campaigns/check.mjs --inputs-only --check-history
```

That explicit history check fails when the object is absent. Do not fetch
private history to run the maintained campaign. An intentional immutable-input
change requires a reviewed pin update and fresh execution.

## Freeze the current runtime and generate new evidence

The verifier has no fixed historical hash allowlist. Each run records actual
current HEAD, its tree, tracked working changes, every current tracked file's
working-byte hash, all files under `verify/` outside `verify/reports/`, and the
report checker's executable and configuration bytes. This includes files added
since the historical campaign and untracked runtime files. It never labels
today's working bytes with the old prepared-parent tree.

The supervisor freezes inputs before waiting for the lane. The child requires
the same snapshot before importing semantic modules. The current
`runningIdentity()` binds that snapshot to its module closure, installed
dependency digests, Node version, platform, and architecture. The complete
snapshot and running identity must remain equal after execution. A new runtime
requires fresh solving and replay in a new directory. Historical evidence and
receipts do not establish current proofs.

The run retains:

- `run.json`: exact command, HEAD, tree, snapshot digest, budgets, log hashes,
  dependency-link location, and process-group cleanup.
- `supervisor-freeze.*.json` and `freeze.*.json`: complete before and after
  inventories. `model.json` records the current running identity and snapshot.
- `input-boundary.json`: fixed-input digests and the distinction between
  inherited documentation attestation and optional local history validation.
- `evidence.json`: fresh proofs, solver-confirmed native failures, independent
  native reproducers, unknowns, finite controls, and inherited es-toolkit scope.
- `harmonic/`: universal total-return proof, positivity failure, fresh P
  evidence, original and preferred API replay, relocated replay, warm current
  proof receipt, and stale-source and stale-model controls. CLI replay uses the
  same fresh evidence.
- `ramda/`: the substantial first-match theorem and both seeded mutant reports
  from the unchanged pinned public adapter. Mutants are controls, not real bugs.
- Native command records: exact inputs, deadlines, exit or signal, raw logs,
  and PID liveness after wait. The unchanged-source d3 timeout observations
  remain separate from the instrumented cycle diagnostic and admission result.
- `query-inputs/`: compiler-generated static plans for all three harmonic and
  three Ramda cases. They are inputs, not solver transcripts or certificates.

## Run focused maintenance controls

With dependencies available, run:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/library-campaigns/test-maintenance.mjs /tmp/library-maintenance-tests
```

The tests use disposable ordinary copies under this package. They reject fixed
source, license, provenance, adapter, contract, and attestation drift before
semantic imports. A precise Git shim denies only the named unpublished object
and forwards other commands. The model control rejects historical P evidence,
changes only a fixture's verifier, and requires a new snapshot for that model.
It does not solve a theorem. The separate full campaign supplies fresh solver
evidence. Failed run directories are retained.

## Check current and historical inventories separately

For this maintained package, run from the repository root:

```sh
shasum -a 256 -c verify/reports/roadmap/library-campaigns/maintenance-SHA256SUMS
```

`report.md`, `manifest.json`, `integrity.json`, `cleanup.json`, the original
`evidence/`, and the 161-line `SHA256SUMS` are historical records. That inventory
belongs to evidence tip `7e6d9b56c36e89dac9d9b7943771feb8af4dd0ab`, whose final
campaign tested `42567fc7b286e2a8e838279396fcb444e1118253` under model
`13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106`.
It does not describe the maintained checker, inputs, or provenance at today's
HEAD. Its bytes and raw historical records remain unchanged. The current
inventory includes those records and the new maintenance evidence.

This package does not complete Q or K. The frontend, binary64 translation,
loop abstraction, exact specification replay, Z3/WASM, Node, and unmodified
builtins remain trusted. Receipts require trusted writers and are not proof
certificates. The cycle argument assumes deterministic pure builtins.
