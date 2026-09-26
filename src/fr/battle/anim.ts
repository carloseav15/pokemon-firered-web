// Battle animation engine base: battle_anim.c (globals, launch/end, battler-to-BG), battle_anim_mons.c
// (coordinates, translations, rot/scale helpers), battle_anim_status_effects.c (LaunchStatusAnimation),
// pokemon.c (gMultiuseSpriteTemplate) and pokemon_special_anim_scene.c (level-up vertical sprites).
//
// The animation *script* interpreter is not ported yet: launched animations end on their first
// callback (as if the script were only `end`), so battles run with instant move animations.

import * as C from "../generated/constants";
import { gBattleAnimArgs } from "./animArgs";
import { sound } from "../audio/sound";
import { tasks, type Task } from "../gba/tasks";
import { cdata } from "../hw/assets";
import { ANIMS, bs, ROM_BASE } from "./bscript";
import { affineAnimFrom, animsFrom, cexpr, oamFrom, templateFrom, type CSpriteTemplate } from "../hw/cdataSprite";
import { BG_SCREEN_SIZE, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, FillBgTilemapBufferRect, LoadBgTiles } from "../hw/bg";
import { SetGpuReg } from "../hw/gpu";
import { BlendPalette, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID, BG_PLTT_ID, PLTT_ID, PLTT_SIZE_4BPP } from "../hw/palette";
import {
  BLDALPHA_BLEND, OBJ_VRAM0, ppu, REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS,
  REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT,
} from "../hw/ppu";
import {
  AllocSpritePalette, CalcCenterToCornerVec, CreateInvisibleSprite, CreateSprite, DestroySprite, DestroySpriteAndFreeResources, FreeSpriteOamMatrix,
  gDummySpriteAffineAnimTable, gDummySpriteAnimTable, gOamMatrices, gSprites, IndexOfSpritePaletteTag,
  LoadSpriteSheet, MAX_SPRITES, objAffineSet, SPRITE_NONE, SpriteCallbackDummy, StartSpriteAnim, ST_OAM_AFFINE_DOUBLE,
  ST_OAM_AFFINE_NORMAL, ST_OAM_OBJ_BLEND, ST_OAM_OBJ_NORMAL, ST_OAM_OBJ_WINDOW,
  type AffineAnimCmd, type AnimCmd, type Sprite, type SpriteCallback, type SpriteFrameImage, type SpriteTemplate,
} from "../hw/sprite";
import { ArcTan2, Cos, Sin } from "../hw/trig";
import { GetMonData, gEnemyParty, playerMon } from "../pokemon/mon";
import {
  gEnemyMonElevation, gMonBackPicCoords, gMonBackPicTable, gMonFrontPicCoords, gMonFrontPicTable, GetMonSpritePalFromSpeciesAndPersonality,
  LoadSpecialPokePic, LoadSpecialPokePic_DontHandleDeoxys, symBytes,
} from "../pokemon/pics";
import { DisableStruct } from "../generated/structs";
import {
  G, gBattleAnimBgTileBuffer, gBattleAnimBgTilemapBuffer, gBattleMonForms, gBattlerPartyIndexes, gBattlerPositions, gBattlerSpriteIds, gBattleSpritesDataPtr, gMonSpritesGfxPtr, gTransformedPersonalities,
} from "./globals";
import { GET_UNOWN_LETTER } from "./macros";
import { BG_ANIM_AREA_OVERFLOW_MODE, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, CopyBattlerSpriteToBg, GetAnimBgAttribute, SetAnimBgAttribute } from "./intro";
import { UpdateOamPriorityInAllHealthboxes } from "./interface";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";
import { SpriteCB_AllyMon, SpriteCB_EnemyMon, UpdatePlayerPosInThrowAnim } from "./main_init";

export const ANIM_ARGS_COUNT = 8;
const ANIM_SPRITE_INDEX_COUNT = 8;
const TASK_NONE = 0xff;
const DISPLAY_HEIGHT = 160;
const MON_PIC_HEIGHT = 64;
const MON_PIC_SIZE = 64 * 64 / 2;

export const ANIM_ATTACKER = 0;
export const ANIM_TARGET = 1;
export const ANIM_ATK_PARTNER = 2;
export const ANIM_DEF_PARTNER = 3;

// ---------------------------------------------------------------- battle_anim.c globals

export type AnimTable = "moves" | "general" | "special" | "status";

export const animState = {
  sBattleAnimScriptPtr: 0,
  gAnimScriptCallback: (() => {}) as () => void,
  sAnimFramesToWait: 0,
  gAnimScriptActive: false,
  gAnimVisualTaskCount: 0,
  gAnimSoundTaskCount: 0,
  gAnimDisableStructPtr: null as DisableStruct | null,
  gAnimMoveDmg: 0,
  gAnimMovePower: 0,
  sAnimSpriteIndexArray: new Uint16Array(ANIM_SPRITE_INDEX_COUNT),
  gAnimFriendship: 0,
  gWeatherMoveAnim: 0,
  // 8 args plus the EWRAM that follows them: Magnitude's AnimTask_IsPowerOver99 / jumpargeq use index 15.
  gBattleAnimArgs,
  sSoundAnimFramesToWait: 0,
  sMonAnimTaskIdArray: [TASK_NONE, TASK_NONE],
  gAnimMoveTurn: 0,
  sAnimBackgroundFadeState: 0,
  sAnimMoveIndex: 0,
  gBattleAnimAttacker: 0,
  gBattleAnimTarget: 0,
  gAnimBattlerSpecies: new Uint16Array(4),
  gAnimCustomPanning: 0,
};

export function ClearBattleAnimationVars(): void {
  const a = animState;
  a.sAnimFramesToWait = 0;
  a.gAnimScriptActive = false;
  a.gAnimVisualTaskCount = 0;
  a.gAnimSoundTaskCount = 0;
  a.gAnimDisableStructPtr = null;
  a.gAnimMoveDmg = 0;
  a.gAnimMovePower = 0;
  a.gAnimFriendship = 0;
  a.sAnimSpriteIndexArray.fill(0xffff);
  a.gBattleAnimArgs.fill(0, 0, ANIM_ARGS_COUNT);
  a.sMonAnimTaskIdArray = [TASK_NONE, TASK_NONE];
  a.gAnimMoveTurn = 0;
  a.sAnimBackgroundFadeState = 0;
  a.sAnimMoveIndex = 0;
  a.gBattleAnimAttacker = 0;
  a.gBattleAnimTarget = 0;
  a.gAnimCustomPanning = 0;
}

export function DoMoveAnim(move: number): void {
  animState.gBattleAnimAttacker = G.gBattlerAttacker;
  animState.gBattleAnimTarget = G.gBattlerTarget;
  LaunchBattleAnimation("moves", move, true);
}

const ANIM_TABLE_LABELS: Record<AnimTable, string> = {
  moves: "gBattleAnims_Moves",
  general: "gBattleAnims_General",
  special: "gBattleAnims_Special",
  status: "gBattleAnims_StatusConditions",
};

/** animsTable[tableId]: the script pointer stored in the assembled table. */
function animTableEntry(table: AnimTable, tableId: number): number {
  return bs.animsView.getUint32(ANIMS(ANIM_TABLE_LABELS[table]) + tableId * 4 - ROM_BASE, true);
}

export function LaunchBattleAnimation(table: AnimTable, tableId: number, isMoveAnim: boolean): void {
  const a = animState;
  InitPrioritiesForVisibleBattlers();
  UpdateOamPriorityInAllHealthboxes(0);
  for (let i = 0; i < 4; i++) {
    a.gAnimBattlerSpecies[i] = GetMonData(GetBattlerSide(i) !== C.B_SIDE_PLAYER ? gEnemyParty[gBattlerPartyIndexes[i]] : playerMon(gBattlerPartyIndexes[i]), C.MON_DATA_SPECIES);
  }
  a.sAnimMoveIndex = isMoveAnim ? tableId : 0;
  a.gBattleAnimArgs.fill(0, 0, ANIM_ARGS_COUNT);
  a.sMonAnimTaskIdArray = [TASK_NONE, TASK_NONE];
  a.sBattleAnimScriptPtr = animTableEntry(table, tableId);
  a.gAnimScriptActive = true;
  a.sAnimFramesToWait = 0;
  a.gAnimScriptCallback = RunAnimScriptCommand;
  a.sAnimSpriteIndexArray.fill(0xffff);
  if (isMoveAnim && gMovesWithQuietBGM().includes(tableId)) sound.setBgmVolume(128);
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  G.gBattle_WIN1H = 0;
  G.gBattle_WIN1V = 0;
}

