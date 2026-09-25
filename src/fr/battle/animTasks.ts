// Battle animation effect tasks (battle_anim_mon_movement.c,
// battle_anim_utility_funcs.c, battle_anim_normal.c, battle_anim_mons.c,
// battle_anim_dark.c, battle_anim_sound_tasks.c, battle_anim_water.c).
// Mon-movement, palette-blend and sound tasks are ported; particle-heavy
// tasks fall back to a timed target flash (FALLBACK_TASKS documents them) so
// scripts keep their pacing while the remaining ports land.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { tasks } from "../gba/tasks";
import {
  ANIM_ATK_PARTNER, ANIM_ATTACKER, ANIM_DEF_PARTNER, ANIM_TARGET, animState,
  AnimTask_AlphaFadeIn, DestroyAnimSoundTask, DestroyAnimVisualTask,
  GetAnimBattlerSpriteId, GetBattleMonSpritePalettesMask, GetBattlePalettesMask,
  GetSpritePalIdxByBattler, IsBattlerSpriteVisible, PrepareBattlerSpriteForRotScale,
  ResetSpriteRotScale, SetGreyscaleOrOriginalPalette, SetSpriteRotScale,
} from "./anim";
import { BeginNormalPaletteFade, BlendPalette, gPaletteFade, InvertPlttBuffer, OBJ_PLTT_ID } from "../hw/palette";
import { gSprites, IndexOfSpritePaletteTag, SPRITE_NONE } from "../hw/sprite";
import { Cos, Sin } from "../hw/trig";
import { G, gBattleSpritesDataPtr, gBattlerPartyIndexes, gBattlerSpriteIds } from "./globals";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";
import { GetMonData, gEnemyParty, playerMon } from "../pokemon/mon";
import { ANIM_TASK_FUNCS } from "./animRegistry";

type TaskFn = (taskId: number) => void;

function args(): Int16Array {
  return animState.gBattleAnimArgs;
}

function setStep(taskId: number, fn: TaskFn): void {
  tasks.tasks[taskId]!.func = fn;
  fn(taskId);
}

function battlerSpriteOrAbort(taskId: number, animBattler: number): number | null {
  const id = GetAnimBattlerSpriteId(animBattler);
  if (id === SPRITE_NONE) {
    DestroyAnimVisualTask(taskId);
    return null;
  }
  return id;
}

// ---------------------------------------------------------------- shakes

function shakeMon(taskId: number): void {
  const id = battlerSpriteOrAbort(taskId, args()[0]!);
  if (id === null) return;
  const t = tasks.tasks[taskId]!;
  gSprites[id]!.x2 = args()[1]!;
  gSprites[id]!.y2 = args()[2]!;
  t.data[0] = id;
  t.data[1] = args()[3]!;
  t.data[2] = args()[4]!;
  t.data[3] = args()[4]!;
  t.data[4] = args()[1]!;
  t.data[5] = args()[2]!;
  setStep(taskId, shakeMonStep);
}

function shakeMonStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  const sprite = gSprites[t.data[0]!]!;
  if (t.data[3] === 0) {
    sprite.x2 = sprite.x2 === 0 ? t.data[4]! : 0;
    sprite.y2 = sprite.y2 === 0 ? t.data[5]! : 0;
    t.data[3] = t.data[2]!;
    if (--t.data[1]! === 0) {
      sprite.x2 = 0;
      sprite.y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  } else {
    t.data[3]!--;
  }
}

function shakeMon2(taskId: number): void {
  const arg = args()[0]!;
  let spriteId = SPRITE_NONE;
  if (arg < C.MAX_BATTLERS_COUNT) {
    spriteId = GetAnimBattlerSpriteId(arg);
  } else if (arg !== 8) {
    let battler: number;
    switch (arg) {
      case 4: battler = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT); break;
      case 5: battler = GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT); break;
      case 6: battler = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT); break;
      default: battler = GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT); break;
    }
    if (IsBattlerSpriteVisible(battler)) spriteId = gBattlerSpriteIds[battler]!;
  } else {
    spriteId = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
  }
  if (spriteId === SPRITE_NONE) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const t = tasks.tasks[taskId]!;
  gSprites[spriteId]!.x2 = args()[1]!;
  gSprites[spriteId]!.y2 = args()[2]!;
  t.data[0] = spriteId;
  t.data[1] = args()[3]!;
  t.data[2] = args()[4]!;
  t.data[3] = args()[4]!;
  t.data[4] = args()[1]!;
  t.data[5] = args()[2]!;
  setStep(taskId, shakeMon2Step);
}

