// battle_anim_effects_2.c: circling fingers, clamps, Withdraw, Kinesis,
// Swords Dance, Sonic Boom, Air Cutter, coins, Bullet Seed, pincers, Disable,
// Minimize, Splash, Swagger/Bulk Up, Thrash, Sketch, rings (Hyper Voice,
// Uproar), Soft-Boiled, Extreme Speed, Heal Bell notes, Fake Out, Attract
// hearts, Scary Face, Hidden Power orbs, Perish Song notes and Fury Cutter.
// Adaptation: AnimTask_LoadMusicNotesPals loads the (already decompressed)
// palette straight from the INCBIN instead of a heap buffer.

import * as C from "../../generated/constants";
import { random } from "../../random";
import { cdata, incbin, incbin16 } from "../../hw/assets";
import { affineAnimFrom } from "../../hw/cdataSprite";
import { SetGpuReg } from "../../hw/gpu";
import {
  BG_PLTT_ID, BlendPalette, BlendPalettes, gPlttBufferFaded, LoadPalette, OBJ_PLTT_ID, PLTT_SIZE_4BPP, RGB_WHITE,
} from "../../hw/palette";
import { BLDALPHA_BLEND } from "../../hw/ppu";
import { gScanlineEffect, gScanlineEffectRegBuffers, SCANLINE_EFFECT_DMACNT_16BIT, ScanlineEffect_SetParams } from "../../hw/scanline";
import {
  AllocOamMatrix, AllocSpritePalette, CalcCenterToCornerVec, CreateSprite, DestroySprite, FreeOamMatrix, FreeSpriteOamMatrix,
  FreeSpritePaletteByTag, gSprites, IndexOfSpritePaletteTag, MAX_SPRITES, SeekSpriteAnim, StartSpriteAffineAnim, StartSpriteAnim,
  ST_OAM_AFFINE_DOUBLE, ST_OAM_AFFINE_NORMAL, ST_OAM_HFLIP, ST_OAM_OBJ_BLEND, ST_OAM_OBJ_NORMAL, ST_OAM_VFLIP, type Sprite,
} from "../../hw/sprite";
import { Cos, Sin } from "../../hw/trig";
import { Q_8_8_inv, Q_8_8_mul } from "../../mathUtil";
import type { Task } from "../../gba/tasks";
import {
  ANIM_ATTACKER, ANIM_TARGET, animState, AnimLoadCompressedBgGfx, AnimLoadCompressedBgTilemap, AnimSpriteOnMonPos, AnimTranslateLinear,
  ArcTan2Neg, CloneBattlerSpriteWithBlend, DestroyAnimSprite, DestroyAnimVisualTask, DestroySpriteAndMatrix, DestroySpriteWithActiveSheet,
  GetAnimBattlerSpriteId, GetBattleAnimBg1Data, GetBattlePalettesMask, GetBattlerSpriteBGPriorityRank, GetBattlerSpriteCoord,
  GetBattlerSpriteCoordAttr, GetBattlerSpriteSubpriority, GetBattlerYCoordWithElevation, InitAnimLinearTranslation,
  InitAnimLinearTranslationWithSpeedAndPos, InitBattleAnimBg, InitSpritePosToAnimAttacker, IsBattlerSpriteVisible,
  PrepareAffineAnimInTaskData, PrepareBattlerSpriteForRotScale, RelocateBattleBgPal, ResetSpriteRotScale, RunAffineAnimFromTaskData,
  RunStoredCallbackWhenAffineAnimEnds, RunStoredCallbackWhenAnimEnds, SetAnimSpriteInitialXOffset, SetAverageBattlerPositions,
  SetBattlerSpriteYOffsetFromRotation, SetBattlerSpriteYOffsetFromYScale, SetGreyscaleOrOriginalPalette,
  SetSpriteCoordsToAnimAttackerCoords, SetSpritePrimaryCoordsFromSecondaryCoords, SetSpriteRotScale, StartAnimLinearTranslation,
  StoreSpriteCallbackInData6, TranslateSpriteInCircle, TranslateSpriteInEllipse, TranslateSpriteLinearFixedPoint, TrySetSpriteRotScale,
  WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { BattleAnimAdjustPanning } from "../animScript";
import { G, gBattlerPositions, gBattlerSpriteIds } from "../globals";
import { BG_ANIM_CHAR_BASE_BLOCK, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, SetAnimBgAttribute } from "../intro";
import { GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, PlaySE12WithPanning, s16 } from "./common";
import { SetSpriteNextToMonHead } from "./effects1";

const u16 = (v: number) => v & 0xffff;
const IsDoubleBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE);
const BATTLE_PARTNER = (id: number) => id ^ 2;
const ANIM_SPRITES_START = 10000;
const NUM_MUSIC_NOTE_PAL_TAGS = 3;
const affineCmds = (name: string) => affineAnimFrom({ $sym: name });

// sAmplitudeX data[1], sCircleSpeed data[2], sMoveSteps data[3], sAmplitudeY data[4]
function AnimCirclingFinger(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[0]!);
  sprite.y += gBattleAnimArgs[1]!;
  sprite.data[1] = gBattleAnimArgs[2]!;
  sprite.data[2] = gBattleAnimArgs[4]!;
  sprite.data[3] = gBattleAnimArgs[5]!;
  sprite.data[4] = gBattleAnimArgs[3]!;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = TranslateSpriteInEllipse;
  sprite.callback(sprite);
}

function AnimBouncingMusicNote(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  SetSpriteNextToMonHead(battler, sprite);
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.callback = AnimBouncingMusicNote_Step;
}

function AnimBouncingMusicNote_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    sprite.y2 -= 3;
    if (++sprite.data[1]! === 6) sprite.data[0]!++;
    break;
  case 1:
    sprite.y2 += 3;
    if (--sprite.data[1]! === 0) sprite.data[0]!++;
    break;
  case 2:
    if (++sprite.data[1]! === 64) DestroyAnimSprite(sprite);
    break;
  }
}

function AnimVibrateBattlerBack_Step(sprite: Sprite): void {
  gSprites[sprite.data[2]!]!.x2 += sprite.data[1]!;
  const temp = sprite.data[1]!;
  sprite.data[1] = -temp;
  if (sprite.data[0] === 0) {
    gSprites[sprite.data[2]!]!.x2 = 0;
    DestroySpriteAndMatrix(sprite);
  }
  sprite.data[0]!--;
}

function AnimVibrateBattlerBack(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  const spriteId = gBattlerSpriteIds[animState.gBattleAnimTarget]!;
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0]!;
  else sprite.x += gBattleAnimArgs[0]!;
  sprite.y += gBattleAnimArgs[1]!;
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[1] = gBattleAnimArgs[3]!;
  sprite.data[2] = spriteId;
  sprite.callback = AnimVibrateBattlerBack_Step;
  sprite.invisible = true;
}

function AnimMovingClamp(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[1] = gBattleAnimArgs[3]!;
  sprite.data[5] = gBattleAnimArgs[4]!;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, AnimMovingClamp_Step);
}

function AnimMovingClamp_Step(sprite: Sprite): void {
  sprite.data[0] = sprite.data[1]!;
  sprite.data[2] = sprite.x;
  sprite.data[4] = sprite.y + 15;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, AnimMovingClamp_End);
}

function AnimMovingClamp_End(sprite: Sprite): void {
  if (sprite.data[5] === 0) DestroyAnimSprite(sprite);
  else sprite.data[5]!--;
}

// Rotates the attacking mon sprite downwards and then back upwards to its original position.
export function AnimTask_Withdraw(taskId: number): void {
  PrepareBattlerSpriteForRotScale(gBattlerSpriteIds[animState.gBattleAnimAttacker]!, ST_OAM_OBJ_NORMAL);
  gTasks[taskId]!.func = AnimTask_Withdraw_Step;
}

function AnimTask_Withdraw_Step(taskId: number): void {
  const spriteId = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
  const t = gTasks[taskId]!;
  const rotation = GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER ? s16(-t.data[0]!) : s16(t.data[0]!);

  SetSpriteRotScale(spriteId, 0x100, 0x100, u16(rotation));
  if (t.data[1] === 0) {
    t.data[0] = s16(t.data[0]! + 0xb0);
    // this y position update gets overwritten by SetBattlerSpriteYOffsetFromRotation()
    gSprites[spriteId]!.y2++;
  } else if (t.data[1] === 1) {
    if (++t.data[3]! === 30) t.data[1] = 2;
    return;
  } else {
    t.data[0] = s16(t.data[0]! - 0xb0);
    // this y position update gets overwritten by SetBattlerSpriteYOffsetFromRotation()
    gSprites[spriteId]!.y2--;
  }

  SetBattlerSpriteYOffsetFromRotation(spriteId);
  if (t.data[0] === 0xf20 || t.data[0] === 0) {
    if (t.data[1] === 2) {
      ResetSpriteRotScale(spriteId);
      DestroyAnimVisualTask(taskId);
    } else {
      t.data[1]!++;
    }
  }
}

// Animates a "zap of energy" used in KINESIS.
function AnimKinesisZapEnergy(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0]!;
  else sprite.x += gBattleAnimArgs[0]!;
  sprite.y += gBattleAnimArgs[1]!;
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.hFlip = 1;
    if (gBattleAnimArgs[2]) sprite.vFlip = 1;
  } else {
    if (gBattleAnimArgs[2]) sprite.vFlip = 1;
  }
  sprite.callback = RunStoredCallbackWhenAnimEnds;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Animates a sword that rises into the air after a brief pause.
function AnimSwordsDanceBlade(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, false);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
  StoreSpriteCallbackInData6(sprite, AnimSwordsDanceBlade_Step);
}

