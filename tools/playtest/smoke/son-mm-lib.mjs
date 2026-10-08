import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Shared pieces of the Mt. Moon continuation job (DRV-07) and its bounded harness.
// Built on the DRV-03/05 driver API: H.job budgets/cancel, H.saveGame (START>SAVE with explicit YES),
// H.checkpointData and ctx.exportCheckpoint (exclusive destination, bytes verified).

/** A driver action that did not succeed. Keeps the full result so callers/runners can show it. */
export class DriverFailure extends Error {
  constructor(label, result) {
    super(`${label}: ${result?.reason ?? result?.note ?? result?.status ?? "driver failure"}`);
    this.result = result;
  }
}
/** Envelope check shared by every driver action: ok:false, status failure/blocked or a legacy note. */
export const failed = (r) => !!r && (r.ok === false || r.status === "failure" || r.status === "blocked" || (r.note && r.ok !== true));
export const assertOk = (label, r) => { if (failed(r)) throw new DriverFailure(label, r); return r; };

/**
 * Run `body` (async function body, may `return`) as an H.job with the driver's frame/time budgets and
 * wait from Node. On Node-side deadline the job is cancelled; the cancellation result is returned, never hidden.
 * Returns the job output: a driver failure/budget/cancel arrives as { ok:false, status, reason }.
 */
export async function runJob(ctx, body, { maxFrames = 150000, timeoutMs = 110000, deadlineMs = timeoutMs + 15000, prefix = "", onProgress } = {}) {
  const started = await ctx.runEval(`${prefix}
    return H.job(async () => { ${body} }, ${JSON.stringify({ maxFrames, timeoutMs })});`);
  if (started !== "started") throw new DriverFailure("job did not start", started);
  const t0 = Date.now();
  let cancelled = false;
  for (;;) {
    const s = await ctx.runEval(`const j = H.jobStatus(); return { done: j.done, out: j.out ?? null, frames: j.frames ?? null };`);
    if (s.done) return s.out;
    if (onProgress) await onProgress(s);
    if (!cancelled && Date.now() - t0 > deadlineMs) { cancelled = true; await ctx.runEval(`return H.cancelJob();`); }
    await new Promise(r => setTimeout(r, 400));
    if (Date.now() - t0 > deadlineMs + 30000) throw new Error("job did not stop after cancellation");
  }
}

