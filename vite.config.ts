import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

// Multipagina: index.html (landing Odyssey) + play.html (Modo Historia) + world.html (Modo Mundo Abierto) + viewer.html.
// `@game/*` resuelve al contenido del juego compilado (docs/SEPARACION-MOTOR.md §4.1); mismo
// mapa que `paths` en tsconfig.json, que también usa esbuild en tools/checks.
const game = process.env.GAME ?? "firered";

function cleanRoutingPlugin(): Plugin {
  return {
    name: "clean-routing",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next();
        const parsed = new URL(req.url, "http://localhost");
        if (parsed.pathname === "/play") {
          req.url = "/play.html" + parsed.search;
        } else if (parsed.pathname === "/world") {
          req.url = "/world.html" + parsed.search;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [cleanRoutingPlugin()],
  resolve: {
    alias: {
      "@game": fileURLToPath(new URL(`./src/games/${game}`, import.meta.url)),
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        play: "play.html",
        world: "world.html",
        viewer: "viewer.html",
        maps: "maps.html",
        compare: "compare.html",
        dex: "dex.html",
        library: "library.html",
        quests: "quests.html",
        story: "story.html",
        atlas: "atlas.html",
        crystal: "crystal.html",
        crystalWorld: "crystal-world.html",
        hns: "hns.html",
        expansion: "expansion.html",
      },
    },
  },
});