function AnimSwordsDanceBlade_Step(sprite: Sprite): void {
  sprite.data[0] = 6;
  sprite.data[2] = sprite.x;
  sprite.data[4] = sprite.y - 32;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Moves a projectile towards the target mon. The sprite is rotated to be pointing
// in the same direction it's moving.
function AnimSonicBoomProjectile(sprite: Sprite): void {
  if (IsContest()) {
    gBattleAnimArgs[2] = -gBattleAnimArgs[2]!;
  } else if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    gBattleAnimArgs[2] = -gBattleAnimArgs[2]!;
    gBattleAnimArgs[1] = -gBattleAnimArgs[1]!;
    gBattleAnimArgs[3] = -gBattleAnimArgs[3]!;
  }

  InitSpritePosToAnimAttacker(sprite, true);
  const targetXPos = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[2]!);
  const targetYPos = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3]!);
  let rotation = u16(ArcTan2Neg(s16(targetXPos - sprite.x), s16(targetYPos - sprite.y)));
  rotation = u16(rotation + 0xf000);
  if (IsContest()) rotation = u16(rotation - 0x6000);

  TrySetSpriteRotScale(sprite, false, 0x100, 0x100, rotation);
  sprite.data[0] = gBattleAnimArgs[4]!;
  sprite.data[2] = targetXPos;
  sprite.data[4] = targetYPos;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimAirWaveProjectile_Step2(sprite: Sprite): void {
  if (sprite.data[0]!-- <= 0) {
    gTasks[sprite.data[7]!]!.data[1]!--;
    DestroySprite(sprite);
  }
}

function airWaveSetOffsets(sprite: Sprite, task: Task): void {
  if (1 & task.data[7]!) sprite.x2 = (u16(sprite.data[1]!) >> 8) * -1;
  else sprite.x2 = u16(sprite.data[1]!) >> 8;
  if (1 & task.data[8]!) sprite.y2 = Math.trunc(u16(sprite.data[2]!) / 256) * -1;
  else sprite.y2 = Math.trunc(u16(sprite.data[2]!) / 256);
}

function AnimAirWaveProjectile_Step1(sprite: Sprite): void {
  const task = gTasks[sprite.data[7]!]!;
  if (sprite.data[0]! > task.data[5]!) {
    sprite.data[5]! += sprite.data[3]!;
    sprite.data[6]! += sprite.data[4]!;
  } else {
    sprite.data[5]! -= sprite.data[3]!;
    sprite.data[6]! -= sprite.data[4]!;
  }
  sprite.data[1]! += sprite.data[5]!;
  sprite.data[2]! += sprite.data[6]!;
  airWaveSetOffsets(sprite, task);
  if (sprite.data[0]!-- <= 0) {
    sprite.data[0] = 30;
    sprite.callback = AnimAirWaveProjectile_Step2;
  }
}

function AnimAirWaveProjectile(sprite: Sprite): void {
  const task = gTasks[sprite.data[7]!]!;
  sprite.data[1]! += -2 & task.data[7]!;
  sprite.data[2]! += -2 & task.data[8]!;
  airWaveSetOffsets(sprite, task);

  if (sprite.data[0]!-- <= 0) {
    sprite.data[0] = 8;
    task.data[5] = 4;
    const a = s16(Q_8_8_inv(0x1000));
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.y2 = 0;
    sprite.x2 = 0;
    let b: number;
    let c: number;
    if (task.data[11]! >= sprite.x) b = s16((task.data[11]! - sprite.x) << 8);
    else b = s16((sprite.x - task.data[11]!) << 8);
    if (task.data[12]! >= sprite.y) c = s16((task.data[12]! - sprite.y) << 8);
    else c = s16((sprite.y - task.data[12]!) << 8);

    sprite.data[2] = 0;
    sprite.data[1] = 0;
    sprite.data[6] = 0;
    sprite.data[5] = 0;
    sprite.data[3] = Q_8_8_mul(Q_8_8_mul(b, a), Q_8_8_inv(0x1c0));
    sprite.data[4] = Q_8_8_mul(Q_8_8_mul(c, a), Q_8_8_inv(0x1c0));
    sprite.callback = AnimAirWaveProjectile_Step1;
  }
}

function AirCutterProjectile_Step2(taskId: number): void {
  if (gTasks[taskId]!.data[1] === 0) DestroyAnimVisualTask(taskId);
}

function AirCutterProjectile_Step1(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[0]!-- <= 0) {
    const spriteId = CreateSprite(animTemplate("gAirWaveProjectileSpriteTemplate"), t.data[9]!, t.data[10]!, (t.data[2]! - t.data[1]!) & 0xff);
    const sprite = gSprites[spriteId]!;
    switch (t.data[4]) {
    case 1:
      sprite.oam.matrixNum |= ST_OAM_HFLIP | ST_OAM_VFLIP;
      break;
    case 2:
      sprite.oam.matrixNum = ST_OAM_HFLIP;
      break;
    }
    sprite.data[0] = t.data[5]! - t.data[6]!;
    sprite.data[7] = taskId;
    t.data[t.data[1]! + 13] = spriteId;
    t.data[0] = t.data[3]!;
    t.data[1]!++;
    PlaySE12WithPanning(C.SE_M_BLIZZARD2, BattleAnimAdjustPanning(-C.SOUND_PAN_TARGET));
    if (t.data[1]! > 2) t.func = AirCutterProjectile_Step2;
  }
}

export function AnimTask_AirCutterProjectile(taskId: number): void {
  const t = gTasks[taskId]!;
  const a = animState;
  if (IsContest()) {
    t.data[4] = 2;
    gBattleAnimArgs[0] = -gBattleAnimArgs[0]!;
    if (gBattleAnimArgs[2]! & 1) gBattleAnimArgs[2] = gBattleAnimArgs[2]! & ~1;
    else gBattleAnimArgs[2] = gBattleAnimArgs[2]! | 1;
  } else {
    if ((gBattlerPositions[a.gBattleAnimTarget]! & C.BIT_SIDE) === C.B_SIDE_PLAYER) {
      t.data[4] = 1;
      gBattleAnimArgs[0] = -gBattleAnimArgs[0]!;
      gBattleAnimArgs[1] = -gBattleAnimArgs[1]!;
      if (gBattleAnimArgs[2]! & 1) gBattleAnimArgs[2] = gBattleAnimArgs[2]! & ~1;
      else gBattleAnimArgs[2] = gBattleAnimArgs[2]! | 1;
    }
  }

  const attackerX = t.data[9] = s16(GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_X));
  const attackerY = t.data[10] = s16(GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_Y));
  let targetX: number;
  let targetY: number;
  if ((G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) && IsBattlerSpriteVisible(BATTLE_PARTNER(a.gBattleAnimTarget))) {
    const pos = SetAverageBattlerPositions(a.gBattleAnimTarget, false);
    targetX = pos.x;
    targetY = pos.y;
  } else {
    targetX = GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_X);
    targetY = GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_Y);
  }

  targetX = t.data[11] = s16(targetX + gBattleAnimArgs[0]!);
  targetY = t.data[12] = s16(targetY + gBattleAnimArgs[1]!);
  const xDiff = targetX >= attackerX ? s16(targetX - attackerX) : s16(attackerX - targetX);

  t.data[5] = Q_8_8_mul(xDiff, Q_8_8_inv(gBattleAnimArgs[2]! & ~1));
  t.data[6] = Q_8_8_mul(t.data[5]!, 0x80);
  t.data[7] = gBattleAnimArgs[2]!;
  if (targetY >= attackerY) {
    const yDiff = s16(targetY - attackerY);
    t.data[8] = Q_8_8_mul(yDiff, Q_8_8_inv(t.data[5]!)) & ~1;
  } else {
    const yDiff = s16(attackerY - targetY);
    t.data[8] = Q_8_8_mul(yDiff, Q_8_8_inv(t.data[5]!)) | 1;
  }

  t.data[3] = gBattleAnimArgs[3]!;
  if (gBattleAnimArgs[4]! & 0x80) gBattleAnimArgs[4] = gBattleAnimArgs[4]! ^ 0x80;
  if (gBattleAnimArgs[4]! >= 64) t.data[2] = s16(u16(GetBattlerSpriteSubpriority(a.gBattleAnimTarget) + (gBattleAnimArgs[4]! - 64)));
  else t.data[2] = s16(u16(GetBattlerSpriteSubpriority(a.gBattleAnimTarget) - gBattleAnimArgs[4]!));

  if (t.data[2]! < 3) t.data[2] = 3;
  t.func = AirCutterProjectile_Step1;
}

function AnimVoidLines(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, false);
  sprite.data[0] = OBJ_PLTT_ID(IndexOfSpritePaletteTag(animTemplate("sVoidLinesSpriteTemplate").paletteTag));
  sprite.callback = AnimVoidLines_Step;
}

function AnimVoidLines_Step(sprite: Sprite): void {
  if (++sprite.data[1]! === 2) {
    sprite.data[1] = 0;
    const id = u16(sprite.data[0]!);
    const val = gPlttBufferFaded[8 + id]!;
    for (let i = 8; i < 16; i++) gPlttBufferFaded[i + id] = gPlttBufferFaded[i + id + 1]!;
    gPlttBufferFaded[id + 15] = val;
    if (++sprite.data[2]! === 24) DestroyAnimSprite(sprite);
  }
}

function AnimCoinThrow(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  let r6 = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2));
  const r7 = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3]!);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2]!;
  r6 = s16(r6 + gBattleAnimArgs[2]!);
  let v = u16(ArcTan2Neg(s16(r6 - sprite.x), s16(r7 - sprite.y)));
  v = u16(v + 0xc000);
  TrySetSpriteRotScale(sprite, false, 0x100, 0x100, v);
  sprite.data[0] = gBattleAnimArgs[4]!;
  sprite.data[2] = r6;
  sprite.data[4] = r7;
  sprite.callback = InitAnimLinearTranslationWithSpeedAndPos;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimFallingCoin(sprite: Sprite): void {
  sprite.data[2] = -16;
  sprite.y += 8;
  sprite.callback = AnimFallingCoin_Step;
}

function AnimFallingCoin_Step(sprite: Sprite): void {
  sprite.data[0]! += 0x80;
  sprite.x2 = sprite.data[0]! >> 8;
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) sprite.x2 = -sprite.x2;
  sprite.y2 = Sin(sprite.data[1]!, sprite.data[2]!);
  sprite.data[1]! += 5;
  if (sprite.data[1]! > 126) {
    sprite.data[1] = 0;
    sprite.data[2] = Math.trunc(sprite.data[2]! / 2);
    if (++sprite.data[3]! === 2) DestroyAnimSprite(sprite);
  }
}

