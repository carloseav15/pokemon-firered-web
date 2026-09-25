// battle_anim.c script interpreter: the 48 animation script opcodes. Sprite
// creation, visual/sound task dispatch, palette/BG ops and flow control follow
// the source; battler-to-BG copies use the sprite-visibility adapter (no VRAM
// BG copy), panning is accepted but not spatialized, and contests never occur.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { tasks } from "../gba/tasks";
import { ROM_BASE, bs } from "./bscript";
import {
  ANIM_ATK_PARTNER, ANIM_ATTACKER, ANIM_DEF_PARTNER, ANIM_TARGET,
  animState, GetAnimBattlerSpriteId, GetBattlerSpriteBGPriorityRank,
  GetBattlerSpriteCoord, GetBattlerSpriteSubpriority,
  InitPrioritiesForVisibleBattlers, IsBattlerSpriteVisible,
  ResetBattleAnimBg,
} from "./anim";
import { UpdateOamPriorityInAllHealthboxes } from "./interface";
import { cdata, cdataAny, hasCData, incbin } from "../hw/assets";
import { animFrom, oamFrom, templateFrom, type CSpriteTemplate } from "../hw/cdataSprite";
import type { SymRef } from "../hw/assets";
import { SetGpuReg } from "../hw/gpu";
import {
  BLDALPHA_BLEND, BLDCNT_EFFECT_BLEND, BLDCNT_TGT2_ALL, ppu,
  REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT,
} from "../hw/ppu";
import { BeginHardwarePaletteFade, gPaletteFade, UpdatePaletteFade } from "../hw/palette";
import {
  CreateSprite, FreeSpritePaletteByTag, FreeSpriteTilesByTag,
  gSprites, LoadSpritePalette, LoadSpriteSheet, SPRITE_NONE, StartSpriteAnim,
  type SpriteTemplate,
} from "../hw/sprite";
import { SetAnimBgAttribute } from "./intro";
import { G, gBattleSpritesDataPtr, gBattlerSpriteIds } from "./globals";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";
import { runAnimTask } from "./animTasks";

function isDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

const ANIM_SPRITES_START = 10000;
const ANIMSPRITE_IS_TARGET = 0x80;
const TASK_NONE = 0xff;

// Script state beyond animState (mirrors the C file statics).
let sBattleAnimScriptRetAddr = 0;
let sAnimBackgroundFadeState = 0;

function u8(): number {
  return bs.animsView.getUint8(animState.sBattleAnimScriptPtr++ - ROM_BASE);
}

function u16(): number {
  const v = bs.animsView.getUint16(animState.sBattleAnimScriptPtr - ROM_BASE, true);
  animState.sBattleAnimScriptPtr += 2;
  return v;
}

function u32(): number {
  const v = bs.animsView.getUint32(animState.sBattleAnimScriptPtr - ROM_BASE, true);
  animState.sBattleAnimScriptPtr += 4;
  return v >>> 0;
}

/** Resolve an EXTERN_BASE operand to its exported symbol name. */
function externName(ptr: number): string {
  const meta = bs.animsMeta;
  const rel = ptr - 0x0f000000;
  const name = meta.externals[rel >>> meta.externShift];
  if (name === undefined) throw new Error(`unknown anim extern ${ptr.toString(16)}`);
  return name;
}

function trueSpriteIndex(index: number): number {
  return index - ANIM_SPRITES_START;
}

function addSpriteIndex(index: number): void {
  const arr = animState.sAnimSpriteIndexArray;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0xffff) {
      arr[i] = index;
      return;
    }
  }
}

function clearSpriteIndex(index: number): void {
  const arr = animState.sAnimSpriteIndexArray;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === index) {
      arr[i] = 0xffff;
      return;
    }
  }
}

function picEntry(index: number): { data: SymRef; size: number; tag: number } {
  return cdata<Array<{ data: SymRef; size: number; tag: number }>>("battle_anim", "gBattleAnimPicTable")[trueSpriteIndex(index)];
}

