export default async function run(ctx) {
  try {
    const initial = await ctx.loadSave("pewter-pc");
    if (initial.map !== "MAP_PEWTER_CITY_POKEMON_CENTER_1F") throw new Error(`wrong checkpoint: ${JSON.stringify(initial)}`);
    // EventScript_PC first shows the boot message, then asks which PC to access.
    // The PC main menu cursor starts at WITHDRAW; D-pad needs raw bits here
    // (frDebug.press only maps A/B/START/SELECT) and single batches to step once.
    const flow = await ctx.runEval(`
      const T = await H.mod("/src/fr/gba/tasks.ts");
      const M = await H.mod("/src/fr/storageSystemInternal.ts");
      const sv = frDebug.save.save;
      const R = {};
      const names = () => T.tasks.tasks.filter(t => t.isActive).map(t => t.func.name);
      const counts = () => ({ party: sv.party.filter(p => p.species).map(p => p.species),
        box0: sv.boxes[0].filter(m => m && m.species).map(m => m.species),
        work: M.sParty.filter(p => p.species).map(p => p.species) });
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
      R.entry = counts();
      if (JSON.stringify([...R.entry.party].sort()) !== "[1,16]" || R.entry.box0.length !== 0)
        throw new Error("unexpected fixture state: " + JSON.stringify(R.entry));
      if (!await toMenu()) throw new Error("PC main menu never opened");
      // DEPOSIT Bulbasaur (party slot 0) into box 0.
      if (await setCursor(1) !== 1) throw new Error("could not move to DEPOSIT");
      await frDebug.press("A"); await frDebug.wait(250);
      await frDebug.press("A"); await frDebug.wait(150);
      await frDebug.press("A"); await frDebug.wait(150);
      await frDebug.press("A"); await frDebug.wait(400);
      R.afterStore = { tasks: names(), ...counts() };
      if (JSON.stringify(R.afterStore.work) !== "[16]") throw new Error("deposit did not move Bulbasaur out of the working party: " + JSON.stringify(R.afterStore));
      if (JSON.stringify(R.afterStore.box0) !== "[1]") throw new Error("deposit did not land in box 0: " + JSON.stringify(R.afterStore));
      if (!await backToMenu()) throw new Error("did not return to the PC menu after deposit");
      R.synced = counts();
      if (JSON.stringify(R.synced.party) !== "[16]") throw new Error("save party not synced after deposit: " + JSON.stringify(R.synced));
      // WITHDRAW it back.
      if (await setCursor(0) !== 0) throw new Error("could not move to WITHDRAW");
      await frDebug.press("A"); await frDebug.wait(250);
      await frDebug.press("A"); await frDebug.wait(150);
      await frDebug.press("A"); await frDebug.wait(300);
      R.withdrew = { tasks: names(), ...counts() };
      if (R.withdrew.box0.length !== 0) throw new Error("withdraw did not empty box 0: " + JSON.stringify(R.withdrew));
      if (JSON.stringify([...R.withdrew.work].sort()) !== "[1,16]") throw new Error("withdraw did not restore the working party: " + JSON.stringify(R.withdrew));
      if (!await backToMenu()) throw new Error("did not return to the PC menu after withdraw");
      R.restored = counts();
      if (JSON.stringify([...R.restored.party].sort()) !== "[1,16]") throw new Error("save party not restored: " + JSON.stringify(R.restored));
      if (R.restored.box0.length !== 0) throw new Error("save box not restored: " + JSON.stringify(R.restored));
      // Leave the PC back to the field.
      for (let i = 0; i < 6; i++) {
        await frDebug.press("B"); await frDebug.wait(150);
        const s = H.st();
        if (!s.script && !s.locked) break;
      }
      const s = H.st();
      R.left = { map: s.map, script: !!s.script, locked: !!s.locked };
      if (R.left.script || R.left.locked || R.left.map !== "MAP_PEWTER_CITY_POKEMON_CENTER_1F") throw new Error("did not return to the field: " + JSON.stringify(R.left));
      return R;`);
    if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
    return { ...flow, manual: "deposit/withdraw verified with real presses; nurse healing still unverified." };
  } catch (error) {
    if (!String(error).includes("C8-pc-stuck")) await ctx.shot("C8-failure");
    throw error;
  }
}
