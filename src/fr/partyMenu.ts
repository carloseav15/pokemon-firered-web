// party_menu.c (and fldeff_softboiled.c) on the hardware layer: the POKéMON
// screen with its slot boxes, icons, held-item/ball/status sprites, the
// action menus, switching with the slide animation, give/take items and
// mail, field moves, in-battle switching, and the item-use callbacks
// (medicine with the HP bar count-up, PP items, TMs/HMs and move learning,
// Rare Candy with the level-up stats, Sacred Ash, evolution stones).
//
// Adaptations: pokemon_special_anim.c (the "use item" mon scene) is pending,
// so StartUseItemAnim_* continue straight to their callbacks and
// PSA_IsCancelDisabled() is FALSE (the in-menu learn messages show). The
// summary screen and mail reader are text adapters; Easy Chat is pending, so
// given mail keeps a blank message. Link, Union Room, minigame and the Teachy
// TV scripted menus are not reachable in the port.

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { encode, expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { FONT_MALE, FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_SMALL, GetStringWidth } from "./gba/font";
import { joy, A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, START_BUTTON } from "./gba/input";
import { tasks, type TaskFunc } from "./gba/tasks";
import { getTextSpeedSetting, textFlags } from "./gba/textPrinter";
import { cdata, incbin, incbin16, loadCData, preloadPacks, symName, type SymRef } from "./hw/assets";
import {
  ChangeBgX, CopyBgTilemapBufferToVram, CopyRectToBgTilemapBufferRect, CopyToBgTilemapBufferRect_ChangePalette, FillBgTilemapBufferRect,
  FillBgTilemapBufferRect_Palette0, GetBgTilemapBuffer, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg,
} from "./hw/bg";
import { templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import { SetGpuReg } from "./hw/gpu";
import {
  ClearDialogWindowAndFrameToTransparent, ClearStdWindowAndFrameToTransparent, CreateYesNoMenu, DrawDialogFrameWithCustomTileAndPalette,
  DrawStdFrameWithCustomTileAndPalette, FONTATTR_LETTER_SPACING, FONTATTR_MAX_LETTER_WIDTH, GetFontAttribute, GetMenuCursorDimensionByFont,
  GetTextWindowPalette, LoadMenuMessageWindowGfx, LoadStdWindowGfx, LoadUserWindowGfx, MENU_B_PRESSED, MENU_NOTHING_CHOSEN, Menu_GetCursorPos,
  Menu_InitCursor, Menu_InitCursorInternal, Menu_ProcessInput, Menu_ProcessInput_other, Menu_ProcessInputNoWrapAround_other,
  Menu_ProcessInputNoWrapClearOnChoose,
} from "./hw/menu";
import {
  ClearScheduledBgCopiesToVram, CopyItemName, DoScheduledBgTilemapCopiesToVram, FuncIsActiveTask, GetLRKeysPressedAndHeld, MENU_L_PRESSED,
  MENU_R_PRESSED, ResetAllBgsCoordinatesAndBgCntRegs, RunTextPrinters_CheckActive, ScheduleBgCopyTilemapToVram, SetBgTilemapPalette,
  SetTaskFuncWithFollowupFunc, SwitchTaskToFollowupFunc,
} from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, PALETTES_ALL, ResetPaletteFade,
  RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback2, SetVBlankCallback, SetMainCallback2WhenLoaded } from "./hw/runtime";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, FreeAllSpritePalettes, gSprites, LoadOam, LoadSpritePalette, LoadSpriteSheet, ProcessSpriteCopyRequests,
  ResetSpriteData, StartSpriteAnim, type Sprite,
} from "./hw/sprite";
import { AddTextPrinterParameterized, AddTextPrinterParameterized2, AddTextPrinterParameterized3, AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./hw/text";
import {
  AddWindow, ClearWindowTilemap, COPYWIN_GFX, CopyToWindowPixelBuffer, CopyWindowToVram, FillWindowPixelBuffer, FillWindowPixelRect, FreeAllWindowBuffers,
  GetWindowAttribute, InitWindows, PIXEL_FILL, PutWindowTilemap, RemoveWindow, BlitBitmapToWindow, WINDOW_HEIGHT, WINDOW_NONE, WINDOW_PALETTE_NUM,
  WINDOW_TILEMAP_LEFT, WINDOW_TILEMAP_TOP, WINDOW_WIDTH, type WindowTemplate,
} from "./hw/window";
import { bagResult, GoToBagMenu } from "./bagMenu";
import { CreateMonIcon, LoadMonIconPalettes, SetPartyHPBarSprite, UpdateMonIconFrame } from "./pokemonIcon";
import { GetLastViewedMonIndex, ShowPokemonSummaryScreen } from "./summaryScreen";
import { AdjustFriendship } from "./pokemon/mon_extra";
import {
  CalculatePlayerPartyCount, GetMonData, GetMonGender, GiveMoveToMon, MonTryLearningNewMove, playerMon, RemoveMonPPBonus, SetMonData, SetMonMoveSlot,
  zeroMon, type Mon,
} from "./pokemon/mon";
import { addBagItem, addPCItem, CheckIfItemIsTMHMOrEvolutionStone, itemInfo, removeBagItem, removePCItem } from "./pokemon/items";
import { ClearPCMailEntry, GetPCMail, GiveMailToMon, GiveMailToMon2, isMailItem, TakeMailFromMon, TakeMailFromMon2 } from "./pokemon/mail";
import { CanMonLearnTMHM, speciesName } from "./pokemon/pokemon";
import { tmhmMove } from "./menus/monProgress";
import { gPlayerPcMenuManager } from "./mailboxPc";
import {
  preloadPokemonSpecialAnim, PSA_IsCancelDisabled, StartUseItemAnim_CantEvolve, StartUseItemAnim_ForgetMoveAndLearnTMorHM, StartUseItemAnim_Normal,
} from "./pokemonSpecialAnim";
import { rom } from "./rom";
import { flagGet, save, varGet, varSet, SV } from "./save";
import {
  DrawLevelUpWindowPg1, DrawLevelUpWindowPg2, GetEvolutionTargetSpecies, GetMonLevelUpWindowStats, GetMoveSlotToReplace, PokemonUseItemEffects,
  partyMenuResult, ShowSelectMovePokemonSummaryScreen,
} from "./battle/ext";
import { G, gBattlePartyCurrentOrder, gBattlerPartyIndexes, gBattleStruct } from "./battle/globals";
import { GetBattlerSide } from "./battle/util";
import { IsDoubleBattle } from "./battle/anim";
import { GetHPBarLevel, GetScaledHPFraction } from "./battle/interface";
import { HandleBattleLowHpMusicChange } from "./battle/gfx_sfx_util";
import { BattleStringExpandPlaceholders } from "./battle/message";
import { BtlCtrl_OakOldMan_SetState2Flag, BtlCtrl_OakOldMan_TestState2Flag } from "./battle/controller_oak_old_man";
import { AppendToList } from "./startMenu";
import { SetSwappedHeldItemQuestLogEvent, SetSwitchedPartyOrderQuestLogEvent } from "./questLogEvents";
import { FreeRestoreBattleData } from "./battle/main_init";
import { LoadPlayerParty } from "./loadSave";
import { CB2_ReturnToTeachyTV, SetTeachyTvControllerModeToResume } from "./teachyTv";

// ---------------------------------------------------------------- constants

const PARTY_SIZE = 6;
const SLOT_CONFIRM = PARTY_SIZE, SLOT_CANCEL = PARTY_SIZE + 1;
const PARTY_PAL_SELECTED = 1 << 0, PARTY_PAL_FAINTED = 1 << 1, PARTY_PAL_TO_SWITCH = 1 << 2, PARTY_PAL_MULTI_ALT = 1 << 3, PARTY_PAL_SWITCHING = 1 << 4,
  PARTY_PAL_TO_SOFTBOIL = 1 << 5;
const MENU_DIR_DOWN = 1, MENU_DIR_UP = -1, MENU_DIR_RIGHT = 2, MENU_DIR_LEFT = -2;
const CAN_LEARN_MOVE = 0, CANNOT_LEARN_MOVE = 1, ALREADY_KNOWS_MOVE = 2, CANNOT_LEARN_MOVE_IS_EGG = 3;
const LEARN_VIA_TMHM = 0, LEARN_VIA_LEVEL_UP = 1, LEARN_VIA_TUTOR = 2;
const DRAW_TEXT_ONLY = 0, DRAW_MENU_BOX_AND_TEXT = 1, DRAW_MENU_BOX_ONLY = 2;
const ACTIONS_NONE = 0, ACTIONS_SWITCH = 1, ACTIONS_SHIFT = 2, ACTIONS_SEND_OUT = 3, ACTIONS_ENTER = 4, ACTIONS_NO_ENTRY = 5, ACTIONS_STORE = 6,
  ACTIONS_SUMMARY_ONLY = 7, ACTIONS_ITEM = 8, ACTIONS_MAIL = 9;
const CURSOR_OPTION_SUMMARY = 0, CURSOR_OPTION_SWITCH = 1, CURSOR_OPTION_CANCEL1 = 2, CURSOR_OPTION_ITEM = 3, CURSOR_OPTION_MAIL = 6,
  CURSOR_OPTION_FIELD_MOVES = 18;
const TUTOR_MOVE_FRENZY_PLANT = 15, TUTOR_MOVE_BLAST_BURN = 16, TUTOR_MOVE_HYDRO_CANNON = 17;
const FIRST_BATTLE_MSG_FLAG_PARTY_MENU = 0x40;

const rd = <T>(name: string): T => cdata<T>("party_menu", name);
const text = (name: string): Uint8Array => rom.text(name);
const symText = (ref: SymRef): Uint8Array => text(symName(ref)!);
const u8str = (bytes: ArrayLike<number>): number[] => { const o: number[] = []; for (let i = 0; i < bytes.length && bytes[i] !== 0xff; i++) o.push(bytes[i]); return o; };
const cat = (...parts: ArrayLike<number>[]): Uint8Array => Uint8Array.from([...parts.flatMap(u8str), 0xff]);
const moveName = (move: number): Uint8Array => rom.moveName(move);
const mon = (slot: number): Mon => playerMon(slot);
const s8 = (v: number): number => (v << 24) >> 24;

// ---------------------------------------------------------------- state

type MainCB = (() => void) | null;
type ItemUseCB = (taskId: number, func: TaskFunc) => void;

/** gPartyMenu */
export const gPartyMenu = {
  exitCallback: null as MainCB, task: null as TaskFunc | null, menuType: 0, layout: 0, chooseMonsBattleType: 0,
  slotId: 0, slotId2: 0, action: 0, bagItem: 0,
  learnMoveId: 0, learnMoveMethod: 0, ppMoveSlot: 0,
};

/** gItemUseCB */
export let gItemUseCB: ItemUseCB | null = null;
export function SetItemUseCB(cb: ItemUseCB | null): void { gItemUseCB = cb; }

/** gSelectedOrderFromParty */
export const gSelectedOrderFromParty = [0, 0, 0];

type BoxInfoRects = { blitFunc: SymRef; dimensions: number[]; descTextLeft: number; descTextTop: number; descTextWidth: number; descTextHeight: number };
type PartyMenuBox = { infoRects: BoxInfoRects; spriteCoords: number[]; windowId: number; monSpriteId: number; itemSpriteId: number; pokeballSpriteId: number; statusSpriteId: number };
type Internal = {
  task: TaskFunc; exitCallback: MainCB; chooseMultiple: boolean; lastSelectedSlot: number; spriteIdConfirmPokeball: number; spriteIdCancelPokeball: number;
  messageId: number; windowId: number[]; actions: number[]; numActions: number; palBuffer: Uint16Array; data: number[];
};

let sPartyMenuInternal: Internal | null = null;
const pmi = (): Internal => sPartyMenuInternal!;
let sPartyMenuBoxes: PartyMenuBox[] = [];
let sPartyBgGfxTilemap: Uint8Array = new Uint8Array(0);
let sPartyBgTilemapBuffer: Uint16Array | null = null;
let sSlot1TilemapBuffer: Uint16Array = new Uint16Array(0);
let sSlot2TilemapBuffer: Uint16Array = new Uint16Array(0);
let sPartyMenuItemId = C.ITEM_NONE;

/** The field side the menu hands off to (field moves, fly map, evolution, mail). */
export type PartyMenuFieldHooks = {
  /** CursorCB_FieldMove: the SetUpFieldMove_* result for this mon. */
  setUpFieldMove(fieldMove: number, slot: number):
    | { kind: "fail"; message: string | ArrayLike<number> }
    | { kind: "close"; post: () => void }
    | { kind: "confirm"; message: string | ArrayLike<number>; post: () => void }
    | { kind: "fly" }
    | { kind: "softboiled" };
  /** SetUsedFieldMoveQuestLogEvent (party_menu.c), after field-move confirmation when needed. */
  recordUsedFieldMove(fieldMove: number, slot: number): void;
  /** CB2_OpenFlyMap → ReturnToFieldFromFlyMapSelect(done(true)) or CB2_ReturnToPartyMenuFromFlyMap(done(false)). */
  openFlyMap(slot: number, done: (flying: boolean) => void): void;
  /** CB2_ReturnToField after a field move, with the post-menu field callback. */
  returnToField(post: (() => void) | null): void;
  /** ReadMail */
  readMail(slot: number, done: () => void): void;
  /** BeginEvolutionScene; `done` is gCB2_AfterEvolution. */
  evolve(mon: Mon, target: number, canStop: boolean, slot: number, done: () => void): void;
  /** GetNumberOfRelearnableMoves */
  relearnableMoves(mon: Mon): number;
};
let sFieldHooks: PartyMenuFieldHooks | null = null;
export function SetPartyMenuFieldHooks(hooks: PartyMenuFieldHooks): void { sFieldHooks = hooks; }

// ---------------------------------------------------------------- init / exit

/** InitPartyMenu(menuType, layout, partyAction, keepCursorPos, messageId, task, callback) */
export function InitPartyMenu(menuType: number, layout: number, partyAction: number, keepCursorPos: boolean, messageId: number, task: TaskFunc, callback: MainCB): void {
  ResetPartyMenu();
  SetMainCallback2WhenLoaded(Promise.all([
    preloadPokemonSpecialAnim(),
    loadCData("party_menu", "battle_tower", "pokemon_icon", "pokemon_special_anim_scene", "strings", "text_window_graphics"),
    preloadPacks(["graphics_party_menu", "graphics_interface", "pokemon", "graphics_text_window", "graphics_fonts", "graphics_help_system"]),
  ]), () => {
    gPartyMenu.menuType = menuType;
    gPartyMenu.exitCallback = callback;
    gPartyMenu.action = partyAction;
    sPartyMenuInternal = {
      task, exitCallback: null, chooseMultiple: menuType === C.PARTY_MENU_TYPE_CHOOSE_MULTIPLE_MONS, lastSelectedSlot: 0, spriteIdConfirmPokeball: 0,
      spriteIdCancelPokeball: 0, messageId, windowId: [WINDOW_NONE, WINDOW_NONE, WINDOW_NONE], actions: [], numActions: 0,
      palBuffer: new Uint16Array(0x100), data: new Array(16).fill(0),
    };
    if (layout !== C.KEEP_PARTY_LAYOUT) gPartyMenu.layout = layout;
    if (!keepCursorPos) gPartyMenu.slotId = 0;
    else if (gPartyMenu.slotId > PARTY_SIZE - 1 || GetMonData(mon(gPartyMenu.slotId), C.MON_DATA_SPECIES) === C.SPECIES_NONE) gPartyMenu.slotId = 0;
    textFlags.autoScroll = false;
    CalculatePlayerPartyCount();
    gMain.state = 0;
    SetMainCallback2(CB2_InitPartyMenu);
  });
}

/** ResetPartyMenu (party_menu.c): discard the four allocations owned by this menu. */
function ResetPartyMenu(): void {
  sPartyMenuInternal = null;
  sPartyBgTilemapBuffer = null;
  sPartyMenuBoxes = [];
  sPartyBgGfxTilemap = new Uint8Array(0);
}

/** party_menu.c InitChooseMonsForBattle; the caller owns the saved callback. */
export function InitChooseMonsForBattle(chooseMonsBattleType: number, callback: MainCB): void {
  ClearSelectedPartyOrder();
  InitPartyMenu(C.PARTY_MENU_TYPE_CHOOSE_MULTIPLE_MONS, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_CHOOSE_MON,
    false, C.PARTY_MSG_CHOOSE_MON, Task_HandleChooseMonInput, callback);
  gPartyMenu.chooseMonsBattleType = chooseMonsBattleType;
  gPartyMenu.task = Task_ValidateChosenMonsForBattle;
}

function CB2_UpdatePartyMenu(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  DoScheduledBgTilemapCopiesToVram();
  UpdatePaletteFade();
}

function VBlankCB_PartyMenu(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_InitPartyMenu(): void {
  while (!ShowPartyMenu()) { /* one frame, as the source loop */ }
}

function ShowPartyMenu(): boolean {
  switch (gMain.state) {
    case 0:
      SetVBlankCallback(null); SetHBlankCallback(null);
      ResetAllBgsCoordinatesAndBgCntRegs();
      ppu.vram.fill(0); ppu.oam.fill(0); ppu.pltt.fill(0);
      ClearScheduledBgCopiesToVram();
      gMain.state++;
      break;
    case 1: gMain.state++; break;
    case 2: ResetPaletteFade(); gPaletteFade.bufferTransferDisabled = true; gMain.state++; break;
    case 3: ResetSpriteData(); gMain.state++; break;
    case 4: FreeAllSpritePalettes(); gMain.state++; break;
    case 5: tasks.reset(); gMain.state++; break;
    case 6: gMain.state++; break; // SetPartyMonsAllowedInMinigame (link minigames only)
    case 7: AllocPartyMenuBg(); pmi().data[0] = 0; gMain.state++; break;
    case 8: if (AllocPartyMenuBgGfx()) gMain.state++; break;
    case 9: InitPartyMenuWindows(gPartyMenu.layout); gMain.state++; break;
    case 10: InitPartyMenuBoxes(gPartyMenu.layout); pmi().data[0] = 0; gMain.state++; break;
    case 11: LoadHeldItemIcons(); gMain.state++; break;
    case 12: LoadPartyMenuPokeballGfx(); gMain.state++; break;
    case 13: LoadPartyMenuAilmentGfx(); gMain.state++; break;
    case 14: LoadMonIconPalettes(); gMain.state++; break;
    case 15: if (CreatePartyMonSpritesLoop()) { pmi().data[0] = 0; gMain.state++; } break;
    case 16: if (RenderPartyMenuBoxes()) { pmi().data[0] = 0; gMain.state++; } break;
    case 17: CreateCancelConfirmPokeballSprites(); gMain.state++; break;
    case 18: CreateCancelConfirmWindows(pmi().chooseMultiple); gMain.state++; break;
    case 19: gMain.state++; break; // SetHelpContext
    case 20: tasks.create(pmi().task, 0); DisplayPartyMenuStdMessage(pmi().messageId); gMain.state++; break;
    case 21: BlendPalettes(PALETTES_ALL, 16, RGB_BLACK); gMain.state++; break;
    case 22: BeginNormalPaletteFade(PALETTES_ALL, -2, 16, 0, RGB_BLACK); gPaletteFade.bufferTransferDisabled = false; gMain.state++; break;
    default:
      SetVBlankCallback(VBlankCB_PartyMenu);
      SetMainCallback2(CB2_UpdatePartyMenu);
      return true;
  }
  return false;
}

function AllocPartyMenuBg(): void {
  ResetAllBgsCoordinatesAndBgCntRegs();
  sPartyBgTilemapBuffer = new Uint16Array(0x400);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, rd("sPartyMenuBgTemplates"));
  SetBgTilemapBuffer(1, sPartyBgTilemapBuffer);
  ScheduleBgCopyTilemapToVram(1);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_OBJ_1D_MAP);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  ShowBg(0);
  ShowBg(1);
  ShowBg(2);
}

function AllocPartyMenuBgGfx(): boolean {
  const d = pmi().data;
  switch (d[0]) {
    case 0: sPartyBgGfxTilemap = incbin("gPartyMenuBg_Gfx"); LoadBgTiles(1, sPartyBgGfxTilemap, sPartyBgGfxTilemap.length, 0); d[0]++; break;
    case 1: sPartyBgTilemapBuffer!.set(incbin16("gPartyMenuBg_Tilemap").subarray(0, 0x400)); d[0]++; break;
    case 2:
      LoadPalette(incbin("gPartyMenuBg_Pal"), BG_PLTT_ID(0), 11 * 32);
      pmi().palBuffer.set(gPlttBufferUnfaded.subarray(0, 11 * 16));
      d[0]++;
      break;
    case 3: case 4: case 5: case 6: case 7:
      PartyPaletteBufferCopy(d[0] + 1);
      d[0]++;
      break;
    default: return true;
  }
  return false;
}

function PartyPaletteBufferCopy(offset: number): void {
  const at = offset * 16;
  gPlttBufferUnfaded.set(gPlttBufferUnfaded.subarray(BG_PLTT_ID(3), BG_PLTT_ID(3) + 16), at);
  gPlttBufferFaded.set(gPlttBufferUnfaded.subarray(BG_PLTT_ID(3), BG_PLTT_ID(3) + 16), at);
}

function FreePartyPointers(): void {
  sPartyMenuInternal = null;
  sPartyBgTilemapBuffer = null;
  sPartyMenuBoxes = [];
  FreeAllWindowBuffers();
}

function InitPartyMenuBoxes(layout: number): void {
  const rects = rd<BoxInfoRects[]>("sPartyBoxInfoRects");
  const coords = rd<number[][][]>("sPartyMenuSpriteCoords");
  sPartyMenuBoxes = Array.from({ length: PARTY_SIZE }, (_, i) => ({
    infoRects: rects[1], spriteCoords: coords[layout][i], windowId: i, monSpriteId: 0, itemSpriteId: 0, pokeballSpriteId: 0, statusSpriteId: 0,
  }));
  sPartyMenuBoxes[0].infoRects = rects[0];
  if (layout === C.PARTY_LAYOUT_MULTI_SHOWCASE) sPartyMenuBoxes[3].infoRects = rects[0];
  else if (layout !== C.PARTY_LAYOUT_SINGLE) sPartyMenuBoxes[1].infoRects = rects[0];
}

function RenderPartyMenuBox(slot: number): void {
  if (GetMonData(mon(slot), C.MON_DATA_SPECIES) === C.SPECIES_NONE) {
    DrawEmptySlot(sPartyMenuBoxes[slot].windowId);
    CopyWindowToVram(sPartyMenuBoxes[slot].windowId, COPYWIN_GFX);
  } else {
    if (gPartyMenu.menuType === C.PARTY_MENU_TYPE_CHOOSE_MULTIPLE_MONS) DisplayPartyPokemonDataForChooseMultiple(slot);
    else if (!DisplayPartyPokemonDataForMoveTutorOrEvolutionItem(slot)) DisplayPartyPokemonData(slot);
    AnimatePartySlot(slot, gPartyMenu.slotId === slot ? 1 : 0);
  }
  PutWindowTilemap(sPartyMenuBoxes[slot].windowId);
  ScheduleBgCopyTilemapToVram(0);
}

function blit(box: PartyMenuBox, x: number, y: number, width: number, height: number, hideHP: boolean): void {
  if (symName(box.infoRects.blitFunc) === "BlitBitmapToPartyWindow_LeftColumn") BlitBitmapToPartyWindow_LeftColumn(box.windowId, x, y, width, height, hideHP);
  else BlitBitmapToPartyWindow_RightColumn(box.windowId, x, y, width, height, hideHP);
}

function DisplayPartyPokemonData(slot: number): void {
  const box = sPartyMenuBoxes[slot];
  const m = mon(slot);
  if (GetMonData(m, C.MON_DATA_IS_EGG)) {
    blit(box, 0, 0, 0, 0, true);
    DisplayPartyPokemonNickname(m, box, DRAW_TEXT_ONLY);
  } else {
    blit(box, 0, 0, 0, 0, false);
    DisplayPartyPokemonNickname(m, box, DRAW_TEXT_ONLY);
    DisplayPartyPokemonLevelCheck(m, box, DRAW_TEXT_ONLY);
    DisplayPartyPokemonGenderNidoranCheck(m, box, DRAW_TEXT_ONLY);
    DisplayPartyPokemonHPCheck(m, box, DRAW_TEXT_ONLY);
    DisplayPartyPokemonMaxHPCheck(m, box, DRAW_TEXT_ONLY);
    DisplayPartyPokemonHPBarCheck(m, box);
  }
}

