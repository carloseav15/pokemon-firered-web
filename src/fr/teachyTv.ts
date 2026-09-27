// Partial port of teachy_tv.c: 30 of the 58 C functions are stubs (graphics,
// windows, map buffer, battle demo) and the game does not open this screen yet;
// it still uses the text adapter in menus/keyItemScreens.ts. Intended content:
// - Main TV frame, window and list menu (sBgTemplates, sWindowTemplates, sListMenuTemplate)
// - Pokédude host NPC movement and animation across TV background
// - Narration text printing and program options
// - Demo script sequences (TTVcmd_*)
// - Fade and return callbacks (InitTeachyTvController, CB2_ReturnToTeachyTV)

import * as C from "./generated/constants";
import { gMain, SetMainCallback2, type MainCallback } from "./hw/runtime";
import { tasks, type Task } from "./gba/tasks";
import { joy, JOY_NEW, A_BUTTON, B_BUTTON, DPAD_UP, DPAD_DOWN } from "./gba/input";
import { sound } from "./audio/sound";
import { rom } from "./rom";
import { cdata, loadCData, incbin, incbin16 } from "./hw/assets";
import { decode } from "./gba/charmap";
import { InitPokedudeBagRegister, InitPokedudeBagTMs } from "./bagMenu";

export interface TeachyTvStaticResources {
  mode: number;
  callback: MainCallback | null;
  scrollOffset: number;
  selectedRow: number;
  whichScript: number;
}

export const sStaticResources: TeachyTvStaticResources = {
  mode: 0,
  callback: null,
  scrollOffset: 0,
  selectedRow: 0,
  whichScript: 0,
};

export let sResources: any = null;

export const TTVSCR_BATTLE = 0;
export const TTVSCR_STATUS = 1;
export const TTVSCR_MATCHUPS = 2;
export const TTVSCR_CATCHING = 3;
export const TTVSCR_TMS = 4;
export const TTVSCR_REGISTER = 5;

/** InitTeachyTvController */
export function InitTeachyTvController(mode: number, cb: MainCallback | null): void {
  sStaticResources.mode = mode;
  sStaticResources.callback = cb;
  if (mode === 0) {
    sStaticResources.scrollOffset = 0;
    sStaticResources.selectedRow = 0;
    sStaticResources.whichScript = TTVSCR_BATTLE;
  }
  if (mode === 1) {
    sStaticResources.mode = 0;
  }
  gMain.state = 0;
  SetMainCallback2(TeachyTvMainCallback);
}

/** CB2_ReturnToTeachyTV */
export function CB2_ReturnToTeachyTV(): void {
  if (sStaticResources.mode === 1) {
    InitTeachyTvController(1, sStaticResources.callback);
  } else {
    InitTeachyTvController(2, sStaticResources.callback);
  }
}

/** SetTeachyTvControllerModeToResume */
export function SetTeachyTvControllerModeToResume(): void {
  sStaticResources.mode = 1;
}

/** TeachyTvMainCallback */
export function TeachyTvMainCallback(): void {
  switch (gMain.state) {
    case 0:
      sResources = {
        state: 0,
        clusterFuncIndex: 0,
        textPrinterActive: false,
        dudeX: 120,
        dudeY: 80,
      };
      gMain.state++;
      break;
    case 1:
      TeachyTvInitIo();
      gMain.state++;
      break;
    case 2:
      TeachyTvSetupBg();
      gMain.state++;
      break;
    case 3:
      TeachyTvLoadGraphic();
      gMain.state++;
      break;
    case 4:
      TeachyTvSetupWindow();
      gMain.state++;
      break;
    case 5:
      TeachyTvSetupObjEventAndOam();
      gMain.state++;
      break;
    case 6:
      TeachyTvSetupScrollIndicatorArrowPair();
      gMain.state++;
      break;
    case 7:
      TeachyTvCreateAndRenderRbox();
      gMain.state++;
      break;
    case 8: {
      const taskId = tasks.create(TeachyTvOptionListController, 0);
      sResources.taskId = taskId;
      gMain.state++;
      break;
    }
    case 9:
      SetMainCallback2(TeachyTvCallback);
      break;
  }
}

/** TeachyTvCallback */
export function TeachyTvCallback(): void {
  TeachyTvVblankHandler();
}

/** TeachyTvVblankHandler */
export function TeachyTvVblankHandler(): void {}

/** TeachyTvInitIo */
export function TeachyTvInitIo(): void {}

/** TeachyTvSetupBg */
export function TeachyTvSetupBg(): void {}

/** TeachyTvLoadGraphic */
export function TeachyTvLoadGraphic(): void {}

/** TeachyTvSetupWindow */
export function TeachyTvSetupWindow(): number {
  return 0;
}

/** TeachyTvSetWindowRegs */
export function TeachyTvSetWindowRegs(): void {}

