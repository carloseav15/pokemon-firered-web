// TS side of the oracle: bundle the real src/fr modules with esbuild and let an
// esbuild plugin append `export { fn as __o_fn }` / state accessors to the
// target modules IN MEMORY, so src/fr is never edited to expose internals.
import esbuild from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { ROOT, OUT } from "./cwasm.mjs";

/** targets: Map<absFile, { fns:Set<string>, state:Map<alias, expr> }> */
export function collectTargets(specs) {
  const targets = new Map();
  for (const s of specs) {
    for (const t of s.tsTargets ?? []) {
      const abs = path.join(ROOT, t.file);
      const e = targets.get(abs) ?? { fns: new Set(), state: new Map() };
      if (t.name) e.fns.add(t.name);
      for (const [alias, expr] of Object.entries(t.state ?? {})) e.state.set(alias, expr);
      targets.set(abs, e);
    }
  }
  return targets;
}

export async function bundleTs(specs, tag = "run") {
  const t0 = Date.now();
  mkdirSync(OUT, { recursive: true });
  const targets = collectTargets(specs);
  const files = [...targets.keys()];
  const entry = [
    `import ${JSON.stringify(path.join(ROOT, "tools/checks/setupNodeGbaMock.ts"))};`,
    `import * as assets from ${JSON.stringify(path.join(ROOT, "src/fr/hw/assets.ts"))};`,
    `import { rom } from ${JSON.stringify(path.join(ROOT, "src/fr/rom.ts"))};`,
    ...files.map((f, i) => `import * as m${i} from ${JSON.stringify(f)};`),
    `export { assets, rom };`,
    `export const mods = { ${files.map((f, i) => `${JSON.stringify(f)}: m${i}`).join(", ")} };`,
  ].join("\n");
  const plugin = {
    name: "oracle-expose",
    setup(b) {
      b.onLoad({ filter: /\.ts$/ }, (args) => {
        const t = targets.get(args.path);
        if (!t) return null;
        let src = readFileSync(args.path, "utf8");
        for (const fn of t.fns) src += `\nexport { ${fn} as __o_${fn} };`;
        for (const [alias, expr] of t.state) {
          src += `\nexport const __o_state_${alias} = { get: () => (${expr}), set: (v: number) => { ${expr} = v; } };`;
        }
        return { contents: src, loader: "ts" };
      });
    },
  };
  const outfile = path.join(OUT, `ts-${tag}.mjs`);
  await esbuild.build({
    stdin: { contents: entry, resolveDir: ROOT, loader: "ts", sourcefile: "oracle-entry.ts" },
    bundle: true, platform: "node", format: "esm", outfile, logLevel: "error", plugins: [plugin],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const ns = await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
  return { ns, bundleMs: Date.now() - t0, outfile };
}
