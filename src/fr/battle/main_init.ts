// battle_main.c: battle start-up, main/vblank callbacks, NPC party creation and shared sprite callbacks.

import * as C from "../generated/constants";
import { random } from "../random";
import { rom } from "../rom";
import { JOY_HELD, B_BUTTON } from "../gba/input";
import { tasks } from "../gba/tasks";
import { sound } from "../audio/sound";
import { SetGpuReg } from "../hw/gpu";
import { ppu, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS, REG_OFFSET_MOSAIC, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WIN1H, REG_OFFSET_WIN1V, REG_OFFSET_WININ, REG_OFFSET_WINOUT } from "../hw/ppu";
import { BeginNormalPaletteFade, gPaletteFade, PALETTES_ALL, ResetPaletteFade, ResetPaletteFadeControl, RGB, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "../hw/palette";
import { gMain, SetHBlankCallback, SetMainCallback2, SetVBlankCallback } from "../hw/runtime";
import { IsDma3ManagerBusyWithBgCopy, ShowBg } from "../hw/bg";
import { RunTextPrinters } from "../hw/text";
import { gScanlineEffectRegBuffers, ScanlineEffect_Clear, ScanlineEffect_InitHBlankDmaTransfer, ScanlineEffect_SetParams, SCANLINE_EFFECT_DMACNT_16BIT } from "../hw/scanline";
import {
  AnimateSprites, BuildOamBuffer, CreateInvisibleSprite, DestroySprite, FreeAllSpritePalettes, FreeSpriteOamMatrix, gSprites, LoadOam,
  ProcessSpriteCopyRequests, ResetSpriteData, spriteState, StartSpriteAnim, StartSpriteAnimIfDifferent, type Sprite,
} from "../hw/sprite";
import { Sin } from "../hw/trig";
import { cdata } from "../hw/assets";
import { CreateMon, gEnemyParty, OT_ID_RANDOM_NO_SHINY, playerMon, SetMonData, ZeroEnemyPartyMons } from "../pokemon/mon";
import { AdjustFriendship } from "../pokemon/mon_extra";
import { G, gBattleCommunication, gBattleMonForms, gBattlerPartyIndexes, gBattlerSpriteIds, gBattleSpritesDataPtr, gHealthboxSpriteIds, gMonSpritesGfxPtr } from "./globals";
import { BattleMainCB1 } from "./main";
import { GetBattlerPosition } from "./util";
import { InitBattleControllers, SetUpBattleVars } from "./controllers";
import { BattleInitAllSprites } from "./gfx_sfx_util";
import { BattleInterfaceSetWindowPals, DrawBattleEntryBackground, InitBattleBgsVideo, LoadBattleTextboxAndBackground } from "./bg";
import { SetHealthboxSpriteVisible, StartHealthboxSlideIn } from "./interface";
import { battleHost } from "./host";

let sUnknownDebugSpriteDataBuffer: Uint16Array | null = null;

/** battle_main.c SpriteCB_UnusedDebugSprite: begin the debug tile-buffer animation. */
export function SpriteCB_UnusedDebugSprite(sprite: Sprite): void {
  sprite.data[0] = 0;
  sprite.callback = SpriteCB_UnusedDebugSprite_Step;
}

/** battle_main.c SpriteCB_UnusedDebugSprite_Step. */
export function SpriteCB_UnusedDebugSprite_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      sUnknownDebugSpriteDataBuffer = new Uint16Array(0x800);
      sprite.data[0]++;
      sprite.data[1] = 0;
      sprite.data[2] = 0x281;
      sprite.data[3] = 0;
      sprite.data[4] = 1;
      // C falls through into case 1 on this frame.
    case 1:
      if (--sprite.data[4] === 0) {
        sprite.data[4] = 2;
        const row = sprite.data[3];
        const first = sprite.data[1] + row * 32;
        const second = sprite.data[2] - row * 32;
        for (let i = 0; i <= 29; i += 2) {
          sUnknownDebugSpriteDataBuffer![first + i] = 0x3d;
          sUnknownDebugSpriteDataBuffer![second + i] = 0x3d;
        }
        if (++sprite.data[3] === 21) {
          sprite.data[0]++;
          sprite.data[1] = 32;
        }
      }
      break;
    case 2:
      if (--sprite.data[1] === 20) {
        sUnknownDebugSpriteDataBuffer?.fill(0);
        sUnknownDebugSpriteDataBuffer = null;
        SetMainCallback2(CB2_InitBattle);
      }
      break;
  }
}

