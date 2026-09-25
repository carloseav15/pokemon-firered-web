// Field adapter for the shop transaction states. The item list runs on the
// shared ListMenu port (shop.c BuyMenuPrintPriceInList prices, scroll arrows
// at x 160); the source hardware buy screen (map view, item icon and
// description boxes) and quest-log transaction history remain separate work.
import type { Game } from "../game";
import { ShopModel } from "./shopModel";
import { decode, encode, expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { Window } from "../gba/window";
import { rom } from "../rom";
import {
  DestroyListMenuTask, LIST_CANCEL, LIST_NO_MULTIPLE_SCROLL, LIST_NOTHING_CHOSEN, ListMenu_ProcessInput, ListMenuDefaultCursorMoveFunc,
  ListMenuGetScrollAndRow, ListMenuInitOnSurface, listMenuTemplate, SCROLL_ARROW_UP,
} from "../hw/listMenu";
import { addFieldScrollArrows, fieldListSurface } from "./fieldListMenu";
import { joy, A_BUTTON, B_BUTTON, DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT } from "../gba/input";
import { tasks } from "../gba/tasks";
import { printText } from "../gba/textPrinter";
import { FONT_NORMAL, FONT_SMALL } from "../gba/font";
import { itemName, pocketList } from "../pokemon/items";
import { save } from "../save";
import { sound } from "../audio/sound";

export function openShopMenu(game: Game, pointer: number): void {
  const model = new ShopModel(pointer);
  const win = game.scriptMenu.createFramedWindow(0, 0, 28, 18);
  let state: "main" | "list" | "quantity" | "confirm" | "message" = "main";
  let cursor = 0, quantity = 1, item = 0, yes = true;
  let selling = false, message = "";
  const entries = (): number[] => selling ? [1, 2, 3, 4, 5].flatMap(p => pocketList(p).map(slot => slot.item)) : model.stock;
  const draw = (): void => {
    win.fill(1);
    const line = (str: string, y: number) => printText(win, FONT_NORMAL, encode(str), 6, y);
    line(`MONEY  $${save.money}`, 0);
    if (state === "main") {
      ["BUY", "SELL", "SEE YA!"].forEach((label, i) => line(`${cursor === i ? ">" : " "} ${label}`, 24 + i * 16));
    } else if (state === "list") {
      // The item list is its own ListMenu window below the money line.
    } else if (state === "quantity" || state === "confirm") {
      line(decode(itemName(item)), 24);
      line(`QUANTITY  ${quantity}`, 44);
      line(`TOTAL  $${quantity * model.price(item, selling)}`, 64);
      line(state === "quantity" ? "How many?" : selling ? "Sell these items?" : "Buy these items?", 86);
      if (state === "confirm") line(yes ? "> YES    NO" : "  YES  > NO", 106);
    } else line(message, 28);
  };
  // The list window, its ListMenu task and scroll arrows while state === "list".
  let list: { window: Window; taskId: number; removeArrows: () => void } | null = null;
  let listPos = { cursorPos: 0, itemsAbove: 0 };
  const LIST_ROWS = 6;
  const openList = (): void => {
    const stock = entries();
    const window = new Window(win.x, win.y + 3, win.width, LIST_ROWS * 2);
    game.overworld.windows.add(window);
    const items = [...stock.map((id, index) => ({ label: itemName(id), index })), { label: encode("CANCEL"), index: LIST_CANCEL }];
    const maxShowed = Math.min(LIST_ROWS, items.length);
    listPos.cursorPos = Math.min(listPos.cursorPos, Math.max(0, items.length - maxShowed));
    listPos.itemsAbove = Math.min(listPos.itemsAbove, maxShowed - 1);
    const taskId = ListMenuInitOnSurface(listMenuTemplate({
      items, windowId: 0, surface: fieldListSurface(window), totalItems: items.length, maxShowed, item_X: 8, cursor_X: 0, upText_Y: 2,
      itemVerticalPadding: 2, fontId: FONT_NORMAL, scrollMultiple: LIST_NO_MULTIPLE_SCROLL, moveCursorFunc: ListMenuDefaultCursorMoveFunc,
      // BuyMenuPrintPriceInList: ¥ and a 4-digit right-aligned price in the small font.
      itemPrintFunc: (_windowId, index, y) => {
        if (index < 0) return;
        stringVars.var1 = intToDecimal(model.price(stock[index], selling), STR_CONV_MODE_RIGHT_ALIGN, 4);
        printText(window, FONT_SMALL, expandPlaceholders(rom.text("gText_PokedollarVar1")), window.pixelWidth - 48, y, { fg: 2, bg: 1, shadow: 3 });
      },
    }), listPos.cursorPos, listPos.itemsAbove);
    const removeArrows = items.length > maxShowed
      ? addFieldScrollArrows(game.overworld, SCROLL_ARROW_UP, (window.x + window.width / 2) * 8, window.y * 8 - 4, (window.y + window.height) * 8 + 4,
        items.length - maxShowed, () => ListMenuGetScrollAndRow(taskId).cursorPos)
      : () => {};
    list = { window, taskId, removeArrows };
  };
  const closeList = (): void => {
    if (!list) return;
    list.removeArrows();
    listPos = DestroyListMenuTask(list.taskId);
    game.scriptMenu.removeWindow(list.window);
    list = null;
  };
  const backToList = (): void => { state = "list"; draw(); openList(); };
  draw();
  const task = tasks.create(() => {
    const pressed = joy.newKeys, repeated = joy.repeated;
    if (state === "main") {
      if (pressed & B_BUTTON || (pressed & A_BUTTON && cursor === 2)) {
        game.scriptMenu.removeWindow(win); tasks.destroy(task); game.overworld.script.enable(); return;
      }
      if (repeated & DPAD_UP) cursor = (cursor + 2) % 3;
      else if (repeated & DPAD_DOWN) cursor = (cursor + 1) % 3;
      else if (pressed & A_BUTTON) { selling = cursor === 1; listPos = { cursorPos: 0, itemsAbove: 0 }; state = "list"; draw(); openList(); return; }
    } else if (state === "list") {
      const input = list ? ListMenu_ProcessInput(list.taskId) : LIST_NOTHING_CHOSEN;
      if (input === LIST_NOTHING_CHOSEN) return;
      closeList();
      if (input === LIST_CANCEL) { sound.playSE(sound.SE_SELECT); state = "main"; cursor = selling ? 1 : 0; }
      else {
        sound.playSE(sound.SE_SELECT);
        item = entries()[input]; quantity = 1;
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
