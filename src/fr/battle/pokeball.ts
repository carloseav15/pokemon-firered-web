// pokeball.c: Poké Ball send-out animation, ball graphics, healthbox slide-in and hit shake, plus the
// ball-open particles and mon fade, which live in battle/anims/special.ts (battle_anim_special.c).

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { tasks } from "../gba/tasks";
import { cdata } from "../hw/assets";
import { templateFrom, type CSpriteTemplate } from "../hw/cdataSprite";
import { OBJ_VRAM0, ppu } from "../hw/ppu";
import { gMain } from "../hw/runtime";
import {
  AnimateSprite, ChangeSpriteAffineAnim, CreateInvisibleSprite, CreateSprite, DestroySprite, DestroySpriteAndFreeResources, FreeOamMatrix,
  FreeSpriteOamMatrix, FreeSpritePaletteByTag, FreeSpriteTilesByTag, GetSpriteTileStartByTag, gSprites, LoadSpritePalette, LoadSpriteSheet,
  SpriteCallbackDummy, StartSpriteAffineAnim, StartSpriteAnim, TAG_NONE, type Sprite, type SpriteTemplate,
} from "../hw/sprite";
import { Cos, gSineTable, Sin } from "../hw/trig";
import { incbin } from "../hw/assets";
import { GetMonData, gEnemyParty, playerMon, type Mon } from "../pokemon/mon";
import { symBytes, symPalette } from "../pokemon/pics";
import { G, gBattlerPartyIndexes, gBattlerSpriteIds, gBattleSpritesDataPtr, gHealthboxSpriteIds } from "./globals";
import { GetBattlerSpriteCoord, InitAnimArcTranslation, AnimTranslateLinear, TranslateAnimHorizontalArc } from "./anim";
import { ShouldPlayNormalMonCry } from "./gfx_sfx_util";
import { AnimateBallOpenParticles, ItemIdToBallId, LaunchBallFadeMonTask } from "./anims/special";

export { ItemIdToBallId };
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";

const IsDoubleBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE);

type CSheet = { data: unknown; size: number; tag: number };
type CPal = { data: unknown; tag: number };
const gBallSpriteSheets = () => cdata<CSheet[]>("pokeball", "gBallSpriteSheets");
const gBallSpritePalettes = () => cdata<CPal[]>("pokeball", "gBallSpritePalettes");

function loadSheet(s: CSheet): void {
  LoadSpriteSheet({ data: symBytes(s.data).subarray(0, s.size), size: s.size, tag: s.tag });
}
function loadPal(p: CPal): void {
  LoadSpritePalette({ data: symPalette(p.data), tag: p.tag });
}

let ballTemplates: SpriteTemplate[] | null = null;
export function gBallSpriteTemplates(): SpriteTemplate[] {
  return (ballTemplates ??= cdata<CSpriteTemplate[]>("pokeball", "gBallSpriteTemplates").map((t) => templateFrom(t, { SpriteCB_BallThrow })));
}

const battlerMon = (battlerId: number): Mon =>
  GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER ? gEnemyParty[gBattlerPartyIndexes[battlerId]] : playerMon(gBattlerPartyIndexes[battlerId]);

/** pokeball.c AnimateBallOpenParticlesForPokeball fixes the effect to BALL_POKE. */
function AnimateBallOpenParticlesForPokeball(x: number, y: number, kindOfStars: number, subpriority: number): number {
  return AnimateBallOpenParticles(x & 0xff, y & 0xff, kindOfStars & 0xff, subpriority & 0xff, C.BALL_POKE);
}

/** pokeball.c LaunchBallFadeMonTaskForPokeball fixes the fade effect to BALL_POKE. */
function LaunchBallFadeMonTaskForPokeball(unFadeLater: boolean, spritePalNum: number, selectedPalettes: number): number {
  return LaunchBallFadeMonTask(unFadeLater, spritePalNum & 0xff, selectedPalettes >>> 0, C.BALL_POKE);
}

