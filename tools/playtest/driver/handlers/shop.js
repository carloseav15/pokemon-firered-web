// Poke Mart buy flow (shop.ts): clerk menu, buy list (ListMenu row read from the list), quantity prompt, YES/NO.
// Goal { kind: "buy", item, quantity, count0, bought }.
const G = (ctx) => ctx.goal?.kind === "buy" ? ctx.goal : null;
// Without a buy goal a shop screen is only backed out of (cleanup / exploring menus); otherwise it needs a decision.
const backOut = async (ctx, screen) => {
  if (!ctx.state.exitMenus) return { stop: "input-required" };
  await ctx.input("B", { expect: (r) => r.screen !== screen, within: 600, retry: 2, label: "back out of " + screen }); // input: shop
};

export const shopHandlers = {
  "shop-menu": async (ctx) => {
    const g = G(ctx);
    if (!g) return backOut(ctx, "shop-menu");
    if (g.bought) { await ctx.input("B", { expect: (r) => r.screen !== "shop-menu", within: 400, retry: 1, label: "leave the shop menu" }); return; } // input: shop-menu
    // BUY is the first entry of the fresh BUY/SELL/QUIT menu; a wrong entry (SELL) is caught by the postcondition.
    await ctx.input("A", { expect: (r) => r.screen !== "shop-menu", fail: (r) => /Sell/.test(r.raw?.cb2 ?? "") ? "wrong-shop-entry" : null, within: 600, retry: 1, label: "BUY" }); // input: shop-menu
  },

  "shop-list": async (ctx, rec) => {
    const g = G(ctx), H = ctx.H;
    if (!g) return backOut(ctx, "shop-list");
    if (g.bought || H.countItem(g.item) >= g.count0 + g.quantity) {
      g.bought = true;
      await ctx.input("B", { expect: (r) => r.screen !== "shop-list", within: 600, retry: 1, label: "leave the buy list" }); // input: shop-list
      return;
    }
    const want = rec.details.items.indexOf(g.item);
    if (want < 0) return { stop: "item-not-in-the-buy-list", info: { items: rec.details.items } };
    const read = () => H.recognize().details.cursor;
    await ctx.cursorTo(want, read, (cur, w) => ({ button: cur < w ? "D" : "U" }), { limit: 40 });
    await ctx.input("A", { expect: (r) => r.screen !== "shop-list", within: 300, retry: 1, label: "choose the item" }); // input: shop-list
  },

  "shop-quantity": async (ctx, rec) => {
    const g = G(ctx), H = ctx.H;
    if (!g) return backOut(ctx, "shop-quantity");
    if (rec.details.item !== g.item) {
      await ctx.input("B", { expect: (r) => r.screen !== "shop-quantity", within: 300, label: "wrong item: back" }); // input: shop-quantity
      return { stop: "wrong-item-in-quantity-prompt", info: { item: rec.details.item, wanted: g.item } };
    }
    const q = () => H.recognize().details.quantity;
    if (q() !== g.quantity) { await ctx.cursorTo(g.quantity, q, (cur, w) => ({ button: cur < w ? "U" : "D" }), { limit: 120 }); return; }
    await ctx.input("A", { expect: (r) => r.screen !== "shop-quantity", within: 300, retry: 1, label: "confirm quantity" }); // input: shop-quantity
  },

  "shop-confirm": async (ctx) => {
    const g = G(ctx), H = ctx.H;
    if (!g) return backOut(ctx, "shop-confirm");
    await ctx.cursorTo(0, () => H.MENU.Menu_GetCursorPos(), () => ({ button: "U" }));
    await ctx.input("A", { expect: (r) => r.screen !== "shop-confirm", within: 300, retry: 1, label: "YES" }); // input: shop-confirm
  },

  "shop-message": async (ctx, rec) => {
    if (rec.details.waitingButton) { await ctx.input("A", { expect: (r) => r.screen !== "shop-message" || !r.details.waitingButton, within: 300, label: "Here you are" }); return; } // input: shop-message
    await ctx.wait(4);
  },
};
