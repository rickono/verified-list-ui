#!/bin/sh
# Invoke through the shared serial-verify.py lane from the repository root.
set -eu
node --test --test-concurrency=1 \
  tests/verify/heap-write-audit.test.mjs \
  tests/verify/heap.test.mjs \
  tests/verify/heap-conformance.test.mjs \
  tests/verify/calls.test.mjs \
  tests/verify/call-domains.test.mjs \
  tests/verify/calls-cli.test.mjs \
  tests/verify/integration.test.mjs \
  tests/verify/conformance.test.mjs \
  tests/verify/local-result.test.mjs \
  tests/verify/es-toolkit-sum-mean.test.mjs