function DisplayPartyPokemonDescriptionData(slot: number, stringId: number): void {
  const m = mon(slot);
  const box = sPartyMenuBoxes[slot];
  blit(box, 0, 0, 0, 0, true);
  DisplayPartyPokemonNickname(m, box, DRAW_TEXT_ONLY);
  if (!GetMonData(m, C.MON_DATA_IS_EGG)) {
    DisplayPartyPokemonLevelCheck(m, box, DRAW_TEXT_ONLY);
    DisplayPartyPokemonGenderNidoranCheck(m, box, DRAW_TEXT_ONLY);
  }
  DisplayPartyPokemonDescriptionText(stringId, box, DRAW_TEXT_ONLY);
}

function DisplayPartyPokemonDataForChooseMultiple(slot: number): void {
  const m = mon(slot);
  if (!GetBattleEntryEligibility(m)) { DisplayPartyPokemonDescriptionData(slot, C.PARTYBOX_DESC_NOT_ABLE); return; }
  const maxBattlers = gPartyMenu.chooseMonsBattleType === C.CHOOSE_MONS_FOR_UNION_ROOM_BATTLE ? 2 : 3;
  for (let i = 0; i < maxBattlers; i++) {
    if (gSelectedOrderFromParty[i] !== 0 && gSelectedOrderFromParty[i] - 1 === slot) {
      DisplayPartyPokemonDescriptionData(slot, i + C.PARTYBOX_DESC_FIRST);
      return;
    }
  }
  DisplayPartyPokemonDescriptionData(slot, C.PARTYBOX_DESC_ABLE_3);
}

/** TRUE when teaching a move or when the item cannot evolve the mon (description shown). */
function DisplayPartyPokemonDataForMoveTutorOrEvolutionItem(slot: number): boolean {
  const current = mon(slot);
  const item = bagResult.itemId;
  if (gPartyMenu.action === C.PARTY_ACTION_MOVE_TUTOR) {
    varSet(SV.RESULT, 0);
    if (varGet(SV.x8005) >= C.TUTOR_MOVE_COUNT) return false;
    DisplayPartyPokemonDataToTeachMove(slot, 0, varGet(SV.x8005));
  } else {
    if (gPartyMenu.action !== C.PARTY_ACTION_USE_ITEM) return false;
    switch (CheckIfItemIsTMHMOrEvolutionStone(item)) {
      default: return false;
      case 1: DisplayPartyPokemonDataToTeachMove(slot, item, 0); break;
      case 2:
        if (!GetMonData(current, C.MON_DATA_IS_EGG) && GetEvolutionTargetSpecies(current, C.EVO_MODE_ITEM_CHECK, item) !== C.SPECIES_NONE) return false;
        DisplayPartyPokemonDescriptionData(slot, C.PARTYBOX_DESC_NO_USE);
        break;
    }
  }
  return true;
}

function DisplayPartyPokemonDataToTeachMove(slot: number, item: number, tutor: number): void {
  switch (CanMonLearnTMTutor(mon(slot), item, tutor)) {
    case CANNOT_LEARN_MOVE: case CANNOT_LEARN_MOVE_IS_EGG: DisplayPartyPokemonDescriptionData(slot, C.PARTYBOX_DESC_NOT_ABLE_2); break;
    case ALREADY_KNOWS_MOVE: DisplayPartyPokemonDescriptionData(slot, C.PARTYBOX_DESC_LEARNED); break;
    default: DisplayPartyPokemonDescriptionData(slot, C.PARTYBOX_DESC_ABLE_2); break;
  }
}

function RenderPartyMenuBoxes(): boolean {
  RenderPartyMenuBox(pmi().data[0]);
  return ++pmi().data[0] === PARTY_SIZE;
}

function GetPartyMenuBgTile(tileId: number): Uint8Array {
  return sPartyBgGfxTilemap.subarray(tileId << 5, (tileId << 5) + 32);
}

function CreatePartyMonSprites(slot: number): void {
  const m = mon(slot);
  if (GetMonData(m, C.MON_DATA_SPECIES) !== C.SPECIES_NONE) {
    const box = sPartyMenuBoxes[slot];
    CreatePartyMonIconSprite(m, box);
    CreatePartyMonHeldItemSprite(m, box);
    CreatePartyMonPokeballSprite(m, box);
    CreatePartyMonStatusSprite(m, box);
  }
}

function CreatePartyMonSpritesLoop(): boolean {
  CreatePartyMonSprites(pmi().data[0]);
  return ++pmi().data[0] === PARTY_SIZE;
}

function CreateCancelConfirmPokeballSprites(): void {
  if (pmi().chooseMultiple) {
    pmi().spriteIdConfirmPokeball = CreateSmallPokeballButtonSprite(0xbf, 0x88);
    DrawCancelConfirmButtons();
    pmi().spriteIdCancelPokeball = CreateSmallPokeballButtonSprite(0xbf, 0x98);
  } else {
    pmi().spriteIdCancelPokeball = CreatePokeballButtonSprite(198, 148);
  }
  AnimatePartySlot(gPartyMenu.slotId, 1);
}

/** AnimatePartySlot */
export function AnimatePartySlot(slot: number, animNum: number): void {
  let spriteId: number;
  switch (slot) {
    default:
      if (GetMonData(mon(slot), C.MON_DATA_SPECIES) !== C.SPECIES_NONE) {
        LoadPartyBoxPalette(sPartyMenuBoxes[slot], GetPartyBoxPaletteFlags(slot, animNum));
        AnimateSelectedPartyIcon(sPartyMenuBoxes[slot].monSpriteId, animNum);
        StartSpriteAnim(gSprites[sPartyMenuBoxes[slot].pokeballSpriteId], animNum);
      }
      return;
    case SLOT_CONFIRM:
      SetBgTilemapPalette(1, 23, 16, 7, 2, animNum === 0 ? 1 : 2);
      spriteId = pmi().spriteIdConfirmPokeball;
      break;
    case SLOT_CANCEL:
      // The Cancel button moves down when Confirm is present.
      SetBgTilemapPalette(1, 23, pmi().chooseMultiple ? 18 : 17, 7, 2, animNum === 0 ? 1 : 2);
      spriteId = pmi().spriteIdCancelPokeball;
      break;
  }
  StartSpriteAnim(gSprites[spriteId], animNum);
  ScheduleBgCopyTilemapToVram(1);
}

function GetPartyBoxPaletteFlags(slot: number, animNum: number): number {
  let palFlags = 0;
  if (animNum === 1) palFlags |= PARTY_PAL_SELECTED;
  if (GetMonData(mon(slot), C.MON_DATA_HP) === 0) palFlags |= PARTY_PAL_FAINTED;
  if (gPartyMenu.layout === C.PARTY_LAYOUT_MULTI && (slot === 1 || slot === 4 || slot === 5)) palFlags |= PARTY_PAL_MULTI_ALT;
  if (gPartyMenu.action === C.PARTY_ACTION_SWITCHING) palFlags |= PARTY_PAL_SWITCHING;
  if (gPartyMenu.action === C.PARTY_ACTION_SWITCH && (slot === gPartyMenu.slotId || slot === gPartyMenu.slotId2)) palFlags |= PARTY_PAL_TO_SWITCH;
  if (gPartyMenu.action === C.PARTY_ACTION_SOFTBOILED && slot === gPartyMenu.slotId) palFlags |= PARTY_PAL_TO_SOFTBOIL;
  return palFlags;
}

function DrawCancelConfirmButtons(): void {
  CopyToBgTilemapBufferRect_ChangePalette(1, incbin16("sConfirmButton_Tilemap"), 23, 16, 7, 2, 17);
  CopyToBgTilemapBufferRect_ChangePalette(1, incbin16("sCancelButton_Tilemap"), 23, 18, 7, 2, 17);
  ScheduleBgCopyTilemapToVram(1);
}

export function IsMultiBattle(): boolean {
  const f = G.gBattleTypeFlags;
  return !!(f & C.BATTLE_TYPE_MULTI && f & C.BATTLE_TYPE_DOUBLE && f & C.BATTLE_TYPE_TRAINER && f & C.BATTLE_TYPE_LINK);
}

/** SwapPartyPokemon (party_menu.c): TS party slots stand in for the two Pokemon pointers. */
function SwapPartyPokemon(a: number, b: number): void {
  const pa = mon(a), pb = mon(b);
  const party = save.party as Mon[];
  const full = Array.from({ length: PARTY_SIZE }, (_, i) => party[i] ?? zeroMon());
  full[a] = pb;
  full[b] = pa;
  save.party.splice(0, save.party.length, ...full.filter((m) => m.species !== C.SPECIES_NONE));
}

function Task_ClosePartyMenu(taskId: number): void {
  BeginNormalPaletteFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
  tasks.setFunc(taskId, Task_ClosePartyMenuAndSetCB2);
}

function Task_ClosePartyMenuAndSetCB2(taskId: number): void {
  if (gPaletteFade.active) return;
  if (gPartyMenu.menuType === C.PARTY_MENU_TYPE_IN_BATTLE) UpdatePartyToFieldOrder();
  const cb = pmi().exitCallback ?? gPartyMenu.exitCallback;
  FreePartyPointers();
  tasks.destroy(taskId);
  SetVBlankCallback(null);
  SetMainCallback2(null);
  cb?.();
}

export function GetCursorSelectionMonId(): number { return gPartyMenu.slotId; }
export function GetPartyMenuType(): number { return gPartyMenu.menuType; }

/** Task_HandleChooseMonInput */
export function Task_HandleChooseMonInput(taskId: number): void {
  if (gPaletteFade.active) return;
  const slot = GetCurrentPartySlotPtr();
  switch (PartyMenuButtonHandler(slot)) {
    case A_BUTTON: HandleChooseMonSelection(taskId, slot); break;
    case B_BUTTON: HandleChooseMonCancel(taskId, slot); break;
    case START_BUTTON:
      if (pmi().chooseMultiple) { sound.playSE(C.SE_SELECT); MoveCursorToConfirm(); }
      break;
  }
}

function CheckBattleEntriesAndGetMessage(): number {
  const order = gSelectedOrderFromParty;
  if (gPartyMenu.chooseMonsBattleType === C.CHOOSE_MONS_FOR_BATTLE_TOWER) {
    if (order[2] === 0) return C.PARTY_MSG_THREE_MONS_ARE_NEEDED;
    for (let i = 0; i < 2; i++) {
      const first = save.party[order[i] - 1];
      for (let j = i + 1; j < 3; j++) {
        const next = save.party[order[j] - 1];
        if (first?.species === next?.species) return C.PARTY_MSG_MONS_CANT_BE_SAME;
        if (first?.heldItem && first.heldItem === next?.heldItem) return C.PARTY_MSG_NO_SAME_HOLD_ITEMS;
      }
    }
  } else if (gPartyMenu.chooseMonsBattleType === C.CHOOSE_MONS_FOR_UNION_ROOM_BATTLE && order[1] === 0) {
    return C.PARTY_MSG_TWO_MONS_ARE_NEEDED;
  }
  return 0xff;
}

function Task_ValidateChosenMonsForBattle(taskId: number): void {
  const message = CheckBattleEntriesAndGetMessage();
  if (message !== 0xff) {
    sound.playSE(C.SE_FAILURE);
    DisplayPartyMenuStdMessage(message);
    tasks.setFunc(taskId, Task_ContinueChoosingMonsForBattle);
  } else if (gSelectedOrderFromParty[0] !== 0) {
    sound.playSE(C.SE_SELECT);
    Task_ClosePartyMenu(taskId);
  } else {
    sound.playSE(C.SE_FAILURE);
    DisplayPartyMenuStdMessage(C.PARTY_MSG_NO_MON_FOR_BATTLE);
    tasks.setFunc(taskId, Task_ContinueChoosingMonsForBattle);
  }
}

function Task_ContinueChoosingMonsForBattle(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive() && (joy.newKeys & (A_BUTTON | B_BUTTON)) !== 0) {
    sound.playSE(C.SE_SELECT);
    DisplayPartyMenuStdMessage(C.PARTY_MSG_CHOOSE_MON);
    tasks.setFunc(taskId, Task_HandleChooseMonInput);
  }
}

type SlotRef = { get(): number; set(v: number): void };
/** GetCurrentPartySlotPtr */
/** GetCurrentPartySlotPtr (party_menu.c): a mutable slot reference models the C s8 pointer. */
function GetCurrentPartySlotPtr(): SlotRef {
  if (gPartyMenu.action === C.PARTY_ACTION_SWITCH || gPartyMenu.action === C.PARTY_ACTION_SOFTBOILED) {
    return { get: () => gPartyMenu.slotId2, set: (v) => { gPartyMenu.slotId2 = v; } };
  }
  return { get: () => gPartyMenu.slotId, set: (v) => { gPartyMenu.slotId = v; } };
}

function HandleChooseMonSelection(taskId: number, slot: SlotRef): void {
  if (slot.get() === SLOT_CONFIRM) { gPartyMenu.task?.(taskId); return; }
  switch (gPartyMenu.action) {
    case C.PARTY_ACTION_SOFTBOILED:
      if (IsSelectedMonNotEgg(slot.get())) Task_TryUseSoftboiledOnPartyMon(taskId);
      break;
    case C.PARTY_ACTION_USE_ITEM:
      if (IsSelectedMonNotEgg(slot.get())) {
        if (gPartyMenu.menuType === C.PARTY_MENU_TYPE_IN_BATTLE) pmi().exitCallback = sBattleExit.success;
        gItemUseCB?.(taskId, Task_ClosePartyMenuAfterText);
      }
      break;
    case C.PARTY_ACTION_MOVE_TUTOR:
      if (IsSelectedMonNotEgg(slot.get())) { sound.playSE(C.SE_SELECT); TryTutorSelectedMon(taskId); }
      break;
    case C.PARTY_ACTION_GIVE_MAILBOX_MAIL:
      if (IsSelectedMonNotEgg(slot.get())) { sound.playSE(C.SE_SELECT); TryGiveMailToSelectedMon(taskId); }
      break;
    case C.PARTY_ACTION_GIVE_ITEM:
    case C.PARTY_ACTION_GIVE_PC_ITEM:
      if (IsSelectedMonNotEgg(slot.get())) { sound.playSE(C.SE_SELECT); TryGiveItemOrMailToSelectedMon(taskId); }
      break;
    case C.PARTY_ACTION_SWITCH:
      sound.playSE(C.SE_SELECT);
      SwitchSelectedMons(taskId);
      break;
    case C.PARTY_ACTION_CHOOSE_AND_CLOSE:
      sound.playSE(C.SE_SELECT);
      varSet(SV.x8004, slot.get());
      if (gPartyMenu.menuType === C.PARTY_MENU_TYPE_MOVE_RELEARNER) varSet(SV.x8005, sFieldHooks?.relearnableMoves(mon(slot.get())) ?? 0);
      Task_ClosePartyMenu(taskId);
      break;
    default:
      sound.playSE(C.SE_SELECT);
      Task_TryCreateSelectionWindow(taskId);
      break;
  }
}

function IsSelectedMonNotEgg(slot: number): boolean {
  if (GetMonData(mon(slot), C.MON_DATA_IS_EGG)) { sound.playSE(C.SE_FAILURE); return false; }
  return true;
}

function HandleChooseMonCancel(taskId: number, slot: SlotRef): void {
  switch (gPartyMenu.action) {
    case C.PARTY_ACTION_SEND_OUT: sound.playSE(C.SE_FAILURE); break;
    case C.PARTY_ACTION_SWITCH:
    case C.PARTY_ACTION_SOFTBOILED: sound.playSE(C.SE_SELECT); FinishTwoMonAction(taskId); break;
    default:
      sound.playSE(C.SE_SELECT);
      if (gPartyMenu.menuType === C.PARTY_MENU_TYPE_CHOOSE_MULTIPLE_MONS) {
        DisplayCancelChooseMonYesNo(taskId);
      } else {
        varSet(SV.x8004, SLOT_CANCEL);
        partyMenuResult.useExitCallback = false;
        slot.set(SLOT_CANCEL);
        Task_ClosePartyMenu(taskId);
      }
      break;
  }
}

function DisplayCancelChooseMonYesNo(taskId: number): void {
  PartyMenuRemoveWindow(1);
  stringVars.var4 = expandPlaceholders(text("gText_CancelBattle"));
  DisplayPartyMenuMessage(stringVars.var4, true);
  tasks.setFunc(taskId, Task_CancelChooseMonYesNo);
}

function Task_CancelChooseMonYesNo(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) { PartyMenuDisplayYesNoMenu(); tasks.setFunc(taskId, Task_HandleCancelChooseMonYesNoInput); }
}

function Task_HandleCancelChooseMonYesNoInput(taskId: number): void {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0:
      partyMenuResult.useExitCallback = false;
      gPartyMenu.slotId = SLOT_CANCEL;
      ClearSelectedPartyOrder();
      Task_ClosePartyMenu(taskId);
      break;
    case MENU_B_PRESSED: sound.playSE(C.SE_SELECT); Task_ReturnToChooseMonAfterText(taskId); break;
    case 1: Task_ReturnToChooseMonAfterText(taskId); break;
  }
}

function PartyMenuButtonHandler(slot: SlotRef): number {
  let movementDir = 0;
  switch (joy.repeated) {
    case DPAD_UP: movementDir = MENU_DIR_UP; break;
    case DPAD_DOWN: movementDir = MENU_DIR_DOWN; break;
    case DPAD_LEFT: movementDir = MENU_DIR_LEFT; break;
    case DPAD_RIGHT: movementDir = MENU_DIR_RIGHT; break;
    default:
      switch (GetLRKeysPressedAndHeld()) {
        case MENU_L_PRESSED: movementDir = MENU_DIR_UP; break;
        case MENU_R_PRESSED: movementDir = MENU_DIR_DOWN; break;
      }
      break;
  }
  if (joy.newKeys & START_BUTTON) return START_BUTTON;
  if (movementDir) { UpdateCurrentPartySelection(slot, movementDir); return 0; }
  if (joy.newKeys & A_BUTTON && slot.get() === SLOT_CANCEL) return B_BUTTON;
  return joy.newKeys & (A_BUTTON | B_BUTTON);
}

function UpdateCurrentPartySelection(slot: SlotRef, movementDir: number): void {
  const oldSlot = slot.get();
  if (gPartyMenu.layout === C.PARTY_LAYOUT_SINGLE) UpdatePartySelectionSingleLayout(slot, movementDir);
  else UpdatePartySelectionDoubleLayout(slot, movementDir);
  if (slot.get() !== oldSlot) {
    sound.playSE(C.SE_SELECT);
    AnimatePartySlot(oldSlot, 0);
    AnimatePartySlot(slot.get(), 1);
  }
}

function UpdatePartySelectionSingleLayout(slot: SlotRef, movementDir: number): void {
  const count = CalculatePlayerPartyCount();
  const cur = slot.get();
  switch (movementDir) {
    case MENU_DIR_UP:
      if (cur === 0) slot.set(SLOT_CANCEL);
      else if (cur === SLOT_CONFIRM) slot.set(count - 1);
      else if (cur === SLOT_CANCEL) slot.set(pmi().chooseMultiple ? SLOT_CONFIRM : count - 1);
      else slot.set(cur - 1);
      break;
    case MENU_DIR_DOWN:
      if (cur === SLOT_CANCEL) slot.set(0);
      else if (cur === count - 1) slot.set(pmi().chooseMultiple ? SLOT_CONFIRM : SLOT_CANCEL);
      else slot.set(cur + 1);
      break;
    case MENU_DIR_RIGHT:
      if (count !== 1 && cur === 0) slot.set(pmi().lastSelectedSlot === 0 ? 1 : pmi().lastSelectedSlot);
      break;
    case MENU_DIR_LEFT:
      if (cur !== 0 && cur !== SLOT_CONFIRM && cur !== SLOT_CANCEL) { pmi().lastSelectedSlot = cur; slot.set(0); }
      break;
  }
}

function UpdatePartySelectionDoubleLayout(slot: SlotRef, movementDir: number): void {
  const count = CalculatePlayerPartyCount();
  let newSlot = movementDir;
  const has = (i: number): boolean => GetMonData(mon(i), C.MON_DATA_SPECIES) !== C.SPECIES_NONE;
  switch (movementDir) {
    case MENU_DIR_UP:
      if (slot.get() === 0) { slot.set(SLOT_CANCEL); break; }
      if (slot.get() === SLOT_CONFIRM) { slot.set(count - 1); break; }
      if (slot.get() === SLOT_CANCEL) {
        if (pmi().chooseMultiple) { slot.set(SLOT_CONFIRM); break; }
        slot.set(slot.get() - 1);
      }
      newSlot = GetNewSlotDoubleLayout(slot.get(), newSlot);
      if (newSlot !== -1) slot.set(newSlot);
      break;
    case MENU_DIR_DOWN:
      if (slot.get() === SLOT_CONFIRM) slot.set(SLOT_CANCEL);
      else if (slot.get() === SLOT_CANCEL) slot.set(0);
      else {
        newSlot = GetNewSlotDoubleLayout(slot.get(), MENU_DIR_DOWN);
        slot.set(newSlot === -1 ? (pmi().chooseMultiple ? SLOT_CONFIRM : SLOT_CANCEL) : newSlot);
      }
      break;
    case MENU_DIR_RIGHT:
      if (slot.get() === 0) {
        if (pmi().lastSelectedSlot === 3) { if (has(3)) slot.set(3); }
        else if (has(2)) slot.set(2);
      } else if (slot.get() === 1) {
        if (pmi().lastSelectedSlot === 5) { if (has(5)) slot.set(5); }
        else if (has(4)) slot.set(4);
      }
      break;
    case MENU_DIR_LEFT:
      if (slot.get() === 2 || slot.get() === 3) { pmi().lastSelectedSlot = slot.get(); slot.set(0); }
      else if (slot.get() === 4 || slot.get() === 5) { pmi().lastSelectedSlot = slot.get(); slot.set(1); }
      break;
  }
}

function GetNewSlotDoubleLayout(slotId: number, movementDir: number): number {
  for (;;) {
    slotId = s8(slotId + movementDir);
    if ((slotId & 0xff) >= SLOT_CONFIRM) return -1;
    if (GetMonData(mon(slotId), C.MON_DATA_SPECIES) !== C.SPECIES_NONE) return slotId;
  }
}

/** GetMonNickname */
function GetMonNickname(m: Mon): Uint8Array {
  const dest = new Uint8Array(C.POKEMON_NAME_LENGTH + 1);
  GetMonData(m, C.MON_DATA_NICKNAME, dest);
  return dest;
}

// ---------------------------------------------------------------- messages

let sPrintTaskKeepOpen = new Map<number, boolean>();

/** DisplayPartyMenuMessage */
export function DisplayPartyMenuMessage(str: ArrayLike<number>, keepOpen: boolean): number {
  PartyMenuPrintText(str);
  const taskId = tasks.create(Task_PrintAndWaitForText, 1);
  sPrintTaskKeepOpen.set(taskId, keepOpen);
  return taskId;
}

function Task_PrintAndWaitForText(taskId: number): void {
  if (!RunTextPrinters_CheckActive(6)) {
    if (!sPrintTaskKeepOpen.get(taskId)) {
      ClearStdWindowAndFrameToTransparent(6, false);
      ClearWindowTilemap(6);
    }
    sPrintTaskKeepOpen.delete(taskId);
    tasks.destroy(taskId);
  }
}

export function IsPartyMenuTextPrinterActive(): boolean {
  return FuncIsActiveTask(Task_PrintAndWaitForText);
}

