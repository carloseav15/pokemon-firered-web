// Verify the Mt. Moon route checkpoints: each loads through the normal continue path, shows the story state
// expected for its milestone (MtMoon_B2F/scripts.inc: Miguel flag, VAR_MAP_SCENE_MT_MOON_B2F, Dome Fossil
// item and flags, Helix untouched) and accepts a real step. Nothing is written to the game state.
// Usage: MTMOON_STAMP=<timestamp of the run> (names mtmoon-<milestone>-<stamp>), plus cerulean-arrival.
import { existsSync } from "node:fs";
import { prelude } from "./lib.mjs";
import { helpers } from "./son-mm-lib.mjs";

const stamp = process.env.MTMOON_STAMP;
const expect = {
  b2f: { map: "MAP_MT_MOON_B2F", miguel: false, fossil: false },
  miguel: { map: "MAP_MT_MOON_B2F", miguel: true, fossil: false },
  fossil: { map: "MAP_MT_MOON_B2F", miguel: true, fossil: true },
  route4east: { map: "MAP_ROUTE4", miguel: true, fossil: true },
  arrival: { map: "MAP_CERULEAN_CITY", miguel: true, fossil: true },
};

export default async function run(ctx) {
  if (!stamp) throw new Error("set MTMOON_STAMP");
  const results = {};
  for (const [key, want] of Object.entries(expect)) {
    const name = key === "arrival" ? "cerulean-arrival" : `mtmoon-${key}-${stamp}`;
    if (!existsSync(`tools/playtest/saves/${name}.json`)) { results[key] = { status: "NOT RUN", note: "missing " + name }; continue; }
    try {
      const ready = await ctx.loadSave(name);
      const r = await ctx.runEval(`${prelude}${helpers}
        const f = status();
        const want = ${JSON.stringify(want)};
        const problems = [];
        if (f.st.map !== want.map) problems.push("map " + f.st.map);
        if (!f.st.free) problems.push("field not free");
        if (f.miguel !== want.miguel || (f.scene === 1) !== want.miguel) problems.push("miguel " + f.miguel + "/scene " + f.scene);
        const fossilOk = want.fossil
          ? f.domeItem === 1 && f.gotDome && f.gotMoon && f.hideDome && f.hideHelix && !f.gotHelix && f.helixItem === 0
          : f.domeItem === 0 && !f.gotDome && !f.gotMoon && !f.gotHelix && f.helixItem === 0;
        if (!fossilOk) problems.push("fossil " + JSON.stringify([f.domeItem, f.gotDome, f.gotMoon, f.hideDome, f.hideHelix, f.gotHelix, f.helixItem]));
        const wp = new Set(window.frGame.overworld.loaded.header.warps.map(w => w.x + "," + w.y));
        let moved = null;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const x = f.st.x + dx, y = f.st.y + dy;
          if (wp.has(x + "," + y) || H.bfs(x + 7, y + 7) === null) continue;
          const g = await H.goto(x, y);
          if (g.ok !== false && g.map === f.st.map && g.x === x && g.y === y) { moved = { from: [f.st.x, f.st.y], to: [x, y] }; break; }
        }
        if (!moved) problems.push("no real step");
        return { problems, st: f.st, party: f.res.party.map(m => [m.species, m.level, m.hp + "/" + m.maxHP]), money: f.res.money,
          miguel: f.miguel, scene: f.scene, dome: f.domeItem, gotDome: f.gotDome, gotMoon: f.gotMoon, moved };
      `);
      results[key] = { status: r.problems.length ? "FAIL" : "PASS", name, ...r };
    } catch (e) {
      results[key] = { status: "FAIL", name, error: String(e?.message ?? e).slice(0, 500) };
    }
  }
  if (ctx.errors().length) results.browserErrors = ctx.errors();
  const failed = Object.entries(results).filter(([, v]) => v.status === "FAIL");
  if (failed.length || results.browserErrors) throw new Error("checkpoint verification failed: " + JSON.stringify(results).slice(0, 1800));
  return results;
}
