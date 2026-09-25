// battle_anim.c: the animation script interpreter (sScriptCmdTable, 48 opcodes)
// and its helper tasks (mon-to-BG updates, background fades, SE panning).
// Scripts come from the assembled data/battle_anim_scripts.s (battle/anims.bin);
// template, task and sound-task operands are EXTERN_BASE references resolved to
// symbol names, then to cdata templates / registered functions (animRegistry.ts).
// Adaptations: the m4a panpot (SE12PanpotControl) is not spatialized by the
// audio backend; contests never occur (IsContest is FALSE as in FRLG).

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { tasks } from "../gba/tasks";
import { ROM_BASE, bs } from "./bscript";
import {
  ANIM_ATK_PARTNER, ANIM_ATTACKER, ANIM_DEF_PARTNER, ANIM_TARGET,
  animState, DestroyAnimSprite, GetAnimBattlerSpriteId, GetBattleAnimBg1Data, GetBattlerSpriteBGPriorityRank,
  GetBattlerSpriteCoord, GetBattlerSpriteSubpriority, InitPrioritiesForVisibleBattlers, IsBattlerSpriteVisible,
  MoveBattlerSpriteToBG, ResetBattleAnimBg,
} from "./anim";
import { UpdateOamPriorityInAllHealthboxes } from "./interface";
import { cdata, cdataAny, incbin, symName, type SymRef } from "../hw/assets";
import { templateFrom, type CSpriteTemplate } from "../hw/cdataSprite";
import { SetGpuReg } from "../hw/gpu";
import {
  BLDCNT_EFFECT_BLEND, BLDCNT_TGT2_ALL, ppu, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT,
} from "../hw/ppu";
import { BeginHardwarePaletteFade, BG_PLTT_ID, gPaletteFade, gPlttBufferFaded, LoadPalette, OBJ_PLTT_ID, PLTT_SIZE_4BPP } from "../hw/palette";
import {
  CreateSpriteAndAnimate, FreeSpritePaletteByTag, FreeSpriteTilesByTag, gSprites, LoadSpritePalette, LoadSpriteSheet, SPRITE_NONE,
  type Sprite, type SpriteTemplate,
} from "../hw/sprite";
import { BG_ANIM_PRIORITY, SetAnimBgAttribute } from "./intro";
import { G, gBattleSpritesDataPtr, gBattlerSpriteIds } from "./globals";
import { GetBattlerPosition, GetBattlerSide } from "./util";
import { runAnimTask } from "./animTasks";
import { ANIM_SPRITE_CALLBACKS } from "./animRegistry";
import { DrawMainBattleBackground } from "./bg";

const ANIM_SPRITES_START = 10000;
const ANIMSPRITE_IS_TARGET = 1 << 7;
const TASK_NONE = 0xff;
const BIT_FLANK = 2;
const GET_TRUE_SPRITE_INDEX = (i: number) => i - ANIM_SPRITES_START;
const BG_CHAR_ADDR = (n: number) => n * 0x4000;
const BG_SCREEN_ADDR = (n: number) => n * 0x800;

const gTasks = tasks.tasks; // stable array (TaskManager.tasks is never reassigned)

// Script return address (sBattleAnimScriptRetAddr).
let sBattleAnimScriptRetAddr = 0;

// ---------------------------------------------------------------- script reads

function scriptByte(offset = 0): number {
  return bs.animsView.getUint8(animState.sBattleAnimScriptPtr + offset - ROM_BASE);
}

function scriptS8(offset = 0): number {
  return (scriptByte(offset) << 24) >> 24;
}

/** T1_READ_16 */
function T1_READ_16(offset = 0): number {
  return bs.animsView.getUint16(animState.sBattleAnimScriptPtr + offset - ROM_BASE, true);
}

/** T2_READ_32 / T2_READ_PTR */
function T2_READ_32(offset = 0): number {
  return bs.animsView.getUint32(animState.sBattleAnimScriptPtr + offset - ROM_BASE, true) >>> 0;
}

/** Resolve an EXTERN_BASE operand (sprite template / task function) to its symbol name. */
function externName(ptr: number): string {
  const meta = bs.animsMeta;
  const rel = ptr - 0x0f000000;
  const name = meta.externals[rel >>> meta.externShift];
  if (name === undefined) throw new Error(`unknown anim extern ${ptr.toString(16)}`);
  return name;
}

// ---------------------------------------------------------------- gBattleAnimPicTable / gBattleAnimPaletteTable

export type CompressedSpriteSheet = { data: SymRef; size: number; tag: number };
export type CompressedSpritePalette = { data: SymRef; tag: number };

export function gBattleAnimPicTable(index: number): CompressedSpriteSheet {
  return cdata<CompressedSpriteSheet[]>("battle_anim", "gBattleAnimPicTable")[index];
}

export function gBattleAnimPaletteTable(index: number): CompressedSpritePalette {
  return cdata<CompressedSpritePalette[]>("battle_anim", "gBattleAnimPaletteTable")[index];
}

export function LoadCompressedSpriteSheetUsingHeap(src: CompressedSpriteSheet): void {
  LoadSpriteSheet({ data: incbin(symName(src.data)!), size: src.size, tag: src.tag });
}

export function LoadCompressedSpritePaletteUsingHeap(src: CompressedSpritePalette): void {
  LoadSpritePalette({ data: incbin(symName(src.data)!), tag: src.tag });
}

// ---------------------------------------------------------------- templates

const missingCallbacks = new Set<string>();
const templateCache = new Map<string, SpriteTemplate>();

/** Stand-in for a sprite callback whose battle_anim_*.c port has not landed: ends the sprite so scripts keep running. */
function SpriteCB_MissingAnimCallback(sprite: Sprite): void {
  DestroyAnimSprite(sprite);
}

function animSpriteTemplate(name: string): SpriteTemplate | null {
  const cached = templateCache.get(name);
  if (cached) return cached;
  const source = cdataAny<CSpriteTemplate>(name);
  if (!source) {
    console.warn(`battle anim sprite template not loaded: ${name}`);
    return null;
  }
  const cb = symName(source.callback);
  if (cb && !ANIM_SPRITE_CALLBACKS[cb] && cb !== "SpriteCallbackDummy") {
    if (!missingCallbacks.has(cb)) {
      missingCallbacks.add(cb);
      console.warn(`battle anim sprite callback not implemented: ${cb}`);
    }
    // Not cached, so the real callback is picked up once its module registers it.
    return templateFrom(source, { [cb]: SpriteCB_MissingAnimCallback });
  }
  const template = templateFrom(source, ANIM_SPRITE_CALLBACKS);
  templateCache.set(name, template);
  return template;
}

