// Redirect bare specifiers to the pinned verifier dependencies.
// Relative and node: imports stay with the archive module that imported them.
const deps = new URL("file:///Users/rick/verification-vibes/verified-list-ui/package.json");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:") || specifier.startsWith("file:")) {
    return nextResolve(specifier, context);
  }
  return nextResolve(specifier, { ...context, parentURL: deps.href });
}
