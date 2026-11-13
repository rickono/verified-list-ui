# Evidence for the standards review

Head reviewed, not checked out: `44809983ca516600292b42a8f2b7db8b4ecc1b78`.
Prepared branch remained `t3/cabe7dd3`. No solver command was repeated.
The full suite was not rerun.

## Commands

Ancestor check:

```
git merge-base --is-ancestor 32bd5b260aa116ca88642a1479bed8d3fc447f4b 44809983ca516600292b42a8f2b7db8b4ecc1b78
```

Exit 0.

Standards names at the head (`git ls-tree -r --name-only 4480998 | rg …`): no
`AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`,
`.editorconfig`, ESLint, Prettier, Biome, or pstack path. Loose `style` hit:
`browser/styles.css` only.

Durable log check, from `local-result-evidence/`:

```
shasum -a 256 -c SHA256SUMS
```

All nine listed files: OK.

Log totals read from those files:

| log | observed |
|---|---|
| `focused.log` | 8 pass, 0 fail, `duration_ms 36421.360084` |
| `full-suite.log` | `head=13df4dae5205ec1173b36742a0689ba9ef004c34`, `start=2026-11-13T14:52:19Z`, 257 pass, 0 fail, `duration_ms 343713.02325`, `exit=0 end=2026-11-13T14:58:03Z` |
| `control-base.log` | 0 pass, 7 fail |
| `control-altA.log` | 5 pass, 2 fail (tests 3 and 7) |
| `before-state.log` | three `unsupported` / nonreserved-name outcomes |
| `after-state-initial.log` | `const-local` verified; `let-local-wrong` confirmed counterexample `x`/`result` `1e-323`; `sum-draft` verified |
| `probe2/closure-named-result.log` | `head=13df4da`, verified, confirmed counterexample `x=0` result `true`, named function expression unsupported on erased syntax, `exit=0` |

The eight new test titles are `ok` inside `full-suite.log` (ids 49 and 107–113).

Alternative A test 3 error includes an admitted callback parameter: `apply`
verified and `f` a confirmed counterexample. Test 7 stops on
`replay-mismatch`: `Duplicate parameter name not allowed in this context`
for a parameter named `result`.

## Archive checks

`git archive 44809983ca516600292b42a8f2b7db8b4ecc1b78` into
`/tmp/local-result-standards-4480998`. `pnpm-lock.yaml` SHA-256
`8a0e19b686e00939f10a597f1a9c3b8ae2c25c1dae10d340cba0a365830afa21` matched
`/Users/rick/verification-vibes/verified-list-ui/pnpm-lock.yaml`. Temporary
symlink: `node_modules` -> that install. Removed before the snapshot was deleted.

```
node --check verify/source.mjs
node --check verify/examples/es-toolkit/check.mjs
node --check tests/verify/local-result.test.mjs
node --check tests/verify/es-toolkit-sum-mean.test.mjs
node --experimental-strip-types --check verify/examples/es-toolkit/sum.upstream.ts
node --experimental-strip-types --check verify/examples/es-toolkit/mean.upstream.ts
node --experimental-strip-types --check verify/examples/es-toolkit/sum.spec.upstream.ts
node --experimental-strip-types --check verify/examples/es-toolkit/mean.spec.upstream.ts
```

All exited 0 (`syntax_ok`).

A module import of `annotatedSources` and `nativeSamples` (no `checkSumMean`)
checked pin bytes and hashes against `provenance.json`, including the license
`51f3674294d988d89dbebd31273baaeb3c697a15482d9699b14d1fded2e132a7` (1077 bytes).
Annotated output:

- sum: 739 bytes, `1533bbc2c48962471467f1e9f20f892f71b201983a656d050f19ada968c6de71`
- mean: 524 bytes, `aa4bf214a3b04c95172c5b8d220086ea9d34942ed41aedcde8f1f80e4ddae5b9`

`nativeSamples` length 11, names identical to the implementation report.
Result line: `pin_token_native_ok`. `annotatedSources` asserts both token
streams itself; this run did not reimplement that assert.

No production or candidate file in the prepared checkout was modified.