// ---------------------------------------------------------------- interpreter

export function RunAnimScriptCommand(): void {
  do {
    sScriptCmdTable[scriptByte()]();
  } while (animState.sAnimFramesToWait === 0 && animState.gAnimScriptActive);
}

export function WaitAnimFrameCount(): void {
  if (animState.sAnimFramesToWait <= 0) {
    animState.gAnimScriptCallback = RunAnimScriptCommand;
    animState.sAnimFramesToWait = 0;
  } else {
    animState.sAnimFramesToWait--;
  }
}

function AddSpriteIndex(index: number): void {
  const arr = animState.sAnimSpriteIndexArray;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0xffff) {
      arr[i] = index;
      return;
    }
  }
}

function ClearSpriteIndex(index: number): void {
  const arr = animState.sAnimSpriteIndexArray;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === index) {
      arr[i] = 0xffff;
      return;
    }
  }
}

function Cmd_loadspritegfx(): void {
  animState.sBattleAnimScriptPtr++;
  const index = T1_READ_16();
  LoadCompressedSpriteSheetUsingHeap(gBattleAnimPicTable(GET_TRUE_SPRITE_INDEX(index)));
  LoadCompressedSpritePaletteUsingHeap(gBattleAnimPaletteTable(GET_TRUE_SPRITE_INDEX(index)));
  animState.sBattleAnimScriptPtr += 2;
  AddSpriteIndex(GET_TRUE_SPRITE_INDEX(index));
  animState.sAnimFramesToWait = 1;
  animState.gAnimScriptCallback = WaitAnimFrameCount;
}

function Cmd_unloadspritegfx(): void {
  animState.sBattleAnimScriptPtr++;
  const index = T1_READ_16();
  FreeSpriteTilesByTag(gBattleAnimPicTable(GET_TRUE_SPRITE_INDEX(index)).tag);
  FreeSpritePaletteByTag(gBattleAnimPicTable(GET_TRUE_SPRITE_INDEX(index)).tag);
  animState.sBattleAnimScriptPtr += 2;
  ClearSpriteIndex(GET_TRUE_SPRITE_INDEX(index));
}

// Create sprite from template and init data array with varargs
// args: template, flags, va_args
// flags:
//  - bits 0-6: subpriority mod (signed)
//  - bit 7: target if set else attacker
function Cmd_createsprite(): void {
  animState.sBattleAnimScriptPtr++;
  const template = externName(T2_READ_32());
  animState.sBattleAnimScriptPtr += 4;
  let argVar = scriptByte();
  animState.sBattleAnimScriptPtr++;
  const argsCount = scriptByte();
  animState.sBattleAnimScriptPtr++;
  for (let i = 0; i < argsCount; i++) {
    animState.gBattleAnimArgs[i] = T1_READ_16();
    animState.sBattleAnimScriptPtr += 2;
  }
  let subpriority: number;
  if (argVar & ANIMSPRITE_IS_TARGET) {
    argVar ^= ANIMSPRITE_IS_TARGET;
    if (argVar >= 64) argVar -= 64;
    else argVar = (argVar * -1) & 0xff;
    subpriority = GetBattlerSpriteSubpriority(animState.gBattleAnimTarget) + ((argVar << 24) >> 24);
  } else {
    if (argVar >= 64) argVar -= 64;
    else argVar = (argVar * -1) & 0xff;
    subpriority = GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker) + ((argVar << 24) >> 24);
  }
  subpriority = (subpriority << 16) >> 16;
  if (subpriority < 3) subpriority = 3;
  const t = animSpriteTemplate(template);
  if (t) {
    CreateSpriteAndAnimate(
      t,
      GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2),
      GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET),
      subpriority & 0xff,
    );
    animState.gAnimVisualTaskCount++;
  }
}

function Cmd_createvisualtask(): void {
  animState.sBattleAnimScriptPtr++;
  const taskFunc = externName(T2_READ_32());
  animState.sBattleAnimScriptPtr += 4;
  const taskPriority = scriptByte();
  animState.sBattleAnimScriptPtr++;
  const numArgs = scriptByte();
  animState.sBattleAnimScriptPtr++;
  for (let i = 0; i < numArgs; i++) {
    animState.gBattleAnimArgs[i] = T1_READ_16();
    animState.sBattleAnimScriptPtr += 2;
  }
  runAnimTask(taskFunc, taskPriority);
}

function Cmd_delay(): void {
  animState.sBattleAnimScriptPtr++;
  animState.sAnimFramesToWait = scriptByte();
  if (animState.sAnimFramesToWait === 0) animState.sAnimFramesToWait = -1;
  animState.sBattleAnimScriptPtr++;
  animState.gAnimScriptCallback = WaitAnimFrameCount;
}

function Cmd_waitforvisualfinish(): void {
  if (animState.gAnimVisualTaskCount === 0) {
    animState.sBattleAnimScriptPtr++;
    animState.sAnimFramesToWait = 0;
  } else {
    animState.sAnimFramesToWait = 1;
  }
}

function Cmd_nop(): void {}

function Cmd_nop2(): void {}

