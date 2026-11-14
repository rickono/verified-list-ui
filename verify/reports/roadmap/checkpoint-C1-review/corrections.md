# Checkpoint documentation corrections

The coordinator accepted the four low-severity notes in the independent
[checkpoint review](report.md). This follow-up changes documentation only.

The graph introduction now says P and C1 are integrated. The generated heap
section names its supported subset and no longer describes P as upcoming.
The C1 correction report links the completed 49-focused and 371-full run.
The P landing report identifies the PR #10 tree `b908127` as the owner of
`P-integration/runtime-SHA256SUMS`, distinct from the isolated and combined
test trees.

The six audit rows timestamped `2026-11-14T00:22:23Z` were recorded after the
coordinator returned from frozen integration branches. Their result text
describes intermediate checkpoints from earlier actions, not the state at the
recording timestamp. The original rows remain unchanged. By that timestamp,
C1 had merged with 49 focused and 371 full tests, both C2 design packages had
completed, and the guarded-throw review had passed. K remained local and
unreviewed. The appended clarification records this distinction.

Validation consists of renderer regeneration, an unchanged runtime diff
against main `41079c5`, and `git diff --check`. No solver suite was repeated.
