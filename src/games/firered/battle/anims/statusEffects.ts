// battle_anim_status_effects.c: the (unused) flashing circle impacts, the frozen
// ice cube and the stat-change dispatcher. LaunchStatusAnimation and
// Task_DoStatusAnimation of this file live in battle/anim.ts.

import * as C from "../../generated/constants";
import { tasks } from "../../gba/tasks";
import { cdata, incbin, symName, type SymRef } from "../../hw/assets";
import { subspriteTablesFrom } from "../../hw/cdataSprite";
import { SetGpuReg } from "../../hw/gpu";
import { BlendPalette, gPlttBufferFaded, OBJ_PLTT_ID, RGB_BLUE, RGB_RED } from "../../hw/palette";
import { BLDALPHA_BLEND } from "../../hw/ppu";
import {
  CreateSprite, DestroySprite, DestroySpriteAndFreeResources, FreeSpriteOamMatrix, GetSpriteTileStartByTag, gSprites,
  IndexOfSpritePaletteTag, LoadSpritePalette, LoadSpriteSheet, SetSubspriteTables, type Sprite,
} from "../../hw/sprite";
import { Cos, Sin } from "../../hw/trig";
import { animState, DestroyAnimVisualTask, GetBattlerSpriteCoord } from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { gBattlerSpriteIds, gBattleSpritesDataPtr } from "../globals";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, s16 } from "./common";
import { InitStatsChangeAnimation } from "./utilityFuncs";

const ANIM_SPRITES_START = 10000;
const GET_TRUE_SPRITE_INDEX = (i: number) => i - ANIM_SPRITES_START;

type SheetDef = { data: SymRef; size: number; tag: number };
type PalDef = { data: SymRef; tag: number };

// Unused
export function Task_FlashingCircleImpacts(battlerId: number, b: boolean): number {
  const battlerSpriteId = gBattlerSpriteIds[battlerId];
  const taskId = tasks.create(Task_UpdateFlashingCircleImpacts, 10);
  let spriteId2 = 0;
  const sheet = cdata<SheetDef[]>("battle_anim", "gBattleAnimPicTable")[GET_TRUE_SPRITE_INDEX(C.ANIM_TAG_CIRCLE_IMPACT)];
  const pal = cdata<PalDef[]>("battle_anim", "gBattleAnimPaletteTable")[GET_TRUE_SPRITE_INDEX(C.ANIM_TAG_CIRCLE_IMPACT)];
  LoadSpriteSheet({ data: incbin(symName(sheet.data)!), size: sheet.size, tag: sheet.tag });
  LoadSpritePalette({ data: incbin(symName(pal.data)!), tag: pal.tag });
  gTasks[taskId].data[0] = battlerId;
  const template = animTemplate("sFlashingCircleImpactSpriteTemplate");
  const bs = gSprites[battlerSpriteId];
  if (b) {
    gTasks[taskId].data[1] = RGB_RED;
    for (let i = 0; i < 10; i++) {
      spriteId2 = CreateSprite(template, bs.x, bs.y + 32, 0);
      gSprites[spriteId2].data[0] = i * 51;
      gSprites[spriteId2].data[1] = -256;
      gSprites[spriteId2].invisible = true;
      if (i > 4) gSprites[spriteId2].data[6] = 21;
    }
  } else {
    gTasks[taskId].data[1] = RGB_BLUE;
    for (let i = 0; i < 10; i++) {
      spriteId2 = CreateSprite(template, bs.x, bs.y - 32, 0);
      gSprites[spriteId2].data[0] = i * 51;
      gSprites[spriteId2].data[1] = 256;
      gSprites[spriteId2].invisible = true;
      if (i > 4) gSprites[spriteId2].data[6] = 21;
    }
  }
  gSprites[spriteId2].data[7] = 1;
  return taskId;
}

function Task_UpdateFlashingCircleImpacts(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[2] === 2) {
    d[2] = 0;
    BlendPalette(OBJ_PLTT_ID(d[0]), 16, d[4], d[1] & 0xffff);
    if (d[5] === 0) {
      d[4]++;
      if (d[4] > 8) d[5] ^= 1;
    } else {
      const v = d[4] & 0xffff;
      d[4]--;
      if (d[4] < 0) {
        d[4] = s16(v);
        d[5] ^= 1;
        d[3]++;
        if (d[3] === 2) tasks.destroy(taskId);
      }
    }
  } else {
    d[2]++;
  }
}

function AnimFlashingCircleImpact(sprite: Sprite): void {
  if (sprite.data[6] === 0) {
    sprite.invisible = false;
    sprite.callback = AnimFlashingCircleImpact_Step;
    sprite.callback(sprite);
  } else {
    sprite.data[6]--;
  }
}

function AnimFlashingCircleImpact_Step(sprite: Sprite): void {
  sprite.x2 = Cos(sprite.data[0], 32);
  sprite.y2 = Sin(sprite.data[0], 8);
  if (sprite.data[0] < 128) sprite.subpriority = 29;
  else sprite.subpriority = 31;
  sprite.data[0] = (sprite.data[0] + 8) & 0xff;
  sprite.data[5] += sprite.data[1];
  sprite.y2 += sprite.data[5] >> 8;
  sprite.data[2]++;
  if (sprite.data[2] === 52) {
    if (sprite.data[7]) DestroySpriteAndFreeResources(sprite);
    else DestroySprite(sprite);
  }
}

