# TheAlgorithms Reverse report fixture

This directory contains GPL-3.0 source and its original license, separately
from the MIT/ISC fixtures in `verify/examples`. `Reverse.upstream.js`, `LICENSE`
and `provenance.json` are imported byte-for-byte from candidate A (`d9c22c63`).
The original upstream commit is `636017ca51dad05339cde3b5c66cbe1d71957f7e`.
The script preserves every byte of the extracted declaration when it inserts
comments (checked by deleting the insertion), and checks its full token stream.
Only annotations are added for the production proof. The three explicit
mutants change implementation tokens and are identified as mutants.

Run from the checkout root, through the shared lane:

```
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/K-evidence/pilot/check.mjs
```

`--dump DIRECTORY` builds every individual proof query without running a solver.
No length bound enters a full proof; native samples and replay are finite
comparisons. The request budget is 60,000 ms for each complete public verify().
This is a correctness pilot, with no claimed benchmark speedup.

Historical short-bound results both stand: candidate A recorded a confirmed
counterexample in its r2 run (45,404 ms); independent judgment recorded a later
request timeout (60,008 ms) on the same source. See `d9c22c63` evidence.md and
`e581b413` judgment.md. Neither makes the mutant a verified result.
