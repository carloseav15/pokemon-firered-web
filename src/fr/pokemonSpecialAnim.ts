// pokemon_special_anim.c and pokemon_special_anim_scene.c: the animated scene
// that plays when an item (Rare Candy, Potion, TM/HM, evolution stone) is used
// on a Pokémon from the party menu, plus the level-up vertical sprites and the
// level-up stat windows shared with the battle.
//
// Adaptations:
//  - struct PokemonSpecialAnim is a plain object; the pointer the C keeps in
//    gTasks[].data[0..1] (GetWordTaskArg(taskId, 0)) is the module-level sPSA,
//    since only one scene exists at a time. Sprite pointers stored in task data
//    (tOff_MonSprite, tOff_ItemSprite) are stored as gSprites indices.
//  - Alloc'd buffers are typed arrays; Alloc never fails, so the NULL branches
//    of AllocPSA are kept only as comments.
//  - DecompressAndCopyTileDataToVram / RequestDma3Fill complete immediately in
//    the port (INCBINs are already decompressed), so there are no temp tile
//    buffers left to free (FreeTempTileDataBuffersIfPossible is FALSE).
//  - GetMonLevelUpWindowStats returns the stats instead of filling a u16 *.
// Needs preloadPokemonSpecialAnim() before StartUseItemAnim_*.

