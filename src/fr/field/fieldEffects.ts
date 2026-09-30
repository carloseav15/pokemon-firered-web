// Field effects (field_effect_helpers.c, trainer_see.c emoticons, ground
// effects from event_object_movement.c) plus the step-driven encounter hooks.
// Includes the poison mosaic task from fldeff_poison.c.

import * as MB from "../generated/metatileBehavior";
import * as C from "../generated/constants";
import { ElevationToPriority } from "../generated/eventObjectAnims";
import { sound } from "../audio/sound";
import { Sprite, loadImage } from "../gba/sprite";
import { tasks } from "../gba/tasks";
import { incbin } from "../hw/assets";
import { BeginNormalPaletteFade, BlendPalettes, gPlttBufferUnfaded, OBJ_PLTT_ID, PALETTES_BG, RGB_WHITE, gPaletteFade } from "../hw/palette";
import { DATA_ROOT, rom, type AnimCmd } from "../rom";
import { flagClear, flagGet, save, varGet, varSet } from "../save";
import { actionWalkInPlaceNormal, actionWalkSlower, DIRECTION_VECTORS, DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST, ObjectEventGetLocalIdAndMap, ShiftObjectEventCoords, ShiftStillObjectEventCoords, graphicsInfo, type ObjectEvent } from "./objectEvents";
import type { Overworld } from "./overworld";
import { FieldMoveEffects } from "./fieldMoves";
import { RestartWildEncounterImmunitySteps } from "./wildEncounter";
import { DoPoisonFieldEffect } from "./poison";
import { SafariZoneTakeStep } from "./safariZone";
import { gScanlineEffect, gScanlineEffectRegBuffers, ScanlineEffect_Clear, ScanlineEffect_Stop } from "../hw/scanline";
import { FindTaskIdByFunc } from "../hw/menuHelpers";
import { MAP_OFFSET } from "./fieldmap";
import { spriteSheet } from "./gfx4bpp";
import { QuestLog_CutRecording } from "../questLogEvents";
import { GetGpuReg, SetGpuReg, SetGpuRegBits } from "../hw/gpu";
import {
  DISPCNT_WIN0_ON, DISPCNT_WIN1_ON, DISPLAY_WIDTH, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, REG_OFFSET_DISPCNT,
  REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WIN1H, REG_OFFSET_WIN1V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
  WIN_RANGE, WINOUT_WIN01_BG_ALL, WINOUT_WIN01_CLR, WINOUT_WIN01_OBJ,
} from "../hw/ppu";

type Template = { frames: Array<[string, number, number, number]>; anims: AnimCmd[][]; callback: string | null; size: [number, number] | null };
type FieldFxData = { templates: Record<string, Template>; emoticons: { file: string; width: number; height: number } };

let fxData: FieldFxData | undefined;
let fxPromise: Promise<FieldFxData> | undefined;

export function loadFieldFx(): Promise<FieldFxData> {
  if (!fxPromise) fxPromise = fetch(`${DATA_ROOT}/fieldfx.json`).then((r) => r.json()).then((d: FieldFxData) => {
    fxData = d;
    for (const t of Object.values(d.templates)) for (const f of t.frames) void loadImage(`${DATA_ROOT}/${f[0]}`);
    void loadImage(`${DATA_ROOT}/${d.emoticons.file}`);
    return d;
  });
  return fxPromise;
}

/** gFieldEffectObjectTemplatePointers lookup by name, shared with the disconnected
 * field_effect_helpers.c mirrors in fieldEffectHelpers.ts (dead-code effects with no
 * caller in FRLG, e.g. FldEff_UnusedGrass/FldEff_Sparkle). */
export function fieldFxTemplate(name: string) {
  return fxData?.templates[name];
}

const SHADOW_TEMPLATES: Record<string, string> = { SHADOW_SIZE_S: "ShadowSmall", SHADOW_SIZE_M: "ShadowMedium", SHADOW_SIZE_L: "ShadowLarge", SHADOW_SIZE_XL: "ShadowExtraLarge" };
const SHADOW_OFFSETS: Record<string, number> = { SHADOW_SIZE_S: 4, SHADOW_SIZE_M: 4, SHADOW_SIZE_L: 4, SHADOW_SIZE_XL: 16 };

// Emoticon anims (trainer_see.c): exclamation, double exclamation, X, smile, question.
const EMOTE_ANIMS: AnimCmd[][] = [
  [["F", 0, 4, 0, 0], ["F", 1, 4, 0, 0], ["F", 2, 52, 0, 0], ["E"]],
  [["F", 6, 4, 0, 0], ["F", 7, 4, 0, 0], ["F", 8, 52, 0, 0], ["E"]],
  [["F", 3, 4, 0, 0], ["F", 4, 4, 0, 0], ["F", 5, 52, 0, 0], ["E"]],
  [["F", 9, 4, 0, 0], ["F", 10, 4, 0, 0], ["F", 11, 52, 0, 0], ["E"]],
  [["F", 12, 4, 0, 0], ["F", 13, 4, 0, 0], ["F", 14, 52, 0, 0], ["E"]],
];
// MOVEMENT_ACTION_EMOTE_* order: exclamation, question, X, double exclamation, smile
const EMOTE_FROM_ACTION = [0, 4, 2, 1, 3];
const EMOTE_EFFECT_IDS: number[] = [C.FLDEFF_EXCLAMATION_MARK_ICON, C.FLDEFF_QUESTION_MARK_ICON, C.FLDEFF_X_ICON, C.FLDEFF_DOUBLE_EXCL_MARK_ICON, C.FLDEFF_SMILEY_FACE_ICON];

export const FLASH_LEVEL_TO_RADIUS = [200, 72, 56, 40, 24];
export const MAX_FLASH_LEVEL = FLASH_LEVEL_TO_RADIUS.length - 1;

/** SetFlashScanlineEffectWindowBoundaries / SetFlashScanlineEffectWindowBoundary from field_screen_effect.c. */
function SetFlashScanlineEffectWindowBoundary(dest: Uint16Array, y: number, left: number, right: number): void {
  if (y < 0 || y > 160) return;
  left = Math.max(0, Math.min(255, left));
  right = Math.max(0, Math.min(255, right));
  dest[y] = (left << 8) | right;
}

export function SetFlashScanlineEffectWindowBoundaries(dest: Uint16Array, centerX: number, centerY: number, radius: number): void {
  let xy = radius;
  let error = radius;
  let yx = 0;
  while (xy >= yx) {
    SetFlashScanlineEffectWindowBoundary(dest, centerY - yx, centerX - xy, centerX + xy);
    SetFlashScanlineEffectWindowBoundary(dest, centerY + yx, centerX - xy, centerX + xy);
    SetFlashScanlineEffectWindowBoundary(dest, centerY - xy, centerX - yx, centerX + yx);
    SetFlashScanlineEffectWindowBoundary(dest, centerY + xy, centerX - yx, centerX + yx);
    error -= (yx * 2) - 1;
    yx++;
    if (error < 0) {
      error += 2 * (xy - 1);
      xy--;
    }
  }
}

/** WriteFlashScanlineEffectBuffer from field_screen_effect.c. */
export function WriteFlashScanlineEffectBuffer(flashLevel: number): void {
  if (flashLevel) {
    SetFlashScanlineEffectWindowBoundaries(gScanlineEffectRegBuffers[0], 120, 80, FLASH_LEVEL_TO_RADIUS[flashLevel] ?? FLASH_LEVEL_TO_RADIUS[MAX_FLASH_LEVEL]);
    gScanlineEffectRegBuffers[1].set(gScanlineEffectRegBuffers[0]);
  }
}

function flashWindowBoundaries(centerX: number, centerY: number, radius: number): Uint16Array {
  const dest = new Uint16Array(0x3c0);
  SetFlashScanlineEffectWindowBoundaries(dest, centerX, centerY, radius);
  return dest;
}

const BARN_WIPE_IN = 0;
const BARN_WIPE_OUT = 1;

/** BarnDoorWipeSaveGpuRegs from field_screen_effect.c. */
export function BarnDoorWipeSaveGpuRegs(taskId: number): void {
  const d = tasks.data(taskId);
  d[0] = GetGpuReg(REG_OFFSET_DISPCNT);
  d[1] = GetGpuReg(REG_OFFSET_WININ);
  d[2] = GetGpuReg(REG_OFFSET_WINOUT);
  d[3] = GetGpuReg(REG_OFFSET_BLDCNT);
  d[4] = GetGpuReg(REG_OFFSET_BLDALPHA);
  d[5] = GetGpuReg(REG_OFFSET_WIN0H);
  d[6] = GetGpuReg(REG_OFFSET_WIN0V);
  d[7] = GetGpuReg(REG_OFFSET_WIN1H);
  d[8] = GetGpuReg(REG_OFFSET_WIN1V);
}

/** BarnDoorWipeLoadGpuRegs from field_screen_effect.c. */
export function BarnDoorWipeLoadGpuRegs(taskId: number): void {
  const d = tasks.data(taskId);
  SetGpuReg(REG_OFFSET_DISPCNT, d[0]);
  SetGpuReg(REG_OFFSET_WININ, d[1]);
  SetGpuReg(REG_OFFSET_WINOUT, d[2]);
  SetGpuReg(REG_OFFSET_BLDCNT, d[3]);
  SetGpuReg(REG_OFFSET_BLDALPHA, d[4]);
  SetGpuReg(REG_OFFSET_WIN0H, d[5]);
  SetGpuReg(REG_OFFSET_WIN0V, d[6]);
  SetGpuReg(REG_OFFSET_WIN1H, d[7]);
  SetGpuReg(REG_OFFSET_WIN1V, d[8]);
}

/** Task_BarnDoorWipe from field_screen_effect.c. */
export function Task_BarnDoorWipe(taskId: number): void {
  const d = tasks.data(taskId);
  switch (d[9]) {
    case 0:
      BarnDoorWipeSaveGpuRegs(taskId);
      SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON | DISPCNT_WIN1_ON);
      if (d[10] === BARN_WIPE_IN) {
        SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, 0));
        SetGpuReg(REG_OFFSET_WIN1H, WIN_RANGE(DISPLAY_WIDTH, 255));
      } else {
        SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, DISPLAY_WIDTH / 2));
        SetGpuReg(REG_OFFSET_WIN1H, WIN_RANGE(DISPLAY_WIDTH / 2, 255));
      }
      SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(0, 255));
      SetGpuReg(REG_OFFSET_WIN1V, WIN_RANGE(0, 255));
      SetGpuReg(REG_OFFSET_WININ, 0);
      SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG_ALL | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR);
      d[9] = 1;
      break;
    case 1:
      tasks.create(Task_BarnDoorWipeChild, 80);
      d[9] = 2;
      break;
    case 2:
      if (!tasks.isActive(Task_BarnDoorWipeChild)) d[9] = 3;
      break;
    case 3:
      BarnDoorWipeLoadGpuRegs(taskId);
      tasks.destroy(taskId);
      break;
  }
}

/** Task_BarnDoorWipeChild from field_screen_effect.c. */
export function Task_BarnDoorWipeChild(taskId: number): void {
  const d = tasks.data(taskId);
  const parentId = FindTaskIdByFunc(Task_BarnDoorWipe);
  if (parentId >= tasks.tasks.length) { tasks.destroy(taskId); return; }
  const direction = tasks.data(parentId)[10];
  let lhs: number, rhs: number;
  if (direction === BARN_WIPE_IN) {
    lhs = d[0];
    rhs = DISPLAY_WIDTH - d[0];
    if (lhs > DISPLAY_WIDTH / 2) { tasks.destroy(taskId); return; }
  } else {
    lhs = DISPLAY_WIDTH / 2 - d[0];
    rhs = DISPLAY_WIDTH / 2 + d[0];
    if (lhs < 0) { tasks.destroy(taskId); return; }
  }
  SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, lhs));
  SetGpuReg(REG_OFFSET_WIN1H, WIN_RANGE(rhs, DISPLAY_WIDTH));
  d[0] += lhs < 90 ? 4 : 2;
}

function startBarnDoorWipe(direction: number): void {
  const taskId = tasks.create(Task_BarnDoorWipe, 80);
  tasks.data(taskId)[10] = direction;
}

/** DoInwardBarnDoorFade from field_screen_effect.c. */
export function DoInwardBarnDoorFade(): void { startBarnDoorWipe(BARN_WIPE_IN); }

/** DoOutwardBarnDoorWipe from field_screen_effect.c. */
export function DoOutwardBarnDoorWipe(): void { startBarnDoorWipe(BARN_WIPE_OUT); }

export class FieldEffects {
  readonly tasks = tasks;
  private surfBlob?: Sprite;
  private flowingWaterEffects = new WeakMap<ObjectEvent, Sprite>();
  private shadowEffects = new WeakMap<ObjectEvent, Sprite>();
  private shadowSprites = new Set<Sprite>();
  private tallGrassSprites = new Set<Sprite>();
  private longGrassSprites = new Set<Sprite>();
  private tracksSprites = new Set<Sprite>();
  private shortGrassEffects = new WeakMap<ObjectEvent, Sprite>();
  private hotSpringsEffects = new WeakMap<ObjectEvent, Sprite>();
  private sandPileEffects = new WeakMap<ObjectEvent, Sprite>();
  private sandPileSprites = new Set<Sprite>();
  private encounterImmunitySteps = 0;
  private previousMetatileBehavior = 0;
  /** Active field effect ids (FieldEffectActiveListContains) */
  readonly active = new Set<number>();
  private readonly emoteCounts = new Map<number, number>();
  private readonly disguiseSprites = new WeakMap<ObjectEvent, Sprite>();
  private readonly disguiseSpriteSet = new Set<Sprite>();
  private readonly reflectionSprites = new Map<ObjectEvent, Sprite>();
  private readonly deoxysRockObjects = new Map<number, ObjectEvent>();
  private readonly deoxysDestroyObjects = new Map<number, ObjectEvent>();
  /** Registered handlers for FLDEFF_* ids (field moves, etc.) */
  readonly handlers = new Map<number, () => void>();
  poisonMosaicValue = 0;
  private poisonEffectTaskActive = false;
  /** tCurFlashRadius while UpdateFlashLevelEffect runs. */
  flashRadius: number | null = null;
  private flashUpdateTaskId = -1;
  private flashWaitTaskId = -1;
  private flashWaitCallback?: () => void;

  /** AnimateFlash: the radius steps by 2 every other frame, then the script resumes. */
  animateFlash(newLevel: number, onDone: () => void): void {
    const from = FLASH_LEVEL_TO_RADIUS[Math.min(this.ow.flashLevel, MAX_FLASH_LEVEL)];
    const to = FLASH_LEVEL_TO_RADIUS[Math.min(newLevel, MAX_FLASH_LEVEL)];
    this.flashWaitCallback = onDone;
    this.StartUpdateFlashLevelEffect(120, 80, from, to, newLevel === 0, 2);
    this.StartWaitForFlashUpdate();
    this.ow.controlsLocked = true;
  }

  /** StartUpdateFlashLevelEffect from field_screen_effect.c. */
  StartUpdateFlashLevelEffect(centerX: number, centerY: number, initialFlashRadius: number, destFlashRadius: number, clearScanlineEffect: boolean, delta: number): number {
    const taskId = tasks.create((id) => this.UpdateFlashLevelEffect(id), 80);
    const d = tasks.data(taskId);
    d[1] = centerX; d[2] = centerY; d[3] = initialFlashRadius; d[4] = destFlashRadius;
    d[5] = initialFlashRadius < destFlashRadius ? delta : -delta;
    d[6] = clearScanlineEffect ? 1 : 0;
    this.flashUpdateTaskId = taskId;
    this.flashRadius = initialFlashRadius;
    return taskId;
  }

