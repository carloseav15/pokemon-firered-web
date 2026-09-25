// player_pc.c: the bedroom/player PC (ITEM STORAGE with withdraw/deposit, the
// MAILBOX and TURN OFF) with item_pc.c withdrawals and bag deposits.

import { decode, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import { rom } from "../rom";
import { save } from "../save";
import { addBagItem, addPCItem, checkBagHasSpace, itemInfo, itemName, pocketList, removeBagItem, removePCItem } from "../pokemon/items";
import { blankMail, isMailItem, mailLines, takeMail } from "../pokemon/mail";
import { openMailView } from "./mailView";
import type { Game } from "../game";
import { fieldMenu, fieldMessage } from "./fieldMenus";
import { openHardwareChoice, openHardwareMessage, openHardwareQuantity } from "./hardwareChoice";
import { Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menu";
import { FONT_NORMAL } from "../gba/font";
import { printText } from "../gba/textPrinter";
import { tasks } from "../gba/tasks";

/** BedroomPC / PlayerPC */
export function openPlayerPc(game: Game, bedroom: boolean): void {
  const ow = game.overworld;
  const topMenu = (): void => {
    ow.control.msgIsSignpost = false;
    ow.messageBox.show(rom.text("gText_WhatWouldYouLikeToDo"));
    const window = game.scriptMenu.createFramedWindow(0, 0, 11, 6);
    ["gText_ItemStorage", "gText_Mailbox", "gText_TurnOff"].forEach((sym, i) => printText(window, FONT_NORMAL, rom.text(sym), 8, i * 16 + 2));
    const menu = new Menu(window, FONT_NORMAL, 0, 2, 16, 3, 0);
    const id = tasks.create(() => {
      const input = menu.processInputNoWrap();
      if (input === MENU_NOTHING_CHOSEN) return;
      tasks.destroy(id);
      game.scriptMenu.removeWindow(window);
      ow.messageBox.hide();
      if (input === MENU_B_PRESSED || input === 2) { turnOff(); return; }
      if (input === 1) { mailbox(); return; }
      itemStorage();
    }, 80);
  };
  const turnOff = (): void => {
    if (bedroom) ow.script.setupScript(rom.label("EventScript_PalletTown_PlayersHouse_2F_ShutDownPC"));
    else ow.script.enable();
  };
  /** mailbox_pc.c: party mons holding mail can be READ or have it TAKEn. */
  const mailbox = (): void => {
    fieldMenu(game, (close) => {
      const back = (): void => { close(); topMenu(); };
      const holders = (): number[] =>
        save.party.map((m, i) => (m && isMailItem(m.heldItem) ? i : -1)).filter((i) => i >= 0);
      const list = (): void => {
        if (!holders().length) { close(); fieldMessage(game, rom.text("gText_TheresNoMailHere"), topMenu); return; }
        openHardwareChoice(rom.text("gText_Mailbox"), holders().map((i) => ({
          label: `${decode(save.party[i].nickname)} ${decode(itemName(save.party[i].heldItem))}`, value: i,
        })), true, (i) => {
          if (i === null) { back(); return; }
          entry(i);
        });
      };
      const entry = (i: number): void => {
        const mon = save.party[i];
        openHardwareChoice(decode(mon.nickname), [{ label: "READ", value: 0 }, { label: "TAKE", value: 1 }], true, (c) => {
          if (c === null) { list(); return; }
          if (c === 0) {
            const msg = mon.mailMessage ?? blankMail();
            openMailView(
              decode(itemName(mon.heldItem)), mailLines(msg.words),
              msg.author.length ? decode(Uint8Array.from(msg.author)) : "",
              () => entry(i));
            return;
          }
          if (!addBagItem(mon.heldItem, 1)) { openHardwareMessage(rom.text("gText_BagIsFull"), () => entry(i)); return; }
          takeMail(mon);
          list();
        });
      };
      list();
    }, false);
  };
  const itemStorage = (): void => {
    fieldMenu(game, (close) => {
      const back = (): void => { close(); topMenu(); };
      const submenu = (): void => openHardwareChoice(rom.text("gText_ItemStorage"), [
        { label: decode(rom.text("gText_WithdrawItem2")), value: 0 },
        { label: decode(rom.text("gText_DepositItem2")), value: 1 },
      ], true, (choice) => {
        if (choice === null) { back(); return; }
        if (choice === 0) withdraw(); else deposit();
      });
      const withdraw = (): void => {
        if (!save.pcItems.length) { openHardwareMessage(rom.text("gText_ThereAreNoItems"), submenu); return; }
        openHardwareChoice(rom.text("gText_WithdrawItem2"), save.pcItems.map((slot, value) => ({
          label: `${decode(itemName(slot.item))} x${slot.quantity}`, value,
        })), true, (index) => {
          if (index === null) { submenu(); return; }
          const slot = save.pcItems[index];
          openHardwareQuantity(itemName(slot.item), slot.quantity, (count) => {
            if (count === null) { withdraw(); return; }
            if (!checkBagHasSpace(slot.item, count)) { openHardwareMessage(rom.text("gText_BagIsFull"), withdraw); return; }
            const item = slot.item;
            addBagItem(item, count);
            removePCItem(item, count);
            stringVars.var1 = itemName(item);
            stringVars.var2 = intToDecimal(count, STR_CONV_MODE_LEFT_ALIGN, 3);
            openHardwareMessage(rom.text("gText_WithdrewQuantItem"), withdraw);
          });
        });
      };
      const deposit = (): void => {
        const items = [1, 2, 3, 4, 5].flatMap((p) => pocketList(p)).filter((s) => !itemInfo(s.item)?.importance || itemInfo(s.item)?.pocket !== 2);
        openHardwareChoice(rom.text("gText_DepositItem2"), items.map((slot) => ({
          label: `${decode(itemName(slot.item))} x${slot.quantity}`, value: slot.item,
        })), true, (item) => {
          if (item === null) { submenu(); return; }
          const slot = items.find((s) => s.item === item)!;
          openHardwareQuantity(itemName(item), slot.quantity, (count) => {
            if (count === null) { deposit(); return; }
            if (!addPCItem(item, count)) { openHardwareMessage(rom.text("gText_NoRoomToStoreItems"), deposit); return; }
            removeBagItem(item, count);
            deposit();
          });
        });
      };
      submenu();
    }, false);
  };
  ow.script.stop();
  topMenu();
}
