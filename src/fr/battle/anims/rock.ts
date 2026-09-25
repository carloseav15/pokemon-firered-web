// battle_anim_rock.c: Rock Throw / Rock Slide rocks, rock fragments, vortex
// particles, the Sandstorm background, Ancient Power, Rollout, Rock Tomb,
// Rock Blast and Seismic Toss backgrounds.

import * as C from "../../generated/constants";
import { tasks, type Task } from "../../gba/tasks";
import { incbin } from "../../hw/assets";
import { subspriteTablesFrom } from "../../hw/cdataSprite";
import { SetGpuReg } from "../../hw/gpu";
import { BG_PLTT_ID, LoadPalette, PLTT_SIZE_4BPP } from "../../hw/palette";
import { BLDALPHA_BLEND } from "../../hw/ppu";
import {
  AnimateSprite, CreateSprite, DestroySprite, gSprites, MAX_SPRITES, SetSubspriteTables, ST_OAM_HFLIP, StartSpriteAffineAnim,
  StartSpriteAnim, type Sprite,
} from "../../hw/sprite";
import { Cos, Sin } from "../../hw/trig";
import {
  ANIM_ATTACKER, animState, AnimLoadCompressedBgGfx, AnimLoadCompressedBgTilemap, DestroyAnimSprite, DestroyAnimVisualTask,
  DestroySpriteAndMatrix, GetAnimBattlerSpriteId, GetBattleAnimBg1Data, GetBattlerSpriteCoord, InitAnimArcTranslation,
  InitBattleAnimBg, InitSpriteDataForLinearTranslation, InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget,
  RelocateBattleBgPal, SetAverageBattlerPositions, StartAnimLinearTranslation, StoreSpriteCallbackInData6, ToggleBg3Mode,
  TranslateAnimHorizontalArc, TranslateAnimSpriteToTargetMonLocation, TranslateSpriteInEllipse, TranslateSpriteLinearFixedPoint,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { BattleAnimAdjustPanning } from "../animScript";
import { G } from "../globals";
import { BG_ANIM_CHAR_BASE_BLOCK, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, SetAnimBgAttribute } from "../intro";
import { BATTLE_PARTNER } from "../macros";
import { GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, PlaySE12WithPanning, s16 } from "./common";

const DISPLAY_WIDTH = 240;
const TASK_NONE = 0xff;
const ARG_RET_ID = 7;

function AnimFallingRock(sprite: Sprite): void {
  if (gBattleAnimArgs[3] !== 0) {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, false);
    sprite.x = pos.x;
    sprite.y = pos.y;
  }
  sprite.x += gBattleAnimArgs[0];
  sprite.y += 14;
  StartSpriteAnim(sprite, gBattleAnimArgs[1]);
  AnimateSprite(sprite);
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.data[2] = 4;
  sprite.data[3] = 16;
  sprite.data[4] = -70;
  sprite.data[5] = gBattleAnimArgs[2];
  StoreSpriteCallbackInData6(sprite, AnimFallingRock_Step);
  sprite.callback = TranslateSpriteInEllipse;
  sprite.callback(sprite);
}

function AnimFallingRock_Step(sprite: Sprite): void {
  sprite.x += sprite.data[5];
  sprite.data[0] = 192;
  sprite.data[1] = sprite.data[5];
  sprite.data[2] = 4;
  sprite.data[3] = 32;
  sprite.data[4] = -24;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = TranslateSpriteInEllipse;
  sprite.callback(sprite);
}

// Animates the rock particles that are shown on the impact for Rock Blast / Rock Smash
function AnimRockFragment(sprite: Sprite): void {
  StartSpriteAnim(sprite, gBattleAnimArgs[5]);
  AnimateSprite(sprite);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0];
  else sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = sprite.x;
  sprite.data[2] = sprite.x + gBattleAnimArgs[2];
  sprite.data[3] = sprite.y;
  sprite.data[4] = sprite.y + gBattleAnimArgs[3];
  InitSpriteDataForLinearTranslation(sprite);
  sprite.data[3] = 0;
  sprite.data[4] = 0;
  sprite.callback = TranslateSpriteLinearFixedPoint;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
}

// Swirls particle in vortex. Used for moves like Fire Spin or Sand Tomb
function AnimParticleInVortex(sprite: Sprite): void {
  if (gBattleAnimArgs[6] === 0) InitSpritePosToAnimAttacker(sprite, false);
  else InitSpritePosToAnimTarget(sprite, false);
  sprite.data[0] = gBattleAnimArgs[3];
  sprite.data[1] = gBattleAnimArgs[2];
  sprite.data[2] = gBattleAnimArgs[4];
  sprite.data[3] = gBattleAnimArgs[5];
  sprite.callback = AnimParticleInVortex_Step;
}