/** TeachyTvClearWindowRegs */
export function TeachyTvClearWindowRegs(): void {}

/** TeachyTvSetupObjEventAndOam */
export function TeachyTvSetupObjEventAndOam(): number {
  return 0;
}

/** TeachyTvSetupScrollIndicatorArrowPair */
export function TeachyTvSetupScrollIndicatorArrowPair(): void {}

/** TeachyTvRemoveScrollIndicatorArrowPair */
export function TeachyTvRemoveScrollIndicatorArrowPair(): void {}

/** TeachyTvCreateAndRenderRbox */
export function TeachyTvCreateAndRenderRbox(): void {}

/** TeachyTvInitTextPrinter */
export function TeachyTvInitTextPrinter(): void {}

/** TeachyTvClearBg1EndGraphicText */
export function TeachyTvClearBg1EndGraphicText(): void {}

/** TeachyTvLoadBg3Map */
export function TeachyTvLoadBg3Map(): void {}

/** TeachyTvLoadMapPalette */
export function TeachyTvLoadMapPalette(): void {}

/** TeachyTvLoadMapTilesetToBuffer */
export function TeachyTvLoadMapTilesetToBuffer(): void {}

/** TeachyTvComputeMapTilesFromTilesetAndMetaTiles */
export function TeachyTvComputeMapTilesFromTilesetAndMetaTiles(): void {}

/** TeachyTvComputePalIndexArrayEntryByMetaTile */
export function TeachyTvComputePalIndexArrayEntryByMetaTile(entry: number): number {
  return entry & 0xf;
}

/** TeachyTvPushBackNewMapPalIndexArrayEntry */
export function TeachyTvPushBackNewMapPalIndexArrayEntry(entry: number): void {}

/** TeachyTvComputeSingleMapTileBlockFromTilesetAndMetaTiles */
export function TeachyTvComputeSingleMapTileBlockFromTilesetAndMetaTiles(block: number): void {}

/** TeachyTvSetupPostBattleWindowAndObj */
export function TeachyTvSetupPostBattleWindowAndObj(mode: number): void {}

/** TeachyTvPostBattleFadeControl */
export function TeachyTvPostBattleFadeControl(taskId: number): void {}

/** TeachyTvPreBattleAnimAndSetBattleCallback */
export function TeachyTvPreBattleAnimAndSetBattleCallback(taskId: number): void {}

/** TeachyTvPrepBattle */
export function TeachyTvPrepBattle(): void {}

/** TeachyTvRestorePlayerPartyCallback */
export function TeachyTvRestorePlayerPartyCallback(): void {}

/** TeachyTvSetupBagItemsByOptionChosen */
export function TeachyTvSetupBagItemsByOptionChosen(): void {}

/** TeachyTvFree */
export function TeachyTvFree(): void {
  sResources = null;
}

/** TeachyTvQuitBeginFade */
export function TeachyTvQuitBeginFade(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  tasks.destroy(taskId);
  TeachyTvQuitFadeControlAndTaskDel();
}

/** TeachyTvQuitFadeControlAndTaskDel */
export function TeachyTvQuitFadeControlAndTaskDel(): void {
  TeachyTvFree();
  if (sStaticResources.callback) {
    const cb = sStaticResources.callback;
    sStaticResources.callback = null;
    cb();
  }
}

/** TeachyTvAudioByInput */
export function TeachyTvAudioByInput(input: number, key: boolean, listMenu: any): void {
  sound.playSE(C.SE_SELECT);
}

/** TeachyTvOptionListController */
export function TeachyTvOptionListController(taskId: number): void {
  if (JOY_NEW(B_BUTTON)) {
    TeachyTvQuitBeginFade(taskId);
    return;
  }
  if (JOY_NEW(DPAD_UP)) {
    sound.playSE(C.SE_SELECT);
    sStaticResources.selectedRow = (sStaticResources.selectedRow - 1 + 6) % 6;
  } else if (JOY_NEW(DPAD_DOWN)) {
    sound.playSE(C.SE_SELECT);
    sStaticResources.selectedRow = (sStaticResources.selectedRow + 1) % 6;
  } else if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    sStaticResources.whichScript = sStaticResources.selectedRow;
    TeachyTvRenderMsgAndSwitchClusterFuncs(taskId);
  }
}

/** TeachyTvRenderMsgAndSwitchClusterFuncs */
export function TeachyTvRenderMsgAndSwitchClusterFuncs(taskId: number): void {
  if (!sResources) return;
  sResources.clusterFuncIndex = 0;
  TTVcmd_TransitionRenderBg2TeachyTvGraphicInitNpcPos(taskId);
}

/** TeachyTvBg2AnimController */
export function TeachyTvBg2AnimController(taskId: number): void {}

