// Vite plugin: `import { ... } from "./counter.fold"` bundles the module
// Rocq prints for that file.  Each .fold file is built strictly (fwfb and
// every invariant proof checked by Rocq) before its TypeScript is used, so a
// failing proof stops the build with the same diagnostics the content
// mapper shows in the editor.
//
// The module's id is the .fold path plus ".ts", so Vite treats it as
// TypeScript everywhere (transforms, dev-server content type, HMR).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, formatDiagnostic, FoldBuildError } from "./src/index.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default function fold(options = {}) {
  const labelRoot = options.labelRoot ?? repo;
  const sourceOf = (id) => {
    const file = id.split("?")[0];
    if (!file.endsWith(".fold.ts")) return null;
    const src = file.slice(0, -3);
    return fs.existsSync(src) ? src : null;
  };
  return {
    name: "fold",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.endsWith(".fold")) return null;
      const r = await this.resolve(source, importer, { skipSelf: true });
      const file = r ? r.id : importer ? path.resolve(path.dirname(importer), source) : path.resolve(source);
      return fs.existsSync(file) ? `${file}.ts` : null;
    },
    async load(id) {
      const file = sourceOf(id);
      if (!file) return null;
      this.addWatchFile(file);
      const src = await fs.promises.readFile(file, "utf8");
      const label = path.relative(labelRoot, file).split(path.sep).join("/");
      try {
        const { ts } = await compile(src, { file: label, rocq: options.rocq, theories: options.theories });
        return ts;
      } catch (e) {
        if (!(e instanceof FoldBuildError)) throw e;
        this.error(`${e.message}\n${e.diagnostics.map((d) => formatDiagnostic(src, label, d)).join("\n")}`);
      }
    },
  };
}