function AnimBulletSeed(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = 20;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.callback = StartAnimLinearTranslation;
  sprite.affineAnimPaused = true;
  StoreSpriteCallbackInData6(sprite, AnimBulletSeed_Step1);
}

function AnimBulletSeed_Step1(sprite: Sprite): void {
  PlaySE12WithPanning(C.SE_M_HORN_ATTACK, BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.y2 = 0;
  sprite.x2 = 0;
  // ptr = &sprite->data[7]; ptr[i - 7] = 0 for i < 8: clears data[0..7]
  for (let i = 0; i < 8; i++) sprite.data[i] = 0;

  let rand = random();
  sprite.data[6] = s16(0xfff4 - (rand & 7));
  rand = random();
  sprite.data[7] = (rand % 0xa0) + 0xa0;
  sprite.callback = AnimBulletSeed_Step2;
  sprite.affineAnimPaused = false;
}

function AnimBulletSeed_Step2(sprite: Sprite): void {
  sprite.data[0]! += sprite.data[7]!;
  sprite.x2 = sprite.data[0]! >> 8;
  if (sprite.data[7]! & 1) sprite.x2 = -sprite.x2;
  sprite.y2 = Sin(sprite.data[1]!, sprite.data[6]!);
  sprite.data[1]! += 8;
  if (sprite.data[1]! > 126) {
    sprite.data[1] = 0;
    sprite.data[2] = Math.trunc(sprite.data[2]! / 2);
    if (++sprite.data[3]! === 1) DestroyAnimSprite(sprite);
  }
}

// Moves a tornado in a circlular motion.
function AnimRazorWindTornado(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, false);
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) sprite.y += 16;
  sprite.data[0] = gBattleAnimArgs[4]!;
  sprite.data[1] = gBattleAnimArgs[2]!;
  sprite.data[2] = gBattleAnimArgs[5]!;
  sprite.data[3] = gBattleAnimArgs[6]!;
  sprite.data[4] = gBattleAnimArgs[3]!;
  sprite.callback = TranslateSpriteInCircle;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback(sprite);
}

// Animates a single pincer line that extends towards the center of the target mon.
function AnimViceGripPincer(sprite: Sprite): void {
  let startXOffset = 32;
  let startYOffset = -32;
  let endXOffset = 16;
  let endYOffset = -16;
  if (gBattleAnimArgs[0]) {
    startXOffset = -32;
    startYOffset = 32;
    endXOffset = -16;
    endYOffset = 16;
    StartSpriteAnim(sprite, 1);
  }
  sprite.x += startXOffset;
  sprite.y += startYOffset;
  sprite.data[0] = 6;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + endXOffset;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + endYOffset;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, AnimViceGripPincer_Step);
}

function AnimViceGripPincer_Step(sprite: Sprite): void {
  if (sprite.animEnded) DestroyAnimSprite(sprite);
}

// Animates a single pincer line that extends towards the center of the target mon, and then back out.
function AnimGuillotinePincer(sprite: Sprite): void {
  let startXOffset = 32;
  let startYOffset = -32;
  let endXOffset = 16;
  let endYOffset = -16;
  if (gBattleAnimArgs[0]) {
    startXOffset = -32;
    startYOffset = 32;
    endXOffset = -16;
    endYOffset = 16;
    StartSpriteAnim(sprite, gBattleAnimArgs[0]!);
  }
  sprite.x += startXOffset;
  sprite.y += startYOffset;
  sprite.data[0] = 6;
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + endXOffset;
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + endYOffset;
  InitAnimLinearTranslation(sprite);
  sprite.data[5] = gBattleAnimArgs[0]!;
  sprite.data[6] = sprite.data[0]!;
  sprite.callback = AnimGuillotinePincer_Step1;
}

function AnimGuillotinePincer_Step1(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite) && sprite.animEnded) {
    SeekSpriteAnim(sprite, 0);
    sprite.animPaused = true;
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.x2 = 2;
    sprite.y2 = -2;
    sprite.data[0] = sprite.data[6]!;
    sprite.data[1]! ^= 1;
    sprite.data[2]! ^= 1;
    sprite.data[4] = 0;
    sprite.data[3] = 0;
    sprite.callback = AnimGuillotinePincer_Step2;
  }
}

function AnimGuillotinePincer_Step2(sprite: Sprite): void {
  if (sprite.data[3]) {
    sprite.x2 = -sprite.x2;
    sprite.y2 = -sprite.y2;
  }
  sprite.data[3]! ^= 1;
  if (++sprite.data[4]! === 51) {
    sprite.y2 = 0;
    sprite.x2 = 0;
    sprite.data[4] = 0;
    sprite.data[3] = 0;
    sprite.animPaused = false;
    StartSpriteAnim(sprite, sprite.data[5]! ^ 1);
    sprite.callback = AnimGuillotinePincer_Step3;
  }
}

function AnimGuillotinePincer_Step3(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite)) DestroyAnimSprite(sprite);
}

// Scales up the target mon sprite, and sets the palette to greyscale.
// Used in MOVE_DISABLE.
export function AnimTask_GrowAndGrayscale(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(ANIM_TARGET);
  PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_BLEND);
  SetSpriteRotScale(spriteId, 0xd0, 0xd0, 0);
  SetGreyscaleOrOriginalPalette(gSprites[spriteId]!.oam.paletteNum + 16, false);
  gTasks[taskId]!.data[0] = 80;
  gTasks[taskId]!.func = AnimTask_GrowAndGrayscale_Step;
}

function AnimTask_GrowAndGrayscale_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  t.data[0] = s16(t.data[0]! - 1);
  if (t.data[0] === -1) {
    const spriteId = GetAnimBattlerSpriteId(ANIM_TARGET);
    ResetSpriteRotScale(spriteId);
    SetGreyscaleOrOriginalPalette(gSprites[spriteId]!.oam.paletteNum + 16, true);
    DestroyAnimVisualTask(taskId);
  }
}

// Shrinks and grows the attacking mon several times. Also creates transparent versions of the
// mon's sprite while it is shrinking.
export function AnimTask_Minimize(taskId: number): void {
  const task = gTasks[taskId]!;
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[0] = spriteId;
  PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_NORMAL);
  task.data[1] = 0;
  task.data[2] = 0;
  task.data[3] = 0;
  task.data[4] = 0x100;
  task.data[5] = 0;
  task.data[6] = 0;
  task.data[7] = GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker);
  task.func = AnimTask_Minimize_Step1;
}

function AnimTask_Minimize_Step1(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[1]) {
  case 0:
    if (task.data[2] === 0 || task.data[2] === 3 || task.data[2] === 6) CreateMinimizeSprite(task, taskId);
    task.data[2]!++;
    task.data[4]! += 0x28;
    SetSpriteRotScale(task.data[0]!, task.data[4]!, task.data[4]!, 0);
    SetBattlerSpriteYOffsetFromYScale(task.data[0]!);
    if (task.data[2] === 32) {
      task.data[5]!++;
      task.data[1]!++;
    }
    break;
  case 1:
    if (task.data[6] === 0) {
      if (task.data[5] === 3) {
        task.data[2] = 0;
        task.data[1] = 3;
      } else {
        task.data[2] = 0;
        task.data[3] = 0;
        task.data[4] = 0x100;
        SetSpriteRotScale(task.data[0]!, task.data[4]!, task.data[4]!, 0);
        SetBattlerSpriteYOffsetFromYScale(task.data[0]!);
        task.data[1] = 2;
      }
    }
    break;
  case 2:
    task.data[1] = 0;
    break;
  case 3:
    if (++task.data[2]! > 32) {
      task.data[2] = 0;
      task.data[1]!++;
    }
    break;
  case 4:
    task.data[2]! += 2;
    task.data[4]! -= 0x50;
    SetSpriteRotScale(task.data[0]!, task.data[4]!, task.data[4]!, 0);
    SetBattlerSpriteYOffsetFromYScale(task.data[0]!);
    if (task.data[2] === 32) {
      task.data[2] = 0;
      task.data[1]!++;
    }
    break;
  case 5:
    ResetSpriteRotScale(task.data[0]!);
    gSprites[task.data[15]!]!.y2 = 0;
    DestroyAnimVisualTask(taskId);
    break;
  }
}

function CreateMinimizeSprite(task: Task, taskId: number): void {
  const spriteId = s16(CloneBattlerSpriteWithBlend(ANIM_ATTACKER));
  if (spriteId >= 0) {
    const matrixNum = AllocOamMatrix();
    if (matrixNum === 0xff) {
      DestroySpriteWithActiveSheet(gSprites[spriteId]!);
    } else {
      const sprite = gSprites[spriteId]!;
      sprite.oam.objMode = ST_OAM_OBJ_BLEND;
      sprite.oam.affineMode = ST_OAM_AFFINE_DOUBLE;
      sprite.affineAnimPaused = true;
      sprite.oam.matrixNum = matrixNum;
      sprite.subpriority = (task.data[7]! - task.data[3]!) & 0xff;
      task.data[3]!++;
      task.data[6]!++;
      sprite.data[0] = 16;
      sprite.data[1] = taskId;
      sprite.data[2] = 6;
      sprite.callback = ClonedMinizeSprite_Step;
      SetSpriteRotScale(spriteId, task.data[4]!, task.data[4]!, 0);
      sprite.oam.affineMode = ST_OAM_AFFINE_NORMAL;
      CalcCenterToCornerVec(sprite, sprite.oam.shape, sprite.oam.size, sprite.oam.affineMode);
    }
  }
}

function ClonedMinizeSprite_Step(sprite: Sprite): void {
  if (--sprite.data[0]! === 0) {
    gTasks[sprite.data[1]!]!.data[sprite.data[2]!]!--;
    FreeOamMatrix(sprite.oam.matrixNum);
    DestroySpriteWithActiveSheet(sprite);
  }
}