function shakeMon2Step(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  const sprite = gSprites[t.data[0]!]!;
  if (t.data[3] === 0) {
    sprite.x2 = sprite.x2 === t.data[4] ? -t.data[4]! : t.data[4]!;
    sprite.y2 = sprite.y2 === t.data[5] ? -t.data[5]! : t.data[5]!;
    t.data[3] = t.data[2]!;
    if (--t.data[1]! === 0) {
      sprite.x2 = 0;
      sprite.y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  } else {
    t.data[3]!--;
  }
}

function shakeMonInPlace(taskId: number): void {
  const id = battlerSpriteOrAbort(taskId, args()[0]!);
  if (id === null) return;
  const t = tasks.tasks[taskId]!;
  gSprites[id]!.x2 += args()[1]!;
  gSprites[id]!.y2 += args()[2]!;
  t.data[0] = id;
  t.data[1] = 0;
  t.data[2] = args()[3]!;
  t.data[3] = 0;
  t.data[4] = args()[4]!;
  t.data[5] = args()[1]! * 2;
  t.data[6] = args()[2]! * 2;
  setStep(taskId, shakeMonInPlaceStep);
}

function shakeMonInPlaceStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  const sprite = gSprites[t.data[0]!]!;
  if (t.data[3] === 0) {
    if (t.data[1]! & 1) {
      sprite.x2 += t.data[5]!;
      sprite.y2 += t.data[6]!;
    } else {
      sprite.x2 -= t.data[5]!;
      sprite.y2 -= t.data[6]!;
    }
    t.data[3] = t.data[4]!;
    if (++t.data[1]! >= t.data[2]!) {
      if (t.data[1]! & 1) {
        sprite.x2 += Math.trunc(t.data[5]! / 2);
        sprite.y2 += Math.trunc(t.data[6]! / 2);
      } else {
        sprite.x2 -= Math.trunc(t.data[5]! / 2);
        sprite.y2 -= Math.trunc(t.data[6]! / 2);
      }
      DestroyAnimVisualTask(taskId);
    }
  } else {
    t.data[3]!--;
  }
}

function shakeAndSinkMon(taskId: number): void {
  const id = GetAnimBattlerSpriteId(args()[0]!);
  const t = tasks.tasks[taskId]!;
  gSprites[id]!.x2 = args()[1]!;
  t.data[0] = id;
  t.data[1] = args()[1]!;
  t.data[2] = args()[2]!;
  t.data[3] = args()[3]!;
  t.data[4] = args()[4]!;
  setStep(taskId, shakeAndSinkMonStep);
}

function shakeAndSinkMonStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  const spriteId = t.data[0]!;
  let x = t.data[1]!;
  if (t.data[2] === t.data[8]++) {
    t.data[8] = 0;
    if (gSprites[spriteId]!.x2 === x) x = -x;
    gSprites[spriteId]!.x2 += x;
  }
  t.data[1] = x;
  t.data[9]! += t.data[3]!;
  gSprites[spriteId]!.y2 = t.data[9]! >> 8;
  if (--t.data[4]! === 0) DestroyAnimVisualTask(taskId);
}

function shakeTargetPower(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  let mag = args()[0] === 0
    ? Math.floor(animState.gAnimMovePower / 12)
    : Math.floor(animState.gAnimMoveDmg / 12);
  if (mag < 1) mag = 1;
  if (mag > 16) mag = 16;
  t.data[15] = mag;
  t.data[14] = Math.floor(mag / 2);
  t.data[13] = t.data[14]! + (mag & 1);
  t.data[12] = 0;
  t.data[10] = args()[3]!;
  t.data[11] = args()[4]!;
  t.data[7] = GetAnimBattlerSpriteId(ANIM_TARGET);
  t.data[8] = gSprites[t.data[7]!]!.x2;
  t.data[9] = gSprites[t.data[7]!]!.y2;
  t.data[0] = 0;
  t.data[1] = args()[1]!;
  t.data[2] = args()[2]!;
  setStep(taskId, shakeTargetPowerStep);
}

function shakeTargetPowerStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  if (++t.data[0]! > t.data[1]!) {
    t.data[0] = 0;
    t.data[12] = (t.data[12]! + 1) & 1;
    if (t.data[10]) {
      gSprites[t.data[7]!]!.x2 = t.data[12] ? t.data[8]! + t.data[13]! : t.data[8]! - t.data[14]!;
    }
    if (t.data[11]) {
      gSprites[t.data[7]!]!.y2 = t.data[12] ? t.data[15]! : 0;
    }
    if (!--t.data[2]!) {
      gSprites[t.data[7]!]!.x2 = 0;
      gSprites[t.data[7]!]!.y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  }
}

// ---------------------------------------------------------------- elliptical / sway / scale

function translateElliptical(taskId: number): void {
  let wavePeriod = 1;
  const id = GetAnimBattlerSpriteId(args()[0]!);
  const clamped = args()[4]! > 5 ? 5 : args()[4]!;
  for (let i = 0; i < clamped; i++) wavePeriod *= 2;
  const t = tasks.tasks[taskId]!;
  t.data[0] = id;
  t.data[1] = args()[1]!;
  t.data[2] = args()[2]!;
  t.data[3] = args()[3]!;
  t.data[4] = wavePeriod;
  setStep(taskId, translateEllipticalStep);
}

function translateEllipticalStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  const spriteId = t.data[0]!;
  gSprites[spriteId]!.x2 = Sin(t.data[5]!, t.data[1]!);
  gSprites[spriteId]!.y2 = -Cos(t.data[5]!, t.data[2]!) + t.data[2]!;
  t.data[5] = (t.data[5]! + t.data[4]!) & 0xff;
  if (t.data[5] === 0) t.data[3]!--;
  if (t.data[3] === 0) {
    gSprites[spriteId]!.x2 = 0;
    gSprites[spriteId]!.y2 = 0;
    DestroyAnimVisualTask(taskId);
  }
}