export { VBlankCB_Battle };

export function CB2_InitBattle(): void {
  CB2_InitBattleInternal();
}

function CB2_InitBattleInternal(): void {
  SetHBlankCallback(null);
  SetVBlankCallback(null);
  ppuClearVram();
  SetGpuReg(REG_OFFSET_MOSAIC, 0);
  SetGpuReg(REG_OFFSET_WIN0H, C.DISPLAY_WIDTH);
  SetGpuReg(REG_OFFSET_WIN0V, ((C.DISPLAY_HEIGHT / 2) << 8) | (C.DISPLAY_HEIGHT / 2 + 1));
  SetGpuReg(REG_OFFSET_WININ, 0);
  SetGpuReg(REG_OFFSET_WINOUT, 0);
  G.gBattle_WIN0H = C.DISPLAY_WIDTH;
  G.gBattle_WIN0V = ((C.DISPLAY_HEIGHT / 2) << 8) | (C.DISPLAY_HEIGHT / 2 + 1);
  ScanlineEffect_Clear();
  let i = 0;
  for (; i < 80; i++) {
    gScanlineEffectRegBuffers[0][i] = 0xf0;
    gScanlineEffectRegBuffers[1][i] = 0xf0;
  }
  for (; i < 160; i++) {
    gScanlineEffectRegBuffers[0][i] = 0xff10;
    gScanlineEffectRegBuffers[1][i] = 0xff10;
  }
  ScanlineEffect_SetParams({ dmaDest: REG_OFFSET_BG3HOFS, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1 });
  ResetPaletteFade();
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  G.gBattle_BG2_X = 0;
  G.gBattle_BG2_Y = 0;
  G.gBattle_BG3_X = 0;
  G.gBattle_BG3_Y = 0;
  G.gBattleTerrain = battleHost.terrain();
  InitBattleBgsVideo();
  LoadBattleTextboxAndBackground();
  ResetSpriteData();
  tasks.reset();
  DrawBattleEntryBackground();
  FreeAllSpritePalettes();
  spriteState.gReservedSpritePaletteCount = 4;
  SetVBlankCallback(VBlankCB_Battle);
  SetUpBattleVars();
  SetMainCallback2(CB2_HandleStartBattle);
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_LINK)) {
    CreateNPCTrainerParty(G.gTrainerBattleOpponent_A);
    battleHost.setWildMonHeldItem();
  }
  gMain.inBattle = true;
  for (let p = 0; p < 6; p++) AdjustFriendship(playerMon(p), C.FRIENDSHIP_EVENT_LEAGUE_BATTLE);
  gBattleCommunication[C.MULTIUSE_STATE] = 0;
}

function ppuClearVram(): void {
  ppu.vram.fill(0);
}

function CB2_HandleStartBattle(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  switch (gBattleCommunication[C.MULTIUSE_STATE]) {
    case 0:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        ShowBg(0);
        ShowBg(1);
        ShowBg(2);
        ShowBg(3);
        BattleInterfaceSetWindowPals();
        gBattleCommunication[C.MULTIUSE_STATE] = 1;
      }
      break;
    case 1:
      G.gBattleTypeFlags |= C.BATTLE_TYPE_IS_MASTER;
      gBattleCommunication[C.MULTIUSE_STATE] = 15;
      break;
    case 15:
      InitBattleControllers();
      gBattleCommunication[C.MULTIUSE_STATE]++;
      gBattleCommunication[C.SPRITES_INIT_STATE1] = 0;
      gBattleCommunication[C.SPRITES_INIT_STATE2] = 0;
      break;
    case 16: {
      const st = { state1: gBattleCommunication[C.SPRITES_INIT_STATE1], state2: gBattleCommunication[C.SPRITES_INIT_STATE2] };
      const done = BattleInitAllSprites(st);
      gBattleCommunication[C.SPRITES_INIT_STATE1] = st.state1;
      gBattleCommunication[C.SPRITES_INIT_STATE2] = st.state2;
      if (done) {
        battleHost.preBattleCallback1 = gMain.callback1;
        gMain.callback1 = BattleMainCB1;
        SetMainCallback2(BattleMainCB2);
      }
      break;
    }
  }
}

