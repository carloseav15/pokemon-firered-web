import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { prelude } from "./lib.mjs";

// SON-PREP: from the original mtmoon-1f fixture, reach the Route 4 Center by walking, heal with
// the nurse, buy 7 Potions + 3 Antidotes in the Pewter Mart through the shop UI, return, heal,
// SAVE from the start menu, then reload with ?fr=continue and compare against the pre-save state.
// No money, items, levels, PP or flags are written by code. Evidence goes to $SON_PREP_OUT.
// Policy targets (8 Potions / 3 Antidotes) are test provisioning, not a C rule.
const SAVE_KEY = "pokemon-gba-web-lab.firered.v2";
const out = process.env.SON_PREP_OUT ?? "/tmp/pw/son-prep";


// H.heal() can report "nurse offer missing" when its own A taps pick YES before the menu task is
// observed. The nurse still ran; accept that only after control returns and the team is verified.
const nurse = `const nurse = async (leave) => {
      const before = H.resources(), id0 = JSON.stringify(sv.party.filter(m => m.species).map(m => [m.species, m.personality, m.otId, [...m.moves]]));
      const h = await H.heal({ leave: false });
      if (!h.ok && h.note !== "nurse offer missing") throw new Error("heal failed: " + JSON.stringify(h));
      if (!await until(() => H.fieldFree(), "A", 600)) throw new Error("nurse did not return control: " + JSON.stringify({ tasks: names(), st: H.st() }));
      const res = H.resources(), rom = H.rom;
      const ppFull = sv.party.filter(m => m.species).every(m => m.moves.every((id, i) => m.pp[i] === (id ? rom.moves[id].pp + Math.floor(rom.moves[id].pp * 20 * ((m.ppBonuses >> (i * 2)) & 3) / 100) : 0)));
      const id1 = JSON.stringify(sv.party.filter(m => m.species).map(m => [m.species, m.personality, m.otId, [...m.moves]]));
      if (!(res.party.length === before.party.length && res.party.every(m => m.hp === m.maxHP && m.status === 0) && ppFull && id1 === id0 && res.money === before.money))
        throw new Error("team not restored by the nurse: " + JSON.stringify({ h, res }));
      if (leave) { const d = await H.goto(7, 7, { battle: "fight" }); if (d.note) throw new Error(d.note); const x = await H.exit("D", 3); if (x.note) throw new Error(x.note); }
      return { helper: { ok: h.ok, note: h.note ?? null }, before, res, ppFull };
    };`;