function GetBattlerPokeballItemId(battlerId: number): number {
  return GetMonData(battlerMon(battlerId), C.MON_DATA_POKEBALL);
}

// ---------------------------------------------------------------- send out

// task: tFrames data[0], tPan data[1], tThrowId data[2], tBattler data[3], tOpponentBattler data[4]
// ball sprite: sBattler data[6]
export function DoPokeballSendOutAnimation(pan: number, kindOfThrow: number): number {
  G.gDoingBattleAnim = true;
  gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].ballAnimActive = 1;
  const taskId = tasks.create(Task_DoPokeballSendOutAnim, 5);
  const d = tasks.tasks[taskId].data;
  d[1] = pan;
  d[2] = kindOfThrow;
  d[3] = G.gActiveBattler;
  return 0;
}

function Task_DoPokeballSendOutAnim(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  if (d[0] === 0) {
    d[0]++;
    return;
  }
  const throwCaseId = d[2];
  const battlerId = d[3];
  const ballId = ItemIdToBallId(GetMonData(battlerMon(battlerId), C.MON_DATA_POKEBALL));
  LoadBallGfx(ballId);
  const ballSpriteId = CreateSprite(gBallSpriteTemplates()[ballId], 32, 80, 29);
  const ball = gSprites[ballSpriteId];
  ball.data[0] = 0x80;
  ball.data[1] = 0;
  ball.data[7] = throwCaseId;
  let notSendOut = false;
  switch (throwCaseId) {
    case C.POKEBALL_PLAYER_SENDOUT: {
      const [x, y] = G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE ? [32, 64] : [48, 70];
      G.gBattlerTarget = battlerId;
      ball.x = x;
      ball.y = y;
      ball.callback = SpriteCB_PlayerMonSendOut_1;
      break;
    }
    case C.POKEBALL_OPPONENT_SENDOUT:
      ball.x = GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_X);
      ball.y = GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_Y) + 24;
      G.gBattlerTarget = battlerId;
      ball.data[0] = 0;
      ball.callback = SpriteCB_OpponentMonSendOut;
      break;
    default:
      G.gBattlerTarget = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
      notSendOut = true;
      break;
  }
  ball.data[6] = G.gBattlerTarget;
  if (!notSendOut) {
    tasks.destroy(taskId);
    return;
  }
  // unused ball throw animation
  ball.data[0] = 34;
  ball.data[2] = GetBattlerSpriteCoord(G.gBattlerTarget, C.BATTLER_COORD_X);
  ball.data[4] = GetBattlerSpriteCoord(G.gBattlerTarget, C.BATTLER_COORD_Y) - 16;
  ball.data[5] = -40;
  InitAnimArcTranslation(ball);
  ball.oam.affineParam = taskId;
  d[4] = G.gBattlerTarget;
  tasks.tasks[taskId].func = () => {};
  sound.playSE(C.SE_BALL_THROW);
}

function SpriteCB_BallThrow(sprite: Sprite): void {
  if (!TranslateAnimHorizontalArc(sprite)) return;
  const taskId = sprite.oam.affineParam;
  const opponentBattler = tasks.tasks[taskId].data[4];
  const noOfShakes = tasks.tasks[taskId].data[2];
  StartSpriteAnim(sprite, 1);
  sprite.affineAnimPaused = true;
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.x2 = 0;
  sprite.y2 = 0;
  sprite.data[5] = 0;
  const ballId = ItemIdToBallId(GetBattlerPokeballItemId(opponentBattler));
  AnimateBallOpenParticles(sprite.x, sprite.y - 5, 1, 28, ballId);
  sprite.data[0] = LaunchBallFadeMonTask(false, opponentBattler, 14, ballId);
  sprite.data[6] = opponentBattler;
  sprite.data[7] = noOfShakes;
  tasks.destroy(taskId);
  sprite.callback = SpriteCB_BallThrow_ReachMon;
}

function SpriteCB_BallThrow_ReachMon(sprite: Sprite): void {
  sprite.callback = SpriteCB_BallThrow_StartShrinkMon;
}

