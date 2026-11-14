# K Gate 3 review: source semantics

**PASS.** No executed product defect on this axis. K completion stays coordinator-owned. This review does not mark a roadmap node complete.

## Checkout

Review checkout `/Users/rick/.t3/worktrees/verified-list-ui/t3-bdd63248`, branch `t3/review-k-semantics`, HEAD `bd0d9570e8f910a8cf7db14cf517728ba3fd673e`. Baseline `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists. HEAD contains coordinator `41079c5d22ba889005075d23ffd5ef5ca7a1e600` and has the same `verify/source.mjs` and `verify/heap.mjs` blobs. That runtime has no K cutpoints.

Reviewed archives, not this worktree's compiler:

- Parent `dedde91b9f6e1fec3a30f5e39cae65f5381b6b26`
- Core `bc9fec06ff535da4fa87012904775ec6eece2804`
- Tested tree `00e5fc4244f6f756b045e2ea4b6af9ddaaf1715b`
- Evidence tip `7a98698ea421bf22ff6e5e057ac62842ca9f0c7f`
- Chain `85d121d57383c0a56368270b50e660d5a9dc828e`, `78de4665b041070072bbb31ad2b0dec84abc8a9e`, `098160fdc417a4eb8db04cc3d8d3ea2cdb95e74e`, then the three above

Judgment `e581b4134b845b98387ad9f0f92f98d2e9093064` selects candidate A. Execution used `git archive` of `00e5fc4` (source and heap blobs match `bc9fec0` and `7a98698`). Node v22.23.1. Solver work went through `serial-verify.py`. The temporary `node_modules` link and the archive were removed. No review process remains.

## Production diff

Parent to core changes `verify/source.mjs` by +57/−24 and `verify/heap.mjs` by +25/−1. `verify/data.mjs`, `verify/proofs.mjs`, `verify/index.mjs`, `verify/cache.mjs`, `verify/manifest.mjs`, and `verify/evidence.mjs` are byte-identical on the parent, on K, and on this HEAD. `data.mjs` SHA-256 is `63f39ff7edc16e4e4d7f0eef3563c9d7f84d63cef0a475239dfe98f32173c5f6`. It exports no `indexBits`, and K's `source.mjs` does not mention `indexBits`.

Array stores still emit the original domain obligation (`present`, `Number.isInteger`, `>= 0`, `< length`) and then `frame-write`, before later postconditions. The address comes from one `data.index` callback. A signed last index compiles to `(bvsub (heap_length …) …)`. A non-literal `2^32` index compiles to `fp.to_ubv` of the full value. Obligation order on both is `store-domain`, `frame-write`, `ensures`. `00e5fc4` changes only `tests/verify/numeric-metadata.test.mjs`.

Call order is unchanged: requires, then frame inclusion, then ensures. `target.allocates` is new metadata. A loop call sets it only after the allocating-helper rejection. `old(...)` still evaluates in the function-entry environment. Proof queries for feasibility and postcondition do not gain a distinct length bound; the replay-witness phase is where that bound is added. A local array with no parameter made `smallWitness` and `pre` both `"true"`, which is why a raw equality check looked dirty.

## Own execution

Archive setup, then:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/review-K/semantics/probe.mjs
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/reports/roadmap/review-K/semantics/followup.mjs
```

Logs: `probe.log`, `followup.log`. Both process exit codes are 1 because the harness summaries counted two unsupported reference reassignments and two intended proofs. The rows below are the verifier outcomes.

Confirmed domain failures, each with native behavior that does not perform the element write: computed `n === 4294967296` (845 ms), computed `Number.isNaN` (824 ms), computed `n === 1.5` (1021 ms), and signed `j = -1` (874 ms, native `j = -1`, element 0 unchanged). Literal `4294967296`, `1.5`, and `NaN` are rejected as named properties. An `undefined` index is rejected as a non-numeric index. A store inside `requires` is rejected.

Verified, with native agreement where measured: index `-0` write and `-0` read return 7 (159 ms, 158 ms); `xs[0] += (xs[0] = 5)` returns 6 (166 ms); `xs[(k = 1, 0)] = 7` then `xs[0] === 7` and `xs[k] === 0` (177 ms, 160 ms); loop `xs[0]++` returns 1 (457 ms); fresh array alias, boolean array, and record field (306 ms, 193 ms, 302 ms); `xs.length - 1` store returns 7 (631 ms); `continue` update (305 ms); two sequential loops (344 ms); invariant that restates the pre-loop write (199 ms).

