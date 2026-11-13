# Local result binding and es-toolkit pilot receipt

This unit admits body-local `result` bindings and proves the documented empty
array results of pinned, unchanged es-toolkit `sum` and `mean`. It completes
neither Q nor K. Nonempty sum/mean laws are not claimed.

The implementation head reviewed was `44809983ca516600292b42a8f2b7db8b4ecc1b78`.
It was applied to main `c75502e` without conflicts. All sixteen implementation
files equal that reviewed head byte for byte. A separate comparison confirms
that all 42 top-level verifier modules and verifier test files equal it too.
The additional files contain the two independent reviews and their evidence.

- Implementation: 257/257 tests at `13df4da`; the only subsequent implementation
  commit adds its report. The full suite was not repeated after cherry-picking
  identical source and tests.
- Standards: Grok 4.7, PASS with no findings (`33ffffd`). It independently
  checked provenance, annotation token equality, native samples and log totals.
- Correctness: Claude Opus 5.5, PASS with no findings (`b00f56a`). Focused tests
  passed 8/8; namespace probes produced 13 proofs and 13 native-confirmed wrong
  claims, plus eleven expected rejections. Two other probes remained unsupported.
  Nine contract-strength controls had no unexpected results.
- Coordinator: `node verify/check-native-baseline.mjs 32bd5b2...` reported
  identical obligations, including split and witness queries, for eight cases
  and thirteen targets. `git diff --check origin/main` passed.

The coordinator's first file comparison also matched review scripts because
its git path glob recursed into reports. It failed on those additional files.
The corrected comparison enumerates top-level runtime modules and test files
explicitly; no source difference was waived.

Reports and runnable review evidence are in `review-local-result/`. The original
full/focused/control logs were also preserved locally under
`artifacts/roadmap-20261113/local-result-evidence/` with SHA-256 checksums.

`ensures result` still means the returned value; loop annotations see the live
body local. Parameter, module and callback binders retain the reserved name.
Runtime tokens of the upstream implementations are preserved, with proof
comments as the only additions. Numeric behavior remains binary64.
