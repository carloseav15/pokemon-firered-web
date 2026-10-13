// battle_anim_flying.c: Gust, Air Cutter, Fly, Bounce, Dive, Feather Dance,
// Whirlwind, Drill Peck and Sky Attack sprite callbacks and tasks.
// struct FeatherDanceData overlays sprite->data; FeatherData below reads and
// writes the same bitfields over the s16 data array.

import * as C from "../../generated/constants";
import { OBJ_PLTT_ID, OBJ_PLTT_OFFSET, PLTT_ID, gPlttBufferFaded } from "../../hw/palette";
import {
  CreateSpriteAndAnimate, DestroySprite, FreeOamMatrix, gOamMatrices, gSprites, IndexOfSpritePaletteTag, SeekSpriteAnim,
  ST_OAM_AFFINE_OFF, ST_OAM_AFFINE_ON_MASK, ST_OAM_HFLIP, StartSpriteAffineAnim, StartSpriteAnim, type Sprite,
} from "../../hw/sprite";
import { Cos, gSineTable, Sin } from "../../hw/trig";
import { random } from "../../random";
import {
  ANIM_ATTACKER, ANIM_TARGET, animState, AnimTranslateLinear, ArcTan2Neg, DestroyAnimSprite, DestroyAnimVisualTask,
  DestroySpriteAndMatrix, GetAnimBattlerSpriteId, GetBattlerSpriteBGPriority, GetBattlerSpriteCoord, InitAnimLinearTranslation,
  InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget, RunStoredCallbackWhenAffineAnimEnds, SetAverageBattlerPositions,
  StartAnimLinearTranslation, StoreSpriteCallbackInData6, TranslateAnimSpriteToTargetMonLocation, TrySetSpriteRotScale,
  TryResetSpriteAffineState,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { gBattlerPositions } from "../globals";
import { GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest } from "./common";

const DISPLAY_WIDTH = 240;
const DISPLAY_HEIGHT = 160;
const s16 = (v: number) => (v << 16) >> 16;

function AnimEllipticalGust(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, false);
  sprite.y += 20;
  sprite.data[1] = 191;
  sprite.callback = AnimEllipticalGust_Step;
  sprite.callback(sprite);
}

function AnimEllipticalGust_Step(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[1], 32);
  sprite.y2 = Cos(sprite.data[1], 8);
  sprite.data[1] += 5;
  sprite.data[1] &= 0xff;
  if (++sprite.data[0] === 71) DestroyAnimSprite(sprite);
}

// Animates the palette on the gust tornado to make it look like its spinning
function AnimTask_AnimateGustTornadoPalette(taskId: number): void {
  const d = gTasks[taskId].data;
  d[0] = gBattleAnimArgs[1];
  d[1] = gBattleAnimArgs[0];
  d[2] = IndexOfSpritePaletteTag(C.ANIM_TAG_GUST);
  gTasks[taskId].func = AnimTask_AnimateGustTornadoPalette_Step;
}

function AnimTask_AnimateGustTornadoPalette_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[10]++ === d[1]) {
    d[10] = 0;
    const data2 = d[2] & 0xff;
    const temp = gPlttBufferFaded[OBJ_PLTT_ID(data2) + 8];
    let i = 7;
    const base = PLTT_ID(data2);
    do {
      gPlttBufferFaded[base + OBJ_PLTT_OFFSET + 1 + i] = gPlttBufferFaded[base + OBJ_PLTT_OFFSET + i];
    } while (--i > 0);
    gPlttBufferFaded[base + OBJ_PLTT_OFFSET + 1] = temp;
  }
  if (--d[0] === 0) DestroyAnimVisualTask(taskId);
}

function AnimGustToTarget(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[2];
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3];
  InitAnimLinearTranslation(sprite);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
  StoreSpriteCallbackInData6(sprite, AnimGustToTarget_Step);
}

function AnimGustToTarget_Step(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite)) DestroyAnimSprite(sprite);
}

