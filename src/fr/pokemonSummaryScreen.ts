// pokemon_summary_screen.c: Pokémon Summary Screen.
// Complete, faithful port of the GBA summary screen on the hardware layer (hw/).
// Supports PSS_MODE_NORMAL (browse party/box), PSS_MODE_SELECT_MOVE (replaces a move),
// and PSS_MODE_FORGET_MOVE.
//
// Hardware layers:
//   BG0: CharBase 0, MapBase 14, Priority 0 (Text & Windows)
//   BG1: CharBase 2, MapBase 12, Priority 2 (Info page / Moves Info page)
//   BG2: CharBase 2, MapBase 10, Priority 1 (Skills page / Moves page)
//   BG3: CharBase 2, MapBase 9,  Priority 3 (Background / page indicator tabs)
//
// Sprites (OAM):
//   - Pokémon front pic at (60, 65) (64x64, bounces on switch, shakes if Egg)
//   - Poké Ball icon at (106, 88)
//   - Mon Icon at (24, 32)
//   - Status condition icon at (16, 38) or (16, 45)
//   - HP bar at (172 + i*8, 36) (9 sprites)
//   - EXP bar at (156 + i*8, 132) (11 sprites)
//   - Shiny star at (106, 40) or (8, 24)
//   - Cured Pokerus dot at (114, 92) or (16, 44)
//   - Markings combination sprite at (20, 91)
//   - Move selection cursor (red left/right at (152, 216), blue swap cursor)

import * as C from "./generated/constants";
import { cdata, cdataAny, incbin, incbin16, isSym, loadCData, preloadPacks, symName } from "./hw/assets";
import {
  ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, FillBgTilemapBufferRect,
  FillBgTilemapBufferRect_Palette0, HideBg, InitBgsFromTemplates,
  LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "./hw/bg";
import { SetGpuRegBits, ClearGpuRegBits, SetGpuReg, GetGpuReg } from "./hw/gpu";
import {
  DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_WIN1_ON,
  REG_OFFSET_DISPCNT, REG_OFFSET_BG0CNT, REG_OFFSET_BG1CNT, REG_OFFSET_BG2CNT,
  REG_OFFSET_BG0HOFS, REG_OFFSET_BG1HOFS, REG_OFFSET_BG2HOFS,
  REG_OFFSET_WININ, REG_OFFSET_WINOUT, REG_OFFSET_WIN1H, REG_OFFSET_WIN1V,
  WININ_WIN0_BG0, WININ_WIN0_BG1, WININ_WIN0_BG2, WININ_WIN0_BG3, WININ_WIN0_OBJ,
  WINOUT_WIN01_BG0, WINOUT_WIN01_BG1, WINOUT_WIN01_BG2, WINOUT_WIN01_BG3,
} from "./hw/ppu";
import {
  BeginNormalPaletteFade, BlendPalettes, LoadPalette, ResetPaletteFade, TransferPlttBuffer, UpdatePaletteFade,
  gPaletteFade, BG_PLTT_ID, OBJ_PLTT_ID, PALETTES_ALL, PLTT_SIZE_4BPP,
} from "./hw/palette";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySpriteAndFreeResources, FreeAllSpritePalettes,
  FreeSpriteTilesByTag, IndexOfSpritePaletteTag, LoadOam, LoadSpritePalette,
  LoadSpriteSheet, ProcessSpriteCopyRequests, ResetSpriteData, StartSpriteAnim, gDummySpriteAffineAnimTable,
  gDummySpriteAnimTable, oamData, SpriteCallbackDummy, ST_OAM_4BPP, ST_OAM_AFFINE_OFF, ST_OAM_OBJ_NORMAL,
  TAG_NONE, type Sprite, type SpriteTemplate, SPRITE_SHAPE, SPRITE_SIZE, gSprites,
} from "./hw/sprite";
import { animsFrom, oamFrom } from "./hw/cdataSprite";
import {
  AddWindow, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap,
  RemoveWindow, type WindowTemplate, COPYWIN_GFX,
} from "./hw/window";
import { AddTextPrinterParameterized3, AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./hw/text";
import { BlitMenuInfoIcon, ListMenuLoadStdPalAt } from "./hw/listMenu";
import { FONT_NORMAL, FONT_SMALL, GetStringWidth } from "./gba/font";
import { EOS, encode, intToDecimal, StringCompareWithoutExtCtrlCodes, StringCopy, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { TEXT_SKIP_DRAW } from "./gba/textPrinter";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, JOY_NEW, L_BUTTON, R_BUTTON } from "./gba/input";
import { tasks, type TaskFunc } from "./gba/tasks";
import { SetMainCallback2, SetMainCallback2WhenLoaded, SetVBlankCallback, SetHBlankCallback } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import { sound } from "./audio/sound";
import { DynamicPlaceholderTextUtil_ExpandPlaceholders, DynamicPlaceholderTextUtil_Reset, DynamicPlaceholderTextUtil_SetPlaceholderPtr } from "./dynamicPlaceholderTextUtil";
import { rom } from "./rom";
import { save } from "./save";
import { SetHelpContext } from "./helpSystem";
import {
  CalculatePPWithBonus, GetMonData, GetMonGender, IsMonShiny, zeroMon, type Mon,
} from "./pokemon/mon";
import { SeekToNextMonInBox } from "./pokemon/storage";
import { speciesName, type Pokemon } from "./pokemon/pokemon";
import { itemName } from "./pokemon/items";
import { GetHPBarLevel } from "./battle/interface";
import { GetMonSpritePalFromSpeciesAndPersonality, IsMonSpriteNotFlipped, LoadSpecialPokePic } from "./pokemon/pics";
import { CreateMonIcon, DestroyMonIcon, SafeFreeMonIconPalette, SafeLoadMonIconPalette } from "./pokemonIcon";
import { FreeBallGfx, gBallSpriteTemplates, ItemIdToBallId, LoadBallGfx } from "./battle/pokeball";
import { ShouldPlayNormalMonCry } from "./battle/gfx_sfx_util";
import { IsMoveHm } from "./menus/monProgress";
import { getMapNameGenericBytes } from "./regionMap";
import { fieldMenu } from "./menus/fieldMenus";

function CheckPartyPokerus(mon: Mon, _selection = 0): boolean {
  return (mon.pokerus & 0x0f) !== 0;
}

function CheckPartyHasHadPokerus(mon: Mon, _selection = 0): boolean {
  return (mon.pokerus & 0xf0) !== 0;
}

// ---------------------------------------------------------------- enums and constants

export enum PokemonSummaryScreenMode {
  PSS_MODE_NORMAL = 0,
  PSS_MODE_UNK1 = 1,
  PSS_MODE_SELECT_MOVE = 2,
  PSS_MODE_FORGET_MOVE = 3,
  PSS_MODE_TRADE = 4,
  PSS_MODE_BOX = 5,
}

export enum PokemonSummaryScreenPage {
  PSS_PAGE_INFO = 0,
  PSS_PAGE_SKILLS = 1,
  PSS_PAGE_MOVES = 2,
  PSS_PAGE_MOVES_INFO = 3,
  PSS_PAGE_UNK4 = 4,
  PSS_PAGE_MOVE_DELETER = 5,
}

enum State3270 {
  PSS_STATE3270_FADEIN = 0,
  PSS_STATE3270_PLAYCRY = 1,
  PSS_STATE3270_HANDLEINPUT = 2,
  PSS_STATE3270_FLIPPAGES = 3,
  PSS_STATE3270_ATEXIT_FADEOUT = 4,
  PSS_STATE3270_ATEXIT_WAITLINKDELAY = 5,
  PSS_STATE3270_ATEXIT_WAITFADE = 6,
}

const POKESUM_WIN_PAGE_NAME = 0;
const POKESUM_WIN_CONTROLS = 1;
const POKESUM_WIN_LVL_NICK = 2;
const POKESUM_WIN_RIGHT_PANE = 3;
const POKESUM_WIN_TRAINER_MEMO = 4;

const TAG_PSS_UNK_64 = 0x64; // move selection cursor
const TAG_PSS_UNK_6E = 0x6e; // status ailment icon
const TAG_PSS_UNK_78 = 0x78; // hp bar
const TAG_PSS_UNK_82 = 0x82; // exp bar
const TAG_PSS_UNK_8C = 0x8c; // markings
const TAG_PSS_UNK_96 = 0x96; // pokerus cured icon
const TAG_PSS_UNK_A0 = 0xa0; // shiny star
const TAG_PSS_MON_PIC = 0x68;

const AILMENT_NONE = 0;
const AILMENT_PSN = 1;
const AILMENT_PRZ = 2;
const AILMENT_SLP = 3;
const AILMENT_FRZ = 4;
const AILMENT_BRN = 5;
const AILMENT_PKRS = 6;
const AILMENT_FNT = 7;

const PSS_STAT_ATK = 0;
const PSS_STAT_DEF = 1;
const PSS_STAT_SPA = 2;
const PSS_STAT_SPD = 3;
const PSS_STAT_SPE = 4;

const PAGE_PROGRESS_BASE_TILE_NUM = 345;

// ---------------------------------------------------------------- state structures

interface MoveSelectionCursorObj {
  sprite: Sprite;
  whichSprite: number;
  tileTag: number;
  palTag: number;
}

interface HpBarObjs {
  sprites: (Sprite | null)[];
  xpos: number[];
  tileTag: number;
  palTag: number;
}

interface ExpBarObjs {
  sprites: (Sprite | null)[];
  xpos: number[];
  tileTag: number;
  palTag: number;
}

interface StatusIconObj {
  sprite: Sprite | null;
  tileTag: number;
  palTag: number;
}

interface PokerusIconObj {
  sprite: Sprite | null;
  tileTag: number;
  palTag: number;
}

interface ShinyStarObjData {
  sprite: Sprite | null;
  tileTag: number;
  palTag: number;
}

interface MonPicBounceState {
  animFrame: number;
  initDelay: number;
  vigor: number;
}

interface SkillsPrinterXpos {
  unk00: number;
  curHpStr: number;
  atkStr: number;
  defStr: number;
  spAStr: number;
  spDStr: number;
  speStr: number;
  expStr: number;
  toNextLevel: number;
  curPp: number[];
  maxPp: number[];
}

interface SummaryData {
  speciesNameStrBuf: Uint8Array;
  nicknameStrBuf: Uint8Array;
  otNameStrBuf: Uint8Array;
  otNameStrBufs: [Uint8Array, Uint8Array];
  dexNumStrBuf: Uint8Array;
  unk306C: Uint8Array;
  itemNameStrBuf: Uint8Array;
  genderSymbolStrBuf: Uint8Array;
  levelStrBuf: Uint8Array;
  curHpStrBuf: Uint8Array;
  statValueStrBufs: Uint8Array[];
  moveCurPpStrBufs: Uint8Array[];
  moveMaxPpStrBufs: Uint8Array[];
  moveNameStrBufs: Uint8Array[];
  movePowerStrBufs: Uint8Array[];
  moveAccuracyStrBufs: Uint8Array[];
  expPointsStrBuf: Uint8Array;
  expToNextLevelStrBuf: Uint8Array;
  abilityNameStrBuf: Uint8Array;
  abilityDescStrBuf: Uint8Array;
}

interface PokemonSummaryScreenData {
  bg1TilemapBuffer: Uint16Array;
  bg2TilemapBuffer: Uint16Array;
  bg3TilemapBuffer: Uint16Array;
  windowIds: number[];

  ballIconSpriteId: number;
  monPicSpriteId: number;
  monIconSpriteId: number;

  inputHandlerTaskId: number;
  inhibitPageFlipInput: boolean;
  numMonPicBounces: number;
  isEnemyParty: boolean;

  summary: SummaryData;

  isEgg: boolean;
  isBadEgg: boolean;
  mode: number;
  lastIndex: number;
  curPageIndex: number;
  isBoxMon: boolean;
  monTypes: [number, number];

  pageFlipDirection: number;
  lockMovesFlag: boolean;
  whichBgLayerToTranslate: number;
  skillsPageBgNum: number;
  infoAndMovesPageBgNum: number;
  flippingPages: boolean;
  flipPagesBgHofs: number;

  moveTypes: number[];
  moveIds: number[];
  numMoves: number;
  isSwappingMoves: boolean;
  curMonStatusAilment: number;

  state3270: State3270;
  summarySetupStep: number;
  loadBgGfxStep: number;
  spriteCreationStep: number;
  bufferStringsStep: number;
  state3284: number;
  selectMoveInputHandlerState: number;
  switchMonTaskState: number;

  currentMon: Pokemon;
  monList: (Mon | null)[];
  savedCallback: () => void;
  markingSprite: Sprite | null;
  lastPageFlipDirection: number;
}

let sMonSummaryScreen: PokemonSummaryScreenData | null = null;
let sMonSkillsPrinterXpos: SkillsPrinterXpos | null = null;
const sMoveSelectionCursorObjs: (MoveSelectionCursorObj | null)[] = [null, null, null, null];
let sStatusIcon: StatusIconObj | null = null;
let sHpBarObjs: HpBarObjs | null = null;
let sExpBarObjs: ExpBarObjs | null = null;
let sPokerusIconObj: PokerusIconObj | null = null;
let sShinyStarObjData: ShinyStarObjData | null = null;
let sLastViewedMonIndex = 0;
let sMoveSelectionCursorPos = 0;
let sMoveSwapCursorPos = 0;
let sMonPicBounceState: MonPicBounceState | null = null;

// ---------------------------------------------------------------- string & asset helpers

const EOS_ARRAY = Uint8Array.from([EOS]);

function createSummaryData(): SummaryData {
  return {
    speciesNameStrBuf: new Uint8Array(12).fill(EOS),
    nicknameStrBuf: new Uint8Array(12).fill(EOS),
    otNameStrBuf: new Uint8Array(12).fill(EOS),
    otNameStrBufs: [new Uint8Array(12).fill(EOS), new Uint8Array(12).fill(EOS)],
    dexNumStrBuf: new Uint8Array(5).fill(EOS),
    unk306C: new Uint8Array(7).fill(EOS),
    itemNameStrBuf: new Uint8Array(16).fill(EOS),
    genderSymbolStrBuf: new Uint8Array(4).fill(EOS),
    levelStrBuf: new Uint8Array(8).fill(EOS),
    curHpStrBuf: new Uint8Array(12).fill(EOS),
    statValueStrBufs: Array.from({ length: 5 }, () => new Uint8Array(6).fill(EOS)),
    moveCurPpStrBufs: Array.from({ length: 5 }, () => new Uint8Array(12).fill(EOS)),
    moveMaxPpStrBufs: Array.from({ length: 5 }, () => new Uint8Array(12).fill(EOS)),
    moveNameStrBufs: Array.from({ length: 5 }, () => new Uint8Array(16).fill(EOS)),
    movePowerStrBufs: Array.from({ length: 5 }, () => new Uint8Array(6).fill(EOS)),
    moveAccuracyStrBufs: Array.from({ length: 5 }, () => new Uint8Array(6).fill(EOS)),
    expPointsStrBuf: new Uint8Array(12).fill(EOS),
    expToNextLevelStrBuf: new Uint8Array(12).fill(EOS),
    abilityNameStrBuf: new Uint8Array(16).fill(EOS),
    abilityDescStrBuf: new Uint8Array(64).fill(EOS),
  };
}

function StringLength(str: Uint8Array): number {
  let len = 0;
  while (len < str.length && str[len] !== EOS) len++;
  return len;
}

const GetNumberRightAlign63 = (x: Uint8Array) => 63 - StringLength(x) * 6;
const GetNumberRightAlign27 = (x: Uint8Array) => 27 - StringLength(x) * 6;
const GetRightAlignXpos_NDigits = (a: number, b: Uint8Array) => 6 * a - StringLength(b) * 6;
const GetMoveNamePrinterYpos = (x: number) => x * 28 + 5;
const GetMovePpPrinterYpos = (x: number) => x * 28 + 16;

function strCopy(dest: Uint8Array, src: ArrayLike<number>): void {
  let i = 0;
  for (; i < src.length && i < dest.length - 1; i++) {
    if (src[i] === EOS) break;
    dest[i] = src[i];
  }
  dest[i] = EOS;
}

function strAppend(dest: Uint8Array, src: ArrayLike<number>): void {
  let d = 0;
  while (d < dest.length && dest[d] !== EOS) d++;
  let s = 0;
  while (s < src.length && src[s] !== EOS && d < dest.length - 1) {
    dest[d++] = src[s++];
  }
  dest[d] = EOS;
}

function resolveText(ref: unknown): Uint8Array {
  const name = symName(ref);
  if (!name) return EOS_ARRAY;
  try {
    return rom.text(name);
  } catch {
    return EOS_ARRAY;
  }
}

// ---------------------------------------------------------------- public entry points

export function GetLastViewedMonIndex(): number {
  return sLastViewedMonIndex;
}

export function GetMoveSlotToReplace(): number {
  return sMoveSwapCursorPos;
}

export function SetPokemonSummaryScreenMode(mode: number): void {
  if (sMonSummaryScreen) sMonSummaryScreen.mode = mode;
}

export async function preloadSummaryScreen(): Promise<void> {
  await Promise.all([
    loadCData("pokemon_summary_screen", "battle_main", "move_descriptions", "pokeball", "mon_markings", "data"),
    preloadPacks([
      "graphics_summary_screen", "graphics_interface", "pokemon",
      "graphics_text_window", "graphics_fonts", "graphics_misc", "pokeball",
    ]),
  ]);
}

/**
 * ShowPokemonSummaryScreen: entry point matching both C signature
 * (party, cursorPos, lastIdx, callback, mode) and TS adapter signature
 * (cursorPos, lastIdx, callback, mode).
 */
export function ShowPokemonSummaryScreen(
  partyOrSlot: (Mon | null)[] | number,
  cursorPosOrLastIdx: number,
  lastIdxOrCallback: number | (() => void),
  callbackOrMode?: (() => void) | number,
  modeArg = 0,
): void {
  let party: (Mon | null)[];
  let cursorPos: number;
  let lastIdx: number;
  let savedCallback: () => void;
  let mode: number;

  if (typeof partyOrSlot === "number") {
    cursorPos = partyOrSlot;
    lastIdx = cursorPosOrLastIdx;
    savedCallback = (lastIdxOrCallback as () => void) ?? (() => {});
    mode = (typeof callbackOrMode === "number" ? callbackOrMode : modeArg) ?? 0;
    party = save.party;
  } else {
    party = partyOrSlot ?? save.party;
    cursorPos = cursorPosOrLastIdx;
    lastIdx = typeof lastIdxOrCallback === "number" ? lastIdxOrCallback : Math.max(0, party.length - 1);
    savedCallback = (callbackOrMode as () => void) ?? (() => {});
    mode = modeArg ?? 0;
  }

  const startPSS = (): void => {
    InitSummaryScreenState(party, cursorPos, lastIdx, savedCallback, mode);
  };

  const frGame = (window as unknown as { frGame?: { scene: unknown } }).frGame;
  if (frGame && !frGame.scene) {
    fieldMenu(frGame as unknown as import("./game").Game, (close) => {
      const origCb = savedCallback;
      savedCallback = () => {
        close();
        origCb();
      };
      startPSS();
    }, false);
  } else {
    startPSS();
  }
}

/**
 * ShowSelectMovePokemonSummaryScreen: prompts to replace a move.
 */
export function ShowSelectMovePokemonSummaryScreen(
  partyOrSlot: Pokemon[] | number,
  cursorPosOrLastIdx: number,
  lastIdxOrCallback: number | (() => void),
  callbackOrNewMove?: (() => void) | number,
  newMoveArg = 0,
): void {
  let party: Pokemon[];
  let cursorPos: number;
  let lastIdx: number;
  let savedCallback: () => void;
  let newMove: number;

  if (typeof partyOrSlot === "number") {
    cursorPos = partyOrSlot;
    lastIdx = cursorPosOrLastIdx;
    savedCallback = (lastIdxOrCallback as () => void) ?? (() => {});
    newMove = (typeof callbackOrNewMove === "number" ? callbackOrNewMove : newMoveArg) ?? 0;
    party = save.party;
  } else {
    party = partyOrSlot ?? save.party;
    cursorPos = cursorPosOrLastIdx;
    lastIdx = typeof lastIdxOrCallback === "number" ? lastIdxOrCallback : Math.max(0, party.length - 1);
    savedCallback = (callbackOrNewMove as () => void) ?? (() => {});
    newMove = newMoveArg ?? 0;
  }

  ShowPokemonSummaryScreen(party, cursorPos, lastIdx, savedCallback, PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE);
  if (sMonSummaryScreen) {
    sMonSummaryScreen.moveIds[4] = newMove;
  }
}

// ---------------------------------------------------------------- screen initialization

function InitSummaryScreenState(
  party: (Mon | null)[],
  cursorPos: number,
  lastIdx: number,
  savedCallback: () => void,
  mode: number,
): void {
  sLastViewedMonIndex = cursorPos;
  sMoveSelectionCursorPos = 0;
  sMoveSwapCursorPos = 0;

  sMonSkillsPrinterXpos = {
    unk00: 0, curHpStr: 0, atkStr: 0, defStr: 0, spAStr: 0, spDStr: 0, speStr: 0, expStr: 0, toNextLevel: 0,
    curPp: [0xff, 0xff, 0xff, 0xff, 0xff],
    maxPp: [0xff, 0xff, 0xff, 0xff, 0xff],
  };

  sMonSummaryScreen = {
    bg1TilemapBuffer: new Uint16Array(0x800),
    bg2TilemapBuffer: new Uint16Array(0x800),
    bg3TilemapBuffer: new Uint16Array(0x800),
    windowIds: new Array(7).fill(0xff),
    ballIconSpriteId: 0,
    monPicSpriteId: 0,
    monIconSpriteId: 0,
    inputHandlerTaskId: 0,
    inhibitPageFlipInput: false,
    numMonPicBounces: 0,
    isEnemyParty: false,
    summary: createSummaryData(),
    isEgg: false,
    isBadEgg: false,
    mode,
    lastIndex: lastIdx,
    curPageIndex: PokemonSummaryScreenPage.PSS_PAGE_INFO,
    isBoxMon: mode === PokemonSummaryScreenMode.PSS_MODE_BOX,
    monTypes: [0, 0],
    pageFlipDirection: 0,
    lockMovesFlag: false,
    whichBgLayerToTranslate: 0,
    skillsPageBgNum: 2,
    infoAndMovesPageBgNum: 1,
    flippingPages: false,
    flipPagesBgHofs: 0,
    moveTypes: [0, 0, 0, 0, 0],
    moveIds: [0, 0, 0, 0, 0],
    numMoves: 0,
    isSwappingMoves: false,
    curMonStatusAilment: 0,
    state3270: State3270.PSS_STATE3270_FADEIN,
    summarySetupStep: 0,
    loadBgGfxStep: 0,
    spriteCreationStep: 0,
    bufferStringsStep: 0,
    state3284: 0,
    selectMoveInputHandlerState: 0,
    switchMonTaskState: 0,
    currentMon: { ...(party[cursorPos] ?? zeroMon()) },
    monList: party,
    savedCallback,
    markingSprite: null,
    lastPageFlipDirection: 0xff,
  };

  if (mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE || mode === PokemonSummaryScreenMode.PSS_MODE_FORGET_MOVE) {
    sMonSummaryScreen.curPageIndex = PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO;
    sMonSummaryScreen.lockMovesFlag = true;
  }

  BufferSelectedMonData(sMonSummaryScreen.currentMon);
  sMonSummaryScreen.isEgg = !!sMonSummaryScreen.currentMon.isEgg;
  sMonSummaryScreen.isBadEgg = false;

  // Browser adaptation: CB2 changes now (as in the C) and CB2_SetUpPSS starts
  // once the summary data is loaded. Nothing else loads mon_markings, so the
  // screen crashed when opened from battle (learn-move prompt).
  SetMainCallback2WhenLoaded(preloadSummaryScreen(), () => SetMainCallback2(CB2_SetUpPSS));
}

function BufferSelectedMonData(mon: Pokemon): void {
  if (!sMonSummaryScreen) return;
  const source = sMonSummaryScreen.monList[sLastViewedMonIndex];
  Object.assign(mon, source ?? zeroMon());
}

// ---------------------------------------------------------------- setup sequence (CB2_SetUpPSS)

function CB2_SetUpPSS(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  switch (pss.summarySetupStep) {
    case 0:
      PokeSum_Setup_ResetCallbacks();
      break;
    case 1:
      PokeSum_Setup_InitGpu();
      break;
    case 2:
      PokeSum_Setup_SpritesReset();
      break;
    case 3:
      if (!PokeSum_HandleLoadBgGfx()) return;
      break;
    case 4:
      if (!PokeSum_HandleCreateSprites()) return;
      break;
    case 5:
      PokeSum_CreateWindows();
      break;
    case 6:
      if (!PokeSum_Setup_BufferStrings()) return;
      break;
    case 7:
      PokeSum_PrintRightPaneText();
      break;
    case 8:
      PokeSum_PrintBottomPaneText();
      break;
    case 9:
      PokeSum_PrintAbilityDataOrMoveTypes();
      PokeSum_PrintMonTypeIcons();
      break;
    case 10:
      if (pss.mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE || pss.mode === PokemonSummaryScreenMode.PSS_MODE_FORGET_MOVE) {
        CopyToBgTilemapBuffer(3, incbin("sBgTilemap_MovesPage"), 0, 0);
      } else {
        CopyToBgTilemapBuffer(3, incbin("sBgTilemap_MovesInfoPage"), 0, 0);
      }
      PokeSum_DrawPageProgressTiles();
      break;
    case 11:
      if (pss.isEgg) {
        CopyToBgTilemapBuffer(pss.skillsPageBgNum, incbin("gSummaryScreen_PageEgg_Tilemap"), 0, 0);
      } else if (pss.mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE || pss.mode === PokemonSummaryScreenMode.PSS_MODE_FORGET_MOVE) {
        CopyToBgTilemapBuffer(pss.skillsPageBgNum, incbin("gSummaryScreen_PageMoves_Tilemap"), 0, 0);
        CopyToBgTilemapBuffer(pss.infoAndMovesPageBgNum, incbin("gSummaryScreen_PageMovesInfo_Tilemap"), 0, 0);
      } else {
        CopyToBgTilemapBuffer(pss.skillsPageBgNum, incbin("gSummaryScreen_PageInfo_Tilemap"), 0, 0);
        CopyToBgTilemapBuffer(pss.infoAndMovesPageBgNum, incbin("gSummaryScreen_PageSkills_Tilemap"), 0, 0);
      }
      break;
    case 12:
      BlendPalettes(0xffffffff, 16, 0);
      PokeSum_PrintPageHeaderText(pss.curPageIndex);
      CommitStaticWindowTilemaps();
      break;
    case 13:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, 0);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_PAGE_NAME], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_CONTROLS], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_LVL_NICK], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[6], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_RIGHT_PANE], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_TRAINER_MEMO], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[5], COPYWIN_GFX);
      break;
    case 14:
      CopyBgTilemapBufferToVram(0);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(3);
      break;
    case 15:
      if (pss.mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE || pss.mode === PokemonSummaryScreenMode.PSS_MODE_FORGET_MOVE) {
        PokeSum_ShowOrHideMonIconSprite(false);
        ShoworHideMoveSelectionCursor(false);
      } else {
        PokeSum_ShowOrHideMonPicSprite(false);
        PokeSum_ShowOrHideMonMarkingsSprite(false);
        ShowOrHideBallIconObj(false);
        ShowOrHideHpBarObjs(false);
        ShowOrHideExpBarObjs(false);
      }
      ShowOrHideStatusIcon(false);
      HideShowPokerusIcon(false);
      HideShowShinyStar(false);
      break;
    default:
      PokeSum_Setup_SetVBlankCallback();
      PokeSum_FinishSetup();
      return;
  }
  pss.summarySetupStep++;
}

