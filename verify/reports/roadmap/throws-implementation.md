# Guarded throws and the harmonicMean campaign

Implementation status: PASS for the assigned scope. Independent review and Q
completion belong to the coordinator.

## Code and scope

The prepared checkout is
`/Users/rick/.t3/worktrees/verified-list-ui/t3-7c06aa52`, branch
`t3/guarded-throws-harmonic-mean`, prepared parent
`dedde91b9f6e1fec3a30f5e39cae65f5381b6b26`.
`32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor and `verify/` exists.

The tested code is `b16d07b9fa7514b60084377959e2d155385d49ce`.
Local commits are `eab8593` for the source rule and behavior tests, and `b16d07b`
for the maintained upstream fixture and checker. This report and captured
artifacts are recorded separately without further semantic changes.

The source event, collector span, and diagnostic derive from candidate A Codex
`f5473537eb543470feef3f886e778f2737f8ed43`, selected by independent judgment
`e97d03da4fbe664b78640ac19b5576c6da21ac63`. Candidate B Grok
`f5c3d471afda371b5f3805ee888c9d0e4688c38e` remains scratch evidence. Its opaque
admission, loader, and verified-report additions were excluded. Candidate and
upstream-validation files were read with `git show`; no other checkout was edited.

The core diff adds 14 lines and removes one. `source.mjs` admits only unshadowed
`throw new Error("literal")` with exactly one string literal argument. For each
current path it emits `{guard: path, safe: "false", assume: "true"}`, with kind
`throw-unreachable`, the throw span, `abstract: unit.cutpoints > 0`, and the
active loop collector's span when present. It drops that continuation and adds
no return. An always-throwing function still lacks a supported return.

The existing fold supplies preceding helper facts only. Requires remain the
sole feasibility precondition. A throw supplies no fact to its own or later
checks. Definedness ordering and universal proof domains remain unchanged.
Optional-widening retries discard speculative events with the rest of the trial.
`index.mjs` adds one induction-gap message. Its judge is otherwise byte-identical
to the prepared parent.

[static-review.json](throws-evidence/static-review.json) records preserved hashes
for P's phase plan, cache, manifest, evidence, heap audit, numeric semantics,
solver, and backend. No final-verified labels, public witness fields, throw-site
receipt framework, dependency changes, or exception framework were added.

## Maintained campaign

[The executable checker](../../examples/simple-statistics/check-harmonic.mjs)
uses the current `verifyFile` and `reproduce`. The original source and export are
the pinned simple-statistics 8.0.0 file at
`a9ec6767820e3fc7c29ab5f179778308c75a2f47`, SHA-256
`c0bcedc78add016bd1f22ce9eb1a417363ac72d8cb5c0e7dfa4c74062a19f71d`.
Its ISC license SHA-256 is
`63b5b6a85bc21476ebee13febd48d0a52056a695754a73aaed1ed7eafb059f29`.
Provenance comes from candidate A and upstream-validation
`a83f50762005ae47edfe3e07295f3840b485687b`.

All three annotated variants strip to the original bytes and retain every
runtime token. Both strong goals use identical requires and invariant text over
all dense singletons with a finite positive element. There is no fixed input or
reciprocal-finiteness restriction. The invariant retains integer index bounds
and either `i === 0` with a +0 accumulator, or `i === 1` with an accumulator
`Object.is`-equal to `1 / x[0]`. The decreases expression is explicitly exact:
`real(x.length) - real(i)`.

`ensures true` proves total return and termination. `result > 0` produces a
normal-return, replay-confirmed counterexample: reciprocal overflow returns +0.
The final campaign candidate was `3.3951948877e-313`, bits
`0000001000008041`; its reciprocal is Infinity and the result bits are
`0000000000000000`. Native MIN_VALUE and `2 ** -1024` controls also return +0.
Inputs 1 and 2 retain their values. Input 49 returns bits `4048800000000001`
instead of `4048800000000000`, ordinary one-ulp rounding, separate from the bug.
The original empty, negative, and zero input controls throw the documented
messages. They are outside this proof domain.

The weak variant removes only the accumulator invariant. The final campaign
returned `unknown/induction-gap`; the checker also accepts a real native-confirmed
+0 failure. It rejects verified positivity and solver exhaustion.

## Verification and evidence

Every heavy command used
`python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- COMMAND`.
[capture.py](throws-evidence/capture.py) records the exact command, code SHA,
start/end times, exit code, log hash, and core hashes before and after each final
run. It fails if the core changes during a run.

The final commands, run from this checkout, are:

```sh
python3 verify/reports/roadmap/throws-evidence/capture.py focused-P -- node --test --test-concurrency=1 tests/verify/guarded-throws.test.mjs tests/verify/cache.test.mjs tests/verify/workflow-cli.test.mjs tests/verify/manifest.test.mjs tests/verify/proof-backends.test.mjs
python3 verify/reports/roadmap/throws-evidence/capture.py campaign-final -- node verify/examples/simple-statistics/check-harmonic.mjs verify/reports/roadmap/throws-evidence/campaign-final
python3 verify/reports/roadmap/throws-evidence/capture.py full -- make test-verify
python3 verify/reports/roadmap/throws-evidence/capture.py cli-reproduce -- node verify/bin/jsverify.mjs reproduce --json verify/reports/roadmap/throws-evidence/campaign-final/positive.evidence.json verify/examples/simple-statistics/harmonic-positive.js
```

| Check | Result | Evidence |
| --- | --- | --- |
| Initial focused throw controls | 8 passed | [log](throws-evidence/focused-throws-v1.log) |
| Focused maintained harmonic checker test | 1 passed | [log](throws-evidence/focused-harmonic.log) |
| Final focused throw and P workflow/cache checks | 37 passed | [capture](throws-evidence/focused-P.run.json), [log](throws-evidence/focused-P.log) |
| Fresh final campaign and P evidence roundtrip | PASS | [capture](throws-evidence/campaign-final.run.json), [checks](throws-evidence/campaign-final/checks.json) |
| Full `make test-verify` once on final code | 331 passed, 0 failed/skipped | [capture](throws-evidence/full.run.json), [log](throws-evidence/full.log) |
| CLI reproduction of fresh numeric evidence | reproduced, exit 0 | [capture](throws-evidence/cli-reproduce.run.json), [log](throws-evidence/cli-reproduce.log) |

The throw controls cover guarded and reachable paths, nested branches,
requires-false vacuity, malformed exact-real requires definedness, earlier and
later helper facts, impossible helpers, final dependency gating, in-loop and
post-loop gap attribution, widening retry, dead computed/shadowed throws, other
throw values, and `try`/`catch`. Unsupported forms retain the original span.
Old programs have byte-for-byte equivalent compiled targets and exact phase
queries, and identical default reports, compared with archived parent modules.

A private source-copy mutant trivializes the throw event. It false-verifies the
boolean example with feasibility witness `flag = false`; native false returns
0, and native true throws `boom`. The behavioral assertion detects that false
verification. It exposes no witness fields on verified public reports. Temporary
copies and dependency links are removed after the test.

The parent-model control produces real evidence and a proof receipt with
`dedde91` modules. Current reproduction refuses that evidence with a model
identity mismatch, and current planning finds no old receipt hits. The old
identity is `ec47724f52d33b0a4ee841d7bf3dea5d4fcbd4663a917a5e1399927ba0eb391c`;
the new identity is
`86f9e10064d037421d83775d3a2d35d8ddaffa18c9c81d590a175a9332007826`.
Fresh current-model evidence reproduces. Historical artifacts remain unchanged.

[positive.evidence.json](throws-evidence/campaign-final/positive.evidence.json)
is the fresh artifact bound to the tested code's semantic identity and current
source graph `48f186e1e6a863fc581597ff8f49aba20831ad1e474567773caa457170c70469`.
The graph includes the annotated source and the repository's package-scope
metadata. Original and preferred witnesses reproduce through P, including a
relocated identical graph. Changed source returns `stale`; changed model identity
returns `invalid-evidence`. The total proof produces one warm receipt hit;
the numeric bug produces no proof receipt. See the adjacent original/preferred
reproduction reports, negative controls, total receipt, and model manifest.

The final captures all name code commit `b16d07b` and confirm unchanged core
hashes. The full suite ran once, with 331 passing tests, no failures,
cancellations, skips, or todos. All 44 checks in
[SHA256SUMS](throws-evidence/SHA256SUMS) passed. From the repository root, check
them with:

```sh
shasum -a 256 -c verify/reports/roadmap/throws-evidence/SHA256SUMS
```

[cleanup.json](throws-evidence/cleanup.json) records completed command sessions,
the removed dependency link, and the final process check. No owned test process
or dependency link remains.

## Failed setup checks

[experiments.json](throws-evidence/experiments.json) records the initial commands
and statuses. The first harmonic check searched declarations alone for a
division expression; the expression belongs in postconditions. The second
proved both goals' expected outcomes and reproduced the bug locally, then
correctly got `stale` from an incomplete relocation that omitted package-scope
metadata. The corrected control preserves the complete graph before changing
source. Both failed logs and partial artifacts remain. Neither required a
production change or weaker assertion.

An initial static ownership assertion used a recursive git pathspec and included
the nested campaign checker. The corrected check compares direct semantic-module
children of `verify/`; this correction is recorded in `static-review.json`.

## Trust and limits

Only unreachable throw paths are supported. Native exceptions remain
`unknown/replay-mismatch` and are not confirmed throw bugs. Unconfirmed abstract
checks inside or after loops are induction gaps. Normal-return numeric failures
still need unchanged-source replay to become confirmed counterexamples.

The parser, type stripping and resolution, source snapshots, source-to-SMT
translation, binary64 encoding, exact specification replay, heap monitor,
unmodified standard builtins, Z3 and its WASM bindings, and Node remain trusted.
Cache integrity requires trustworthy writers; readonly mode does not authenticate
receipts. One native witness is not a proof or an independent certificate.
Heap evidence retains the original witness and explicitly skips unsupported
shrinking. No arbitrary JavaScript, larger-array, or package-wide claim follows.

No subagents, pushes, PRs, merges, external comments, watches, maintainer messages,
or canonical roadmap/audit changes were made. Independent review and Q completion
are outside this implementation's scope.