function Task_ReturnToChooseMonAfterText(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) {
    ClearStdWindowAndFrameToTransparent(6, false);
    ClearWindowTilemap(6);
    DisplayPartyMenuStdMessage(C.PARTY_MSG_CHOOSE_MON);
    tasks.setFunc(taskId, Task_HandleChooseMonInput);
  }
}

function DisplayGaveHeldItemMessage(m: Mon, item: number, keepOpen: boolean): void {
  stringVars.var1 = GetMonNickname(m);
  stringVars.var2 = CopyItemName(item);
  stringVars.var4 = expandPlaceholders(text("gText_PkmnWasGivenItem"));
  DisplayPartyMenuMessage(stringVars.var4, keepOpen);
  ScheduleBgCopyTilemapToVram(2);
}

function DisplayTookHeldItemMessage(m: Mon, item: number, keepOpen: boolean): void {
  stringVars.var1 = GetMonNickname(m);
  stringVars.var2 = CopyItemName(item);
  stringVars.var4 = expandPlaceholders(text("gText_ReceivedItemFromPkmn"));
  DisplayPartyMenuMessage(stringVars.var4, keepOpen);
  ScheduleBgCopyTilemapToVram(2);
}

function DisplayAlreadyHoldingItemSwitchMessage(m: Mon, item: number, keepOpen: boolean): void {
  stringVars.var1 = GetMonNickname(m);
  stringVars.var2 = CopyItemName(item);
  stringVars.var4 = expandPlaceholders(text("gText_PkmnAlreadyHoldingItemSwitch"));
  DisplayPartyMenuMessage(stringVars.var4, keepOpen);
  ScheduleBgCopyTilemapToVram(2);
}

function DisplaySwitchedHeldItemMessage(item: number, item2: number, keepOpen: boolean): void {
  SetSwappedHeldItemQuestLogEvent(
    gPartyMenu.action === C.PARTY_ACTION_GIVE_PC_ITEM ? C.QL_EVENT_SWAPPED_HELD_ITEM_PC : C.QL_EVENT_SWAPPED_HELD_ITEM,
    GetMonData(mon(gPartyMenu.slotId), C.MON_DATA_SPECIES_OR_EGG), item2, item,
  );
  stringVars.var1 = CopyItemName(item);
  stringVars.var2 = CopyItemName(item2);
  stringVars.var4 = expandPlaceholders(text("gText_SwitchedPkmnItem"));
  DisplayPartyMenuMessage(stringVars.var4, keepOpen);
  ScheduleBgCopyTilemapToVram(2);
}

/** GiveItemToMon (GiveMailToMon attaches a blank message until Easy Chat is ported). */
function GiveItemToMon(m: Mon, item: number): void {
  if (isMailItem(item) && GiveMailToMon(m, item) === C.MAIL_NONE) return;
  SetMonData(m, C.MON_DATA_HELD_ITEM, item);
}

function TryTakeMonItem(m: Mon): number {
  const item = GetMonData(m, C.MON_DATA_HELD_ITEM);
  if (item === C.ITEM_NONE) return 0;
  if (!addBagItem(item, 1)) return 1;
  SetMonData(m, C.MON_DATA_HELD_ITEM, C.ITEM_NONE);
  return 2;
}

function BufferBagFullCantTakeItemMessage(itemId: number): void {
  const pocket = itemInfo(itemId)?.pocket ?? 0;
  const str = pocket === C.POCKET_TM_CASE ? CopyItemName(C.ITEM_TM_CASE) : pocket === C.POCKET_BERRY_POUCH ? CopyItemName(C.ITEM_BERRY_POUCH) : text("gText_MenuBag");
  stringVars.var1 = str;
  stringVars.var4 = expandPlaceholders(text("gText_BagFullCouldNotRemoveItem"));
}

// ---------------------------------------------------------------- HP count-up

function Task_PartyMenuModifyHP(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  data[0] += data[2];
  data[3]--;
  const m = mon(data[4]);
  SetMonData(m, C.MON_DATA_HP, data[0]);
  DisplayPartyPokemonHPCheck(m, sPartyMenuBoxes[data[4]], DRAW_MENU_BOX_AND_TEXT);
  DisplayPartyPokemonHPBarCheck(m, sPartyMenuBoxes[data[4]]);
  if (data[3] === 0 || data[0] === 0 || data[0] === data[1]) {
    if (data[0] > data[5]) stringVars.var2 = intToDecimal(data[0] - data[5], STR_CONV_MODE_LEFT_ALIGN, 3);
    SwitchTaskToFollowupFunc(taskId);
  }
}

/** PartyMenuModifyHP(taskId, slot, hpIncrement, hpDifference, task) */
export function PartyMenuModifyHP(taskId: number, slot: number, hpIncrement: number, hpDifference: number, task: TaskFunc): void {
  const m = mon(slot);
  const data = tasks.tasks[taskId].data;
  data[0] = GetMonData(m, C.MON_DATA_HP);
  data[1] = GetMonData(m, C.MON_DATA_MAX_HP);
  data[2] = hpIncrement;
  data[3] = hpDifference;
  data[4] = slot;
  data[5] = data[0];
  SetTaskFuncWithFollowupFunc(taskId, Task_PartyMenuModifyHP, task);
}

/** ResetHPTaskData (always called with caseId 0) */
function ResetHPTaskData(taskId: number, hp: number): void {
  const data = tasks.tasks[taskId].data;
  data[0] = hp;
  data[5] = hp;
}

export function GetAilmentFromStatus(status: number): number {
  if (status & C.STATUS1_PSN_ANY) return C.AILMENT_PSN;
  if (status & C.STATUS1_PARALYSIS) return C.AILMENT_PRZ;
  if (status & C.STATUS1_SLEEP) return C.AILMENT_SLP;
  if (status & C.STATUS1_FREEZE) return C.AILMENT_FRZ;
  if (status & C.STATUS1_BURN) return C.AILMENT_BRN;
  return C.AILMENT_NONE;
}

export function GetMonAilment(m: Mon): number {
  if (GetMonData(m, C.MON_DATA_HP) === 0) return C.AILMENT_FNT;
  const ailment = GetAilmentFromStatus(GetMonData(m, C.MON_DATA_STATUS));
  if (ailment !== C.AILMENT_NONE) return ailment;
  // CheckPartyPokerus: infected and not yet cured.
  if ((m.pokerus & 0xf) !== 0) return C.AILMENT_PKRS;
  return C.AILMENT_NONE;
}

// ---------------------------------------------------------------- tutors

function CanMonLearnTMTutor(m: Mon, item: number, tutor: number): number {
  if (GetMonData(m, C.MON_DATA_IS_EGG)) return CANNOT_LEARN_MOVE_IS_EGG;
  let move: number;
  if (item >= C.ITEM_TM01) {
    if (!CanMonLearnTMHM(m, item - C.ITEM_TM01)) return CANNOT_LEARN_MOVE;
    move = ItemIdToBattleMoveId(item);
  } else if (!CanLearnTutorMove(GetMonData(m, C.MON_DATA_SPECIES), tutor)) {
    return CANNOT_LEARN_MOVE;
  } else {
    move = GetTutorMove(tutor);
  }
  return MonKnowsMove(m, move) ? ALREADY_KNOWS_MOVE : CAN_LEARN_MOVE;
}

function GetTutorMove(tutor: number): number {
  switch (tutor) {
    case TUTOR_MOVE_FRENZY_PLANT: return C.MOVE_FRENZY_PLANT;
    case TUTOR_MOVE_BLAST_BURN: return C.MOVE_BLAST_BURN;
    case TUTOR_MOVE_HYDRO_CANNON: return C.MOVE_HYDRO_CANNON;
    default: return rd<number[]>("sTutorMoves")[tutor];
  }
}

function CanLearnTutorMove(species: number, tutor: number): boolean {
  switch (tutor) {
    case TUTOR_MOVE_FRENZY_PLANT: return species === C.SPECIES_VENUSAUR;
    case TUTOR_MOVE_BLAST_BURN: return species === C.SPECIES_CHARIZARD;
    case TUTOR_MOVE_HYDRO_CANNON: return species === C.SPECIES_BLASTOISE;
    default: return !!((rd<number[]>("sTutorLearnsets")[species] ?? 0) & (1 << tutor));
  }
}

// ---------------------------------------------------------------- first battle (Oak's lab) voiceover

function Task_FirstBattleEnterParty_WaitFadeIn(taskId: number): void {
  if (!gPaletteFade.active) tasks.setFunc(taskId, Task_FirstBattleEnterParty_DarkenScreen);
}
function Task_FirstBattleEnterParty_DarkenScreen(taskId: number): void {
  BeginNormalPaletteFade(0xffff1fff, 4, 0, 6, RGB_BLACK);
  tasks.setFunc(taskId, Task_FirstBattleEnterParty_WaitDarken);
}
function Task_FirstBattleEnterParty_WaitDarken(taskId: number): void {
  if (!gPaletteFade.active) tasks.setFunc(taskId, Task_FirstBattleEnterParty_CreatePrinter);
}
function Task_FirstBattleEnterParty_CreatePrinter(taskId: number): void {
  tasks.tasks[taskId].data[0] = FirstBattleEnterParty_CreateWindowAndMsg1Printer();
  tasks.setFunc(taskId, Task_FirstBattleEnterParty_RunPrinterMsg1);
}
function Task_FirstBattleEnterParty_RunPrinterMsg1(taskId: number): void {
  if (!RunTextPrinters_CheckActive(tasks.tasks[taskId].data[0] & 0xff)) tasks.setFunc(taskId, Task_FirstBattleEnterParty_LightenFirstMonIcon);
}
function Task_FirstBattleEnterParty_LightenFirstMonIcon(taskId: number): void {
  BeginNormalPaletteFade(0xffff0008, 4, 6, 0, RGB_BLACK);
  tasks.setFunc(taskId, Task_FirstBattleEnterParty_WaitLightenFirstMonIcon);
}
function Task_FirstBattleEnterParty_WaitLightenFirstMonIcon(taskId: number): void {
  if (!gPaletteFade.active) tasks.setFunc(taskId, Task_FirstBattleEnterParty_StartPrintMsg2);
}
function Task_FirstBattleEnterParty_StartPrintMsg2(taskId: number): void {
  PartyMenu_Oak_PrintText(tasks.tasks[taskId].data[0], text("gText_OakThisIsListOfPokemon"));
  tasks.setFunc(taskId, Task_FirstBattleEnterParty_RunPrinterMsg2);
}
function Task_FirstBattleEnterParty_RunPrinterMsg2(taskId: number): void {
  const windowId = tasks.tasks[taskId].data[0] & 0xff;
  if (!RunTextPrinters_CheckActive(windowId)) {
    FirstBattleEnterParty_DestroyVoiceoverWindow(windowId);
    tasks.setFunc(taskId, Task_FirstBattleEnterParty_FadeNormal);
  }
}
function Task_FirstBattleEnterParty_FadeNormal(taskId: number): void {
  BeginNormalPaletteFade(0x0000fff7, 4, 6, 0, RGB_BLACK);
  tasks.setFunc(taskId, Task_FirstBattleEnterParty_WaitFadeNormal);
}
function Task_FirstBattleEnterParty_WaitFadeNormal(taskId: number): void {
  if (gPaletteFade.active) return;
  LoadUserWindowGfx(0, 0x4f, BG_PLTT_ID(13), save.options.frameType);
  LoadStdWindowGfx(0, 0x58, BG_PLTT_ID(15));
  DisplayPartyMenuStdMessage(gPartyMenu.action === C.PARTY_ACTION_USE_ITEM ? C.PARTY_MSG_USE_ON_WHICH_MON : C.PARTY_MSG_CHOOSE_MON);
  tasks.setFunc(taskId, Task_HandleChooseMonInput);
}

// ---------------------------------------------------------------- windows

function InitPartyMenuWindows(layout: number): void {
  const names = ["sSinglePartyMenuWindowTemplate", "sDoublePartyMenuWindowTemplate", "sMultiPartyMenuWindowTemplate", "sShowcaseMultiPartyMenuWindowTemplate"];
  InitWindows(rd<WindowTemplate[]>(names[layout] ?? names[3]));
  DeactivateAllTextPrinters();
  for (let i = 0; i < PARTY_SIZE; i++) FillWindowPixelBuffer(i, PIXEL_FILL(0));
  LoadUserWindowGfx(0, 0x4f, BG_PLTT_ID(13), save.options.frameType);
  LoadStdWindowGfx(0, 0x58, BG_PLTT_ID(15));
  LoadPalette(GetTextWindowPalette(2), BG_PLTT_ID(12), 32);
  LoadPalette(GetTextWindowPalette(0), BG_PLTT_ID(14), 32);
}

function CreateCancelConfirmWindows(chooseMultiple: boolean): void {
  const colors = rd<number[][]>("sFontColorTable");
  let cancelWindowId: number;
  let offset: number;
  if (chooseMultiple) {
    const confirmWindowId = AddWindow(rd<WindowTemplate>("sConfirmButtonWindowTemplate"));
    FillWindowPixelBuffer(confirmWindowId, PIXEL_FILL(0));
    const ok = text("gText_PartyMenu_OK");
    AddTextPrinterParameterized4(confirmWindowId, FONT_SMALL, Math.floor((48 - GetStringWidth(FONT_SMALL, ok, 0)) / 2), 1, 0, 0, colors[0], -1, ok);
    PutWindowTilemap(confirmWindowId);
    CopyWindowToVram(confirmWindowId, COPYWIN_GFX);
    cancelWindowId = AddWindow(rd<WindowTemplate>("sMultiCancelButtonWindowTemplate"));
    offset = 0;
  } else {
    cancelWindowId = AddWindow(rd<WindowTemplate>("sCancelButtonWindowTemplate"));
    offset = 3;
  }
  FillWindowPixelBuffer(cancelWindowId, PIXEL_FILL(0));
  const cancel = text("gFameCheckerText_Cancel");
  offset += Math.floor((48 - GetStringWidth(FONT_SMALL, cancel, 0)) / 2);
  AddTextPrinterParameterized3(cancelWindowId, FONT_SMALL, offset, 1, colors[0], -1, cancel);
  PutWindowTilemap(cancelWindowId);
  CopyWindowToVram(cancelWindowId, COPYWIN_GFX);
  ScheduleBgCopyTilemapToVram(0);
}

function GetPartyMenuPalBufferPtr(paletteId: number): Uint16Array {
  return pmi().palBuffer.subarray(paletteId);
}

function BlitBitmapToPartyWindow(windowId: number, tileNums: Uint8Array, menuBoxWidth: number, x: number, y: number, width: number, height: number): void {
  const pixels = new Uint8Array(height * width * 32);
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) pixels.set(GetPartyMenuBgTile(tileNums[x + j + (y + i) * menuBoxWidth]), (i * width + j) * 32);
  }
  BlitBitmapToWindow(windowId, pixels, x * 8, y * 8, width * 8, height * 8);
}

function BlitBitmapToPartyWindow_LeftColumn(windowId: number, x: number, y: number, width: number, height: number, hideHP: boolean): void {
  if (width === 0 && height === 0) { width = 10; height = 7; }
  BlitBitmapToPartyWindow(windowId, incbin(hideHP ? "sSlotTilemap_MainNoHP" : "sSlotTilemap_Main"), 10, x, y, width, height);
}

function BlitBitmapToPartyWindow_RightColumn(windowId: number, x: number, y: number, width: number, height: number, hideHP: boolean): void {
  if (width === 0 && height === 0) { width = 18; height = 3; }
  BlitBitmapToPartyWindow(windowId, incbin(hideHP ? "sSlotTilemap_WideNoHP" : "sSlotTilemap_Wide"), 18, x, y, width, height);
}

function DrawEmptySlot(windowId: number): void {
  BlitBitmapToPartyWindow(windowId, incbin("sSlotTilemap_WideEmpty"), 18, 0, 0, 18, 3);
}

function loadBoxPal(paletteIds: string, paletteOffsets: string, palOffset: number): void {
  const ids = rd<number[]>(paletteIds), offs = rd<number[]>(paletteOffsets);
  for (let i = 0; i < 3; i++) LoadPalette(GetPartyMenuPalBufferPtr(ids[i]), offs[i] + palOffset, 2);
}

function LoadPartyBoxPalette(box: PartyMenuBox, palFlags: number): void {
  const palOffset = BG_PLTT_ID(GetWindowAttribute(box.windowId, WINDOW_PALETTE_NUM));
  const O1 = "sPartyBoxPalOffsets1", O2 = "sPartyBoxPalOffsets2";
  if (palFlags & PARTY_PAL_TO_SOFTBOIL) {
    loadBoxPal("sPartyBoxSelectedForActionPalIds1", O1, palOffset);
    loadBoxPal(palFlags & PARTY_PAL_SELECTED ? "sPartyBoxCurrSelectionPalIds2" : "sPartyBoxSelectedForActionPalIds2", O2, palOffset);
  } else if (palFlags & PARTY_PAL_SWITCHING) {
    loadBoxPal("sPartyBoxSelectedForActionPalIds1", O1, palOffset);
    loadBoxPal("sPartyBoxSelectedForActionPalIds2", O2, palOffset);
  } else if (palFlags & PARTY_PAL_TO_SWITCH) {
    loadBoxPal("sPartyBoxSelectedForActionPalIds1", O1, palOffset);
    loadBoxPal(palFlags & PARTY_PAL_SELECTED ? "sPartyBoxCurrSelectionPalIds2" : "sPartyBoxSelectedForActionPalIds2", O2, palOffset);
  } else if (palFlags & PARTY_PAL_FAINTED) {
    if (palFlags & PARTY_PAL_SELECTED) {
      loadBoxPal("sPartyBoxCurrSelectionFaintedPalIds", O1, palOffset);
      loadBoxPal("sPartyBoxCurrSelectionPalIds2", O2, palOffset);
    } else {
      loadBoxPal("sPartyBoxFaintedPalIds1", O1, palOffset);
      loadBoxPal("sPartyBoxFaintedPalIds2", O2, palOffset);
    }
  } else if (palFlags & PARTY_PAL_MULTI_ALT) {
    if (palFlags & PARTY_PAL_SELECTED) {
      loadBoxPal("sPartyBoxCurrSelectionMultiPalIds", O1, palOffset);
      loadBoxPal("sPartyBoxCurrSelectionPalIds2", O2, palOffset);
    } else {
      loadBoxPal("sPartyBoxMultiPalIds1", O1, palOffset);
      loadBoxPal("sPartyBoxMultiPalIds2", O2, palOffset);
    }
  } else if (palFlags & PARTY_PAL_SELECTED) {
    loadBoxPal("sPartyBoxCurrSelectionPalIds1", O1, palOffset);
    loadBoxPal("sPartyBoxCurrSelectionPalIds2", O2, palOffset);
  } else {
    loadBoxPal("sPartyBoxEmptySlotPalIds1", O1, palOffset);
    loadBoxPal("sPartyBoxEmptySlotPalIds2", O2, palOffset);
  }
}

function DisplayPartyPokemonBarDetail(windowId: number, str: ArrayLike<number>, color: number, dimensions: number[]): void {
  AddTextPrinterParameterized3(windowId, FONT_SMALL, dimensions[0], dimensions[1], rd<number[][]>("sFontColorTable")[color], 0, str);
}

function DisplayPartyPokemonNickname(m: Mon, box: PartyMenuBox, draw: number): void {
  if (GetMonData(m, C.MON_DATA_SPECIES) === C.SPECIES_NONE) return;
  const d = box.infoRects.dimensions;
  if (draw === DRAW_MENU_BOX_AND_TEXT) blit(box, d[0] >> 3, d[1] >> 3, d[2] >> 3, d[3] >> 3, false);
  DisplayPartyPokemonBarDetail(box.windowId, GetMonNickname(m), 0, d);
}

function DisplayPartyPokemonLevelCheck(m: Mon, box: PartyMenuBox, draw: number): void {
  if (GetMonData(m, C.MON_DATA_SPECIES) === C.SPECIES_NONE) return;
  const ailment = GetMonAilment(m);
  if (ailment === C.AILMENT_NONE || ailment === C.AILMENT_PKRS) {
    const d = box.infoRects.dimensions;
    if (draw !== DRAW_TEXT_ONLY) blit(box, d[4] >> 3, (d[5] >> 3) + 1, d[6] >> 3, d[7] >> 3, false);
    if (draw !== DRAW_MENU_BOX_ONLY) DisplayPartyPokemonLevel(GetMonData(m, C.MON_DATA_LEVEL), box);
  }
}

function DisplayPartyPokemonLevel(level: number, box: PartyMenuBox): void {
  stringVars.var2 = intToDecimal(level, STR_CONV_MODE_LEFT_ALIGN, 3);
  stringVars.var1 = cat(text("gText_Lv"), stringVars.var2);
  DisplayPartyPokemonBarDetail(box.windowId, stringVars.var1, 0, box.infoRects.dimensions.slice(4));
}

function DisplayPartyPokemonGenderNidoranCheck(m: Mon, box: PartyMenuBox, draw: number): void {
  const d = box.infoRects.dimensions;
  if (draw === DRAW_MENU_BOX_AND_TEXT) blit(box, d[8] >> 3, (d[9] >> 3) + 1, d[10] >> 3, d[11] >> 3, false);
  DisplayPartyPokemonGender(GetMonGender(m), GetMonData(m, C.MON_DATA_SPECIES), GetMonNickname(m), box);
}

function DisplayPartyPokemonGender(gender: number, species: number, nickname: Uint8Array, box: PartyMenuBox): void {
  const palOffset = BG_PLTT_ID(GetWindowAttribute(box.windowId, WINDOW_PALETTE_NUM));
  if (species === C.SPECIES_NONE) return;
  if ((species === C.SPECIES_NIDORAN_M || species === C.SPECIES_NIDORAN_F) && u8str(nickname).join() === u8str(speciesName(species)).join()) return;
  const offs = rd<number[]>("sGenderPalOffsets");
  const dims = box.infoRects.dimensions.slice(8);
  if (gender === C.MON_MALE) {
    const ids = rd<number[]>("sGenderMalePalIds");
    LoadPalette(GetPartyMenuPalBufferPtr(ids[0]), offs[0] + palOffset, 2);
    LoadPalette(GetPartyMenuPalBufferPtr(ids[1]), offs[1] + palOffset, 2);
    DisplayPartyPokemonBarDetail(box.windowId, text("gText_MaleSymbol"), 2, dims);
  } else if (gender === C.MON_FEMALE) {
    const ids = rd<number[]>("sGenderFemalePalIds");
    LoadPalette(GetPartyMenuPalBufferPtr(ids[0]), offs[0] + palOffset, 2);
    LoadPalette(GetPartyMenuPalBufferPtr(ids[1]), offs[1] + palOffset, 2);
    DisplayPartyPokemonBarDetail(box.windowId, text("gText_FemaleSymbol"), 2, dims);
  }
}

function DisplayPartyPokemonHPCheck(m: Mon, box: PartyMenuBox, draw: number): void {
  if (GetMonData(m, C.MON_DATA_SPECIES) === C.SPECIES_NONE) return;
  const d = box.infoRects.dimensions;
  if (draw !== DRAW_TEXT_ONLY) blit(box, d[12] >> 3, (d[13] >> 3) + 1, d[14] >> 3, d[15] >> 3, false);
  if (draw !== DRAW_MENU_BOX_ONLY) DisplayPartyPokemonHP(GetMonData(m, C.MON_DATA_HP), box);
}

function DisplayPartyPokemonHP(hp: number, box: PartyMenuBox): void {
  const CHAR_SLASH = 0xba;
  stringVars.var1 = Uint8Array.from([...u8str(intToDecimal(hp, STR_CONV_MODE_RIGHT_ALIGN, 3)), CHAR_SLASH, 0xff]);
  DisplayPartyPokemonBarDetail(box.windowId, stringVars.var1, 0, box.infoRects.dimensions.slice(12));
}

function DisplayPartyPokemonMaxHPCheck(m: Mon, box: PartyMenuBox, draw: number): void {
  if (GetMonData(m, C.MON_DATA_SPECIES) === C.SPECIES_NONE) return;
  const d = box.infoRects.dimensions;
  if (draw !== DRAW_TEXT_ONLY) blit(box, (d[16] >> 3) + 1, (d[17] >> 3) + 1, d[18] >> 3, d[19] >> 3, false);
  if (draw !== DRAW_MENU_BOX_ONLY) DisplayPartyPokemonMaxHP(GetMonData(m, C.MON_DATA_MAX_HP), box);
}

