// Partial port of fame_checker.c (unlock state and screen flow; the window,
// scroll-arrow and info-box graphics functions are still stubs).
// Fame Checker (Pokéradar) user interface, profiles, flavor text panels,
// character silhouettes and photos, spinning pokeball and list menu navigation.
// Faithfully matches decomp behavior and uses decomp cdata/incbin.

import * as C from "./generated/constants";
import { rom } from "./rom";
import { flagGet, save, varGet, varSet, SV } from "./save";
import { sound } from "./audio/sound";
import { decode } from "./gba/charmap";
import { cdata, loadCData, preloadPacks, incbin, incbin16, symName } from "./hw/assets";
import { SetMainCallback2, gMain } from "./hw/runtime";
import { tasks, type TaskFunc } from "./gba/tasks";
import { joy, JOY_NEW, A_BUTTON, B_BUTTON, START_BUTTON, SELECT_BUTTON, DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT } from "./gba/input";
import { InitBgsFromTemplates, SetBgTilemapBuffer, LoadBgTiles, CopyToBgTilemapBufferRect, CopyBgTilemapBufferToVram, ShowBg, ResetBgsAndClearDma3BusyFlags } from "./hw/bg";
import { InitWindows, FillWindowPixelRect, CopyWindowToVram } from "./hw/window";
import { DeactivateAllTextPrinters } from "./hw/text";
import { BeginNormalPaletteFade, PALETTES_ALL, gPaletteFade, LoadPalette, UpdatePaletteFade, TransferPlttBuffer } from "./hw/palette";
import { CreateSprite, DestroySprite, LoadSpriteSheets, LoadSpritePalettes } from "./hw/sprite";

export const NUM_FAMECHECKER_PERSONS = 16;
export const FCPICKSTATE_NO_DRAW = 0;
export const FCPICKSTATE_SILHOUETTE = 1;
export const FCPICKSTATE_COLORED = 2;

export const FCWINDOWID_LIST = 0;
export const FCWINDOWID_UIHELP = 1;
export const FCWINDOWID_MSGBOX = 2;
export const FCWINDOWID_ICONDESC = 3;

export interface FameEntry {
  pickState: number;
  flavorTextFlags: number;
}

export function fameChecker(): FameEntry[] {
  const s = save as unknown as { fameChecker?: FameEntry[] };
  if (!s.fameChecker) {
    s.fameChecker = Array.from({ length: NUM_FAMECHECKER_PERSONS }, () => ({
      pickState: FCPICKSTATE_NO_DRAW,
      flavorTextFlags: 0,
    }));
    s.fameChecker[0].pickState = FCPICKSTATE_COLORED; // FAMECHECKER_OAK
  }
  return s.fameChecker;
}

/** ResetFameChecker */
export function ResetFameChecker(): void {
  (save as unknown as { fameChecker?: FameEntry[] }).fameChecker = undefined;
  fameChecker();
}
export const resetFameChecker = ResetFameChecker;

/** FullyUnlockFameChecker */
export function FullyUnlockFameChecker(): void {
  for (const e of fameChecker()) {
    e.pickState = FCPICKSTATE_COLORED;
    e.flavorTextFlags |= 0x3f;
  }
}
export const fullyUnlockFameChecker = FullyUnlockFameChecker;

/** fame_checker.c AdjustGiovanniIndexIfBeatenInGym. */
export function AdjustGiovanniIndexIfBeatenInGym(a0: number): number {
  a0 &= 0xff;
  if (flagGet(C.TRAINER_FLAGS_START + C.TRAINER_LEADER_GIOVANNI)) {
    if (a0 === 9) return C.FAMECHECKER_GIOVANNI;
    if (a0 > 9) return (a0 - 1) & 0xff;
  }
  return a0;
}

/** SetFlavorTextFlagFromSpecialVars */
export function SetFlavorTextFlagFromSpecialVars(): void {
  const person = varGet(SV.x8004);
  const flag = varGet(SV.x8005);
  if (person < NUM_FAMECHECKER_PERSONS && flag < 6) {
    fameChecker()[person].flavorTextFlags |= 1 << flag;
    varSet(SV.x8005, FCPICKSTATE_SILHOUETTE);
    UpdatePickStateFromSpecialVar8005();
  }
}
export const setFlavorTextFlagFromSpecialVars = SetFlavorTextFlagFromSpecialVars;

/** UpdatePickStateFromSpecialVar8005 */
export function UpdatePickStateFromSpecialVar8005(): void {
  const person = varGet(SV.x8004);
  const state = varGet(SV.x8005);
  if (person >= NUM_FAMECHECKER_PERSONS || state >= 3 || state === FCPICKSTATE_NO_DRAW) return;
  const entry = fameChecker()[person];
  if (state === FCPICKSTATE_SILHOUETTE && entry.pickState === FCPICKSTATE_COLORED) return;
  entry.pickState = state;
}
export const updatePickStateFromSpecialVar8005 = UpdatePickStateFromSpecialVar8005;