/** PokeSum_Setup_ResetCallbacks (pokemon_summary_screen.c). */
function PokeSum_Setup_ResetCallbacks(): void {
  SetVBlankCallback(null);
  SetHBlankCallback(null);
}

/** PokeSum_Setup_SpritesReset (pokemon_summary_screen.c). */
function PokeSum_Setup_SpritesReset(): void {
  ResetSpriteData();
  ResetPaletteFade();
  FreeAllSpritePalettes();
  ScanlineEffect_Stop();
}

/** PokeSum_Setup_SetVBlankCallback (pokemon_summary_screen.c). */
function PokeSum_Setup_SetVBlankCallback(): void {
  SetVBlankCallback(VBlankCB_PokemonSummaryScreen);
}

function PokeSum_Setup_InitGpu(): void {
  if (!sMonSummaryScreen) return;
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  ResetBgsAndClearDma3BusyFlags(0);

  const templates = cdata<BgTemplate[]>("pokemon_summary_screen", "sBgTempaltes");
  InitBgsFromTemplates(0, templates);

  ChangeBgX(0, 0, 0); ChangeBgY(0, 0, 0);
  ChangeBgX(1, 0, 0); ChangeBgY(1, 0, 0);
  ChangeBgX(2, 0, 0); ChangeBgY(2, 0, 0);
  ChangeBgX(3, 0, 0); ChangeBgY(3, 0, 0);

  DeactivateAllTextPrinters();
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON | DISPCNT_WIN1_ON);
  PokeSum_UpdateWin1ActiveFlag(sMonSummaryScreen.curPageIndex);

  SetGpuReg(REG_OFFSET_WININ, (WININ_WIN0_OBJ | WININ_WIN0_BG0 | WININ_WIN0_BG1 | WININ_WIN0_BG2 | WININ_WIN0_BG3) << 8);
  SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG0 | WINOUT_WIN01_BG1 | WINOUT_WIN01_BG2 | WINOUT_WIN01_BG3);
  SetGpuReg(REG_OFFSET_WIN1V, (32 << 8) | 135);
  SetGpuReg(REG_OFFSET_WIN1H, (2 << 8) | 240);

  SetBgTilemapBuffer(1, sMonSummaryScreen.bg1TilemapBuffer);
  SetBgTilemapBuffer(2, sMonSummaryScreen.bg2TilemapBuffer);
  SetBgTilemapBuffer(3, sMonSummaryScreen.bg3TilemapBuffer);

  ShowBg(0); ShowBg(1); ShowBg(2); ShowBg(3);
}

function PokeSum_HandleLoadBgGfx(): boolean {
  if (!sMonSummaryScreen) return true;
  const pss = sMonSummaryScreen;

  switch (pss.loadBgGfxStep) {
    case 0: {
      const pal = incbin16("gSummaryScreen_Bg_Pal");
      LoadPalette(pal, BG_PLTT_ID(0), 5 * PLTT_SIZE_4BPP);
      if (IsMonShiny(pss.currentMon) && !pss.isEgg) {
        LoadPalette(pal.subarray(16 * 6, 16 * 7), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
        LoadPalette(pal.subarray(16 * 5, 16 * 6), BG_PLTT_ID(1), PLTT_SIZE_4BPP);
      } else {
        LoadPalette(pal.subarray(0, 16), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
        LoadPalette(pal.subarray(16, 32), BG_PLTT_ID(1), PLTT_SIZE_4BPP);
      }
      break;
    }
    case 1:
      ListMenuLoadStdPalAt(BG_PLTT_ID(6), 1);
      LoadPalette(incbin16("sTextHeaderPalette"), BG_PLTT_ID(7), PLTT_SIZE_4BPP);
      break;
    case 2:
      break;
    case 3:
      LoadBgTiles(2, incbin("gSummaryScreen_Bg_Gfx"), 0, 0);
      break;
    case 4:
    case 5:
    case 6:
      break;
    default:
      LoadPalette(incbin16("sTextMovesPalette"), BG_PLTT_ID(8), PLTT_SIZE_4BPP);
      return true;
  }
  pss.loadBgGfxStep++;
  return false;
}

function PokeSum_HandleCreateSprites(): boolean {
  if (!sMonSummaryScreen) return true;
  const pss = sMonSummaryScreen;

  switch (pss.spriteCreationStep) {
    case 0: CreateShinyStarObj(TAG_PSS_UNK_A0, TAG_PSS_UNK_A0); break;
    case 1: CreatePokerusIconObj(TAG_PSS_UNK_96, TAG_PSS_UNK_96); break;
    case 2: PokeSum_CreateMonMarkingsSprite(); break;
    case 3: CreateMoveSelectionCursorObjs(TAG_PSS_UNK_64, TAG_PSS_UNK_64); break;
    case 4: CreateMonStatusIconObj(TAG_PSS_UNK_6E, TAG_PSS_UNK_6E); break;
    case 5: CreateHpBarObjs(TAG_PSS_UNK_78, TAG_PSS_UNK_78); break;
    case 6: CreateExpBarObjs(TAG_PSS_UNK_82, TAG_PSS_UNK_82); break;
    case 7: CreateBallIconObj(); break;
    case 8: PokeSum_CreateMonIconSprite(); break;
    default:
      PokeSum_CreateMonPicSprite();
      return true;
  }
  pss.spriteCreationStep++;
  return false;
}

function PokeSum_CreateWindows(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  InitWindows([]);
  const perm1 = cdata<WindowTemplate[]>("pokemon_summary_screen", "sWindowTemplates_Permanent_Bg1");
  for (let i = 0; i < 3; i++) {
    pss.windowIds[i] = AddWindow(perm1[i]);
  }

  let pageTemplates: WindowTemplate[];
  switch (pss.curPageIndex) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO:
      pageTemplates = cdata<WindowTemplate[]>("pokemon_summary_screen", "sWindowTemplates_Info");
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS:
      pageTemplates = cdata<WindowTemplate[]>("pokemon_summary_screen", "sWindowTemplates_Skills");
      break;
    default:
      pageTemplates = cdata<WindowTemplate[]>("pokemon_summary_screen", "sWindowTemplates_Moves");
      break;
  }
  for (let i = 0; i < 4; i++) {
    pss.windowIds[i + 3] = AddWindow(pageTemplates[i]);
  }
}

function PokeSum_AddWindows(curPageIndex: number): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  const bgPriority1 = GetGpuReg(REG_OFFSET_BG1CNT) & 3;
  const bgPriority2 = GetGpuReg(REG_OFFSET_BG2CNT) & 3;
  const perm1 = cdata<WindowTemplate[]>("pokemon_summary_screen", "sWindowTemplates_Permanent_Bg1");
  const perm2 = cdata<WindowTemplate[]>("pokemon_summary_screen", "sWindowTemplates_Permanent_Bg2");

  pss.windowIds.fill(0xff);

  const usePerm2 = ((pss.pageFlipDirection === 1 && pss.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO)
    || (pss.pageFlipDirection === 0 && pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES))
    ? bgPriority2 > bgPriority1
    : bgPriority2 <= bgPriority1;

  const perm = usePerm2 ? perm2 : perm1;
  for (let i = 0; i < 3; i++) pss.windowIds[i] = AddWindow(perm[i]);

  let pageTemplates: WindowTemplate[];
  switch (curPageIndex) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO:
      pageTemplates = cdata<WindowTemplate[]>("pokemon_summary_screen", "sWindowTemplates_Info");
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS:
      pageTemplates = cdata<WindowTemplate[]>("pokemon_summary_screen", "sWindowTemplates_Skills");
      break;
    default:
      pageTemplates = cdata<WindowTemplate[]>("pokemon_summary_screen", "sWindowTemplates_Moves");
      break;
  }
  for (let i = 0; i < 4; i++) {
    pss.windowIds[i + 3] = AddWindow(pageTemplates[i]);
  }
}

function PokeSum_RemoveWindows(_curPageIndex: number): void {
  if (!sMonSummaryScreen) return;
  for (let i = 0; i < 7; i++) {
    if (sMonSummaryScreen.windowIds[i] !== 0xff) {
      RemoveWindow(sMonSummaryScreen.windowIds[i]);
      sMonSummaryScreen.windowIds[i] = 0xff;
    }
  }
}

function PokeSum_Setup_BufferStrings(): boolean {
  if (!sMonSummaryScreen) return true;
  const pss = sMonSummaryScreen;

  switch (pss.bufferStringsStep) {
    case 0:
      BufferMonInfo();
      if (pss.isEgg) {
        pss.bufferStringsStep = 0;
        return true;
      }
      break;
    case 1:
      if (!pss.isEgg) BufferMonSkills();
      break;
    case 2:
      if (!pss.isEgg) BufferMonMoves();
      break;
    default:
      pss.bufferStringsStep = 0;
      return true;
  }
  pss.bufferStringsStep++;
  return false;
}