function AnimAirWaveCrescent(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    gBattleAnimArgs[0] = -gBattleAnimArgs[0];
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    gBattleAnimArgs[2] = -gBattleAnimArgs[2];
    gBattleAnimArgs[3] = -gBattleAnimArgs[3];
  }
  if (IsContest()) {
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    gBattleAnimArgs[3] = -gBattleAnimArgs[3];
  }
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[4];
  if (gBattleAnimArgs[6] === 0) {
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  } else {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
    sprite.data[2] = pos.x;
    sprite.data[4] = pos.y;
  }
  sprite.data[2] = sprite.data[2] + gBattleAnimArgs[2];
  sprite.data[4] = sprite.data[4] + gBattleAnimArgs[3];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  SeekSpriteAnim(sprite, gBattleAnimArgs[5]);
}

function AnimFlyBallUp(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.callback = AnimFlyBallUp_Step;
  gSprites[GetAnimBattlerSpriteId(ANIM_ATTACKER)].invisible = true;
}

function AnimFlyBallUp_Step(sprite: Sprite): void {
  if (sprite.data[0] > 0) {
    --sprite.data[0];
  } else {
    sprite.data[2] += sprite.data[1];
    sprite.y2 -= sprite.data[2] >> 8;
  }
  if (sprite.y + sprite.y2 < -32) DestroyAnimSprite(sprite);
}

function AnimFlyBallAttack(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x = DISPLAY_WIDTH + 32;
    sprite.y = -32;
    StartSpriteAffineAnim(sprite, 1);
  } else {
    sprite.x = -32;
    sprite.y = -32;
  }
  sprite.data[0] = gBattleAnimArgs[0];
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  InitAnimLinearTranslation(sprite);
  sprite.callback = AnimFlyBallAttack_Step;
}

function AnimFlyBallAttack_Step(sprite: Sprite): void {
  sprite.data[0] = 1;
  AnimTranslateLinear(sprite);
  if (((sprite.data[3] & 0xffff) >> 8) > 200) {
    sprite.x += sprite.x2;
    sprite.x2 = 0;
    sprite.data[3] &= 0xff;
  }
  if (sprite.x + sprite.x2 < -32 || sprite.x + sprite.x2 > DISPLAY_WIDTH + 32 || sprite.y + sprite.y2 > DISPLAY_HEIGHT) {
    gSprites[GetAnimBattlerSpriteId(ANIM_ATTACKER)].invisible = false;
    DestroyAnimSprite(sprite);
  }
}

export function DestroyAnimSpriteAfterTimer(sprite: Sprite): void {
  if (sprite.data[0]-- <= 0) {
    if (sprite.oam.affineMode & ST_OAM_AFFINE_ON_MASK) {
      FreeOamMatrix(sprite.oam.matrixNum);
      sprite.oam.affineMode = ST_OAM_AFFINE_OFF;
    }
    DestroySprite(sprite);
    --animState.gAnimVisualTaskCount;
  }
}

/** struct FeatherDanceData laid over sprite->data (s16[8] = 16 bytes). */
class FeatherData {
  constructor(private readonly d: Int16Array) {}
  private bits(i: number, shift: number, width: number): number {
    return ((this.d[i] & 0xffff) >> shift) & ((1 << width) - 1);
  }
  private setBits(i: number, shift: number, width: number, v: number): void {
    const mask = ((1 << width) - 1) << shift;
    this.d[i] = ((this.d[i] & 0xffff & ~mask) | ((v << shift) & mask)) << 16 >> 16;
  }
  get unk0_0a(): number { return this.bits(0, 0, 1); }
  set unk0_0a(v: number) { this.setBits(0, 0, 1, v); }
  get unk0_0b(): number { return this.bits(0, 1, 1); }
  set unk0_0b(v: number) { this.setBits(0, 1, 1, v); }
  get unk0_0c(): number { return this.bits(0, 2, 1); }
  set unk0_0c(v: number) { this.setBits(0, 2, 1, v); }
  get unk0_0d(): number { return this.bits(0, 3, 1); }
  set unk0_0d(v: number) { this.setBits(0, 3, 1, v); }
  get unk0_1(): number { return this.bits(0, 4, 4); }
  set unk0_1(v: number) { this.setBits(0, 4, 4, v); }
  get unk1(): number { return this.bits(0, 8, 8); }
  set unk1(v: number) { this.setBits(0, 8, 8, v); }
  get unk2(): number { return this.d[1] & 0xffff; }
  set unk2(v: number) { this.d[1] = v; }
  get unk4(): number { return this.d[2]; }
  set unk4(v: number) { this.d[2] = v; }
  get unk6(): number { return this.d[3] & 0xffff; }
  set unk6(v: number) { this.d[3] = v; }
  get unk8(): number { return this.d[4] & 0xffff; }
  set unk8(v: number) { this.d[4] = v; }
  get unkA(): number { return this.d[5] & 0xffff; }
  set unkA(v: number) { this.d[5] = v; }
  unkC(i: number): number { return i === 0 ? this.d[6] & 0xff : (this.d[6] >> 8) & 0xff; }
  setUnkC(i: number, v: number): void {
    const u = this.d[6] & 0xffff;
    this.d[6] = i === 0 ? (u & 0xff00) | (v & 0xff) : (u & 0x00ff) | ((v & 0xff) << 8);
  }
  get unkE_0(): number { return this.bits(7, 0, 1); }
  set unkE_0(v: number) { this.setBits(7, 0, 1, v); }
  get unkE_1(): number { return this.bits(7, 1, 15); }
  set unkE_1(v: number) { this.setBits(7, 1, 15, v); }
}

