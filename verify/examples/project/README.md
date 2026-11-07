# Offline project fixture

`node verify/examples/project/check-project.mjs` checks a project with concrete generic records and arrays, type imports, runtime aliases, barrels, a default export, tsconfig paths, and a package with separate type and runtime targets.

The runner copies this project into a temporary directory and links the local vendor fixture as an installed package. It does not install or fetch dependencies. Every loaded function is verified.

`vendor/take/index.js` is the pinned Remeda eager declaration already recorded in `../remeda/provenance.json`, with numeric input assumptions, contracts, and an export alias. Its body is unchanged. The runner checks the upstream file hash and extracted declaration hash through `takeCases`, then compares the complete vendor fixture. The MIT license is retained beside the fixture.

This project exercises loading and concrete type expansion. It does not verify Remeda's generic runtime wrappers, callback dispatch, or lazy pipelines.

`vendor/d3/identity.upstream.js` is the complete D3 Array 3.2.4 module at commit `94d4541626ae3ac6c847e3d4c6e31aca1a8879b4`. Its provenance records the source hash. `identity.js` prepends only numeric input assumptions and a contract to those exact bytes. The runner checks both files, and the upstream ISC license is retained.

`node verify/examples/project/check-baseline.mjs` compares the pinned eager helper's generated obligations, result shape, and executable against the starting commit. This diagnostic does not run a solver or change a checkout.

The barrel lists the quantified helper first, matching the existing Remeda import fixture. An equivalent helper-later layout exhausted the current shared 60000 ms solver budget even though every isolated obligation proved. The committed layout retains the same bodies, contracts, and strict verification assertions. Solver availability across layouts remains a backend limitation.