let quietBgmMoves: number[] | null = null;

/** gMovesWithQuietBGM (data/battle_anim_scripts.s): u16 list ending in 0xFFFF. */
function gMovesWithQuietBGM(): number[] {
  if (!quietBgmMoves) {
    quietBgmMoves = [];
    for (let addr = ANIMS("gMovesWithQuietBGM"); ; addr += 2) {
      const move = bs.animsView.getUint16(addr - ROM_BASE, true);
      if (move === 0xffff) break;
      quietBgmMoves.push(move);
    }
  }
  return quietBgmMoves;
}

/** Animation script dispatch lives in ./animScript (full opcode interpreter). */
import { RunAnimScriptCommand } from "./animScript";
export { RunAnimScriptCommand };
export { WaitAnimFrameCount } from "./animScript";

export function DestroyAnimSprite(sprite: Sprite): void {
  FreeSpriteOamMatrix(sprite);
  DestroySprite(sprite);
  animState.gAnimVisualTaskCount--;
}

export function DestroyAnimVisualTask(taskId: number): void {
  tasks.destroy(taskId);
  animState.gAnimVisualTaskCount--;
}

export function DestroyAnimSoundTask(taskId: number): void {
  tasks.destroy(taskId);
  animState.gAnimSoundTaskCount--;
}

// ---------------------------------------------------------------- battle_anim_status_effects.c

export function LaunchStatusAnimation(battlerId: number, statusAnimId: number): void {
  animState.gBattleAnimAttacker = battlerId;
  animState.gBattleAnimTarget = battlerId;
  LaunchBattleAnimation("status", statusAnimId, false);
  const taskId = tasks.create(Task_DoStatusAnimation, 10);
  tasks.tasks[taskId].data[0] = battlerId;
}

function Task_DoStatusAnimation(taskId: number): void {
  animState.gAnimScriptCallback();
  if (!animState.gAnimScriptActive) {
    gBattleSpritesDataPtr.healthBoxesData[tasks.tasks[taskId].data[0]].statusAnimActive = 0;
    tasks.destroy(taskId);
  }
}

// ---------------------------------------------------------------- battle anim BG buffers

export { gBattleAnimBgTileBuffer, gBattleAnimBgTilemapBuffer };

const BG_ANIM_PAL_1 = 8;
const BG_ANIM_PAL_2 = 9;
const BG_SCREEN_ADDR = (n: number) => n * BG_SCREEN_SIZE;

export type BattleAnimBgData = { bgTiles: Uint8Array; bgTilemap: Uint16Array; paletteId: number; bgId: number; tilesOffset: number; unused: number };

export function GetBattleAnimBg1Data(): BattleAnimBgData {
  return { bgTiles: gBattleAnimBgTileBuffer, bgTilemap: gBattleAnimBgTilemapBuffer, paletteId: BG_ANIM_PAL_1, bgId: 1, tilesOffset: 0x200, unused: 0 };
}

export function GetBattleAnimBgData(bgId: number): BattleAnimBgData {
  if (bgId === 1) return GetBattleAnimBg1Data();
  return { bgTiles: gBattleAnimBgTileBuffer, bgTilemap: gBattleAnimBgTilemapBuffer, paletteId: BG_ANIM_PAL_2, bgId: 2, tilesOffset: 0x300, unused: 0 };
}

export function GetBattleAnimBgDataByPriorityRank(): BattleAnimBgData {
  return GetBattleAnimBgData(GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker) === 1 ? 1 : 2);
}

export function InitBattleAnimBg(bgId: number): void {
  const d = GetBattleAnimBgData(bgId);
  d.bgTiles.fill(0);
  LoadBgTiles(bgId, d.bgTiles, 0x2000, d.tilesOffset);
  FillBgTilemapBufferRect(bgId, 0, 0, 0, 32, 64, 17);
  CopyBgTilemapBufferToVram(bgId);
}

export function AnimLoadCompressedBgGfx(bgId: number, src: Uint8Array, tilesOffset: number): void {
  gBattleAnimBgTileBuffer.fill(0);
  gBattleAnimBgTileBuffer.set(src.subarray(0, 0x2000));
  LoadBgTiles(bgId, gBattleAnimBgTileBuffer, 0x2000, tilesOffset);
}

export function InitAnimBgTilemapBuffer(bgId: number, src: ArrayLike<number>): void {
  FillBgTilemapBufferRect(bgId, 0, 0, 0, 32, 64, 17);
  CopyToBgTilemapBuffer(bgId, src, 0, 0);
}

export function AnimLoadCompressedBgTilemap(bgId: number, src: ArrayLike<number>): void {
  InitAnimBgTilemapBuffer(bgId, src);
  CopyBgTilemapBufferToVram(bgId);
}

export function GetBattleBgPaletteNum(): number {
  return 2;
}

export function ToggleBg3Mode(largeScreenSize: boolean): void {
  SetAnimBgAttribute(3, BG_ANIM_SCREEN_SIZE, largeScreenSize ? 1 : 0);
  SetAnimBgAttribute(3, BG_ANIM_AREA_OVERFLOW_MODE, largeScreenSize ? 0 : 1);
}

export function MoveBattlerSpriteToBG(battlerId: number, toBG_2: boolean | number): void {
  const spriteId = gBattlerSpriteIds[battlerId];
  const s = gSprites[spriteId];
  if (!toBG_2) {
    ppu.vram.fill(0, BG_SCREEN_ADDR(8), BG_SCREEN_ADDR(8) + 0x2000);
    ppu.vram.fill(0, BG_SCREEN_ADDR(28), BG_SCREEN_ADDR(28) + 0x1000);
    const animBg = GetBattleAnimBg1Data();
    animBg.bgTiles.fill(0, 0, 0x1000);
    animBg.bgTilemap.fill(0, 0, 0x400);
    SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 2);
    SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 1);
    SetAnimBgAttribute(1, BG_ANIM_AREA_OVERFLOW_MODE, 0);
    G.gBattle_BG1_X = (-(s.x + s.x2) + 0x20) & 0xffff;
    G.gBattle_BG1_Y = (-(s.y + s.y2) + 0x20) & 0xffff;
    s.invisible = true;
    SetGpuReg(REG_OFFSET_BG1HOFS, G.gBattle_BG1_X);
    SetGpuReg(REG_OFFSET_BG1VOFS, G.gBattle_BG1_Y);
    const pal = gPlttBufferUnfaded.slice(OBJ_PLTT_ID(battlerId), OBJ_PLTT_ID(battlerId) + 16);
    LoadPalette(pal, BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
    ppu.pltt.set(pal, animBg.paletteId * 16);
    CopyBattlerSpriteToBg(1, 0, 0, GetBattlerPosition(battlerId), animBg.paletteId, animBg.bgTiles, animBg.bgTilemap, animBg.tilesOffset);
  } else {
    ppu.vram.fill(0, BG_SCREEN_ADDR(12), BG_SCREEN_ADDR(12) + 0x2000);
    ppu.vram.fill(0, BG_SCREEN_ADDR(30), BG_SCREEN_ADDR(30) + 0x1000);
    const animBg = GetBattleAnimBgData(2);
    animBg.bgTiles.fill(0, 0x1000, 0x2000);
    animBg.bgTilemap.fill(0, 0x400, 0x800);
    SetAnimBgAttribute(2, BG_ANIM_PRIORITY, 2);
    SetAnimBgAttribute(2, BG_ANIM_SCREEN_SIZE, 1);
    SetAnimBgAttribute(2, BG_ANIM_AREA_OVERFLOW_MODE, 0);
    G.gBattle_BG2_X = (-(s.x + s.x2) + 0x20) & 0xffff;
    G.gBattle_BG2_Y = (-(s.y + s.y2) + 0x20) & 0xffff;
    s.invisible = true;
    SetGpuReg(REG_OFFSET_BG2HOFS, G.gBattle_BG2_X);
    SetGpuReg(REG_OFFSET_BG2VOFS, G.gBattle_BG2_Y);
    const pal = gPlttBufferUnfaded.slice(OBJ_PLTT_ID(battlerId), OBJ_PLTT_ID(battlerId) + 16);
    LoadPalette(pal, BG_PLTT_ID(9), PLTT_SIZE_4BPP);
    ppu.pltt.set(pal, 9 * 16);
    CopyBattlerSpriteToBg(2, 0, 0, GetBattlerPosition(battlerId), animBg.paletteId, animBg.bgTiles.subarray(0x1000), animBg.bgTilemap.subarray(0x400), animBg.tilesOffset);
  }
}

