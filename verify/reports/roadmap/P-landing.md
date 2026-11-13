# Project workflow acceptance

P adds target selection, precise proof receipts, no-solver plans and native bug
reproduction. Default verification keeps its existing behavior. A cache hit
replays the current source and passes the current dependency gate; audit solves
again. Cache integrity and trusted writers remain explicit trust assumptions.

The independently reviewed implementation is `c9c4511`, with report tip
`98c06aa`. Its full suite passed 278/278. Two independent reviews passed:
[cache and phases](review-P/cache/findings.md) (`b0b1f70`) and
[workflow and evidence](review-P/workflow/findings.md) (`92aa740`). They ran
adversarial cache, filesystem, source-change, evidence and native replay checks;
their reports distinguish those runs from inherited suite logs.

The coordinator combined P with main's heap audit and the separately accepted
numeric gate at `dedde91`. That exact stack passed **322/322**, with zero failed
or skipped tests. [The combined receipt](P-integration/combined-numeric/receipt.json)
and full log name that tree; this is not a claim that 322 tests ran on P alone.
The tested numeric stack runtime bytes remain unchanged.

On P plus the landed heap audit, the coordinator separately ran the maintained
workflow comparison against published pre-P main `0d7c39c`. Six default reports
and all query phases matched. The unchanged es-toolkit project wrote two cold
receipts, hit both without solving on the warm run, and audited without a
disagreement. All three fixture failures reproduced natively. See
[the workflow receipt](P-integration/receipt.json),
[log](P-integration/workflow.log) and [fresh artifact](P-integration/bugs.json).
The script's public baseline replaces the private checkpoint used by the
historical checker; the historical checker and its checksums remain unchanged.

The first combined wrapper expected the wrong rejection status for historical
evidence after a model change. The product returned `invalid-evidence` with
"The verification model/backend identity changed." The wrapper's final
assertion failed after its full suite, workflows and fresh reproduction passed.
The corrected assertion checked that existing result; the full suite was not
repeated. This failed expectation is retained in the combined receipt.

Model-bound artifacts are historical after a semantic update. The combined
numeric artifact belongs to `dedde91`; the P-only artifact belongs to the P
runtime hashes in its folder. Regenerate evidence for a new model, or check out
the recorded model. Neither a cached witness nor native replay is an
independent proof certificate.

Reproduce the maintained workflow with:

```sh
python3 /path/to/serial-verify.py -- node verify/reports/roadmap/P-integration/check-workflow.mjs
node verify/bin/jsverify.mjs reproduce --json verify/reports/roadmap/P-integration/bugs.json verify/examples/bugs.ts
```

The process lock is a local test-runner convenience. A reviewer without that
helper can run the Node command alone without other solver-heavy jobs.

The runtime diff preserves the reviewed P modules exactly and retains the
landed heap module. The publication commits add reports, selected design and
receipts. Raw failed-experiment logs retain their original whitespace. This
delivery does not complete Q, K or any stateful node.
