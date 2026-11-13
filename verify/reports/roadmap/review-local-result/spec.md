# Spec review: body-local `result` pilot

**PASS.** Head `44809983ca516600292b42a8f2b7db8b4ecc1b78`, archived snapshot matches all 241 blobs [measured]. No findings. Not Q/K delivery (report lines 7, 392).

## Requirements

**Only ordinary locals, no renaming.** `LOCAL_RESERVED` (`verify/source.mjs:688`) is read only by `localName` (`:690`), which is called for var (`:697`) and let/const (`:712`) declarators. The parameter/shadowing, callback, function, module/import and type gates keep `RESERVED` (`:96`, `:182`, `:1034`, `:1254`, `:1257`) [measured].

**Ensures sees the return; invariants and decreases see the live local.** 13 holds/wrong probe pairs gave 13 verified results and 13 native-confirmed counterexamples. They covered block shadows, early returns, branches, loops, typed and multi-declarator locals, var after blocks, arrow and function expressions, closures, helper summaries and `old`. Two loop pairs use the local in invariants and `decreases` [measured].

**Gates preserved.** 11 reject probes fail with the expected message: callback, `every`, destructured and import bindings named `result`; other locals in requires/ensures; loop-body locals in invariants; TDZ and hoisting reads. Focused test 8 passes [measured].

**Pin.** `v1.53.2` is a lightweight tag at `1913a76`. All five pinned files equal the downloads at `1913a76` and main `4d5963e`. The `provenance.json` and declaration hashes recompute [measured].

**Annotation only.** Checker output equals an independent line insertion. Only 4 (sum) and 1 (mean) comment lines differ, the type-stripped AST is identical, and the import and `let result = 0` remain [measured].

**Tests.** Focused tests: 8/8 in the serial lane [measured]. Durable full log: 257/257 at `13df4da` (249 + 8 new). `13df4da..4480998` changes only `local-result.md` [measured], so that result holds at head [inferred].

## Strong/weak controls

9 controls: 0 unexpected, 0 false proofs. Every verified outcome held on 12 native arrays [measured].

- C0 verifies through the original import, and C1 (`result === 0`) suffices.
- C2/C3 (weak sum contracts `true`, finite-only) leave mean unknown/contract-gap. Mean's bytes are unchanged and the graph hash changes.
- C4 (false `Object.is(result, 1)`) gives a confirmed `[]`→0, and the caller is unknown/dependency.
- C5 (`/(length+1)` mutant) gives a confirmed `[]`→0.
- C6 (unguarded NaN) gives `[0,0]`→0.
- C7 (singleton law, false at `[-0]`) and C8 (live-local invariant dropped) do not verify.

No all-sum, nonempty or singleton law is claimed (report lines 279–282) or proved (C6, C7) [measured].

## Non-proofs

The dead-`var`-after-return pair is outside the subset ("Unreachable statements…"). This is not a finding.

## Evidence

Logs, scripts, `commands.md`: `evidence/`; checksums: `SHA256SUMS`. Untrusted downloads were hashed only, never kept or run.