function Cmd_end(): void {
  const a = animState;
  const continuousAnim = false;

  // Keep waiting as long as there are animations to be done.
  if (a.gAnimVisualTaskCount !== 0 || a.gAnimSoundTaskCount !== 0
    || a.sMonAnimTaskIdArray[0] !== TASK_NONE || a.sMonAnimTaskIdArray[1] !== TASK_NONE) {
    a.sSoundAnimFramesToWait = 0;
    a.sAnimFramesToWait = 1;
    return;
  }

  // Finish the sound effects.
  if (sound.isSEPlaying()) {
    if (++a.sSoundAnimFramesToWait <= 90) { // Wait 90 frames, then halt the sound effect.
      a.sAnimFramesToWait = 1;
      return;
    } else {
      sound.stopSE(0);
    }
  }

  // The SE has halted, so set the SE Frame Counter to 0 and continue.
  a.sSoundAnimFramesToWait = 0;

  for (let i = 0; i < a.sAnimSpriteIndexArray.length; i++) {
    if (a.sAnimSpriteIndexArray[i] !== 0xffff) {
      FreeSpriteTilesByTag(gBattleAnimPicTable(a.sAnimSpriteIndexArray[i]).tag);
      FreeSpritePaletteByTag(gBattleAnimPicTable(a.sAnimSpriteIndexArray[i]).tag);
      a.sAnimSpriteIndexArray[i] = 0xffff; // set terminator.
    }
  }

  if (!continuousAnim) {
    sound.setBgmVolume(256);
    InitPrioritiesForVisibleBattlers();
    UpdateOamPriorityInAllHealthboxes(1);
    a.gAnimScriptActive = false;
  }
}

function Cmd_playse(): void {
  animState.sBattleAnimScriptPtr++;
  sound.playSE(T1_READ_16());
  animState.sBattleAnimScriptPtr += 2;
}

function monBgPosition(battlerId: number): boolean {
  const position = GetBattlerPosition(battlerId);
  return !(position === C.B_POSITION_OPPONENT_LEFT || position === C.B_POSITION_PLAYER_RIGHT);
}

function createMonBgTask(battlerId: number, toBG_2: boolean): number {
  MoveBattlerSpriteToBG(battlerId, toBG_2);
  const spriteId = gBattlerSpriteIds[battlerId];
  const taskId = tasks.create(Task_InitUpdateMonBg, 10);
  const d = gTasks[taskId].data;
  d[0] = spriteId;
  d[1] = gSprites[spriteId].x + gSprites[spriteId].x2;
  d[2] = gSprites[spriteId].y + gSprites[spriteId].y2;
  if (!toBG_2) {
    d[3] = G.gBattle_BG1_X;
    d[4] = G.gBattle_BG1_Y;
  } else {
    d[3] = G.gBattle_BG2_X;
    d[4] = G.gBattle_BG2_Y;
  }
  d[5] = toBG_2 ? 1 : 0;
  d[6] = battlerId;
  return taskId;
}

function Cmd_monbg(): void {
  animState.sBattleAnimScriptPtr++;
  let animBattler = scriptByte();
  if (animBattler === ANIM_ATTACKER) animBattler = ANIM_ATK_PARTNER;
  else if (animBattler === ANIM_TARGET) animBattler = ANIM_DEF_PARTNER;

  let battlerId = animBattler === ANIM_ATTACKER || animBattler === ANIM_ATK_PARTNER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;

  // Move designated battler to background
  if (IsBattlerSpriteVisible(battlerId)) animState.sMonAnimTaskIdArray[0] = createMonBgTask(battlerId, monBgPosition(battlerId));

  battlerId ^= BIT_FLANK;
  if (animBattler > ANIM_TARGET && IsBattlerSpriteVisible(battlerId)) animState.sMonAnimTaskIdArray[1] = createMonBgTask(battlerId, monBgPosition(battlerId));

  animState.sBattleAnimScriptPtr++;
}

function Task_InitUpdateMonBg(taskId: number): void {
  const d = gTasks[taskId].data;
  const spriteId = d[0];
  const palIndex = d[6] & 0xff;
  const animBg = GetBattleAnimBg1Data();
  const x = ((d[1] - (gSprites[spriteId].x + gSprites[spriteId].x2)) << 16) >> 16;
  const y = ((d[2] - (gSprites[spriteId].y + gSprites[spriteId].y2)) << 16) >> 16;
  if (d[5] === 0) {
    G.gBattle_BG1_X = (x + d[3]) & 0xffff;
    G.gBattle_BG1_Y = (y + d[4]) & 0xffff;
    gPlttBufferFaded.copyWithin(BG_PLTT_ID(animBg.paletteId), OBJ_PLTT_ID(palIndex), OBJ_PLTT_ID(palIndex) + 16);
  } else {
    G.gBattle_BG2_X = (x + d[3]) & 0xffff;
    G.gBattle_BG2_Y = (y + d[4]) & 0xffff;
    gPlttBufferFaded.copyWithin(BG_PLTT_ID(9), OBJ_PLTT_ID(palIndex), OBJ_PLTT_ID(palIndex) + 16);
  }
}

function Cmd_clearmonbg(): void {
  animState.sBattleAnimScriptPtr++;
  let animBattlerId = scriptByte();
  if (animBattlerId === ANIM_ATTACKER) animBattlerId = ANIM_ATK_PARTNER;
  else if (animBattlerId === ANIM_TARGET) animBattlerId = ANIM_DEF_PARTNER;

  const battlerId = animBattlerId === ANIM_ATTACKER || animBattlerId === ANIM_ATK_PARTNER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;

  if (animState.sMonAnimTaskIdArray[0] !== TASK_NONE) gSprites[gBattlerSpriteIds[battlerId]].invisible = false;
  if (animBattlerId > ANIM_TARGET && animState.sMonAnimTaskIdArray[1] !== TASK_NONE) gSprites[gBattlerSpriteIds[battlerId ^ BIT_FLANK]].invisible = false;
  else animBattlerId = ANIM_ATTACKER;

  const taskId = tasks.create(Task_ClearMonBg, 5);
  gTasks[taskId].data[0] = animBattlerId;
  gTasks[taskId].data[2] = battlerId;

  animState.sBattleAnimScriptPtr++;
}

function Task_ClearMonBg(taskId: number): void {
  const d = gTasks[taskId].data;
  d[1]++;
  if (d[1] !== 1) {
    const toBG_2 = monBgPosition(d[2] & 0xff);
    if (animState.sMonAnimTaskIdArray[0] !== TASK_NONE) {
      ResetBattleAnimBg(toBG_2);
      tasks.destroy(animState.sMonAnimTaskIdArray[0]);
      animState.sMonAnimTaskIdArray[0] = TASK_NONE;
    }
    if (d[0] > 1) {
      ResetBattleAnimBg(!toBG_2);
      tasks.destroy(animState.sMonAnimTaskIdArray[1]);
      animState.sMonAnimTaskIdArray[1] = TASK_NONE;
    }
    tasks.destroy(taskId);
  }
}

