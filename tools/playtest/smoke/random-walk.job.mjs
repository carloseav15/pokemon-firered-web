// Endurance run without a fixed goal (driver rebuild phase 4): from several checkpoints the driver plays for RW_MINUTES
// (default 10) wall-clock minutes choosing actions at random (seeded): walk to a random reachable tile, talk to a visible
// NPC, take a warp, tour one START-menu entry and leave it, and whatever wild/trainer battles the walking triggers
// (H.battle auto). Everything goes through the single loop; exploration declines script Yes/No questions
// (policy.unansweredYesNo=false) and backs out of menus (idleDefaults.exitMenus). PASS = no "unknown" screen, no stuck/no-effect,
// no input-required dead end. The first finding stops the run and is returned with the state dump, so it can be
// catalogued (handler + case in screen-catalog) and the run repeated.
// Usage: RW_SAVES=a,b,c RW_MINUTES=10 RW_SEED=1 node tools/playtest/pw.mjs tools/playtest/smoke/random-walk.job.mjs /tmp/pw/rw
import { runJob } from "./son-mm-lib.mjs";

const SAVES = (process.env.RW_SAVES ?? "cerulean-arrival,mtmoon-b2f-20261006233746,pewter").split(",");
const MINUTES = Number(process.env.RW_MINUTES ?? 10), SEED = Number(process.env.RW_SEED ?? 1);

const body = (minutes, seed) => `
  const C = H.C, S = await H.mod("/src/fr/save.ts"), SM = await H.mod("/src/fr/startMenu.ts");
  const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rng = mulberry32(${seed}), pick = (a) => a[Math.floor(rng() * a.length)];
  H.policy.set({ unansweredYesNo: false });
  H.idleDefaults = { state: { exitMenus: true } };
  H.trackScreens(true);
  const counts = {}, notes = {}, maps = new Set(), bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };
  const FINDING = /unknown-screen|^stuck$|no-effect|no-handler|frame-budget|wrong-|forget-move-without|evolution-prompt|cursor-not-reached|menu-closed|input-required|unanswered|unhandled|item-not|medicine-target|unexpected/;
  // Last actions with their notes and positions: printed with a finding, so the sequence that led to it is visible.
  const history = []; const note = (a, r) => { history.push(a + ":" + (r?.note ?? r?.reason ?? "ok") + "@" + H.st().map + "(" + H.st().x + "," + H.st().y + ")"); if (history.length > 20) history.shift(); };
  const t0 = performance.now(), budget = ${minutes} * 60000;
  const finding = (action, r) => ({ finding: true, history, action, note: r?.note ?? r?.reason ?? null, driver: r?.driver ?? r?.stop ?? null, state: H.observe(), screens: Object.keys(H.tracking?.screens ?? {}) });
  const bad = (r) => !!r && r.note !== "nothing to interact with" && (FINDING.test(String(r.note ?? "")) || FINDING.test(String(r.reason ?? "")) || r.driver?.reason && FINDING.test(r.driver.reason));
  const tally = (r) => { const n = r?.note ?? r?.reason ?? "ok"; notes[n] = (notes[n] ?? 0) + 1; };
  const entries = () => { const menu = { order: [], numItems: 0, pokedexObtained: S.FlagGet(C.FLAG_SYS_POKEDEX_GET), pokemonObtained: S.FlagGet(C.FLAG_SYS_POKEMON_GET), linkStateActive: false, inUnionRoom: false, inSafariZone: false }; SM.SetUpStartMenu(menu); return menu.order.filter(e => e !== 4 && e !== 6 && e !== 7); }; // not SAVE/EXIT/RETIRE
  const fightOut = async () => {
    let b = await H.battle("auto", 0, 4000); bump("battle"); tally(b);
    if (b.stuck && !FINDING.test(String(b.stop ?? ""))) { b = await H.battle("fight", 0, 4000); bump("battle-fight"); tally(b); } // policy stop: push through
    return b;
  };
  while (performance.now() - t0 < budget) {
    H.checkExecution();
    maps.add(H.st().map);
    if (H.inBattle()) { const b = await fightOut(); if (b.driver && bad({ note: b.stop, driver: b.driver })) return finding("battle", b); if (b.stuck) return finding("battle-unfinished", b); continue; }
    if (!H.fieldFree()) { const r = await H.idle(8000, true); tally(r); if (r.battle) continue; if (!r.ok) { if (bad(r) || r.status === "blocked") return finding("settle", r); } continue; }
    const roll = rng();
    let r;
    if (roll < 0.40) {
      const s = H.st(), tries = [];
      for (let i = 0; i < 30 && tries.length < 1; i++) { const x = s.x + Math.floor(rng() * 25) - 12, y = s.y + Math.floor(rng() * 25) - 12; if (x >= 0 && y >= 0 && (x !== s.x || y !== s.y) && H.bfs(x + 7, y + 7) !== null) tries.push([x, y]); }
      if (!tries.length) { bump("walk-none"); await H.wait(30); continue; }
      bump("walk"); r = await H.goto(tries[0][0], tries[0][1], { recovery: true, battle: "auto" });
    } else if (roll < 0.62) {
      const o = H.objects().filter(o => !o[4] && o[0] !== 255 && H.bfs(o[1] + 7, o[2] + 7 + 1) !== null || false);
      const t = o.length ? pick(o) : null;
      if (!t) { bump("talk-none"); await H.wait(30); continue; }
      bump("talk"); note("talk obj" + t[0] + "@" + t[1] + "," + t[2], null); r = await H.talk(t[1], t[2]);
      if (!bad(r)) { const i = await H.idle(8000, true); tally(i); note("idle-after-talk", i); if (i.battle) continue; if (bad(i) || (!i.ok && i.status === "blocked")) return finding("talk-settle", i); }
    } else if (roll < 0.80) {
      const e = entries();
      bump("menu"); note("menu", null); r = await H.tourMenu(pick(e));
    } else {
      const w = H.warps().filter(w => H.bfs(w[0] + 7, w[1] + 7) !== null);
      if (!w.length) { bump("warp-none"); await H.wait(30); continue; }
      const t = pick(w); bump("warp"); note("warp" + t[0] + "," + t[1], null); r = await H.goto(t[0], t[1], { recovery: true, battle: "auto" });
      if (!bad(r)) { const i = await H.idle(2000, false); tally(i); if (bad(i)) return finding("warp-settle", i); }
    }
    tally(r); note("main", r);
    if (bad(r)) return finding("action", r);
  }
  const t = H.trackScreens(false);
  return { ok: !t.unknown, elapsedMs: Math.round(performance.now() - t0), counts, notes, maps: [...maps], screens: Object.fromEntries(Object.entries(t.screens).map(([k, v]) => [k, v.count])), unknown: t.unknown, mismatch: t.mismatch };
`;

export default async function run(ctx) {
  const out = [];
  for (const save of SAVES) {
    await ctx.loadSave(save);
    const r = await runJob(ctx, body(MINUTES, SEED), { maxFrames: 20000000, timeoutMs: MINUTES * 60000 + 120000, deadlineMs: MINUTES * 60000 + 150000 });
    out.push({ save, ...r });
    process.stderr.write(`random-walk ${save}: ${JSON.stringify(r).slice(0, 600)}\n`);
    if (r?.finding || r?.ok === false) { throw Object.assign(new Error("random-walk finding at " + save), { result: { ok: false, out } }); }
  }
  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  return { ok: true, out };
}
