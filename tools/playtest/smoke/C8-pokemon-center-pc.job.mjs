export default async function run(ctx) {
  const BASE = process.env.PW_BASE ?? "http://localhost:5173/";

  const reloadAndContinue = async () => {
    await ctx.page.goto(`${BASE}?fr=continue`, { waitUntil: "load" });
    await ctx.page.waitForTimeout(3000);
    for (let i = 0; ; i++) {
      try {
        await ctx.page.evaluate(`(async () => {
          const { H } = await import("/tools/playtest/driver.js");
          window.H = H;
          return await H.ready();
        })();`);
        break;
      } catch (e) {
        if (i >= 5) throw e;
        await ctx.page.waitForTimeout(2000);
      }
    }
  };

  const saveViaStartMenuInBrowser = `
    const T = await H.mod("/src/fr/gba/tasks.ts");
    const checkSM = () => T.tasks.tasks.some(t => t.isActive && (t.func.name === "startInput" || t.func.name === "Task_StartMenuHandleInput"));
    const checkYesNo = () => T.tasks.tasks.some(t => t.isActive && t.func.name === "Task_YesNoMenu_HandleInput");

    await frDebug.wait(30);
    await frDebug.press("START");
    await frDebug.wait(40);
    if (!checkSM()) throw new Error("Start menu did not open");

    // Move to SAVE (index 4)
    for (let i = 0; i < 4; i++) {
      await frDebug.wait(4, 0x80);
      await frDebug.wait(20);
    }
    await frDebug.press("A"); // Select SAVE

    // 1. Wait for YesNo 1 ("Would you like to save the game?")
    for (let f = 0; f < 300 && !checkYesNo(); f += 5) await frDebug.wait(5);
    if (!checkYesNo()) throw new Error("Save confirmation prompt never appeared");
    await frDebug.wait(10);
    await frDebug.press("A"); // Confirm save

    // 2. Wait for YesNo 1 to disappear
    for (let f = 0; f < 100 && checkYesNo(); f += 5) await frDebug.wait(5);

    // 3. Wait for YesNo 2 (overwrite) if an existing save is present
    let yn2Appeared = false;
    for (let f = 0; f < 300; f += 5) {
      if (checkYesNo()) { yn2Appeared = true; break; }
      if (!checkSM()) break;
      await frDebug.wait(5);
    }
    if (yn2Appeared) {
      await frDebug.wait(10);
      await frDebug.press("A"); // Confirm overwrite
      for (let f = 0; f < 100 && checkYesNo(); f += 5) await frDebug.wait(5);
    }

    // 4. Wait cleanly for save completion without pressing buttons
    for (let f = 0; f < 400; f += 5) {
      const s = H.st();
      if (!s.script && !s.locked && !checkSM() && !checkYesNo()) break;
      await frDebug.wait(5);
    }

    const s = H.st();
    if (s.script || s.locked || checkSM() || checkYesNo()) {
      throw new Error("Controls not returned after saving from Start Menu: " + JSON.stringify(s));
    }
  `;

  try {
    // =========================================================================
    // PARTE 1: PC (pewter-pc) - Depósito, Retiro, Identidad y Persistencia
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

      // 1. Confirm initial state
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
        throw new Error("unexpected PC initial party species: " + JSON.stringify(R.entry.party));
      }

      if (!await toMenu()) throw new Error("PC main menu never opened");

      // 2. DEPOSIT Bulbasaur (slot 0) into box 0
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

      // 3. WITHDRAW Bulbasaur back
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

      // Check restored identities
      const restoredBulbasaur = R.restoredParty.find(p => p.species === 1);
      const restoredPidgey = R.restoredParty.find(p => p.species === 16);
      if (!restoredBulbasaur || !restoredPidgey) {
        throw new Error("missing restored mon in party: " + JSON.stringify(R.restoredParty));
      }
      if (restoredBulbasaur.personality !== R.entry.party[0].personality
          || restoredBulbasaur.otId !== R.entry.party[0].otId
          || JSON.stringify(restoredBulbasaur.moves) !== JSON.stringify(R.entry.party[0].moves)
          || restoredBulbasaur.heldItem !== R.entry.party[0].heldItem) {
        throw new Error("Bulbasaur identity corrupted after withdraw: " + JSON.stringify({
          initial: R.entry.party[0],
          restored: restoredBulbasaur
        }));
      }

      // 4. Leave PC back to field
      for (let i = 0; i < 6; i++) {
        await frDebug.press("B"); await frDebug.wait(150);
        const s = H.st();
        if (!s.script && !s.locked) break;
      }
      const s = H.st();
      R.leftField = { map: s.map, script: !!s.script, locked: !!s.locked };
      if (R.leftField.script || R.leftField.locked || R.leftField.map !== "MAP_PEWTER_CITY_POKEMON_CENTER_1F") {
        throw new Error("did not return to field after PC: " + JSON.stringify(R.leftField));
      }

      return R;
    `);

    // 5. Save PC state via in-game Start Menu
    await ctx.runEval(saveViaStartMenuInBrowser);

    // 6. Reload and continue to verify PC persistence
    await reloadAndContinue();

    const pcPersisted = await ctx.runEval(`
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
        money: sv.money
      };
    `);

    if (pcPersisted.party.length !== 2 || pcPersisted.box0.length !== 0) {
      throw new Error("PC persistence failed: party or box0 corrupted: " + JSON.stringify(pcPersisted));
    }
    const persistedBulbasaur = pcPersisted.party.find(p => p.species === 1);
    const persistedPidgey = pcPersisted.party.find(p => p.species === 16);
    if (!persistedBulbasaur || !persistedPidgey) {
      throw new Error("PC persistence failed: missing mon: " + JSON.stringify(pcPersisted.party));
    }
    if (persistedBulbasaur.personality !== pcFlow.entry.party[0].personality
        || persistedBulbasaur.otId !== pcFlow.entry.party[0].otId
        || JSON.stringify(persistedBulbasaur.moves) !== JSON.stringify(pcFlow.entry.party[0].moves)
        || persistedBulbasaur.heldItem !== pcFlow.entry.party[0].heldItem) {
      throw new Error("PC persistence failed: Bulbasaur identity mismatch: " + JSON.stringify(persistedBulbasaur));
    }

    // =========================================================================
    // PARTE 2: Enfermera Joy (pewter) - Rechazo, Curación, Reglas C y Persistencia
    // =========================================================================
    const initialNurse = await ctx.loadSave("pewter");
    if (initialNurse.map !== "MAP_PEWTER_CITY_POKEMON_CENTER_1F") {
      throw new Error(`wrong Nurse initial map: ${JSON.stringify(initialNurse)}`);
    }

    const nurseFlow = await ctx.runEval(`
      const T = await H.mod("/src/fr/gba/tasks.ts");
      const { varGet } = await H.mod("/src/fr/save.ts");
      const { rom } = await H.mod("/src/fr/rom.ts");
      const sv = frDebug.save.save;
      const p = sv.party[0];

      // Initial checks
      const initialMon = {
        species: p.species,
        level: p.level,
        hp: p.hp,
        maxHp: p.stats[0],
        moves: [...p.moves],
        pp: [...p.pp],
        status: p.status,
        money: sv.money
      };

      // PREPARED damage, PP consumption, and poison status
      // Contract: HP reduced by 5, first non-empty PP reduced by 1, status = STATUS1_POISON (8).
      // Max HP is strictly preserved; final results are never prepared.
      p.hp = initialMon.maxHp - 5;
      const firstMoveIdx = p.moves.findIndex(m => m !== 0);
      p.pp[firstMoveIdx] = p.pp[firstMoveIdx] - 1;
      p.status = 8; // STATUS1_POISON
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
        money: sv.money
      };

      // Assert that rejection did NOT heal the Pokémon
      if (afterReject.hp !== preparedFixture.hp
          || JSON.stringify(afterReject.pp) !== JSON.stringify(preparedFixture.pp)
          || afterReject.status !== preparedFixture.status) {
        throw new Error("Nurse healed Pokémon on reject! " + JSON.stringify(afterReject));
      }
      if (afterReject.st.script || afterReject.st.locked) {
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

      // Drain full healing sequence (Joy walks left, balls placed, music/sound, Joy walks down, bow, farewell)
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
        money: sv.money
      };

      if (afterAccept.st.script || afterAccept.st.locked) {
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
      if (afterAccept.money !== initialMon.money) {
        throw new Error("Money changed by nurse: " + JSON.stringify(afterAccept));
      }

      // Verify each move PP against C formula: basePP + floor(basePP * 20 * bonus / 100)
      const expectedPP = [];
      for (let j = 0; j < 4; j++) {
        const move = p.moves[j];
        if (!move) {
          expectedPP.push(0);
          continue;
        }
        const basePP = rom.moves[move].pp;
        const ppBonus = (p.ppBonuses >> (2 * j)) & 3;
        const calcPP = basePP + Math.floor((basePP * 20 * ppBonus) / 100);
        expectedPP.push(calcPP);
        if (p.pp[j] !== calcPP) {
          throw new Error("PP for move slot " + j + " (move " + move + ") mismatch: got " + p.pp[j] + ", expected " + calcPP);
        }
      }

      return {
        initialMon,
        preparedFixture,
        afterReject,
        afterAccept,
        expectedPP
      };
    `);

    // 4. Save healed state via in-game Start Menu
    await ctx.runEval(saveViaStartMenuInBrowser);

    // 5. Reload and continue to verify Nurse persistence
    await reloadAndContinue();

    const nursePersisted = await ctx.runEval(`
      const sv = frDebug.save.save;
      const p = sv.party[0];
      return {
        map: H.st().map,
        coords: { x: H.st().x, y: H.st().y },
        script: !!H.st().script,
        locked: !!H.st().locked,
        hp: p.hp,
        maxHp: p.stats[0],
        pp: [...p.pp],
        status: p.status,
        money: sv.money
      };
    `);

    if (nursePersisted.hp !== nursePersisted.maxHp
        || nursePersisted.status !== 0
        || JSON.stringify(nursePersisted.pp) !== JSON.stringify(nurseFlow.expectedPP)) {
      throw new Error("Nurse persistence failed: healed state corrupted after continue: " + JSON.stringify(nursePersisted));
    }

    if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);

    return {
      status: "PASS",
      pc: {
        checkpoint: "pewter-pc",
        sha256: "e2f7bf7cee99b071e81ef9e5d4fdc3abf66fb0cf870e154843162b7861485fe8",
        entry: pcFlow.entry,
        afterDeposit: {
          workParty: pcFlow.afterDepositWork.workParty,
          box0: pcFlow.afterDepositWork.box0,
          syncedParty: pcFlow.syncedParty
        },
        afterWithdraw: {
          workParty: pcFlow.afterWithdrawWork.workParty,
          box0: pcFlow.afterWithdrawWork.box0,
          restoredParty: pcFlow.restoredParty
        },
        leftField: pcFlow.leftField,
        persisted: pcPersisted
      },
      nurse: {
        checkpoint: "pewter",
        sha256: "6aa2386b7bb60b3e783dfe34503d97e6d20b50638f46cc9ea9e766ef007a8509",
        initial: nurseFlow.initialMon,
        preparedFixture: nurseFlow.preparedFixture,
        afterReject: nurseFlow.afterReject,
        afterAccept: nurseFlow.afterAccept,
        cRulesChecked: {
          hpEqualsMaxHp: nurseFlow.afterAccept.hp === nurseFlow.afterAccept.maxHp,
          statusZero: nurseFlow.afterAccept.status === 0,
          ppMatchesCalculatePPWithBonus: JSON.stringify(nurseFlow.afterAccept.pp) === JSON.stringify(nurseFlow.expectedPP),
          moneyUnchanged: nurseFlow.afterAccept.money === nurseFlow.initialMon.money
        },
        persisted: nursePersisted
      },
      limits: [
        "Audio / visual listening and pixel-perfect rendering parities have separate evidence and are not asserted by HP/PP checks.",
        "Damage, PP consumption and poison status for nurse validation were prepared in memory as declared PREPARED fixtures without modifying repository saves.",
        "Bug 1.18 (MOVE ITEMS on empty box) is isolated and reproduced in a separate dedicated check to avoid crashing the standard PC storage flow."
      ]
    };
  } catch (error) {
    if (!String(error).includes("C8-stuck")) await ctx.shot("C8-failure");
    throw error;
  }
}