function setFeatherMatrix(sprite: Sprite, sinIndex: number): void {
  const matrixNum = sprite.oam.matrixNum;
  const sinVal = gSineTable[sinIndex];
  gOamMatrices[matrixNum].a = gOamMatrices[matrixNum].d = gSineTable[sinIndex + 64];
  gOamMatrices[matrixNum].b = sinVal;
  gOamMatrices[matrixNum].c = s16(-sinVal);
}

function AnimFallingFeather(sprite: Sprite): void {
  const data = new FeatherData(sprite.data);
  const battler = gBattleAnimArgs[7] & 0x100 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  if (GetBattlerSide(battler) === C.B_SIDE_PLAYER) gBattleAnimArgs[0] = -gBattleAnimArgs[0];
  // BATTLER_COORD_ATTR_HEIGHT/WIDTH are passed to GetBattlerSpriteCoord here (0/1 = X/Y), as in the C.
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_ATTR_HEIGHT) + gBattleAnimArgs[0];
  const spriteCoord = s16(GetBattlerSpriteCoord(battler, C.BATTLER_COORD_ATTR_WIDTH));
  sprite.y = spriteCoord + gBattleAnimArgs[1];
  data.unk8 = sprite.y << 8;
  data.unkE_1 = spriteCoord + gBattleAnimArgs[6];
  data.unk0_0c = 1;
  data.unk2 = gBattleAnimArgs[2] & 0xff;
  data.unkA = (gBattleAnimArgs[2] >> 8) & 0xff;
  data.unk4 = gBattleAnimArgs[3];
  data.unk6 = gBattleAnimArgs[4];
  sprite.data[6] = gBattleAnimArgs[5]; // *(u16 *)(data->unkC)
  if (data.unk2 >= 64 && data.unk2 <= 191) {
    if (!IsContest()) sprite.oam.priority = GetBattlerSpriteBGPriority(battler) + 1;
    else sprite.oam.priority = GetBattlerSpriteBGPriority(battler);
    data.unkE_0 = 0;
    if (!(data.unk4 & 0x8000)) {
      sprite.hFlip ^= 1;
      sprite.animNum = sprite.hFlip;
      sprite.animBeginning = true;
      sprite.animEnded = false;
    }
  } else {
    sprite.oam.priority = GetBattlerSpriteBGPriority(battler);
    data.unkE_0 = 1;
    if (data.unk4 & 0x8000) {
      sprite.hFlip ^= 1;
      sprite.animNum = sprite.hFlip;
      sprite.animBeginning = true;
      sprite.animEnded = false;
    }
  }
  data.unk0_1 = data.unk2 >> 6;
  sprite.x2 = (gSineTable[data.unk2] * data.unkC(0)) >> 8;
  const sinIndex = ((-sprite.x2 >> 1) + data.unkA) & 0xff;
  setFeatherMatrix(sprite, sinIndex);
  sprite.callback = AnimFallingFeather_Step;
}

