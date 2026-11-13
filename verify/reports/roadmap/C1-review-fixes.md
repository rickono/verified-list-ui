# C1 native review correction

The native review at `d812b7a` found one fail-safe API crash. At the reviewed
`ae60681` head, a loop passed through the internal AST compiler without parsed
loop contracts reached `undefined.decreases` and rejected with a raw TypeError.
The coordinator independently reproduced it before applying the correction.

Code commit `9721f8cfa5b302e21e78de125ac9a6b07ea60da8` makes that missing-contract case a source-located
unsupported error at the shared loop boundary. Normal parsed loop headers still
follow their existing checks. No loop is admitted, no proof condition changes,
and the stateful frontend remains available to the direct contained native
replay test. Both a synchronous while and a for loop after await now return
unsupported with their original line, column and span.

The focused boundary and native replay run passed **11/11**, including the new
regression and the actual infinite async continuation timeout. Log:
[stateful-C1-evidence/review-loop-fix.log](stateful-C1-evidence/review-loop-fix.log),
SHA-256 `d9f48e71b769ee191d366430425264b366c19d5b0dd58d5c0eba06d386e388c7`.

The unchanged native-baseline comparison against main `58ecbe4` also passed
for eight cases and thirteen targets, including split/witness queries. Output:
[stateful-C1-evidence/review-loop-baseline.json](stateful-C1-evidence/review-loop-baseline.json).
This was a compilation comparison, not thirteen new solver proofs.

The implementation's full **304/304** run remains evidence for its earlier
code head. The full suite was not repeated for this narrow error-path change;
the targeted run and exact legacy query comparison verify the correction.
The native review's earlier 5-test replay log is superseded by its 6-test rerun
and by this focused run. The broader proof review is still pending; C1 is not
yet published or integrated, and no R/S/T/U doneWhen is claimed.