function BufferMonInfo(): void {
  if (!sMonSummaryScreen) return;
  const mon = sMonSummaryScreen.currentMon;
  const sum = sMonSummaryScreen.summary;

  const species = mon.species;
  const dexNum = rom.species[species]?.national ?? 0;
  if (!dexNum) {
    strCopy(sum.dexNumStrBuf, rom.text("gText_PokeSum_DexNoUnknown"));
  } else {
    strCopy(sum.dexNumStrBuf, intToDecimal(dexNum, STR_CONV_MODE_LEADING_ZEROS, 3));
  }

  if (sMonSkillsPrinterXpos) sMonSkillsPrinterXpos.unk00 = 0;

  if (!sMonSummaryScreen.isEgg) {
    strCopy(sum.speciesNameStrBuf, speciesName(species));
  } else {
    strCopy(sum.speciesNameStrBuf, mon.nickname.length ? Uint8Array.from(mon.nickname) : encode("EGG"));
    return;
  }

  sMonSummaryScreen.monTypes[0] = rom.species[species]?.types[0] ?? 0;
  sMonSummaryScreen.monTypes[1] = rom.species[species]?.types[1] ?? sMonSummaryScreen.monTypes[0];

  strCopy(sum.nicknameStrBuf, mon.nickname.length ? Uint8Array.from(mon.nickname) : speciesName(species));

  const gender = GetMonGender(mon);
  if (gender === C.MON_FEMALE) strCopy(sum.genderSymbolStrBuf, rom.text("gText_FemaleSymbol"));
  else if (gender === C.MON_MALE) strCopy(sum.genderSymbolStrBuf, rom.text("gText_MaleSymbol"));
  else strCopy(sum.genderSymbolStrBuf, EOS_ARRAY);

  strCopy(sum.otNameStrBuf, mon.otName.length ? Uint8Array.from(mon.otName) : encode("TRAINER"));
  strCopy(sum.unk306C, intToDecimal(mon.otId & 0xffff, STR_CONV_MODE_LEADING_ZEROS, 5));

  const lvlStr = intToDecimal(mon.level, STR_CONV_MODE_LEFT_ALIGN, 3);
  strCopy(sum.levelStrBuf, rom.text("gText_Lv"));
  strAppend(sum.levelStrBuf, lvlStr);

  if (!mon.heldItem) strCopy(sum.itemNameStrBuf, rom.text("gText_PokeSum_Item_None"));
  else strCopy(sum.itemNameStrBuf, itemName(mon.heldItem));
}

function BufferMonSkills(): void {
  if (!sMonSummaryScreen || !sMonSkillsPrinterXpos) return;
  const mon = sMonSummaryScreen.currentMon;
  const sum = sMonSummaryScreen.summary;
  const xp = sMonSkillsPrinterXpos;

  const maxHp = GetMonData(mon, C.MON_DATA_MAX_HP);
  const hp = GetMonData(mon, C.MON_DATA_HP);
  strCopy(sum.curHpStrBuf, intToDecimal(hp, STR_CONV_MODE_LEFT_ALIGN, 3));
  strAppend(sum.curHpStrBuf, rom.text("gText_Slash"));
  strAppend(sum.curHpStrBuf, intToDecimal(maxHp, STR_CONV_MODE_LEFT_ALIGN, 3));
  xp.curHpStr = GetNumberRightAlign63(sum.curHpStrBuf);

  const stats = [
    GetMonData(mon, C.MON_DATA_ATK),
    GetMonData(mon, C.MON_DATA_DEF),
    GetMonData(mon, C.MON_DATA_SPATK),
    GetMonData(mon, C.MON_DATA_SPDEF),
    GetMonData(mon, C.MON_DATA_SPEED),
  ];
  for (let i = 0; i < 5; i++) {
    strCopy(sum.statValueStrBufs[i], intToDecimal(stats[i], STR_CONV_MODE_LEFT_ALIGN, 3));
  }
  xp.atkStr = GetNumberRightAlign27(sum.statValueStrBufs[PSS_STAT_ATK]);
  xp.defStr = GetNumberRightAlign27(sum.statValueStrBufs[PSS_STAT_DEF]);
  xp.spAStr = GetNumberRightAlign27(sum.statValueStrBufs[PSS_STAT_SPA]);
  xp.spDStr = GetNumberRightAlign27(sum.statValueStrBufs[PSS_STAT_SPD]);
  xp.speStr = GetNumberRightAlign27(sum.statValueStrBufs[PSS_STAT_SPE]);

  strCopy(sum.expPointsStrBuf, intToDecimal(mon.exp, STR_CONV_MODE_LEFT_ALIGN, 7));
  xp.expStr = GetNumberRightAlign63(sum.expPointsStrBuf);

  let expToNextLevel = 0;
  if (mon.level < 100) {
    const table = rom.expTables[rom.species[mon.species]?.growthRate ?? 0];
    expToNextLevel = Math.max(0, (table?.[mon.level + 1] ?? 0) - mon.exp);
  }
  strCopy(sum.expToNextLevelStrBuf, intToDecimal(expToNextLevel, STR_CONV_MODE_LEFT_ALIGN, 7));
  xp.toNextLevel = GetNumberRightAlign63(sum.expToNextLevelStrBuf);

  const abilityNum = mon.abilityNum ?? 0;
  const abilityId = (rom.species[mon.species]?.abilities?.[abilityNum] ?? rom.species[mon.species]?.abilities?.[0]) || 0;
  const abilityNames = cdata<unknown[]>("battle_main", "gAbilityNames");
  const abilityDescPtrs = cdata<unknown[]>("battle_main", "gAbilityDescriptionPointers");
  strCopy(sum.abilityNameStrBuf, (abilityNames[abilityId] as number[]) ? Uint8Array.from(abilityNames[abilityId] as number[]) : encode("-------"));

  const descRef = abilityDescPtrs[abilityId];
  if (descRef && isSym(descRef)) {
    const desc = cdataAny<number[]>(symName(descRef)!);
    strCopy(sum.abilityDescStrBuf, desc ? Uint8Array.from(desc) : EOS_ARRAY);
  } else {
    strCopy(sum.abilityDescStrBuf, EOS_ARRAY);
  }

  sMonSummaryScreen.curMonStatusAilment = StatusToAilment(mon);
}

function BufferMonMoves(): void {
  if (!sMonSummaryScreen) return;
  sMonSummaryScreen.numMoves = 0;
  for (let i = 0; i < 4; i++) BufferMonMoveI(i);
  if (sMonSummaryScreen.mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE) BufferMonMoveI(4);
}

function BufferMonMoveI(i: number): void {
  if (!sMonSummaryScreen || !sMonSkillsPrinterXpos) return;
  const pss = sMonSummaryScreen;
  const mon = pss.currentMon;
  const sum = pss.summary;
  const xp = sMonSkillsPrinterXpos;

  if (i < 4) {
    pss.moveIds[i] = GetMonMoveBySlotId(mon, i);
  }

  const moveId = pss.moveIds[i];
  if (!moveId) {
    strCopy(sum.moveNameStrBufs[i], rom.text("gText_PokeSum_OneHyphen"));
    strCopy(sum.moveCurPpStrBufs[i], rom.text("gText_PokeSum_TwoHyphens"));
    strCopy(sum.movePowerStrBufs[i], rom.text("gText_ThreeHyphens"));
    strCopy(sum.moveAccuracyStrBufs[i], rom.text("gText_ThreeHyphens"));
    xp.curPp[i] = 0xff;
    xp.maxPp[i] = 0xff;
    return;
  }

  pss.numMoves++;
  pss.moveTypes[i] = rom.moves[moveId]?.type ?? 0;
  strCopy(sum.moveNameStrBufs[i], rom.moveName(moveId));

  const basePP = rom.moves[moveId]?.pp ?? 0;
  let curPP = i < 4 ? GetMonPpByMoveSlot(mon, i) : basePP;
  let maxPP = CalculatePPWithBonus(moveId, mon.ppBonuses, i);
  if (i >= 4 && pss.mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE) {
    curPP = basePP;
    maxPP = basePP;
  }

  strCopy(sum.moveCurPpStrBufs[i], intToDecimal(curPP, STR_CONV_MODE_LEFT_ALIGN, 3));
  strCopy(sum.moveMaxPpStrBufs[i], intToDecimal(maxPP, STR_CONV_MODE_LEFT_ALIGN, 3));
  xp.curPp[i] = GetRightAlignXpos_NDigits(2, sum.moveCurPpStrBufs[i]);
  xp.maxPp[i] = GetRightAlignXpos_NDigits(2, sum.moveMaxPpStrBufs[i]);

  const power = rom.moves[moveId]?.power ?? 0;
  if (power <= 1) strCopy(sum.movePowerStrBufs[i], rom.text("gText_ThreeHyphens"));
  else strCopy(sum.movePowerStrBufs[i], intToDecimal(power, STR_CONV_MODE_RIGHT_ALIGN, 3));

  const accuracy = rom.moves[moveId]?.accuracy ?? 0;
  if (!accuracy) strCopy(sum.moveAccuracyStrBufs[i], rom.text("gText_ThreeHyphens"));
  else strCopy(sum.moveAccuracyStrBufs[i], intToDecimal(accuracy, STR_CONV_MODE_RIGHT_ALIGN, 3));
}

function StatusToAilment(mon: Pokemon): number {
  if (mon.hp === 0) return AILMENT_FNT;
  const st = mon.status;
  if (st & C.STATUS1_PSN_ANY) return AILMENT_PSN;
  if (st & C.STATUS1_PARALYSIS) return AILMENT_PRZ;
  if (st & C.STATUS1_SLEEP) return AILMENT_SLP;
  if (st & C.STATUS1_FREEZE) return AILMENT_FRZ;
  if (st & C.STATUS1_BURN) return AILMENT_BRN;
  if (CheckPartyPokerus(mon, 0)) return AILMENT_PKRS;
  return AILMENT_NONE;
}

function PokeSum_FinishSetup(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  if (pss.mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE || pss.mode === PokemonSummaryScreenMode.PSS_MODE_FORGET_MOVE) {
    pss.inputHandlerTaskId = tasks.create(Task_InputHandler_SelectOrForgetMove, 0);
  } else {
    pss.inputHandlerTaskId = tasks.create(Task_InputHandler_Info, 0);
  }

  SetMainCallback2(CB2_RunPokemonSummaryScreen);
}

function CommitStaticWindowTilemaps(): void {
  if (!sMonSummaryScreen) return;
  PutWindowTilemap(sMonSummaryScreen.windowIds[POKESUM_WIN_PAGE_NAME]);
  PutWindowTilemap(sMonSummaryScreen.windowIds[POKESUM_WIN_CONTROLS]);
  PutWindowTilemap(sMonSummaryScreen.windowIds[POKESUM_WIN_LVL_NICK]);
}

// ---------------------------------------------------------------- text rendering routines

function PokeSum_PrintPageName(str: Uint8Array): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_PAGE_NAME];
  FillWindowPixelBuffer(win, 0);
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");
  AddTextPrinterParameterized3(win, FONT_NORMAL, 4, 1, colors[1], 0, str);
  PutWindowTilemap(win);
}

function PokeSum_PrintControlsString(str: Uint8Array): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_CONTROLS];
  FillWindowPixelBuffer(win, 0);
  const width = GetStringWidth(FONT_SMALL, str, 0);
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");
  AddTextPrinterParameterized3(win, FONT_SMALL, 0x54 - width, 0, colors[1], 0, str);
  PutWindowTilemap(win);
}

function PrintMonLevelNickOnWindow2(): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_LVL_NICK];
  FillWindowPixelBuffer(win, 0);
  const pss = sMonSummaryScreen;
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");

  if (!pss.isEgg) {
    if (pss.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
      AddTextPrinterParameterized3(win, FONT_NORMAL, 4, 2, colors[1], TEXT_SKIP_DRAW, pss.summary.levelStrBuf);
    }
    AddTextPrinterParameterized3(win, FONT_NORMAL, 40, 2, colors[1], TEXT_SKIP_DRAW, pss.summary.nicknameStrBuf);
    const gender = GetMonGender(pss.currentMon);
    const gCol = gender === C.MON_FEMALE ? colors[3] : colors[2];
    AddTextPrinterParameterized3(win, FONT_NORMAL, 105, 2, gCol, 0, pss.summary.genderSymbolStrBuf);
  }
  PutWindowTilemap(win);
}

function PokeSum_PrintPageHeaderText(curPageIndex: number): void {
  switch (curPageIndex) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO:
      PokeSum_PrintPageName(rom.text("gText_PokeSum_PageName_PokemonInfo"));
      if (!sMonSummaryScreen?.isEgg) PokeSum_PrintControlsString(rom.text("gText_PokeSum_Controls_PageCancel"));
      else PokeSum_PrintControlsString(rom.text("gText_PokeSum_Controls_Cancel"));
      PrintMonLevelNickOnWindow2();
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS:
      PokeSum_PrintPageName(rom.text("gText_PokeSum_PageName_PokemonSkills"));
      PokeSum_PrintControlsString(rom.text("gText_PokeSum_Controls_Page"));
      PrintMonLevelNickOnWindow2();
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES:
      PokeSum_PrintPageName(rom.text("gText_PokeSum_PageName_KnownMoves"));
      PokeSum_PrintControlsString(rom.text("gText_PokeSum_Controls_PageDetail"));
      PrintMonLevelNickOnWindow2();
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO:
      PokeSum_PrintPageName(rom.text("gText_PokeSum_PageName_KnownMoves"));
      PokeSum_PrintControlsString(rom.text("gText_PokeSum_Controls_PickSwitch"));
      PrintMonLevelNickOnWindow2();
      break;
  }
}

function PokeSum_PrintRightPaneText(): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_RIGHT_PANE];
  FillWindowPixelBuffer(win, 0);

  switch (sMonSummaryScreen.curPageIndex) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO: PrintInfoPage(); break;
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS: PrintSkillsPage(); break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES:
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO:
      PrintMovesPage(); break;
  }
  PutWindowTilemap(win);
}

function PrintInfoPage(): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_RIGHT_PANE];
  const pss = sMonSummaryScreen;
  const sum = pss.summary;
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");

  AddTextPrinterParameterized3(win, FONT_NORMAL, 47, 19, colors[0], TEXT_SKIP_DRAW, sum.speciesNameStrBuf);

  if (!pss.isEgg) {
    AddTextPrinterParameterized3(win, FONT_NORMAL, 47 + (sMonSkillsPrinterXpos?.unk00 ?? 0), 5, colors[0], TEXT_SKIP_DRAW, sum.dexNumStrBuf);
    AddTextPrinterParameterized3(win, FONT_NORMAL, 47, 49, colors[0], TEXT_SKIP_DRAW, sum.otNameStrBuf);
    AddTextPrinterParameterized3(win, FONT_NORMAL, 47, 64, colors[0], TEXT_SKIP_DRAW, sum.unk306C);
    AddTextPrinterParameterized3(win, FONT_NORMAL, 47, 79, colors[0], TEXT_SKIP_DRAW, sum.itemNameStrBuf);
  } else {
    const eggCycles = pss.currentMon.friendship ?? 70;
    let hatchMsgIndex = 0;
    if (eggCycles <= 5) hatchMsgIndex = 3;
    else if (eggCycles <= 10) hatchMsgIndex = 2;
    else if (eggCycles <= 40) hatchMsgIndex = 1;
    const hatchRefs = cdata<unknown[]>("pokemon_summary_screen", "sEggHatchTimeTexts");
    AddTextPrinterParameterized3(win, FONT_NORMAL, 7, 45, colors[0], TEXT_SKIP_DRAW, resolveText(hatchRefs[hatchMsgIndex]));
  }
}

function PrintSkillsPage(): void {
  if (!sMonSummaryScreen || !sMonSkillsPrinterXpos) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_RIGHT_PANE];
  const sum = sMonSummaryScreen.summary;
  const xp = sMonSkillsPrinterXpos;
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");

  AddTextPrinterParameterized3(win, FONT_NORMAL, 14 + xp.curHpStr, 4, colors[0], TEXT_SKIP_DRAW, sum.curHpStrBuf);
  AddTextPrinterParameterized3(win, FONT_NORMAL, 50 + xp.atkStr, 22, colors[0], TEXT_SKIP_DRAW, sum.statValueStrBufs[PSS_STAT_ATK]);
  AddTextPrinterParameterized3(win, FONT_NORMAL, 50 + xp.defStr, 35, colors[0], TEXT_SKIP_DRAW, sum.statValueStrBufs[PSS_STAT_DEF]);
  AddTextPrinterParameterized3(win, FONT_NORMAL, 50 + xp.spAStr, 48, colors[0], TEXT_SKIP_DRAW, sum.statValueStrBufs[PSS_STAT_SPA]);
  AddTextPrinterParameterized3(win, FONT_NORMAL, 50 + xp.spDStr, 61, colors[0], TEXT_SKIP_DRAW, sum.statValueStrBufs[PSS_STAT_SPD]);
  AddTextPrinterParameterized3(win, FONT_NORMAL, 50 + xp.speStr, 74, colors[0], TEXT_SKIP_DRAW, sum.statValueStrBufs[PSS_STAT_SPE]);
  AddTextPrinterParameterized3(win, FONT_NORMAL, 15 + xp.expStr, 87, colors[0], TEXT_SKIP_DRAW, sum.expPointsStrBuf);
  AddTextPrinterParameterized3(win, FONT_NORMAL, 15 + xp.toNextLevel, 100, colors[0], TEXT_SKIP_DRAW, sum.expToNextLevelStrBuf);
}

function PrintMovesPage(): void {
  if (!sMonSummaryScreen) return;
  for (let i = 0; i < 4; i++) PokeSum_PrintMoveName(i);

  if (sMonSummaryScreen.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
    if (sMonSummaryScreen.mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE) {
      PokeSum_PrintMoveName(4);
    } else {
      const colors = cdata<number[][]>("pokemon_summary_screen", "sPrintMoveTextColors");
      AddTextPrinterParameterized3(
        sMonSummaryScreen.windowIds[POKESUM_WIN_RIGHT_PANE], FONT_NORMAL, 3, GetMoveNamePrinterYpos(4),
        colors[0], TEXT_SKIP_DRAW, rom.text("gFameCheckerText_Cancel"),
      );
    }
  }
}

