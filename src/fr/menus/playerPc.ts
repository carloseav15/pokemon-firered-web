// player_pc.c: the bedroom/player PC top menu and ITEM STORAGE submenu over the
// Canvas2D field (adapter). Withdrawals run item_pc.c (itemPc.ts), the mailbox
// runs player_pc.c's mailbox flow with mailbox_pc.c (playerPcMailbox.ts) and
// deposits open the bag.

import { decode } from "../gba/charmap";
import { rom } from "../rom";
import { save } from "../save";
import type { Game } from "../game";
import * as C from "../generated/constants";
import { GoToBagMenu } from "../bagMenu";
import { ItemPc_Init, ItemPc_SetInitializedFlag } from "../itemPc";
import { PlayerPcMailbox } from "../playerPcMailbox";
import { fieldMenu } from "./fieldMenus";
import { openHardwareChoice, openHardwareMessage } from "./hardwareChoice";
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
  /** Task_PlayerPcMailbox: player_pc.c / mailbox_pc.c (playerPcMailbox.ts). */
  const mailbox = (): void => PlayerPcMailbox(game, !bedroom, topMenu);
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
      /** Task_PlayerPcWithdrawItem: item_pc.c (Task_WithdrawItemBeginFade → ItemPc_Init(0, …)). */
      const withdraw = (): void => {
        if (!save.pcItems.length) { openHardwareMessage(rom.text("gText_ThereAreNoItems"), submenu); return; }
        ItemPc_SetInitializedFlag(false);
        ItemPc_Init(0, submenu);
      };
      /** Task_PlayerPcDepositItem: GoToBagMenu(ITEMMENULOCATION_ITEMPC, OPEN_BAG_ITEMS, ...) back to the submenu. */
      const deposit = (): void => GoToBagMenu(C.ITEMMENULOCATION_ITEMPC, C.OPEN_BAG_ITEMS, submenu, {});
      submenu();
    }, false);
  };
  ow.script.stop();
  topMenu();
}
