# Independent conformance and mutation corpus (node D)

## Scope and grounding

The baseline is ff2518cd7494300084f2ab54da71f4d79185e586. This corpus tests
that baseline's scalar, collection, call, import, and outcome semantics. It
makes no claims about the parallel state, backend, frontend, or specification
extensions. Frontend translation, builtins, V8, and Z3 remain trusted. Passing
finite tests is evidence against mistakes, not a soundness proof or a Rocq
certificate.

`modules.mjs` captures sources and canonical identities; `source.mjs` and
`data.mjs` translate supported functions; `solver.mjs` checks feasibility and
postconditions; `index.mjs` replays witnesses and gates callers on final callee
statuses. The corpus sits outside these modules and uses only `verify` and
`verifyFile`. It does not import the compiler's value, domain, or replay helpers.

## Usage and interface sketch

```
node verify/conformance/run.mjs [--seed UINT32] [--mutations]
make test-verify-conformance
```

The runner emits JSON evidence, including seed, original sources, SHA-256,
assumptions, oracle provenance, native samples, actual verdicts, independently
replayed witnesses, and observed mutation detections. An assertion failure
makes the command fail. Test execution uses the shared serial lane when run
alongside other implementation agents.

`corpus.mjs` exports `buildCorpus(seed)`: small fixtures grouped by feature.
Each fixture contains files, declared import edges, and function metadata
(parameters, requires, ensures, expected status/reason, native samples).
Expected scalar/collection results come from executing the original JavaScript
expression in V8, then expressing that concrete answer as an ordinary contract.
The seed supplies reproducible finite binary64 samples, not large random source
programs. Handwritten universal properties complement concrete examples.

`runner.mjs` exports `runCorpus({seed, verifier, fixtures})` and
`mutations.mjs` exports `runMutations({seed})`. `run.mjs` is the CLI boundary.
The normal verifier is the default; mutants use the
same runner with a verifier loaded from an isolated temporary copy. Each run
writes its fixture modules to an isolated directory for native ESM execution.
It independently checks preconditions/postconditions with timed V8 evaluation,
validates every reported counterexample (including actual call arguments and
an independent parameter-domain oracle), and checks source/hash/import identity.

## Alternatives and choice

A large property-testing framework could generate arbitrary ASTs but would add
shrinking and validity machinery before covering the existing semantic edges.
A table of assertions against internal SMT strings would miss replay and verdict
policy. Small executable fixtures plus a deterministic generator give a smaller
interface and exercise the public outcomes. Future features add fixtures and
oracles without changing the verifier API.

## Mutation contract and soundness decisions

Mutants alter one uniquely anchored semantic site in a scratch copy of the six
verifier modules. No mutation writes into the active verifier. The runner first
checks the unmodified control with the same fixture, then requires a specific
behavioral discrepancy from the mutant. Patch drift, crashes, solver errors,
and resource exhaustion do not count as successful mutation detections.

Targets include arithmetic, SameValue, slice normalization, own-key spread,
call obligations, replay confirmation, final dependency gating, and witness-only
bounds. Deliberately bad source programs are separate fixtures; their reported
counterexamples must execute and fail in JavaScript. Module identity fixtures
use separate native ESM namespaces and raw source hashes.

All native input lengths remain in proof domains. A 257-element native sample
specifically challenges accidental promotion of the 256-element replay limit
into a proof bound. Expensive nested predicates intentionally exercise timed
replay and transitive gating; uncertainty stays unknown. Optional fields cover
both absent keys and own undefined values. Summaries stay opaque.

## Integration and limits

The focused Node test is included by the existing `make test-verify` glob. The
standalone runner is reusable and its JSON can be redirected to an evidence
file. No new package or solver backend is required. Mutation anchors may need
an explicit update when another node changes verifier internals; their tests
fail closed rather than silently skipping a mutant. Native samples are finite;
this is not exhaustive JavaScript conformance or validation of future nodes.

The focused tests execute the actual CLI with mutations and parse its JSON.
Keeping the reusable runner separate from the CLI avoids an async import cycle
when the mutation module loads the runner.