export function RelocateBattleBgPal(paletteNum: number, dest: Uint16Array, offset: number, largeScreen: boolean): void {
  const size = largeScreen ? 64 : 32;
  paletteNum <<= 12;
  for (let i = 0; i < size; i++) for (let j = 0; j < 32; j++) dest[j + i * 32] = (((dest[j + i * 32] & 0xfff) | paletteNum) + offset) & 0xffff;
}

export function ResetBattleAnimBg(toBG2: boolean | number): void {
  if (!toBG2) {
    InitBattleAnimBg(1);
    G.gBattle_BG1_X = 0;
    G.gBattle_BG1_Y = 0;
  } else {
    InitBattleAnimBg(2);
    G.gBattle_BG2_X = 0;
    G.gBattle_BG2_Y = 0;
  }
}

// ---------------------------------------------------------------- battle_anim_mons.c: coordinates

type MonCoordsRaw = { size: unknown; y_offset: number };

const sBattlerCoords = [
  [{ x: 72, y: 80 }, { x: 176, y: 40 }, { x: 48, y: 40 }, { x: 112, y: 80 }],
  [{ x: 32, y: 80 }, { x: 200, y: 40 }, { x: 90, y: 88 }, { x: 152, y: 32 }],
];
export const gCastformFrontSpriteCoords = [
  { size: 0x44, y_offset: 17 },
  { size: 0x66, y_offset: 9 },
  { size: 0x46, y_offset: 9 },
  { size: 0x86, y_offset: 8 },
];
const sCastformElevations = [13, 14, 13, 13];
const sCastformBackSpriteYCoords = [0, 0, 0, 0];

const isDouble = () => (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE ? 1 : 0);
export const IsDoubleBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE);

function battlerSpecies(battlerId: number): number {
  const info = gBattleSpritesDataPtr.battlerData[battlerId];
  if (info.transformSpecies) return info.transformSpecies;
  return GetMonData(partyMon(battlerId), C.MON_DATA_SPECIES);
}

function partyMon(battlerId: number) {
  return GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER ? gEnemyParty[gBattlerPartyIndexes[battlerId]] : playerMon(gBattlerPartyIndexes[battlerId]);
}

export function GetBattlerSpriteCoord(battlerId: number, coordType: number): number {
  switch (coordType) {
    case C.BATTLER_COORD_X:
    case C.BATTLER_COORD_X_2:
      return sBattlerCoords[isDouble()][GetBattlerPosition(battlerId)].x;
    case C.BATTLER_COORD_Y:
      return sBattlerCoords[isDouble()][GetBattlerPosition(battlerId)].y;
    default:
      return GetBattlerSpriteFinal_Y(battlerId, battlerSpecies(battlerId), coordType === C.BATTLER_COORD_Y_PIC_OFFSET);
  }
}

function coordsSpecies(species: number, personality: number): number {
  const letter = GET_UNOWN_LETTER(personality);
  return letter ? letter + C.SPECIES_UNOWN_B - 1 : species;
}

function GetBattlerYDelta(battlerId: number, species: number): number {
  const info = gBattleSpritesDataPtr.battlerData[battlerId];
  const personality = () => (info.transformSpecies ? gTransformedPersonalities[battlerId] : GetMonData(partyMon(battlerId), C.MON_DATA_PERSONALITY));
  if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) {
    if (species === C.SPECIES_UNOWN) return gMonBackPicCoords()[coordsSpecies(species, personality())].y_offset;
    if (species === C.SPECIES_CASTFORM) return sCastformBackSpriteYCoords[gBattleMonForms[battlerId]];
    if (species > C.NUM_SPECIES) return gMonBackPicCoords()[0].y_offset;
    return gMonBackPicCoords()[species].y_offset;
  }
  if (species === C.SPECIES_UNOWN) return gMonFrontPicCoords()[coordsSpecies(species, personality())].y_offset;
  if (species === C.SPECIES_CASTFORM) return gCastformFrontSpriteCoords[gBattleMonForms[battlerId]].y_offset;
  if (species > C.NUM_SPECIES) return gMonFrontPicCoords()[0].y_offset;
  return gMonFrontPicCoords()[species].y_offset;
}

function GetBattlerElevation(battlerId: number, species: number): number {
  if (GetBattlerSide(battlerId) !== C.B_SIDE_OPPONENT) return 0;
  if (species === C.SPECIES_CASTFORM) return sCastformElevations[gBattleMonForms[battlerId]];
  if (species > C.NUM_SPECIES) return gEnemyMonElevation(0);
  return gEnemyMonElevation(species);
}

function GetBattlerSpriteFinal_Y(battlerId: number, species: number, a3: boolean): number {
  let offset = GetBattlerYDelta(battlerId, species);
  if (GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER) offset = (offset - GetBattlerElevation(battlerId, species)) & 0xffff;
  let y = (offset + sBattlerCoords[isDouble()][GetBattlerPosition(battlerId)].y) & 0xff;
  if (a3) {
    if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) y = (y + 8) & 0xff;
    if (y > DISPLAY_HEIGHT - MON_PIC_HEIGHT + 8) y = DISPLAY_HEIGHT - MON_PIC_HEIGHT + 8;
  }
  return y;
}

export function GetBattlerSpriteCoord2(battlerId: number, coordType: number): number {
  if (coordType === C.BATTLER_COORD_Y_PIC_OFFSET || coordType === C.BATTLER_COORD_Y_PIC_OFFSET_DEFAULT) {
    const info = gBattleSpritesDataPtr.battlerData[battlerId];
    const species = info.transformSpecies ? info.transformSpecies : animState.gAnimBattlerSpecies[battlerId];
    return GetBattlerSpriteFinal_Y(battlerId, species, coordType === C.BATTLER_COORD_Y_PIC_OFFSET);
  }
  return GetBattlerSpriteCoord(battlerId, coordType);
}

export function GetBattlerSpriteDefault_Y(battlerId: number): number {
  return GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y_PIC_OFFSET_DEFAULT);
}

export function GetSubstituteSpriteDefault_Y(battlerId: number): number {
  const y = GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y) + (GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER ? 16 : 17);
  return y & 0xff;
}

export function GetGhostSpriteDefault_Y(battlerId: number): number {
  if (GetBattlerSide(battlerId) !== C.B_SIDE_OPPONENT) return GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y_PIC_OFFSET_DEFAULT);
  return GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y);
}

export function GetBattlerYCoordWithElevation(battlerId: number): number {
  let y = GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y);
  const species = battlerSpecies(battlerId);
  if (GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER) y = (y - GetBattlerElevation(battlerId, species)) & 0xff;
  return y;
}

export function GetAnimBattlerSpriteId(animBattler: number): number {
  const a = animState;
  if (animBattler === ANIM_ATTACKER) return IsBattlerSpritePresent(a.gBattleAnimAttacker) ? gBattlerSpriteIds[a.gBattleAnimAttacker] : SPRITE_NONE;
  if (animBattler === ANIM_TARGET) return IsBattlerSpritePresent(a.gBattleAnimTarget) ? gBattlerSpriteIds[a.gBattleAnimTarget] : SPRITE_NONE;
  if (animBattler === ANIM_ATK_PARTNER) return IsBattlerSpriteVisible(a.gBattleAnimAttacker ^ 2) ? gBattlerSpriteIds[a.gBattleAnimAttacker ^ 2] : SPRITE_NONE;
  return IsBattlerSpriteVisible(a.gBattleAnimTarget ^ 2) ? gBattlerSpriteIds[a.gBattleAnimTarget ^ 2] : SPRITE_NONE;
}

// ---------------------------------------------------------------- stored callbacks (data[6]/data[7])

// The C code stores a function pointer in two s16 fields; here a handle into a registry is stored instead.
const callbackRegistry: SpriteCallback[] = [SpriteCallbackDummy];
const callbackHandles = new Map<SpriteCallback, number>([[SpriteCallbackDummy, 0]]);

export function StoreSpriteCallbackInData6(sprite: Sprite, callback: SpriteCallback): void {
  let handle = callbackHandles.get(callback);
  if (handle === undefined) {
    handle = callbackRegistry.length;
    callbackRegistry.push(callback);
    callbackHandles.set(callback, handle);
  }
  sprite.data[6] = handle & 0xffff;
  sprite.data[7] = handle >> 16;
}

