# Project proof workflow synthesis

This is the selected design for P, not a delivered capability. The existing
roadmap acceptance remains unchanged. Candidate A is Claude `9e1e945`; B is
Grok `8e9ce80`. The independent judgment is `2bc3b46` (12/15 versus 8/15).
The coordinator agrees with A as the base because it exercises real solver
misses, native replay on hits and dependency re-gating within the existing
pipeline. B's compiler-derived ledger is useful evidence, but its verdicts are
injected and its public prove/replay entry points are stubs.

## Usage

Default verify/verifyFile behavior stays unchanged. Optional targets select a
root and its transitive callees. Optional cache enables content-addressed proof
receipts; plan and readonly/audit modes do not write the cache.

```js
const report = await verifyFile("src/cart.ts", {
  targets: ["checkout"],
  cache: { dir: ".jsverify", mode: "readwrite" },
  evidence: true,
});
```

CLI additions are --target, --cache, --cache-mode, --plan, --evidence and replay.
A public evidence artifact is opaque to callers and binds its witnesses to
source/provenance and the verification model. A reviewer can replay a bug or
re-solve/audit a proof. There are no independent solver certificates.

## Ownership and shape

- proofs.mjs owns one authoritative query-phase plan shared by scheduling and
  proof-key construction. Every solver-input field affects the key unless it
  is explicitly diagnostic attribution.
- backend.mjs owns whole-witness validation, reused by live worker answers and
  cache/evidence reads, including heap roots, graph types and model-size caps.
- manifest.mjs owns an Acorn-derived trusted-code closure rooted at index.mjs,
  including cache policy. It follows literal static/side-effect/dynamic imports
  and worker URLs. Unresolvable dynamic code disables caching with a reason.
  Backend identity covers the whole installed solver package and runtime.
- cache.mjs owns optional cache I/O. Entries have format/key/identity/witness,
  not a final status. Exact-query identity can share equivalent obligations
  across targets; target provenance must not turn equivalent-key receipts into
  a single-target global ledger.
- index.mjs retains one read-once snapshot, compile, replay and final dependency
  gate. Cache hits replace solver work only. A rejected witness or failed hit
  replay is re-solved once and repaired in readwrite mode. Audit re-solves and
  reports both logical and replay/validation disagreements.
- CLI owns presentation. Reproduce uses current pinned source or an explicitly
  validated snapshot; it refuses stale or incompatible artifacts.

## Required corrections to A

The independent judge reproduced malformed witness admissions, oversized heap
replays, silent poisoned entries, mkdir in read-only/plan modes, missing trusted
code and solver glue, and orphan temporary files. These are implementation
acceptance gates, not optional clean-up.

1. Derive scheduler and keys from the same phase plan.
2. Use a structural trusted-code manifest. Include index/cache policy and every
   imported semantic module. A build change may conservatively invalidate all
   receipts; exact queries provide source-level precision within one build.
3. Hash the whole solver package plus Node/platform/architecture.
4. Reuse the production whole-witness validator and caps on every persisted read.
5. Re-solve and repair rejected/replay-failed hits; audit reports those failures.
6. Readonly, audit and plan create no cache files or directories.
7. Unique random temp names and atomic rename; sweep only recognized stale temp
   artifacts conservatively, without racing live writers or deleting user files.
8. State cache integrity as an explicit trust assumption. Readonly does not
   authenticate origin. Audit re-establishes results by solving again; it is
   not cryptographic authentication. One native witness is not a proof.
9. Move the real probes into public-API tests. Include the nine malformed
   witnesses, identity/import-form drift, actual target invalidation, stale-key
   negative controls, concurrent writers and interrupted writes.

## Grafts and exclusions

Take B's clear pending/blocked dependency diagnostics and residual-not-a-hit
checks. Retain source/config provenance as diagnostics. First delivery keeps
A's strict graph-bound replay rather than adding a second offline-source API.
Shrinking is greedy, bounded replay work; unsupported witness kinds are reported
as skipped, while the original witness remains reproducible.

Reject final-verdict/bug/vacuous caching, replay-free hits, hand-maintained
contract-only keys, a rewritten global ledger, regex manifests, and injected
verdicts as production acceptance. One-run timing ratios are not acceptance.

## Implementation and verification

First isolate judge/replay and shared phase/validator seams without behavior
change. Then add cache, selection, plan, evidence and CLI integration. Focused
checks bracket each unit; the final implementation gets one full suite, CLI
checks, independent adversarial review and a combined run with other landed
changes. No P completion is recorded until the actual node predicate is met.
