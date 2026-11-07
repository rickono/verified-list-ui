# Ready node C: project frontend

Acceptance: fully met for the explicit supported subset. The selected multi-file project loads unchanged real implementations and verifies every loaded function after replay. Unsupported forms have explicit diagnostics.

## Checkout and scope

- Checkout: `/Users/rick/.t3/worktrees/verified-list-ui/t3-35fe4df7`.
- Branch: `t3/implement-ready-node-c`.
- Baseline: `ff2518cd7494300084f2ab54da71f4d79185e586`, verified as an ancestor before writing. `verify/source.mjs` and `tests/verify/` were present.
- Final local commit: the commit containing this report on `t3/implement-ready-node-c`, identified by `git log -1 --format=%H -- verify/reports/ready-C.md`. The handoff message records its literal SHA.
- No original/coordinator checkout changes, delegation, merge, push, publication, or downstream-node implementation.

## Implemented behavior

The frontend resolves local/exported aliases and concrete generic aliases into existing plain-data shapes. Named and default type imports, mixed bindings, type exports, named runtime re-exports, star barrels, local exports of imported bindings, and named default function exports retain defining identities and module scopes. Parameter reports retain expanded types and the defining files/spans of aliases. Return/local annotations validate without adding trusted facts or replacing runtime inference.

`verifyFile` accepts an optional `tsconfig` path; CLI `--project` exposes it. Exact/wildcard paths map to one exact filename. Bare packages use explicit root/subpath exports and a small condition set. Canonical snapshots include configuration/package metadata in `dependencies` and in `graphSha256`. Source-string verification performs no filesystem resolution, including for unused type imports.

All loaded runtime functions still require supported bodies and contracts and undergo verification/replay. Packages supply analyzed implementations, never trusted stubs. Original executable slices, helper-summary opacity, final dependency gating, binary64 semantics, and unrestricted native array proof lengths are unchanged. The frontend, builtins, runtime, and solver remain trusted; there is no Rocq certificate.

## Exact supported subset and limitations

Aliases support primitive data, primitive arrays, nested required records/arrays, optional primitives, `Readonly`, `Array`, and `ReadonlyArray`. Generic aliases have simple distinct parameters without constraints/defaults, and exact concrete arity. Templates validate with primitive placeholders and every concrete use validates again. Local type/function/import names are distinct, including across namespaces. Type and runtime builtin names cannot be shadowed.

Relative filenames retain exact `.js`, `.mjs`, `.ts`, or `.mts` extensions. Opt-in config is strict JSON containing only `compilerOptions.baseUrl` and `compilerOptions.paths`. There is no discovery, inheritance, JSONC, fallback array, extension guessing, or baseUrl-only package fallback. Exact paths win, then longest prefix; ties fail.

Packages support string targets, exact subpaths, and `types`, `import`, and `default` conditions. Runtime selection respects import/default property order; type imports prefer types. Targets and package-relative imports stay inside the canonical package directory. `.js`/`.ts` packages require `type: module`. Nearest local package metadata is captured; explicit CommonJS scopes fail. Node builtin imports, self-references, unknown conditions, wildcard/array exports, main fallback, nested scopes, and symlinked package metadata fail explicitly.

Runtime generics, higher-order verification, anonymous default functions, namespace/side-effect/dynamic imports, module cycles, recursive/unresolved types, interfaces, ambient declarations, type assertions, non-null assertions, local type declarations, mapped/conditional types, and unsupported runtime bodies remain rejected. No downstream H behavior was introduced.

## Fixtures and provenance

The offline project combines generic records/arrays, imported types, runtime aliases, barrels/default exports, config paths, and packages with separate type/runtime entries. It retains the pinned Remeda eager declaration and a complete D3 Array 3.2.4 module. D3's executable source is unchanged; only specification comments are prepended. Both source hashes and licenses are retained and checked without network access.

## Verification evidence

- Initial focused command: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/project-frontend.test.mjs`: 16/18 passed. The new project exhausted its 60000 ms solver budget; a dependency-status expectation was corrected to require the actual replay-confirmed helper violation. No assertion was weakened.
- `node verify/examples/project/check-baseline.mjs`: passed. The pinned helper's `pre`, `post`, declarations, executable, and result shape match baseline exactly. Both `composed.js` and `shifted.js` also retain every baseline obligation, witness model, dependency, and executable. SHA-256 of that semantic payload: `9501bf420aad0283e35eac2d63ef71480ab4e01e8dd71b49e61a53c730ee9c5c`.
- Serial timeout isolation probes completed: the pinned helper verifies through the API on its own; removing the array-summary call from the helper-later graph still timed out. Each of the four original project SMT targets proved when run in a fresh worker. The final fixture lists the quantified helper first, matching the existing Remeda import layout. Its bodies, contracts, and verification assertions are unchanged. The full run has now verified all four project functions after replay. Equivalent helper-later layouts remain subject to the existing shared-budget limitation.
- Full suite: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- make test-verify`: **105/105 passed**, including all 84 baseline tests and the first 21 new frontend tests.
- Final focused suite on the latest implementation: `python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node --test --test-concurrency=1 tests/verify/project-frontend.test.mjs`: **22/22 passed**. This rerun includes the literal-filename fix added after the full run's frontend file had executed.
- Literal filename regression: `node --test --test-name-pattern='wildcard config paths substitute' tests/verify/project-frontend.test.mjs` reproduced incorrect `$&` replacement, then passed after the one-line literal-substitution fix. The final 22-test run includes this case.
- Parser-only rejection selection: nine checks passed without starting a solver. These checks are also included in the final focused run.
- Syntax checks for changed modules and `git diff --check`: passed. All test/probe processes ended; temporary diagnostic scripts were removed. No solver or assertion was weakened.

## Integration touchpoints

`source.mjs` links separate type/runtime exports before compilation and defers parameter expansion until bindings exist. Parsed export descriptors replace the earlier eager export map. Runtime scopes now carry captured `source`, `tokens`, and `validateType` for erased-syntax checking and local annotations. `data.parseType` accepts a lexical alias resolver. `modules.mjs` returns metadata dependencies, and graph digests include them. `index.mjs` and the CLI expose metadata/config options without altering solver or replay outcome policy.

The intentional compatibility change is that all explicit type imports resolve, including unused names. The baseline import tests were updated for that behavior and newly supported export forms. Consumers must retain metadata when identifying a selected program. The design and README document the exact policy.