function AnimTask_FrozenIceCube(taskId: number): void {
  let x = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) - 32);
  const y = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) - 36);
  if (IsContest()) x -= 6;
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  const spriteId = CreateSprite(animTemplate("sFrozenIceCubeSpriteTemplate"), x, y, 4);
  if (GetSpriteTileStartByTag(C.ANIM_TAG_ICE_CUBE) === 0xffff) gSprites[spriteId].invisible = true;
  SetSubspriteTables(gSprites[spriteId], subspriteTablesFrom({ $sym: "sFrozenIceCubeSubspriteTable" }));
  gTasks[taskId].data[15] = spriteId;
  gTasks[taskId].func = AnimTask_FrozenIceCube_Step1;
}

function AnimTask_FrozenIceCube_Step1(taskId: number): void {
  const d = gTasks[taskId].data;
  d[1]++;
  if (d[1] === 10) {
    gTasks[taskId].func = AnimTask_FrozenIceCube_Step2;
    d[1] = 0;
  } else {
    const v = d[1] & 0xff;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(v, 16 - v));
  }
}

function AnimTask_FrozenIceCube_Step2(taskId: number): void {
  const d = gTasks[taskId].data;
  const palIndex = IndexOfSpritePaletteTag(C.ANIM_TAG_ICE_CUBE);
  if (d[1]++ > 13) {
    d[2]++;
    if (d[2] === 3) {
      const base = OBJ_PLTT_ID(palIndex);
      const temp = gPlttBufferFaded[base + 13];
      gPlttBufferFaded[base + 13] = gPlttBufferFaded[base + 14];
      gPlttBufferFaded[base + 14] = gPlttBufferFaded[base + 15];
      gPlttBufferFaded[base + 15] = temp;
      d[2] = 0;
      d[3]++;
      if (d[3] === 3) {
        d[3] = 0;
        d[1] = 0;
        d[4]++;
        if (d[4] === 2) {
          d[1] = 9;
          gTasks[taskId].func = AnimTask_FrozenIceCube_Step3;
        }
      }
    }
  }
}

function AnimTask_FrozenIceCube_Step3(taskId: number): void {
  const d = gTasks[taskId].data;
  d[1]--;
  if (d[1] === -1) {
    gTasks[taskId].func = AnimTask_FrozenIceCube_Step4;
    d[1] = 0;
  } else {
    const v = d[1] & 0xff;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(v, 16 - v));
  }
}

function AnimTask_FrozenIceCube_Step4(taskId: number): void {
  const d = gTasks[taskId].data;
  d[1]++;
  if (d[1] === 37) {
    const spriteId = d[15] & 0xff;
    FreeSpriteOamMatrix(gSprites[spriteId]);
    DestroySprite(gSprites[spriteId]);
  } else if (d[1] === 39) {
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
    DestroyAnimVisualTask(taskId);
  }
}

// CASE(by, stat) case (STAT_ANIM_##by + stat - 1): [goesDown, animStatId per stat]
const STAT_TO_ANIM_ID: Record<number, number> = {
  [C.STAT_ATK]: 0, [C.STAT_DEF]: 1, [C.STAT_SPEED]: 3, [C.STAT_SPATK]: 5, [C.STAT_SPDEF]: 6, [C.STAT_ACC]: 2, [C.STAT_EVASION]: 4,
};

function AnimTask_StatsChange(taskId: number): void {
  let goesDown = false;
  let animStatId = 0;
  let sharply = false;
  const arg = gBattleSpritesDataPtr.animationData.animArg;
  const groups: Array<[number, boolean, boolean]> = [
    [C.STAT_ANIM_PLUS1, false, false], [C.STAT_ANIM_MINUS1, true, false],
    [C.STAT_ANIM_PLUS2, false, true], [C.STAT_ANIM_MINUS2, true, true],
  ];
  let found = false;
  for (const [base, down, sharp] of groups) {
    const stat = arg - base + 1;
    if (STAT_TO_ANIM_ID[stat] !== undefined && stat >= C.STAT_ATK && stat <= C.STAT_EVASION) {
      goesDown = down;
      animStatId = STAT_TO_ANIM_ID[stat];
      sharply = sharp;
      found = true;
      break;
    }
  }
  if (!found) {
    switch (arg) {
      case C.STAT_ANIM_MULTIPLE_PLUS1: goesDown = false; animStatId = 0xff; sharply = false; break;
      case C.STAT_ANIM_MULTIPLE_PLUS2: goesDown = false; animStatId = 0xff; sharply = true; break;
      case C.STAT_ANIM_MULTIPLE_MINUS1: goesDown = true; animStatId = 0xff; sharply = false; break;
      case C.STAT_ANIM_MULTIPLE_MINUS2: goesDown = true; animStatId = 0xff; sharply = true; break;
      default:
        DestroyAnimVisualTask(taskId);
        return;
    }
  }
  gBattleAnimArgs[0] = goesDown ? 1 : 0;
  gBattleAnimArgs[1] = animStatId;
  gBattleAnimArgs[2] = 0;
  gBattleAnimArgs[3] = 0;
  gBattleAnimArgs[4] = sharply ? 1 : 0;
  gTasks[taskId].func = InitStatsChangeAnimation;
  InitStatsChangeAnimation(taskId);
}

registerAnimSpriteCallbacks({ AnimFlashingCircleImpact });

registerAnimTasks({ AnimTask_FrozenIceCube, AnimTask_StatsChange });