const monSpriteOf = (sprite: Sprite) => gSprites[gBattlerSpriteIds[sprite.data[6]]];

function SpriteCB_BallThrow_StartShrinkMon(sprite: Sprite): void {
  if (++sprite.data[5] === 10) {
    sprite.data[5] = 0;
    sprite.callback = SpriteCB_BallThrow_ShrinkMon;
    StartSpriteAffineAnim(monSpriteOf(sprite), C.BATTLER_AFFINE_RETURN);
    AnimateSprite(monSpriteOf(sprite));
    monSpriteOf(sprite).data[1] = 0;
  }
}

function SpriteCB_BallThrow_ShrinkMon(sprite: Sprite): void {
  sprite.data[5]++;
  if (sprite.data[5] === 11) sound.playSE(C.SE_BALL_TRADE);
  const mon = monSpriteOf(sprite);
  if (mon.affineAnimEnded) {
    StartSpriteAnim(sprite, 2);
    mon.invisible = true;
    sprite.data[5] = 0;
    sprite.callback = SpriteCB_BallThrow_Close;
  } else {
    mon.data[1] += 0x60;
    mon.y2 = -mon.data[1] >> 8;
  }
}

function SpriteCB_BallThrow_Close(sprite: Sprite): void {
  if (sprite.animEnded && ++sprite.data[5] === 1) {
    sprite.data[3] = 0;
    sprite.data[4] = 32;
    sprite.data[5] = 0;
    sprite.y += Cos(0, 32);
    sprite.y2 = -Cos(0, sprite.data[4]);
    sprite.callback = SpriteCB_BallThrow_FallToGround;
  }
}

function SpriteCB_BallThrow_FallToGround(sprite: Sprite): void {
  let r5 = false;
  const d = sprite.data;
  switch (d[3] & 0xff) {
    case 0:
      sprite.y2 = -Cos(d[5], d[4]);
      d[5] += 4 + (d[3] >> 8);
      if (d[5] >= 64) {
        d[4] -= 10;
        d[3] += 0x101;
        if (d[3] >> 8 === 4) r5 = true;
        switch (d[3] >> 8) {
          case 1: sound.playSE(C.SE_BALL_BOUNCE_1); break;
          case 2: sound.playSE(C.SE_BALL_BOUNCE_2); break;
          case 3: sound.playSE(C.SE_BALL_BOUNCE_3); break;
          default: sound.playSE(C.SE_BALL_BOUNCE_4); break;
        }
      }
      break;
    case 1:
      sprite.y2 = -Cos(d[5], d[4]);
      d[5] -= 4 + (d[3] >> 8);
      if (d[5] <= 0) {
        d[5] = 0;
        d[3] &= 0xff00;
      }
      break;
  }
  if (r5) {
    d[3] = 0;
    sprite.y += Cos(64, 32);
    sprite.y2 = 0;
    if (d[7] === 0) {
      sprite.callback = SpriteCB_ReleaseMonFromBall;
    } else {
      sprite.callback = SpriteCB_BallThrow_StartShakes;
      d[4] = 1;
      d[5] = 0;
    }
  }
}

function SpriteCB_BallThrow_StartShakes(sprite: Sprite): void {
  if (++sprite.data[3] === 31) {
    sprite.data[3] = 0;
    sprite.affineAnimPaused = true;
    StartSpriteAffineAnim(sprite, 1);
    sprite.callback = SpriteCB_BallThrow_Shake;
    sound.playSE(C.SE_BALL);
  }
}

