// player_pc.c: the bedroom/player PC (ITEM STORAGE with withdraw/deposit, the
// MAILBOX and TURN OFF) with item_pc.c withdrawals and bag deposits.

import { decode, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import { rom } from "../rom";
import { save } from "../save";
import { addBagItem, addPCItem, checkBagHasSpace, itemInfo, itemName, pocketList, removeBagItem, removePCItem } from "../pokemon/items";
import { isMailItem, mailLines } from "../pokemon/mail";
import { openMailView } from "./mailView";
import type { Game } from "../game";
import * as C from "../generated/constants";
import { GoToBagMenu } from "../bagMenu";
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
  /** mailbox_pc.c: read PC-stored mail, move it to the bag, or give it to a mon. */
  const mailbox = (): void => {
    fieldMenu(game, (close) => {
      const back = (): void => { close(); topMenu(); };
      save.pcMail ??= [];
      const list = (): void => {
        save.pcMail ??= [];
        if (!save.pcMail.length) { close(); fieldMessage(game, rom.text("gText_TheresNoMailHere"), topMenu); return; }
        openHardwareChoice(rom.text("gText_Mailbox"), save.pcMail.map((slot, value) => ({
          label: slot.message.author.length ? decode(Uint8Array.from(slot.message.author)) : decode(save.playerName), value,
        })), true, (index) => index === null ? back() : entry(index));
      };
      const entry = (index: number): void => {
        const slot = save.pcMail[index];
        if (!slot) { list(); return; }
        openHardwareChoice(rom.text("gText_WhatWouldYouLikeToDo"), [
          { label: rom.text("gOtherText_Read"), value: 0 },
          { label: rom.text("gOtherText_MoveToBag"), value: 1 },
          { label: rom.text("gOtherText_Give2"), value: 2 },
        ], true, (action) => {
          if (action === null) { list(); return; }
          if (action === 0) {
            openMailView(decode(itemName(slot.item)), mailLines(slot.message.words), decode(Uint8Array.from(slot.message.author)), list);
          } else if (action === 1) {
            openHardwareChoice(rom.text("gText_MessageWillBeLost"), [
              { label: rom.text("gText_Yes"), value: 1 }, { label: rom.text("gText_No"), value: 0 },
            ], false, (yes) => {
              if (!yes) { entry(index); return; }
              if (!addBagItem(slot.item, 1)) { openHardwareMessage(rom.text("gText_BagIsFull"), () => entry(index)); return; }
              save.pcMail.splice(index, 1);
              openHardwareMessage(rom.text("gText_MailReturnedToBagMessageErased"), list);
            });
          } else {
            const eligible = save.party.map((mon, value) => ({
              label: decode(mon.nickname), value,
              disabled: mon.isEgg || mon.heldItem !== C.ITEM_NONE,
            }));
            if (!eligible.length) { openHardwareMessage(rom.text("gText_ThereIsNoPokemon"), () => entry(index)); return; }
            openHardwareChoice(rom.text("gText_GiveToWhichPokemon"), eligible, true, (partyIndex) => {
              if (partyIndex === null) { entry(index); return; }
              const mon = save.party[partyIndex];
              if (!mon || mon.isEgg || mon.heldItem !== C.ITEM_NONE) { entry(index); return; }
              mon.heldItem = slot.item;
              mon.mailMessage = slot.message;
              save.pcMail.splice(index, 1);
              openHardwareMessage(rom.text("gText_MailTransferredFromMailbox"), list);
            });
          }
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
      /** Task_PlayerPcDepositItem: GoToBagMenu(ITEMMENULOCATION_ITEMPC, OPEN_BAG_ITEMS, ...) back to the submenu. */
      const deposit = (): void => GoToBagMenu(C.ITEMMENULOCATION_ITEMPC, C.OPEN_BAG_ITEMS, submenu, {});
      submenu();
    }, false);
  };
  ow.script.stop();
  topMenu();
}
