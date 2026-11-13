# Stateful foundation acceptance

C1 checks scalar JS/TS modules with external entry calls, explicit operation
contracts and top-level await segments. It proves init, arbitrary step and
interference/keeps obligations over an unbounded multiset of pending
activations. Its public entry is `checkStateful` in `verify/stateful/index.mjs`.
The existing `verify` and `verifyFile` workflow retains its behavior.

The original implementation is `5d8415a`, with report tip `ae60681`. Independent
reviews examined [native replay](review-stateful-C1/replay/REPORT.md)
(`d812b7a`) and [source/induction](review-stateful-C1/proof/report.md)
(`bd790ea`). Both identified the fail-safe missing-loop-contract crash; the
proof review also reproduced silent omission of Unicode-edited clause words.
The coordinator corrected both before publication. The reports found no
executed false proof of an admitted property, within their stated limits.

[The correction record](C1-review-fixes.md) preserves the red/green tests.
`9721f8c` replaces the raw loop TypeError with an original-source unsupported
diagnostic. `67ad05b` recognizes the complete Unicode keyword token before
punctuation extraction, while admission requires the exact grammar spelling.
The direct infinite-continuation replay test still exercises containment.

## Final combined checks

Tested head `0345a9a` includes main `8fa17d6`: P, exact numeric metadata and the
heap write audit. **49/49 focused tests and 371/371 full verifier tests passed**,
with zero failures, cancellations or skips. The final full suite ran once.
All runtime and stateful source hashes stayed unchanged, and the worktree was
clean before and after the run. [The receipt](C1-integration/receipt.json),
[focused log](C1-integration/final/focused.log),
[full log](C1-integration/final/full.log), and hash manifests retain that tree.

The first focused integration attempt was 48/49. Its regression test compared
against `e435c8a`, before the intentional P/numeric encoding changes. The final
test compares complete compiled artifacts, graph hashes and reports against
public main `8fa17d6`, retaining every equality assertion. Tests also stopped
writing committed historical reports. The first log and generated outputs are
preserved under [first-attempt](C1-integration/first-attempt/); historical files
were restored to their original bytes. That failed attempt never started its
full suite. No production change followed from the baseline correction.

The current read-only native-baseline comparison also preserves all queries
across eight cases and thirteen targets. It is a compilation comparison,
recorded in `stateful-C1-evidence/review-current-native-baseline.json`, rather
than thirteen additional solver proofs. Earlier 47/304 implementation totals
remain historical evidence for their original head.

## Scope and trust

Module state and captures use numbers and booleans. Native number semantics
include NaN, infinities, signed zero and request-ID collisions at 2^53. Operation
arguments are captured at suspension. Environment assumptions state legal
outcomes, rejection, settlement order and progress defaults separately from
application properties. Settling eventually is recorded but unused by safety.

All induction units must pass for a safety verdict. A failing abstract unit
earns a counterexample only through a legal native trace that violates a real
property; other cases remain solver unknowns or induction gaps. Witness search
limits affect failure search only. There is no proof event-count bound.

Replay uses unchanged type-stripped source in a strict realm, timed action and
microtask draining, and a contained process. Traces bind source, executable and
assumptions and reject illegal settlements or changed inputs. The frontend,
binding rewrites, shared compiler, induction rule, standard runtime and Z3
remain trusted. Proof certificates and general JavaScript coverage are absent.

R, S, T and U remain incomplete. Cancellation, listener protocols, reference
cells, helpers/imports, nested awaits, exact counts and liveness need their
own implementation and acceptance. C1 does not add P caching or P evidence
artifacts to stateful mode. Its source-compiler seam changes the conservative
P model identity; older P artifacts require their recorded model or fresh
generation.