export function SetCallbackToStoredInData6(sprite: Sprite): void {
  const handle = (sprite.data[6] & 0xffff) | (sprite.data[7] << 16);
  sprite.callback = callbackRegistry[handle] ?? SpriteCallbackDummy;
}

// ---------------------------------------------------------------- translations

export function TranslateSpriteInCircle(sprite: Sprite): void {
  const d = sprite.data;
  if (d[3]) {
    sprite.x2 = Sin(d[0], d[1]);
    sprite.y2 = Cos(d[0], d[1]);
    d[0] += d[2];
    if (d[0] >= 0x100) d[0] -= 0x100;
    else if (d[0] < 0) d[0] += 0x100;
    d[3]--;
  } else {
    SetCallbackToStoredInData6(sprite);
  }
}

export function TranslateSpriteInGrowingCircle(sprite: Sprite): void {
  const d = sprite.data;
  if (d[3]) {
    sprite.x2 = Sin(d[0], (d[5] >> 8) + d[1]);
    sprite.y2 = Cos(d[0], (d[5] >> 8) + d[1]);
    d[0] += d[2];
    d[5] += d[4];
    if (d[0] >= 0x100) d[0] -= 0x100;
    else if (d[0] < 0) d[0] += 0x100;
    d[3]--;
  } else {
    SetCallbackToStoredInData6(sprite);
  }
}

export function TranslateSpriteInEllipse(sprite: Sprite): void {
  const d = sprite.data;
  if (d[3]) {
    sprite.x2 = Sin(d[0], d[1]);
    sprite.y2 = Cos(d[0], d[4]);
    d[0] += d[2];
    if (d[0] >= 0x100) d[0] -= 0x100;
    else if (d[0] < 0) d[0] += 0x100;
    d[3]--;
  } else {
    SetCallbackToStoredInData6(sprite);
  }
}

export function WaitAnimForDuration(sprite: Sprite): void {
  if (sprite.data[0] > 0) sprite.data[0]--;
  else SetCallbackToStoredInData6(sprite);
}

export function ConvertPosDataToTranslateLinearData(sprite: Sprite): void {
  const d = sprite.data;
  if (d[1] > d[2]) d[0] = -d[0];
  const xDiff = d[2] - d[1];
  const old = d[0];
  d[0] = Math.abs(Math.trunc(xDiff / d[0]));
  d[2] = Math.trunc((d[4] - d[3]) / d[0]);
  d[1] = old;
}

export function TranslateSpriteLinear(sprite: Sprite): void {
  const d = sprite.data;
  if (d[0] > 0) {
    d[0]--;
    sprite.x2 += d[1];
    sprite.y2 += d[2];
  } else {
    SetCallbackToStoredInData6(sprite);
  }
}

export function TranslateSpriteLinearFixedPoint(sprite: Sprite): void {
  const d = sprite.data;
  if (d[0] > 0) {
    d[0]--;
    d[3] += d[1];
    d[4] += d[2];
    sprite.x2 = d[3] >> 8;
    sprite.y2 = d[4] >> 8;
  } else {
    SetCallbackToStoredInData6(sprite);
  }
}

export function TranslateSpriteLinearById(sprite: Sprite): void {
  const d = sprite.data;
  if (d[0] > 0) {
    d[0]--;
    gSprites[d[3]].x2 += d[1];
    gSprites[d[3]].y2 += d[2];
  } else {
    SetCallbackToStoredInData6(sprite);
  }
}

export function TranslateSpriteLinearByIdFixedPoint(sprite: Sprite): void {
  const d = sprite.data;
  if (d[0] > 0) {
    d[0]--;
    d[3] += d[1];
    d[4] += d[2];
    gSprites[d[5]].x2 = d[3] >> 8;
    gSprites[d[5]].y2 = d[4] >> 8;
  } else {
    SetCallbackToStoredInData6(sprite);
  }
}

export function TranslateSpriteLinearAndFlicker(sprite: Sprite): void {
  const d = sprite.data;
  if (d[0] > 0) {
    d[0]--;
    sprite.x2 = d[2] >> 8;
    d[2] += d[1];
    sprite.y2 = d[4] >> 8;
    d[4] += d[3];
    if (d[5] && d[0] % d[5] === 0) sprite.invisible = !sprite.invisible;
  } else {
    SetCallbackToStoredInData6(sprite);
  }
}

export function DestroySpriteAndMatrix(sprite: Sprite): void {
  FreeSpriteOamMatrix(sprite);
  DestroyAnimSprite(sprite);
}

export function RunStoredCallbackWhenAffineAnimEnds(sprite: Sprite): void {
  if (sprite.affineAnimEnded) SetCallbackToStoredInData6(sprite);
}

export function RunStoredCallbackWhenAnimEnds(sprite: Sprite): void {
  if (sprite.animEnded) SetCallbackToStoredInData6(sprite);
}

export function DestroyAnimSpriteAndDisableBlend(sprite: Sprite): void {
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  DestroyAnimSprite(sprite);
}

export function DestroyAnimVisualTaskAndDisableBlend(taskId: number): void {
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  DestroyAnimVisualTask(taskId);
}

export function SetSpriteCoordsToAnimAttackerCoords(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
}

export function SetAnimSpriteInitialXOffset(sprite: Sprite, xOffset: number): void {
  const attackerX = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
  const targetX = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X);
  if (attackerX > targetX) sprite.x -= xOffset;
  else if (attackerX < targetX) sprite.x += xOffset;
  else if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= xOffset;
  else sprite.x += xOffset;
}

// sTransl_Speed/Duration data[0], InitX data[1], DestX data[2], InitY data[3], DestY data[4], ArcAmpl data[5]
export function InitAnimArcTranslation(sprite: Sprite): void {
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  InitAnimLinearTranslation(sprite);
  sprite.data[6] = Math.trunc(0x8000 / sprite.data[0]);
  sprite.data[7] = 0;
}

export function TranslateAnimHorizontalArc(sprite: Sprite): boolean {
  if (AnimTranslateLinear(sprite)) return true;
  sprite.data[7] += sprite.data[6];
  sprite.y2 += Sin((sprite.data[7] >> 8) & 0xff, sprite.data[5]);
  return false;
}

export function TranslateAnimVerticalArc(sprite: Sprite): boolean {
  if (AnimTranslateLinear(sprite)) return true;
  sprite.data[7] += sprite.data[6];
  sprite.x2 += Sin((sprite.data[7] >> 8) & 0xff, sprite.data[5]);
  return false;
}

export function SetSpritePrimaryCoordsFromSecondaryCoords(sprite: Sprite): void {
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.x2 = 0;
  sprite.y2 = 0;
}

export function InitSpritePosToAnimTarget(sprite: Sprite, respectMonPicOffsets: boolean): void {
  if (!respectMonPicOffsets) {
    sprite.x = GetBattlerSpriteCoord2(animState.gBattleAnimTarget, C.BATTLER_COORD_X);
    sprite.y = GetBattlerSpriteCoord2(animState.gBattleAnimTarget, C.BATTLER_COORD_Y);
  }
  SetAnimSpriteInitialXOffset(sprite, animState.gBattleAnimArgs[0]);
  sprite.y += animState.gBattleAnimArgs[1];
}