function translateEllipticalSide(taskId: number): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    args()[1] = -args()[1]!;
  }
  translateElliptical(taskId);
}

function scaleMonAndRestore(taskId: number): void {
  const id = GetAnimBattlerSpriteId(args()[3]!);
  PrepareBattlerSpriteForRotScale(id, args()[4]!);
  const t = tasks.tasks[taskId]!;
  t.data[0] = args()[0]!;
  t.data[1] = args()[1]!;
  t.data[2] = args()[2]!;
  t.data[3] = args()[2]!;
  t.data[4] = id;
  t.data[10] = 0x100;
  t.data[11] = 0x100;
  setStep(taskId, scaleMonAndRestoreStep);
}

function scaleMonAndRestoreStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  t.data[10]! += t.data[0]!;
  t.data[11]! += t.data[1]!;
  const spriteId = t.data[4]!;
  SetSpriteRotScale(spriteId, t.data[10]!, t.data[11]!, 0);
  if (--t.data[2]! === 0) {
    if (t.data[3]! > 0) {
      t.data[0] = -t.data[0]!;
      t.data[1] = -t.data[1]!;
      t.data[2] = t.data[3]!;
      t.data[3] = 0;
    } else {
      ResetSpriteRotScale(spriteId);
      DestroyAnimVisualTask(taskId);
    }
  }
}

function swayMon(taskId: number): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    args()[1] = -args()[1]!;
  }
  const id = GetAnimBattlerSpriteId(args()[4]!);
  const t = tasks.tasks[taskId]!;
  t.data[0] = args()[0]!;
  t.data[1] = args()[1]!;
  t.data[2] = args()[2]!;
  t.data[3] = args()[3]!;
  t.data[4] = id;
  t.data[5] = args()[4]! === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  t.data[12] = 1;
  setStep(taskId, swayMonStep);
}

function swayMonStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  const spriteId = t.data[4]!;
  const sineIndex = t.data[10]! + t.data[2]!;
  t.data[10] = sineIndex;
  const wave = sineIndex >> 8;
  const sineValue = Sin(wave, t.data[1]!);
  if (t.data[0] === 0) {
    gSprites[spriteId]!.x2 = sineValue;
  } else if (GetBattlerSide(t.data[5]!) === C.B_SIDE_PLAYER) {
    gSprites[spriteId]!.y2 = Math.abs(sineValue);
  } else {
    gSprites[spriteId]!.y2 = -Math.abs(sineValue);
  }
  if ((wave > 0x7f && t.data[11] === 0 && t.data[12] === 1) || (wave < 0x7f && t.data[11] === 1 && t.data[12] === 0)) {
    t.data[11]! ^= 1;
    t.data[12]! ^= 1;
    if (--t.data[3]! === 0) {
      gSprites[spriteId]!.x2 = 0;
      gSprites[spriteId]!.y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  }
}

// ---------------------------------------------------------------- blends

function unpackPalettes(selector: number): number {
  const s = selector;
  const bg = s & 1;
  const atk = (s >> 1) & 1;
  const tgt = (s >> 2) & 1;
  const atkP = (s >> 3) & 1;
  const tgtP = (s >> 4) & 1;
  const a1 = (s >> 5) & 1;
  const a2 = (s >> 6) & 1;
  return battlePalettesMask(bg === 1, atk === 1, tgt === 1, atkP === 1, tgtP === 1, a1 === 1, a2 === 1);
}

function battlePalettesMask(
  bg: boolean, atk: boolean, tgt: boolean, atkP: boolean, tgtP: boolean, a1: boolean, a2: boolean,
): number {
  return GetBattlePalettesMask(bg, atk, tgt, atkP, tgtP, a1, a2);
}

function startBlendSpriteColor(taskId: number, selected: number): void {
  const t = tasks.tasks[taskId]!;
  t.data[0] = selected >>> 0;
  t.data[1] = Math.floor(selected / 0x10000);
  t.data[2] = args()[1]!;
  t.data[3] = args()[2]!;
  t.data[4] = args()[3]!;
  t.data[5] = args()[4]!;
  t.data[10] = args()[2]!;
  setStep(taskId, blendSpriteColorStep);
}

function blendSpriteColorStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  if (t.data[9] === t.data[2]) {
    t.data[9] = 0;
    let selected = (t.data[0]! >>> 0) | (t.data[1]! * 0x10000);
    let mask = 0;
    while (selected) {
      if (selected & 1) BlendPalette(mask, 16, t.data[10]!, t.data[5]!);
      mask += 0x10;
      selected = Math.floor(selected / 2);
    }
    if (t.data[10]! < t.data[4]!) t.data[10]!++;
    else if (t.data[10]! > t.data[4]!) t.data[10]!--;
    else DestroyAnimVisualTask(taskId);
  } else {
    t.data[9]!++;
  }
}

