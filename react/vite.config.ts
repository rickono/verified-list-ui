import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The machine files are emitted by Rocq (`make xstate`, `make counter`) and
// bundled as-is. Output goes under _build so `make clean` removes it.
//   /             list UI   (flat machine, JSON config)
//   /counter.html counter   (machine with context, JS module)
export default defineConfig({
  root: here("."),
  plugins: [react()],
  resolve: {
    alias: {
      "@machine": here("../_build/default/xstate/list.machine.json"),
      "@counter": here("../_build/default/counter/counter.machine.js"),
    },
  },
  server: { fs: { allow: [here("..")] } },
  build: {
    outDir: here("../_build/react"),
    emptyOutDir: true,
    rolldownOptions: { input: { main: here("index.html"), counter: here("counter.html") } },
  },
});