function PokeSum_PrintMoveName(i: number): void {
  if (!sMonSummaryScreen || !sMonSkillsPrinterXpos) return;
  const pss = sMonSummaryScreen;
  const win = pss.windowIds[POKESUM_WIN_RIGHT_PANE];
  const colors = cdata<number[][]>("pokemon_summary_screen", "sPrintMoveTextColors");
  const move = pss.moveIds[i];

  AddTextPrinterParameterized3(win, FONT_NORMAL, 3, GetMoveNamePrinterYpos(i), colors[0], TEXT_SKIP_DRAW, pss.summary.moveNameStrBufs[i]);

  const maxPP = CalculatePPWithBonus(move, pss.currentMon.ppBonuses, i);
  let curPP = i === 4 ? maxPP : (pss.currentMon.pp[i] ?? maxPP);

  let colorIdx = 0;
  if (!move || curPP === maxPP) colorIdx = 0;
  else if (curPP === 0) colorIdx = 3;
  else if (curPP <= Math.floor(maxPP / 4)) colorIdx = 2;
  else if (curPP <= Math.floor(maxPP / 2)) colorIdx = 1;

  AddTextPrinterParameterized3(win, FONT_NORMAL, 36, GetMovePpPrinterYpos(i), colors[colorIdx], TEXT_SKIP_DRAW, rom.text("gText_PokeSum_PP"));
  AddTextPrinterParameterized3(win, FONT_NORMAL, 46 + sMonSkillsPrinterXpos.curPp[i], GetMovePpPrinterYpos(i), colors[colorIdx], TEXT_SKIP_DRAW, pss.summary.moveCurPpStrBufs[i]);

  if (move) {
    AddTextPrinterParameterized3(win, FONT_NORMAL, 58, GetMovePpPrinterYpos(i), colors[colorIdx], TEXT_SKIP_DRAW, rom.text("gText_Slash"));
    AddTextPrinterParameterized3(win, FONT_NORMAL, 64 + sMonSkillsPrinterXpos.maxPp[i], GetMovePpPrinterYpos(i), colors[colorIdx], TEXT_SKIP_DRAW, pss.summary.moveMaxPpStrBufs[i]);
  }
}

function PokeSum_PrintBottomPaneText(): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_TRAINER_MEMO];
  FillWindowPixelBuffer(win, 0);

  switch (sMonSummaryScreen.curPageIndex) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO: PokeSum_PrintTrainerMemo(); break;
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS: PokeSum_PrintExpPoints_NextLv(); break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO: PokeSum_PrintSelectedMoveStats(); break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES: break;
  }
  PutWindowTilemap(win);
}

function PokeSum_PrintTrainerMemo(): void {
  if (!sMonSummaryScreen) return;
  if (!sMonSummaryScreen.isEgg) PokeSum_PrintTrainerMemo_Mon();
  else PokeSum_PrintTrainerMemo_Egg();
}

function PokeSum_PrintTrainerMemo_Mon(): void {
  if (!sMonSummaryScreen) return;
  const mon = sMonSummaryScreen.currentMon;
  if (PokeSum_BufferOtName_IsEqualToCurrentOwner(mon)) PokeSum_PrintTrainerMemo_Mon_HeldByOT();
  else PokeSum_PrintTrainerMemo_Mon_NotHeldByOT();
}

/** PokeSum_BufferOtName_IsEqualToCurrentOwner (pokemon_summary_screen.c). */
function PokeSum_BufferOtName_IsEqualToCurrentOwner(mon: Mon): boolean {
  const summary = sMonSummaryScreen!.summary;
  const ownerName = save.playerName;
  StringCopy(summary.otNameStrBufs[0], ownerName);
  StringCopy(summary.otNameStrBufs[1], mon.otName);
  return (save.trainerId & 0xffff) === (GetMonData(mon, C.MON_DATA_OT_ID) & 0xffff)
    && StringCompareWithoutExtCtrlCodes(summary.otNameStrBufs[0], summary.otNameStrBufs[1]) === 0;
}

/** PokeSum_IsMonBoldOrGentle (pokemon_summary_screen.c). */
function PokeSum_IsMonBoldOrGentle(nature: number): boolean {
  return nature === C.NATURE_BOLD || nature === C.NATURE_GENTLE;
}

/** CurrentMonIsFromGBA (pokemon_summary_screen.c). */
function CurrentMonIsFromGBA(): boolean {
  const version = GetMonData(sMonSummaryScreen!.currentMon, C.MON_DATA_MET_GAME);
  return version === C.VERSION_LEAF_GREEN || version === C.VERSION_FIRE_RED || version === C.VERSION_RUBY
    || version === C.VERSION_SAPPHIRE || version === C.VERSION_EMERALD;
}

/** MapSecIsInKantoOrSevii (pokemon_summary_screen.c). */
function MapSecIsInKantoOrSevii(mapSec: number): boolean {
  return mapSec >= C.KANTO_MAPSEC_START && mapSec < C.MAPSEC_NONE;
}

/** PokeSum_PrintTrainerMemo_Mon_HeldByOT (pokemon_summary_screen.c). */
function PokeSum_PrintTrainerMemo_Mon_HeldByOT(): void {
  if (!sMonSummaryScreen) return;
  const mon = sMonSummaryScreen.currentMon;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_TRAINER_MEMO];
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");

  DynamicPlaceholderTextUtil_Reset();
  const nature = (mon.personality >>> 0) % 25;
  const natureNames = cdata<unknown[]>("pokemon_summary_screen", "gNatureNamePointers");
  DynamicPlaceholderTextUtil_SetPlaceholderPtr(0, resolveText(natureNames[nature]));

  const metLevel = GetMonData(mon, C.MON_DATA_MET_LEVEL) || 5;
  DynamicPlaceholderTextUtil_SetPlaceholderPtr(1, intToDecimal(metLevel, STR_CONV_MODE_LEFT_ALIGN, 3));

  const metLoc = GetMonData(mon, C.MON_DATA_MET_LOCATION);
  const mapName = MapSecIsInKantoOrSevii(metLoc) ? getMapNameGenericBytes(metLoc)
    : (sMonSummaryScreen.isEnemyParty ? rom.text("gText_Somewhere") : rom.text("gText_PokeSum_ATrade"));
  DynamicPlaceholderTextUtil_SetPlaceholderPtr(2, mapName);

  const metLevelRaw = GetMonData(mon, C.MON_DATA_MET_LEVEL);
  const fateful = metLoc === C.METLOC_FATEFUL_ENCOUNTER;
  const modernFateful = GetMonData(mon, C.MON_DATA_MODERN_FATEFUL_ENCOUNTER) === 1;
  let template: string;
  if (metLevelRaw === 0) {
    if (modernFateful) template = PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_FatefulEncounterHatched_BoldGentleGrammar" : "gText_PokeSum_FatefulEncounterHatched";
    else template = PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_Hatched_BoldGentleGrammar" : "gText_PokeSum_Hatched";
  } else if (fateful) {
    template = PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_FatefulEncounterMet_BoldGentleGrammar" : "gText_PokeSum_FatefulEncounterMet";
  } else {
    template = PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_Met_BoldGentleGrammar" : "gText_PokeSum_Met";
  }
  AddTextPrinterParameterized4(win, FONT_NORMAL, 0, 3, 0, 0, colors[0], TEXT_SKIP_DRAW, DynamicPlaceholderTextUtil_ExpandPlaceholders(rom.text(template)));
}

/** PokeSum_PrintTrainerMemo_Mon_NotHeldByOT (pokemon_summary_screen.c). */
function PokeSum_PrintTrainerMemo_Mon_NotHeldByOT(): void {
  if (!sMonSummaryScreen) return;
  const mon = sMonSummaryScreen.currentMon;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_TRAINER_MEMO];
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");
  DynamicPlaceholderTextUtil_Reset();
  const nature = (mon.personality >>> 0) % 25;
  const natureNames = cdata<unknown[]>("pokemon_summary_screen", "gNatureNamePointers");
  DynamicPlaceholderTextUtil_SetPlaceholderPtr(0, resolveText(natureNames[nature]));
  const metLevel = GetMonData(mon, C.MON_DATA_MET_LEVEL);
  DynamicPlaceholderTextUtil_SetPlaceholderPtr(1, intToDecimal(metLevel || 5, STR_CONV_MODE_LEFT_ALIGN, 3));
  const metLoc = GetMonData(mon, C.MON_DATA_MET_LOCATION);
  const fateful = metLoc === C.METLOC_FATEFUL_ENCOUNTER;
  const fromForeignOrigin = !MapSecIsInKantoOrSevii(metLoc) || !CurrentMonIsFromGBA();
  if (fromForeignOrigin) {
    const template = fateful
      ? (PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_FatefulEncounterMet_BoldGentleGrammar" : "gText_PokeSum_FatefulEncounterMet")
      : (PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_MetInATrade_BoldGentleGrammar" : "gText_PokeSum_MetInATrade");
    AddTextPrinterParameterized4(win, FONT_NORMAL, 0, 3, 0, 0, colors[0], TEXT_SKIP_DRAW, DynamicPlaceholderTextUtil_ExpandPlaceholders(rom.text(template)));
    return;
  }

  const mapName = MapSecIsInKantoOrSevii(metLoc) ? getMapNameGenericBytes(metLoc) : rom.text("gText_PokeSum_ATrade");
  DynamicPlaceholderTextUtil_SetPlaceholderPtr(2, mapName);
  const modernFateful = GetMonData(mon, C.MON_DATA_MODERN_FATEFUL_ENCOUNTER) === 1;
  let template: string;
  if (metLevel === 0) {
    if (modernFateful) template = PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_ApparentlyFatefulEncounterHatched_BoldGentleGrammar" : "gText_PokeSum_ApparentlyFatefulEncounterHatched";
    else template = PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_ApparentlyMet_BoldGentleGrammar" : "gText_PokeSum_ApparentlyMet";
  } else if (fateful) {
    template = PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_FatefulEncounterMet_BoldGentleGrammar" : "gText_PokeSum_FatefulEncounterMet";
  } else {
    template = PokeSum_IsMonBoldOrGentle(nature) ? "gText_PokeSum_ApparentlyMet_BoldGentleGrammar" : "gText_PokeSum_ApparentlyMet";
  }
  AddTextPrinterParameterized4(win, FONT_NORMAL, 0, 3, 0, 0, colors[0], TEXT_SKIP_DRAW, DynamicPlaceholderTextUtil_ExpandPlaceholders(rom.text(template)));
}

function PokeSum_PrintTrainerMemo_Egg(): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_TRAINER_MEMO];
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");
  const eggOriginTexts = cdata<unknown[]>("pokemon_summary_screen", "sEggOriginTexts");
  const originStr = resolveText(eggOriginTexts[0]);
  AddTextPrinterParameterized4(win, FONT_NORMAL, 0, 3, 0, 0, colors[0], TEXT_SKIP_DRAW, originStr);
}

function PokeSum_PrintExpPoints_NextLv(): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_TRAINER_MEMO];
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");
  AddTextPrinterParameterized3(win, FONT_NORMAL, 26, 7, colors[0], TEXT_SKIP_DRAW, rom.text("gText_PokeSum_ExpPoints"));
  AddTextPrinterParameterized3(win, FONT_NORMAL, 26, 20, colors[0], TEXT_SKIP_DRAW, rom.text("gText_PokeSum_NextLv"));
}

function PokeSum_PrintSelectedMoveStats(): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[POKESUM_WIN_TRAINER_MEMO];
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");
  const slot = sMoveSelectionCursorPos;

  if (slot < 5) {
    if (sMonSummaryScreen.mode !== PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE && slot === 4) return;
    const move = sMonSummaryScreen.moveIds[slot];
    if (!move) return;

    AddTextPrinterParameterized3(win, FONT_NORMAL, 57, 1, colors[0], TEXT_SKIP_DRAW, sMonSummaryScreen.summary.movePowerStrBufs[slot]);
    AddTextPrinterParameterized3(win, FONT_NORMAL, 57, 15, colors[0], TEXT_SKIP_DRAW, sMonSummaryScreen.summary.moveAccuracyStrBufs[slot]);

    const descPtrs = cdata<unknown[]>("move_descriptions", "gMoveDescriptionPointers");
    const descRef = descPtrs[move - 1];
    let descBytes: Uint8Array;
    if (descRef && isSym(descRef)) {
      descBytes = resolveText(descRef);
    } else {
      descBytes = EOS_ARRAY;
    }
    AddTextPrinterParameterized4(win, FONT_NORMAL, 7, 42, 0, 0, colors[0], TEXT_SKIP_DRAW, descBytes);
  }
}

function PokeSum_PrintAbilityDataOrMoveTypes(): void {
  if (!sMonSummaryScreen) return;
  switch (sMonSummaryScreen.curPageIndex) {
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS: PokeSum_PrintAbilityNameAndDesc(); break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES:
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO:
      PokeSum_DrawMoveTypeIcons(); break;
  }
  PutWindowTilemap(sMonSummaryScreen.windowIds[5]);
}

function PokeSum_PrintAbilityNameAndDesc(): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[5];
  FillWindowPixelBuffer(win, 0);
  const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");
  AddTextPrinterParameterized3(win, FONT_NORMAL, 66, 1, colors[0], TEXT_SKIP_DRAW, sMonSummaryScreen.summary.abilityNameStrBuf);
  AddTextPrinterParameterized3(win, FONT_NORMAL, 2, 15, colors[0], TEXT_SKIP_DRAW, sMonSummaryScreen.summary.abilityDescStrBuf);
}

function PokeSum_DrawMoveTypeIcons(): void {
  if (!sMonSummaryScreen) return;
  const win = sMonSummaryScreen.windowIds[5];
  FillWindowPixelBuffer(win, 0);
  for (let i = 0; i < 4; i++) {
    if (!sMonSummaryScreen.moveIds[i]) continue;
    BlitMenuInfoIcon(win, sMonSummaryScreen.moveTypes[i] + 1, 3, GetMoveNamePrinterYpos(i));
  }
  if (sMonSummaryScreen.mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE) {
    BlitMenuInfoIcon(win, sMonSummaryScreen.moveTypes[4] + 1, 3, GetMoveNamePrinterYpos(4));
  }
}

function PokeSum_PrintMonTypeIcons(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  switch (pss.curPageIndex) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO:
      if (!pss.isEgg) {
        BlitMenuInfoIcon(pss.windowIds[POKESUM_WIN_RIGHT_PANE], pss.monTypes[0] + 1, 47, 35);
        if (pss.monTypes[0] !== pss.monTypes[1]) {
          BlitMenuInfoIcon(pss.windowIds[POKESUM_WIN_RIGHT_PANE], pss.monTypes[1] + 1, 83, 35);
        }
      }
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO: {
      const win = pss.windowIds[6];
      FillWindowPixelBuffer(win, 0);
      BlitMenuInfoIcon(win, pss.monTypes[0] + 1, 0, 3);
      if (pss.monTypes[0] !== pss.monTypes[1]) {
        BlitMenuInfoIcon(win, pss.monTypes[1] + 1, 36, 3);
      }
      PutWindowTilemap(win);
      break;
    }
  }
}

function PokeSum_DrawPageProgressTiles(): void {
  if (!sMonSummaryScreen) return;
  const page = sMonSummaryScreen.curPageIndex;
  const isEgg = sMonSummaryScreen.isEgg;

  switch (page) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO:
      if (!isEgg) {
        FillBgTilemapBufferRect(3, 17 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 33 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 16 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 32 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 18 + PAGE_PROGRESS_BASE_TILE_NUM, 15, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 34 + PAGE_PROGRESS_BASE_TILE_NUM, 15, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 20 + PAGE_PROGRESS_BASE_TILE_NUM, 16, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 36 + PAGE_PROGRESS_BASE_TILE_NUM, 16, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 18 + PAGE_PROGRESS_BASE_TILE_NUM, 17, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 34 + PAGE_PROGRESS_BASE_TILE_NUM, 17, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 21 + PAGE_PROGRESS_BASE_TILE_NUM, 18, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 37 + PAGE_PROGRESS_BASE_TILE_NUM, 18, 1, 1, 1, 0);
      } else {
        FillBgTilemapBufferRect(3, 17 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 33 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 48 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 64 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 2 + PAGE_PROGRESS_BASE_TILE_NUM, 15, 0, 4, 2, 0);
      }
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS:
      FillBgTilemapBufferRect(3, 49 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 65 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 1 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 19 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 17 + PAGE_PROGRESS_BASE_TILE_NUM, 15, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 33 + PAGE_PROGRESS_BASE_TILE_NUM, 15, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 16 + PAGE_PROGRESS_BASE_TILE_NUM, 16, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 32 + PAGE_PROGRESS_BASE_TILE_NUM, 16, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 18 + PAGE_PROGRESS_BASE_TILE_NUM, 17, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 34 + PAGE_PROGRESS_BASE_TILE_NUM, 17, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 21 + PAGE_PROGRESS_BASE_TILE_NUM, 18, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 37 + PAGE_PROGRESS_BASE_TILE_NUM, 18, 1, 1, 1, 0);
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES:
      FillBgTilemapBufferRect(3, 49 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 65 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 1 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 19 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 49 + PAGE_PROGRESS_BASE_TILE_NUM, 15, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 65 + PAGE_PROGRESS_BASE_TILE_NUM, 15, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 1 + PAGE_PROGRESS_BASE_TILE_NUM, 16, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 19 + PAGE_PROGRESS_BASE_TILE_NUM, 16, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 17 + PAGE_PROGRESS_BASE_TILE_NUM, 17, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 33 + PAGE_PROGRESS_BASE_TILE_NUM, 17, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 48 + PAGE_PROGRESS_BASE_TILE_NUM, 18, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 64 + PAGE_PROGRESS_BASE_TILE_NUM, 18, 1, 1, 1, 0);
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO:
      if (sMonSummaryScreen.mode === PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE) {
        FillBgTilemapBufferRect(3, 1 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 0, 4, 1, 0);
        FillBgTilemapBufferRect(3, 19 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 1, 4, 1, 0);
      } else {
        FillBgTilemapBufferRect(3, 49 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 65 + PAGE_PROGRESS_BASE_TILE_NUM, 13, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 1 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 19 + PAGE_PROGRESS_BASE_TILE_NUM, 14, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 49 + PAGE_PROGRESS_BASE_TILE_NUM, 15, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 65 + PAGE_PROGRESS_BASE_TILE_NUM, 15, 1, 1, 1, 0);
        FillBgTilemapBufferRect(3, 1 + PAGE_PROGRESS_BASE_TILE_NUM, 16, 0, 1, 1, 0);
        FillBgTilemapBufferRect(3, 19 + PAGE_PROGRESS_BASE_TILE_NUM, 16, 1, 1, 1, 0);
      }
      FillBgTilemapBufferRect(3, 50 + PAGE_PROGRESS_BASE_TILE_NUM, 17, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 66 + PAGE_PROGRESS_BASE_TILE_NUM, 17, 1, 1, 1, 0);
      FillBgTilemapBufferRect(3, 48 + PAGE_PROGRESS_BASE_TILE_NUM, 18, 0, 1, 1, 0);
      FillBgTilemapBufferRect(3, 64 + PAGE_PROGRESS_BASE_TILE_NUM, 18, 1, 1, 1, 0);
      break;
  }
}