// Equivalent to Cmd_monbg but never creates Task_InitUpdateMonBg / Task_UpdateMonBg
function Cmd_monbg_static(): void {
  animState.sBattleAnimScriptPtr++;
  let animBattlerId = scriptByte();
  if (animBattlerId === ANIM_ATTACKER) animBattlerId = ANIM_ATK_PARTNER;
  else if (animBattlerId === ANIM_TARGET) animBattlerId = ANIM_DEF_PARTNER;

  let battlerId = animBattlerId === ANIM_ATTACKER || animBattlerId === ANIM_ATK_PARTNER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;

  if (IsBattlerSpriteVisible(battlerId)) {
    MoveBattlerSpriteToBG(battlerId, monBgPosition(battlerId));
    gSprites[gBattlerSpriteIds[battlerId]].invisible = false;
  }

  battlerId ^= BIT_FLANK;
  if (animBattlerId > ANIM_TARGET && IsBattlerSpriteVisible(battlerId)) {
    MoveBattlerSpriteToBG(battlerId, monBgPosition(battlerId));
    gSprites[gBattlerSpriteIds[battlerId]].invisible = false;
  }
  animState.sBattleAnimScriptPtr++;
}

function Cmd_clearmonbg_static(): void {
  animState.sBattleAnimScriptPtr++;
  let animBattlerId = scriptByte();
  if (animBattlerId === ANIM_ATTACKER) animBattlerId = ANIM_ATK_PARTNER;
  else if (animBattlerId === ANIM_TARGET) animBattlerId = ANIM_DEF_PARTNER;

  const battlerId = animBattlerId === ANIM_ATTACKER || animBattlerId === ANIM_ATK_PARTNER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;

  if (IsBattlerSpriteVisible(battlerId)) gSprites[gBattlerSpriteIds[battlerId]].invisible = false;
  if (animBattlerId > ANIM_TARGET && IsBattlerSpriteVisible(battlerId ^ BIT_FLANK)) gSprites[gBattlerSpriteIds[battlerId ^ BIT_FLANK]].invisible = false;
  else animBattlerId = ANIM_ATTACKER;

  const taskId = tasks.create(Task_ClearMonBgStatic, 5);
  gTasks[taskId].data[0] = animBattlerId;
  gTasks[taskId].data[2] = battlerId;

  animState.sBattleAnimScriptPtr++;
}

function Task_ClearMonBgStatic(taskId: number): void {
  const d = gTasks[taskId].data;
  d[1]++;
  if (d[1] !== 1) {
    const battlerId = d[2] & 0xff;
    const toBG_2 = monBgPosition(battlerId);
    if (IsBattlerSpriteVisible(battlerId)) ResetBattleAnimBg(toBG_2);
    if (d[0] > 1 && IsBattlerSpriteVisible(battlerId ^ BIT_FLANK)) ResetBattleAnimBg(!toBG_2);
    tasks.destroy(taskId);
  }
}

function Cmd_setalpha(): void {
  animState.sBattleAnimScriptPtr++;
  const half1 = scriptByte(0);
  const half2 = scriptByte(1) << 8;
  animState.sBattleAnimScriptPtr += 2;
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_ALL);
  SetGpuReg(REG_OFFSET_BLDALPHA, half1 | half2);
}

function Cmd_setbldcnt(): void {
  animState.sBattleAnimScriptPtr++;
  const half1 = scriptByte(0);
  const half2 = scriptByte(1) << 8;
  animState.sBattleAnimScriptPtr += 2;
  SetGpuReg(REG_OFFSET_BLDCNT, half1 | half2);
}

function Cmd_blendoff(): void {
  animState.sBattleAnimScriptPtr++;
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
}

function Cmd_call(): void {
  animState.sBattleAnimScriptPtr++;
  sBattleAnimScriptRetAddr = animState.sBattleAnimScriptPtr + 4;
  animState.sBattleAnimScriptPtr = T2_READ_32();
}

function Cmd_return(): void {
  animState.sBattleAnimScriptPtr = sBattleAnimScriptRetAddr;
}

function Cmd_setarg(): void {
  const addr = animState.sBattleAnimScriptPtr;
  animState.sBattleAnimScriptPtr++;
  const argId = scriptByte();
  animState.sBattleAnimScriptPtr++;
  const value = T1_READ_16();
  animState.sBattleAnimScriptPtr = addr + 4;
  animState.gBattleAnimArgs[argId] = value;
}

function Cmd_choosetwoturnanim(): void {
  animState.sBattleAnimScriptPtr++;
  if (animState.gAnimMoveTurn & 1) animState.sBattleAnimScriptPtr += 4;
  animState.sBattleAnimScriptPtr = T2_READ_32();
}

function Cmd_jumpifmoveturn(): void {
  animState.sBattleAnimScriptPtr++;
  const toCheck = scriptByte();
  animState.sBattleAnimScriptPtr++;
  if (toCheck === animState.gAnimMoveTurn) animState.sBattleAnimScriptPtr = T2_READ_32();
  else animState.sBattleAnimScriptPtr += 4;
}

function Cmd_goto(): void {
  animState.sBattleAnimScriptPtr++;
  animState.sBattleAnimScriptPtr = T2_READ_32();
}

export function IsContest(): boolean {
  return false;
}

// Unused
export function IsSpeciesNotUnown(species: number): boolean {
  return species !== C.SPECIES_UNOWN;
}

// Task_FadeToBg data
const tBackgroundId = 0;
const tState = 10;

function Cmd_fadetobg(): void {
  animState.sBattleAnimScriptPtr++;
  const backgroundId = scriptByte();
  animState.sBattleAnimScriptPtr++;
  const taskId = tasks.create(Task_FadeToBg, 5);
  gTasks[taskId].data[tBackgroundId] = backgroundId;
  animState.sAnimBackgroundFadeState = 1;
}

function Cmd_fadetobgfromset(): void {
  animState.sBattleAnimScriptPtr++;
  const bg1 = scriptByte(0);
  const bg2 = scriptByte(1);
  animState.sBattleAnimScriptPtr += 3;
  const taskId = tasks.create(Task_FadeToBg, 5);
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) gTasks[taskId].data[tBackgroundId] = bg2;
  else gTasks[taskId].data[tBackgroundId] = bg1;
  animState.sAnimBackgroundFadeState = 1;
}

