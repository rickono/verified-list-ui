import { registerHooks } from 'node:module';

// This dependency-resolution hook changes no source text or verifier behavior.
// The runner verifies the complete published Acorn tarball before using it.
if (!process.env.P_EVENT_ACORN_MODULE?.startsWith('file:')) throw new Error('Private pinned Acorn URL is required');
globalThis.pEventAdmissionResolutions = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolution = specifier === 'acorn'
      ? { url: process.env.P_EVENT_ACORN_MODULE, shortCircuit: true }
      : nextResolve(specifier, context);
    globalThis.pEventAdmissionResolutions.push({ specifier, parentURL: context.parentURL, url: resolution.url });
    return resolution;
  }
});