import { sound } from "./audio/sound";
import { concat, copy, EOS, intToDecimal, STR_CONV_MODE_LEFT_ALIGN } from "./gba/charmap";
import { FONT_NORMAL, stringWidth } from "./gba/font";
import { A_BUTTON, B_BUTTON, JOY_HELD, JOY_NEW } from "./gba/input";
import { getTextSpeedSetting } from "./gba/textPrinter";
import { tasks, type TaskFunc } from "./gba/tasks";
import * as C from "./generated/constants";
import { cdata, incbin, incbin16, loadCData, preloadPacks } from "./hw/assets";
import { affineAnimsFrom, templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import {
  BG_SCREEN_SIZE, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, FillBgTilemapBufferRect_Palette0, HideBg,
  InitBgsFromTemplates, IsDma3ManagerBusyWithBgCopy, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "./hw/bg";
import { SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import { ClearStdWindowAndFrameToTransparent, LoadUserWindowGfx } from "./hw/menu";
import {
  DrawTextBorderOuter, FindTaskIdByFunc, FuncIsActiveTask, GetWordTaskArg, SetWordTaskArg,
} from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, LoadPalette, ResetPaletteFadeControl, RGB, RGB_BLACK, RGB_WHITE, TransferPlttBuffer,
  UpdatePaletteFade, PALETTES_ALL,
} from "./hw/palette";
import {
  BLDALPHA_BLEND, BLDCNT_EFFECT_NONE, BLDCNT_TGT2_ALL, DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT,
  REG_OFFSET_DISPCNT,
} from "./hw/ppu";
import { gMain, SetMainCallback2, SetVBlankCallback, type MainCallback } from "./hw/runtime";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes, FreeSpritePaletteByTag, FreeSpriteTilesByTag, gSprites,
  IndexOfSpritePaletteTag, InitSpriteAffineAnim, LoadCompressedSpriteSheet, LoadOam, LoadSpritePalette, LoadSpriteSheet, MAX_SPRITES,
  ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy, ST_OAM_AFFINE_DOUBLE, StartSpriteAffineAnim, StartSpriteAnim, type Sprite,
} from "./hw/sprite";
import { AddTextPrinterParameterized3, AddTextPrinterParameterized5, IsTextPrinterActive, RunTextPrinters } from "./hw/text";
import { gSineTable } from "./hw/trig";
import {
  ClearWindowTilemap, CopyWindowToVram, COPYWIN_FULL, COPYWIN_GFX, COPYWIN_MAP, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PIXEL_FILL,
  PutWindowTilemap, type WindowTemplate,
} from "./hw/window";
import { AddItemIconObject } from "./bagMenu";
import {
  DynamicPlaceholderTextUtil_ExpandPlaceholders, DynamicPlaceholderTextUtil_Reset, DynamicPlaceholderTextUtil_SetPlaceholderPtr,
} from "./dynamicPlaceholderTextUtil";
import { Menu2_GetMonPosAttribute, Menu2_GetStarSpritePosAttribute } from "./menu2";
import { tmhmMove } from "./menus/monProgress";
import { CheckIfItemIsTMHMOrEvolutionStone, itemName } from "./pokemon/items";
import { GetMonData, type Mon } from "./pokemon/mon";
import { playerMon } from "./pokemon/mon";
import { GetMonFrontSpritePal, LoadSpecialPokePic } from "./pokemon/pics";
import { rom } from "./rom";

const rd = <T>(name: string) => cdata<T>("pokemon_special_anim_scene", name);
const txt = (name: string) => rom.text(name);
const sym = (name: string) => `pokemon_special_anim_scene.c:${name}`;

const CHAR_SPACE = 0x00;
const TEXT_SKIP_DRAW = 0xff;
const BG_VRAM = 0;

/** Loads the data both .c files read. */
export async function preloadPokemonSpecialAnim(): Promise<void> {
  await Promise.all([
    loadCData("pokemon_special_anim_scene", "pokemon_special_anim", "menu2", "item_menu_icons", "strings", "text_window_graphics"),
    preloadPacks(["graphics_pokemon_special_anim", "graphics_items", "pokemon", "graphics_text_window", "graphics_fonts"]),
  ]);
}

// ================================================================ pokemon_special_anim.c

type PokemonSpecialAnimScene = {
  state: number;
  field_0002: number;
  field_0004: number;
  monSpriteY1: number;
  monSpriteY2: number;
  lastCloseness: number;
  monSprite: Sprite | null;
  itemIconSprite: Sprite | null;
  textBuf: Uint8Array;
  field_0914: Uint16Array;
  field_1914: Uint16Array;
};

type PokemonSpecialAnim = {
  savedCallback: MainCallback;
  pokemon: Mon;
  nickname: Uint8Array;
  nameOfMoveForgotten: Uint8Array;
  nameOfMoveToTeach: Uint8Array;
  cancelDisabled: boolean;
  state: number;
  species: number;
  itemId: number;
  animType: number;
  slotId: number;
  closeness: number;
  delayTimer: number;
  personality: number;
  field_00a4: number;
  sceneResources: PokemonSpecialAnimScene;
};

let sCancelDisabled = false;
let sPSAWork: PokemonSpecialAnim | null = null;
/** The pointer the C stores in the task's data[0..1]. */
let sPSA: PokemonSpecialAnim | null = null;

const EMPTY_NAME = () => new Uint8Array(13).fill(EOS);

/** StartUseItemAnim_Normal */
export function StartUseItemAnim_Normal(slotId: number, itemId: number, callback: MainCallback): void {
  const ptr = AllocPSA(slotId, itemId, callback);
  if (ptr === null) SetMainCallback2(callback);
  else SetUpUseItemAnim_Normal(ptr);
}

/** StartUseItemAnim_ForgetMoveAndLearnTMorHM */
export function StartUseItemAnim_ForgetMoveAndLearnTMorHM(slotId: number, itemId: number, moveId: number, callback: MainCallback): void {
  const ptr = AllocPSA(slotId, itemId, callback);
  if (ptr === null) {
    SetMainCallback2(callback);
  } else {
    ptr.nameOfMoveForgotten = copy(rom.moveName(moveId));
    SetUpUseItemAnim_ForgetMoveAndLearnTMorHM(ptr);
  }
}

/** StartUseItemAnim_CantEvolve */
export function StartUseItemAnim_CantEvolve(slotId: number, itemId: number, callback: MainCallback): void {
  const ptr = AllocPSA(slotId, itemId, callback);
  if (ptr === null) SetMainCallback2(callback);
  else SetUpUseItemAnim_CantEvolve(ptr);
}

function AllocPSA(slotId: number, itemId: number, callback: MainCallback): PokemonSpecialAnim | null {
  if (!gMain.inBattle) tasks.reset();
  ResetSpriteData();
  FreeAllSpritePalettes();
  // Alloc(sizeof(struct PokemonSpecialAnim)) cannot fail here.
  const pokemon = playerMon(slotId);
  const nickname = new Uint8Array(C.POKEMON_NAME_LENGTH + 1).fill(EOS);
  const ptr: PokemonSpecialAnim = {
    savedCallback: callback,
    pokemon: structuredClone(pokemon),
    nickname,
    nameOfMoveForgotten: EMPTY_NAME(),
    nameOfMoveToTeach: EMPTY_NAME(),
    cancelDisabled: false,
    state: 0,
    species: GetMonData(pokemon, C.MON_DATA_SPECIES),
    itemId,
    animType: GetAnimTypeByItemId(itemId),
    slotId,
    closeness: GetClosenessFromFriendship(GetMonData(pokemon, C.MON_DATA_FRIENDSHIP)),
    delayTimer: 0,
    personality: GetMonData(pokemon, C.MON_DATA_PERSONALITY),
    field_00a4: 0,
    sceneResources: {
      state: 0, field_0002: 0, field_0004: 0, monSpriteY1: 0, monSpriteY2: 0, lastCloseness: 0, monSprite: null, itemIconSprite: null,
      textBuf: new Uint8Array(0x900).fill(EOS), field_0914: new Uint16Array(BG_SCREEN_SIZE / 2), field_1914: new Uint16Array(BG_SCREEN_SIZE / 2),
    },
  };
  GetMonData(pokemon, C.MON_DATA_NICKNAME, ptr.nickname);
  if (ptr.animType === C.PSA_ITEM_ANIM_TYPE_TMHM) {
    const moveId = ItemIdToBattleMoveId(itemId);
    ptr.nameOfMoveToTeach = copy(rom.moveName(moveId));
  }
  return ptr;
}

/** item_use.c ItemIdToBattleMoveId */
function ItemIdToBattleMoveId(itemId: number): number {
  return tmhmMove(itemId);
}

function VBlankCB_PSA(): void {
  TransferPlttBuffer();
  LoadOam();
  ProcessSpriteCopyRequests();
}

function CB2_PSA(): void {
  RunTextPrinters();
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

function SetUseItemAnimCallback(taskId: number, func: TaskFunc): void {
  const ptr = GetPSAStruct();
  ptr.state = 0;
  tasks.tasks[taskId].func = func;
}

function SetUpUseItemAnim_Normal(ptr: PokemonSpecialAnim): void {
  switch (ptr.animType) {
    case C.PSA_ITEM_ANIM_TYPE_DEFAULT:
    case C.PSA_ITEM_ANIM_TYPE_POTION:
    case C.PSA_ITEM_ANIM_TYPE_UNUSED2:
      tasks.create(Task_UseItem_Normal, 0);
      break;
    case C.PSA_ITEM_ANIM_TYPE_TMHM:
      tasks.create(Task_UseTM_NoForget, 0);
      break;
    default:
      SetMainCallback2(ptr.savedCallback);
      return;
  }
  ptr.cancelDisabled = false;
  sPSA = ptr;
  SetMainCallback2(CB2_PSA);
}

function SetUpUseItemAnim_ForgetMoveAndLearnTMorHM(ptr: PokemonSpecialAnim): void {
  tasks.create(Task_ForgetMove, 0);
  sPSA = ptr;
  SetMainCallback2(CB2_PSA);
  ptr.cancelDisabled = false;
}

function SetUpUseItemAnim_CantEvolve(ptr: PokemonSpecialAnim): void {
  tasks.create(Task_EvoStone_CantEvolve, 0);
  sPSA = ptr;
  SetMainCallback2(CB2_PSA);
}

function Task_UseItem_Normal(taskId: number): void {
  const ptr = GetPSAStruct();
  if (!ptr.cancelDisabled && JOY_HELD(A_BUTTON | B_BUTTON)) {
    PSA_UseItem_CleanUpForCancel();
    SetUseItemAnimCallback(taskId, Task_CleanUp);
    return;
  }

  switch (ptr.state) {
    case 0:
      SetVBlankCallback(null);
      InitPokemonSpecialAnimScene(ptr.sceneResources, ptr.animType);
      PSA_CreateMonSpriteAtCloseness(0);
      ptr.state++;
      break;
    case 1:
      if (!PokemonSpecialAnimSceneInitIsNotFinished()) {
        BeginNormalPaletteFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
        ptr.state++;
        SetVBlankCallback(VBlankCB_PSA);
      }
      break;
    case 2:
      if (!gPaletteFade.active) ptr.state++;
      break;
    case 3:
      PSA_SetUpZoomAnim(ptr.closeness);
      ptr.state++;
      break;
    case 4:
      if (!PSA_IsZoomTaskActive()) {
        ptr.delayTimer = 0;
        ptr.state++;
      }
      break;
    case 5:
      if (!PSA_LevelUpVerticalSpritesTaskIsRunning()) ptr.state++;
      break;
    case 6:
      PSA_SetUpItemUseOnMonAnim(ptr.itemId, ptr.closeness, true);
      ptr.state++;
      break;
    case 7:
      if (!PSA_IsItemUseOnMonAnimActive()) {
        ptr.cancelDisabled = true;
        if (ptr.closeness === 3) sound.PlayCry_Normal(ptr.species, 0);
        PSA_ShowMessageWindow();
        ptr.state++;
      }
      break;
    case 8:
      PSA_PrintMessage(C.PSA_TEXT_ITEM_USED);
      ptr.state++;
      break;
    case 9:
      if (!PSA_IsMessagePrintTaskActive()) ptr.state++;
      break;
    case 10:
      PSA_SetUpZoomAnim(0);
      ptr.state++;
      break;
    case 11:
      if (!PSA_IsZoomTaskActive()) {
        ptr.cancelDisabled = true;
        ptr.state++;
      }
      break;
    case 12:
      if (JOY_NEW(A_BUTTON | B_BUTTON)) {
        if (CheckIfItemIsTMHMOrEvolutionStone(ptr.itemId) !== 2) { // evo stone
          BeginNormalPaletteFade(PALETTES_ALL, -1, 0, 16, RGB_BLACK);
          ptr.state++;
        } else {
          ptr.state += 2;
        }
      }
      break;
    case 13:
      if (!gPaletteFade.active) ptr.state++;
      break;
    case 14:
      SetMainCallback2(ptr.savedCallback);
      PSA_FreeWindowBuffers();
      sPSA = null; // Free(ptr)
      tasks.destroy(taskId);
      break;
  }
}

function Task_ForgetMove(taskId: number): void {
  const ptr = GetPSAStruct();

  switch (ptr.state) {
    case 0:
      SetVBlankCallback(null);
      InitPokemonSpecialAnimScene(ptr.sceneResources, ptr.animType);
      PSA_CreateMonSpriteAtCloseness(3);
      ptr.state++;
      break;
    case 1:
      if (!PokemonSpecialAnimSceneInitIsNotFinished()) {
        BeginNormalPaletteFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
        ptr.state++;
        SetVBlankCallback(VBlankCB_PSA);
      }
      break;
    case 2:
      if (!gPaletteFade.active) {
        ptr.delayTimer = 0;
        ptr.state++;
      }
      break;
    case 3:
      ptr.delayTimer++;
      if (ptr.delayTimer > 30) {
        PSA_ShowMessageWindow();
        ptr.state++;
      }
      break;
    case 4:
      PSA_PrintMessage(C.PSA_TEXT_FORGET_1);
      ptr.state++;
      break;
    case 5:
      if (!PSA_IsMessagePrintTaskActive()) {
        ptr.delayTimer = 0;
        ptr.state++;
      }
      break;
    case 6:
      ptr.delayTimer++;
      if (ptr.delayTimer > 30) {
        PSA_PrintMessage(C.PSA_TEXT_FORGET_2_AND);
        ptr.state++;
      }
      break;
    case 7:
      if (!PSA_IsMessagePrintTaskActive()) {
        ptr.delayTimer = 0;
        ptr.state++;
      }
      break;
    case 8:
      ptr.delayTimer++;
      if (ptr.delayTimer > 30) {
        sound.playSE(C.SE_M_SPIT_UP);
        PSA_PrintMessage(C.PSA_TEXT_FORGET_POOF);
        PSA_DarkenMonSprite();
        ptr.state++;
      }
      break;
    case 9: {
      const r4 = PSA_RunPoofAnim();
      if (!(Number(r4) | Number(PSA_IsMessagePrintTaskActive()))) {
        PSA_AfterPoof_ClearMessageWindow();
        ptr.state++;
      }
      break;
    }
    case 10:
      PSA_PrintMessage(C.PSA_TEXT_FORGET_FORGOT);
      ptr.state++;
      break;
    case 11:
      if (!PSA_IsMessagePrintTaskActive()) {
        PSA_PrintMessage(C.PSA_TEXT_FORGET_AND);
        ptr.state++;
      }
      break;
    case 12:
      if (!PSA_IsMessagePrintTaskActive()) {
        PSA_HideMessageWindow();
        ptr.state++;
      }
      break;
    case 13:
      SetUseItemAnimCallback(taskId, Task_MachineSet);
      break;
  }
}

function Task_EvoStone_CantEvolve(taskId: number): void {
  const ptr = GetPSAStruct();

  if (!ptr.cancelDisabled && JOY_HELD(B_BUTTON)) {
    SetUseItemAnimCallback(taskId, Task_CleanUp);
    return;
  }

  switch (ptr.state) {
    case 0:
      SetVBlankCallback(null);
      InitPokemonSpecialAnimScene(ptr.sceneResources, ptr.animType);
      PSA_CreateMonSpriteAtCloseness(0);
      ptr.state++;
      break;
    case 1:
      if (!PokemonSpecialAnimSceneInitIsNotFinished()) {
        BeginNormalPaletteFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
        ptr.state++;
        SetVBlankCallback(VBlankCB_PSA);
      }
      break;
    case 2:
      if (!gPaletteFade.active) ptr.state++;
      break;
    case 3:
      PSA_SetUpZoomAnim(ptr.closeness);
      ptr.state++;
      break;
    case 4:
      PSA_SetUpItemUseOnMonAnim(ptr.itemId, ptr.closeness, false);
      ptr.state++;
      break;
    case 5:
      if (!PSA_IsItemUseOnMonAnimActive()) {
        PSA_ShowMessageWindow();
        ptr.state++;
      }
      break;
    case 6:
      PSA_PrintMessage(C.PSA_TEXT_HUH);
      ptr.state++;
      break;
    case 7:
      if (!PSA_IsMessagePrintTaskActive()) {
        ptr.cancelDisabled = true;
        ptr.state++;
      }
      break;
    case 8:
      if (JOY_NEW(A_BUTTON | B_BUTTON)) {
        BeginNormalPaletteFade(PALETTES_ALL, -1, 0, 16, RGB_BLACK);
        ptr.state++;
      }
      break;
    case 9:
      if (!gPaletteFade.active) {
        SetMainCallback2(ptr.savedCallback);
        PSA_FreeWindowBuffers();
        sPSA = null; // Free(ptr)
        tasks.destroy(taskId);
      }
      break;
  }
}

function Task_UseTM_NoForget(taskId: number): void {
  const ptr = GetPSAStruct();

  if (JOY_NEW(B_BUTTON)) {
    SetUseItemAnimCallback(taskId, Task_CleanUp);
    return;
  }

  switch (ptr.state) {
    case 0:
      SetVBlankCallback(null);
      InitPokemonSpecialAnimScene(ptr.sceneResources, ptr.animType);
      PSA_CreateMonSpriteAtCloseness(3);
      ptr.state++;
      break;
    case 1:
      if (!PokemonSpecialAnimSceneInitIsNotFinished()) {
        BeginNormalPaletteFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
        ptr.state++;
        SetVBlankCallback(VBlankCB_PSA);
      }
      break;
    case 2:
      if (!gPaletteFade.active) {
        ptr.delayTimer = 0;
        ptr.state++;
      }
      break;
    case 3:
      ptr.delayTimer++;
      if (ptr.delayTimer > 20) SetUseItemAnimCallback(taskId, Task_MachineSet);
      break;
  }
}

function Task_MachineSet(taskId: number): void {
  const ptr = GetPSAStruct();

  if (!ptr.cancelDisabled && JOY_NEW(B_BUTTON)) {
    PSA_UseTM_CleanUpForCancel();
    SetUseItemAnimCallback(taskId, Task_CleanUp);
    return;
  }

  switch (ptr.state) {
    case 0:
      CreateItemIconSpriteAtMaxCloseness(ptr.itemId);
      ptr.delayTimer = 0;
      ptr.state++;
      break;
    case 1:
      PSA_ShowMessageWindow();
      PSA_PrintMessage(C.PSA_TEXT_MACHINE_SET);
      ptr.state++;
      break;
    case 2:
      if (!PSA_IsMessagePrintTaskActive()) {
        PSA_HideMessageWindow();
        ptr.state++;
      }
      break;
    case 3:
      PSA_UseTM_SetUpMachineSetWobble();
      ptr.state++;
      break;
    case 4:
      if (!PSA_UseTM_RunMachineSetWobble()) ptr.state++;
      break;
    case 5:
      PSA_UseTM_SetUpZoomOutAnim();
      ptr.state++;
      break;
    case 6:
      if (!PSA_UseTM_RunZoomOutAnim()) {
        ptr.delayTimer = 0;
        ptr.state++;
      }
      break;
    case 7:
      ptr.delayTimer++;
      if (ptr.delayTimer > 30) {
        PSA_ShowMessageWindow();
        PSA_PrintMessage(C.PSA_TEXT_LEARNED_MOVE);
        ptr.state++;
      }
      break;
    case 8:
      if (!PSA_IsMessagePrintTaskActive()) {
        sound.playFanfare(C.MUS_LEVEL_UP);
        ptr.cancelDisabled = true;
        ptr.state++;
      }
      break;
    case 9:
      if (sound.isFanfareTaskInactive()) SetUseItemAnimCallback(taskId, Task_CleanUp);
      break;
  }
}

function Task_CleanUp(taskId: number): void {
  const ptr = GetPSAStruct();

  switch (ptr.state) {
    case 0:
      SetVBlankCallback(VBlankCB_PSA);
      BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
      ptr.state++;
      break;
    case 1:
      if (!gPaletteFade.active && (ptr.field_00a4 !== 1 || sound.isCryFinished())) {
        sCancelDisabled = ptr.cancelDisabled;
        SetMainCallback2(ptr.savedCallback);
        tasks.destroy(taskId);
        PSA_FreeWindowBuffers();
        sPSA = null; // Free(ptr)
      }
      break;
  }
}

const sItemAnimMap = [
  { itemId: C.ITEM_RARE_CANDY, animType: C.PSA_ITEM_ANIM_TYPE_DEFAULT },
  { itemId: C.ITEM_POTION, animType: C.PSA_ITEM_ANIM_TYPE_POTION },
];

/** GetAnimTypeByItemId */
export function GetAnimTypeByItemId(itemId: number): number {
  for (let i = 0; i < sItemAnimMap.length; i++) {
    if (sItemAnimMap[i].itemId === itemId) return sItemAnimMap[i].animType;
  }
  if (itemId >= C.ITEM_TM01 && itemId <= C.ITEM_HM08) return C.PSA_ITEM_ANIM_TYPE_TMHM;
  return C.PSA_ITEM_ANIM_TYPE_DEFAULT;
}

/** GetClosenessFromFriendship */
export function GetClosenessFromFriendship(friendship: number): number {
  if (friendship <= 100) return 0;
  if (friendship <= 150) return 1;
  if (friendship <= 200) return 2;
  return 3;
}

/** GetPSAStruct */
export function GetPSAStruct(): PokemonSpecialAnim {
  return sPSA!;
}

export function PSA_GetPokemon(): Mon {
  sPSAWork = GetPSAStruct();
  return sPSAWork.pokemon;
}

export function PSA_GetSceneWork(): PokemonSpecialAnimScene {
  return GetPSAStruct().sceneResources;
}

export function PSA_GetItemId(): number {
  return GetPSAStruct().itemId;
}

export function PSA_GetNameOfMoveForgotten(): Uint8Array {
  return GetPSAStruct().nameOfMoveForgotten;
}

export function PSA_GetNameOfMoveToTeach(): Uint8Array {
  return GetPSAStruct().nameOfMoveToTeach;
}

export function PSA_CopyMonNickname(dest: Uint8Array): Uint8Array {
  const nick = GetPSAStruct().nickname;
  let i = 0;
  for (; nick[i] !== EOS; i++) dest[i] = nick[i];
  dest[i] = EOS;
  return dest.subarray(i);
}

export function PSA_GetMonNickname(): Uint8Array {
  return GetPSAStruct().nickname;
}

export function PSA_GetAnimType(): number {
  return GetPSAStruct().animType;
}

export function PSA_GetMonSpecies(): number {
  return GetPSAStruct().species;
}

export function PSA_GetMonPersonality(): number {
  return GetPSAStruct().personality;
}

/** GetMonLevelUpWindowStats (returns the six stats instead of filling a u16 *). */
export function GetMonLevelUpWindowStats(mon: Mon): number[] {
  return [C.MON_DATA_MAX_HP, C.MON_DATA_ATK, C.MON_DATA_DEF, C.MON_DATA_SPEED, C.MON_DATA_SPATK, C.MON_DATA_SPDEF]
    .map((field) => GetMonData(mon, field));
}

/** PSA_IsCancelDisabled */
export function PSA_IsCancelDisabled(): boolean {
  return sCancelDisabled;
}

// ================================================================ pokemon_special_anim_scene.c

const sBgTemplates = () => rd<BgTemplate[]>("sBgTemplates");
const sWindowTemplates = () => rd<WindowTemplate[]>("sWindowTemplates");
const sAffineScales = () => rd<number[]>("sAffineScales");
const sStarCoordOffsets = () => rd<number[][]>("sStarCoordOffsets");
const s1_2_and_Poof_textPtrs = () => rd<{ $sym: string }[]>("s1_2_and_Poof_textPtrs").map((r) => txt(r.$sym));

const sSpriteCallbacks: Record<string, (sprite: Sprite) => void> = {
  SpriteCB_LevelUpVertical: (sprite) => SpriteCB_LevelUpVertical(sprite),
  SpriteCB_Star: (sprite) => SpriteCB_Star(sprite),
  SpriteCallback_UseItem_OutwardSpiralDots: (sprite) => SpriteCallback_UseItem_OutwardSpiralDots(sprite),
};
const template = (name: string) => templateFrom(rd<CSpriteTemplate>(name), sSpriteCallbacks);

/** ISO_RANDOMIZE1 */
const ISO_RANDOMIZE1 = (val: number) => (Math.imul(1103515245, val) + 24691) >>> 0;
const s16 = (v: number) => (v << 16) >> 16;

/** InitPokemonSpecialAnimScene */
export function InitPokemonSpecialAnimScene(buffer: PokemonSpecialAnimScene, animType: number): void {
  FreeAllWindowBuffers();
  // ResetTempTileDataBuffers(): no temp tile buffers in the port.
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, sBgTemplates());
  InitWindows(sWindowTemplates());
  ChangeBgX(0, 0, 0);
  ChangeBgY(0, 0, 0);
  ChangeBgX(3, 0, 0);
  ChangeBgY(3, 0, 0);
  SetBgTilemapBuffer(0, buffer.field_0914);
  SetBgTilemapBuffer(3, buffer.field_1914);
  ppu.vram.fill(0, BG_VRAM, BG_VRAM + 0x20); // RequestDma3Fill(0, BG_VRAM, 0x20, DMA3_32BIT)
  FillBgTilemapBufferRect_Palette0(0, 0x000, 0, 0, 32, 32);
  LoadBgGfxByAnimType(animType);
  FillWindowPixelBuffer(0, PIXEL_FILL(0));
  LoadUserWindowGfx(0, 0x000, BG_PLTT_ID(14));
  CopyWindowToVram(0, COPYWIN_FULL);
  ShowBg(0);
  ShowBg(3);
  HideBg(1);
  HideBg(2);
  CopyBgTilemapBufferToVram(0);
  CopyBgTilemapBufferToVram(3);
  SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
}

/** PokemonSpecialAnimSceneInitIsNotFinished (FreeTempTileDataBuffersIfPossible is FALSE: nothing is pending). */
export function PokemonSpecialAnimSceneInitIsNotFinished(): boolean {
  return IsDma3ManagerBusyWithBgCopy();
}

export function PSA_FreeWindowBuffers(): void {
  FreeAllWindowBuffers();
}

export function PSA_ShowMessageWindow(): void {
  PutWindowTilemap(0);
  FillWindowPixelBuffer(0, PIXEL_FILL(1));
  DrawTextBorderOuter(0, 0x001, 14);
  CopyWindowToVram(0, COPYWIN_FULL);
}

export function PSA_HideMessageWindow(): void {
  ClearWindowTilemap(0);
  ClearStdWindowAndFrameToTransparent(0, false);
  CopyWindowToVram(0, COPYWIN_MAP);
}

export function PSA_PrintMessage(messageId: number): void {
  const scene = PSA_GetSceneWork();
  const itemId = PSA_GetItemId();
  let strWidth = 0;
  let textSpeed = getTextSpeedSetting();
  const pokemon = PSA_GetPokemon();
  let level: number;
  let str: Uint8Array;
  const nickname = new Uint8Array(C.POKEMON_NAME_LENGTH + 1).fill(EOS);

  switch (messageId) {
    case 0: // Item was used on Mon
      GetMonData(pokemon, C.MON_DATA_NICKNAME, nickname);
      str = concat(itemName(itemId), txt("gText_WasUsedOn"), nickname, txt("gText_Period"));
      break;
    case 1: // Mon's level was elevated to level
      level = GetMonData(pokemon, C.MON_DATA_LEVEL);
      GetMonData(pokemon, C.MON_DATA_NICKNAME, nickname);
      if (level < C.MAX_LEVEL) level++;
      str = concat(nickname, txt("gText_LevelRoseTo"), intToDecimal(level, STR_CONV_MODE_LEFT_ALIGN, level < C.MAX_LEVEL ? 2 : 3), txt("gText_Period2"));
      break;
    case 9: // Mon learned move
      DynamicPlaceholderTextUtil_Reset();
      DynamicPlaceholderTextUtil_SetPlaceholderPtr(0, PSA_GetMonNickname());
      DynamicPlaceholderTextUtil_SetPlaceholderPtr(1, PSA_GetNameOfMoveToTeach());
      str = DynamicPlaceholderTextUtil_ExpandPlaceholders(txt("gText_MonLearnedTMHM"));
      break;
    case 4:
      strWidth += stringWidth(FONT_NORMAL, txt("gText_Counting_2And"), -1);
      // fallthrough
    case 3:
      strWidth += stringWidth(FONT_NORMAL, txt("gText_Counting_1"), -1);
      // fallthrough
    case 2: // 1
      str = copy(s1_2_and_Poof_textPtrs()[messageId - 2]);
      textSpeed = 1;
      break;
    case 5:
      DynamicPlaceholderTextUtil_Reset();
      DynamicPlaceholderTextUtil_SetPlaceholderPtr(0, PSA_GetMonNickname());
      DynamicPlaceholderTextUtil_SetPlaceholderPtr(1, PSA_GetNameOfMoveForgotten());
      str = DynamicPlaceholderTextUtil_ExpandPlaceholders(txt("gText_MonForgotMove"));
      break;
    case 6:
      str = copy(txt("gText_And"));
      break;
    case 7:
      str = copy(txt("gText_MachineSet"));
      break;
    case 8:
      str = copy(txt("gText_Huh"));
      break;
    default:
      return;
  }

  scene.textBuf.fill(EOS);
  scene.textBuf.set(str.subarray(0, Math.min(str.length, scene.textBuf.length)));
  AddTextPrinterParameterized5(0, FONT_NORMAL, scene.textBuf, strWidth, 0, textSpeed, null, 0, 4);
}

export function PSA_AfterPoof_ClearMessageWindow(): void {
  FillWindowPixelBuffer(0, PIXEL_FILL(1));
  CopyWindowToVram(0, COPYWIN_GFX);
}

export function PSA_IsMessagePrintTaskActive(): boolean {
  return IsTextPrinterActive(0);
}

/** (0x10000 << IndexOfSpritePaletteTag(tag)) as a u32 palette mask. */
const objPaletteMask = (tag: number) => (0x10000 << IndexOfSpritePaletteTag(tag)) >>> 0;

export function PSA_DarkenMonSprite(): void {
  const scene = PSA_GetSceneWork();
  scene.state = 0;
  BlendPalettes((objPaletteMask(0) | 4) >>> 0, 16, RGB_BLACK);
  CreateStarSprites(scene);
}

export function PSA_RunPoofAnim(): boolean {
  const scene = PSA_GetSceneWork();

  switch (scene.state) {
    case 0:
      if (!AnyStarSpritesActive()) {
        BeginNormalPaletteFade((objPaletteMask(0) | 4) >>> 0, -1, 16, 0, RGB_BLACK);
        scene.state++;
      }
      break;
    case 1:
      if (!gPaletteFade.active) return false;
      break;
  }
  return true;
}

export function PSA_UseTM_SetUpZoomOutAnim(): void {
  const scene = PSA_GetSceneWork();
  scene.state = 0;
}

export function PSA_UseTM_CleanUpForCancel(): void {
  StopMakingOutwardSpiralDots();
  ResetPaletteFadeControl();
}

export function PSA_UseTM_RunZoomOutAnim(): boolean {
  const scene = PSA_GetSceneWork();
  switch (scene.state) {
    case 0:
      StartZoomOutAnimForUseTM(0);
      scene.state++;
      break;
    case 1:
      if (!PSA_IsZoomTaskActive()) {
        scene.field_0004 = 0;
        scene.state++;
      }
      break;
    case 2:
      scene.field_0004++;
      if (scene.field_0004 > 20) scene.state++;
      break;
    case 3:
      StartMonWiggleAnim(scene, 1, 0, 1);
      scene.field_0004 = 0;
      scene.state++;
      break;
    case 4:
      scene.field_0004++;
      if (scene.field_0004 > 0) {
        scene.field_0004 = 0;
        sound.playSE(C.SE_M_MEGA_KICK);
        BeginNormalPaletteFade(0x00000001, 2, 0, 12, RGB(8, 13, 31));
        PSAScene_SeedRandomInTask(scene);
        scene.state++;
      }
      break;
    case 5:
      scene.field_0004++;
      if (scene.field_0004 > 70) {
        StopMonWiggleAnim(scene);
        BeginNormalPaletteFade(0x00000001, 6, 12, 0, RGB(8, 13, 31));
        scene.field_0004 = 0;
        scene.state++;
      }
      break;
    case 6:
      scene.field_0004++;
      if (!IsOutwardSpiralDotsTaskRunning() && scene.field_0004 > 40) {
        scene.field_0004 = 0;
        scene.state++;
      }
      break;
    case 7:
      scene.field_0004++;
      if (scene.field_0004 > 20) scene.state++;
      break;
    case 8:
      sound.playSE(C.SE_EXP_MAX);
      DestroySprite(scene.itemIconSprite!);
      scene.state++;
      break;
    default:
      return false;
  }
  return true;
}

export function PSA_UseTM_SetUpMachineSetWobble(): void {
  const scene = PSA_GetSceneWork();
  scene.state = 0;
}

export function PSA_UseTM_RunMachineSetWobble(): boolean {
  const scene = PSA_GetSceneWork();

  switch (scene.state) {
    case 0:
      MachineSetWobbleInit();
      sound.playSE(C.SE_SWITCH);
      scene.state++;
      break;
    case 1:
      return MachineSetWobbleCBIsRunning();
  }
  return true;
}

// There may once have been plans to put the battle level up
// anim in with using Rare Candy, but they were scrapped
// at a later stage of development

// Unused
export function PSA_CreateLevelUpVerticalSpritesTask(): void {
  CreateLevelUpVerticalSpritesTask(120, 56, 4, 4, 2, 0);
}

export function PSA_LevelUpVerticalSpritesTaskIsRunning(): boolean {
  return LevelUpVerticalSpritesTaskIsRunning();
}

// Unused
export function PSA_DrawLevelUpWindowPg1(statsBefore: ArrayLike<number>, statsAfter: ArrayLike<number>): void {
  DrawTextBorderOuter(1, 0x001, 14);
  DrawLevelUpWindowPg1(1, statsBefore, statsAfter, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_LIGHT_GRAY);
  PutWindowTilemap(1);
  CopyWindowToVram(1, COPYWIN_FULL);
}

// Unused
export function PSA_DrawLevelUpWindowPg2(currStats: ArrayLike<number>): void {
  DrawLevelUpWindowPg2(1, currStats, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_LIGHT_GRAY);
  CopyWindowToVram(1, COPYWIN_GFX);
}

// Unused
export function PSA_IsCopyingLevelUpWindowToVram(): boolean {
  return IsDma3ManagerBusyWithBgCopy();
}

function LoadBgGfxByAnimType(animType: number): void {
  CopyToBgTilemapBuffer(3, incbin16(sym("sBg_Tilemap")), 0, 0x000);
  const gfx = incbin(sym("sBg_Gfx")); // DecompressAndCopyTileDataToVram(3, sBg_Gfx, 0, 0x000, 0)
  LoadBgTiles(3, gfx, gfx.length, 0x000);
  if (animType !== C.PSA_ITEM_ANIM_TYPE_TMHM) LoadPalette(incbin16(sym("sBg_Pal")), BG_PLTT_ID(0), 32);
  else LoadPalette(incbin16(sym("sBg_TmHm_Pal")), BG_PLTT_ID(0), 32);
}

export function PSA_CreateMonSpriteAtCloseness(closeness: number): void {
  const scene = PSA_GetSceneWork();
  const pokemon = PSA_GetPokemon();
  const species = GetMonData(pokemon, C.MON_DATA_SPECIES);
  const personality = GetMonData(pokemon, C.MON_DATA_PERSONALITY);
  const yOffset = Menu2_GetMonPosAttribute(species, personality, C.PSA_MON_ATTR_Y_OFFSET);

  if (yOffset !== 0xff) {
    scene.monSpriteY1 = 72;
    scene.monSpriteY2 = yOffset + 48;
  } else {
    scene.monSpriteY1 = 72;
    scene.monSpriteY2 = 96;
  }

  const monPicBuffer = new Uint8Array(C.MON_PIC_SIZE * C.MAX_MON_PIC_FRAMES);
  LoadSpecialPokePic(true, monPicBuffer, species, personality); // HandleLoadSpecialPokePic(&gMonFrontPicTable[species], …)
  const monPalBuffer = GetMonFrontSpritePal(pokemon);
  LoadMonSpriteGraphics(monPicBuffer, monPalBuffer);
  const spriteId = CreateSprite(template("sSpriteTemplate_MonSprite"), 120, scene.monSpriteY1, 4);
  if (spriteId !== MAX_SPRITES) {
    scene.monSprite = gSprites[spriteId];
    MonSpriteZoom_UpdateYPos(scene.monSprite, closeness);
  } else {
    scene.monSprite = null;
  }
  scene.lastCloseness = closeness;
}

// ---------------------------------------------------------------- zoom

// Task_ZoomAnim data
const tState = 0, tCurrCloseness = 1, tFinalCloseness = 2, tDeltaCloseness = 3, tTimer = 4, tDelay = 5;
const tOff_MonSprite = 6, tHasItemSprite = 8, tOff_ItemSprite = 9;

export function PSA_SetUpZoomAnim(closeness: number): void {
  const scene = PSA_GetSceneWork();
  if (closeness !== scene.lastCloseness) {
    const taskId = tasks.create(Task_ZoomAnim, 4);
    const data = tasks.tasks[taskId].data;
    SetWordTaskArg(taskId, tOff_MonSprite, scene.monSprite!.id);
    data[tCurrCloseness] = scene.lastCloseness;
    data[tFinalCloseness] = closeness;
    data[tDelay] = 6;
    if (closeness > scene.lastCloseness) data[tDeltaCloseness] = 1;
    else data[tDeltaCloseness] = -1;
  }
}

export function PSA_IsZoomTaskActive(): boolean {
  return FuncIsActiveTask(Task_ZoomAnim);
}

function Task_ZoomAnim(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const sprite = gSprites[GetWordTaskArg(taskId, tOff_MonSprite)];
  switch (data[tState]) {
    case 0:
      SetSpriteWithCloseness(sprite, data[tCurrCloseness]);
      if (data[tHasItemSprite]) SetSpriteWithCloseness(gSprites[GetWordTaskArg(taskId, tOff_ItemSprite)], data[tCurrCloseness]);
      data[tCurrCloseness] += data[tDeltaCloseness];
      data[tState]++;
      break;
    case 1:
      if (!IsZoomSpriteCBActive(sprite)) {
        sound.playSE(C.SE_BALL_TRAY_EXIT);
        MonSpriteZoom_UpdateYPos(sprite, data[tCurrCloseness]);
        if (data[tHasItemSprite]) ItemSpriteZoom_UpdateYPos(gSprites[GetWordTaskArg(taskId, tOff_ItemSprite)], data[tCurrCloseness]);
        if (data[tCurrCloseness] === data[tFinalCloseness]) {
          PSA_GetSceneWork().lastCloseness = data[tFinalCloseness];
          tasks.destroy(taskId);
        } else {
          data[tTimer] = 0;
          data[tState] = 2;
        }
      }
      break;
    case 2:
      data[tTimer]++;
      if (data[tTimer] > data[tDelay]) data[tState] = 0;
      break;
  }
}

function SetSpriteWithCloseness(sprite: Sprite, closeness: number): void {
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.data[2] = closeness;
}

function IsZoomSpriteCBActive(sprite: Sprite): boolean {
  return sprite.callback !== SpriteCallbackDummy;
}

function GetSpriteOffsetByScale(pos: number, closeness: number): number {
  return s16((s16(pos) * sAffineScales()[closeness]) >> 8);
}

// FIXME: better math
function GetYPosByScale(pos: number): number {
  const scene = PSA_GetSceneWork();
  const v = (((Math.trunc((((scene.monSpriteY2 - scene.monSpriteY1) << 16) >> 8) / 256) * (pos - 256)) << 8) >> 16);
  return (v + scene.monSpriteY1) & 0xffff;
}

function MonSpriteZoom_UpdateYPos(sprite: Sprite, closeness: number): void {
  if (closeness > 3) closeness = 3;
  PSA_GetSceneWork(); // return value not used
  StartSpriteAffineAnim(sprite, closeness);
  sprite.y = GetYPosByScale(sAffineScales()[closeness]);
}

function ItemSpriteZoom_UpdateYPos(sprite: Sprite, closeness: number): void {
  MonSpriteZoom_UpdateYPos(sprite, closeness);
  sprite.x2 = GetSpriteOffsetByScale(sprite.data[6] - 32, closeness);
  sprite.y2 = GetSpriteOffsetByScale(sprite.data[7] - 32, closeness);
}

function StartMonWiggleAnim(scene: PokemonSpecialAnimScene, frameLen: number, niter: number, amplitude: number): void {
  // frameLen: frame duration
  // niter = 0: iterate ad infinitum
  scene.monSprite!.data[0] = frameLen;
  scene.monSprite!.data[1] = niter;
  scene.monSprite!.data[2] = amplitude;
  scene.monSprite!.callback = SpriteCallback_MonSpriteWiggle;
}

function StopMonWiggleAnim(scene: PokemonSpecialAnimScene): void {
  scene.monSprite!.x2 = 0;
  scene.monSprite!.callback = SpriteCallbackDummy;
}

function SpriteCallback_MonSpriteWiggle(sprite: Sprite): void {
  sprite.data[7]++;
  if (sprite.data[7] > sprite.data[0]) {
    sprite.data[7] = 0;
    sprite.data[6]++;
    if (sprite.data[1] !== 0 && sprite.data[6] >= sprite.data[1]) {
      sprite.x2 = 0;
      sprite.callback = SpriteCallbackDummy;
    } else if (sprite.data[6] & 1) {
      sprite.x2 = sprite.data[2];
    } else {
      sprite.x2 = -sprite.data[2];
    }
  }
}

function LoadMonSpriteGraphics(tiles: Uint8Array, palette: Uint16Array): void {
  LoadSpriteSheet({ data: tiles, size: C.MON_PIC_SIZE, tag: 0 });
  LoadSpritePalette({ data: palette, tag: 0 });
}

// ---------------------------------------------------------------- item use on mon

// Task_ItemUseOnMonAnim data
const iState = 0, iTimer = 1, iCloseness = 2, iYpos = 3, iOff_ItemSprite = 4, iData6 = 6, iData7 = 7, iActiveSprCt = 8, iBlendColor = 9,
  iTimerReset = 10, iSuppressDots = 11;

export function PSA_SetUpItemUseOnMonAnim(itemId: number, closeness: number, a2: boolean): void {
  const scene = PSA_GetSceneWork();
  scene.itemIconSprite = PSA_CreateItemIconObject(itemId);
  if (scene.itemIconSprite !== null) {
    InitItemIconSpriteState(scene, scene.itemIconSprite, closeness);
    StartSpriteAffineAnim(scene.itemIconSprite, closeness);
    scene.itemIconSprite.invisible = true;
    const taskId = tasks.create(Task_ItemUseOnMonAnim, 2);
    const data = tasks.tasks[taskId].data;
    SetWordTaskArg(taskId, iOff_ItemSprite, scene.itemIconSprite.id);
    data[iCloseness] = closeness;
    data[iYpos] = GetYPosByScale(sAffineScales()[closeness]);
    data[iData6] = a2 ? 1 : 0;
    data[iBlendColor] = GetBlendColorByItemId(itemId);
  }
}

function GetBlendColorByItemId(_itemId: number): number {
  return RGB_WHITE;
}

export function CreateItemIconSpriteAtMaxCloseness(itemId: number): void {
  const scene = PSA_GetSceneWork();
  scene.itemIconSprite = PSA_CreateItemIconObject(itemId);
  if (scene.itemIconSprite !== null) {
    StartSpriteAffineAnim(scene.itemIconSprite, 3);
    InitItemIconSpriteState(scene, scene.itemIconSprite, 3);
  }
}

function PSA_CreateItemIconObject(itemId: number): Sprite | null {
  const spriteId = AddItemIconObject(1, 1, itemId);
  if (spriteId === MAX_SPRITES) return null;
  const sprite = gSprites[spriteId];
  sprite.oam.affineMode = ST_OAM_AFFINE_DOUBLE;
  sprite.oam.priority = 1;
  sprite.subpriority = 1;
  sprite.affineAnims = affineAnimsFrom({ $sym: "sAffineAnimTable_Zoom" });
  sprite.callback = SpriteCallbackDummy;
  InitSpriteAffineAnim(sprite);
  return sprite;
}

export function PSA_IsItemUseOnMonAnimActive(): boolean {
  return FuncIsActiveTask(Task_ItemUseOnMonAnim);
}

function Task_ItemUseOnMonAnim(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const sprite = gSprites[GetWordTaskArg(taskId, iOff_ItemSprite)];
  switch (data[iState]) {
    case 0:
      data[iTimer]++;
      if (data[iTimer] > 20) {
        data[iTimer] = 0;
        sound.playSE(C.SE_M_SWAGGER2);
        sprite.invisible = false;
        if (!data[iSuppressDots]) LoadOutwardSpiralDotsGfx();
        data[iState] = 1;
      }
      break;
    case 1:
      data[iTimer]++;
      if (data[iTimer] > 30) {
        data[iTimer] = 0;
        sprite.affineAnims = affineAnimsFrom({ $sym: "sAffineAnimTable_ItemZoom" });
        StartSpriteAffineAnim(sprite, data[iCloseness]);
        BeginNormalPaletteFade(objPaletteMask(1), -2, 0, 12, data[iBlendColor]);
        data[iState] = 2;
        sound.playSE(C.SE_M_MILK_DRINK);
      }
      break;
    case 2:
      if (sprite.affineAnimEnded) {
        sprite.invisible = true;
        data[iTimerReset] = 20;
        data[iState] = 3;
      }
      break;
    case 3:
      data[iTimer]++;
      if (data[iTimer] > data[iTimerReset]) {
        data[iTimer] = 0;
        if (!data[iSuppressDots]) CreateSprites_UseItem_OutwardSpiralDots(taskId, data, sprite);
        if (data[iData7] === 0) sound.playSE(C.SE_M_REVERSAL);
        data[iData7]++;
        if (data[iData7] > 2) data[iState] = 4;
        else data[iTimerReset] = 8;
      }
      break;
    case 4:
      if (data[iActiveSprCt] === 0) {
        if (data[iData6]) DestroySprite(sprite);
        tasks.destroy(taskId);
      }
      break;
  }
}

function CreateSprites_UseItem_OutwardSpiralDots(taskId: number, data: number[], sprite: Sprite): void {
  const x = sprite.x + sprite.x2 - 4;
  const y = sprite.y + sprite.y2 - 4;
  BlendPalettes(objPaletteMask(5), 16, data[iBlendColor]);
  for (let i = 0; i < 15; i++) {
    const spriteId = CreateSprite(template("sSpriteTemplate_UseItem_OutwardSpiralDots"), x, y, 0);
    if (spriteId !== MAX_SPRITES) {
      gSprites[spriteId].data[1] = i << 4;
      gSprites[spriteId].data[7] = taskId;
      gSprites[spriteId].callback = SpriteCB_OutwardSpiralDots;
      StartSpriteAnim(gSprites[spriteId], 1);
      data[iActiveSprCt]++;
    }
  }
}

function SpriteCB_OutwardSpiralDots(sprite: Sprite): void {
  const data = sprite.data;
  if (data[0] < 16) {
    data[0]++;
    data[1] += 7;
    data[1] &= 0xff;
    data[2] += 4;
    sprite.x2 = (data[2] * gSineTable[data[1] + 0x40]) >> 8;
    sprite.y2 = (data[2] * gSineTable[data[1]]) >> 8;
  } else {
    tasks.tasks[data[7]].data[iActiveSprCt]--;
    DestroySprite(sprite);
  }
}

export function PSA_UseItem_CleanUpForCancel(): void {
  const taskId = FindTaskIdByFunc(Task_ItemUseOnMonAnim);
  if (taskId !== 0xff) tasks.tasks[taskId].data[iSuppressDots] = 1;
}

function InitItemIconSpriteState(scene: PokemonSpecialAnimScene, sprite: Sprite, closeness: number): void {
  if (closeness === 3) {
    sprite.x = 120;
    sprite.y = scene.monSpriteY2;
  } else {
    sprite.x = 120;
    sprite.y = scene.monSpriteY1;
  }
  sprite.x += 4;
  sprite.y += 4;
  const species = PSA_GetMonSpecies();
  const personality = PSA_GetMonPersonality();
  let x: number, y: number;
  switch (PSA_GetAnimType()) {
    case C.PSA_ITEM_ANIM_TYPE_TMHM:
      x = Menu2_GetMonPosAttribute(species, personality, C.PSA_MON_ATTR_TMHM_X_POS);
      y = Menu2_GetMonPosAttribute(species, personality, C.PSA_MON_ATTR_TMHM_Y_POS);
      if (x === 0xff) x = 0;
      if (y === 0xff) y = 0;
      sprite.data[6] = x;
      sprite.data[7] = y;
      break;
    default:
      x = Menu2_GetMonPosAttribute(species, personality, C.PSA_MON_ATTR_ITEM_X_POS);
      y = Menu2_GetMonPosAttribute(species, personality, C.PSA_MON_ATTR_ITEM_Y_POS);
      if (x === 0xff) x = 0;
      if (y === 0xff) y = 0;
      sprite.data[6] = x;
      sprite.data[7] = y;
      break;
  }
  ItemSpriteZoom_UpdateYPos(sprite, closeness);
}

// ---------------------------------------------------------------- machine set wobble

function MachineSetWobbleInit(): void {
  const scene = PSA_GetSceneWork();
  MachineSetWobble_SetCB(scene.monSprite!);
  MachineSetWobble_SetCB(scene.itemIconSprite!);
}

function MachineSetWobble_SetCB(sprite: Sprite): void {
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.callback = SpriteCB_MachineSetWobble;
}

function MachineSetWobbleCBIsRunning(): boolean {
  const scene = PSA_GetSceneWork();
  return scene.monSprite!.callback !== SpriteCallbackDummy;
}

function SpriteCB_MachineSetWobble(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      sprite.x += 3;
      sprite.data[0]++;
      break;
    case 1:
      sprite.data[1]++;
      if (sprite.data[1] > 30) {
        sprite.x -= 3;
        sprite.callback = SpriteCallbackDummy;
      }
      break;
  }
}