function Task_FadeToBg(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[tState] === 0) {
    BeginHardwarePaletteFade(0xe8, 0, 0, 16, 0);
    d[tState]++;
    return;
  }
  if (gPaletteFade.active) return;
  if (d[tState] === 1) {
    d[tState]++;
    animState.sAnimBackgroundFadeState = 2;
  } else if (d[tState] === 2) {
    const bgId = (d[tBackgroundId] << 16) >> 16;
    if (bgId === -1) LoadDefaultBg();
    else LoadMoveBg(bgId);
    BeginHardwarePaletteFade(0xe8, 0, 16, 0, 1);
    d[tState]++;
    return;
  }
  if (gPaletteFade.active) return;
  if (d[tState] === 3) {
    tasks.destroy(taskId);
    animState.sAnimBackgroundFadeState = 0;
  }
}

type BattleAnimBackground = { image: SymRef; palette: SymRef; tilemap: SymRef };

function LoadMoveBg(bgId: number): void {
  const bg = cdata<BattleAnimBackground[]>("battle_anim", "gBattleAnimBackgroundTable")[bgId];
  const tilemap = incbin(symName(bg.tilemap)!);
  ppu.vram.set(tilemap.subarray(0, Math.min(tilemap.length, ppu.vram.length - BG_SCREEN_ADDR(26))), BG_SCREEN_ADDR(26));
  const image = incbin(symName(bg.image)!);
  ppu.vram.set(image.subarray(0, Math.min(image.length, ppu.vram.length - BG_CHAR_ADDR(2))), BG_CHAR_ADDR(2));
  LoadPalette(incbin(symName(bg.palette)!), BG_PLTT_ID(2), PLTT_SIZE_4BPP);
}

function LoadDefaultBg(): void {
  DrawMainBattleBackground();
}

function Cmd_restorebg(): void {
  animState.sBattleAnimScriptPtr++;
  const taskId = tasks.create(Task_FadeToBg, 5);
  gTasks[taskId].data[tBackgroundId] = -1;
  animState.sAnimBackgroundFadeState = 1;
}

function Cmd_waitbgfadeout(): void {
  if (animState.sAnimBackgroundFadeState === 2) {
    animState.sBattleAnimScriptPtr++;
    animState.sAnimFramesToWait = 0;
  } else {
    animState.sAnimFramesToWait = 1;
  }
}

function Cmd_waitbgfadein(): void {
  if (animState.sAnimBackgroundFadeState === 0) {
    animState.sBattleAnimScriptPtr++;
    animState.sAnimFramesToWait = 0;
  } else {
    animState.sAnimFramesToWait = 1;
  }
}

function Cmd_changebg(): void {
  animState.sBattleAnimScriptPtr++;
  LoadMoveBg(scriptByte());
  animState.sBattleAnimScriptPtr++;
}

const s8 = (v: number) => (v << 24) >> 24;

