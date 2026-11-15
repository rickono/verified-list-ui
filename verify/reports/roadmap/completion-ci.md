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

## First hosted result and witness-oracle correction

GitHub run `43653331532` tested head `3b111ad` on Linux x86_64. Installation,
immutable input validation and artifact retention passed. The full suite was
530/531 with unchanged inputs; the campaign was not started. H01-fresh-array
returned `unknown/induction-gap` at ensures, while its test demanded a confirmed
counterexample. The original case's own fixture description says reject means
must not verify. The function returns 0 when n is either signed zero and 1 for
n=1 or n=2. Thus a valid abstract model in its declared domain can replay without
a failure; the observed induction gap is consistent with that zero-iteration
case. The old run did not retain the actual candidate, so its exact bits are
not claimed. Changing to Linux exposed a witness-sensitive oracle, not a false
proof.

The original H01/H02/H03 fixtures and runtime bodies remain unchanged and still
must not verify. Three separate companion contracts permit only native-failing
inputs (n=1 or2, or flag=true). They retain strict confirmed-counterexample
assertions. A signed-zero zero-iteration companion has no native failure and
must not report a counterexample. Function source equality checks confirm that
only the companion contract comments change. No verifier verdict, solver budget
or replay rule changes. The new controls run before the next full hosted suite;
that run remains pending. The first failed hosted artifact is retained separately.
