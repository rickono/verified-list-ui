import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import fold from "../fold/vite.mjs";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The programs are written in src/*.fold.  The fold plugin has Rocq check
// each one (fwfb and its invariant proofs) and bundles the TypeScript module
// Rocq prints for it.  Output goes under _build so `make clean` removes it.
//   /              list UI (Foldkit)
//   /counter.html  counter (Foldkit, saved in localStorage)
export default defineConfig({
  root: here("."),
  plugins: [fold()],
  server: { fs: { allow: [here("..")] } },
  build: {
    outDir: here("../_build/foldkit-web"),
    emptyOutDir: true,
    rolldownOptions: { input: { index: here("index.html"), counter: here("counter.html") } },
  },
});
