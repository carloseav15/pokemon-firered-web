// C5: combate salvaje con route2-north (luchar, huir, lanzamiento natural,
// captura garantizada con Master Ball con hueco y captura con equipo lleno).
// Contrato FLASH-C5-R1 en PLAN-RECORRIDO.md. Cada caso recarga el checkpoint y
// registra su resultado aunque otro falle; el JSON completo queda en <outdir>/C5-result.json.
import { writeFileSync, mkdirSync } from "node:fs";
import { prelude } from "./lib.mjs";

const outdir = process.argv[3] ?? "/tmp/pw";

const commonHelpers = `${prelude}
  const C = await H.mod("/src/fr/generated/constants.ts");
  const B = await H.mod("/src/fr/bagMenu.ts");
  const M = await H.mod("/src/fr/pokemon/mon.ts");
  const P = await H.mod("/src/fr/pokemon/pokemon.ts");
  const FM = await H.mod("/src/fr/field/fieldmap.ts");
  const S = await H.mod("/src/fr/save.ts");
  const R = (await H.mod("/src/fr/rom.ts")).rom;
  const ctl = () => H.G.gBattlerControllerFuncs[0]?.name;
  const fail = (m, extra = {}) => {
    throw new Error(m + " " + JSON.stringify({ ctl: ctl(), cb2: H.cb2(), tasks: names(), map: H.st().map, ...extra }));
  };
  const countItem = (itemId) =>
    Object.values(sv.bag).flat().filter(x => x && x.item === itemId).reduce((a, x) => a + x.quantity, 0);
  const boxMons = () => sv.boxes.flat(2).filter(m => m && m.species).length;
  const getOutcome = () => H.G.gBattleOutcome || window.frGame.battleOutcome;
  const encounterType = (x, y) => FM.MapGridGetMetatileAttributeAt(x + 7, y + 7, FM.METATILE_ATTRIBUTE_ENCOUNTER_TYPE);
  const monId = (m) => ({ species: m.species, level: m.level, personality: m.personality >>> 0, otId: m.otId >>> 0 });

  // Walk the grass until a wild battle starts, then wait for the action menu.
  const encounter = async () => {
    const steps = [];
    for (let i = 0; i < 200 && !H.inBattle(); i++) { await frDebug.walk(i % 2 ? "D" : "U", 1); steps.push(i % 2 ? "D" : "U"); }
    if (!H.inBattle()) fail("no wild battle in 200 steps");
    for (let i = 0; i < 800 && H.inBattle() && ctl() !== "HandleInputChooseAction"; i++) await frDebug.press("A", 4);
    if (ctl() !== "HandleInputChooseAction") fail("battle never reached the action menu");
    const enemy = H.G.gBattleMons[1];
    return { species: enemy.species, level: enemy.level, hp: enemy.hp, maxHp: enemy.maxHP, status: enemy.status1, steps: steps.length };
  };

  // Battle BAG -> OPEN_BAG_POKEBALLS (pocket 2) -> itemId -> USE, with observed cursors.
  const useBallInBattle = async (itemId) => {
    if (ctl() !== "HandleInputChooseAction") fail("cannot use ball: action menu not ready");
    // Action menu: BAG is index 1 (right of FIGHT).
    for (let i = 0; i < 8 && H.G.gActionSelectionCursor[0] !== 1; i++) {
      const c = H.G.gActionSelectionCursor[0];
      await tap(c & 1 ? "U" : "R", 12);
    }
    if (H.G.gActionSelectionCursor[0] !== 1) fail("action cursor never reached BAG");
    if (!await until(() => H.cb2() === "CB2_BagMenuRun", "A", 60)) fail("bag did not open in battle");
    await frDebug.wait(150);
    for (let i = 0; i < 4 && B.gBagMenuState.pocket !== 2; i++) { await tap("R", 60); await frDebug.wait(40); }
    if (B.gBagMenuState.pocket !== 2) fail("not on the Poke Balls pocket", { pocket: B.gBagMenuState.pocket });
    await until(() => has("Task_BagMenu_HandleInput"), null, 100);
    await frDebug.wait(60);

    const pocketItems = sv.bag.pokeBalls || [];
    const itemIdx = pocketItems.findIndex(e => e && e.item === itemId && e.quantity > 0);
    if (itemIdx < 0) fail("ball item not found in pokeBalls pocket", { itemId, pocketItems });
    const bagCursor = () => B.gBagMenuState.cursorPos[2] + B.gBagMenuState.itemsAbove[2];
    for (let i = 0; i < 40 && bagCursor() !== itemIdx; i++) {
      await tap(bagCursor() < itemIdx ? "D" : "U", 25);
      await frDebug.wait(30);
    }
    if (bagCursor() !== itemIdx) fail("could not navigate to ball cursor", { want: itemIdx, got: bagCursor() });
    await tap("A", 40);
    await frDebug.wait(30);
    await tap("A", 60);
  };

  // After a throw: A advances text/Pokédex, B declines the nickname Yes/No.
  const drainAfterBallThrow = async (maxLoops = 300) => {
    let nicknameDeclined = false;
    for (let w = 0; w < maxLoops && H.inBattle(); w++) {
      if (ctl() === "HandleInputChooseAction") break;
      const isYesNo = H.G.gBattleCommunication[C.MULTIUSE_STATE] === 1 && H.cb2() === "BattleMainCB2";
      if (isYesNo) nicknameDeclined = true;
      await frDebug.press(isYesNo ? "B" : "A", 8);
      await frDebug.wait(10);
    }
    return { nicknameDeclined };
  };

  // Every finished outcome: out of battle, idle without timeout, field free, and
  // a real walk to the nearest tile of the same map whose encounter type is
  // TILE_ENCOUNTER_NONE (wild_encounter.c:473/489). route2-north starts inside
  // grass, so the way out may cross encounter tiles: an encounter on the way
  // makes the movement MANUAL (never PASS); no reachable free tile is MANUAL too.
  const verifyFieldAndStep = async () => {
    if (H.inBattle()) fail("still in battle");
    const idle = await H.idle(2000, false);
    if (idle?.timeout) fail("idle timeout after battle", { idle });
    if (!H.fieldFree()) fail("field not free after battle: " + JSON.stringify(H.st()));
    const before = H.st();
    const DELTA = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
    let plan = null;
    for (let r = 1; r <= 8 && !plan; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (const dy of [r - Math.abs(dx), -(r - Math.abs(dx))]) {
          const tx = before.x + dx, ty = before.y + dy;
          if (encounterType(tx, ty) !== C.TILE_ENCOUNTER_NONE) continue;
          const steps = H.bfs(tx + 7, ty + 7);
          if (!steps || !steps.length) continue;
          let x = before.x, y = before.y, encounterTiles = 0;
          for (const s of steps) {
            x += DELTA[s][0]; y += DELTA[s][1];
            if (encounterType(x, y) !== C.TILE_ENCOUNTER_NONE) encounterTiles++;
          }
          if (x === tx && y === ty && (!plan || steps.length < plan.steps.length)) plan = { tx, ty, steps, encounterTiles };
          if (dy === 0) break;
        }
      }
    }
    const from = { map: before.map, x: before.x, y: before.y };
    if (!plan) return { status: "MANUAL", before: from, note: "no encounter-free tile reachable within 8" };
    for (let i = 0; i < plan.steps.length; i++) {
      await frDebug.walk(plan.steps[i], 1);
      if (H.inBattle()) {
        const at = H.st();
        return { status: "MANUAL", before: from, target: { x: plan.tx, y: plan.ty }, steps: plan.steps, walked: i + 1,
          note: "wild encounter while leaving the grass at (" + at.x + "," + at.y + "); return to a free tile not shown" };
      }
    }
    await H.idle(1000, false);
    const after = H.st();
    if (after.map !== before.map || after.x !== plan.tx || after.y !== plan.ty) fail("movement after battle failed", { before, plan, after });
    return { status: "PASS", before: from, target: { x: plan.tx, y: plan.ty }, steps: plan.steps, encounterTilesCrossed: plan.encounterTiles };
  };

  // CalculatePPWithBonus (pokemon.c:3898) from the exported move table, not the TS helper.
  const PP_UP_MASK = [0x03, 0x0c, 0x30, 0xc0];
  const expectedPP = (move, ppBonuses, i) => {
    const base = R.moves[move].pp;
    return (base + Math.trunc((base * 20 * ((PP_UP_MASK[i] & ppBonuses) >> (2 * i))) / 100)) & 0xff;
  };
`;