function StartZoomOutAnimForUseTM(closeness: number): void {
  const scene = PSA_GetSceneWork();
  if (closeness !== scene.lastCloseness) {
    const taskId = tasks.create(Task_ZoomAnim, 1);
    const data = tasks.tasks[taskId].data;
    SetWordTaskArg(taskId, tOff_MonSprite, scene.monSprite!.id);
    SetWordTaskArg(taskId, tOff_ItemSprite, scene.itemIconSprite!.id);
    data[tCurrCloseness] = scene.lastCloseness;
    data[tFinalCloseness] = closeness;
    data[tHasItemSprite] = 1;
    data[tDelay] = 6;
    if (closeness > scene.lastCloseness) data[tDeltaCloseness] = 1;
    else data[tDeltaCloseness] = -1;
  }
}

// ---------------------------------------------------------------- stars

function CreateStarSprites(scene: PokemonSpecialAnimScene): void {
  const sheet = rd<{ data: unknown; size: number; tag: number }>("sSpriteSheet_Star");
  LoadCompressedSpriteSheet({ data: incbin(sym("sStar_Gfx")), size: sheet.size, tag: sheet.tag });
  const pal = rd<{ tag: number }>("sSpritePalette_Star");
  LoadSpritePalette({ data: incbin16(sym("sStar_Pal")), tag: pal.tag });
  scene.field_0002 = 0;
  for (let i = 0; i < 3; i++) {
    const spriteId = CreateSprite(template("sSpriteTemplate_Star"), 120 + sStarCoordOffsets()[i][0], scene.monSpriteY2 + sStarCoordOffsets()[i][1], 2);
    if (spriteId !== MAX_SPRITES) {
      const species = PSA_GetMonSpecies();
      const personality = PSA_GetMonPersonality();
      gSprites[spriteId].data[3] = sStarCoordOffsets()[i][0] * 8;
      gSprites[spriteId].data[4] = sStarCoordOffsets()[i][1] * 8;
      gSprites[spriteId].x += GetSpriteOffsetByScale(Menu2_GetStarSpritePosAttribute(species, personality, C.PSA_MON_ATTR_TMHM_X_POS), 3);
      gSprites[spriteId].y += GetSpriteOffsetByScale(Menu2_GetStarSpritePosAttribute(species, personality, C.PSA_MON_ATTR_TMHM_Y_POS), 3);
      scene.field_0002++;
    }
  }
}