function AnimParticleInVortex_Step(sprite: Sprite): void {
  sprite.data[4] += sprite.data[1];
  sprite.y2 = -(sprite.data[4] >> 8);
  sprite.x2 = Sin(sprite.data[5], sprite.data[3]);
  sprite.data[5] = (sprite.data[5] + sprite.data[2]) & 0xff;
  if (--sprite.data[0] === -1) DestroyAnimSprite(sprite);
}

function AnimTask_LoadSandstormBackground(taskId: number): void {
  let var0 = 0;
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG1 | C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
  SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 0);
  if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);
  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  SetGpuReg(C.REG_OFFSET_BG1HOFS, G.gBattle_BG1_X);
  SetGpuReg(C.REG_OFFSET_BG1VOFS, G.gBattle_BG1_Y);
  const animBg = GetBattleAnimBg1Data();
  AnimLoadCompressedBgTilemap(animBg.bgId, incbin("gFile_graphics_battle_anims_backgrounds_sandstorm_brew_tilemap"));
  AnimLoadCompressedBgGfx(animBg.bgId, incbin("gFile_graphics_battle_anims_backgrounds_sandstorm_brew_sheet"), animBg.tilesOffset);
  LoadPalette(incbin("gBattleAnimSpritePal_FlyingDirt"), BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
  if (IsContest()) RelocateBattleBgPal(animBg.paletteId, animBg.bgTilemap, 0, false);
  if (gBattleAnimArgs[0] && GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) var0 = 1;
  gTasks[taskId].data[0] = var0;
  gTasks[taskId].func = AnimTask_LoadSandstormBackground_Step;
}

function AnimTask_LoadSandstormBackground_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[0] === 0) G.gBattle_BG1_X += -6;
  else G.gBattle_BG1_X += 6;
  G.gBattle_BG1_Y += -1;
  switch (d[12]) {
    case 0:
      if (++d[10] === 4) {
        d[10] = 0;
        ++d[11];
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[11], 16 - d[11]));
        if (d[11] === 7) {
          ++d[12];
          d[11] = 0;
        }
      }
      break;
    case 1:
      if (++d[11] === 101) {
        d[11] = 7;
        ++d[12];
      }
      break;
    case 2:
      if (++d[10] === 4) {
        d[10] = 0;
        --d[11];
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[11], 16 - d[11]));
        if (d[11] === 0) {
          ++d[12];
          d[11] = 0;
        }
      }
      break;
    case 3: {
      const animBg = GetBattleAnimBg1Data();
      InitBattleAnimBg(animBg.bgId);
      ++d[12];
      break;
    }
    case 4:
      if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);
      G.gBattle_BG1_X = 0;
      G.gBattle_BG1_Y = 0;
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
      DestroyAnimVisualTask(taskId);
      break;
  }
}

// Animates the sprites that fly diagonally across the screen
// in Sandstorm and Heat Wave.
// arg 0: initial y pixel offset
// arg 1: projectile speed
// arg 2: y pixel drop
// arg 3: ??? unknown (possibly a color bit)
function AnimFlyingSandCrescent(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    if (gBattleAnimArgs[3] !== 0 && GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
      sprite.x = 304;
      gBattleAnimArgs[1] = -gBattleAnimArgs[1];
      sprite.data[5] = 1;
      sprite.oam.matrixNum = ST_OAM_HFLIP;
    } else {
      sprite.x = -64;
    }
    sprite.y = gBattleAnimArgs[0];
    SetSubspriteTables(sprite, subspriteTablesFrom({ $sym: "sFlyingSandSubspriteTable" }));
    sprite.data[1] = gBattleAnimArgs[1];
    sprite.data[2] = gBattleAnimArgs[2];
    ++sprite.data[0];
  } else {
    sprite.data[3] += sprite.data[1];
    sprite.data[4] += sprite.data[2];
    sprite.x2 += sprite.data[3] >> 8;
    sprite.y2 += sprite.data[4] >> 8;
    sprite.data[3] &= 0xff;
    sprite.data[4] &= 0xff;
    if (sprite.data[5] === 0) {
      if (sprite.x + sprite.x2 > DISPLAY_WIDTH + 32) sprite.callback = DestroyAnimSprite;
    } else if (sprite.x + sprite.x2 < -32) {
      sprite.callback = DestroyAnimSprite;
    }
  }
}