// ---------------------------------------------------------------- sprite management

function PokeSum_CreateMonPicSprite(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  const mon = pss.currentMon;

  sMonPicBounceState = { animFrame: 0, initDelay: 0, vigor: 0 };
  const species = mon.species;

  const picBuffer = new Uint8Array(2048);
  LoadSpecialPokePic(true, picBuffer, species, mon.personality, true);

  const pal = GetMonSpritePalFromSpeciesAndPersonality(species, mon.otId, mon.personality);
  LoadPalette(pal, OBJ_PLTT_ID(12), PLTT_SIZE_4BPP);

  FreeSpriteTilesByTag(TAG_PSS_MON_PIC);
  LoadSpriteSheet({ data: picBuffer, size: 2048, tag: TAG_PSS_MON_PIC });

  const template: SpriteTemplate = {
    tileTag: TAG_PSS_MON_PIC,
    paletteTag: TAG_NONE,
    oam: oamData({
      affineMode: ST_OAM_AFFINE_OFF,
      objMode: ST_OAM_OBJ_NORMAL,
      mosaic: 0,
      bpp: ST_OAM_4BPP,
      shape: SPRITE_SHAPE("64x64"),
      size: SPRITE_SIZE("64x64"),
      priority: 0,
      paletteNum: 12,
    }),
    anims: gDummySpriteAnimTable,
    images: null,
    affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallbackDummy,
  };

  const spriteId = CreateSprite(template, 60, 65, 0);
  const noFlip = IsMonSpriteNotFlipped(species);
  gSprites[spriteId].hFlip = noFlip ? 0 : 1;
  pss.monPicSpriteId = spriteId;

  PokeSum_ShowOrHideMonPicSprite(true);
  PokeSum_SetMonPicSpriteCallback(spriteId);
}

function PokeSum_SetMonPicSpriteCallback(spriteId: number): void {
  if (!sMonSummaryScreen || !sMonPicBounceState) return;
  const pss = sMonSummaryScreen;
  pss.numMonPicBounces = 0;

  if (pss.isEgg) {
    const cycles = pss.currentMon.friendship ?? 70;
    if (cycles <= 5) sMonPicBounceState.vigor = 2;
    else if (cycles <= 10) sMonPicBounceState.vigor = 1;
    else sMonPicBounceState.vigor = 0;
    gSprites[spriteId].callback = SpriteCB_PokeSum_EggPicShake;
    return;
  }

  if (pss.curMonStatusAilment !== AILMENT_NONE && pss.curMonStatusAilment !== AILMENT_PKRS) {
    if (pss.curMonStatusAilment === AILMENT_FNT) return;
    gSprites[spriteId].callback = SpriteCB_MonPicDummy;
    return;
  }

  const curHp = pss.currentMon.hp;
  const maxHp = GetMonData(pss.currentMon, C.MON_DATA_MAX_HP);
  if (curHp === maxHp) sMonPicBounceState.vigor = 3;
  else if (maxHp * 0.8 <= curHp) sMonPicBounceState.vigor = 2;
  else if (maxHp * 0.6 <= curHp) sMonPicBounceState.vigor = 1;
  else sMonPicBounceState.vigor = 0;

  gSprites[spriteId].callback = SpriteCB_PokeSum_MonPicSprite;
}

/** SpriteCB_MonPicDummy (pokemon_summary_screen.c): the settled portrait is not animated. */
function SpriteCB_MonPicDummy(_sprite: Sprite): void {}

function SpriteCB_PokeSum_MonPicSprite(sprite: Sprite): void {
  if (!sMonSummaryScreen || !sMonPicBounceState) return;
  if (sMonSummaryScreen.numMonPicBounces >= 2) return;

  const yDeltas = [
    [-1, 0, 1],
    [-2, -1, 0, 1, 2],
    [-3, -2, -1, 0, 1, 2, 3],
    [-5, -3, -1, 0, 1, 3, 5],
  ];

  if (sMonPicBounceState.initDelay++ >= 2) {
    const arr = yDeltas[sMonPicBounceState.vigor] ?? yDeltas[3];
    sprite.y += arr[sMonPicBounceState.animFrame++];
    if (sMonPicBounceState.animFrame >= arr.length) {
      sMonPicBounceState.animFrame = 0;
      sMonSummaryScreen.numMonPicBounces++;
    }
    sMonPicBounceState.initDelay = 0;
  }
}

function SpriteCB_PokeSum_EggPicShake(sprite: Sprite): void {
  if (!sMonSummaryScreen || !sMonPicBounceState) return;
  if (sMonSummaryScreen.numMonPicBounces >= 2) return;

  const shakes = [
    { delay: 120, arr: [1, 1, 0, -1, -1, 0, -1, -1, 0, 1, 1] },
    { delay: 90, arr: [2, 1, 0, -1, -2, 0, -2, -1, 0, 1, 2] },
    { delay: 60, arr: [2, 1, 1, 0, -1, -1, -2, 0, -2, -1, -1, 0, 1, 1, 2] },
  ];
  const s = shakes[sMonPicBounceState.vigor] ?? shakes[0];

  if (sMonPicBounceState.initDelay++ >= s.delay) {
    sprite.x += s.arr[sMonPicBounceState.animFrame];
    if (++sMonPicBounceState.animFrame >= s.arr.length) {
      sMonPicBounceState.animFrame = 0;
      sMonPicBounceState.initDelay = 0;
      sMonSummaryScreen.numMonPicBounces++;
    }
  }
}

function PokeSum_ShowOrHideMonPicSprite(invisible: boolean): void {
  if (sMonSummaryScreen && gSprites[sMonSummaryScreen.monPicSpriteId]) {
    gSprites[sMonSummaryScreen.monPicSpriteId].invisible = invisible;
  }
}

function PokeSum_DestroyMonPicSprite(): void {
  if (sMonSummaryScreen && gSprites[sMonSummaryScreen.monPicSpriteId]) {
    DestroySpriteAndFreeResources(gSprites[sMonSummaryScreen.monPicSpriteId]);
    FreeSpriteTilesByTag(TAG_PSS_MON_PIC);
  }
  sMonPicBounceState = null;
}

function CreateBallIconObj(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  const ballItemId = !pss.isEgg ? (pss.currentMon.pokeball || C.ITEM_POKE_BALL) : C.ITEM_POKE_BALL;
  const ballId = ItemIdToBallId(ballItemId);

  LoadBallGfx(ballId);
  pss.ballIconSpriteId = CreateSprite(gBallSpriteTemplates()[ballId], 106, 88, 0);
  gSprites[pss.ballIconSpriteId].callback = SpriteCallbackDummy;
  gSprites[pss.ballIconSpriteId].oam.priority = 0;
  ShowOrHideBallIconObj(true);
}

function ShowOrHideBallIconObj(invisible: boolean): void {
  if (sMonSummaryScreen && gSprites[sMonSummaryScreen.ballIconSpriteId]) {
    gSprites[sMonSummaryScreen.ballIconSpriteId].invisible = invisible;
  }
}

function DestroyBallIconObj(): void {
  if (sMonSummaryScreen && gSprites[sMonSummaryScreen.ballIconSpriteId]) {
    const ballItemId = !sMonSummaryScreen.isEgg ? (sMonSummaryScreen.currentMon.pokeball || C.ITEM_POKE_BALL) : C.ITEM_POKE_BALL;
    const ballId = ItemIdToBallId(ballItemId);
    DestroySpriteAndFreeResources(gSprites[sMonSummaryScreen.ballIconSpriteId]);
    FreeBallGfx(ballId);
  }
}

function PokeSum_CreateMonIconSprite(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  const species = pss.currentMon.species;

  SafeLoadMonIconPalette(species);
  pss.monIconSpriteId = CreateMonIcon(species, SpriteCallbackDummy, 24, 32, 0, pss.currentMon.personality, 1);
  const noFlip = IsMonSpriteNotFlipped(species);
  gSprites[pss.monIconSpriteId].hFlip = noFlip ? 0 : 1;
  PokeSum_ShowOrHideMonIconSprite(true);
}

function PokeSum_ShowOrHideMonIconSprite(invisible: boolean): void {
  if (sMonSummaryScreen && gSprites[sMonSummaryScreen.monIconSpriteId]) {
    gSprites[sMonSummaryScreen.monIconSpriteId].invisible = invisible;
  }
}

function PokeSum_DestroyMonIconSprite(): void {
  if (sMonSummaryScreen && gSprites[sMonSummaryScreen.monIconSpriteId]) {
    const species = sMonSummaryScreen.currentMon.species;
    SafeFreeMonIconPalette(species);
    DestroyMonIcon(gSprites[sMonSummaryScreen.monIconSpriteId]);
  }
}

function CreateMonStatusIconObj(tileTag: number, palTag: number): void {
  const oam = oamFrom(cdata("pokemon_summary_screen", "sStatusAilmentIconOamData"));
  const anims = animsFrom(cdata("pokemon_summary_screen", "sStatusAilmentIconAnimTable"));

  LoadSpriteSheet({ data: incbin("gSummaryScreen_StatusAilmentIcon_Gfx"), size: 0x20 * 32, tag: tileTag });
  LoadSpritePalette({ data: incbin16("gSummaryScreen_StatusAilmentIcon_Pal"), tag: palTag });

  const template: SpriteTemplate = {
    tileTag, paletteTag: palTag, oam, anims, images: null, affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallbackDummy,
  };

  const spriteId = CreateSprite(template, 0, 0, 0);
  sStatusIcon = { sprite: gSprites[spriteId], tileTag, palTag };
  ShowOrHideStatusIcon(true);
  UpdateMonStatusIconObj();
}

function DestroyMonStatusIconObj(): void {
  if (sStatusIcon?.sprite) DestroySpriteAndFreeResources(sStatusIcon.sprite);
  sStatusIcon = null;
}

function UpdateMonStatusIconObj(): void {
  if (!sMonSummaryScreen || !sStatusIcon?.sprite) return;
  sMonSummaryScreen.curMonStatusAilment = StatusToAilment(sMonSummaryScreen.currentMon);
  if (sMonSummaryScreen.curMonStatusAilment === AILMENT_NONE) {
    ShowOrHideStatusIcon(true);
    return;
  }
  StartSpriteAnim(sStatusIcon.sprite, sMonSummaryScreen.curMonStatusAilment - 1);
  ShowOrHideStatusIcon(false);
}

function ShowOrHideStatusIcon(invisible: boolean): void {
  if (!sMonSummaryScreen || !sStatusIcon?.sprite) return;
  if (sMonSummaryScreen.curMonStatusAilment === AILMENT_NONE || sMonSummaryScreen.isEgg) {
    sStatusIcon.sprite.invisible = true;
    return;
  }
  sStatusIcon.sprite.invisible = invisible;
  if (sMonSummaryScreen.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
    sStatusIcon.sprite.x = 16;
    sStatusIcon.sprite.y = 45;
  } else {
    sStatusIcon.sprite.x = 16;
    sStatusIcon.sprite.y = 38;
  }
}

function CreateHpBarObjs(tileTag: number, palTag: number): void {
  if (!sMonSummaryScreen) return;
  const oam = oamFrom(cdata("pokemon_summary_screen", "sHpOrExpBarOamData"));
  const anims = animsFrom(cdata("pokemon_summary_screen", "sHpOrExpBarAnimTable"));

  LoadSpriteSheet({ data: incbin("gSummaryScreen_HpBar_Gfx"), size: 0x20 * 12, tag: tileTag });
  LoadSpritePalette({ data: incbin16("gSummaryScreen_HpExpBar_Pal"), tag: palTag });
  LoadSpritePalette({ data: incbin16("sPokeSummary_HpBarPalYellow"), tag: palTag + 1 });
  LoadSpritePalette({ data: incbin16("sPokeSummary_HpBarPalRed"), tag: palTag + 2 });

  sHpBarObjs = { sprites: [], xpos: [], tileTag, palTag };

  for (let i = 0; i < 9; i++) {
    const template: SpriteTemplate = {
      tileTag, paletteTag: palTag, oam, anims, images: null, affineAnims: gDummySpriteAffineAnimTable,
      callback: SpriteCallbackDummy,
    };
    const x = i * 8 + 172;
    sHpBarObjs.xpos.push(x);
    const spriteId = CreateSprite(template, x, 36, 0);
    const sprite = gSprites[spriteId];
    sprite.invisible = false;
    sprite.oam.priority = 2;
    sHpBarObjs.sprites.push(sprite);
    StartSpriteAnim(sprite, 8);
  }

  UpdateHpBarObjs();
  ShowOrHideHpBarObjs(true);
}

function UpdateHpBarObjs(): void {
  if (!sMonSummaryScreen || !sHpBarObjs || sMonSummaryScreen.isEgg) return;
  const curHp = sMonSummaryScreen.currentMon.hp;
  const maxHp = GetMonData(sMonSummaryScreen.currentMon, C.MON_DATA_MAX_HP);

  let hpBarPalOffset = 0;
  switch (GetHPBarLevel(curHp, maxHp)) {
    case 3: default: hpBarPalOffset = 0; break;
    case 2: hpBarPalOffset = 1; break;
    case 1: hpBarPalOffset = 2; break;
  }

  const basePalSlot = IndexOfSpritePaletteTag(TAG_PSS_UNK_78);
  for (let i = 0; i < 9; i++) {
    const sp = sHpBarObjs.sprites[i];
    if (sp) sp.oam.paletteNum = basePalSlot + hpBarPalOffset;
  }

  if (curHp === maxHp) {
    for (let i = 2; i < 8; i++) {
      if (sHpBarObjs.sprites[i]) StartSpriteAnim(sHpBarObjs.sprites[i]!, 8);
    }
  } else {
    const pointsPerTile = Math.floor((maxHp * 4) / 6);
    let totalPoints = curHp * 4;
    let numWholeHpBarTiles = 0;
    while (totalPoints > pointsPerTile) {
      totalPoints -= pointsPerTile;
      numWholeHpBarTiles++;
    }
    numWholeHpBarTiles += 2;
    for (let i = 2; i < numWholeHpBarTiles; i++) {
      if (sHpBarObjs.sprites[i]) StartSpriteAnim(sHpBarObjs.sprites[i]!, 8);
    }
    const animNum = Math.floor((totalPoints * 6) / (pointsPerTile || 1));
    if (sHpBarObjs.sprites[numWholeHpBarTiles]) StartSpriteAnim(sHpBarObjs.sprites[numWholeHpBarTiles]!, animNum);
    for (let i = numWholeHpBarTiles + 1; i < 8; i++) {
      if (sHpBarObjs.sprites[i]) StartSpriteAnim(sHpBarObjs.sprites[i]!, 0);
    }
  }

  if (sHpBarObjs.sprites[0]) StartSpriteAnim(sHpBarObjs.sprites[0]!, 9);
  if (sHpBarObjs.sprites[1]) StartSpriteAnim(sHpBarObjs.sprites[1]!, 10);
  if (sHpBarObjs.sprites[8]) StartSpriteAnim(sHpBarObjs.sprites[8]!, 11);
}

function DestroyHpBarObjs(): void {
  if (sHpBarObjs) {
    for (let i = 0; i < 9; i++) {
      if (sHpBarObjs.sprites[i]) DestroySpriteAndFreeResources(sHpBarObjs.sprites[i]!);
    }
  }
  sHpBarObjs = null;
}

function ShowOrHideHpBarObjs(invisible: boolean): void {
  if (!sHpBarObjs) return;
  for (let i = 0; i < 9; i++) {
    if (sHpBarObjs.sprites[i]) sHpBarObjs.sprites[i]!.invisible = invisible;
  }
}

function CreateExpBarObjs(tileTag: number, palTag: number): void {
  if (!sMonSummaryScreen) return;
  const oam = oamFrom(cdata("pokemon_summary_screen", "sHpOrExpBarOamData"));
  const anims = animsFrom(cdata("pokemon_summary_screen", "sHpOrExpBarAnimTable"));

  LoadSpriteSheet({ data: incbin("gSummaryScreen_ExpBar_Gfx"), size: 0x20 * 12, tag: tileTag });
  LoadSpritePalette({ data: incbin16("gSummaryScreen_HpExpBar_Pal"), tag: palTag });

  sExpBarObjs = { sprites: [], xpos: [], tileTag, palTag };

  for (let i = 0; i < 11; i++) {
    const template: SpriteTemplate = {
      tileTag, paletteTag: palTag, oam, anims, images: null, affineAnims: gDummySpriteAffineAnimTable,
      callback: SpriteCallbackDummy,
    };
    const x = i * 8 + 156;
    sExpBarObjs.xpos.push(x);
    const spriteId = CreateSprite(template, x, 132, 0);
    const sprite = gSprites[spriteId];
    sprite.oam.priority = 2;
    sExpBarObjs.sprites.push(sprite);
  }

  UpdateExpBarObjs();
  ShowOrHideExpBarObjs(true);
}

function UpdateExpBarObjs(): void {
  if (!sMonSummaryScreen || !sExpBarObjs || sMonSummaryScreen.isEgg) return;
  const mon = sMonSummaryScreen.currentMon;

  if (mon.level < 100) {
    const table = rom.expTables[rom.species[mon.species]?.growthRate ?? 0];
    const totalExpToNextLevel = (table?.[mon.level + 1] ?? 0) - (table?.[mon.level] ?? 0);
    const curExpToNextLevel = mon.exp - (table?.[mon.level] ?? 0);
    const pointsPerTile = Math.floor((totalExpToNextLevel * 4) / 8);
    let totalPoints = curExpToNextLevel * 4;
    let numWholeExpBarTiles = 0;
    while (totalPoints > pointsPerTile) {
      totalPoints -= pointsPerTile;
      numWholeExpBarTiles++;
    }
    numWholeExpBarTiles += 2;
    for (let i = 2; i < numWholeExpBarTiles; i++) {
      if (sExpBarObjs.sprites[i]) StartSpriteAnim(sExpBarObjs.sprites[i]!, 8);
    }
    if (numWholeExpBarTiles >= 10) {
      if (totalExpToNextLevel !== curExpToNextLevel && sExpBarObjs.sprites[9]) {
        StartSpriteAnim(sExpBarObjs.sprites[9]!, 7);
      }
    } else {
      const animNum = Math.floor((totalPoints * 8) / (pointsPerTile || 1));
      if (sExpBarObjs.sprites[numWholeExpBarTiles]) StartSpriteAnim(sExpBarObjs.sprites[numWholeExpBarTiles]!, animNum);
      for (let i = numWholeExpBarTiles + 1; i < 10; i++) {
        if (sExpBarObjs.sprites[i]) StartSpriteAnim(sExpBarObjs.sprites[i]!, 0);
      }
    }
  } else {
    for (let i = 2; i < 10; i++) {
      if (sExpBarObjs.sprites[i]) StartSpriteAnim(sExpBarObjs.sprites[i]!, 0);
    }
  }

  if (sExpBarObjs.sprites[0]) StartSpriteAnim(sExpBarObjs.sprites[0]!, 9);
  if (sExpBarObjs.sprites[1]) StartSpriteAnim(sExpBarObjs.sprites[1]!, 10);
  if (sExpBarObjs.sprites[10]) StartSpriteAnim(sExpBarObjs.sprites[10]!, 11);
}

