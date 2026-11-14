# Harmonic mean over finite positive singletons

The pinned simple-statistics 8.0.0 `src/harmonic_mean.js` is from commit
`a9ec6767820e3fc7c29ab5f179778308c75a2f47`, under the adjacent ISC license.
[provenance.json](provenance.json) records the source URL, hashes, and inherited
candidate and validation commits. `harmonic_mean.js` retains the original bytes.
The other three source files add contract comments only. The checker compares
both stripped bytes and every runtime token, including the export.

Both strong goals quantify over every dense singleton whose element is finite
and positive. Neither fixes an input nor restricts reciprocal finiteness. They
share the same requires, integer index bounds, and exact real decreases measure.
The accumulator invariant retains either index 0 with `Object.is(reciprocalSum,
0)`, or index 1 with `Object.is(reciprocalSum, 1 / x[0])`.

`harmonic-total.js` proves total return and termination with `ensures true`.
`harmonic-positive.js` claims `result > 0`. A small positive subnormal can make
`1 / x[0]` overflow to Infinity, so the unchanged return computes `1 / Infinity`,
which is `+0`. The exact mathematical harmonic mean of a singleton is its
element. This is a positivity failure, separate from ordinary binary64 rounding.
The native control at 49 returns the next representable value, one ulp higher.

`harmonic-weak.js` removes only the accumulator invariant. Depending on the
solver's witness, its positivity claim can produce a native-confirmed `+0`
failure or an honest induction gap. Verification of that claim fails the check.

Run the campaign from the repository root with dependencies installed:

```sh
python3 /Users/rick/verification-vibes/artifacts/ready-now/serial-verify.py -- node verify/examples/simple-statistics/check-harmonic.mjs /tmp/harmonic-evidence
```

The executable checker uses the current `verifyFile`, emits a fresh bug evidence
artifact, and calls `reproduce` on its original and preferred witnesses. It
checks a warm total-proof receipt and refuses stale-source and model controls.
The emitted artifact binds the current source graph and semantic/backend
identity. Use the existing CLI to replay it against this fixture:

```sh
node verify/bin/jsverify.mjs reproduce --json /tmp/harmonic-evidence/positive.evidence.json verify/examples/simple-statistics/harmonic-positive.js
```

Native controls include `Number.MIN_VALUE`, `2 ** -1024`, ordinary positive
inputs, and the upstream example `[2, 3]`. The original `[]`, `[-1]`, and `[0]`
calls throw the documented messages. They lie outside this proof domain. Throws
are admitted only by proving their paths unreachable. Native exceptions do not
become confirmed throw bugs.

The frontend, binary64 translation, loop abstraction, exact specification replay,
Z3 bindings, standard unmodified builtins, and Node remain trusted. Cache
integrity requires trustworthy writers, and readonly mode does not authenticate
receipts. Replay confirms one input; it is not a universal proof or an
independent certificate. This campaign makes no claim about arbitrary JavaScript,
larger arrays, the package as a whole, or Q completion.

The admission and strong annotations derive from candidate A `f5473537`; the
controls follow independent judgment `e97d03d`. Their historical evidence remains
unchanged. The maintained checker runs against the production implementation.
