# Current-model library campaign maintenance

PASS for this report-checker maintenance slice. The fresh campaign passed all
10 substantive stages, and the final focused run passed 12 controls. The run
denied access to the unpublished historical validation object. No production
verifier, compiler, application contract, annotation, pinned runtime source,
lockfile, canonical roadmap, or audit-trail bytes changed. This work does not
complete Q or K and has not received independent review.

Unless explicitly described as inference or inherited evidence, the results
below are measured by executed commands and retained artifacts. No predicted
outcome counts as evidence.

## Identify the source that actually ran

Checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-0a646803`.

- Baseline: `32bd5b260aa116ca88642a1479bed8d3fc447f4b`.
- Prepared coordinator HEAD: `5f0fb47a0a822d62537f296ef804d5037eebba5c`.
  Its tree is `8c7270e1f9d23553803e74908e902152d8f21bd3`.
- Tested implementation commit: `524d03a44a7c5b8e151489673753c0a4c6afa2c7`.
  Its tree is `a17853b86d535fd245a8922ad1e2b011138d9b72`.
- Running identity:
  `09d21829d8ea449858782577b32ed5531b112b3fa2b9cfbe06ced64f767b28ef`.
- Frozen current-input digest:
  `ab4a823128de2278bfe6b0ae388470715567e89f230b72948d87d4fa77704db3`.

Baseline ancestry and the presence of `verify/` passed before editing and in the
final audit. Prepared HEAD already includes the intended request-budget cap.
The original model was
`13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106`.
That historical identity is not the model used for these fresh results.

The campaign ran from `2026-11-14T03:38:34.385Z` to
`2026-11-14T03:39:27.640Z`, November 13 in America/Chicago. Node was v22.23.1,
darwin arm64. The receipt commit adds documentation, audit code, and evidence
after the tested implementation. It does not replace the tested HEAD in the
raw run records.

## Preserve and explain the original failures

[The pre-edit reproducer](maintenance-evidence/01-red/reproduce.py) ran against
prepared HEAD with checker SHA-256
`577bc3463fd9606de15c948199d812b6532b233a65155e5090fcf7902e03d17e`.
[Its result](maintenance-evidence/01-red/result.json) records both expected REDs:

1. The default checker exited 1 at `inputCheck`, before semantic imports, with
   `Source/provenance drift: verify/bin/jsverify.mjs`. The old manifest also had
   an obsolete `verify/index.mjs` digest. These are the two changed runtime
   inputs among the historical allowlist, not changed library pins.
2. A disposable copy updated only those runtime hashes. A precise Git shim
   forwarded ordinary Git commands to this repository and denied only
   `git show a83f50762005ae47edfe3e07295f3840b485687b:...`. The old checker then
   exited 1 at its mandatory private-history read. No solver ran.

The raw stdout, stderr, commands, exact historical/current hashes, and shim
bytes remain under [01-red](maintenance-evidence/01-red/). The original source
was not mutated. The reproduction driver is an archival pre-edit command,
not a current-checker prerequisite.

## Separate fixed library inputs from the current verifier

[inputs.json](inputs.json) now has schema 2. Its 27 immutable inputs explicitly
cover source and annotations, licenses, provenance, library adapters, and
documentation attestation. The old ambiguous top-level `files` field is
rejected. All original library-source, contract, license, and adapter digests
remain enforced before importing semantic verifier code or launching the lane.

[campaign-inputs.mjs](campaign-inputs.mjs) inventories the actual current
tracked set and its working bytes. It also discovers runtime files under
`verify/` outside reports and records the current checker/configuration bytes.
The freeze records actual HEAD, its tree, and tracked working changes. It no
longer hashes current files under a historical `preparedParent` label.

The maintained campaign compares the supervisor's pre-lane snapshot with the
child's pre-import snapshot. It binds the current `runningIdentity()` module
closure to those frozen bytes, then requires the same complete snapshot and
identity after execution. This run had 1,457 tracked files, 118 runtime files,
six checker/configuration inputs, and no tracked working changes. All four
campaign snapshots and both final focused snapshots are equal. Installed
dependency hashes and the native runtime are recorded in the current model.

Default d3 validation checks the reviewed vendored `nice.js`, `ticks.js`, and
ISC license against exact digests. The d3 document digest, coverage sentence,
and example are an inherited attestation backed by the hash-pinned independent
review. Default execution does not claim to read the full document or download
anything. `--inputs-only --check-history` explicitly requests optional local
history validation. It passed with the object present and correctly failed
under the missing-object fixture. No private fetch or network access is needed
for normal campaign execution.

## Execute the controls and maintained campaign

The executed commands, from the checkout root, were:

```sh
python3 verify/reports/roadmap/library-campaigns/maintenance-evidence/01-red/reproduce.py
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/library-campaigns/test-maintenance.mjs verify/reports/roadmap/library-campaigns/maintenance-evidence/02-focused
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/library-campaigns/test-maintenance.mjs verify/reports/roadmap/library-campaigns/maintenance-evidence/03-focused
node verify/reports/roadmap/library-campaigns/check.mjs --inputs-only --check-history
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/library-campaigns/test-maintenance.mjs verify/reports/roadmap/library-campaigns/maintenance-evidence/05-focused
python3 verify/reports/roadmap/library-campaigns/maintenance-evidence/04-current/run.py
python3 verify/reports/roadmap/library-campaigns/maintenance-evidence/audit.py verify/reports/roadmap/library-campaigns/maintenance-evidence/06-audit --historical
python3 verify/reports/roadmap/library-campaigns/maintenance-evidence/audit.py --inventory
```

[02-focused](maintenance-evidence/02-focused/result.json) is a retained setup
failure. Eleven controls passed, then the real model import failed because the
initial dependency link pointed to an install without Acorn. The fixture was
removed, subprocesses were waited, and actual source stayed unchanged.
The link was corrected to the coordinator's existing locked install.
[03-focused](maintenance-evidence/03-focused/result.json) then passed all 12
controls on the working implementation. [05-focused](maintenance-evidence/05-focused/result.json)
passed all 12 again at exact implementation commit `524d03a` and retained full
before/after snapshots. No acceptance expectation changed.

The controls cover missing private history, explicit optional-history failure,
fixed source/provenance/license/adapter/contract/attestation drift before import,
existing-output refusal, legacy-input rejection, and changed-model snapshots.
Historical P evidence returned `invalid-evidence` on the current model. A
comment-only change to a fixture verifier changed its identity and could not
bind the old snapshot. These model controls do not solve a theorem.

[04-current/run.py](maintenance-evidence/04-current/run.py) invokes the default
checker with only the unpublished object unavailable. It does not bypass the
input gate or run a substitute campaign. The normal Git probe succeeded, the
old-object probe exited 128, and the default campaign exited 0. The checker
launched this exact serial-lane command, with the absolute output path retained
in [run.json](maintenance-evidence/04-current/campaign/run.json):

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- /Users/rick/.hermes/node/bin/node /Users/rick/.t3/worktrees/verified-list-ui/t3-0a646803/verify/reports/roadmap/library-campaigns/check.mjs --run /Users/rick/.t3/worktrees/verified-list-ui/t3-0a646803/verify/reports/roadmap/library-campaigns/maintenance-evidence/04-current/campaign
```