function DestroyExpBarObjs(): void {
  if (sExpBarObjs) {
    for (let i = 0; i < 11; i++) {
      if (sExpBarObjs.sprites[i]) DestroySpriteAndFreeResources(sExpBarObjs.sprites[i]!);
    }
  }
  sExpBarObjs = null;
}

function ShowOrHideExpBarObjs(invisible: boolean): void {
  if (!sExpBarObjs) return;
  for (let i = 0; i < 11; i++) {
    if (sExpBarObjs.sprites[i]) sExpBarObjs.sprites[i]!.invisible = invisible;
  }
}

function CreatePokerusIconObj(tileTag: number, palTag: number): void {
  const oam = oamFrom(cdata("pokemon_summary_screen", "sPokerusIconObjOamData"));
  const anims = animsFrom(cdata("pokemon_summary_screen", "sPokerusIconObjAnimTable"));

  LoadSpriteSheet({ data: incbin("sPokerusIconObjTiles"), size: 0x20 * 1, tag: tileTag });
  LoadSpritePalette({ data: incbin16("sPokerusIconObjPal"), tag: palTag });

  const template: SpriteTemplate = {
    tileTag, paletteTag: palTag, oam, anims, images: null, affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallbackDummy,
  };
  const spriteId = CreateSprite(template, 114, 92, 0);
  sPokerusIconObj = { sprite: gSprites[spriteId], tileTag, palTag };
  HideShowPokerusIcon(true);
  ShowPokerusIconObjIfHasOrHadPokerus();
}

function DestroyPokerusIconObj(): void {
  if (sPokerusIconObj?.sprite) DestroySpriteAndFreeResources(sPokerusIconObj.sprite);
  sPokerusIconObj = null;
}

function ShowPokerusIconObjIfHasOrHadPokerus(): void {
  if (!sMonSummaryScreen) return;
  if (!CheckPartyPokerus(sMonSummaryScreen.currentMon, 0) && CheckPartyHasHadPokerus(sMonSummaryScreen.currentMon, 0)) {
    HideShowPokerusIcon(false);
  } else {
    HideShowPokerusIcon(true);
  }
}

function HideShowPokerusIcon(invisible: boolean): void {
  if (!sMonSummaryScreen || !sPokerusIconObj?.sprite) return;
  const mon = sMonSummaryScreen.currentMon;
  if (!CheckPartyPokerus(mon, 0) && CheckPartyHasHadPokerus(mon, 0)) {
    sPokerusIconObj.sprite.invisible = invisible;
  } else {
    sPokerusIconObj.sprite.invisible = true;
  }
  if (sMonSummaryScreen.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
    sPokerusIconObj.sprite.x = 16;
    sPokerusIconObj.sprite.y = 44;
  } else {
    sPokerusIconObj.sprite.x = 114;
    sPokerusIconObj.sprite.y = 92;
  }
}

function CreateShinyStarObj(tileTag: number, palTag: number): void {
  const oam = oamFrom(cdata("pokemon_summary_screen", "sStarObjOamData"));
  const anims = animsFrom(cdata("pokemon_summary_screen", "sStarObjAnimTable"));

  LoadSpriteSheet({ data: incbin("sStarObjTiles"), size: 0x20 * 2, tag: tileTag });
  LoadSpritePalette({ data: incbin16("sStarObjPal"), tag: palTag });

  const template: SpriteTemplate = {
    tileTag, paletteTag: palTag, oam, anims, images: null, affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallbackDummy,
  };
  const spriteId = CreateSprite(template, 106, 40, 0);
  sShinyStarObjData = { sprite: gSprites[spriteId], tileTag, palTag };
  HideShowShinyStar(true);
  ShowShinyStarObjIfMonShiny();
}

function DestroyShinyStarObj(): void {
  if (sShinyStarObjData?.sprite) DestroySpriteAndFreeResources(sShinyStarObjData.sprite);
  sShinyStarObjData = null;
}

function HideShowShinyStar(invisible: boolean): void {
  if (!sMonSummaryScreen || !sShinyStarObjData?.sprite) return;
  if (IsMonShiny(sMonSummaryScreen.currentMon) && !sMonSummaryScreen.isEgg) {
    sShinyStarObjData.sprite.invisible = invisible;
  } else {
    sShinyStarObjData.sprite.invisible = true;
  }
  if (sMonSummaryScreen.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
    sShinyStarObjData.sprite.x = 8;
    sShinyStarObjData.sprite.y = 24;
  } else {
    sShinyStarObjData.sprite.x = 106;
    sShinyStarObjData.sprite.y = 40;
  }
}

function ShowShinyStarObjIfMonShiny(): void {
  if (!sMonSummaryScreen) return;
  if (IsMonShiny(sMonSummaryScreen.currentMon) && !sMonSummaryScreen.isEgg) {
    HideShowShinyStar(false);
  } else {
    HideShowShinyStar(true);
  }
}

function PokeSum_CreateMonMarkingsSprite(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  const markings = pss.currentMon.markings ?? 0;

  if (pss.markingSprite) DestroySpriteAndFreeResources(pss.markingSprite);

  const oam = oamFrom(cdata("mon_markings", "sOamData_MarkingCombo"));
  const anims = animsFrom(cdata("mon_markings", "sAnims_MarkingCombo"));

  LoadSpriteSheet({ data: incbin("sMonMarkings_Gfx"), size: 16 * 0x80, tag: TAG_PSS_UNK_8C });
  LoadSpritePalette({ data: incbin16("sMonMarkingSpritePalette"), tag: TAG_PSS_UNK_8C });

  const template: SpriteTemplate = {
    tileTag: TAG_PSS_UNK_8C, paletteTag: TAG_PSS_UNK_8C, oam, anims, images: null,
    affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCallbackDummy,
  };
  const spriteId = CreateSprite(template, 20, 91, 0);
  pss.markingSprite = gSprites[spriteId];
  StartSpriteAnim(pss.markingSprite, markings);
  PokeSum_ShowOrHideMonMarkingsSprite(true);
}

function PokeSum_DestroyMonMarkingsSprite(): void {
  if (sMonSummaryScreen?.markingSprite) {
    DestroySpriteAndFreeResources(sMonSummaryScreen.markingSprite);
    sMonSummaryScreen.markingSprite = null;
  }
}

function PokeSum_ShowOrHideMonMarkingsSprite(invisible: boolean): void {
  if (!sMonSummaryScreen?.markingSprite) return;
  const markings = sMonSummaryScreen.currentMon.markings ?? 0;
  if (!markings) sMonSummaryScreen.markingSprite.invisible = true;
  else sMonSummaryScreen.markingSprite.invisible = invisible;
}

function PokeSum_UpdateMonMarkingsAnim(): void {
  if (!sMonSummaryScreen?.markingSprite) return;
  const markings = sMonSummaryScreen.currentMon.markings ?? 0;
  StartSpriteAnim(sMonSummaryScreen.markingSprite, markings);
  PokeSum_ShowOrHideMonMarkingsSprite(false);
}

function CreateMoveSelectionCursorObjs(tileTag: number, palTag: number): void {
  const oam = oamFrom(cdata("pokemon_summary_screen", "sMoveSelectionCursorOamData"));
  const anims = animsFrom(cdata("pokemon_summary_screen", "sMoveSelectionCursorOamAnimTable"));

  LoadSpriteSheet({ data: incbin("sMoveSelectionCursorTiles_Left"), size: 0x20 * 64, tag: tileTag + 0 });
  LoadSpriteSheet({ data: incbin("sMoveSelectionCursorTiles_Right"), size: 0x20 * 64, tag: tileTag + 1 });
  LoadSpriteSheet({ data: incbin("sMoveSelectionCursorTiles_Left"), size: 0x20 * 64, tag: tileTag + 2 });
  LoadSpriteSheet({ data: incbin("sMoveSelectionCursorTiles_Right"), size: 0x20 * 64, tag: tileTag + 3 });
  LoadSpritePalette({ data: incbin16("sMoveSelectionCursorPals"), tag: palTag });

  for (let i = 0; i < 4; i++) {
    const template: SpriteTemplate = {
      tileTag: tileTag + i, paletteTag: palTag, oam, anims, images: null,
      affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCB_MoveSelectionCursor,
    };
    const x = 64 * (i % 2) + 152;
    const y = sMoveSelectionCursorPos * 28 + 34;
    const spriteId = CreateSprite(template, x, y, i % 2);
    const sprite = gSprites[spriteId];
    sMoveSelectionCursorObjs[i] = { sprite, whichSprite: i, tileTag: tileTag + i, palTag };
    sprite.subpriority = i;
    if (i > 1) StartSpriteAnim(sprite, 1);
  }
  ShoworHideMoveSelectionCursor(true);
}

function ShoworHideMoveSelectionCursor(invisible: boolean): void {
  for (let i = 0; i < 4; i++) {
    if (sMoveSelectionCursorObjs[i]?.sprite) {
      sMoveSelectionCursorObjs[i]!.sprite.invisible = invisible;
    }
  }
}

function SpriteCB_MoveSelectionCursor(_sprite: Sprite): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  for (let i = 0; i < 4; i++) {
    const obj = sMoveSelectionCursorObjs[i];
    if (!obj?.sprite) continue;
    if (pss.isSwappingMoves && i > 1) continue;
    obj.sprite.y = sMoveSelectionCursorPos * 28 + 34;
  }

  if (!pss.isSwappingMoves) {
    if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
      if (sMoveSelectionCursorObjs[0]?.sprite) sMoveSelectionCursorObjs[0]!.sprite.invisible = false;
      if (sMoveSelectionCursorObjs[1]?.sprite) sMoveSelectionCursorObjs[1]!.sprite.invisible = false;
      if (sMoveSelectionCursorObjs[2]?.sprite) sMoveSelectionCursorObjs[2]!.sprite.invisible = true;
      if (sMoveSelectionCursorObjs[3]?.sprite) sMoveSelectionCursorObjs[3]!.sprite.invisible = true;
    }
    return;
  }

  // Blinking animation for selected move when swapping
  for (let i = 0; i < 2; i++) {
    const sp = sMoveSelectionCursorObjs[i]?.sprite;
    if (!sp) continue;
    sp.data[0]++;
    if (sp.invisible) {
      if (sp.data[0] > 60) {
        sp.invisible = false;
        sp.data[0] = 0;
      }
    } else if (sp.data[0] > 60) {
      sp.invisible = true;
      sp.data[0] = 0;
    }
  }
}

function DestroyMoveSelectionCursorObjs(): void {
  for (let i = 0; i < 4; i++) {
    if (sMoveSelectionCursorObjs[i]?.sprite) {
      DestroySpriteAndFreeResources(sMoveSelectionCursorObjs[i]!.sprite);
    }
    sMoveSelectionCursorObjs[i] = null;
  }
}

function PokeSum_CreateSprites(): void {
  CreateBallIconObj();
  ShowOrHideBallIconObj(false);
  PokeSum_CreateMonIconSprite();
  PokeSum_CreateMonPicSprite();
  PokeSum_ShowOrHideMonPicSprite(false);
  UpdateHpBarObjs();
  UpdateExpBarObjs();
  PokeSum_UpdateMonMarkingsAnim();
  UpdateMonStatusIconObj();
  ShowPokerusIconObjIfHasOrHadPokerus();
  ShowShinyStarObjIfMonShiny();
}

function PokeSum_DestroySprites(): void {
  DestroyMoveSelectionCursorObjs();
  DestroyHpBarObjs();
  DestroyExpBarObjs();
  PokeSum_DestroyMonPicSprite();
  PokeSum_DestroyMonIconSprite();
  DestroyBallIconObj();
  PokeSum_DestroyMonMarkingsSprite();
  DestroyMonStatusIconObj();
  DestroyPokerusIconObj();
  DestroyShinyStarObj();
  ResetSpriteData();
}

// ---------------------------------------------------------------- input and tasks

function CB2_RunPokemonSummaryScreen(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

function VBlankCB_PokemonSummaryScreen(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();

  if (!sMonSummaryScreen?.flippingPages) return;
  PokeSum_FlipPages_HandleBgHofs();
  PokeSum_FlipPages_HandleHpExpBarSprites();
}

function PokeSum_UpdateWin1ActiveFlag(curPageIndex: number): void {
  ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN1_ON);
  switch (curPageIndex) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO:
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS:
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES:
      SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN1_ON);
      break;
  }
}

function PokeSum_TryPlayMonCry(): void {
  if (!sMonSummaryScreen || sMonSummaryScreen.isEgg) return;
  const mon = sMonSummaryScreen.currentMon;
  const mode = ShouldPlayNormalMonCry(mon) ? C.CRY_MODE_NORMAL : C.CRY_MODE_WEAK;
  sound.PlayCry_ByMode(mon.species, 0, mode);
}

function IsPageFlipInput(direction: number): boolean {
  if (!sMonSummaryScreen || sMonSummaryScreen.isEgg) return false;
  if (sMonSummaryScreen.lastPageFlipDirection !== 0xff && sMonSummaryScreen.lastPageFlipDirection === direction) {
    sMonSummaryScreen.lastPageFlipDirection = 0xff;
    return true;
  }
  if (PageFlipInputIsDisabled(direction)) return false;

  switch (direction) {
    case 1:
      if (JOY_NEW(DPAD_RIGHT) || JOY_NEW(R_BUTTON)) return true;
      break;
    case 0:
      if (JOY_NEW(DPAD_LEFT) || JOY_NEW(L_BUTTON)) return true;
      break;
  }
  return false;
}

/** PageFlipInputIsDisabled (pokemon_summary_screen.c). */
function PageFlipInputIsDisabled(direction: number): boolean {
  return !!sMonSummaryScreen?.inhibitPageFlipInput
    && sMonSummaryScreen.pageFlipDirection !== direction;
}

function Task_InputHandler_Info(taskId: number): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  switch (pss.state3270) {
    case State3270.PSS_STATE3270_FADEIN:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, 0);
      pss.state3270 = State3270.PSS_STATE3270_PLAYCRY;
      break;
    case State3270.PSS_STATE3270_PLAYCRY:
      if (!gPaletteFade.active) {
        PokeSum_TryPlayMonCry();
        pss.state3270 = State3270.PSS_STATE3270_HANDLEINPUT;
        return;
      }
      break;
    case State3270.PSS_STATE3270_HANDLEINPUT:
      if (tasks.isActive(Task_PokeSum_SwitchDisplayedPokemon as unknown as TaskFunc)) return;

      if (pss.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
        if (IsPageFlipInput(1)) {
          if (tasks.isActive(Task_PokeSum_FlipPages as unknown as TaskFunc)) {
            pss.lastPageFlipDirection = 1;
            return;
          } else if (pss.curPageIndex < PokemonSummaryScreenPage.PSS_PAGE_MOVES) {
            sound.playSE(C.SE_SELECT);
            HideBg(0);
            pss.pageFlipDirection = 1;
            PokeSum_RemoveWindows(pss.curPageIndex);
            pss.curPageIndex++;
            pss.state3270 = State3270.PSS_STATE3270_FLIPPAGES;
          }
          return;
        } else if (IsPageFlipInput(0)) {
          if (tasks.isActive(Task_PokeSum_FlipPages as unknown as TaskFunc)) {
            pss.lastPageFlipDirection = 0;
            return;
          } else if (pss.curPageIndex > PokemonSummaryScreenPage.PSS_PAGE_INFO) {
            sound.playSE(C.SE_SELECT);
            HideBg(0);
            pss.pageFlipDirection = 0;
            PokeSum_RemoveWindows(pss.curPageIndex);
            pss.curPageIndex--;
            pss.state3270 = State3270.PSS_STATE3270_FLIPPAGES;
          }
          return;
        }
      }

      if (!tasks.isActive(Task_PokeSum_FlipPages as unknown as TaskFunc)) {
        if (JOY_NEW(DPAD_UP)) {
          PokeSum_SeekToNextMon(taskId, -1);
          return;
        } else if (JOY_NEW(DPAD_DOWN)) {
          PokeSum_SeekToNextMon(taskId, 1);
          return;
        } else if (JOY_NEW(A_BUTTON)) {
          if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_INFO) {
            sound.playSE(C.SE_SELECT);
            pss.state3270 = State3270.PSS_STATE3270_ATEXIT_FADEOUT;
          } else if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES) {
            sound.playSE(C.SE_SELECT);
            pss.pageFlipDirection = 1;
            PokeSum_RemoveWindows(pss.curPageIndex);
            pss.curPageIndex++;
            pss.state3270 = State3270.PSS_STATE3270_FLIPPAGES;
          }
          return;
        } else if (JOY_NEW(B_BUTTON)) {
          pss.state3270 = State3270.PSS_STATE3270_ATEXIT_FADEOUT;
        }
      }
      break;
    case State3270.PSS_STATE3270_FLIPPAGES:
      if (pss.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
        tasks.create(Task_PokeSum_FlipPages, 0);
        pss.state3270 = State3270.PSS_STATE3270_HANDLEINPUT;
      } else {
        tasks.tasks[pss.inputHandlerTaskId].func = Task_FlipPages_FromInfo;
        pss.state3270 = State3270.PSS_STATE3270_HANDLEINPUT;
      }
      break;
    case State3270.PSS_STATE3270_ATEXIT_FADEOUT:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, 0);
      pss.state3270 = State3270.PSS_STATE3270_ATEXIT_WAITFADE;
      break;
    default:
      if (!gPaletteFade.active) {
        Task_DestroyResourcesOnExit(taskId);
      }
      break;
  }
}