export function InitSpritePosToAnimAttacker(sprite: Sprite, respectMonPicOffsets: boolean): void {
  if (!respectMonPicOffsets) {
    sprite.x = GetBattlerSpriteCoord2(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
    sprite.y = GetBattlerSpriteCoord2(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y);
  } else {
    sprite.x = GetBattlerSpriteCoord2(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
    sprite.y = GetBattlerSpriteCoord2(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  }
  SetAnimSpriteInitialXOffset(sprite, animState.gBattleAnimArgs[0]);
  sprite.y += animState.gBattleAnimArgs[1];
}

export function IsBattlerSpritePresent(battlerId: number): boolean {
  if (gBattlerPositions[battlerId] === 0xff) return false;
  return GetMonData(partyMon(battlerId), C.MON_DATA_HP) !== 0;
}

/** battle_util2.c / battle_anim.c: sprite present and not hidden by an effect. */
export function IsBattlerSpriteVisible(battlerId: number): boolean {
  if (!IsBattlerSpritePresent(battlerId)) return false;
  if (!gBattleSpritesDataPtr.battlerData[battlerId].invisible || !gSprites[gBattlerSpriteIds[battlerId]].invisible) return true;
  return false;
}

export function InitSpriteDataForLinearTranslation(sprite: Sprite): void {
  const d = sprite.data;
  const x = ((d[2] - d[1]) << 8) << 16 >> 16;
  const y = ((d[4] - d[3]) << 8) << 16 >> 16;
  d[1] = Math.trunc(x / d[0]);
  d[2] = Math.trunc(y / d[0]);
  d[4] = 0;
  d[3] = 0;
}

export function InitAnimLinearTranslation(sprite: Sprite): void {
  const d = sprite.data;
  const x = d[2] - d[1];
  const y = d[4] - d[3];
  const movingLeft = x < 0;
  const movingUp = y < 0;
  let xDelta = (Math.abs(x) << 8) & 0xffff;
  let yDelta = (Math.abs(y) << 8) & 0xffff;
  xDelta = Math.trunc(xDelta / d[0]) & 0xffff;
  yDelta = Math.trunc(yDelta / d[0]) & 0xffff;
  xDelta = movingLeft ? xDelta | 1 : xDelta & ~1;
  yDelta = movingUp ? yDelta | 1 : yDelta & ~1;
  d[1] = xDelta;
  d[2] = yDelta;
  d[4] = 0;
  d[3] = 0;
}

export function StartAnimLinearTranslation(sprite: Sprite): void {
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  InitAnimLinearTranslation(sprite);
  sprite.callback = AnimTranslateLinear_WithFollowup;
  sprite.callback(sprite);
}

export function PlayerThrowBall_StartAnimLinearTranslation(sprite: Sprite): void {
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  InitAnimLinearTranslation(sprite);
  sprite.callback = PlayerThrowBall_AnimTranslateLinear_WithFollowup;
  sprite.callback(sprite);
}

export function AnimTranslateLinear(sprite: Sprite): boolean {
  const d = sprite.data;
  if (!d[0]) return true;
  const v1 = d[1] & 0xffff;
  const v2 = d[2] & 0xffff;
  const x = ((d[3] & 0xffff) + v1) & 0xffff;
  const y = ((d[4] & 0xffff) + v2) & 0xffff;
  sprite.x2 = v1 & 1 ? -(x >> 8) : x >> 8;
  sprite.y2 = v2 & 1 ? -(y >> 8) : y >> 8;
  d[3] = x;
  d[4] = y;
  d[0]--;
  return false;
}

export function AnimTranslateLinear_WithFollowup(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite)) SetCallbackToStoredInData6(sprite);
}

function PlayerThrowBall_AnimTranslateLinear_WithFollowup(sprite: Sprite): void {
  UpdatePlayerPosInThrowAnim(sprite);
  if (AnimTranslateLinear(sprite)) SetCallbackToStoredInData6(sprite);
}

export function InitAnimLinearTranslationWithSpeed(sprite: Sprite): void {
  const v1 = Math.abs(sprite.data[2] - sprite.data[1]) << 8;
  sprite.data[0] = Math.trunc(v1 / sprite.data[0]);
  InitAnimLinearTranslation(sprite);
}

export function InitAnimLinearTranslationWithSpeedAndPos(sprite: Sprite): void {
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  InitAnimLinearTranslationWithSpeed(sprite);
  sprite.callback = AnimTranslateLinear_WithFollowup;
  sprite.callback(sprite);
}

function InitAnimFastLinearTranslation(sprite: Sprite): void {
  const d = sprite.data;
  const xDiff = d[2] - d[1];
  const yDiff = d[4] - d[3];
  let x2 = (Math.abs(xDiff) << 4) & 0xffff;
  let y2 = (Math.abs(yDiff) << 4) & 0xffff;
  x2 = Math.trunc(x2 / d[0]) & 0xffff;
  y2 = Math.trunc(y2 / d[0]) & 0xffff;
  x2 = xDiff < 0 ? x2 | 1 : x2 & ~1;
  y2 = yDiff < 0 ? y2 | 1 : y2 & ~1;
  d[1] = x2;
  d[2] = y2;
  d[4] = 0;
  d[3] = 0;
}

export function InitAndRunAnimFastLinearTranslation(sprite: Sprite): void {
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  InitAnimFastLinearTranslation(sprite);
  sprite.callback = AnimFastTranslateLinearWaitEnd;
  sprite.callback(sprite);
}

export function AnimFastTranslateLinear(sprite: Sprite): boolean {
  const d = sprite.data;
  if (!d[0]) return true;
  const v1 = d[1] & 0xffff;
  const v2 = d[2] & 0xffff;
  const x = ((d[3] & 0xffff) + v1) & 0xffff;
  const y = ((d[4] & 0xffff) + v2) & 0xffff;
  sprite.x2 = v1 & 1 ? -(x >> 4) : x >> 4;
  sprite.y2 = v2 & 1 ? -(y >> 4) : y >> 4;
  d[3] = x;
  d[4] = y;
  d[0]--;
  return false;
}

function AnimFastTranslateLinearWaitEnd(sprite: Sprite): void {
  if (AnimFastTranslateLinear(sprite)) SetCallbackToStoredInData6(sprite);
}

export function InitAnimFastLinearTranslationWithSpeed(sprite: Sprite): void {
  const xDiff = Math.abs(sprite.data[2] - sprite.data[1]) << 4;
  sprite.data[0] = Math.trunc(xDiff / sprite.data[0]);
  InitAnimFastLinearTranslation(sprite);
}

export function InitAnimFastLinearTranslationWithSpeedAndPos(sprite: Sprite): void {
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  InitAnimFastLinearTranslationWithSpeed(sprite);
  sprite.callback = AnimFastTranslateLinearWaitEnd;
  sprite.callback(sprite);
}

// ---------------------------------------------------------------- rot/scale

export function SetSpriteRotScale(spriteId: number, xScale: number, yScale: number, rotation: number): void {
  const m = objAffineSet(xScale, yScale, rotation);
  const i = gSprites[spriteId].oam.matrixNum;
  gOamMatrices[i].a = m.a;
  gOamMatrices[i].b = m.b;
  gOamMatrices[i].c = m.c;
  gOamMatrices[i].d = m.d;
}

export function PrepareBattlerSpriteForRotScale(spriteId: number, objMode: number): void {
  const s = gSprites[spriteId];
  const battlerId = s.data[0];
  if (IsBattlerSpriteVisible(battlerId)) s.invisible = false;
  s.oam.objMode = objMode;
  s.affineAnimPaused = true;
  if (!s.oam.affineMode) s.oam.matrixNum = gBattleSpritesDataPtr.healthBoxesData[battlerId].matrixNum;
  s.oam.affineMode = ST_OAM_AFFINE_DOUBLE;
  CalcCenterToCornerVec(s, s.oam.shape, s.oam.size, s.oam.affineMode);
}

export function ResetSpriteRotScale(spriteId: number): void {
  const s = gSprites[spriteId];
  SetSpriteRotScale(spriteId, 0x100, 0x100, 0);
  s.oam.affineMode = ST_OAM_AFFINE_NORMAL;
  s.oam.objMode = 0;
  s.affineAnimPaused = false;
  CalcCenterToCornerVec(s, s.oam.shape, s.oam.size, s.oam.affineMode);
}

export function SetBattlerSpriteYOffsetFromRotation(spriteId: number): void {
  let c = (gOamMatrices[gSprites[spriteId].oam.matrixNum].c << 16) >> 16;
  if (c < 0) c = -c;
  gSprites[spriteId].y2 = c >> 3;
}

export function TrySetSpriteRotScale(sprite: Sprite, recalcCenterVector: boolean, xScale: number, yScale: number, rotation: number): void {
  if (!(sprite.oam.affineMode & 1)) return;
  sprite.affineAnimPaused = true;
  if (recalcCenterVector) CalcCenterToCornerVec(sprite, sprite.oam.shape, sprite.oam.size, sprite.oam.affineMode);
  const m = objAffineSet(xScale, yScale, rotation);
  const i = sprite.oam.matrixNum;
  gOamMatrices[i].a = m.a;
  gOamMatrices[i].b = m.b;
  gOamMatrices[i].c = m.c;
  gOamMatrices[i].d = m.d;
}

export function TryResetSpriteAffineState(sprite: Sprite): void {
  TrySetSpriteRotScale(sprite, true, 0x100, 0x100, 0);
  sprite.affineAnimPaused = false;
  CalcCenterToCornerVec(sprite, sprite.oam.shape, sprite.oam.size, sprite.oam.affineMode);
}

export function ArcTan2Neg(a: number, b: number): number {
  return -ArcTan2(a, b) & 0xffff;
}

export function SetGreyscaleOrOriginalPalette(paletteNum: number, restoreOriginalColor: boolean): void {
  const base = PLTT_ID(paletteNum);
  if (!restoreOriginalColor) {
    for (let i = 0; i < 16; i++) {
      const c = gPlttBufferUnfaded[base + i];
      const average = Math.trunc(((c & 0x1f) + ((c >> 5) & 0x1f) + ((c >> 10) & 0x1f)) / 3);
      gPlttBufferFaded[base + i] = (gPlttBufferFaded[base + i] & 0x8000) | average | (average << 5) | (average << 10);
    }
  } else {
    gPlttBufferFaded.set(gPlttBufferUnfaded.subarray(base, base + 16), base);
  }
}

export function GetBattlePalettesMask(battleBackground: boolean, attacker: boolean, target: boolean, attackerPartner: boolean, targetPartner: boolean, anim1: boolean, anim2: boolean): number {
  const a = animState;
  let selected = 0;
  if (battleBackground) selected = 0xe;
  if (attacker) selected |= 1 << (a.gBattleAnimAttacker + 16);
  if (target) selected |= 1 << (a.gBattleAnimTarget + 16);
  if (attackerPartner && IsBattlerSpriteVisible(a.gBattleAnimAttacker ^ 2)) selected |= 1 << ((a.gBattleAnimAttacker ^ 2) + 16);
  if (targetPartner && IsBattlerSpriteVisible(a.gBattleAnimTarget ^ 2)) selected |= 1 << ((a.gBattleAnimTarget ^ 2) + 16);
  if (anim1) selected |= 1 << BG_ANIM_PAL_1;
  if (anim2) selected |= 1 << BG_ANIM_PAL_2;
  return selected >>> 0;
}

export function GetBattleMonSpritePalettesMask(playerLeft: boolean, playerRight: boolean, foeLeft: boolean, foeRight: boolean): number {
  let selected = 0;
  const add = (pos: number) => {
    const b = GetBattlerAtPosition(pos);
    if (IsBattlerSpriteVisible(b)) selected |= 1 << (b + 16);
  };
  if (playerLeft) add(C.B_POSITION_PLAYER_LEFT);
  if (playerRight) add(C.B_POSITION_PLAYER_RIGHT);
  if (foeLeft) add(C.B_POSITION_OPPONENT_LEFT);
  if (foeRight) add(C.B_POSITION_OPPONENT_RIGHT);
  return selected >>> 0;
}

export function GetSpritePalIdxByBattler(battler: number): number {
  return battler;
}

export function AnimSpriteOnMonPos(sprite: Sprite): void {
  if (!sprite.data[0]) {
    const respect = !animState.gBattleAnimArgs[3];
    if (!animState.gBattleAnimArgs[2]) InitSpritePosToAnimAttacker(sprite, respect);
    else InitSpritePosToAnimTarget(sprite, respect);
    sprite.data[0]++;
  } else if (sprite.animEnded || sprite.affineAnimEnded) {
    DestroySpriteAndMatrix(sprite);
  }
}

export function TranslateAnimSpriteToTargetMonLocation(sprite: Sprite): void {
  const args = animState.gBattleAnimArgs;
  const respectMonPicOffsets = !(args[5] & 0xff00);
  const coordType = !(args[5] & 0xff) ? C.BATTLER_COORD_Y_PIC_OFFSET : C.BATTLER_COORD_Y;
  InitSpritePosToAnimAttacker(sprite, respectMonPicOffsets);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) args[2] = -args[2];
  sprite.data[0] = args[4];
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + args[2];
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, coordType) + args[3];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