Public proof budgets remain 60,000 ms. Native finite controls have 10,000 ms,
CLI replay 15,000 ms, each native d3 timeout 2,000 ms, and d3 admission 1,000 ms.
The outer guard remains 600,000 ms. No full 483-test suite or benchmark ran.

| Artifact | Fresh observed result | Scope and classification |
| --- | --- | --- |
| Harmonic total return | `verified`, one new receipt | Universal dense finite positive singleton proof with termination and unreachable throws |
| Harmonic positivity | Confirmed counterexample, native `+0`, API and CLI `reproduced` | Unchanged-source failure; fresh P evidence under the current identity |
| Harmonic receipt and stale controls | Warm hit 1, solved 0; source `stale`; model `invalid-evidence` | Finite controls on a newly written current receipt |
| Harmonic weak invariant | `unknown`, `induction-gap` | No positivity proof follows |
| Ramda eager `findIndex` | `verified`; both mutants confirmed; 42 native comparisons | Universal bounds, match, first-match order, absence, and termination in the unchanged admitted callback domain |
| d3 coverage and finite controls | Counts 1 and 5000 fail coverage; documented example and issue-282 control retain expected results | Fresh independent native observations on unchanged pinned source |
| Two unchanged d3 cycle calls | `ETIMEDOUT`, `SIGKILL`, waited, PID absent | Unknown observations, not nontermination proofs |
| d3 diagnostic | Full head state repeats at iterations 2 and 4 | Finite instrumented evidence plus a conditional pure-state inference |
| Unchanged d3 source admission | Unsupported at `ticks.js:1`, span `[0, 73)` | Current boundary retained; no solver proof of `nice` |