function Task_PokeSum_FlipPages(taskId: number): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  const data = tasks.tasks[taskId].data;

  switch (data[0]) {
    case 0:
      PokeSum_HideSpritesBeforePageFlip();
      PokeSum_ShowSpritesBeforePageFlip();
      pss.lockMovesFlag = true;
      pss.inhibitPageFlipInput = true;
      PokeSum_UpdateWin1ActiveFlag(pss.curPageIndex);
      PokeSum_AddWindows(pss.curPageIndex);
      break;
    case 1:
      if (pss.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
        if (!(pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES && pss.pageFlipDirection === 0)) {
          FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 30, 20);
          CopyBgTilemapBufferToVram(0);
        }
      }
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 30, 2);
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 2, 15, 2);
      FillBgTilemapBufferRect_Palette0(2, 0, 0, 0, 30, 2);
      FillBgTilemapBufferRect_Palette0(2, 0, 0, 2, 15, 2);
      break;
    case 2:
      PokeSum_CopyNewBgTilemapBeforePageFlip_2();
      PokeSum_CopyNewBgTilemapBeforePageFlip();
      PokeSum_DrawPageProgressTiles();
      PokeSum_PrintPageHeaderText(pss.curPageIndex);
      break;
    case 3:
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_PAGE_NAME], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_CONTROLS], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_LVL_NICK], COPYWIN_GFX);
      break;
    case 4:
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      break;
    case 5:
      PokeSum_InitBgCoordsBeforePageFlips();
      pss.flippingPages = true;
      break;
    case 6:
      if (!PokeSum_IsPageFlipFinished(pss.pageFlipDirection)) return;
      break;
    case 7:
      PokeSum_PrintRightPaneText();
      if (pss.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) PokeSum_PrintBottomPaneText();
      PokeSum_PrintAbilityDataOrMoveTypes();
      PokeSum_PrintMonTypeIcons();
      break;
    case 8:
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_RIGHT_PANE], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_TRAINER_MEMO], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[5], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[6], COPYWIN_GFX);
      break;
    case 9:
      CopyBgTilemapBufferToVram(0);
      ShowBg(0);
      break;
    default:
      if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
        tasks.tasks[pss.inputHandlerTaskId].func = Task_HandleInput_SelectMove;
      }
      PokeSum_SetHelpContext();
      tasks.destroy(taskId);
      data[0] = 0;
      pss.lockMovesFlag = false;
      pss.inhibitPageFlipInput = false;
      return;
  }
  data[0]++;
}

function Task_FlipPages_FromInfo(_taskId: number): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  switch (pss.state3284) {
    case 0:
      pss.lockMovesFlag = true;
      pss.inhibitPageFlipInput = true;
      PokeSum_AddWindows(pss.curPageIndex);
      break;
    case 1:
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 30, 2);
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 2, 15, 2);
      FillBgTilemapBufferRect_Palette0(2, 0, 0, 0, 30, 2);
      FillBgTilemapBufferRect_Palette0(2, 0, 0, 2, 15, 2);
      break;
    case 2:
      PokeSum_HideSpritesBeforePageFlip();
      PokeSum_UpdateWin1ActiveFlag(pss.curPageIndex);
      PokeSum_CopyNewBgTilemapBeforePageFlip();
      PokeSum_DrawPageProgressTiles();
      PokeSum_CopyNewBgTilemapBeforePageFlip_2();
      break;
    case 3:
      PokeSum_PrintPageName(rom.text("gText_PokeSum_PageName_KnownMoves"));
      PokeSum_PrintControlsString(rom.text("gText_PokeSum_Controls_PickSwitch"));
      break;
    case 4:
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_PAGE_NAME], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_CONTROLS], COPYWIN_GFX);
      break;
    case 5:
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(3);
      break;
    case 6:
      PokeSum_PrintRightPaneText();
      PokeSum_PrintAbilityDataOrMoveTypes();
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_RIGHT_PANE], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[5], COPYWIN_GFX);
      break;
    case 7:
      CopyBgTilemapBufferToVram(0);
      PokeSum_InitBgCoordsBeforePageFlips();
      pss.flippingPages = true;
      break;
    case 8:
      if (!PokeSum_IsPageFlipFinished(pss.pageFlipDirection)) return;
      PokeSum_PrintBottomPaneText();
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_TRAINER_MEMO], COPYWIN_GFX);
      break;
    case 9:
      PokeSum_PrintMonTypeIcons();
      PrintMonLevelNickOnWindow2();
      break;
    case 10:
      PokeSum_ShowSpritesBeforePageFlip();
      CopyWindowToVram(pss.windowIds[6], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_LVL_NICK], COPYWIN_GFX);
      break;
    case 11:
      CopyBgTilemapBufferToVram(0);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      break;
    default:
      PokeSum_SetHelpContext();
      tasks.tasks[pss.inputHandlerTaskId].func = Task_HandleInput_SelectMove;
      pss.state3284 = 0;
      pss.lockMovesFlag = false;
      pss.inhibitPageFlipInput = false;
      return;
  }
  pss.state3284++;
}

function Task_BackOutOfSelectMove(_taskId: number): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  switch (pss.state3284) {
    case 0:
      pss.lockMovesFlag = true;
      pss.inhibitPageFlipInput = true;
      PokeSum_AddWindows(pss.curPageIndex);
      break;
    case 1:
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 30, 2);
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 2, 15, 2);
      FillBgTilemapBufferRect_Palette0(2, 0, 0, 0, 30, 2);
      FillBgTilemapBufferRect_Palette0(2, 0, 0, 2, 15, 2);
      break;
    case 2:
      PokeSum_CopyNewBgTilemapBeforePageFlip_2();
      break;
    case 3:
      PokeSum_PrintRightPaneText();
      PokeSum_PrintBottomPaneText();
      PokeSum_PrintAbilityDataOrMoveTypes();
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_RIGHT_PANE], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_TRAINER_MEMO], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[5], COPYWIN_GFX);
      CopyBgTilemapBufferToVram(0);
      break;
    case 4:
      PokeSum_PrintPageName(rom.text("gText_PokeSum_PageName_KnownMoves"));
      PokeSum_PrintControlsString(rom.text("gText_PokeSum_Controls_PageDetail"));
      PrintMonLevelNickOnWindow2();
      break;
    case 5:
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_PAGE_NAME], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_CONTROLS], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_LVL_NICK], COPYWIN_GFX);
      break;
    case 6:
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(3);
      break;
    case 7:
      PokeSum_InitBgCoordsBeforePageFlips();
      pss.flippingPages = true;
      break;
    case 8:
      if (!PokeSum_IsPageFlipFinished(pss.pageFlipDirection)) return;
      break;
    case 9:
      PokeSum_ShowSpritesBeforePageFlip();
      ShowBg(0);
      break;
    default:
      PokeSum_SetHelpContext();
      tasks.tasks[pss.inputHandlerTaskId].func = Task_InputHandler_Info;
      pss.state3284 = 0;
      pss.lockMovesFlag = false;
      pss.inhibitPageFlipInput = false;
      return;
  }
  pss.state3284++;
}

/** PokeSum_SetHelpContext (pokemon_summary_screen.c). */
function PokeSum_SetHelpContext(): void {
  if (!sMonSummaryScreen) return;
  switch (sMonSummaryScreen.curPageIndex) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO:
      SetHelpContext(C.HELPCONTEXT_POKEMON_INFO);
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS:
      SetHelpContext(C.HELPCONTEXT_POKEMON_SKILLS);
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES:
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO:
      SetHelpContext(C.HELPCONTEXT_POKEMON_MOVES);
      break;
  }
}

// ---------------------------------------------------------------- page sliding & priority

function PokeSum_HideSpritesBeforePageFlip(): void {
  if (!sMonSummaryScreen) return;
  if (sMonSummaryScreen.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_INFO) {
    PokeSum_ShowOrHideMonPicSprite(true);
    ShowOrHideBallIconObj(true);
    PokeSum_ShowOrHideMonMarkingsSprite(true);
  }
  ShowOrHideHpBarObjs(true);
  ShowOrHideExpBarObjs(true);
  ShoworHideMoveSelectionCursor(true);
  ShowOrHideStatusIcon(true);
  HideShowPokerusIcon(true);
  HideShowShinyStar(true);
}

function PokeSum_ShowSpritesBeforePageFlip(): void {
  if (!sMonSummaryScreen) return;
  if (sMonSummaryScreen.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
    PokeSum_ShowOrHideMonPicSprite(false);
    ShowOrHideBallIconObj(false);
    PokeSum_ShowOrHideMonMarkingsSprite(false);
    PokeSum_ShowOrHideMonIconSprite(true);
  } else {
    PokeSum_ShowOrHideMonIconSprite(false);
    ShoworHideMoveSelectionCursor(false);
  }
  if (sMonSummaryScreen.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_SKILLS) {
    ShowOrHideHpBarObjs(false);
    ShowOrHideExpBarObjs(false);
  }
  ShowOrHideStatusIcon(false);
  HideShowPokerusIcon(false);
  HideShowShinyStar(false);
}

function PokeSum_InitBgCoordsBeforePageFlips(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  if (pss.pageFlipDirection === 1) {
    if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
      pss.flipPagesBgHofs = 240;
    } else {
      pss.flipPagesBgHofs = 0;
    }
  } else {
    if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES) {
      pss.flipPagesBgHofs = 0;
    } else {
      pss.flipPagesBgHofs = 240;
    }
  }

  SetGpuReg(REG_OFFSET_BG0HOFS, 0);
  SetGpuReg(REG_OFFSET_BG1HOFS, 0);
  SetGpuReg(REG_OFFSET_BG2HOFS, 0);

  if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_SKILLS && pss.pageFlipDirection === 1) {
    PokeSum_SetHpExpBarCoordsFullRight();
  } else if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_SKILLS && pss.pageFlipDirection === 0) {
    PokeSum_SetHpExpBarCoordsFullLeft();
  }
}

function PokeSum_SetHpExpBarCoordsFullRight(): void {
  if (!sExpBarObjs || !sHpBarObjs) return;
  for (let i = 0; i < 11; i++) {
    sExpBarObjs.xpos[i] = 156 + i * 8 + 240;
    if (sExpBarObjs.sprites[i]) sExpBarObjs.sprites[i]!.x = sExpBarObjs.xpos[i];
    if (i < 9) {
      sHpBarObjs.xpos[i] = 172 + i * 8 + 240;
      if (sHpBarObjs.sprites[i]) sHpBarObjs.sprites[i]!.x = sHpBarObjs.xpos[i];
    }
  }
}

function PokeSum_SetHpExpBarCoordsFullLeft(): void {
  if (!sExpBarObjs || !sHpBarObjs) return;
  for (let i = 0; i < 11; i++) {
    sExpBarObjs.xpos[i] = 156 + i * 8;
    if (sExpBarObjs.sprites[i]) sExpBarObjs.sprites[i]!.x = sExpBarObjs.xpos[i];
    if (i < 9) {
      sHpBarObjs.xpos[i] = 172 + i * 8;
      if (sHpBarObjs.sprites[i]) sHpBarObjs.sprites[i]!.x = sHpBarObjs.xpos[i];
    }
  }
}

function PokeSum_IsPageFlipFinished(direction: number): boolean {
  if (!sMonSummaryScreen) return true;
  const pss = sMonSummaryScreen;
  const delta = direction === 1 ? -1 : 0;

  if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
    if (pss.flipPagesBgHofs <= 0) {
      pss.flipPagesBgHofs = 0;
      pss.whichBgLayerToTranslate ^= 1;
      PokeSum_UpdateBgPriorityForPageFlip(0, 0);
      pss.flippingPages = false;
      return true;
    }
  }

  if (pss.curPageIndex + delta === PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
    if (pss.flipPagesBgHofs >= 240) {
      pss.flipPagesBgHofs = 240;
      pss.whichBgLayerToTranslate ^= 1;
      pss.flippingPages = false;
      return true;
    }
  }

  if (direction === 1) {
    if (pss.flipPagesBgHofs >= 240) {
      pss.flipPagesBgHofs = 240;
      pss.whichBgLayerToTranslate ^= 1;
      PokeSum_UpdateBgPriorityForPageFlip(0, 0);
      pss.flippingPages = false;
      return true;
    }
  } else if (pss.flipPagesBgHofs <= 0) {
    pss.whichBgLayerToTranslate ^= 1;
    pss.flipPagesBgHofs = 0;
    pss.flippingPages = false;
    return true;
  }

  return false;
}

function PokeSum_UpdateBgPriorityForPageFlip(setBg0Priority: number, keepBg1Bg2Order: number): void {
  if (!sMonSummaryScreen) return;
  let bg0 = GetGpuReg(REG_OFFSET_BG0CNT) & 3;
  let bg1 = GetGpuReg(REG_OFFSET_BG1CNT) & 3;
  let bg2 = GetGpuReg(REG_OFFSET_BG2CNT) & 3;

  if (sMonSummaryScreen.pageFlipDirection === 1) {
    if (setBg0Priority === 0) {
      bg0 = 0;
      if (keepBg1Bg2Order === 0) {
        if (bg1 > bg2) { bg1 = 1; bg2 = 2; } else { bg1 = 2; bg2 = 1; }
      } else {
        if (bg1 > bg2) { bg1 = 2; bg2 = 1; } else { bg1 = 1; bg2 = 2; }
      }
    }
    if (setBg0Priority === 1) {
      bg0 = 1;
      if (keepBg1Bg2Order === 0) {
        if (bg1 > bg2) { bg1 = 0; bg2 = 2; } else { bg1 = 2; bg2 = 0; }
      } else {
        if (bg1 > bg2) { bg1 = 2; bg2 = 0; } else { bg1 = 0; bg2 = 2; }
      }
    }
  } else {
    bg0 = 0;
    if (bg1 > bg2) { bg1 = 1; bg2 = 2; } else { bg1 = 2; bg2 = 1; }
  }

  SetGpuReg(REG_OFFSET_BG0CNT, (GetGpuReg(REG_OFFSET_BG0CNT) & ~3) | bg0);
  SetGpuReg(REG_OFFSET_BG1CNT, (GetGpuReg(REG_OFFSET_BG1CNT) & ~3) | bg1);
  SetGpuReg(REG_OFFSET_BG2CNT, (GetGpuReg(REG_OFFSET_BG2CNT) & ~3) | bg2);
}

function PokeSum_CopyNewBgTilemapBeforePageFlip_2(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  const newPage = pss.pageFlipDirection === 1 ? pss.curPageIndex - 1 : pss.curPageIndex + 1;

  switch (newPage) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO:
      CopyToBgTilemapBuffer(pss.infoAndMovesPageBgNum, incbin("gSummaryScreen_PageSkills_Tilemap"), 0, 0);
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_SKILLS:
      if (pss.pageFlipDirection === 1) {
        CopyToBgTilemapBuffer(pss.skillsPageBgNum, incbin("gSummaryScreen_PageMoves_Tilemap"), 0, 0);
      } else {
        CopyToBgTilemapBuffer(pss.skillsPageBgNum, incbin("gSummaryScreen_PageInfo_Tilemap"), 0, 0);
      }
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES:
      if (pss.pageFlipDirection === 1) {
        CopyToBgTilemapBuffer(pss.infoAndMovesPageBgNum, incbin("gSummaryScreen_PageMovesInfo_Tilemap"), 0, 0);
      } else {
        CopyToBgTilemapBuffer(pss.infoAndMovesPageBgNum, incbin("gSummaryScreen_PageSkills_Tilemap"), 0, 0);
      }
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO:
      CopyToBgTilemapBuffer(pss.skillsPageBgNum, incbin("gSummaryScreen_PageMoves_Tilemap"), 0, 0);
      break;
  }
}

function PokeSum_CopyNewBgTilemapBeforePageFlip(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  const newPage = pss.pageFlipDirection === 1 ? pss.curPageIndex - 1 : pss.curPageIndex + 1;

  switch (newPage) {
    case PokemonSummaryScreenPage.PSS_PAGE_INFO:
      CopyToBgTilemapBuffer(pss.infoAndMovesPageBgNum, incbin("gSummaryScreen_PageSkills_Tilemap"), 0, 0);
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES:
      if (pss.pageFlipDirection === 1) {
        CopyToBgTilemapBuffer(3, incbin("sBgTilemap_MovesPage"), 0, 0);
      }
      break;
    case PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO:
      if (pss.pageFlipDirection === 0) {
        CopyToBgTilemapBuffer(3, incbin("sBgTilemap_MovesInfoPage"), 0, 0);
      }
      break;
  }
}

function PokeSum_FlipPages_HandleBgHofs(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  if (pss.pageFlipDirection === 1) {
    if (pss.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
      PokeSum_FlipPages_SlideLayerLeft();
    } else {
      PokeSum_FlipPages_SlideLayeRight();
    }
  } else {
    if (pss.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES) {
      PokeSum_FlipPages_SlideLayeRight();
    } else {
      PokeSum_FlipPages_SlideLayerLeft();
    }
  }
}

/** PokeSum_FlipPages_SlideLayerLeft (pokemon_summary_screen.c). */
function PokeSum_FlipPages_SlideLayerLeft(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  if (pss.flipPagesBgHofs < 240) {
    pss.flipPagesBgHofs += 60;
    if (pss.flipPagesBgHofs > 240) pss.flipPagesBgHofs = 240;
    const reg = pss.whichBgLayerToTranslate === 0 ? REG_OFFSET_BG2HOFS : REG_OFFSET_BG1HOFS;
    SetGpuReg(reg, -pss.flipPagesBgHofs);
  }
}

/** PokeSum_FlipPages_SlideLayeRight (pokemon_summary_screen.c; source spelling retained). */
function PokeSum_FlipPages_SlideLayeRight(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  if (pss.flipPagesBgHofs >= 60) {
    pss.flipPagesBgHofs -= 60;
    if (pss.flipPagesBgHofs < 0) pss.flipPagesBgHofs = 0;
    const reg = pss.whichBgLayerToTranslate === 0 ? REG_OFFSET_BG1HOFS : REG_OFFSET_BG2HOFS;
    SetGpuReg(reg, -pss.flipPagesBgHofs);
    if (pss.curPageIndex !== PokemonSummaryScreenPage.PSS_PAGE_MOVES_INFO) {
      SetGpuReg(REG_OFFSET_BG0HOFS, -pss.flipPagesBgHofs);
    }
  }
}