/** The flip / priority swap repeated in every quadrant of AnimFallingFeather_Step. */
function featherFlip(sprite: Sprite, data: FeatherData): void {
  sprite.hFlip ^= 1;
  sprite.animNum = sprite.hFlip;
  sprite.animBeginning = true;
  sprite.animEnded = false;
  if (data.unk0_0c) {
    if (!IsContest()) {
      if (!data.unkE_0) {
        --sprite.oam.priority;
        data.unkE_0 ^= 1;
      } else {
        ++sprite.oam.priority;
        data.unkE_0 ^= 1;
      }
    } else if (!data.unkE_0) {
      sprite.subpriority -= 12;
      data.unkE_0 ^= 1;
    } else {
      sprite.subpriority += 12;
      data.unkE_0 ^= 1;
    }
  }
  data.unk0_0d = 0;
}

function AnimFallingFeather_Step(sprite: Sprite): void {
  const data = new FeatherData(sprite.data);
  if (data.unk0_0a) {
    const unk1 = data.unk1;
    data.unk1 = unk1 - 1;
    if (unk1 % 256 === 0) {
      data.unk0_0a = 0;
      data.unk1 = 0;
    }
  } else {
    switch ((data.unk2 / 64) | 0) {
      case 0:
        if ((data.unk0_1 & 0xff) === 1) {
          data.unk0_0d = 1;
          data.unk0_0a = 1;
          data.unk1 = 0;
        } else if ((data.unk0_1 & 0xff) === 3) {
          data.unk0_0b ^= 1;
          data.unk0_0a = 1;
          data.unk1 = 0;
        } else if (data.unk0_0d) {
          featherFlip(sprite, data);
        }
        data.unk0_1 = 0;
        break;
      case 1:
        if ((data.unk0_1 & 0xff) === 0) {
          data.unk0_0d = 1;
          data.unk0_0a = 1;
          data.unk1 = 0;
        } else if ((data.unk0_1 & 0xff) === 2) {
          data.unk0_0a = 1;
          data.unk1 = 0;
        } else if (data.unk0_0d) {
          featherFlip(sprite, data);
        }
        data.unk0_1 = 1;
        break;
      case 2:
        if ((data.unk0_1 & 0xff) === 3) {
          data.unk0_0d = 1;
          data.unk0_0a = 1;
          data.unk1 = 0;
        } else if ((data.unk0_1 & 0xff) === 1) {
          data.unk0_0a = 1;
          data.unk1 = 0;
        } else if (data.unk0_0d) {
          featherFlip(sprite, data);
        }
        data.unk0_1 = 2;
        break;
      case 3:
        if ((data.unk0_1 & 0xff) === 2) {
          data.unk0_0d = 1;
        } else if ((data.unk0_1 & 0xff) === 0) {
          data.unk0_0b ^= 1;
          data.unk0_0a = 1;
          data.unk1 = 0;
        } else if (data.unk0_0d) {
          featherFlip(sprite, data);
        }
        data.unk0_1 = 3;
        break;
    }
    sprite.x2 = (data.unkC(data.unk0_0b) * gSineTable[data.unk2]) >> 8;
    const sinIndex = ((-sprite.x2 >> 1) + data.unkA) & 0xff;
    setFeatherMatrix(sprite, sinIndex);
    data.unk8 = data.unk8 + data.unk6;
    sprite.y = data.unk8 >> 8;
    if (data.unk4 & 0x8000) data.unk2 = (data.unk2 - (data.unk4 & 0x7fff)) & 0xff;
    else data.unk2 = (data.unk2 + (data.unk4 & 0x7fff)) & 0xff;
    if (sprite.y + sprite.y2 >= data.unkE_1) {
      sprite.data[0] = 0;
      sprite.callback = DestroyAnimSpriteAfterTimer;
    }
  }
}

function AnimUnusedBubbleThrow(sprite: Sprite): void {
  sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimTarget);
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.callback = TranslateAnimSpriteToTargetMonLocation;
}