function blendBattleAnimPal(taskId: number): void {
  let selected = unpackPalettes(args()[0]!);
  selected |= GetBattleMonSpritePalettesMask(
    ((args()[0]! >> 7) & 1) === 1,
    ((args()[0]! >> 8) & 1) === 1,
    ((args()[0]! >> 9) & 1) === 1,
    ((args()[0]! >> 10) & 1) === 1,
  );
  startBlendSpriteColor(taskId, selected);
}

function blendBattleAnimPalExclude(taskId: number): void {
  const animBattlers = [0, 0xff];
  let selected = unpackPalettes(1);
  switch (args()[0]) {
    case 2:
      selected = 0;
    // fall through
    case ANIM_ATTACKER:
      animBattlers[0] = animState.gBattleAnimAttacker;
      break;
    case 3:
      selected = 0;
    // fall through
    case ANIM_TARGET:
      animBattlers[0] = animState.gBattleAnimTarget;
      break;
    case 4:
      animBattlers[0] = animState.gBattleAnimAttacker;
      animBattlers[1] = animState.gBattleAnimTarget;
      break;
    case 5:
      animBattlers[0] = 0xff;
      break;
    case 6:
      selected = 0;
      animBattlers[0] = animState.gBattleAnimAttacker ^ 2;
      break;
    case 7:
      selected = 0;
      animBattlers[0] = animState.gBattleAnimTarget ^ 2;
      break;
  }
  for (let battler = 0; battler < C.MAX_BATTLERS_COUNT; battler++) {
    if (battler !== animBattlers[0] && battler !== animBattlers[1] && IsBattlerSpriteVisible(battler)) {
      selected |= 0x10000 << GetSpritePalIdxByBattler(battler);
    }
  }
  startBlendSpriteColor(taskId, selected);
}

function blendColorCycle(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  t.data[0] = args()[0]!;
  t.data[1] = args()[1]!;
  t.data[2] = args()[2]!;
  t.data[3] = args()[3]!;
  t.data[4] = args()[4]!;
  t.data[5] = args()[5]!;
  t.data[6] = 0;
  blendColorCycleGo(taskId, 0, t.data[4]!);
  setStep(taskId, blendColorCycleLoop);
}

function blendColorCycleGo(taskId: number, start: number, target: number): void {
  const t = tasks.tasks[taskId]!;
  const selected = unpackPalettes(t.data[0]!);
  BeginNormalPaletteFade(selected, t.data[1]!, start, target, t.data[5]!);
  t.data[2]!--;
  t.data[6]! ^= 1;
}

function blendColorCycleLoop(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  if (!gPaletteFade.active) {
    if (t.data[2]! > 0) {
      let start: number;
      let target: number;
      if (!t.data[6]) {
        start = t.data[3]!;
        target = t.data[4]!;
      } else {
        start = t.data[4]!;
        target = t.data[3]!;
      }
      if (t.data[2] === 1) target = 0;
      blendColorCycleGo(taskId, start, target);
    } else {
      DestroyAnimVisualTask(taskId);
    }
  }
}

function blendMonInAndOut(taskId: number): void {
  const id = GetAnimBattlerSpriteId(args()[0]!);
  if (id === SPRITE_NONE) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const t = tasks.tasks[taskId]!;
  t.data[0] = OBJ_PLTT_ID(gSprites[id]!.oam.paletteNum) + 1;
  t.data[1] = args()[1]!;
  t.data[2] = 0;
  t.data[3] = args()[2]!;
  t.data[4] = 0;
  t.data[5] = args()[3]!;
  t.data[6] = 0;
  t.data[7] = args()[4]!;
  setStep(taskId, blendMonInAndOutStep);
}

function blendMonInAndOutStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  if (++t.data[4]! >= t.data[5]!) {
    t.data[4] = 0;
    if (!t.data[6]) {
      t.data[2]!++;
      BlendPalette(t.data[0]!, 15, t.data[2]!, t.data[1]!);
      if (t.data[2] === t.data[3]) t.data[6] = 1;
    } else {
      t.data[2]!--;
      BlendPalette(t.data[0]!, 15, t.data[2]!, t.data[1]!);
      if (!t.data[2]) {
        if (--t.data[7]!) {
          t.data[4] = 0;
          t.data[6] = 0;
        } else {
          DestroyAnimVisualTask(taskId);
        }
      }
    }
  }
}

function setGrayscaleOrOriginalPal(taskId: number): void {
  let spriteId = SPRITE_NONE;
  const arg = args()[0]!;
  if (arg <= ANIM_DEF_PARTNER) {
    spriteId = GetAnimBattlerSpriteId(arg);
  } else if (arg >= 4 && arg <= 7) {
    const positions = [C.B_POSITION_PLAYER_LEFT, C.B_POSITION_PLAYER_RIGHT, C.B_POSITION_OPPONENT_LEFT, C.B_POSITION_OPPONENT_RIGHT];
    const battler = GetBattlerAtPosition(positions[arg - 4]!);
    if (IsBattlerSpriteVisible(battler)) spriteId = gBattlerSpriteIds[battler];
  }
  if (spriteId !== SPRITE_NONE) {
    SetGreyscaleOrOriginalPalette(gSprites[spriteId]!.oam.paletteNum + 16, args()[1] !== 0);
  }
  DestroyAnimVisualTask(taskId);
}