function PokeSum_FlipPages_HandleHpExpBarSprites(): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  if (pss.pageFlipDirection === 1) {
    if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_INFO) {
      PokeSum_FlipPages_SlideHpExpBarsOut();
    } else if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_SKILLS) {
      PokeSum_FlipPages_SlideHpExpBarsIn();
    }
  } else {
    if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_MOVES) {
      PokeSum_FlipPages_SlideHpExpBarsOut();
    } else if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_SKILLS) {
      PokeSum_FlipPages_SlideHpExpBarsIn();
    }
  }
}

function PokeSum_FlipPages_SlideHpExpBarsOut(): void {
  if (!sExpBarObjs || !sHpBarObjs) return;
  for (let i = 0; i < 11; i++) {
    if (sExpBarObjs.xpos[i] < 240) {
      sExpBarObjs.xpos[i] += 60;
      if (sExpBarObjs.sprites[i]) sExpBarObjs.sprites[i]!.x = sExpBarObjs.xpos[i] + 60;
    }
    if (i < 9 && sHpBarObjs.xpos[i] < 240) {
      sHpBarObjs.xpos[i] += 60;
      if (sHpBarObjs.sprites[i]) sHpBarObjs.sprites[i]!.x = sHpBarObjs.xpos[i] + 60;
    }
  }
}

function PokeSum_FlipPages_SlideHpExpBarsIn(): void {
  if (!sExpBarObjs || !sHpBarObjs) return;
  for (let i = 0; i < 11; i++) {
    const targetExp = 156 + 8 * i;
    if (sExpBarObjs.xpos[i] > targetExp) {
      sExpBarObjs.xpos[i] = Math.max(targetExp, sExpBarObjs.xpos[i] - 60);
      if (sExpBarObjs.sprites[i]) sExpBarObjs.sprites[i]!.x = sExpBarObjs.xpos[i];
    }
    if (i < 9) {
      const targetHp = 172 + 8 * i;
      if (sHpBarObjs.xpos[i] > targetHp) {
        sHpBarObjs.xpos[i] = Math.max(targetHp, sHpBarObjs.xpos[i] - 60);
        if (sHpBarObjs.sprites[i]) sHpBarObjs.sprites[i]!.x = sHpBarObjs.xpos[i];
      }
    }
  }
}

// ---------------------------------------------------------------- move selection & swap

function Task_HandleInput_SelectMove(_taskId: number): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  switch (pss.selectMoveInputHandlerState) {
    case 0:
      if (JOY_NEW(DPAD_UP)) {
        if (sMoveSelectionCursorPos > 0) {
          pss.selectMoveInputHandlerState = 2;
          sound.playSE(C.SE_SELECT);
          for (let i = sMoveSelectionCursorPos; i > 0; i--) {
            if (pss.moveIds[i - 1]) {
              sMoveSelectionCursorPos = i - 1;
              return;
            }
          }
        } else {
          sMoveSelectionCursorPos = 4;
          pss.selectMoveInputHandlerState = 2;
          sound.playSE(C.SE_SELECT);
          if (pss.isSwappingMoves) {
            for (let i = sMoveSelectionCursorPos; i > 0; i--) {
              if (pss.moveIds[i - 1]) {
                sMoveSelectionCursorPos = i - 1;
                return;
              }
            }
          }
        }
      } else if (JOY_NEW(DPAD_DOWN)) {
        if (sMoveSelectionCursorPos < 4) {
          let v0 = 4;
          pss.selectMoveInputHandlerState = 2;
          if (pss.isSwappingMoves) {
            if (sMoveSelectionCursorPos === 3) {
              sMoveSelectionCursorPos = 0;
              sound.playSE(C.SE_SELECT);
              return;
            }
            v0--;
          }
          for (let i = sMoveSelectionCursorPos; i < v0; i++) {
            if (pss.moveIds[i + 1]) {
              sound.playSE(C.SE_SELECT);
              sMoveSelectionCursorPos = i + 1;
              return;
            }
          }
          sound.playSE(C.SE_SELECT);
          sMoveSelectionCursorPos = pss.isSwappingMoves ? 0 : 4;
          return;
        } else if (sMoveSelectionCursorPos === 4) {
          sMoveSelectionCursorPos = 0;
          pss.selectMoveInputHandlerState = 2;
          sound.playSE(C.SE_SELECT);
          return;
        }
      } else if (JOY_NEW(A_BUTTON)) {
        sound.playSE(C.SE_SELECT);
        if (sMoveSelectionCursorPos === 4) {
          sMoveSelectionCursorPos = 0;
          sMoveSwapCursorPos = 0;
          pss.isSwappingMoves = false;
          ShoworHideMoveSelectionCursor(true);
          pss.pageFlipDirection = 0;
          PokeSum_RemoveWindows(pss.curPageIndex);
          pss.curPageIndex--;
          pss.selectMoveInputHandlerState = 1;
          return;
        }

        if (!pss.isSwappingMoves) {
          sMoveSwapCursorPos = sMoveSelectionCursorPos;
          pss.isSwappingMoves = true;
          return;
        } else {
          pss.isSwappingMoves = false;
          if (sMoveSelectionCursorPos === sMoveSwapCursorPos) return;
          if (pss.isBoxMon) SwapBoxMonMoveSlots();
          else SwapMonMoveSlots();
          UpdateCurrentMonBufferFromPartyOrBox(pss.currentMon);
          BufferMonMoves();
          pss.selectMoveInputHandlerState = 2;
          return;
        }
      } else if (JOY_NEW(B_BUTTON)) {
        if (pss.isSwappingMoves) {
          sMoveSwapCursorPos = sMoveSelectionCursorPos;
          pss.isSwappingMoves = false;
          return;
        }
        if (sMoveSelectionCursorPos === 4) {
          sMoveSelectionCursorPos = 0;
          sMoveSwapCursorPos = 0;
        }
        ShoworHideMoveSelectionCursor(true);
        pss.pageFlipDirection = 0;
        PokeSum_RemoveWindows(pss.curPageIndex);
        pss.curPageIndex--;
        pss.selectMoveInputHandlerState = 1;
      }
      break;
    case 1:
      tasks.tasks[pss.inputHandlerTaskId].func = Task_BackOutOfSelectMove;
      pss.selectMoveInputHandlerState = 0;
      break;
    case 2:
      PokeSum_PrintRightPaneText();
      PokeSum_PrintBottomPaneText();
      PokeSum_PrintAbilityDataOrMoveTypes();
      pss.selectMoveInputHandlerState = 3;
      break;
    case 3:
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_RIGHT_PANE], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_TRAINER_MEMO], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[5], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[6], COPYWIN_GFX);
      CopyBgTilemapBufferToVram(0);
      CopyBgTilemapBufferToVram(3);
      pss.selectMoveInputHandlerState = 0;
      break;
  }
}

function SwapMonMoveSlots(): void {
  if (!sMonSummaryScreen) return;
  const mon = sMonSummaryScreen.monList[sLastViewedMonIndex];
  if (!mon) return;
  SwapMoveSlotsInMon(mon);
}

/** SwapBoxMonMoveSlots (pokemon_summary_screen.c); BoxPokemon uses the same modeled move fields. */
function SwapBoxMonMoveSlots(): void {
  if (!sMonSummaryScreen) return;
  const mon = sMonSummaryScreen.monList[sLastViewedMonIndex];
  if (!mon) return;
  SwapMoveSlotsInMon(mon);
}

function SwapMoveSlotsInMon(mon: Mon): void {
  const p1 = sMoveSelectionCursorPos;
  const p2 = sMoveSwapCursorPos;

  const m1 = mon.moves[p1];
  const m2 = mon.moves[p2];
  const pp1 = mon.pp[p1];
  const pp2 = mon.pp[p2];

  mon.moves[p1] = m2;
  mon.moves[p2] = m1;
  mon.pp[p1] = pp2;
  mon.pp[p2] = pp1;

  const b1 = (mon.ppBonuses >>> (p1 * 2)) & 3;
  const b2 = (mon.ppBonuses >>> (p2 * 2)) & 3;
  mon.ppBonuses &= ~((3 << (p1 * 2)) | (3 << (p2 * 2)));
  mon.ppBonuses |= (b1 << (p2 * 2)) | (b2 << (p1 * 2));
}

/** GetMonMoveBySlotId (pokemon_summary_screen.c). */
function GetMonMoveBySlotId(mon: Mon, moveSlot: number): number {
  return GetMonData(mon, C.MON_DATA_MOVE1 + Math.min(moveSlot, 3));
}

/** GetMonPpByMoveSlot (pokemon_summary_screen.c). */
function GetMonPpByMoveSlot(mon: Mon, moveSlot: number): number {
  return GetMonData(mon, C.MON_DATA_PP1 + Math.min(moveSlot, 3));
}

/** PokeSum_CanForgetSelectedMove (pokemon_summary_screen.c). */
function PokeSum_CanForgetSelectedMove(): boolean {
  if (!sMonSummaryScreen) return false;
  const move = GetMonMoveBySlotId(sMonSummaryScreen.currentMon, sMoveSelectionCursorPos);
  return !IsMoveHm(move) || sMonSummaryScreen.mode === PokemonSummaryScreenMode.PSS_MODE_FORGET_MOVE;
}

/** UpdateCurrentMonBufferFromPartyOrBox (pokemon_summary_screen.c). */
function UpdateCurrentMonBufferFromPartyOrBox(mon: Pokemon): void {
  BufferSelectedMonData(mon);
}

function Task_InputHandler_SelectOrForgetMove(taskId: number): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  switch (pss.selectMoveInputHandlerState) {
    case 0:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, 0);
      pss.selectMoveInputHandlerState++;
      break;
    case 1:
      if (!gPaletteFade.active) {
        PokeSum_TryPlayMonCry();
        pss.selectMoveInputHandlerState++;
      }
      break;
    case 2:
      if (JOY_NEW(DPAD_UP)) {
        if (sMoveSelectionCursorPos > 0) {
          pss.selectMoveInputHandlerState = 3;
          sound.playSE(C.SE_SELECT);
          for (let i = sMoveSelectionCursorPos; i > 0; i--) {
            if (pss.moveIds[i - 1]) {
              sMoveSelectionCursorPos = i - 1;
              return;
            }
          }
        } else {
          sMoveSelectionCursorPos = 4;
          pss.selectMoveInputHandlerState = 3;
          sound.playSE(C.SE_SELECT);
          return;
        }
      } else if (JOY_NEW(DPAD_DOWN)) {
        if (sMoveSelectionCursorPos < 4) {
          pss.selectMoveInputHandlerState = 3;
          for (let i = sMoveSelectionCursorPos; i < 4; i++) {
            if (pss.moveIds[i + 1]) {
              sound.playSE(C.SE_SELECT);
              sMoveSelectionCursorPos = i + 1;
              return;
            }
          }
          sound.playSE(C.SE_SELECT);
          sMoveSelectionCursorPos = 4;
          return;
        } else if (sMoveSelectionCursorPos === 4) {
          sMoveSelectionCursorPos = 0;
          pss.selectMoveInputHandlerState = 3;
          sound.playSE(C.SE_SELECT);
          return;
        }
      } else if (JOY_NEW(A_BUTTON)) {
        const canForget = PokeSum_CanForgetSelectedMove();
        if (canForget || sMoveSelectionCursorPos === 4) {
          sound.playSE(C.SE_SELECT);
          sMoveSwapCursorPos = sMoveSelectionCursorPos;
          pss.selectMoveInputHandlerState = 6;
        } else {
          sound.playSE(C.SE_FAILURE);
          pss.selectMoveInputHandlerState = 5;
        }
      } else if (JOY_NEW(B_BUTTON)) {
        sMoveSwapCursorPos = 4;
        pss.selectMoveInputHandlerState = 6;
      }
      break;
    case 3:
      PokeSum_PrintRightPaneText();
      PokeSum_PrintBottomPaneText();
      PokeSum_PrintAbilityDataOrMoveTypes();
      pss.selectMoveInputHandlerState = 4;
      break;
    case 4:
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_RIGHT_PANE], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_TRAINER_MEMO], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[5], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[6], COPYWIN_GFX);
      CopyBgTilemapBufferToVram(0);
      CopyBgTilemapBufferToVram(3);
      pss.selectMoveInputHandlerState = 2;
      break;
    case 5: {
      const win = pss.windowIds[POKESUM_WIN_TRAINER_MEMO];
      FillWindowPixelBuffer(win, 0);
      const colors = cdata<number[][]>("pokemon_summary_screen", "sLevelNickTextColors");
      AddTextPrinterParameterized4(win, FONT_NORMAL, 7, 42, 0, 0, colors[0], TEXT_SKIP_DRAW, rom.text("gText_PokeSum_HmMovesCantBeForgotten"));
      CopyWindowToVram(win, COPYWIN_GFX);
      CopyBgTilemapBufferToVram(0);
      CopyBgTilemapBufferToVram(3);
      pss.selectMoveInputHandlerState = 2;
      break;
    }
    case 6:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, 0);
      pss.selectMoveInputHandlerState++;
      break;
    default:
      if (!gPaletteFade.active) {
        Task_DestroyResourcesOnExit(taskId);
      }
      break;
  }
}

// ---------------------------------------------------------------- mon switching

function PokeSum_SeekToNextMon(_taskId: number, direction: number): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;
  const target = pss.isBoxMon
    ? SeekToNextMonInBox(
      pss.monList,
      sLastViewedMonIndex,
      pss.lastIndex,
      (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_INFO ? 1 : 0) | (direction < 0 ? 2 : 0),
    )
    : SeekToNextMonInSingleParty(direction);
  if (target < 0) return;

  sLastViewedMonIndex = target;
  tasks.create(Task_PokeSum_SwitchDisplayedPokemon, 0);
  pss.switchMonTaskState = 0;
}

/** SeekToNextMonInSingleParty (pokemon_summary_screen.c). */
function SeekToNextMonInSingleParty(direction: number): number {
  const pss = sMonSummaryScreen!;
  if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_INFO) {
    if ((direction === -1 && sLastViewedMonIndex === 0)
      || (direction === 1 && sLastViewedMonIndex >= pss.lastIndex)) return -1;
    return sLastViewedMonIndex + direction;
  }

  let seekDelta = 0;
  while (true) {
    seekDelta += direction;
    const target = sLastViewedMonIndex + seekDelta;
    if (target < 0 || target > pss.lastIndex) return -1;
    const mon = pss.monList[target];
    if (mon && !GetMonData(mon, C.MON_DATA_IS_EGG)) return target;
  }
}

function Task_PokeSum_SwitchDisplayedPokemon(taskId: number): void {
  if (!sMonSummaryScreen) return;
  const pss = sMonSummaryScreen;

  switch (pss.switchMonTaskState) {
    case 0:
      sMoveSelectionCursorPos = 0;
      sMoveSwapCursorPos = 0;
      pss.switchMonTaskState++;
      break;
    case 1:
      PokeSum_DestroyMonPicSprite();
      PokeSum_DestroyMonIconSprite();
      DestroyBallIconObj();
      pss.switchMonTaskState++;
      break;
    case 2:
      BufferSelectedMonData(pss.currentMon);
      pss.isEgg = !!pss.currentMon.isEgg;
      pss.switchMonTaskState++;
      break;
    case 3: {
      FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 30, 20);
      const pal = incbin16("gSummaryScreen_Bg_Pal");
      if (IsMonShiny(pss.currentMon) && !pss.isEgg) {
        LoadPalette(pal.subarray(16 * 6, 16 * 7), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
        LoadPalette(pal.subarray(16 * 5, 16 * 6), BG_PLTT_ID(1), PLTT_SIZE_4BPP);
      } else {
        LoadPalette(pal.subarray(0, 16), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
        LoadPalette(pal.subarray(16, 32), BG_PLTT_ID(1), PLTT_SIZE_4BPP);
      }
      pss.switchMonTaskState++;
      break;
    }
    case 4:
      if (pss.curPageIndex === PokemonSummaryScreenPage.PSS_PAGE_INFO) {
        if (pss.isEgg) {
          CopyToBgTilemapBuffer(pss.skillsPageBgNum, incbin("gSummaryScreen_PageEgg_Tilemap"), 0, 0);
          CopyToBgTilemapBuffer(pss.infoAndMovesPageBgNum, incbin("gSummaryScreen_PageSkills_Tilemap"), 0, 0);
        } else {
          CopyToBgTilemapBuffer(pss.skillsPageBgNum, incbin("gSummaryScreen_PageInfo_Tilemap"), 0, 0);
          CopyToBgTilemapBuffer(pss.infoAndMovesPageBgNum, incbin("gSummaryScreen_PageSkills_Tilemap"), 0, 0);
        }
      }
      pss.switchMonTaskState++;
      break;
    case 5:
      BufferMonInfo();
      pss.switchMonTaskState++;
      break;
    case 6:
      if (!pss.isEgg) BufferMonSkills();
      pss.switchMonTaskState++;
      break;
    case 7:
      if (!pss.isEgg) BufferMonMoves();
      pss.switchMonTaskState++;
      break;
    case 8:
      PokeSum_PrintRightPaneText();
      PokeSum_PrintBottomPaneText();
      PokeSum_PrintAbilityDataOrMoveTypes();
      pss.switchMonTaskState++;
      break;
    case 9:
      PokeSum_PrintMonTypeIcons();
      PokeSum_DrawPageProgressTiles();
      PokeSum_PrintPageHeaderText(pss.curPageIndex);
      pss.switchMonTaskState++;
      break;
    case 10:
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_PAGE_NAME], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_CONTROLS], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_LVL_NICK], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[6], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_RIGHT_PANE], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[POKESUM_WIN_TRAINER_MEMO], COPYWIN_GFX);
      CopyWindowToVram(pss.windowIds[5], COPYWIN_GFX);
      CopyBgTilemapBufferToVram(0);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(3);
      pss.switchMonTaskState++;
      break;
    case 11:
      PokeSum_CreateSprites();
      PokeSum_TryPlayMonCry();
      pss.switchMonTaskState++;
      break;
    default:
      pss.switchMonTaskState = 0;
      tasks.destroy(taskId);
      break;
  }
}

// ---------------------------------------------------------------- exit and cleanup

function Task_DestroyResourcesOnExit(taskId: number): void {
  if (!sMonSummaryScreen) return;
  const cb = sMonSummaryScreen.savedCallback;
  PokeSum_DestroySprites();
  FreeAllSpritePalettes();
  PokeSum_RemoveWindows(sMonSummaryScreen.curPageIndex);
  FreeAllWindowBuffers();
  tasks.destroy(taskId);
  sMonSummaryScreen = null;
  sMonSkillsPrinterXpos = null;

  SetMainCallback2(cb);
}