function AnyStarSpritesActive(): number {
  return PSA_GetSceneWork().field_0002;
}

function SpriteCB_Star(sprite: Sprite): void {
  sprite.data[0]++;
  if (sprite.data[0] < 10) {
    sprite.data[1] += sprite.data[3];
    sprite.data[2] += sprite.data[4];
    sprite.x2 = sprite.data[1] >> 4;
    sprite.y2 = sprite.data[2] >> 4;
  } else {
    PSA_GetSceneWork().field_0002--;
    DestroySprite(sprite);
  }
}

// ---------------------------------------------------------------- outward spiral dots

// Task_UseItem_OutwardSpiralDots data
const dState = 0, dTimer = 1, dActiveSprCt = 2, dOff_RngState = 3, dAngle = 5, dMadeSprCt = 6;
// sprite data
const tsRadius = 0, tsSpeed = 1, tsXinit = 2, tsYinit = 3, tsXorig = 4, tsYorig = 5, tsTaskId = 6;

function PSAScene_SeedRandomInTask(_scene: PokemonSpecialAnimScene): void {
  LoadOutwardSpiralDotsGfx();
  const taskId = tasks.create(Task_UseItem_OutwardSpiralDots, 1);
  SetWordTaskArg(taskId, dOff_RngState, 2022069025);
  tasks.tasks[taskId].data[dAngle] = 0xe0;
}

