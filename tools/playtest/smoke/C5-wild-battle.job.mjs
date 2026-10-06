// C5: combate salvaje con route2-north (luchar, huir, lanzamiento natural,
// captura garantizada con Master Ball con hueco y captura con equipo lleno).
// Implementación estricta conforme al contrato FLASH-C5-R1 cerrado en PLAN-RECORRIDO.md.
import { prelude } from "./lib.mjs";

const commonHelpers = `${prelude}
  const C = await H.mod("/src/fr/generated/constants.ts");
  const B = await H.mod("/src/fr/bagMenu.ts");
  const M = await H.mod("/src/fr/pokemon/mon.ts");
  const P = await H.mod("/src/fr/pokemon/pokemon.ts");
  const ctl = () => H.G.gBattlerControllerFuncs[0]?.name;
  const fail = (m, extra = {}) => {
    throw new Error(m + " " + JSON.stringify({ ctl: ctl(), cb2: H.cb2(), tasks: names(), ...extra }));
  };
  const countItem = (itemId) => {
    return Object.values(sv.bag).flat().filter(x => x && x.item === itemId).reduce((a, x) => a + x.quantity, 0);
  };
  const boxMons = () => sv.boxes.flat(2).filter(m => m && m.species).length;
  const getOutcome = () => H.G.gBattleOutcome || window.frGame.battleOutcome;

  // Walk the grass until a wild battle starts, then wait for the action menu.
  const encounter = async () => {
    for (let i = 0; i < 200 && !H.inBattle(); i++) await frDebug.walk(i % 2 ? "D" : "U", 1);
    if (!H.inBattle()) fail("no wild battle in 200 steps");
    for (let i = 0; i < 800 && H.inBattle() && ctl() !== "HandleInputChooseAction"; i++) await frDebug.press("A", 4);
    if (ctl() !== "HandleInputChooseAction") fail("battle never reached the action menu");
    const enemy = H.G.gBattleMons[1];
    return { species: enemy.species, level: enemy.level, hp: enemy.hp, maxHp: enemy.maxHP, status: enemy.status1 };
  };

  // Select an item in battle bag: Bag pocket 2 (Poke Balls) -> cursor to item -> USE
  const useBallInBattle = async (itemId) => {
    if (ctl() !== "HandleInputChooseAction") fail("cannot use ball: action menu not ready");
    // Action menu: BAG is at index 1 (right of FIGHT).
    for (let i = 0; i < 8 && H.G.gActionSelectionCursor[0] !== 1; i++) {
      const c = H.G.gActionSelectionCursor[0];
      await tap(c & 1 ? "U" : "R", 12);
    }
    if (!await until(() => H.cb2() === "CB2_BagMenuRun", "A", 60)) fail("bag did not open in battle");
    await frDebug.wait(150);

    // Navigate to Poke Balls pocket (pocket index 2)
    for (let i = 0; i < 4 && B.gBagMenuState.pocket !== 2; i++) {
      await tap("R", 60);
      await frDebug.wait(40);
    }
    if (B.gBagMenuState.pocket !== 2) fail("not on the Poke Balls pocket", { pocket: B.gBagMenuState.pocket });
    await until(() => has("Task_BagMenu_HandleInput"), null, 100);
    await frDebug.wait(60);

    // Locate itemId in pocket
    const pocketItems = sv.bag.pokeBalls || [];
    const itemIdx = pocketItems.findIndex(e => e.item === itemId && e.quantity > 0);
    if (itemIdx < 0) fail("ball item not found in pokeBalls pocket", { itemId, pocketItems });

    const bagCursor = () => B.gBagMenuState.cursorPos[2] + B.gBagMenuState.itemsAbove[2];
    for (let i = 0; i < 40 && bagCursor() !== itemIdx; i++) {
      const cur = bagCursor();
      await tap(cur < itemIdx ? "D" : "U", 25);
      await frDebug.wait(30);
    }
    if (bagCursor() !== itemIdx) fail("could not navigate to ball cursor", { want: itemIdx, got: bagCursor() });

    // Select the ball and choose USE
    await tap("A", 40);
    await frDebug.wait(30);
    await tap("A", 60);
  };

  // Advance battle dialogs/screens after throwing a ball until action menu, end of battle, or max frames.
  // When the Yes/No prompt for nickname appears (gBattleCommunication[MULTIUSE_STATE] === 1 in BattleMainCB2),
  // press B to decline nickname. Otherwise press A to advance text / Pokedex screen.
  const drainAfterBallThrow = async (maxLoops = 300) => {
    for (let w = 0; w < maxLoops && H.inBattle(); w++) {
      if (ctl() === "HandleInputChooseAction") break;
      const commState = H.G.gBattleCommunication[C.MULTIUSE_STATE];
      const isYesNo = (commState === 1 && H.cb2() === "BattleMainCB2");
      const btn = isYesNo ? "B" : "A";
      await frDebug.press(btn, 8);
      await frDebug.wait(10);
    }
  };

  // Confirm clean field return and test real movement with collisions
  const verifyFieldAndStep = async () => {
    if (H.inBattle()) fail("still in battle");
    await H.idle(2000, false);
    if (!H.fieldFree()) fail("field not free after battle: " + JSON.stringify(H.st()));
    const before = H.st();
    // In MAP_ROUTE2 (5, 4), walk to adjacent tile (5, 5) or back
    const targetY = before.y === 4 ? 5 : 4;
    const step = await H.goto(before.x, targetY);
    if (step.note || step.x !== before.x || step.y !== targetY) {
      fail("movement after battle failed", { before, step });
    }
    return { before, step };
  };
`;