function AnimUnusedFeather(sprite: Sprite): void {
  sprite.data[1] = gBattleAnimArgs[0];
  sprite.data[2] = gBattleAnimArgs[1];
  sprite.data[3] = gBattleAnimArgs[2];
  const target = animState.gBattleAnimTarget;
  if (!IsContest()) {
    if (gBattlerPositions[target] & C.B_POSITION_OPPONENT_LEFT)
      sprite.data[7] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_ATTR_WIDTH) + gBattleAnimArgs[3];
    else
      sprite.data[7] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_ATTR_WIDTH) + 40;
    if (gBattleAnimArgs[4]) sprite.oam.priority = GetBattlerSpriteBGPriority(target) + 1;
    else sprite.oam.priority = GetBattlerSpriteBGPriority(target);
  } else {
    sprite.data[7] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_ATTR_WIDTH) + gBattleAnimArgs[3];
  }
  sprite.data[4] = gSineTable[sprite.data[1] & 0xff];
  sprite.data[5] = -gSineTable[(sprite.data[1] & 0xff) + 64];
  sprite.data[6] = 0;
  sprite.y2 = 0;
  sprite.x2 = 0;
  const matrixNum = sprite.oam.matrixNum;
  sprite.data[1] = (sprite.data[1] & 0xffff) >> 8;
  const rn = s16(random());
  if (rn & 0x8000) sprite.data[1] = 0xff - sprite.data[1];
  const sinVal = gSineTable[sprite.data[1]];
  gOamMatrices[matrixNum].a = gOamMatrices[matrixNum].d = gSineTable[sprite.data[1] + 64];
  gOamMatrices[matrixNum].b = sinVal;
  gOamMatrices[matrixNum].c = s16(-sinVal);
  sprite.animBeginning = true;
  sprite.animEnded = false;
  if (rn & 1) {
    sprite.animNum = 1;
    sprite.hFlip = 1;
  }
  sprite.callback = AnimUnusedFeather_Step;
}

function AnimUnusedFeather_Step(sprite: Sprite): void {
  ++sprite.data[0];
  if (sprite.data[0] <= 4) return;
  sprite.x2 = (sprite.data[4] * sprite.data[6]) >> 8;
  sprite.y2 = (sprite.data[5] * sprite.data[6]) >> 8;
  sprite.data[6] += sprite.data[3] & 0xff;
  if (sprite.data[6] < (sprite.data[2] & 0xff)) return;
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.x2 = 0;
  sprite.y2 = 0;
  const fData = Int16Array.from(sprite.data);
  const f = new FeatherData(fData);
  sprite.data.fill(0);
  const tData = new FeatherData(sprite.data);
  tData.unk8 = sprite.y << 8;
  tData.unk6 = f.unk6 >> 8;
  tData.unk2 = 0;
  tData.unkA = f.unk2;
  if (sprite.animNum !== 0) {
    if (tData.unk6 & 8) tData.unk4 = 0x8001;
    else tData.unk4 = 0x8002;
  } else if (tData.unk6 & 8) {
    tData.unk4 = 1;
  } else {
    tData.unk4 = 2;
  }
  const item = ((f.unk4 & 0xffff) >> 8) & 0xff;
  tData.setUnkC(0, item);
  tData.setUnkC(1, item - 2);
  const x = ((fData[7] & 0xffff) << 1) & 0xffff;
  const y = (sprite.data[7] & 0xffff) & 1;
  sprite.data[7] = y | x;
  sprite.callback = AnimFallingFeather_Step;
}

function AnimWhirlwindLine(sprite: Sprite): void {
  if (gBattleAnimArgs[2] === ANIM_ATTACKER) InitSpritePosToAnimAttacker(sprite, false);
  else InitSpritePosToAnimTarget(sprite, false);
  if ((gBattleAnimArgs[2] === ANIM_ATTACKER && GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER)
    || (gBattleAnimArgs[2] === ANIM_TARGET && GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER))
    sprite.x += 8;
  SeekSpriteAnim(sprite, gBattleAnimArgs[4]);
  sprite.x -= 32;
  sprite.data[1] = 0x0ccc;
  const arg = gBattleAnimArgs[4] & 0xffff;
  const mult = 12;
  sprite.x2 += mult * arg;
  sprite.data[0] = arg;
  sprite.data[7] = gBattleAnimArgs[3];
  sprite.callback = AnimWhirlwindLine_Step;
}

