# Independent review of the maintained numerical evidence boundary

**Verdict: PASS.** The report-runner repair keeps immutable library inputs strict, leaves the unpublished object off the default path, and records a current-model campaign whose snapshot matches implementation commit `524d03a`. This review does not complete Q or K.

Checked checkout `/Users/rick/.t3/worktrees/verified-list-ui/t3-738d4adc` at `f383d624d031613dbf22d6a1db92e6b32b26b6c0`, tree `002791fa70cfafe0d5ee4572e242f7bf47038c83`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists. Node v22.23.1, darwin arm64. The tracked tree was clean apart from this review directory. No solver lane was acquired.

## Package bytes

Implementation `524d03a44a7c5b8e151489673753c0a4c6afa2c7` (tree `a17853b86d535fd245a8922ad1e2b011138d9b72`) matches imported `ea9896f6d2e7bc9eabb0d33b57d92d0af7368f6a` on all 82 changed paths. Evidence `8364bfc92a79e231bc556d5521cb59c5f67d8e11` matches this HEAD on all 189 changed paths. The full `verify/reports/roadmap/library-campaigns` tree is identical. Every path is under that directory.

`e5d040dff6d443cb3be80a9a82dfa652d612a379..HEAD` changes only those 189 paths. Verifier modules, the lockfile, contracts, annotations, pins, and the historical raw evidence are unchanged by the import. Since the 483-test receipt head `7feca2830d90e237227fc1522e77e1a11ce3abee`, the only non-report `verify/` change is `verify/design/conditional-completion.md`. That file is outside `runningIdentity()`'s closure. `package.json` and `package-lock.json` match that receipt head.

The 161-line `SHA256SUMS` matches all 161 blobs at owning tip `7e6d9b56c36e89dac9d9b7943771feb8af4dd0ab`, including historical checker `577bc3463fd9606de15c948199d812b6532b233a65155e5090fcf7902e03d17e`. It still names tested head `42567fc7b286e2a8e838279396fcb444e1118253`. `shasum -a 256 -c verify/reports/roadmap/library-campaigns/maintenance-SHA256SUMS` passed 345/345. Current checker SHA-256 is `03cb953f2272ac6a929302fec047ca54d8022f993687e6fafd77724604a0d09d`. Current `inputs.json` SHA-256 is `746a8cf9b990aacf98c167307d4f720532c4c2835e4fefb312d15e315e4da3f7`.

## Boundary executed here

`node verify/reports/roadmap/review-campaign-maintenance/probe.mjs` at the checkout above. Details are `result.json` and `commands.json`.

Under the campaign shim, with `CAMPAIGN_GIT_CWD` unset, as `maintenance-evidence/04-current/run.py` launches the default checker:

- `--inputs-only` exited 0. The only Git command was `merge-base --is-ancestor` of the baseline. The result is `inherited-document-attestation`, `freshDownload: false`, `checkedDocumentBytesThisRun: false`.
- `--inputs-only --check-history` exited 1. Stderr is `fixture: historical object unavailable: a83f50762005ae47edfe3e07295f3840b485687b`, thrown from `campaign-inputs.mjs` during `git show` of that object. The same command without the shim exited 0 and set `checkedDocumentBytesThisRun: true`. The object is in this local database and is not an ancestor of HEAD.
- `freeze()` recorded HEAD `f383d62`, tree `002791fa`, an empty tracked diff, 1577 tracked files, and 118 runtime files. Its Git commands were `ls-files -z`, `rev-parse HEAD`, `rev-parse HEAD^{tree}`, and `diff --binary HEAD`.

The historical checker blob from `5f0fb47` was run from a temporary root with a forwarding Git shim. The default path exited 1 at `Source/provenance drift: verify/bin/jsverify.mjs` after only `merge-base`. The drifted paths were `verify/bin/jsverify.mjs` and `verify/index.mjs`. After those two pin values were updated in the temporary manifest, the checker exited 1 at `inputCheck` on `git show a83f507...:nice.js`.

A disposable copy of the current checker refused comment drift in `nice.js`, `provenance.json`, the d3 license, the harmonic adapter, `harmonic-positive.js`, and the inherited review report. Each exit was 1, named `Source/provenance drift`, and reached neither the semantic-import trap nor the replacement `python3`. An extra `files` key, truncated JSON, and schema 1 each exited 1 before import. Pointing the real checker at the existing campaign directory exited 1 with `Use a new output directory`. `evidence.json` kept SHA-256 `1ffeb632135e4120eb00eed7a56294cb6b3040997573ef16619bb5fbabefcdaa`, and `git status` for the package stayed empty.

`check.mjs --run` against a supervisor snapshot of `{}` exited 1 with `Inputs changed while waiting for the serial lane` and printed no `Starting native-harmonic`.

