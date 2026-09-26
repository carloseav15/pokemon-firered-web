// player_pc.c (mailbox part): the player PC's MAILBOX flow — mail list, the
// read / move-to-bag / give-to-mon submenu, and the return trips from the mail
// viewer and the party menu — built on mailbox_pc.c (mailboxPc.ts).
// Adaptations:
//  - The PC top menu and ITEM STORAGE submenu are drawn over the Canvas2D field
//    (menus/playerPc.ts); the mailbox runs as its own hardware scene hosted by
//    fieldMenu, with the standard text box (window 0) on BG0. Leaving it
//    (Task_ReturnToTopMenu) hands control back to the top menu.
//  - The C returns from ReadMail / the party menu through CB2_ReturnToField and
//    gFieldCallback; here each return re-creates the scene (MailboxScene_Init).
//  - The list indexes compacted SaveBlock1 mail slots 6 through 15.
//  - The help system (SetHelpContext) is out of scope.

import { sound } from "./audio/sound";
import { stringVars, expandPlaceholders } from "./gba/charmap";
import { FONT_NORMAL, stringWidth } from "./gba/font";
import { tasks } from "./gba/tasks";
import { getTextSpeedSetting } from "./gba/textPrinter";
import * as C from "./generated/constants";
import { loadCData, preloadPacks } from "./hw/assets";
import {
  InitBgsFromTemplates, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import {
  DestroyListMenuTask, ListMenu_ProcessInput, ListMenuGetScrollAndRow, RemoveScrollIndicatorArrowPair,
} from "./hw/listMenu";
import {
  ClearDialogWindowAndFrame, CreateYesNoMenu, DLG_WINDOW_BASE_TILE_NUM, DLG_WINDOW_PALETTE_NUM, GetMenuCursorDimensionByFont, InitStandardTextBoxWindows,
  InitTextBoxGfxAndPrinters, LoadStdWindowFrameGfx, Menu_InitCursor, Menu_ProcessInput_other, Menu_ProcessInputNoWrapClearOnChoose, PrintTextArray,
  STD_WINDOW_BASE_TILE_NUM, STD_WINDOW_PALETTE_NUM,
} from "./hw/menu";
import {
  ClearScheduledBgCopiesToVram, DisplayMessageAndContinueTask, DoScheduledBgTilemapCopiesToVram, ResetAllBgsCoordinatesAndBgCntRegs,
  ScheduleBgCopyTilemapToVram,
} from "./hw/menuHelpers";
import { BeginNormalPaletteFade, gPaletteFade, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { SetHBlankCallback, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import { AnimateSprites, BuildOamBuffer, FreeAllSpritePalettes, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData } from "./hw/sprite";
import { AddTextPrinterParameterized } from "./hw/text";
import { FreeAllWindowBuffers, type WindowTemplate } from "./hw/window";
import { ChooseMonToGiveMailFromMailbox } from "./partyMenu";
import {
  gPlayerPcMenuManager, MailboxPC_AddScrollIndicatorArrows, MailboxPC_DestroyListMenuBuffer, MailboxPC_GetAddWindow, MailboxPC_InitBuffers,
  MailboxPC_InitListMenu, MailboxPC_RemoveWindow,
} from "./mailboxPc";
import { openMailView } from "./menus/mailView";
import { ClearPCMailEntry, CountPCMail as CountSavePCMail, GetPCMailEntry, PCMailCompaction as CompactSavePCMail } from "./pokemon/mail";
import { mailLines } from "./pokemon/mail";
import { addBagItem, itemName } from "./pokemon/items";
import { CalculatePlayerPartyCount } from "./pokemon/mon";
import { decode } from "./gba/charmap";
import { rom } from "./rom";
import { save } from "./save";
import type { Game } from "./game";
import { fieldMenu } from "./menus/fieldMenus";

const tListMenuTaskId = 11;

/** Leaves the mailbox scene and shows the PC top menu again (Task_ReturnToTopMenu's destination). */
let sReturnToTopMenu: () => void = () => {};

const sMenuActions_MailSubmenu = [
  { text: () => rom.text("gOtherText_Read"), func: (taskId: number) => Task_PlayerPcReadMail(taskId) },
  { text: () => rom.text("gOtherText_MoveToBag"), func: (taskId: number) => Task_PlayerPcMoveMailToBag(taskId) },
  { text: () => rom.text("gOtherText_Give2"), func: (taskId: number) => Task_PlayerPcGiveMailToMon(taskId) },
  { text: () => rom.text("gOtherText_Exit"), func: (taskId: number) => Task_PlayerPcExitMailSubmenu(taskId) },
];

const sYesNo_WindowTemplate: WindowTemplate = { bg: 0, tilemapLeft: 21, tilemapTop: 9, width: 6, height: 4, paletteNum: DLG_WINDOW_PALETTE_NUM, baseBlock: 0x125 };

function preloadPlayerPcMailbox(): Promise<unknown> {
  return Promise.all([
    loadCData("mailbox_pc", "strings", "text_window_graphics", "item_menu_icons"),
    preloadPacks(["graphics_text_window", "graphics_fonts", "graphics_interface"]),
  ]);
}

/**
 * The mailbox entry of the PC (Task_PlayerPcMailbox): `notInRoom` is
 * gPlayerPcMenuManager.notInRoom, `done` shows the top menu again.
 */
export function PlayerPcMailbox(game: Game, notInRoom: boolean, done: () => void): void {
  void preloadPlayerPcMailbox().then(() => {
    fieldMenu(game, (close) => {
      gPlayerPcMenuManager.notInRoom = notInRoom;
      sReturnToTopMenu = () => {
        FreeAllWindowBuffers();
        SetVBlankCallback(null);
        SetMainCallback2(null);
        close();
        done();
      };
      MailboxScene_Init();
      Task_PlayerPcMailbox(tasks.create(TaskDummy, 0));
    }, false);
  });
}

function TaskDummy(): void {}

// ---------------------------------------------------------------- scene (the field BG0 + text box the C draws on)

function MailboxScene_VBlankCB(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function MailboxScene_MainCB(): void {
  // No RunTextPrinters here: DisplayMessageAndContinueTask's task runs the printers (RunTextPrinters_CheckActive).
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  DoScheduledBgTilemapCopiesToVram();
  UpdatePaletteFade();
}

/** Replaces the field the C keeps under its windows: BG0 with the standard text box windows. */
function MailboxScene_Init(): void {
  SetVBlankCallback(null);
  SetHBlankCallback(null);
  ScanlineEffect_Stop();
  ResetPaletteFade();
  FreeAllSpritePalettes();
  ResetSpriteData();
  tasks.reset();
  ClearScheduledBgCopiesToVram();
  ResetAllBgsCoordinatesAndBgCntRegs();
  ResetBgsAndClearDma3BusyFlags(false);
  const template: BgTemplate = { bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0 };
  InitBgsFromTemplates(0, [template]);
  ppu.vram.fill(0);
  SetBgTilemapBuffer(0, new Uint16Array(0x400));
  InitStandardTextBoxWindows();
  InitTextBoxGfxAndPrinters();
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
  ShowBg(0);
  ScheduleBgCopyTilemapToVram(0);
  SetVBlankCallback(MailboxScene_VBlankCB);
  SetMainCallback2(MailboxScene_MainCB);
}

/** DisplayItemMessageOnField */
function DisplayItemMessageOnField(taskId: number, fontId: number, str: ArrayLike<number>, callback: (taskId: number) => void): void {
  LoadStdWindowFrameGfx();
  DisplayMessageAndContinueTask(taskId, 0, DLG_WINDOW_BASE_TILE_NUM, DLG_WINDOW_PALETTE_NUM, fontId, getTextSpeedSetting(), str, callback);
}

/** FadeScreen(FADE_TO_BLACK, 0) / FadeInFromBlack() */
const FadeToBlack = () => BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
const FadeInFromBlack = () => BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);

// ---------------------------------------------------------------- player_pc.c

function Task_ReturnToTopMenu(taskId: number): void {
  tasks.destroy(taskId);
  sReturnToTopMenu();
}

function Task_PlayerPcMailbox(taskId: number): void {
  gPlayerPcMenuManager.count = CountPCMail();
  if (gPlayerPcMenuManager.count === 0) {
    DisplayItemMessageOnField(taskId, FONT_NORMAL, rom.text("gText_TheresNoMailHere"), Task_ReturnToTopMenu);
  } else {
    gPlayerPcMenuManager.itemsAbove = 0;
    gPlayerPcMenuManager.cursorPos = 0;
    PCMailCompaction();
    Task_SetPageItemVars(taskId);
    // SetHelpContext(HELPCONTEXT_*_PC_MAILBOX): out of scope.
    if (MailboxPC_InitBuffers(gPlayerPcMenuManager.count) === true) {
      ClearDialogWindowAndFrame(0, false);
      Task_DrawMailboxPcMenu(taskId);
      tasks.tasks[taskId].func = Task_MailboxPcHandleInput;
    } else {
      DisplayItemMessageOnField(taskId, FONT_NORMAL, rom.text("gText_TheresNoMailHere"), Task_ReturnToTopMenu);
    }
  }
}

function Task_SetPageItemVars(_taskId: number): void {
  if (gPlayerPcMenuManager.count >= 8) gPlayerPcMenuManager.pageItems = 8;
  else gPlayerPcMenuManager.pageItems = gPlayerPcMenuManager.count + 1;
}

function CountPCMail(): number {
  return CountSavePCMail();
}

function PCMailCompaction(): void {
  CompactSavePCMail();
}

/** SELECTED_MAIL */
const SelectedMailIndex = () => gPlayerPcMenuManager.cursorPos + gPlayerPcMenuManager.itemsAbove;

function Task_DrawMailboxPcMenu(taskId: number): void {
  const windowId = MailboxPC_GetAddWindow(0);
  const width = stringWidth(FONT_NORMAL, rom.text("gText_Mailbox"), 0);
  MailboxPC_GetAddWindow(1);
  AddTextPrinterParameterized(windowId, FONT_NORMAL, rom.text("gText_Mailbox"), Math.trunc((80 - width) / 2), 2, 0, null);
  ScheduleBgCopyTilemapToVram(0);
  tasks.tasks[taskId].data[tListMenuTaskId] = MailboxPC_InitListMenu(gPlayerPcMenuManager);
  MailboxPC_AddScrollIndicatorArrows(gPlayerPcMenuManager);
}

function Task_MailboxPcHandleInput(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (!gPaletteFade.active) {
    const input = ListMenu_ProcessInput(data[tListMenuTaskId]);
    const pos = ListMenuGetScrollAndRow(data[tListMenuTaskId]);
    gPlayerPcMenuManager.cursorPos = pos.cursorPos;
    gPlayerPcMenuManager.itemsAbove = pos.itemsAbove;
    switch (input) {
      case -1:
        break;
      case -2:
        sound.playSE(C.SE_SELECT);
        RemoveScrollIndicatorArrowPair(gPlayerPcMenuManager.scrollIndicatorId);
        Task_DestroyMailboxPcViewAndCancel(taskId);
        break;
      default: {
        sound.playSE(C.SE_SELECT);
        MailboxPC_RemoveWindow(0);
        MailboxPC_RemoveWindow(1);
        const p = DestroyListMenuTask(data[tListMenuTaskId]);
        gPlayerPcMenuManager.cursorPos = p.cursorPos;
        gPlayerPcMenuManager.itemsAbove = p.itemsAbove;
        ScheduleBgCopyTilemapToVram(0);
        RemoveScrollIndicatorArrowPair(gPlayerPcMenuManager.scrollIndicatorId);
        tasks.tasks[taskId].func = Task_PrintWhatToDoWithSelectedMail;
        break;
      }
    }
  }
}

function Task_PrintWhatToDoWithSelectedMail(taskId: number): void {
  const author = GetPCMailEntry(SelectedMailIndex())?.message.author ?? [];
  const name = author.length ? author : save.playerName;
  stringVars.var1 = Uint8Array.from([...name.filter((b) => b !== 0xff), 0xff]);
  stringVars.var4 = expandPlaceholders(rom.text("gText_WhatWouldYouLikeToDoWithPlayersMail"));
  DisplayItemMessageOnField(taskId, FONT_NORMAL, stringVars.var4, Task_DrawMailSubmenu);
}

function Task_DestroyMailboxPcViewAndCancel(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  MailboxPC_RemoveWindow(0);
  MailboxPC_RemoveWindow(1);
  DestroyListMenuTask(data[tListMenuTaskId]);
  ScheduleBgCopyTilemapToVram(0);
  MailboxPC_DestroyListMenuBuffer();
  Task_ReturnToTopMenu(taskId);
}

function Task_DrawMailSubmenu(taskId: number): void {
  const windowId = MailboxPC_GetAddWindow(2);
  PrintTextArray(windowId, FONT_NORMAL, GetMenuCursorDimensionByFont(FONT_NORMAL, 0), 2, 16, 4, sMenuActions_MailSubmenu.map((a) => ({ text: a.text() })));
  Menu_InitCursor(windowId, FONT_NORMAL, 0, 2, 16, 4, 0);
  ScheduleBgCopyTilemapToVram(0);
  tasks.tasks[taskId].func = Task_MailSubmenuHandleInput;
}

function Task_MailSubmenuHandleInput(taskId: number): void {
  const input = Menu_ProcessInput_other();
  switch (input) {
    case -1:
      sound.playSE(C.SE_SELECT);
      Task_PlayerPcExitMailSubmenu(taskId);
      break;
    case -2:
      break;
    default:
      sound.playSE(C.SE_SELECT);
      sMenuActions_MailSubmenu[input].func(taskId);
      break;
  }
}

function Task_PlayerPcReadMail(taskId: number): void {
  FadeToBlack();
  tasks.tasks[taskId].func = Task_WaitFadeAndReadSelectedMail;
}

function Task_WaitFadeAndReadSelectedMail(taskId: number): void {
  if (!gPaletteFade.active) {
    MailboxPC_DestroyListMenuBuffer();
    // CleanupOverworldWindowsAndTilemaps()
    FreeAllWindowBuffers();
    tasks.destroy(taskId);
    // ReadMail(&SELECTED_MAIL, CB2_SetCbToReturnToMailbox, 1): the mail viewer adapter (menus/mailView.ts).
    const slot = GetPCMailEntry(SelectedMailIndex());
    if (!slot) return;
    SetMainCallback2(null);
    openMailView(decode(itemName(slot.item)), mailLines(slot.message.words), decode(Uint8Array.from(slot.message.author)), CB2_SetCbToReturnToMailbox);
  }
}

function Task_WaitFadeAndReturnToMailboxPcInputHandler(taskId: number): void {
  if (!gPaletteFade.active) tasks.tasks[taskId].func = Task_MailboxPcHandleInput; // IsWeatherNotFadingIn
}

function CB2_ReturnToMailbox(): void {
  // SetHelpContext(HELPCONTEXT_*_PC_MAILBOX): out of scope.
  MailboxScene_Init();
  LoadStdWindowFrameGfx();
  const taskId = tasks.create(Task_WaitFadeAndReturnToMailboxPcInputHandler, 0);
  if (MailboxPC_InitBuffers(gPlayerPcMenuManager.count) === true) Task_DrawMailboxPcMenu(taskId);
  else tasks.destroy(taskId);
  FadeInFromBlack();
}

function CB2_SetCbToReturnToMailbox(): void {
  // gFieldCallback = CB2_ReturnToMailbox; SetMainCallback2(CB2_ReturnToField)
  CB2_ReturnToMailbox();
}

function Task_PlayerPcMoveMailToBag(taskId: number): void {
  DisplayItemMessageOnField(taskId, FONT_NORMAL, rom.text("gText_MessageWillBeLost"), Task_DrawYesNoMenuToConfirmMoveToBag);
}

function Task_DrawYesNoMenuToConfirmMoveToBag(taskId: number): void {
  // DisplayYesNoMenuDefaultYes
  CreateYesNoMenu(sYesNo_WindowTemplate, FONT_NORMAL, 0, 2, STD_WINDOW_BASE_TILE_NUM, STD_WINDOW_PALETTE_NUM, 0);
  tasks.tasks[taskId].func = Task_MoveToBagYesNoMenuHandleInput;
}

function Task_MoveToBagYesNoMenuHandleInput(taskId: number): void {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case -2:
      break;
    case 0:
      Task_TryPutMailInBag_DestroyMsgIfSuccessful(taskId);
      break;
    case -1:
      sound.playSE(C.SE_SELECT);
      // fallthrough
    case 1:
      Task_DeclinedMoveMailToBag(taskId);
      break;
  }
}

function Task_TryPutMailInBag_DestroyMsgIfSuccessful(taskId: number): void {
  const index = SelectedMailIndex();
  const mail = GetPCMailEntry(index);
  if (!mail) return;
  if (!addBagItem(mail.item, 1)) {
    DisplayItemMessageOnField(taskId, FONT_NORMAL, rom.text("gText_BagIsFull"), Task_PlayerPcExitMailSubmenu);
  } else {
    DisplayItemMessageOnField(taskId, FONT_NORMAL, rom.text("gText_MailReturnedToBagMessageErased"), Task_PlayerPcExitMailSubmenu);
    ClearPCMailEntry(index);
    gPlayerPcMenuManager.count--;
    if (gPlayerPcMenuManager.count < gPlayerPcMenuManager.pageItems + gPlayerPcMenuManager.cursorPos) {
      if (gPlayerPcMenuManager.cursorPos !== 0) gPlayerPcMenuManager.cursorPos--;
    }
    Task_SetPageItemVars(taskId);
  }
}

function Task_DeclinedMoveMailToBag(taskId: number): void {
  Task_PlayerPcExitMailSubmenu(taskId);
}

function Task_PlayerPcGiveMailToMon(taskId: number): void {
  if (CalculatePlayerPartyCount() === 0) {
    Task_Error_NoPokemon(taskId);
  } else {
    FadeToBlack();
    tasks.tasks[taskId].func = Task_WaitFadeAndGoToPartyMenu;
  }
}

function Task_WaitFadeAndGoToPartyMenu(taskId: number): void {
  if (!gPaletteFade.active) {
    MailboxPC_DestroyListMenuBuffer();
    // CleanupOverworldWindowsAndTilemaps()
    FreeAllWindowBuffers();
    ChooseMonToGiveMailFromMailbox(Mailbox_ReturnToMailListAfterDeposit);
    tasks.destroy(taskId);
  }
}

function CB2_ReturnToMailboxPc_UpdateScrollVariables(): void {
  MailboxScene_Init();
  // SetHelpContext(HELPCONTEXT_*_PC_MAILBOX): out of scope.
  const taskId = tasks.create(Task_WaitFadeAndReturnToMailboxPcInputHandler, 0);
  const count = gPlayerPcMenuManager.count;
  gPlayerPcMenuManager.count = CountPCMail();
  PCMailCompaction();
  if (count !== gPlayerPcMenuManager.count) {
    if (gPlayerPcMenuManager.count < gPlayerPcMenuManager.pageItems + gPlayerPcMenuManager.cursorPos) {
      if (gPlayerPcMenuManager.cursorPos !== 0) gPlayerPcMenuManager.cursorPos--;
    }
  }
  Task_SetPageItemVars(taskId);
  LoadStdWindowFrameGfx();
  if (MailboxPC_InitBuffers(gPlayerPcMenuManager.count) === true) Task_DrawMailboxPcMenu(taskId);
  else tasks.destroy(taskId);
  FadeInFromBlack();
}

/** Mailbox_ReturnToMailListAfterDeposit: the party menu's exit callback (gFieldCallback + CB2_ReturnToField). */
export function Mailbox_ReturnToMailListAfterDeposit(): void {
  CB2_ReturnToMailboxPc_UpdateScrollVariables();
}

function Task_Error_NoPokemon(taskId: number): void {
  DisplayItemMessageOnField(taskId, FONT_NORMAL, rom.text("gText_ThereIsNoPokemon"), Task_PlayerPcExitMailSubmenu);
}

function Task_RedrawPlayerPcMailboxAndSetUpInputHandler(taskId: number): void {
  ClearDialogWindowAndFrame(0, false);
  Task_DrawMailboxPcMenu(taskId);
  ScheduleBgCopyTilemapToVram(0);
  tasks.tasks[taskId].func = Task_MailboxPcHandleInput;
}

function Task_PlayerPcExitMailSubmenu(taskId: number): void {
  MailboxPC_RemoveWindow(2);
  ScheduleBgCopyTilemapToVram(0);
  tasks.tasks[taskId].func = Task_RedrawPlayerPcMailboxAndSetUpInputHandler;
}