export function BattleAnimAdjustPanning(pan: number): number {
  const { gBattleAnimAttacker, gBattleAnimTarget } = animState;
  if (gBattleSpritesDataPtr.healthBoxesData[gBattleAnimAttacker].statusAnimActive) {
    if (GetBattlerSide(gBattleAnimAttacker) !== C.B_SIDE_PLAYER) pan = C.SOUND_PAN_TARGET;
    else pan = C.SOUND_PAN_ATTACKER;
  } else if (GetBattlerSide(gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    if (GetBattlerSide(gBattleAnimTarget) === C.B_SIDE_PLAYER) {
      if (pan === C.SOUND_PAN_TARGET) pan = C.SOUND_PAN_ATTACKER;
      else if (pan !== C.SOUND_PAN_ATTACKER) pan = s8(pan * -1);
    }
  } else if (GetBattlerSide(gBattleAnimTarget) === C.B_SIDE_OPPONENT) {
    if (pan === C.SOUND_PAN_ATTACKER) pan = C.SOUND_PAN_TARGET;
  } else {
    pan = s8(pan * -1);
  }
  if (pan > C.SOUND_PAN_TARGET) pan = C.SOUND_PAN_TARGET;
  else if (pan < C.SOUND_PAN_ATTACKER) pan = C.SOUND_PAN_ATTACKER;
  return pan;
}

export function BattleAnimAdjustPanning2(pan: number): number {
  const { gBattleAnimAttacker } = animState;
  if (gBattleSpritesDataPtr.healthBoxesData[gBattleAnimAttacker].statusAnimActive) {
    if (GetBattlerSide(gBattleAnimAttacker) !== C.B_SIDE_PLAYER) pan = C.SOUND_PAN_TARGET;
    else pan = C.SOUND_PAN_ATTACKER;
  } else if (GetBattlerSide(gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    pan = s8(-pan);
  }
  return pan;
}

export function KeepPanInRange(panArg: number, _oldPan: number): number {
  let pan = (panArg << 16) >> 16;
  if (pan > C.SOUND_PAN_TARGET) pan = C.SOUND_PAN_TARGET;
  else if (pan < C.SOUND_PAN_ATTACKER) pan = C.SOUND_PAN_ATTACKER;
  return pan;
}

export function CalculatePanIncrement(sourcePan: number, targetPan: number, incrementPan: number): number {
  if (sourcePan < targetPan) return incrementPan < 0 ? -incrementPan : incrementPan;
  if (sourcePan > targetPan) return -(incrementPan < 0 ? -incrementPan : incrementPan);
  return 0;
}

/** sound.c SE12PanpotControl: the WebAudio backend does not pan SEs yet. */
function SE12PanpotControl(_pan: number): void {}

function Cmd_playsewithpan(): void {
  animState.sBattleAnimScriptPtr++;
  const songId = T1_READ_16();
  const pan = scriptS8(2);
  sound.playSEWithPanning(songId, BattleAnimAdjustPanning(pan));
  animState.sBattleAnimScriptPtr += 3;
}

function Cmd_setpan(): void {
  animState.sBattleAnimScriptPtr++;
  const pan = scriptS8();
  SE12PanpotControl(BattleAnimAdjustPanning(pan));
  animState.sBattleAnimScriptPtr++;
}

// Task_PanFromInitialToTarget data
const tInitialPan = 0;
const tTargetPan = 1;
const tIncrementPan = 2;
const tFramesToWait = 3;
const tCurrentPan = 4;
const tFrameCounter = 8;

function startPanTask(songNum: number, currentPan: number, targetPan: number, incrementPan: number, framesToWait: number): void {
  const taskId = tasks.create(Task_PanFromInitialToTarget, 1);
  const d = gTasks[taskId].data;
  d[tInitialPan] = currentPan;
  d[tTargetPan] = targetPan;
  d[tIncrementPan] = incrementPan;
  d[tFramesToWait] = framesToWait;
  d[tCurrentPan] = currentPan;
  sound.playSEWithPanning(songNum, currentPan);
  animState.gAnimSoundTaskCount++;
  animState.sBattleAnimScriptPtr += 6;
}

function Cmd_panse(): void {
  animState.sBattleAnimScriptPtr++;
  const songNum = T1_READ_16();
  const currentPanArg = scriptS8(2);
  let incrementPan = scriptS8(3);
  const incrementPanArg = scriptS8(4);
  const framesToWait = scriptByte(5);
  const currentPan = BattleAnimAdjustPanning(currentPanArg);
  const targetPan = BattleAnimAdjustPanning(incrementPan);
  incrementPan = s8(CalculatePanIncrement(currentPan, targetPan, incrementPanArg));
  startPanTask(songNum, currentPan, targetPan, incrementPan, framesToWait);
}

function Task_PanFromInitialToTarget(taskId: number): void {
  const d = gTasks[taskId].data;
  let destroyTask = false;
  if (d[tFrameCounter]++ >= d[tFramesToWait]) {
    d[tFrameCounter] = 0;
    const initialPanning = d[tInitialPan];
    const targetPanning = d[tTargetPan];
    const currentPan = d[tCurrentPan];
    const incrementPan = d[tIncrementPan];
    let pan = ((currentPan + incrementPan) << 16) >> 16;
    d[tCurrentPan] = pan;
    if (incrementPan === 0) {
      destroyTask = true;
    } else if (initialPanning < targetPanning) {
      if (pan >= targetPanning) destroyTask = true;
    } else { // Panning decreasing.
      if (pan <= targetPanning) destroyTask = true;
    }
    if (destroyTask) {
      pan = targetPanning;
      tasks.destroy(taskId);
      animState.gAnimSoundTaskCount--;
    }
    SE12PanpotControl(pan);
  }
}

function Cmd_panse_adjustnone(): void {
  animState.sBattleAnimScriptPtr++;
  const songId = T1_READ_16();
  const currentPan = scriptS8(2);
  const targetPan = scriptS8(3);
  const incrementPan = scriptS8(4);
  const framesToWait = scriptByte(5);
  startPanTask(songId, currentPan, targetPan, incrementPan, framesToWait);
}

function Cmd_panse_adjustall(): void {
  animState.sBattleAnimScriptPtr++;
  const songId = T1_READ_16();
  const currentPanArg = scriptS8(2);
  const targetPanArg = scriptS8(3);
  const incrementPanArg = scriptS8(4);
  const framesToWait = scriptByte(5);
  const currentPan = BattleAnimAdjustPanning2(currentPanArg);
  const targetPan = BattleAnimAdjustPanning2(targetPanArg);
  const incrementPan = BattleAnimAdjustPanning2(incrementPanArg);
  startPanTask(songId, currentPan, targetPan, incrementPan, framesToWait);
}

function Cmd_loopsewithpan(): void {
  animState.sBattleAnimScriptPtr++;
  const songId = T1_READ_16();
  const panningArg = scriptS8(2);
  const framesToWait = scriptByte(3);
  const numberOfPlays = scriptByte(4);
  const panning = BattleAnimAdjustPanning(panningArg);
  const taskId = tasks.create(Task_LoopAndPlaySE, 1);
  const d = gTasks[taskId].data;
  d[0] = songId; // tSongId
  d[1] = panning; // tPanning
  d[2] = framesToWait; // tFramesToWait
  d[3] = numberOfPlays; // tNumberOfPlays
  d[8] = framesToWait; // tFrameCounter
  gTasks[taskId].func(taskId);
  animState.gAnimSoundTaskCount++;
  animState.sBattleAnimScriptPtr += 5;
}

function Task_LoopAndPlaySE(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[8]++ >= d[2]) {
    d[8] = 0;
    const songId = d[0];
    const panning = d[1];
    const numberOfPlays = (--d[3]) & 0xff;
    sound.playSEWithPanning(songId, panning);
    if (numberOfPlays === 0) {
      tasks.destroy(taskId);
      animState.gAnimSoundTaskCount--;
    }
  }
}

function Cmd_waitplaysewithpan(): void {
  animState.sBattleAnimScriptPtr++;
  const songId = T1_READ_16();
  const panningArg = scriptS8(2);
  const framesToWait = scriptByte(3);
  const panning = BattleAnimAdjustPanning(panningArg);
  const taskId = tasks.create(Task_WaitAndPlaySE, 1);
  const d = gTasks[taskId].data;
  d[0] = songId; // tSongId
  d[1] = panning; // tPanning
  d[2] = framesToWait; // tFramesToWait
  animState.gAnimSoundTaskCount++;
  animState.sBattleAnimScriptPtr += 4;
}

function Task_WaitAndPlaySE(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[2]-- <= 0) {
    sound.playSEWithPanning(d[0], d[1]);
    tasks.destroy(taskId);
    animState.gAnimSoundTaskCount--;
  }
}

function Cmd_createsoundtask(): void {
  animState.sBattleAnimScriptPtr++;
  const func = externName(T2_READ_32());
  animState.sBattleAnimScriptPtr += 4;
  const numArgs = scriptByte();
  animState.sBattleAnimScriptPtr++;
  for (let i = 0; i < numArgs; i++) {
    animState.gBattleAnimArgs[i] = T1_READ_16();
    animState.sBattleAnimScriptPtr += 2;
  }
  runAnimTask(func, 1, true);
}

