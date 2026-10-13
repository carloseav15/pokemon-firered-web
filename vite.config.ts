import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Multipagina: index.html (juego) + viewer.html (visor del mundo v1).
// El comportamiento de index.html no cambia.
// `@game/*` resuelve al contenido del juego compilado (docs/SEPARACION-MOTOR.md §4.1); mismo
// mapa que `paths` en tsconfig.json, que también usa esbuild en tools/checks.
const game = process.env.GAME ?? "firered";

export default defineConfig({
  resolve: {
    alias: {
      "@game": fileURLToPath(new URL(`./src/games/${game}`, import.meta.url)),
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: { main: "index.html", viewer: "viewer.html", compare: "compare.html", dex: "dex.html", library: "library.html", quests: "quests.html", story: "story.html" },
    },
  },
});