function DisplayPartyPokemonMaxHP(maxhp: number, box: PartyMenuBox): void {
  stringVars.var2 = intToDecimal(maxhp, STR_CONV_MODE_RIGHT_ALIGN, 3);
  stringVars.var1 = cat(text("gText_Slash"), stringVars.var2);
  DisplayPartyPokemonBarDetail(box.windowId, stringVars.var1, 0, box.infoRects.dimensions.slice(16));
}

function DisplayPartyPokemonHPBarCheck(m: Mon, box: PartyMenuBox): void {
  if (GetMonData(m, C.MON_DATA_SPECIES) !== C.SPECIES_NONE) DisplayPartyPokemonHPBar(GetMonData(m, C.MON_DATA_HP), GetMonData(m, C.MON_DATA_MAX_HP), box);
}

function DisplayPartyPokemonHPBar(hp: number, maxhp: number, box: PartyMenuBox): void {
  const palOffset = BG_PLTT_ID(GetWindowAttribute(box.windowId, WINDOW_PALETTE_NUM));
  const offs = rd<number[]>("sHPBarPalOffsets");
  let ids: number[];
  switch (GetHPBarLevel(hp, maxhp)) {
    case C.HP_BAR_GREEN: case C.HP_BAR_FULL: ids = rd("sHPBarGreenPalIds"); break;
    case C.HP_BAR_YELLOW: ids = rd("sHPBarYellowPalIds"); break;
    default: ids = rd("sHPBarRedPalIds"); break;
  }
  LoadPalette(GetPartyMenuPalBufferPtr(ids[0]), offs[0] + palOffset, 2);
  LoadPalette(GetPartyMenuPalBufferPtr(ids[1]), offs[1] + palOffset, 2);
  const d = box.infoRects.dimensions;
  const hpFraction = GetScaledHPFraction(hp, maxhp, d[22]);
  FillWindowPixelRect(box.windowId, offs[1], d[20], d[21], hpFraction, 1);
  FillWindowPixelRect(box.windowId, offs[0], d[20], d[21] + 1, hpFraction, 2);
  if (hpFraction !== d[22]) {
    FillWindowPixelRect(box.windowId, 0x0d, d[20] + hpFraction, d[21], d[22] - hpFraction, 1);
    FillWindowPixelRect(box.windowId, 0x02, d[20] + hpFraction, d[21] + 1, d[22] - hpFraction, 2);
  }
  CopyWindowToVram(box.windowId, COPYWIN_GFX);
}

function DisplayPartyPokemonDescriptionText(stringId: number, box: PartyMenuBox, draw: number): void {
  const r = box.infoRects;
  if (draw !== DRAW_TEXT_ONLY) blit(box, r.descTextLeft >> 3, r.descTextTop >> 3, r.descTextWidth >> 3, r.descTextHeight >> 3, true);
  if (draw !== DRAW_MENU_BOX_ONLY) {
    AddTextPrinterParameterized3(box.windowId, FONT_NORMAL_COPY_1, r.descTextLeft, r.descTextTop, rd<number[][]>("sFontColorTable")[0], 0,
      symText(rd<SymRef[]>("sDescriptionStringTable")[stringId]));
  }
}

function PartyMenuRemoveWindow(which: number): void {
  const id = pmi().windowId[which];
  if (id !== WINDOW_NONE) {
    ClearStdWindowAndFrameToTransparent(id, false);
    RemoveWindow(id);
    pmi().windowId[which] = WINDOW_NONE;
    ScheduleBgCopyTilemapToVram(2);
  }
}

/** DisplayPartyMenuStdMessage */
export function DisplayPartyMenuStdMessage(stringId: number): void {
  displayStdMessage(stringId, null);
}

/** The std message window with arbitrary text (field-move failures pass their message). */
function displayStdMessage(stringId: number, str: ArrayLike<number> | null): void {
  PartyMenuRemoveWindow(1);
  if (stringId === C.PARTY_MSG_NONE) return;
  let template: string;
  switch (stringId) {
    case C.PARTY_MSG_DO_WHAT_WITH_MON: template = "sDoWhatWithMonMsgWindowTemplate"; break;
    case C.PARTY_MSG_DO_WHAT_WITH_ITEM: template = "sDoWhatWithItemMsgWindowTemplate"; break;
    case C.PARTY_MSG_DO_WHAT_WITH_MAIL: template = "sDoWhatWithMailMsgWindowTemplate"; break;
    case C.PARTY_MSG_RESTORE_WHICH_MOVE: case C.PARTY_MSG_BOOST_PP_WHICH_MOVE: template = "sWhichMoveMsgWindowTemplate"; break;
    default: template = "sDefaultPartyMsgWindowTemplate"; break;
  }
  const windowId = AddWindow(rd<WindowTemplate>(template));
  pmi().windowId[1] = windowId;
  if (stringId === C.PARTY_MSG_CHOOSE_MON) {
    if (pmi().chooseMultiple) stringId = C.PARTY_MSG_CHOOSE_MON_AND_CONFIRM;
    else if (!ShouldUseChooseMonText()) stringId = C.PARTY_MSG_CHOOSE_MON_OR_CANCEL;
  }
  DrawStdFrameWithCustomTileAndPalette(windowId, false, 0x58, 15);
  stringVars.var4 = expandPlaceholders(str ?? symText(rd<SymRef[]>("sActionStringTable")[stringId]));
  AddTextPrinterParameterized(windowId, FONT_NORMAL, stringVars.var4, 0, 2, 0, null);
  ScheduleBgCopyTilemapToVram(2);
}

function ShouldUseChooseMonText(): boolean {
  if (gPartyMenu.action === C.PARTY_ACTION_SEND_OUT) return true;
  let numAliveMons = 0;
  for (let i = 0; i < PARTY_SIZE; i++) {
    const m = mon(i);
    if (GetMonData(m, C.MON_DATA_SPECIES) !== C.SPECIES_NONE && (GetMonData(m, C.MON_DATA_HP) !== 0 || GetMonData(m, C.MON_DATA_IS_EGG))) numAliveMons++;
    if (numAliveMons > 1) return true;
  }
  return false;
}

const SELECTWINDOW_ACTIONS = 0, SELECTWINDOW_ITEM = 1, SELECTWINDOW_MAIL = 2, SELECTWINDOW_MOVES = 3;

type CursorOption = [SymRef, SymRef];
function cursorOptionText(option: number): Uint8Array {
  const [label] = rd<CursorOption[]>("sCursorOptions")[option];
  const s = label as SymRef & { index?: number };
  return symName(s) === "gMoveNames" ? moveName(s.index ?? 0) : symText(s);
}

function DisplaySelectionWindow(windowType: number): number {
  let window: WindowTemplate;
  switch (windowType) {
    case SELECTWINDOW_ACTIONS:
      window = { bg: 2, tilemapLeft: 19, tilemapTop: 19 - pmi().numActions * 2, width: 10, height: pmi().numActions * 2, paletteNum: 14, baseBlock: 0x2bf };
      break;
    case SELECTWINDOW_ITEM: window = rd("sItemGiveTakeWindowTemplate"); break;
    case SELECTWINDOW_MAIL: window = rd("sMailReadTakeWindowTemplate"); break;
    default: window = rd("sMoveSelectWindowTemplate"); break;
  }
  pmi().windowId[0] = AddWindow(window);
  DrawStdFrameWithCustomTileAndPalette(pmi().windowId[0], false, 0x4f, 13);
  if (windowType === SELECTWINDOW_MOVES) return pmi().windowId[0];
  const cursorDimension = GetMenuCursorDimensionByFont(FONT_NORMAL, 0);
  const letterSpacing = GetFontAttribute(FONT_NORMAL, FONTATTR_LETTER_SPACING);
  const colors = rd<number[][]>("sFontColorTable");
  for (let i = 0; i < pmi().numActions; i++) {
    const colorId = pmi().actions[i] >= CURSOR_OPTION_FIELD_MOVES ? 4 : 3;
    AddTextPrinterParameterized4(pmi().windowId[0], FONT_NORMAL, cursorDimension, i * 16 + 2, letterSpacing, 0, colors[colorId], 0, cursorOptionText(pmi().actions[i]));
  }
  Menu_InitCursorInternal(pmi().windowId[0], FONT_NORMAL, 0, 2, 16, pmi().numActions, 0, true);
  ScheduleBgCopyTilemapToVram(2);
  return pmi().windowId[0];
}

function PartyMenuPrintText(str: ArrayLike<number>): void {
  DrawStdFrameWithCustomTileAndPalette(6, false, 0x4f, 13);
  textFlags.canABSpeedUpPrint = true;
  AddTextPrinterParameterized2(6, FONT_NORMAL, str, getTextSpeedSetting(), null, 2, 1, 3);
}

function PartyMenuDisplayYesNoMenu(): void {
  CreateYesNoMenu(rd<WindowTemplate>("sPartyMenuYesNoWindowTemplate"), FONT_NORMAL, 0, 2, 0x4f, 13, 0);
}

function CreateLevelUpStatsWindow(): number {
  pmi().windowId[0] = AddWindow(rd<WindowTemplate>("sLevelUpStatsWindowTemplate"));
  DrawStdFrameWithCustomTileAndPalette(pmi().windowId[0], false, 0x4f, 13);
  return pmi().windowId[0];
}

function RemoveLevelUpStatsWindow(): void {
  ClearWindowTilemap(pmi().windowId[0]);
  PartyMenuRemoveWindow(0);
}

function PartyMenu_Oak_PrintText(windowId: number, str: ArrayLike<number>): void {
  stringVars.var4 = expandPlaceholders(str);
  textFlags.canABSpeedUpPrint = true;
  AddTextPrinterParameterized2(windowId, FONT_MALE, stringVars.var4, getTextSpeedSetting(), null, 2, 1, 3);
}

function FirstBattleEnterParty_CreateWindowAndMsg1Printer(): number {
  const windowId = AddWindow(rd<WindowTemplate>("sWindowTemplate_FirstBattleOakVoiceover"));
  LoadMenuMessageWindowGfx(windowId, 0x4f, BG_PLTT_ID(14));
  DrawDialogFrameWithCustomTileAndPalette(windowId, true, 0x4f, 0x0e);
  PartyMenu_Oak_PrintText(windowId, text("gText_OakImportantToGetToKnowPokemonThroughly"));
  return windowId;
}

function FirstBattleEnterParty_DestroyVoiceoverWindow(windowId: number): void {
  ClearWindowTilemap(windowId);
  ClearDialogWindowAndFrameToTransparent(windowId, false);
  RemoveWindow(windowId);
  ScheduleBgCopyTilemapToVram(2);
}

/** help_message.c DrawHelpMessageWindowTilesById */
function DrawHelpMessageWindowTilesById(windowId: number): void {
  const gfx = incbin("gHelpMessageWindow_Gfx");
  const width = GetWindowAttribute(windowId, WINDOW_WIDTH), height = GetWindowAttribute(windowId, WINDOW_HEIGHT);
  const buffer = new Uint8Array(32 * width * height);
  for (let i = 0; i < height; i++) {
    const tileId = i === 0 ? 0 : i === height - 1 ? 14 : 5;
    for (let j = 0; j < width; j++) buffer.set(gfx.subarray(tileId * 32, tileId * 32 + 32), (i * width + j) * 32);
  }
  CopyToWindowPixelBuffer(windowId, buffer, buffer.length, 0);
}

function ToggleFieldMoveDescriptionWindow(action: number): void {
  const p = pmi();
  if (action < CURSOR_OPTION_FIELD_MOVES) {
    if (p.windowId[2] !== WINDOW_NONE) {
      ClearWindowTilemap(p.windowId[2]);
      RemoveWindow(p.windowId[2]);
      p.windowId[2] = WINDOW_NONE;
      ScheduleBgCopyTilemapToVram(2);
    }
  } else {
    if (p.windowId[2] === WINDOW_NONE) p.windowId[2] = AddWindow(rd<WindowTemplate>("sFieldMoveDescriptionWindowTemplate"));
    DrawHelpMessageWindowTilesById(p.windowId[2]);
    AddTextPrinterParameterized4(p.windowId[2], FONT_NORMAL, 3, 6, GetFontAttribute(FONT_NORMAL, FONTATTR_LETTER_SPACING), 0, rd<number[][]>("sFontColorTable")[5], 0,
      symText(rd<SymRef[]>("sFieldMoveDescriptionTable")[action - CURSOR_OPTION_FIELD_MOVES]));
    PutWindowTilemap(p.windowId[2]);
    ScheduleBgCopyTilemapToVram(2);
  }
}

// ---------------------------------------------------------------- sprites

const tmpl = (name: string) => templateFrom(rd<CSpriteTemplate>(name));

function CreatePartyMonIconSprite(m: Mon, box: PartyMenuBox): void {
  const species = GetMonData(m, C.MON_DATA_SPECIES_OR_EGG);
  if (species !== C.SPECIES_NONE) {
    box.monSpriteId = CreateMonIcon(species, SpriteCB_UpdatePartyMonIcon, box.spriteCoords[0], box.spriteCoords[1], 4, GetMonData(m, C.MON_DATA_PERSONALITY), true);
    gSprites[box.monSpriteId].oam.priority = 1;
  }
  UpdatePartyMonHPBar(box.monSpriteId, m);
}

function UpdateHPBar(spriteId: number, hp: number, maxhp: number): void {
  const anim = [4, 3, 2, 1, 0][GetHPBarLevel(hp, maxhp)] ?? 4;
  SetPartyHPBarSprite(gSprites[spriteId], anim);
}

function UpdatePartyMonHPBar(spriteId: number, m: Mon): void {
  UpdateHPBar(spriteId, GetMonData(m, C.MON_DATA_HP), GetMonData(m, C.MON_DATA_MAX_HP));
}

function AnimateSelectedPartyIcon(spriteId: number, animNum: number): void {
  const s = gSprites[spriteId];
  s.data[0] = 0;
  if (animNum === 0) {
    if (s.x === 16) { s.x2 = 0; s.y2 = -4; } else { s.x2 = -4; s.y2 = 0; }
    s.callback = SpriteCB_UpdatePartyMonIcon;
  } else {
    s.x2 = 0;
    s.y2 = 0;
    s.callback = SpriteCB_BouncePartyMonIcon;
  }
}

function SpriteCB_BouncePartyMonIcon(sprite: Sprite): void {
  const animCmd = UpdateMonIconFrame(sprite);
  if (animCmd !== 0) sprite.y2 = animCmd & 1 ? -3 : 1;
}

function SpriteCB_UpdatePartyMonIcon(sprite: Sprite): void {
  UpdateMonIconFrame(sprite);
}

function CreatePartyMonHeldItemSprite(m: Mon, box: PartyMenuBox): void {
  if (GetMonData(m, C.MON_DATA_SPECIES) !== C.SPECIES_NONE) {
    box.itemSpriteId = CreateSprite(tmpl("sSpriteTemplate_HeldItem"), box.spriteCoords[2], box.spriteCoords[3], 0);
    UpdatePartyMonHeldItemSprite(m, box);
  }
}

function UpdatePartyMonHeldItemSprite(m: Mon, box: PartyMenuBox): void {
  ShowOrHideHeldItemSprite(GetMonData(m, C.MON_DATA_HELD_ITEM), box);
}

function ShowOrHideHeldItemSprite(item: number, box: PartyMenuBox): void {
  const s = gSprites[box.itemSpriteId];
  if (item === C.ITEM_NONE) { s.invisible = true; return; }
  StartSpriteAnim(s, isMailItem(item) ? 1 : 0);
  s.invisible = false;
}

export function LoadHeldItemIcons(): void {
  LoadSpriteSheet({ data: incbin("sHeldItemGfx"), size: 64, tag: 55120 });
  LoadSpritePalette({ data: incbin("sHeldItemPalette"), tag: 55120 });
}

function CreatePartyMonPokeballSprite(m: Mon, box: PartyMenuBox): void {
  if (GetMonData(m, C.MON_DATA_SPECIES) !== C.SPECIES_NONE) {
    box.pokeballSpriteId = CreateSprite(tmpl("sSpriteTemplate_MenuPokeball"), box.spriteCoords[6], box.spriteCoords[7], 8);
  }
}

function CreatePokeballButtonSprite(x: number, y: number): number {
  const spriteId = CreateSprite(tmpl("sSpriteTemplate_MenuPokeball"), x, y, 8);
  gSprites[spriteId].oam.priority = 2;
  return spriteId;
}

function CreateSmallPokeballButtonSprite(x: number, y: number): number {
  return CreateSprite(tmpl("sSpriteTemplate_MenuPokeballSmall"), x, y, 8);
}

function LoadPartyMenuPokeballGfx(): void {
  LoadSpriteSheet({ data: incbin("gPartyMenuPokeball_Gfx"), size: 1024, tag: 1200 });
  LoadSpriteSheet({ data: incbin("gPartyMenuPokeballSmall_Gfx"), size: 768, tag: 1201 });
  LoadSpritePalette({ data: incbin("gPartyMenuPokeball_Pal"), tag: 1200 });
}

function CreatePartyMonStatusSprite(m: Mon, box: PartyMenuBox): void {
  if (GetMonData(m, C.MON_DATA_SPECIES) !== C.SPECIES_NONE) {
    box.statusSpriteId = CreateSprite(tmpl("sSpriteTemplate_StatusIcons"), box.spriteCoords[4], box.spriteCoords[5], 0);
    SetPartyMonAilmentGfx(m, box);
  }
}

function SetPartyMonAilmentGfx(m: Mon, box: PartyMenuBox): void {
  UpdatePartyMonAilmentGfx(GetMonAilment(m), box);
}

function UpdatePartyMonAilmentGfx(status: number, box: PartyMenuBox): void {
  const s = gSprites[box.statusSpriteId];
  if (status === C.AILMENT_NONE || status === C.AILMENT_PKRS) { s.invisible = true; return; }
  StartSpriteAnim(s, status - 1);
  s.invisible = false;
}

function LoadPartyMenuAilmentGfx(): void {
  LoadSpriteSheet({ data: incbin("gStatusGfx_Icons"), size: 1024, tag: 1202 });
  LoadSpritePalette({ data: incbin("gStatusPal_Icons"), tag: 1202 });
}

// ---------------------------------------------------------------- selection actions

function SetPartyMonSelectionActions(slotId: number, action: number): void {
  if (action === ACTIONS_NONE) { SetPartyMonFieldSelectionActions(slotId); return; }
  const table = rd<Array<SymRef | 0>>("sPartyMenuActions")[action];
  const list = table ? rd<number[]>(symName(table)!) : [];
  pmi().numActions = list.length;
  pmi().actions = [...list];
}

function SetPartyMonFieldSelectionActions(slotId: number): void {
  const p = pmi();
  p.actions = [];
  const cursor = { value: 0 };
  AppendToList(p.actions, cursor, CURSOR_OPTION_SUMMARY);
  const fieldMoves = rd<number[]>("sFieldMoves");
  const m = mon(slotId);
  for (let i = 0; i < C.MAX_MON_MOVES; i++) {
    for (let j = 0; fieldMoves[j] !== C.FIELD_MOVE_END && j < fieldMoves.length; j++) {
      if (GetMonData(m, C.MON_DATA_MOVE1 + i) === fieldMoves[j]) { AppendToList(p.actions, cursor, j + CURSOR_OPTION_FIELD_MOVES); break; }
    }
  }
  if (GetMonData(mon(1), C.MON_DATA_SPECIES) !== C.SPECIES_NONE) AppendToList(p.actions, cursor, CURSOR_OPTION_SWITCH);
  AppendToList(p.actions, cursor, isMailItem(GetMonData(m, C.MON_DATA_HELD_ITEM)) ? CURSOR_OPTION_MAIL : CURSOR_OPTION_ITEM);
  AppendToList(p.actions, cursor, CURSOR_OPTION_CANCEL1);
  p.numActions = cursor.value;
}

function GetPartyMenuActionsType(m: Mon): number {
  switch (gPartyMenu.menuType) {
    case C.PARTY_MENU_TYPE_FIELD: return GetMonData(m, C.MON_DATA_IS_EGG) ? ACTIONS_SWITCH : ACTIONS_NONE;
    case C.PARTY_MENU_TYPE_IN_BATTLE: return GetPartyMenuActionsTypeInBattle(m);
    case C.PARTY_MENU_TYPE_CHOOSE_MULTIPLE_MONS:
      switch (GetPartySlotEntryStatus(gPartyMenu.slotId)) {
        case 0: return ACTIONS_ENTER;
        case 1: return ACTIONS_NO_ENTRY;
        default: return ACTIONS_SUMMARY_ONLY;
      }
    case C.PARTY_MENU_TYPE_DAYCARE: return GetMonData(m, C.MON_DATA_IS_EGG) ? ACTIONS_SUMMARY_ONLY : ACTIONS_STORE;
    default: return ACTIONS_NONE;
  }
}

function CreateSelectionWindow(): void {
  const m = mon(gPartyMenu.slotId);
  stringVars.var1 = GetMonNickname(m);
  PartyMenuRemoveWindow(1);
  SetPartyMonSelectionActions(gPartyMenu.slotId, GetPartyMenuActionsType(m));
  DisplaySelectionWindow(SELECTWINDOW_ACTIONS);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_DO_WHAT_WITH_MON);
}

function Task_TryCreateSelectionWindow(taskId: number): void {
  CreateSelectionWindow();
  tasks.tasks[taskId].data[0] = MENU_B_PRESSED & 0xff;
  tasks.setFunc(taskId, Task_HandleSelectionMenuInput);
}

function runCursorOption(option: number, taskId: number): void {
  if (option >= CURSOR_OPTION_FIELD_MOVES) { CursorCB_FieldMove(taskId); return; }
  const [, func] = rd<CursorOption[]>("sCursorOptions")[option];
  switch (symName(func)) {
    case "CursorCB_Summary": CursorCB_Summary(taskId); break;
    case "CursorCB_Switch": CursorCB_Switch(taskId); break;
    case "CursorCB_Cancel1": CursorCB_Cancel1(taskId); break;
    case "CursorCB_Item": CursorCB_Item(taskId); break;
    case "CursorCB_Give": CursorCB_Give(taskId); break;
    case "CursorCB_TakeItem": CursorCB_TakeItem(taskId); break;
    case "CursorCB_Mail": CursorCB_Mail(taskId); break;
    case "CursorCB_TakeMail": CursorCB_TakeMail(taskId); break;
    case "CursorCB_Read": CursorCB_Read(taskId); break;
    case "CursorCB_Cancel2": CursorCB_Cancel2(taskId); break;
    case "CursorCB_SendMon": CursorCB_SendMon(taskId); break;
    case "CursorCB_Enter": CursorCB_Enter(taskId); break;
    case "CursorCB_NoEntry": CursorCB_NoEntry(taskId); break;
    case "CursorCB_Store": CursorCB_Store(taskId); break;
    default: CursorCB_Cancel1(taskId); break; // Register / Trade: Union Room only
  }
}

function Task_HandleSelectionMenuInput(taskId: number): void {
  if (gPaletteFade.active) return;
  const data = tasks.tasks[taskId].data;
  const input = pmi().numActions <= 3 ? Menu_ProcessInputNoWrapAround_other() : Menu_ProcessInput_other();
  if (data[0] !== Menu_GetCursorPos()) ToggleFieldMoveDescriptionWindow(pmi().actions[Menu_GetCursorPos()]);
  data[0] = Menu_GetCursorPos();
  switch (input) {
    case MENU_NOTHING_CHOSEN: break;
    case MENU_B_PRESSED:
      sound.playSE(C.SE_SELECT);
      PartyMenuRemoveWindow(2);
      runCursorOption(pmi().actions[pmi().numActions - 1], taskId);
      break;
    default:
      PartyMenuRemoveWindow(2);
      runCursorOption(pmi().actions[input], taskId);
      break;
  }
}

function CursorCB_Summary(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  pmi().exitCallback = CB2_ShowPokemonSummaryScreen;
  Task_ClosePartyMenu(taskId);
}

