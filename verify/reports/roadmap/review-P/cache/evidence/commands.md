# Commands

Archive and ancestry, from the review checkout:

```
git merge-base --is-ancestor 32bd5b260aa116ca88642a1479bed8d3fc447f4b HEAD
git archive c9c45110b8669f99f83c4330d6efe1b6202ff1be | tar -x -C /tmp/review-p-c9c4511
ln -sfn /Users/rick/verification-vibes/verified-list-ui/node_modules /tmp/review-p-c9c4511/node_modules
```

The symlink was removed after the runs. The shared install was not written.

Static probe, no solver, exit 0:

```
node /tmp/review-p-work/static-probe.mjs
```

Log: `logs/static-probe.json`.

Selected tests, one serial lane, exit 0. Summary in `logs/selected-tests.log`: 21 pass, 0 fail, `duration_ms 27496.56375`.

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- sh -c 'cd /tmp/review-p-c9c4511 && node --test --test-concurrency=1 tests/verify/proof-phase-parity.test.mjs tests/verify/cache.test.mjs tests/verify/manifest.test.mjs tests/verify/cache-io.test.mjs tests/verify/workflow-cli.test.mjs'
```

Solver probe, serial lane, exit 0. Log: `logs/solver-probe.log`.

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/review-p-work/solver-probe.mjs
```

Transitive gate and saved artifact, serial lane, exit 0. Log: `logs/gate-and-artifact.log`.

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/review-p-work/gate-and-artifact.mjs
```

Receipt check, exit 0: 23 SHA256SUMS lines, 0 mismatches. Source hashes at `c9c4511` matched `P-implementation.md`. Lockfiles matched.

Node v22.23.1. The scripts in `scripts/` are the versions that produced the passing logs.

Review evidence checksums, from `verify/reports/roadmap/review-P/cache`:

```
shasum -a 256 -c SHA256SUMS
```