// Task to facilitate expanding and hopping effect seen in Splash.
export function AnimTask_Splash(taskId: number): void {
  const task = gTasks[taskId]!;
  if (gBattleAnimArgs[1] === 0) {
    DestroyAnimVisualTask(taskId);
  } else {
    const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);
    task.data[0] = spriteId;
    task.data[1] = 0;
    task.data[2] = gBattleAnimArgs[1]!;
    task.data[3] = 0;
    task.data[4] = 0;
    PrepareAffineAnimInTaskData(task, spriteId, affineCmds("sSplashEffectAffineAnimCmds"));
    task.func = AnimTask_Splash_Step;
  }
}

function AnimTask_Splash_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[1]) {
  case 0:
    RunAffineAnimFromTaskData(task);
    task.data[4]! += 3;
    gSprites[task.data[0]!]!.y2 += task.data[4]!;
    if (++task.data[3]! > 7) {
      task.data[3] = 0;
      task.data[1]!++;
    }
    break;
  case 1:
    RunAffineAnimFromTaskData(task);
    gSprites[task.data[0]!]!.y2 += task.data[4]!;
    if (++task.data[3]! > 7) {
      task.data[3] = 0;
      task.data[1]!++;
    }
    break;
  case 2:
    if (task.data[4] !== 0) {
      gSprites[task.data[0]!]!.y2 -= 2;
      task.data[4]! -= 2;
    } else {
      task.data[1]!++;
    }
    break;
  case 3:
    if (!RunAffineAnimFromTaskData(task)) {
      if (--task.data[2]! === 0) {
        gSprites[task.data[0]!]!.y2 = 0;
        DestroyAnimVisualTask(taskId);
      } else {
        PrepareAffineAnimInTaskData(task, task.data[0]!, affineCmds("sSplashEffectAffineAnimCmds"));
        task.data[1] = 0;
      }
    }
    break;
  }
}

// Grows, pauses, then shrinks the attacking mon.
// Used by MOVE_SWAGGER and MOVE_BULK_UP
export function AnimTask_GrowAndShrink(taskId: number): void {
  const task = gTasks[taskId]!;
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  PrepareAffineAnimInTaskData(task, spriteId, affineCmds("sGrowAndShrinkAffineAnimCmds"));
  task.func = AnimTask_GrowAndShrink_Step;
}

function AnimTask_GrowAndShrink_Step(taskId: number): void {
  if (!RunAffineAnimFromTaskData(gTasks[taskId]!)) DestroyAnimVisualTask(taskId);
}

// Animates a little puff of the mon's breath.
function AnimBreathPuff(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    StartSpriteAnim(sprite, 0);
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + 32;
    sprite.data[1] = 64;
  } else {
    StartSpriteAnim(sprite, 1);
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) - 32;
    sprite.data[1] = -64;
  }
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[0] = 52;
  sprite.data[2] = 0;
  sprite.data[3] = 0;
  sprite.data[4] = 0;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = TranslateSpriteLinearFixedPoint;
}

// Animates an "angry" mark above a mon's head.
function AnimAngerMark(sprite: Sprite): void {
  const battler = !gBattleAnimArgs[0] ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  if (GetBattlerSide(battler) === C.B_SIDE_OPPONENT) gBattleAnimArgs[1] = gBattleAnimArgs[1]! * -1;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2) + gBattleAnimArgs[1]!;
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2]!;
  if (sprite.y < 8) sprite.y = 8;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
}

// left/right movements
export function AnimTask_ThrashMoveMonHorizontal(taskId: number): void {
  const task = gTasks[taskId]!;
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[0] = spriteId;
  task.data[1] = 0;
  PrepareAffineAnimInTaskData(task, spriteId, affineCmds("sThrashMoveMonAffineAnimCmds"));
  task.func = AnimTask_ThrashMoveMonHorizontal_Step;
}

function AnimTask_ThrashMoveMonHorizontal_Step(taskId: number): void {
  if (!RunAffineAnimFromTaskData(gTasks[taskId]!)) DestroyAnimVisualTask(taskId);
}

// up/down movements
export function AnimTask_ThrashMoveMonVertical(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[1] = 0;
  task.data[2] = 4;
  task.data[3] = 7;
  task.data[4] = 3;
  task.data[5] = gSprites[task.data[0]!]!.x;
  task.data[6] = gSprites[task.data[0]!]!.y;
  task.data[7] = 0;
  task.data[8] = 0;
  task.data[9] = 2;
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_OPPONENT) task.data[2]! *= -1;
  task.func = AnimTask_ThrashMoveMonVertical_Step;
}

function AnimTask_ThrashMoveMonVertical_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  const mon = gSprites[task.data[0]!]!;
  if (++task.data[7]! > 2) {
    task.data[7] = 0;
    task.data[8]!++;
    if (task.data[8]! & 1) mon.y += task.data[9]!;
    else mon.y -= task.data[9]!;
  }
  switch (task.data[1]) {
  case 0:
    mon.x += task.data[2]!;
    if (--task.data[3]! === 0) {
      task.data[3] = 14;
      task.data[1] = 1;
    }
    break;
  case 1:
    mon.x -= task.data[2]!;
    if (--task.data[3]! === 0) {
      task.data[3] = 7;
      task.data[1] = 2;
    }
    break;
  case 2:
    mon.x += task.data[2]!;
    if (--task.data[3]! === 0) {
      if (--task.data[4]! !== 0) {
        task.data[3] = 7;
        task.data[1] = 0;
      } else {
        if ((task.data[8]! & 1) !== 0) mon.y -= task.data[9]!;
        DestroyAnimVisualTask(taskId);
      }
    }
    break;
  }
}

export function AnimTask_SketchDrawMon(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = GetBattlerYCoordWithElevation(animState.gBattleAnimTarget) + 32;
  task.data[1] = 4;
  task.data[2] = 0;
  task.data[3] = 0;
  task.data[4] = 0;
  task.data[5] = 0;
  task.data[15] = GetBattlerSpriteCoordAttr(animState.gBattleAnimTarget, C.BATTLER_COORD_ATTR_HEIGHT);

  let dmaDest: number;
  if (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimTarget) === 1) {
    task.data[6] = s16(G.gBattle_BG1_X);
    dmaDest = C.REG_OFFSET_BG1HOFS;
  } else {
    task.data[6] = s16(G.gBattle_BG2_X);
    dmaDest = C.REG_OFFSET_BG2HOFS;
  }

  for (let i = s16(task.data[0]! - 0x40); i <= task.data[0]!; i++) {
    if (i >= 0) {
      gScanlineEffectRegBuffers[0]![i] = task.data[6]! + 0xf0;
      gScanlineEffectRegBuffers[1]![i] = task.data[6]! + 0xf0;
    }
  }
  ScanlineEffect_SetParams({ dmaDest, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1, unused9: 0 });
  task.func = AnimTask_SketchDrawMon_Step;
}

function AnimTask_SketchDrawMon_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[4]) {
  case 0:
    if (++task.data[5]! > 20) task.data[4]!++;
    break;
  case 1:
    if (++task.data[1]! > 3) {
      task.data[1] = 0;
      task.data[2] = task.data[3]! & 3;
      task.data[5] = task.data[0]! - task.data[3]!;
      switch (task.data[2]) {
      case 0: break;
      case 1: task.data[5]! -= 2; break;
      case 2: task.data[5]! += 1; break;
      case 3: task.data[5]! += 1; break;
      }
      if (task.data[5]! >= 0) {
        gScanlineEffectRegBuffers[0]![task.data[5]!] = task.data[6]!;
        gScanlineEffectRegBuffers[1]![task.data[5]!] = task.data[6]!;
      }
      if (++task.data[3]! >= task.data[15]!) {
        gScanlineEffect.state = 3;
        DestroyAnimVisualTask(taskId);
      }
    }
    break;
  }
}

function AnimPencil(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X) - 16;
  sprite.y = GetBattlerYCoordWithElevation(animState.gBattleAnimTarget) + 16;
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.data[2] = 0;
  sprite.data[3] = 16;
  sprite.data[4] = 0;
  sprite.data[5] = GetBattlerSpriteCoordAttr(animState.gBattleAnimTarget, C.BATTLER_COORD_ATTR_HEIGHT) + 2;
  sprite.data[6] = BattleAnimAdjustPanning(C.SOUND_PAN_TARGET);
  sprite.callback = AnimPencil_Step;
}

function AnimPencil_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    if (++sprite.data[2]! > 1) {
      sprite.data[2] = 0;
      sprite.invisible = !sprite.invisible;
    }
    if (++sprite.data[1]! > 16) {
      sprite.invisible = false;
      sprite.data[0]!++;
    }
    break;
  case 1:
    if (++sprite.data[1]! > 3 && sprite.data[2]! < sprite.data[5]!) {
      sprite.data[1] = 0;
      sprite.y -= 1;
      sprite.data[2]!++;
      if (sprite.data[2]! % 10 === 0) PlaySE12WithPanning(C.SE_M_SKETCH, sprite.data[6]!);
    }
    sprite.data[4]! += sprite.data[3]!;
    if (sprite.data[4]! > 31) {
      sprite.data[4] = 0x40 - sprite.data[4]!;
      sprite.data[3]! *= -1;
    } else if (sprite.data[4]! <= -32) {
      sprite.data[4] = -0x40 - sprite.data[4]!;
      sprite.data[3]! *= -1;
    }
    sprite.x2 = sprite.data[4]!;
    if (sprite.data[5] === sprite.data[2]) {
      sprite.data[1] = 0;
      sprite.data[2] = 0;
      sprite.data[0]!++;
    }
    break;
  case 2:
    if (++sprite.data[2]! > 1) {
      sprite.data[2] = 0;
      sprite.invisible = !sprite.invisible;
    }
    if (++sprite.data[1]! > 16) {
      sprite.invisible = false;
      DestroyAnimSprite(sprite);
    }
    break;
  }
}

