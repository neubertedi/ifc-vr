// Kopiert web-ifc-WASM und den Fragments-Worker aus node_modules nach public/,
// damit die App ohne CDN (unpkg) auskommt und Versionen immer zum npm-Paket passen.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  {
    from: join(root, "node_modules", "web-ifc", "web-ifc.wasm"),
    to: join(root, "public", "wasm", "web-ifc.wasm"),
  },
  {
    from: join(root, "node_modules", "web-ifc", "web-ifc-mt.wasm"),
    to: join(root, "public", "wasm", "web-ifc-mt.wasm"),
    optional: true,
  },
  {
    from: join(root, "node_modules", "@thatopen", "fragments", "dist", "Worker", "worker.mjs"),
    to: join(root, "public", "frag-worker", "worker.mjs"),
  },
];

for (const { from, to, optional } of targets) {
  if (!existsSync(from)) {
    if (optional) continue;
    console.error(`FEHLT: ${from}`);
    process.exitCode = 1;
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`kopiert: ${to}`);
}
