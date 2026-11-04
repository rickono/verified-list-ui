import { defineConfig, devices } from "@playwright/test";

// The same scenarios run against several front ends:
//   jsoo:    extracted OCaml update/view + browser/host.ml (_build/default/browser)
//   react:   generated XState config + react/src/App.tsx (_build/react),
//            plus the counter page (counter.spec.ts)
//   foldkit: printed Foldkit programs (_build/foldkit-web): the list page
//            (foldkit-web/src/list.ts, list.spec.ts and the saving checks
//            in list-saved.spec.ts) and the counter page
//            (foldkit-web/src/main.ts, counter.spec.ts and the saving
//            checks in counter-saved.spec.ts)
const jsooPort = 8123;
const reactPort = 8124;
const foldkitPort = 8125;

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  reporter: "list",
  projects: [
    { name: "jsoo", testIgnore: /counter|saved/, use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${jsooPort}/` } },
    { name: "react", testIgnore: /saved/, use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${reactPort}/` } },
    { name: "foldkit", testMatch: /counter|list/, use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${foldkitPort}/` } },
  ],
  webServer: [
    {
      command: `node scripts/serve.mjs _build/default/browser ${jsooPort}`,
      url: `http://127.0.0.1:${jsooPort}/`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite preview --config react/vite.config.ts --host 127.0.0.1 --port ${reactPort} --strictPort`,
      url: `http://127.0.0.1:${reactPort}/`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite preview --config foldkit-web/vite.config.ts --host 127.0.0.1 --port ${foldkitPort} --strictPort`,
      url: `http://127.0.0.1:${foldkitPort}/`,
      reuseExistingServer: false,
    },
  ],
});
