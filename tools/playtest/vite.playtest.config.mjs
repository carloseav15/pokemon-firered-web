// Dev server for long playtest jobs: same app as vite.config.ts, but with no HMR websocket
// (so a lost connection or an edited file never reloads the page under a running job)
// and no watching of the saved checkpoints. Port 5197; start with `npm run play:server`.
import { defineConfig, mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import base from "../../vite.config.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default mergeConfig(base, defineConfig({
  root,
  server: {
    port: 5197,
    strictPort: true,
    hmr: false,
    watch: { ignored: ["**/tools/playtest/saves/**"] },
  },
}));