export function AnimThrowProjectile(sprite: Sprite): void {
  const args = animState.gBattleAnimArgs;
  InitSpritePosToAnimAttacker(sprite, true);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) args[2] = -args[2];
  sprite.data[0] = args[4];
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + args[2];
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + args[3];
  sprite.data[5] = args[5];
  InitAnimArcTranslation(sprite);
  sprite.callback = (s) => {
    if (TranslateAnimHorizontalArc(s)) DestroyAnimSprite(s);
  };
}

export function AnimTravelDiagonally(sprite: Sprite): void {
  const args = animState.gBattleAnimArgs;
  const r4 = !args[6];
  const coordType = r4 ? C.BATTLER_COORD_Y_PIC_OFFSET : C.BATTLER_COORD_Y;
  let battlerId: number;
  if (!args[5]) {
    InitSpritePosToAnimAttacker(sprite, r4);
    battlerId = animState.gBattleAnimAttacker;
  } else {
    InitSpritePosToAnimTarget(sprite, r4);
    battlerId = animState.gBattleAnimTarget;
  }
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) args[2] = -args[2];
  InitSpritePosToAnimTarget(sprite, r4);
  sprite.data[0] = args[4];
  sprite.data[2] = GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_X_2) + args[2];
  sprite.data[4] = GetBattlerSpriteCoord(battlerId, coordType) + args[3];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

/** gSprites[dst] = gSprites[src] (struct copy), keeping the destination's slot id. */
export function copySprite(dst: Sprite, src: Sprite): void {
  for (const key of Object.keys(src) as (keyof Sprite)[]) {
    if (key === "id" || key === "data") continue;
    (dst as unknown as Record<string, unknown>)[key] = (src as unknown as Record<string, unknown>)[key];
  }
  dst.oam = { ...src.oam };
  dst.data.set(src.data);
}

export function CloneBattlerSpriteWithBlend(animBattler: number): number {
  const spriteId = GetAnimBattlerSpriteId(animBattler);
  if (spriteId !== SPRITE_NONE) {
    for (let i = 0; i < MAX_SPRITES; i++) {
      if (!gSprites[i].inUse) {
        copySprite(gSprites[i], gSprites[spriteId]);
        gSprites[i].oam.objMode = ST_OAM_OBJ_BLEND;
        gSprites[i].invisible = false;
        return i;
      }
    }
  }
  return -1;
}

export function DestroySpriteWithActiveSheet(sprite: Sprite): void {
  sprite.usingSheet = true;
  DestroySprite(sprite);
}

export function AnimTask_AlphaFadeIn(taskId: number): void {
  const args = animState.gBattleAnimArgs;
  const t = tasks.tasks[taskId];
  let v1 = 0;
  let v2 = 0;
  if (args[2] > args[0]) v2 = 1;
  if (args[2] < args[0]) v2 = -1;
  if (args[3] > args[1]) v1 = 1;
  if (args[3] < args[1]) v1 = -1;
  t.data[0] = 0;
  t.data[1] = args[4];
  t.data[2] = 0;
  t.data[3] = args[0];
  t.data[4] = args[1];
  t.data[5] = v2;
  t.data[6] = v1;
  t.data[7] = args[2];
  t.data[8] = args[3];
  SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(args[0], args[1]));
  t.func = AnimTask_AlphaFadeIn_Step;
}

function AnimTask_AlphaFadeIn_Step(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  if (++d[0] > d[1]) {
    d[0] = 0;
    if (++d[2] & 1) {
      if (d[3] !== d[7]) d[3] += d[5];
    } else if (d[4] !== d[8]) {
      d[4] += d[6];
    }
    SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[3], d[4]));
    if (d[3] === d[7] && d[4] === d[8]) DestroyAnimVisualTask(taskId);
  }
}

export function AnimTask_BlendMonInAndOut(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(animState.gBattleAnimArgs[0]);
  if (spriteId === 0xff) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  tasks.tasks[taskId].data[0] = OBJ_PLTT_ID(gSprites[spriteId].oam.paletteNum) + 1;
  AnimTask_BlendMonInAndOutSetup(tasks.tasks[taskId]);
}

function AnimTask_BlendMonInAndOutSetup(task: Task): void {
  const args = animState.gBattleAnimArgs;
  task.data[1] = args[1];
  task.data[2] = 0;
  task.data[3] = args[2];
  task.data[4] = 0;
  task.data[5] = args[3];
  task.data[6] = 0;
  task.data[7] = args[4];
  task.func = AnimTask_BlendMonInAndOut_Step;
}

function AnimTask_BlendMonInAndOut_Step(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  if (++d[4] >= d[5]) {
    d[4] = 0;
    if (!d[6]) {
      d[2]++;
      BlendPalette(d[0], 15, d[2], d[1]);
      if (d[2] === d[3]) d[6] = 1;
    } else {
      d[2]--;
      BlendPalette(d[0], 15, d[2], d[1]);
      if (!d[2]) {
        if (--d[7]) {
          d[4] = 0;
          d[6] = 0;
        } else {
          DestroyAnimVisualTask(taskId);
        }
      }
    }
  }
}

