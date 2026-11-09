# Verify contracts on existing JS/TS functions

This is the first source-verification slice of a JavaScript verifier modeled on [Verus](https://github.com/verus-lang/verus/blob/main/source/CODE.md). It reads ordinary functions, checks `requires` and `ensures` comments, and reports results against that source. It does not generate replacement application code.

The supported subset is deliberately small. The verifier trusts its frontend and Z3. Its verdicts are not Rocq-checked proof artifacts. The existing `.fold` authoring path continues to use Rocq.

## Run the examples

Start with the [executable example gallery](examples/README.md): floating-point failures, exact specifications, array-prefix bugs, helper contracts and local updates. Its snippets run directly from the README with `node verify/examples/check-readme.mjs`.

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
node verify/examples/project/check-project.mjs
pnpm verify --timeout 60000 verify/examples/remeda/composed.js
make test-verify
```

The valid file verifies bounded doubling and a scalar clamp. The bugs file reports three counterexamples: `NaN` defeats an equality contract, a finite input doubles to infinity, and a broken clamp returns a value above the upper bound. Every reported counterexample is replayed against the actual function in Node.

The collections file verifies a nonempty first-element read, pair swapping, `take` via `slice`, a clamp with an object parameter, record copying, and an optional lower bound. Array index arithmetic can require a larger solver budget; a timeout remains `unknown`.

The Remeda check uses a pinned upstream `take` fixture. It verifies the unchanged eager body's prefix property for every numeric count. It also verifies exact length with a prefix under a safe nonnegative integer count. The check then shifts the slice by one and requires a replay-confirmed failure of the element contract while the length contract still holds. The check exits 0 when all these expected outcomes hold. Source hashes, provenance, and the MIT license are in `examples/remeda/`. It does not verify Remeda's wrapper dispatch or lazy pipelines.

The calls example verifies a clamp wrapper and a first-element wrapper through helper contracts. The calls-bugs example reports a real unmet helper precondition and an `unknown` caller whose helper contract is too weak. The Remeda calls check verifies `take(take(array, 3), 2)` through the pinned eager helper's contract, then confirms a shifted wrapper's content failure while its length stays correct. Both Remeda checks run offline and fail if the pinned source or extracted declaration changes.

The imports check uses separate helper and caller files. It verifies the composed prefix, confirms the shifted wrapper's content failure, then weakens the helper's length contract. The helper still verifies, but the unchanged caller loses its proof and the graph hash changes. The pinned declaration stays unchanged. `make test-verify` runs test files serially because concurrent quantified proofs can exhaust their solver budgets.

The command exits 0 only when every loaded function is verified. Other verification outcomes exit 1. Invalid invocation and entry-file I/O errors exit 2. Missing dependencies are `error` outcomes at the import. `--timeout MS` sets one wall-clock solver-process budget per entry and its dependencies, including solver initialization and any worker restarts. The default is 10000 ms. Compilation and JavaScript replay retain their separate limits. `--json` includes source and dependency SHA-256 hashes, input assumptions, and trusted components. Witnesses are arrays/records with string leaves, including `NaN`, `Infinity`, `-Infinity`, `-0`, and `undefined`, so JSON preserves those values. Missing record keys remain missing.

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

Relative imports specify the exact `.js`, `.mjs`, `.ts`, or `.mts` filename. There is no extension guessing, JavaScript-to-TypeScript substitution, or directory lookup. Named function exports, local export lists, imported binding exports, named re-exports, and star barrels preserve aliases and defining function identity. Named default function declarations and default exports of existing function bindings are supported. Explicit exports override star exports. Conflicting star exports fail when imported, and stars exclude default exports. Namespace, anonymous default, side-effect, empty, dynamic, and absolute imports, URLs, and module cycles remain unsupported.

`verifyFile(entry, {tsconfig: "project/tsconfig.json"})`, or CLI `--project project/tsconfig.json`, opts into config paths. The config is strict JSON with only `compilerOptions.baseUrl` and `compilerOptions.paths`. Exact keys and keys with one wildcard map to exactly one target with an explicit supported extension. Exact keys win, then the longest prefix. Tied prefixes, fallback arrays, inheritance, JSONC, and other compiler options are rejected. There is no config discovery or baseUrl-only fallback.

Bare imports search ancestor `node_modules` directories. Packages need explicit `exports`, with a root target, exact subpath map, or `types`, `import`, and `default` conditions. Runtime imports select the first active import/default condition in JSON order. Type imports prefer types. Targets stay inside the canonical package directory. Packages require `type: module` for JavaScript/TypeScript sources. Wildcard exports, fallback arrays, unknown conditions, CommonJS, Node builtins, package self-references, main fallback, nested package scopes, symlinked package metadata, and package-relative escapes are unsupported. A package is analyzed source, never a trusted stub.

Local aliases, exported type bindings, and concrete generic aliases describe the same plain-data shapes as inline annotations. For example, `type Box<T> = {value: T}` and `type Vector<T> = readonly T[]` support `Box<number>` and `Vector<boolean>`. Aliases expand in their defining module's type scope, with exact generic arity and no recursion or unresolved parameters. Generic parameters have no constraints or defaults. Every alias is validated, including unused declarations. Generic templates are validated with primitive placeholders; each concrete instantiation is checked again against the supported data domain.

All explicit type imports and exports resolve, even when unused. Mixed imports and all-type named imports work. This replaces the earlier erase-without-resolution behavior. Missing type files or exports are errors. Source-string verification rejects type imports and re-exports without reading files. Parameter assumptions include expanded shapes and defining alias files/spans. Return and local annotations are validated but do not override inferred runtime values or add trusted facts.

Every canonical file is read once per run. The snapshot supplies proof source, replay source, raw-byte hashes, and diagnostic positions. Invalid UTF-8 is an `error`. `modules` lists source paths, SHA-256 hashes, and import edges, with the entry first. `dependencies` lists configuration and package metadata, including the nearest local package scope for `.js` and `.ts` sources. An explicit CommonJS scope is rejected. `graphSha256` covers entry-relative paths, source hashes, edges, and metadata hashes. Every new call reads the files again, so helper changes invalidate the graph hash without a cache.

Outcomes carry `file`, `span`, `line`, and `column`. Contract clauses retain their defining file. A call violation includes `callerFile` and `calleeFile`, alongside the declared function names. The CLI uses captured positions and does not reread source files.

Two modules can declare the same private name. Imports bind aliases to the defining function; export aliases create no local binding. Data locals and private function-expression self names take precedence over imports. Import aliases cannot use reserved builtin names. Each module replays in its own VM context, with monitored wrappers under its local names.

All functions in every loaded module need supported bodies and contracts and are checked, even when unused by the entry. Any unsupported construct aborts the run with its defining file and span. An unused failing helper is reported and causes a nonzero CLI exit; it does not block an otherwise independent function's `verified` status. Syntactic call dependencies do block callers until every callee's final status is `verified`.

Dependencies enter the solver queue before importers, with source order preserved within each module. Scheduling can defer a costly dependency while independent targets run. Reports retain the original order. One solver budget covers the graph. Large graphs can return `unknown`. The [import design](design/imports.md) records identity, replay, and snapshot ownership.

## Proof scheduling and backend capabilities

Each request uses at most two isolated workers, with one active query per worker. A target's turn receives the remaining wall-clock budget divided by the number of rounds needed to serve unfinished targets in two slots. With two targets, both can run up to the original deadline, so a costly proof does not need an artificial interruption to give a cheap target an opportunity. A timeout yields to a queued target. The unfinished target returns at the end of the queue with completed phase evidence retained. Initialization and restarts consume the same original deadline. Very small budgets can expire before every target gets a turn.

This policy explicitly permits two workers' CPU and memory use. The worker cap is fixed, independent of graph size. `timeoutMs` remains one wall-clock request budget, not a fresh budget per worker or target. All workers stop at the original deadline and are reaped before the request returns.

The parent retains completed query evidence and outcomes. A worker crash or hard timeout cannot erase unrelated completed results. A hard timeout kills and reaps the worker, and a later target can use a replacement if time remains. A caller still needs every callee's final post-replay status to be verified.

`backend.mjs` exposes the internal worker boundary: `start(remainingMs)`, `check(obligation, turnRemainingMs)`, and `close()`. Z3 advertises SMT-LIB 2, binary64, bitvectors, uninterpreted functions, quantifiers, and model extraction. The current frontend requires that conservative capability profile. The worker returns only `sat`, `unsat`, or `unknown`; the parent combines those answers and replays witnesses. The public API has no backend override or additional budget option.

Queries identify their target, phase, and domain. Full-domain phases are `feasibility` and `postcondition`. Separate `feasibility-witness` and `counterexample-witness` phases may limit array lengths solely to obtain replayable inputs after a full-domain sat result. An unsat bounded witness query never establishes a proof or vacuity.

The compiler emits separate call-safety obligations and individual ensures under the same callee facts as the combined formula. Every full-domain conjunct must prove unsat before a target can verify. A sat conjunct supplies a candidate for source replay. Completed conjuncts survive retries; each remaining conjunct still uses the original turn and request deadline. A bounded counterexample search negates only the same failing conjunct. Splitting these queries adds no assumptions or trusted axioms.

Resource and backend diagnostics include an `obligation` object with `target`, `phase`, `domain`, and `backend`, plus the number of attempted queries. Postcondition phases also include one-based `postcondition` and `postconditionCount` fields, including call-safety conjuncts. `request-timeout` identifies the pending phase when the original deadline expires. `solver-unknown` includes `solverReason`. `worker-error`, `invalid-response`, and `backend-capability` are errors. Missing capabilities, malformed witnesses, and invalid query results fail closed. The CLI prints this attribution. See the [backend design](design/proof-backends.md) for the policy and test commands.

## Interpret the outcomes

- `verified`: the preconditions are satisfiable, and Z3 finds the negated postcondition unsatisfiable under the source encoding.
- `counterexample`: Z3 finds inputs, and replay confirms a postcondition failure, an unmet call requirement, or an undefined specification operation. Native bodies run in a fresh Node VM; exact contracts use rational replay. The report contains inputs and failed clauses, with a return value or failed call when execution reaches one.
- `vacuous`: the preconditions contradict each other. This is not reported as verified.
- `unknown`: a resource limit, solver uncertainty, or disagreement between the encoding and JavaScript replay prevents a verdict.
- `unsupported`: the source or contract uses a construct the verifier cannot faithfully interpret.
- `error`: invalid syntax, a missing postcondition, or a solver failure prevents checking.

`unknown` reasons include `request-timeout`, `solver-unknown`, `witness-too-large`, `contract-gap`, `dependency`, `dependency-violation`, `replay-timeout`, and `replay-mismatch`. The CLI prints the reason and explains a call violation separately from a returned-value counterexample.

## JavaScript number semantics

Ordinary source and contract arithmetic use IEEE-754 binary64 with round-to-nearest, ties-to-even. Explicit `real(...)` expressions select exact specification arithmetic.

Numeric `==` and `===` use `fp.eq`: `NaN` is unequal to itself and positive zero equals negative zero. Primitive `Object.is` equates NaNs and distinguishes zero signs. Strict equality preserves type differences. Loose equality requires compatible primitive types, with explicit undefined handling.

Undefined values retain their own tag. For example, an empty `values[0]` is undefined and `Number.isNaN(values[0])` is false, but `values[0] + 1` produces NaN. Nullish coalescing (`??`) can supply a fallback. Optional booleans preserve undefined through `&&`, `||`, and conditionals. Other implicit coercions remain unsupported.

Consequently, `ensures x * 2 == result` fails on `NaN` but allows infinity after overflow. Add `Number.isFinite(result)` when a finite result is required. `Number.isSafeInteger` is available when that is the desired property; exact representability and safe-integer status are different requirements.

## Exact contracts, entry values, and checked specifications

`real(numberExpression)` embeds the exact rational value of a binary64 number.
The verifier must prove that the value is present and finite wherever the
expression executes. `real("0.1")` constructs the exact decimal 1/10;
`real("1/3")` constructs a fraction. String literals have at most 1024
characters and decimal exponents between -1000 and 1000.

Real values support `+ - * /`, unary signs, comparisons, equality, and
conditionals. Both operands must be real. Division adds a nonzero-divisor
obligation. Real zero has no sign. JavaScript `Object.is` still distinguishes
signed zeros on native values. Real values cannot enter runtime bodies,
parameters, arrays, records, or JavaScript builtins. There is no implicit
conversion or mathematical-to-JavaScript cast.

```ts
// requires x === 0.5
// ensures real(result) === real(old(x)) + real("1/2")
const addHalf = (x: number) => x + 0.5;
```

The bridge on `result` checks finiteness; the equality checks exactness of the
runtime operation. With unrestricted finite `x`, this example can round or
overflow and the exact contract fails. `real(0.1 + 0.2)` embeds a rounded
JavaScript addition, while `real(0.1) + real(0.2)` adds the exact binary64
operands. Neither equals the exact decimal `real("0.3")`.

Requires clauses are ordered. Earlier true clauses can establish a bridge's
domain, as can short-circuit guards within a clause. `requires real(x) >
real("0")` alone has a definedness counterexample on nonfinite inputs. It
cannot silently exclude those inputs. Such outcomes carry
`phase: "requires-definedness"`. Postcondition definedness is checked under
the explicit requires. Quantified callbacks require definedness for every
element, independently of Boolean polarity.

`old(expression)` in ensures evaluates over entry parameters. It cannot read
`result`, body locals, or callback locals. Each invocation captures a recursive
snapshot of supported plain data, preserving absent keys, explicit undefined,
NaN, and signed zero. Mutation and heap identity remain unsupported.

An exact `// @spec` marker selects a specification-only expression-bodied
function. It accepts existing JavaScript data types and can return a native
data value or a real scalar. Its body uses the contract expression language.
Every specification needs ensures and is checked independently:

```ts
// @spec
// requires Number.isFinite(x)
// ensures result
const reflexive = (x: number) => real(x) + real("0") === real(x);

// requires Number.isFinite(x)
// ensures reflexive(old(x))
const identity = (x: number) => x;
```

Calls in contracts and specification bodies can name only marked functions,
including named local imports. Each call proves its parameter domain and
requires. Definitions are expanded; their postconditions are never assumed.
Final dependency gating still requires every used specification to verify,
including inactive syntactic calls. False, vacuous, unknown, recursive, and
circular lemmas cannot justify a verified consumer. Runtime bodies cannot call
specification functions, and specifications cannot call runtime functions.

Mathematical replay uses reduced BigInt fractions and exact binary64 bit
decomposition. Native operations keep their JavaScript behavior. The exact
interpreter is an added trusted component; successful checks are not Rocq
certificates. The [specification design](design/specifications.md) records the
proof rules and limits.

## Supported source

Supported functions take the primitive or collection data types above and return a compatible data shape on every syntactic path. Primitive `| undefined` types are also accepted. Bodies can use initialized local `const`, `let`, and `var` bindings, multiple declarators, blocks, `if`/`else`, expression statements, and `return`. Expressions include numeric, boolean, and undefined values, arithmetic `+ - * /`, unary `+ - !`, comparisons, primitive equality, `&&`/`||`/`??`, conditional and sequence expressions, and the collection operations above.

Local scalar bindings support `=`, numeric `+=`, `-=`, `*=`, `/=`, and numeric prefix/postfix `++` and `--`. Operands and arguments evaluate left to right. Short circuits suppress both writes and calls. Branch joins retain writes, and leaving a block restores shadowed names while preserving writes to outer bindings. Local `let` and `const` bindings have block scope; `var` bindings have function scope. Parameters cannot be written, so contracts always describe entry arguments. Arrays and records retain immutable views, including when held in `let` or `var` bindings.

Assignments preserve a binding's primitive scalar type. Number and boolean bindings can receive undefined and later regain a value of their original type. A binding initialized with only undefined cannot change to another type. Uninitialized declarations, reads or writes before declaration, repeated `var` declarations, and `var` redeclarations of parameters are rejected explicitly. A later declaration still masks an outer name, so a read before a local declaration cannot accidentally resolve a module function. Assignments and updates are unsupported in contracts. The [scalar-state design](design/scalar-state.md) records the scope and evaluation rules.

The builtin allowlist is `Math.abs`, `Number.isFinite`, `Number.isNaN`, `Number.isInteger`, `Number.isSafeInteger`, primitive `Object.is`, `Array.isArray`, and the standard numeric constants. Direct calls to supported top-level functions and named imports use their contracts. Conditions accept booleans or undefined; numeric/object truthiness is unsupported. Unknown calls, heap writes, reference assignments, logical/bitwise compound assignments, loops, async functions, generators, and optional/default/rest/destructured parameters are unsupported. Sparse arrays, nested array elements, array concatenation/spread appends, methods/getters and optional reference fields are unsupported. Runtime generic functions/calls, recursive aliases, interfaces, ambient declarations, namespaces, type assertions, non-null assertions, local type declarations, conditional/mapped types, and unresolved types are rejected explicitly. `%` is rejected because IEEE remainder would not implement JavaScript remainder correctly. An analysis has a limit of 128 source paths.

Runtime top-level statements are supported function declarations, `const` function expressions, named imports, and local named exports. TypeScript uses Node's experimental `stripTypeScriptTypes` in offset-preserving mode, followed by Acorn; Node may emit an experimental-feature warning. A small type grammar reads runtime parameter annotations from the original source, including nested field separators that stripping erased.

The pinned Remeda checks verify an extracted eager declaration after type stripping, with numeric-array JSDoc assumptions and contracts. Higher-order helpers such as `purry`, runtime generic specialization, and loops need further work before an entire Remeda module can be verified. The offline project fixture combines the unchanged eager declaration with a complete pinned D3 identity module, adding only specification comments to D3. It checks concrete aliases, barrels, runtime aliases, package exports, and config paths. See [project frontend policy](design/project-frontend.md).

## Architecture and trust

`modules.mjs` owns file resolution and source snapshots. `types.mjs` reads erased type declarations and module bindings. `source.mjs` owns syntax, contract parsing, lexical scope, linking, control flow, function headers, dependency checks, and call obligations. `data.mjs` owns data types, value views, JavaScript operation semantics, joins, parameter-domain checks, symbolic declarations, and replay data conversion. `specifications.mjs` owns exact real operations, rational replay, entry snapshots, and contract replay generation. `proofs.mjs` owns obligations, proof evidence, and scheduling. `backend.mjs` owns the worker protocol, capability checks, response validation, and hard deadlines. `solver.mjs` owns Z3 execution and witness extraction in a subprocess. `index.mjs` owns replay outcome policy, monitored source replay, diagnostic positions, and final dependency gating. The CLI handles presentation. The [call-contract design](design/calls.md) records the proof-composition rule and its limits.

Number inputs are raw 64-bit bitvectors reinterpreted as binary64. This covers all JavaScript numbers and preserves signed zero without decoding the unspecified IEEE-bit conversion of a solver NaN. NaN payloads cannot be observed by this subset. Every arithmetic operation has explicit floating-point semantics, and numeric equality uses `fp.eq` rather than SMT structural equality.

Arrays are compiler views: a 32-bit length and an indexed primitive-value function. Literals, slices, and conditionals build these views directly, without SMT array or datatype theories. An `every` contract adds a universal quantifier guarded by the array length. Callback indices are present unsigned integers that binary64 represents exactly, so indexed reads reuse the exact unsigned view. Optional values carry presence separately from payloads; records additionally carry own-key presence. These flags must guard every fast path, including array indices with cached integer payloads.

The model describes these operations with adequate runtime resources; allocation failures and out-of-memory behavior are outside its guarantees.

Each verification request owns its solver subprocesses, so concurrent API calls do not share Z3 state. Each distinct obligation has its own solver, and all targets and workers in one request share a deadline. The parent kills a process that exceeds its turn budget. Initialization errors and killed workers cannot produce new verified verdicts. Completed evidence remains available. A satisfiable precondition also gets a JavaScript witness check; a counterexample requires an actual failing source execution.

Trusted components are Acorn, Node's type stripping, local module resolution and snapshots, our source translation, exact rational specification replay, Z3 and its WASM bindings, standard unmodified `Number`/`Math`/`Object`/`Array` builtins and prototypes, and the JavaScript runtime. Tests check this connection but do not formally prove the translation correct. Successful verification is not an independently checkable Rocq certificate.

Two design candidates and an independent cross-judge selected this split over a single verifier module using the TypeScript compiler API. The installed native TypeScript 7 package has no stable `createSourceFile` API. The synthesis retains explicit missing-contract and vacuity outcomes, JSON-safe witnesses, and per-file solver isolation. The initial slice deferred mathematical specification arithmetic.

The exact specification layer adds explicit bridges and definedness checks to
that initial design. It keeps runtime arithmetic unchanged and expands checked
pure definitions rather than trusting user-supplied axioms.

The collections design selected structural views over bounded tuples or SMT aggregate datatypes. It retains native undefined behavior instead of adding out-of-bounds obligations. The independent design review identified key presence during spread and inherited optional names as necessary distinctions. The [prefix-contract design](design/prefix.md) adds native `every` contracts over those views. An object identity and heap model remains deferred.

`tests/verify/source.test.mjs` exercises the public API and CLI. It compares source verification with V8 on numerical edge cases for each supported binary operator and numeric builtin, checks branch behavior, confirms failing executions, and exercises rejection, vacuity, original-source spans, and resource exhaustion.

`tests/verify/scalar-state.test.mjs` covers local updates, captured reads, assignment values, binary64 edge cases, branch joins, early returns, block scope, shadowing, short circuits, ordered call facts and arguments, and fail-closed effects. Incorrect update contracts produce replay-confirmed counterexamples.

`tests/verify/collections.test.mjs` covers array/object examples, V8 slice edge cases, structured counterexamples, key presence, undefined coercions, large-witness handling, and explicit rejection of reference identity, mutation, sparse arrays, and exotic objects.

`tests/verify/prefix.test.mjs` covers universal array contracts, nesting and Boolean polarity, callback scopes, native value semantics, unsupported syntax, and witness limits. `tests/verify/remeda-take.test.mjs` checks the pinned upstream eager body, a mutation that changes contents while preserving length, and fixture drift.

`tests/verify/calls.test.mjs` covers modular calls, evaluation order, short circuits, opaque summaries, optional results, replay namespaces, dependency failures, and unsupported calls. The domain table checks symbolic call requirements against concrete replay conformance. CLI tests cover call diagnostics, replay budgets, and transitive gating after replay. `tests/verify/remeda-calls.test.mjs` checks real prefix composition and a shifted wrapper.

`tests/verify/imports.test.mjs` and `imports-cli.test.mjs` cover aliases, module scopes, canonical diamonds, helper edits, opaque contracts, dependency positions, post-replay gating, exact resolution, UTF-8 and BOM handling, and rejected import forms. `remeda-imports.test.mjs` checks the pinned helper across actual files and confirms that weakening its contract removes the unchanged caller's proof.

`tests/verify/proof-backends.test.mjs` uses a controlled clock and backend to check scheduling in both target orders, retained evidence, one shared budget, and fail-closed witness policy. `backend-process.test.mjs` checks actual process interruption, worker/protocol failures, capability rejection, real Z3 assertion isolation, and independent concurrent source requests. Deadline tests trigger the timer directly instead of asserting machine speed.

`tests/verify/project-frontend.test.mjs` checks concrete aliases, type provenance, barrels, default bindings, package/config policy, metadata invalidation, read-once snapshots, unsupported erased syntax, and the pinned offline project.

`tests/verify/specifications.test.mjs` covers exact rational replay, finite
bridges and ordered requires, fractional and rounded operands, overflow,
entry snapshots, checked lemma reuse, imported specifications, recursive and
false lemmas, and scoped obligations under quantified and negated contracts.

## Run the independent conformance corpus

`make test-verify-conformance` runs native V8 comparisons and eight semantic or
verdict-policy mutants in temporary verifier copies. `make test-verify` includes
these tests. The corpus covers the current supported subset with explicit edge
cases, small seeded binary64 samples, and original JavaScript execution.

To capture source, assumption, provenance, witness-replay, and mutation evidence:

```sh
node verify/conformance/run.mjs --seed 1592643597 --mutations > conformance.json
```

The corpus command exits 0 when expected outcomes and mutation detections match,
including the deliberate bad programs.

The default seed is `0x5eedd00d`. Each reported counterexample must reproduce in
an independent native execution. Call failures use separate native domain and
precondition checks. Mutation controls must pass before a changed verifier can
count as detected. Crashes and exhausted solver budgets do not count as mutation
detections. The [corpus design](design/conformance-corpus.md) describes the
supported fixtures and extension points. These finite checks provide conformance
evidence; the translator and solver remain trusted.