export default async function run(ctx) {
  mkdirSync(out, { recursive: true });
  const fixture = JSON.parse(readFileSync("tools/playtest/saves/mtmoon-1f.json", "utf8"));
  const initial = await ctx.loadSave("mtmoon-1f");
  const evidence = { fixture: { money: fixture.money, bag: fixture.bag.items,
    party: fixture.party.filter(m => m.species).map(m => [m.species, m.level, m.hp, [...m.moves], [...m.pp]]) } };
  if (initial.map !== "MAP_MT_MOON_1F" || initial.x !== 18 || initial.y !== 37) throw new Error(`wrong checkpoint: ${JSON.stringify(initial)}`);

  // 1. Walk out, heal by nurse (recovery: deliberate return to the Center only).
  evidence.heal1 = await ctx.runEval(`${prelude}
    ${nurse}
    H.battleDefaults = { mode: "auto", slot: 0 };
    const fx = ${JSON.stringify(evidence.fixture)};
    const live = H.resources();
    const liveParty = live.party.map(m => [m.species, m.level, m.hp, m.moves, m.pp]);
    if (JSON.stringify(liveParty) !== JSON.stringify(fx.party) || live.money !== fx.money || JSON.stringify(live.items) !== JSON.stringify(fx.bag))
      throw new Error("loaded state differs from fixture file: " + JSON.stringify({ live, fx }));
    const o = await H.exit("D", 2, { recovery: true });
    if (o.map !== "MAP_ROUTE4") throw new Error("did not reach Route 4: " + JSON.stringify(o));
    const e = await H.enter(12, 5, "D", { recovery: true });
    if (e.map !== "MAP_ROUTE4_POKEMON_CENTER_1F") throw new Error("did not enter the Center: " + JSON.stringify(e));
    await H.idle(600, false);
    const h = await nurse(true);
    return { h, map: H.st().map, party: H.party() };`);

  // 2. Route 4 -> Route 3 -> Pewter -> Mart (auto policy: heals/battles via real UI; stops when resources run out).
  evidence.walk = await ctx.runEval(`${prelude}
    const steps = [];
    const need = (r, label) => { steps.push([label, r.map, r.note ?? null]); if (r.note) throw new Error(label + " stopped: " + JSON.stringify(r)); return r; };
    need(await H.goto(12, 19), "route4 south");
    need(await H.exit("D", 3), "to route3");
    need(await H.goto(0, 10), "route3 west");
    need(await H.exit("L", 3), "to pewter");
    need(await H.enter(28, 18, "D"), "mart door");
    await H.idle(600, false);
    return { steps, st: H.st(), res: H.resources() };`);

  // 3. Shop through the UI: read price list first (data), then buy.
  const items = JSON.parse(readFileSync(`${process.env.POKEFIRERED ?? "pokefirered"}/src/data/items.json`, "utf8")).items;
  const price = id => items.find(i => i.itemId === id).price;
  evidence.prices = { potion: price("ITEM_POTION"), antidote: price("ITEM_ANTIDOTE") };
  evidence.shop = await ctx.runEval(`${prelude}
    const POTION = H.C.ITEM_POTION, ANTIDOTE = H.C.ITEM_ANTIDOTE, p = ${evidence.prices.potion}, a = ${evidence.prices.antidote};
    const fail = (m) => { throw new Error(m + " " + JSON.stringify({ tasks: names(), money: sv.money })); };
    const potions0 = bagCount(POTION), anti0 = bagCount(ANTIDOTE), money0 = sv.money;
    const needPotions = 8 - potions0, needAnti = 3 - anti0;
    if (needPotions < 0 || needAnti < 0 || needPotions * p + needAnti * a > money0) fail("budget does not cover the provision " + JSON.stringify({ needPotions, needAnti, money0 }));
    await H.counter(2, 3);
    frDebug.run(1, 1); frDebug.run(1, 0);
    if (!await until(() => has("Task_ShopMenu"), null, 400)) fail("shop menu did not open");
    await tap("A", 10);
    if (!await until(() => has("Task_BuyMenu"), null, 600)) fail("buy screen missing");
    await frDebug.wait(30);
    const buy = async (row, qty, item, price) => {
      const before = bagCount(item), cash = sv.money;
      for (let i = 0; i < row; i++) await tap("D", 14);
      await tap("A", 30);
      if (!await until(() => has("Task_BuyHowManyDialogueHandleInput"), null, 200)) fail("quantity prompt missing");
      for (let i = 1; i < qty; i++) await tap("U", 10);
      await tap("A", 30);
      if (!await until(() => has("Task_CallYesOrNoCallback"), "A", 200)) fail("confirmation missing");
      await tap("A", 30);
      if (!await until(() => has("Task_BuyMenu") && !has("Task_ContinueTaskAfterMessagePrints"), "A", 300)) fail("did not return to the list");
      if (bagCount(item) !== before + qty || cash - sv.money !== qty * price) fail("purchase delta wrong " + JSON.stringify({ item, before, now: bagCount(item), cash, money: sv.money }));
      for (let i = 0; i < row; i++) await tap("U", 14);
    };
    // List order from PewterCity_Mart_Items: POKE_BALL(0), POTION(1), ANTIDOTE(2).
    if (needPotions > 0) await buy(1, needPotions, POTION, p);
    if (needAnti > 0) await buy(2, needAnti, ANTIDOTE, a);
    if (!await until(() => has("Task_ShopMenu"), "B", 400)) fail("buy screen did not return to the shop menu");
    await tap("B", 10);
    const end = await H.idle(1500, true);
    if (end.script || end.locked) fail("shop did not release the player");
    return { potions0, anti0, money0, potions: bagCount(POTION), antidotes: bagCount(ANTIDOTE), money: sv.money };`);

  // 4. Return to the Route 4 Center and heal by nurse; verify full team + provision.
  evidence.back = await ctx.runEval(`${prelude}
    ${nurse}
    const need = (r, label) => { if (r.note) throw new Error(label + " stopped: " + JSON.stringify(r)); return r; };
    // recovery: deliberate return to the Center only (purchases are done); battles still use the auto policy.
    need(await H.goto(4, 7, { recovery: true }), "mart exit");
    need(await H.exit("D", 3, { recovery: true }), "to pewter");
    need(await H.goto(47, 20, { recovery: true }), "pewter east");
    need(await H.exit("R", 3, { recovery: true }), "to route3");
    need(await H.goto(72, 0, { recovery: true }), "route3 north");
    need(await H.exit("U", 3, { recovery: true }), "to route4");
    need(await H.enter(12, 5, "D", { recovery: true }), "center door");
    await H.idle(600, false);
    const C = H.C;
    const h = await nurse(false);
    const res = h.res, ppFull = h.ppFull;
    if (bagCount(C.ITEM_POTION) < 8 || bagCount(C.ITEM_ANTIDOTE) < 3) throw new Error("provision missing");
    need(await H.goto(7, 5), "save spot");
    if (!H.fieldFree()) throw new Error("field not free before SAVE: " + JSON.stringify({ tasks: names(), st: H.st() }));
    return { nurse: h.helper, res, ppFull, st: H.st() };`);

  // 5. SAVE from the start menu; measure counter and localStorage.
  evidence.save = await ctx.runEval(`${prelude}
    const SAVED = H.C.GAME_STAT_SAVED_GAME, KEY = ${JSON.stringify(SAVE_KEY)};
    const snap = () => ({ st: { map: H.st().map, x: H.st().x, y: H.st().y }, money: sv.money,
      party: sv.party.filter(p => p.species).map(p => [p.species, p.personality, p.otId, p.level, p.hp, [...p.moves], [...p.pp], p.status]),
      bag: JSON.parse(JSON.stringify(sv.bag)), heal: sv.lastHealLocation, escape: sv.escapeWarp });
    const pre = snap(), savedBefore = sv.gameStats[SAVED], rawBefore = localStorage.getItem(KEY);
    await frDebug.wait(90); // let the last step and any fade settle before START
    await openStart(4); // POKEDEX, POKEMON, BAG, PLAYER, SAVE
    // Prompts: save? (A) -> existing-file overwrite? (YES is the default, A) -> "saved the game".
    for (let i = 0; i < 14 && sv.gameStats[SAVED] === savedBefore; i++) { await frDebug.wait(150); await tap("A", 30); }
    await frDebug.wait(200);
    const written = { counter: sv.gameStats[SAVED], changed: localStorage.getItem(KEY) !== rawBefore };
    await until(() => H.fieldFree(), "A", 120);
    const post = snap(), raw = localStorage.getItem(KEY);
    if (written.counter !== savedBefore + 1 || !written.changed || !raw) throw new Error("SAVE did not update counter/localStorage: " + JSON.stringify({ savedBefore, written }));
    if (JSON.stringify(pre) !== JSON.stringify(post)) throw new Error("state changed while saving");
    window.__pre = post;
    return { savedBefore, savedAfter: written.counter, rawLength: raw.length, pre, post };`);

  // 6. Keep the exact written bytes before reloading.
  const raw = await ctx.runEval(`return localStorage.getItem(${JSON.stringify(SAVE_KEY)});`);
  writeFileSync(`${out}/written-save.json`, raw);
  evidence.writtenBytes = raw.length;

  // 7. Reload with ?fr=continue. Observe the Quest Log before waiting for readiness; wait for the Quest Log
  // playback to finish (state leaves PLAYBACK/PLAYBACK_LAST) and for free control, with a hard limit.
  const base = process.env.PW_BASE ?? "http://localhost:5173/";
  const errors = [];
  ctx.page.on("pageerror", e => errors.push(String(e).slice(0, 400)));
  await ctx.page.goto(`${base}?fr=continue`, { waitUntil: "load" });
  await ctx.page.waitForTimeout(2000);
  evidence.continue = await ctx.page.evaluate(`(async () => {
    try {
      const { H } = await import("/tools/playtest/driver.js"); window.H = H; await H.init();
      const Q = await H.mod("/src/fr/questLogEvents.ts");
      const playback = () => Q.gQuestLogState === H.C.QL_STATE_PLAYBACK || Q.gQuestLogState === H.C.QL_STATE_PLAYBACK_LAST;
      const observed = [];
      let frames = 0;
      for (; frames < 18000; frames += 20) {
        if (!observed.includes(Q.gQuestLogState)) observed.push(Q.gQuestLogState);
        if (frames > 0 && !playback() && H.fieldFree()) break;
        await frDebug.wait(20);
      }
      const finished = !playback() && H.fieldFree();
      const sv = frDebug.save.save;
      return { ok: finished, error: finished ? null : "Quest Log playback/control did not finish within " + frames + " frames", observed, frames, state: Q.gQuestLogState,
        st: { map: H.st().map, x: H.st().x, y: H.st().y }, money: sv.money,
        party: sv.party.filter(p => p.species).map(p => [p.species, p.personality, p.otId, p.level, p.hp, [...p.moves], [...p.pp], p.status]),
        bag: JSON.parse(JSON.stringify(sv.bag)), heal: sv.lastHealLocation, escape: sv.escapeWarp, saved: sv.gameStats[H.C.GAME_STAT_SAVED_GAME], free: H.fieldFree() };
    } catch (e) { return { ok: false, error: String(e?.stack ?? e).slice(0, 500) }; } })()`);
  evidence.continueErrors = errors;
  await ctx.shot("son-prep-continue");
  writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 1));
  const c = evidence.continue;
  if (!c.ok || errors.length) throw new Error(`FAIL at continue: ${c.error ?? "page errors"}; page errors: ${errors[0] ?? "none"}; evidence in ${out}`);
  if (!c.observed.includes(2)) throw new Error("the recorded Quest Log scenes were not played back: " + JSON.stringify(c.observed));

  // 8. Compare against the state captured immediately after the menu save.
  const pre = evidence.save.post;
  const wanted = { st: pre.st, money: pre.money, party: pre.party, bag: pre.bag, heal: pre.heal, escape: pre.escape, saved: evidence.save.savedAfter };
  const actual = { st: c.st, money: c.money, party: c.party, bag: c.bag, heal: c.heal, escape: c.escape, saved: c.saved };
  if (JSON.stringify(wanted) !== JSON.stringify(actual)) throw new Error("continued state differs from the saved state: " + JSON.stringify({ wanted, actual }));
  const stored = await ctx.runEval(`return localStorage.getItem(${JSON.stringify(SAVE_KEY)});`);
  if (stored !== raw) throw new Error("continue rewrote the persisted bytes");

  // 9. Export exactly the bytes the game wrote, with provenance (sidecar keeps the save format untouched).
  const sha = createHash("sha256").update(raw).digest("hex");
  evidence.writtenSha256 = sha;
  if (process.env.SON_PREP_EXPORT !== "0") {
    writeFileSync("tools/playtest/saves/mtmoon-prepared.json", raw);
    writeFileSync("tools/playtest/saves/mtmoon-prepared.provenance.json", JSON.stringify({
      origin: "tools/playtest/saves/mtmoon-1f.json", job: "tools/playtest/smoke/son-prep.job.mjs",
      method: "walk to Route 4 Center, nurse, buy 7 Potion + 3 Antidote in Pewter Mart UI, nurse, START>SAVE; bytes copied from localStorage after the menu save",
      sha256: sha, bytes: raw.length, gameStatSavedGame: evidence.save.savedAfter, aids: "none: no money/items/levels/PP/flags written by code; auto battle policy; recovery:true only on the return to the Center",
    }, null, 1) + "\n");
  }
  writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 1));
  return evidence;
}