function SpriteCB_BallThrow_Shake(sprite: Sprite): void {
  const d = sprite.data;
  switch (d[3] & 0xff) {
    case 0:
    case 2:
      sprite.x2 += d[4];
      d[5] += d[4];
      sprite.affineAnimPaused = false;
      if (d[5] > 3 || d[5] < -3) {
        d[3]++;
        d[5] = 0;
      }
      break;
    case 1:
      if (++d[5] === 1) {
        d[5] = 0;
        d[4] = -d[4];
        d[3]++;
        sprite.affineAnimPaused = false;
        ChangeSpriteAffineAnim(sprite, d[4] < 0 ? 2 : 1);
      } else {
        sprite.affineAnimPaused = true;
      }
      break;
    case 3:
      d[3] += 0x100;
      if (d[3] >> 8 === d[7]) {
        sprite.callback = SpriteCB_ReleaseMonFromBall;
      } else if (d[7] === 4 && d[3] >> 8 === 3) {
        sprite.callback = SpriteCB_BallThrow_StartCaptureMon;
        sprite.affineAnimPaused = true;
      } else {
        d[3]++;
        sprite.affineAnimPaused = true;
      }
      break;
    default:
      if (++d[5] === 31) {
        d[5] = 0;
        d[3] &= 0xff00;
        StartSpriteAffineAnim(sprite, 3);
        StartSpriteAffineAnim(sprite, d[4] < 0 ? 2 : 1);
        sound.playSE(C.SE_BALL);
      }
      break;
  }
}

// cry task: tCryTaskSpecies data[0], tCryTaskPan data[1], tCryTaskWantedCry data[2], mon battler in data[3],
// tCryTaskFrames data[10], tCryTaskState data[15]. (The C code stores the Pokemon pointer in data[3]/[4].)
const cryTaskMons: Mon[] = [];

function Task_PlayCryWhenReleasedFromBall(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  const wantedCry = d[2];
  const species = d[0];
  const mon = cryTaskMons[taskId];
  const cry = (normal: number, weak: number) => sound.playCry(species, ShouldPlayNormalMonCry(mon) ? normal : weak);
  switch (d[15]) {
    case 0:
    default:
      if (d[8] < 3) d[8]++;
      else d[15] = wantedCry + 1;
      break;
    case 1:
      cry(C.CRY_MODE_NORMAL, C.CRY_MODE_WEAK);
      tasks.destroy(taskId);
      break;
    case 2:
      d[10] = 3;
      d[15] = 20;
      break;
    case 20:
      if (d[10] === 0) {
        cry(C.CRY_MODE_DOUBLES, C.CRY_MODE_WEAK_DOUBLES);
        tasks.destroy(taskId);
      } else {
        d[10]--;
      }
      break;
    case 3:
      d[10] = 6;
      d[15] = 30;
      break;
    case 30:
      if (d[10] !== 0) {
        d[10]--;
        break;
      }
      d[15]++;
    // fallthrough
    case 31:
      if (!sound.isCryPlaying()) {
        d[10] = 3;
        d[15]++;
      }
      break;
    case 32:
      if (d[10] !== 0) {
        d[10]--;
        break;
      }
      cry(C.CRY_MODE_NORMAL, C.CRY_MODE_WEAK);
      tasks.destroy(taskId);
      break;
  }
}

function SpriteCB_ReleaseMonFromBall(sprite: Sprite): void {
  const battlerId = sprite.data[6];
  StartSpriteAnim(sprite, 1);
  const ballId = ItemIdToBallId(GetBattlerPokeballItemId(battlerId));
  AnimateBallOpenParticles(sprite.x, sprite.y - 5, 1, 28, ballId);
  sprite.data[0] = LaunchBallFadeMonTask(true, battlerId, 14, ballId);
  sprite.callback = HandleBallAnimEnd;
  if (gMain.inBattle) {
    const mon = battlerMon(battlerId);
    const pan = GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER ? 25 : -25;
    const species = GetMonData(mon, C.MON_DATA_SPECIES);
    const isLeft = battlerId === GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT) || battlerId === GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    const intro = gBattleSpritesDataPtr.animationData.introAnimActive;
    if (isLeft && IsDoubleBattle() && intro) {
      if (G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) sound.stopBGM();
      else sound.setBgmVolume(128);
    }
    const wantedCryCase = !IsDoubleBattle() || !intro ? 0 : isLeft ? 1 : 2;
    const taskId = tasks.create(Task_PlayCryWhenReleasedFromBall, 3);
    const d = tasks.tasks[taskId].data;
    d[0] = species;
    d[1] = pan;
    d[2] = wantedCryCase;
    d[15] = 0;
    cryTaskMons[taskId] = mon;
  }
  const monSprite = gSprites[gBattlerSpriteIds[battlerId]];
  StartSpriteAffineAnim(monSprite, C.BATTLER_AFFINE_EMERGE);
  AnimateSprite(monSprite);
  monSprite.data[1] = 0x1000;
}

