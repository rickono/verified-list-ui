# Continuous validation of conditional completion

The source correction is `776fa71`; the full passing run before it was 530/530
at `1f326fd`. The corrected tree's local full run was 519/531 and the affected
recheck was 26/32. Both retained unchanged inputs and both overlapped repeated
OS sleeps. A utility-scoped idle-sleep assertion did not prevent maintenance
sleep in the second run. Neither failed run is waived or labelled green.

GitHub Actions is enabled for this repository. The workflow runs the unchanged
`make test-verify` command in a fresh Ubuntu 24.04 job with Node 22.23.1,
pnpm 10.15.0 and the frozen lockfile. Solver query/replay budgets and expectations
are unchanged. Campaign inputs are checked before tests. Only a passing full
suite starts the fresh model-bound numerical campaign. Failed logs and inputs
are uploaded too. The job tests the actual PR head with complete Git history,
which the existing baseline parity tests need. This is a validation route,
not a new solver backend or an extra premise in a proof.

The repository now carries the process-locked `scripts/serial-verify.py`.
Its lock lives in the common Git directory so worktrees in that repository
share one lane. The maintained campaign defaults to that portable script.
`JSVERIFY_SERIAL_LANE` selects an existing coordinator lane when needed;
it does not alter compiler or solver options. The current Mac worker continues
using its already assigned external lane. Fresh GitHub jobs use their own
isolated repository and its local lock.

`record-verifier-run.py` saves the command, exact head/tree, Node/platform,
selected GitHub run identifiers, raw log hash, tracked input hashes and before/
after diffs. Nonzero commands or changed inputs remain failures. Digests identify
recorded data; they are not proof certificates. The campaign retains its own
source/dependency/model validation and child-process containment.

Actions are pinned to the resolved upstream release commits: checkout v7.0.1,
setup-node v7.1.0, pnpm/action-setup v6.1.1 and upload-artifact v7.0.2. The workflow
has read-only contents permission and does not publish or deploy software.
Proof receipts are not supplied from a shared cache. Dependency caching stores
package-manager files, not verification outcomes. Remote results are pending;
U remains unintegrated until its acceptance checks pass.
