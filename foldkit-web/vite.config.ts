import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The programs are printed by Rocq (`make foldkit`) and bundled as-is.
// Output goes under _build so `make clean` removes it.
//   /              list UI (Foldkit)
//   /counter.html  counter (Foldkit, saved in localStorage)
export default defineConfig({
  root: here("."),
  resolve: {
    alias: {
      "@program": here("../_build/default/foldkit/counter.program.ts"),
      "@list-program": here("../_build/default/foldkit/list.program.ts"),
    },
  },
  server: { fs: { allow: [here("..")] } },
  build: {
    outDir: here("../_build/foldkit-web"),
    emptyOutDir: true,
    rolldownOptions: { input: { index: here("index.html"), counter: here("counter.html") } },
  },
});