export function AnimTask_BlendPalInAndOutByTag(taskId: number): void {
  const palette = IndexOfSpritePaletteTag(animState.gBattleAnimArgs[0]);
  if (palette === 0xff) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  tasks.tasks[taskId].data[0] = palette * 0x10 + 0x101;
  AnimTask_BlendMonInAndOutSetup(tasks.tasks[taskId]);
}

// Affine anims driven from task data: data[13]/[14] hold a handle to the command list.
const affineAnimRegistry: AffineAnimCmd[][] = [];

export function PrepareAffineAnimInTaskData(task: Task, spriteId: number, affineAnimCmds: AffineAnimCmd[]): void {
  task.data[7] = 0;
  task.data[8] = 0;
  task.data[9] = 0;
  task.data[15] = spriteId;
  task.data[10] = 0x100;
  task.data[11] = 0x100;
  task.data[12] = 0;
  let handle = affineAnimRegistry.indexOf(affineAnimCmds);
  if (handle < 0) handle = affineAnimRegistry.push(affineAnimCmds) - 1;
  task.data[13] = handle & 0xffff;
  task.data[14] = handle >> 16;
  PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_NORMAL);
}

export function RunAffineAnimFromTaskData(task: Task): boolean {
  const cmds = affineAnimRegistry[(task.data[13] & 0xffff) | (task.data[14] << 16)];
  let idx = task.data[7];
  let cmd = cmds[idx];
  switch (cmd.type) {
    default:
      if (!cmd.duration) {
        task.data[10] = cmd.xScale;
        task.data[11] = cmd.yScale;
        task.data[12] = cmd.rotation;
        task.data[7]++;
        cmd = cmds[++idx];
      }
      task.data[10] = ((task.data[10] + cmd.xScale) << 16) >> 16;
      task.data[11] = ((task.data[11] + cmd.yScale) << 16) >> 16;
      task.data[12] = ((task.data[12] + cmd.rotation) << 16) >> 16;
      SetSpriteRotScale(task.data[15], task.data[10], task.data[11], task.data[12]);
      SetBattlerSpriteYOffsetFromYScale(task.data[15]);
      if (++task.data[8] >= cmd.duration) {
        task.data[8] = 0;
        task.data[7]++;
      }
      break;
    case 0x7ffe: // AFFINEANIMCMDTYPE_JUMP
      task.data[7] = cmd.target;
      break;
    case 0x7ffd: // AFFINEANIMCMDTYPE_LOOP
      if (cmd.count) {
        if (task.data[9]) {
          if (!--task.data[9]) {
            task.data[7]++;
            break;
          }
        } else {
          task.data[9] = cmd.count;
        }
        if (!task.data[7]) break;
        for (;;) {
          task.data[7]--;
          idx--;
          if (cmds[idx].type === 0x7ffd) {
            task.data[7]++;
            return true;
          }
          if (!task.data[7]) return true;
        }
      }
      task.data[7]++;
      break;
    case 0x7fff: // AFFINEANIMCMDTYPE_END
      gSprites[task.data[15]].y2 = 0;
      ResetSpriteRotScale(task.data[15]);
      return false;
  }
  return true;
}

export function SetBattlerSpriteYOffsetFromYScale(spriteId: number): void {
  const v = MON_PIC_HEIGHT - GetBattlerYDeltaFromSpriteId(spriteId) * 2;
  const d = (gOamMatrices[gSprites[spriteId].oam.matrixNum].d << 16) >> 16;
  let v2 = d ? Math.trunc((v << 8) / d) : 0;
  if (v2 > MON_PIC_HEIGHT * 2) v2 = MON_PIC_HEIGHT * 2;
  gSprites[spriteId].y2 = Math.trunc((v - v2) / 2);
}

export function SetBattlerSpriteYOffsetFromOtherYScale(spriteId: number, otherSpriteId: number): void {
  const v = MON_PIC_HEIGHT - GetBattlerYDeltaFromSpriteId(otherSpriteId) * 2;
  const d = (gOamMatrices[gSprites[spriteId].oam.matrixNum].d << 16) >> 16;
  let v2 = d ? Math.trunc((v << 8) / d) : 0;
  if (v2 > MON_PIC_HEIGHT * 2) v2 = MON_PIC_HEIGHT * 2;
  gSprites[spriteId].y2 = Math.trunc((v - v2) / 2);
}

function GetBattlerYDeltaFromSpriteId(spriteId: number): number {
  const battlerId = gSprites[spriteId].data[0];
  for (let i = 0; i < 4; i++) {
    if (gBattlerSpriteIds[i] !== spriteId) continue;
    const info = gBattleSpritesDataPtr.battlerData[battlerId];
    if (GetBattlerSide(i) === C.B_SIDE_PLAYER) {
      const species = info.transformSpecies ? info.transformSpecies : GetMonData(playerMon(gBattlerPartyIndexes[i]), C.MON_DATA_SPECIES);
      return gMonBackPicCoords()[species].y_offset;
    }
    const species = info.transformSpecies ? info.transformSpecies : GetMonData(gEnemyParty[gBattlerPartyIndexes[i]], C.MON_DATA_SPECIES);
    return gMonFrontPicCoords()[species].y_offset;
  }
  return MON_PIC_HEIGHT;
}

export function BattleAnimHelper_SetSpriteSquashParams(task: Task, spriteId: number, xScaleStart: number, yScaleStart: number, xScaleEnd: number, yScaleEnd: number, duration: number): void {
  task.data[8] = duration;
  task.data[15] = spriteId;
  task.data[9] = xScaleStart;
  task.data[10] = yScaleStart;
  task.data[13] = xScaleEnd;
  task.data[14] = yScaleEnd;
  task.data[11] = Math.trunc((xScaleEnd - xScaleStart) / duration);
  task.data[12] = Math.trunc((yScaleEnd - yScaleStart) / duration);
}

export function BattleAnimHelper_RunSpriteSquash(task: Task): number {
  if (!task.data[8]) return 0;
  if (--task.data[8] !== 0) {
    task.data[9] += task.data[11];
    task.data[10] += task.data[12];
  } else {
    task.data[9] = task.data[13];
    task.data[10] = task.data[14];
  }
  SetSpriteRotScale(task.data[15], task.data[9], task.data[10], 0);
  if (task.data[8]) SetBattlerSpriteYOffsetFromYScale(task.data[15]);
  else gSprites[task.data[15]].y2 = 0;
  return task.data[8];
}

export function InitPrioritiesForVisibleBattlers(): void {
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (IsBattlerSpriteVisible(i)) {
      gSprites[gBattlerSpriteIds[i]].subpriority = GetBattlerSpriteSubpriority(i);
      gSprites[gBattlerSpriteIds[i]].oam.priority = 2;
    }
  }
}

export function GetBattlerSpriteSubpriority(battlerId: number): number {
  const position = GetBattlerPosition(battlerId);
  if (position === C.B_POSITION_PLAYER_LEFT) return 30;
  if (position === C.B_POSITION_PLAYER_RIGHT) return 20;
  if (position === C.B_POSITION_OPPONENT_LEFT) return 40;
  return 50;
}

export function GetBattlerSpriteBGPriority(battlerId: number): number {
  const position = GetBattlerPosition(battlerId);
  if (position === C.B_POSITION_PLAYER_LEFT || position === C.B_POSITION_OPPONENT_RIGHT) return GetAnimBgAttribute(2, BG_ANIM_PRIORITY);
  return GetAnimBgAttribute(1, BG_ANIM_PRIORITY);
}

export function GetBattlerSpriteBGPriorityRank(battlerId: number): number {
  const position = GetBattlerPosition(battlerId);
  return position === C.B_POSITION_PLAYER_LEFT || position === C.B_POSITION_OPPONENT_RIGHT ? 2 : 1;
}

const TAG_MOVE_EFFECT_MON_1 = 55125;
const TAG_MOVE_EFFECT_MON_2 = 55126;

