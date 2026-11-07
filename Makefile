# Every target runs inside the project-local opam switch (./_opam).
OPAM_EXEC := opam exec --switch=$(CURDIR) --set-switch --
DUNE := $(OPAM_EXEC) dune
# TypeScript 7.1 (beta) for the .fold content mapper; the plain tsc is 7.0.
TSC71 := node node_modules/typescript-7.1/bin/tsc --runExternalCode
PORT ?= 8080

.PHONY: setup build proofs assumptions xstate test-xstate counter test-counter foldkit test-foldkit fold test-fold test-verify test-verify-conformance react foldkit-web test-browser check serve serve-react serve-foldkit clean

# One-time toolchain setup (see README.md for prerequisites).
setup:
	test -d _opam || opam switch create . --locked --deps-only -y
	pnpm install --frozen-lockfile
	pnpm exec playwright install chromium

# Check all proofs, extract, build the JavaScript bundle, and emit the
# XState config (_build/default/xstate/list.machine.json).
build:
	$(DUNE) build @default @app

proofs:
	$(DUNE) build theories

assumptions:
	$(DUNE) build @assumptions/runtest

# Emit only the XState config and its test oracle.
xstate:
	$(DUNE) build xstate/list.machine.json xstate/list.oracle.json

# Check that the pinned XState runs the emitted config as theories/XState.v
# models it, on every reachable (state, event) pair.
test-xstate: xstate
	node --test tests/xstate/machine.test.mjs

# Emit the counter (XState with context) module and its test oracle.
counter:
	$(DUNE) build counter/counter.machine.js counter/counter.oracle.json

# Check that the pinned XState runs the printed counter module as
# theories/XStateCtx.v models it, against an oracle computed from the spec,
# and that the printed Zod event schemas reject bad payloads.
test-counter: counter
	node --test tests/counter/machine.test.mjs tests/counter/payload.test.mjs

# Emit the Foldkit programs (TypeScript), counter and list, and their test oracles.
foldkit:
	$(DUNE) build foldkit/counter.program.ts foldkit/counter.oracle.json \
	  foldkit/list.program.ts foldkit/list.oracle.json

# Type-check the printed programs, then check that they run, on the pinned
# Effect and Foldkit, as theories/Fold.v models them: against oracles
# computed from the spec, at the message Schemas, and (counter) through the
# save command and the store.
test-foldkit: foldkit proofs
	$(TSC71) -p foldkit-web
	node --test tests/foldkit/program.test.mjs tests/foldkit/boundary.test.mjs tests/foldkit/list.test.mjs

# Build the .fold apps through fold/ and check them in Rocq: fwfb, every
# stated invariant, and that each is the program the theory defines.
fold:
	$(DUNE) build fold/apps

# Check the builder (rejections, failed-proof diagnostics, span mappings,
# the printed modules), the content mapper (over the protocol and through
# tsc 7.1), and the Vite plugin (a failed proof stops the build).
test-fold: foldkit fold
	node --test tests/fold/builder.test.mjs tests/fold/mapper.test.mjs tests/fold/vite.test.mjs

# Source contracts under binary64 semantics, checked by Z3 and replayed in Node.
test-verify:
	node --test --test-concurrency=1 tests/verify/*.test.mjs

# Independent V8 comparisons and scratch-copy semantic/policy mutations.
test-verify-conformance:
	node --test --test-concurrency=1 tests/verify/conformance.test.mjs

# React pages that run the emitted machines (output: _build/react):
# / is the list UI, /counter.html is the counter.
react: xstate counter
	pnpm exec tsc -p react
	pnpm exec vite build --config react/vite.config.ts

# The Foldkit pages (output: _build/foldkit-web): / is the list UI,
# /counter.html is the counter.
foldkit-web: foldkit fold
	$(TSC71) -p foldkit-web
	pnpm exec vite build --config foldkit-web/vite.config.ts

# Same Playwright scenarios against every front end (jsoo, react, foldkit).
test-browser: build react foldkit-web
	pnpm exec playwright test

# Proofs + assumptions audit + extraction + JS bundle + XState config
# + XState validation (list and counter) + Foldkit validation + the .fold
# builder and content mapper + React and Foldkit builds + browser tests.
check: build assumptions test-xstate test-counter test-foldkit test-fold test-browser test-verify

serve: build
	node scripts/serve.mjs _build/default/browser $(PORT)

serve-react: react
	pnpm exec vite preview --config react/vite.config.ts --host 127.0.0.1 --port $(PORT) --strictPort

serve-foldkit: foldkit-web
	pnpm exec vite preview --config foldkit-web/vite.config.ts --host 127.0.0.1 --port $(PORT) --strictPort

clean:
	$(DUNE) clean
