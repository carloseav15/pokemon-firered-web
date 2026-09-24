// Field adapter for the shop transaction states. The source hardware shop
// presentation and quest-log transaction history remain separate port work.
import type { Game } from "../game";
import { ShopModel } from "./shopModel";
import { decode, encode } from "../gba/charmap";
import { joy, A_BUTTON, B_BUTTON, DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT } from "../gba/input";
import { tasks } from "../gba/tasks";
import { printText } from "../gba/textPrinter";
import { FONT_NORMAL } from "../gba/font";
import { itemName, pocketList } from "../pokemon/items";
import { save } from "../save";
import { sound } from "../audio/sound";

export function openShopMenu(game: Game, pointer: number): void {
  const model = new ShopModel(pointer);
  const win = game.scriptMenu.createFramedWindow(0, 0, 28, 18);
  let state: "main" | "list" | "quantity" | "confirm" | "message" = "main";
  let cursor = 0, scroll = 0, quantity = 1, item = 0, yes = true;
  let selling = false, message = "";
  const entries = (): number[] => selling ? [1, 2, 3, 4, 5].flatMap(p => pocketList(p).map(slot => slot.item)) : model.stock;
  const draw = (): void => {
    win.fill(1);
    const line = (str: string, y: number) => printText(win, FONT_NORMAL, encode(str), 6, y);
    line(`MONEY  $${save.money}`, 0);
    if (state === "main") {
      ["BUY", "SELL", "SEE YA!"].forEach((label, i) => line(`${cursor === i ? ">" : " "} ${label}`, 24 + i * 16));
    } else if (state === "list") {
      const list = entries();
      if (cursor < scroll) scroll = cursor;
      if (cursor >= scroll + 6) scroll = cursor - 5;
      for (let row = 0; row < 6 && scroll + row <= list.length; row++) {
        const i = scroll + row;
        const label = i === list.length ? "CANCEL" : `${decode(itemName(list[i]))}  $${model.price(list[i], selling)}`;
        line(`${cursor === i ? ">" : " "} ${label}`, 24 + row * 16);
      }
    } else if (state === "quantity" || state === "confirm") {
      line(decode(itemName(item)), 24);
      line(`QUANTITY  ${quantity}`, 44);
      line(`TOTAL  $${quantity * model.price(item, selling)}`, 64);
      line(state === "quantity" ? "How many?" : selling ? "Sell these items?" : "Buy these items?", 86);
      if (state === "confirm") line(yes ? "> YES    NO" : "  YES  > NO", 106);
    } else line(message, 28);
  };
  const backToList = (): void => { state = "list"; cursor = Math.min(cursor, entries().length); };
  draw();
  const task = tasks.create(() => {
    const pressed = joy.newKeys, repeated = joy.repeated;
    if (state === "main") {
      if (pressed & B_BUTTON || (pressed & A_BUTTON && cursor === 2)) {
        game.scriptMenu.removeWindow(win); tasks.destroy(task); game.overworld.script.enable(); return;
      }
      if (repeated & DPAD_UP) cursor = (cursor + 2) % 3;
      else if (repeated & DPAD_DOWN) cursor = (cursor + 1) % 3;
      else if (pressed & A_BUTTON) { selling = cursor === 1; state = "list"; cursor = scroll = 0; }
    } else if (state === "list") {
      const list = entries();
      if (pressed & B_BUTTON || (pressed & A_BUTTON && cursor === list.length)) { state = "main"; cursor = selling ? 1 : 0; }
      else if (repeated & DPAD_UP) cursor = Math.max(0, cursor - 1);
      else if (repeated & DPAD_DOWN) cursor = Math.min(list.length, cursor + 1);
      else if (pressed & A_BUTTON) {
        item = list[cursor]; quantity = 1;
        const max = model.maxQuantity(item, selling);
        if (!max) { state = "message"; message = selling ? "I can't buy that." : "You don't have enough money."; }
        else state = "quantity";
      }
    } else if (state === "quantity") {
      const max = model.maxQuantity(item, selling);
      if (pressed & B_BUTTON) backToList();
      else if (pressed & A_BUTTON) { state = "confirm"; yes = true; }
      else if (repeated & DPAD_UP) quantity = quantity >= max ? 1 : quantity + 1;
      else if (repeated & DPAD_DOWN) quantity = quantity <= 1 ? max : quantity - 1;
      else if (repeated & DPAD_RIGHT) quantity = Math.min(max, quantity + 10);
      else if (repeated & DPAD_LEFT) quantity = Math.max(1, quantity - 10);
    } else if (state === "confirm") {
      if (pressed & B_BUTTON) backToList();
      else if (repeated & (DPAD_UP | DPAD_DOWN | DPAD_LEFT | DPAD_RIGHT)) yes = !yes;
      else if (pressed & A_BUTTON) {
        if (!yes) backToList();
        else {
          const result = selling ? model.sell(item, quantity) : model.buy(item, quantity);
          message = result === "ok" ? "Thank you!" : result === "noRoom" ? "There is no more room in the BAG." : result === "noMoney" ? "You don't have enough money." : "That transaction isn't available.";
          if (result === "ok") sound.playSE(sound.c("SE_SHOP"));
          state = "message";
        }
      }
    } else if (pressed & (A_BUTTON | B_BUTTON)) backToList();
    if (pressed || repeated) draw();
  }, 80);
}