function invertScreenColor(taskId: number): void {
  let selected = 0;
  if (args()[0]! & 0x100) selected = GetBattlePalettesMask(true, false, false, false, false, false, false);
  if (args()[1]! & 0x100) selected |= 0x10000 << animState.gBattleAnimAttacker;
  if (args()[2]! & 0x100) selected |= 0x10000 << animState.gBattleAnimTarget;
  InvertPlttBuffer(selected);
  DestroyAnimVisualTask(taskId);
}

// ---------------------------------------------------------------- sound tasks

function battlerSpeciesForCry(animBattler: number): number {
  let battler: number;
  if (animBattler === ANIM_ATTACKER) battler = animState.gBattleAnimAttacker;
  else if (animBattler === ANIM_TARGET) battler = animState.gBattleAnimTarget;
  else if (animBattler === ANIM_ATK_PARTNER) battler = animState.gBattleAnimAttacker ^ 2;
  else battler = animState.gBattleAnimTarget ^ 2;
  if ((animBattler === ANIM_TARGET || animBattler === ANIM_DEF_PARTNER) && !IsBattlerSpriteVisible(battler)) {
    return C.SPECIES_NONE;
  }
  const partyIndex = gBattlerPartyIndexes[battler] ?? 0;
  const mon = GetBattlerSide(battler) !== C.B_SIDE_PLAYER ? gEnemyParty[partyIndex] : playerMon(partyIndex);
  return GetMonData(mon, C.MON_DATA_SPECIES);
}

function playSE1(taskId: number): void {
  sound.playSEWithPanning(args()[0]!, adjustPan(args()[1]!));
  DestroyAnimVisualTask(taskId);
}

function playSE2(taskId: number): void {
  sound.playSE2(args()[0]!);
  DestroyAnimVisualTask(taskId);
}

function adjustPan(pan: number): number {
  const a = animState;
  if (gBattleSpritesDataPtr.healthBoxesData[a.gBattleAnimAttacker]?.statusAnimActive) {
    pan = GetBattlerSide(a.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? C.SOUND_PAN_TARGET : C.SOUND_PAN_ATTACKER;
  } else if (GetBattlerSide(a.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    pan = -pan;
  }
  return pan;
}

function adjustPanningVar(taskId: number): void {
  animState.gAnimCustomPanning = adjustPan(args()[1]!);
  DestroyAnimVisualTask(taskId);
}

function waitForCry(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  if (t.data[9]! < 2) t.data[9]!++;
  else if (!sound.isCryPlaying()) DestroyAnimVisualTask(taskId);
}

function playDoubleCry(taskId: number): void {
  const species = battlerSpeciesForCry(args()[0]!);
  const t = tasks.tasks[taskId]!;
  t.data[0] = 2;
  t.data[1] = species;
  if (species !== C.SPECIES_NONE) sound.playCry(species, C.CRY_MODE_DOUBLES);
  setStep(taskId, playDoubleCryStep);
}

function playDoubleCryStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  if (!sound.isCryPlaying()) {
    if (--t.data[0]! <= 0) {
      DestroyAnimVisualTask(taskId);
    } else if (t.data[1] !== C.SPECIES_NONE) {
      sound.playCry(t.data[1]!, C.CRY_MODE_DOUBLES);
    }
  }
}

function playCryWithEcho(taskId: number): void {
  const species = animState.gAnimBattlerSpecies[animState.gBattleAnimAttacker] ?? C.SPECIES_NONE;
  const t = tasks.tasks[taskId]!;
  t.data[1] = species;
  t.data[9] = 0;
  if (species !== C.SPECIES_NONE) sound.playCry(species, C.CRY_MODE_ECHO_START);
  setStep(taskId, playCryWithEchoStep);
}

function playCryWithEchoStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  if (t.data[9] === 0) {
    if (!sound.isCryPlaying()) t.data[9] = 1;
  } else if (t.data[9] === 1) {
    if (t.data[1] !== C.SPECIES_NONE) sound.playCry(t.data[1]!, C.CRY_MODE_ECHO_END);
    t.data[9] = 2;
  } else if (!sound.isCryPlaying()) {
    DestroyAnimVisualTask(taskId);
  }
}

function playCryHighPitch(taskId: number): void {
  const species = battlerSpeciesForCry(args()[0]!);
  if (species !== C.SPECIES_NONE) sound.playCry(species, C.CRY_MODE_HIGH_PITCH);
  DestroyAnimVisualTask(taskId);
}

function loopSEAdjustPanning(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  t.data[0] = args()[0]!;
  t.data[1] = args()[1]!;
  t.data[2] = args()[2]!;
  t.data[3] = args()[3]!;
  t.data[4] = args()[4]!;
  t.data[5] = args()[5]!;
  t.data[6] = args()[6]!;
  t.data[10] = 0;
  t.data[11] = args()[1]!;
  t.data[12] = args()[6]!;
  setStep(taskId, loopSEAdjustPanningStep);
}

function loopSEAdjustPanningStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  if (t.data[12]!++ === t.data[6]!) {
    t.data[12] = 0;
    sound.playSEWithPanning(t.data[0]!, t.data[11]!);
    if (--t.data[4]! === 0) {
      DestroyAnimSoundTask(taskId);
      return;
    }
  }
  if (t.data[10]!++ === t.data[5]!) {
    t.data[10] = 0;
    t.data[11] = keepPanInRange(t.data[11]! + t.data[3]!);
  }
}

function keepPanInRange(pan: number): number {
  if (pan > C.SOUND_PAN_TARGET) return C.SOUND_PAN_TARGET;
  if (pan < C.SOUND_PAN_ATTACKER) return C.SOUND_PAN_ATTACKER;
  return pan;
}

function fireBlast(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  t.data[0] = args()[0]!;
  t.data[1] = args()[1]!;
  t.data[2] = adjustPan(C.SOUND_PAN_ATTACKER);
  t.data[3] = adjustPan(C.SOUND_PAN_TARGET);
  t.data[4] = t.data[2]! <= t.data[3]! ? 2 : -2;
  t.data[10] = 10;
  t.data[11] = 0;
  setStep(taskId, fireBlastStep1);
}

function fireBlastStep1(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  let pan = t.data[2]!;
  if (++t.data[11]! === 111) {
    t.data[10] = 5;
    t.data[11] = 0;
    setStep(taskId, fireBlastStep2);
  } else {
    if (++t.data[10]! === 11) {
      t.data[10] = 0;
      sound.playSEWithPanning(t.data[0]!, pan);
    }
    pan += t.data[4]!;
    t.data[2] = keepPanInRange(pan);
  }
}

function fireBlastStep2(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  if (++t.data[10]! === 6) {
    t.data[10] = 0;
    sound.playSEWithPanning(t.data[1]!, adjustPan(C.SOUND_PAN_TARGET));
    if (++t.data[11]! === 2) DestroyAnimSoundTask(taskId);
  }
}

function startSinAnimTimer(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  t.data[0] = args()[0]!;
  args()[7] = 0;
  setStep(taskId, runSinAnimTimer);
}

// ---------------------------------------------------------------- battle-state queries (tiny arg setters)

function ret(value: number, taskId: number): void {
  args()[C.ARG_RET_ID] = value;
  DestroyAnimVisualTask(taskId);
}

function isTargetPlayerSide(taskId: number): void {
  ret(GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_OPPONENT ? 0 : 1, taskId);
}

function isHealingMove(taskId: number): void {
  ret(animState.gAnimMoveDmg > 0 ? 0 : 1, taskId);
}

function isTargetSameSide(taskId: number): void {
  ret(GetBattlerSide(animState.gBattleAnimAttacker) === GetBattlerSide(animState.gBattleAnimTarget) ? 1 : 0, taskId);
}

function isContest(taskId: number): void {
  ret(0, taskId); // Contests never occur.
}

function isMonInvisible(taskId: number): void {
  ret(gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]!]!.invisible ? 1 : 0, taskId);
}

function getAttackerSide(taskId: number): void {
  args()[7] = GetBattlerSide(animState.gBattleAnimAttacker);
  DestroyAnimVisualTask(taskId);
}

function getTargetSide(taskId: number): void {
  args()[7] = GetBattlerSide(animState.gBattleAnimTarget);
  DestroyAnimVisualTask(taskId);
}

function getTargetIsAttackerPartner(taskId: number): void {
  ret((animState.gBattleAnimAttacker ^ 2) === animState.gBattleAnimTarget ? 1 : 0, taskId);
}

function getBattleTerrain(taskId: number): void {
  args()[0] = G.gBattleTerrain;
  DestroyAnimVisualTask(taskId);
}

function getWeather(taskId: number): void {
  const w = animState.gWeatherMoveAnim;
  let id = C.ANIM_WEATHER_NONE;
  if (w & C.B_WEATHER_SUN) id = C.ANIM_WEATHER_SUN;
  else if (w & C.B_WEATHER_RAIN) id = C.ANIM_WEATHER_RAIN;
  else if (w & C.B_WEATHER_SANDSTORM) id = C.ANIM_WEATHER_SANDSTORM;
  else if (w & C.B_WEATHER_HAIL) id = C.ANIM_WEATHER_HAIL;
  ret(id, taskId);
}

function setAnimAttackerAndTargetForEffectAtk(taskId: number): void {
  animState.gBattleAnimAttacker = G.gBattlerAttacker;
  animState.gBattleAnimTarget = G.gEffectBattler;
  DestroyAnimVisualTask(taskId);
}

function setAnimAttackerAndTargetForEffectTgt(taskId: number): void {
  animState.gBattleAnimAttacker = G.gBattlerTarget;
  animState.gBattleAnimTarget = G.gEffectBattler;
  DestroyAnimVisualTask(taskId);
}

function setTargetToEffectBattler(taskId: number): void {
  animState.gBattleAnimTarget = G.gEffectBattler;
  DestroyAnimVisualTask(taskId);
}

