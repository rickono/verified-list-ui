// fold/vite.mjs, the Vite plugin: importing a .fold file bundles the module
// Rocq prints for it, after the strict build (fwfb and every proof) passes.
// make foldkit-web builds the real pages through it; these tests cover a
// failing proof, which must stop the build, and a fixed one in a scratch
// directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import fold from "../../fold/vite.mjs";

const fixture = resolve("tests/fold/fixture");
const level = readFileSync(join(fixture, "src/level.fold"), "utf8");

const bundle = (root) =>
  build({
    root,
    logLevel: "silent",
    plugins: [fold({ labelRoot: root })],
    build: {
      write: false,
      minify: false,
      lib: { entry: join(root, "src/main.ts"), formats: ["es"], fileName: "main" },
      rolldownOptions: { external: [/^effect/, /^foldkit/] },
    },
  });

test("a failed proof stops the build, with the diagnostic on the rule", async () => {
  await assert.rejects(bundle(fixture), (e) => {
    assert.match(e.message, /1 problem in src\/level\.fold/);
    assert.match(e.message, /src\/level\.fold:11:3 - error fold3: belowCap might not hold after this branch of Raised\./);
    return true;
  });
});

test("once the proof goes through, the build bundles Rocq's module", async () => {
  const root = mkdtempSync(join(tmpdir(), "fold-vite-"));
  try {
    const src = join(root, "src");
    mkdirSync(src);
    writeFileSync(join(src, "level.fold"), level.replace("model.level + n <= cap", "model.level + n < cap"));
    writeFileSync(join(src, "main.ts"), readFileSync(join(fixture, "src/main.ts"), "utf8"));
    const [out] = await bundle(root);
    const code = out.output.map((c) => c.code ?? "").join("\n");
    assert.match(code, /case "Raised": \{/);
    assert.match(code, /if \(model\.level \+ n < 10\)/);
    assert.match(code, /update\(initialModel, Message\.Raised\(\{ n: 3 \}\)\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