function StopMakingOutwardSpiralDots(): void {
  const taskId = FindTaskIdByFunc(Task_UseItem_OutwardSpiralDots);
  if (taskId !== 0xff) tasks.tasks[taskId].data[dState] = 1;
}

function Task_UseItem_OutwardSpiralDots(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  switch (data[dState]) {
    case 0:
      if (data[dTimer] === 0) {
        const sprite = PSA_GetSceneWork().itemIconSprite!;
        const x = sprite.x + sprite.x2;
        const y = sprite.y + sprite.y2;
        const ampl = (PSAScene_RandomFromTask(taskId) % 21) + 70;
        const x2 = (x + (((gSineTable[data[dAngle] + 0x40] * ampl) >>> 0) >>> 8)) >>> 0;
        const y2 = (y + (((gSineTable[data[dAngle]] * ampl) >>> 0) >>> 8)) >>> 0;
        data[dAngle] += 0x4c;
        data[dAngle] &= 0xff;
        const spriteId = CreateSprite(template("sSpriteTemplate_UseItem_OutwardSpiralDots"), x2, y2, 0);
        if (spriteId !== MAX_SPRITES) {
          gSprites[spriteId].data[tsRadius] = 0;
          gSprites[spriteId].data[tsSpeed] = (PSAScene_RandomFromTask(taskId) & 1) + 6;
          gSprites[spriteId].data[tsXinit] = x2;
          gSprites[spriteId].data[tsYinit] = y2;
          gSprites[spriteId].data[tsXorig] = x;
          gSprites[spriteId].data[tsYorig] = y;
          gSprites[spriteId].data[tsTaskId] = taskId;
          data[dActiveSprCt]++;
        }
        data[dMadeSprCt]++;
        if (data[dMadeSprCt] > 47) data[dState]++;
      } else {
        data[dTimer]--;
      }
      break;
    case 1:
      if (data[dActiveSprCt] === 0) tasks.destroy(taskId);
      break;
  }
}