/** TeachyTvSetSpriteCoordsAndSwitchFrame */
export function TeachyTvSetSpriteCoordsAndSwitchFrame(): void {}

/** TeachyTvGrassAnimationMain */
export function TeachyTvGrassAnimationMain(): void {}

/** TeachyTvGrassAnimationCheckIfNeedsToGenerateGrassObj */
export function TeachyTvGrassAnimationCheckIfNeedsToGenerateGrassObj(): boolean {
  return false;
}

/** TeachyTvGrassAnimationObjCallback */
export function TeachyTvGrassAnimationObjCallback(sprite: any): void {}

// -------------------------------------------------------------
// Teachy TV Command Scripts (TTVcmd_*)
// -------------------------------------------------------------

/** TTVcmd_TransitionRenderBg2TeachyTvGraphicInitNpcPos */
export function TTVcmd_TransitionRenderBg2TeachyTvGraphicInitNpcPos(taskId: number): void {
  TTVcmd_ClearBg2TeachyTvGraphic(taskId);
}

/** TTVcmd_ClearBg2TeachyTvGraphic */
export function TTVcmd_ClearBg2TeachyTvGraphic(taskId: number): void {
  TTVcmd_NpcMoveAndSetupTextPrinter(taskId);
}

/** TTVcmd_NpcMoveAndSetupTextPrinter */
export function TTVcmd_NpcMoveAndSetupTextPrinter(taskId: number): void {
  TTVcmd_TextPrinterSwitchStringByOptionChosen(taskId);
}

/** TTVcmd_IdleIfTextPrinterIsActive */
export function TTVcmd_IdleIfTextPrinterIsActive(taskId: number): void {
  TTVcmd_TextPrinterSwitchStringByOptionChosen2(taskId);
}

/** TTVcmd_TextPrinterSwitchStringByOptionChosen */
export function TTVcmd_TextPrinterSwitchStringByOptionChosen(taskId: number): void {
  TTVcmd_IdleIfTextPrinterIsActive(taskId);
}

/** TTVcmd_TextPrinterSwitchStringByOptionChosen2 */
export function TTVcmd_TextPrinterSwitchStringByOptionChosen2(taskId: number): void {
  TTVcmd_IdleIfTextPrinterIsActive2(taskId);
}

/** TTVcmd_IdleIfTextPrinterIsActive2 */
export function TTVcmd_IdleIfTextPrinterIsActive2(taskId: number): void {
  TTVcmd_EraseTextWindowIfKeyPressed(taskId);
}

/** TTVcmd_EraseTextWindowIfKeyPressed */
export function TTVcmd_EraseTextWindowIfKeyPressed(taskId: number): void {
  TTVcmd_StartAnimNpcWalkIntoGrass(taskId);
}

/** TTVcmd_StartAnimNpcWalkIntoGrass */
export function TTVcmd_StartAnimNpcWalkIntoGrass(taskId: number): void {
  TTVcmd_DudeMoveUp(taskId);
}

/** TTVcmd_DudeMoveUp */
export function TTVcmd_DudeMoveUp(taskId: number): void {
  TTVcmd_DudeMoveRight(taskId);
}

/** TTVcmd_DudeMoveRight */
export function TTVcmd_DudeMoveRight(taskId: number): void {
  TTVcmd_DudeTurnLeft(taskId);
}

/** TTVcmd_DudeTurnLeft */
export function TTVcmd_DudeTurnLeft(taskId: number): void {
  TTVcmd_DudeMoveLeft(taskId);
}

/** TTVcmd_DudeMoveLeft */
export function TTVcmd_DudeMoveLeft(taskId: number): void {
  TTVcmd_RenderAndRemoveBg1EndGraphic(taskId);
}

/** TTVcmd_RenderAndRemoveBg1EndGraphic */
export function TTVcmd_RenderAndRemoveBg1EndGraphic(taskId: number): void {
  TTVcmd_TaskBattleOrFadeByOptionChosen(taskId);
}

/** TTVcmd_TaskBattleOrFadeByOptionChosen */
export function TTVcmd_TaskBattleOrFadeByOptionChosen(taskId: number): void {
  if (sStaticResources.whichScript === TTVSCR_TMS) {
    InitPokedudeBagTMs(() => CB2_ReturnToTeachyTV(), SetTeachyTvControllerModeToResume);
    return;
  }
  if (sStaticResources.whichScript === TTVSCR_REGISTER) {
    InitPokedudeBagRegister(() => CB2_ReturnToTeachyTV());
    return;
  }
  TTVcmd_End(taskId);
}

/** TTVcmd_End */
export function TTVcmd_End(taskId: number): void {
  TeachyTvOptionListController(taskId);
}

/** openTeachyTv bridge for callers from field and menus */
export function openTeachyTv(done: () => void): void {
  InitTeachyTvController(0, done);
}