function setAnimTargetToBattlerTarget(taskId: number): void {
  animState.gBattleAnimTarget = G.gBattlerTarget;
  DestroyAnimVisualTask(taskId);
}

function setAllNonAttackersInvisibility(taskId: number): void {
  for (let battler = 0; battler < C.MAX_BATTLERS_COUNT; battler++) {
    if (battler !== animState.gBattleAnimAttacker && IsBattlerSpriteVisible(battler)) {
      gSprites[gBattlerSpriteIds[battler]!]!.invisible = args()[0] !== 0;
    }
  }
  DestroyAnimVisualTask(taskId);
}

function getFuryCutterHitCount(taskId: number): void {
  ret(animState.gAnimDisableStructPtr?.furyCutterCounter ?? 0, taskId);
}

function isFuryCutterHitRight(taskId: number): void {
  ret((animState.gAnimDisableStructPtr?.furyCutterCounter ?? 0) & 1, taskId);
}

function getReturnPowerLevel(taskId: number): void {
  const friendship = animState.gAnimFriendship;
  let level = 0;
  if (friendship > 60 && friendship < 92) level = 1;
  else if (friendship > 91 && friendship < 201) level = 2;
  else if (friendship > 200) level = 3;
  ret(level, taskId);
}

function getFrustrationPowerLevel(taskId: number): void {
  const friendship = animState.gAnimFriendship;
  let level = 3;
  if (friendship <= 30) level = 0;
  else if (friendship <= 100) level = 1;
  else if (friendship <= 200) level = 2;
  ret(level, taskId);
}

function getIsDoomDesireHitTurn(taskId: number): void {
  ret(animState.gAnimMoveTurn === 2 ? 1 : 0, taskId);
}

function isPowerOver99(taskId: number): void {
  args()[15] = animState.gAnimMovePower > 99 ? 1 : 0;
  DestroyAnimVisualTask(taskId);
}

function getRolloutCounter(taskId: number): void {
  const arg = args()[0]!;
  const dis = animState.gAnimDisableStructPtr;
  args()[arg] = (dis?.rolloutTimerStartValue ?? 0) - (dis?.rolloutTimer ?? 0) - 1;
  DestroyAnimVisualTask(taskId);
}

function getTrappedMoveAnimId(taskId: number): void {
  const move = gBattleSpritesDataPtr.animationData?.animArg ?? 0;
  if (move === C.MOVE_FIRE_SPIN) args()[0] = C.TRAP_ANIM_FIRE_SPIN;
  else if (move === C.MOVE_WHIRLPOOL) args()[0] = C.TRAP_ANIM_WHIRLPOOL;
  else if (move === C.MOVE_CLAMP) args()[0] = C.TRAP_ANIM_CLAMP;
  else if (move === C.MOVE_SAND_TOMB) args()[0] = C.TRAP_ANIM_SAND_TOMB;
  else args()[0] = C.TRAP_ANIM_BIND;
  DestroyAnimVisualTask(taskId);
}

function runSinAnimTimer(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  args()[7] = (args()[7]! + 3) & 0xff;
  if (--t.data[0]! === 0) DestroyAnimVisualTask(taskId);
}

// ---------------------------------------------------------------- generic palette fades

/** AnimTask_HardwarePaletteFade: fades selected palettes, ends with the fade. */
function hardwarePaletteFade(taskId: number): void {
  BeginNormalPaletteFade(
    args()[0]!, args()[1]!, args()[2]!, args()[3]!, args()[4]!,
  );
  setStep(taskId, hardwarePaletteFadeStep);
}

function hardwarePaletteFadeStep(taskId: number): void {
  if (!gPaletteFade.active) DestroyAnimVisualTask(taskId);
}

/** AnimTask_BlendPalInAndOutByTag: BlendMonInAndOut by sprite palette tag. */
function blendParticle(taskId: number): void {
  const palette = IndexOfSpritePaletteTag(args()[0]!);
  if (palette === 0xff) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const t = tasks.tasks[taskId]!;
  t.data[0] = palette * 0x10 + 0x101;
  t.data[1] = args()[1]!;
  t.data[2] = 0;
  t.data[3] = args()[2]!;
  t.data[4] = 0;
  t.data[5] = args()[3]!;
  t.data[6] = 0;
  t.data[7] = args()[4]!;
  setStep(taskId, blendMonInAndOutStep);
}

// ---------------------------------------------------------------- fallback

const FALLBACK_FRAMES = 40;

/** Timed target flash for tasks without a port yet; preserves pacing. */
function fallbackTask(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  t.data[0] = 0;
  const id = GetAnimBattlerSpriteId(ANIM_TARGET);
  t.data[1] = id === SPRITE_NONE ? -1 : GetSpritePalIdxByBattler(animState.gBattleAnimTarget);
  setStep(taskId, fallbackStep);
}

function fallbackStep(taskId: number): void {
  const t = tasks.tasks[taskId]!;
  t.data[0]!++;
  if (t.data[1]! >= 0) {
    const on = Math.floor(t.data[0]! / 6) % 2 === 0;
    BlendPalette(OBJ_PLTT_ID(t.data[1]!), 16, on ? 12 : 0, 0x7fff);
  }
  if (t.data[0]! >= FALLBACK_FRAMES) {
    if (t.data[1]! >= 0) BlendPalette(OBJ_PLTT_ID(t.data[1]!), 16, 0, 0x7fff);
    DestroyAnimVisualTask(taskId);
  }
}