function Cmd_waitsound(): void {
  const a = animState;
  if (a.gAnimSoundTaskCount !== 0) {
    a.sSoundAnimFramesToWait = 0;
    a.sAnimFramesToWait = 1;
  } else if (sound.isSEPlaying()) {
    if (++a.sSoundAnimFramesToWait > 90) {
      sound.stopSE(0);
      a.sSoundAnimFramesToWait = 0;
    } else {
      a.sAnimFramesToWait = 1;
    }
  } else {
    a.sSoundAnimFramesToWait = 0;
    a.sBattleAnimScriptPtr++;
    a.sAnimFramesToWait = 0;
  }
}

function Cmd_jumpargeq(): void {
  animState.sBattleAnimScriptPtr++;
  const argId = scriptByte();
  const valueToCheck = (T1_READ_16(1) << 16) >> 16;
  if (valueToCheck === animState.gBattleAnimArgs[argId]) animState.sBattleAnimScriptPtr = T2_READ_32(3);
  else animState.sBattleAnimScriptPtr += 7;
}

function Cmd_jumpifcontest(): void {
  animState.sBattleAnimScriptPtr += 5;
}

function Cmd_splitbgprio(): void {
  const wantedBattler = scriptByte(1);
  animState.sBattleAnimScriptPtr += 2;
  const battlerId = wantedBattler !== ANIM_ATTACKER ? animState.gBattleAnimTarget : animState.gBattleAnimAttacker;
  // Apply only if the given battler is the lead (on left from team's perspective)
  const battlerPosition = GetBattlerPosition(battlerId);
  if (battlerPosition === C.B_POSITION_PLAYER_LEFT || battlerPosition === C.B_POSITION_OPPONENT_RIGHT) {
    SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
    SetAnimBgAttribute(2, BG_ANIM_PRIORITY, 2);
  }
}

function Cmd_splitbgprio_all(): void {
  animState.sBattleAnimScriptPtr++;
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
  SetAnimBgAttribute(2, BG_ANIM_PRIORITY, 2);
}

function Cmd_splitbgprio_foes(): void {
  const wantedBattler = scriptByte(1);
  animState.sBattleAnimScriptPtr += 2;
  // Apply only if the attacking the opposing side
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== GetBattlerSide(animState.gBattleAnimTarget)) {
    const battlerId = wantedBattler !== ANIM_ATTACKER ? animState.gBattleAnimTarget : animState.gBattleAnimAttacker;
    // Apply only if the given battler is the lead (on left from team's perspective)
    const battlerPosition = GetBattlerPosition(battlerId);
    if (battlerPosition === C.B_POSITION_PLAYER_LEFT || battlerPosition === C.B_POSITION_OPPONENT_RIGHT) {
      SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
      SetAnimBgAttribute(2, BG_ANIM_PRIORITY, 2);
    }
  }
}

function Cmd_invisible(): void {
  const spriteId = GetAnimBattlerSpriteId(scriptByte(1));
  if (spriteId !== SPRITE_NONE) gSprites[spriteId].invisible = true;
  animState.sBattleAnimScriptPtr += 2;
}

function Cmd_visible(): void {
  const spriteId = GetAnimBattlerSpriteId(scriptByte(1));
  if (spriteId !== SPRITE_NONE) gSprites[spriteId].invisible = false;
  animState.sBattleAnimScriptPtr += 2;
}

function IsDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

// Below two commands are never used
function Cmd_teamattack_moveback(): void {
  const wantedBattler = scriptByte(1);
  animState.sBattleAnimScriptPtr += 2;
  // Apply to double battles when attacking own side
  if (IsDoubleBattle() && GetBattlerSide(animState.gBattleAnimAttacker) === GetBattlerSide(animState.gBattleAnimTarget)) {
    let priority: number;
    let spriteId: number;
    if (wantedBattler === ANIM_ATTACKER) {
      priority = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker);
      spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
    } else {
      priority = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimTarget);
      spriteId = GetAnimBattlerSpriteId(ANIM_TARGET);
    }
    if (spriteId !== SPRITE_NONE) {
      gSprites[spriteId].invisible = false;
      if (priority === 2) gSprites[spriteId].oam.priority = 3;
      if (priority === 1) ResetBattleAnimBg(false);
      else ResetBattleAnimBg(true);
    }
  }
}

function Cmd_teamattack_movefwd(): void {
  const wantedBattler = scriptByte(1);
  animState.sBattleAnimScriptPtr += 2;
  // Apply to double battles when attacking own side
  if (IsDoubleBattle() && GetBattlerSide(animState.gBattleAnimAttacker) === GetBattlerSide(animState.gBattleAnimTarget)) {
    let priority: number;
    let spriteId: number;
    if (wantedBattler === ANIM_ATTACKER) {
      priority = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker);
      spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
    } else {
      priority = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimTarget);
      spriteId = GetAnimBattlerSpriteId(ANIM_TARGET);
    }
    if (spriteId !== SPRITE_NONE && priority === 2) gSprites[spriteId].oam.priority = 2;
  }
}

function Cmd_stopsound(): void {
  sound.stopSE(0);
  animState.sBattleAnimScriptPtr++;
}

const sScriptCmdTable: Array<() => void> = [
  Cmd_loadspritegfx, // 0x00
  Cmd_unloadspritegfx, // 0x01
  Cmd_createsprite, // 0x02
  Cmd_createvisualtask, // 0x03
  Cmd_delay, // 0x04
  Cmd_waitforvisualfinish, // 0x05
  Cmd_nop, // 0x06
  Cmd_nop2, // 0x07
  Cmd_end, // 0x08
  Cmd_playse, // 0x09
  Cmd_monbg, // 0x0A
  Cmd_clearmonbg, // 0x0B
  Cmd_setalpha, // 0x0C
  Cmd_blendoff, // 0x0D
  Cmd_call, // 0x0E
  Cmd_return, // 0x0F
  Cmd_setarg, // 0x10
  Cmd_choosetwoturnanim, // 0x11
  Cmd_jumpifmoveturn, // 0x12
  Cmd_goto, // 0x13
  Cmd_fadetobg, // 0x14
  Cmd_restorebg, // 0x15
  Cmd_waitbgfadeout, // 0x16
  Cmd_waitbgfadein, // 0x17
  Cmd_changebg, // 0x18
  Cmd_playsewithpan, // 0x19
  Cmd_setpan, // 0x1A
  Cmd_panse, // 0x1B
  Cmd_loopsewithpan, // 0x1C
  Cmd_waitplaysewithpan, // 0x1D
  Cmd_setbldcnt, // 0x1E
  Cmd_createsoundtask, // 0x1F
  Cmd_waitsound, // 0x20
  Cmd_jumpargeq, // 0x21
  Cmd_monbg_static, // 0x22
  Cmd_clearmonbg_static, // 0x23
  Cmd_jumpifcontest, // 0x24
  Cmd_fadetobgfromset, // 0x25
  Cmd_panse_adjustnone, // 0x26
  Cmd_panse_adjustall, // 0x27
  Cmd_splitbgprio, // 0x28
  Cmd_splitbgprio_all, // 0x29
  Cmd_splitbgprio_foes, // 0x2A
  Cmd_invisible, // 0x2B
  Cmd_visible, // 0x2C
  Cmd_teamattack_moveback, // 0x2D
  Cmd_teamattack_movefwd, // 0x2E
  Cmd_stopsound, // 0x2F
];