export function BattleMainCB2(): void {
  AnimateSprites();
  BuildOamBuffer();
  RunTextPrinters();
  UpdatePaletteFade();
  tasks.run();
  if (JOY_HELD(B_BUTTON) && G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE) {
    G.gBattleOutcome = C.B_OUTCOME_DREW;
    ResetPaletteFadeControl();
    BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    SetMainCallback2(CB2_QuitPokedudeBattle);
  }
}

function CB2_QuitPokedudeBattle(): void {
  UpdatePaletteFade();
  if (!gPaletteFade.active) {
    FreeRestoreBattleData();
    battleHost.finish(G.gBattleOutcome);
  }
}

export function FreeRestoreBattleData(): void {
  gMain.callback1 = battleHost.preBattleCallback1;
  gMain.inBattle = false;
  ZeroEnemyPartyMons();
  sound.stopSE(C.SE_LOW_HEALTH);
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function nameSum(bytes: Uint8Array): number {
  let n = 0;
  for (let j = 0; j < bytes.length && bytes[j] !== 0xff; j++) n += bytes[j];
  return n;
}

/** CreateNPCTrainerParty */
function CreateNPCTrainerParty(trainerNum: number): number {
  if (trainerNum === C.TRAINER_SECRET_BASE) return 0;
  const trainer = rom.trainers[trainerNum];
  if (!trainer) return 0;
  let nameHash = 0;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER && !(G.gBattleTypeFlags & (C.BATTLE_TYPE_BATTLE_TOWER | C.BATTLE_TYPE_EREADER_TRAINER | C.BATTLE_TYPE_TRAINER_TOWER))) {
    ZeroEnemyPartyMons();
    const trainerName = base64ToBytes(trainer.name);
    trainer.party.forEach((member, i) => {
      let personalityValue: number;
      if (trainer.double) personalityValue = 0x80;
      else if (trainer.female) personalityValue = 0x78;
      else personalityValue = 0x88;
      nameHash = (nameHash + nameSum(trainerName)) >>> 0;
      nameHash = (nameHash + nameSum(base64ToBytes(rom.species[member.species].name))) >>> 0;
      personalityValue = (personalityValue + (nameHash << 8)) >>> 0;
      const fixedIV = Math.trunc((member.iv * C.MAX_PER_STAT_IVS) / 255);
      const mon = gEnemyParty[i];
      CreateMon(mon, member.species, member.level, fixedIV, true, personalityValue, OT_ID_RANDOM_NO_SHINY, 0);
      if (member.item) SetMonData(mon, C.MON_DATA_HELD_ITEM, member.item);
      if (member.moves) {
        for (let j = 0; j < 4; j++) {
          SetMonData(mon, C.MON_DATA_MOVE1 + j, member.moves[j]);
          SetMonData(mon, C.MON_DATA_PP1 + j, rom.moves[member.moves[j]].pp);
        }
      }
    });
    G.gBattleTypeFlags |= trainer.double ? C.BATTLE_TYPE_DOUBLE : 0;
  }
  return trainer.party.length;
}

function VBlankCB_Battle(): void {
  random();
  SetGpuReg(REG_OFFSET_BG0HOFS, G.gBattle_BG0_X);
  SetGpuReg(REG_OFFSET_BG0VOFS, G.gBattle_BG0_Y);
  SetGpuReg(REG_OFFSET_BG1HOFS, G.gBattle_BG1_X);
  SetGpuReg(REG_OFFSET_BG1VOFS, G.gBattle_BG1_Y);
  SetGpuReg(REG_OFFSET_BG2HOFS, G.gBattle_BG2_X);
  SetGpuReg(REG_OFFSET_BG2VOFS, G.gBattle_BG2_Y);
  SetGpuReg(REG_OFFSET_BG3HOFS, G.gBattle_BG3_X);
  SetGpuReg(REG_OFFSET_BG3VOFS, G.gBattle_BG3_Y);
  SetGpuReg(REG_OFFSET_WIN0H, G.gBattle_WIN0H);
  SetGpuReg(REG_OFFSET_WIN0V, G.gBattle_WIN0V);
  SetGpuReg(REG_OFFSET_WIN1H, G.gBattle_WIN1H);
  SetGpuReg(REG_OFFSET_WIN1V, G.gBattle_WIN1V);
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
  ScanlineEffect_InitHBlankDmaTransfer();
}

// ---------------------------------------------------------------- sprite callbacks
// sBattler = data[0], sSpeciesId = data[2]

