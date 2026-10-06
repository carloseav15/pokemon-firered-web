// PREPARED input: the script Yes/No menu is opened by calling ScriptMenu_YesNo (no script context exists in this
// field state). It tests only that H.answerYesNo answers the observed menu by key input and VAR_RESULT follows
// (YES=1, NO=0); no story event, item or flag is involved. Also checks refusal without a menu.
export default async function(ctx) {
  await ctx.loadSave('mtmoon-1f');
  const result = await ctx.runEval(`
    const SM = await H.mod("/src/fr/menus/scriptMenu.ts"), S = await H.mod("/src/fr/save.ts");
    const none = await H.answerYesNo(true);
    if (none.ok !== false || none.reason !== "no-yes-no-menu") throw new Error("answered without a menu: " + JSON.stringify(none));
    let bad = null; try { await H.answerYesNo("yes"); } catch (e) { bad = String(e.message); }
    if (!bad) throw new Error("non-boolean answer accepted");
    const out = {};
    for (const yes of [true, false]) {
      SM.ScriptMenu_YesNo();
      await H.wait(2);
      if (H.observe().phase !== "choice") throw new Error("menu not observed: " + JSON.stringify(H.observe()));
      const r = await H.answerYesNo(yes);
      if (!r.ok) throw new Error("answer failed: " + JSON.stringify(r));
      out[yes ? "yes" : "no"] = { answered: r.answered, result: S.varGet(S.SV.RESULT) };
      if (out[yes ? "yes" : "no"].result !== (yes ? 1 : 0)) throw new Error("VAR_RESULT mismatch: " + JSON.stringify(out));
    }
    return { out, none, bad, limits: ["PREPARED menu; key handling only, no story event"] };
  `);
  if (ctx.errors().length) throw new Error(ctx.errors().join('; '));
  return result;
}