function PSAScene_RandomFromTask(taskId: number): number {
  let state = GetWordTaskArg(taskId, dOff_RngState);
  state = ISO_RANDOMIZE1(state);
  SetWordTaskArg(taskId, dOff_RngState, state);
  return state >>> 16;
}

function SpriteCallback_UseItem_OutwardSpiralDots(sprite: Sprite): void {
  sprite.data[tsRadius] += sprite.data[tsSpeed];
  if (sprite.data[tsRadius] > 255) {
    tasks.tasks[sprite.data[tsTaskId]].data[dActiveSprCt]--;
    DestroySprite(sprite);
  } else {
    const x = (sprite.data[tsXorig] - sprite.data[tsXinit]) * sprite.data[tsRadius];
    const y = (sprite.data[tsYorig] - sprite.data[tsYinit]) * sprite.data[tsRadius];
    sprite.x = (x >> 8) + sprite.data[tsXinit];
    sprite.y = (y >> 8) + sprite.data[tsYinit];
  }
}

function LoadOutwardSpiralDotsGfx(): void {
  const sheet = rd<{ size: number; tag: number }>("sSpriteSheet_UseItem_OutwardSpiralDots");
  LoadCompressedSpriteSheet({ data: incbin(sym("sOutwardSpiralDots_Gfx")), size: sheet.size, tag: sheet.tag });
  const pal = rd<{ tag: number }>("sSpritePalette_UseItem_OutwardSpiralDots");
  LoadSpritePalette({ data: incbin16(sym("sOutwardSpiralDots_Pal")), tag: pal.tag });
}