export function SpriteCB_EnemyMon(sprite: Sprite): void {
  sprite.callback = SpriteCB_MoveWildMonToRight;
  StartSpriteAnimIfDifferent(sprite, 0);
  BeginNormalPaletteFade(0x20000, 0, 10, 10, RGB(8, 8, 8));
}

function SpriteCB_MoveWildMonToRight(sprite: Sprite): void {
  if ((G.gIntroSlideFlags & 1) === 0) {
    sprite.x2 += 2;
    if (sprite.x2 === 0) {
      sprite.callback = SpriteCB_WildMonShowHealthbox;
      sound.playCry(sprite.data[2] & 0xffff, C.CRY_MODE_NORMAL);
    }
  }
}

function SpriteCB_WildMonShowHealthbox(sprite: Sprite): void {
  if (sprite.animEnded) {
    StartHealthboxSlideIn(sprite.data[0]);
    SetHealthboxSpriteVisible(gHealthboxSpriteIds[sprite.data[0]]);
    sprite.callback = SpriteCallbackDummy_2;
    StartSpriteAnimIfDifferent(sprite, 0);
    BeginNormalPaletteFade(0x20000, 0, 10, 0, RGB(8, 8, 8));
  }
}

export function SpriteCallbackDummy_2(_sprite: Sprite): void {}

export function SpriteCB_FaintOpponentMon(sprite: Sprite): void {
  const battler = sprite.data[0];
  const transform = gBattleSpritesDataPtr.battlerData[battler].transformSpecies;
  const species = transform !== 0 ? transform : sprite.data[2] & 0xffff;
  let yOffset: number;
  if (species === C.SPECIES_UNOWN) {
    const personality = gEnemyParty[gBattlerPartyIndexes[battler]].personality;
    const letter = (((personality & 0x03000000) >>> 18) | ((personality & 0x030000) >>> 12) | ((personality & 0x0300) >>> 6) | (personality & 0x03)) % 28;
    const unownSpecies = letter === 0 ? C.SPECIES_UNOWN : C.NUM_SPECIES + letter;
    yOffset = frontPicYOffset(unownSpecies);
  } else if (species === C.SPECIES_CASTFORM) {
    yOffset = castformYOffset(gBattleMonForms[battler]);
  } else if (species > C.NUM_SPECIES) {
    yOffset = frontPicYOffset(C.SPECIES_NONE);
  } else {
    yOffset = frontPicYOffset(species);
  }
  sprite.data[3] = 8 - Math.trunc(yOffset / 8);
  sprite.data[4] = 1;
  sprite.callback = SpriteCB_AnimFaintOpponent;
}

function frontPicYOffset(species: number): number {
  const coords = cdata<Array<{ size: number; y_offset: number }>>("data", "gMonFrontPicCoords");
  return coords[species]?.y_offset ?? 0;
}
function castformYOffset(form: number): number {
  const coords = cdata<Array<{ size: number; y_offset: number }>>("battle_anim_mons", "gCastformFrontSpriteCoords");
  return coords[form]?.y_offset ?? 0;
}

function SpriteCB_AnimFaintOpponent(sprite: Sprite): void {
  if (--sprite.data[4] === 0) {
    sprite.data[4] = 2;
    sprite.y2 += 8;
    if (--sprite.data[3] < 0) {
      FreeSpriteOamMatrix(sprite);
      DestroySprite(sprite);
    } else {
      const battler = sprite.data[0];
      const gfx = gMonSpritesGfxPtr.sprites[GetBattlerPosition(battler)];
      const start = (gBattleMonForms[battler] << 11) + (sprite.data[3] << 8);
      gfx.fill(0, start, start + 0x100);
      StartSpriteAnim(sprite, gBattleMonForms[battler]);
    }
  }
}

export function SpriteCB_ShowAsMoveTarget(sprite: Sprite): void {
  sprite.data[3] = 8;
  sprite.data[4] = sprite.invisible ? 1 : 0;
  sprite.callback = SpriteCB_BlinkVisible;
}

function SpriteCB_BlinkVisible(sprite: Sprite): void {
  if (--sprite.data[3] === 0) {
    sprite.invisible = !sprite.invisible;
    sprite.data[3] = 8;
  }
}

export function SpriteCB_HideAsMoveTarget(sprite: Sprite): void {
  sprite.invisible = sprite.data[4] !== 0;
  sprite.data[4] = 0;
  sprite.callback = SpriteCallbackDummy_2;
}