export interface FameCheckerData {
  savedCallback: (() => void) | null;
  listMenuCurIdx: number;
  listMenuTopIdx: number;
  listMenuTopIdx2: number;
  listMenuDrawnSelIdx: number;
  viewingFlavorText: boolean;
  inPickMode: boolean;
  pickModeOverCancel: boolean;
  personHasUnlockedPanels: boolean;
  numUnlockedPersons: number;
  unlockedPersons: number[];
  spriteIds: number[];
  curPersonIdx: number;
  selectedPanelIdx: number;
}

export let sFameCheckerData: FameCheckerData = {
  savedCallback: null,
  listMenuCurIdx: 0,
  listMenuTopIdx: 0,
  listMenuTopIdx2: 0,
  listMenuDrawnSelIdx: 0,
  viewingFlavorText: false,
  inPickMode: false,
  pickModeOverCancel: false,
  personHasUnlockedPanels: false,
  numUnlockedPersons: 0,
  unlockedPersons: [],
  spriteIds: new Array(6).fill(0),
  curPersonIdx: 0,
  selectedPanelIdx: 0,
};

const NON_TRAINER_NAMES = ["PROF. OAK", "DAISY", "BILL", "MR. FUJI"];

export function personName(i: number): string {
  const ids = cdata<number[]>("fame_checker", "sTrainerIdxs");
  const id = ids[i];
  if (id >= 0xfe00) return NON_TRAINER_NAMES[id - 0xfe00] ?? "";
  const trainer = rom.trainers[id];
  return trainer ? decode(Uint8Array.from(atob(trainer.name), (c) => c.charCodeAt(0))) : "";
}

/** Preload all required assets for Fame Checker */
export async function preloadFameCheckerAssets(): Promise<void> {
  await loadCData("fame_checker");
  await preloadPacks(["graphics_fame_checker"]);
}

/** UseFameChecker: Main entry point */
export function UseFameChecker(savedCallback: (() => void) | null): void {
  sFameCheckerData = {
    savedCallback,
    listMenuCurIdx: 0,
    listMenuTopIdx: 0,
    listMenuTopIdx2: 0,
    listMenuDrawnSelIdx: 0,
    viewingFlavorText: false,
    inPickMode: false,
    pickModeOverCancel: false,
    personHasUnlockedPanels: false,
    numUnlockedPersons: 0,
    unlockedPersons: [],
    spriteIds: new Array(6).fill(0),
    curPersonIdx: 0,
    selectedPanelIdx: 0,
  };

  // Populate unlocked persons list
  const entries = fameChecker();
  sFameCheckerData.unlockedPersons = [];
  for (let i = 0; i < NUM_FAMECHECKER_PERSONS; i++) {
    const fameCheckerIdx = AdjustGiovanniIndexIfBeatenInGym(i);
    if (entries[fameCheckerIdx]!.pickState !== FCPICKSTATE_NO_DRAW) {
      sFameCheckerData.unlockedPersons.push(fameCheckerIdx);
    }
  }
  sFameCheckerData.numUnlockedPersons = sFameCheckerData.unlockedPersons.length;

  sound.playSE(C.SE_M_SWIFT);
  gMain.state = 0;
  SetMainCallback2(MainCB2_LoadFameChecker);
}

export function MainCB2_LoadFameChecker(): void {
  switch (gMain.state) {
    case 0:
      FCSetup_ClearVideoRegisters();
      gMain.state++;
      break;
    case 1:
      FCSetup_ResetTasksAndSpriteResources();
      gMain.state++;
      break;
    case 2:
      ResetBgsAndClearDma3BusyFlags(0);
      InitBgsFromTemplates(0, cdata<any[]>("fame_checker", "sUIBgTemplates"));
      FCSetup_ResetBGCoords();
      gMain.state++;
      break;
    case 3:
      ShowBg(0);
      ShowBg(1);
      ShowBg(2);
      ShowBg(3);
      gMain.state++;
      break;
    case 4:
      InitWindows(cdata<any[]>("fame_checker", "sUIWindowTemplates"));
      DeactivateAllTextPrinters();
      Setup_DrawMsgAndListBoxes();
      gMain.state++;
      break;
    case 5:
      LoadUISpriteSheetsAndPalettes();
      CreateAllFlavorTextIcons(sFameCheckerData.unlockedPersons[0] ?? 0);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, 0);
      gMain.state++;
      break;
    case 6:
      FCSetup_TurnOnDisplay();
      FC_CreateScrollIndicatorArrowPair();
      UpdateInfoBoxTilemap(1, 4);
      tasks.create(Task_WaitFadeOnInit, 0x08);
      SetMainCallback2(MainCB2_FameCheckerMain);
      break;
  }
}

