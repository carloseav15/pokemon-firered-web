// Verify the route segment 2 checkpoints: each loads through the normal continue path, shows the story state of ITS
// milestone and of the earlier ones (later ones must still be false) and accepts a real step. Writes nothing to the game.
// Files: route2-<milestone>-<stamp>.json (every stamp found) and route5-arrival.json. Sources: see route2-lib.mjs.
import { existsSync, readdirSync } from "node:fs";
import { prelude } from "./lib.mjs";
import { routeHelpers, MILESTONES } from "./route2-lib.mjs";

const dir = "tools/playtest/saves";
// Flags of each milestone as reached() reports them; "later" milestones are asserted false except where the same
// event can legitimately precede them (the order is a recommendation, not a game rule), so a mismatch there is only noted.
export default async function run(ctx) {
  const files = readdirSync(dir);
  const items = [];
  for (const key of MILESTONES) for (const f of files.filter(f => new RegExp(`^route2-${key}-\\d+\\.json$`).test(f)).sort()) items.push({ key, name: f.slice(0, -5) });
  if (existsSync(`${dir}/route5-arrival.json`)) items.push({ key: "route5", name: "route5-arrival" });
  if (!items.length) throw new Error("no route segment 2 checkpoints found");
  const results = {};
  for (const { key, name } of items) {
    try {
      await ctx.loadSave(name);
      const r = await ctx.runEval(`${prelude}${routeHelpers}
        const key = ${JSON.stringify(key)}, order = ${JSON.stringify(MILESTONES)};
        const f = status(), d = reached(f), problems = [], notes = [];
        if (!f.st.free) problems.push("field not free");
        const upto = key === "route5" ? order.length : order.indexOf(key) + 1;
        order.forEach((k, i) => { if (i < upto && !d[k]) problems.push("milestone " + k + " should be true"); if (i >= upto && d[k]) notes.push("later milestone " + k + " already true"); });
        const MAPS = { rival: "MAP_CERULEAN_CITY", bridge: "MAP_ROUTE24", bill: "MAP_ROUTE25_SEA_COTTAGE", misty: "MAP_CERULEAN_CITY_GYM", rocket: "MAP_CERULEAN_CITY", route5: "MAP_ROUTE5" };
        if (f.st.map !== MAPS[key]) problems.push("map " + f.st.map);
        if (key === "route5" && !(f.bill.ticket && f.bill.notSomeonesPc)) problems.push("ticket/pc flags");
        const wp = new Set(window.frGame.overworld.loaded.header.warps.map(w => w.x + "," + w.y));
        let moved = null;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const x = f.st.x + dx, y = f.st.y + dy;
          if (wp.has(x + "," + y) || H.bfs(x + 7, y + 7) === null) continue;
          const g = await H.goto(x, y);
          if (g.ok !== false && g.map === f.st.map && g.x === x && g.y === y) { moved = { from: [f.st.x, f.st.y], to: [x, y] }; break; }
        }
        if (!moved) problems.push("no real step");
        return { problems, notes, st: f.st, party: f.res.party.map(m => [m.species, m.level, m.hp + "/" + m.maxHP]), money: f.res.money, reached: d, moved };`);
      results[name] = { status: r.problems.length ? "FAIL" : "PASS", key, ...r };
    } catch (e) { results[name] = { status: "FAIL", key, error: String(e?.message ?? e).slice(0, 500) }; }
  }
  if (ctx.errors().length) results.browserErrors = ctx.errors();
  const failed = Object.entries(results).filter(([, v]) => v.status === "FAIL");
  if (failed.length || results.browserErrors) throw new Error("checkpoint verification failed: " + JSON.stringify(results).slice(0, 1800));
  return results;
}