// Animates the rising rocks in Ancient Power.
function AnimRaiseSprite(sprite: Sprite): void {
  StartSpriteAnim(sprite, gBattleAnimArgs[4]);
  InitSpritePosToAnimAttacker(sprite, false);
  sprite.data[0] = gBattleAnimArgs[3];
  sprite.data[2] = sprite.x;
  sprite.data[4] = sprite.y + gBattleAnimArgs[2];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimTask_Rollout(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  const var0 = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) & 0xffff;
  const var1 = (GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + 24) & 0xffff;
  const var2 = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) & 0xffff;
  let var3 = (GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y) + 24) & 0xffff;
  if (BATTLE_PARTNER(animState.gBattleAnimAttacker) === animState.gBattleAnimTarget) var3 = var1;
  const rolloutCounter = GetRolloutCounter();
  if (rolloutCounter === 1) d[8] = 32;
  else d[8] = 48 - rolloutCounter * 8;
  d[0] = 0;
  d[11] = 0;
  d[9] = 0;
  d[12] = 1;
  let var5 = d[8];
  if (var5 < 0) var5 += 7;
  d[10] = (var5 >> 3) - 1;
  d[2] = s16(var0 * 8);
  d[3] = s16(var1 * 8);
  d[4] = s16(Math.trunc(((var2 - var0) * 8) / d[8]));
  d[5] = s16(Math.trunc(((var3 - var1) * 8) / d[8]));
  d[6] = 0;
  d[7] = 0;
  const pan1 = BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER);
  const pan2 = BattleAnimAdjustPanning(C.SOUND_PAN_TARGET);
  d[13] = pan1;
  d[14] = Math.trunc((pan2 - pan1) / d[8]);
  d[1] = rolloutCounter;
  d[15] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.func = AnimTask_Rollout_Step;
}

function AnimTask_Rollout_Step(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      d[6] = s16(d[6] - d[4]);
      d[7] = s16(d[7] - d[5]);
      gSprites[d[15]].x2 = d[6] >> 3;
      gSprites[d[15]].y2 = d[7] >> 3;
      if (++d[9] === 10) {
        d[11] = 20;
        ++d[0];
      }
      PlaySE12WithPanning(C.SE_M_HEADBUTT, d[13]);
      break;
    case 1:
      if (--d[11] === 0) ++d[0];
      break;
    case 2:
      if (--d[9] !== 0) {
        d[6] = s16(d[6] + d[4]);
        d[7] = s16(d[7] + d[5]);
      } else {
        d[6] = 0;
        d[7] = 0;
        ++d[0];
      }
      gSprites[d[15]].x2 = d[6] >> 3;
      gSprites[d[15]].y2 = d[7] >> 3;
      break;
    case 3:
      d[2] = s16(d[2] + d[4]);
      d[3] = s16(d[3] + d[5]);
      if (++d[9] >= d[10]) {
        d[9] = 0;
        CreateRolloutDirtSprite(task);
        d[13] += d[14];
        PlaySE12WithPanning(C.SE_M_DIG, d[13]);
      }
      if (--d[8] === 0) ++d[0];
      break;
    case 4:
      if (d[11] === 0) DestroyAnimVisualTask(taskId);
      break;
  }
}

function CreateRolloutDirtSprite(task: Task): void {
  const d = task.data;
  let spriteTemplate: string;
  let tileOffset: number;
  switch (d[1]) {
    case 1:
      spriteTemplate = "gRolloutMudSpriteTemplate";
      tileOffset = 0;
      break;
    case 2:
    case 3:
      spriteTemplate = "gRolloutRockSpriteTemplate";
      tileOffset = 80;
      break;
    case 4:
      spriteTemplate = "gRolloutRockSpriteTemplate";
      tileOffset = 64;
      break;
    case 5:
      spriteTemplate = "gRolloutRockSpriteTemplate";
      tileOffset = 48;
      break;
    default:
      return;
  }
  let x = (d[2] >> 3) & 0xffff;
  const y = (d[3] >> 3) & 0xffff;
  x = (x + d[12] * 4) & 0xffff;
  const spriteId = CreateSprite(animTemplate(spriteTemplate), s16(x), s16(y), 35);
  if (spriteId !== MAX_SPRITES) {
    const s = gSprites[spriteId];
    s.data[0] = 18;
    s.data[2] = d[12] * 20 + x + d[1] * 3;
    s.data[4] = y;
    s.data[5] = -16 - d[1] * 2;
    s.oam.tileNum += tileOffset;
    InitAnimArcTranslation(s);
    ++d[11];
  }
  d[12] *= -1;
}

