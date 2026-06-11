import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

/**
 * Die Fragments-Engine schätzt ihr Grafikspeicher-Budget aus der
 * Browserfenster-Größe (Breite × Höhe × Pixeldichte² × 200 ≈ Bytes).
 * Auf der Quest ist das 2D-Fenster klein → ~100 MB Budget → die Engine
 * blendet Bauteile dauerhaft aus („memoryOverflow"), egal wie nah man ist.
 * Der Patch zieht eine Untergrenze von 512 MB ein. Es gibt dafür keine
 * öffentliche API (GPU-Klasse ist nicht exportiert), daher dieser Eingriff.
 */
function patchFragmentsGpuBudget(): Plugin {
  const needle = `__publicField(GPU, "capacityFactor", 200);`;
  const patch =
    needle +
    `\nGPU.estimateCapacity = () => Math.max(512 * 1024 * 1024, ` +
    `Math.trunc(window.screen.width * window.screen.height * ` +
    `window.devicePixelRatio * window.devicePixelRatio * GPU.capacityFactor));`;
  return {
    name: "patch-fragments-gpu-budget",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").includes("@thatopen/fragments/dist/index.mjs")) return null;
      if (!code.includes(needle)) {
        this.error(
          "GPU-Budget-Patch greift nicht mehr – @thatopen/fragments-Version geändert? " +
            "Stelle in dist/index.mjs suchen: " + needle,
        );
      }
      return { code: code.replace(needle, patch), map: null };
    },
  };
}

// base "./" => alle Asset-Pfade relativ, funktioniert auf GitHub Pages
// (Unterpfad /repo/) genauso wie lokal und im Quest-Browser.
export default defineConfig({
  base: "./",
  plugins: [patchFragmentsGpuBudget()],
  optimizeDeps: {
    // Nötig, damit der GPU-Budget-Patch auch im Dev-Server greift
    // (vorgebündelte Abhängigkeiten umgehen sonst die Plugin-Pipeline)
    exclude: ["@thatopen/fragments"],
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        convert: resolve(__dirname, "convert.html"),
      },
    },
  },
});
