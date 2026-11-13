// Independent report decoder: sharing is restored from public alias paths,
// without importing the compiler, heap encoding or native replay monitor.
export function restoreAliases(inputs, aliases = []) {
  const parts = (path) => path.split(/[.\[\]]/).filter(Boolean);
  const read = (path) => parts(path).reduce((value, key) => value[key], inputs);
  for (const group of aliases) {
    const object = read(group[0]);
    if (!object || typeof object !== "object") throw new Error("Alias report does not name a reference.");
    for (const path of group.slice(1)) {
      const keys = parts(path), key = keys.pop();
      const owner = keys.reduce((value, k) => value[k], inputs);
      if (!Object.hasOwn(owner, key)) throw new Error("Alias path is outside the reported inputs.");
      owner[key] = object;
    }
    if (!group.every((path) => read(path) === object)) throw new Error("Alias reconstruction failed.");
  }
  return inputs;
}
