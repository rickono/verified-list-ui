# Commands and tested SHAs

Review checkout before this commit: `74c3747afd1c60d334b8c0713be5786dc715111a` on `t3/review-throws-verifier`. That tree has no `throw-unreachable` code. Probes ran from `git archive` snapshots under `/tmp/review-throws-snaps/tested` and `/tmp/review-throws-parent`. Node `v22.23.1`.

```sh
git merge-base --is-ancestor 32bd5b260aa116ca88642a1479bed8d3fc447f4b HEAD
git archive b16d07b9fa7514b60084377959e2d155385d49ce
git archive 769210310b1f4f05856010568c0a1e330538033b verify/reports/roadmap/throws-evidence
shasum -a 256 -c verify/reports/roadmap/throws-evidence/SHA256SUMS
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- /tmp/review-throws-probe/run.sh
```

The checksum command reported 44 OK lines. The final probe command exited 0. Two earlier probe processes exited 1 before any product failure: Acorn could not be resolved from `/tmp`, then the probe's own assertions were wrong. `logs/harness-run1.json` is the second process. The passing log is `logs/results.json`.

| Commit | Role |
| --- | --- |
| `32bd5b260aa116ca88642a1479bed8d3fc447f4b` | Required ancestor |
| `dedde91b9f6e1fec3a30f5e39cae65f5381b6b26` | Patch parent |
| `eab85932e56a86ecfaa559f018bea3049cc4b993` | Throw rule |
| `b16d07b9fa7514b60084377959e2d155385d49ce` | Tested code |
| `769210310b1f4f05856010568c0a1e330538033b` | Evidence tip |
| `8fa17d652d3b6e5b7ebbccc42b2d81e90ead701e` | Numeric merge on the other line; merge-base with the patch is `dedde91` |
| `e97d03da4fbe664b78640ac19b5576c6da21ac63` | Prior judgment, read only |

`verify/source.mjs` blob `fcdabf1c1835f74fad8695e419ad13e346157d7d`, SHA-256 `13950cec087a89a0d688c82ce112de6517096255b77b7dd7efecea5330960db3`. `verify/index.mjs` blob `980fbf75bd1781b946614c06777bc6c88cd1d17e`, SHA-256 `5d2125c2cc86a847873afcad478250d43f682dc8f31960e30c299cff52f47571`. Parent blobs `ecb43e934b05004f88051cc3c951f14f045b2c2e` and `cd0b0539f89aaf845139b9b3861c2cbc249d9968`. `proofs.mjs`, `heap.mjs`, `data.mjs`, `solver.mjs`, `backend.mjs`, `cache.mjs`, `manifest.mjs`, and `evidence.mjs` share one blob each across `dedde91`, `b16d07b`, and `8fa17d6`.

Upstream `src/harmonic_mean.js` and `LICENSE` at `a9ec6767820e3fc7c29ab5f179778308c75a2f47` match the fixture. SHA-256 `c0bcedc78add016bd1f22ce9eb1a417363ac72d8cb5c0e7dfa4c74062a19f71d` and `63b5b6a85bc21476ebee13febd48d0a52056a695754a73aaed1ed7eafb059f29`. Blob `7705c21eebc0898068cc6a5565566b0ec3873c53`.

Semantic identities measured from the archives: parent `ec47724f52d33b0a4ee841d7bf3dea5d4fcbd4663a917a5e1399927ba0eb391c`, tested `86f9e10064d037421d83775d3a2d35d8ddaffa18c9c81d590a175a9332007826`.

Temporary `node_modules` links pointed at `/Users/rick/.t3/worktrees/verified-list-ui/ready-now-coordinator/node_modules` and were removed when the probe script exited. The final process check found no probe process.