The harmonic witness is `3.3951948877e-313`, bits `0000001000008041`.
Its reciprocal is Infinity, and the original function returns `+0`, bits
`0000000000000000`. The source graph is
`48f186e1e6a863fc581597ff8f49aba20831ad1e474567773caa457170c70469`.
The fresh total receipt key is
`6d91d9d38da709aefe13ff68519350fa4d71f5ffe28a4740243ed730fcd8ae3b`.
Both evidence and receipt bind `09d218...28ef`; no old proof was promoted.

The Ramda source, extraction, annotations, callback domain, native cases, and
mutant checks remain unchanged. There is no added array-length or predicate-table
proof bound. Its callback domain is pure total unary numeric predicates returning
a present Boolean, excluding effects, exceptions, and NaN-payload inspection.
Es-toolkit remains inherited and was not rerun. Its empty-input sum/mean claim
does not count toward fresh coverage.

## Audit inventories, cleanup, and trust

[The final audit](maintenance-evidence/06-audit/result.json) passed eight groups.
It independently checked all 10 stage IDs, all 12 focused controls, 124 recorded
artifact hash references, snapshot/model binding, current receipt/replay results,
unchanged protected files, and live process state. Exact audit commands and
command-output digests are in [commands.json](maintenance-evidence/06-audit/commands.json).

The original [report.md](report.md) still describes tested head
`42567fc7b286e2a8e838279396fcb444e1118253` and evidence tip
`7e6d9b56c36e89dac9d9b7943771feb8af4dd0ab`. The original 161-line `SHA256SUMS`
was checked against all 161 blobs at its owning tip. The historical prepared
parent `203ad818169be544432b3bad93ff1c4f01ef20a3` still has 825 files and digest
`cddcdf5230636188466bce3b4822a4cc877d65811f63146e031d57e2d8a0ec39`.
These optional local object checks validate historical attribution. They do
not bind old proofs to the maintained runtime or become default prerequisites.
Raw historical records, failed experiments, pins, and the old inventory remain
byte-identical to prepared HEAD.

[maintenance-SHA256SUMS](maintenance-SHA256SUMS) is the new current inventory.
It covers this package's current code, metadata, documentation, historical raw
records, and fresh evidence. Only the inventory itself and its derived
[checksum check record](maintenance-evidence/checksum-check.json) are excluded.
The generator also executes `shasum -a 256 -c` and records its actual result.
Current checker SHA-256 is
`03cb953f2272ac6a929302fec047ca54d8022f993687e6fafd77724604a0d09d`.
Current `inputs.json` SHA-256 is
`746a8cf9b990aacf98c167307d4f720532c4c2835e4fefb312d15e315e4da3f7`.

All 43 recorded subprocess PIDs were absent at the cleanup audit. The campaign
process group was absent, no owned command remained, disposable fixtures were
removed, and the temporary dependency link was removed. The source/lockfile and
all paths outside this owned package match prepared HEAD. No upstream messages,
push, PR, merge, watch, deployment, child delegation, or canonical edits occurred.

The frontend, binary64 translation, loop abstraction, exact specification replay,
Z3/WASM, Node, and unmodified builtins remain trusted. P receipts require trusted
writers and are not certificates. Native replay confirms individual witnesses.
Static query plans are not solver transcripts. The cycle argument assumes pure
deterministic `tickIncrement` and builtins and is separate from the unchanged
source's unsupported result. No novelty, current-main status, upstream fix,
arbitrary-JavaScript completeness, or broader roadmap completion is claimed.