Other solved rows: early `return` without `modifies` is a confirmed `frame-write` (160 ms). A helper `requires` failure is confirmed on the caller while the helper itself verifies (205 ms). A callee missing `modifies` is a confirmed `frame-write`, and the loop caller is `dependency-violation` (214 ms), through the unchanged P modules. A helper that calls an allocating helper is unsupported inside the loop. A stale `xs[0] === 0` invariant after a pre-loop write is an `invariant-init` gap (178 ms); the ensures was true natively, so this is an unproved invariant, and the false invariant was not accepted. `old(xs.slice())[0]` after a pre-loop write is a confirmed ensures failure (772 ms, native `Object.is` false). Admitted `flag && ((xs[0] = 1) > 0)` with a false `result === 0` ensures is an ensures induction gap (196 ms). The statement ternary with the same false ensures is the same kind of gap (212 ms). `let p = a; p = b` is unsupported because reference assignments keep immutable views. That is the slice boundary for owner identity, and the sequence form above is the checked evaluation order.

The unchanged over-swap mutant, alone, was solved at a 60_000 ms budget: confirmed `store-domain` in 2594 ms. Native `Reverse([])` grew the array to length 1. The other three pilot requests were not repeated.

## Inherited evidence

All 85 `receipt.json` input hashes match the `7a98698` blobs, and `SHA256SUMS` matches those inputs. `full-before-oracle-update.tap` is 418 tests, 417 pass, 1 fail: the old numeric test expected `while (false) { xs[0] = 1; }` to be unsupported and observed `verified`. `full-final.tap` is 418 tests, 418 pass, 0 fail, 0 skipped, 0 cancelled. The final 64 public rows are 15 verified, 26 counterexamples, 14 induction gaps, 1 request timeout, and 8 unsupported. Added tests are 96: 92 `K` subtests, 3 trial tests, and the GPL pin test. The renamed heap test is not an addition.

`H39-old-in-loop` is a confirmed counterexample in the first full log and an ensures induction gap in the final log. The final gap does not verify the false contract. The same final log leaves H13, H15, H16, H42, and H43 as ensures gaps. Those are historical corpus rows. A native failure beside an induction gap is not a confirmed tool finding. H01, H06, and the return/break rows that the final receipt marks confirmed were not re-solved here; the fresh-storage, alias, and early-return probes above are the new runs.

`pilot-results.json` at core `bc9fec0` records one run each, budget 60_000 ms: upstream verified in 41_446 ms, lost-temp confirmed in 41_859 ms (length 129), short-bound confirmed in 39_275 ms (length 2), over-swap confirmed `store-domain` in 2_599 ms. Those single durations support no speed claim. The historical short-bound timeout remains a separate earlier outcome. The mutant must stay unproved or failed; this receipt shows it failed.

## GPL Reverse pin

Pinned file SHA-256 `8049944060cfc7e8a3a95cc65f5e097ebb07469c5e8b871b678f151312e88e46` and license SHA-256 `589ed823e9a84c56feb95ac58e7cf384626b9cbf4fda2a907bc36e103de1bad2` match both the archive and the raw GitHub bytes at `636017ca51dad05339cde3b5c66cbe1d71957f7e` (`Data-Structures/Array/Reverse.js` and `LICENSE`). The license text is GPL-3.0. `reverseCases` accepted the declaration hash `a601e235f96a6eb3c572203b73a690bc7e49914b4540561139e7dc91489c70ad`, recovered the declaration, and required token equality after comment insertion. `nativeSamples` passed 11 V8 inputs, including both zero signs and `NaN`. The pilot fixture stays under `K-evidence/pilot`, separate from product examples.

## Integration note

HEAD's `verify/source.mjs` differs from K's parent by the C1 `compileAstUnit` boundary and a missing-contract loop rejection (14 added lines). K's loop rewrite is based on the parent and does not carry those lines. K also adds `target.allocates` and changes store-index selection. A historical complete-compile comparison that expects identical internal metadata needs a scope correction when these are combined. Public solver semantics still need the real checks above. This review did not combine C1 or throws with K. Multiple-helper composition, apart from the single allocating chain and the single writing helper, belongs to the other worker. Q is outside this gate.

## Limits

No full suite rerun. No second solve of upstream, lost-temp, or short-bound. Witness and rank preferences were checked by query construction on one loop, then by the solved positive and negative rows, not by a universal audit. The numeric range argument remains the accepted Gate 1 translation invariant.
