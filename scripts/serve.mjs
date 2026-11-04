// Minimal static server for the built app (no dependencies).
// Usage: node scripts/serve.mjs [dir] [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "_build/default/browser");
const port = Number(process.argv[3] ?? process.env.PORT ?? 8080);
const files = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/host.bc.js": ["host.bc.js", "text/javascript; charset=utf-8"],
};

createServer(async (req, res) => {
  const entry = files[new URL(req.url ?? "/", "http://x").pathname];
  if (!entry) {
    res.writeHead(404).end("not found");
    return;
  }
  try {
    const body = await readFile(join(dir, entry[0]));
    res.writeHead(200, { "content-type": entry[1], "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(500).end(`missing ${entry[0]}; run make build`);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`serving ${dir} at http://127.0.0.1:${port}/`);
});