function AnimBlendThinRing(sprite: Sprite): void {
  const battler = gBattleAnimArgs[2] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  let r4 = (gBattleAnimArgs[3]! ^ 1) & 0xff;
  if (IsDoubleBattle() && IsBattlerSpriteVisible(BATTLE_PARTNER(battler))) {
    const sp0 = u16(SetAverageBattlerPositions(battler, !!r4).x);
    if (r4 === 0) r4 = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X) & 0xff;
    else r4 = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2) & 0xff;
    if (GetBattlerSide(battler) !== C.B_SIDE_PLAYER) gBattleAnimArgs[0] = gBattleAnimArgs[0]! - ((sp0 - r4) - gBattleAnimArgs[0]!);
    else gBattleAnimArgs[0] = sp0 - r4;
  }
  sprite.callback = AnimSpriteOnMonPos;
  sprite.callback(sprite);
}

function AnimHyperVoiceRing_WaitEnd(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite)) {
    FreeSpriteOamMatrix(sprite);
    DestroyAnimSprite(sprite);
  }
}

function AnimHyperVoiceRing(sprite: Sprite): void {
  let battler1: number;
  let battler2: number;
  if (gBattleAnimArgs[5] === 0) {
    battler1 = animState.gBattleAnimAttacker;
    battler2 = animState.gBattleAnimTarget;
  } else {
    battler1 = animState.gBattleAnimTarget;
    battler2 = animState.gBattleAnimAttacker;
  }

  let xCoordType: number;
  let yCoordType: number;
  if (!gBattleAnimArgs[6]) {
    xCoordType = C.BATTLER_COORD_X;
    yCoordType = C.BATTLER_COORD_Y;
  } else {
    xCoordType = C.BATTLER_COORD_X_2;
    yCoordType = C.BATTLER_COORD_Y_PIC_OFFSET;
  }

  let startX: number;
  const spr = (b: number) => gSprites[gBattlerSpriteIds[b]!]!;
  if (GetBattlerSide(battler1) !== C.B_SIDE_PLAYER) {
    startX = u16(GetBattlerSpriteCoord(battler1, xCoordType) + gBattleAnimArgs[0]!);
    if (IsBattlerSpriteVisible(BATTLE_PARTNER(battler2))) sprite.subpriority = (spr(BATTLE_PARTNER(battler2)).subpriority - 1) & 0xff;
    else sprite.subpriority = (spr(battler2).subpriority - 1) & 0xff;
  } else {
    startX = u16(GetBattlerSpriteCoord(battler1, xCoordType) - gBattleAnimArgs[0]!);
    if (!IsContest() && IsBattlerSpriteVisible(BATTLE_PARTNER(battler1))) {
      if (spr(battler1).x < spr(BATTLE_PARTNER(battler1)).x) sprite.subpriority = (spr(BATTLE_PARTNER(battler1)).subpriority + 1) & 0xff;
      else sprite.subpriority = (spr(battler1).subpriority - 1) & 0xff;
    } else {
      sprite.subpriority = (spr(battler1).subpriority - 1) & 0xff;
    }
  }

  const startY = u16(GetBattlerSpriteCoord(battler1, yCoordType) + gBattleAnimArgs[1]!);
  let x: number;
  let y: number;
  if (!IsContest() && IsBattlerSpriteVisible(BATTLE_PARTNER(battler2))) {
    const pos = SetAverageBattlerPositions(battler2, !!gBattleAnimArgs[6]);
    x = pos.x;
    y = pos.y;
  } else {
    x = GetBattlerSpriteCoord(battler2, xCoordType);
    y = GetBattlerSpriteCoord(battler2, yCoordType);
  }

  if (GetBattlerSide(battler2) !== C.B_SIDE_PLAYER) x = s16(x + gBattleAnimArgs[3]!);
  else x = s16(x - gBattleAnimArgs[3]!);
  y = s16(y + gBattleAnimArgs[4]!);
  sprite.x = sprite.data[1] = s16(startX);
  sprite.y = sprite.data[3] = s16(startY);
  sprite.data[2] = x;
  sprite.data[4] = y;
  sprite.data[0] = gBattleAnimArgs[0]!;
  InitAnimLinearTranslation(sprite);
  sprite.callback = AnimHyperVoiceRing_WaitEnd;
  sprite.callback(sprite);
}

function AnimUproarRing(sprite: Sprite): void {
  const index = IndexOfSpritePaletteTag(C.ANIM_TAG_THIN_RING) & 0xff;
  if (index !== 0xff) BlendPalette(OBJ_PLTT_ID(index) + 1, 15, gBattleAnimArgs[5]!, u16(gBattleAnimArgs[4]!));
  StartSpriteAffineAnim(sprite, 1);
  sprite.callback = AnimSpriteOnMonPos;
  sprite.callback(sprite);
}

function AnimSoftBoiledEgg(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, false);
  const r1 = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? -160 : 160;
  sprite.data[0] = 0x380;
  sprite.data[1] = r1;
  sprite.data[7] = gBattleAnimArgs[2]!;
  sprite.callback = AnimSoftBoiledEgg_Step1;
}

function AnimSoftBoiledEgg_Step1(sprite: Sprite): void {
  sprite.y2 -= sprite.data[0]! >> 8;
  sprite.x2 = sprite.data[1]! >> 8;
  sprite.data[0]! -= 32;
  const add = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? -160 : 160;
  sprite.data[1]! += add;
  if (sprite.y2 > 0) {
    sprite.y += sprite.y2;
    sprite.x += sprite.x2;
    sprite.y2 = 0;
    sprite.x2 = 0;
    sprite.data[0] = 0;
    StartSpriteAffineAnim(sprite, 1);
    sprite.callback = AnimSoftBoiledEgg_Step2;
  }
}

function AnimSoftBoiledEgg_Step2(sprite: Sprite): void {
  if (sprite.data[0]!++ > 19) {
    StartSpriteAffineAnim(sprite, 2);
    sprite.callback = AnimSoftBoiledEgg_Step3;
  }
}

function AnimSoftBoiledEgg_Step3(sprite: Sprite): void {
  if (sprite.affineAnimEnded) {
    StartSpriteAffineAnim(sprite, 1);
    sprite.data[0] = 0;
    if (sprite.data[7] === 0) {
      sprite.oam.tileNum += 16;
      sprite.callback = AnimSoftBoiledEgg_Step3_Callback1;
    } else {
      sprite.oam.tileNum += 32;
      sprite.callback = AnimSoftBoiledEgg_Step4;
    }
  }
}

function AnimSoftBoiledEgg_Step3_Callback1(sprite: Sprite): void {
  sprite.y2 -= 2;
  if (++sprite.data[0]! === 9) {
    sprite.data[0] = 16;
    sprite.data[1] = 0;
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(u16(sprite.data[0]!), 0));
    sprite.callback = AnimSoftBoiledEgg_Step3_Callback2;
  }
}

function AnimSoftBoiledEgg_Step3_Callback2(sprite: Sprite): void {
  if (sprite.data[1]!++ % 3 === 0) {
    sprite.data[0]!--;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[0]!, 16 - sprite.data[0]!));
    if (sprite.data[0] === 0) sprite.callback = AnimSoftBoiledEgg_Step4;
  }
}

function AnimSoftBoiledEgg_Step4(sprite: Sprite): void {
  if (u16(gBattleAnimArgs[7]!) === 0xffff) {
    sprite.invisible = true;
    if (sprite.data[7] === 0) sprite.callback = AnimSoftBoiledEgg_Step4_Callback;
    else sprite.callback = DestroyAnimSprite;
  }
}

function AnimSoftBoiledEgg_Step4_Callback(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
  DestroyAnimSprite(sprite);
}

// Used by Extremespeed
export function AnimTask_AttackerStretchAndDisappear(taskId: number): void {
  const task = gTasks[taskId]!;
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[0] = spriteId;
  PrepareAffineAnimInTaskData(task, spriteId, affineCmds("sStretchAttackerAffineAnimCmds"));
  task.func = AnimTask_AttackerStretchAndDisappear_Step;
}

function AnimTask_AttackerStretchAndDisappear_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  if (!RunAffineAnimFromTaskData(task)) {
    gSprites[task.data[0]!]!.y2 = 0;
    gSprites[task.data[0]!]!.invisible = true;
    DestroyAnimVisualTask(taskId);
  }
}

export function AnimTask_ExtremeSpeedImpact(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = 0;
  task.data[1] = 0;
  task.data[2] = 0;
  task.data[3] = 0;
  task.data[12] = 3;
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) {
    task.data[13] = -1;
    task.data[14] = 8;
  } else {
    task.data[13] = 1;
    task.data[14] = -8;
  }
  task.data[15] = GetAnimBattlerSpriteId(ANIM_TARGET);
  task.func = AnimTask_ExtremeSpeedImpact_Step;
}

function AnimTask_ExtremeSpeedImpact_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  const mon = gSprites[task.data[15]!]!;
  switch (task.data[0]) {
  case 0:
    mon.x2 += task.data[14]!;
    task.data[1] = 0;
    task.data[2] = 0;
    task.data[3] = 0;
    task.data[0]!++;
    break;
  case 1:
    if (++task.data[1]! > 1) {
      task.data[1] = 0;
      task.data[2]!++;
      if (task.data[2]! & 1) mon.x2 += 6;
      else mon.x2 -= 6;
      if (++task.data[3]! > 4) {
        if (task.data[2]! & 1) mon.x2 -= 6;
        task.data[0]!++;
      }
    }
    break;
  case 2:
    if (--task.data[12]! !== 0) task.data[0] = 0;
    else task.data[0]!++;
    break;
  case 3:
    mon.x2 += task.data[13]!;
    if (mon.x2 === 0) DestroyAnimVisualTask(taskId);
    break;
  }
}

export function AnimTask_ExtremeSpeedMonReappear(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = 0;
  task.data[1] = 0;
  task.data[2] = 0;
  task.data[3] = 0;
  task.data[4] = 1;
  task.data[13] = 14;
  task.data[14] = 2;
  task.data[15] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.func = AnimTask_ExtremeSpeedMonReappear_Step;
}

