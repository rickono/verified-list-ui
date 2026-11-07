# Named local imports

This document records the baseline import design. [Project frontend](project-frontend.md) extends its syntax and resolution policy, including resolving type imports and hashing metadata. The identity, replay, and snapshot rules below remain in force.

`verifyFile(entry, {timeoutMs})` verifies contracts across local files. `verify(source, {file})` remains a source-string interface and performs no filesystem reads. Both feed one proof, replay, and outcome policy.

```js
import { verifyFile } from "./verify/index.mjs";
const report = await verifyFile("caller.ts", { timeoutMs: 10000 });
report.modules;     // canonical file, raw-byte hash, resolved import edges
report.graphSha256; // entry-relative graph identity
report.outcomes;    // declared function name, file, span, line, column, verdict
```

## Identity and scope

A function's internal id is its canonical file followed by `#` and its declared binding name. An identifier cannot contain `#`, so the pair is unambiguous even when the path does. Import and export aliases never change that id. Compilation memoization, call events, dependencies, replay stacks, alarms, and final-status maps all use it.

Each module has a map from local names to defining function headers. That map includes declarations and import aliases. Export aliases only populate an export table: `export { f as Number }` does not introduce a local `Number`. Reserved import locals are rejected because builtin operations are recognized by name. Data locals and private function-expression self names take precedence over module bindings.

The compiler separates `cx.scope`, which answers lexical names, from `cx.unit`, which accumulates one target's SMT declarations and ordered call events. At a call, the helper's clauses are interpreted in its defining scope and added to the caller's unit. Argument errors belong to the caller. Errors in a helper's contract retain the helper's file and span through the shared `blame` boundary.

Call proof rules are unchanged. Preconditions stay separate from helper facts; only earlier executed calls can justify a call requirement. Fresh result values receive the helper's return shape and contract, with no body inlining. Every helper's original body is checked independently.

## Snapshot ownership

`modules.mjs` owns filesystem access and canonicalization through `realpathSync.native`. Each run reads every canonical file once. Source, hashes, proof compilation, replay, and diagnostic positions derive from that snapshot. A second request captures a new snapshot. There is no persistent cache.

Only exact relative `.js`, `.mjs`, `.ts`, and `.mts` imports resolve. The loader rejects import cycles at the closing import. A completed file is reused for diamonds and symlinks. Missing entry files reject the API request; missing dependencies become source errors at the import. Invalid UTF-8 becomes an error with its raw-byte hash retained. Decoding preserves a leading BOM, and TypeScript stripping restores it to preserve offsets.

The snapshot keeps discovery order for provenance, entry first, and dependency order for compilation and solving. This preserves source order within each module while placing imported helpers before their callers. All targets share one solver-process deadline. The graph digest covers entry-relative paths, raw-byte hashes, and import edges.

`source.mjs` parses and links the records without executing top-level code. Only supported pure function bindings, named imports, and local named exports are accepted. Every loaded function requires a contract and a supported body. An unsupported construct aborts the graph with the owning source file.

## Replay and diagnostics

Each module has one VM context. Each function identity has one monitored host wrapper installed under all local names referring to it. Originals and predicates compile in their defining module's context. Bodies are original stripped source slices, and contracts use lexical formal parameters. The private invocation binding avoids declarations and import aliases. Timed VM invocation applies to bodies and predicates across realms.

The root executes its original body; helper calls pass through wrappers that check domains, requires, result shapes, and ensures. A root's bad call becomes a replay-confirmed counterexample. A violation inside a helper blocks the root and marks the responsible helper. Final dependency gating runs after every replay, using function ids through the whole transitive graph.

An unused import is loaded and checked, but only syntactic calls contribute dependency edges. An unused failing function makes the CLI fail while independent functions can retain their own verified statuses. All diagnostic positions use captured source. The CLI never rereads files.

## Synthesis and limits

Two independent candidates converged on an explicit file API, separate lexical scopes, and one replay realm per module. Candidate A supplied a working prototype and is the base. The independent judge selected it. The synthesis adds whole-import error spans, explicit binding precedence, clearer rejection of erased named type imports, and serial solver-heavy tests. Raw-byte decoding also handles invalid UTF-8 and preserves BOM offsets.

Flattening modules would require renaming bodies and source maps. A caller-supplied resolver would expose file-policy decisions in the public API. A shared global replay namespace would conflate private names. Those alternatives were rejected.

The first slice excludes extension guessing, packages, tsconfig paths, barrels and re-exports, default and namespace imports, side-effect imports, dynamic imports, import cycles, type resolution, recursion, and higher-order functions. `import type` is erased without I/O; an all-type named import that strips to an empty runtime import is rejected. Large graphs and quantified contracts can exhaust the shared budget and return unknown. Canonical case handling depends on the host filesystem.

`check-imports.mjs` uses the pinned Remeda declaration plus one export alias. The composed caller verifies; the shifted caller fails only its prefix contract; weakening the helper's length contract changes dependency provenance and removes the unchanged caller's proof. Tests also cover same-named privates, alias collisions, post-replay gating, syntax rejection, and source positions.