export default async function run(ctx) {
  const result = {
    cases: {},
    limits: [
      "C5 no acredita persistencia de guardado, fidelidad audiovisual ni procedencia natural de la partida.",
      "Captura garantizada: Master Ball añadida en memoria (PREPARED); prueba la garantía de esa bola, no odds>254 ni la probabilidad de Poké Ball.",
      "Equipo lleno: cinco Pokémon creados con createMon e identidad fija (PREPARED, sin consumir RNG); entrada diagnóstica, no progreso natural.",
      "Agotar las Poké Balls solo es PASS del subcaso de recursos; la captura natural queda MANUAL si no ocurre.",
    ],
  };
  const manual = [];

  const runCase = async (name, body) => {
    try {
      const initial = await ctx.loadSave("route2-north");
      if (initial.map !== "MAP_ROUTE2") throw new Error(`unexpected checkpoint: ${JSON.stringify(initial)}`);
      const res = await ctx.runEval(`${commonHelpers}\n${body}`);
      return res;
    } catch (err) {
      await ctx.shot(`C5-${name}-failure`).catch(() => {});
      return { status: "FAIL", error: String(err?.message || err).slice(0, 1500) };
    }
  };
  // A case with a movement MANUAL keeps its battle assertions but cannot claim a full return.
  const finish = (name, res) => {
    if (res.status !== "FAIL" && res.moved?.status === "MANUAL") {
      res.status = "MANUAL";
      manual.push(`${name}: ${res.moved.note}`);
    }
    result.cases[name] = res;
  };

  // 1. LUCHA
  finish("fight", await runCase("fight", `
    const whipIdx = sv.party[0].moves.indexOf(C.MOVE_VINE_WHIP);
    if (whipIdx < 0) fail("lead has no Vine Whip", { moves: sv.party[0].moves });
    const exp0 = sv.party[0].exp, pp0 = sv.party[0].pp[whipIdx];
    const foe = await encounter();
    const r = await H.battle("fight", whipIdx, 4000);
    if (r.stuck || r.outcome !== C.B_OUTCOME_WON) fail("FIGHT did not win", { r });
    if (sv.party[0].exp <= exp0) fail("no experience gained", { exp0, exp: sv.party[0].exp });
    const ppUsed = pp0 - sv.party[0].pp[whipIdx];
    if (ppUsed < 1) fail("PP was not decremented on attack", { pp0, pp: sv.party[0].pp[whipIdx] });
    const moved = await verifyFieldAndStep();
    return { status: "PASS", foe, outcome: r.outcome, whipIdx, expBefore: exp0, expAfter: sv.party[0].exp,
      ppBefore: pp0, ppAfter: sv.party[0].pp[whipIdx], ppUsed, moved };
  `));

  // 2. HUIDA: HP may drop after a failed attempt; only player PP must stay intact.
  finish("run", await runCase("run", `
    const bag0 = JSON.stringify(sv.bag);
    const foe = await encounter();
    const partyHp0 = sv.party.map(m => m.hp), partyPp0 = sv.party.map(m => [...m.pp]);
    const r = await H.battle("run", 0, 3000);
    if (r.stuck || r.outcome !== C.B_OUTCOME_RAN) fail("RUN did not escape", { r });
    const partyPpAfter = sv.party.map(m => [...m.pp]);
    if (JSON.stringify(partyPp0) !== JSON.stringify(partyPpAfter)) fail("PP changed during pure RUN", { partyPp0, partyPpAfter });
    const moved = await verifyFieldAndStep();
    return { status: "PASS", foe, outcome: r.outcome, decisions: r.decisions, trace: r.trace,
      bagUnchanged: JSON.stringify(sv.bag) === bag0, partyHpBefore: partyHp0, partyHpAfter: sv.party.map(m => m.hp), moved };
  `));

  // 3. LANZAMIENTO NATURAL (las 5 Poké Balls del fixture como máximo)
  const natural = await runCase("naturalCapture", `
    const initialBalls = countItem(C.ITEM_POKE_BALL);
    if (initialBalls !== 5) fail("unexpected initial poke balls", { initialBalls });
    const party0 = sv.party.length, box0 = boxMons();
    const foe = await encounter();
    const throws = [];
    let caught = false;
    for (let i = 0; i < initialBalls; i++) {
      const ballsBefore = countItem(C.ITEM_POKE_BALL);
      await useBallInBattle(C.ITEM_POKE_BALL);
      for (let w = 0; w < 400 && countItem(C.ITEM_POKE_BALL) >= ballsBefore; w++) await frDebug.wait(5);
      const ballsAfter = countItem(C.ITEM_POKE_BALL);
      if (ballsAfter !== ballsBefore - 1) fail("ball was not decremented exactly by 1", { ballsBefore, ballsAfter, throwNum: i + 1 });
      await drainAfterBallThrow(300);
      const enemy = H.G.gBattleMons[1];
      const outcome = getOutcome();
      throws.push({ throwIndex: i + 1, ballsRemaining: ballsAfter, foeSpecies: enemy?.species ?? null,
        foeHp: enemy?.hp ?? null, foeStatus: enemy?.status1 ?? null, outcome });
      if (outcome === C.B_OUTCOME_CAUGHT || !H.inBattle()) { caught = outcome === C.B_OUTCOME_CAUGHT; break; }
    }
    let runOutcome = null;
    if (!caught && H.inBattle()) {
      const r = await H.battle("run", 0, 3000);
      if (r.stuck || r.outcome !== C.B_OUTCOME_RAN) fail("RUN after exhausting balls did not escape", { r });
      runOutcome = r.outcome;
    }
    for (let i = 0; i < 200 && H.inBattle(); i++) await frDebug.press("B", 8);
    const gainedMons = (sv.party.length + boxMons()) - (party0 + box0);
    if (gainedMons !== (caught ? 1 : 0)) fail("party/box count does not match the outcome", { caught, gainedMons });
    const moved = await verifyFieldAndStep();
    return { status: caught ? "PASS" : "MANUAL", foe, initialBalls, throws, caught, runOutcome,
      ballsFinal: countItem(C.ITEM_POKE_BALL), gainedMons, moved,
      note: caught ? "captura natural lograda" : "recursos PASS (consumo 1 por lanzamiento y huida limpia); captura natural MANUAL" };
  `);
  if (natural.status === "MANUAL" && natural.caught === false) manual.push(`naturalCapture: ${natural.note}`);
  finish("naturalCapture", natural);

  // 4. CAPTURA GARANTIZADA CON HUECO (PREPARED: 1 Master Ball)
  finish("guaranteedPartyCapture", await runCase("guaranteedPartyCapture", `
    sv.bag.pokeBalls.push({ item: C.ITEM_MASTER_BALL, quantity: 1 }); // PREPARED
    const partyBefore = sv.party.map(monId);
    const foe = await encounter();
    const e = M.gEnemyParty[0];
    const enemy = { ...monId(e), level: H.G.gBattleMons[1].level, moves: [...e.moves], exp: e.exp >>> 0 };
    const dexBefore = P.getDexFlag(enemy.species, true);
    const mbBefore = countItem(C.ITEM_MASTER_BALL);
    await useBallInBattle(C.ITEM_MASTER_BALL);
    const drained = await drainAfterBallThrow(400);
    if (H.inBattle()) fail("battle did not finish after Master Ball throw");
    const outcome = getOutcome();
    if (outcome !== C.B_OUTCOME_CAUGHT) fail("Master Ball did not catch foe", { outcome });
    const mbAfter = countItem(C.ITEM_MASTER_BALL);
    if (mbAfter !== mbBefore - 1) fail("Master Ball was not decremented", { mbBefore, mbAfter });
    if (sv.party.length !== partyBefore.length + 1) fail("party did not grow by 1", { before: partyBefore.length, after: sv.party.length });
    for (let i = 0; i < partyBefore.length; i++) {
      if (JSON.stringify(monId(sv.party[i])) !== JSON.stringify(partyBefore[i])) fail("original party member changed", { i, expected: partyBefore[i], got: monId(sv.party[i]) });
    }
    // GiveMonToPlayer (pokemon.c:3686) sets OT to the player and copies the enemy mon.
    const c = sv.party[sv.party.length - 1];
    if (c.species !== enemy.species || c.level !== enemy.level || (c.personality >>> 0) !== enemy.personality
        || (c.otId >>> 0) !== (sv.trainerId >>> 0) || c.pokeball !== C.ITEM_MASTER_BALL) {
      fail("caught mon identity mismatch", { enemy, caught: { ...monId(c), pokeball: c.pokeball } });
    }
    const dexAfter = P.getDexFlag(c.species, true);
    if (!dexAfter) fail("Pokedex caught flag not set", { species: c.species });
    const moved = await verifyFieldAndStep();
    return { status: "PASS", prepared: "1 ITEM_MASTER_BALL in memory", foe, enemy, mbConsumed: mbBefore - mbAfter,
      nicknameDeclined: drained.nicknameDeclined, partyLength: sv.party.length, dexCaughtBefore: dexBefore, dexCaughtAfter: dexAfter, moved };
  `));

  // 5. CAPTURA CON EQUIPO LLENO (PREPARED: líder original + 5 createMon + 1 Master Ball)
  finish("fullPartyCaptureToPC", await runCase("fullPartyCaptureToPC", `
    // PREPARED: fixed personality/IV/OT so createMon consumes no RNG before the encounter.
    const fillers = [];
    for (let i = 0; sv.party.length < 6; i++) {
      const mon = P.createMon(C.SPECIES_PIDGEY, 3, { personality: 0x1000 + i, fixedIV: 0, otId: sv.trainerId });
      sv.party.push(mon);
      fillers.push(monId(mon));
    }
    sv.bag.pokeBalls.push({ item: C.ITEM_MASTER_BALL, quantity: 1 });
    const partyBefore = sv.party.map(monId);
    const boxCountBefore = boxMons();
    const currentBox = sv.currentBox;
    // First slot SendMonToPC (pokemon.c:3708) picks: from StorageGetCurrentBox(), boxes
    // in circular order, first slot whose species is SPECIES_NONE. Read from the save, not storage.ts.
    let dest = null;
    for (let k = 0; k < sv.boxes.length && !dest; k++) {
      const box = (currentBox + k) % sv.boxes.length;
      const slot = sv.boxes[box].findIndex(m => !m || !m.species);
      if (slot >= 0) dest = { box, slot };
    }
    if (!dest) fail("no empty storage slot in boxes");
    const varBoxBefore = S.varGet(C.VAR_PC_BOX_TO_SEND_MON);

    const foe = await encounter();
    const e = M.gEnemyParty[0];
    const enemy = { ...monId(e), level: H.G.gBattleMons[1].level, moves: [...e.moves], exp: e.exp >>> 0, ppBonuses: e.ppBonuses };
    const mbBefore = countItem(C.ITEM_MASTER_BALL);
    await useBallInBattle(C.ITEM_MASTER_BALL);
    const drained = await drainAfterBallThrow(400);
    if (H.inBattle()) fail("battle did not finish after Master Ball throw (full party)");
    const outcome = getOutcome();
    if (outcome !== C.B_OUTCOME_CAUGHT) fail("Master Ball did not catch foe (full party)", { outcome });
    const mbAfter = countItem(C.ITEM_MASTER_BALL);
    if (mbAfter !== mbBefore - 1) fail("Master Ball was not decremented (full party)", { mbBefore, mbAfter });
    if (sv.party.length !== 6) fail("party length altered", { len: sv.party.length });
    for (let i = 0; i < 6; i++) {
      if (JSON.stringify(monId(sv.party[i])) !== JSON.stringify(partyBefore[i])) fail("party member altered", { i, expected: partyBefore[i], got: monId(sv.party[i]) });
    }
    if (boxMons() !== boxCountBefore + 1) fail("box count did not increase by 1", { before: boxCountBefore, after: boxMons() });
    const boxed = sv.boxes[dest.box][dest.slot];
    const stored = boxed ? { ...monId(boxed), moves: [...boxed.moves], exp: boxed.exp >>> 0, pp: [...boxed.pp], pokeball: boxed.pokeball } : null;
    if (!boxed || boxed.species !== enemy.species || (boxed.personality >>> 0) !== enemy.personality
        || JSON.stringify(stored.moves) !== JSON.stringify(enemy.moves) || stored.exp !== enemy.exp) {
      fail("stored mon does not match the enemy in the expected slot", { dest, stored, enemy });
    }
    if ((boxed.otId >>> 0) !== (sv.trainerId >>> 0) || boxed.pokeball !== C.ITEM_MASTER_BALL) fail("stored mon OT / ball mismatch", { stored });
    // MonRestorePP before CopyMon (pokemon.c:3722): PP equal CalculatePPWithBonus per move.
    for (let i = 0; i < 4; i++) {
      const mv = boxed.moves[i];
      if (!mv) continue;
      const want = expectedPP(mv, enemy.ppBonuses, i);
      if (boxed.pp[i] !== want) fail("stored mon PP not restored per CalculatePPWithBonus", { slot: i, mv, got: boxed.pp[i], want });
    }
    // SendMonToPC sets VAR_PC_BOX_TO_SEND_MON to the box used.
    const varBoxAfter = S.varGet(C.VAR_PC_BOX_TO_SEND_MON);
    if (varBoxAfter !== dest.box) fail("VAR_PC_BOX_TO_SEND_MON does not name the destination box", { varBoxAfter, dest });
    const moved = await verifyFieldAndStep();
    return { status: "PASS", prepared: { fillers, masterBall: 1 }, foe, enemy, currentBox, destination: dest,
      varBoxBefore, varBoxAfter, stored, nicknameDeclined: drained.nicknameDeclined, partyLength: sv.party.length,
      boxMonsTotal: boxMons(), moved };
  `));

  const statuses = Object.fromEntries(Object.entries(result.cases).map(([k, v]) => [k, v.status]));
  result.statuses = statuses;
  if (manual.length) result.manual = manual.join("; ");
  try { mkdirSync(outdir, { recursive: true }); writeFileSync(`${outdir}/C5-result.json`, JSON.stringify(result, null, 2)); } catch {}
  const failed = Object.entries(statuses).filter(([, s]) => s === "FAIL");
  if (failed.length) {
    throw new Error(`C5 FAIL in ${failed.map(([k]) => k).join(", ")}; statuses ${JSON.stringify(statuses)}; ` +
      failed.map(([k]) => `${k}: ${result.cases[k].error}`).join(" | ").slice(0, 1200));
  }
  result.status = manual.length ? "MANUAL" : "PASS";
  return result;
}
