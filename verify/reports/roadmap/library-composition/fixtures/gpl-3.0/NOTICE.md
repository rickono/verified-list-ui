# GPL-3.0 report fixture

This directory is a GPL-3.0 composition fixture. The authored caller and proof
comments are distributed under GPL-3.0 with the included `LICENSE`.
The source snapshots and extracted proof queries in this report's `logs/`
directory use the same license. These are report fixtures, separate from the
MIT and ISC product examples in `verify/examples`.

`Reverse.helper.js` contains the unchanged declaration from TheAlgorithms
JavaScript, commit `636017ca51dad05339cde3b5c66cbe1d71957f7e`,
`Data-Structures/Array/Reverse.js`. Its license is in `LICENSE`. The full
original source and provenance remain in `../../../K-evidence/pilot/` relative
to this directory.

`take.helper.js` contains Remeda's unchanged eager declaration after Node's
TypeScript erasure. Its pin is `004b09194f6d39f727118c0a71adc9986bcc13e1`,
`packages/remeda/src/take.ts`. Remeda's MIT copyright and permission notice
remain intact in `LICENSE.remeda`. Its complete original source and metadata
remain in `../../../../../examples/remeda/` relative to this directory.

`caller.js` is authored for this campaign. It imports the two extracted helpers
through separate local ES modules. Added contracts, loop annotations, export
aliases, and the equivalent termination rank are identified in the report's
`provenance.json`. No helper runtime statement is rewritten.
