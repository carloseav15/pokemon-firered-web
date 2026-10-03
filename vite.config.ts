import { defineConfig } from "vite";

// Multipagina: index.html (juego) + viewer.html (visor del mundo v1).
// El comportamiento de index.html no cambia.
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: "index.html", viewer: "viewer.html" },
    },
  },
});