function AnimTask_ExtremeSpeedMonReappear_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  if (task.data[0] === 0 && ++task.data[1]! > task.data[4]!) {
    task.data[1] = 0;
    if (++task.data[2]! & 1) gSprites[task.data[15]!]!.invisible = false;
    else gSprites[task.data[15]!]!.invisible = true;

    if (++task.data[3]! >= task.data[13]!) {
      if (++task.data[4]! < task.data[14]!) {
        task.data[1] = 0;
        task.data[2] = 0;
        task.data[3] = 0;
      } else {
        gSprites[task.data[15]!]!.invisible = false;
        DestroyAnimVisualTask(taskId);
      }
    }
  }
}

export function AnimTask_SpeedDust(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = 0;
  task.data[1] = 4;
  task.data[2] = 0;
  task.data[3] = 0;
  task.data[4] = 0;
  task.data[5] = 0;
  task.data[6] = 0;
  task.data[7] = 0;
  task.data[8] = 0;
  task.data[13] = 0;
  task.data[14] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
  task.data[15] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y);
  task.func = AnimTask_SpeedDust_Step;
}

const sSpeedDustPosTable = () => cdata<number[][]>("battle_anim_effects_2", "sSpeedDustPosTable");

function AnimTask_SpeedDust_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[8]) {
  case 0:
    if (++task.data[4]! > 1) {
      task.data[4] = 0;
      task.data[5] = (task.data[5]! + 1) & 1;
      if (++task.data[6]! > 20) {
        if (task.data[7] === 0) {
          task.data[6] = 0;
          task.data[8] = 1;
        } else {
          task.data[8] = 2;
        }
      }
    }
    break;
  case 1:
    task.data[5] = 0;
    if (++task.data[4]! > 20) {
      task.data[7] = 1;
      task.data[8] = 0;
    }
    break;
  case 2:
    task.data[5] = 1;
    break;
  }

  switch (task.data[0]) {
  case 0:
    if (++task.data[1]! > 4) {
      task.data[1] = 0;
      const spriteId = CreateSprite(animTemplate("gSpeedDustSpriteTemplate"), task.data[14]!, task.data[15]!, 0);
      if (spriteId !== MAX_SPRITES) {
        gSprites[spriteId]!.data[0] = taskId;
        gSprites[spriteId]!.data[1] = 13;
        gSprites[spriteId]!.x2 = sSpeedDustPosTable()[task.data[2]!]![0]!;
        gSprites[spriteId]!.y2 = sSpeedDustPosTable()[task.data[2]!]![1]!;
        task.data[13]!++;
        if (++task.data[2]! > 3) {
          task.data[2] = 0;
          if (++task.data[3]! > 5) task.data[0]!++;
        }
      }
    }
    break;
  case 1:
    if (task.data[13] === 0) DestroyAnimVisualTask(taskId);
    break;
  }
}

function AnimSpeedDust(sprite: Sprite): void {
  sprite.invisible = !!gTasks[sprite.data[0]!]!.data[5];
  if (sprite.animEnded) {
    gTasks[sprite.data[0]!]!.data[sprite.data[1]!]!--;
    DestroySprite(sprite);
  }
}

const gMusicNotePaletteTagsTable = () => cdata<number[]>("battle_anim_effects_2", "gMusicNotePaletteTagsTable");

export function AnimTask_LoadMusicNotesPals(taskId: number): void {
  const paletteNums: number[] = [];
  paletteNums[0] = IndexOfSpritePaletteTag(C.ANIM_TAG_MUSIC_NOTES_2) & 0xff;
  for (let i = 1; i < NUM_MUSIC_NOTE_PAL_TAGS; i++) paletteNums[i] = AllocSpritePalette(ANIM_SPRITES_START - i) & 0xff;

  const buffer = incbin("gBattleAnimSpritePal_MusicNotes2");
  for (let i = 0; i < NUM_MUSIC_NOTE_PAL_TAGS; i++)
    LoadPalette(buffer.subarray(i * 32, i * 32 + 32), OBJ_PLTT_ID(paletteNums[i]!), PLTT_SIZE_4BPP);
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_FreeMusicNotesPals(taskId: number): void {
  for (let i = 0; i < NUM_MUSIC_NOTE_PAL_TAGS; i++) FreeSpritePaletteByTag(gMusicNotePaletteTagsTable()[i]!);
  DestroyAnimVisualTask(taskId);
}

function SetMusicNotePalette(sprite: Sprite, a: number, b: number): void {
  a &= 0xff;
  b &= 0xff;
  const tile = b & 1 ? 32 : 0;
  sprite.oam.tileNum += tile + (a << 2);
  sprite.oam.paletteNum = IndexOfSpritePaletteTag(gMusicNotePaletteTagsTable()[b >> 1]!) & 0xf;
}

function AnimHealBellMusicNote(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, false);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2]!;
  sprite.data[0] = gBattleAnimArgs[4]!;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X) + gBattleAnimArgs[2]!;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + gBattleAnimArgs[3]!;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  SetMusicNotePalette(sprite, gBattleAnimArgs[5]!, gBattleAnimArgs[6]!);
}

function AnimMagentaHeart(sprite: Sprite): void {
  if (++sprite.data[0]! === 1) InitSpritePosToAnimAttacker(sprite, false);
  sprite.x2 = Sin(sprite.data[1]!, 8);
  sprite.y2 = sprite.data[2]! >> 8;
  sprite.data[1] = (sprite.data[1]! + 7) & 0xff;
  sprite.data[2]! -= 0x80;
  if (sprite.data[0] === 60) DestroyAnimSprite(sprite);
}

export function AnimTask_FakeOut(taskId: number): void {
  const win0h = IsContest() ? 152 : C.DISPLAY_WIDTH;
  const win0v = 0;
  G.gBattle_WIN0H = win0h;
  G.gBattle_WIN0V = C.DISPLAY_HEIGHT;
  SetGpuReg(C.REG_OFFSET_WIN0H, G.gBattle_WIN0H);
  SetGpuReg(C.REG_OFFSET_WIN0V, G.gBattle_WIN0V);
  SetGpuReg(C.REG_OFFSET_WININ, C.WININ_WIN1_CLR | C.WININ_WIN1_OBJ | C.WININ_WIN1_BG_ALL | C.WININ_WIN0_OBJ | C.WININ_WIN0_BG_ALL);
  SetGpuReg(C.REG_OFFSET_WINOUT, C.WININ_WIN1_CLR | C.WININ_WIN1_OBJ | C.WININ_WIN1_BG_ALL | C.WININ_WIN0_CLR | C.WININ_WIN0_OBJ | C.WININ_WIN0_BG_ALL);
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG3 | C.BLDCNT_EFFECT_DARKEN);
  SetGpuReg(C.REG_OFFSET_BLDY, 16);
  gTasks[taskId]!.data[0] = win0v;
  gTasks[taskId]!.data[1] = win0h;
  gTasks[taskId]!.func = AnimTask_FakeOut_Step1;
}

function AnimTask_FakeOut_Step1(taskId: number): void {
  const t = gTasks[taskId]!;
  t.data[0]! += 13;
  t.data[1]! -= 13;
  if (t.data[0]! >= t.data[1]!) {
    G.gBattle_WIN0H = 0;
    t.func = AnimTask_FakeOut_Step2;
  } else {
    G.gBattle_WIN0H = t.data[1]! | (t.data[0]! << 8);
  }
}

function AnimTask_FakeOut_Step2(taskId: number): void {
  const t = gTasks[taskId]!;
  if (++t.data[10]! === 5) {
    t.data[11] = 0x88;
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG3 | C.BLDCNT_EFFECT_LIGHTEN);
    BlendPalettes(GetBattlePalettesMask(true, false, false, false, false, false, false), 16, RGB_WHITE);
  } else if (t.data[10]! > 4) {
    G.gBattle_WIN0H = 0;
    G.gBattle_WIN0V = 0;
    SetGpuReg(C.REG_OFFSET_WININ, C.WININ_WIN0_BG_ALL | C.WININ_WIN0_OBJ | C.WININ_WIN0_CLR | C.WININ_WIN1_BG_ALL | C.WININ_WIN1_OBJ | C.WININ_WIN1_CLR);
    SetGpuReg(C.REG_OFFSET_WINOUT, C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR);
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDY, 0);
    DestroyAnimVisualTask(taskId);
  }
}

function stretchBattlerUp(taskId: number, animBattler: number): void {
  const spriteId = GetAnimBattlerSpriteId(animBattler);
  const t = gTasks[taskId]!;
  if (++t.data[0]! === 1) {
    PrepareAffineAnimInTaskData(t, GetAnimBattlerSpriteId(animBattler), affineCmds("sAffineAnims_StretchBattlerUp"));
    gSprites[spriteId]!.x2 = 4;
  } else {
    gSprites[spriteId]!.x2 = -gSprites[spriteId]!.x2;
    if (!RunAffineAnimFromTaskData(t)) {
      gSprites[spriteId]!.x2 = 0;
      gSprites[spriteId]!.y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  }
}

export function AnimTask_StretchTargetUp(taskId: number): void {
  stretchBattlerUp(taskId, ANIM_TARGET);
}

export function AnimTask_StretchAttackerUp(taskId: number): void {
  stretchBattlerUp(taskId, ANIM_ATTACKER);
}

function AnimRedHeartProjectile(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = 95;
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  InitAnimLinearTranslation(sprite);
  sprite.callback = AnimRedHeartProjectile_Step;
}

function AnimRedHeartProjectile_Step(sprite: Sprite): void {
  if (!AnimTranslateLinear(sprite)) {
    sprite.y2 += Sin(sprite.data[5]!, 14);
    sprite.data[5] = (sprite.data[5]! + 4) & 0xff;
  } else {
    DestroyAnimSprite(sprite);
  }
}

export function AnimParticleBurst(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    sprite.data[1] = gBattleAnimArgs[0]!;
    sprite.data[2] = gBattleAnimArgs[1]!;
    sprite.data[0]!++;
  } else {
    sprite.data[4]! += sprite.data[1]!;
    sprite.x2 = sprite.data[4]! >> 8;
    sprite.y2 = Sin(sprite.data[3]!, sprite.data[2]!);
    sprite.data[3] = (sprite.data[3]! + 3) & 0xff;
    if (sprite.data[3]! > 100) sprite.invisible = !!(sprite.data[3]! % 2);
    if (sprite.data[3]! > 120) DestroyAnimSprite(sprite);
  }
}

