// Port of player_pc.c: the bedroom and Pokémon Center player PC menus.
// Top menu (ITEM STORAGE, MAILBOX, TURN OFF) and ITEM STORAGE submenu
// (WITHDRAW ITEM, DEPOSIT ITEM, CANCEL) with description strings on window 0.
// Withdrawals open item_pc.c (itemPc.ts), deposits open bagMenu.ts,
// mailbox opens player_pc.c/mailbox_pc.c (playerPcMailbox.ts).

import { decode } from "../gba/charmap";
import { rom } from "../rom";
import { save } from "../save";
import type { Game } from "../game";
import * as C from "../generated/constants";
import { GoToBagMenu } from "../bagMenu";
import { ItemPc_Init, ItemPc_SetInitializedFlag } from "../itemPc";
import { PlayerPcMailbox } from "../playerPcMailbox";
import { fieldMenu } from "./fieldMenus";
import { Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menu";
import { FONT_NORMAL } from "../gba/font";
import { printText } from "../gba/textPrinter";
import { tasks } from "../gba/tasks";
import { addPCItem } from "../pokemon/items";
import { sound } from "../audio/sound";
import { joy, JOY_NEW, JOY_REPEAT, DPAD_UP, DPAD_DOWN, A_BUTTON, B_BUTTON } from "../gba/input";

export interface PlayerPCMenuManager {
  notInRoom: boolean;
  count?: number;
  itemsAbove?: number;
  cursorPos?: number;
}

export const gPlayerPcMenuManager: PlayerPCMenuManager = {
  notInRoom: false,
};

let sTopMenuItemCount = 3;

/** NewGameInitPCItems: player_pc.c */
export function NewGameInitPCItems(): void {
  save.pcItems.length = 0;
  addPCItem(C.ITEM_POTION, 1);
}

/** PrintStringOnWindow0WithDialogueFrame: player_pc.c */
export function PrintStringOnWindow0WithDialogueFrame(game: Game, str: Uint8Array): void {
  game.overworld.control.MsgSetNotSignpost();
  game.overworld.messageBox.show(str);
}

/** Task_ReturnToTopMenu: player_pc.c */
export function Task_ReturnToTopMenu(game: Game): void {
  Task_DrawPlayerPcTopMenu(game);
}

/** Task_DrawPlayerPcTopMenu: player_pc.c */
export function Task_DrawPlayerPcTopMenu(game: Game): void {
  PrintStringOnWindow0WithDialogueFrame(game, rom.text("gText_WhatWouldYouLikeToDo"));

  // sWindowTemplate_TopMenu_3Items: tilemapLeft 1, tilemapTop 1, width 13, height 6
  const window = game.scriptMenu.createFramedWindow(1, 1, 13, 6);
  const items = ["gText_ItemStorage", "gText_Mailbox", "gText_TurnOff"];
  items.forEach((sym, i) => printText(window, FONT_NORMAL, rom.text(sym), 8, i * 16 + 2));

  const menu = new Menu(window, FONT_NORMAL, 0, 2, 16, sTopMenuItemCount, 0);
  const taskId = tasks.create(() => {
    Task_TopMenuHandleInput(game, taskId, menu, window);
  }, 80);
}

/** Task_TopMenuHandleInput: player_pc.c */
export function Task_TopMenuHandleInput(game: Game, taskId: number, menu: Menu, window: unknown): void {
  const input = menu.processInputNoWrap();
  if (input === MENU_NOTHING_CHOSEN) return;

  tasks.destroy(taskId);
  game.scriptMenu.removeWindow(window as any);
  game.overworld.messageBox.hide();

  if (input === MENU_B_PRESSED || input === 2) {
    sound.playSE(C.SE_SELECT);
    Task_PlayerPcTurnOff(game);
    return;
  }

  sound.playSE(C.SE_SELECT);
  if (input === 1) {
    Task_PlayerPcMailbox(game);
  } else {
    Task_PlayerPcItemStorage(game);
  }
}

/** Task_PlayerPcTurnOff: player_pc.c */
export function Task_PlayerPcTurnOff(game: Game): void {
  const ow = game.overworld;
  if (!gPlayerPcMenuManager.notInRoom) {
    ow.script.ScriptContext_SetupScript(rom.label("EventScript_PalletTown_PlayersHouse_2F_ShutDownPC"));
  } else {
    ow.script.ScriptContext_Enable();
  }
}

/** Task_PlayerPcMailbox: player_pc.c */
export function Task_PlayerPcMailbox(game: Game): void {
  PlayerPcMailbox(game, gPlayerPcMenuManager.notInRoom, () => Task_ReturnToTopMenu(game));
}

/** Task_PlayerPcItemStorage: player_pc.c */
export function Task_PlayerPcItemStorage(game: Game): void {
  Task_CreateItemStorageSubmenu(game, 0);
}

/** Description strings: sItemStorageActionDescriptionPtrs */
const sItemStorageActionDescriptionPtrs = [
  "gText_TakeOutItemsFromThePC",
  "gText_StoreItemsInThePC",
  "gText_GoBackToThePreviousMenu",
];

/** Task_CreateItemStorageSubmenu: player_pc.c */
export function Task_CreateItemStorageSubmenu(game: Game, cursorPos: number): void {
  // sWindowTemplate_ItemStorageSubmenu: tilemapLeft 1, tilemapTop 1, width 14, height 6
  const window = game.scriptMenu.createFramedWindow(1, 1, 14, 6);
  const items = ["gText_WithdrawItem2", "gText_DepositItem2", "gFameCheckerText_Cancel"];
  items.forEach((sym, i) => printText(window, FONT_NORMAL, rom.text(sym), 8, i * 16 + 2));

  PrintStringOnWindow0WithDialogueFrame(game, rom.text(sItemStorageActionDescriptionPtrs[cursorPos]!));

  const menu = new Menu(window, FONT_NORMAL, 0, 2, 16, 3, cursorPos);

  const taskId = tasks.create(() => {
    Task_TopMenu_ItemStorageSubmenu_HandleInput(game, taskId, menu, window);
  }, 80);
}

/** Task_TopMenu_ItemStorageSubmenu_HandleInput: player_pc.c */
export function Task_TopMenu_ItemStorageSubmenu_HandleInput(
  game: Game,
  taskId: number,
  menu: Menu,
  window: unknown
): void {
  if (JOY_REPEAT(DPAD_UP)) {
    if (menu.cursorPos > 0) {
      sound.playSE(C.SE_SELECT);
      menu.move(-1, false);
      PrintStringOnWindow0WithDialogueFrame(game, rom.text(sItemStorageActionDescriptionPtrs[menu.cursorPos]!));
    }
  } else if (JOY_REPEAT(DPAD_DOWN)) {
    if (menu.cursorPos < 2) {
      sound.playSE(C.SE_SELECT);
      menu.move(1, false);
      PrintStringOnWindow0WithDialogueFrame(game, rom.text(sItemStorageActionDescriptionPtrs[menu.cursorPos]!));
    }
  }

  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    tasks.destroy(taskId);
    game.scriptMenu.removeWindow(window as any);
    game.overworld.messageBox.hide();
    if (menu.cursorPos === 0) Task_PlayerPcWithdrawItem(game);
    else if (menu.cursorPos === 1) Task_PlayerPcDepositItem(game);
    else Task_PlayerPcCancel(game);
    return;
  }

  if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    tasks.destroy(taskId);
    game.scriptMenu.removeWindow(window as any);
    game.overworld.messageBox.hide();
    Task_PlayerPcCancel(game);
  }
}

