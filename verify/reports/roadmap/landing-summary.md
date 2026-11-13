# Landed prerequisites for the remaining roadmap

H and G landed on main after independent exact-patch reviews by Claude Opus 5.5.

| Node | Reviewed head | Verdict | Merge | Executed evidence |
| --- | --- | --- | --- | --- |
| H | `37355cc` | PASS+NOTES | `eb135b5`, PR #5 | 219/219 tests, 20 callback tests, 12 mutants, 29 adversarial probes, unchanged Ramda declaration |
| G | `32bd5b2` | PASS+NOTES | `8bbff6e`, PR #6 | 249/249 tests, 92 probes at head, CLI JSON/text, four heap mutants |

The G review records five wrong probe expectations, their causes, and corrected
neighbor cases. They are not omitted from the acceptance record. Reports keep
scope gaps separate from defects.

Both merges were read back from GitHub as MERGED on main. Retargeting G after H
kept patch id `4e012b932dac875d32b90b499cf03050485450c9`, so its independent
review still described the exact patch. Merge commits preserved ancestry; no
history was rewritten. The coordinator's runtime modules, CLI and verifier
tests remain byte-identical to `32bd5b2`.

The README now removes two stale reference-identity rejections noted by G's
review. It also names predicate-table replay as a trust component. This last
point applies to feasible-witness checks as well as bug replay; the H review's
note described the impact too narrowly. The production policy still requires
native replay and dependency gating before a verified result is reported.

The exact-record domain is an explicit input assumption, not TypeScript's open
structural type semantics. Future real-code pilots must preserve that
restriction visibly or extend the model before using broader inputs.

These prerequisites do not complete K, P, Q, R, S, T, U, V or W. In particular,
heap-writing loops and stateful callbacks are not capabilities of these merges.
