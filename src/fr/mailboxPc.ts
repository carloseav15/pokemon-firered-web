// mailbox_pc.c: windows and list menu of the player PC's mailbox screen, plus
// gPlayerPcMenuManager (player_pc.h). The mail list is save.pcMail (no empty
// slots), so the C's gSaveBlock1Ptr->mail[itemId + PARTY_SIZE] is pcMail[itemId].
// Adaptations: the Japanese-name fix-up (ConvertInternationalString) is not
// needed for the port's English player names; Alloc'd buffers are arrays.
// Needs loadCData("mailbox_pc", "strings").

import { sound } from "./audio/sound";
import { EOS } from "./gba/charmap";
import { FONT_NORMAL } from "./gba/font";
import * as C from "./generated/constants";
import { cdata } from "./hw/assets";
import {
  AddScrollIndicatorArrowPairParameterized, ListMenuInit, type ListMenu, type ListMenuItem, type ListMenuTemplate,
} from "./hw/listMenu";
import { ClearStdWindowAndFrameToTransparent, DrawStdWindowFrame, GetMenuCursorDimensionByFont } from "./hw/menu";
import { AddTextPrinterParameterized4 } from "./hw/text";
import { AddWindow, ClearWindowTilemap, RemoveWindow, type WindowTemplate } from "./hw/window";
import { rom } from "./rom";
import { save } from "./save";

/** struct PlayerPCItemPageStruct */
export type PlayerPCItemPageStruct = {
  itemsAbove: number;
  cursorPos: number;
  pageItems: number;
  count: number;
  notInRoom: boolean;
  scrollIndicatorId: number;
};

export const gPlayerPcMenuManager: PlayerPCItemPageStruct = { itemsAbove: 0, cursorPos: 0, pageItems: 0, count: 0, notInRoom: false, scrollIndicatorId: 0 };

const sWindowIds = [0xff, 0xff, 0xff];
let sListMenuItems: ListMenuItem[] = [];

const rd = <T>(name: string) => cdata<T>("mailbox_pc", name);
const sWindowTemplates = () => rd<WindowTemplate[]>("sWindowTemplates");
const sTextColor = () => rd<number[]>("sTextColor");

/** MailboxPC_InitBuffers */
export function MailboxPC_InitBuffers(num: number): boolean {
  sListMenuItems = new Array(num + 1);
  for (let i = 0; i < sWindowIds.length; i++) sWindowIds[i] = 0xff;
  return true;
}

/** MailboxPC_GetAddWindow */
export function MailboxPC_GetAddWindow(winIdx: number): number {
  if (sWindowIds[winIdx] === 0xff) {
    sWindowIds[winIdx] = AddWindow(sWindowTemplates()[winIdx]);
    DrawStdWindowFrame(sWindowIds[winIdx], false); // SetStdWindowBorderStyle
  }
  return sWindowIds[winIdx];
}

/** MailboxPC_RemoveWindow */
export function MailboxPC_RemoveWindow(winIdx: number): void {
  ClearStdWindowAndFrameToTransparent(sWindowIds[winIdx], false);
  ClearWindowTilemap(sWindowIds[winIdx]);
  RemoveWindow(sWindowIds[winIdx]);
  sWindowIds[winIdx] = 0xff;
}

/** MailboxPC_GetWindowId */
export function MailboxPC_GetWindowId(winIdx: number): number {
  return sWindowIds[winIdx];
}

function ItemPrintFunc(windowId: number, itemId: number, y: number): void {
  if (itemId !== -2) {
    const author = save.pcMail[itemId]?.message.author ?? [];
    // An unnamed sender (e.g. mail from the port's own gifts) falls back to the player's name.
    const strbuf = Uint8Array.from([...(author.length ? author : save.playerName), EOS]);
    AddTextPrinterParameterized4(windowId, FONT_NORMAL, 8, y, 0, 0, sTextColor(), -1, strbuf);
  }
}

/** MailboxPC_InitListMenu */
export function MailboxPC_InitListMenu(playerPcStruct: PlayerPCItemPageStruct): number {
  let i: number;
  for (i = 0; i < playerPcStruct.count; i++) {
    sListMenuItems[i] = { label: Uint8Array.of(EOS), index: i }; // sString_Dummy
  }
  sListMenuItems[i] = { label: rom.text("gFameCheckerText_Cancel"), index: -2 };

  const template: ListMenuTemplate = {
    items: sListMenuItems,
    totalItems: playerPcStruct.count + 1,
    windowId: sWindowIds[1],
    header_X: 0,
    item_X: GetMenuCursorDimensionByFont(FONT_NORMAL, 0),
    cursor_X: 0,
    lettersSpacing: 0,
    itemVerticalPadding: 2,
    maxShowed: 8,
    fontId: FONT_NORMAL,
    upText_Y: 10,
    cursorPal: 2,
    fillValue: 1,
    cursorShadowPal: 3,
    moveCursorFunc: MoveCursorFunc,
    itemPrintFunc: ItemPrintFunc,
    cursorKind: 0,
    scrollMultiple: 0,
  };
  return ListMenuInit(template, playerPcStruct.cursorPos, playerPcStruct.itemsAbove);
}

function MoveCursorFunc(_itemIndex: number, onInit: boolean, _list: ListMenu): void {
  if (onInit !== true) sound.playSE(C.SE_SELECT);
}

/** MailboxPC_AddScrollIndicatorArrows */
export function MailboxPC_AddScrollIndicatorArrows(playerPcStruct: PlayerPCItemPageStruct): void {
  playerPcStruct.scrollIndicatorId = AddScrollIndicatorArrowPairParameterized(
    2, 0xc2, 0xc, 0x94, playerPcStruct.count - playerPcStruct.pageItems + 1, 110, 110, () => playerPcStruct.cursorPos);
}

/** MailboxPC_DestroyListMenuBuffer */
export function MailboxPC_DestroyListMenuBuffer(): void {
  sListMenuItems = [];
}