function palEntry(index: number): { data: SymRef; tag: number } {
  return cdata<Array<{ data: SymRef; tag: number }>>("battle_anim", "gBattleAnimPaletteTable")[trueSpriteIndex(index)];
}

function waitFrames(n: number): void {
  animState.sAnimFramesToWait = n;
  animState.gAnimScriptCallback = WaitAnimFrameCount;
}

export function WaitAnimFrameCount(): void {
  if (animState.sAnimFramesToWait <= 0) {
    animState.gAnimScriptCallback = RunAnimScriptCommand;
    animState.sAnimFramesToWait = 0;
  } else {
    animState.sAnimFramesToWait--;
  }
}

export function RunAnimScriptCommand(): void {
  const a = animState;
  do {
    animOps[bs.animsView.getUint8(a.sBattleAnimScriptPtr - ROM_BASE)]!();
  } while (a.sAnimFramesToWait === 0 && a.gAnimScriptActive);
}

function battlerOf(animBattler: number): number {
  if (animBattler === ANIM_ATTACKER || animBattler === ANIM_ATK_PARTNER) return animState.gBattleAnimAttacker;
  return animState.gBattleAnimTarget;
}

function resolveBattlerArg(): number {
  let v = u8();
  if (v === ANIM_ATTACKER) v = ANIM_ATK_PARTNER;
  else if (v === ANIM_TARGET) v = ANIM_DEF_PARTNER;
  return v;
}

function hideBattlerId(battlerId: number): void {
  if (IsBattlerSpriteVisible(battlerId)) gSprites[gBattlerSpriteIds[battlerId]!]!.invisible = true;
}

function showBattlerId(battlerId: number): void {
  const id = gBattlerSpriteIds[battlerId];
  if (id !== undefined) gSprites[id]!.invisible = false;
}

function showBattler(animBattler: number): void {
  const id = GetAnimBattlerSpriteId(animBattler);
  if (id !== SPRITE_NONE) gSprites[id]!.invisible = false;
}

function adjustPanning(pan: number): number {
  const a = animState;
  if (gBattleSpritesDataPtr.healthBoxesData[a.gBattleAnimAttacker]?.statusAnimActive) {
    pan = GetBattlerSide(a.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? C.SOUND_PAN_TARGET : C.SOUND_PAN_ATTACKER;
  } else if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    if (GetBattlerSide(a.gBattleAnimTarget) === C.B_SIDE_PLAYER) {
      if (pan === C.SOUND_PAN_TARGET) pan = C.SOUND_PAN_ATTACKER;
      else if (pan !== C.SOUND_PAN_ATTACKER) pan *= -1;
    }
  } else if (GetBattlerSide(a.gBattleAnimTarget) === C.B_SIDE_OPPONENT) {
    if (pan === C.SOUND_PAN_ATTACKER) pan = C.SOUND_PAN_TARGET;
  } else {
    pan *= -1;
  }
  if (pan > C.SOUND_PAN_TARGET) pan = C.SOUND_PAN_TARGET;
  else if (pan < C.SOUND_PAN_ATTACKER) pan = C.SOUND_PAN_ATTACKER;
  return pan;
}

