import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

/**
 * Zwei gezielte Eingriffe in die Fragments-Engine (keine öffentliche API
 * vorhanden – GPU-Klasse und View-Erzeugung sind nicht exportiert):
 *
 * 1. Grafikspeicher-Budget: wird aus der Browserfenster-Größe geschätzt
 *    (Breite × Höhe × Pixeldichte² × 200 ≈ Bytes). Auf der Quest ist das
 *    2D-Fenster klein → ~100 MB → Bauteile bleiben dauerhaft ausgeblendet
 *    („memoryOverflow"). Patch: Untergrenze 512 MB; zusätzlich kann die App
 *    das Budget zur Laufzeit über globalThis.__IFCVR_GPU_BUDGET vorgeben
 *    (Detail-Regler).
 *
 * 2. viewSize fließt in die Detailstufen-Wahl ein (Pixelgröße eines Bauteils
 *    auf dem Bildschirm), nutzt aber immer window.innerWidth/Height. In VR
 *    ist der echte Framebuffer ~2× größer und das Sichtfeld weiter – die
 *    Engine hält kleine Teile (Schrauben!) für unter-Pixel-groß und blendet
 *    sie aus. Patch: globalThis.__IFCVR_VIEWSIZE (von der App beim
 *    VR-Start auf die echte Framebuffer-Größe gesetzt) hat Vorrang.
 */
function patchFragmentsEngine(): Plugin {
  const replacements: [string, string][] = [
    [
      `__publicField(GPU, "capacityFactor", 200);`,
      `__publicField(GPU, "capacityFactor", 200);\n` +
        `GPU.estimateCapacity = () => globalThis.__IFCVR_GPU_BUDGET || Math.max(512 * 1024 * 1024, ` +
        `Math.trunc(window.screen.width * window.screen.height * ` +
        `window.devicePixelRatio * window.devicePixelRatio * GPU.capacityFactor));`,
    ],
    [
      `view.viewSize = Math.max(window.innerWidth, window.innerHeight);`,
      `view.viewSize = globalThis.__IFCVR_VIEWSIZE || Math.max(window.innerWidth, window.innerHeight);`,
    ],
  ];
  return {
    name: "patch-fragments-engine",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").includes("@thatopen/fragments/dist/index.mjs")) return null;
      let patched = code;
      for (const [needle, replacement] of replacements) {
        if (!patched.includes(needle)) {
          this.error(
            "Fragments-Patch greift nicht mehr – @thatopen/fragments-Version geändert? " +
              "Stelle in dist/index.mjs suchen: " + needle,
          );
        }
        patched = patched.replace(needle, replacement);
      }
      return { code: patched, map: null };
    },
  };
}

// base "./" => alle Asset-Pfade relativ, funktioniert auf GitHub Pages
// (Unterpfad /repo/) genauso wie lokal und im Quest-Browser.
export default defineConfig({
  base: "./",
  plugins: [patchFragmentsEngine()],
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