export function CreateAdditionalMonSpriteForMoveAnim(species: number, isBackpic: boolean, templateId: number, x: number, y: number, subpriority: number, personality: number, trainerId: number, battlerId: number, ignoreDeoxys: boolean): number {
  const tag = templateId ? TAG_MOVE_EFFECT_MON_2 : TAG_MOVE_EFFECT_MON_1;
  const sheet = LoadSpriteSheet({ data: new Uint8Array(MON_PIC_SIZE), size: MON_PIC_SIZE, tag });
  const palette = AllocSpritePalette(tag);
  const buffer = new Uint8Array(0x2000);
  LoadPalette(GetMonSpritePalFromSpeciesAndPersonality(species, trainerId, personality), OBJ_PLTT_ID(palette), PLTT_SIZE_4BPP);
  const dontHandleDeoxys = ignoreDeoxys || gBattleSpritesDataPtr.battlerData[battlerId].transformSpecies !== 0;
  if (dontHandleDeoxys) LoadSpecialPokePic_DontHandleDeoxys(!isBackpic, buffer, species, personality);
  else LoadSpecialPokePic(!isBackpic, buffer, species, personality);
  ppu.vram.set(buffer.subarray(0, 0x800), OBJ_VRAM0 + sheet * 0x20);
  const template: SpriteTemplate = {
    tileTag: tag, paletteTag: tag, oam: oamFrom({ affineMode: 1, shape: 0, size: 3 }), anims: gDummySpriteAnimTable, images: null,
    affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCallbackDummy,
  };
  const yOffset = (!isBackpic ? gMonFrontPicCoords() : gMonBackPicCoords())[species].y_offset;
  return CreateSprite(template, x, y + yOffset, subpriority);
}

export function DestroySpriteAndFreeResources_(sprite: Sprite): void {
  DestroySpriteAndFreeResources(sprite);
}

export function GetBattlerSpriteCoordAttr(battlerId: number, attr: number): number {
  const info = gBattleSpritesDataPtr.battlerData[battlerId];
  const mon = partyMon(battlerId);
  const species = info.transformSpecies ? info.transformSpecies : GetMonData(mon, C.MON_DATA_SPECIES);
  const personality = info.transformSpecies ? gTransformedPersonalities[battlerId] : GetMonData(mon, C.MON_DATA_PERSONALITY);
  let coords: MonCoordsRaw;
  if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) {
    if (species === C.SPECIES_UNOWN) coords = gMonBackPicCoords()[coordsSpecies(species, personality)];
    else if (species > C.NUM_SPECIES) coords = gMonBackPicCoords()[0];
    else coords = gMonBackPicCoords()[species];
  } else if (species === C.SPECIES_UNOWN) coords = gMonFrontPicCoords()[coordsSpecies(species, personality)];
  else if (species === C.SPECIES_CASTFORM) coords = gCastformFrontSpriteCoords[gBattleMonForms[battlerId]];
  else if (species > C.NUM_SPECIES) coords = gMonFrontPicCoords()[0];
  else coords = gMonFrontPicCoords()[species];
  const size = cexpr(coords.size);
  const height = (size & 0xf) * 8;
  const width = (size >> 4) * 8;
  switch (attr) {
    case C.BATTLER_COORD_ATTR_HEIGHT: return height;
    case C.BATTLER_COORD_ATTR_WIDTH: return width;
    case C.BATTLER_COORD_ATTR_LEFT: return GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_X_2) - (width >> 1);
    case C.BATTLER_COORD_ATTR_RIGHT: return GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_X_2) + (width >> 1);
    case C.BATTLER_COORD_ATTR_TOP: return GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y_PIC_OFFSET) - (height >> 1);
    case C.BATTLER_COORD_ATTR_BOTTOM: return GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y_PIC_OFFSET) + (height >> 1);
    case C.BATTLER_COORD_ATTR_RAW_BOTTOM: return GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y) + 31 - coords.y_offset;
    default: return 0;
  }
}

export function SetAverageBattlerPositions(battlerId: number, respectMonPicOffsets: boolean): { x: number; y: number } {
  const xType = respectMonPicOffsets ? C.BATTLER_COORD_X_2 : C.BATTLER_COORD_X;
  const yType = respectMonPicOffsets ? C.BATTLER_COORD_Y_PIC_OFFSET : C.BATTLER_COORD_Y;
  const bx = GetBattlerSpriteCoord(battlerId, xType);
  const by = GetBattlerSpriteCoord(battlerId, yType);
  const px = IsDoubleBattle() ? GetBattlerSpriteCoord(battlerId ^ 2, xType) : bx;
  const py = IsDoubleBattle() ? GetBattlerSpriteCoord(battlerId ^ 2, yType) : by;
  return { x: Math.trunc((bx + px) / 2), y: Math.trunc((by + py) / 2) };
}

export function CreateInvisibleSpriteCopy(_battlerId: number, spriteId: number, _species: number): number {
  const newSpriteId = CreateInvisibleSprite(SpriteCallbackDummy);
  copySprite(gSprites[newSpriteId], gSprites[spriteId]);
  const s = gSprites[newSpriteId];
  s.usingSheet = true;
  s.oam.priority = 0;
  s.oam.objMode = ST_OAM_OBJ_WINDOW;
  s.oam.tileNum = gSprites[spriteId].oam.tileNum;
  s.callback = SpriteCallbackDummy;
  return newSpriteId;
}

// ---------------------------------------------------------------- gMultiuseSpriteTemplate (pokemon.c)

let multiuse: SpriteTemplate | null = null;

/** gMultiuseSpriteTemplate (a copy the controllers pass to CreateSprite). */
export function gMultiuseSpriteTemplate(): SpriteTemplate {
  return multiuse ?? battlerTemplates()[0];
}

const battlerSpriteCallbacks = () => ({ SpriteCB_AllyMon, SpriteCB_EnemyMon });

/** gMonSpritesGfxPtr->templates[i]: gSpriteTemplates_Battlers[i] with images pointing at the decompression buffers. */
function battlerTemplates(): SpriteTemplate[] {
  const templates = cdata<CSpriteTemplate[]>("pokemon", "gSpriteTemplates_Battlers");
  return templates.map((t, i) => {
    const images: SpriteFrameImage[] = [0, 1, 2, 3].map((j) => ({ data: gMonSpritesGfxPtr.sprites[i].subarray(j * 0x800, (j + 1) * 0x800), size: 0x800 }));
    return templateFrom(t, battlerSpriteCallbacks(), images);
  });
}

let monPicAnims: AnimCmd[][] | null = null;
const gAnims_MonPic = () => (monPicAnims ??= animsFrom({ $sym: "gAnims_MonPic" }));

export function SetMultiuseSpriteTemplateToPokemon(speciesTag: number, battlerPosition: number): void {
  if (battlerPosition >= 4) battlerPosition = 0;
  multiuse = { ...battlerTemplates()[battlerPosition], paletteTag: speciesTag, anims: gAnims_MonPic() };
}

/** SpriteFrameImage table from a C initializer: [ptr, size, ptr, size, ...]. */
function frameImagesFrom(ref: unknown): SpriteFrameImage[] {
  const raw = cdata<unknown[]>("data", (ref as { $sym: string }).$sym);
  const out: SpriteFrameImage[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const size = raw[i + 1] as number;
    out.push({ data: symBytes(raw[i]).subarray(0, size), size });
  }
  return out;
}

export function SetMultiuseSpriteTemplateToTrainerBack(trainerSpriteId: number, battlerPosition: number): void {
  if (battlerPosition === C.B_POSITION_PLAYER_LEFT || battlerPosition === C.B_POSITION_PLAYER_RIGHT) {
    const t = cdata<CSpriteTemplate[]>("pokemon", "sTrainerBackSpriteTemplates")[trainerSpriteId];
    const anims = animsFrom(cdata<unknown[]>("data", "gTrainerBackAnimsPtrTable")[trainerSpriteId]);
    multiuse = { ...templateFrom(t, battlerSpriteCallbacks(), frameImagesFrom(t.images)), anims };
  } else {
    const anims = animsFrom(cdata<unknown[]>("data", "gTrainerFrontAnimsPtrTable")[trainerSpriteId]);
    multiuse = { ...battlerTemplates()[battlerPosition], anims };
  }
}

export function SetMultiuseSpriteTemplateToTrainerFront(trainerPicId: number, battlerPosition: number): void {
  SetMultiuseSpriteTemplateToTrainerBack(trainerPicId, battlerPosition);
}

// ---------------------------------------------------------------- gfx_sfx_util.c: SpriteCB_TrainerSlideIn

export function SpriteCB_TrainerSlideIn(sprite: Sprite): void {
  if (!(G.gIntroSlideFlags & 1)) {
    sprite.x2 += sprite.data[0];
    if (sprite.x2 === 0) sprite.callback = SpriteCallbackDummy;
  }
}

// pokemon_special_anim_scene.c: level-up vertical sprites live in ../pokemonSpecialAnim.
export { CreateLevelUpVerticalSpritesTask, LevelUpVerticalSpritesTaskIsRunning } from "../pokemonSpecialAnim";