function CB2_ShowPokemonSummaryScreen(): void {
  if (gPartyMenu.menuType === C.PARTY_MENU_TYPE_IN_BATTLE) UpdatePartyToBattleOrder();
  ShowPokemonSummaryScreen(gPartyMenu.slotId, CalculatePlayerPartyCount() - 1, CB2_ReturnToPartyMenuFromSummaryScreen, 0);
}

function CB2_ReturnToPartyMenuFromSummaryScreen(): void {
  gPaletteFade.bufferTransferDisabled = true;
  gPartyMenu.slotId = GetLastViewedMonIndex();
  InitPartyMenu(gPartyMenu.menuType, C.KEEP_PARTY_LAYOUT, gPartyMenu.action, true, C.PARTY_MSG_DO_WHAT_WITH_MON, Task_TryCreateSelectionWindow, gPartyMenu.exitCallback);
}

function CursorCB_Switch(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  gPartyMenu.action = C.PARTY_ACTION_SWITCH;
  PartyMenuRemoveWindow(1);
  PartyMenuRemoveWindow(0);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_MOVE_TO_WHERE);
  AnimatePartySlot(gPartyMenu.slotId, 1);
  gPartyMenu.slotId2 = gPartyMenu.slotId;
  tasks.setFunc(taskId, Task_HandleChooseMonInput);
}

// Slide animation of two switching slots (task data 0-11 as in the source).
function SwitchSelectedMons(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (gPartyMenu.slotId2 === gPartyMenu.slotId) { FinishTwoMonAction(taskId); return; }
  SetSwitchedPartyOrderQuestLogEvent(
    GetMonData(mon(gPartyMenu.slotId), C.MON_DATA_SPECIES_OR_EGG),
    GetMonData(mon(gPartyMenu.slotId2), C.MON_DATA_SPECIES_OR_EGG),
  );
  const w0 = sPartyMenuBoxes[gPartyMenu.slotId].windowId, w1 = sPartyMenuBoxes[gPartyMenu.slotId2].windowId;
  data[0] = GetWindowAttribute(w0, WINDOW_TILEMAP_LEFT); data[1] = GetWindowAttribute(w0, WINDOW_TILEMAP_TOP);
  data[2] = GetWindowAttribute(w0, WINDOW_WIDTH); data[3] = GetWindowAttribute(w0, WINDOW_HEIGHT);
  data[8] = 0; data[10] = data[2] === 10 ? -1 : 1;
  data[4] = GetWindowAttribute(w1, WINDOW_TILEMAP_LEFT); data[5] = GetWindowAttribute(w1, WINDOW_TILEMAP_TOP);
  data[6] = GetWindowAttribute(w1, WINDOW_WIDTH); data[7] = GetWindowAttribute(w1, WINDOW_HEIGHT);
  data[9] = 0; data[11] = data[6] === 10 ? -1 : 1;
  sSlot1TilemapBuffer = CopyToBufferFromBgTilemap(0, data[0], data[1], data[2], data[3]);
  sSlot2TilemapBuffer = CopyToBufferFromBgTilemap(0, data[4], data[5], data[6], data[7]);
  ClearWindowTilemap(w0);
  ClearWindowTilemap(w1);
  gPartyMenu.action = C.PARTY_ACTION_SWITCHING;
  AnimatePartySlot(gPartyMenu.slotId, 1);
  AnimatePartySlot(gPartyMenu.slotId2, 1);
  SlidePartyMenuBoxOneStep(taskId);
  tasks.setFunc(taskId, Task_SlideSelectedSlotsOffscreen);
}

/** new_menu_helpers.c CopyToBufferFromBgTilemap */
function CopyToBufferFromBgTilemap(bgId: number, left: number, top: number, width: number, height: number): Uint16Array {
  const src = GetBgTilemapBuffer(bgId)!;
  const dest = new Uint16Array(width * height);
  for (let i = 0; i < height; i++) for (let j = 0; j < width; j++) dest[i * width + j] = src[(i + top) * 32 + j + left];
  return dest;
}

function TryMovePartySlot(x: number, width: number): { leftMove: number; newX: number; newWidth: number } | null {
  if (x + width < 0 || x > 31) return null;
  if (x < 0) return { leftMove: -x, newX: 0, newWidth: width + x };
  return { leftMove: 0, newX: x, newWidth: x + width > 31 ? 32 - x : width };
}

function MoveAndBufferPartySlot(rectSrc: Uint16Array, x: number, y: number, width: number, height: number, dir: number): void {
  const a = TryMovePartySlot(x, width);
  if (!a) return;
  FillBgTilemapBufferRect_Palette0(0, 0, a.newX, y, a.newWidth, height);
  const b = TryMovePartySlot(x + dir, width);
  if (b) CopyRectToBgTilemapBufferRect(0, rectSrc, b.leftMove, 0, width, height, b.newX, y, b.newWidth, height, 17, 0, 0);
}

function MovePartyMenuBoxSprites(box: PartyMenuBox, offset: number): void {
  for (const id of [box.pokeballSpriteId, box.itemSpriteId, box.monSpriteId, box.statusSpriteId]) gSprites[id].x2 += offset * 8;
}

function SlidePartyMenuBoxSpritesOneStep(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (data[10] !== 0) MovePartyMenuBoxSprites(sPartyMenuBoxes[gPartyMenu.slotId], data[10]);
  if (data[11] !== 0) MovePartyMenuBoxSprites(sPartyMenuBoxes[gPartyMenu.slotId2], data[11]);
}

function SlidePartyMenuBoxOneStep(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (data[10] !== 0) MoveAndBufferPartySlot(sSlot1TilemapBuffer, data[0] + data[8], data[1], data[2], data[3], data[10]);
  if (data[11] !== 0) MoveAndBufferPartySlot(sSlot2TilemapBuffer, data[4] + data[9], data[5], data[6], data[7], data[11]);
  ScheduleBgCopyTilemapToVram(0);
}

function Task_SlideSelectedSlotsOffscreen(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  SlidePartyMenuBoxOneStep(taskId);
  SlidePartyMenuBoxSpritesOneStep(taskId);
  data[8] += data[10];
  data[9] += data[11];
  const pos0 = (data[0] + data[8]) & 0xffff, pos1 = (data[4] + data[9]) & 0xffff;
  if (pos0 > 33 && pos1 > 33) {
    data[10] *= -1;
    data[11] *= -1;
    SwitchPartyMon();
    DisplayPartyPokemonData(gPartyMenu.slotId);
    DisplayPartyPokemonData(gPartyMenu.slotId2);
    PutWindowTilemap(sPartyMenuBoxes[gPartyMenu.slotId].windowId);
    PutWindowTilemap(sPartyMenuBoxes[gPartyMenu.slotId2].windowId);
    sSlot1TilemapBuffer = CopyToBufferFromBgTilemap(0, data[0], data[1], data[2], data[3]);
    sSlot2TilemapBuffer = CopyToBufferFromBgTilemap(0, data[4], data[5], data[6], data[7]);
    ClearWindowTilemap(sPartyMenuBoxes[gPartyMenu.slotId].windowId);
    ClearWindowTilemap(sPartyMenuBoxes[gPartyMenu.slotId2].windowId);
    tasks.setFunc(taskId, Task_SlideSelectedSlotsOnscreen);
  }
}

function Task_SlideSelectedSlotsOnscreen(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  SlidePartyMenuBoxOneStep(taskId);
  SlidePartyMenuBoxSpritesOneStep(taskId);
  if (data[10] === 0 && data[11] === 0) {
    PutWindowTilemap(sPartyMenuBoxes[gPartyMenu.slotId].windowId);
    PutWindowTilemap(sPartyMenuBoxes[gPartyMenu.slotId2].windowId);
    ScheduleBgCopyTilemapToVram(0);
    FinishTwoMonAction(taskId);
  } else {
    data[8] += data[10];
    data[9] += data[11];
    if (data[8] === 0) data[10] = 0;
    if (data[9] === 0) data[11] = 0;
  }
}

function SwitchMenuBoxSprites(box0: PartyMenuBox, box1: PartyMenuBox, key: "pokeballSpriteId" | "itemSpriteId" | "monSpriteId" | "statusSpriteId"): void {
  const id = box0[key];
  box0[key] = box1[key];
  box1[key] = id;
  const a = gSprites[box0[key]], b = gSprites[box1[key]];
  const [x1, y1, x2, y2] = [a.x, a.y, a.x2, a.y2];
  a.x = b.x; a.y = b.y; a.x2 = b.x2; a.y2 = b.y2;
  b.x = x1; b.y = y1; b.x2 = x2; b.y2 = y2;
}

function SwitchPartyMon(): void {
  const b0 = sPartyMenuBoxes[gPartyMenu.slotId], b1 = sPartyMenuBoxes[gPartyMenu.slotId2];
  SwapPartyPokemon(gPartyMenu.slotId, gPartyMenu.slotId2);
  SwitchMenuBoxSprites(b0, b1, "pokeballSpriteId");
  SwitchMenuBoxSprites(b0, b1, "itemSpriteId");
  SwitchMenuBoxSprites(b0, b1, "monSpriteId");
  SwitchMenuBoxSprites(b0, b1, "statusSpriteId");
}

/** Finish switching mons or using Softboiled */
function FinishTwoMonAction(taskId: number): void {
  PartyMenuRemoveWindow(1);
  gPartyMenu.action = C.PARTY_ACTION_CHOOSE_MON;
  AnimatePartySlot(gPartyMenu.slotId, 0);
  gPartyMenu.slotId = gPartyMenu.slotId2;
  AnimatePartySlot(gPartyMenu.slotId2, 1);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_CHOOSE_MON);
  tasks.setFunc(taskId, Task_HandleChooseMonInput);
}

function CursorCB_Cancel1(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  PartyMenuRemoveWindow(0);
  PartyMenuRemoveWindow(1);
  DisplayPartyMenuStdMessage(gPartyMenu.menuType === C.PARTY_MENU_TYPE_DAYCARE ? C.PARTY_MSG_CHOOSE_MON_2 : C.PARTY_MSG_CHOOSE_MON);
  tasks.setFunc(taskId, Task_HandleChooseMonInput);
}

function CursorCB_Item(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  PartyMenuRemoveWindow(0);
  PartyMenuRemoveWindow(1);
  SetPartyMonSelectionActions(gPartyMenu.slotId, ACTIONS_ITEM);
  DisplaySelectionWindow(SELECTWINDOW_ITEM);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_DO_WHAT_WITH_ITEM);
  tasks.tasks[taskId].data[0] = MENU_B_PRESSED & 0xff;
  tasks.setFunc(taskId, Task_HandleSelectionMenuInput);
}

/** CB2_SelectBagItemToGive */
function CB2_SelectBagItemToGive(): void {
  GoToBagMenu(C.ITEMMENULOCATION_PARTY, C.OPEN_BAG_LAST, CB2_GiveHoldItem, {});
}

function CursorCB_Give(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  pmi().exitCallback = CB2_SelectBagItemToGive;
  Task_ClosePartyMenu(taskId);
}

/** CB2_GiveHoldItem: back from the bag with gSpecialVar_ItemId. */
export function CB2_GiveHoldItem(): void {
  const task = (f: TaskFunc) => InitPartyMenu(gPartyMenu.menuType, C.KEEP_PARTY_LAYOUT, gPartyMenu.action, true, C.PARTY_MSG_NONE, f, gPartyMenu.exitCallback);
  if (bagResult.itemId === C.ITEM_NONE) { task(Task_TryCreateSelectionWindow); return; }
  sPartyMenuItemId = GetMonData(mon(gPartyMenu.slotId), C.MON_DATA_HELD_ITEM);
  if (sPartyMenuItemId !== C.ITEM_NONE) task(Task_SwitchHoldItemsPrompt);
  else if (isMailItem(bagResult.itemId)) {
    // Mail: the Easy Chat writer is pending, so the mail goes on with a blank message.
    removeBagItem(bagResult.itemId, 1);
    GiveItemToMon(mon(gPartyMenu.slotId), bagResult.itemId);
    task(Task_DisplayGaveMailFromPartyMessage);
  } else task(Task_GiveHoldItem);
}

function Task_GiveHoldItem(taskId: number): void {
  if (gPaletteFade.active) return;
  const item = bagResult.itemId;
  DisplayGaveHeldItemMessage(mon(gPartyMenu.slotId), item, false);
  GiveItemToMon(mon(gPartyMenu.slotId), item);
  removeBagItem(item, 1);
  tasks.setFunc(taskId, Task_UpdateHeldItemSprite);
}

function Task_SwitchHoldItemsPrompt(taskId: number): void {
  if (gPaletteFade.active) return;
  DisplayAlreadyHoldingItemSwitchMessage(mon(gPartyMenu.slotId), sPartyMenuItemId, true);
  tasks.setFunc(taskId, Task_SwitchItemsYesNo);
}

function Task_SwitchItemsYesNo(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) { PartyMenuDisplayYesNoMenu(); tasks.setFunc(taskId, Task_HandleSwitchItemsYesNoInput); }
}

function Task_HandleSwitchItemsYesNoInput(taskId: number): void {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0:
      removeBagItem(bagResult.itemId, 1);
      if (!addBagItem(sPartyMenuItemId, 1)) {
        addBagItem(bagResult.itemId, 1);
        BufferBagFullCantTakeItemMessage(sPartyMenuItemId);
        DisplayPartyMenuMessage(stringVars.var4, false);
        tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText);
      } else if (isMailItem(bagResult.itemId)) {
        if (isMailItem(sPartyMenuItemId)) TakeMailFromMon(mon(gPartyMenu.slotId));
        GiveItemToMon(mon(gPartyMenu.slotId), bagResult.itemId);
        DisplaySwitchedHeldItemMessage(bagResult.itemId, sPartyMenuItemId, true);
        tasks.setFunc(taskId, Task_UpdateHeldItemSprite);
      } else {
        if (isMailItem(sPartyMenuItemId)) TakeMailFromMon(mon(gPartyMenu.slotId));
        GiveItemToMon(mon(gPartyMenu.slotId), bagResult.itemId);
        DisplaySwitchedHeldItemMessage(bagResult.itemId, sPartyMenuItemId, true);
        tasks.setFunc(taskId, Task_UpdateHeldItemSprite);
      }
      break;
    case MENU_B_PRESSED: sound.playSE(C.SE_SELECT); tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText); break;
    case 1: tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText); break;
  }
}

function Task_DisplayGaveMailFromPartyMessage(taskId: number): void {
  if (gPaletteFade.active) return;
  if (sPartyMenuItemId === C.ITEM_NONE) DisplayGaveHeldItemMessage(mon(gPartyMenu.slotId), bagResult.itemId, false);
  else DisplaySwitchedHeldItemMessage(bagResult.itemId, sPartyMenuItemId, false);
  tasks.setFunc(taskId, Task_UpdateHeldItemSprite);
}

function Task_UpdateHeldItemSprite(taskId: number): void {
  const slotId = gPartyMenu.slotId;
  if (!IsPartyMenuTextPrinterActive()) {
    UpdatePartyMonHeldItemSprite(mon(slotId), sPartyMenuBoxes[slotId]);
    Task_ReturnToChooseMonAfterText(taskId);
  }
}

function CursorCB_TakeItem(taskId: number): void {
  const m = mon(gPartyMenu.slotId);
  const item = GetMonData(m, C.MON_DATA_HELD_ITEM);
  sound.playSE(C.SE_SELECT);
  PartyMenuRemoveWindow(0);
  PartyMenuRemoveWindow(1);
  switch (TryTakeMonItem(m)) {
    case 0:
      stringVars.var1 = GetMonNickname(m);
      stringVars.var4 = expandPlaceholders(text("gText_PkmnNotHolding"));
      DisplayPartyMenuMessage(stringVars.var4, true);
      break;
    case 1:
      BufferBagFullCantTakeItemMessage(item);
      DisplayPartyMenuMessage(stringVars.var4, true);
      break;
    default:
      DisplayTookHeldItemMessage(m, item, true);
      break;
  }
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_UpdateHeldItemSprite);
}

function CursorCB_Mail(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  PartyMenuRemoveWindow(0);
  PartyMenuRemoveWindow(1);
  SetPartyMonSelectionActions(gPartyMenu.slotId, ACTIONS_MAIL);
  DisplaySelectionWindow(SELECTWINDOW_MAIL);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_DO_WHAT_WITH_MAIL);
  tasks.tasks[taskId].data[0] = MENU_B_PRESSED & 0xff;
  tasks.setFunc(taskId, Task_HandleSelectionMenuInput);
}

function CursorCB_Read(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  pmi().exitCallback = CB2_ReadHeldMail;
  Task_ClosePartyMenu(taskId);
}

function CB2_ReadHeldMail(): void {
  if (!sFieldHooks) { CB2_ReturnToPartyMenuFromReadingMail(); return; }
  sFieldHooks.readMail(gPartyMenu.slotId, CB2_ReturnToPartyMenuFromReadingMail);
}

function CB2_ReturnToPartyMenuFromReadingMail(): void {
  gPaletteFade.bufferTransferDisabled = true;
  InitPartyMenu(gPartyMenu.menuType, C.KEEP_PARTY_LAYOUT, gPartyMenu.action, true, C.PARTY_MSG_DO_WHAT_WITH_MON, Task_TryCreateSelectionWindow, gPartyMenu.exitCallback);
}

function CursorCB_TakeMail(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  PartyMenuRemoveWindow(1);
  PartyMenuRemoveWindow(0);
  DisplayPartyMenuMessage(text("gText_SendMailToPC"), true);
  tasks.setFunc(taskId, Task_SendMailToPCYesNo);
}

function Task_SendMailToPCYesNo(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) { PartyMenuDisplayYesNoMenu(); tasks.setFunc(taskId, Task_HandleSendMailToPCYesNoInput); }
}

function Task_HandleSendMailToPCYesNoInput(taskId: number): void {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0:
      if (TakeMailFromMon2(mon(gPartyMenu.slotId)) !== C.MAIL_NONE) {
        DisplayPartyMenuMessage(text("gText_MailSentToPC"), false);
        tasks.setFunc(taskId, Task_UpdateHeldItemSprite);
      } else {
        DisplayPartyMenuMessage(text("gText_PCMailboxFull"), false);
        tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText);
      }
      break;
    case MENU_B_PRESSED:
      sound.playSE(C.SE_SELECT);
    // fallthrough
    case 1:
      DisplayPartyMenuMessage(text("gText_MailMessageWillBeLost"), true);
      tasks.setFunc(taskId, Task_LoseMailMessageYesNo);
      break;
  }
}

function Task_LoseMailMessageYesNo(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) { PartyMenuDisplayYesNoMenu(); tasks.setFunc(taskId, Task_HandleLoseMailMessageYesNoInput); }
}

function Task_HandleLoseMailMessageYesNoInput(taskId: number): void {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0: {
      const m = mon(gPartyMenu.slotId);
      const item = GetMonData(m, C.MON_DATA_HELD_ITEM);
      if (addBagItem(item, 1)) {
        TakeMailFromMon(m);
        DisplayPartyMenuMessage(text("gText_MailTakenFromPkmn"), false);
        tasks.setFunc(taskId, Task_UpdateHeldItemSprite);
      } else {
        BufferBagFullCantTakeItemMessage(item);
        DisplayPartyMenuMessage(stringVars.var4, false);
        tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText);
      }
      break;
    }
    case MENU_B_PRESSED: sound.playSE(C.SE_SELECT); tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText); break;
    case 1: tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText); break;
  }
}

function CursorCB_Cancel2(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  PartyMenuRemoveWindow(0);
  PartyMenuRemoveWindow(1);
  SetPartyMonSelectionActions(gPartyMenu.slotId, GetPartyMenuActionsType(mon(gPartyMenu.slotId)));
  DisplaySelectionWindow(SELECTWINDOW_ACTIONS);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_DO_WHAT_WITH_MON);
  tasks.tasks[taskId].data[0] = MENU_B_PRESSED & 0xff;
  tasks.setFunc(taskId, Task_HandleSelectionMenuInput);
}

function CursorCB_SendMon(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  PartyMenuRemoveWindow(0);
  if (TrySwitchInPokemon()) {
    Task_ClosePartyMenu(taskId);
  } else {
    // stringVars.var4 holds TrySwitchInPokemon's message.
    PartyMenuRemoveWindow(1);
    DisplayPartyMenuMessage(stringVars.var4, true);
    tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText);
  }
}

function CursorCB_Enter(taskId: number): void {
  const union = gPartyMenu.chooseMonsBattleType === C.CHOOSE_MONS_FOR_UNION_ROOM_BATTLE;
  const maxBattlers = union ? 2 : 3;
  const str = text(union ? "gText_NoMoreThanTwoMayEnter" : "gText_NoMoreThanThreeMayEnter");
  PartyMenuRemoveWindow(0);
  PartyMenuRemoveWindow(1);
  for (let i = 0; i < maxBattlers; i++) {
    if (gSelectedOrderFromParty[i] === 0) {
      sound.playSE(C.SE_SELECT);
      gSelectedOrderFromParty[i] = gPartyMenu.slotId + 1;
      DisplayPartyPokemonDescriptionText(i + C.PARTYBOX_DESC_FIRST, sPartyMenuBoxes[gPartyMenu.slotId], 1);
      if (i === maxBattlers - 1) MoveCursorToConfirm();
      DisplayPartyMenuStdMessage(C.PARTY_MSG_CHOOSE_MON);
      tasks.setFunc(taskId, Task_HandleChooseMonInput);
      return;
    }
  }
  sound.playSE(C.SE_FAILURE);
  DisplayPartyMenuMessage(str, true);
  tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText);
}

function MoveCursorToConfirm(): void {
  AnimatePartySlot(gPartyMenu.slotId, 0);
  gPartyMenu.slotId = SLOT_CONFIRM;
  AnimatePartySlot(gPartyMenu.slotId, 1);
}

function CursorCB_NoEntry(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  PartyMenuRemoveWindow(0);
  PartyMenuRemoveWindow(1);
  for (let i = 0; i < 3; i++) {
    if (gSelectedOrderFromParty[i] === gPartyMenu.slotId + 1) {
      gSelectedOrderFromParty[i] = 0;
      if (i === 0) { gSelectedOrderFromParty[0] = gSelectedOrderFromParty[1]; gSelectedOrderFromParty[1] = gSelectedOrderFromParty[2]; gSelectedOrderFromParty[2] = 0; }
      else if (i === 1) { gSelectedOrderFromParty[1] = gSelectedOrderFromParty[2]; gSelectedOrderFromParty[2] = 0; }
      break;
    }
  }
  DisplayPartyPokemonDescriptionText(C.PARTYBOX_DESC_ABLE_3, sPartyMenuBoxes[gPartyMenu.slotId], DRAW_MENU_BOX_AND_TEXT);
  if (gSelectedOrderFromParty[0] !== 0) DisplayPartyPokemonDescriptionText(C.PARTYBOX_DESC_FIRST, sPartyMenuBoxes[gSelectedOrderFromParty[0] - 1], DRAW_MENU_BOX_AND_TEXT);
  if (gSelectedOrderFromParty[1] !== 0) DisplayPartyPokemonDescriptionText(C.PARTYBOX_DESC_SECOND, sPartyMenuBoxes[gSelectedOrderFromParty[1] - 1], DRAW_MENU_BOX_AND_TEXT);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_CHOOSE_MON);
  tasks.setFunc(taskId, Task_HandleChooseMonInput);
}

function CursorCB_Store(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  varSet(SV.x8004, gPartyMenu.slotId);
  Task_ClosePartyMenu(taskId);
}