function SpriteCB_BallThrow_StartCaptureMon(sprite: Sprite): void {
  sprite.animPaused = true;
  sprite.callback = SpriteCB_BallThrow_CaptureMon;
  sprite.data[3] = 0;
  sprite.data[4] = 0;
  sprite.data[5] = 0;
}

function HandleBallAnimEnd(sprite: Sprite): void {
  let affineAnimEnded = false;
  const battlerId = sprite.data[6];
  const mon = gSprites[gBattlerSpriteIds[battlerId]];
  mon.invisible = false;
  if (sprite.animEnded) sprite.invisible = true;
  if (mon.affineAnimEnded) {
    StartSpriteAffineAnim(mon, C.BATTLER_AFFINE_NORMAL);
    affineAnimEnded = true;
  } else {
    mon.data[1] -= 288;
    mon.y2 = mon.data[1] >> 8;
  }
  if (sprite.animEnded && affineAnimEnded) {
    mon.y2 = 0;
    G.gDoingBattleAnim = false;
    gBattleSpritesDataPtr.healthBoxesData[battlerId].ballAnimActive = 0;
    FreeSpriteOamMatrix(sprite);
    DestroySprite(sprite);
    let doneBattlers = 0;
    for (let i = 0; i < 4; i++) if (!gBattleSpritesDataPtr.healthBoxesData[i].ballAnimActive) doneBattlers++;
    if (doneBattlers === 4) for (let i = 0; i < C.POKEBALL_COUNT; i++) FreeBallGfx(i);
  }
}

function SpriteCB_BallThrow_CaptureMon(sprite: Sprite): void {
  const battlerId = sprite.data[6];
  sprite.data[4]++;
  if (sprite.data[4] === 40) return;
  if (sprite.data[4] === 95) {
    G.gDoingBattleAnim = false;
    sound.stopBGM();
    sound.playSE(C.MUS_CAUGHT_INTRO);
  } else if (sprite.data[4] === 315) {
    const mon = gSprites[gBattlerSpriteIds[battlerId]];
    FreeOamMatrix(mon.oam.matrixNum);
    DestroySprite(mon);
    DestroySpriteAndFreeResources(sprite);
    if (gMain.inBattle) gBattleSpritesDataPtr.healthBoxesData[battlerId].ballAnimActive = 0;
  }
}

