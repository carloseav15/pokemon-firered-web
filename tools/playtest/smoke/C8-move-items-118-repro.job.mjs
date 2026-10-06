export default async function run(ctx) {
  await ctx.loadSave("pewter-pc");

  const repro = await ctx.runEval(`
    const T = await H.mod("/src/fr/gba/tasks.ts");
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
      for (let i = 0; i < 15 && cur() !== want; i++) {
        const c = cur();
        await frDebug.wait(4, c !== null && c < want ? 0x80 : 0x40); await frDebug.wait(30);
      }
      return cur();
    };

    if (!await toMenu()) throw new Error("PC main menu never opened");
    const cur = await setCursor(3); // OPTION_MOVE_ITEMS = 3
    if (cur !== 3) throw new Error("Failed to move to MOVE ITEMS, current cursor: " + cur);

    // Try pressing A on MOVE ITEMS with empty box 0
    try {
      await frDebug.press("A");
      await frDebug.wait(200);
      return { crashed: false };
    } catch (e) {
      return {
        crashed: true,
        errorName: e?.name,
        errorMessage: e?.message,
        errorStack: String(e?.stack ?? e).split("\\n").slice(0, 8).join("\\n")
      };
    }
  `);

  return {
    item: "1.18 MOVE ITEMS con caja vacía",
    reproductionConfirmed: repro.crashed,
    evidence: repro
  };
}
