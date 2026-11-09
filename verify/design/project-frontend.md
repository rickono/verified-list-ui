# Project frontend

Node C extends the existing snapshot, lexical scope, and contract compiler. It does not specialize runtime generic functions.

## Interface and ownership

```js
await verifyFile("project/entry.ts", { tsconfig: "project/tsconfig.json" });
await verify("type Box<T> = { value: T }; /* contracts and functions */");
```

`modules.mjs` remains the only filesystem reader. Its canonical, read-once snapshot includes source files and resolution metadata. `report.modules` contains source files. `report.dependencies` contains configuration and package metadata. The graph digest covers both. The nearest package scope is captured for local `.js` and `.ts` sources; an explicit CommonJS scope is rejected.

`types.mjs` reads the type declarations and module bindings that Node's offset-preserving stripping removes. It accepts a small grammar rather than pretending to parse all TypeScript. `data.parseType` expands names through a lexical resolver and retains the existing plain-data domain checks. `source.mjs` links separate type and runtime export tables, expands concrete parameter types, and compiles every loaded runtime function. Replay continues to execute captured, unchanged stripped function slices in separate module realms.

Headers retain type text until module bindings are linked. An alias has a defining file, original span, formal type parameters, and type text. Expansion substitutes concrete data shapes, checks arity, and rejects cycles or unbound parameters. Errors retain the defining alias's provenance. Public parameter assumptions include the expanded shape and the aliases used to obtain it.

## Supported policy

Types include local and exported aliases, plain generic aliases such as `Box<number>` and `Vector<boolean>`, nested records, and primitive arrays. Generic parameters have distinct simple names without constraints or defaults. Every alias is validated, including unused aliases. Runtime generic declarations, explicit call type arguments, type assertions, non-null assertions, and local type declarations are rejected. Return and local annotations are validated without adding trusted facts. Interfaces, declaration merging, ambient declarations, namespaces, conditional and mapped types, and recursive aliases are outside this slice.

Named imports and exports accept aliases and explicit type bindings. Named re-exports, local exports of imported bindings, star barrels, named default function declarations, and default exports of existing function bindings preserve defining function identity. Default expression exports reject reads of later const bindings; hoisted function declarations remain valid. Namespace imports, anonymous default functions, side-effect imports, dynamic imports, and module cycles remain unsupported. Conflicting star exports are diagnosed when selected, and explicit exports take precedence. All explicit imports and exports must resolve, even unused type bindings. Local type, function, and import names must remain distinct across namespaces; type and runtime builtin names are reserved.

Relative paths retain exact supported extensions. There is no extension guessing or JavaScript-to-TypeScript substitution. Opt-in tsconfig files are strict JSON containing only `compilerOptions.baseUrl` and `compilerOptions.paths`. A path key is exact or has one wildcard, with exactly one exact-file replacement. The longest matching prefix wins, with ties rejected. No config discovery, inheritance, fallback arrays, or compiler-option inference occurs.

Bare package imports search ancestor `node_modules` directories and require `package.json` with explicit `exports`. Targets are exact supported files inside the canonical package directory. Root targets, exact subpath maps, and `types`, `import`, and `default` conditions are supported. Arrays, wildcard exports, unknown conditions, Node builtins, package self-references, `main` fallback, CommonJS, and package imports beginning with `#` are rejected. Type imports select `types` when present. Runtime imports select the first active `import` or `default` condition in JSON order. Packages require `type: module` for `.js` and `.ts` sources. Nested package scopes, symlinked package metadata, and package-relative escapes are rejected. Package code is parsed and checked, never trusted as a stub.

Type imports now resolve even when unused. This deliberately replaces the previous erase-without-resolution behavior. Source-string verification rejects all imports and re-exports without performing I/O.

## Design choice and verification

A compiler-API frontend would cover more syntax but the pinned native TypeScript package has no supported JavaScript AST API. Replacing Acorn would also change executable-source ownership. The chosen design reads erased declarations alongside the existing runtime AST and keeps the proof and replay representation intact.

Behavioral tests exercise multi-file concrete aliases, package and config resolution, metadata invalidation, source provenance, collisions, unresolved and recursive types, ambiguous barrels, and unsupported runtime code. An offline project fixture reuses the hash-checked Remeda eager declaration with no body edits and a complete pinned D3 module with only specification comments added. Full verification runs through the shared serial test lane.
