// Scene scan: run every script label of the decomp that contains `applymovement` on its own map and report the ones
// that never finish (a waitmovement or a movement that does not complete) or throw. Each label starts with the save's
// flags/vars/bag/party restored, the player at the map's trigger/warp position, and a periodic A press for text.
// This is a hang detector, not a story check: a label that depends on other state may finish through another branch.
// Usage: PW_BASE=http://[::1]:5197/ SCAN_SAVE=route5-arrival [SCAN_MAPS=PalletTown,Route1] [SCAN_OUT=/path.json]
//        node tools/playtest/pw.mjs tools/playtest/smoke/scene-scan.job.mjs /tmp/pw/scene-scan
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = [process.env.POKEFIRERED, "../pokefirered", "pokefirered"].filter(Boolean).map(p => resolve(p)).find(p => existsSync(join(p, "data/maps")));
const only = process.env.SCAN_MAPS ? process.env.SCAN_MAPS.split(",") : null;
const out = process.env.SCAN_OUT ?? "/tmp/pw/scene-scan.json";

function labelsWithMovement(file) {
  const rows = [];
  let label = null, hit = false, line0 = 0;
  const lines = readFileSync(file, "utf8").split("\n");
  const flush = () => { if (label && hit) rows.push({ label, line: line0 }); };
  lines.forEach((raw, i) => {
    const m = /^([A-Za-z0-9_]+)::?\s*$/.exec(raw.trim());
    if (m) { flush(); label = m[1]; hit = false; line0 = i + 1; return; }
    if (/^applymovement(at)?\b/.test(raw.trim())) hit = true;
  });
  flush();
  return rows;
}

export default async function (ctx) {
  const jobs = [];
  for (const name of readdirSync(join(root, "data/maps")).sort()) {
    if (only && !only.includes(name)) continue;
    const dir = join(root, "data/maps", name);
    if (!existsSync(join(dir, "scripts.inc")) || !existsSync(join(dir, "map.json"))) continue;
    const labels = labelsWithMovement(join(dir, "scripts.inc"));
    if (!labels.length) continue;
    const map = JSON.parse(readFileSync(join(dir, "map.json"), "utf8"));
    const coord = new Map((map.coord_events ?? []).map(c => [c.script, [c.x, c.y]]));
    const warp = map.warp_events?.[0] ? [map.warp_events[0].x, map.warp_events[0].y] : [7, 7];
    jobs.push({ folder: name, mapId: map.id, labels: labels.map(l => ({ ...l, pos: coord.get(l.label) ?? warp })) });
  }
  // Common scripts have no map of their own: run them in Pallet Town.
  const common = [];
  if (!only) for (const f of readdirSync(join(root, "data/scripts")).filter(f => f.endsWith(".inc")))
    for (const l of labelsWithMovement(join(root, "data/scripts", f))) common.push({ ...l, file: f, pos: [10, 10] });
  if (common.length) jobs.push({ folder: "(common)", mapId: "MAP_PALLET_TOWN", labels: common });

  await ctx.loadSave(process.env.SCAN_SAVE ?? "route5-arrival");
  const inject = `
    window.__scan = async (mapId, label, x, y) => {
      const ow = frGame.overworld, C = H.C, sv = frDebug.save.save;
      const keep = JSON.stringify({ flags: sv.flags, vars: sv.vars, money: sv.money, bag: sv.bag, party: sv.party });
      const res = { label };
      try {
        const num = C[mapId];
        ow.setWarpDestination(num >> 8, num & 0xff, -1, x, y);
        ow.warpIntoMapAndLoad();
        // Some maps start a scene on entry (frame tables): let it finish, pressing A only while it runs.
        for (let k = 0; k < 8000 && !H.observe().fieldFree; k++) await H.wait(1, (k % 16) < 2 && H.observe().phase !== "loading" ? 1 : 0);
        if (!H.observe().fieldFree) { res.status = "entry-stuck"; return res; }
        if (!frDebug.rom.hasLabel(label)) { res.status = "nolabel"; return res; }
        const start = H.st();
        frDebug.rom.label && ow.script.ScriptContext_SetupScript(frDebug.rom.label(label));
        let idle = 0, i = 0, still = 0, last = "";
        const sm = frGame.scriptMovement ?? ow.game.scriptMovement;
        // Stall = no change of map/position/script pointer/native wait for 1500 frames; hard cap 30000 frames.
        for (; i < 30000; i++) {
          const pre = H.observe();
          // A only while the scene is running: a free field plus A would start a new NPC conversation.
          await H.wait(1, !pre.fieldFree && (i % 16) < 2 ? 1 : 0);
          const o = H.observe();
          if (o.battle || o.phase === "battle-transition") { res.status = "battle"; break; }
          if (o.fieldFree) { if (++idle >= 20) { res.status = "done"; break; } } else idle = 0;
          if (i % 10 === 0) {
            const g = ow.script.global;
            const sig = [o.map, o.x, o.y, o.facing, g.scriptPtr, g.mode, o.phase, o.tasks.length].join("|");
            if (sig === last) { still += 10; if (still >= 1500) break; } else { still = 0; last = sig; }
          }
        }
        res.frames = i;
        if (!res.status) {
          const o = H.observe(), g = ow.script.global;
          res.status = "hang";
          res.detail = { phase: o.phase, screen: o.screen, tasks: o.tasks.slice(0, 6), script: g.entry ?? null, mode: g.mode,
            native: g.nativePtr?.name ?? null, at: frDebug.rom.labelAt?.(g.scriptPtr) ?? null,
            moving: sm.entries?.map((e, s) => e && !e.finished ? { s, obj: e.objectId, ptr: e.ptr, action: frDebug.rom.u8(e.ptr) } : null).filter(Boolean) };
        }
        res.from = [start.x, start.y]; const end = H.st(); res.to = [end.x, end.y, end.facing, end.map];
      } catch (e) { res.status = "error"; res.error = String(e?.message ?? e).slice(0, 200); }
      const back = JSON.parse(keep);
      sv.flags.splice(0, sv.flags.length, ...back.flags); sv.vars.splice(0, sv.vars.length, ...back.vars);
      sv.money = back.money;
      return res;
    };
  `;
  await ctx.runEval(inject);
  const results = [];
  const errorsBefore = ctx.errors().length;
  for (const job of jobs) {
    for (const l of job.labels) {
      let r;
      try {
        r = await ctx.page.evaluate(`window.__scan(${JSON.stringify(job.mapId)}, ${JSON.stringify(l.label)}, ${l.pos[0]}, ${l.pos[1]})`);
        if (r.status !== "done" && r.status !== "nolabel") {
          // A stuck or failed scene leaves the field dirty: start the next label from a fresh page.
          await ctx.loadSave(process.env.SCAN_SAVE ?? "route5-arrival");
          await ctx.runEval(inject);
        }
      } catch (e) {
        r = { label: l.label, status: "crash", error: String(e).slice(0, 200) };
        await ctx.loadSave(process.env.SCAN_SAVE ?? "route5-arrival");
        await ctx.runEval(inject);
      }
      results.push({ map: job.folder, ...r });
      if (r.status !== "done") console.error(`${job.folder} ${l.label}: ${r.status} ${JSON.stringify(r.detail ?? r.error ?? "")}`);
    }
    writeFileSync(out, JSON.stringify(results, null, 1));
  }
  const tally = {};
  for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
  return { ok: true, total: results.length, tally, pageErrors: ctx.errors().length - errorsBefore, out };
}