  /** UpdateFlashLevelEffect from field_screen_effect.c, on the existing frame task runner. */
  UpdateFlashLevelEffect(taskId: number): void {
    const d = tasks.data(taskId);
    switch (d[0]) {
      case 0:
        SetFlashScanlineEffectWindowBoundaries(gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer], d[1], d[2], d[3]);
        this.flashRadius = d[3];
        d[0] = 1;
        break;
      case 1: {
        SetFlashScanlineEffectWindowBoundaries(gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer], d[1], d[2], d[3]);
        this.flashRadius = d[3];
        d[0] = 0;
        d[3] += d[5];
        const crossed = d[5] > 0 ? d[3] > d[4] : d[3] < d[4];
        if (crossed) {
          this.ow.flashLevel = FLASH_LEVEL_TO_RADIUS.indexOf(d[4]);
          if (d[6]) {
            this.flashRadius = null;
            ScanlineEffect_Stop();
            d[0] = 2;
          } else {
            tasks.destroy(taskId);
            this.flashUpdateTaskId = -1;
          }
        }
        break;
      }
      case 2:
        ScanlineEffect_Clear();
        tasks.destroy(taskId);
        this.flashUpdateTaskId = -1;
        break;
    }
  }

  /** Task_WaitForFlashUpdate from field_screen_effect.c. */
  Task_WaitForFlashUpdate(taskId: number): void {
    if (this.flashUpdateTaskId >= 0 && tasks.tasks[this.flashUpdateTaskId].isActive) return;
    tasks.destroy(taskId);
    this.flashWaitTaskId = -1;
    const callback = this.flashWaitCallback;
    this.flashWaitCallback = undefined;
    callback?.();
  }

  /** StartWaitForFlashUpdate from field_screen_effect.c. */
  StartWaitForFlashUpdate(): void {
    if (this.flashWaitTaskId >= 0 && tasks.tasks[this.flashWaitTaskId].isActive) return;
    this.flashWaitTaskId = tasks.create((id) => this.Task_WaitForFlashUpdate(id), 80);
  }
  readonly moves: FieldMoveEffects;

  constructor(private readonly ow: Overworld) {
    void loadFieldFx();
    this.moves = new FieldMoveEffects(ow);
  }

  /** FldEffPoison_Start. */
  FldEffPoison_Start(): void {
    sound.playSE(C.SE_FIELD_POISON);
    this.poisonEffectTaskActive = true;
    tasks.create((taskId) => this.Task_FieldPoisonEffect(taskId), 80);
  }

  /** Task_FieldPoisonEffect; task data[0..1] carries state and mosaic value. */
  private Task_FieldPoisonEffect(taskId: number): void {
    const data = tasks.data(taskId);
    switch (data[0]) {
      case 0:
        data[1] += C.REVISION >= 0xA ? 2 : 1;
        if (data[1] > 4) data[0]++;
        break;
      case 1:
        data[1]--;
        if (data[1] === 0) data[0]++;
        break;
      case 2:
        this.poisonMosaicValue = 0;
        this.poisonEffectTaskActive = false;
        tasks.destroy(taskId);
        return;
    }
    this.poisonMosaicValue = data[1];
  }

  /** FldEffPoison_IsActive. */
  FldEffPoison_IsActive(): boolean { return this.poisonEffectTaskActive; }

  /** FieldEffectActiveListClear (field_effect.c). */
  FieldEffectActiveListClear(): void { this.active.clear(); }

  /** FieldEffectActiveListAdd (field_effect.c). */
  FieldEffectActiveListAdd(fldeff: number): void { this.active.add(fldeff); }

  /** FieldEffectActiveListRemove (field_effect.c). */
  FieldEffectActiveListRemove(fldeff: number): void { this.active.delete(fldeff); }

  /** FieldEffectActiveListContains (field_effect.c). */
  FieldEffectActiveListContains(fldeff: number): boolean { return this.active.has(fldeff); }

  /** FieldEffectStop (field_effect.c): frees the sprite (DestroySprite); this port's Sprite has no
   * shared VRAM tile/palette pool to also free, unlike FieldEffectFreeGraphicsResources's
   * FieldEffectFreeTilesIfUnused/FieldEffectFreePaletteIfUnused (each sprite owns its own image
   * reference, and the browser's image cache handles sharing). */
  FieldEffectStop(sprite: Sprite, fldeff: number): void {
    this.ow.sprites.destroy(sprite);
    this.active.delete(fldeff);
  }

  /** FieldEffectStart: marks the effect active and runs its script. */
  start(id: number): void {
    this.FieldEffectActiveListAdd(id);
    const handler = this.handlers.get(id);
    if (handler) { handler(); return; }
    if (id === C.FLDEFF_TALL_GRASS) { this.FldEff_TallGrass(); return; }
    if (id === C.FLDEFF_JUMP_TALL_GRASS) { this.FldEff_JumpTallGrass(); return; }
    if (id === C.FLDEFF_LONG_GRASS) { this.FldEff_LongGrass(); return; }
    if (id === C.FLDEFF_JUMP_LONG_GRASS) { this.FldEff_JumpLongGrass(); return; }
    if (id === C.FLDEFF_SAND_FOOTPRINTS) { this.FldEff_SandFootprints(); return; }
    if (id === C.FLDEFF_DEEP_SAND_FOOTPRINTS) { this.FldEff_DeepSandFootprints(); return; }
    if (id === C.FLDEFF_BIKE_TIRE_TRACKS) { this.FldEff_BikeTireTracks(); return; }
    if (id === C.FLDEFF_SAND_PILE) { this.FldEff_SandPile(); return; }
    if (id === C.FLDEFF_MOVE_DEOXYS_ROCK) { this.FldEff_MoveDeoxysRock(); return; }
    if (id === C.FLDEFF_DESTROY_DEOXYS_ROCK) { this.FldEff_DestroyDeoxysRock(); return; }
    if (this.moves.start(id)) return;
    if (!this.startIcon(id)) this.active.delete(id);
  }

  /** FldEff_MoveDeoxysRock / Task_MoveDeoxysRock_Step from field_effect.c. */
  private FldEff_MoveDeoxysRock(): void {
    const args = this.ow.game.fieldEffectArguments;
    const object = this.ow.objects.byLocalIdAndMap(args[0]! & 0xff, args[1]! & 0xff, args[2]! & 0xff);
    if (!object) return;
    const dx = (args[3]! - (object.currentCoords.x - MAP_OFFSET)) * 16;
    const dy = (args[4]! - (object.currentCoords.y - MAP_OFFSET)) * 16;
    ShiftObjectEventCoords(object, args[3]! + MAP_OFFSET, args[4]! + MAP_OFFSET);
    const taskId = tasks.create((id) => this.Task_MoveDeoxysRock_Step(id), 0x50);
    const data = tasks.data(taskId);
    data[1] = this.ow.sprites.getId(object.sprite);
    data[2] = ((object.sprite.x + dx) << 16) >> 16;
    data[3] = ((object.sprite.y + dy) << 16) >> 16;
    data[8] = (args[5]! << 16) >> 16;
    data[9] = (this.ow.objects.indexOf(object) << 16) >> 16;
    this.deoxysRockObjects.set(taskId, object);
  }

  private Task_MoveDeoxysRock_Step(taskId: number): void {
    const data = tasks.data(taskId);
    const object = this.deoxysRockObjects.get(taskId);
    if (!object) { this.active.delete(C.FLDEFF_MOVE_DEOXYS_ROCK); tasks.destroy(taskId); return; }
    const sprite = object.sprite;
    if (data[0] === 0) {
      data[4] = (sprite.x << 4 << 16) >> 16;
      data[5] = (sprite.y << 4 << 16) >> 16;
      const frames = data[8]!;
      data[6] = frames !== 0 ? ((((data[2]! << 4) - data[4]!) / frames) << 16) >> 16 : 0;
      data[7] = frames !== 0 ? ((((data[3]! << 4) - data[5]!) / frames) << 16) >> 16 : 0;
      data[0] = 1;
    }
    if (data[8] !== 0) {
      data[8] = (data[8]! - 1 << 16) >> 16;
      data[4] = (data[4]! + data[6]! << 16) >> 16;
      data[5] = (data[5]! + data[7]! << 16) >> 16;
      sprite.x = data[4]! >> 4;
      sprite.y = data[5]! >> 4;
    } else {
      sprite.x = data[2]!;
      sprite.y = data[3]!;
      ShiftStillObjectEventCoords(object);
      object.triggerGroundEffectsOnStop = true;
      this.active.delete(C.FLDEFF_MOVE_DEOXYS_ROCK);
      this.deoxysRockObjects.delete(taskId);
      tasks.destroy(taskId);
    }
  }

  /** FldEff_DestroyDeoxysRock (field_effect.c). */
  FldEff_DestroyDeoxysRock(): void {
    const args = this.ow.game.fieldEffectArguments;
    const object = this.ow.objects.byLocalIdAndMap(args[0]! & 0xff, args[1]! & 0xff, args[2]! & 0xff);
    if (!object) { this.active.delete(C.FLDEFF_DESTROY_DEOXYS_ROCK); return; }
    const taskId = tasks.create((id) => this.Task_DestroyDeoxysRock(id), 80);
    const data = tasks.data(taskId);
    data[2] = (this.ow.objects.indexOf(object) << 16) >> 16;
    data[6] = args[0]! & 0xff;
    data[7] = args[1]! & 0xff;
    data[8] = args[2]! & 0xff;
    this.deoxysDestroyObjects.set(taskId, object);
  }

  /** Task_DeoxysRockCameraShake (field_effect.c). */
  Task_DeoxysRockCameraShake(taskId: number): void {
    const data = tasks.data(taskId);
    if (data[7] !== 0) {
      data[6]++;
      if (data[6]! > 20) {
        data[6] = 0;
        if (data[5] !== 0) data[5]--;
      }
    } else data[5] = 4;
    data[0]++;
    if (data[0]! > 1) {
      data[0] = 0;
      data[1]++;
      this.ow.SetCameraPanning(0, data[1]! & 1 ? -data[5]! : data[5]!);
    }
    this.ow.UpdateCameraPanning();
    if (data[5] === 0) tasks.destroy(taskId);
  }

  /** StartEndingDeoxysRockCameraShake (field_effect.c). */
  StartEndingDeoxysRockCameraShake(taskId: number): void { tasks.data(taskId)[7] = 1; }

  /** Task_DestroyDeoxysRock / DestroyDeoxysRockEffect_* (field_effect.c). */
  Task_DestroyDeoxysRock(taskId: number): void {
    const data = tasks.data(taskId);
    this.ow.InstallCameraPanAheadCallback();
    this.ow.SetCameraPanningCallback(null);
    switch (data[1]) {
      case 0: this.DestroyDeoxysRockEffect_CameraShake(data, taskId); break;
      case 1: this.DestroyDeoxysRockEffect_RockFragments(data, taskId); break;
      case 2: this.DestroyDeoxysRockEffect_WaitAndEnd(data, taskId); break;
    }
  }

  DestroyDeoxysRockEffect_CameraShake(data: number[], taskId: number): void {
    const cameraTaskId = tasks.create((id) => this.Task_DeoxysRockCameraShake(id), 90);
    sound.playSE(C.SE_THUNDER2);
    data[5] = cameraTaskId;
    data[1]++;
  }

  DestroyDeoxysRockEffect_RockFragments(data: number[], taskId: number): void {
    if (++data[3]! <= 120) return;
    const object = this.deoxysDestroyObjects.get(taskId);
    if (!object) { this.active.delete(C.FLDEFF_DESTROY_DEOXYS_ROCK); tasks.destroy(taskId); return; }
    object.invisible = true;
    BlendPalettes(PALETTES_BG, 0x10, RGB_WHITE);
    BeginNormalPaletteFade(PALETTES_BG, 0, 0x10, 0, RGB_WHITE);
    this.CreateDeoxysRockFragments(object.sprite);
    sound.playSE(C.SE_THUNDER);
    this.StartEndingDeoxysRockCameraShake(data[5]!);
    data[3] = 0;
    data[1]++;
  }

  DestroyDeoxysRockEffect_WaitAndEnd(data: number[], taskId: number): void {
    const cameraTaskId = data[5]!;
    if (gPaletteFade.active || tasks.tasks[cameraTaskId]?.isActive) return;
    this.ow.InstallCameraPanAheadCallback();
    this.ow.objects.remove(this.deoxysDestroyObjects.get(taskId));
    this.deoxysDestroyObjects.delete(taskId);
    this.active.delete(C.FLDEFF_DESTROY_DEOXYS_ROCK);
    tasks.destroy(taskId);
  }

  /** CreateDeoxysRockFragments (field_effect.c); each fragment uses its exported C INCBIN. */
  CreateDeoxysRockFragments(source: Sprite): void {
    const fragments = ["sRockFragment_TopLeft", "sRockFragment_TopRight", "sRockFragment_BottomLeft", "sRockFragment_BottomRight"];
    const paletteStart = OBJ_PLTT_ID(10);
    const palette = gPlttBufferUnfaded.subarray(paletteStart, paletteStart + 16);
    for (let i = 0; i < fragments.length; i++) {
      const image = spriteSheet(incbin(fragments[i]!), palette, 8, 8);
      const sprite = new Sprite();
      sprite.width = sprite.height = 8;
      sprite.centerToCornerVecX = sprite.centerToCornerVecY = -4;
      sprite.x = source.x + source.x2;
      sprite.y = source.y + source.y2 - 4;
      sprite.coordOffsetEnabled = source.coordOffsetEnabled;
      sprite.priority = 0;
      sprite.data[0] = i;
      sprite.draw = (ctx, x, y) => ctx.drawImage(image, x, y);
      sprite.callback = (s) => this.SpriteCB_DeoxysRockFragment(s);
      this.ow.sprites.add(sprite);
    }
  }

  /** SpriteCB_DeoxysRockFragment (field_effect.c). */
  SpriteCB_DeoxysRockFragment(sprite: Sprite): void {
    switch (sprite.data[0]) {
      case 0: sprite.x -= 16; sprite.y -= 12; break;
      case 1: sprite.x += 16; sprite.y -= 12; break;
      case 2: sprite.x -= 16; sprite.y += 12; break;
      case 3: sprite.x += 16; sprite.y += 12; break;
    }
    const x = sprite.x + sprite.x2 + (sprite.coordOffsetEnabled ? this.ow.sprites.offsetX : 0);
    const y = sprite.y + sprite.y2 + (sprite.coordOffsetEnabled ? this.ow.sprites.offsetY : 0);
    if (x < -4 || x > 244 || y < -4 || y > 164) this.ow.sprites.destroy(sprite);
  }

  /** MovementAction_Emote* and trainer_see.c copy the object identity to field-effect arguments before dispatch. */
  startEmoteForObjectEvent(object: ObjectEvent, actionIndex: number): void {
    const id = EMOTE_EFFECT_IDS[actionIndex];
    if (id === undefined) return;
    ObjectEventGetLocalIdAndMap(object, this.ow.game.fieldEffectArguments);
    this.start(id);
  }

  /** FldEff_*MarkIcon / X / smiley: emote over gFieldEffectArguments[0..2] (localId, mapNum, mapGroup). */
  private startIcon(id: number): boolean {
    const actionIndex = EMOTE_EFFECT_IDS.indexOf(id);
    if (actionIndex === -1) return false;
    const args = this.ow.game.fieldEffectArguments;
    const object = this.ow.objects.byLocalIdAndMap(args[0], args[1] & 0xff, args[2] & 0xff);
    if (!object || !fxData) {
      if (!this.emoteCounts.has(id)) this.active.delete(id);
      return true;
    }
    switch (id) {
      case C.FLDEFF_EXCLAMATION_MARK_ICON: this.FldEff_ExclamationMarkIcon1(object); break;
      case C.FLDEFF_DOUBLE_EXCL_MARK_ICON: this.FldEff_DoubleExclMarkIcon(object); break;
      case C.FLDEFF_X_ICON: this.FldEff_XIcon(object); break;
      case C.FLDEFF_SMILEY_FACE_ICON: this.FldEff_SmileyFaceIcon(object); break;
      case C.FLDEFF_QUESTION_MARK_ICON: this.FldEff_QuestionMarkIcon(object); break;
    }
    return true;
  }

  renderOverlays(ctx: CanvasRenderingContext2D): void {
    this.moves.render(ctx);
    this.ow.game.weather.renderFog(ctx, this.ow.camX);
  }

  reset(): void {
    for (const sprite of this.reflectionSprites.values()) this.ow.sprites.destroy(sprite);
    this.reflectionSprites.clear();
    for (const sprite of this.disguiseSpriteSet) this.ow.sprites.destroy(sprite);
    this.disguiseSpriteSet.clear();
    const surfPlayer = this.surfBlob ? this.ow.objects.objects[this.surfBlob.data[2]! & 0xff] : undefined;
    if (surfPlayer && surfPlayer.fieldEffectSprite === this.surfBlob) surfPlayer.fieldEffectSprite = undefined;
    this.surfBlob = undefined;
    this.flowingWaterEffects = new WeakMap<ObjectEvent, Sprite>();
    this.shadowEffects = new WeakMap<ObjectEvent, Sprite>();
    this.shadowSprites.clear();
    this.tallGrassSprites.clear();
    this.longGrassSprites.clear();
    this.tracksSprites.clear();
    this.shortGrassEffects = new WeakMap<ObjectEvent, Sprite>();
    this.hotSpringsEffects = new WeakMap<ObjectEvent, Sprite>();
    this.sandPileEffects = new WeakMap<ObjectEvent, Sprite>();
    this.sandPileSprites.clear();
    this.poisonMosaicValue = 0;
    this.poisonEffectTaskActive = false;
    this.active.clear();
    this.emoteCounts.clear();
  }

  shift(_dx: number, _dy: number): void {
    // Field effect sprites are positioned in world pixels and follow objects;
    // static effects (grass) are re-created on the next step.
    for (const s of this.ow.sprites.sprites) {
      const d = s as unknown as { fxTile?: boolean };
      if (d.fxTile) { s.x -= _dx * 16; s.y -= _dy * 16; s.data[1] -= _dx; s.data[2] -= _dy; }
    }
  }

  createFromTemplate(name: string, x: number, y: number, atEnd = false): Sprite | undefined {
    const template = fxData?.templates[name];
    if (!template) return undefined;
    const sprite = new Sprite();
    sprite.frameImages = template.frames.map(([file, index, w, h]) => ({ url: `${DATA_ROOT}/${file}`, index, width: w, height: h }));
    sprite.anims = template.anims.length ? template.anims : [[["F", 0, 1, 0, 0], ["E"]]];
    const [w, h] = template.size ?? [template.frames[0]?.[2] ?? 16, template.frames[0]?.[3] ?? 16];
    sprite.width = w;
    sprite.height = h;
    sprite.centerToCornerVecX = -(w >> 1);
    sprite.centerToCornerVecY = -(h >> 1);
    sprite.x = x;
    sprite.y = y;
    sprite.startAnim(0);
    if (atEnd) this.ow.sprites.addAtEnd(sprite);
    else this.ow.sprites.add(sprite);
    return sprite;
  }

  /** ShowTreeDisguiseFieldEffect / ShowMountainDisguiseFieldEffect. */
  StartDisguiseFieldEffect(object: ObjectEvent, kind: "tree" | "mountain"): void {
    const id = kind === "tree" ? C.FLDEFF_TREE_DISGUISE : C.FLDEFF_MOUNTAIN_DISGUISE;
    const args = this.ow.game.fieldEffectArguments;
    args[0] = object.localId & 0xff;
    args[1] = object.mapNum & 0xff;
    args[2] = object.mapGroup & 0xff;
    const spriteId = kind === "tree" ? this.ShowTreeDisguiseFieldEffect() : this.ShowMountainDisguiseFieldEffect();
    object.fieldEffectSprite = this.ow.sprites.getById(spriteId);
  }

  /** ShowTreeDisguiseFieldEffect (field_effect_helpers.c). */
  ShowTreeDisguiseFieldEffect(): number {
    return this.ShowDisguiseFieldEffect(C.FLDEFF_TREE_DISGUISE, C.FLDEFFOBJ_TREE_DISGUISE, 4);
  }

  /** ShowMountainDisguiseFieldEffect (field_effect_helpers.c). */
  ShowMountainDisguiseFieldEffect(): number {
    return this.ShowDisguiseFieldEffect(C.FLDEFF_MOUNTAIN_DISGUISE, C.FLDEFFOBJ_MOUNTAIN_DISGUISE, 3);
  }

  /** ShowSandDisguiseFieldEffect (field_effect_helpers.c). */
  ShowSandDisguiseFieldEffect(): number {
    return this.ShowDisguiseFieldEffect(C.FLDEFF_SAND_DISGUISE, C.FLDEFFOBJ_SAND_DISGUISE, 2);
  }

  /** ShowDisguiseFieldEffect (field_effect_helpers.c). */
  ShowDisguiseFieldEffect(fieldEffectId: number, templateId: number, _paletteNum: number): number {
    const args = this.ow.game.fieldEffectArguments;
    const object = this.ow.objects.byLocalIdAndMap(args[0]! & 0xff, args[1]! & 0xff, args[2]! & 0xff);
    if (!object) {
      this.active.delete(fieldEffectId);
      return C.MAX_SPRITES;
    }
    const template = templateId === C.FLDEFFOBJ_TREE_DISGUISE ? "TreeDisguise"
      : templateId === C.FLDEFFOBJ_MOUNTAIN_DISGUISE ? "MountainDisguise" : "SandDisguisePlaceholder";
    const sprite = this.createFromTemplate(template, 0, 0, true);
    if (!sprite) return C.MAX_SPRITES;
    sprite.coordOffsetEnabled = true;
    sprite.data[1] = fieldEffectId;
    sprite.data[2] = args[0]! & 0xff;
    sprite.data[3] = args[1]! & 0xff;
    sprite.data[4] = args[2]! & 0xff;
    sprite.callback = (s) => this.UpdateDisguiseFieldEffect(s);
    this.disguiseSprites.set(object, sprite);
    this.disguiseSpriteSet.add(sprite);
    this.active.add(fieldEffectId);
    return this.ow.sprites.getId(sprite);
  }

  /** UpdateDisguiseFieldEffect (field_effect_helpers.c). */
  UpdateDisguiseFieldEffect(sprite: Sprite): void {
    const object = this.ow.objects.byLocalIdAndMap(sprite.data[2]! & 0xff, sprite.data[3]! & 0xff, sprite.data[4]! & 0xff);
    if (!object) {
      this.stopDisguiseFieldEffect(sprite);
      return;
    }
    const linkedSprite = object.sprite;
    const height = graphicsInfo(object.graphicsId).height;
    sprite.invisible = linkedSprite.invisible;
    sprite.x = linkedSprite.x;
    sprite.y = (height >> 1) + linkedSprite.y - 16;
    sprite.subpriority = (linkedSprite.subpriority - 1) & 0xff;
    if (sprite.data[0] === 1) {
      sprite.data[0]++;
      sprite.startAnim(1);
    }
    if (sprite.data[0] === 2 && sprite.animEnded) sprite.data[7] = 1;
    if (sprite.data[0] === 3) this.stopDisguiseFieldEffect(sprite);
  }

  private stopDisguiseFieldEffect(sprite: Sprite): void {
    const object = this.ow.objects.byLocalIdAndMap(sprite.data[2]! & 0xff, sprite.data[3]! & 0xff, sprite.data[4]! & 0xff);
    this.ow.sprites.destroy(sprite);
    this.disguiseSpriteSet.delete(sprite);
    if (object && this.disguiseSprites.get(object) === sprite) {
      this.disguiseSprites.delete(object);
      if (object.fieldEffectSprite === sprite) object.fieldEffectSprite = undefined;
    }
    const fieldEffectId = sprite.data[1]! & 0xff;
    if (![...this.disguiseSpriteSet].some((s) => s.data[1] === fieldEffectId)) this.active.delete(fieldEffectId);
  }

  /** StartRevealDisguise (field_effect_helpers.c). */
  StartRevealDisguise(object: ObjectEvent): void {
    if (object.directionSequenceIndex === 1) {
      const sprite = object.fieldEffectSprite;
      if (sprite) sprite.data[0] = (sprite.data[0]! + 1) << 16 >> 16;
    }
  }

  /** UpdateRevealDisguise (field_effect_helpers.c). */
  UpdateRevealDisguise(object: ObjectEvent): boolean {
    if (object.directionSequenceIndex === 2 || object.directionSequenceIndex === 0) return true;
    const sprite = object.fieldEffectSprite;
    if (sprite?.data[7]) {
      object.directionSequenceIndex = 2;
      sprite.data[0] = (sprite.data[0]! + 1) << 16 >> 16;
      return true;
    }
    return false;
  }

  /** StartAshFieldEffect / FldEff_Ash. */
  StartAshFieldEffect(x: number, y: number, metatileId: number, delay: number): void {
    this.FldEff_Ash(x, y, metatileId, delay);
  }

  /** FldEff_Ash; the web port passes the C field-effect arguments directly. */
  FldEff_Ash(x: number, y: number, metatileId: number, delay: number): void {
    const sprite = this.createFromTemplate("Ash", x * 16 + 8, y * 16 + 8);
    if (!sprite) return;
    (sprite as unknown as { fxTile: boolean }).fxTile = true;
    sprite.priority = 1;
    sprite.subpriority = 0x52;
    sprite.data[0] = 0;
    sprite.data[1] = (x << 16) >> 16;
    sprite.data[2] = (y << 16) >> 16;
    sprite.data[3] = metatileId & 0xffff;
    sprite.data[4] = (delay << 16) >> 16;
    sprite.invisible = true;
    sprite.animPaused = true;
    this.active.add(C.FLDEFF_ASH);
    sprite.callback = (s) => this.UpdateAshFieldEffect(s);
  }

  /** UpdateAshFieldEffect; its state value selects one C callback from gAshFieldEffectFuncs. */
  UpdateAshFieldEffect(sprite: Sprite): void {
    switch (sprite.data[0]) {
      case 0: this.UpdateAshFieldEffect_Step0(sprite); break;
      case 1: this.UpdateAshFieldEffect_Step1(sprite); break;
      case 2: this.UpdateAshFieldEffect_Step2(sprite); break;
    }
  }

  /** UpdateAshFieldEffect_Step0 (field_effect_helpers.c); data[4] is an s16. */
  UpdateAshFieldEffect_Step0(sprite: Sprite): void {
    sprite.invisible = true;
    sprite.animPaused = true;
    sprite.data[4] = (((sprite.data[4] ?? 0) - 1) << 16) >> 16;
    if (sprite.data[4] === 0) sprite.data[0] = 1;
  }

  /** UpdateAshFieldEffect_Step1 (field_effect_helpers.c). */
  UpdateAshFieldEffect_Step1(sprite: Sprite): void {
    sprite.invisible = false;
    sprite.animPaused = false;
    this.ow.map.setMetatileIdAt(sprite.data[1]!, sprite.data[2]!, sprite.data[3]!);
    this.ow.renderer?.invalidate();
    const player = this.ow.objects.player();
    if (player) player.triggerGroundEffectsOnMove = true;
    sprite.data[0] = 2;
  }

  /** UpdateAshFieldEffect_Step2 (field_effect_helpers.c). */
  UpdateAshFieldEffect_Step2(sprite: Sprite): void {
    this.UpdateObjectEventSpriteInvisibility(sprite, false);
    if (sprite.animEnded) {
      this.active.delete(C.FLDEFF_ASH);
      this.ow.sprites.destroy(sprite);
    }
  }

  // ---------------------------------------------------------------- ground effects

  groundEffect(object: ObjectEvent, kind: "spawn" | "begin" | "finish"): void {
    if (!fxData) return;
    if (kind === "spawn") this.DoGroundEffects_OnSpawn(object);
    else if (kind === "begin") this.DoGroundEffects_OnBeginStep(object);
    else this.DoGroundEffects_OnFinishStep(object);
  }

  private addGroundEffectFlag(flags: { value: number }, flag: number): void { flags.value |= flag; }

  /** ObjectEventUpdateMetatileBehaviors (event_object_movement.c). */
  ObjectEventUpdateMetatileBehaviors(object: ObjectEvent): void {
    object.previousMetatileBehavior = this.ow.map.behaviorAt(object.previousCoords.x, object.previousCoords.y);
    object.currentMetatileBehavior = this.ow.map.behaviorAt(object.currentCoords.x, object.currentCoords.y);
  }

  /** GetAllGroundEffectFlags_OnSpawn (event_object_movement.c). */
  GetAllGroundEffectFlags_OnSpawn(object: ObjectEvent, flags: { value: number }): void {
    this.ObjectEventUpdateMetatileBehaviors(object);
    this.GetGroundEffectFlags_Reflection(object, flags);
    this.GetGroundEffectFlags_TallGrassOnSpawn(object, flags);
    this.GetGroundEffectFlags_LongGrassOnSpawn(object, flags);
    this.GetGroundEffectFlags_SandHeap(object, flags);
    this.GetGroundEffectFlags_ShallowFlowingWater(object, flags);
    this.GetGroundEffectFlags_ShortGrass(object, flags);
    this.GetGroundEffectFlags_HotSprings(object, flags);
  }

  /** GetAllGroundEffectFlags_OnBeginStep (event_object_movement.c). */
  GetAllGroundEffectFlags_OnBeginStep(object: ObjectEvent, flags: { value: number }): void {
    this.ObjectEventUpdateMetatileBehaviors(object);
    this.GetGroundEffectFlags_Reflection(object, flags);
    this.GetGroundEffectFlags_TallGrassOnBeginStep(object, flags);
    this.GetGroundEffectFlags_LongGrassOnBeginStep(object, flags);
    this.GetGroundEffectFlags_Tracks(object, flags);
    this.GetGroundEffectFlags_SandHeap(object, flags);
    this.GetGroundEffectFlags_ShallowFlowingWater(object, flags);
    this.GetGroundEffectFlags_Puddle(object, flags);
    this.GetGroundEffectFlags_ShortGrass(object, flags);
    this.GetGroundEffectFlags_HotSprings(object, flags);
  }

  /** GetAllGroundEffectFlags_OnFinishStep (event_object_movement.c). */
  GetAllGroundEffectFlags_OnFinishStep(object: ObjectEvent, flags: { value: number }): void {
    this.ObjectEventUpdateMetatileBehaviors(object);
    this.GetGroundEffectFlags_ShallowFlowingWater(object, flags);
    this.GetGroundEffectFlags_SandHeap(object, flags);
    this.GetGroundEffectFlags_Puddle(object, flags);
    this.GetGroundEffectFlags_Ripple(object, flags);
    this.GetGroundEffectFlags_ShortGrass(object, flags);
    this.GetGroundEffectFlags_HotSprings(object, flags);
    this.GetGroundEffectFlags_Seaweed(object, flags);
    this.GetGroundEffectFlags_JumpLanding(object, flags);
  }

  /** GetGroundEffectFlags_Reflection (event_object_movement.c). */
  GetGroundEffectFlags_Reflection(object: ObjectEvent, flags: { value: number }): void {
    const type = this.ObjectEventCheckForReflectiveSurface(object);
    if (type && !object.hasReflection) {
      // The original flag table intentionally maps type 1 (ice) to bit 5,
      // whose dispatch slot is GroundEffect_IceReflection.
      this.addGroundEffectFlag(flags, type === 1 ? C.GROUND_EFFECT_FLAG_REFLECTION : C.GROUND_EFFECT_FLAG_ICE_REFLECTION);
    } else if (!type) object.hasReflection = false;
  }

  /** GetGroundEffectFlags_TallGrassOnSpawn (event_object_movement.c). */
  GetGroundEffectFlags_TallGrassOnSpawn(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsTallGrass(object.currentMetatileBehavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_TALL_GRASS_ON_SPAWN);
  }

  /** GetGroundEffectFlags_TallGrassOnBeginStep (event_object_movement.c). */
  GetGroundEffectFlags_TallGrassOnBeginStep(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsTallGrass(object.currentMetatileBehavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_TALL_GRASS_ON_MOVE);
  }

  /** GetGroundEffectFlags_LongGrassOnSpawn (event_object_movement.c). */
  GetGroundEffectFlags_LongGrassOnSpawn(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsLongGrass(object.currentMetatileBehavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_LONG_GRASS_ON_SPAWN);
  }

  /** GetGroundEffectFlags_LongGrassOnBeginStep (event_object_movement.c). */
  GetGroundEffectFlags_LongGrassOnBeginStep(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsLongGrass(object.currentMetatileBehavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_LONG_GRASS_ON_MOVE);
  }

  /** GetGroundEffectFlags_Tracks (event_object_movement.c). */
  GetGroundEffectFlags_Tracks(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsDeepSand(object.previousMetatileBehavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_DEEP_SAND);
    else if (MB.MetatileBehavior_IsSand(object.previousMetatileBehavior) || MB.MetatileBehavior_IsFootprints(object.previousMetatileBehavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_SAND);
  }

  /** GetGroundEffectFlags_SandHeap (event_object_movement.c). */
  GetGroundEffectFlags_SandHeap(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsDeepSand(object.currentMetatileBehavior) && MB.MetatileBehavior_IsDeepSand(object.previousMetatileBehavior)) {
      if (!object.inSandPile) { object.inSandPile = true; this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_SAND_PILE); }
    } else object.inSandPile = false;
  }

  /** GetGroundEffectFlags_ShallowFlowingWater (event_object_movement.c). */
  GetGroundEffectFlags_ShallowFlowingWater(object: ObjectEvent, flags: { value: number }): void {
    const current = object.currentMetatileBehavior, previous = object.previousMetatileBehavior;
    const bothFlowing = MB.MetatileBehavior_IsShallowFlowingWater(current) && MB.MetatileBehavior_IsShallowFlowingWater(previous);
    const bothLogs = MB.MetatileBehavior_IsPacifidlogLog(current) && MB.MetatileBehavior_IsPacifidlogLog(previous);
    if (bothFlowing || bothLogs) {
      if (!object.inShallowFlowingWater) { object.inShallowFlowingWater = true; this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_SHALLOW_FLOWING_WATER); }
    } else object.inShallowFlowingWater = false;
  }

  /** GetGroundEffectFlags_Puddle (event_object_movement.c). */
  GetGroundEffectFlags_Puddle(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsPuddle(object.currentMetatileBehavior) && MB.MetatileBehavior_IsPuddle(object.previousMetatileBehavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_PUDDLE);
  }

  /** GetGroundEffectFlags_Ripple (event_object_movement.c). */
  GetGroundEffectFlags_Ripple(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_HasRipples(object.currentMetatileBehavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_RIPPLES);
  }

  /** GetGroundEffectFlags_ShortGrass (event_object_movement.c). */
  GetGroundEffectFlags_ShortGrass(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsShortGrass(object.currentMetatileBehavior) && MB.MetatileBehavior_IsShortGrass(object.previousMetatileBehavior)) {
      if (!object.inShortGrass) { object.inShortGrass = true; this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_SHORT_GRASS); }
    } else object.inShortGrass = false;
  }

  /** GetGroundEffectFlags_HotSprings (event_object_movement.c). */
  GetGroundEffectFlags_HotSprings(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsHotSprings(object.currentMetatileBehavior) && MB.MetatileBehavior_IsHotSprings(object.previousMetatileBehavior)) {
      if (!object.inHotSprings) { object.inHotSprings = true; this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_HOT_SPRINGS); }
    } else object.inHotSprings = false;
  }

  /** GetGroundEffectFlags_Seaweed (event_object_movement.c). */
  GetGroundEffectFlags_Seaweed(object: ObjectEvent, flags: { value: number }): void {
    if (MB.MetatileBehavior_IsSeaweed(object.currentMetatileBehavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_SEAWEED);
  }

  /** GetGroundEffectFlags_JumpLanding (event_object_movement.c). */
  GetGroundEffectFlags_JumpLanding(object: ObjectEvent, flags: { value: number }): void {
    if (!object.landingJump || object.disableJumpLandingGroundEffect) return;
    const behavior = object.currentMetatileBehavior;
    if (MB.MetatileBehavior_IsTallGrass(behavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_LAND_IN_TALL_GRASS);
    else if (MB.MetatileBehavior_IsLongGrass(behavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_LAND_IN_LONG_GRASS);
    else if (MB.MetatileBehavior_IsPuddle(behavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_LAND_IN_SHALLOW_WATER);
    else if (MB.MetatileBehavior_IsSurfable(behavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_LAND_IN_DEEP_WATER);
    else if (MB.MetatileBehavior_IsShallowFlowingWater(behavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_LAND_IN_SHALLOW_WATER);
    else if (MB.MetatileBehavior_IsATile(behavior)) this.addGroundEffectFlag(flags, C.GROUND_EFFECT_FLAG_LAND_ON_NORMAL_GROUND);
  }

  /** ObjectEventCheckForReflectiveSurface (event_object_movement.c). */
  ObjectEventCheckForReflectiveSurface(object: ObjectEvent): number { return this.objectReflectionType(object); }

  /** GetReflectionTypeByMetatileBehavior (event_object_movement.c). */
  GetReflectionTypeByMetatileBehavior(behavior: number): number {
    if (MB.MetatileBehavior_IsIce(behavior)) return 1;
    if (MB.MetatileBehavior_IsReflective(behavior)) return 2;
    return 0;
  }

  /** filters_out_some_ground_effects (event_object_movement.c). */
  filters_out_some_ground_effects(object: ObjectEvent, flags: { value: number }): void {
    if (!object.disableCoveringGroundEffects) return;
    object.inShortGrass = false;
    object.inSandPile = false;
    object.inShallowFlowingWater = false;
    object.inHotSprings = false;
    flags.value &= ~(C.GROUND_EFFECT_FLAG_HOT_SPRINGS | C.GROUND_EFFECT_FLAG_SHORT_GRASS | C.GROUND_EFFECT_FLAG_SAND_PILE
      | C.GROUND_EFFECT_FLAG_SHALLOW_FLOWING_WATER | C.GROUND_EFFECT_FLAG_TALL_GRASS_ON_MOVE);
  }

  /** FilterOutStepOnPuddleGroundEffectIfJumping (event_object_movement.c). */
  FilterOutStepOnPuddleGroundEffectIfJumping(object: ObjectEvent, flags: { value: number }): void {
    if (object.landingJump) flags.value &= ~C.GROUND_EFFECT_FLAG_PUDDLE;
  }

  /** DoFlaggedGroundEffects (event_object_movement.c), in sGroundEffectFuncs bit order. */
  DoFlaggedGroundEffects(object: ObjectEvent, flags: number): void {
    if (object.localId === C.LOCALID_CAMERA && object.invisible) return;
    const effects: Array<(() => void) | undefined> = [
      () => this.GroundEffect_SpawnOnTallGrass(object), () => this.GroundEffect_StepOnTallGrass(object),
      () => this.GroundEffect_SpawnOnLongGrass(object), () => this.GroundEffect_StepOnLongGrass(object),
      () => this.GroundEffect_WaterReflection(object, object.sprite), () => this.GroundEffect_IceReflection(object, object.sprite),
      () => this.GroundEffect_FlowingWater(object), () => this.GroundEffect_SandTracks(object),
      () => this.GroundEffect_DeepSandTracks(object), () => this.GroundEffect_Ripple(object),
      () => this.GroundEffect_StepOnPuddle(object), () => this.GroundEffect_SandHeap(object),
      () => this.GroundEffect_JumpOnTallGrass(object), () => this.GroundEffect_JumpOnLongGrass(object),
      () => this.GroundEffect_JumpOnShallowWater(object, object.sprite), () => this.GroundEffect_JumpOnWater(object, object.sprite),
      () => this.GroundEffect_JumpLandingDust(object, object.sprite), () => this.GroundEffect_ShortGrass(object),
      () => this.GroundEffect_HotSprings(object), () => this.GroundEffect_Seaweed(object),
    ];
    for (let i = 0; i < effects.length; i++) if (flags & (1 << i)) effects[i]?.();
  }

  /** DoGroundEffects_OnSpawn (event_object_movement.c); caller owns the trigger bit. */
  DoGroundEffects_OnSpawn(object: ObjectEvent): void {
    const flags = { value: 0 };
    this.GetAllGroundEffectFlags_OnSpawn(object, flags);
    this.DoFlaggedGroundEffects(object, flags.value);
    object.disableCoveringGroundEffects = false;
  }

  /** DoGroundEffects_OnBeginStep (event_object_movement.c); caller owns the trigger bit. */
  DoGroundEffects_OnBeginStep(object: ObjectEvent): void {
    const flags = { value: 0 };
    this.GetAllGroundEffectFlags_OnBeginStep(object, flags);
    this.filters_out_some_ground_effects(object, flags);
    this.DoFlaggedGroundEffects(object, flags.value);
    object.disableCoveringGroundEffects = false;
  }

  /** DoGroundEffects_OnFinishStep (event_object_movement.c); caller owns the trigger bit. */
  DoGroundEffects_OnFinishStep(object: ObjectEvent): void {
    const flags = { value: 0 };
    this.GetAllGroundEffectFlags_OnFinishStep(object, flags);
    this.FilterOutStepOnPuddleGroundEffectIfJumping(object, flags);
    this.DoFlaggedGroundEffects(object, flags.value);
    object.landingJump = false;
  }

  /** ObjectEventCheckForReflectiveSurface and GetGroundEffectFlags_Reflection. */
  private updateObjectReflection(object: ObjectEvent): void {
    const type = this.objectReflectionType(object);
    if (type === 0) {
      object.hasReflection = false;
      const old = this.reflectionSprites.get(object);
      if (old) this.ow.sprites.destroy(old);
      this.reflectionSprites.delete(object);
      return;
    }
    if (object.hasReflection) return;

    object.hasReflection = true;
    const info = graphicsInfo(object.graphicsId);
    if (info.reflectionFrames.length === 0) return;
    const isBridge = !info.disableReflectionPaletteLoad
      && (MB.MetatileBehavior_GetBridgeType(object.previousMetatileBehavior)
        || MB.MetatileBehavior_GetBridgeType(object.currentMetatileBehavior));
    const sprite = new Sprite();
    sprite.frameImages = isBridge && info.bridgeReflectionFrames.length > 0
      ? info.bridgeReflectionFrames
      : info.reflectionFrames;
    sprite.width = info.width;
    sprite.height = info.height;
    sprite.centerToCornerVecX = object.sprite.centerToCornerVecX;
    sprite.centerToCornerVecY = object.sprite.centerToCornerVecY;
    sprite.priority = 3;
    sprite.subpriority = 0x98;
    sprite.coordOffsetEnabled = object.sprite.coordOffsetEnabled;
    sprite.vFlip = true;
    sprite.callback = (reflection) => {
      if (!object.active || !object.hasReflection) {
        this.ow.sprites.destroy(reflection);
        this.reflectionSprites.delete(object);
        return;
      }
      const source = object.sprite;
      reflection.imageValue = source.imageValue;
      reflection.hFlip = source.hFlip;
      reflection.x = source.x;
      reflection.y = source.y + info.height - 2;
      reflection.x2 = source.x2;
      reflection.y2 = -source.y2;
      reflection.centerToCornerVecX = source.centerToCornerVecX;
      reflection.centerToCornerVecY = source.centerToCornerVecY;
      reflection.coordOffsetEnabled = source.coordOffsetEnabled;
      reflection.invisible = source.invisible;
    };
    this.reflectionSprites.set(object, sprite);
    this.ow.sprites.add(sprite);
  }

  /** GroundEffect_WaterReflection (event_object_movement.c). */
  GroundEffect_WaterReflection(object: ObjectEvent, _sprite: Sprite): void {
    this.updateObjectReflection(object);
  }

  /** GroundEffect_IceReflection (event_object_movement.c). */
  GroundEffect_IceReflection(object: ObjectEvent, _sprite: Sprite): void {
    this.updateObjectReflection(object);
  }

  /** Scans the two metatile rows beneath the current and previous object tile. */
  private objectReflectionType(object: ObjectEvent): number {
    const positions = [object.currentCoords, object.previousCoords];
    for (let yOffset = 1; yOffset <= 2; yOffset++) {
      for (const position of positions) {
        const x = (position.x << 16) >> 16;
        const y = ((position.y + yOffset) << 16) >> 16;
        const behavior = this.ow.map.behaviorAt(x, y);
        const reflectionType = this.GetReflectionTypeByMetatileBehavior(behavior);
        if (reflectionType !== 0) return reflectionType;
      }
    }
    return 0;
  }

  /** GroundEffect_FlowingWater / FldEff_FeetInFlowingWater. */
  GroundEffect_FlowingWater(object: ObjectEvent): void {
    this.FldEff_FeetInFlowingWater(object);
  }

  /** FldEff_FeetInFlowingWater (field_effect_helpers.c). */
  FldEff_FeetInFlowingWater(object: ObjectEvent): void {
    const sprite = this.createFromTemplate("Splash", 0, 0);
    if (!sprite) return;
    sprite.coordOffsetEnabled = true;
    sprite.priority = object.sprite.priority & 0xff;
    sprite.y2 = ((((graphicsInfo(object.graphicsId).height >> 1) - 4) << 16) >> 16);
    sprite.data[0] = object.localId & 0xff;
    sprite.data[1] = object.mapNum & 0xff;
    sprite.data[2] = object.mapGroup & 0xff;
    sprite.data[3] = -1;
    sprite.data[4] = -1;
    sprite.startAnim(1);
    this.active.add(C.FLDEFF_FEET_IN_FLOWING_WATER);
    sprite.callback = (s) => this.UpdateFeetInFlowingWaterFieldEffect(s);
    this.flowingWaterEffects.set(object, sprite);
  }

  /** UpdateFeetInFlowingWaterFieldEffect (field_effect_helpers.c). */
  UpdateFeetInFlowingWaterFieldEffect(sprite: Sprite): void {
    const object = this.ow.objects.byLocalIdAndMap(sprite.data[0]! & 0xff, sprite.data[1]! & 0xff, sprite.data[2]! & 0xff);
    if (!object || !object.inShallowFlowingWater) {
      this.active.delete(C.FLDEFF_FEET_IN_FLOWING_WATER);
      this.ow.sprites.destroy(sprite);
      if (object && this.flowingWaterEffects.get(object) === sprite) this.flowingWaterEffects.delete(object);
      return;
    }
    sprite.x = object.sprite.x;
    sprite.y = object.sprite.y;
    sprite.subpriority = object.sprite.subpriority;
    this.UpdateObjectEventSpriteInvisibility(sprite, false);
    if (object.currentCoords.x !== sprite.data[3] || object.currentCoords.y !== sprite.data[4]) {
      sprite.data[3] = (object.currentCoords.x << 16) >> 16;
      sprite.data[4] = (object.currentCoords.y << 16) >> 16;
      if (!sprite.invisible) sound.playSE(sound.c("SE_PUDDLE"));
    }
  }

  /** GroundEffect_ShortGrass / FldEff_ShortGrass. */
  GroundEffect_ShortGrass(object: ObjectEvent): void {
    this.FldEff_ShortGrass(object);
  }

  /** FldEff_ShortGrass (field_effect_helpers.c). */
  FldEff_ShortGrass(object: ObjectEvent): number {
    const sprite = this.createFromTemplate("ShortGrass", 0, 0);
    if (!sprite) return 0;
    sprite.coordOffsetEnabled = true;
    sprite.priority = object.sprite.priority & 0xff;
    sprite.data[0] = object.localId & 0xff;
    sprite.data[1] = object.mapNum & 0xff;
    sprite.data[2] = object.mapGroup & 0xff;
    sprite.data[3] = (object.sprite.x << 16) >> 16;
    sprite.data[4] = (object.sprite.y << 16) >> 16;
    sprite.callback = (s) => this.UpdateShortGrassFieldEffect(s);
    this.active.add(C.FLDEFF_SHORT_GRASS);
    this.shortGrassEffects.set(object, sprite);
    return 0;
  }

  /** UpdateShortGrassFieldEffect (field_effect_helpers.c). */
  UpdateShortGrassFieldEffect(sprite: Sprite): void {
    const object = this.ow.objects.byLocalIdAndMap(sprite.data[0]! & 0xff, sprite.data[1]! & 0xff, sprite.data[2]! & 0xff);
    if (!object || !object.inShortGrass) {
      this.active.delete(C.FLDEFF_SHORT_GRASS);
      this.ow.sprites.destroy(sprite);
      if (object && this.shortGrassEffects.get(object) === sprite) this.shortGrassEffects.delete(object);
      return;
    }

    const graphics = graphicsInfo(object.graphicsId);
    const linkedSprite = object.sprite;
    const x = (linkedSprite.x << 16) >> 16;
    const y = (linkedSprite.y << 16) >> 16;
    if (x !== sprite.data[3] || y !== sprite.data[4]) {
      sprite.data[3] = x;
      sprite.data[4] = y;
      if (sprite.animEnded) sprite.startAnim(0);
    }
    sprite.x = x;
    sprite.y = y;
    sprite.y2 = ((graphics.height >> 1) - 8 << 16) >> 16;
    sprite.subpriority = (linkedSprite.subpriority - 1) & 0xff;
    sprite.priority = linkedSprite.priority & 0xff;
    this.UpdateObjectEventSpriteInvisibility(sprite, linkedSprite.invisible);
  }

  /** GroundEffect_HotSprings / FldEff_HotSpringsWater. */
  GroundEffect_HotSprings(object: ObjectEvent): void {
    this.FldEff_HotSpringsWater(object);
  }

  /** FldEff_HotSpringsWater (field_effect_helpers.c). */
  FldEff_HotSpringsWater(object: ObjectEvent): number {
    const sprite = this.createFromTemplate("HotSpringsWater", 0, 0);
    if (!sprite) return 0;
    sprite.coordOffsetEnabled = true;
    sprite.priority = object.sprite.priority & 0xff;
    sprite.data[0] = object.localId & 0xff;
    sprite.data[1] = object.mapNum & 0xff;
    sprite.data[2] = object.mapGroup & 0xff;
    sprite.data[3] = ((object.sprite.x << 16) >> 16);
    sprite.data[4] = ((object.sprite.y << 16) >> 16);
    sprite.callback = (s) => this.UpdateHotSpringsWaterFieldEffect(s);
    this.active.add(C.FLDEFF_HOT_SPRINGS_WATER);
    this.hotSpringsEffects.set(object, sprite);
    return 0;
  }

  /** UpdateHotSpringsWaterFieldEffect (field_effect_helpers.c). */
  UpdateHotSpringsWaterFieldEffect(sprite: Sprite): void {
    const object = this.ow.objects.byLocalIdAndMap(sprite.data[0]! & 0xff, sprite.data[1]! & 0xff, sprite.data[2]! & 0xff);
    if (!object || !object.inHotSprings) {
      this.active.delete(C.FLDEFF_HOT_SPRINGS_WATER);
      this.ow.sprites.destroy(sprite);
      if (object && this.hotSpringsEffects.get(object) === sprite) this.hotSpringsEffects.delete(object);
      return;
    }
    const linkedSprite = object.sprite;
    const height = graphicsInfo(object.graphicsId).height;
    sprite.x = linkedSprite.x;
    sprite.y = linkedSprite.y + (height >> 1) - 8;
    sprite.subpriority = (linkedSprite.subpriority - 1) & 0xff;
    this.UpdateObjectEventSpriteInvisibility(sprite, false);
  }

  /** GroundEffect_SandHeap (event_object_movement.c). */
  GroundEffect_SandHeap(object: ObjectEvent): void {
    const args = this.ow.game.fieldEffectArguments;
    args[0] = object.localId & 0xff;
    args[1] = object.mapNum & 0xff;
    args[2] = object.mapGroup & 0xff;
    this.start(C.FLDEFF_SAND_PILE);
  }

  /** FldEff_SandPile (field_effect_helpers.c). */
  FldEff_SandPile(): number {
    const args = this.ow.game.fieldEffectArguments;
    const object = this.ow.objects.byLocalIdAndMap(args[0]! & 0xff, args[1]! & 0xff, args[2]! & 0xff);
    if (!object) return 0;
    const sprite = this.createFromTemplate("SandPile", 0, 0, true);
    if (!sprite) return 0;
    sprite.coordOffsetEnabled = true;
    sprite.priority = object.sprite.priority & 0xff;
    sprite.data[0] = args[0]! & 0xff;
    sprite.data[1] = args[1]! & 0xff;
    sprite.data[2] = args[2]! & 0xff;
    sprite.data[3] = (object.sprite.x << 16) >> 16;
    sprite.data[4] = (object.sprite.y << 16) >> 16;
    sprite.y2 = (graphicsInfo(object.graphicsId).height >> 1) - 2;
    sprite.seekAnim(2);
    sprite.callback = (s) => this.UpdateSandPileFieldEffect(s);
    this.active.add(C.FLDEFF_SAND_PILE);
    this.sandPileSprites.add(sprite);
    this.sandPileEffects.set(object, sprite);
    return 0;
  }

  /** UpdateSandPileFieldEffect (field_effect_helpers.c). */
  UpdateSandPileFieldEffect(sprite: Sprite): void {
    const object = this.ow.objects.byLocalIdAndMap(sprite.data[0]! & 0xff, sprite.data[1]! & 0xff, sprite.data[2]! & 0xff);
    if (!object || !object.inSandPile) {
      this.ow.sprites.destroy(sprite);
      this.sandPileSprites.delete(sprite);
      if (object && this.sandPileEffects.get(object) === sprite) this.sandPileEffects.delete(object);
      if (this.sandPileSprites.size === 0) this.active.delete(C.FLDEFF_SAND_PILE);
      return;
    }
    const linkedSprite = object.sprite;
    const x = (linkedSprite.x << 16) >> 16;
    const y = (linkedSprite.y << 16) >> 16;
    if (x !== sprite.data[3] || y !== sprite.data[4]) {
      sprite.data[3] = x;
      sprite.data[4] = y;
      if (sprite.animEnded) sprite.startAnim(0);
    }
    sprite.x = x;
    sprite.y = y;
    sprite.subpriority = linkedSprite.subpriority & 0xff;
    this.UpdateObjectEventSpriteInvisibility(sprite, false);
  }

  /** GroundEffect_Seaweed / FldEff_Bubbles. */
  GroundEffect_Seaweed(object: ObjectEvent): void {
    this.FldEff_Bubbles(object.currentCoords.x, object.currentCoords.y);
  }

  /** FldEff_Bubbles (field_effect_helpers.c). */
  FldEff_Bubbles(x: number, y: number): void {
    const sprite = this.createFromTemplate("Bubbles", ((x << 16) >> 16) * 16 + 8, ((y << 16) >> 16) * 16);
    if (!sprite) return;
    sprite.coordOffsetEnabled = true;
    sprite.priority = 1;
    sprite.subpriority = 0x52;
    sprite.data[0] = 0;
    this.active.add(C.FLDEFF_BUBBLES);
    sprite.callback = (s) => this.UpdateBubblesFieldEffect(s);
  }

  /** UpdateBubblesFieldEffect (field_effect_helpers.c). */
  UpdateBubblesFieldEffect(sprite: Sprite): void {
    sprite.data[0] = ((sprite.data[0] ?? 0) + 0x80) & 0x100;
    sprite.y -= sprite.data[0]! >> 8;
    this.UpdateObjectEventSpriteInvisibility(sprite, false);
    if (sprite.invisible || sprite.animEnded) {
      this.active.delete(C.FLDEFF_BUBBLES);
      this.ow.sprites.destroy(sprite);
    }
  }

  /** UpdateObjectEventSpriteInvisibility (event_object_movement.c). */
  UpdateObjectEventSpriteInvisibility(sprite: Sprite, invisible: boolean): void {
    sprite.invisible = invisible;
    const x = (sprite.x + sprite.x2 + sprite.centerToCornerVecX + (sprite.coordOffsetEnabled ? this.ow.sprites.offsetX : 0)) & 0xffff;
    const y = (sprite.y + sprite.y2 + sprite.centerToCornerVecY + (sprite.coordOffsetEnabled ? this.ow.sprites.offsetY : 0)) & 0xffff;
    const x2 = ((x - (sprite.centerToCornerVecX >> 1)) << 16) >> 16;
    const y2 = ((y - (sprite.centerToCornerVecY >> 1)) << 16) >> 16;
    if (x >= 240 + 16 || x2 < -16 || y >= 160 + 16 || y2 < -16) sprite.invisible = true;
  }

  /** GroundEffect_StepOnPuddle (event_object_movement.c): play the linked splash on a puddle step. */
  GroundEffect_StepOnPuddle(object: ObjectEvent): void {
    this.FldEff_Splash(object);
  }

  /** FldEff_Splash (field_effect_helpers.c), called by StartFieldEffectForObjectEvent. */
  FldEff_Splash(object: ObjectEvent): void {
    const sprite = this.createFromTemplate("Splash", 0, 0);
    if (!sprite) return;
    sprite.coordOffsetEnabled = true;
    sprite.priority = object.sprite.priority & 0xff;
    sprite.data[0] = object.localId & 0xff;
    sprite.data[1] = object.mapNum & 0xff;
    sprite.data[2] = object.mapGroup & 0xff;
    sprite.y2 = ((graphicsInfo(object.graphicsId).height >> 1) - 4 << 16) >> 16;
    this.active.add(C.FLDEFF_SPLASH);
    sound.playSE(sound.c("SE_PUDDLE"));
    sprite.callback = (s) => this.UpdateSplashFieldEffect(s);
  }

  /** UpdateSplashFieldEffect (field_effect_helpers.c). */
  UpdateSplashFieldEffect(sprite: Sprite): void {
    const object = this.ow.objects.byLocalIdAndMap(sprite.data[0]! & 0xff, sprite.data[1]! & 0xff, sprite.data[2]! & 0xff);
    if (sprite.animEnded || !object) {
      this.active.delete(C.FLDEFF_SPLASH);
      this.ow.sprites.destroy(sprite);
    } else {
      sprite.x = object.sprite.x;
      sprite.y = object.sprite.y;
      this.UpdateObjectEventSpriteInvisibility(sprite, false);
    }
  }

  /** GroundEffect_Ripple / DoRippleFieldEffect: emit the source ripple at the object's feet. */
  GroundEffect_Ripple(object: ObjectEvent): void {
    this.FldEff_Ripple(object.sprite.x, object.sprite.y + (graphicsInfo(object.graphicsId).height >> 1) - 2, 151, 3);
  }

  /** FldEff_Ripple (field_effect_helpers.c). */
  FldEff_Ripple(x: number, y: number, subpriority: number, priority: number): void {
    const sprite = this.createFromTemplate("Ripple", x, y);
    if (!sprite) return;
    sprite.coordOffsetEnabled = true;
    sprite.priority = priority & 0xff;
    sprite.subpriority = subpriority & 0xff;
    sprite.data[0] = C.FLDEFF_RIPPLE;
    this.active.add(C.FLDEFF_RIPPLE);
    sprite.callback = (s) => this.WaitFieldEffectSpriteAnim(s);
  }

  /** WaitFieldEffectSpriteAnim (field_effect_helpers.c). */
  WaitFieldEffectSpriteAnim(sprite: Sprite): void {
    if (sprite.animEnded) {
      this.active.delete(sprite.data[0]! & 0xff);
      this.ow.sprites.destroy(sprite);
    } else {
      this.UpdateObjectEventSpriteInvisibility(sprite, false);
    }
  }

  /** GroundEffect_SpawnOnTallGrass (event_object_movement.c). */
  GroundEffect_SpawnOnTallGrass(object: ObjectEvent): void {
    this.SetTallGrassFieldEffectArguments(object, true);
    this.start(C.FLDEFF_TALL_GRASS);
  }

  /** GroundEffect_StepOnTallGrass (event_object_movement.c). */
  GroundEffect_StepOnTallGrass(object: ObjectEvent): void {
    this.SetTallGrassFieldEffectArguments(object, false);
    this.start(C.FLDEFF_TALL_GRASS);
  }

  private SetTallGrassFieldEffectArguments(object: ObjectEvent, skipAnim: boolean): void {
    const args = this.ow.game.fieldEffectArguments;
    args[0] = (object.currentCoords.x << 16) >> 16;
    args[1] = (object.currentCoords.y << 16) >> 16;
    args[2] = object.previousElevation & 0xff;
    args[3] = 2;
    args[4] = (((object.localId & 0xff) << 8) | (object.mapNum & 0xff)) & 0xffff;
    args[5] = object.mapGroup & 0xff;
    args[6] = (((this.ow.objects.mapNum & 0xff) << 8) | (this.ow.objects.mapGroup & 0xff)) & 0xffff;
    args[7] = skipAnim ? 1 : 0;
  }

  /** FldEff_TallGrass (field_effect_helpers.c). */
  FldEff_TallGrass(): number {
    const args = this.ow.game.fieldEffectArguments;
    const x = (args[0]! << 16) >> 16;
    const y = (args[1]! << 16) >> 16;
    const sprite = this.createFromTemplate("TallGrass", x * 16 + 8, y * 16 + 8);
    if (!sprite) return 0;
    (sprite as unknown as { fxTile: boolean }).fxTile = true;
    sprite.coordOffsetEnabled = true;
    sprite.priority = args[3]! & 0xff;
    sprite.data[0] = (args[2]! << 16) >> 16;
    sprite.data[1] = x;
    sprite.data[2] = y;
    sprite.data[3] = (args[4]! << 16) >> 16;
    sprite.data[4] = (args[5]! << 16) >> 16;
    sprite.data[5] = (args[6]! << 16) >> 16;
    sprite.data[7] = args[7]! & 0xffff;
    sprite.callback = (s) => this.UpdateTallGrassFieldEffect(s);
    this.tallGrassSprites.add(sprite);
    this.active.add(C.FLDEFF_TALL_GRASS);
    if (args[7]) sprite.seekAnim(4);
    return 0;
  }

  /** UpdateTallGrassFieldEffect (field_effect_helpers.c). */
  UpdateTallGrassFieldEffect(sprite: Sprite): void {
    let savedMapNum = (sprite.data[5]! >>> 8) & 0xff;
    let savedMapGroup = sprite.data[5]! & 0xff;
    if (this.ow.objects.mapNum !== savedMapNum || this.ow.objects.mapGroup !== savedMapGroup) {
      // Camera shifts update fxTile pixel and tile coordinates in FieldEffects.shift.
      sprite.data[5] = ((this.ow.objects.mapNum & 0xff) << 8) | (this.ow.objects.mapGroup & 0xff);
      savedMapNum = this.ow.objects.mapNum;
      savedMapGroup = this.ow.objects.mapGroup;
    }
    const localId = (sprite.data[3]! >>> 8) & 0xff;
    const mapNum = sprite.data[3]! & 0xff;
    const mapGroup = sprite.data[4]! & 0xff;
    const object = this.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup);
    const behavior = this.ow.map.behaviorAt(sprite.data[1]!, sprite.data[2]!);
    if (!object || !MB.MetatileBehavior_IsTallGrass(behavior) || (sprite.data[7] !== 0 && sprite.animEnded)) {
      this.stopTallGrassFieldEffect(sprite);
      return;
    }

    if ((object.currentCoords.x !== sprite.data[1] || object.currentCoords.y !== sprite.data[2])
      && (object.previousCoords.x !== sprite.data[1] || object.previousCoords.y !== sprite.data[2])) {
      sprite.data[7] = 1;
    }
    const subpriorityOffset = sprite.animCmdIndex === 0 ? 4 : 0;
    this.UpdateObjectEventSpriteInvisibility(sprite, false);
    this.UpdateGrassFieldEffectSubpriority(sprite, sprite.data[0]! & 0xff, subpriorityOffset);
  }

  /** FldEff_JumpTallGrass (field_effect_helpers.c). */
  FldEff_JumpTallGrass(): number {
    const args = this.ow.game.fieldEffectArguments;
    const x = (args[0]! << 16) >> 16;
    const y = (args[1]! << 16) >> 16;
    const sprite = this.createFromTemplate("JumpTallGrass", x * 16 + 8, y * 16 + 12);
    if (!sprite) return 0;
    sprite.coordOffsetEnabled = true;
    sprite.priority = args[3]! & 0xff;
    sprite.data[0] = args[2]! & 0xff;
    sprite.data[1] = C.FLDEFF_JUMP_TALL_GRASS;
    sprite.callback = (s) => this.UpdateJumpImpactEffect(s);
    return 0;
  }

  /** FindTallGrassFieldEffectSpriteId (field_effect_helpers.c). */
  FindTallGrassFieldEffectSpriteId(localId: number, mapNum: number, mapGroup: number, x: number, y: number): number {
    for (const sprite of this.tallGrassSprites) {
      if (sprite.data[1] === x && sprite.data[2] === y
        && ((sprite.data[3]! >>> 8) & 0xff) === (localId & 0xff)
        && (sprite.data[3]! & 0xff) === (mapNum & 0xff)
        && (sprite.data[4]! & 0xff) === (mapGroup & 0xff)) {
        const spriteId = this.ow.sprites.getId(sprite);
        if (spriteId !== 0xff) return spriteId;
      }
    }
    return C.MAX_SPRITES;
  }

  private stopTallGrassFieldEffect(sprite: Sprite): void {
    this.ow.sprites.destroy(sprite);
    this.tallGrassSprites.delete(sprite);
    if (this.tallGrassSprites.size === 0) this.active.delete(C.FLDEFF_TALL_GRASS);
  }

  /** UpdateGrassFieldEffectSubpriority (field_effect_helpers.c). */
  UpdateGrassFieldEffectSubpriority(sprite: Sprite, elevation: number, offset: number): void {
    this.ow.objects.SetObjectSubpriorityByElevation(elevation, sprite, offset, this.ow.sprites.offsetY);
    for (const object of this.ow.objects.objects) {
      if (!object?.active) continue;
      const linked = object.sprite;
      const xhi = ((sprite.x + sprite.centerToCornerVecX) << 16) >> 16;
      const xRight = ((sprite.x - sprite.centerToCornerVecX) << 16) >> 16;
      if (xhi < linked.x && xRight > linked.x) {
        const linkedTop = ((linked.y + linked.centerToCornerVecY) << 16) >> 16;
        const linkedY = linked.y;
        const ylo = ((sprite.y - sprite.centerToCornerVecY) << 16) >> 16;
        const yhi = ((ylo + linked.centerToCornerVecY) << 16) >> 16;
        if ((linkedTop < yhi || linkedTop < ylo) && linkedY > yhi && sprite.subpriority <= linked.subpriority) {
          sprite.subpriority = (linked.subpriority + 2) & 0xff;
          break;
        }
      }
    }
  }

  /** GroundEffect_JumpOnTallGrass (event_object_movement.c). */
  GroundEffect_JumpOnTallGrass(object: ObjectEvent): void {
    const args = this.ow.game.fieldEffectArguments;
    args[0] = (object.currentCoords.x << 16) >> 16;
    args[1] = (object.currentCoords.y << 16) >> 16;
    args[2] = object.previousElevation & 0xff;
    args[3] = 2;
    this.start(C.FLDEFF_JUMP_TALL_GRASS);
    if (this.FindTallGrassFieldEffectSpriteId(object.localId, object.mapNum, object.mapGroup, object.currentCoords.x, object.currentCoords.y) === C.MAX_SPRITES) {
      this.GroundEffect_SpawnOnTallGrass(object);
    }
  }

  /** GroundEffect_SpawnOnLongGrass (event_object_movement.c). */
  GroundEffect_SpawnOnLongGrass(object: ObjectEvent): void {
    this.SetLongGrassFieldEffectArguments(object, true);
    this.start(C.FLDEFF_LONG_GRASS);
  }

  /** GroundEffect_StepOnLongGrass (event_object_movement.c). */
  GroundEffect_StepOnLongGrass(object: ObjectEvent): void {
    this.SetLongGrassFieldEffectArguments(object, false);
    this.start(C.FLDEFF_LONG_GRASS);
  }

  private SetLongGrassFieldEffectArguments(object: ObjectEvent, skipAnim: boolean): void {
    const args = this.ow.game.fieldEffectArguments;
    args[0] = (object.currentCoords.x << 16) >> 16;
    args[1] = (object.currentCoords.y << 16) >> 16;
    args[2] = object.previousElevation & 0xff;
    args[3] = 2;
    args[4] = (((object.localId & 0xff) << 8) | (object.mapNum & 0xff)) & 0xffff;
    args[5] = object.mapGroup & 0xff;
    args[6] = (((this.ow.objects.mapNum & 0xff) << 8) | (this.ow.objects.mapGroup & 0xff)) & 0xffff;
    args[7] = skipAnim ? 1 : 0;
  }

  /** FldEff_LongGrass (field_effect_helpers.c). */
  FldEff_LongGrass(): number {
    const args = this.ow.game.fieldEffectArguments;
    const x = (args[0]! << 16) >> 16;
    const y = (args[1]! << 16) >> 16;
    const sprite = this.createFromTemplate("LongGrass", x * 16 + 8, y * 16 + 8);
    if (!sprite) return 0;
    (sprite as unknown as { fxTile: boolean }).fxTile = true;
    sprite.coordOffsetEnabled = true;
    sprite.priority = ElevationToPriority(args[2]!);
    sprite.data[0] = args[2]! & 0xff;
    sprite.data[1] = x;
    sprite.data[2] = y;
    sprite.data[3] = (args[4]! << 16) >> 16;
    sprite.data[4] = (args[5]! << 16) >> 16;
    sprite.data[5] = (args[6]! << 16) >> 16;
    sprite.callback = (s) => this.UpdateLongGrassFieldEffect(s);
    this.longGrassSprites.add(sprite);
    this.active.add(C.FLDEFF_LONG_GRASS);
    if (args[7]) sprite.seekAnim(6);
    return 0;
  }

  /** UpdateLongGrassFieldEffect (field_effect_helpers.c). */
  UpdateLongGrassFieldEffect(sprite: Sprite): void {
    const savedMapNum = (sprite.data[5]! >>> 8) & 0xff;
    const savedMapGroup = sprite.data[5]! & 0xff;
    if (this.ow.objects.mapNum !== savedMapNum || this.ow.objects.mapGroup !== savedMapGroup) {
      // FieldEffects.shift already applies the camera tile delta to fxTile sprites.
      sprite.data[5] = ((this.ow.objects.mapNum & 0xff) << 8) | (this.ow.objects.mapGroup & 0xff);
    }
    const localId = (sprite.data[3]! >>> 8) & 0xff;
    const mapNum = sprite.data[3]! & 0xff;
    const mapGroup = sprite.data[4]! & 0xff;
    const object = this.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup);
    const behavior = this.ow.map.behaviorAt(sprite.data[1]!, sprite.data[2]!);
    if (!object || !MB.MetatileBehavior_IsLongGrass(behavior) || (sprite.data[7] !== 0 && sprite.animEnded)) {
      this.stopLongGrassFieldEffect(sprite);
      return;
    }
    if ((object.currentCoords.x !== sprite.data[1] || object.currentCoords.y !== sprite.data[2])
      && (object.previousCoords.x !== sprite.data[1] || object.previousCoords.y !== sprite.data[2])) {
      sprite.data[7] = 1;
    }
    this.UpdateObjectEventSpriteInvisibility(sprite, false);
    this.UpdateGrassFieldEffectSubpriority(sprite, sprite.data[0]! & 0xff, 0);
  }

  /** FldEff_JumpLongGrass (field_effect_helpers.c). */
  FldEff_JumpLongGrass(): number {
    const args = this.ow.game.fieldEffectArguments;
    const x = (args[0]! << 16) >> 16;
    const y = (args[1]! << 16) >> 16;
    const sprite = this.createFromTemplate("JumpLongGrass", x * 16 + 8, y * 16 + 8);
    if (!sprite) return 0;
    sprite.coordOffsetEnabled = true;
    sprite.priority = args[3]! & 0xff;
    sprite.data[0] = args[2]! & 0xff;
    sprite.data[1] = C.FLDEFF_JUMP_LONG_GRASS;
    sprite.callback = (s) => this.UpdateJumpImpactEffect(s);
    return 0;
  }

  /** GroundEffect_JumpOnLongGrass (event_object_movement.c). */
  GroundEffect_JumpOnLongGrass(object: ObjectEvent): void {
    const args = this.ow.game.fieldEffectArguments;
    args[0] = (object.currentCoords.x << 16) >> 16;
    args[1] = (object.currentCoords.y << 16) >> 16;
    args[2] = object.previousElevation & 0xff;
    args[3] = 2;
    this.start(C.FLDEFF_JUMP_LONG_GRASS);
  }

  private stopLongGrassFieldEffect(sprite: Sprite): void {
    this.ow.sprites.destroy(sprite);
    this.longGrassSprites.delete(sprite);
    if (this.longGrassSprites.size === 0) this.active.delete(C.FLDEFF_LONG_GRASS);
  }

  /** DoShadowFieldEffect (event_object_movement.c). */
  DoShadowFieldEffect(object: ObjectEvent): void {
    if (object.hasShadow) return;
    object.hasShadow = true;
    this.FldEff_Shadow(object);
  }

  /** FldEff_Shadow (field_effect_helpers.c). */
  FldEff_Shadow(object: ObjectEvent): number {
    const graphics = graphicsInfo(object.graphicsId);
    const sprite = this.createFromTemplate(SHADOW_TEMPLATES[graphics.shadowSize] ?? "ShadowMedium", 0, 0);
    if (!sprite) return 0;
    sprite.coordOffsetEnabled = true;
    sprite.subpriority = 0x94;
    sprite.data[0] = object.localId & 0xff;
    sprite.data[1] = object.mapNum & 0xff;
    sprite.data[2] = object.mapGroup & 0xff;
    sprite.data[3] = (((graphics.height >> 1) - (SHADOW_OFFSETS[graphics.shadowSize] ?? 4)) << 16) >> 16;
    sprite.callback = (s) => this.UpdateShadowFieldEffect(s);
    this.shadowEffects.set(object, sprite);
    this.shadowSprites.add(sprite);
    this.active.add(C.FLDEFF_SHADOW);
    return 0;
  }

  /** UpdateShadowFieldEffect (field_effect_helpers.c). */
  UpdateShadowFieldEffect(sprite: Sprite): void {
    const object = this.ow.objects.byLocalIdAndMap(sprite.data[0]! & 0xff, sprite.data[1]! & 0xff, sprite.data[2]! & 0xff);
    if (!object) {
      this.stopShadowFieldEffect(sprite);
      return;
    }

    const linkedSprite = object.sprite;
    sprite.priority = linkedSprite.priority & 0xff;
    sprite.x = linkedSprite.x;
    sprite.y = linkedSprite.y + sprite.data[3]!;
    const current = object.currentMetatileBehavior;
    const previous = object.previousMetatileBehavior;
    if (!object.active || !object.hasShadow
      || MB.MetatileBehavior_IsPokeGrass(current)
      || MB.MetatileBehavior_IsSurfable(current)
      || MB.MetatileBehavior_IsSurfable(previous)
      || MB.MetatileBehavior_IsReflective(current)
      || MB.MetatileBehavior_IsReflective(previous)) {
      this.stopShadowFieldEffect(sprite, object);
    }
  }

  private stopShadowFieldEffect(sprite: Sprite, object?: ObjectEvent): void {
    this.ow.sprites.destroy(sprite);
    this.shadowSprites.delete(sprite);
    if (object && this.shadowEffects.get(object) === sprite) this.shadowEffects.delete(object);
    if (this.shadowSprites.size === 0) this.active.delete(C.FLDEFF_SHADOW);
  }

  /** GroundEffect_JumpOnShallowWater (event_object_movement.c). */
  GroundEffect_JumpOnShallowWater(object: ObjectEvent, _sprite: Sprite): void {
    this.FldEff_JumpSmallSplash(object);
  }

  /** GroundEffect_JumpOnWater (event_object_movement.c). */
  GroundEffect_JumpOnWater(object: ObjectEvent, _sprite: Sprite): void {
    this.FldEff_JumpBigSplash(object);
  }

  /** GroundEffect_JumpLandingDust (event_object_movement.c). */
  GroundEffect_JumpLandingDust(object: ObjectEvent, _sprite: Sprite): void {
    this.FldEff_Dust(object);
  }

  /** FldEff_JumpSmallSplash; the source arguments are current coordinates, previous elevation, and OAM priority. */
  FldEff_JumpSmallSplash(object: ObjectEvent): void {
    this.FldEff_JumpImpact(object, "JumpSmallSplash", 12, C.FLDEFF_JUMP_SMALL_SPLASH);
  }

  /** FldEff_JumpBigSplash. */
  FldEff_JumpBigSplash(object: ObjectEvent): void {
    this.FldEff_JumpImpact(object, "JumpBigSplash", 8, C.FLDEFF_JUMP_BIG_SPLASH);
  }

  /** FldEff_Dust. */
  FldEff_Dust(object: ObjectEvent): void {
    this.FldEff_JumpImpact(object, "GroundImpactDust", 12, C.FLDEFF_DUST);
  }

  private FldEff_JumpImpact(object: ObjectEvent, template: string, yOffset: number, fieldEffect: number): void {
    const x = object.currentCoords.x;
    const y = object.currentCoords.y;
    const sprite = this.createFromTemplate(template, x * 16 + 8, y * 16 + yOffset);
    if (!sprite) return;
    sprite.coordOffsetEnabled = true;
    sprite.priority = object.sprite.priority & 0xff;
    sprite.data[0] = object.previousElevation & 0xff;
    sprite.data[1] = fieldEffect & 0xffff;
    this.active.add(fieldEffect);
    sprite.callback = (s) => this.UpdateJumpImpactEffect(s);
  }

  /** UpdateJumpImpactEffect (field_effect_helpers.c). */
  UpdateJumpImpactEffect(sprite: Sprite): void {
    if (sprite.animEnded) {
      this.active.delete(sprite.data[1]! & 0xffff);
      this.ow.sprites.destroy(sprite);
    } else {
      this.UpdateObjectEventSpriteInvisibility(sprite, false);
      this.ow.objects.SetObjectSubpriorityByElevation(sprite.data[0]!, sprite, 0, this.ow.sprites.offsetY);
    }
  }

  /** GroundEffect_SandTracks (event_object_movement.c). */
  GroundEffect_SandTracks(object: ObjectEvent): void {
    this.DoTracksGroundEffect(object, false);
  }

  /** GroundEffect_DeepSandTracks (event_object_movement.c). */
  GroundEffect_DeepSandTracks(object: ObjectEvent): void {
    this.DoTracksGroundEffect(object, true);
  }

  private DoTracksGroundEffect(object: ObjectEvent, deepSand: boolean): void {
    const tracks = rom.objects.gfx[String(object.graphicsId)]?.tracks;
    if (tracks !== "TRACKS_FOOT" && tracks !== "TRACKS_BIKE_TIRE") return;
    const args = this.ow.game.fieldEffectArguments;
    args[0] = (object.previousCoords.x << 16) >> 16;
    args[1] = (object.previousCoords.y << 16) >> 16;
    args[2] = 149;
    args[3] = 2;
    if (tracks === "TRACKS_FOOT") {
      args[4] = object.facingDirection & 0xff;
      this.start(deepSand ? C.FLDEFF_DEEP_SAND_FOOTPRINTS : C.FLDEFF_SAND_FOOTPRINTS);
      return;
    }
    if (object.currentCoords.x === object.previousCoords.x && object.currentCoords.y === object.previousCoords.y) return;
    const transitions = [
      [1, 2, 7, 8],
      [1, 2, 6, 5],
      [5, 8, 3, 4],
      [6, 7, 3, 4],
    ];
    const previousDirection = object.previousMovementDirection;
    const nextDirection = object.facingDirection - 5;
    // The source indexes this table directly. Out-of-range state has no defined C result.
    const animation = transitions[previousDirection]?.[nextDirection];
    if (animation === undefined) return;
    args[4] = animation;
    this.start(C.FLDEFF_BIKE_TIRE_TRACKS);
  }

  /** FldEff_SandFootprints (field_effect_helpers.c). */
  FldEff_SandFootprints(): number {
    this.CreateFootprintsTireTracksSprite("SandFootprints", C.FLDEFF_SAND_FOOTPRINTS);
    return 0;
  }

  /** FldEff_DeepSandFootprints (field_effect_helpers.c). */
  FldEff_DeepSandFootprints(): number {
    return this.CreateFootprintsTireTracksSprite("DeepSandFootprints", C.FLDEFF_DEEP_SAND_FOOTPRINTS);
  }

  /** FldEff_BikeTireTracks (field_effect_helpers.c). */
  FldEff_BikeTireTracks(): number {
    return this.CreateFootprintsTireTracksSprite("BikeTireTracks", C.FLDEFF_BIKE_TIRE_TRACKS);
  }

  private CreateFootprintsTireTracksSprite(template: string, effectId: number): number {
    const args = this.ow.game.fieldEffectArguments;
    const x = (args[0]! << 16) >> 16;
    const y = (args[1]! << 16) >> 16;
    const sprite = this.createFromTemplate(template, x * 16 + 8, y * 16 + 8);
    if (!sprite) {
      if (![...this.tracksSprites].some((s) => s.data[7] === effectId)) this.active.delete(effectId);
      return effectId === C.FLDEFF_SAND_FOOTPRINTS ? 0 : C.MAX_SPRITES;
    }
    sprite.coordOffsetEnabled = true;
    sprite.priority = args[3]! & 0xff;
    sprite.subpriority = args[2]! & 0xff;
    sprite.data[0] = 0;
    sprite.data[1] = 0;
    sprite.data[7] = effectId;
    sprite.startAnim(args[4]! & 0xff);
    sprite.callback = (s) => this.UpdateFootprintsTireTracksFieldEffect(s);
    this.tracksSprites.add(sprite);
    this.active.add(effectId);
    const spriteId = this.ow.sprites.getId(sprite);
    return effectId === C.FLDEFF_SAND_FOOTPRINTS ? 0 : spriteId;
  }

  /** UpdateFootprintsTireTracksFieldEffect (field_effect_helpers.c). */
  UpdateFootprintsTireTracksFieldEffect(sprite: Sprite): void {
    switch (sprite.data[0]) {
      case 0: this.FadeFootprintsTireTracks_Step0(sprite); break;
      case 1: this.FadeFootprintsTireTracks_Step1(sprite); break;
      default: return;
    }
  }

  /** FadeFootprintsTireTracks_Step0 (field_effect_helpers.c). */
  FadeFootprintsTireTracks_Step0(sprite: Sprite): void {
    sprite.data[1] = (sprite.data[1]! + 1) << 16 >> 16;
    if (sprite.data[1]! > 40) sprite.data[0] = 1;
    this.UpdateObjectEventSpriteInvisibility(sprite, false);
  }

  /** FadeFootprintsTireTracks_Step1 (field_effect_helpers.c). */
  FadeFootprintsTireTracks_Step1(sprite: Sprite): void {
    sprite.invisible = !sprite.invisible;
    sprite.data[1] = (sprite.data[1]! + 1) << 16 >> 16;
    this.UpdateObjectEventSpriteInvisibility(sprite, sprite.invisible);
    if (sprite.data[1]! > 56) this.StopFootprintsTireTracksFieldEffect(sprite);
  }

  private StopFootprintsTireTracksFieldEffect(sprite: Sprite): void {
    const effectId = sprite.data[7]! & 0xff;
    this.ow.sprites.destroy(sprite);
    this.tracksSprites.delete(sprite);
    if (![...this.tracksSprites].some((s) => s.data[7] === effectId)) this.active.delete(effectId);
  }

  // ---------------------------------------------------------------- emotes

  emote(object: ObjectEvent, actionIndex: number): void {
    if (!fxData) return;
    const id = EMOTE_EFFECT_IDS[actionIndex];
    if (id === undefined) return;
    const anim = EMOTE_FROM_ACTION[actionIndex] ?? 0;
    const sprite = new Sprite();
    sprite.frameImages = Array.from({ length: 15 }, (_, i) => ({ url: `${DATA_ROOT}/${fxData!.emoticons.file}`, index: i, width: 16, height: 16 }));
    sprite.anims = EMOTE_ANIMS;
    sprite.width = 16;
    sprite.height = 16;
    sprite.centerToCornerVecX = -8;
    sprite.centerToCornerVecY = -8;
    this.SetIconSpriteData(sprite, object, id, anim);
    // The original active list can contain the same effect more than once.
    this.emoteCounts.set(id, (this.emoteCounts.get(id) ?? 0) + 1);
    this.active.add(id);
    sprite.callback = (s) => this.SpriteCB_TrainerIcons(s, id);
    this.ow.sprites.add(sprite);
  }

  private SetIconSpriteData(sprite: Sprite, object: ObjectEvent, fldEffId: number, spriteAnimNum: number): void {
    sprite.priority = 1;
    sprite.coordOffsetEnabled = true;
    sprite.data[0] = object.localId;
    sprite.data[1] = object.mapNum;
    sprite.data[2] = object.mapGroup;
    sprite.data[3] = -5;
    sprite.data[4] = 0;
    sprite.data[7] = fldEffId;
    sprite.subpriority = fldEffId === C.FLDEFF_EXCLAMATION_MARK_ICON ? 0x53 : 0x52;
    sprite.startAnim(spriteAnimNum);
  }

  private SpriteCB_TrainerIcons(sprite: Sprite, fldEffId: number): void {
    const object = this.ow.objects.byLocalIdAndMap(sprite.data[0]!, sprite.data[1]!, sprite.data[2]!);
    if (!object || sprite.animEnded) {
      const remaining = (this.emoteCounts.get(fldEffId) ?? 1) - 1;
      if (remaining > 0) this.emoteCounts.set(fldEffId, remaining);
      else { this.emoteCounts.delete(fldEffId); this.active.delete(fldEffId); }
      this.ow.sprites.destroy(sprite);
      return;
    }
    sprite.data[4] += sprite.data[3]!;
    sprite.x = object.sprite.x;
    sprite.y = object.sprite.y - 16;
    sprite.x2 = object.sprite.x2;
    sprite.y2 = object.sprite.y2 + sprite.data[4]!;
    if (sprite.data[4]) sprite.data[3]!++;
    else sprite.data[3] = 0;
  }

  private FldEff_ExclamationMarkIcon1(object: ObjectEvent): number { this.emote(object, 0); return 0; }
  private FldEff_DoubleExclMarkIcon(object: ObjectEvent): number { this.emote(object, 3); return 0; }
  private FldEff_XIcon(object: ObjectEvent): number { this.emote(object, 2); return 0; }
  private FldEff_SmileyFaceIcon(object: ObjectEvent): number { this.emote(object, 4); return 0; }
  private FldEff_QuestionMarkIcon(object: ObjectEvent): number { this.emote(object, 1); return 0; }

  /** FldEff_PopOutOfAsh / SpriteCB_PopOutOfAsh: source AshPuff template, priority 2. */
  popOutOfAsh(object: ObjectEvent, priority = 2): Sprite | undefined {
    return this.FldEff_PopOutOfAsh(object, priority);
  }

  FldEff_PopOutOfAsh(object: ObjectEvent, priority = 2): Sprite | undefined {
    const sprite = this.createFromTemplate("AshPuff", object.sprite.x, object.sprite.y);
    if (!sprite) return undefined;
    sprite.priority = priority;
    sprite.subpriority = object.sprite.subpriority - 1;
    this.active.add(C.FLDEFF_POP_OUT_OF_ASH);
    sprite.callback = (s) => this.SpriteCB_PopOutOfAsh(s);
    return sprite;
  }

  SpriteCB_PopOutOfAsh(sprite: Sprite): void {
    if (!sprite.animEnded) return;
    this.active.delete(C.FLDEFF_POP_OUT_OF_ASH);
    this.ow.sprites.destroy(sprite);
  }

  /** FldEff_LavaridgeGymWarp / SpriteCB_AshLaunch (field_effect.c). */
  startLavaridgeGymWarpEffect(object: ObjectEvent): Sprite | undefined {
    return this.FldEff_LavaridgeGymWarp(object);
  }

  FldEff_LavaridgeGymWarp(object: ObjectEvent): Sprite | undefined {
    const sprite = this.createFromTemplate("AshLaunch", object.sprite.x, object.sprite.y);
    if (!sprite) return undefined;
    sprite.priority = object.sprite.priority;
    sprite.subpriority = object.sprite.subpriority - 1;
    sprite.coordOffsetEnabled = true;
    this.active.add(C.FLDEFF_LAVARIDGE_GYM_WARP);
    sprite.callback = (s) => this.SpriteCB_AshLaunch(s);
    return sprite;
  }

  SpriteCB_AshLaunch(sprite: Sprite): void {
    if (!sprite.animEnded) return;
    this.active.delete(C.FLDEFF_LAVARIDGE_GYM_WARP);
    this.ow.sprites.destroy(sprite);
  }

  // ---------------------------------------------------------------- surf blob

  startSurfBlob(player: ObjectEvent, bobState = C.BOB_PLAYER_AND_MON): number {
    if (this.surfBlob && !this.surfBlob.destroyed) return this.ow.sprites.getId(this.surfBlob);
    const args = this.ow.game.fieldEffectArguments;
    args[0] = (player.currentCoords.x << 16) >> 16;
    args[1] = (player.currentCoords.y << 16) >> 16;
    args[2] = this.ow.objects.objects.indexOf(player);
    const spriteId = this.FldEff_SurfBlob();
    if (spriteId !== C.MAX_SPRITES) this.SetSurfBlob_BobState(spriteId, bobState);
    return spriteId;
  }

  /** FldEff_SurfBlob (field_effect_helpers.c). */
  FldEff_SurfBlob(): number {
    const args = this.ow.game.fieldEffectArguments;
    const x = (args[0]! << 16) >> 16;
    const y = (args[1]! << 16) >> 16;
    const playerObjectId = args[2]! & 0xff;
    const player = this.ow.objects.objects[playerObjectId];
    if (!player) {
      this.active.delete(C.FLDEFF_SURF_BLOB);
      return C.MAX_SPRITES;
    }
    const sprite = this.createFromTemplate("SurfBlob", x * 16 + 8, y * 16 + 8, true);
    if (!sprite) {
      this.active.delete(C.FLDEFF_SURF_BLOB);
      return C.MAX_SPRITES;
    }
    sprite.coordOffsetEnabled = true;
    sprite.subpriority = 0x96;
    sprite.data[2] = playerObjectId;
    sprite.data[3] = 0;
    sprite.data[6] = -1;
    sprite.data[7] = -1;
    sprite.callback = (s) => this.UpdateSurfBlobFieldEffect(s);
    this.surfBlob = sprite;
    player.fieldEffectSprite = sprite;
    this.active.delete(C.FLDEFF_SURF_BLOB);
    return this.ow.sprites.getId(sprite);
  }

  /** SetSurfBlob_BobState (field_effect_helpers.c). */
  SetSurfBlob_BobState(spriteId: number, bobState: number): void {
    const sprite = this.ow.sprites.getById(spriteId);
    if (sprite) sprite.data[0] = ((sprite.data[0]! & ~0xf) | (bobState & 0xf)) << 16 >> 16;
  }

  /** GetSurfBlob_BobState (field_effect_helpers.c). */
  GetSurfBlob_BobState(spriteId: number): number {
    return this.ow.sprites.getById(spriteId)?.data[0]! & 0xf;
  }

  /** SetSurfBlob_DontSyncAnim (field_effect_helpers.c). */
  SetSurfBlob_DontSyncAnim(spriteId: number, value: boolean): void {
    const sprite = this.ow.sprites.getById(spriteId);
    if (sprite) sprite.data[0] = ((sprite.data[0]! & ~0xf0) | ((Number(value) & 0xf) << 4)) << 16 >> 16;
  }

  /** GetSurfBlob_DontSyncAnim (field_effect_helpers.c). */
  GetSurfBlob_DontSyncAnim(spriteId: number): boolean {
    return (((this.ow.sprites.getById(spriteId)?.data[0] ?? 0) & 0xf0) >>> 4) !== 0;
  }

  /** SetSurfBlob_PlayerOffset (field_effect_helpers.c). */
  SetSurfBlob_PlayerOffset(spriteId: number, hasOffset: boolean, offset: number): void {
    const sprite = this.ow.sprites.getById(spriteId);
    if (!sprite) return;
    sprite.data[0] = ((sprite.data[0]! & ~0xf00) | ((Number(hasOffset) & 0xf) << 8)) << 16 >> 16;
    sprite.data[1] = (offset << 16) >> 16;
  }

  /** GetSurfBlob_HasPlayerOffset (field_effect_helpers.c). */
  GetSurfBlob_HasPlayerOffset(spriteId: number): boolean {
    return (((this.ow.sprites.getById(spriteId)?.data[0] ?? 0) & 0xf00) >>> 8) !== 0;
  }

  /** UpdateSurfBlobFieldEffect (field_effect_helpers.c). */
  UpdateSurfBlobFieldEffect(sprite: Sprite): void {
    const player = this.ow.objects.objects[sprite.data[2]! & 0xff];
    if (!player) return;
    this.SynchroniseSurfAnim(player, sprite);
    this.SynchroniseSurfPosition(player, sprite);
    this.CreateBobbingEffect(player, player.sprite, sprite);
    sprite.priority = player.sprite.priority;
  }

  /** SynchroniseSurfAnim (field_effect_helpers.c). */
  SynchroniseSurfAnim(objectEvent: ObjectEvent, sprite: Sprite): void {
    if (this.GetSurfBlob_DontSyncAnim(this.ow.sprites.getId(sprite))) return;
    const surfBlobDirectionAnims = [0, 0, 1, 2, 3];
    const anim = surfBlobDirectionAnims[objectEvent.movementDirection];
    if (anim !== undefined && sprite.animNum !== anim) sprite.startAnim(anim);
  }

  /** SynchroniseSurfPosition (field_effect_helpers.c). */
  SynchroniseSurfPosition(playerObject: ObjectEvent, surfBlobSprite: Sprite): void {
    let x = (playerObject.currentCoords.x << 16) >> 16;
    let y = (playerObject.currentCoords.y << 16) >> 16;
    if (surfBlobSprite.y2 !== 0 || (x === surfBlobSprite.data[6] && y === surfBlobSprite.data[7])) return;
    surfBlobSprite.data[5] = 0;
    surfBlobSprite.data[6] = x;
    surfBlobSprite.data[7] = y;
    for (const direction of [DIR_SOUTH, DIR_NORTH, DIR_WEST, DIR_EAST]) {
      const [dx, dy] = DIRECTION_VECTORS[direction]!;
      x = (surfBlobSprite.data[6]! + dx << 16) >> 16;
      y = (surfBlobSprite.data[7]! + dy << 16) >> 16;
      if (this.ow.map.elevationAt(x, y) === 3) {
        surfBlobSprite.data[5] = 1;
        break;
      }
    }
  }

  /** CreateBobbingEffect (field_effect_helpers.c). */
  CreateBobbingEffect(objectEvent: ObjectEvent, linkedSprite: Sprite, sprite: Sprite): void {
    const bobState = this.GetSurfBlob_BobState(this.ow.sprites.getId(sprite));
    if (bobState === C.BOB_NONE) return;
    sprite.data[4] = (sprite.data[4]! + 1) << 16 >> 16;
    const timer = sprite.data[4]! & 0xffff;
    const interval = sprite.data[5] ? 15 : 7;
    if ((timer & interval) === 0) sprite.y2 = (sprite.y2 + sprite.data[3]!) << 16 >> 16;
    if ((timer & 0x1f) === 0) sprite.data[3] = (-sprite.data[3]!) << 16 >> 16;
    if (bobState === C.BOB_MON_ONLY) return;
    const playerOffset = this.GetSurfBlob_HasPlayerOffset(this.ow.sprites.getId(sprite)) ? sprite.data[1]! : 0;
    linkedSprite.y2 = (playerOffset + sprite.y2 + (sprite.animCmdIndex !== 0 ? 1 : 0)) << 16 >> 16;
    sprite.x = linkedSprite.x;
    sprite.y = (linkedSprite.y + 8) << 16 >> 16;
  }

  /** SetSurfBlob_BobState wrapper used by TypeScript field-move callers. */
  setSurfBlobBobState(state: number): void {
    if (this.surfBlob) this.SetSurfBlob_BobState(this.ow.sprites.getId(this.surfBlob), state);
  }

  setSurfBlobDontSyncAnim(dontSync: boolean): void {
    if (this.surfBlob) this.SetSurfBlob_DontSyncAnim(this.ow.sprites.getId(this.surfBlob), dontSync);
  }

  /** SetSurfBlob_PlayerOffset wrapper used by fishing and Quest Log playback. */
  setSurfBlobPlayerOffset(hasOffset: boolean, offset: number): void {
    if (this.surfBlob) this.SetSurfBlob_PlayerOffset(this.ow.sprites.getId(this.surfBlob), hasOffset, offset);
  }

  setSurfBlobInvisible(invisible: boolean): void {
    if (this.surfBlob) this.surfBlob.invisible = invisible;
  }

  /** StartUnderwaterSurfBlobBobbing (field_effect_helpers.c). */
  StartUnderwaterSurfBlobBobbing(oldSpriteId: number): number {
    const sprite = new Sprite();
    sprite.subpriority = 0xff;
    this.ow.sprites.addAtEnd(sprite);
    const spriteId = this.ow.sprites.getId(sprite);
    if (spriteId === 0xff) return spriteId;
    sprite.callback = (s) => this.SpriteCB_UnderwaterSurfBlob(s);
    sprite.invisible = true;
    sprite.data[0] = oldSpriteId & 0xff;
    sprite.data[1] = 1;
    return spriteId;
  }

  /** SpriteCB_UnderwaterSurfBlob (field_effect_helpers.c). */
  SpriteCB_UnderwaterSurfBlob(sprite: Sprite): void {
    const oldSprite = this.ow.sprites.getById(sprite.data[0]! & 0xff);
    if (!oldSprite) return;
    const previousTimer = sprite.data[2]! & 0xffff;
    sprite.data[2] = (sprite.data[2]! + 1) << 16 >> 16;
    if ((previousTimer & 3) === 0) oldSprite.y2 = (oldSprite.y2 + sprite.data[1]!) << 16 >> 16;
    if ((sprite.data[2]! & 0xf) === 0) sprite.data[1] = (-sprite.data[1]!) << 16 >> 16;
  }

  destroySurfBlob(): void {
    if (this.surfBlob) this.ow.sprites.destroy(this.surfBlob);
    if (this.ow.player.object.fieldEffectSprite === this.surfBlob) this.ow.player.object.fieldEffectSprite = undefined;
    this.surfBlob = undefined;
    this.ow.player.object.sprite.y2 = 0;
  }

  // ---------------------------------------------------------------- strength

  /**
   * StartStrengthAnim + Task_BumpBoulder (field_player_avatar.c): sBoulderTaskSteps =
   * [DoBoulderInit, DoBoulderDust, DoBoulderFinish], stepped through by task->data[0]
   * (`state` here). DoBoulderInit's lock runs synchronously before the task is even
   * created, matching Task_BumpBoulder's tight while-loop calling it the same frame.
   */
  StartStrengthAnim(boulder: ObjectEvent, direction: number): void {
    const task = { id: -1, boulder, direction, state: 0 };
    this.DoBoulderInit();
    task.id = tasks.create(() => this.Task_BumpBoulder(task), 80);
    task.state++;
  }

  /** DoBoulderInit (field_player_avatar.c). */
  private DoBoulderInit(): void {
    this.ow.controlsLocked = true;
    this.ow.player.preventStep = true;
  }

  /** Task_BumpBoulder (field_player_avatar.c): dispatches its three task states. */
  private Task_BumpBoulder(task: { id: number; boulder: ObjectEvent; direction: number; state: number }): void {
    const player = this.ow.player.object;
    if (task.state === 1) {
      if (this.DoBoulderDust(player, task.boulder, task.direction)) task.state++;
    } else if (task.state === 2 && this.DoBoulderFinish(player, task.boulder)) {
      tasks.destroy(task.id);
    }
  }

  /** DoBoulderDust (field_player_avatar.c). */
  private DoBoulderDust(player: ObjectEvent, boulder: ObjectEvent, direction: number): boolean {
    if (this.ow.objects.isMovementOverridden(player) || this.ow.objects.isMovementOverridden(boulder)) return false;
    this.ow.objects.ObjectEventClearHeldMovementIfFinished(player);
    this.ow.objects.ObjectEventClearHeldMovementIfFinished(boulder);
    this.ow.player.QL_TryRecordPlayerStepWithDuration0(actionWalkInPlaceNormal(direction));
    this.ow.player.QL_TryRecordNPCStepWithDuration32(boulder, actionWalkSlower(direction));
    this.startBoulderDust(boulder);
    sound.playSE(sound.c("SE_M_STRENGTH"));
    return true;
  }

  /** DoBoulderFinish (field_player_avatar.c). */
  private DoBoulderFinish(player: ObjectEvent, boulder: ObjectEvent): boolean {
    if (!this.ow.objects.isHeldMovementFinished(player) || !this.ow.objects.isHeldMovementFinished(boulder)) return false;
    this.ow.objects.ObjectEventClearHeldMovementIfFinished(player);
    this.ow.objects.ObjectEventClearHeldMovementIfFinished(boulder);
    const b = this.ow.map.behaviorAt(boulder.currentCoords.x, boulder.currentCoords.y);
    HandleBoulderFallThroughHole(this.ow, boulder, b);
    HandleBoulderActivateVictoryRoadSwitch(this.ow, boulder.currentCoords.x, boulder.currentCoords.y, b);
    this.ow.player.preventStep = false;
    this.ow.controlsLocked = false;
    return true;
  }

  private startBoulderDust(boulder: ObjectEvent): void {
    const sprite = this.createFromTemplate("GroundImpactDust", boulder.currentCoords.x * 16 + 8, boulder.currentCoords.y * 16 + 12);
    if (!sprite) return;
    this.active.add(C.FLDEFF_DUST);
    sprite.priority = boulder.sprite.priority;
    sprite.subpriority = boulder.sprite.subpriority - 1;
    sprite.data[0] = boulder.previousElevation;
    sprite.data[1] = C.FLDEFF_DUST;
    sprite.callback = (s) => {
      if (s.animEnded) {
        this.active.delete(C.FLDEFF_DUST);
        this.ow.sprites.destroy(s);
      } else {
        s.subpriority = boulder.sprite.subpriority - 1;
      }
    };
  }

  // ---------------------------------------------------------------- flash / fade helpers

  renderBelow(_ctx: CanvasRenderingContext2D): void {}

  renderFlash(ctx: CanvasRenderingContext2D): void {
    const level = this.ow.flashLevel;
    if (!level && this.flashRadius === null) return;
    // field_screen_effect.c sFlashLevelToRadius (FireRed: 5 levels); an
    // AnimateFlash in progress draws its current radius instead.
    const r = this.flashRadius ?? FLASH_LEVEL_TO_RADIUS[Math.min(level, MAX_FLASH_LEVEL)];
    if (r >= 200) return;
    const boundaries = flashWindowBoundaries(120, 80, r);
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    for (let y = 0; y < boundaries.length; y++) {
      const left = boundaries[y] >>> 8;
      const right = boundaries[y] & 0xff;
      if (right <= left) ctx.rect(0, y, 240, 1);
      else {
        if (left > 0) ctx.rect(0, y, left, 1);
        if (right < 240) ctx.rect(right, y, 240 - right, 1);
      }
    }
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- step counters & encounters

  resetEncounterImmunity(): void {
    RestartWildEncounterImmunitySteps();
    this.encounterImmunitySteps = 0;
    this.previousMetatileBehavior = 0;
  }

  update(): void {}

  /** CheckForTrainersWantingBattle */
  checkForTrainersWantingBattle(): boolean {
    return this.ow.game.trainerSee?.checkForTrainersWantingBattle() ?? false;
  }

  tryStandardWildEncounter(attributes: number): boolean {
    return this.ow.game.wild?.tryStandardWildEncounter(attributes) ?? false;
  }

  updateRepelCounter(): boolean {
    const id = rom.c("VAR_REPEL_STEP_COUNT");
    let steps = varGet(id);
    if (steps === 0) return false;
    steps--;
    varSet(id, steps);
    if (steps === 0) {
      this.ow.script.ScriptContext_SetupScript(rom.label("EventScript_RepelWoreOff"));
      return true;
    }
    return false;
  }

  UpdatePoisonStepCounter(): boolean {
    if (this.ow.header.mapType === 9) return false;
    const id = rom.c("VAR_POISON_STEP_COUNTER");
    const value = (varGet(id) + 1) % 5;
    varSet(id, value);
    if (value !== 0) return false;
    return DoPoisonFieldEffect(() => this.FldEffPoison_Start()) === C.FLDPSN_FNT;
  }

  safariZoneTakeStep(): boolean {
    return SafariZoneTakeStep(this.ow.game, (script) => this.ow.script.ScriptContext_SetupScript(script));
  }
}

/** HandleBoulderFallThroughHole (field_control_avatar.c), called after a pushed boulder finishes. */
export function HandleBoulderFallThroughHole(ow: Overworld, object: ObjectEvent, metatileBehavior = ow.map.behaviorAt(object.currentCoords.x, object.currentCoords.y)): void {
  if (metatileBehavior !== C.MB_FALL_WARP) return;
  sound.playSE(sound.c("SE_FALL"));
  ow.objects.RemoveObjectEventByLocalIdAndMap(object.localId, ow.objects.mapNum, ow.objects.mapGroup);
  flagClear(ow.objects.GetBoulderRevealFlagByLocalIdAndMap(object.localId, ow.objects.mapNum, ow.objects.mapGroup));
}

/** HandleBoulderActivateVictoryRoadSwitch (field_control_avatar.c). */
export function HandleBoulderActivateVictoryRoadSwitch(ow: Overworld, x: number, y: number, metatileBehavior = ow.map.behaviorAt(x, y)): void {
  if (metatileBehavior !== C.MB_STRENGTH_BUTTON) return;
  for (const event of ow.header.coords) {
    if (event.x + MAP_OFFSET !== x || event.y + MAP_OFFSET !== y) continue;
    QuestLog_CutRecording();
    ow.script.ScriptContext_SetupScript(event.script);
    ow.controlsLocked = true;
  }
}

export { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST, DIRECTION_VECTORS };
