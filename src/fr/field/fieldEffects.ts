// Field effects (field_effect_helpers.c, trainer_see.c emoticons, ground
// effects from event_object_movement.c) plus the step-driven encounter hooks.
// Includes the poison mosaic task from fldeff_poison.c.

import * as MB from "../generated/metatileBehavior";
import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { Sprite, loadImage } from "../gba/sprite";
import { tasks } from "../gba/tasks";
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
  private shortGrassEffects = new WeakMap<ObjectEvent, Sprite>();
  private hotSpringsEffects = new WeakMap<ObjectEvent, Sprite>();
  private sandPileEffects = new WeakMap<ObjectEvent, Sprite>();
  private surfBlobBobState = C.BOB_NONE;
  private surfBlobHasPlayerOffset = false;
  private surfBlobPlayerOffset = 0;
  private encounterImmunitySteps = 0;
  private previousMetatileBehavior = 0;
  /** Active field effect ids (FieldEffectActiveListContains) */
  readonly active = new Set<number>();
  private readonly emoteCounts = new Map<number, number>();
  private readonly disguiseSprites = new WeakMap<ObjectEvent, Sprite>();
  private readonly reflectionSprites = new Map<ObjectEvent, Sprite>();
  private readonly deoxysRockObjects = new Map<number, ObjectEvent>();
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

  /** FieldEffectStart: marks the effect active and runs its script. */
  start(id: number): void {
    this.active.add(id);
    const handler = this.handlers.get(id);
    if (handler) { handler(); return; }
    if (id === C.FLDEFF_MOVE_DEOXYS_ROCK) { this.FldEff_MoveDeoxysRock(); return; }
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
    this.surfBlob = undefined;
    this.surfBlobHasPlayerOffset = false;
    this.surfBlobPlayerOffset = 0;
    this.flowingWaterEffects = new WeakMap<ObjectEvent, Sprite>();
    this.shortGrassEffects = new WeakMap<ObjectEvent, Sprite>();
    this.hotSpringsEffects = new WeakMap<ObjectEvent, Sprite>();
    this.sandPileEffects = new WeakMap<ObjectEvent, Sprite>();
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

  createFromTemplate(name: string, x: number, y: number): Sprite | undefined {
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
    this.ow.sprites.add(sprite);
    return sprite;
  }

  /** ShowTreeDisguiseFieldEffect / ShowMountainDisguiseFieldEffect. */
  StartDisguiseFieldEffect(object: ObjectEvent, kind: "tree" | "mountain"): void {
    const id = kind === "tree" ? C.FLDEFF_TREE_DISGUISE : C.FLDEFF_MOUNTAIN_DISGUISE;
    const sprite = this.createFromTemplate(kind === "tree" ? "TreeDisguise" : "MountainDisguise", 0, 0);
    if (!sprite) return;
    sprite.coordOffsetEnabled = object.sprite.coordOffsetEnabled;
    sprite.priority = object.sprite.priority;
    sprite.subpriority = object.sprite.subpriority - 1;
    sprite.data[1] = id;
    sprite.data[2] = object.localId;
    sprite.data[3] = object.mapNum;
    sprite.data[4] = object.mapGroup;
    sprite.data[0] = 0;
    sprite.callback = (s) => this.UpdateDisguiseFieldEffect(s, object);
    this.disguiseSprites.set(object, sprite);
    this.active.add(id);
  }

  /** UpdateDisguiseFieldEffect; the disguise follows its linked object sprite. */
  private UpdateDisguiseFieldEffect(sprite: Sprite, object: ObjectEvent): void {
    if (!object.active) {
      this.ow.sprites.destroy(sprite);
      this.active.delete(sprite.data[1]);
      return;
    }
    sprite.invisible = object.sprite.invisible;
    sprite.x = object.sprite.x;
    sprite.y = (object.sprite.height >> 1) + object.sprite.y - 16;
    sprite.subpriority = object.sprite.subpriority - 1;
    if (sprite.data[0] === 1) {
      sprite.data[0]++;
      sprite.startAnim(1);
    }
    if (sprite.data[0] === 2 && sprite.animEnded) sprite.data[7] = 1;
    if (sprite.data[0] === 3) {
      this.ow.sprites.destroy(sprite);
      this.active.delete(sprite.data[1]);
    }
  }

  /** StartRevealDisguise (field_effect_helpers.c). */
  StartRevealDisguise(object: ObjectEvent): void {
    if (object.directionSequenceIndex === 1) {
      const sprite = this.disguiseSprites.get(object);
      if (sprite) sprite.data[0]++;
    }
  }

  /** UpdateRevealDisguise (field_effect_helpers.c). */
  UpdateRevealDisguise(object: ObjectEvent): boolean {
    if (object.directionSequenceIndex === 2 || object.directionSequenceIndex === 0) return true;
    const sprite = this.disguiseSprites.get(object);
    if (sprite?.data[7]) {
      object.directionSequenceIndex = 2;
      sprite.data[0]++;
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
    if (kind !== "finish") this.updateObjectReflection(object);
    if (!fxData) return;
    const cur = object.currentMetatileBehavior;
    const prev = object.previousMetatileBehavior;
    const isShallowFlowing = MB.MetatileBehavior_IsShallowFlowingWater(cur)
      && MB.MetatileBehavior_IsShallowFlowingWater(prev);
    const isShortGrass = MB.MetatileBehavior_IsShortGrass(cur) && MB.MetatileBehavior_IsShortGrass(prev);
    const isHotSprings = MB.MetatileBehavior_IsHotSprings(cur) && MB.MetatileBehavior_IsHotSprings(prev);
    const isSandPile = MB.MetatileBehavior_IsDeepSand(cur) && MB.MetatileBehavior_IsDeepSand(prev);
    if (object.disableCoveringGroundEffects) {
      object.inShortGrass = false;
      object.inHotSprings = false;
      object.inShallowFlowingWater = false;
      object.inSandPile = false;
    } else {
      if (isShortGrass && !object.inShortGrass) {
        object.inShortGrass = true;
        this.GroundEffect_ShortGrass(object);
      } else if (!isShortGrass) object.inShortGrass = false;
      if (isHotSprings && !object.inHotSprings) {
        object.inHotSprings = true;
        this.GroundEffect_HotSprings(object);
      } else if (!isHotSprings) object.inHotSprings = false;
      if (isSandPile && !object.inSandPile) {
        object.inSandPile = true;
        this.GroundEffect_SandHeap(object);
      } else if (!isSandPile) object.inSandPile = false;
    }
    if (isShallowFlowing && !object.disableCoveringGroundEffects && !object.inShallowFlowingWater) {
      object.inShallowFlowingWater = true;
      this.GroundEffect_FlowingWater(object);
    } else if (!isShallowFlowing || object.disableCoveringGroundEffects) {
      object.inShallowFlowingWater = false;
    }
    if (kind === "begin") {
      if (MB.MetatileBehavior_IsTallGrass(cur)) this.spawnTallGrass(object, false);
      if (MB.MetatileBehavior_IsLongGrass(cur)) this.spawnLongGrass(object);
      if (object.hasShadow) this.spawnShadow(object);
      if (MB.MetatileBehavior_IsDeepSand(prev)) this.GroundEffect_DeepSandTracks(object);
      else if (MB.MetatileBehavior_IsSand(prev) || MB.MetatileBehavior_IsFootprints(prev)) this.GroundEffect_SandTracks(object);
      if (!object.landingJump && MB.MetatileBehavior_IsPuddle(cur) && MB.MetatileBehavior_IsPuddle(prev)) this.GroundEffect_StepOnPuddle(object);
    } else if (kind === "finish") {
      if (object.landingJump && !object.disableJumpLandingGroundEffect) this.spawnJumpLanding(object);
      else if (object.landingJump && object.isPlayer) this.spawnJumpLanding(object);
      if (MB.MetatileBehavior_HasRipples(cur)) this.GroundEffect_Ripple(object);
      if (MB.MetatileBehavior_IsSeaweed(cur)) this.GroundEffect_Seaweed(object);
    } else if (kind === "spawn") {
      if (MB.MetatileBehavior_IsTallGrass(cur)) this.spawnTallGrass(object, true);
    }
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

  /** Scans the two metatile rows beneath the current and previous object tile. */
  private objectReflectionType(object: ObjectEvent): number {
    const positions = [object.currentCoords, object.previousCoords];
    for (let yOffset = 1; yOffset <= 2; yOffset++) {
      for (const position of positions) {
        const x = (position.x << 16) >> 16;
        const y = ((position.y + yOffset) << 16) >> 16;
        const behavior = this.ow.map.behaviorAt(x, y);
        if (MB.MetatileBehavior_IsIce(behavior)) return 1;
        if (MB.MetatileBehavior_IsReflective(behavior)) return 2;
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
    const sprite = this.createFromTemplate("ShortGrass", object.sprite.x, object.sprite.y);
    if (!sprite) return;
    sprite.coordOffsetEnabled = true;
    sprite.priority = object.sprite.priority;
    sprite.subpriority = object.sprite.subpriority - 1;
    sprite.data[0] = object.localId;
    sprite.data[1] = object.mapNum;
    sprite.data[2] = object.mapGroup;
    sprite.data[3] = object.sprite.x;
    sprite.data[4] = object.sprite.y;
    sprite.callback = (s) => {
      if (!object.active || !object.inShortGrass) {
        this.ow.sprites.destroy(s);
        if (this.shortGrassEffects.get(object) === s) this.shortGrassEffects.delete(object);
        return;
      }
      const moved = s.data[3] !== object.sprite.x || s.data[4] !== object.sprite.y;
      if (moved) {
        s.data[3] = object.sprite.x;
        s.data[4] = object.sprite.y;
        if (s.animEnded) s.startAnim(0);
      }
      s.x = object.sprite.x;
      s.y = object.sprite.y;
      s.y2 = (object.sprite.height >> 1) - 8;
      s.subpriority = object.sprite.subpriority - 1;
      s.priority = object.sprite.priority;
      s.invisible = object.sprite.invisible;
    };
    this.shortGrassEffects.set(object, sprite);
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

  /** GroundEffect_SandHeap / FldEff_SandPile. */
  GroundEffect_SandHeap(object: ObjectEvent): void {
    const sprite = this.createFromTemplate("SandPile", object.sprite.x, object.sprite.y);
    if (!sprite) return;
    sprite.coordOffsetEnabled = true;
    sprite.priority = object.sprite.priority;
    sprite.subpriority = object.sprite.subpriority;
    sprite.y2 = (object.sprite.height >> 1) - 2;
    sprite.data[0] = object.localId;
    sprite.data[1] = object.mapNum;
    sprite.data[2] = object.mapGroup;
    sprite.data[3] = object.sprite.x;
    sprite.data[4] = object.sprite.y;
    sprite.seekAnim(2);
    sprite.callback = (s) => {
      if (!object.active || !object.inSandPile) {
        this.ow.sprites.destroy(s);
        if (this.sandPileEffects.get(object) === s) this.sandPileEffects.delete(object);
        return;
      }
      const moved = s.data[3] !== object.sprite.x || s.data[4] !== object.sprite.y;
      if (moved) {
        s.data[3] = object.sprite.x;
        s.data[4] = object.sprite.y;
        if (s.animEnded) s.startAnim(0);
      }
      s.x = object.sprite.x;
      s.y = object.sprite.y;
      s.subpriority = object.sprite.subpriority;
      s.invisible = object.sprite.invisible;
    };
    this.sandPileEffects.set(object, sprite);
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

  private spawnTallGrass(object: ObjectEvent, skipAnim: boolean): void {
    const x = object.currentCoords.x;
    const y = object.currentCoords.y;
    const sprite = this.createFromTemplate("TallGrass", x * 16 + 8, y * 16 + 8);
    if (!sprite) return;
    (sprite as unknown as { fxTile: boolean }).fxTile = true;
    sprite.priority = object.sprite.priority;
    sprite.subpriority = object.sprite.subpriority - 1;
    sprite.data[1] = x;
    sprite.data[2] = y;
    sprite.data[7] = 0;
    if (skipAnim) sprite.seekAnim(4);
    sprite.callback = (s) => {
      const still = object.active && ((object.currentCoords.x === s.data[1] && object.currentCoords.y === s.data[2]) || (object.previousCoords.x === s.data[1] && object.previousCoords.y === s.data[2]));
      if (!still) s.data[7] = 1;
      if (!object.active || !MB.MetatileBehavior_IsTallGrass(this.ow.map.behaviorAt(s.data[1], s.data[2])) || (s.data[7] && s.animEnded)) {
        this.ow.sprites.destroy(s);
        return;
      }
      s.priority = object.sprite.priority;
      s.subpriority = object.sprite.subpriority - 1;
    };
  }

  private spawnLongGrass(object: ObjectEvent): void {
    const sprite = this.createFromTemplate("LongGrass", object.currentCoords.x * 16 + 8, object.currentCoords.y * 16 + 8);
    if (!sprite) return;
    sprite.priority = object.sprite.priority;
    sprite.subpriority = object.sprite.subpriority - 1;
    const x = object.currentCoords.x, y = object.currentCoords.y;
    sprite.callback = (s) => {
      if (!object.active || (s.animEnded && (object.currentCoords.x !== x || object.currentCoords.y !== y))) this.ow.sprites.destroy(s);
      else s.subpriority = object.sprite.subpriority - 1;
    };
  }

  private spawnShadow(object: ObjectEvent): void {
    const raw = rom.objects.gfx[String(object.graphicsId)];
    const size = raw?.shadowSize ?? "SHADOW_SIZE_M";
    const sprite = this.createFromTemplate(SHADOW_TEMPLATES[size] ?? "ShadowMedium", object.sprite.x, object.sprite.y);
    if (!sprite) return;
    sprite.priority = object.sprite.priority;
    sprite.subpriority = object.sprite.subpriority + 1;
    const offset = (object.sprite.height >> 1) - (SHADOW_OFFSETS[size] ?? 4);
    sprite.callback = (s) => {
      s.priority = object.sprite.priority;
      s.subpriority = object.sprite.subpriority + 1;
      s.x = object.sprite.x;
      s.y = object.sprite.y + offset;
      const jumping = object.heldMovementActive && !object.heldMovementFinished && object.sprite.y2 !== 0;
      if (!object.active || !object.hasShadow || (!jumping && object.sprite.data[2] !== 1)) this.ow.sprites.destroy(s);
    };
  }

  private spawnJumpLanding(object: ObjectEvent): void {
    const b = object.currentMetatileBehavior;
    if (MB.MetatileBehavior_IsShallowFlowingWater?.(b)) { this.FldEff_JumpSmallSplash(object); return; }
    if (MB.MetatileBehavior_IsSurfable(b)) { this.FldEff_JumpBigSplash(object); return; }
    if (MB.MetatileBehavior_IsPuddle?.(b)) { this.FldEff_JumpSmallSplash(object); return; }
    if (!MB.MetatileBehavior_IsTallGrass(b) && !MB.MetatileBehavior_IsLongGrass(b)) {
      this.FldEff_Dust(object);
      return;
    }
    const name = MB.MetatileBehavior_IsTallGrass(b) ? "JumpTallGrass" : "JumpLongGrass";
    const yOff = 12;
    const sprite = this.createFromTemplate(name, object.currentCoords.x * 16 + 8, object.currentCoords.y * 16 + yOff);
    if (!sprite) return;
    sprite.priority = object.sprite.priority;
    sprite.subpriority = object.sprite.subpriority - 1;
    sprite.callback = (s) => { if (s.animEnded) this.ow.sprites.destroy(s); else s.subpriority = object.sprite.subpriority - 1; };
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

  private spawnFootprints(object: ObjectEvent): void {
    const tracks = rom.objects.gfx[String(object.graphicsId)]?.tracks;
    if (tracks !== "TRACKS_FOOT") return;
    const deepSand = MB.MetatileBehavior_IsDeepSand(object.previousMetatileBehavior);
    const sprite = this.createFromTemplate(deepSand ? "DeepSandFootprints" : "SandFootprints", object.previousCoords.x * 16 + 8, object.previousCoords.y * 16 + 8);
    if (!sprite) return;
    sprite.priority = 2;
    sprite.startAnim(object.facingDirection);
    sprite.subpriority = 149;
    this.initTracksFade(sprite);
  }

  /** GroundEffect_SandTracks (event_object_movement.c). */
  GroundEffect_SandTracks(object: ObjectEvent): void {
    if (rom.objects.gfx[String(object.graphicsId)]?.tracks === "TRACKS_BIKE_TIRE") this.spawnBikeTireTracks(object);
    else this.spawnFootprints(object);
  }

  /** GroundEffect_DeepSandTracks (event_object_movement.c). */
  GroundEffect_DeepSandTracks(object: ObjectEvent): void {
    if (rom.objects.gfx[String(object.graphicsId)]?.tracks === "TRACKS_BIKE_TIRE") this.spawnBikeTireTracks(object);
    else this.spawnFootprints(object);
  }

  private spawnBikeTireTracks(object: ObjectEvent): void {
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
    const sprite = this.createFromTemplate("BikeTireTracks", object.previousCoords.x * 16 + 8, object.previousCoords.y * 16 + 8);
    if (!sprite) return;
    sprite.coordOffsetEnabled = true;
    sprite.priority = 2;
    sprite.subpriority = 149;
    sprite.data[7] = C.FLDEFF_BIKE_TIRE_TRACKS;
    sprite.startAnim(animation);
    this.initTracksFade(sprite);
  }

  /** UpdateFootprintsTireTracksFieldEffect / FadeFootprintsTireTracks_Step0/1. */
  private initTracksFade(sprite: Sprite): void {
    sprite.data[0] = 0;
    sprite.data[1] = 0;
    sprite.callback = (s) => {
      if (s.data[0] === 0) {
        s.data[1] = (s.data[1]! + 1) & 0xffff;
        if (s.data[1]! > 40) s.data[0] = 1;
        this.UpdateObjectEventSpriteInvisibility(s, false);
      } else {
        s.invisible = !s.invisible;
        s.data[1] = (s.data[1]! + 1) & 0xffff;
        this.UpdateObjectEventSpriteInvisibility(s, s.invisible);
        if (s.data[1]! > 56) this.ow.sprites.destroy(s);
      }
    };
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
  popOutOfAsh(object: ObjectEvent): Sprite | undefined {
    const sprite = this.createFromTemplate("AshPuff", object.sprite.x, object.sprite.y);
    if (!sprite) return undefined;
    sprite.priority = 2;
    sprite.subpriority = object.sprite.subpriority - 1;
    this.active.add(C.FLDEFF_POP_OUT_OF_ASH);
    sprite.callback = (s) => {
      if (!s.animEnded) return;
      this.active.delete(C.FLDEFF_POP_OUT_OF_ASH);
      this.ow.sprites.destroy(s);
    };
    return sprite;
  }

  // ---------------------------------------------------------------- surf blob

  startSurfBlob(player: ObjectEvent, bobState = C.BOB_PLAYER_AND_MON): void {
    if (this.surfBlob && !this.surfBlob.destroyed) return;
    const sprite = this.createFromTemplate("SurfBlob", player.sprite.x, player.sprite.y + 8);
    if (!sprite) return;
    this.surfBlob = sprite;
    this.surfBlobBobState = bobState;
    sprite.data[3] = 0; // sBobDirection
    sprite.data[4] = 0; // sTimer
    sprite.data[5] = 0;
    sprite.data[6] = -1;
    sprite.data[7] = -1;
    sprite.callback = (s) => {
      const dir = player.movementDirection;
      const anim = [0, 0, 1, 2, 3][dir] ?? 0;
      if (s.animNum !== anim) s.startAnim(anim);
      s.priority = player.sprite.priority;
      s.subpriority = player.sprite.subpriority + 1;
      if (s.y2 === 0 && (player.currentCoords.x !== s.data[6] || player.currentCoords.y !== s.data[7])) {
        s.data[5] = 0;
        s.data[6] = player.currentCoords.x;
        s.data[7] = player.currentCoords.y;
        for (const direction of [DIR_SOUTH, DIR_NORTH, DIR_WEST, DIR_EAST]) {
          const [dx, dy] = DIRECTION_VECTORS[direction]!;
          if (this.ow.map.elevationAt(player.currentCoords.x + dx, player.currentCoords.y + dy) === 3) { s.data[5] = 1; break; }
        }
      }
      if (this.surfBlobBobState !== C.BOB_NONE) {
        s.data[4] = (s.data[4] + 1) & 0xffff;
        const interval = s.data[5] === 0 ? 7 : 15;
        if ((s.data[4] & interval) === 0) s.y2 += s.data[3];
        if ((s.data[4] & 0x1f) === 0) s.data[3] = -s.data[3];
        if (this.surfBlobBobState !== C.BOB_MON_ONLY) {
          player.sprite.y2 = (this.surfBlobHasPlayerOffset ? this.surfBlobPlayerOffset : 0)
            + s.y2 + (s.animCmdIndex !== 0 ? 1 : 0);
          s.x = player.sprite.x;
          s.y = player.sprite.y + 8;
        }
      }
    };
  }

  setSurfBlobBobState(state: number): void { this.surfBlobBobState = state & 0xf; }

  /** SetSurfBlob_PlayerOffset: retain fishing's frame-specific offset over bobbing. */
  setSurfBlobPlayerOffset(hasOffset: boolean, offset: number): void {
    if (!this.surfBlob) return;
    this.surfBlobHasPlayerOffset = hasOffset;
    this.surfBlobPlayerOffset = (offset << 16) >> 16;
  }

  setSurfBlobInvisible(invisible: boolean): void {
    if (this.surfBlob) this.surfBlob.invisible = invisible;
  }

  destroySurfBlob(): void {
    if (this.surfBlob) this.ow.sprites.destroy(this.surfBlob);
    this.surfBlob = undefined;
    this.surfBlobBobState = C.BOB_NONE;
    this.surfBlobHasPlayerOffset = false;
    this.surfBlobPlayerOffset = 0;
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
  ow.objects.remove(object);
  flagClear(object.trainerType);
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