function CursorCB_FieldMove(taskId: number): void {
  const fieldMove = pmi().actions[Menu_GetCursorPos()] - CURSOR_OPTION_FIELD_MOVES;
  sound.playSE(C.SE_SELECT);
  if (!sFieldHooks) return;
  PartyMenuRemoveWindow(0);
  PartyMenuRemoveWindow(1);
  // All field moves before WATERFALL are HMs.
  if (fieldMove <= C.FIELD_MOVE_WATERFALL && !flagGet(C.FLAG_BADGE01_GET + fieldMove)) {
    DisplayPartyMenuMessage(text("gText_CantUseUntilNewBadge"), true);
    tasks.setFunc(taskId, Task_ReturnToChooseMonAfterText);
    return;
  }
  const result = sFieldHooks.setUpFieldMove(fieldMove, gPartyMenu.slotId);
  switch (result.kind) {
    case "softboiled": ChooseMonForSoftboiled(taskId); break;
    case "confirm":
      stringVars.var4 = expandPlaceholders(bytesOf(result.message));
      sPostMenuFieldCallback = result.post;
      DisplayFieldMoveExitAreaMessage(taskId);
      break;
    case "fly":
      gPartyMenu.exitCallback = CB2_OpenFlyMap;
      Task_ClosePartyMenu(taskId);
      break;
    case "close": {
      sFieldHooks.recordUsedFieldMove(fieldMove, gPartyMenu.slotId);
      const post = result.post;
      gPartyMenu.exitCallback = () => sFieldHooks?.returnToField(post);
      Task_ClosePartyMenu(taskId);
      break;
    }
    case "fail":
      displayStdMessage(C.PARTY_MSG_CANT_USE_HERE, bytesOf(result.message));
      tasks.setFunc(taskId, Task_CancelAfterAorBPress);
      break;
  }
}

const bytesOf = (m: string | ArrayLike<number>): ArrayLike<number> => (typeof m === "string" ? encode(m) : m);

let sPostMenuFieldCallback: (() => void) | null = null;

function DisplayFieldMoveExitAreaMessage(taskId: number): void {
  DisplayPartyMenuMessage(stringVars.var4, true);
  tasks.setFunc(taskId, Task_FieldMoveExitAreaYesNo);
}

function Task_FieldMoveExitAreaYesNo(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) { PartyMenuDisplayYesNoMenu(); tasks.setFunc(taskId, Task_HandleFieldMoveExitAreaYesNoInput); }
}

function Task_HandleFieldMoveExitAreaYesNoInput(taskId: number): void {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0: {
      sFieldHooks?.recordUsedFieldMove(pmi().data[0], gPartyMenu.slotId);
      const post = sPostMenuFieldCallback;
      gPartyMenu.exitCallback = () => sFieldHooks?.returnToField(post);
      Task_ClosePartyMenu(taskId);
      break;
    }
    case MENU_B_PRESSED:
      sound.playSE(C.SE_SELECT);
    // fallthrough
    case 1:
      sPostMenuFieldCallback = null;
      Task_ReturnToChooseMonAfterText(taskId);
      break;
  }
}

function Task_CancelAfterAorBPress(taskId: number): void {
  if (joy.newKeys & (A_BUTTON | B_BUTTON)) CursorCB_Cancel1(taskId);
}

/** CB2_OpenFlyMap */
function CB2_OpenFlyMap(): void {
  const slot = gPartyMenu.slotId;
  sFieldHooks?.openFlyMap(slot, (flying) => { if (!flying) CB2_ReturnToPartyMenuFromFlyMap(); });
}

/** CB2_ReturnToPartyMenuFromFlyMap */
export function CB2_ReturnToPartyMenuFromFlyMap(): void {
  InitPartyMenu(C.PARTY_MENU_TYPE_FIELD, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_CHOOSE_MON, true, C.PARTY_MSG_CHOOSE_MON, Task_HandleChooseMonInput, sReturnToFieldWithOpenMenu);
}

// ---------------------------------------------------------------- fldeff_softboiled.c

function ChooseMonForSoftboiled(taskId: number): void {
  gPartyMenu.action = C.PARTY_ACTION_SOFTBOILED;
  gPartyMenu.slotId2 = gPartyMenu.slotId;
  AnimatePartySlot(GetCursorSelectionMonId(), 1);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_USE_ON_WHICH_MON);
  tasks.setFunc(taskId, Task_HandleChooseMonInput);
}

function Task_TryUseSoftboiledOnPartyMon(taskId: number): void {
  const userPartyId = gPartyMenu.slotId, recipientPartyId = gPartyMenu.slotId2;
  if (recipientPartyId > PARTY_SIZE) {
    gPartyMenu.action = C.PARTY_ACTION_CHOOSE_MON;
    DisplayPartyMenuStdMessage(C.PARTY_MSG_CHOOSE_MON);
    tasks.setFunc(taskId, Task_HandleChooseMonInput);
    return;
  }
  const curHp = GetMonData(mon(recipientPartyId), C.MON_DATA_HP);
  if (curHp === 0 || userPartyId === recipientPartyId || GetMonData(mon(recipientPartyId), C.MON_DATA_MAX_HP) === curHp) {
    CantUseSoftboiledOnMon(taskId);
  } else {
    sound.playSE(C.SE_USE_ITEM);
    PartyMenuModifyHP(taskId, userPartyId, -1, Math.floor(GetMonData(mon(userPartyId), C.MON_DATA_MAX_HP) / 5), Task_SoftboiledRestoreHealth);
  }
}

function CantUseSoftboiledOnMon(taskId: number): void {
  sound.playSE(C.SE_SELECT);
  DisplayPartyMenuMessage(text("gText_CantBeUsedOnPkmn"), false);
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_ChooseNewMonForSoftboiled);
}

function Task_SoftboiledRestoreHealth(taskId: number): void {
  sound.playSE(C.SE_USE_ITEM);
  PartyMenuModifyHP(taskId, gPartyMenu.slotId2, 1, Math.floor(GetMonData(mon(gPartyMenu.slotId), C.MON_DATA_MAX_HP) / 5), Task_SoftboiledDisplayHPRestored);
}

function Task_SoftboiledDisplayHPRestored(taskId: number): void {
  stringVars.var1 = GetMonNickname(mon(gPartyMenu.slotId2));
  stringVars.var4 = expandPlaceholders(text("gText_PkmnHPRestoredByVar2"));
  DisplayPartyMenuMessage(stringVars.var4, false);
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_FinishSoftboiled);
}

function Task_FinishSoftboiled(taskId: number): void {
  if (IsPartyMenuTextPrinterActive()) return;
  gPartyMenu.action = C.PARTY_ACTION_CHOOSE_MON;
  AnimatePartySlot(gPartyMenu.slotId, 0);
  gPartyMenu.slotId = gPartyMenu.slotId2;
  AnimatePartySlot(gPartyMenu.slotId2, 1);
  ClearStdWindowAndFrameToTransparent(6, false);
  ClearWindowTilemap(6);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_CHOOSE_MON);
  tasks.setFunc(taskId, Task_HandleChooseMonInput);
}

function Task_ChooseNewMonForSoftboiled(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) {
    DisplayPartyMenuStdMessage(C.PARTY_MSG_USE_ON_WHICH_MON);
    tasks.setFunc(taskId, Task_HandleChooseMonInput);
  }
}

// ---------------------------------------------------------------- item use

/** The bag / TM case / berry pouch to return to after an item-use party menu. */
export type ItemUseReturns = { bag: () => void; tmCase: () => void; berryPouch: () => void };
let sItemUseReturns: ItemUseReturns | null = null;
export function SetItemUseReturns(r: ItemUseReturns): void { sItemUseReturns = r; }

/** CB2_ShowPartyMenuForItemUse */
export function CB2_ShowPartyMenuForItemUse(): void {
  let callback: MainCB = () => sItemUseReturns?.bag();
  let partyLayout: number, menuType: number, msgId: number, task: TaskFunc;
  if (gMain.inBattle) { menuType = C.PARTY_MENU_TYPE_IN_BATTLE; partyLayout = GetPartyLayoutFromBattleType(); }
  else { menuType = C.PARTY_MENU_TYPE_FIELD; partyLayout = C.PARTY_LAYOUT_SINGLE; }
  const pocket = itemInfo(bagResult.itemId)?.pocket ?? 0;
  if (GetItemEffectType(bagResult.itemId) === C.ITEM_EFFECT_SACRED_ASH) {
    gPartyMenu.slotId = 0;
    for (let i = 0; i < PARTY_SIZE; i++) {
      if (GetMonData(mon(i), C.MON_DATA_SPECIES) !== C.SPECIES_NONE && GetMonData(mon(i), C.MON_DATA_HP) === 0) { gPartyMenu.slotId = i; break; }
    }
    if (pocket === C.POCKET_BERRY_POUCH) callback = () => sItemUseReturns?.berryPouch();
    task = Task_SetSacredAshCB;
    msgId = C.PARTY_MSG_NONE;
  } else {
    msgId = C.PARTY_MSG_USE_ON_WHICH_MON;
    if (pocket === C.POCKET_TM_CASE) { msgId = C.PARTY_MSG_TEACH_WHICH_MON; callback = () => sItemUseReturns?.tmCase(); }
    else if (pocket === C.POCKET_BERRY_POUCH) callback = () => sItemUseReturns?.berryPouch();
    task = Task_HandleChooseMonInput;
  }
  InitPartyMenu(menuType, partyLayout, C.PARTY_ACTION_USE_ITEM, true, msgId, task, callback);
}

function Task_DoUseItemAnim(taskId: number): void {
  pmi().exitCallback = CB2_DoUseItemAnim;
  Task_ClosePartyMenu(taskId);
}

/**
 * The C hands a MainCallback to SetMainCallback2 and it runs once because it
 * installs the next one; here the party-menu callbacks are plain functions
 * (see Task_ClosePartyMenuAndSetCB2), so the PSA's SetMainCallback2(saved)
 * runs it once with the main callback cleared.
 */
function CB2_ONCE(cb: MainCB): MainCB {
  return () => {
    SetMainCallback2(null);
    cb?.();
  };
}

function CB2_DoUseItemAnim(): void {
  if (CheckIfItemIsTMHMOrEvolutionStone(bagResult.itemId) === 2) {
    if (MonCanEvolve()) StartUseItemAnim_Normal(gPartyMenu.slotId, bagResult.itemId, CB2_ONCE(CB2_UseEvolutionStone));
    else StartUseItemAnim_CantEvolve(gPartyMenu.slotId, bagResult.itemId, CB2_ONCE(gPartyMenu.exitCallback));
  } else {
    StartUseItemAnim_Normal(gPartyMenu.slotId, bagResult.itemId, CB2_ONCE(CB2_UseItem));
  }
}

function CB2_UseItem(): void {
  if (itemInfo(bagResult.itemId)?.pocket === C.POCKET_TM_CASE && PSA_IsCancelDisabled()) {
    GiveMoveToMon(mon(gPartyMenu.slotId), ItemIdToBattleMoveId(bagResult.itemId));
    AdjustFriendship(mon(gPartyMenu.slotId), C.FRIENDSHIP_EVENT_LEARN_TMHM);
    if (bagResult.itemId < C.ITEM_HM01) removeBagItem(bagResult.itemId, 1);
    gPartyMenu.exitCallback?.();
  } else {
    InitPartyMenu(gPartyMenu.menuType, C.KEEP_PARTY_LAYOUT, C.PARTY_ACTION_CHOOSE_MON, gPartyMenu.slotId !== 0, C.PARTY_MSG_NONE, Task_SetSacredAshCB, gPartyMenu.exitCallback);
  }
}

function Task_SetSacredAshCB(taskId: number): void {
  if (gPaletteFade.active) return;
  if (gPartyMenu.menuType === C.PARTY_MENU_TYPE_IN_BATTLE) pmi().exitCallback = sBattleExit.success;
  gItemUseCB?.(taskId, Task_ClosePartyMenuAfterText);
}

function itemEffectOf(item: number): number[] {
  return rom.itemEffects[item - C.ITEM_POTION] ?? [0, 0, 0, 0, 0, 0];
}

function IsHPRecoveryItem(item: number): boolean {
  return !!(itemEffectOf(item)[4] & C.ITEM4_HEAL_HP);
}

function GetMedicineItemEffectMessage(item: number): void {
  const stat = (name: string): void => {
    stringVars.var2 = text(name);
    stringVars.var4 = expandPlaceholders(text("gText_PkmnBaseVar2StatIncreased"));
  };
  switch (GetItemEffectType(item)) {
    case C.ITEM_EFFECT_CURE_POISON: stringVars.var4 = expandPlaceholders(text("gText_PkmnCuredOfPoison")); break;
    case C.ITEM_EFFECT_CURE_SLEEP: stringVars.var4 = expandPlaceholders(text("gText_PkmnWokeUp2")); break;
    case C.ITEM_EFFECT_CURE_BURN: stringVars.var4 = expandPlaceholders(text("gText_PkmnBurnHealed")); break;
    case C.ITEM_EFFECT_CURE_FREEZE: stringVars.var4 = expandPlaceholders(text("gText_PkmnThawedOut")); break;
    case C.ITEM_EFFECT_CURE_PARALYSIS: stringVars.var4 = expandPlaceholders(text("gText_PkmnCuredOfParalysis")); break;
    case C.ITEM_EFFECT_CURE_CONFUSION: stringVars.var4 = expandPlaceholders(text("gText_PkmnSnappedOutOfConfusion")); break;
    case C.ITEM_EFFECT_CURE_INFATUATION: stringVars.var4 = expandPlaceholders(text("gText_PkmnGotOverInfatuation")); break;
    case C.ITEM_EFFECT_CURE_ALL_STATUS: stringVars.var4 = expandPlaceholders(text("gText_PkmnBecameHealthy")); break;
    case C.ITEM_EFFECT_HP_EV: stat("gText_ItemEffect_HP"); break;
    case C.ITEM_EFFECT_ATK_EV: stat("gText_ItemEffect_Attack"); break;
    case C.ITEM_EFFECT_DEF_EV: stat("gText_ItemEffect_Defense"); break;
    case C.ITEM_EFFECT_SPEED_EV: stat("gText_ItemEffect_Speed"); break;
    case C.ITEM_EFFECT_SPATK_EV: stat("gText_ItemEffect_SpAtk"); break;
    case C.ITEM_EFFECT_SPDEF_EV: stat("gText_ItemEffect_SpDef"); break;
    case C.ITEM_EFFECT_PP_UP: case C.ITEM_EFFECT_PP_MAX: stringVars.var4 = expandPlaceholders(text("gText_MovesPPIncreased")); break;
    case C.ITEM_EFFECT_HEAL_PP: stringVars.var4 = expandPlaceholders(text("gText_PPWasRestored")); break;
    default: stringVars.var4 = expandPlaceholders(text("gText_WontHaveEffect")); break;
  }
}

function NotUsingHPEVItemOnShedinja(m: Mon, item: number): boolean {
  return !(GetItemEffectType(item) === C.ITEM_EFFECT_HP_EV && GetMonData(m, C.MON_DATA_SPECIES) === C.SPECIES_SHEDINJA);
}

function IsItemFlute(item: number): boolean {
  return item === C.ITEM_BLUE_FLUTE || item === C.ITEM_RED_FLUTE || item === C.ITEM_YELLOW_FLUTE;
}

/** ExecuteTableBasedItemEffect_: TRUE when the item had no effect. */
function ExecuteTableBasedItemEffect_(partyMonIndex: number, item: number, monMoveIndex: number): boolean {
  const partyIndex = gMain.inBattle ? GetPartyIdFromBattleSlot(partyMonIndex) : partyMonIndex;
  return PokemonUseItemEffects(mon(partyMonIndex), item, partyIndex, monMoveIndex, false);
}

/**
 * pokemon.c PokemonItemUseNoEffect: the same checks without applying. The
 * port runs the effect on a copy of the mon outside battle context.
 */
function PokemonItemUseNoEffect(m: Mon, item: number, partyIndex: number, moveIndex: number): boolean {
  const copy = structuredClone(m) as Mon;
  const inBattle = gMain.inBattle;
  gMain.inBattle = false;
  try {
    return PokemonUseItemEffects(copy, item, partyIndex, moveIndex, false);
  } finally {
    gMain.inBattle = inBattle;
  }
}

/** ItemUseCB_Medicine */
export function ItemUseCB_Medicine(taskId: number, func: TaskFunc): void {
  const m = mon(gPartyMenu.slotId);
  const item = bagResult.itemId;
  const noEffect = !NotUsingHPEVItemOnShedinja(m, item) ? true : PokemonItemUseNoEffect(m, item, gPartyMenu.slotId, 0);
  sound.playSE(C.SE_SELECT);
  if (noEffect) {
    partyMenuResult.useExitCallback = false;
    DisplayPartyMenuMessage(text("gText_WontHaveEffect"), true);
    ScheduleBgCopyTilemapToVram(2);
    tasks.setFunc(taskId, func);
  } else {
    Task_DoUseItemAnim(taskId);
    gItemUseCB = ItemUseCB_MedicineStep;
  }
}

/** ItemUseCB_MedicineStep: applies the item with the HP count-up. */
export function ItemUseCB_MedicineStep(taskId: number, func: TaskFunc): void {
  const m = mon(gPartyMenu.slotId);
  const item = bagResult.itemId;
  let hp = 0;
  let canHeal = false;
  let cannotHeal: boolean;
  if (!NotUsingHPEVItemOnShedinja(m, item)) {
    cannotHeal = true;
  } else {
    canHeal = IsHPRecoveryItem(item);
    if (canHeal) {
      hp = GetMonData(m, C.MON_DATA_HP);
      if (hp === GetMonData(m, C.MON_DATA_MAX_HP)) canHeal = false;
    }
    cannotHeal = ExecuteTableBasedItemEffect_(gPartyMenu.slotId, item, 0);
  }
  if (cannotHeal) {
    partyMenuResult.useExitCallback = false;
    sound.playSE(C.SE_SELECT);
    DisplayPartyMenuMessage(text("gText_WontHaveEffect"), true);
    ScheduleBgCopyTilemapToVram(2);
    tasks.setFunc(taskId, func);
    return;
  }
  partyMenuResult.useExitCallback = true;
  if (!IsItemFlute(item)) {
    sound.playSE(C.SE_USE_ITEM);
    if (gPartyMenu.action !== C.PARTY_ACTION_REUSABLE_ITEM) removeBagItem(item, 1);
  } else {
    sound.playSE(C.SE_GLASS_FLUTE);
  }
  const box = sPartyMenuBoxes[gPartyMenu.slotId];
  SetPartyMonAilmentGfx(m, box);
  if (gSprites[box.statusSpriteId].invisible) DisplayPartyPokemonLevelCheck(m, box, 1);
  if (canHeal) {
    if (hp === 0) AnimatePartySlot(gPartyMenu.slotId, 1);
    PartyMenuModifyHP(taskId, gPartyMenu.slotId, 1, GetMonData(m, C.MON_DATA_HP) - hp, Task_DisplayHPRestoredMessage);
    ResetHPTaskData(taskId, hp);
  } else {
    stringVars.var1 = GetMonNickname(m);
    GetMedicineItemEffectMessage(item);
    DisplayPartyMenuMessage(stringVars.var4, true);
    ScheduleBgCopyTilemapToVram(2);
    tasks.setFunc(taskId, func);
  }
}

function Task_DisplayHPRestoredMessage(taskId: number): void {
  stringVars.var1 = GetMonNickname(mon(gPartyMenu.slotId));
  stringVars.var4 = expandPlaceholders(text("gText_PkmnHPRestoredByVar2"));
  DisplayPartyMenuMessage(stringVars.var4, false);
  ScheduleBgCopyTilemapToVram(2);
  if (gMain.inBattle) HandleBattleLowHpMusicChange();
  tasks.setFunc(taskId, Task_ClosePartyMenuAfterText);
}

function Task_ClosePartyMenuAfterText(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) {
    if (!partyMenuResult.useExitCallback) pmi().exitCallback = null;
    Task_ClosePartyMenu(taskId);
  }
}

function ShowMoveSelectWindow(slot: number): void {
  let moveCount = 0;
  const windowId = DisplaySelectionWindow(SELECTWINDOW_MOVES);
  for (let i = 0; i < C.MAX_MON_MOVES; i++) {
    const move = GetMonData(mon(slot), C.MON_DATA_MOVE1 + i);
    AddTextPrinterParameterized(windowId, FONT_NORMAL, moveName(move), GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_WIDTH) + GetFontAttribute(FONT_NORMAL, FONTATTR_LETTER_SPACING),
      i * 16 + 2, 0xff, null);
    if (move !== C.MOVE_NONE) moveCount++;
  }
  Menu_InitCursor(windowId, FONT_NORMAL, 0, 2, 16, moveCount, 0);
  ScheduleBgCopyTilemapToVram(2);
}

function Task_HandleRestoreWhichMoveInput(taskId: number): void {
  const input = Menu_ProcessInput();
  if (input === MENU_NOTHING_CHOSEN) return;
  if (input === MENU_B_PRESSED) { sound.playSE(C.SE_SELECT); ReturnToUseOnWhichMon(taskId); }
  else SetSelectedMoveForPPItem(taskId);
}

/** ItemUseCB_TryRestorePP */
export function ItemUseCB_TryRestorePP(taskId: number, _func: TaskFunc): void {
  if (!(itemEffectOf(bagResult.itemId)[4] & C.ITEM4_HEAL_PP_ONE)) {
    gPartyMenu.ppMoveSlot = 0;
    if (gPartyMenu.menuType === C.PARTY_MENU_TYPE_IN_BATTLE) TryUsePPItemInBattle(taskId);
    else TryUsePPItemOutsideBattle(taskId);
  } else {
    sound.playSE(C.SE_SELECT);
    DisplayPartyMenuStdMessage(C.PARTY_MSG_RESTORE_WHICH_MOVE);
    ShowMoveSelectWindow(gPartyMenu.slotId);
    tasks.setFunc(taskId, Task_HandleRestoreWhichMoveInput);
  }
}

function SetSelectedMoveForPPItem(taskId: number): void {
  PartyMenuRemoveWindow(0);
  gPartyMenu.ppMoveSlot = Menu_GetCursorPos();
  if (gPartyMenu.menuType === C.PARTY_MENU_TYPE_IN_BATTLE) TryUsePPItemInBattle(taskId);
  else TryUsePPItemOutsideBattle(taskId);
}

function ReturnToUseOnWhichMon(taskId: number): void {
  tasks.setFunc(taskId, Task_HandleChooseMonInput);
  pmi().exitCallback = null;
  PartyMenuRemoveWindow(0);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_USE_ON_WHICH_MON);
}

function TryUsePPItemOutsideBattle(taskId: number): void {
  const noEffect = PokemonItemUseNoEffect(mon(gPartyMenu.slotId), bagResult.itemId, gPartyMenu.slotId, gPartyMenu.ppMoveSlot);
  sound.playSE(C.SE_SELECT);
  if (noEffect) {
    partyMenuResult.useExitCallback = false;
    DisplayPartyMenuMessage(text("gText_WontHaveEffect"), true);
    ScheduleBgCopyTilemapToVram(2);
    tasks.setFunc(taskId, Task_ClosePartyMenuAfterText);
  } else {
    Task_DoUseItemAnim(taskId);
    gItemUseCB = ItemUseCB_RestorePP;
  }
}

function ItemUseCB_RestorePP(taskId: number, _func: TaskFunc): void {
  const m = mon(gPartyMenu.slotId);
  ExecuteTableBasedItemEffect_(gPartyMenu.slotId, bagResult.itemId, gPartyMenu.ppMoveSlot);
  partyMenuResult.useExitCallback = true;
  sound.playSE(C.SE_USE_ITEM);
  removeBagItem(bagResult.itemId, 1);
  stringVars.var1 = moveName(GetMonData(m, gPartyMenu.ppMoveSlot + C.MON_DATA_MOVE1));
  GetMedicineItemEffectMessage(bagResult.itemId);
  DisplayPartyMenuMessage(stringVars.var4, true);
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_ClosePartyMenuAfterText);
}

function TryUsePPItemInBattle(taskId: number): void {
  const item = bagResult.itemId;
  if (ExecuteTableBasedItemEffect_(gPartyMenu.slotId, item, gPartyMenu.ppMoveSlot)) {
    partyMenuResult.useExitCallback = false;
    sound.playSE(C.SE_SELECT);
    DisplayPartyMenuMessage(text("gText_WontHaveEffect"), true);
  } else {
    partyMenuResult.useExitCallback = true;
    sound.playSE(C.SE_USE_ITEM);
    removeBagItem(item, 1);
    stringVars.var1 = moveName(GetMonData(mon(gPartyMenu.slotId), C.MON_DATA_MOVE1 + gPartyMenu.ppMoveSlot));
    GetMedicineItemEffectMessage(item);
    DisplayPartyMenuMessage(stringVars.var4, true);
  }
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_ClosePartyMenuAfterText);
}

