// Field effects (field_effect_helpers.c, trainer_see.c emoticons, ground
// effects from event_object_movement.c) plus the step-driven encounter hooks.

import * as MB from "../generated/metatileBehavior";
import { sound } from "../audio/sound";
import { Sprite, loadImage } from "../gba/sprite";
import { tasks } from "../gba/tasks";
import { DATA_ROOT, rom, type AnimCmd } from "../rom";
import { flagGet, save, varGet, varSet } from "../save";
import { DIRECTION_VECTORS, DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST, type ObjectEvent } from "./objectEvents";
import type { Overworld } from "./overworld";

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

export class FieldEffects {
  readonly tasks = tasks;
  private surfBlob?: Sprite;
  private surfBlobDetached = false;
  private encounterImmunitySteps = 0;
  private previousMetatileBehavior = 0;
  /** Active field effect ids (FieldEffectActiveListContains) */
  readonly active = new Set<number>();
  /** Registered handlers for FLDEFF_* ids (field moves, etc.) */
  readonly handlers = new Map<number, () => void>();
  flashOverlay = 0;

  constructor(private readonly ow: Overworld) {
    void loadFieldFx();
  }

  reset(): void {
    this.surfBlob = undefined;
    this.active.clear();
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

  // ---------------------------------------------------------------- ground effects

  groundEffect(object: ObjectEvent, kind: "spawn" | "begin" | "finish"): void {
    if (!fxData) return;
    const cur = object.currentMetatileBehavior;
    const prev = object.previousMetatileBehavior;
    if (kind === "begin") {
      if (MB.MetatileBehavior_IsTallGrass(cur)) this.spawnTallGrass(object, false);
      if (MB.MetatileBehavior_IsLongGrass(cur)) this.spawnLongGrass(object);
      if (object.landingJump || object.movementActionId >= 0x14 && object.movementActionId <= 0x17 || object.movementActionId >= 0x4e && object.movementActionId <= 0x51) {
        this.spawnShadow(object);
      }
      if (MB.MetatileBehavior_IsDeepSand(prev) || MB.MetatileBehavior_IsSand(prev)) this.spawnFootprints(object);
    } else if (kind === "finish") {
      if (object.landingJump && !object.disableJumpLandingGroundEffect) this.spawnJumpLanding(object);
      else if (object.landingJump && object.isPlayer) this.spawnJumpLanding(object);
    } else if (kind === "spawn") {
      if (MB.MetatileBehavior_IsTallGrass(cur)) this.spawnTallGrass(object, true);
    }
  }

  private spawnTallGrass(object: ObjectEvent, skipAnim: boolean): void {
    const x = object.currentCoords.x;
    const y = object.currentCoords.y;
    const sprite = this.createFromTemplate("TallGrass", x * 16 + 8, y * 16 + 8);
    if (!sprite) return;
    (sprite as unknown as { fxTile: boolean }).fxTile = true;
    sprite.priority = object.sprite.priority;
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
    const offset = (object.sprite.height >> 1) - (SHADOW_OFFSETS[size] ?? 4);
    sprite.callback = (s) => {
      s.priority = object.sprite.priority;
      s.subpriority = object.sprite.subpriority + 1;
      s.x = object.sprite.x;
      s.y = object.sprite.y + offset;
      const jumping = object.heldMovementActive && !object.heldMovementFinished && object.sprite.y2 !== 0;
      if (!object.active || (!jumping && object.sprite.data[2] !== 1)) this.ow.sprites.destroy(s);
    };
  }

  private spawnJumpLanding(object: ObjectEvent): void {
    const b = object.currentMetatileBehavior;
    let name = "GroundImpactDust";
    let yOff = 12;
    if (MB.MetatileBehavior_IsTallGrass(b)) name = "JumpTallGrass";
    else if (MB.MetatileBehavior_IsLongGrass(b)) name = "JumpLongGrass";
    else if (MB.MetatileBehavior_IsShallowFlowingWater?.(b)) name = "JumpSmallSplash";
    else if (MB.MetatileBehavior_IsSurfable(b)) name = "JumpBigSplash";
    else if (MB.MetatileBehavior_IsPuddle?.(b)) name = "JumpSmallSplash";
    if (name === "GroundImpactDust") yOff = 12;
    const sprite = this.createFromTemplate(name, object.currentCoords.x * 16 + 8, object.currentCoords.y * 16 + yOff);
    if (!sprite) return;
    sprite.priority = object.sprite.priority;
    sprite.callback = (s) => { if (s.animEnded) this.ow.sprites.destroy(s); else s.subpriority = object.sprite.subpriority - 1; };
  }

  private spawnFootprints(object: ObjectEvent): void {
    const sprite = this.createFromTemplate("SandFootprints", object.previousCoords.x * 16 + 8, object.previousCoords.y * 16 + 8);
    if (!sprite) return;
    sprite.priority = object.sprite.priority;
    sprite.startAnim(Math.max(0, object.movementDirection - 1) & 3);
    sprite.subpriority = 0xff;
    let timer = 0;
    sprite.callback = (s) => {
      timer++;
      if (timer > 40) s.invisible = (timer & 1) === 1;
      if (timer > 56) this.ow.sprites.destroy(s);
    };
  }

  // ---------------------------------------------------------------- emotes

  emote(object: ObjectEvent, actionIndex: number): void {
    if (!fxData) return;
    const anim = EMOTE_FROM_ACTION[actionIndex] ?? 0;
    const sprite = new Sprite();
    sprite.frameImages = Array.from({ length: 15 }, (_, i) => ({ url: `${DATA_ROOT}/${fxData!.emoticons.file}`, index: i, width: 16, height: 16 }));
    sprite.anims = EMOTE_ANIMS;
    sprite.width = 16;
    sprite.height = 16;
    sprite.centerToCornerVecX = -8;
    sprite.centerToCornerVecY = -8;
    sprite.priority = 1;
    sprite.subpriority = 0x52;
    sprite.data[3] = -5;
    sprite.data[4] = 0;
    sprite.startAnim(anim);
    const id = 0x100 + actionIndex;
    this.active.add(id);
    sprite.callback = (s) => {
      if (!object.active || s.animEnded) {
        this.active.delete(id);
        this.ow.sprites.destroy(s);
        return;
      }
      s.data[4] += s.data[3];
      s.x = object.sprite.x;
      s.y = object.sprite.y - 16;
      s.x2 = object.sprite.x2;
      s.y2 = object.sprite.y2 + s.data[4];
      if (s.data[4]) s.data[3]++;
      else s.data[3] = 0;
    };
    this.ow.sprites.add(sprite);
  }

  // ---------------------------------------------------------------- surf blob

  startSurfBlob(player: ObjectEvent, detached = false): void {
    if (this.surfBlob && !this.surfBlob.destroyed) return;
    const sprite = this.createFromTemplate("SurfBlob", player.sprite.x, player.sprite.y + 8);
    if (!sprite) return;
    this.surfBlob = sprite;
    this.surfBlobDetached = detached;
    sprite.data[5] = 0;
    sprite.data[6] = -1;
    sprite.data[7] = -1;
    let timer = 0;
    let bob = 1;
    sprite.callback = (s) => {
      const dir = player.movementDirection;
      const anim = [0, 0, 1, 2, 3][dir] ?? 0;
      if (s.animNum !== anim) s.startAnim(anim);
      s.priority = player.sprite.priority;
      s.subpriority = player.sprite.subpriority + 1;
      if (this.surfBlobDetached) return;
      if ((++timer & 7) === 0) s.y2 += bob;
      if ((timer & 0x1f) === 0) bob = -bob;
      player.sprite.y2 = s.y2 + (s.animCmdIndex !== 0 ? 1 : 0);
      s.x = player.sprite.x;
      s.y = player.sprite.y + 8;
    };
  }

  detachSurfBlob(): void { this.surfBlobDetached = true; }
  attachSurfBlob(): void { this.surfBlobDetached = false; }

  destroySurfBlob(): void {
    if (this.surfBlob) this.ow.sprites.destroy(this.surfBlob);
    this.surfBlob = undefined;
    this.ow.player.object.sprite.y2 = 0;
  }

  // ---------------------------------------------------------------- strength

  startStrengthPush(boulder: ObjectEvent, direction: number): void {
    const player = this.ow.player.object;
    this.ow.controlsLocked = true;
    this.ow.player.preventStep = true;
    let state = 0;
    const id = tasks.create(() => {
      switch (state) {
        case 0:
          if (this.ow.objects.isHeldMovementFinished(player) && this.ow.objects.isHeldMovementFinished(boulder)) {
            this.ow.objects.clearHeldMovementIfFinished(player);
            this.ow.objects.clearHeldMovementIfFinished(boulder);
            this.ow.objects.setHeldMovement(player, 0x29 + direction - 1);
            this.ow.objects.setHeldMovement(boulder, 0x3d + direction - 1 - 0x3d + 0x10);
            sound.playSE(sound.c("SE_M_STRENGTH"));
            state = 1;
          }
          break;
        case 1:
          if (this.ow.objects.isHeldMovementFinished(player) && this.ow.objects.isHeldMovementFinished(boulder)) {
            this.ow.objects.clearHeldMovementIfFinished(player);
            this.ow.objects.clearHeldMovementIfFinished(boulder);
            this.ow.player.preventStep = false;
            this.ow.controlsLocked = false;
            const b = this.ow.map.behaviorAt(boulder.currentCoords.x, boulder.currentCoords.y);
            if (b === rom.constants.MB_FALL_WARP) {
              sound.playSE(sound.c("SE_FALL"));
              this.ow.objects.remove(boulder);
            }
            tasks.destroy(id);
          }
          break;
      }
    }, 80);
  }

  // ---------------------------------------------------------------- flash / fade helpers

  renderBelow(_ctx: CanvasRenderingContext2D): void {}

  renderFlash(ctx: CanvasRenderingContext2D): void {
    const level = this.ow.flashLevel;
    if (!level) return;
    // Flash radius shrinks with the level (field_screen_effect.c sFlashLevelToRadius)
    const radii = [200, 72, 64, 56, 48, 40, 32, 24, 0];
    const r = radii[Math.min(level, 8)];
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.rect(0, 0, 240, 160);
    ctx.arc(120, 80, r, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();
  }

  // ---------------------------------------------------------------- step counters & encounters

  resetEncounterImmunity(): void {
    this.ow.game.wild?.resetEncounterRateModifiers();
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
      this.ow.script.setupScript(rom.label("EventScript_RepelWoreOff"));
      return true;
    }
    return false;
  }

  updatePoisonStepCounter(): boolean {
    if (this.ow.header.mapType === 9) return false;
    const id = rom.c("VAR_POISON_STEP_COUNTER");
    const value = (varGet(id) + 1) % 5;
    varSet(id, value);
    if (value !== 0) return false;
    let fainted = false;
    let anyPoisoned = false;
    for (const mon of save.party) {
      if (!mon.species) continue;
      if ((mon.status & 0x88) !== 0) { // STATUS1_POISON | STATUS1_TOXIC_POISON
        anyPoisoned = true;
        mon.hp = Math.max(0, mon.hp - 1);
        if (mon.hp === 0) fainted = true;
      }
    }
    if (anyPoisoned) {
      this.flashOverlay = 4;
      sound.playSE(sound.c("SE_FIELD_POISON"));
    }
    if (fainted) return true;
    void flagGet;
    return false;
  }

  safariZoneTakeStep(): boolean {
    if (!flagGet(rom.constants.FLAG_SYS_SAFARI_MODE ?? 0)) return false;
    const steps = this.ow.game.safariSteps;
    if (steps === undefined) return false;
    this.ow.game.safariSteps = steps - 1;
    if (steps - 1 <= 0) {
      this.ow.script.setupScript(rom.label("SafariZone_EventScript_OutOfBallsMidBattle") ? rom.label("SafariZone_EventScript_TimesUp") : 0);
      return true;
    }
    return false;
  }
}

export { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST, DIRECTION_VECTORS };