// ---------------------------------------------------------------- registry

const silent = new Set<string>();

export function runAnimTask(name: string, priority: number, soundTask = false): void {
  const fn = ANIM_TASK_FUNCS[name] ?? TASKS[name];
  if (!fn && !silent.has(name)) {
    silent.add(name);
    console.warn(`battle anim task not implemented: ${name}`);
  }
  const taskFunc = fn ?? fallbackTask;
  const id = tasks.create(taskFunc, priority);
  taskFunc(id);
  if (soundTask) animState.gAnimSoundTaskCount++;
  else animState.gAnimVisualTaskCount++;
}

const TASKS: Record<string, TaskFn> = {
  AnimTask_ShakeMon: shakeMon,
  AnimTask_ShakeMon2: shakeMon2,
  AnimTask_ShakeMonInPlace: shakeMonInPlace,
  AnimTask_ShakeAndSinkMon: shakeAndSinkMon,
  AnimTask_TranslateMonElliptical: translateElliptical,
  AnimTask_TranslateMonEllipticalRespectSide: translateEllipticalSide,
  AnimTask_ScaleMonAndRestore: scaleMonAndRestore,
  AnimTask_SwayMon: swayMon,
  AnimTask_ShakeTargetBasedOnMovePowerOrDmg: shakeTargetPower,
  AnimTask_BlendBattleAnimPal: blendBattleAnimPal,
  AnimTask_BlendBattleAnimPalExclude: blendBattleAnimPalExclude,
  AnimTask_BlendColorCycle: blendColorCycle,
  AnimTask_BlendMonInAndOut: blendMonInAndOut,
  AnimTask_SetGrayscaleOrOriginalPal: setGrayscaleOrOriginalPal,
  AnimTask_InvertScreenColor: invertScreenColor,
  AnimTask_HardwarePaletteFade: hardwarePaletteFade,
  AnimTask_BlendParticle: blendParticle,
  AnimTask_BlendPalInAndOutByTag: blendParticle,
  AnimTask_AlphaFadeIn: AnimTask_AlphaFadeIn,
  AnimTask_StartSinAnimTimer: startSinAnimTimer,
  SoundTask_PlaySE1WithPanning: playSE1,
  SoundTask_PlaySE2WithPanning: playSE2,
  SoundTask_AdjustPanningVar: adjustPanningVar,
  SoundTask_WaitForCry: waitForCry,
  SoundTask_PlayDoubleCry: playDoubleCry,
  SoundTask_PlayCryWithEcho: playCryWithEcho,
  SoundTask_PlayCryHighPitch: playCryHighPitch,
  SoundTask_LoopSEAdjustPanning: loopSEAdjustPanning,
  SoundTask_FireBlast: fireBlast,
  AnimTask_GetAttackerSide: getAttackerSide,
  AnimTask_GetTargetSide: getTargetSide,
  AnimTask_GetTargetIsAttackerPartner: getTargetIsAttackerPartner,
  AnimTask_GetBattleTerrain: getBattleTerrain,
  AnimTask_GetWeather: getWeather,
  AnimTask_IsTargetPlayerSide: isTargetPlayerSide,
  AnimTask_IsHealingMove: isHealingMove,
  AnimTask_IsTargetSameSide: isTargetSameSide,
  AnimTask_IsContest: isContest,
  AnimTask_IsMonInvisible: isMonInvisible,
  AnimTask_SetAnimAttackerAndTargetForEffectAtk: setAnimAttackerAndTargetForEffectAtk,
  AnimTask_SetAnimAttackerAndTargetForEffectTgt: setAnimAttackerAndTargetForEffectTgt,
  AnimTask_SetTargetToEffectBattler: setTargetToEffectBattler,
  AnimTask_SetAnimTargetToBattlerTarget: setAnimTargetToBattlerTarget,
  AnimTask_SetAllNonAttackersInvisiblity: setAllNonAttackersInvisibility,
  AnimTask_GetFuryCutterHitCount: getFuryCutterHitCount,
  AnimTask_IsFuryCutterHitRight: isFuryCutterHitRight,
  AnimTask_GetReturnPowerLevel: getReturnPowerLevel,
  AnimTask_GetFrustrationPowerLevel: getFrustrationPowerLevel,
  AnimTask_GetIsDoomDesireHitTurn: getIsDoomDesireHitTurn,
  AnimTask_IsPowerOver99: isPowerOver99,
  AnimTask_GetRolloutCounter: getRolloutCounter,
  AnimTask_GetTrappedMoveAnimId: getTrappedMoveAnimId,
};

export function animTaskCoverage(names: string[]): { known: string[]; missing: string[] } {
  const known: string[] = [];
  const missing: string[] = [];
  for (const name of names) (TASKS[name] || ANIM_TASK_FUNCS[name] ? known : missing).push(name);
  return { known: [...new Set(known)], missing: [...new Set(missing)] };
}