/** ItemUseCB_PPUp */
export function ItemUseCB_PPUp(taskId: number, _func: TaskFunc): void {
  sound.playSE(C.SE_SELECT);
  DisplayPartyMenuStdMessage(C.PARTY_MSG_BOOST_PP_WHICH_MOVE);
  ShowMoveSelectWindow(gPartyMenu.slotId);
  tasks.setFunc(taskId, Task_HandleRestoreWhichMoveInput);
}

export function ItemIdToBattleMoveId(item: number): number {
  return tmhmMove(item);
}

export function MonKnowsMove(m: Mon, move: number): boolean {
  for (let i = 0; i < C.MAX_MON_MOVES; i++) if (GetMonData(m, C.MON_DATA_MOVE1 + i) === move) return true;
  return false;
}

function DisplayLearnMoveMessage(str: ArrayLike<number>): void {
  stringVars.var4 = expandPlaceholders(str);
  DisplayPartyMenuMessage(stringVars.var4, true);
  ScheduleBgCopyTilemapToVram(2);
}

function DisplayLearnMoveMessageAndClose(taskId: number, str: ArrayLike<number>): void {
  DisplayLearnMoveMessage(str);
  tasks.setFunc(taskId, Task_ClosePartyMenuAfterText);
}

/** ItemUseCB_TMHM */
export function ItemUseCB_TMHM(taskId: number, _func: TaskFunc): void {
  sound.playSE(C.SE_SELECT);
  const m = mon(gPartyMenu.slotId);
  const item = bagResult.itemId;
  stringVars.var1 = GetMonNickname(m);
  gPartyMenu.learnMoveId = ItemIdToBattleMoveId(item);
  stringVars.var2 = moveName(gPartyMenu.learnMoveId);
  gPartyMenu.learnMoveMethod = LEARN_VIA_TMHM;
  switch (CanMonLearnTMTutor(m, item, 0)) {
    case CANNOT_LEARN_MOVE: DisplayLearnMoveMessageAndClose(taskId, text("gText_PkmnCantLearnMove")); return;
    case ALREADY_KNOWS_MOVE: DisplayLearnMoveMessageAndClose(taskId, text("gText_PkmnAlreadyKnows")); return;
  }
  if (GiveMoveToMon(m, gPartyMenu.learnMoveId) !== C.MON_HAS_MAX_MOVES) {
    Task_DoUseItemAnim(taskId);
    gItemUseCB = ItemUseCB_LearnedMove;
  } else {
    DisplayLearnMoveMessage(text("gText_PkmnNeedsToReplaceMove"));
    tasks.setFunc(taskId, Task_ReplaceMoveYesNo);
  }
}

function ItemUseCB_LearnedMove(taskId: number, _func: TaskFunc): void {
  Task_LearnedMove(taskId);
}

function Task_LearnedMove(taskId: number): void {
  const m = mon(gPartyMenu.slotId);
  const item = bagResult.itemId;
  if (gPartyMenu.learnMoveMethod === LEARN_VIA_TMHM) {
    AdjustFriendship(m, C.FRIENDSHIP_EVENT_LEARN_TMHM);
    if (item < C.ITEM_HM01) removeBagItem(item, 1);
  }
  stringVars.var1 = GetMonNickname(m);
  stringVars.var2 = moveName(gPartyMenu.learnMoveId);
  stringVars.var4 = expandPlaceholders(text("gText_PkmnLearnedMove3"));
  DisplayPartyMenuMessage(stringVars.var4, true);
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_DoLearnedMoveFanfareAfterText);
}

function Task_DoLearnedMoveFanfareAfterText(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) {
    sound.playFanfare(C.MUS_LEVEL_UP);
    tasks.setFunc(taskId, Task_LearnNextMoveOrClosePartyMenu);
  }
}

function Task_LearnNextMoveOrClosePartyMenu(taskId: number): void {
  if (sound.isFanfareTaskInactive() && joy.newKeys & (A_BUTTON | B_BUTTON)) {
    if (gPartyMenu.learnMoveMethod === LEARN_VIA_LEVEL_UP) {
      Task_TryLearningNextMove(taskId);
    } else {
      if (gPartyMenu.learnMoveMethod === LEARN_VIA_TUTOR) varSet(SV.RESULT, 1);
      Task_ClosePartyMenu(taskId);
    }
  }
}

function Task_ReplaceMoveYesNo(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) { PartyMenuDisplayYesNoMenu(); tasks.setFunc(taskId, Task_HandleReplaceMoveYesNoInput); }
}

function Task_HandleReplaceMoveYesNoInput(taskId: number): void {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0:
      DisplayPartyMenuMessage(text("gText_WhichMoveToForget"), true);
      tasks.setFunc(taskId, Task_ShowSummaryScreenToForgetMove);
      break;
    case MENU_B_PRESSED: sound.playSE(C.SE_SELECT); StopLearningMovePrompt(taskId); break;
    case 1: StopLearningMovePrompt(taskId); break;
  }
}

function Task_ShowSummaryScreenToForgetMove(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) {
    pmi().exitCallback = CB2_ShowSummaryScreenToForgetMove;
    Task_ClosePartyMenu(taskId);
  }
}

function CB2_ShowSummaryScreenToForgetMove(): void {
  ShowSelectMovePokemonSummaryScreen(gPartyMenu.slotId, CalculatePlayerPartyCount() - 1, CB2_ReturnToPartyMenuWhileLearningMove, gPartyMenu.learnMoveId);
}

function CB2_ReturnToPartyMenuWhileLearningMove(): void {
  const moveIdx = GetMoveSlotToReplace();
  if (gPartyMenu.learnMoveMethod === LEARN_VIA_TMHM && moveIdx !== C.MAX_MON_MOVES) {
    const move = GetMonData(mon(gPartyMenu.slotId), moveIdx + C.MON_DATA_MOVE1);
    StartUseItemAnim_ForgetMoveAndLearnTMorHM(gPartyMenu.slotId, bagResult.itemId, move, CB2_ONCE(CB2_UseTMHMAfterForgettingMove));
    gItemUseCB = ItemUseCB_ReplaceMoveWithTMHM;
    gPartyMenu.action = C.PARTY_ACTION_CHOOSE_MON;
  } else {
    InitPartyMenu(C.PARTY_MENU_TYPE_FIELD, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_CHOOSE_MON, true, C.PARTY_MSG_NONE, Task_ReturnToPartyMenuWhileLearningMove, gPartyMenu.exitCallback);
  }
}

function CB2_UseTMHMAfterForgettingMove(): void {
  if (PSA_IsCancelDisabled()) {
    const m = mon(gPartyMenu.slotId);
    const moveIdx = GetMoveSlotToReplace();
    RemoveMonPPBonus(m, moveIdx);
    SetMonMoveSlot(m, ItemIdToBattleMoveId(bagResult.itemId), moveIdx);
    AdjustFriendship(m, C.FRIENDSHIP_EVENT_LEARN_TMHM);
    if (bagResult.itemId < C.ITEM_HM01) removeBagItem(bagResult.itemId, 1);
    gPartyMenu.exitCallback?.();
  } else {
    InitPartyMenu(gPartyMenu.menuType, C.KEEP_PARTY_LAYOUT, gPartyMenu.action, gPartyMenu.slotId !== 0, C.PARTY_MSG_NONE, Task_SetSacredAshCB, gPartyMenu.exitCallback);
  }
}

function Task_ReturnToPartyMenuWhileLearningMove(taskId: number): void {
  if (gPaletteFade.active) return;
  if (GetMoveSlotToReplace() !== C.MAX_MON_MOVES) DisplayPartyMenuForgotMoveMessage(taskId);
  else StopLearningMovePrompt(taskId);
}

function ItemUseCB_ReplaceMoveWithTMHM(taskId: number, _func: TaskFunc): void {
  Task_ReplaceMoveWithTMHM(taskId);
}

function Task_ReplaceMoveWithTMHM(taskId: number): void {
  const m = mon(gPartyMenu.slotId);
  const moveIdx = GetMoveSlotToReplace();
  const move = GetMonData(m, moveIdx + C.MON_DATA_MOVE1);
  stringVars.var1 = GetMonNickname(m);
  stringVars.var2 = moveName(move);
  RemoveMonPPBonus(m, moveIdx);
  SetMonMoveSlot(m, gPartyMenu.learnMoveId, moveIdx);
  Task_LearnedMove(taskId);
}

function DisplayPartyMenuForgotMoveMessage(taskId: number): void {
  const m = mon(gPartyMenu.slotId);
  stringVars.var1 = GetMonNickname(m);
  stringVars.var2 = moveName(GetMonData(m, C.MON_DATA_MOVE1 + GetMoveSlotToReplace()));
  DisplayLearnMoveMessage(text("gText_12PoofForgotMove"));
  tasks.setFunc(taskId, Task_PartyMenuReplaceMove);
}

function Task_PartyMenuReplaceMove(taskId: number): void {
  if (IsPartyMenuTextPrinterActive()) return;
  const m = mon(gPartyMenu.slotId);
  RemoveMonPPBonus(m, GetMoveSlotToReplace());
  SetMonMoveSlot(m, gPartyMenu.learnMoveId, GetMoveSlotToReplace());
  Task_LearnedMove(taskId);
}

function StopLearningMovePrompt(taskId: number): void {
  stringVars.var2 = moveName(gPartyMenu.learnMoveId);
  stringVars.var4 = expandPlaceholders(text("gText_StopLearningMove2"));
  DisplayPartyMenuMessage(stringVars.var4, true);
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_StopLearningMoveYesNo);
}

function Task_StopLearningMoveYesNo(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) { PartyMenuDisplayYesNoMenu(); tasks.setFunc(taskId, Task_HandleStopLearningMoveYesNoInput); }
}

function Task_HandleStopLearningMoveYesNoInput(taskId: number): void {
  const m = mon(gPartyMenu.slotId);
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0:
      stringVars.var1 = GetMonNickname(m);
      stringVars.var2 = moveName(gPartyMenu.learnMoveId);
      stringVars.var4 = expandPlaceholders(text("gText_MoveNotLearned"));
      DisplayPartyMenuMessage(stringVars.var4, true);
      if (gPartyMenu.learnMoveMethod === LEARN_VIA_LEVEL_UP) {
        tasks.setFunc(taskId, Task_TryLearningNextMoveAfterText);
      } else {
        if (gPartyMenu.learnMoveMethod === LEARN_VIA_TUTOR) varSet(SV.RESULT, 0);
        tasks.setFunc(taskId, Task_ClosePartyMenuAfterText);
      }
      break;
    case MENU_B_PRESSED:
      sound.playSE(C.SE_SELECT);
    // fallthrough
    case 1:
      stringVars.var1 = GetMonNickname(m);
      stringVars.var2 = moveName(gPartyMenu.learnMoveId);
      DisplayLearnMoveMessage(text("gText_PkmnNeedsToReplaceMove"));
      tasks.setFunc(taskId, Task_ReplaceMoveYesNo);
      break;
  }
}

function Task_TryLearningNextMoveAfterText(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) Task_TryLearningNextMove(taskId);
}

/** ItemUseCB_RareCandy */
export function ItemUseCB_RareCandy(taskId: number, func: TaskFunc): void {
  const m = mon(gPartyMenu.slotId);
  const noEffect = GetMonData(m, C.MON_DATA_LEVEL) !== C.MAX_LEVEL ? PokemonItemUseNoEffect(m, bagResult.itemId, gPartyMenu.slotId, 0) : true;
  sound.playSE(C.SE_SELECT);
  if (noEffect) {
    partyMenuResult.useExitCallback = false;
    DisplayPartyMenuMessage(text("gText_WontHaveEffect"), true);
    ScheduleBgCopyTilemapToVram(2);
    tasks.setFunc(taskId, func);
  } else {
    Task_DoUseItemAnim(taskId);
    gItemUseCB = ItemUseCB_RareCandyStep;
  }
}

function ItemUseCB_RareCandyStep(taskId: number, _func: TaskFunc): void {
  const m = mon(gPartyMenu.slotId);
  const data = pmi().data;
  GetMonLevelUpWindowStats(m).forEach((v, i) => { data[i] = v; });
  ExecuteTableBasedItemEffect_(gPartyMenu.slotId, bagResult.itemId, 0);
  GetMonLevelUpWindowStats(m).forEach((v, i) => { data[6 + i] = v; });
  partyMenuResult.useExitCallback = true;
  sound.playFanfare(C.MUS_LEVEL_UP);
  UpdateMonDisplayInfoAfterRareCandy(gPartyMenu.slotId, m);
  removeBagItem(bagResult.itemId, 1);
  stringVars.var1 = GetMonNickname(m);
  stringVars.var2 = intToDecimal(GetMonData(m, C.MON_DATA_LEVEL), STR_CONV_MODE_LEFT_ALIGN, 3);
  stringVars.var4 = expandPlaceholders(text("gText_PkmnElevatedToLvVar2"));
  DisplayPartyMenuMessage(stringVars.var4, true);
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_DisplayLevelUpStatsPg1);
}

function UpdateMonDisplayInfoAfterRareCandy(slot: number, m: Mon): void {
  const box = sPartyMenuBoxes[slot];
  SetPartyMonAilmentGfx(m, box);
  if (gSprites[box.statusSpriteId].invisible) DisplayPartyPokemonLevelCheck(m, box, DRAW_MENU_BOX_AND_TEXT);
  DisplayPartyPokemonHPCheck(m, box, DRAW_MENU_BOX_AND_TEXT);
  DisplayPartyPokemonMaxHPCheck(m, box, DRAW_MENU_BOX_AND_TEXT);
  DisplayPartyPokemonHPBarCheck(m, box);
  UpdatePartyMonHPBar(box.monSpriteId, m);
  AnimatePartySlot(slot, 1);
  ScheduleBgCopyTilemapToVram(0);
}

function Task_DisplayLevelUpStatsPg1(taskId: number): void {
  if (sound.isFanfareTaskInactive() && !IsPartyMenuTextPrinterActive() && joy.newKeys & (A_BUTTON | B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    DisplayLevelUpStatsPg1(taskId);
    tasks.setFunc(taskId, Task_DisplayLevelUpStatsPg2);
  }
}

function Task_DisplayLevelUpStatsPg2(taskId: number): void {
  if (joy.newKeys & (A_BUTTON | B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    DisplayLevelUpStatsPg2(taskId);
    tasks.setFunc(taskId, Task_TryLearnNewMoves);
  }
}

/** DisplayLevelUpStatsPg1 / DisplayLevelUpStatsPg2 (party_menu.c). */
function DisplayLevelUpStatsPg1(_taskId: number): void {
  const data = pmi().data;
  data[12] = CreateLevelUpStatsWindow();
  DrawLevelUpWindowPg1(data[12], data.slice(0, 6), data.slice(6, 12), 1, 2, 3);
  CopyWindowToVram(data[12], COPYWIN_GFX);
  ScheduleBgCopyTilemapToVram(2);
}

function DisplayLevelUpStatsPg2(_taskId: number): void {
  const data = pmi().data;
  DrawLevelUpWindowPg2(data[12], data.slice(6, 12), 1, 2, 3);
  CopyWindowToVram(data[12], COPYWIN_GFX);
  ScheduleBgCopyTilemapToVram(2);
}

let sMoveToLearn = 0;

function Task_TryLearnNewMoves(taskId: number): void {
  if (!(sound.isFanfareTaskInactive() && joy.newKeys & (A_BUTTON | B_BUTTON))) return;
  RemoveLevelUpStatsWindow();
  const learnMove = MonTryLearningNewMove(mon(gPartyMenu.slotId), true, (m) => { sMoveToLearn = m; });
  gPartyMenu.learnMoveMethod = LEARN_VIA_LEVEL_UP;
  switch (learnMove) {
    case C.MOVE_NONE: PartyMenuTryEvolution(taskId); break;
    case C.MON_HAS_MAX_MOVES: DisplayMonNeedsToReplaceMove(taskId); break;
    case C.MON_ALREADY_KNOWS_MOVE: tasks.setFunc(taskId, Task_TryLearningNextMove); break;
    default: DisplayMonLearnedMove(taskId, learnMove); break;
  }
}

function Task_TryLearningNextMove(taskId: number): void {
  const result = MonTryLearningNewMove(mon(gPartyMenu.slotId), false, (m) => { sMoveToLearn = m; });
  switch (result) {
    case C.MOVE_NONE: PartyMenuTryEvolution(taskId); break;
    case C.MON_HAS_MAX_MOVES: DisplayMonNeedsToReplaceMove(taskId); break;
    case C.MON_ALREADY_KNOWS_MOVE: return;
    default: DisplayMonLearnedMove(taskId, result); break;
  }
}

function PartyMenuTryEvolution(taskId: number): void {
  const m = mon(gPartyMenu.slotId);
  const targetSpecies = GetEvolutionTargetSpecies(m, C.EVO_MODE_NORMAL, C.ITEM_NONE);
  if (targetSpecies !== C.SPECIES_NONE && sFieldHooks) {
    const after = gPartyMenu.exitCallback;
    const slot = gPartyMenu.slotId;
    FreePartyPointers();
    tasks.destroy(taskId);
    SetVBlankCallback(null);
    SetMainCallback2(null);
    sFieldHooks.evolve(m, targetSpecies, true, slot, () => after?.());
  } else {
    tasks.setFunc(taskId, Task_ClosePartyMenuAfterText);
  }
}

function DisplayMonNeedsToReplaceMove(taskId: number): void {
  stringVars.var1 = GetMonNickname(mon(gPartyMenu.slotId));
  stringVars.var2 = moveName(sMoveToLearn);
  stringVars.var4 = expandPlaceholders(text("gText_PkmnNeedsToReplaceMove"));
  DisplayPartyMenuMessage(stringVars.var4, true);
  ScheduleBgCopyTilemapToVram(2);
  gPartyMenu.learnMoveId = sMoveToLearn;
  tasks.setFunc(taskId, Task_ReplaceMoveYesNo);
}

function DisplayMonLearnedMove(taskId: number, move: number): void {
  stringVars.var1 = GetMonNickname(mon(gPartyMenu.slotId));
  stringVars.var2 = moveName(move);
  stringVars.var4 = expandPlaceholders(text("gText_PkmnLearnedMove3"));
  DisplayPartyMenuMessage(stringVars.var4, true);
  ScheduleBgCopyTilemapToVram(2);
  gPartyMenu.learnMoveId = move;
  tasks.setFunc(taskId, Task_DoLearnedMoveFanfareAfterText);
}

/** ItemUseCB_SacredAsh (task data 0-2 of sPartyMenuInternal: used on slot, had effect, last slot). */
export function ItemUseCB_SacredAsh(taskId: number, _func: TaskFunc): void {
  const d = pmi().data;
  d[0] = 0;
  d[1] = 0;
  d[2] = gPartyMenu.slotId;
  UseSacredAsh(taskId);
}

function UseSacredAsh(taskId: number): void {
  const m = mon(gPartyMenu.slotId);
  if (GetMonData(m, C.MON_DATA_SPECIES) === C.SPECIES_NONE) { tasks.setFunc(taskId, Task_SacredAshLoop); return; }
  const hp = GetMonData(m, C.MON_DATA_HP);
  if (ExecuteTableBasedItemEffect_(gPartyMenu.slotId, bagResult.itemId, 0)) { tasks.setFunc(taskId, Task_SacredAshLoop); return; }
  sound.playSE(C.SE_USE_ITEM);
  const box = sPartyMenuBoxes[gPartyMenu.slotId];
  SetPartyMonAilmentGfx(m, box);
  if (gSprites[box.statusSpriteId].invisible) DisplayPartyPokemonLevelCheck(m, box, DRAW_MENU_BOX_AND_TEXT);
  AnimatePartySlot(pmi().data[2], 0);
  AnimatePartySlot(gPartyMenu.slotId, 1);
  PartyMenuModifyHP(taskId, gPartyMenu.slotId, 1, GetMonData(m, C.MON_DATA_HP) - hp, Task_SacredAshDisplayHPRestored);
  ResetHPTaskData(taskId, hp);
  pmi().data[0] = 1;
  pmi().data[1] = 1;
}

function Task_SacredAshLoop(taskId: number): void {
  if (IsPartyMenuTextPrinterActive()) return;
  const d = pmi().data;
  if (d[0] === 1) { d[0] = 0; d[2] = gPartyMenu.slotId; }
  if (++gPartyMenu.slotId === PARTY_SIZE) {
    if (d[1] === 0) {
      partyMenuResult.useExitCallback = false;
      DisplayPartyMenuMessage(text("gText_WontHaveEffect"), true);
      ScheduleBgCopyTilemapToVram(2);
    } else {
      partyMenuResult.useExitCallback = true;
      removeBagItem(bagResult.itemId, 1);
    }
    tasks.setFunc(taskId, Task_ClosePartyMenuAfterText);
    gPartyMenu.slotId = 0;
  } else {
    UseSacredAsh(taskId);
  }
}

function Task_SacredAshDisplayHPRestored(taskId: number): void {
  stringVars.var1 = GetMonNickname(mon(gPartyMenu.slotId));
  stringVars.var4 = expandPlaceholders(text("gText_PkmnHPRestoredByVar2"));
  DisplayPartyMenuMessage(stringVars.var4, false);
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_SacredAshLoop);
}

/** ItemUseCB_EvolutionStone */
export function ItemUseCB_EvolutionStone(taskId: number, func: TaskFunc): void {
  sound.playSE(C.SE_SELECT);
  if (PokemonItemUseNoEffect(mon(gPartyMenu.slotId), bagResult.itemId, gPartyMenu.slotId, 0)) {
    partyMenuResult.useExitCallback = false;
    DisplayPartyMenuMessage(text("gText_WontHaveEffect"), true);
    ScheduleBgCopyTilemapToVram(2);
    tasks.setFunc(taskId, func);
  } else {
    Task_DoUseItemAnim(taskId);
  }
}

/** CB2_UseEvolutionStone: the item effect starts the evolution scene. */
function CB2_UseEvolutionStone(): void {
  const after = gPartyMenu.exitCallback;
  const m = mon(gPartyMenu.slotId);
  const target = GetEvolutionTargetSpecies(m, C.EVO_MODE_ITEM_USE, bagResult.itemId);
  removeBagItem(bagResult.itemId, 1);
  if (target !== C.SPECIES_NONE && sFieldHooks) sFieldHooks.evolve(m, target, false, gPartyMenu.slotId, () => after?.());
  else after?.();
}

function MonCanEvolve(): boolean {
  return !(!flagGet(C.FLAG_SYS_NATIONAL_DEX) && GetEvolutionTargetSpecies(mon(gPartyMenu.slotId), C.EVO_MODE_ITEM_USE, bagResult.itemId) > C.KANTO_DEX_COUNT);
}

/** GetItemEffectType */
export function GetItemEffectType(item: number): number {
  if (item < C.ITEM_POTION || item > C.MAX_BERRY_INDEX) return C.ITEM_EFFECT_NONE;
  const e = itemEffectOf(item);
  if (e[0] & (C.ITEM0_DIRE_HIT | C.ITEM0_X_ATTACK) || e[1] || e[2] || e[3] & C.ITEM3_GUARD_SPEC) return C.ITEM_EFFECT_X_ITEM;
  if (e[0] & C.ITEM0_SACRED_ASH) return C.ITEM_EFFECT_SACRED_ASH;
  if (e[3] & C.ITEM3_LEVEL_UP) return C.ITEM_EFFECT_RAISE_LEVEL;
  const statusCure = e[3] & C.ITEM3_STATUS_ALL;
  if (statusCure || e[0] >> 7) {
    if (statusCure === C.ITEM3_SLEEP) return C.ITEM_EFFECT_CURE_SLEEP;
    if (statusCure === C.ITEM3_POISON) return C.ITEM_EFFECT_CURE_POISON;
    if (statusCure === C.ITEM3_BURN) return C.ITEM_EFFECT_CURE_BURN;
    if (statusCure === C.ITEM3_FREEZE) return C.ITEM_EFFECT_CURE_FREEZE;
    if (statusCure === C.ITEM3_PARALYSIS) return C.ITEM_EFFECT_CURE_PARALYSIS;
    if (statusCure === C.ITEM3_CONFUSION) return C.ITEM_EFFECT_CURE_CONFUSION;
    if (e[0] >> 7 && !statusCure) return C.ITEM_EFFECT_CURE_INFATUATION;
    return C.ITEM_EFFECT_CURE_ALL_STATUS;
  }
  if (e[4] & (C.ITEM4_REVIVE | C.ITEM4_HEAL_HP)) return C.ITEM_EFFECT_HEAL_HP;
  if (e[4] & C.ITEM4_EV_ATK) return C.ITEM_EFFECT_ATK_EV;
  if (e[4] & C.ITEM4_EV_HP) return C.ITEM_EFFECT_HP_EV;
  if (e[5] & C.ITEM5_EV_SPATK) return C.ITEM_EFFECT_SPATK_EV;
  if (e[5] & C.ITEM5_EV_SPDEF) return C.ITEM_EFFECT_SPDEF_EV;
  if (e[5] & C.ITEM5_EV_SPEED) return C.ITEM_EFFECT_SPEED_EV;
  if (e[5] & C.ITEM5_EV_DEF) return C.ITEM_EFFECT_DEF_EV;
  if (e[4] & C.ITEM4_EVO_STONE) return C.ITEM_EFFECT_EVO_STONE;
  if (e[4] & C.ITEM4_PP_UP) return C.ITEM_EFFECT_PP_UP;
  if (e[5] & C.ITEM5_PP_MAX) return C.ITEM_EFFECT_PP_MAX;
  if (e[4] & (C.ITEM4_HEAL_PP_ALL | C.ITEM4_HEAL_PP_ONE)) return C.ITEM_EFFECT_HEAL_PP;
  return C.ITEM_EFFECT_NONE;
}

function TryTutorSelectedMon(taskId: number): void {
  if (gPaletteFade.active) return;
  const m = mon(gPartyMenu.slotId);
  const tutor = varGet(SV.x8005);
  stringVars.var1 = GetMonNickname(m);
  gPartyMenu.learnMoveId = GetTutorMove(tutor);
  stringVars.var2 = moveName(gPartyMenu.learnMoveId);
  gPartyMenu.learnMoveMethod = LEARN_VIA_TUTOR;
  switch (CanMonLearnTMTutor(m, 0, tutor)) {
    case CANNOT_LEARN_MOVE: DisplayLearnMoveMessageAndClose(taskId, text("gText_PkmnCantLearnMove")); return;
    case ALREADY_KNOWS_MOVE: DisplayLearnMoveMessageAndClose(taskId, text("gText_PkmnAlreadyKnows")); return;
    default:
      if (GiveMoveToMon(m, gPartyMenu.learnMoveId) !== C.MON_HAS_MAX_MOVES) { Task_LearnedMove(taskId); return; }
      break;
  }
  DisplayLearnMoveMessage(text("gText_PkmnNeedsToReplaceMove"));
  tasks.setFunc(taskId, Task_ReplaceMoveYesNo);
}

// ---------------------------------------------------------------- entry points

let sReturnToFieldWithOpenMenu: MainCB = null;

/** CB2_PartyMenuFromStartMenu; `exit` is CB2_ReturnToFieldWithOpenMenu. */
export function CB2_PartyMenuFromStartMenu(exit: () => void): void {
  sReturnToFieldWithOpenMenu = exit;
  InitPartyMenu(C.PARTY_MENU_TYPE_FIELD, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_CHOOSE_MON, false, C.PARTY_MSG_CHOOSE_MON, Task_HandleChooseMonInput, exit);
}

/** CB2_ChooseMonToGiveItem: GIVE from the bag / TM case / berry pouch. */
export function CB2_ChooseMonToGiveItem(): void {
  const pocket = itemInfo(bagResult.itemId)?.pocket ?? 0;
  const callback: MainCB = pocket === C.POCKET_TM_CASE ? () => sItemUseReturns?.tmCase()
    : pocket === C.POCKET_BERRY_POUCH ? () => sItemUseReturns?.berryPouch() : () => sItemUseReturns?.bag();
  InitPartyMenu(C.PARTY_MENU_TYPE_FIELD, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_GIVE_ITEM, false, C.PARTY_MSG_GIVE_TO_WHICH_MON, Task_HandleChooseMonInput, callback);
  gPartyMenu.bagItem = bagResult.itemId;
}

function TryGiveItemOrMailToSelectedMon(taskId: number): void {
  sPartyMenuItemId = GetMonData(mon(gPartyMenu.slotId), C.MON_DATA_HELD_ITEM);
  if (sPartyMenuItemId === C.ITEM_NONE) GiveItemOrMailToSelectedMon(taskId);
  else if (isMailItem(sPartyMenuItemId)) DisplayItemMustBeRemovedFirstMessage(taskId);
  else {
    DisplayAlreadyHoldingItemSwitchMessage(mon(gPartyMenu.slotId), sPartyMenuItemId, true);
    tasks.setFunc(taskId, Task_SwitchItemsFromBagYesNo);
  }
}

function GiveItemOrMailToSelectedMon(taskId: number): void {
  // Mail goes on directly (blank message) while the Easy Chat writer is pending.
  GiveItemToSelectedMon(taskId);
}

function GiveItemToSelectedMon(taskId: number): void {
  if (gPaletteFade.active) return;
  const item = gPartyMenu.bagItem;
  DisplayGaveHeldItemMessage(mon(gPartyMenu.slotId), item, false);
  GiveItemToMon(mon(gPartyMenu.slotId), item);
  RemoveItemToGiveFromBag(item);
  tasks.setFunc(taskId, Task_UpdateHeldItemSpriteAndClosePartyMenu);
}

function Task_UpdateHeldItemSpriteAndClosePartyMenu(taskId: number): void {
  const slot = gPartyMenu.slotId;
  if (!IsPartyMenuTextPrinterActive()) {
    UpdatePartyMonHeldItemSprite(mon(slot), sPartyMenuBoxes[slot]);
    Task_ClosePartyMenu(taskId);
  }
}

function Task_SwitchItemsFromBagYesNo(taskId: number): void {
  if (!IsPartyMenuTextPrinterActive()) { PartyMenuDisplayYesNoMenu(); tasks.setFunc(taskId, Task_HandleSwitchItemsFromBagYesNoInput); }
}

function Task_HandleSwitchItemsFromBagYesNoInput(taskId: number): void {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0: {
      const item = gPartyMenu.bagItem;
      RemoveItemToGiveFromBag(item);
      if (!addBagItem(sPartyMenuItemId, 1)) {
        ReturnGiveItemToBagOrPC(item);
        BufferBagFullCantTakeItemMessage(sPartyMenuItemId);
        DisplayPartyMenuMessage(stringVars.var4, false);
      } else {
        if (isMailItem(sPartyMenuItemId)) TakeMailFromMon(mon(gPartyMenu.slotId));
        GiveItemToMon(mon(gPartyMenu.slotId), item);
        DisplaySwitchedHeldItemMessage(item, sPartyMenuItemId, true);
      }
      tasks.setFunc(taskId, Task_UpdateHeldItemSpriteAndClosePartyMenu);
      break;
    }
    case MENU_B_PRESSED: sound.playSE(C.SE_SELECT); tasks.setFunc(taskId, Task_UpdateHeldItemSpriteAndClosePartyMenu); break;
    case 1: tasks.setFunc(taskId, Task_UpdateHeldItemSpriteAndClosePartyMenu); break;
  }
}