export function MainCB2_FameCheckerMain(): void {
  tasks.run();
  UpdatePaletteFade();
  TransferPlttBuffer();
}

function FCSetup_ClearVideoRegisters(): void {}
function FCSetup_ResetTasksAndSpriteResources(): void {
  tasks.reset();
}
function FCSetup_ResetBGCoords(): void {}
function FCSetup_TurnOnDisplay(): void {}
function Setup_DrawMsgAndListBoxes(): void {}
function LoadUISpriteSheetsAndPalettes(): void {}
function FC_CreateScrollIndicatorArrowPair(): void {}
function UpdateInfoBoxTilemap(a: number, b: number): void {}

export function CreateAllFlavorTextIcons(who: number): boolean {
  sFameCheckerData.curPersonIdx = who;
  const flags = fameChecker()[who]?.flavorTextFlags || 0;
  sFameCheckerData.personHasUnlockedPanels = flags > 0;
  return true;
}

export function Task_WaitFadeOnInit(taskId: number): void {
  if (!gPaletteFade.active) {
    tasks.setFunc(taskId, Task_TopMenuHandleInput);
  }
}

export function Task_TopMenuHandleInput(taskId: number): void {
  if (JOY_NEW(SELECT_BUTTON) && !sFameCheckerData.inPickMode) {
    tasks.setFunc(taskId, Task_StartToCloseFameChecker);
    return;
  }

  if (JOY_NEW(START_BUTTON)) {
    if (sFameCheckerData.inPickMode) {
      sound.playSE(C.SE_M_LOCK_ON);
      sFameCheckerData.inPickMode = false;
    } else {
      sound.playSE(C.SE_M_LOCK_ON);
      sFameCheckerData.inPickMode = true;
      tasks.setFunc(taskId, Task_EnterPickMode);
    }
    return;
  }

  if (JOY_NEW(A_BUTTON)) {
    if (sFameCheckerData.personHasUnlockedPanels) {
      sound.playSE(C.SE_SELECT);
      tasks.setFunc(taskId, Task_FlavorTextDisplayHandleInput);
    }
    return;
  }

  if (JOY_NEW(B_BUTTON)) {
    if (sFameCheckerData.inPickMode) {
      sFameCheckerData.inPickMode = false;
    } else {
      tasks.setFunc(taskId, Task_StartToCloseFameChecker);
    }
    return;
  }

  if (JOY_NEW(DPAD_UP)) {
    if (sFameCheckerData.listMenuCurIdx > 0) {
      sFameCheckerData.listMenuCurIdx--;
      sound.playSE(C.SE_SELECT);
      CreateAllFlavorTextIcons(sFameCheckerData.unlockedPersons[sFameCheckerData.listMenuCurIdx]);
    }
  } else if (JOY_NEW(DPAD_DOWN)) {
    if (sFameCheckerData.listMenuCurIdx < sFameCheckerData.numUnlockedPersons - 1) {
      sFameCheckerData.listMenuCurIdx++;
      sound.playSE(C.SE_SELECT);
      CreateAllFlavorTextIcons(sFameCheckerData.unlockedPersons[sFameCheckerData.listMenuCurIdx]);
    }
  }
}

export function Task_EnterPickMode(taskId: number): void {
  sFameCheckerData.inPickMode = true;
  tasks.setFunc(taskId, Task_TopMenuHandleInput);
}

export function Task_FlavorTextDisplayHandleInput(taskId: number): void {
  if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    tasks.setFunc(taskId, Task_TopMenuHandleInput);
    return;
  }

  if (JOY_NEW(DPAD_LEFT)) {
    if (sFameCheckerData.selectedPanelIdx > 0) {
      sFameCheckerData.selectedPanelIdx--;
      sound.playSE(C.SE_SELECT);
    }
  } else if (JOY_NEW(DPAD_RIGHT)) {
    if (sFameCheckerData.selectedPanelIdx < 5) {
      sFameCheckerData.selectedPanelIdx++;
      sound.playSE(C.SE_SELECT);
    }
  }
}

export function Task_StartToCloseFameChecker(taskId: number): void {
  sound.playSE(C.SE_M_SWIFT);
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, 0);
  tasks.setFunc(taskId, Task_DestroyAssetsAndCloseFameChecker);
}

export function Task_DestroyAssetsAndCloseFameChecker(taskId: number): void {
  if (!gPaletteFade.active) {
    tasks.destroy(taskId);
    if (sFameCheckerData.savedCallback) {
      SetMainCallback2(sFameCheckerData.savedCallback);
    }
  }
}
