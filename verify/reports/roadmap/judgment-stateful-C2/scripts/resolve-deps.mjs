import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const dependencies = createRequire('/Users/rick/verification-vibes/verified-list-ui/package.json');
export async function resolve(specifier, context, nextResolve) {
  if (['acorn', 'z3-solver'].includes(specifier)) return { url: pathToFileURL(dependencies.resolve(specifier)).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