/** Page-side helpers (string) shared by the route job and the harness. */
export const helpers = `
  window.__logMark ??= 0;
  const S = await H.mod("/src/fr/save.ts"), C = H.C;
  const flag = (n) => S.FlagGet(C[n]);
  const status = () => ({
    st: { map: H.st().map, x: H.st().x, y: H.st().y, free: H.fieldFree() },
    res: H.resources(),
    miguel: S.FlagGet(C.TRAINER_FLAGS_START + C.TRAINER_SUPER_NERD_MIGUEL), scene: S.VarGet(C.VAR_MAP_SCENE_MT_MOON_B2F),
    gotDome: flag("FLAG_GOT_DOME_FOSSIL"), gotHelix: flag("FLAG_GOT_HELIX_FOSSIL"), gotMoon: flag("FLAG_GOT_FOSSIL_FROM_MT_MOON"),
    hideDome: flag("FLAG_HIDE_DOME_FOSSIL"), hideHelix: flag("FLAG_HIDE_HELIX_FOSSIL"),
    domeItem: bagCount(C.ITEM_DOME_FOSSIL), helixItem: bagCount(C.ITEM_HELIX_FOSSIL),
  });
  const newBattles = () => { const l = H.log.slice(window.__logMark); window.__logMark = H.log.length;
    return l.map(b => b.battle ? { mode: b.battle, start: b.start, end: b.end, outcome: b.outcome, stop: b.stop, stuck: b.stuck, decisions: b.decisions, n: b.n, trace: (b.trace ?? []).slice(0, 60) } : b.medicine ? { medicine: { item: b.medicine.item, target: b.medicine.target, ok: b.medicine.ok } } : { other: Object.keys(b) }); };
  // Any driver envelope that is not a success becomes a note, so no helper failure is swallowed.
  const noted = (r) => { if (r && !r.note && (r.ok === false || r.status === "failure" || r.status === "blocked")) r.note = r.reason ?? r.status; return r; };
  const lowSupplies = () => { if (flag("FLAG_GOT_FOSSIL_FROM_MT_MOON")) return null; const r = H.resources(); const m = r.party.find(m => m.attackPP < 5); return m ? "attack PP low in slot " + m.slot + " (" + m.attackPP + ")" : null; };
  // Own walking loop = H.goto plus a supply check; recovery mode skips the policy checks (deliberate retreat only).
  const walk = async (x, y, opts = {}) => {
    const map0 = H.st().map;
    for (let g = 0; g < 1500; g++) {
      if (H.inBattle()) { const b = await H.battle("auto", 0); const n = H.battleStop(b); if (n) return { ...H.st(), note: n, battleResult: b }; continue; }
      const s = H.st();
      if (s.map !== map0) return { ...s, note: "map changed" };
      if (!H.fieldFree()) { const r = noted(await H.idle(4000)); if (r.note || r.timeout) return { ...r, note: r.note ?? "script stuck" }; continue; }
      if (s.x === x && s.y === y) return s;
      if (!opts.recovery) {
        const h = await H.prepareStep(); if (!h.ok) return { ...H.st(), note: h.note ?? h.reason, resources: h.resources };
        const low = lowSupplies(); if (low) return { ...H.st(), note: "return to center: " + low };
      }
      const steps = H.bfs(x + 7, y + 7);
      if (!steps) return { ...s, note: "no path" };
      if (!steps.length) return s;
      const w = noted(await H.walk(steps[0], 1)); if (w && w.note) return { ...H.st(), note: w.note };
    }
    return { ...H.st(), note: "guard" };
  };
  const warpLeg = async (x, y, opts = {}) => {
    const map0 = H.st().map;
    let r = await walk(x, y, opts);
    if (r.note && r.note !== "map changed") return r;
    if (H.st().map === map0 && !r.note) {
      for (const d of ["U", "D", "L", "R"]) { r = noted(await H.exit(d, 1, opts)); if (r.note && r.note !== "no exit") return r; if (H.st().map !== map0) break; }
    }
    const i = noted(await H.idle(600, false)); if (i.note && !i.timeout) return i;
    return H.st();
  };
  // Shared helper observes the offer and verifies HP/PP/status and identities.
  const nurse = async () => {
    const r = await H.heal({ leave: false });
    if (!r.ok) return { ...r, note: r.note ?? "nurse failed" };
    window.__nurseRuns = (window.__nurseRuns ?? 0) + 1;
    return r;
  };
  const step = async () => {
    const s = H.st(), m = s.map, f = status(), retreat = !!window.__retreat;
    let action, r = null;
    const opt = retreat ? { recovery: true } : {};
    if (m === "MAP_CERULEAN_CITY") return { action: "arrived", ...f };
    if (m === "MAP_ROUTE4_POKEMON_CENTER_1F") {
      if (retreat) { action = "nurse"; r = await nurse(); if (!r.note) { window.__retreat = false; r = null; } }
      else action = "leave center";
      if (!r) { const a = await walk(7, 7, { recovery: true }); r = a.note ? a : noted(await H.exit("D", 3, { recovery: true })); }
    } else if (m === "MAP_ROUTE4") {
      if (f.gotMoon) {
        action = "route4 east -> Cerulean";
        // Target from live reachability (the driver's BFS, ledges included): the east edge if reachable, else the farthest tile.
        const cand = [];
        for (let x = 107; x >= 60 && !cand.length; x--) for (const y of [4, 3, 6, 7, 8, 10, 11, 12, 13, 5, 9, 14, 15, 16, 17, 2]) if (H.bfs(x + 7, y + 7) !== null) cand.push([x, y]);
        window.__reach = cand.slice(0, 12);
        if (!cand.length) r = { ...H.st(), note: "no reachable tile at x>=60" };
        else { const [tx, ty] = cand[0]; r = await walk(tx, ty, opt); if (!r.note && tx === 107) r = noted(await H.exit("R", 4, opt)); else if (!r.note) r = { ...H.st(), note: "farthest reachable east tile is (" + tx + "," + ty + "), not the Cerulean edge" }; }
      }
      else if (retreat) { action = "route4 -> center"; r = await walk(12, 6, opt); if (!r.note) r = noted(await H.exit("U", 1, opt)); }
      else { action = "route4 -> 1F"; r = await walk(19, 6, opt); if (!r.note) r = noted(await H.exit("U", 1, opt)); }
    } else if (m === "MAP_MT_MOON_1F") {
      if (retreat) { action = "1F -> route4"; r = await walk(18, 37, opt); if (!r.note) r = noted(await H.exit("D", 2, opt)); }
      else { action = "1F -> B1F"; r = await warpLeg(5, 6, opt); }
    } else if (m === "MAP_MT_MOON_B1F") {
      if (f.gotMoon) { action = "B1F east exit"; r = await warpLeg(45, 4, opt); }
      else if (retreat) { action = "B1F -> 1F"; r = await warpLeg(3, 3, opt); }
      else { action = "B1F -> B2F"; r = await warpLeg(22, 18, opt); }
    } else if (m === "MAP_MT_MOON_B2F") {
      if (f.gotMoon) { action = "B2F -> B1F east part"; r = await warpLeg(5, 10, opt); }
      else if (retreat) { action = "B2F -> B1F west part"; r = await warpLeg(25, 21, opt); }
      else if (!f.miguel) { action = "Miguel trigger (14,11)"; r = await walk(14, 11, opt); if (!r.note) { r = noted(await H.idle(4000, true)); if (!r.note) r = null; } }
      else {
        // MtMoon_B2F_EventScript_DomeFossil: msgbox YESNO; YES -> removeobject, giveitem ITEM_DOME_FOSSIL, Miguel takes the Helix.
        // The route's decision is the Dome Fossil, so the only prompt answered is that script's Yes/No at the fossil.
        action = "Dome Fossil (13,7)"; r = noted(await H.talk(13, 7));
        for (let n = 0; n < 2 && !r?.note; n++) {
          r = noted(await H.idle(5000, true));
          if (r.note === "input required" && H.observe().phase === "choice" && H.hasTask("Task_YesNoMenu_HandleInput")) {
            const a = await H.answerYesNo(true);
            r = a.ok ? { ...H.st(), note: null } : { ...H.st(), note: a.note };
          } else break;
        }
        if (!r.note) { r = noted(await H.idle(5000, true)); if (!r.note) r = null; }
      }
    } else { return { action: "unknown map", bad: "unexpected map " + m, ...f }; }
    let note = r?.note && r.note !== "map changed" ? r.note : null, bad = null;
    if (note && /^return to center/.test(note) && !f.gotMoon && !retreat) { window.__retreat = true; window.__retreats = (window.__retreats ?? 0) + 1; note = null; action += " [retreat start: " + r.note + "]"; }
    else if (note) bad = note;
    const f2 = status();
    const rec = { action, bad, note: r?.note ?? null, retreat: !!window.__retreat, retreats: window.__retreats ?? 0, battleResult: r?.battleResult ? { stop: r.battleResult.stop, outcome: r.battleResult.outcome } : undefined, ...f2, battles: newBattles() };
    if (bad) rec.stuck = { observe: H.observe(), tasks: names(), cb2: H.cb2(), controller: H.G.gBattlerControllerFuncs[0]?.name, inBattle: H.inBattle(), objects: H.objects() };
    return rec;
  };
  window.__step = step; window.__status = status; window.__walk = walk;
`;