function DisplayItemMustBeRemovedFirstMessage(taskId: number): void {
  DisplayPartyMenuMessage(text("gText_RemoveMailBeforeItem"), true);
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_UpdateHeldItemSpriteAndClosePartyMenu);
}

function RemoveItemToGiveFromBag(item: number): void {
  if (gPartyMenu.action === C.PARTY_ACTION_GIVE_PC_ITEM) removePCItem(item, 1);
  else removeBagItem(item, 1);
}

function ReturnGiveItemToBagOrPC(item: number): boolean {
  return gPartyMenu.action === C.PARTY_ACTION_GIVE_ITEM ? addBagItem(item, 1) : addPCItem(item, 1);
}

/** ChooseMonToGiveMailFromMailbox (the exit callback is Mailbox_ReturnToMailListAfterDeposit, passed in to avoid an import cycle). */
export function ChooseMonToGiveMailFromMailbox(exitCallback: () => void): void {
  InitPartyMenu(C.PARTY_MENU_TYPE_FIELD, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_GIVE_MAILBOX_MAIL, false, C.PARTY_MSG_GIVE_TO_WHICH_MON, Task_HandleChooseMonInput, exitCallback);
}

function TryGiveMailToSelectedMon(taskId: number): void {
  const m = mon(gPartyMenu.slotId);

  partyMenuResult.useExitCallback = false;
  const index = gPlayerPcMenuManager.cursorPos + gPlayerPcMenuManager.itemsAbove;
  const mail = GetPCMail(index);
  if (!mail) {
    tasks.setFunc(taskId, Task_UpdateHeldItemSpriteAndClosePartyMenu);
    return;
  }
  if (GetMonData(m, C.MON_DATA_HELD_ITEM) !== C.ITEM_NONE) {
    DisplayPartyMenuMessage(text("gText_PkmnHoldingItemCantHoldMail"), true);
  } else {
    GiveMailToMon2(m, mail);
    ClearPCMailEntry(index);
    DisplayPartyMenuMessage(text("gText_MailTransferredFromMailbox"), true);
  }
  ScheduleBgCopyTilemapToVram(2);
  tasks.setFunc(taskId, Task_UpdateHeldItemSpriteAndClosePartyMenu);
}

export function ClearSelectedPartyOrder(): void {
  gSelectedOrderFromParty.fill(0);
}

function GetPartySlotEntryStatus(slot: number): number {
  if (!GetBattleEntryEligibility(mon(slot))) return 2;
  if (gSelectedOrderFromParty.includes(slot + 1)) return 1;
  return 0;
}

function GetBattleEntryEligibility(m: Mon): boolean {
  if (GetMonData(m, C.MON_DATA_IS_EGG)) return false;
  switch (gPartyMenu.chooseMonsBattleType) {
    default: return GetMonData(m, C.MON_DATA_LEVEL) <= 30;
    case C.CHOOSE_MONS_FOR_CABLE_CLUB_BATTLE: return GetMonData(m, C.MON_DATA_HP) !== 0;
    case C.CHOOSE_MONS_FOR_BATTLE_TOWER: {
      const tower = save as unknown as { battleTower?: { battleTowerLevelType?: number } };
      if ((tower.battleTower?.battleTowerLevelType ?? 0) === 0 && GetMonData(m, C.MON_DATA_LEVEL) > 50) return false;
      const banned = cdata<number[]>("battle_tower", "gBattleTowerBannedSpecies");
      return !banned.includes(GetMonData(m, C.MON_DATA_SPECIES));
    }
  }
}

/** ChooseMonForMoveTutor: CB2_ReturnToFieldContinueScriptPlayMapMusic is `exit`. */
export function ChooseMonForMoveTutor(exit: () => void): void {
  if (varGet(SV.x8005) < C.TUTOR_MOVE_COUNT) {
    InitPartyMenu(C.PARTY_MENU_TYPE_FIELD, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_MOVE_TUTOR, false, C.PARTY_MSG_TEACH_WHICH_MON, Task_HandleChooseMonInput, exit);
  } else {
    InitPartyMenu(C.PARTY_MENU_TYPE_FIELD, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_MOVE_TUTOR, false, C.PARTY_MSG_NONE, TryTutorSelectedMon, exit);
    gPartyMenu.slotId = varGet(SV.x8007);
  }
}

function GetPartyLayoutFromBattleType(): number {
  if (!IsDoubleBattle()) return C.PARTY_LAYOUT_SINGLE;
  if (IsMultiBattle()) return C.PARTY_LAYOUT_MULTI;
  return C.PARTY_LAYOUT_DOUBLE;
}

/** The battle's exits: CB2_SetUpExitToBattleScreen (success) and the menu's exit callback. */
const sBattleExit: { success: MainCB } = { success: null };

/** OpenPartyMenuInTutorialBattle: `reshow` is SetCB2ToReshowScreenAfterMenu. */
export function OpenPartyMenuInTutorialBattle(partyAction: number, reshow: () => void): void {
  if (!BtlCtrl_OakOldMan_TestState2Flag(FIRST_BATTLE_MSG_FLAG_PARTY_MENU) && G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) {
    InitPartyMenu(C.PARTY_MENU_TYPE_IN_BATTLE, GetPartyLayoutFromBattleType(), partyAction, false, C.PARTY_MSG_NONE, Task_FirstBattleEnterParty_WaitFadeIn, reshow);
    BtlCtrl_OakOldMan_SetState2Flag(FIRST_BATTLE_MSG_FLAG_PARTY_MENU);
  } else {
    InitPartyMenu(C.PARTY_MENU_TYPE_IN_BATTLE, GetPartyLayoutFromBattleType(), partyAction, false, C.PARTY_MSG_CHOOSE_MON, Task_HandleChooseMonInput, reshow);
  }
  UpdatePartyToBattleOrder();
}

/** Pokedude_OpenPartyMenuInBattle: `reshow` is SetCB2ToReshowScreenAfterMenu. */
export function Pokedude_OpenPartyMenuInBattle(reshow: () => void): void {
  InitPartyMenu(C.PARTY_MENU_TYPE_IN_BATTLE, GetPartyLayoutFromBattleType(), C.PARTY_ACTION_CHOOSE_MON, false, C.PARTY_MSG_CHOOSE_MON, Task_PartyMenu_Pokedude, reshow);
  UpdatePartyToBattleOrder();
}

/** Pokedude_ChooseMonForInBattleItem: `success` is CB2_SetUpExitToBattleScreen and `back` CB2_BagMenuFromBattle. */
export function Pokedude_ChooseMonForInBattleItem(success: () => void, back: () => void): void {
  sBattleExit.success = success;
  InitPartyMenu(C.PARTY_MENU_TYPE_IN_BATTLE, GetPartyLayoutFromBattleType(), C.PARTY_ACTION_REUSABLE_ITEM, false, C.PARTY_MSG_USE_ON_WHICH_MON, Task_PartyMenuFromBag_Pokedude, back);
  UpdatePartyToBattleOrder();
}

// Pokedude switches Pokemon
function Task_PartyMenu_Pokedude(taskId: number): void {
  tasks.tasks[taskId].data[0] = 0;
  tasks.setFunc(taskId, Task_PartyMenu_PokedudeStep);
}

function Task_PartyMenu_PokedudeStep(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (!gPaletteFade.active && !PartyMenuPokedudeIsCancelled(taskId)) {
    switch (data[0]) {
      case 80:
        UpdateCurrentPartySelection({ get: () => gPartyMenu.slotId, set: (v) => { gPartyMenu.slotId = v; } }, MENU_DIR_RIGHT);
        break;
      case 160:
        sound.playSE(C.SE_SELECT);
        CreateSelectionWindow();
        break;
      case 240:
        PartyMenuRemoveWindow(2);
        runCursorOption(pmi().actions[0], taskId);
        break;
    }
    ++data[0];
  }
}

function PartyMenuPokedudeIsCancelled(taskId: number): boolean {
  if (joy.newKeys & B_BUTTON) {
    pmi().exitCallback = PartyMenuHandlePokedudeCancel;
    Task_ClosePartyMenu(taskId);
    return true;
  }
  return false;
}

function PartyMenuHandlePokedudeCancel(): void {
  FreeRestoreBattleData();
  LoadPlayerParty();
  SetTeachyTvControllerModeToResume();
  SetMainCallback2(CB2_ReturnToTeachyTV);
}

// Pokedude uses item on his own Pokemon
function Task_PartyMenuFromBag_Pokedude(taskId: number): void {
  tasks.tasks[taskId].data[0] = 0;
  tasks.setFunc(taskId, Task_PartyMenuFromBag_PokedudeStep);
}

function Task_PartyMenuFromBag_PokedudeStep(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (!gPaletteFade.active && !PartyMenuPokedudeIsCancelled(taskId)) {
    if (data[0] !== 80) {
      ++data[0];
    } else {
      pmi().exitCallback = sBattleExit.success;
      gItemUseCB?.(taskId, Task_ClosePartyMenuAfterText);
    }
  }
}

/**
 * EnterPartyFromItemMenuInBattle: `success` is CB2_SetUpExitToBattleScreen and
 * `back` the bag (CB2_BagMenuFromBattle) or pouch the item came from.
 */
export function EnterPartyFromItemMenuInBattle(success: () => void, back: () => void): void {
  sBattleExit.success = success;
  if (!BtlCtrl_OakOldMan_TestState2Flag(FIRST_BATTLE_MSG_FLAG_PARTY_MENU) && G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) {
    InitPartyMenu(C.PARTY_MENU_TYPE_IN_BATTLE, GetPartyLayoutFromBattleType(), C.PARTY_ACTION_USE_ITEM, false, C.PARTY_MSG_NONE, Task_FirstBattleEnterParty_WaitFadeIn, back);
    BtlCtrl_OakOldMan_SetState2Flag(FIRST_BATTLE_MSG_FLAG_PARTY_MENU);
  } else {
    InitPartyMenu(C.PARTY_MENU_TYPE_IN_BATTLE, GetPartyLayoutFromBattleType(), C.PARTY_ACTION_USE_ITEM, false, C.PARTY_MSG_USE_ON_WHICH_MON, Task_HandleChooseMonInput, back);
  }
  UpdatePartyToBattleOrder();
}

function GetPartyMenuActionsTypeInBattle(m: Mon): number {
  if (GetMonData(mon(1), C.MON_DATA_SPECIES) === C.SPECIES_NONE || GetMonData(m, C.MON_DATA_IS_EGG)) return ACTIONS_SUMMARY_ONLY;
  if (gPartyMenu.action === C.PARTY_ACTION_SEND_OUT) return ACTIONS_SEND_OUT;
  return ACTIONS_SHIFT;
}

function TrySwitchInPokemon(): boolean {
  const slot = GetCursorSelectionMonId();
  const m = mon(slot);
  if (GetMonData(m, C.MON_DATA_HP) === 0) {
    stringVars.var1 = GetMonNickname(m);
    stringVars.var4 = expandPlaceholders(text("gText_PkmnHasNoEnergy"));
    return false;
  }
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (GetBattlerSide(i) === C.B_SIDE_PLAYER && GetPartyIdFromBattleSlot(slot) === gBattlerPartyIndexes[i]) {
      stringVars.var1 = GetMonNickname(m);
      stringVars.var4 = expandPlaceholders(text("gText_PkmnAlreadyInBattle"));
      return false;
    }
  }
  if (GetMonData(m, C.MON_DATA_IS_EGG)) { stringVars.var4 = expandPlaceholders(text("gText_EggCantBattle")); return false; }
  if (GetPartyIdFromBattleSlot(slot) === gBattleStruct.playerPartyIdx) {
    stringVars.var1 = GetMonNickname(m);
    stringVars.var4 = expandPlaceholders(text("gText_PkmnAlreadySelected"));
    return false;
  }
  if (gPartyMenu.action === C.PARTY_ACTION_ABILITY_PREVENTS) { SetMonPreventsSwitchingString(); return false; }
  if (gPartyMenu.action === C.PARTY_ACTION_CANT_SWITCH) {
    stringVars.var1 = GetMonNickname(mon(GetPartyIdFromBattlePartyId(gBattlerPartyIndexes[G.gBattlerInMenuId])));
    stringVars.var4 = expandPlaceholders(text("gText_PkmnCantSwitchOut"));
    return false;
  }
  partyMenuResult.selectedMonPartyId = GetPartyIdFromBattleSlot(slot);
  partyMenuResult.useExitCallback = true;
  const newSlot = GetPartyIdFromBattlePartyId(gBattlerPartyIndexes[G.gBattlerInMenuId]);
  SwitchPartyMonSlots(newSlot, slot);
  SwapPartyPokemon(newSlot, slot);
  return true;
}

/** pokemon.c SetMonPreventsSwitchingString */
function SetMonPreventsSwitchingString(): void {
  const buff1 = [0xfd, 0x05, gBattleStruct.battlerPreventingSwitchout, 0, 0xff];
  const b = gBattleStruct.battlerPreventingSwitchout;
  buff1[3] = GetBattlerSide(b) === C.B_SIDE_PLAYER ? GetPartyIdFromBattlePartyId(gBattlerPartyIndexes[b]) : gBattlerPartyIndexes[b];
  G.gLastUsedAbility = gBattleStruct.abilityPreventingSwitchout;
  void buff1;
  const out: number[] = [];
  BattleStringExpandPlaceholders(text("gText_PkmnsXPreventsSwitching"), out);
  stringVars.var4 = Uint8Array.from([...u8str(out), 0xff]);
}

function GetPartyIdFromBattleSlot(slot: number): number {
  const b = gBattlePartyCurrentOrder[slot >> 1];
  return slot & 1 ? b & 0xf : b >> 4;
}

function SetPartyIdAtBattleSlot(slot: number, value: number): void {
  const i = slot >> 1;
  if (slot & 1) gBattlePartyCurrentOrder[i] = (gBattlePartyCurrentOrder[i] & 0xf0) | value;
  else gBattlePartyCurrentOrder[i] = (gBattlePartyCurrentOrder[i] & 0xf) | (value << 4);
}

function SwitchPartyMonSlots(slot: number, slot2: number): void {
  const partyId = GetPartyIdFromBattleSlot(slot);
  SetPartyIdAtBattleSlot(slot, GetPartyIdFromBattleSlot(slot2));
  SetPartyIdAtBattleSlot(slot2, partyId);
}

function GetPartyIdFromBattlePartyId(battlePartyId: number): number {
  for (let i = 0, j = 0; i < 3; j++, i++) {
    if (gBattlePartyCurrentOrder[i] >> 4 !== battlePartyId) {
      j++;
      if ((gBattlePartyCurrentOrder[i] & 0xf) === battlePartyId) return j;
    } else {
      return j;
    }
  }
  return 0;
}

function reorderParty(target: (i: number) => number): void {
  const party = save.party as Mon[];
  const src = Array.from({ length: PARTY_SIZE }, (_, i) => party[i] ?? zeroMon());
  const dst = new Array<Mon>(PARTY_SIZE);
  for (let i = 0; i < PARTY_SIZE; i++) dst[target(i)] = src[i];
  save.party.splice(0, save.party.length, ...dst.filter((m) => m && m.species !== C.SPECIES_NONE));
}

function UpdatePartyToBattleOrder(): void {
  reorderParty((i) => GetPartyIdFromBattlePartyId(i));
}

function UpdatePartyToFieldOrder(): void {
  reorderParty((i) => GetPartyIdFromBattleSlot(i));
}

/** ChooseMonForDaycare: `exit` is CB2_ReturnToField followed by the script. */
export function ChooseMonForDaycare(exit: () => void): void {
  InitPartyMenu(C.PARTY_MENU_TYPE_DAYCARE, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_CHOOSE_MON, false, C.PARTY_MSG_CHOOSE_MON_2, Task_HandleChooseMonInput, exit);
}

/** ChoosePartyMonByMenuType */
export function ChoosePartyMonByMenuType(menuType: number, exit: () => void): void {
  InitPartyMenu(menuType, C.PARTY_LAYOUT_SINGLE, C.PARTY_ACTION_CHOOSE_AND_CLOSE, false, C.PARTY_MSG_CHOOSE_MON, Task_HandleChooseMonInput, exit);
}

/** Task_ChoosePartyMon (party_menu_specials.c): the web scene's async party-menu init replaces the GBA fade-wait task. */
export function Task_ChoosePartyMon(menuType: number, exit: () => void): void {
  ChoosePartyMonByMenuType(menuType, exit);
}

void DRAW_MENU_BOX_ONLY; void ChangeBgX; void FillBgTilemapBufferRect; void CopyBgTilemapBufferToVram; void BlendPalettes;