function SpriteCB_PlayerMonSendOut_1(sprite: Sprite): void {
  sprite.data[0] = 25;
  sprite.data[2] = GetBattlerSpriteCoord(sprite.data[6], C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(sprite.data[6], C.BATTLER_COORD_Y_PIC_OFFSET) + 24;
  sprite.data[5] = -30;
  sprite.oam.affineParam = sprite.data[6];
  InitAnimArcTranslation(sprite);
  sprite.callback = SpriteCB_PlayerMonSendOut_2;
}

const HIBYTE = (x: number) => (x >> 8) & 0xff;

function SpriteCB_PlayerMonSendOut_2(sprite: Sprite): void {
  const d = sprite.data;
  if (HIBYTE(d[7]) >= 35 && HIBYTE(d[7]) < 80) {
    if ((sprite.oam.affineParam & 0xff00) === 0) {
      const r6 = d[1] & 1;
      const r7 = d[2] & 1;
      d[1] = ((Math.trunc(d[1] / 3)) & ~1) | r6;
      d[2] = ((Math.trunc(d[2] / 3)) & ~1) | r7;
      StartSpriteAffineAnim(sprite, 4);
    }
    const r4 = d[0];
    AnimTranslateLinear(sprite);
    d[7] += Math.trunc(d[6] / 3);
    sprite.y2 += Sin(HIBYTE(d[7]), d[5]);
    sprite.oam.affineParam = (sprite.oam.affineParam + 0x100) & 0xffff;
    d[0] = (sprite.oam.affineParam >> 8) % 3 !== 0 ? r4 : r4 - 1;
    if (HIBYTE(d[7]) >= 80) {
      const r6 = d[1] & 1;
      const r7 = d[2] & 1;
      d[1] = ((d[1] * 3) & ~1) | r6;
      d[2] = ((d[2] * 3) & ~1) | r7;
    }
  } else if (TranslateAnimHorizontalArc(sprite)) {
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.y2 = 0;
    sprite.x2 = 0;
    d[6] = sprite.oam.affineParam & 0xff;
    d[0] = 0;
    if (IsDoubleBattle() && gBattleSpritesDataPtr.animationData.introAnimActive && d[6] === GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT)) {
      sprite.callback = SpriteCB_ReleaseMon2FromBall;
    } else {
      sprite.callback = SpriteCB_ReleaseMonFromBall;
    }
    StartSpriteAffineAnim(sprite, 0);
  }
}

function SpriteCB_ReleaseMon2FromBall(sprite: Sprite): void {
  if (sprite.data[0]++ > 24) {
    sprite.data[0] = 0;
    sprite.callback = SpriteCB_ReleaseMonFromBall;
  }
}

function SpriteCB_OpponentMonSendOut(sprite: Sprite): void {
  if (++sprite.data[0] > 15) {
    sprite.data[0] = 0;
    if (IsDoubleBattle() && gBattleSpritesDataPtr.animationData.introAnimActive && sprite.data[6] === GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT)) {
      sprite.callback = SpriteCB_ReleaseMon2FromBall;
    } else {
      sprite.callback = SpriteCB_ReleaseMonFromBall;
    }
  }
}

// ---------------------------------------------------------------- Oak intro / trade release

// ball sprite: sMonSpriteId data[0], sDelay data[1], sMonPalNum data[2], sFadePalsLo/Hi data[3]/[4],
// sFinalMonX data[5], sFinalMonY data[6], sTrigIdx data[7]
export function CreatePokeballSpriteToReleaseMon(monSpriteId: number, monPalNum: number, x: number, y: number, oamPriority: number, subpriority: number, delay: number, fadePalettes: number): void {
  loadSheet(gBallSpriteSheets()[C.BALL_POKE]);
  loadPal(gBallSpritePalettes()[C.BALL_POKE]);
  const spriteId = CreateSprite(gBallSpriteTemplates()[C.BALL_POKE], x, y, subpriority);
  const s = gSprites[spriteId];
  s.data[0] = monSpriteId;
  s.data[5] = gSprites[monSpriteId].x;
  s.data[6] = gSprites[monSpriteId].y;
  gSprites[monSpriteId].x = x;
  gSprites[monSpriteId].y = y;
  s.data[1] = delay;
  s.data[2] = monPalNum;
  s.data[3] = fadePalettes & 0xffff;
  s.data[4] = fadePalettes >>> 16;
  s.oam.priority = oamPriority;
  s.callback = SpriteCB_PokeballReleaseMon;
  gSprites[monSpriteId].invisible = true;
}

