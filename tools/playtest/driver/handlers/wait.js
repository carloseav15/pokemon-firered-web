// Screens that run by themselves and accept no input: the driver only lets frames pass. A wait that never changes
// the game's fingerprint is stopped by the loop ("stuck"), with the dump of the state.
export const waiting = (frames = 4) => async (ctx) => { await ctx.wait(frames); };

export const waitHandlers = {
  "field-busy": waiting(), "map-loading": waiting(), "loading-screen": waiting(), "battle-transition": waiting(),
  "battle-busy": waiting(), "quest-log": waiting(), "save-busy": waiting(), "shop-loading": waiting(), "tm-case-closing": waiting(),
};

// Item-use animation: runs by itself; at its last step it waits for A/B (Task_UseItem_Normal state 12), which is the only press.
waitHandlers["item-use-animation"] = async (ctx, rec) => {
  if (!rec.details.waitingButton) { await ctx.wait(4); return; }
  await ctx.input("A", { expect: (r) => r.screen !== "item-use-animation" || !r.details.waitingButton, within: 300, label: "leave item animation" }); // input: item-use-animation
};