export function SpriteCB_AllyMon(sprite: Sprite): void {
  sprite.callback = SpriteCB_AllyMonSlide;
}

function SpriteCB_AllyMonSlide(sprite: Sprite): void {
  if (!(G.gIntroSlideFlags & 1)) {
    sprite.x2 -= 2;
    if (sprite.x2 === 0) {
      sprite.callback = SpriteCB_Idle;
      sprite.data[1] = 0;
    }
  }
}

export function SetIdleSpriteCallback(sprite: Sprite): void {
  sprite.callback = SpriteCB_Idle;
}

function SpriteCB_Idle(_sprite: Sprite): void {}

export function SpriteCB_FaintSlideAnim(sprite: Sprite): void {
  if (!(G.gIntroSlideFlags & 1)) {
    sprite.x2 += sprite.data[1];
    sprite.y2 += sprite.data[2];
  }
}

export const BOUNCE_MON = 0;
export const BOUNCE_HEALTHBOX = 1;

export function DoBounceEffect(battler: number, which: number, delta: number, amplitude: number): void {
  const hb = gBattleSpritesDataPtr.healthBoxesData[battler];
  if (which === BOUNCE_MON) {
    if (hb.battlerIsBouncing) return;
  } else if (hb.healthboxIsBouncing) {
    return;
  }
  const invisibleSpriteId = CreateInvisibleSprite(SpriteCB_BounceEffect);
  let bouncerSpriteId: number;
  if (which === BOUNCE_HEALTHBOX) {
    bouncerSpriteId = gHealthboxSpriteIds[battler];
    hb.healthboxBounceSpriteId = invisibleSpriteId;
    hb.healthboxIsBouncing = 1;
    gSprites[invisibleSpriteId].data[0] = 128;
  } else {
    bouncerSpriteId = gBattlerSpriteIds[battler];
    hb.battlerBounceSpriteId = invisibleSpriteId;
    hb.battlerIsBouncing = 1;
    gSprites[invisibleSpriteId].data[0] = 192;
  }
  const s = gSprites[invisibleSpriteId];
  s.data[1] = delta;
  s.data[2] = amplitude;
  s.data[3] = bouncerSpriteId;
  s.data[4] = which;
  gSprites[bouncerSpriteId].x2 = 0;
  gSprites[bouncerSpriteId].y2 = 0;
}

export function EndBounceEffect(battler: number, which: number): void {
  const hb = gBattleSpritesDataPtr.healthBoxesData[battler];
  let bouncerSpriteId: number;
  if (which === BOUNCE_HEALTHBOX) {
    if (!hb.healthboxIsBouncing) return;
    bouncerSpriteId = gSprites[hb.healthboxBounceSpriteId].data[3];
    DestroySprite(gSprites[hb.healthboxBounceSpriteId]);
    hb.healthboxIsBouncing = 0;
  } else {
    if (!hb.battlerIsBouncing) return;
    bouncerSpriteId = gSprites[hb.battlerBounceSpriteId].data[3];
    DestroySprite(gSprites[hb.battlerBounceSpriteId]);
    hb.battlerIsBouncing = 0;
  }
  gSprites[bouncerSpriteId].x2 = 0;
  gSprites[bouncerSpriteId].y2 = 0;
}

function SpriteCB_BounceEffect(sprite: Sprite): void {
  const bouncer = sprite.data[3];
  gSprites[bouncer].y2 = Sin(sprite.data[0], sprite.data[2]) + sprite.data[2];
  sprite.data[0] = (sprite.data[0] + sprite.data[1]) & 0xff;
}

export function SpriteCB_PlayerThrowInit(sprite: Sprite): void {
  StartSpriteAnim(sprite, 1);
  sprite.callback = SpriteCB_PlayerThrowUpdate;
}

export function UpdatePlayerPosInThrowAnim(sprite: Sprite): void {
  if (sprite.animDelayCounter === 0) {
    sprite.centerToCornerVecX = cdata<number[]>("battle_main", "sPlayerThrowXTranslation")[sprite.animCmdIndex];
  }
}

function SpriteCB_PlayerThrowUpdate(sprite: Sprite): void {
  UpdatePlayerPosInThrowAnim(sprite);
  if (sprite.animEnded) sprite.callback = SpriteCB_Idle;
}