function AnimRedHeartRising(sprite: Sprite): void {
  sprite.x = gBattleAnimArgs[0]!;
  sprite.y = C.DISPLAY_HEIGHT;
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[1] = gBattleAnimArgs[1]!;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, AnimRedHeartRising_Step);
}

function AnimRedHeartRising_Step(sprite: Sprite): void {
  sprite.data[2]! += sprite.data[1]!;
  sprite.y2 = -(u16(sprite.data[2]!) >> 8);
  sprite.x2 = Sin(sprite.data[3]!, 4);
  sprite.data[3] = (sprite.data[3]! + 3) & 0xff;
  const y = s16(sprite.y + sprite.y2);
  if (y <= 72) {
    sprite.invisible = !!(sprite.data[3]! % 2);
    if (y <= 64) DestroyAnimSprite(sprite);
  }
}

export function AnimTask_HeartsBackground(taskId: number): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_TGT1_BG1 | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 3);
  SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 0);
  if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);

  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  SetGpuReg(C.REG_OFFSET_BG1HOFS, G.gBattle_BG1_X);
  SetGpuReg(C.REG_OFFSET_BG1VOFS, G.gBattle_BG1_Y);
  const animBg = GetBattleAnimBg1Data();
  AnimLoadCompressedBgTilemap(animBg.bgId, incbin16("gBattleAnimBg_AttractTilemap"));
  AnimLoadCompressedBgGfx(animBg.bgId, incbin("gBattleAnimBg_AttractGfx"), animBg.tilesOffset);
  LoadPalette(incbin("gBattleAnimBg_AttractPal"), BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
  if (IsContest()) RelocateBattleBgPal(animBg.paletteId, animBg.bgTilemap, 0, false);
  gTasks[taskId]!.func = AnimTask_HeartsBackground_Step;
}

function AnimTask_HeartsBackground_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  switch (t.data[12]) {
  case 0:
    if (++t.data[10]! === 4) {
      t.data[10] = 0;
      t.data[11]!++;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[11]!, 16 - t.data[11]!));
      if (t.data[11] === 16) {
        t.data[12]!++;
        t.data[11] = 0;
      }
    }
    break;
  case 1:
    if (++t.data[11]! === 141) {
      t.data[11] = 16;
      t.data[12]!++;
    }
    break;
  case 2:
    if (++t.data[10]! === 4) {
      t.data[10] = 0;
      t.data[11]!--;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[11]!, 16 - t.data[11]!));
      if (t.data[11] === 0) {
        t.data[12]!++;
        t.data[11] = 0;
      }
    }
    break;
  case 3: {
    const animBg = GetBattleAnimBg1Data();
    InitBattleAnimBg(animBg.bgId);
    t.data[12]!++;
    break;
  }
  case 4:
    if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
    SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
    DestroyAnimVisualTask(taskId);
    break;
  }
}

export function AnimTask_ScaryFace(taskId: number): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_TGT1_BG1 | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
  SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 0);
  if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);

  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  SetGpuReg(C.REG_OFFSET_BG1HOFS, G.gBattle_BG1_X);
  SetGpuReg(C.REG_OFFSET_BG1VOFS, G.gBattle_BG1_Y);
  const animBg = GetBattleAnimBg1Data();

  if (IsContest()) animBg.bgTilemap.set(incbin16("gBattleAnimBgTilemap_ScaryFaceContest"));
  else if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_OPPONENT)
    AnimLoadCompressedBgTilemap(animBg.bgId, incbin16("gBattleAnimBgTilemap_ScaryFacePlayer"));
  else
    AnimLoadCompressedBgTilemap(animBg.bgId, incbin16("gBattleAnimBgTilemap_ScaryFaceOpponent"));

  AnimLoadCompressedBgGfx(animBg.bgId, incbin("gBattleAnim_ScaryFaceGfx"), animBg.tilesOffset);
  LoadPalette(incbin("gBattleAnim_ScaryFacePal"), BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
  if (IsContest()) RelocateBattleBgPal(animBg.paletteId, animBg.bgTilemap, 0, false);
  gTasks[taskId]!.func = AnimTask_ScaryFace_Step;
}

function AnimTask_ScaryFace_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  switch (t.data[12]) {
  case 0:
    if (++t.data[10]! === 2) {
      t.data[10] = 0;
      t.data[11]!++;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[11]!, 16 - t.data[11]!));
      if (t.data[11] === 14) {
        t.data[12]!++;
        t.data[11] = 0;
      }
    }
    break;
  case 1:
    if (++t.data[11]! === 21) {
      t.data[11] = 14;
      t.data[12]!++;
    }
    break;
  case 2:
    if (++t.data[10]! === 2) {
      t.data[10] = 0;
      t.data[11]!--;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[11]!, 16 - t.data[11]!));
      if (t.data[11] === 0) {
        t.data[12]!++;
        t.data[11] = 0;
      }
    }
    break;
  case 3:
    GetBattleAnimBg1Data();
    InitBattleAnimBg(1);
    InitBattleAnimBg(2);
    t.data[12]!++;
    // fall through
  case 4:
    if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
    SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
    DestroyAnimVisualTask(taskId);
    break;
  }
}

// Orbits a sphere in an ellipse around the mon.
// Used by MOVE_HIDDEN_POWER
function AnimOrbitFast(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.affineAnimPaused = true;
  sprite.data[0] = gBattleAnimArgs[0]!;
  sprite.data[1] = gBattleAnimArgs[1]!;
  sprite.data[7] = GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker);
  sprite.callback = AnimOrbitFast_Step;
  sprite.callback(sprite);
}

function AnimOrbitFast_Step(sprite: Sprite): void {
  if (sprite.data[1]! >= 64 && sprite.data[1]! <= 191) sprite.subpriority = (sprite.data[7]! + 1) & 0xff;
  else sprite.subpriority = (sprite.data[7]! - 1) & 0xff;

  sprite.x2 = Sin(sprite.data[1]!, sprite.data[2]! >> 8);
  sprite.y2 = Cos(sprite.data[1]!, sprite.data[3]! >> 8);
  sprite.data[1] = (sprite.data[1]! + 9) & 0xff;
  switch (sprite.data[5]) {
  case 1:
    sprite.data[2]! -= 0x400;
    sprite.data[3]! -= 0x100;
    if (++sprite.data[4]! === sprite.data[0]) {
      sprite.data[5] = 2;
      return;
    }
    break;
  case 0:
    sprite.data[2]! += 0x400;
    sprite.data[3]! += 0x100;
    if (++sprite.data[4]! === sprite.data[0]) {
      sprite.data[4] = 0;
      sprite.data[5] = 1;
    }
    break;
  }
  if (u16(gBattleAnimArgs[7]!) === 0xffff) DestroyAnimSprite(sprite);
}

// Moves orbs away from the mon, based on where they are in their orbit.
// Used in MOVE_HIDDEN_POWER.
function AnimOrbitScatter(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[0] = Sin(gBattleAnimArgs[0]!, 10);
  sprite.data[1] = Cos(gBattleAnimArgs[0]!, 7);
  sprite.callback = AnimOrbitScatter_Step;
}

function AnimOrbitScatter_Step(sprite: Sprite): void {
  sprite.x2 += sprite.data[0]!;
  sprite.y2 += sprite.data[1]!;
  if (((sprite.x + sprite.x2 + 16) >>> 0) > C.DISPLAY_WIDTH + 32
   || sprite.y + sprite.y2 > C.DISPLAY_HEIGHT || sprite.y + sprite.y2 < -16)
    DestroyAnimSprite(sprite);
}

function AnimSpitUpOrb_Step(sprite: Sprite): void {
  sprite.x2 += sprite.data[0]!;
  sprite.y2 += sprite.data[1]!;
  if (sprite.data[3]!++ >= sprite.data[2]!) DestroyAnimSprite(sprite);
}

function AnimSpitUpOrb(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[0] = Sin(gBattleAnimArgs[0]!, 10);
  sprite.data[1] = Cos(gBattleAnimArgs[0]!, 7);
  sprite.data[2] = gBattleAnimArgs[1]!;
  sprite.callback = AnimSpitUpOrb_Step;
}

function AnimEyeSparkle_Step(sprite: Sprite): void {
  if (sprite.animEnded) DestroyAnimSprite(sprite);
}

function AnimEyeSparkle(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.callback = AnimEyeSparkle_Step;
}

function AnimAngel(sprite: Sprite): void {
  if (!sprite.data[0]) {
    sprite.x += gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
  }
  sprite.data[0]!++;
  const var0 = (sprite.data[0]! * 10) & 0xff;
  sprite.x2 = Sin(var0, 80) >> 8;
  if (sprite.data[0]! < 80) sprite.y2 = Math.trunc(sprite.data[0]! / 2) + (Cos(var0, 80) >> 8);
  if (sprite.data[0]! > 90) {
    sprite.data[2]!++;
    sprite.x2 -= Math.trunc(sprite.data[2]! / 2);
  }
  if (sprite.data[0]! > 100) DestroyAnimSprite(sprite);
}

function AnimPinkHeart_Step(sprite: Sprite): void {
  sprite.data[5]!++;
  sprite.x2 = Sin(sprite.data[3]!, 5);
  sprite.y2 = Math.trunc(sprite.data[5]! / 2);
  sprite.data[3] = (sprite.data[3]! + 3) & 0xff;
  if (sprite.data[5]! > 20) sprite.invisible = !!(sprite.data[5]! % 2);
  if (sprite.data[5]! > 30) DestroyAnimSprite(sprite);
}

function AnimPinkHeart(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    sprite.data[1] = gBattleAnimArgs[0]!;
    sprite.data[2] = gBattleAnimArgs[1]!;
    sprite.data[0]!++;
  } else {
    sprite.data[4]! += sprite.data[1]!;
    sprite.x2 = sprite.data[4]! >> 8;
    sprite.y2 = Sin(sprite.data[3]!, sprite.data[2]!);
    sprite.data[3] = (sprite.data[3]! + 3) & 0xff;
    if (sprite.data[3]! > 70) {
      sprite.callback = AnimPinkHeart_Step;
      sprite.x += sprite.x2;
      sprite.y += sprite.y2;
      sprite.x2 = 0;
      sprite.y2 = 0;
      sprite.data[3] = random() % 180;
    }
  }
}