function SpriteCB_PokeballReleaseMon(sprite: Sprite): void {
  if (sprite.data[1] !== 0) {
    sprite.data[1]--;
    return;
  }
  const spriteId = sprite.data[0];
  const selectedPalettes = ((sprite.data[3] & 0xffff) | ((sprite.data[4] & 0xffff) << 16)) >>> 0;
  const subpriority = sprite.subpriority !== 0 ? sprite.subpriority - 1 : 0;
  StartSpriteAnim(sprite, 1);
  AnimateBallOpenParticlesForPokeball(sprite.x, sprite.y - 5, sprite.oam.priority, subpriority);
  sprite.data[1] = LaunchBallFadeMonTaskForPokeball(true, sprite.data[2], selectedPalettes);
  sprite.callback = SpriteCB_ReleasedMonFlyOut;
  gSprites[spriteId].invisible = false;
  StartSpriteAffineAnim(gSprites[spriteId], C.BATTLER_AFFINE_EMERGE);
  AnimateSprite(gSprites[spriteId]);
  gSprites[spriteId].data[1] = 0x1000;
  sprite.data[7] = 0;
}

function SpriteCB_ReleasedMonFlyOut(sprite: Sprite): void {
  let emergeAnimFinished = false;
  let atFinalPosition = false;
  const mon = gSprites[sprite.data[0]];
  if (sprite.animEnded) sprite.invisible = true;
  if (mon.affineAnimEnded) {
    StartSpriteAffineAnim(mon, C.BATTLER_AFFINE_NORMAL);
    emergeAnimFinished = true;
  }
  mon.x = (Math.trunc(((sprite.data[5] - sprite.x) * sprite.data[7]) / 128) + sprite.x) & 0xffff;
  mon.y = (Math.trunc(((sprite.data[6] - sprite.y) * sprite.data[7]) / 128) + sprite.y) & 0xffff;
  if (sprite.data[7] < 128) {
    const sine = -Math.trunc(gSineTable[sprite.data[7] & 0xff] / 8);
    sprite.data[7] += 4;
    mon.x2 = sine;
    mon.y2 = sine;
  } else {
    mon.x = sprite.data[5];
    mon.y = sprite.data[6];
    mon.x2 = 0;
    mon.y2 = 0;
    atFinalPosition = true;
  }
  if (sprite.animEnded && emergeAnimFinished && atFinalPosition) DestroySpriteAndFreeResources(sprite);
}

export function CreateTradePokeballSprite(monSpriteId: number, monPalNum: number, x: number, y: number, oamPriority: number, subPriority: number, delay: number, fadePalettes: number): number {
  loadSheet(gBallSpriteSheets()[C.BALL_POKE]);
  loadPal(gBallSpritePalettes()[C.BALL_POKE]);
  const spriteId = CreateSprite(gBallSpriteTemplates()[C.BALL_POKE], x, y, subPriority);
  const s = gSprites[spriteId];
  s.data[0] = monSpriteId;
  s.data[1] = delay;
  s.data[2] = monPalNum;
  s.data[3] = fadePalettes & 0xffff;
  s.data[4] = fadePalettes >>> 16;
  s.oam.priority = oamPriority;
  s.callback = SpriteCB_TradePokeball;
  return spriteId;
}

function SpriteCB_TradePokeball(sprite: Sprite): void {
  if (sprite.data[1] !== 0) {
    sprite.data[1]--;
    return;
  }
  const monSpriteId = sprite.data[0];
  const selectedPalettes = ((sprite.data[3] & 0xffff) | ((sprite.data[4] & 0xffff) << 16)) >>> 0;
  const subpriority = sprite.subpriority !== 0 ? sprite.subpriority - 1 : 0;
  StartSpriteAnim(sprite, 1);
  AnimateBallOpenParticlesForPokeball(sprite.x, sprite.y - 5, sprite.oam.priority, subpriority);
  sprite.data[1] = LaunchBallFadeMonTaskForPokeball(true, sprite.data[2], selectedPalettes);
  sprite.callback = SpriteCB_TradePokeballSendOff;
  StartSpriteAffineAnim(gSprites[monSpriteId], C.BATTLER_AFFINE_RETURN);
  AnimateSprite(gSprites[monSpriteId]);
  gSprites[monSpriteId].data[1] = 0;
}

