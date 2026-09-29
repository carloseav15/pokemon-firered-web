// battle_records.c: the Battle Records screen (SaveBlock2 link battle records,
// and the Trainer Tower records variant selected by var 0x8004) plus the
// record maintenance called after a link battle.
//
// Port notes: EWRAM buffers are JS values (GC replaces Free), the gStringVar*
// buffers are assigned fresh arrays of the C capacities (string_util.c), and
// the screen runs as a HwScene like seagallop.c/eggHatch: scene.enter()
// snapshots the field task table (C destroys it in StopAllRunningTasks and the
// field re-initializes on the return callback), and the exit runs after the
// screen's own task so leave() restores that table first.

import type { Game } from "./game";
import { sound } from "./audio/sound";
import { G } from "./battle/globals";
import { CHAR_SPACE, EOS, EXT_CTRL_CODE_BEGIN } from "./gba/charmap";
import { FONT_NORMAL, GetStringWidth } from "./gba/font";
import { A_BUTTON, B_BUTTON, joy } from "./gba/input";
import { STRING_VAR4_LENGTH, stringVars } from "./gba/stringBuffers";
import { tasks } from "./gba/tasks";
import * as C from "./generated/constants";
import { ConvertIntToDecimalStringN, StringCompareN, StringCopy, StringCopyN, StringExpandPlaceholders, StringFillWithTerminator } from "./generated/stringUtil";
import { cdata, incbin, incbin16, loadCData, preloadIncbin, preloadPacks } from "./hw/assets";
import { ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBufferRect, InitBgsFromTemplates, IsDma3ManagerBusyWithBgCopy, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate } from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import { GetTextWindowPalette } from "./hw/menu";
import { BG_PLTT_ID, BeginNormalPaletteFade, gPaletteFade, LoadPalette, PALETTES_ALL, PLTT_SIZE_4BPP, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { DISPCNT_BG0_ON, DISPCNT_BG3_ON, DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, ppu, REG_OFFSET_BG0CNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT } from "./hw/ppu";
import { HwScene, SetMainCallback2, SetVBlankCallback, gMain } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import { AnimateSprites, BuildOamBuffer, FreeAllSpritePalettes, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData } from "./hw/sprite";
import { AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./hw/text";
import { ClearWindowTilemap, CopyWindowToVram, FillWindowPixelBuffer, FillWindowPixelRect, FreeAllWindowBuffers, InitWindows, PIXEL_FILL, PutWindowTilemap, RemoveWindow, type WindowTemplate } from "./hw/window";
import { gLinkPlayers } from "./linkState";
import { gTrainerCards } from "./menus/trainerCard";
import { GetGameStat, IncrementGameStat, save, SetGameStat, SV, varGet, type LinkBattleRecordSave, type LinkBattleRecordsSave } from "./save";
import { ResetAllPicSprites } from "./trainerPokemonSprites";
import { PrintTrainerTowerRecords } from "./trainerTower";
import { rom } from "./rom";
import { InUnionRoom } from "./unionRoom";

const data = <T>(name: string) => cdata<T>("battle_records", name);
const symbols = [
  "battle_records.c:sTiles", "battle_records.c:sPalette", "battle_records.c:sTilemap",
];
const JOY_NEW = (bits: number): boolean => (joy.newKeys & bits) !== 0;

let sGame: Game | null = null;
let sScene: HwScene | null = null;
/** battle_records.c EWRAM_DATA u16 *sBg3TilemapBuffer_p (AllocZeroed/Free in C). */
let sBg3TilemapBuffer_p: Uint16Array | null = null;

/** Loads the screen's INCBIN pack and cdata tables (battle_records.c constant data).
 *  The frame window palette of GetTextWindowPalette lives in graphics_text_window. */
export async function preloadBattleRecords(): Promise<void> {
  await Promise.all([
    preloadIncbin(symbols),
    preloadPacks(["graphics_text_window", "graphics_fonts"]),
    loadCData("battle_records"),
  ]);
}

/** battle_records.c static const u8 sTextColor[3]. */
function textColors(): number[] {
  return data<number[]>("sTextColor");
}

/** battle_records.c void ShowBattleRecords. */
export function ShowBattleRecords(game: Game): void {
  sGame = game;
  SetVBlankCallback(null);
  const scene = new HwScene();
  scene.enter();
  sScene = scene;
  game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  SetMainCallback2(MainCB2_SetUp);
}

/** battle_records.c static void MainCB2_SetUp. */
function MainCB2_SetUp(): void {
  switch (gMain.state) {
    case 0:
      SetVBlankCallback(null);
      ResetGpu();
      gMain.state++;
      break;
    case 1:
      StopAllRunningTasks();
      gMain.state++;
      break;
    case 2: {
      const buffer = new Uint16Array(0x400); // AllocZeroed(0x800)
      sBg3TilemapBuffer_p = buffer;
      ResetBgsAndClearDma3BusyFlags(false);
      InitBgsFromTemplates(0, data<BgTemplate[]>("sBgTemplates"));
      SetBgTilemapBuffer(3, buffer);
      ResetBGPos();
      gMain.state++;
      break;
    }
    case 3:
      LoadFrameGfxOnBg(3);
      LoadPalette(GetTextWindowPalette(0), BG_PLTT_ID(15), PLTT_SIZE_4BPP);
      gMain.state++;
      break;
    case 4:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        ShowBg(0);
        ShowBg(3);
        CopyBgTilemapBufferToVram(3);
        gMain.state++;
      }
      break;
    case 5:
      InitWindows(data<WindowTemplate[]>("sWindowTemplates"));
      DeactivateAllTextPrinters();
      gMain.state++;
      break;
    case 6:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      gMain.state++;
      break;
    case 7:
      EnableDisplay();
      SetVBlankCallback(VBlankCB);
      if (varGet(SV.x8004))
        PrintTrainerTowerRecords();
      else
        PrintBattleRecords();
      tasks.create(Task_WaitFadeIn, 8);
      SetMainCallback2(MainCB2);
      gMain.state = 0;
      break;
  }
}

/** battle_records.c static void VBlankCB. */
function VBlankCB(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

/** battle_records.c static void MainCB2. */
function MainCB2(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

/** battle_records.c static void Task_WaitFadeIn. */
function Task_WaitFadeIn(taskId: number): void {
  if (!gPaletteFade.active)
    tasks.setFunc(taskId, Task_WaitButton);
}

/** battle_records.c static void Task_WaitButton. */
function Task_WaitButton(taskId: number): void {
  if (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    tasks.setFunc(taskId, Task_FadeOut);
  }
}

/** battle_records.c static void Task_FadeOut. */
function Task_FadeOut(taskId: number): void {
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
  tasks.setFunc(taskId, Task_DestroyAndReturnToField);
}

/** battle_records.c static void Task_DestroyAndReturnToField: cleanup runs before
 *  the return callback (C: SetMainCallback2 first), because the port's leave()
 *  restores the field task table only after this task is destroyed. */
function Task_DestroyAndReturnToField(taskId: number): void {
  if (gPaletteFade.active) return;
  sBg3TilemapBuffer_p = null; // C: Free(sBg3TilemapBuffer_p), reclaimed by GC
  ClearWindowCommitAndRemove(0);
  FreeAllWindowBuffers();
  tasks.destroy(taskId);
  sScene?.leave();
  sScene = null;
  sGame!.CB2_ReturnToFieldContinueScriptPlayMapMusic();
}

/** battle_records.c static void ClearWindowCommitAndRemove. */
function ClearWindowCommitAndRemove(windowId: number): void {
  FillWindowPixelBuffer(windowId, PIXEL_FILL(0));
  ClearWindowTilemap(windowId);
  CopyWindowToVram(windowId, C.COPYWIN_GFX);
  RemoveWindow(windowId);
}

/** battle_records.c static void ResetGpu (DmaClear of VRAM/OAM/PLTT adapted to the browser-owned arrays). */
function ResetGpu(): void {
  ppu.vram.fill(0);
  ppu.oam.fill(0);
  ppu.pltt.fill(0);
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  for (let bg = 0; bg < 4; bg++) {
    SetGpuReg(REG_OFFSET_BG0CNT + bg * 2, 0);
    SetGpuReg(REG_OFFSET_BG0HOFS + bg * 4, 0);
    SetGpuReg(REG_OFFSET_BG0VOFS + bg * 4, 0);
  }
  for (const reg of [REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDY]) SetGpuReg(reg, 0);
}

/** battle_records.c static void StopAllRunningTasks. */
function StopAllRunningTasks(): void {
  ScanlineEffect_Stop();
  tasks.reset();
  ResetSpriteData();
  ResetAllPicSprites();
  ResetPaletteFade();
  FreeAllSpritePalettes();
}

/** battle_records.c static void EnableDisplay. */
function EnableDisplay(): void {
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG0_ON | DISPCNT_BG3_ON);
}

/** battle_records.c static void ResetBGPos. */
function ResetBGPos(): void {
  for (let bg = 0; bg < 4; bg++) {
    ChangeBgX(bg, 0, 0);
    ChangeBgY(bg, 0, 0);
  }
}

/** battle_records.c static void ClearLinkBattleRecord (CpuFill16 zero-fill of the entry). */
function ClearLinkBattleRecord(record: LinkBattleRecordSave): void {
  record.name.fill(0);
  record.name[0] = EOS;
  record.trainerId = 0;
  record.wins = 0;
  record.losses = 0;
  record.draws = 0;
}

/** battle_records.c static void ClearLinkBattleRecords. */
function ClearLinkBattleRecords(records: LinkBattleRecordsSave): void {
  for (let i = 0; i < C.LINK_B_RECORDS_COUNT; i++)
    ClearLinkBattleRecord(records.entries[i]);
  SetGameStat(C.GAME_STAT_LINK_BATTLE_WINS, 0);
  SetGameStat(C.GAME_STAT_LINK_BATTLE_LOSSES, 0);
  SetGameStat(C.GAME_STAT_LINK_BATTLE_DRAWS, 0);
}

/** battle_records.c static s32 GetLinkBattleRecordTotalBattles. */
function GetLinkBattleRecordTotalBattles(record: LinkBattleRecordSave): number {
  return record.wins + record.losses + record.draws;
}

/** battle_records.c static s32 IndexOfOpponentLinkBattleRecord. */
function IndexOfOpponentLinkBattleRecord(records: LinkBattleRecordsSave, name: ArrayLike<number>, trainerId: number): number {
  for (let i = 0; i < C.LINK_B_RECORDS_COUNT; i++) {
    if (StringCompareN(records.entries[i].name, name, C.PLAYER_NAME_LENGTH) === 0 && records.entries[i].trainerId === trainerId)
      return i;
  }
  return C.LINK_B_RECORDS_COUNT;
}

/** battle_records.c static void SortLinkBattleRecords (descending by total battles). */
function SortLinkBattleRecords(records: LinkBattleRecordsSave): void {
  for (let i = C.LINK_B_RECORDS_COUNT - 1; i > 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (GetLinkBattleRecordTotalBattles(records.entries[i]) > GetLinkBattleRecordTotalBattles(records.entries[j])) {
        const tmp = records.entries[i];
        records.entries[i] = records.entries[j];
        records.entries[j] = tmp;
      }
    }
  }
}

/** battle_records.c static void UpdateLinkBattleRecord. */
function UpdateLinkBattleRecord(record: LinkBattleRecordSave, outcome: number): void {
  switch (outcome) {
    case C.B_OUTCOME_WON:
      record.wins++;
      if (record.wins > 9999)
        record.wins = 9999;
      break;
    case C.B_OUTCOME_LOST:
      record.losses++;
      if (record.losses > 9999)
        record.losses = 9999;
      break;
    case C.B_OUTCOME_DREW:
      record.draws++;
      if (record.draws > 9999)
        record.draws = 9999;
      break;
  }
}

/** battle_records.c static void UpdateLinkBattleGameStats. */
function UpdateLinkBattleGameStats(outcome: number): void {
  let statId: number;
  switch (outcome) {
    case C.B_OUTCOME_WON:
      statId = C.GAME_STAT_LINK_BATTLE_WINS;
      break;
    case C.B_OUTCOME_LOST:
      statId = C.GAME_STAT_LINK_BATTLE_LOSSES;
      break;
    case C.B_OUTCOME_DREW:
      statId = C.GAME_STAT_LINK_BATTLE_DRAWS;
      break;
    default:
      return;
  }
  if (GetGameStat(statId) < 9999)
    IncrementGameStat(statId);
}

/** battle_records.c static void AddOpponentLinkBattleRecord. The Japanese prefix goes
 *  into namebuf[2]; bytes past the 8-byte buffer are dropped instead of overrunning
 *  a stack array as the C can. */
function AddOpponentLinkBattleRecord(records: LinkBattleRecordsSave, name: ArrayLike<number>, trainerId: number, outcome: number, language: number): void {
  const namebuf = new Uint8Array(C.PLAYER_NAME_LENGTH + 1);
  if (language === C.LANGUAGE_JAPANESE) {
    namebuf[0] = EXT_CTRL_CODE_BEGIN;
    namebuf[1] = C.EXT_CTRL_CODE_JPN;
    StringCopy(namebuf, name, 2);
  } else
    StringCopy(namebuf, name);
  UpdateLinkBattleGameStats(outcome);
  SortLinkBattleRecords(records);
  let i = IndexOfOpponentLinkBattleRecord(records, namebuf, trainerId);
  if (i === C.LINK_B_RECORDS_COUNT) {
    i = C.LINK_B_RECORDS_COUNT - 1;
    const record = records.entries[C.LINK_B_RECORDS_COUNT - 1];
    ClearLinkBattleRecord(record);
    // StringCopyN takes a Uint8Array destination; the save keeps the name as bytes for JSON.
    const stored = Uint8Array.from(record.name);
    StringCopyN(stored, namebuf, C.PLAYER_NAME_LENGTH);
    record.name = Array.from(stored);
    record.trainerId = trainerId;
  }
  UpdateLinkBattleRecord(records.entries[i], outcome);
  SortLinkBattleRecords(records);
}

/** battle_records.c void ClearPlayerLinkBattleRecords (called by new_game.c NewGameInitData). */
export function ClearPlayerLinkBattleRecords(): void {
  ClearLinkBattleRecords(save.linkBattleRecords);
}

/** battle_records.c static void IncTrainerCardWinCount (gTrainerCards[].rse.linkBattleWins). */
function IncTrainerCardWinCount(battlerId: number): void {
  const wins = gTrainerCards[battlerId].linkBattleWins;
  gTrainerCards[battlerId].linkBattleWins = wins + 1 > 9999 ? 9999 : wins + 1;
}

/** battle_records.c static void IncTrainerCardLossCount (gTrainerCards[].rse.linkBattleLosses). */
function IncTrainerCardLossCount(battlerId: number): void {
  const losses = gTrainerCards[battlerId].linkBattleLosses;
  gTrainerCards[battlerId].linkBattleLosses = losses + 1 > 9999 ? 9999 : losses + 1;
}

/** battle_records.c static void UpdateBattleOutcomeOnTrainerCards. */
function UpdateBattleOutcomeOnTrainerCards(battlerId: number): void {
  switch (G.gBattleOutcome) {
    case C.B_OUTCOME_WON:
      IncTrainerCardWinCount(battlerId ^ 1);
      IncTrainerCardLossCount(battlerId);
      break;
    case C.B_OUTCOME_LOST:
      IncTrainerCardLossCount(battlerId ^ 1);
      IncTrainerCardWinCount(battlerId);
      break;
  }
}

/** battle_records.c void UpdatePlayerLinkBattleRecords (cable_club.c caller is still unported). */
export function UpdatePlayerLinkBattleRecords(battlerId: number): void {
  if (!InUnionRoom()) {
    UpdateBattleOutcomeOnTrainerCards(battlerId);
    AddOpponentLinkBattleRecord(save.linkBattleRecords, gTrainerCards[battlerId].playerName, gTrainerCards[battlerId].trainerId, G.gBattleOutcome, gLinkPlayers[battlerId].language);
  }
}

/** battle_records.c static void PrintTotalRecord (sStringVars are the live gStringVar1..3). */
function PrintTotalRecord(records: LinkBattleRecordsSave): void {
  let nwins = GetGameStat(C.GAME_STAT_LINK_BATTLE_WINS);
  let nlosses = GetGameStat(C.GAME_STAT_LINK_BATTLE_LOSSES);
  let ndraws = GetGameStat(C.GAME_STAT_LINK_BATTLE_DRAWS);
  if (nwins > 9999)
    nwins = 9999;
  if (nlosses > 9999)
    nlosses = 9999;
  if (ndraws > 9999)
    ndraws = 9999;
  stringVars.var1 = new Uint8Array(32); // gStringVar1[32]
  stringVars.var2 = new Uint8Array(20); // gStringVar2[20]
  stringVars.var3 = new Uint8Array(20); // gStringVar3[20]
  ConvertIntToDecimalStringN(stringVars.var1, nwins, C.STR_CONV_MODE_LEFT_ALIGN, 4);
  ConvertIntToDecimalStringN(stringVars.var2, nlosses, C.STR_CONV_MODE_LEFT_ALIGN, 4);
  ConvertIntToDecimalStringN(stringVars.var3, ndraws, C.STR_CONV_MODE_LEFT_ALIGN, 4);
  for (const strvar of [stringVars.var1, stringVars.var2, stringVars.var3]) {
    let foundEnd = false;
    for (let j = 0; j < 4; j++) {
      if (!foundEnd && strvar[j] === EOS)
        foundEnd = true;
      if (foundEnd)
        strvar[j] = CHAR_SPACE;
    }
    strvar[4] = EOS;
  }
  const text = new Uint8Array(STRING_VAR4_LENGTH);
  StringExpandPlaceholders(text, rom.text("gString_BattleRecords_TotalRecord"));
  stringVars.var4 = text;
  AddTextPrinterParameterized4(0, C.FONT_NORMAL, 12, 24, 0, 2, textColors(), 0, text);
}

/** battle_records.c static void PrintOpponentBattleRecord. */
function PrintOpponentBattleRecord(record: LinkBattleRecordSave, y: number): void {
  const colors = textColors();
  stringVars.var1 = new Uint8Array(32); // gStringVar1[32]
  if (record.wins === 0 && record.losses === 0 && record.draws === 0) {
    AddTextPrinterParameterized4(0, C.FONT_NORMAL, 0, y, 0, 2, colors, 0, rom.text("gString_BattleRecords_7Dashes"));
    for (let i = 0; i < 3; i++) {
      const x = i === 0 ? 0x54 : i === 1 ? 0x84 : 0xb4;
      AddTextPrinterParameterized4(0, C.FONT_NORMAL, x, y, 0, 2, colors, 0, rom.text("gString_BattleRecords_4Dashes"));
    }
  } else {
    for (let i = 0; i < 4; i++) {
      let x: number;
      if (i === 0) {
        x = 0;
        StringFillWithTerminator(stringVars.var1, C.PLAYER_NAME_LENGTH + 1);
        StringCopyN(stringVars.var1, record.name, C.PLAYER_NAME_LENGTH);
      } else if (i === 1) {
        x = 0x54;
        ConvertIntToDecimalStringN(stringVars.var1, record.wins, C.STR_CONV_MODE_RIGHT_ALIGN, 4);
      } else if (i === 2) {
        x = 0x84;
        ConvertIntToDecimalStringN(stringVars.var1, record.losses, C.STR_CONV_MODE_RIGHT_ALIGN, 4);
      } else {
        x = 0xb4;
        ConvertIntToDecimalStringN(stringVars.var1, record.draws, C.STR_CONV_MODE_RIGHT_ALIGN, 4);
      }
      AddTextPrinterParameterized4(0, C.FONT_NORMAL, x, y, 0, 2, colors, 0, stringVars.var1);
    }
  }
}

/** battle_records.c static void PrintBattleRecords. */
function PrintBattleRecords(): void {
  FillWindowPixelRect(0, PIXEL_FILL(0), 0, 0, 0xd8, 0x90);
  const title = new Uint8Array(STRING_VAR4_LENGTH);
  StringExpandPlaceholders(title, rom.text("gString_BattleRecords_PlayersBattleResults"));
  stringVars.var4 = title;
  // C: u32 left = 0xD0 - GetStringWidth(...); the title is narrower than 0xD0,
  // so the JS number holds the same value the u32/u8 arguments would.
  const left = 0xd0 - GetStringWidth(C.FONT_NORMAL, title, -1);
  AddTextPrinterParameterized4(0, C.FONT_NORMAL, Math.floor(left / 2), 4, 0, 2, textColors(), 0, title);
  PrintTotalRecord(save.linkBattleRecords);
  AddTextPrinterParameterized4(0, C.FONT_NORMAL, 0x54, 0x30, 0, 2, textColors(), 0, rom.text("gString_BattleRecords_ColumnHeaders"));
  for (let i = 0; i < C.LINK_B_RECORDS_COUNT; i++)
    PrintOpponentBattleRecord(save.linkBattleRecords.entries[i], 0x3d + 14 * i);
  CommitWindow(0);
}

/** battle_records.c static void CommitWindow. */
function CommitWindow(windowId: number): void {
  PutWindowTilemap(windowId);
  CopyWindowToVram(windowId, C.COPYWIN_FULL);
}

/** battle_records.c static void LoadFrameGfxOnBg. */
function LoadFrameGfxOnBg(bg: number): void {
  LoadBgTiles(bg, incbin("battle_records.c:sTiles"), 0xc0, 0);
  CopyToBgTilemapBufferRect(bg, incbin16("battle_records.c:sTilemap"), 0, 0, 32, 32);
  LoadPalette(incbin("battle_records.c:sPalette"), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
}