function AnimDevil(sprite: Sprite): void {
  if (sprite.data[3] === 0) {
    sprite.x += gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
    StartSpriteAnim(sprite, 0);
    sprite.subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimTarget) - 1) & 0xff;
    sprite.data[2] = 1;
  }
  sprite.data[0]! += sprite.data[2]!;
  sprite.data[1] = (sprite.data[0]! * 4) % 256;
  if (sprite.data[1]! < 0) sprite.data[1] = 0;
  sprite.x2 = Cos(sprite.data[1]!, 30 - Math.trunc(sprite.data[0]! / 4));
  sprite.y2 = Sin(sprite.data[1]!, 10 - Math.trunc(sprite.data[0]! / 8));
  if (sprite.data[1]! > 128 && sprite.data[2]! > 0) sprite.data[2] = -1;
  if (sprite.data[1] === 0 && sprite.data[2]! < 0) sprite.data[2] = 1;
  sprite.data[3]!++;
  if (sprite.data[3]! < 10 || sprite.data[3]! > 80) sprite.invisible = !!(sprite.data[0]! % 2);
  else sprite.invisible = false;
  if (sprite.data[3]! > 90) DestroyAnimSprite(sprite);
}

function AnimFurySwipes(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    sprite.x += gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
    StartSpriteAnim(sprite, gBattleAnimArgs[2]!);
    sprite.data[0]!++;
  } else if (sprite.animEnded) {
    DestroyAnimSprite(sprite);
  }
}

function AnimMovementWaves(sprite: Sprite): void {
  if (!gBattleAnimArgs[2]) {
    DestroyAnimSprite(sprite);
  } else {
    if (!gBattleAnimArgs[0]) {
      sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
      sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
    } else {
      sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
      sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
    }
    if (!gBattleAnimArgs[1]) sprite.x += 32;
    else sprite.x -= 32;
    sprite.data[0] = gBattleAnimArgs[2]!;
    sprite.data[1] = gBattleAnimArgs[1]!;
    StartSpriteAnim(sprite, sprite.data[1]!);
    sprite.callback = AnimMovementWaves_Step;
  }
}

function AnimMovementWaves_Step(sprite: Sprite): void {
  if (sprite.animEnded) {
    if (--sprite.data[0]!) StartSpriteAnim(sprite, sprite.data[1]!);
    else DestroyAnimSprite(sprite);
  }
}

export function AnimTask_UproarDistortion(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);
  PrepareAffineAnimInTaskData(gTasks[taskId]!, spriteId, affineCmds("sUproarAffineAnimCmds"));
  gTasks[taskId]!.func = AnimTask_UproarDistortion_Step;
}

function AnimTask_UproarDistortion_Step(taskId: number): void {
  if (!RunAffineAnimFromTaskData(gTasks[taskId]!)) DestroyAnimVisualTask(taskId);
}

function AnimJaggedMusicNote(sprite: Sprite): void {
  const battler = !gBattleAnimArgs[0] ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  if (GetBattlerSide(battler) === C.B_SIDE_OPPONENT) gBattleAnimArgs[1] = gBattleAnimArgs[1]! * -1;

  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2) + gBattleAnimArgs[1]!;
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2]!;
  sprite.data[0] = 0;
  sprite.data[1] = u16(sprite.x) << 3;
  sprite.data[2] = u16(sprite.y) << 3;

  let var1 = gBattleAnimArgs[1]! << 3;
  if (var1 < 0) var1 += 7;
  sprite.data[3] = var1 >> 3;

  var1 = gBattleAnimArgs[2]! << 3;
  if (var1 < 0) var1 += 7;
  sprite.data[4] = var1 >> 3;

  sprite.oam.tileNum += gBattleAnimArgs[3]! * 16;
  sprite.callback = AnimJaggedMusicNote_Step;
}

function AnimJaggedMusicNote_Step(sprite: Sprite): void {
  sprite.data[1]! += sprite.data[3]!;
  sprite.data[2]! += sprite.data[4]!;
  sprite.x = sprite.data[1]! >> 3;
  sprite.y = sprite.data[2]! >> 3;
  if (++sprite.data[0]! > 16) DestroyAnimSprite(sprite);
}

function AnimPerishSongMusicNote2(sprite: Sprite): void {
  if (!sprite.data[0]) {
    sprite.data[1] = 120 - gBattleAnimArgs[0]!;
    sprite.invisible = true;
  }
  if (++sprite.data[0]! === sprite.data[1]) SetGreyscaleOrOriginalPalette(sprite.oam.paletteNum + 16, false);
  if (sprite.data[0] === sprite.data[1]! + 80) DestroyAnimSprite(sprite);
}

function AnimPerishSongMusicNote(sprite: Sprite): void {
  if (!sprite.data[0]) {
    sprite.x = 120;
    sprite.y = Math.trunc(gBattleAnimArgs[0]! / 2) - 15;
    StartSpriteAnim(sprite, gBattleAnimArgs[1]!);
    sprite.data[5] = 120;
    sprite.data[3] = gBattleAnimArgs[2]!;
  }

  sprite.data[0]!++;
  sprite.data[1] = Math.trunc(sprite.data[0]! / 2);
  let index = sprite.data[0]! * 3 + u16(sprite.data[3]!);
  const var2 = 0xff;
  sprite.data[6] = (sprite.data[6]! + 10) & 0xff;
  index &= var2;
  sprite.x2 = Cos(index, 100);
  sprite.y2 = sprite.data[1]! + Sin(index, 10) + Cos(sprite.data[6]!, 4);

  if (sprite.data[0]! > sprite.data[5]!) {
    sprite.callback = AnimPerishSongMusicNote_Step1;
    sprite.data[0] = 0;
    SetSpritePrimaryCoordsFromSecondaryCoords(sprite);
    sprite.data[2] = 5;
    sprite.data[4] = 0;
    sprite.data[3] = 0;
    StartSpriteAffineAnim(sprite, 1);
  }
}

function AnimPerishSongMusicNote_Step1(sprite: Sprite): void {
  if (++sprite.data[0]! > 10) {
    sprite.data[0] = 0;
    sprite.callback = AnimPerishSongMusicNote_Step2;
  }
}

function AnimPerishSongMusicNote_Step2(sprite: Sprite): void {
  sprite.data[3]! += sprite.data[2]!;
  sprite.y2 = sprite.data[3]!;
  sprite.data[2]!++;
  if (sprite.data[3]! > 48 && sprite.data[2]! > 0) {
    sprite.data[2] = sprite.data[4]! - 5;
    sprite.data[4]!++;
  }
  if (sprite.data[4]! > 3) {
    sprite.invisible = !!(sprite.data[2]! % 2);
    DestroyAnimSprite(sprite);
  }
  if (sprite.data[4] === 4) DestroyAnimSprite(sprite);
}

function AnimGuardRing(sprite: Sprite): void {
  if ((G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) && IsBattlerSpriteVisible(BATTLE_PARTNER(animState.gBattleAnimAttacker))) {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimAttacker, false);
    sprite.x = pos.x;
    sprite.y = pos.y;
    sprite.y += 40;
    StartSpriteAffineAnim(sprite, 1);
  } else {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + 40;
  }
  sprite.data[0] = 13;
  sprite.data[2] = sprite.x;
  sprite.data[4] = sprite.y - 72;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

export function AnimTask_IsFuryCutterHitRight(taskId: number): void {
  gBattleAnimArgs[C.ARG_RET_ID] = animState.gAnimDisableStructPtr!.furyCutterCounter & 1;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_GetFuryCutterHitCount(taskId: number): void {
  gBattleAnimArgs[C.ARG_RET_ID] = animState.gAnimDisableStructPtr!.furyCutterCounter;
  DestroyAnimVisualTask(taskId);
}

registerAnimSpriteCallbacks({
  AnimAirWaveProjectile, AnimAngel, AnimAngerMark, AnimBlendThinRing, AnimBouncingMusicNote, AnimBreathPuff,
  AnimBulletSeed, AnimCirclingFinger, AnimCoinThrow, AnimDevil, AnimEyeSparkle, AnimFallingCoin, AnimFurySwipes,
  AnimGuardRing, AnimGuillotinePincer, AnimHealBellMusicNote, AnimHyperVoiceRing, AnimJaggedMusicNote,
  AnimKinesisZapEnergy, AnimMagentaHeart, AnimMovementWaves, AnimMovingClamp, AnimOrbitFast, AnimOrbitScatter,
  AnimParticleBurst, AnimPencil, AnimPerishSongMusicNote, AnimPerishSongMusicNote2, AnimPinkHeart, AnimRazorWindTornado,
  AnimRedHeartProjectile, AnimRedHeartRising, AnimSoftBoiledEgg, AnimSonicBoomProjectile, AnimSpeedDust, AnimSpitUpOrb,
  AnimSwordsDanceBlade, AnimUproarRing, AnimVibrateBattlerBack, AnimViceGripPincer, AnimVoidLines,
});
registerAnimTasks({
  AnimTask_AirCutterProjectile, AnimTask_AttackerStretchAndDisappear, AnimTask_ExtremeSpeedImpact,
  AnimTask_ExtremeSpeedMonReappear, AnimTask_FakeOut, AnimTask_FreeMusicNotesPals, AnimTask_GetFuryCutterHitCount,
  AnimTask_GrowAndGrayscale, AnimTask_GrowAndShrink, AnimTask_HeartsBackground, AnimTask_IsFuryCutterHitRight,
  AnimTask_LoadMusicNotesPals, AnimTask_Minimize, AnimTask_ScaryFace, AnimTask_SketchDrawMon, AnimTask_SpeedDust,
  AnimTask_Splash, AnimTask_StretchAttackerUp, AnimTask_StretchTargetUp, AnimTask_ThrashMoveMonHorizontal,
  AnimTask_ThrashMoveMonVertical, AnimTask_UproarDistortion, AnimTask_Withdraw,
});