/**
 * Stop checkpoint flow (DRV-05): real step -> START>SAVE (named copy) -> exclusive export to a NEW path
 * -> only then record it -> reload with ?fr=continue -> same semantic snapshot -> real movement.
 * Every failure throws; nothing is recorded unless the export verified the bytes. Never overwrites.
 */
export async function stopCheckpoint(ctx, { name, dir, path, provenance = {}, kind = "route-stop checkpoint (not Cerulean arrival, route not PASS)", evidence, base, prefix = "", movementOptions = {} }) {
  const target = path ?? join(dir, `${name}.json`);
  const move = await ctx.runEval(`${prefix}
    const b = H.st();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (H.bfs(b.x + dx + 7, b.y + dy + 7) === null) continue;
      const r = await H.goto(b.x + dx, b.y + dy, ${JSON.stringify(movementOptions)});
      if (r.ok !== false && r.x === b.x + dx && r.y === b.y + dy) return { ok: true, before: { x: b.x, y: b.y }, after: { x: r.x, y: r.y } };
    }
    return { ok: false, status: "blocked", reason: "no-real-movement", state: H.observe() };`);
  assertOk("movement before SAVE", move);
  const saved = await ctx.runEval(`return await H.saveGame({ checkpointName: ${JSON.stringify(name)} });`);
  assertOk("SAVE", saved);
  const exported = await ctx.exportCheckpoint({ name, path: target, provenance: { ...provenance, kind } });
  assertOk("export", exported);
  const record = { name, path: exported.path, provenancePath: exported.provenancePath, sha256: exported.sha256, savedCounter: saved.after.saved, state: { map: saved.after.map ?? null, x: saved.after.x, y: saved.after.y } };
  const expected = await ctx.runEval(`return H.saveSnapshot();`);
  evidence.checkpoints = [...(evidence.checkpoints ?? []), record];
  const errors0 = ctx.errors().length;
  await ctx.page.goto(`${base}?fr=continue`, { waitUntil: "load" });
  const continued = await ctx.runEval(`const { H } = await import("/tools/playtest/driver.js"); window.H = H; await H.ready(); return { snapshot: H.saveSnapshot(), observe: H.observe() };`);
  if (JSON.stringify(continued.snapshot) !== JSON.stringify(expected)) throw new Error("continued semantic state differs: " + JSON.stringify({ expected, continued: continued.snapshot }));
  // Real movement after continue: one step to a neighbour of the saved tile on the same map. The previous tile is
  // not required: it can be a warp (arrival tile) or the top of a one-way ledge, which the game does not let you
  // walk back onto. Warp tiles are skipped so the check never changes map.
  const back = await ctx.runEval(`${prefix}
    const b = H.st();
    const ow = window.frGame.overworld, wp = new Set(ow.loaded.header.warps.map(w => w.x + "," + w.y));
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const x = b.x + dx, y = b.y + dy;
      if (wp.has(x + "," + y) || H.bfs(x + 7, y + 7) === null) continue;
      const r = await H.goto(x, y, ${JSON.stringify(movementOptions)});
      if (r.ok !== false && r.map === b.map && r.x === x && r.y === y) return { ok: true, from: { x: b.x, y: b.y }, to: { x, y } };
    }
    return { ok: false, status: "blocked", reason: "no-real-movement-after-continue", state: H.observe() };`);
  assertOk("movement after continue", back);
  if (ctx.errors().length !== errors0 || ctx.errors().length) throw new Error("browser errors: " + ctx.errors().join("; "));
  record.verified = { continued: true, movement: { from: back.from, to: back.to } };
  return record;
}

export const writeEvidence = (out, evidence) => writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 1));
