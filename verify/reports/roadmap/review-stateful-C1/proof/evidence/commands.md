# Commands for this review

Archive of code head `5d8415aa8279cab2f4a662b049616ce9d94a98a3`:

```
git archive 5d8415aa8279cab2f4a662b049616ce9d94a98a3 | tar -x -C /tmp/c1-review-stateful
```

The probes imported that tree. Solver commands used
`python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py`.
Node was `v22.23.1`. The temporary `node_modules` link pointed at
`/Users/rick/verification-vibes/verified-list-ui/node_modules` and is removed
after the report commit.

## Executed here

Solver adversary matrix. Exit 0. Rows are in `adv-results.json`.

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node /tmp/c1-adv.mjs
```

Script: `adv.mjs`.

Follow-up probes, then transitions and boundaries. Exit 0. Combined log:
`adv2-transitions-boundaries.log` (adv2 JSON, then 7 pass, `duration_ms 9680.937584`).

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- bash -c 'node /tmp/c1-adv2.mjs && node --test --test-concurrency=1 /tmp/c1-review-stateful/tests/verify/stateful-transitions.test.mjs /tmp/c1-review-stateful/tests/verify/stateful-boundaries.test.mjs'
```

Script: `adv2.mjs`.

Frontend only, in the same shell as the first hash check. No Z3. Log:
`frontend.log` (4 pass, `duration_ms 94.397959`).

```
node --test --test-concurrency=1 /tmp/c1-review-stateful/tests/verify/stateful-frontend.test.mjs
```

Admission scan, no Z3. Script: `admission-scan.mjs`. Log: `admission-scan.log`.

```
node /path/to/admission-scan.mjs
```

The scan imports `/tmp/c1-review-stateful/verify/stateful/machine.mjs`.

## Reused, not re-executed

Receipt `focused-02.log` 47/47 and `full-final.log` 304/304.
Receipt `outcomes-01.log` 29/29. Hashes are in `hash-check.txt`.
These logs are implementation evidence. They are not this review's soundness claim.