function AnimWhirlwindLine_Step(sprite: Sprite): void {
  sprite.x2 += sprite.data[1] >> 8;
  if (++sprite.data[0] === 6) {
    sprite.data[0] = 0;
    sprite.x2 = 0;
    StartSpriteAnim(sprite, 0);
  }
  if (--sprite.data[7] === -1) DestroyAnimSprite(sprite);
}

function AnimTask_DrillPeckHitSplats(taskId: number): void {
  const d = gTasks[taskId].data;
  if (!(d[0] % 32)) {
    ++animState.gAnimVisualTaskCount;
    gBattleAnimArgs[0] = Sin(d[0], -13);
    gBattleAnimArgs[1] = Cos(d[0], -13);
    gBattleAnimArgs[2] = 1;
    gBattleAnimArgs[3] = 3;
    CreateSpriteAndAnimate(
      animTemplate("gFlashingHitSplatSpriteTemplate"),
      GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2),
      GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET),
      3,
    );
  }
  d[0] += 8;
  if (d[0] > 255) DestroyAnimVisualTask(taskId);
}

function AnimBounceBallShrink(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      InitSpritePosToAnimAttacker(sprite, true);
      gSprites[GetAnimBattlerSpriteId(ANIM_ATTACKER)].invisible = true;
      ++sprite.data[0];
      break;
    case 1:
      if (sprite.affineAnimEnded) DestroyAnimSprite(sprite);
      break;
  }
}

function AnimBounceBallLand(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y);
      sprite.y2 = -sprite.y - 32;
      ++sprite.data[0];
      break;
    case 1:
      sprite.y2 += 10;
      if (sprite.y2 >= 0) ++sprite.data[0];
      break;
    case 2:
      sprite.y2 -= 10;
      if (sprite.y + sprite.y2 < -32) {
        gSprites[GetAnimBattlerSpriteId(ANIM_ATTACKER)].invisible = false;
        DestroyAnimSprite(sprite);
      }
      break;
  }
}

function AnimDiveBall(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.callback = AnimDiveBall_Step1;
  gSprites[GetAnimBattlerSpriteId(ANIM_ATTACKER)].invisible = true;
}

function AnimDiveBall_Step1(sprite: Sprite): void {
  if (sprite.data[0] > 0) {
    --sprite.data[0];
  } else if (sprite.y + sprite.y2 > -32) {
    sprite.data[2] += sprite.data[1];
    sprite.y2 -= sprite.data[2] >> 8;
  } else {
    sprite.invisible = true;
    if (sprite.data[3]++ > 20) sprite.callback = AnimDiveBall_Step2;
  }
}

function AnimDiveBall_Step2(sprite: Sprite): void {
  sprite.y2 += sprite.data[2] >> 8;
  if (sprite.y + sprite.y2 > -32) sprite.invisible = false;
  if (sprite.y2 > 0) DestroyAnimSprite(sprite);
}

function AnimDiveWaterSplash(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      if (!gBattleAnimArgs[0]) {
        sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
        sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y);
      } else {
        sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X);
        sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y);
      }
      sprite.data[1] = 512;
      TrySetSpriteRotScale(sprite, false, 256, sprite.data[1], 0);
      ++sprite.data[0];
      break;
    case 1: {
      if (sprite.data[2] <= 11) sprite.data[1] -= 40;
      else sprite.data[1] += 40;
      ++sprite.data[2];
      TrySetSpriteRotScale(sprite, false, 256, sprite.data[1], 0);
      const matrixNum = sprite.oam.matrixNum;
      const t1 = 15616;
      let t2 = Math.trunc(t1 / gOamMatrices[matrixNum].d) + 1;
      if (t2 > 128) t2 = 128;
      t2 = Math.trunc((64 - t2) / 2);
      sprite.y2 = t2;
      if (sprite.data[2] === 24) {
        TryResetSpriteAffineState(sprite);
        DestroyAnimSprite(sprite);
      }
      break;
    }
  }
}