// ---------------------------------------------------------------- disassembly (tests)

export type AnimOp = { addr: number; op: number; name: string; detail: string };

const OP_NAMES = [
  "loadspritegfx", "unloadspritegfx", "createsprite", "createvisualtask", "delay",
  "waitforvisualfinish", "nop", "nop2", "end", "playse", "monbg", "clearmonbg",
  "setalpha", "blendoff", "call", "return", "setarg", "choosetwoturnanim",
  "jumpifmoveturn", "goto", "fadetobg", "restorebg", "waitbgfadeout", "waitbgfadein",
  "changebg", "playsewithpan", "setpan", "panse", "loopsewithpan", "waitplaysewithpan",
  "setbldcnt", "createsoundtask", "waitsound", "jumpargeq", "monbg_static",
  "clearmonbg_static", "jumpifcontest", "fadetobgfromset", "panse_adjustnone",
  "panse_adjustall", "splitbgprio", "splitbgprio_all", "splitbgprio_foes",
  "invisible", "visible", "teamattack_moveback", "teamattack_movefwd", "stopsound",
];

function externLabel(ptr: number): string {
  const meta = bs.animsMeta;
  const rel = ptr - 0x0f000000;
  return meta.externals[rel >>> meta.externShift] ?? `extern+${rel.toString(16)}`;
}

/** Decode one animation script into ops (stops at end/goto/return/choose, or unknown opcode). */
export function disassembleAnimScript(addr: number, maxOps = 400): AnimOp[] {
  const ops: AnimOp[] = [];
  let ptr = addr;
  const read8 = (): number => bs.animsView.getUint8(ptr++ - ROM_BASE);
  const read16 = (): number => {
    const v = bs.animsView.getUint16(ptr - ROM_BASE, true);
    ptr += 2;
    return v;
  };
  const read32 = (): number => {
    const v = bs.animsView.getUint32(ptr - ROM_BASE, true);
    ptr += 4;
    return v >>> 0;
  };
  for (let i = 0; i < maxOps; i++) {
    const at = ptr;
    const op = read8();
    const name = OP_NAMES[op] ?? `unknown_${op}`;
    let detail = "";
    switch (op) {
      case 0x00: case 0x01:
        detail = `tag=${read16()}`;
        break;
      case 0x02: {
        const sym = externLabel(read32());
        const flags = read8();
        const argc = read8();
        const args: number[] = [];
        for (let k = 0; k < argc; k++) args.push(read16());
        detail = `${sym} flags=${flags} args=[${args}]`;
        break;
      }
      case 0x03: {
        const sym = externLabel(read32());
        const prio = read8();
        const argc = read8();
        const args: number[] = [];
        for (let k = 0; k < argc; k++) args.push(read16());
        detail = `${sym} prio=${prio} args=[${args}]`;
        break;
      }
      case 0x04:
        detail = `frames=${read8()}`;
        break;
      case 0x09:
        detail = `se=${read16()}`;
        break;
      case 0x0a: case 0x0b: case 0x14: case 0x18: case 0x22: case 0x23:
      case 0x28: case 0x2a: case 0x2b: case 0x2c: case 0x2d: case 0x2e:
        detail = `arg=${read8()}`;
        break;
      case 0x0c: case 0x1e:
        detail = `bld=${read8()},${read8()}`;
        break;
      case 0x0e: case 0x13:
        detail = `ptr=${read32().toString(16)}`;
        break;
      case 0x11: {
        const p1 = read32().toString(16);
        const p2 = read32().toString(16);
        detail = `ptr1=${p1} ptr2=${p2}`;
        break;
      }
      case 0x12: {
        const cond = read8();
        detail = `ifturn==${cond} ptr=${read32().toString(16)}`;
        break;
      }
      case 0x10:
        detail = `arg${read8()}=${read16()}`;
        break;
      case 0x19:
        detail = `se=${read16()} pan=${read8()}`;
        break;
      case 0x1a:
        detail = `pan=${read8()}`;
        break;
      case 0x1b: case 0x26: case 0x27:
        detail = `se=${read16()} pans=${read8()},${read8()},${read8()} wait=${read8()}`;
        break;
      case 0x1c:
        detail = `se=${read16()} pan=${read8()} wait=${read8()} n=${read8()}`;
        break;
      case 0x1d:
        detail = `se=${read16()} pan=${read8()} wait=${read8()}`;
        break;
      case 0x1f: {
        const sym = externLabel(read32());
        const argc = read8();
        const args: number[] = [];
        for (let k = 0; k < argc; k++) args.push(read16());
        detail = `${sym} args=[${args}]`;
        break;
      }
      case 0x21:
        detail = `arg${read8()}==${read16()} ptr=${read32().toString(16)}`;
        break;
      case 0x25:
        detail = `bgs=${read8()},${read8()},${read8()}`;
        break;
      case 0x05: case 0x06: case 0x07: case 0x08: case 0x0d: case 0x0f:
      case 0x15: case 0x16: case 0x17: case 0x20: case 0x29: case 0x2f:
        break;
      case 0x24:
        read32();
        break;
      default:
        ops.push({ addr: at - ROM_BASE, op, name, detail });
        return ops;
    }
    ops.push({ addr: at - ROM_BASE, op, name, detail });
    if (op === 0x08 || op === 0x0f || op === 0x11 || op === 0x13) return ops;
  }
  return ops;
}
