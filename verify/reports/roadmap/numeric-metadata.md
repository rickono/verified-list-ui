# Numeric metadata, Gate 1 enabling unit

**ISSUES.** Required numeric controls, focused regressions, and all 273 tests in
the final full suite pass. N12 loses
a replay-confirmed baseline counterexample to a solver timeout at the same
20-second budget. Wider solver validity obligations remain open. This is enabling work for independent review,
not a new E or K completion or a proof of reversal.

## Sources and scope

The prepared parent is `eaf23c0ca4a2e61e9d844a84a876755872eb16e7`.
`32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists.
The owned checkout is `/Users/rick/.t3/worktrees/verified-list-ui/t3-a3d2a99a`,
branch `t3/numeric-shadow-metadata`. The implementation commit is
`4c40e079bd82b23f90ff8eb2e9cadadf39cd2526`.

I read `verify/design/mutating-loops.md` at `eaf23c0`, the independent judgment
and numeric scripts/logs/source hashes at
`e581b4134b845b98387ad9f0f92f98d2e9093064`, candidate A's full prototype diff,
and production `data.mjs`, heap focus/storage, source indexing/stores, parameter
domains, and numeric specification consumers. Candidate A
`d9c22c63c5ae15d8f38d6f6873a9f3b779c53a31` supplies the signed representation.
Its author/coauthor credit is retained in the implementation commit. Candidate
B is not imported. Candidate files are unchanged.

Only `verify/data.mjs` changes in production. The port adds exact signed and
half-integer expressions, half-integer equality and joins, and unary propagation.
Possibly absent merges drop every numeric cache. Modulo bits remain private to
the existing checked read boundary. No store helper or source consumer is added.
Heap writes in loops remain unsupported, including a statically dead loop write.
No heap/reference semantics, solver, proof budget, contract, or replay bound changes.

The [invariant note](../../design/numeric-metadata.md) owns the generic width
argument, including carry bits, shifts, numerical equality, zero signs, and index
validity. That mathematical argument is inferred from the constructors and
binary64 representation. The executed solver results below are separate evidence.

| Source | SHA-256 |
| --- | --- |
| Baseline `verify/data.mjs` | `6c53f2fc830558b353ebe9e38147ee7b4dbbb12cbfa2bd15b56f36fa567c17f4` |
| Final `verify/data.mjs` | `63f39ff7edc16e4e4d7f0eef3563c9d7f84d63cef0a475239dfe98f32173c5f6` |
| Unchanged `verify/heap.mjs` | `3a833de64dca47275accc84371a451f84ba5905fea618ffe2935149269e50f9a` |
| Unchanged `verify/source.mjs` | `38bbea4deee14933640511a90336142d1d1bde67793c4ae0f752ced597c52e2e` |

[Final source hashes](numeric-metadata/logs/final-sources.sha256) include the
tests and scripts. [Baseline hashes](numeric-metadata/logs/baseline-sources.sha256)
describe byte-exact parent modules used for comparison. No candidate scratch
tree was substituted for production. Node is `v22.23.1`; Python is `3.9.6`.
The temporary dependency link targets the coordinator's unchanged installation;
both lockfiles have SHA-256
`8a0e19b686e00939f10a597f1a9c3b8ae2c25c1dae10d340cba0a365830afa21`.

## Executed checks

All solver work uses the shared serial lane. Core files stay frozen during a
run. These commands run from the checkout root. For a rerun, the first command
prepares the disposable baseline runtime and checks its recorded hashes:

```sh
node verify/reports/roadmap/numeric-metadata/scripts/prepare-baseline.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/numeric-metadata.test.mjs tests/verify/integer-shadows.test.mjs tests/verify/collections.test.mjs tests/verify/loops.test.mjs tests/verify/conformance.test.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- sh verify/reports/roadmap/numeric-metadata/scripts/run-evidence.sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/numeric-metadata/scripts/remaining-validity.mjs verify/reports/roadmap/numeric-metadata/logs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify
```

The focused test command passed **65/65**, exit 0. Its raw log is
[focused.log](numeric-metadata/logs/focused.log). Two index validity obligations
and an optional index/element test were then added before the final full suite.
Production data stayed at the same SHA throughout.

The final `make test-verify` command passed **273/273**, exit 0, with no skipped
or canceled tests. This was the only full-suite run in this checkout. Its raw
log is [full-suite.log](numeric-metadata/logs/full-suite.log). The suite includes
existing numeric, index/collections, loop, heap/call, conformance, and mutation
regressions. No production correction followed that run.

The evidence script exited 0. It executes the following Node commands under
that single lane lock. `OUT` is `verify/reports/roadmap/numeric-metadata/logs`,
`SCRIPTS` is `verify/reports/roadmap/numeric-metadata/scripts`, and `BASE` is the
temporary `.baseline-runtime` sibling of `logs`:

```sh
node "$SCRIPTS/corpus.mjs" "$OUT/baseline" '' "$BASE"
node "$SCRIPTS/corpus.mjs" "$OUT/final"
node "$SCRIPTS/compare.mjs" "$OUT/baseline" "$OUT/final"
node "$SCRIPTS/validity.mjs" "$OUT/validity"
node verify/check-native-baseline.mjs eaf23c0ca4a2e61e9d844a84a876755872eb16e7
```

The initial baseline-only command was canceled while queued, before lane
acquisition, so implementation could proceed. Its
[queued log](numeric-metadata/logs/baseline-queued-canceled.log) is retained.
The actual baseline run used modules extracted byte for byte from the parent.
The numeric corpus comes from the judgment with N21 corrected to `expect:
"reject"`, its native postcondition corrected to `===`, a NaN input added, and
the `Object.is` N21b twin added. Original sources and per-case SHA-256 hashes
are retained in both `corpus.jsonl` files.

## Public behavior and native replay

Both runs executed 48 corpus sources and 106 unchanged native executions.
The baseline produced 33 confirmed counterexamples, 12 proofs, and 3 timeouts.
The final tree produced 33 confirmed counterexamples, 14 proofs, and 1 timeout.
Neither run falsely verified a tested native failure. These counts are samples
and solver verdicts, not a universal translator proof or a performance claim.

| Required case | Final measured outcome |
| --- | --- |
| N01, `((n/2)+1)-(n/2) === 1` | Confirmed counterexample at `9007199254740991`; native result `0.5` |
| N08, half of signed zero | Confirmed counterexample at `-0` |
| N17, modulo index wrap at `2^32` | Confirmed counterexample; out-of-bounds read remains undefined |
| N21, numeric index identity | Confirmed NaN counterexample, as required by `NaN === NaN` being false |
| N21b, `Object.is` index identity | Verified, including native NaN input |
| N23, NaN index | Confirmed counterexample |
| N24, `-0` index | Verified, including native NaN element |
| N41, absent optional field | Confirmed counterexample with `{}` |

Additional corpus cases exercise safe-integer rounding/cancellation, signed
indices, `2^32`, `2^53`, infinity, fractional indices, signed zeros, NaN, and
optional merges. The new public tests also cover nested signed/half joins and
`verifyFile()`, every unary/arithmetic fallback, optional array elements and
indices, straight-line store domain failures, and the loop-write ban.

## Mutations and validity limits

The focused run's private scratch copies change only `data.mjs`. The 64-bit cap
mutant falsely verifies N02; the guard deletion falsely verifies N17. Independent
unchanged native executions violate both contracts. The unmodified controls
return confirmed counterexamples. Both tests require that exact false-proof
observation. A crash, unsupported result, or timeout cannot kill either mutant.
Patches and source/mutant SHA-256 hashes are in `focused.log`. There is no
production mutation flag.

The initial validity run proves 11 symbolic width-two obligations `unsat` against
original FP terms, including signed/half arithmetic, comparison, equality,
negation, merges, index range, and modulo bits. Widths 32, 50, and 51 each time
out on their first query at 5 seconds. The remaining queries are explicitly
marked `not-run` in that initial log. The separate remaining-validity command
executes only those independent skipped queries; no timed-out query is retried.
It exited 0. Across both logs, all 38 distinct queries were attempted once:
15 are `unsat` and 23 are `unknown` with solver or worker timeout reasons.
The four wider proofs are signed comparison at widths 32 and 50 and
half-integer equality at widths 32 and 50. No query returned `sat` or an error.
The separate pass does not promote a timeout to a proof or hide an earlier
`not-run` row.

The [SMT files](numeric-metadata/logs/validity) contain the exact negated
obligations. [validity.jsonl](numeric-metadata/logs/validity.jsonl) and
[remaining-validity.log](numeric-metadata/logs/remaining-validity.log) preserve
statuses and worker timeout messages. Small-width proofs and sampled native
tests do not establish every width. The generic range argument remains a
separate justification for the production rules, with translator trust explicit.

## Comparisons and open outcomes

[comparison.json](numeric-metadata/logs/comparison.json) compares identical source
hashes, exact native observations, and full unprojected obligations. It records
13 changed numeric obligation files and four changed verdicts. Signed and half
comparisons/equality now use exact component sums; signed indexing uses checked
modulo bits; safe-integer predicates can use exact integer metadata. N19's store
query changes through those predicates, while its store conversion and domain
obligation remain intact. N08 retains `Object.is` on the original FP term while
its numeric `> 0` comparison changes. N12's inner signed inequality changes even
though its wider addition correctly drops metadata. N01's obligations are
unchanged. No obligations are removed or hidden by a changed projection.

Full query JSON is stored as lossless `.queries.json.gz` files. The first run
wrote raw JSON; compression was verified by decompression and exact byte equality.
Re-running the same comparison after compression produced byte-identical output.
[Uncompressed hashes](numeric-metadata/logs/uncompressed-queries.sha256) retain
the original query identities. The existing native-baseline comparison is
unmodified and reports `identical: true` across eight cases, including split
proof/witness fields;
its [raw output](numeric-metadata/logs/native-baseline.json) includes Node's
experimental type-stripping warning after the JSON.

Measured N12 changes from a confirmed baseline counterexample to `unknown /
request-timeout` on the final tree at the same 20-second budget. Its hand native
input still returns `1` against the false `result === 0` contract. The earlier
judgment inherited a timeout on both trees; this fresh baseline run instead
confirmed the failure. Both records stand. N21 changes from baseline timeout to
confirmed counterexample, and N21b/N35 change from timeout to verified. These
are single executions, not timing ratios or a speedup claim.

No reversal pilot was run, and no K/compiler capability is claimed. Independent
acceptance and combined K checks belong to the coordinator.

## Delivery and cleanup

The implementation commit retains the candidate's coauthor and both source
commit references. A second local commit records this report, raw logs, complete
compressed queries, SMT obligations, and hash manifests. No push, PR, merge,
upstream comment, watch, deployment, canonical roadmap, or audit edit occurred.

The disposable baseline runtime and this checkout's temporary `node_modules`
symlink are removed. No owned test or solver process remains. The
[cleanup receipt](numeric-metadata/logs/cleanup.txt) records the checks.
`SHA256SUMS` covers the final artifacts and production/test sources. From the
checkout root, `shasum -a 256 -c verify/reports/roadmap/numeric-metadata/SHA256SUMS`
checks that receipt. The second commit's worktree status is clean.
