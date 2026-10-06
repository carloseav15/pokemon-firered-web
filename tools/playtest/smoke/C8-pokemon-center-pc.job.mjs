export default async function run(ctx) {
  const BASE = process.env.PW_BASE ?? "http://localhost:5173/";

  const reloadAndContinue = async () => {
    await ctx.page.goto(`${BASE}?fr=continue`, { waitUntil: "load" });
    await ctx.page.waitForTimeout(1000);
    const playbackDone = await ctx.runEval(`
      const { H } = await import("/tools/playtest/driver.js");
      window.H = H;
      await H.ready();
      const Q = await H.mod("/src/fr/questLogEvents.ts");
      const isPlayback = () => Q.gQuestLogState === H.C.QL_STATE_PLAYBACK || Q.gQuestLogState === H.C.QL_STATE_PLAYBACK_LAST;
      const observedQL = [];
      for (let f = 0; f < 18000; f += 20) {
        if (!observedQL.includes(Q.gQuestLogState)) observedQL.push(Q.gQuestLogState);
        if (!isPlayback() && H.fieldFree()) break;
        await frDebug.wait(20);
      }
      if (isPlayback() || !H.fieldFree()) {
        throw new Error("Quest Log playback did not finish: " + JSON.stringify({ observedQL, state: H.st() }));
      }
      return { observedQL };
    `);
    return playbackDone;
  };

  const saveViaStartMenu = `
    const C = H.C;
    const statBefore = frDebug.save.save.gameStats[C.GAME_STAT_SAVED_GAME];
    const rawBefore = localStorage.getItem("pokemon-gba-web-lab.firered.v2");
    const result = await H.saveGame();
    if (!result.ok) throw new Error("SAVE failed: " + JSON.stringify(result));
    const statAfter = frDebug.save.save.gameStats[C.GAME_STAT_SAVED_GAME];
    const rawAfter = localStorage.getItem("pokemon-gba-web-lab.firered.v2");
    // start_menu.c: the save dialog owns its YES/NO menu; it is not ScriptMenu_YesNo.
    if (statAfter !== statBefore + 1 || !rawAfter || rawAfter === rawBefore
        || JSON.parse(rawAfter).gameStats[C.GAME_STAT_SAVED_GAME] !== statAfter || !H.fieldFree())
      throw new Error("SAVE did not persist counter and return field control");
    return { statBefore, statAfter };
  `;

  try {
    // =========================================================================
    // PARTE 1: PC (pewter-pc) - Depósito, Retiro, Identidad, Cierre y Persistencia
    // =========================================================================
    const initialPC = await ctx.loadSave("pewter-pc");
    if (initialPC.map !== "MAP_PEWTER_CITY_POKEMON_CENTER_1F") {
      throw new Error(`wrong PC initial map: ${JSON.stringify(initialPC)}`);
    }

    const pcFlow = await ctx.runEval(`
      const T = await H.mod("/src/fr/gba/tasks.ts");
      const M = await H.mod("/src/fr/storageSystemInternal.ts");
      const sv = frDebug.save.save;
      const R = {};

      const monIdentity = (m) => m ? ({
        species: m.species,
        personality: m.personality,
        otId: m.otId,
        moves: m.moves ? [...m.moves] : [],
        heldItem: m.heldItem
      }) : null;

      const toMenu = async () => {
        for (let i = 0; i < 40; i++) {
          const t = T.tasks.tasks.find(t => t.isActive && t.func.name === "Task_PCMainMenu");
          if (t && t.data[0] === 2) return true;
          await frDebug.press("A"); await frDebug.wait(60);
        }
        return false;
      };
      const setCursor = async (want) => {
        const cur = () => { const t = T.tasks.tasks.find(t => t.isActive && t.func.name === "Task_PCMainMenu"); return t ? t.data[1] : null; };
        for (let i = 0; i < 10 && cur() !== want; i++) {
          const c = cur();
          await frDebug.wait(4, c !== null && c < want ? 0x80 : 0x40); await frDebug.wait(30);
        }
        return cur();
      };
      const backToMenu = async () => {
        for (let i = 0; i < 12; i++) {
          await frDebug.press("B"); await frDebug.wait(120);
          if (T.tasks.tasks.some(t => t.isActive && t.func.name === "Task_PCMainMenu")) return true;
        }
        return false;
      };

      // 1. Initial verification: Bulbasaur at slot 0, Pidgey at slot 1, Box 0 empty
      R.entry = {
        map: H.st().map,
        coords: { x: H.st().x, y: H.st().y },
        money: sv.money,
        party: sv.party.filter(p => p.species).map(monIdentity),
        box0: sv.boxes[0].filter(m => m && m.species).map(monIdentity)
      };

      if (R.entry.party.length !== 2 || R.entry.box0.length !== 0) {
        throw new Error("unexpected PC initial counts: " + JSON.stringify(R.entry));
      }
      if (R.entry.party[0].species !== 1 || R.entry.party[1].species !== 16) {
        throw new Error("unexpected PC initial party order/species: " + JSON.stringify(R.entry.party));
      }

      if (!await toMenu()) throw new Error("PC main menu never opened");

      // 2. DEPOSIT Bulbasaur (slot 0) into Box 0
      if (await setCursor(1) !== 1) throw new Error("could not move to DEPOSIT");
      await frDebug.press("A"); await frDebug.wait(250);
      await frDebug.press("A"); await frDebug.wait(150);
      await frDebug.press("A"); await frDebug.wait(150);
      await frDebug.press("A"); await frDebug.wait(400);

      R.afterDepositWork = {
        workParty: M.sParty.filter(p => p.species).map(p => p.species),
        box0: sv.boxes[0].filter(m => m && m.species).map(monIdentity)
      };
      if (JSON.stringify(R.afterDepositWork.workParty) !== "[16]") {
        throw new Error("deposit did not remove Bulbasaur from work party: " + JSON.stringify(R.afterDepositWork));
      }
      if (R.afterDepositWork.box0.length !== 1 || R.afterDepositWork.box0[0].species !== 1) {
        throw new Error("deposit did not land Bulbasaur in box 0: " + JSON.stringify(R.afterDepositWork));
      }
      // Check Bulbasaur identity in box 0
      if (R.afterDepositWork.box0[0].personality !== R.entry.party[0].personality
          || R.afterDepositWork.box0[0].otId !== R.entry.party[0].otId
          || JSON.stringify(R.afterDepositWork.box0[0].moves) !== JSON.stringify(R.entry.party[0].moves)
          || R.afterDepositWork.box0[0].heldItem !== R.entry.party[0].heldItem) {
        throw new Error("Bulbasaur identity mismatch in box 0: " + JSON.stringify({
          before: R.entry.party[0],
          box: R.afterDepositWork.box0[0]
        }));
      }

      if (!await backToMenu()) throw new Error("did not return to PC menu after deposit");
      R.syncedParty = sv.party.filter(p => p.species).map(monIdentity);
      if (R.syncedParty.length !== 1 || R.syncedParty[0].species !== 16) {
        throw new Error("save party not synced after deposit: " + JSON.stringify(R.syncedParty));
      }

      // 3. WITHDRAW Bulbasaur back (lands at party slot 1, after Pidgey)
      if (await setCursor(0) !== 0) throw new Error("could not move to WITHDRAW");
      await frDebug.press("A"); await frDebug.wait(250);
      await frDebug.press("A"); await frDebug.wait(150);
      await frDebug.press("A"); await frDebug.wait(300);

      R.afterWithdrawWork = {
        workParty: M.sParty.filter(p => p.species).map(p => p.species),
        box0: sv.boxes[0].filter(m => m && m.species).map(monIdentity)
      };
      if (R.afterWithdrawWork.box0.length !== 0) {
        throw new Error("withdraw did not empty box 0: " + JSON.stringify(R.afterWithdrawWork));
      }
      if (JSON.stringify([...R.afterWithdrawWork.workParty].sort()) !== "[1,16]") {
        throw new Error("withdraw did not restore work party: " + JSON.stringify(R.afterWithdrawWork));
      }

      if (!await backToMenu()) throw new Error("did not return to PC menu after withdraw");
      R.restoredParty = sv.party.filter(p => p.species).map(monIdentity);
      R.restoredBox0 = sv.boxes[0].filter(m => m && m.species).map(monIdentity);
      if (R.restoredParty.length !== 2 || R.restoredBox0.length !== 0) {
        throw new Error("save party/box not restored after withdraw: " + JSON.stringify(R));
      }

      // Check restored identities and order: slot 0 is Pidgey (16), slot 1 is Bulbasaur (1)
      if (R.restoredParty[0].species !== 16 || R.restoredParty[1].species !== 1) {
        throw new Error("restored party order mismatch: " + JSON.stringify(R.restoredParty));
      }
      const restoredBulbasaur = R.restoredParty[1];
      const restoredPidgey = R.restoredParty[0];
      if (restoredBulbasaur.personality !== R.entry.party[0].personality
          || restoredBulbasaur.otId !== R.entry.party[0].otId
          || JSON.stringify(restoredBulbasaur.moves) !== JSON.stringify(R.entry.party[0].moves)
          || restoredBulbasaur.heldItem !== R.entry.party[0].heldItem) {
        throw new Error("Bulbasaur identity corrupted after withdraw: " + JSON.stringify({
          initial: R.entry.party[0],
          restored: restoredBulbasaur
        }));
      }
      if (restoredPidgey.personality !== R.entry.party[1].personality
          || restoredPidgey.otId !== R.entry.party[1].otId
          || JSON.stringify(restoredPidgey.moves) !== JSON.stringify(R.entry.party[1].moves)
          || restoredPidgey.heldItem !== R.entry.party[1].heldItem) {
        throw new Error("Pidgey identity corrupted after withdraw: " + JSON.stringify({
          initial: R.entry.party[1],
          restored: restoredPidgey
        }));
      }

      // 4. Exit PC: We are already in PCMainMenu. Dismiss PCMainMenu with B
      await frDebug.press("B");
      await frDebug.wait(60);

      // Dismiss to parent PC menu with B
      await frDebug.press("B");
      await frDebug.wait(60);

      // Wait until parent PC menu (Task_MultichoiceMenu_HandleInput) is active
      for (let i = 0; i < 30; i++) {
        if (T.tasks.tasks.some(t => t.isActive && t.func.name === "Task_MultichoiceMenu_HandleInput")) break;
        await frDebug.wait(10);
      }
      R.hasParentMenu = T.tasks.tasks.some(t => t.isActive && t.func.name === "Task_MultichoiceMenu_HandleInput");
      if (!R.hasParentMenu) throw new Error("Parent PC menu never appeared upon exit");

      // LOG OFF with B
      await frDebug.press("B");
      await frDebug.wait(60);

      // Wait for shutdown and confirm all PC tasks destroyed
      for (let f = 0; f < 200 && !H.fieldFree(); f += 5) await frDebug.wait(5);
      R.activeTasksAfterExit = T.tasks.tasks.filter(t => t.isActive).map(t => t.func.name);
      if (R.activeTasksAfterExit.some(n => ["Task_PCMainMenu", "Task_MultichoiceMenu_HandleInput"].includes(n))) {
        throw new Error("PC tasks remained active after shutdown: " + JSON.stringify(R.activeTasksAfterExit));
      }
      if (!H.fieldFree()) throw new Error("H.fieldFree() false after PC exit: " + JSON.stringify(H.st()));

      // Real step outside counter: walk down 2 tiles from (11, 2) to (11, 4)
      const walkResult = await H.goto(11, 4);
      if (walkResult.note || walkResult.x !== 11 || walkResult.y !== 4) {
        throw new Error("Player could not move after PC exit: " + JSON.stringify(walkResult));
      }
      R.walkedPosition = { x: walkResult.x, y: walkResult.y };

      // Pre-save snapshot to compare after reload & continue
      R.preSaveSnapshot = {
        party: sv.party.filter(p => p.species).map(monIdentity),
        box0: sv.boxes[0].filter(m => m && m.species).map(monIdentity),
        map: H.st().map,
        coords: { x: walkResult.x, y: walkResult.y },
        bag: JSON.parse(JSON.stringify(sv.bag)),
        money: sv.money
      };

      return R;
    `);

    // 5. Save PC state via in-game Start Menu
    const pcSaveStats = await ctx.runEval(saveViaStartMenu);

    // 6. Reload and continue to verify PC persistence against preSaveSnapshot
    const pcReloadQL = await reloadAndContinue();

    const pcContinued = await ctx.runEval(`
      const C = await H.mod("/src/fr/generated/constants.ts");
      const sv = frDebug.save.save;
      const monIdentity = (m) => m ? ({
        species: m.species,
        personality: m.personality,
        otId: m.otId,
        moves: m.moves ? [...m.moves] : [],
        heldItem: m.heldItem
      }) : null;
      return {
        map: H.st().map,
        coords: { x: H.st().x, y: H.st().y },
        script: !!H.st().script,
        locked: !!H.st().locked,
        party: sv.party.filter(p => p.species).map(monIdentity),
        box0: sv.boxes[0].filter(m => m && m.species).map(monIdentity),
        bag: JSON.parse(JSON.stringify(sv.bag)),
        money: sv.money,
        savedGameStat: sv.gameStats[C.GAME_STAT_SAVED_GAME],
        fieldFree: H.fieldFree()
      };
    `);

    // Expected PC snapshot for comparison
    const pcExpectedSnapshot = {
      party: pcFlow.preSaveSnapshot.party,
      box0: pcFlow.preSaveSnapshot.box0,
      map: pcFlow.preSaveSnapshot.map,
      coords: pcFlow.preSaveSnapshot.coords,
      bag: pcFlow.preSaveSnapshot.bag,
      money: pcFlow.preSaveSnapshot.money,
      savedGameStat: pcSaveStats.statAfter
    };

    const pcObservedSnapshot = {
      party: pcContinued.party,
      box0: pcContinued.box0,
      map: pcContinued.map,
      coords: pcContinued.coords,
      bag: pcContinued.bag,
      money: pcContinued.money,
      savedGameStat: pcContinued.savedGameStat
    };

    // Assert that continue restored the exact pre-save state (order, coords, box, money, bag, map, savedGameStat)
    if (JSON.stringify(pcContinued.party) !== JSON.stringify(pcExpectedSnapshot.party)) {
      throw new Error("PC continue party mismatch: " + JSON.stringify({ got: pcContinued.party, expected: pcExpectedSnapshot.party }));
    }
    if (pcContinued.coords.x !== pcExpectedSnapshot.coords.x || pcContinued.coords.y !== pcExpectedSnapshot.coords.y) {
      throw new Error("PC continue coords mismatch: got " + JSON.stringify(pcContinued.coords) + ", expected " + JSON.stringify(pcExpectedSnapshot.coords));
    }
    if (pcContinued.map !== pcExpectedSnapshot.map) {
      throw new Error("PC continue map mismatch: got " + pcContinued.map + ", expected " + pcExpectedSnapshot.map);
    }
    if (JSON.stringify(pcContinued.bag) !== JSON.stringify(pcExpectedSnapshot.bag)) {
      throw new Error("PC continue bag mismatch: got " + JSON.stringify(pcContinued.bag) + ", expected " + JSON.stringify(pcExpectedSnapshot.bag));
    }
    if (pcContinued.box0.length !== 0) {
      throw new Error("PC continue box0 not empty: " + JSON.stringify(pcContinued.box0));
    }
    if (pcContinued.money !== pcExpectedSnapshot.money) {
      throw new Error("PC continue money mismatch: got " + pcContinued.money + ", expected " + pcExpectedSnapshot.money);
    }
    if (pcContinued.savedGameStat !== pcExpectedSnapshot.savedGameStat) {
      throw new Error("PC continue savedGameStat mismatch: got " + pcContinued.savedGameStat + ", expected " + pcExpectedSnapshot.savedGameStat);
    }
    if (!pcContinued.fieldFree) {
      throw new Error("PC continue field not free: " + JSON.stringify(pcContinued));
    }

    // =========================================================================
    // PARTE 2: Enfermera Joy (pewter) - Rechazo, Curación, Reglas C y Persistencia
    // Declaración: El fixture cubre 1 miembro del equipo (Bulbasaur).
    // =========================================================================
    const initialNurse = await ctx.loadSave("pewter");
    if (initialNurse.map !== "MAP_PEWTER_CITY_POKEMON_CENTER_1F") {
      throw new Error(`wrong Nurse initial map: ${JSON.stringify(initialNurse)}`);
    }

    const nurseFlow = await ctx.runEval(`
      const T = await H.mod("/src/fr/gba/tasks.ts");
      const C = await H.mod("/src/fr/generated/constants.ts");
      const sv = frDebug.save.save;
      const p = sv.party[0];

      const monIdentity = (m) => m ? ({
        species: m.species,
        personality: m.personality,
        otId: m.otId,
        moves: m.moves ? [...m.moves] : [],
        heldItem: m.heldItem
      }) : null;

      const initialPartyIdentity = sv.party.filter(m => m.species).map(monIdentity);

      // PREPARED damage, PP consumption, and poison status for 1 party member
      // Contract: HP reduced by 5, first non-empty PP reduced by 1, status = STATUS1_POISON (8).
      // Max HP is strictly preserved; final results are never prepared.
      p.hp = p.stats[0] - 5;
      const firstMoveIdx = p.moves.findIndex(m => m !== 0);
      p.pp[firstMoveIdx] = p.pp[firstMoveIdx] - 1;
      p.status = C.STATUS1_POISON;
      const preparedFixture = {
        hp: p.hp,
        maxHp: p.stats[0],
        pp: [...p.pp],
        status: p.status
      };

      const checkMC = () => T.tasks.tasks.some(t => t.isActive && t.func.name === "Task_MultichoiceMenu_HandleInput");

      // 1. REJECT TEST: Talk, advance prompt, select NO (cursor down + A)
      await frDebug.press("A"); // Talk to nurse
      await frDebug.wait(120);
      await frDebug.press("A"); // Advance \\p prompt
      for (let f = 0; f < 300 && !checkMC(); f += 5) await frDebug.wait(5);
      if (!checkMC()) throw new Error("Multichoice menu never appeared (reject test)");

      // Wait for sDelay to expire, then move cursor to NO
      await frDebug.wait(20);
      await frDebug.wait(4, 0x80); // DOWN to NO
      await frDebug.wait(30);
      await frDebug.press("A"); // Confirm NO
      await frDebug.wait(60);

      // Drain goodbye dialogue
      for (let i = 0; i < 15; i++) {
        if (!H.st().script && !H.st().locked) break;
        await frDebug.press("A");
        await frDebug.wait(30);
      }
      const afterReject = {
        st: H.st(),
        hp: p.hp,
        pp: [...p.pp],
        status: p.status,
        money: sv.money,
        fieldFree: H.fieldFree()
      };

      // Assert that rejection did NOT heal the Pokémon
      if (afterReject.hp !== preparedFixture.hp
          || JSON.stringify(afterReject.pp) !== JSON.stringify(preparedFixture.pp)
          || afterReject.status !== preparedFixture.status) {
        throw new Error("Nurse healed Pokémon on reject! " + JSON.stringify(afterReject));
      }
      if (!afterReject.fieldFree) {
        throw new Error("Control not returned after nurse reject: " + JSON.stringify(afterReject.st));
      }

      // 2. ACCEPT TEST: Talk again, advance prompt, select YES (cursor 0 + A)
      await frDebug.press("A"); // Talk to nurse again
      await frDebug.wait(120);
      await frDebug.press("A"); // Advance \\p prompt
      for (let f = 0; f < 300 && !checkMC(); f += 5) await frDebug.wait(5);
      if (!checkMC()) throw new Error("Multichoice menu never appeared (accept test)");

      // Press A on YES
      await frDebug.wait(20);
      await frDebug.press("A");
      await frDebug.wait(60);

      // Drain full healing sequence (Joy walks left, balls placed, sound/music, Joy walks down, bow, farewell)
      for (let i = 0; i < 40; i++) {
        if (!H.st().script && !H.st().locked) break;
        await frDebug.press("A");
        await frDebug.wait(30);
      }
      const afterAccept = {
        st: H.st(),
        hp: p.hp,
        maxHp: p.stats[0],
        pp: [...p.pp],
        status: p.status,
        money: sv.money,
        fieldFree: H.fieldFree()
      };

      if (!afterAccept.fieldFree) {
        throw new Error("Control not returned after nurse accept: " + JSON.stringify(afterAccept.st));
      }

      // 3. Verify C rules (HealPlayerParty / CalculatePPWithBonus) without TS helper oracle
      // C: HP = maxHP, status = 0, money unchanged.
      if (afterAccept.hp !== afterAccept.maxHp) {
        throw new Error("HP not restored to maxHP: " + JSON.stringify(afterAccept));
      }
      if (afterAccept.status !== 0) {
        throw new Error("Status not restored to 0: " + JSON.stringify(afterAccept));
      }
      if (afterAccept.money !== 2980) {
        throw new Error("Money changed by nurse: " + JSON.stringify(afterAccept));
      }

      // Independent C PP oracle from pokefirered/src/data/battle_moves.h
      const basePPByMove = { [C.MOVE_TACKLE]: 35, [C.MOVE_GROWL]: 40, [C.MOVE_LEECH_SEED]: 10, [C.MOVE_VINE_WHIP]: 10 };
      const expectedPP = [];
      for (let j = 0; j < 4; j++) {
        const move = p.moves[j];
        if (!move) {
          expectedPP.push(0);
          continue;
        }
        const basePP = basePPByMove[move];
        if (basePP === undefined) throw new Error("Move has no independent C PP oracle: " + move);
        const ppBonus = (p.ppBonuses >> (2 * j)) & 3;
        const calcPP = basePP + Math.floor((basePP * 20 * ppBonus) / 100);
        expectedPP.push(calcPP);
        if (p.pp[j] !== calcPP) {
          throw new Error("PP for move slot " + j + " (move " + move + ") mismatch: got " + p.pp[j] + ", expected " + calcPP);
        }
      }

      // Check team identity intact
      const finalPartyIdentity = sv.party.filter(m => m.species).map(monIdentity);
      if (JSON.stringify(finalPartyIdentity) !== JSON.stringify(initialPartyIdentity)) {
        throw new Error("Party identity altered during nurse healing");
      }

      // 4. Real step away from counter to (7, 6)
      const walkedNurse = await H.goto(7, 6);
      if (walkedNurse.note || walkedNurse.x !== 7 || walkedNurse.y !== 6) {
        throw new Error("Player could not move after nurse healing: " + JSON.stringify(walkedNurse));
      }

      const nursePreSaveSnapshot = {
        party: sv.party.filter(p => p.species).map(monIdentity),
        hp: p.hp,
        maxHp: p.stats[0],
        pp: [...p.pp],
        status: p.status,
        map: H.st().map,
        coords: { x: walkedNurse.x, y: walkedNurse.y },
        bag: JSON.parse(JSON.stringify(sv.bag)),
        money: sv.money
      };

      return {
        preparedFixture,
        afterReject,
        afterAccept,
        expectedPP,
        walkedNurse,
        nursePreSaveSnapshot
      };
    `);

    // 5. Save healed state via in-game Start Menu
    const nurseSaveStats = await ctx.runEval(saveViaStartMenu);

    // 6. Reload and continue to verify Nurse persistence against nursePreSaveSnapshot
    const nurseReloadQL = await reloadAndContinue();

    const nurseContinued = await ctx.runEval(`
      const C = await H.mod("/src/fr/generated/constants.ts");
      const sv = frDebug.save.save;
      const p = sv.party[0];
      const monIdentity = (m) => m ? ({
        species: m.species,
        personality: m.personality,
        otId: m.otId,
        moves: m.moves ? [...m.moves] : [],
        heldItem: m.heldItem
      }) : null;
      return {
        party: sv.party.filter(p => p.species).map(monIdentity),
        hp: p.hp,
        maxHp: p.stats[0],
        pp: [...p.pp],
        status: p.status,
        map: H.st().map,
        coords: { x: H.st().x, y: H.st().y },
        bag: JSON.parse(JSON.stringify(sv.bag)),
        money: sv.money,
        savedGameStat: sv.gameStats[C.GAME_STAT_SAVED_GAME],
        fieldFree: H.fieldFree()
      };
    `);

    // Expected Nurse snapshot for comparison
    const nurseExpectedSnapshot = {
      party: nurseFlow.nursePreSaveSnapshot.party,
      hp: nurseFlow.nursePreSaveSnapshot.maxHp,
      maxHp: nurseFlow.nursePreSaveSnapshot.maxHp,
      pp: nurseFlow.expectedPP,
      status: 0,
      map: nurseFlow.nursePreSaveSnapshot.map,
      coords: nurseFlow.nursePreSaveSnapshot.coords,
      bag: nurseFlow.nursePreSaveSnapshot.bag,
      money: nurseFlow.nursePreSaveSnapshot.money,
      savedGameStat: nurseSaveStats.statAfter
    };

    const nurseObservedSnapshot = {
      party: nurseContinued.party,
      hp: nurseContinued.hp,
      maxHp: nurseContinued.maxHp,
      pp: nurseContinued.pp,
      status: nurseContinued.status,
      map: nurseContinued.map,
      coords: nurseContinued.coords,
      bag: nurseContinued.bag,
      money: nurseContinued.money,
      savedGameStat: nurseContinued.savedGameStat
    };

    if (JSON.stringify(nurseContinued.party) !== JSON.stringify(nurseExpectedSnapshot.party)) {
      throw new Error("Nurse continue party mismatch: " + JSON.stringify({ got: nurseContinued.party, expected: nurseExpectedSnapshot.party }));
    }
    if (nurseContinued.coords.x !== nurseExpectedSnapshot.coords.x || nurseContinued.coords.y !== nurseExpectedSnapshot.coords.y) {
      throw new Error("Nurse continue coords mismatch: got " + JSON.stringify(nurseContinued.coords) + ", expected " + JSON.stringify(nurseExpectedSnapshot.coords));
    }
    if (nurseContinued.map !== nurseExpectedSnapshot.map) {
      throw new Error("Nurse continue map mismatch: got " + nurseContinued.map + ", expected " + nurseExpectedSnapshot.map);
    }
    if (JSON.stringify(nurseContinued.bag) !== JSON.stringify(nurseExpectedSnapshot.bag)) {
      throw new Error("Nurse continue bag mismatch: got " + JSON.stringify(nurseContinued.bag) + ", expected " + JSON.stringify(nurseExpectedSnapshot.bag));
    }
    if (nurseContinued.money !== nurseExpectedSnapshot.money) {
      throw new Error("Nurse continue money mismatch: got " + nurseContinued.money + ", expected " + nurseExpectedSnapshot.money);
    }
    if (nurseContinued.savedGameStat !== nurseExpectedSnapshot.savedGameStat) {
      throw new Error("Nurse continue savedGameStat mismatch: got " + nurseContinued.savedGameStat + ", expected " + nurseExpectedSnapshot.savedGameStat);
    }
    if (nurseContinued.hp !== nurseExpectedSnapshot.maxHp || nurseContinued.status !== nurseExpectedSnapshot.status) {
      throw new Error("Nurse continue healed stats corrupted: " + JSON.stringify(nurseContinued));
    }
    if (JSON.stringify(nurseContinued.pp) !== JSON.stringify(nurseExpectedSnapshot.pp)) {
      throw new Error("Nurse continue PP mismatch: " + JSON.stringify({ got: nurseContinued.pp, expected: nurseExpectedSnapshot.pp }));
    }
    if (!nurseContinued.fieldFree) {
      throw new Error("Nurse continue field not free: " + JSON.stringify(nurseContinued));
    }

    if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);

    return {
      status: "PASS",
      pc: {
        checkpoint: "pewter-pc",
        sha256: "e2f7bf7cee99b071e81ef9e5d4fdc3abf66fb0cf870e154843162b7861485fe8",
        entry: pcFlow.entry,
        depositBox0: pcFlow.afterDepositWork.box0,
        syncedParty: pcFlow.syncedParty,
        restoredParty: pcFlow.restoredParty,
        hasParentMenuOnExit: pcFlow.hasParentMenu,
        activeTasksAfterExit: pcFlow.activeTasksAfterExit,
        walkedPosition: pcFlow.walkedPosition,
        saveStats: pcSaveStats,
        questLog: pcReloadQL,
        expectedSnapshot: pcExpectedSnapshot,
        observedSnapshot: pcObservedSnapshot,
        continued: pcContinued
      },
      nurse: {
        checkpoint: "pewter",
        sha256: "6aa2386b7bb60b3e783dfe34503d97e6d20b50638f46cc9ea9e766ef007a8509",
        scope: "Fixture covers 1 party member (Bulbasaur). Multi-party healing is not tested without a dedicated contract.",
        preparedFixture: nurseFlow.preparedFixture,
        afterReject: nurseFlow.afterReject,
        afterAccept: nurseFlow.afterAccept,
        cRulesChecked: {
          hpEqualsMaxHp: nurseFlow.afterAccept.hp === nurseFlow.afterAccept.maxHp,
          statusZero: nurseFlow.afterAccept.status === 0,
          ppMatchesCalculatePPWithBonus: JSON.stringify(nurseFlow.afterAccept.pp) === JSON.stringify(nurseFlow.expectedPP),
          moneyUnchanged: nurseFlow.afterAccept.money === 2980
        },
        walkedNurse: nurseFlow.walkedNurse,
        saveStats: nurseSaveStats,
        questLog: nurseReloadQL,
        expectedSnapshot: nurseExpectedSnapshot,
        observedSnapshot: nurseObservedSnapshot,
        continued: nurseContinued
      },
      limits: [
        "Audio / visual listening and pixel-perfect rendering parities have separate evidence and are not asserted by HP/PP checks.",
        "Damage, PP consumption and poison status for nurse validation were prepared in memory as declared PREPARED fixtures without modifying repository saves.",
        "The nurse fixture covers 1 party member. Multi-member healing scope is excluded until specified by a dedicated contract.",
        "Bug 1.18 (MOVE ITEMS on empty box) is isolated and reproduced in a separate dedicated check to avoid crashing the standard PC storage flow."
      ]
    };
  } catch (error) {
    if (!String(error).includes("C8-stuck")) await ctx.shot("C8-failure");
    throw error;
  }
}