// Launches a water droplet away from the specified battler. Used by Astonish and Dive
function AnimSprayWaterDroplet(sprite: Sprite): void {
  const v1 = 0x1ff & random();
  const v2 = 0x7f & random();
  if (v1 % 2) sprite.data[0] = 736 + v1;
  else sprite.data[0] = 736 - v1;
  if (v2 % 2) sprite.data[1] = 896 + v2;
  else sprite.data[1] = 896 - v2;
  sprite.data[2] = gBattleAnimArgs[0];
  if (sprite.data[2]) sprite.oam.matrixNum = ST_OAM_HFLIP;
  if (gBattleAnimArgs[1] === 0) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + 32;
  } else {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X);
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y) + 32;
  }
  sprite.callback = AnimSprayWaterDroplet_Step;
}

function AnimSprayWaterDroplet_Step(sprite: Sprite): void {
  if (sprite.data[2] === 0) {
    sprite.x2 += sprite.data[0] >> 8;
    sprite.y2 -= sprite.data[1] >> 8;
  } else {
    sprite.x2 -= sprite.data[0] >> 8;
    sprite.y2 -= sprite.data[1] >> 8;
  }
  sprite.data[1] -= 32;
  if (sprite.data[0] < 0) sprite.data[0] = 0;
  if (++sprite.data[3] === 31) DestroyAnimSprite(sprite);
}

function AnimUnusedFlashingLight(sprite: Sprite): void {
  sprite.data[6] = 0;
  sprite.data[7] = 64;
  sprite.callback = AnimUnusedFlashingLight_Step;
}

function AnimUnusedFlashingLight_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      if (++sprite.data[1] > 8) {
        sprite.data[1] = 0;
        sprite.invisible = !sprite.invisible;
        if (++sprite.data[2] > 5 && sprite.invisible) ++sprite.data[0];
      }
      break;
    case 1:
      DestroyAnimSprite(sprite);
      break;
  }
}

function AnimSkyAttackBird(sprite: Sprite): void {
  const posx = sprite.x;
  const posy = sprite.y;
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[4] = sprite.x << 4;
  sprite.data[5] = sprite.y << 4;
  sprite.data[6] = Math.trunc(((posx - sprite.x) << 4) / 12);
  sprite.data[7] = Math.trunc(((posy - sprite.y) << 4) / 12);
  let rotation = ArcTan2Neg(posx - sprite.x, posy - sprite.y);
  rotation = (rotation + 49152) & 0xffff;
  TrySetSpriteRotScale(sprite, true, 0x100, 0x100, rotation);
  sprite.callback = AnimSkyAttackBird_Step;
}

function AnimSkyAttackBird_Step(sprite: Sprite): void {
  sprite.data[4] += sprite.data[6];
  sprite.data[5] += sprite.data[7];
  sprite.x = sprite.data[4] >> 4;
  sprite.y = sprite.data[5] >> 4;
  if (sprite.x > DISPLAY_WIDTH + 45 || sprite.x < -45 || sprite.y > 157 || sprite.y < -45) DestroySpriteAndMatrix(sprite);
}

// Unused
function AnimTask_SetAttackerVisibility(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  gSprites[spriteId].invisible = gBattleAnimArgs[0] === 0;
  DestroyAnimVisualTask(taskId);
}

registerAnimSpriteCallbacks({
  AnimEllipticalGust, AnimGustToTarget, AnimAirWaveCrescent, AnimFlyBallUp, AnimFlyBallAttack, AnimFallingFeather,
  AnimUnusedBubbleThrow, AnimUnusedFeather, AnimWhirlwindLine, AnimBounceBallShrink, AnimBounceBallLand, AnimDiveBall,
  AnimDiveWaterSplash, AnimSprayWaterDroplet, AnimUnusedFlashingLight, AnimSkyAttackBird, DestroyAnimSpriteAfterTimer,
});

registerAnimTasks({
  AnimTask_AnimateGustTornadoPalette, AnimTask_DrillPeckHitSplats, AnimTask_SetAttackerVisibility,
});