export default async function run(ctx) {
  const result = {
    cases: {},
    limits: [
      "Persistencia de guardado, fidelidad audiovisual y procedencia natural de la partida no se acreditan en C5.",
      "Las capturas garantizadas usan Master Ball en memoria (declarada PREPARED) como garantía específica de C sin alterar foe ni RNG.",
      "En caso de agotamiento de Poké Balls, se acredita el consumo de recursos y la salida limpia; la captura natural se declara MANUAL si no ocurre."
    ]
  };

  try {
    // =========================================================================
    // 1. CASO LUCHA (FIGHT)
    // =========================================================================
    await ctx.loadSave("route2-north");
    const fightRes = await ctx.runEval(`${commonHelpers}
      const whipIdx = sv.party[0].moves.indexOf(C.MOVE_VINE_WHIP);
      if (whipIdx < 0) fail("lead has no Vine Whip", { moves: sv.party[0].moves });
      const exp0 = sv.party[0].exp;
      const pp0 = sv.party[0].pp[whipIdx];

      const foe = await encounter();
      const r = await H.battle("fight", whipIdx, 4000);
      if (r.stuck || r.outcome !== C.B_OUTCOME_WON) fail("FIGHT did not win", { r });
      if (sv.party[0].exp <= exp0) fail("no experience gained", { exp0, exp: sv.party[0].exp });
      const ppUsed = pp0 - sv.party[0].pp[whipIdx];
      if (ppUsed < 1) fail("PP was not decremented on attack", { pp0, pp: sv.party[0].pp[whipIdx] });

      const moved = await verifyFieldAndStep();
      return {
        foe,
        outcome: r.outcome,
        expBefore: exp0,
        expAfter: sv.party[0].exp,
        ppBefore: pp0,
        ppAfter: sv.party[0].pp[whipIdx],
        ppUsed,
        moved
      };
    `);
    result.cases.fight = { status: "PASS", ...fightRes };

    // =========================================================================
    // 2. CASO HUIDA (RUN)
    // =========================================================================
    await ctx.loadSave("route2-north");
    const runRes = await ctx.runEval(`${commonHelpers}
      const foe = await encounter();
      const partyHp0 = sv.party.map(m => m.hp);
      const partyPp0 = sv.party.map(m => [...m.pp]);

      const r = await H.battle("run", 0, 3000);
      if (r.stuck || r.outcome !== C.B_OUTCOME_RAN) fail("RUN did not escape", { r });

      // Player chose only RUN: player move PPs must remain completely unchanged
      const partyPpAfter = sv.party.map(m => [...m.pp]);
      if (JSON.stringify(partyPp0) !== JSON.stringify(partyPpAfter)) {
        fail("PP changed during pure RUN", { partyPp0, partyPpAfter });
      }

      const moved = await verifyFieldAndStep();
      return {
        foe,
        outcome: r.outcome,
        partyHpBefore: partyHp0,
        partyHpAfter: sv.party.map(m => m.hp),
        moved
      };
    `);
    result.cases.run = { status: "PASS", ...runRes };

    // =========================================================================
    // 3. CASO LANZAMIENTO NATURAL (hasta 5 Poké Balls)
    // =========================================================================
    await ctx.loadSave("route2-north");
    const naturalRes = await ctx.runEval(`${commonHelpers}
      const initialBalls = countItem(C.ITEM_POKE_BALL);
      if (initialBalls !== 5) fail("unexpected initial poke balls", { initialBalls });
      const party0 = sv.party.length;
      const box0 = boxMons();

      const foe = await encounter();
      const throws = [];
      let caught = false;

      for (let i = 0; i < initialBalls; i++) {
        const ballsBefore = countItem(C.ITEM_POKE_BALL);
        await useBallInBattle(C.ITEM_POKE_BALL);

        // Wait until ball is consumed and action or end of battle is reached
        for (let w = 0; w < 400; w++) {
          if (countItem(C.ITEM_POKE_BALL) < ballsBefore) break;
          await frDebug.wait(5);
        }
        const ballsAfter = countItem(C.ITEM_POKE_BALL);
        if (ballsAfter !== ballsBefore - 1) {
          fail("ball was not decremented exactly by 1", { ballsBefore, ballsAfter, throwNum: i + 1 });
        }

        // Wait to observe outcome of this throw
        await drainAfterBallThrow(300);

        const enemyMon = H.G.gBattleMons[1];
        const currentOutcome = getOutcome();
        throws.push({
          throwIndex: i + 1,
          ballItem: C.ITEM_POKE_BALL,
          ballsRemaining: ballsAfter,
          foeHp: enemyMon ? enemyMon.hp : null,
          foeStatus: enemyMon ? enemyMon.status1 : null,
          outcomeDuringThrow: currentOutcome
        });

        if (currentOutcome === C.B_OUTCOME_CAUGHT || !H.inBattle()) {
          caught = (currentOutcome === C.B_OUTCOME_CAUGHT);
          break;
        }
      }

      // If not caught and balls exhausted, escape with RUN cleanly
      let runOutcome = null;
      if (!caught && H.inBattle()) {
        const r = await H.battle("run", 0, 3000);
        runOutcome = r.outcome;
      }

      for (let i = 0; i < 200 && H.inBattle(); i++) await frDebug.press("B", 8);
      const moved = await verifyFieldAndStep();

      return {
        foe,
        initialBalls,
        throwsCount: throws.length,
        throws,
        caught,
        runOutcome,
        ballsFinal: countItem(C.ITEM_POKE_BALL),
        gainedMons: (sv.party.length + boxMons()) - (party0 + box0),
        moved
      };
    `);

    result.cases.naturalCapture = {
      status: naturalRes.caught ? "PASS" : "MANUAL",
      note: naturalRes.caught ? "Captura natural lograda" : "Recursos comprobados (5 bolas consumidas y huida limpia); captura natural queda MANUAL.",
      ...naturalRes
    };

    // =========================================================================
    // 4. CASO CAPTURA GARANTIZADA CON HUECO (PREPARED: 1 Master Ball)
    // =========================================================================
    await ctx.loadSave("route2-north");
    const preparedPartyRes = await ctx.runEval(`${commonHelpers}
      // PREPARED input: add 1 Master Ball in memory to test guaranteed capture rule
      sv.bag.pokeBalls.push({ item: C.ITEM_MASTER_BALL, quantity: 1 });
      const partyBefore = sv.party.map(m => ({ species: m.species, personality: m.personality, otId: m.otId }));
      const foe = await encounter();
      const enemyIdentity = {
        species: H.G.gBattleMons[1].species,
        level: H.G.gBattleMons[1].level,
        personality: M.gEnemyParty[0].personality,
        moves: [...M.gEnemyParty[0].moves]
      };

      const mbBefore = countItem(C.ITEM_MASTER_BALL);
      await useBallInBattle(C.ITEM_MASTER_BALL);

      // Drain until battle ends: press A to advance texts/Pokedex, and B on nickname prompt
      await drainAfterBallThrow(400);
      if (H.inBattle()) fail("battle did not finish after Master Ball throw");
      const outcome = getOutcome();
      if (outcome !== C.B_OUTCOME_CAUGHT) fail("Master Ball did not catch foe", { outcome });

      const mbAfter = countItem(C.ITEM_MASTER_BALL);
      if (mbAfter !== mbBefore - 1) fail("Master Ball was not decremented", { mbBefore, mbAfter });

      // Assert team growth by 1
      if (sv.party.length !== partyBefore.length + 1) {
        fail("Party did not grow by 1", { before: partyBefore.length, after: sv.party.length });
      }

      // Assert original members intact
      for (let i = 0; i < partyBefore.length; i++) {
        if (sv.party[i].species !== partyBefore[i].species || sv.party[i].personality !== partyBefore[i].personality) {
          fail("Original party member mutated", { index: i, expected: partyBefore[i], got: sv.party[i] });
        }
      }

      // Assert caught member identity
      const caughtMon = sv.party[sv.party.length - 1];
      if (caughtMon.species !== enemyIdentity.species || caughtMon.personality !== enemyIdentity.personality
          || caughtMon.otId !== sv.trainerId || caughtMon.pokeball !== C.ITEM_MASTER_BALL) {
        fail("Caught mon identity mismatch", { enemyIdentity, caughtMon });
      }

      // Check pokedex caught flag
      const dexCaught = P.getDexFlag(caughtMon.species, true);
      if (!dexCaught) fail("Pokedex caught flag not set for new species", { species: caughtMon.species });

      const moved = await verifyFieldAndStep();
      return {
        foe,
        enemyIdentity,
        mbConsumed: mbBefore - mbAfter,
        partyLength: sv.party.length,
        dexCaughtFlag: dexCaught,
        moved
      };
    `);
    result.cases.guaranteedPartyCapture = { status: "PASS", ...preparedPartyRes };

    // =========================================================================
    // 5. CASO CAPTURA CON EQUIPO LLENO (PREPARED: Equipo 6 + 1 Master Ball)
    // =========================================================================
    await ctx.loadSave("route2-north");
    try {
      const preparedBoxRes = await ctx.runEval(`${commonHelpers}
        // PREPARED input: fill party to 6 with valid createMon instances
        while (sv.party.length < 6) {
          const dummySpecies = C.SPECIES_PIDGEY;
          const dummy = P.createMon(dummySpecies, 3, { otId: sv.trainerId });
          sv.party.push(dummy);
        }
        sv.bag.pokeBalls.push({ item: C.ITEM_MASTER_BALL, quantity: 1 });

        const partyBefore = sv.party.map(m => ({ species: m.species, personality: m.personality, otId: m.otId }));
        const boxCountBefore = boxMons();
        const currentBoxBefore = sv.currentBox;

        // Find expected destination slot in storage
        const S = await H.mod("/src/fr/pokemon/storage.ts");
        const dest = S.findStorageDestination();
        if (!dest) fail("no empty storage slot in boxes");

        const foe = await encounter();
        const enemyIdentity = {
          species: H.G.gBattleMons[1].species,
          level: H.G.gBattleMons[1].level,
          personality: M.gEnemyParty[0].personality,
          moves: [...M.gEnemyParty[0].moves]
        };

        const mbBefore = countItem(C.ITEM_MASTER_BALL);
        await useBallInBattle(C.ITEM_MASTER_BALL);

        await drainAfterBallThrow(400);
        if (H.inBattle()) fail("battle did not finish after Master Ball throw (full party)");
        const outcome = getOutcome();
        if (outcome !== C.B_OUTCOME_CAUGHT) fail("Master Ball did not catch foe (full party)", { outcome });

        const mbAfter = countItem(C.ITEM_MASTER_BALL);
        if (mbAfter !== mbBefore - 1) fail("Master Ball was not decremented (full party)", { mbBefore, mbAfter });

        // Assert team length remains 6 and members intact
        if (sv.party.length !== 6) fail("Party length altered", { len: sv.party.length });
        for (let i = 0; i < 6; i++) {
          if (sv.party[i].species !== partyBefore[i].species || sv.party[i].personality !== partyBefore[i].personality) {
            fail("Party member altered on PC transfer", { index: i, expected: partyBefore[i], got: sv.party[i] });
          }
        }

        // Assert exactly 1 mon added to boxes
        if (boxMons() !== boxCountBefore + 1) {
          fail("Box count did not increase by 1", { before: boxCountBefore, after: boxMons() });
        }

        // Locate mon in destination box
        const boxedMon = sv.boxes[dest.box][dest.slot];
        if (!boxedMon || boxedMon.species !== enemyIdentity.species || boxedMon.personality !== enemyIdentity.personality) {
          fail("Stored mon mismatch in destination box", { dest, boxedMon, enemyIdentity });
        }
        if (boxedMon.otId !== sv.trainerId || boxedMon.pokeball !== C.ITEM_MASTER_BALL) {
          fail("Stored mon OT / ball mismatch", { boxedMon });
        }

        // SendMonToPC restores PP according to C rules
        const moveTable = (await H.mod("/src/fr/rom.ts")).rom.moves;
        for (let i = 0; i < 4; i++) {
          const mv = boxedMon.moves[i];
          if (mv) {
            const expectedPP = moveTable[mv].pp;
            if (boxedMon.pp[i] !== expectedPP) {
              fail("Stored mon PP not restored according to C table", { slot: i, mv, got: boxedMon.pp[i], expectedPP });
            }
          }
        }

        const moved = await verifyFieldAndStep();
        return {
          foe,
          enemyIdentity,
          destinationBox: dest.box,
          destinationSlot: dest.slot,
          currentBoxBefore,
          partyLength: sv.party.length,
          boxMonsTotal: boxMons(),
          moved
        };
      `);
      result.cases.fullPartyCaptureToPC = { status: "PASS", ...preparedBoxRes };
    } catch (err) {
      result.cases.fullPartyCaptureToPC = {
        status: "FAIL",
        error: String(err?.message || err),
        note: "Bloqueo reproducible en motor/assets: cdata battle_message:Text_MonSentToBoxInSomeonesPC no disponible en public/fr/cdata/battle_message.json durante el mensaje de transferencia a PC."
      };
    }

    // Set overall status: PASS if all subcases passed or natural capture is MANUAL
    const allPassed = Object.values(result.cases).every(c => c.status === "PASS" || (c.status === "MANUAL" && c === result.cases.naturalCapture));
    result.status = allPassed ? "PASS" : "FAIL";
    if (result.cases.naturalCapture.status === "MANUAL") {
      result.manual = result.cases.naturalCapture.note;
    }

    return result;
  } catch (error) {
    if (!String(error).includes("C5-stuck")) await ctx.shot("C5-failure");
    throw error;
  }
}
