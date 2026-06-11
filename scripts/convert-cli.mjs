// Kommandozeilen-Konverter: node scripts/convert-cli.mjs eingabe.ifc [ausgabe.frag]
// Gleiche Konvertierung wie die Konverter-Webseite, nur ohne Browser –
// praktisch für Stapelverarbeitung ganzer Ordner.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as FRAGS from "@thatopen/fragments";

const [, , inputPath, outputArg] = process.argv;
if (!inputPath) {
  console.error("Aufruf: node scripts/convert-cli.mjs <eingabe.ifc> [ausgabe.frag]");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = outputArg ?? inputPath.replace(/\.ifc$/i, ".frag");

const serializer = new FRAGS.IfcImporter();
serializer.wasm = { absolute: true, path: join(root, "node_modules", "web-ifc") + "/" };

const bytes = new Uint8Array(readFileSync(inputPath));
console.log(`Konvertiere ${basename(inputPath)} (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB) …`);

const started = Date.now();
let lastLogged = -1;
const result = await serializer.process({
  bytes,
  progressCallback: (p) => {
    const pct = Math.round(p * 100);
    if (pct !== lastLogged && pct % 10 === 0) {
      lastLogged = pct;
      console.log(`  ${pct} %`);
    }
  },
});

writeFileSync(outputPath, result);
console.log(
  `Fertig in ${((Date.now() - started) / 1000).toFixed(1)} s → ${outputPath} ` +
    `(${(result.byteLength / 1024 / 1024).toFixed(2)} MB, ` +
    `${Math.round((result.byteLength / bytes.byteLength) * 100)} % der IFC-Größe)`,
);
