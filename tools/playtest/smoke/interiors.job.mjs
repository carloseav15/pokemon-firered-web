// Opens every exported map (exteriors and interiors) of FireRed and Emerald in the interior viewer and reports the
// ones that fail to load or draw. Needs PW_TIMEOUT_MS >= 900000.
const BASE = process.env.PW_BASE ?? "http://localhost:5174/";

export default async function run(ctx) {
  const report = {};
  for (const game of ["firered", "emerald"]) {
    const url = `${BASE}viewer.html?legacy=1${game === "emerald" ? "&game=emerald" : ""}`;
    await ctx.page.goto(url, { waitUntil: "load" });
    await ctx.page.waitForFunction(() => window.frInterior, null, { timeout: 60000 });
    const ids = await ctx.runEval(`
      const root = ${JSON.stringify(game === "emerald" ? "/emerald" : "/fr")};
      return Object.keys((await (await fetch(root + "/maps.json")).json()).maps);
    `);
    const failures = [];
    let ok = 0;
    const chunk = 60;
    for (let i = 0; i < ids.length; i += chunk) {
      const part = ids.slice(i, i + chunk);
      const res = await ctx.runEval(`
        const out = [];
        for (const id of ${JSON.stringify(part)}) {
          const v = window.frInterior;
          v.history = [];
          v.current = null;
          try { await v.open(id, null); } catch (e) { out.push({ id, error: String(e) }); continue; }
          const meta = document.querySelector(".interior-meta")?.textContent ?? "";
          const c = document.querySelector(".interior-map canvas");
          if (meta.startsWith("No se pudo cargar") || meta === "Cargando…") { out.push({ id, error: meta.slice(0, 160) }); continue; }
          if (!c || !c.width || !c.height) { out.push({ id, error: "sin lienzo" }); continue; }
          const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
          let painted = 0;
          for (let k = 3; k < d.length; k += 4) if (d[k] !== 0) painted++;
          const total = c.width * c.height;
          if (painted === 0) out.push({ id, error: "lienzo vacío" });
          else if (painted < total * 0.5) out.push({ id, error: "lienzo con " + Math.round(100 * painted / total) + " % pintado" });
          const warps = document.querySelectorAll(".interior-mark.warp").length;
          const objs = document.querySelectorAll(".interior-mark.obj").length;
          out.push({ id, ok: true, w: c.width / 16, h: c.height / 16, warps, objs });
        }
        return out;
      `);
      for (const r of res) {
        if (r.error) failures.push(r);
        else ok++;
      }
    }
    report[game] = { total: ids.length, ok, failures };
  }
  const bad = Object.values(report).reduce((n, g) => n + g.failures.length, 0);
  return { ok: bad === 0, status: bad === 0 ? "success" : "failure", report };
}
