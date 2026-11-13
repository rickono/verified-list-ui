# Standards review: local `result` and the es-toolkit pilot

**Verdict: PASS.**

**Head checked:** `44809983ca516600292b42a8f2b7db8b4ecc1b78`
**Range:** `fa2b4393de974fbfc41347ed9cfe2ce5ec776ba6..44809983ca516600292b42a8f2b7db8b4ecc1b78`
**Axis:** Standards. This pilot is not Q or K.

## Documented standards

At that head, `git ls-tree -r` has no `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `.editorconfig`, ESLint, Prettier, or Biome config. The only loose name hit is `browser/styles.css`. The `tsconfig.json` files are compiler settings, not a style guide. No pstack path is present. `32bd5b260aa116ca88642a1479bed8d3fc447f4b` is an ancestor of the head. There is no documented-standard breach.

## TypeScript skill

`typescript-best-practices` was read before the `.ts` files, including the type-system and boundary principle skills it names. The range adds four upstream pins: `sum.upstream.ts`, `mean.upstream.ts`, and their specs. They contain no `as` and no `any`. They are byte fixtures, not authored types. The range has no authored `.ts` or `.tsx`, so there is no skill breach to file.

## Production and new files

`verify/source.mjs` changes one gate. `LOCAL_RESERVED` is `RESERVED` without `"result"`. Only `localName` uses it. Only `varBindings` and `lexicalBindings` call `localName`. A `for` initializer reaches that path through `lexicalBindings`. `bind`, `closure`, `header`, and `parse` still use `RESERVED`. The comment beside the constant matches those call sites. The name is specific, and the change is in one place.

The README and the `prefix`, `scalar-state`, and `loops` notes state the same split: a body local named `result` is the live local in an invariant, and `result` in `ensures` is the return value. `check.mjs` follows `verify/examples/lodash/check.mjs`: annotation helpers, `nativeSamples`, and one check entry. The tests use `node:test`, `node:assert/strict`, and the public `verify` / `verifyFile` API.

## Heuristics

Judgment only. No reportable smell. Exported checker helpers match the Lodash checker, so they are not unused generality. The regression test repeats contract text so the gate test stays independent of the pin.

## Evidence spot-check

Not a solver rerun. Durable logs match `SHA256SUMS` and `local-result.md`: focused 8/8 in 36.4s; full suite at `13df4da` is 257/257, exit 0, 343.7s, with the eight new titles passing; base control 0/7; alternative A 5/7 (parameter replay collision and an admitted callback parameter). On an archive of this head, `node --check` passed for the four new `.mjs` files and `node --experimental-strip-types --check` passed for the four `.ts` pins. Pin sizes and SHA-256 match `provenance.json`. `annotatedSources` reproduced the reported annotated hashes, so its token asserts held. `nativeSamples` returned the 11 named samples. The snapshot and `node_modules` symlink were removed. Production and candidate files were not edited.

No findings.