function IsOutwardSpiralDotsTaskRunning(): boolean {
  return FuncIsActiveTask(Task_UseItem_OutwardSpiralDots);
}

// ---------------------------------------------------------------- level-up vertical sprites

// Task_LevelUpVerticalSprites data
const lState = 0, lActiveSprCt = 1, lMadeSprCt = 2, lTimer = 3, lXpos = 4, lYpos = 5, lTileTag = 6, lPaletteTag = 7, lPriority = 8, lSubpriority = 9;
// sprite data
const lsYsubpixel = 1, lsSpeed = 2, lsTaskId = 7;

/** CreateLevelUpVerticalSpritesTask (also used by the battle's level-up). */
export function CreateLevelUpVerticalSpritesTask(x: number, y: number, tileTag: number, paletteTag: number, priority: number, subpriority: number): void {
  const gfx = incbin(sym("sLevelUp_Gfx"));
  LoadCompressedSpriteSheet({ data: gfx, size: gfx.length, tag: tileTag }); // size = sLevelUp_Gfx[0] >> 8 (decompressed size)
  LoadSpritePalette({ data: incbin16(sym("sLevelUp_Pal")), tag: paletteTag });
  const taskId = tasks.create(Task_LevelUpVerticalSprites, 0);
  const data = tasks.tasks[taskId].data;
  data[lXpos] = s16(x - 32);
  data[lYpos] = s16(y + 32);
  data[lTileTag] = tileTag;
  data[lPaletteTag] = paletteTag;
  data[lPriority] = priority;
  data[lSubpriority] = subpriority;
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_EFFECT_NONE | BLDCNT_TGT2_ALL);
  SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(12, 6));
}

