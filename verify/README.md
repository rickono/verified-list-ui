# Verify contracts on existing JS/TS functions

This is the first source-verification slice of a JavaScript verifier modeled on [Verus](https://github.com/verus-lang/verus/blob/main/source/CODE.md). It reads ordinary functions, checks `requires` and `ensures` comments, and reports results against that source. It does not generate replacement application code.

The supported subset is deliberately small. The verifier trusts its frontend and Z3. Its verdicts are not Rocq-checked proof artifacts. The existing `.fold` authoring path continues to use Rocq.

## Run the examples

From the repository root, after `pnpm install --frozen-lockfile`:

```sh
pnpm verify verify/examples/valid.ts
pnpm verify verify/examples/bugs.ts
pnpm verify --timeout 60000 verify/examples/collections.ts
pnpm verify verify/examples/calls.ts
pnpm verify verify/examples/calls-bugs.ts
node verify/bin/jsverify.mjs --json verify/examples/bugs.ts
node verify/examples/remeda/check.mjs
node verify/examples/remeda/check-calls.mjs
node verify/examples/remeda/check-imports.mjs
pnpm verify --timeout 60000 verify/examples/remeda/composed.js
make test-verify
```

The valid file verifies bounded doubling and a scalar clamp. The bugs file reports three counterexamples: `NaN` defeats an equality contract, a finite input doubles to infinity, and a broken clamp returns a value above the upper bound. Every reported counterexample is replayed against the actual function in Node.

The collections file verifies a nonempty first-element read, pair swapping, `take` via `slice`, a clamp with an object parameter, record copying, and an optional lower bound. Array index arithmetic can require a larger solver budget; a timeout remains `unknown`.

The Remeda check uses a pinned upstream `take` fixture. It verifies the unchanged eager body's prefix property for every numeric count. It also verifies exact length with a prefix under a safe nonnegative integer count. The check then shifts the slice by one and requires a replay-confirmed failure of the element contract while the length contract still holds. The check exits 0 when all these expected outcomes hold. Source hashes, provenance, and the MIT license are in `examples/remeda/`. It does not verify Remeda's wrapper dispatch or lazy pipelines.

The calls example verifies a clamp wrapper and a first-element wrapper through helper contracts. The calls-bugs example reports a real unmet helper precondition and an `unknown` caller whose helper contract is too weak. The Remeda calls check verifies `take(take(array, 3), 2)` through the pinned eager helper's contract, then confirms a shifted wrapper's content failure while its length stays correct. Both Remeda checks run offline and fail if the pinned source or extracted declaration changes.

The imports check uses separate helper and caller files. It verifies the composed prefix, confirms the shifted wrapper's content failure, then weakens the helper's length contract. The helper still verifies, but the unchanged caller loses its proof and the graph hash changes. The pinned declaration stays unchanged. `make test-verify` runs test files serially because concurrent quantified proofs can exhaust their solver budgets.

The command exits 0 only when every loaded function is verified. Other verification outcomes exit 1. Invalid invocation and entry-file I/O errors exit 2. Missing dependencies are `error` outcomes at the import. `--timeout MS` sets a wall-clock solver-process budget per entry and its dependencies, including solver initialization. The default is 10000 ms. `--json` includes source and dependency SHA-256 hashes, input assumptions, and trusted components. Witnesses are arrays/records with string leaves, including `NaN`, `Infinity`, `-Infinity`, `-0`, and `undefined`, so JSON preserves those values. Missing record keys remain missing.

## Write a contract

Put one expression per contract line directly above a function declaration or a `const` function expression:

```ts
// requires Number.isFinite(x)
// requires Math.abs(x) <= Number.MAX_VALUE / 2
// ensures Number.isFinite(result)
// ensures x * 2 === result
export const double = (x: number): number => x * 2;
```

Parameter types are input assumptions. A `number` includes `NaN`, both infinities, signed zeros, and subnormals. The verifier does not silently assume finite numbers or safe integers. JavaScript files use JSDoc types instead:

```js
/** @param {number} x */
// ensures Object.is(result, x)
export function identity(x) {
	return x;
}
```

Every target needs an `ensures`. `result` names the returned value. A contract can mention parameters, but not function-local variables. Parameter types and `requires` must hold at entry. The verifier checks calls within the analyzed source; external callers must meet those assumptions. A TypeScript annotation does not validate untyped runtime callers.

## Arrays and records

```ts
// requires values.length > 0
// ensures result !== undefined
// ensures Object.is(result, values[0])
export function first(values: readonly number[]) {
	return values[0];
}

// ensures Object.is(result.x, point.x)
export const copy = (point: { x: number; y: number }) => ({ ...point });
```

Array input types are `number[]`, `boolean[]`, their `readonly` forms, `Array<T>`, and `ReadonlyArray<T>`. Arrays are ordinary dense arrays with standard prototypes and no extra properties or species overrides. Every legal JavaScript length, from 0 through 2^32 − 1, is in the proof domain. Elements still include nonfinite numbers and signed zeros.

Supported operations are `.length`, numeric indexing, array literals, a single-array spread copy, and `.slice(start?, end?)`. Slice follows JavaScript's rules for negative, fractional, `NaN`, infinite, and undefined indices. Out-of-range element reads produce `undefined`. They are not arbitrary numbers or automatic safety failures. Constructed arrays can contain dense undefined elements, such as `[values[0]]` when the input is empty.

Records use inline types such as `{ min: number; max: number }`, nested required records/array fields, and optional primitive fields such as `{ min?: number }`. They have declared own enumerable data properties, ordinary prototypes, and no getters, proxies, or extra properties. Type and environment assumptions appear in the report. JSDoc accepts balanced inline shapes, for example `@param {{min: number, max: number}} bounds`.

Record literals, shorthand properties, property reads, and record spread are supported. Own-key presence is separate from the field's value: spreading `{min: undefined}` overwrites an earlier `min`, while spreading `{}` leaves it intact. Optional fields that could expose inherited `Object.prototype` names are rejected. Reference equality for arrays/records is unsupported; compare their fields, lengths, or elements.

Witness replay materializes at most 256 elements per input array. When a model is too large, a separate witness search tries those smaller lengths. These constraints are never added to a proof query. If no manageable witness is found, the result is `unknown`, not `vacuous` or `verified`. This also applies to precondition witnesses.

## Array contents in contracts

`every` states a property about every element of a dense array:

```ts
// ensures result.length <= values.length
// ensures result.every((value, index) => Object.is(value, values[index]))
export const take = (values: number[], n: number) => n < 0 ? [] : values.slice(0, n);
```

The element contract preserves values and order, including `NaN` and signed zero. It does not specify how many elements to return. A length contract states that part separately. Numeric `===` instead of `Object.is` fails when a copied element is `NaN`.

`every` is accepted in `requires` and `ensures`, including nested callbacks and Boolean expressions such as negation, conditionals, and equality. It is unsupported in function bodies. The callback must be a non-async, expression-bodied arrow with zero, one, or two simple parameters. The first receives the element and the second receives its numeric index. Parameter names cannot shadow an existing binding or a verifier builtin. The third array parameter, `thisArg`, block bodies, destructuring, defaults, rest parameters, mutation, and unmodeled calls are unsupported. Predicates return booleans or `undefined`; `undefined` is false. Other JavaScript truthiness conversions are unsupported.

An empty array satisfies `every` without visiting an element. A dense array containing `undefined` visits that value. Sparse arrays remain outside the input domain. Replay evaluates the original contract text with JavaScript's native `every`.

The proof covers every valid index at every native array length. A guarded 32-bit universal quantifier represents the contract, including when it appears under negation or in a precondition. This is a universal property, not a check of selected indices. Quantifiers can make the solver return `unknown`. Adding offsets to callback indices can also require more solver time; the verifier retains binary64 arithmetic and does not replace it with wrapping index arithmetic.

The source-string API checks one module without reading files:

```js
import { verify } from "./verify/index.mjs";

const report = await verify(source, { file: "existing.ts", timeoutMs: 10000 });
for (const outcome of report.outcomes) {
	console.log(outcome.fn, outcome.status);
}
```

## Calls between functions

A function can call another named top-level function in the same source file:

```ts
// ensures Object.is(result, value)
export const caller = (value: number) => identity(value);

// ensures Object.is(result, value)
export const identity = (value: number) => value;
```

Forward references work because all supported top-level statements are function bindings. Every function needs an `ensures` contract and a supported body. Calls take exactly the declared number of arguments. Recursion, dependency cycles, unresolved callees, function values, spread arguments, and calls to source functions inside contracts are unsupported. Local data bindings take precedence over top-level function names and cannot be called.

A caller must establish the helper's parameter domain and `requires` on every path where the call executes. Optional values need proof of definedness before entering required parameters. Records must meet the helper's own-field requirements and contain no extra fields. Arrays passed to dense-array parameters must have defined elements of the right type. Statically incompatible data shapes are unsupported; symbolic domain failures become call obligations.

The caller receives a fresh value constrained by the helper's `ensures`. The helper's body supplies its return shape but is not inlined into the caller's proof. Return shapes include optional fields, optional scalars, and dense arrays containing `undefined`. Length and value properties belong in `ensures`. A helper with `ensures true` gives its caller no additional value guarantee, even if the actual body returns its input.

Calls follow JavaScript evaluation order, including receiver-before-arguments evaluation, branches, and short circuits. A call can use facts from earlier executed calls, never its own postcondition or a later call's postcondition. Helper facts stay out of caller feasibility checks. An impossible helper postcondition cannot make its caller look vacuous.

Replay runs the original function bodies with monitored module bindings. The monitor checks actual helper arguments, preconditions, result shapes, and postconditions. Contract parameters are lexical arguments rather than VM globals. Every source execution and contract evaluation retains a replay time limit.

A reproduced violation made directly by the caller is a `counterexample` with a `call` field containing the real callee, actual arguments, and violated parameter domains or clauses. Its location is the caller's function span; the verifier does not claim to identify the individual call site. A failure inside a helper is `unknown` with reason `dependency-violation`.

An abstract counterexample that does not reproduce is `unknown` with reason `contract-gap`. Strengthening a helper's `ensures` may make the caller prove. Each helper is checked independently, and a caller becomes `verified` only if every dependency's final status remains `verified` after replay. Dependency checks are conservative: a syntactically present call to an unverified helper blocks a verified verdict even when its branch never executes. Unrelated functions can still verify.

The solver budget applies to the whole entry and its dependencies. Long call chains and repeated quantified contracts can exhaust it and return `unknown`.

## Imports between local files

`verifyFile` and the CLI load named imports from local files:

```ts
// helper.ts
// ensures Object.is(result, value)
const identity = (value: number) => value;
export { identity as same };
```

```ts
// caller.ts
import { same as helper } from "./helper.ts";
// ensures Object.is(result, value)
export const caller = (value: number) => helper(value);
```

```js
import { verifyFile } from "./verify/index.mjs";
const report = await verifyFile("caller.ts", { timeoutMs: 10000 });
console.log(report.modules, report.graphSha256, report.outcomes);
```

Imports must begin with `./` or `../` and specify the exact `.js`, `.mjs`, `.ts`, or `.mts` filename. URL escapes, queries, fragments, and backslashes are unsupported. There is no extension guessing, `.js` to `.ts` substitution, directory lookup, package resolution, or tsconfig alias resolution. Named function exports and local export lists support aliases. Default, namespace, side-effect, empty, dynamic, and absolute imports, re-exports, and import cycles are unsupported.

`import type { T }` is erased without resolving its file. Mixed `import { type T, helper }` resolves the remaining runtime binding. An import containing only named type specifiers becomes empty after stripping and is rejected; use `import type` instead. Type aliases in parameter annotations remain unsupported.

Every canonical file is read once per run. The snapshot supplies proof source, replay source, raw-byte hashes, and diagnostic positions. Invalid UTF-8 is an `error`. `modules` lists canonical paths, SHA-256 hashes, and import edges, with the entry first. `graphSha256` covers entry-relative paths, hashes, and edges. Every new call reads the files again, so helper changes invalidate the graph hash without a cache.

Outcomes carry `file`, `span`, `line`, and `column`. Contract clauses retain their defining file. A call violation includes `callerFile` and `calleeFile`, alongside the declared function names. The CLI uses captured positions and does not reread source files.

Two modules can declare the same private name. Imports bind aliases to the defining function; export aliases create no local binding. Data locals and private function-expression self names take precedence over imports. Import aliases cannot use reserved builtin names. Each module replays in its own VM context, with monitored wrappers under its local names.

All functions in every loaded module need supported bodies and contracts and are checked, even when unused by the entry. Any unsupported construct aborts the run with its defining file and span. An unused failing helper is reported and causes a nonzero CLI exit; it does not block an otherwise independent function's `verified` status. Syntactic call dependencies do block callers until every callee's final status is `verified`.

Dependencies are solved before importers, with source order preserved within each module. One solver budget covers the graph. Large graphs can return `unknown`. The [import design](design/imports.md) records identity, replay, and snapshot ownership.

## Interpret the outcomes

- `verified`: the preconditions are satisfiable, and Z3 finds the negated postcondition unsatisfiable under the source encoding.
- `counterexample`: Z3 finds inputs, and executing the actual functions in a fresh Node VM confirms a postcondition failure or an unmet call requirement. The report contains the return value or the failed call, with actual arguments and failed contract spans.
- `vacuous`: the preconditions contradict each other. This is not reported as verified.
- `unknown`: a resource limit, solver uncertainty, or disagreement between the encoding and JavaScript replay prevents a verdict.
- `unsupported`: the source or contract uses a construct the verifier cannot faithfully interpret.
- `error`: invalid syntax, a missing postcondition, or a solver failure prevents checking.

`unknown` reasons include `contract-gap`, `dependency`, `dependency-violation`, `replay-timeout`, and `replay-mismatch`. The CLI prints the reason and explains a call violation separately from a returned-value counterexample.

## JavaScript number semantics

Source and contract arithmetic both use IEEE-754 binary64 with round-to-nearest, ties-to-even. They are not mathematical integer or real arithmetic.

Numeric `==` and `===` use `fp.eq`: `NaN` is unequal to itself and positive zero equals negative zero. Primitive `Object.is` equates NaNs and distinguishes zero signs. Strict equality preserves type differences. Loose equality requires compatible primitive types, with explicit undefined handling.

Undefined values retain their own tag. For example, an empty `values[0]` is undefined and `Number.isNaN(values[0])` is false, but `values[0] + 1` produces NaN. Nullish coalescing (`??`) can supply a fallback. Optional booleans preserve undefined through `&&`, `||`, and conditionals. Other implicit coercions remain unsupported.

Consequently, `ensures x * 2 == result` fails on `NaN` but allows infinity after overflow. Add `Number.isFinite(result)` when a finite result is required. `Number.isSafeInteger` is available when that is the desired property; exact representability and safe-integer status are different requirements.

`real(...)` and mathematical specification arithmetic are not implemented. The verifier rejects them explicitly. Supporting them requires checking finiteness and giving replay an exact mathematical interpretation. It must not reinterpret JavaScript operations as unbounded arithmetic.

## Supported source

Supported functions take the primitive or collection data types above and return a compatible data shape on every syntactic path. Primitive `| undefined` types are also accepted. Bodies can use initialized local `const`, `let`, and `var` bindings, multiple declarators, blocks, `if`/`else`, expression statements, and `return`. Expressions include numeric, boolean, and undefined values, arithmetic `+ - * /`, unary `+ - !`, comparisons, primitive equality, `&&`/`||`/`??`, conditional and sequence expressions, and the collection operations above.

Local scalar bindings support `=`, numeric `+=`, `-=`, `*=`, `/=`, and numeric prefix/postfix `++` and `--`. Operands and arguments evaluate left to right. Short circuits suppress both writes and calls. Branch joins retain writes, and leaving a block restores shadowed names while preserving writes to outer bindings. Local `let` and `const` bindings have block scope; `var` bindings have function scope. Parameters cannot be written, so contracts always describe entry arguments. Arrays and records retain immutable views, including when held in `let` or `var` bindings.

Assignments preserve a binding's primitive scalar type. Number and boolean bindings can receive undefined and later regain a value of their original type. A binding initialized with only undefined cannot change to another type. Uninitialized declarations, reads or writes before declaration, repeated `var` declarations, and `var` redeclarations of parameters are rejected explicitly. A later declaration still masks an outer name, so a read before a local declaration cannot accidentally resolve a module function. Assignments and updates are unsupported in contracts. The [scalar-state design](design/scalar-state.md) records the scope and evaluation rules.

The builtin allowlist is `Math.abs`, `Number.isFinite`, `Number.isNaN`, `Number.isInteger`, `Number.isSafeInteger`, primitive `Object.is`, `Array.isArray`, and the standard numeric constants. Direct calls to supported top-level functions and named imports use their contracts. Conditions accept booleans or undefined; numeric/object truthiness is unsupported. Unknown calls, heap writes, reference assignments, logical/bitwise compound assignments, loops, async functions, generators, and optional/default/rest/destructured parameters are unsupported. Sparse arrays, nested array elements, array concatenation/spread appends, methods/getters, type aliases, and optional reference fields are unsupported. `%` is rejected because IEEE remainder would not implement JavaScript remainder correctly. An analysis has a limit of 128 source paths.

Runtime top-level statements are supported function declarations, `const` function expressions, named imports, and local named exports. TypeScript uses Node's experimental `stripTypeScriptTypes` in offset-preserving mode, followed by Acorn; Node may emit an experimental-feature warning. A small type grammar reads runtime parameter annotations from the original source, including nested field separators that stripping erased.

The pinned Remeda checks verify an extracted eager declaration after type stripping, with numeric-array JSDoc assumptions and contracts. Higher-order helpers such as `purry`, named type resolution, and loops need further work before an entire Remeda module can be verified.

## Architecture and trust

`modules.mjs` owns file resolution and source snapshots. `source.mjs` owns syntax, contract parsing, lexical scope, linking, control flow, function headers, dependency checks, and call obligations. `data.mjs` owns data types, value views, JavaScript operation semantics, joins, parameter-domain checks, symbolic declarations, and replay data conversion. `solver.mjs` owns Z3 execution and witness extraction in a subprocess. `index.mjs` owns outcome policy, monitored source replay, diagnostic positions, and final dependency gating. The CLI handles presentation. The [call-contract design](design/calls.md) records the proof-composition rule and its limits.

Number inputs are raw 64-bit bitvectors reinterpreted as binary64. This covers all JavaScript numbers and preserves signed zero without decoding the unspecified IEEE-bit conversion of a solver NaN. NaN payloads cannot be observed by this subset. Every arithmetic operation has explicit floating-point semantics, and numeric equality uses `fp.eq` rather than SMT structural equality.

Arrays are compiler views: a 32-bit length and an indexed primitive-value function. Literals, slices, and conditionals build these views directly, without SMT array or datatype theories. An `every` contract adds a universal quantifier guarded by the array length. Callback indices are present unsigned integers that binary64 represents exactly, so indexed reads reuse the exact unsigned view. Optional values carry presence separately from payloads; records additionally carry own-key presence. These flags must guard every fast path, including array indices with cached integer payloads.

The model describes these operations with adequate runtime resources; allocation failures and out-of-memory behavior are outside its guarantees.

Each verification request gets its own solver subprocess, so concurrent API calls do not share Z3 state. Each target has a fresh solver, and all targets in one request share a deadline. The parent kills a process that exceeds its wall-clock budget. Initialization errors and killed workers cannot produce a verified verdict. A satisfiable precondition also gets a JavaScript witness check; a counterexample requires an actual failing source execution.

Trusted components are Acorn, Node's type stripping, local module resolution and snapshots, our source translation, Z3 and its WASM bindings, standard unmodified `Number`/`Math`/`Object`/`Array` builtins and prototypes, and the JavaScript runtime. Tests check this connection but do not formally prove the translation correct. Successful verification is not an independently checkable Rocq certificate.

Two design candidates and an independent cross-judge selected this split over a single verifier module using the TypeScript compiler API. The installed native TypeScript 7 package has no stable `createSourceFile` API. The synthesis retains explicit missing-contract and vacuity outcomes, JSON-safe witnesses, and per-file solver isolation. It defers mathematical specification arithmetic instead of hiding its additional semantics inside the first slice.

The collections design selected structural views over bounded tuples or SMT aggregate datatypes. It retains native undefined behavior instead of adding out-of-bounds obligations. The independent design review identified key presence during spread and inherited optional names as necessary distinctions. The [prefix-contract design](design/prefix.md) adds native `every` contracts over those views. An object identity and heap model remains deferred.

`tests/verify/source.test.mjs` exercises the public API and CLI. It compares source verification with V8 on numerical edge cases for each supported binary operator and numeric builtin, checks branch behavior, confirms failing executions, and exercises rejection, vacuity, original-source spans, and resource exhaustion.

`tests/verify/scalar-state.test.mjs` covers local updates, captured reads, assignment values, binary64 edge cases, branch joins, early returns, block scope, shadowing, short circuits, ordered call facts and arguments, and fail-closed effects. Incorrect update contracts produce replay-confirmed counterexamples.

`tests/verify/collections.test.mjs` covers array/object examples, V8 slice edge cases, structured counterexamples, key presence, undefined coercions, large-witness handling, and explicit rejection of reference identity, mutation, sparse arrays, and exotic objects.

`tests/verify/prefix.test.mjs` covers universal array contracts, nesting and Boolean polarity, callback scopes, native value semantics, unsupported syntax, and witness limits. `tests/verify/remeda-take.test.mjs` checks the pinned upstream eager body, a mutation that changes contents while preserving length, and fixture drift.

`tests/verify/calls.test.mjs` covers modular calls, evaluation order, short circuits, opaque summaries, optional results, replay namespaces, dependency failures, and unsupported calls. The domain table checks symbolic call requirements against concrete replay conformance. CLI tests cover call diagnostics, replay budgets, and transitive gating after replay. `tests/verify/remeda-calls.test.mjs` checks real prefix composition and a shifted wrapper.

`tests/verify/imports.test.mjs` and `imports-cli.test.mjs` cover aliases, module scopes, canonical diamonds, helper edits, opaque contracts, dependency positions, post-replay gating, exact resolution, UTF-8 and BOM handling, and rejected import forms. `remeda-imports.test.mjs` checks the pinned helper across actual files and confirms that weakening its contract removes the unchanged caller's proof.