function AnimRolloutParticle(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    const taskId = tasks.findByFunc(AnimTask_Rollout_Step);
    if (taskId !== TASK_NONE) --gTasks[taskId].data[11];
    DestroySprite(sprite);
  }
}

function GetRolloutCounter(): number {
  const disable = animState.gAnimDisableStructPtr!;
  let retVal = (disable.rolloutTimerStartValue - disable.rolloutTimer) & 0xff;
  const var0 = (retVal - 1) & 0xff;
  if (var0 > 4) retVal = 1;
  return retVal;
}

function AnimRockTomb(sprite: Sprite): void {
  StartSpriteAnim(sprite, gBattleAnimArgs[4]);
  sprite.x2 = gBattleAnimArgs[0];
  sprite.data[2] = gBattleAnimArgs[1];
  sprite.data[3] -= gBattleAnimArgs[2];
  sprite.data[0] = 3;
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.callback = AnimRockTomb_Step;
  sprite.invisible = true;
}

function AnimRockTomb_Step(sprite: Sprite): void {
  sprite.invisible = false;
  if (sprite.data[3] !== 0) {
    sprite.y2 = sprite.data[2] + sprite.data[3];
    sprite.data[3] += sprite.data[0];
    ++sprite.data[0];
    if (sprite.data[3] > 0) sprite.data[3] = 0;
  } else if (--sprite.data[1] === 0) {
    DestroyAnimSprite(sprite);
  }
}

function AnimRockBlastRock(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_OPPONENT) StartSpriteAffineAnim(sprite, 1);
  TranslateAnimSpriteToTargetMonLocation(sprite);
}

function AnimRockScatter(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y);
  sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  sprite.data[1] = gBattleAnimArgs[0];
  sprite.data[2] = gBattleAnimArgs[1];
  sprite.data[5] = gBattleAnimArgs[2];
  StartSpriteAnim(sprite, gBattleAnimArgs[3]);
  sprite.callback = AnimRockScatter_Step;
}

function AnimRockScatter_Step(sprite: Sprite): void {
  sprite.data[0] += 8;
  sprite.data[3] += sprite.data[1];
  sprite.data[4] += sprite.data[2];
  sprite.x2 += Math.trunc(sprite.data[3] / 40);
  sprite.y2 -= Sin(sprite.data[0], sprite.data[5]);
  if (sprite.data[0] > 140) DestroyAnimSprite(sprite);
}

function AnimTask_GetSeismicTossDamageLevel(taskId: number): void {
  const dmg = animState.gAnimMoveDmg;
  if (dmg < 33) gBattleAnimArgs[ARG_RET_ID] = 0;
  if (((dmg - 33) >>> 0) < 33) gBattleAnimArgs[ARG_RET_ID] = 1;
  if (dmg > 65) gBattleAnimArgs[ARG_RET_ID] = 2;
  DestroyAnimVisualTask(taskId);
}

function AnimTask_MoveSeismicTossBg(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[0] === 0) {
    ToggleBg3Mode(false);
    d[1] = 200;
  }
  G.gBattle_BG3_Y += Math.trunc(d[1] / 10);
  d[1] -= 3;
  if (d[0] === 120) {
    ToggleBg3Mode(true);
    DestroyAnimVisualTask(taskId);
  }
  ++d[0];
}

function AnimTask_SeismicTossBgAccelerateDownAtEnd(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[0] === 0) {
    ToggleBg3Mode(false);
    ++d[0];
    d[2] = s16(G.gBattle_BG3_Y);
  }
  d[1] += 80;
  d[1] &= 0xff;
  G.gBattle_BG3_Y = d[2] + Cos(4, d[1]);
  if (gBattleAnimArgs[7] === 0xfff) {
    G.gBattle_BG3_Y = 0;
    ToggleBg3Mode(true);
    DestroyAnimVisualTask(taskId);
  }
}

registerAnimSpriteCallbacks({
  AnimFallingRock, AnimRockFragment, AnimParticleInVortex, AnimFlyingSandCrescent, AnimRaiseSprite, AnimRolloutParticle,
  AnimRockTomb, AnimRockBlastRock, AnimRockScatter,
});

registerAnimTasks({
  AnimTask_LoadSandstormBackground, AnimTask_Rollout, AnimTask_GetSeismicTossDamageLevel, AnimTask_MoveSeismicTossBg,
  AnimTask_SeismicTossBgAccelerateDownAtEnd,
});