function adjustPanning2(pan: number): number {
  const a = animState;
  if (gBattleSpritesDataPtr.healthBoxesData[a.gBattleAnimAttacker]?.statusAnimActive) {
    pan = GetBattlerSide(a.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? C.SOUND_PAN_TARGET : C.SOUND_PAN_ATTACKER;
  } else if (GetBattlerSide(a.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    pan = -pan;
  }
  return pan;
}

function panTask(currentPan: number, targetPan: number, incrementPan: number, framesToWait: number, songNum: number): void {
  const s = animState;
  const id = tasks.create((taskId) => {
    const t = tasks.tasks[taskId]!;
    if (t.data[8]!++ >= t.data[3]!) {
      t.data[8] = 0;
      let pan = t.data[4]! + t.data[2]!;
      t.data[4] = pan;
      let done = false;
      if (t.data[2] === 0) done = true;
      else if (t.data[0]! < t.data[1]!) done = pan >= t.data[1]!;
      else done = pan <= t.data[1]!;
      if (done) {
        pan = t.data[1]!;
        tasks.destroy(taskId);
        s.gAnimSoundTaskCount--;
      }
      void pan; // SE12PanpotControl: no spatialization in the backend.
    }
  }, 1);
  const t = tasks.tasks[id]!;
  t.data[0] = currentPan;
  t.data[1] = targetPan;
  t.data[2] = incrementPan;
  t.data[3] = framesToWait;
  t.data[4] = currentPan;
  t.data[8] = 0;
  sound.playSEWithPanning(songNum, currentPan);
  animState.gAnimSoundTaskCount++;
}

function calcPanIncrement(source: number, target: number, increment: number): number {
  if (source < target) return increment < 0 ? -increment : increment;
  if (source > target) return -(increment < 0 ? -increment : increment);
  return 0;
}

function fadeToBg(bgId: number): void {
  const id = tasks.create((taskId) => {
    const t = tasks.tasks[taskId]!;
    if (t.data[10] === 0) {
      BeginHardwarePaletteFade(0xe8, 0, 0, 16, 0);
      t.data[10]++;
      return;
    }
    if (gPaletteFade.active) return;
    if (t.data[10] === 1) {
      t.data[10]++;
      sAnimBackgroundFadeState = 2;
    } else if (t.data[10] === 2) {
      const bg = t.data[0]!;
      if (bg === 0xffff) LoadDefaultBg();
      else LoadMoveBg(bg);
      BeginHardwarePaletteFade(0xe8, 0, 16, 0, 1);
      t.data[10]++;
      return;
    }
    if (gPaletteFade.active) return;
    if (t.data[10] === 3) {
      tasks.destroy(taskId);
      sAnimBackgroundFadeState = 0;
    }
  }, 5);
  tasks.tasks[id]!.data[0] = bgId;
  tasks.tasks[id]!.data[10] = 0;
  sAnimBackgroundFadeState = 1;
}

function LoadMoveBg(_bgId: number): void {
  // Background tilemaps for move anims need the VRAM BG path; the fade covers it.
}

function LoadDefaultBg(): void {
  // DrawMainBattleBackground equivalent is owned by the battle scene fade.
}

const animOps: Array<() => void> = [
  // 0x00 loadspritegfx
  () => {
    animState.sBattleAnimScriptPtr++;
    const index = u16();
    const pic = picEntry(index);
    const pal = palEntry(index);
    const sheet = { data: incbin(pic.data.$sym), size: pic.size, tag: pic.tag };
    LoadSpriteSheet(sheet);
    LoadSpritePalette({ data: incbin(pal.data.$sym), tag: pal.tag });
    addSpriteIndex(trueSpriteIndex(index));
    waitFrames(1);
  },
  // 0x01 unloadspritegfx
  () => {
    animState.sBattleAnimScriptPtr++;
    const index = u16();
    const pic = picEntry(index);
    FreeSpriteTilesByTag(pic.tag);
    FreeSpritePaletteByTag(pic.tag);
    clearSpriteIndex(trueSpriteIndex(index));
  },
  // 0x02 createsprite
  () => {
    animState.sBattleAnimScriptPtr++;
    const template = externName(u32());
    let argVar = u8();
    const argc = u8();
    for (let i = 0; i < argc; i++) animState.gBattleAnimArgs[i] = u16();
    const isTarget = (argVar & ANIMSPRITE_IS_TARGET) !== 0;
    if (isTarget) argVar ^= ANIMSPRITE_IS_TARGET;
    let sub: number;
    if (isTarget) {
      sub = GetBattlerSpriteSubpriority(animState.gBattleAnimTarget) + int8(argVar);
    } else {
      if (argVar >= 64) argVar -= 64;
      else argVar = -argVar;
      sub = GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker) + int8(argVar);
    }
    if (sub < 3) sub = 3;
    const source = cdataAny<CSpriteTemplate>(template);
    if (!source) {
      console.warn(`battle anim sprite template not loaded: ${template}`);
      return;
    }
    const built = buildAnimTemplate(source);
    const x = GetBattlerSpriteCoord(isTarget ? animState.gBattleAnimTarget : animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
    const y = GetBattlerSpriteCoord(isTarget ? animState.gBattleAnimTarget : animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
    const id = CreateSprite(built, x, y, sub);
    StartSpriteAnim(gSprites[id]!, 0);
    animState.gAnimVisualTaskCount++;
  },
  // 0x03 createvisualtask
  () => {
    animState.sBattleAnimScriptPtr++;
    const name = externName(u32());
    const priority = u8();
    const argc = u8();
    for (let i = 0; i < argc; i++) animState.gBattleAnimArgs[i] = u16();
    runAnimTask(name, priority);
  },
  // 0x04 delay
  () => {
    animState.sBattleAnimScriptPtr++;
    let frames = u8();
    if (frames === 0) frames = -1;
    waitFrames(frames);
  },
  // 0x05 waitforvisualfinish
  () => {
    if (animState.gAnimVisualTaskCount === 0) {
      animState.sBattleAnimScriptPtr++;
      animState.sAnimFramesToWait = 0;
    } else {
      animState.sAnimFramesToWait = 1;
    }
  },
  // 0x06 nop
  () => { animState.sBattleAnimScriptPtr++; },
  // 0x07 nop2
  () => { animState.sBattleAnimScriptPtr++; },
  // 0x08 end
  () => { Cmd_end(); },
  // 0x09 playse
  () => {
    animState.sBattleAnimScriptPtr++;
    sound.playSE(u16());
  },
  // 0x0A monbg (adapter: hide without a BG copy; mon anim tasks stay idle)
  () => {
    animState.sBattleAnimScriptPtr++;
    const v = resolveBattlerArg();
    hideBattlerId(battlerOf(v));
    if (v > ANIM_TARGET) hideBattlerId(battlerOf(v) ^ C.BIT_FLANK);
  },
  // 0x0B clearmonbg (unhide unconditionally; no tasks were created)
  () => {
    animState.sBattleAnimScriptPtr++;
    const v = resolveBattlerArg();
    showBattlerId(battlerOf(v));
    if (v > ANIM_TARGET) showBattlerId(battlerOf(v) ^ C.BIT_FLANK);
  },
  // 0x0C setalpha
  () => {
    animState.sBattleAnimScriptPtr++;
    const half1 = u8();
    const half2 = u8() << 8;
    SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_ALL);
    SetGpuReg(REG_OFFSET_BLDALPHA, half1 | half2);
  },
  // 0x0D blendoff
  () => {
    animState.sBattleAnimScriptPtr++;
    SetGpuReg(REG_OFFSET_BLDCNT, 0);
    SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  },
  // 0x0E call
  () => {
    animState.sBattleAnimScriptPtr++;
    sBattleAnimScriptRetAddr = animState.sBattleAnimScriptPtr + 4;
    animState.sBattleAnimScriptPtr = u32();
  },
  // 0x0F return
  () => {
    animState.sBattleAnimScriptPtr = sBattleAnimScriptRetAddr;
  },
  // 0x10 setarg
  () => {
    const addr = animState.sBattleAnimScriptPtr;
    animState.sBattleAnimScriptPtr++;
    const argId = u8();
    const value = u16();
    animState.sBattleAnimScriptPtr = addr + 4;
    animState.gBattleAnimArgs[argId] = value;
  },
  // 0x11 choosetwoturnanim
  () => {
    animState.sBattleAnimScriptPtr++;
    if (animState.gAnimMoveTurn & 1) animState.sBattleAnimScriptPtr += 4;
    animState.sBattleAnimScriptPtr = u32();
  },
  // 0x12 jumpifmoveturn
  () => {
    animState.sBattleAnimScriptPtr++;
    const check = u8();
    if (check === animState.gAnimMoveTurn) animState.sBattleAnimScriptPtr = u32();
    else animState.sBattleAnimScriptPtr += 4;
  },
  // 0x13 goto
  () => {
    animState.sBattleAnimScriptPtr++;
    animState.sBattleAnimScriptPtr = u32();
  },
  // 0x14 fadetobg
  () => {
    animState.sBattleAnimScriptPtr++;
    fadeToBg(u8());
  },
  // 0x15 restorebg
  () => {
    animState.sBattleAnimScriptPtr++;
    fadeToBg(0xffff);
  },
  // 0x16 waitbgfadeout
  () => {
    if (sAnimBackgroundFadeState === 2) {
      animState.sBattleAnimScriptPtr++;
      animState.sAnimFramesToWait = 0;
    } else {
      animState.sAnimFramesToWait = 1;
    }
  },
  // 0x17 waitbgfadein
  () => {
    if (sAnimBackgroundFadeState === 0) {
      animState.sBattleAnimScriptPtr++;
      animState.sAnimFramesToWait = 0;
    } else {
      animState.sAnimFramesToWait = 1;
    }
  },
  // 0x18 changebg (BG tilemaps need the VRAM path; the fade covers it)
  () => {
    animState.sBattleAnimScriptPtr++;
    LoadMoveBg(u8());
  },
  // 0x19 playsewithpan
  () => {
    animState.sBattleAnimScriptPtr++;
    const song = u16();
    const pan = int8(u8());
    sound.playSEWithPanning(song, adjustPanning(pan));
  },
  // 0x1A setpan
  () => {
    animState.sBattleAnimScriptPtr++;
    adjustPanning(int8(u8()));
  },
  // 0x1B panse
  () => {
    animState.sBattleAnimScriptPtr++;
    const song = u16();
    const cur = adjustPanning(int8(u8()));
    const target = adjustPanning(int8(u8()));
    const inc = calcPanIncrement(cur, target, int8(u8()));
    const wait = u8();
    panTask(cur, target, inc, wait, song);
  },
  // 0x1C loopsewithpan
  () => {
    animState.sBattleAnimScriptPtr++;
    const song = u16();
    const pan = adjustPanning(int8(u8()));
    const wait = u8();
    const count = u8();
    const id = tasks.create((taskId) => {
      const t = tasks.tasks[taskId]!;
      if (t.data[8]!++ >= t.data[2]!) {
        t.data[8] = 0;
        sound.playSEWithPanning(t.data[0]!, t.data[1]!);
        if (--t.data[3]! === 0) {
          tasks.destroy(taskId);
          animState.gAnimSoundTaskCount--;
        }
      }
    }, 1);
    const t = tasks.tasks[id]!;
    t.data[0] = song;
    t.data[1] = pan;
    t.data[2] = wait;
    t.data[3] = count;
    t.data[8] = wait;
    tasks.tasks[id]!.func(id);
    animState.gAnimSoundTaskCount++;
  },
  // 0x1D waitplaysewithpan
  () => {
    animState.sBattleAnimScriptPtr++;
    const song = u16();
    const pan = adjustPanning(int8(u8()));
    const wait = u8();
    const id = tasks.create((taskId) => {
      const t = tasks.tasks[taskId]!;
      if (t.data[2]!-- <= 0) {
        sound.playSEWithPanning(t.data[0]!, t.data[1]!);
        tasks.destroy(taskId);
        animState.gAnimSoundTaskCount--;
      }
    }, 1);
    const t = tasks.tasks[id]!;
    t.data[0] = song;
    t.data[1] = pan;
    t.data[2] = wait;
    animState.gAnimSoundTaskCount++;
  },
  // 0x1E setbldcnt
  () => {
    animState.sBattleAnimScriptPtr++;
    const half1 = u8();
    const half2 = u8() << 8;
    SetGpuReg(REG_OFFSET_BLDCNT, half1 | half2);
  },
  // 0x1F createsoundtask
  () => {
    animState.sBattleAnimScriptPtr++;
    const name = externName(u32());
    const argc = u8();
    for (let i = 0; i < argc; i++) animState.gBattleAnimArgs[i] = u16();
    runAnimTask(name, 1, true);
  },
  // 0x20 waitsound
  () => {
    if (animState.gAnimSoundTaskCount !== 0) {
      animState.sSoundAnimFramesToWait = 0;
      animState.sAnimFramesToWait = 1;
    } else if (sound.isSEPlaying()) {
      if (++animState.sSoundAnimFramesToWait > 90) {
        sound.stopSE(0);
        animState.sSoundAnimFramesToWait = 0;
      } else {
        animState.sAnimFramesToWait = 1;
      }
    } else {
      animState.sSoundAnimFramesToWait = 0;
      animState.sBattleAnimScriptPtr++;
      animState.sAnimFramesToWait = 0;
    }
  },
  // 0x21 jumpargeq
  () => {
    animState.sBattleAnimScriptPtr++;
    const argId = u8();
    const value = u16();
    if (value === animState.gBattleAnimArgs[argId]) {
      animState.sBattleAnimScriptPtr = u32();
    } else {
      animState.sBattleAnimScriptPtr += 7;
    }
  },
  // 0x22 monbg_static (adapter: keep visible, no BG copy)
  () => {
    animState.sBattleAnimScriptPtr++;
    const v = resolveBattlerArg();
    showBattlerId(battlerOf(v));
    if (v > ANIM_TARGET) showBattlerId(battlerOf(v) ^ C.BIT_FLANK);
  },
  // 0x23 clearmonbg_static
  () => {
    animState.sBattleAnimScriptPtr++;
    const v = resolveBattlerArg();
    showBattler(v);
    if (v > ANIM_TARGET) showBattler(battlerOf(v) ^ C.BIT_FLANK);
  },
  // 0x24 jumpifcontest
  () => {
    // Contests never occur; always fall through.
    animState.sBattleAnimScriptPtr += 5;
  },
  // 0x25 fadetobgfromset
  () => {
    animState.sBattleAnimScriptPtr++;
    const bg1 = u8();
    const bg2 = u8();
    u8();
    fadeToBg(GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER ? bg2 : bg1);
  },
  // 0x26 panse_adjustnone
  () => {
    animState.sBattleAnimScriptPtr++;
    const song = u16();
    const cur = int8(u8());
    const target = int8(u8());
    const inc = int8(u8());
    const wait = u8();
    panTask(cur, target, inc, wait, song);
  },
  // 0x27 panse_adjustall
  () => {
    animState.sBattleAnimScriptPtr++;
    const song = u16();
    const cur = adjustPanning2(int8(u8()));
    const target = adjustPanning2(int8(u8()));
    const inc = adjustPanning2(int8(u8()));
    const wait = u8();
    panTask(cur, target, inc, wait, song);
  },
  // 0x28 splitbgprio
  () => {
    const wanted = bs.animsView.getUint8(animState.sBattleAnimScriptPtr + 1 - ROM_BASE);
    animState.sBattleAnimScriptPtr += 2;
    const battler = wanted !== ANIM_ATTACKER ? animState.gBattleAnimTarget : animState.gBattleAnimAttacker;
    const pos = GetBattlerPosition(battler);
    if (pos === C.B_POSITION_PLAYER_LEFT || pos === C.B_POSITION_OPPONENT_RIGHT) {
      SetAnimBgAttribute(1, C.BG_ANIM_PRIORITY, 1);
      SetAnimBgAttribute(2, C.BG_ANIM_PRIORITY, 2);
    }
  },
  // 0x29 splitbgprio_all
  () => {
    animState.sBattleAnimScriptPtr++;
    SetAnimBgAttribute(1, C.BG_ANIM_PRIORITY, 1);
    SetAnimBgAttribute(2, C.BG_ANIM_PRIORITY, 2);
  },
  // 0x2A splitbgprio_foes
  () => {
    const wanted = bs.animsView.getUint8(animState.sBattleAnimScriptPtr + 1 - ROM_BASE);
    animState.sBattleAnimScriptPtr += 2;
    if (GetBattlerSide(animState.gBattleAnimAttacker) !== GetBattlerSide(animState.gBattleAnimTarget)) {
      const battler = wanted !== ANIM_ATTACKER ? animState.gBattleAnimTarget : animState.gBattleAnimAttacker;
      const pos = GetBattlerPosition(battler);
      if (pos === C.B_POSITION_PLAYER_LEFT || pos === C.B_POSITION_OPPONENT_RIGHT) {
        SetAnimBgAttribute(1, C.BG_ANIM_PRIORITY, 1);
        SetAnimBgAttribute(2, C.BG_ANIM_PRIORITY, 2);
      }
    }
  },
  // 0x2B invisible
  () => {
    const id = GetAnimBattlerSpriteId(bs.animsView.getUint8(animState.sBattleAnimScriptPtr + 1 - ROM_BASE));
    if (id !== SPRITE_NONE) gSprites[id]!.invisible = true;
    animState.sBattleAnimScriptPtr += 2;
  },
  // 0x2C visible
  () => {
    const id = GetAnimBattlerSpriteId(bs.animsView.getUint8(animState.sBattleAnimScriptPtr + 1 - ROM_BASE));
    if (id !== SPRITE_NONE) gSprites[id]!.invisible = false;
    animState.sBattleAnimScriptPtr += 2;
  },
  // 0x2D teamattack_moveback (doubles own-side only)
  () => {
    teamAttackMove(true);
    animState.sBattleAnimScriptPtr += 2;
  },
  // 0x2E teamattack_movefwd
  () => {
    teamAttackMove(false);
    animState.sBattleAnimScriptPtr += 2;
  },
  // 0x2F stopsound
  () => {
    sound.stopSE(0);
    animState.sBattleAnimScriptPtr++;
  },
];

function teamAttackMove(back: boolean): void {
  const wanted = bs.animsView.getUint8(animState.sBattleAnimScriptPtr + 1 - ROM_BASE);
  if (!isDoubleBattle() || GetBattlerSide(animState.gBattleAnimAttacker) !== GetBattlerSide(animState.gBattleAnimTarget)) return;
  const battler = wanted === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  const id = GetAnimBattlerSpriteId(wanted);
  if (id === SPRITE_NONE) return;
  gSprites[id]!.invisible = false;
  const priority = GetBattlerSpriteBGPriorityRank(battler);
  if (back) {
    if (priority === 2) gSprites[id]!.oam.priority = 3;
    ResetBattleAnimBg(priority !== 1);
  } else if (priority === 2) {
    gSprites[id]!.oam.priority = 2;
  }
}

function int8(v: number): number {
  return v >= 128 ? v - 256 : v;
}

function buildAnimTemplate(source: CSpriteTemplate): SpriteTemplate {
  return templateFrom(source);
}

function Cmd_end(): void {
  const a = animState;
  if (a.gAnimVisualTaskCount !== 0 || a.gAnimSoundTaskCount !== 0 || a.sMonAnimTaskIdArray[0] !== TASK_NONE || a.sMonAnimTaskIdArray[1] !== TASK_NONE) {
    a.sSoundAnimFramesToWait = 0;
    a.sAnimFramesToWait = 1;
    return;
  }
  if (sound.isSEPlaying()) {
    if (++a.sSoundAnimFramesToWait <= 90) {
      a.sAnimFramesToWait = 1;
      return;
    }
    sound.stopSE(0);
  }
  a.sSoundAnimFramesToWait = 0;
  for (let i = 0; i < a.sAnimSpriteIndexArray.length; i++) {
    if (a.sAnimSpriteIndexArray[i] !== 0xffff) {
      const entry = picEntry(a.sAnimSpriteIndexArray[i]!);
      FreeSpriteTilesByTag(entry.tag);
      FreeSpritePaletteByTag(entry.tag);
      a.sAnimSpriteIndexArray[i] = 0xffff;
    }
  }
  sound.setBgmVolume(256);
  InitPrioritiesForVisibleBattlers();
  UpdateOamPriorityInAllHealthboxes(1);
  a.gAnimScriptActive = false;
}

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
      case 0x15: case 0x16: case 0x17: case 0x20: case 0x28:
      case 0x29: case 0x2a: case 0x2f:
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