export function LevelUpVerticalSpritesTaskIsRunning(): boolean {
  return FuncIsActiveTask(Task_LevelUpVerticalSprites);
}

function Task_LevelUpVerticalSprites(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  switch (data[lState]) {
    case 0:
      if (data[lTimer] === 0) {
        data[lTimer]++;
        CreateLevelUpVerticalSprite(taskId, data);
        if (data[lMadeSprCt] > 17) data[lState]++;
      } else {
        data[lTimer]++;
        if (data[lTimer] === 2) data[lTimer] = 0;
      }
      break;
    case 1:
      if (data[lActiveSprCt] === 0) {
        FreeSpriteTilesByTag(data[lTileTag] & 0xffff);
        FreeSpritePaletteByTag(data[lPaletteTag] & 0xffff);
        tasks.destroy(taskId);
      }
      break;
  }
}

function CreateLevelUpVerticalSprite(taskId: number, data: number[]): void {
  const tmpl = { ...template("sSpriteTemplate_LevelUpVertical"), tileTag: data[lTileTag] & 0xffff, paletteTag: data[lPaletteTag] & 0xffff };
  data[lMadeSprCt]++;
  const spriteId = CreateSprite(tmpl, ((data[lMadeSprCt] * 219) & 0x3f) + data[lXpos], data[lYpos], data[lSubpriority]);
  if (spriteId !== MAX_SPRITES) {
    gSprites[spriteId].oam.priority = data[lPriority];
    gSprites[spriteId].data[lsYsubpixel] = 0;
    gSprites[spriteId].data[lsSpeed] = (ISO_RANDOMIZE1(data[lMadeSprCt]) & 0x3f) + 0x20;
    gSprites[spriteId].data[lsTaskId] = taskId;
    data[lActiveSprCt]++;
  }
}

function SpriteCB_LevelUpVertical(sprite: Sprite): void {
  sprite.data[lsYsubpixel] -= sprite.data[lsSpeed];
  sprite.y2 = sprite.data[lsYsubpixel] >> 4;
  if (sprite.y2 < -0x40) {
    tasks.tasks[sprite.data[lsTaskId]].data[lActiveSprCt]--;
    DestroySprite(sprite);
  }
}

// ---------------------------------------------------------------- level-up windows

const sLevelUpWindowStatNames = () => rd<{ $sym: string }[]>("sLevelUpWindowStatNames").map((r) => txt(r.$sym));

/** DrawLevelUpWindowPg1 */
export function DrawLevelUpWindowPg1(windowId: number, beforeStats: ArrayLike<number>, afterStats: ArrayLike<number>, bgColor: number, fgColor: number, shadowColor: number): void {
  FillWindowPixelBuffer(windowId, PIXEL_FILL(bgColor));

  const diffStats = [
    s16(afterStats[0] - beforeStats[0]),
    s16(afterStats[1] - beforeStats[1]),
    s16(afterStats[2] - beforeStats[2]),
    s16(afterStats[4] - beforeStats[4]),
    s16(afterStats[5] - beforeStats[5]),
    s16(afterStats[3] - beforeStats[3]),
  ];
  const textColor = [bgColor, fgColor, shadowColor];
  const names = sLevelUpWindowStatNames();

  for (let i = 0; i < 6; i++) {
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, 0, i * 15, textColor, TEXT_SKIP_DRAW, names[i]);
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, 56, i * 15, textColor, TEXT_SKIP_DRAW, diffStats[i] >= 0 ? txt("gText_LevelUp_Plus") : txt("gText_LevelUp_Minus"));
    const x = Math.abs(diffStats[i]) < 10 ? 12 : 6;
    const textbuf = concat([CHAR_SPACE], intToDecimal(Math.abs(diffStats[i]), STR_CONV_MODE_LEFT_ALIGN, 2));
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, x + 56, i * 15, textColor, TEXT_SKIP_DRAW, textbuf);
  }
}

/** DrawLevelUpWindowPg2 */
export function DrawLevelUpWindowPg2(windowId: number, currStats: ArrayLike<number>, bgColor: number, fgColor: number, shadowColor: number): void {
  FillWindowPixelBuffer(windowId, PIXEL_FILL(bgColor));

  const statsRearrange = [currStats[0], currStats[1], currStats[2], currStats[4], currStats[5], currStats[3]];
  const textColor = [bgColor, fgColor, shadowColor];
  const names = sLevelUpWindowStatNames();

  for (let i = 0; i < 6; i++) {
    let ndigits: number;
    if (statsRearrange[i] >= 100) ndigits = 3;
    else if (statsRearrange[i] >= 10) ndigits = 2;
    else ndigits = 1;
    const textbuf = intToDecimal(statsRearrange[i], STR_CONV_MODE_LEFT_ALIGN, ndigits);
    const x = 6 * (4 - ndigits);
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, 0, i * 15, textColor, TEXT_SKIP_DRAW, names[i]);
    AddTextPrinterParameterized3(windowId, FONT_NORMAL, 56 + x, i * 15, textColor, TEXT_SKIP_DRAW, textbuf);
  }
}
