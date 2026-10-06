// Route segment 2 (Cerulean -> Bill -> Misty -> Route 5): page-side helpers shared by route2.job.mjs and
// route2-checkpoints.job.mjs. Same pattern as son-mm-lib.mjs: a step() decides ONE leg from map + flags and
// returns a record; the Node job loops, saves a verified checkpoint at every milestone and stops on a bad note.
// runJob, stopCheckpoint, assertOk and writeEvidence are the ones of son-mm-lib.mjs (not duplicated here).
//
// Sources (pokefirered/data/maps): CeruleanCity (rival coord events (22..24,6), Rocket grunt (33,6) with coord events
// (33,5)/(33,7), CeruleanCity_OnTransition), Route24 (Rocket coord events (10,15)/(11,15), waitbuttonpress + battle),
// Route25, Route25_SeaCottage (Bill: MSGBOX_YESNO; PC bg_event (4,5); SS Ticket from human Bill), CeruleanCity_Gym.
// No Pokemon, items, money, flags, variables or battle results are written; battles use H.battle("auto").
export { runJob, stopCheckpoint, assertOk, writeEvidence } from "./son-mm-lib.mjs";

export const MILESTONES = ["rival", "bridge", "bill", "misty", "rocket"];

/** Page-side helpers (string); evaluate after `prelude` (bagCount, names). */
export const routeHelpers = `
  window.__logMark ??= 0;
  const S = await H.mod("/src/fr/save.ts"), C = H.C;
  const flag = (n) => S.FlagGet(C[n]);
  const vr = (n) => S.VarGet(C[n]);
  const trainer = (n) => S.FlagGet(C.TRAINER_FLAGS_START + C[n]);
  const status = () => ({
    st: { map: H.st().map, x: H.st().x, y: H.st().y, free: H.fieldFree() },
    res: H.resources(),
    rival: { scene: vr("VAR_MAP_SCENE_CERULEAN_CITY_RIVAL"), fameFlag: flag("FLAG_GOT_FAME_CHECKER"), fameItem: bagCount(C.ITEM_FAME_CHECKER),
      trainer: ["TRAINER_RIVAL_CERULEAN_SQUIRTLE", "TRAINER_RIVAL_CERULEAN_BULBASAUR", "TRAINER_RIVAL_CERULEAN_CHARMANDER"].map(trainer) },
    bridge: { scene: vr("VAR_MAP_SCENE_ROUTE24"), grunt6: trainer("TRAINER_TEAM_ROCKET_GRUNT_6"), nugget: bagCount(C.ITEM_NUGGET) },
    bill: { helped: flag("FLAG_HELPED_BILL_IN_SEA_COTTAGE"), ticket: flag("FLAG_GOT_SS_TICKET"), ticketItem: bagCount(C.ITEM_SS_TICKET),
      notSomeonesPc: flag("FLAG_SYS_NOT_SOMEONES_PC"), inTeleporter: flag("FLAG_TEMP_2") },
    misty: { leader: trainer("TRAINER_LEADER_MISTY"), defeated: flag("FLAG_DEFEATED_MISTY"), badge: flag("FLAG_BADGE02_GET"),
      tmFlag: flag("FLAG_GOT_TM03_FROM_MISTY"), tm03: bagCount(C.ITEM_TM03) },
    rocket: { grunt5: trainer("TRAINER_TEAM_ROCKET_GRUNT_5"), scene: vr("VAR_MAP_SCENE_CERULEAN_CITY_ROCKET"),
      tmFlag: flag("FLAG_GOT_TM28_FROM_ROCKET"), tm28: bagCount(C.ITEM_TM28) },
  });
  const reached = (f) => ({
    rival: f.rival.scene === 1 && f.rival.fameFlag && f.rival.fameItem === 1,
    bridge: f.bridge.scene === 1 && f.bridge.grunt6 && f.bridge.nugget >= 1,
    bill: f.bill.helped && f.bill.ticket && f.bill.ticketItem === 1 && f.bill.notSomeonesPc,
    misty: f.misty.leader && f.misty.defeated && f.misty.badge && f.misty.tmFlag && f.misty.tm03 >= 1,
    rocket: f.rocket.grunt5 && f.rocket.scene === 1 && f.rocket.tmFlag && f.rocket.tm28 >= 1,
  });
  const newBattles = () => { const l = H.log.slice(window.__logMark); window.__logMark = H.log.length;
    return l.map(b => b.battle ? { mode: b.battle, start: b.start, end: b.end, outcome: b.outcome, stop: b.stop, stuck: b.stuck, decisions: b.decisions, n: b.n, trace: (b.trace ?? []).slice(0, 60) } : b.medicine ? { medicine: { item: b.medicine.item, target: b.medicine.target, ok: b.medicine.ok } } : { other: Object.keys(b) }); };
  const noted = (r) => { if (r && !r.note && (r.ok === false || r.status === "failure" || r.status === "blocked")) r.note = r.reason ?? r.status; return r; };
  const M = { city: "MAP_CERULEAN_CITY", center: "MAP_CERULEAN_CITY_POKEMON_CENTER_1F", gym: "MAP_CERULEAN_CITY_GYM",
    r24: "MAP_ROUTE24", r25: "MAP_ROUTE25", cottage: "MAP_ROUTE25_SEA_COTTAGE", r5: "MAP_ROUTE5" };
  // Own walking loop = H.goto with battle handling; recovery mode skips the supply policy (deliberate retreat only).
  const walk = async (x, y, opts = {}) => {
    const map0 = H.st().map;
    for (let g = 0; g < 1500; g++) {
      if (H.inBattle()) { const b = await H.battle("auto", 0); const n = H.battleStop(b); if (n) return { ...H.st(), note: n, battleResult: b }; continue; }
      const s = H.st();
      if (s.map !== map0) return { ...s, note: "map changed" };
      if (!H.fieldFree()) { const r = noted(await H.idle(4000)); if (r.note || r.timeout) return { ...r, note: r.note ?? "script stuck" }; continue; }
      if (s.x === x && s.y === y) return s;
      if (!opts.recovery) { const h = await H.prepareStep(); if (!h.ok) return { ...H.st(), note: h.note ?? h.reason, resources: h.resources }; }
      const steps = H.bfs(x + 7, y + 7);
      if (!steps) return { ...s, note: "no path" };
      if (!steps.length) return s;
      const w = noted(await H.walk(steps[0], 1)); if (w && w.note) return { ...H.st(), note: w.note };
    }
    return { ...H.st(), note: "guard" };
  };
  // Let a script run to the end: battles are fought, A is tapped on dialogs, a choice is handed back as a note.
  const settle = async (loops = 60) => {
    await H.wait(30);
    let freeSeen = 0;
    for (let i = 0; i < loops; i++) {
      if (H.inBattle()) { freeSeen = 0; const b = await H.battle("auto", 0); const n = H.battleStop(b); if (n) return { ...H.st(), note: n, battleResult: b }; continue; }
      if (H.fieldFree()) { if (++freeSeen >= 2) return H.st(); await H.wait(20); continue; }
      freeSeen = 0;
      const r = noted(await H.idle(4000, true));
      if (r.note) return { ...H.st(), note: r.note, observe: H.observe() };
    }
    return { ...H.st(), note: "settle guard" };
  };
  // Talk to an object and answer the script's Yes/No with YES (only the prompt of that script, observed open).
  const talkYes = async (x, y) => {
    let r = noted(await H.talk(x, y)); if (r.note) return r;
    for (let n = 0; n < 4; n++) {
      await H.wait(30);
      r = noted(await H.idle(5000, true));
      if (r.note === "input required" && H.observe().phase === "choice" && H.hasTask("Task_YesNoMenu_HandleInput")) {
        const a = await H.answerYesNo(true);
        if (!a.ok) return { ...H.st(), note: a.note };
        continue;
      }
      if (r.note) return r;
      if (H.inBattle() || H.fieldFree()) break;
    }
    return settle();
  };
  const talkSettle = async (x, y) => { const r = noted(await H.talk(x, y)); return r.note ? r : settle(); };
  // Edge of the map in direction dir: nearest reachable edge tile (by planner), then exit() across the connection.
  const edge = async (dir, pref, opts = {}) => {
    const ow = window.frGame.overworld, w = ow.loaded.layout.width, h = ow.loaded.layout.height;
    const cand = [];
    if (dir === "U") for (let x = 0; x < w; x++) cand.push([x, 0]);
    if (dir === "D") for (let x = 0; x < w; x++) cand.push([x, h - 1]);
    if (dir === "L") for (let y = 0; y < h; y++) cand.push([0, y]);
    if (dir === "R") for (let y = 0; y < h; y++) cand.push([w - 1, y]);
    const key = (c) => dir === "U" || dir === "D" ? Math.abs(c[0] - (pref ?? 0)) : Math.abs(c[1] - (pref ?? 0));
    cand.sort((a, b) => key(a) - key(b));
    const hit = cand.find(([x, y]) => H.bfs(x + 7, y + 7) !== null);
    if (!hit) return { ...H.st(), note: "no reachable edge tile " + dir };
    const r = await walk(hit[0], hit[1], opts);
    if (r.note === "map changed") return H.st();
    if (r.note) return r;
    return noted(await H.exit(dir, 4, opts));
  };
  const doorIn = async (x, y, opts = {}) => { const r = await walk(x, y + 1, opts); if (r.note) return r; return noted(await H.exit("U", 2, opts)); };
  const leaveBy = async (x, y, opts = {}) => { const r = await walk(x, y, opts); if (r.note) return r; return noted(await H.exit("D", 3, opts)); };
  const firstReachable = (cands) => cands.find(([x, y]) => H.bfs(x + 7, y + 7) !== null);
  const nurse = async () => {
    const r = await H.heal({ leave: false });
    if (!r.ok) return { ...r, note: r.note ?? "nurse failed" };
    window.__nurseRuns = (window.__nurseRuns ?? 0) + 1;
    return r;
  };
  const maxAttackPP = (m) => m.moves.reduce((n, id) => n + ((H.rom.moves[id]?.power ?? 0) > 1 ? H.rom.moves[id].pp : 0), 0);
  const needsHeal = (res) => res.party.some(m => m.hp < 0.9 * m.maxHP || m.status || m.attackPP < 0.7 * maxAttackPP(m));
  // goal from flags, in the recommended order
  const goalOf = (f) => { const d = reached(f); return window.__retreat ? "heal" : !d.rival ? "rival" : !d.bridge ? "bridge" : !d.bill ? "bill" : !d.misty ? "misty" : !d.rocket ? "rocket" : "route5"; };
  const step = async () => {
    const s = H.st(), m = s.map, f = status(), retreat = !!window.__retreat, opt = retreat ? { recovery: true } : {};
    const d = reached(f), goal = goalOf(f);
    let action, r = null;
    if (m === M.r5 && d.rival && d.bridge && d.bill && d.misty && d.rocket) return { action: "arrived", ...f };
    if (m === M.center) {
      if (retreat || needsHeal(f.res)) { action = "nurse"; r = await nurse(); if (!r.note) { window.__retreat = false; r = null; } }
      else action = "leave center";
      if (!r) r = await leaveBy(7, 7, { recovery: true });
    } else if (m === M.city) {
      if ((retreat || (needsHeal(f.res) && (window.__nurseRuns ?? 0) < 10)) && goal !== "route5") { action = "city -> center"; r = await doorIn(22, 19, opt); }
      else if (goal === "rival") {
        action = "rival trigger (23,6)"; r = await walk(23, 6, opt); if (!r.note) r = await settle();
      } else if (goal === "bridge" || goal === "bill") { action = "city -> route24"; r = await edge("U", 23, opt); }
      else if (goal === "misty") { action = "city -> gym"; r = await doorIn(31, 21, opt); }
      else if (goal === "rocket") {
        action = "Rocket grunt trigger (33,7)"; r = await walk(33, 7, opt); if (!r.note) r = await settle();
        if (!r.note && !f.rocket.tmFlag && vr("VAR_MAP_SCENE_CERULEAN_CITY_ROCKET") === 1) { action += " + talk grunt (33,6)"; r = await talkSettle(33, 6); }
      } else { action = "city -> route5"; r = await edge("D", 26, opt); }
    } else if (m === M.gym) {
      if (goal === "misty" && !retreat) { action = "Misty (8,6)"; r = await talkSettle(8, 6); }
      else { action = "gym -> city"; r = await leaveBy(8, 17, { recovery: true }); }
    } else if (m === M.r24) {
      if (goal === "bridge" && !retreat) {
        action = "bridge: Nugget Bridge to north of the Rocket (rows 13..8)";
        const t = firstReachable([13, 12, 11, 10, 9, 8].flatMap(y => [11, 10, 12, 9, 13].map(x => [x, y])));
        r = t ? await walk(t[0], t[1], opt) : { ...H.st(), note: "no reachable tile north of the bridge" };
        if (!r.note) r = await settle();
      } else if (goal === "bill" && !retreat) { action = "route24 -> route25"; r = await edge("R", 0, opt); }
      else { action = "route24 -> city"; r = await edge("D", 11, opt); }
    } else if (m === M.r25) {
      if (goal === "bill" && !retreat) { action = "route25 -> Sea Cottage door (51,4)"; r = await doorIn(51, 4, opt); }
      else { action = "route25 -> route24"; r = await edge("L", 0, opt); }
    } else if (m === M.cottage) {
      if (goal === "bill" && !retreat) {
        if (!f.bill.helped && !f.bill.inTeleporter) { action = "Bill (Clefairy form) Yes/No"; r = await talkYes(10, 6); }
        else if (!f.bill.helped) { action = "PC (4,5): cell separator"; r = await talkSettle(4, 5); }
        else {
          const o = H.objects().find(o => o[0] === C.LOCALID_BILL_HUMAN && !o[4]);
          if (!o) r = { ...H.st(), note: "human Bill object not visible" };
          else { action = "Bill human (" + o[1] + "," + o[2] + "): SS Ticket"; r = await talkSettle(o[1], o[2]); }
        }
      } else { action = "cottage -> route25"; r = await leaveBy(7, 8, { recovery: true }); }
    } else if (m === M.r5) { action = "route5 -> city"; r = await edge("U", 0, { recovery: true }); }
    else return { action: "unknown map", bad: "unexpected map " + m, ...f };
    let note = r?.note && r.note !== "map changed" ? r.note : null, bad = null;
    if (note && /^return to center/.test(note) && !retreat) { window.__retreat = true; window.__retreats = (window.__retreats ?? 0) + 1; note = null; action += " [retreat start: " + r.note + "]"; }
    else if (note) bad = note;
    const f2 = status();
    const rec = { action, bad, note: r?.note ?? null, retreat: !!window.__retreat, retreats: window.__retreats ?? 0, goal,
      battleResult: r?.battleResult ? { stop: r.battleResult.stop, outcome: r.battleResult.outcome } : undefined, ...f2, battles: newBattles() };
    if (bad) rec.stuck = { observe: H.observe(), tasks: names(), cb2: H.cb2(), controller: H.G.gBattlerControllerFuncs[0]?.name, inBattle: H.inBattle(), objects: H.objects() };
    return rec;
  };
  window.__step = step; window.__status = status; window.__walk = walk; window.__nurse = nurse;
`;