`runningIdentity()` is `09d21829d8ea449858782577b32ed5531b112b3fa2b9cfbe06ced64f767b28ef`. `bindModel` accepted the live freeze and rejected a zeroed `verify/index.mjs` digest. An untracked `verify/*.mjs` file changed the snapshot digest; deleting it restored the digest. The identity stayed `09d218` because that file is outside the import closure, and the campaign compares the whole snapshot before import and after execution. Historical `evidence/03-final/harmonic/positive.evidence.json` carries identity `13874e722a282704130fc596a91147f0408bb33592127fd13e527c2ceafe4106`. `reproduce()` returned `invalid-evidence`: `The verification model/backend identity changed.` The fresh campaign witness returned `reproduced`. `harmonic_mean([Number.MIN_VALUE])` has bits `0000000000000000` and an infinite reciprocal. Vendored `nice(0.9299999999999999, 0.93, 1)` returned `[0.93, 0.93]`. `verifyFile` on vendored `nice.js` returned `unsupported` at `ticks.js` span `[0, 73)`.

A Node `spawn` of Python `subprocess.run` of Node, the same two hops as `supervise` plus `serial-verify.py`, kept `CAMPAIGN_MARKER` and the shim directory as `PATH`'s first entry. Current `serial-verify.py` SHA-256 is `731d3577afa7a8ba6c4bf7e646f9c4a72d35268057acf3d8ae01b9cd8be4fe1b`, equal to the launch receipt. It calls `subprocess.run` without replacing the environment.

## Receipt versus this run

The retained campaign was not rerun. Its launch record is the default checker on `t3-0a646803` at `524d03a`, status 0, supervisor pid 81813. `run.json` shows that process launched `serial-verify.py -- node check.mjs --run` and exited 0 with `protectedFilesUnchanged`. Launch stdout and campaign stdout share SHA-256 `492ddf4d5cf971fef587072a23760b280d4798caa0ee2369fdce6e43bd6f06c5`. Campaign stderr is empty. The recorded shim hash matches `git-no-private-history.mjs` (`f1433a065e79c0a68728f073cd919235a2008ab1057a8d561c242ef229b982cd`). The wrapper's probes are a normal `rev-parse` of `524d03a` and a denied `git show` of `a83f507`, and the same environment is the one passed to the checker.

All 1,457 tracked-file hashes in `freeze.before.json` match `git cat-file` of `524d03a`. The recomputed snapshot is `ab4a823128de2278bfe6b0ae388470715567e89f230b72948d87d4fa77704db3`. Tracked diff is empty. All 118 runtime hashes equal the tracked hashes. The four campaign freeze files and `05-focused/freeze.before.json` share SHA-256 `8b8b1946750c48530c090f545420b109f68e0bd8f5763eac3e911f4a24839f53`. This HEAD's live freeze is larger, 1577 tracked files, because later root reports, docs, and the audit trail differ. The campaign record names `524d03a`, not this HEAD.

All 10 stages passed: `native-harmonic`, `native-d3`, `native-cycle100`, `native-cycle5`, `cycle-diagnostic`, `d3-admission`, `harmonic`, `ramda`, `query-inputs`, `freeze-and-model`. Harmonic total is `verified` with one warm cache hit, zero solves, identity `09d218`, and receipt key `6d91d9d38da709aefe13ff68519350fa4d71f5ffe28a4740243ed730fcd8ae3b`. Positivity is a confirmed counterexample, bits `0000001000008041`, native `+0`, API and CLI `reproduced`, stale source `stale`, stale model `invalid-evidence`. Weak is `unknown` / `induction-gap`. Ramda upstream is `verified`; `off-by-one` and `skipped-first` are counterexamples; native samples are 42. Both cycle commands are `ETIMEDOUT` / `SIGKILL` with `aliveAfterWait: false`. The diagnostic repeats head state at iterations 2 and 4 for both inputs. Admission is `unsupported` at span `[0, 73)`. Es-toolkit remains an inherited claim. `qComplete` and `kComplete` in the campaign evidence are false.

## Limits and cleanup

The full campaign, the 483-test suite, and the two native d3 hangs were not repeated. Cycle classification uses the retained command records. Receipts still require trusted writers; that trust is the documented cache assumption. The temporary dependency link, extra runtime file, and fixtures were removed. `git status` showed only this untracked review directory. No production, canonical roadmap, or audit file was edited. No push, PR, merge, watch, or child delegation was done.

Evidence: `verify/reports/roadmap/review-campaign-maintenance/result.json`. Commands: `commands.json`. The probe is `probe.mjs`. The freeze-phase Git argv and the historical checker's Git argv are recorded in `result.json`.
