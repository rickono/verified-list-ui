# Third-party pins

Measured from the supplied snapshots: `pins/p-event/before/` is upstream
`1674bd43fe7602d2f048d3d199be12d4ef16787c`, and `pins/p-event/fixed/` is
`da59143760a36bcf9e3f309609c2ddf33c27c8bd`. Each directory retains the unchanged
source, upstream tests, package metadata, and original MIT license. Both package
files identify version 1.3.0. The git commits distinguish the implementations.
No published p-event tarball is substituted for these git snapshots.

Measured from the exact npm registry responses and tarballs: the native
dependency is `p-timeout@1.1.1`, which satisfies the snapshots' `^1.1.1` range.
The production parser dependency is `acorn@8.19.0`, which matches the prepared
repository's dependency declaration. Both packages declare no runtime
dependencies. Their complete published tarballs, metadata, and licenses are
included. Their module, package, license, and archive digests are recorded in
`provenance.json`; the runner checks every extracted member before execution.
All three upstream packages use the MIT license.

Measured execution scope is limited to the four cases and production admission.
The upstream `test.js` files serve as reference evidence. The runner does not
execute AVA, delay, development dependencies, package binaries, or lifecycle
scripts. It uses Node's built-in EventEmitter, promises, and timers. Temporary
dependency copies are private to this report directory and removed after use.

Primary sources are [issue 7](https://github.com/sindresorhus/p-event/issues/7),
the [fix](https://github.com/sindresorhus/p-event/commit/da59143760a36bcf9e3f309609c2ddf33c27c8bd),
[p-timeout 1.1.1](https://registry.npmjs.org/p-timeout/1.1.1), and
[Acorn 8.19.0](https://registry.npmjs.org/acorn/8.19.0).
