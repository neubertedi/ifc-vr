import { defineConfig } from "vite";
import { resolve } from "node:path";

// base "./" => alle Asset-Pfade relativ, funktioniert auf GitHub Pages
// (Unterpfad /repo/) genauso wie lokal und im Quest-Browser.
export default defineConfig({
  base: "./",
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