/** Task_PlayerPcCancel: player_pc.c */
export function Task_PlayerPcCancel(game: Game): void {
  Task_ReturnToTopMenu(game);
}

/** Task_PlayerPcDepositItem: player_pc.c */
export function Task_PlayerPcDepositItem(game: Game): void {
  Task_DepositItem_WaitFadeAndGoToBag(game);
}

/** Task_DepositItem_WaitFadeAndGoToBag: player_pc.c */
export function Task_DepositItem_WaitFadeAndGoToBag(game: Game): void {
  fieldMenu(game, (close) => {
    GoToBagMenu(C.ITEMMENULOCATION_ITEMPC, C.OPEN_BAG_ITEMS, () => {
      close();
      CB2_ReturnFromDepositMenu(game);
    }, {});
  }, false);
}

/** CB2_ReturnFromDepositMenu: player_pc.c */
export function CB2_ReturnFromDepositMenu(game: Game): void {
  Task_ReturnToItemStorageSubmenu(game, 1);
}

/** Task_PlayerPcWithdrawItem: player_pc.c */
export function Task_PlayerPcWithdrawItem(game: Game): void {
  if (!save.pcItems.length) {
    PrintStringOnWindow0WithDialogueFrame(game, rom.text("gText_ThereAreNoItems"));
    const id = tasks.create(() => {
      if (joy.newKeys & (A_BUTTON | B_BUTTON)) {
        tasks.destroy(id);
        Task_PlayerPcItemStorage(game);
      }
    }, 80);
    return;
  }
  Task_WithdrawItemBeginFade(game);
}

/** Task_WithdrawItemBeginFade: player_pc.c */
export function Task_WithdrawItemBeginFade(game: Game): void {
  Task_WithdrawItem_WaitFadeAndGoToItemStorage(game);
}

/** Task_WithdrawItem_WaitFadeAndGoToItemStorage: player_pc.c */
export function Task_WithdrawItem_WaitFadeAndGoToItemStorage(game: Game): void {
  fieldMenu(game, (close) => {
    ItemPc_SetInitializedFlag(false);
    ItemPc_Init(0, () => {
      close();
      CB2_ReturnFromWithdrawMenu(game);
    });
  }, false);
}

/** CB2_ReturnFromWithdrawMenu: player_pc.c */
export function CB2_ReturnFromWithdrawMenu(game: Game): void {
  Task_ReturnToItemStorageSubmenu(game, 0);
}

/** Task_ReturnToItemStorageSubmenu: player_pc.c */
export function Task_ReturnToItemStorageSubmenu(game: Game, cursorPos: number): void {
  Task_CreateItemStorageSubmenu(game, cursorPos);
}

/** BedroomPC: player_pc.c */
export function BedroomPC(game: Game): void {
  gPlayerPcMenuManager.notInRoom = false;
  sTopMenuItemCount = 3;
  game.overworld.script.ScriptContext_Stop();
  Task_DrawPlayerPcTopMenu(game);
}

/** PlayerPC: player_pc.c */
export function PlayerPC(game: Game): void {
  gPlayerPcMenuManager.notInRoom = true;
  sTopMenuItemCount = 3;
  game.overworld.script.ScriptContext_Stop();
  Task_DrawPlayerPcTopMenu(game);
}

/** Backward compatibility helper for game.ts */
export function openPlayerPc(game: Game, bedroom: boolean): void {
  if (bedroom) BedroomPC(game);
  else PlayerPC(game);
}