function SpriteCB_TradePokeballSendOff(sprite: Sprite): void {
  if (++sprite.data[5] === 11) sound.playSE(C.SE_BALL_TRADE);
  const mon = gSprites[sprite.data[0]];
  if (mon.affineAnimEnded) {
    StartSpriteAnim(sprite, 2);
    mon.invisible = true;
    sprite.data[5] = 0;
    sprite.callback = SpriteCB_TradePokeballEnd;
  } else {
    mon.data[1] += 96;
    mon.y2 = -mon.data[1] >> 8;
  }
}

/** pokeball.c SpriteCB_TradePokeballEnd. */
function SpriteCB_TradePokeballEnd(sprite: Sprite): void {
  if (sprite.animEnded) sprite.callback = SpriteCallbackDummy;
}

export function DestroySpriteAndFreeResources_Ball(sprite: Sprite): void {
  DestroySpriteAndFreeResources(sprite);
}

// ---------------------------------------------------------------- healthbox slide-in / hit shake

// healthbox: sSpeedX data[0], sSpeedY data[1] (sDelayTimer data[1])
export function StartHealthboxSlideIn(battlerId: number): void {
  const hb = gSprites[gHealthboxSpriteIds[battlerId]];
  hb.data[0] = 5;
  hb.data[1] = 0;
  hb.x2 = 0x73;
  hb.y2 = 0;
  hb.callback = SpriteCB_HealthboxSlideIn;
  if (GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER) {
    hb.data[0] = -hb.data[0];
    hb.data[1] = -hb.data[1];
    hb.x2 = -hb.x2;
    hb.y2 = -hb.y2;
  }
  const bar = gSprites[hb.data[5]];
  bar.callback(bar);
  if (GetBattlerPosition(battlerId) === C.B_POSITION_PLAYER_RIGHT) hb.callback = SpriteCB_HealthboxSlideInDelayed;
}

function SpriteCB_HealthboxSlideInDelayed(sprite: Sprite): void {
  if (++sprite.data[1] === 20) {
    sprite.data[1] = 0;
    sprite.callback = SpriteCB_HealthboxSlideIn;
  }
}

function SpriteCB_HealthboxSlideIn(sprite: Sprite): void {
  sprite.x2 -= sprite.data[0];
  sprite.y2 -= sprite.data[1];
  if (sprite.x2 === 0 && sprite.y2 === 0) sprite.callback = SpriteCallbackDummy;
}

export function DoHitAnimHealthboxEffect(battlerId: number): void {
  const spriteId = CreateInvisibleSprite(SpriteCB_HitAnimHealthoxEffect);
  gSprites[spriteId].data[0] = 1;
  gSprites[spriteId].data[1] = gHealthboxSpriteIds[battlerId];
  gSprites[spriteId].callback = SpriteCB_HitAnimHealthoxEffect;
}

function SpriteCB_HitAnimHealthoxEffect(sprite: Sprite): void {
  const hb = gSprites[sprite.data[1]];
  hb.y2 = sprite.data[0];
  sprite.data[0] = -sprite.data[0];
  if (++sprite.data[2] === 21) {
    hb.x2 = 0;
    hb.y2 = 0;
    DestroySprite(sprite);
  }
}

// ---------------------------------------------------------------- ball gfx

export function LoadBallGfx(ballId: number): void {
  const sheet = gBallSpriteSheets()[ballId];
  if (GetSpriteTileStartByTag(sheet.tag) === TAG_NONE) {
    loadSheet(sheet);
    loadPal(gBallSpritePalettes()[ballId]);
  }
  switch (ballId) {
    case C.BALL_DIVE:
    case C.BALL_LUXURY:
    case C.BALL_PREMIER:
      break;
    default: {
      const start = GetSpriteTileStartByTag(sheet.tag);
      const open = incbin("gOpenPokeballGfx");
      ppu.vram.set(open, OBJ_VRAM0 + 0x100 + start * 32);
      break;
    }
  }
}

export function FreeBallGfx(ballId: number): void {
  FreeSpriteTilesByTag(gBallSpriteSheets()[ballId].tag);
  FreeSpritePaletteByTag(gBallSpritePalettes()[ballId].tag);
}
