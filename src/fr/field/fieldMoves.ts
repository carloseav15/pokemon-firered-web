// Field effect scripts that run tasks rather than ground/emote sprites:
// field_effect.c (FldEff_FieldMoveShowMon*, UseSurf, UseWaterfall, PokecenterHeal,
// HallOfFameRecord, EscapeRope/Teleport warps), fldeff_cut.c, fldeff_rocksmash.c,
// fldeff_strength.c, fldeff_dig.c, fldeff_teleport.c and fldeff_sweetscent.c.
//
// The field is composed with Canvas 2D, so BG0/WIN0 effects become overlays
// drawn by FieldEffects.renderOverlays and OBJ effects are field sprites.

import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { sound } from "../audio/sound";
import { paletteFade } from "../gba/fade";
import { Sprite } from "../gba/sprite";
import { tasks } from "../gba/tasks";
import { cdata, incbin } from "../hw/assets";
import { DATA_ROOT, rom } from "../rom";
import { flagGet, flagSet, incrementGameStat, save, varSet, SV } from "../save";
import { stringVars } from "../gba/charmap";
import { SetWeatherScreenFadeOut, WeatherProcessingIdle } from "./weather";
import { canvas, rgb555, spriteSheet, tilemapCanvas } from "./gfx4bpp";
import { MAP_OFFSET, METATILE_ATTRIBUTE_TERRAIN } from "./fieldmap";
import { actionFace, actionJumpSpecial, actionWalkSlower, DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST, DIRECTION_VECTORS } from "./objectEvents";
import { isMapTypeOutdoors, type Overworld } from "./overworld";
import type { Game } from "../game";
import { PLAYER_AVATAR_FLAG_CONTROLLABLE, PLAYER_AVATAR_FLAG_ON_FOOT, PLAYER_AVATAR_FLAG_SURFING, PLAYER_AVATAR_GFX_FIELD_MOVE, PLAYER_AVATAR_GFX_RIDE, PlayerAvatar } from "./playerAvatar";
import { SetHelpContext } from "../helpSystem";

type Overlay = (ctx: CanvasRenderingContext2D) => void;
const ANIM_FIELD_MOVE = 0;

/** gFieldEffectArguments[0] bit 31: play the cry without ducking (Surf). */
const SHOW_MON_CRY_NO_DUCKING = 0x80000000;

export class FieldMoveEffects {
  readonly overlays = new Set<Overlay>();
  private cutGrassSprites: Sprite[] = [];
  private cutGrassCleanupDone = false;
  /** FLDEFF_SET_FUNC_TO_DATA: the callback run once the show-mon sequence is over. */
  private showMonCallback: (() => void) | null = null;
  private scheduleOpenDottedHole = false;

  constructor(private readonly ow: Overworld) {}

  private get args(): number[] { return this.ow.game.fieldEffectArguments; }
  private get active(): Set<number> { return this.ow.effects.active; }
  private remove(id: number): void { this.active.delete(id); }

  setScheduleOpenDottedHole(schedule: boolean): void { this.scheduleOpenDottedHole = schedule; }

  /** FieldCallback_CutTree in fldeff_cut.c. */
  FieldCallback_CutTree(partyIndex: number): void {
    this.args[0] = partyIndex;
    this.ow.script.ScriptContext_SetupScript(rom.label("EventScript_FldEffCut"));
  }

  /** FieldCallback_CutGrass. */
  FieldCallback_CutGrass(partyIndex: number): void {
    this.args[0] = partyIndex;
    this.ow.effects.start(C.FLDEFF_USE_CUT_ON_GRASS);
  }

  /** FldEff_UseCutOnTree. */
  FldEff_UseCutOnTree(): void {
    this.CreateFieldEffectShowMon(() => this.FieldMoveCallback_CutTree());
    incrementGameStat(C.GAME_STAT_USED_CUT);
  }

  /** FldEff_UseCutOnGrass. */
  FldEff_UseCutOnGrass(): void {
    this.CreateFieldEffectShowMon(() => this.FieldMoveCallback_CutGrass());
    incrementGameStat(C.GAME_STAT_USED_CUT);
  }

  /** FieldMoveCallback_CutGrass, called after the show-mon effect finishes. */
  FieldMoveCallback_CutGrass(): void {
    this.remove(C.FLDEFF_USE_CUT_ON_GRASS);
    if (this.scheduleOpenDottedHole) {
      this.scheduleOpenDottedHole = false;
      this.openDottedHoleDoor();
    } else this.FldEff_CutGrass();
  }

  /** FieldMoveCallback_CutTree. */
  FieldMoveCallback_CutTree(): void {
    sound.playSE(C.SE_M_CUT);
    this.remove(C.FLDEFF_USE_CUT_ON_TREE);
    this.ow.script.ScriptContext_Enable();
  }

  /** FieldEffectStart: returns false when the id has no task-style handler here. */
  start(id: number): boolean {
    switch (id) {
      case C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT: this.showMonInit(); return true;
      case C.FLDEFF_FIELD_MOVE_SHOW_MON: this.showMon(); return true;
      case C.FLDEFF_USE_CUT_ON_TREE:
        this.FldEff_UseCutOnTree();
        return true;
      case C.FLDEFF_USE_CUT_ON_GRASS:
        this.FldEff_UseCutOnGrass();
        return true;
      case C.FLDEFF_USE_ROCK_SMASH:
        this.FldEff_UseRockSmash();
        return true;
      case C.FLDEFF_USE_STRENGTH:
        this.CreateFieldEffectShowMon(() => { this.remove(C.FLDEFF_USE_STRENGTH); this.ow.script.ScriptContext_Enable(); });
        stringVars.var1 = Uint8Array.from(save.party[this.args[0]]?.nickname ?? [0xff]);
        return true;
      case C.FLDEFF_USE_DIG:
        this.CreateFieldEffectShowMon(() => { this.remove(C.FLDEFF_USE_DIG); this.ow.resetInitialPlayerAvatarState(); this.startEscapeRope(); });
        this.ow.player.setTransitionFlags(PLAYER_AVATAR_FLAG_ON_FOOT);
        return true;
      case C.FLDEFF_USE_TELEPORT:
        this.CreateFieldEffectShowMon(() => { this.remove(C.FLDEFF_USE_TELEPORT); this.startTeleport(); });
        this.ow.player.setTransitionFlags(PLAYER_AVATAR_FLAG_ON_FOOT);
        return true;
      case C.FLDEFF_USE_SURF: this.useSurf(); return true;
      case C.FLDEFF_USE_WATERFALL: this.useWaterfall(); return true;
      case C.FLDEFF_USE_DIVE: this.remove(id); return true; // no Dive maps in FireRed
      case C.FLDEFF_POKECENTER_HEAL: this.glowingPokeballs(C.FLDEFF_POKECENTER_HEAL, 93, 36, true); return true;
      case C.FLDEFF_HALL_OF_FAME_RECORD: this.glowingPokeballs(C.FLDEFF_HALL_OF_FAME_RECORD, 117, 60, false); return true;
      case C.FLDEFF_SWEET_SCENT: this.FieldCallback_SweetScent(); return true;
      case C.FLDEFF_PHOTO_FLASH: this.photoFlash(); return true;
      case C.FLDEFF_PCTURN_ON: this.remove(id); return true;
      default: return false;
    }
  }

  // ---------------------------------------------------------------- show mon

  /** CreateFieldEffectShowMon + Task_FieldEffectShowMon_* (fldeff_rocksmash.c) */
  CreateFieldEffectShowMon(callback: () => void): number {
    this.showMonCallback = callback;
    const ow = this.ow;
    const taskState = { id: 0, state: 0 };
    taskState.id = tasks.create(() => {
      switch (taskState.state) {
        case 0: this.Task_FieldEffectShowMon_Init(taskState); break;
        case 1: this.Task_FieldEffectShowMon_WaitPlayerAnim(taskState); break;
        case 2: this.Task_FieldEffectShowMon_WaitFldeff(taskState); break;
        case 3: this.Task_FieldEffectShowMon_Cleanup(taskState); break;
      }
    }, 8);
    return taskState.id;
  }

  Task_FieldEffectShowMon_Init(task: { id: number; state: number }): void {
    const ow = this.ow, player = ow.player.object;
    ow.controlsLocked = true;
    ow.player.preventStep = true;
    if (ow.objects.isMovementOverridden(player) && !ow.objects.ObjectEventClearHeldMovementIfFinished(player)) return;
    if (ow.header.mapType === C.MAP_TYPE_UNDERWATER) {
      this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
      task.state = 2;
    } else {
      ow.player.setState(PLAYER_AVATAR_GFX_FIELD_MOVE);
      player.sprite.startAnim(ANIM_FIELD_MOVE);
      ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_START_ANIM_IN_DIRECTION);
      task.state = 1;
    }
  }

  Task_FieldEffectShowMon_WaitPlayerAnim(task: { id: number; state: number }): void {
    if (!this.ow.objects.isHeldMovementFinished(this.ow.player.object)) return;
    this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
    task.state = 2;
  }

  Task_FieldEffectShowMon_WaitFldeff(task: { id: number; state: number }): void {
    if (this.active.has(C.FLDEFF_FIELD_MOVE_SHOW_MON)) return;
    const player = this.ow.player.object;
    this.args[1] = player.facingDirection;
    this.args[2] = ({ [C.DIR_SOUTH]: 0, [C.DIR_NORTH]: 1, [C.DIR_WEST]: 2, [C.DIR_EAST]: 3 } as Record<number, number>)[player.facingDirection] ?? 0;
    this.ow.player.setState(this.ow.player.currentStateId());
    player.sprite.startAnim(this.args[2]);
    this.remove(C.FLDEFF_FIELD_MOVE_SHOW_MON);
    task.state = 3;
  }

  Task_FieldEffectShowMon_Cleanup(task: { id: number; state: number }): void {
    const callback = this.showMonCallback;
    this.showMonCallback = null;
    callback?.();
    this.ow.player.preventStep = false;
    tasks.destroy(task.id);
  }

  /** Common entry used by the task handlers (adds to the active list first). */
  fieldEffectStart(id: number): void {
    this.active.add(id);
    this.start(id);
  }

  /** FldEff_UseRockSmash: CreateFieldEffectShowMon plus the use counter. */
  FldEff_UseRockSmash(): void {
    this.CreateFieldEffectShowMon(() => this.StartRockSmashFieldEffect());
    incrementGameStat(C.GAME_STAT_USED_ROCK_SMASH);
  }

  /** StartRockSmashFieldEffect: finish the move animation and resume its script. */
  StartRockSmashFieldEffect(): void {
    sound.playSE(C.SE_M_ROCK_THROW);
    this.remove(C.FLDEFF_USE_ROCK_SMASH);
    this.ow.script.ScriptContext_Enable();
  }

  /** FldEff_FieldMoveShowMonInit */
  private showMonInit(): void {
    const noDucking = (this.args[0] & SHOW_MON_CRY_NO_DUCKING) !== 0;
    const mon = save.party[this.args[0] & 0xff];
    this.args[0] = (mon?.species ?? 0) | (noDucking ? SHOW_MON_CRY_NO_DUCKING : 0);
    this.args[1] = mon?.otId ?? 0;
    this.args[2] = mon?.personality ?? 0;
    this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON);
    this.remove(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
  }

  /** FldEff_FieldMoveShowMon: outdoor/indoor streak banner with the mon sliding across. */
  private showMon(): void {
    const species = this.args[0] & 0x7fffffff;
    const mon = this.createMonSprite(species, this.args[1] >>> 0, this.args[2] >>> 0);
    if (isMapTypeOutdoors(this.ow.header.mapType)) this.showMonOutdoors(mon);
    else this.showMonIndoors(mon);
  }

  /** CreateMonSprite_FieldMove at (0x140, 0x50) with the slide/cry callbacks. */
  private createMonSprite(species: number, otId: number, personality: number): Sprite {
    const sprite = new Sprite();
    const shiny = (((otId >>> 16) ^ (otId & 0xffff) ^ (personality >>> 16) ^ (personality & 0xffff)) & 0xffff) < 8;
    sprite.frameImages = [{ url: `${DATA_ROOT}/gfx/pokemon/${shiny ? "front_shiny" : "front"}/${species}.png`, index: 0, width: 64, height: 64 }];
    sprite.width = 64;
    sprite.height = 64;
    sprite.centerToCornerVecX = -32;
    sprite.centerToCornerVecY = -32;
    sprite.x = 0x140;
    sprite.y = 0x50;
    sprite.coordOffsetEnabled = false;
    sprite.priority = 0;
    sprite.aboveWindows = true;
    sprite.data[0] = species;
    sprite.callback = null;
    this.ow.sprites.add(sprite);
    return sprite;
  }

  private startMonSlide(sprite: Sprite): void {
    // SpriteCB_FieldMoveMonSlideOnscreen → WaitAfterCry → SlideOffscreen
    let phase = 0;
    sprite.callback = (s) => {
      if (phase === 0) {
        s.x -= 20;
        if (s.x <= 0x78) {
          s.x = 0x78;
          s.data[1] = 30;
          sound.PlayCry_Normal(s.data[0], 0);
          phase = 1;
        }
      } else if (phase === 1) {
        if (--s.data[1] === 0) phase = 2;
      } else if (s.x < -0x40) s.data[7] = 1;
      else s.x -= 20;
    };
  }

  private streaks(outdoors: boolean): HTMLCanvasElement {
    const name = outdoors ? "Outdoors" : "Indoors";
    const tiles = incbin(`sFieldMoveStreaks${name}_Gfx`);
    const pal = incbin(`sFieldMoveStreaks${name}_Pal`);
    const palette = new Uint16Array(256);
    for (let i = 0; i < 16; i++) palette[15 * 16 + i] = pal[i * 2] | (pal[i * 2 + 1] << 8);
    const map = incbin(`sFieldMoveStreaks${name}_Tilemap`);
    const entries = new Uint16Array(32 * 10);
    for (let i = 0; i < entries.length; i++) entries[i] = ((map[i * 2] | (map[i * 2 + 1] << 8)) & 0x0fff) | 0xf000;
    return tilemapCanvas(tiles, entries, palette, 32, 10);
  }

  private drawScrolled(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, hofs: number, y: number): void {
    const x = -(((hofs % 256) + 256) % 256);
    ctx.drawImage(image, x, y);
    ctx.drawImage(image, x + 256, y);
  }

  /** Task_ShowMon_Outdoors: WIN0 opens from the right edge / vertical centre, BG0 streaks scroll. */
  private showMonOutdoors(mon: Sprite): void {
    const image = this.streaks(true);
    let state = 0;
    let hLo = 0xf0, vLo = 0x50, vHi = 0x51, hofs = 0;
    const overlay: Overlay = (ctx) => {
      if (state === 0 || state >= 5) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(hLo, vLo, 240 - hLo, vHi - vLo);
      ctx.clip();
      this.drawScrolled(ctx, image, hofs, 40);
      ctx.restore();
    };
    this.overlays.add(overlay);
    const id = tasks.create(() => {
      switch (state) {
        case 0: state = 1; break;
        case 1:
          hofs -= 16;
          hLo = Math.max(0, hLo - 16); vLo = Math.max(0x28, vLo - 2); vHi = Math.min(0x78, vHi + 2);
          if (hLo === 0 && vLo === 0x28 && vHi === 0x78) { this.startMonSlide(mon); state = 2; }
          break;
        case 2:
          hofs -= 16;
          if (mon.data[7]) state = 3;
          break;
        case 3:
          hofs -= 16;
          vLo = Math.min(0x50, vLo + 6); vHi = Math.max(0x51, vHi - 6);
          if (vLo === 0x50 && vHi === 0x51) state = 4;
          break;
        case 4: state = 5; break;
        case 5:
          this.overlays.delete(overlay);
          this.ow.sprites.destroy(mon);
          this.remove(C.FLDEFF_FIELD_MOVE_SHOW_MON);
          tasks.destroy(id);
          break;
      }
    }, 0xff);
  }

  /** Task_ShowMon_Indoors: the banner is written two columns per frame, then erased the same way. */
  private showMonIndoors(mon: Sprite): void {
    const image = this.streaks(false);
    let state = 0;
    let hofs = 0, columns = 0, erasing = false, erased = 0;
    const overlay: Overlay = (ctx) => {
      const shown = Math.min(32, columns) * 8;
      if (!shown) return;
      ctx.save();
      // Banner columns fill in from the right edge of the scrolled BG0.
      const left = erasing ? 0 : 240 - Math.min(240, shown);
      const right = erasing ? 240 - Math.min(240, erased * 8) : 240;
      ctx.beginPath();
      ctx.rect(left, 40, Math.max(0, right - left), 80);
      ctx.clip();
      if (state === 2 || state === 3) { ctx.fillStyle = "#000"; ctx.fillRect(0, 40, 240, 80); }
      this.drawScrolled(ctx, image, hofs, 40);
      ctx.restore();
    };
    this.overlays.add(overlay);
    const id = tasks.create(() => {
      hofs -= 16;
      switch (state) {
        case 0:
          columns += 2;
          if (columns >= 32) { this.startMonSlide(mon); state = 2; }
          break;
        case 2:
          if (mon.data[7]) state = 3;
          break;
        case 3:
          erasing = true;
          state = 4;
          break;
        case 4:
          erased += 2;
          if (erased >= 32) state = 5;
          break;
        case 5:
          this.overlays.delete(overlay);
          this.ow.sprites.destroy(mon);
          this.remove(C.FLDEFF_FIELD_MOVE_SHOW_MON);
          tasks.destroy(id);
          break;
      }
    }, 0xff);
  }

  // ---------------------------------------------------------------- surf / waterfall

  /** FldEff_UseSurf (sUseSurfEffectFuncs) */
  private useSurf(): void {
    const ow = this.ow;
    const partyIndex = this.args[0];
    ow.savedMusic = 0;
    if (musicCanOverrideMapMusic(ow, C.MUS_SURF)) sound.playNewMapMusic(C.MUS_SURF);
    let state = 0;
    let destX = 0, destY = 0;
    const player = ow.player.object;
    const id = tasks.create(() => {
      switch (state) {
        case 0: {
          ow.controlsLocked = true;
          ow.objects.freezeAll();
          ow.player.preventStep = true;
          ow.player.flags |= PLAYER_AVATAR_FLAG_SURFING;
          const [dx, dy] = DIRECTION_VECTORS[player.movementDirection];
          destX = player.currentCoords.x + dx;
          destY = player.currentCoords.y + dy;
          state = 1;
          break;
        }
        case 1:
          if (!ow.objects.isMovementOverridden(player) || ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
            ow.player.setState(PLAYER_AVATAR_GFX_FIELD_MOVE);
            player.sprite.startAnim(ANIM_FIELD_MOVE);
            ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_START_ANIM_IN_DIRECTION);
            state = 2;
          }
          break;
        case 2:
          if (ow.objects.isHeldMovementFinished(player)) {
            this.args[0] = (partyIndex | SHOW_MON_CRY_NO_DUCKING) >>> 0;
            this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
            state = 3;
          }
          break;
        case 3:
          if (!this.active.has(C.FLDEFF_FIELD_MOVE_SHOW_MON)) {
            ow.player.setState(PLAYER_AVATAR_GFX_RIDE);
            ow.objects.ObjectEventClearHeldMovementIfFinished(player);
            ow.objects.setHeldMovement(player, actionJumpSpecial(player.movementDirection));
            ow.effects.startSurfBlob(player, C.BOB_NONE);
            void destX; void destY;
            state = 4;
          }
          break;
        case 4:
          if (ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
            ow.player.preventStep = false;
            ow.player.flags &= ~PLAYER_AVATAR_FLAG_CONTROLLABLE;
            ow.objects.setHeldMovement(player, actionFace(player.movementDirection));
            ow.effects.setSurfBlobBobState(C.BOB_PLAYER_AND_MON);
            ow.objects.unfreezeAll();
            ow.controlsLocked = false;
            SetHelpContext(C.HELPCONTEXT_SURFING);
            this.remove(C.FLDEFF_USE_SURF);
            tasks.destroy(id);
          }
          break;
      }
    }, 0xff);
  }

  /** FldEff_UseWaterfall (sUseWaterfallFieldEffectFuncs) */
  private useWaterfall(): void {
    const ow = this.ow;
    const partyIndex = this.args[0];
    const player = ow.player.object;
    let state = 0;
    const step = (): boolean => {
      switch (state) {
        case 0:
          ow.controlsLocked = true;
          ow.player.preventStep = true;
          state = 1;
          return false;
        case 1:
          ow.controlsLocked = true;
          if (!ow.objects.isMovementOverridden(player)) {
            ow.objects.ObjectEventClearHeldMovementIfFinished(player);
            this.args[0] = partyIndex;
            this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
            state = 2;
          }
          return false;
        case 2:
          if (this.active.has(C.FLDEFF_FIELD_MOVE_SHOW_MON)) return false;
          state = 3;
          return true;
        case 3:
          ow.objects.setHeldMovement(player, actionWalkSlower(DIR_NORTH));
          state = 4;
          return false;
        case 4:
          if (!ow.objects.ObjectEventClearHeldMovementIfFinished(player)) return false;
          if (MB.MetatileBehavior_IsWaterfall(player.currentMetatileBehavior)) { state = 3; return true; }
          ow.controlsLocked = false;
          ow.player.preventStep = false;
          tasks.destroy(id);
          this.remove(C.FLDEFF_USE_WATERFALL);
          return false;
      }
      return false;
    };
    const id = tasks.create(() => { while (step()); }, 0xff);
    while (step());
  }

  // ---------------------------------------------------------------- cut grass

  /** FldEff_CutGrass: mows the 3×3 area in front of the player (sCutGrassMetatileMapping). */
  FldEff_CutGrass(): void {
    sound.playSE(C.SE_M_CUT);
    const ow = this.ow;
    const p = ow.player.object;
    const mapping = cutGrassMapping();
    const [dx, dy] = DIRECTION_VECTORS[p.facingDirection];
    const cx = p.currentCoords.x + dx, cy = p.currentCoords.y + dy;
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (ow.map.elevationAt(x, y) !== p.currentElevation) continue;
        if (!MetatileAtCoordsIsGrassTile(ow, x, y)) continue;
        this.SetCutGrassMetatileAt(x, y, mapping);
        ow.objects.EnableObjectGroundEffectsByXY(x, y);
      }
    }
    ow.renderer?.invalidate();
    this.active.add(C.FLDEFF_CUT_GRASS);
    this.cutGrassSprites = [];
    this.cutGrassCleanupDone = false;
    const image = spriteSheet(incbin("gFieldEffectObjectPic_CutGrass"), incbin16le(incbin("gFieldEffectPal_CutGrass")), 8, 8);
    for (let i = 0; i < 8; i++) {
      const sprite = new Sprite();
      sprite.width = sprite.height = 8;
      sprite.centerToCornerVecX = sprite.centerToCornerVecY = -4;
      sprite.x = p.sprite.x + 8;
      sprite.y = p.sprite.y + 20;
      sprite.priority = 1;
      sprite.subpriority = 0;
      sprite.data[0] = 8;
      sprite.data[1] = 0;
      sprite.data[2] = i * 32;
      sprite.data[3] = 0;
      sprite.draw = (ctx, x, y) => ctx.drawImage(image, x, y);
      sprite.callback = (s) => this.SpriteCallback_CutGrass_Init(s);
      ow.sprites.add(sprite);
      this.cutGrassSprites.push(sprite);
    }
  }

  /** SetCutGrassMetatileAt: replace a source metatile using the C mapping table. */
  SetCutGrassMetatileAt(x: number, y: number, mapping = cutGrassMapping()): void {
    const metatileId = this.ow.map.metatileIdAt(x, y);
    for (const [from, to] of mapping) {
      if (from === metatileId) {
        this.ow.map.setMetatileIdAt(x, y, to);
        return;
      }
    }
  }

  /** SpriteCallback_CutGrass_Init initializes the C sprite's data fields. */
  SpriteCallback_CutGrass_Init(sprite: Sprite): void {
    sprite.data[0] = 8; sprite.data[1] = 0; sprite.data[3] = 0;
    sprite.callback = (s) => this.SpriteCallback_CutGrass_Run(s);
  }

  /** SpriteCallback_CutGrass_Run: eight particles orbit and expand for 29 frames. */
  SpriteCallback_CutGrass_Run(sprite: Sprite): void {
    sprite.x2 = Math.round(Math.sin(sprite.data[2] * Math.PI / 128) * sprite.data[0]);
    sprite.y2 = Math.round(Math.cos(sprite.data[2] * Math.PI / 128) * sprite.data[0]);
    sprite.data[2] = (sprite.data[2] + 8) & 0xff;
    sprite.data[0]++;
    sprite.data[0] += sprite.data[3] >> 2;
    sprite.data[3]++;
    if (sprite.data[1] !== 28) sprite.data[1]++;
    else this.SpriteCallback_CutGrass_Cleanup(sprite);
  }

  /** SpriteCallback_CutGrass_Cleanup removes the burst and restores field controls. */
  SpriteCallback_CutGrass_Cleanup(sprite: Sprite): void {
    this.ow.sprites.destroy(sprite);
    if (this.cutGrassCleanupDone) return;
    this.cutGrassCleanupDone = true;
    for (const other of this.cutGrassSprites) if (other !== sprite) this.ow.sprites.destroy(other);
    this.cutGrassSprites = [];
    this.remove(C.FLDEFF_CUT_GRASS);
    this.ow.controlsLocked = false;
    this.ow.objects.unfreezeAll();
  }

  /** CutMoveOpenDottedHoleDoor in field_specials.c. */
  private openDottedHoleDoor(): void {
    const ow = this.ow;
    ow.map.setMetatileIdAt(31, 31, rom.c("METATILE_SeviiIslands67_DottedHoleDoor_Open"));
    ow.renderer?.invalidate();
    sound.playSE(C.SE_BANG);
    flagSet(C.FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE);
    ow.controlsLocked = false;
    ow.objects.unfreezeAll();
  }

  // ---------------------------------------------------------------- escape rope / dig / teleport

  /** StartEscapeRopeFieldEffect (Task_EscapeRopeWarpOut) */
  startEscapeRope(): void {
    const ow = this.ow;
    ow.controlsLocked = true;
    ow.objects.freezeAll();
    const player = ow.player.object;
    let timer = 0, offscreen = false, movingState = 0, offsetY = 0;
    const spin = { delay: 0, turns: 0 };
    const id = tasks.create(() => {
      this.spinPlayer(spin);
      if (timer < 60) {
        timer++;
        if (timer === 20) sound.playSE(C.SE_WARP_IN);
      } else if (!offscreen) {
        // WarpOutObjectEventUpwards
        if (movingState < 2) {
          player.sprite.y2 -= 8; offsetY -= 8;
          if (movingState === 0 && offsetY <= -16) { player.fixedPriority = true; player.sprite.priority = 1; player.sprite.subpriority = 0; movingState = 1; }
          if (offsetY <= -88) movingState = 2;
        } else {
          ow.tryFadeOutOldMapMusic();
          ow.warpFadeOutScreen();
          offscreen = true;
        }
      }
      if (offscreen && !paletteFade.active && sound.isBGMPausedOrStopped()) {
        ow.warpDestination = { ...save.escapeWarp };
        ow.fieldCallback = () => this.escapeRopeExit();
        tasks.destroy(id);
        ow.warpIntoMapAndLoad();
      }
    }, 80);
  }

  /** SpinObjectEvent with sSpinDirections (S→W→N? table indexed by facing) */
  private spinPlayer(spin: { delay: number; turns: number }): number {
    const ow = this.ow;
    const p = ow.player.object;
    const next = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
    if (!ow.objects.isMovementOverridden(p) || ow.objects.ObjectEventClearHeldMovementIfFinished(p)) {
      if (spin.delay !== 0 && --spin.delay !== 0) return p.facingDirection;
      ow.objects.setHeldMovement(p, actionFace(next[p.facingDirection]));
      if (spin.turns < 12) spin.turns++;
      spin.delay = 12 >> spin.turns;
      return next[p.facingDirection];
    }
    return p.facingDirection;
  }

  /** FieldCallback_EscapeRopeExit + Task_EscapeRopeWarpIn */
  private escapeRopeExit(): void {
    const ow = this.ow;
    ow.playSpecialMapMusic();
    ow.warpFadeInScreen();
    ow.controlsLocked = true;
    ow.objects.freezeAll();
    const p = ow.player.object;
    ow.player.SetPlayerInvisibility(true);
    let state = 0, timer = 0, spinEnded = false, originalDir = DIR_SOUTH, currentDir = DIR_SOUTH;
    let movingState = 0, offsetY = 0;
    const spin = { delay: 0, turns: 0 };
    const id = tasks.create(() => {
      if (state === 0) {
        sound.playSE(C.SE_WARP_OUT);
        originalDir = p.facingDirection;
        currentDir = originalDir;
        state = 1;
        return;
      }
      // WarpInObjectEventDownwards
      let moving = true;
      if (movingState === 0) { offsetY = -88; p.sprite.y2 -= 88; p.fixedPriority = true; p.sprite.priority = 1; p.sprite.subpriority = 0; movingState = 1; }
      if (movingState === 1 || movingState === 2) {
        p.sprite.y2 += 4; offsetY += 4;
        if (movingState === 1 && offsetY >= -16) movingState = 2;
        if (offsetY >= 0) { p.sprite.y2 = 0; sound.playSE(C.SE_CLICK); movingState = 3; }
      }
      if (movingState === 3) moving = false;
      ow.player.SetPlayerInvisibility(false);
      if (timer < 8) timer++;
      else if (!spinEnded) {
        timer++;
        currentDir = this.spinPlayer(spin);
        if (timer >= 50 && currentDir === originalDir) spinEnded = true;
      }
      if (!moving && currentDir === originalDir && ow.objects.isHeldMovementFinished(p)) {
        p.fixedPriority = false;
        ow.controlsLocked = false;
        ow.objects.unfreezeAll();
        tasks.destroy(id);
      }
    }, 0);
  }

  /** CreateTeleportFieldEffectTask (TeleportFieldEffectTask1-4) */
  startTeleport(): void {
    const ow = this.ow;
    const p = ow.player.object;
    ow.controlsLocked = true;
    ow.objects.freezeAll();
    const facing = p.facingDirection;
    let state = 1, d1 = 0, d2 = 0, d3 = 0, d4 = 0;
    const spinA = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH]; // [NONE,S,N,W,E] → S,W,E? see teleport table
    const id = tasks.create(() => {
      switch (state) {
        case 1: {
          const table = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
          if (d1 === 0 || --d1 === 0) { ow.objects.turn(p, table[p.facingDirection]); d1 = 8; d2++; }
          if (d2 > 7 && facing === p.facingDirection) { state = 2; d1 = 4; d2 = 8; d3 = 1; sound.playSE(C.SE_WARP_IN); }
          break;
        }
        case 2:
          if (--d1 <= 0) { d1 = 4; ow.objects.turn(p, spinA[p.facingDirection]); }
          // field_effect.c TeleportFieldEffectTask3 raises sprite->y directly.
          p.sprite.y -= d3;
          d4 += d3;
          if (--d2 <= 0) { d2 = 4; if (d3 < 8) d3 <<= 1; }
          if (d4 > 8) p.sprite.priority = 1;
          if (d4 >= 0xa8) { state = 3; ow.tryFadeOutOldMapMusic(); ow.warpFadeOutScreen(); }
          break;
        case 3:
          if (!paletteFade.active && sound.isBGMPausedOrStopped()) {
            ow.setWarpDestinationToLastHealLocation();
            ow.fieldCallback = () => ow.fieldCBTeleportWarpIn();
            tasks.destroy(id);
            ow.warpIntoMapAndLoad();
          }
          break;
      }
    }, 0);
  }

  // ---------------------------------------------------------------- pokecenter / hall of fame

  /** FldEff_PokecenterHeal / FldEff_HallOfFameRecord with CreateGlowingPokeballsEffect */
  private glowingPokeballs(effectId: number, x: number, y: number, playHealSe: boolean): void {
    const ow = this.ow;
    const glowPal = Array.from(incbin16le(incbin("sPokeballGlow_Pal")));
    const basePal = glowPal.slice();
    const ballTiles = incbin("sPokeballGlow_Gfx");
    let cacheKey = "";
    let ballImage: HTMLCanvasElement | null = null;
    const ballCanvas = (): HTMLCanvasElement => {
      const key = glowPal.join(",");
      if (key !== cacheKey || !ballImage) { cacheKey = key; ballImage = spriteSheet(ballTiles, glowPal, 8, 8); }
      return ballImage;
    };
    const offsets = [[0, 0], [6, 0], [0, 4], [6, 4], [0, 8], [6, 8]];
    const balls: Sprite[] = [];
    let numMons = save.party.length;
    let glowState = 0, timer = 0, counter = 0, numFlashed = 0;
    const reds = [16, 12, 8, 0];
    const multiply = (i: number, amount: number): void => {
      const c = basePal[i];
      let r = c & 31, g = (c >> 5) & 31;
      const b = (c >> 10) & 31;
      r += ((31 - r) * amount) >> 4;
      g += ((31 - g) * amount) >> 4;
      glowPal[i] = r | (g << 5) | (b << 10);
    };
    const monitor = playHealSe ? this.createMonitorSprite(128, 24) : null;
    const id = tasks.create(() => {
      switch (glowState) {
        case 0:
          if (timer === 0 || --timer === 0) {
            timer = 25;
            const s = new Sprite();
            s.draw = (ctx, dx, dy) => ctx.drawImage(ballCanvas(), dx, dy);
            s.width = 8; s.height = 8; s.centerToCornerVecX = -4; s.centerToCornerVecY = -4;
            s.x = offsets[counter][0] + x; s.y = offsets[counter][1] + y;
            s.coordOffsetEnabled = false; s.priority = 2; s.subpriority = 0xff;
            ow.sprites.add(s);
            balls.push(s);
            counter++;
            numMons--;
            sound.playSE(C.SE_BALL);
          }
          if (numMons <= 0) { timer = 32; glowState = 1; }
          break;
        case 1:
          if (--timer === 0) {
            glowState = 2; timer = 8; counter = 0; numFlashed = 0;
            if (playHealSe) sound.playFanfare(C.MUS_HEAL);
            if (monitor) monitor.data[0] = 1;
            else this.createHofMonitorSprite(120, 25);
          }
          break;
        case 2: {
          if (--timer === 0) { timer = 8; counter = (counter + 1) & 3; if (counter === 0) numFlashed++; }
          multiply(8, reds[(counter + 3) & 3]);
          multiply(6, reds[(counter + 2) & 3]);
          multiply(2, reds[(counter + 1) & 3]);
          multiply(5, reds[counter]);
          multiply(3, reds[counter]);
          if (numFlashed >= 3) { glowState = 3; timer = 8; counter = 0; }
          break;
        }
        case 3:
          if (--timer === 0) { timer = 8; counter = (counter + 1) & 3; if (counter === 3) { glowState = 4; timer = 30; } }
          for (const i of [8, 6, 2, 5, 3]) multiply(i, reds[counter]);
          break;
        case 4:
          if (--timer === 0) glowState = 5;
          break;
        case 5:
          // SpriteCB_PokeballGlow frees each ball once the effect passes state 4.
          for (const s of balls) ow.sprites.destroy(s);
          glowState = 6;
          break;
        case 6:
          if (!playHealSe || sound.isFanfareTaskInactive()) glowState = 7;
          break;
        case 7:
          this.remove(effectId);
          tasks.destroy(id);
          break;
      }
    }, 0xff);
  }

  /** CreatePokecenterMonitorSprite: 32×16, sAnims_Flicker, invisible until the balls are placed. */
  private createMonitorSprite(x: number, y: number): Sprite {
    const tilesAll = incbin("sPokecenterMonitor_Gfx");
    const pal = incbin16le(incbin("sPokeballGlow_Pal"));
    const frames = [0, 1, 2, 3].map((f) => spriteSheet(tilesAll.subarray(f * 256, f * 256 + 256), pal, 32, 16));
    const s = new Sprite();
    s.anims = animCmds(cdata<unknown[]>("field_effect", "sAnim_Static"), cdata<unknown[]>("field_effect", "sAnim_Flicker"));
    s.width = 32; s.height = 16; s.centerToCornerVecX = -16; s.centerToCornerVecY = -8;
    s.x = x; s.y = y; s.coordOffsetEnabled = false; s.priority = 2; s.invisible = true;
    s.draw = (ctx, dx, dy) => ctx.drawImage(frames[s.imageValue] ?? frames[0], dx, dy);
    s.callback = (sp) => {
      if (sp.data[0]) { sp.data[0] = 0; sp.invisible = false; sp.startAnim(1); sp.data[1] = 1; }
      if (sp.data[1] && sp.animEnded) this.ow.sprites.destroy(sp);
    };
    this.ow.sprites.add(s);
    return s;
  }

  private createHofMonitorSprite(x: number, y: number): void {
    const tilesAll = incbin("sHofMonitor_Gfx");
    const pal = incbin16le(incbin("sHofMonitor_Pal"));
    const frames = [0, 1, 2, 3].map((f) => spriteSheet(tilesAll.subarray(f * 128, f * 128 + 128), pal, 16, 16));
    const s = new Sprite();
    s.anims = animCmds(cdata<unknown[]>("field_effect", "sAnim_HofMonitor"));
    s.width = 16; s.height = 16; s.centerToCornerVecX = -8; s.centerToCornerVecY = -8;
    s.x = x; s.y = y; s.coordOffsetEnabled = false; s.priority = 2;
    s.draw = (ctx, dx, dy) => ctx.drawImage(frames[s.imageValue] ?? frames[0], dx, dy);
    s.callback = (sp) => { if (sp.animEnded) this.ow.sprites.destroy(sp); };
    s.startAnim(0);
    this.ow.sprites.add(s);
  }

  // ---------------------------------------------------------------- sweet scent / photo flash

  /** Unused_StartSweetscentFldeff: retained source entry point for the unused debug path. */
  Unused_StartSweetscentFldeff(): void { this.args[0] = 0; this.FieldCallback_SweetScent(); }

  /** FieldCallback_SweetScent starts FLDEFF_SWEET_SCENT; party slot is in field-effect args. */
  FieldCallback_SweetScent(): void {
    this.FldEff_SweetScent();
  }

  /** FldEff_SweetScent: fade the weather, then run the show-mon animation. */
  FldEff_SweetScent(): void {
    SetWeatherScreenFadeOut();
    this.CreateFieldEffectShowMon(() => this.StartSweetScentFieldEffect());
  }

  /** StartSweetScentFieldEffect: play the cry and tint the field during its wait. */
  StartSweetScentFieldEffect(): void {
    const ow = this.ow;
    ow.controlsLocked = true;
    ow.objects.freezeAll();
    sound.playSE(C.SE_M_SWEET_SCENT);
    let state = 0;
    let waitFrames = 0;
    const tint: Overlay = (ctx) => {
      const a = Math.min(8, paletteFade.level) / 16;
      ctx.fillStyle = `rgba(248, 144, 200, ${a})`;
      ctx.fillRect(0, 0, 240, 160);
    };
    this.overlays.add(tint);
    const id = tasks.create(() => {
      if (state === 0) {
        paletteFade.begin(4, 0, 8, [248, 0, 0]);
        state = 1;
        return;
      }
      if (state === 1) {
        if (paletteFade.active) return;
        if (waitFrames++ < 64) return;
        waitFrames = 0;
        if (this.TrySweetScentEncounter()) {
          this.overlays.delete(tint);
          paletteFade.clear();
          this.remove(C.FLDEFF_SWEET_SCENT);
          tasks.destroy(id);
          return;
        }
        paletteFade.begin(4, 8, 0, [248, 0, 0]);
        state = 2;
        return;
      }
      if (paletteFade.active) return;
      this.FailSweetScentEncounter(id, tint);
    }, 0);
  }

  /** TrySweetScentEncounter: true if SweetScentWildEncounter starts a battle. */
  TrySweetScentEncounter(): boolean {
    const p = this.ow.player.object;
    return this.ow.game.wild.sweetScentEncounter(this.ow.map.attributesOf(this.ow.map.metatileIdAt(p.currentCoords.x, p.currentCoords.y)));
  }

  /** FailSweetScentEncounter: restore weather and run the source failure script. */
  FailSweetScentEncounter(taskId: number, tint: Overlay): void {
    this.overlays.delete(tint);
    paletteFade.clear();
    WeatherProcessingIdle();
    this.ow.script.ScriptContext_SetupScript(rom.label("EventScript_FailSweetScent"));
    this.ow.objects.unfreezeAll();
    this.remove(C.FLDEFF_SWEET_SCENT);
    tasks.destroy(taskId);
  }

  /** FldEff_PhotoFlash (Trainer card photo / Celadon photographer): a white flash. */
  private photoFlash(): void {
    let t = 0;
    const flash: Overlay = (ctx) => {
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - t / 16)})`;
      ctx.fillRect(0, 0, 240, 160);
    };
    this.overlays.add(flash);
    sound.playSE(C.SE_M_MEGA_KICK);
    const id = tasks.create(() => {
      if (++t < 16) return;
      this.overlays.delete(flash);
      tasks.destroy(id);
      this.remove(C.FLDEFF_PHOTO_FLASH);
    }, 0);
  }

  // ---------------------------------------------------------------- fly

  /** Task_UseFly: FLDEFF_FLY_OUT, then warp with FieldCallback_FlyIntoMap (FLDEFF_FLY_IN). */
  startFly(): void {
    const ow = this.ow;
    ow.controlsLocked = true;
    ow.objects.freezeAll();
    this.flyOut(() => {
      ow.resetStateAfterFly();
      ow.fieldCallback = () => {
        ow.playSpecialMapMusic();
        ow.fadeInFromBlack();
        ow.player.SetPlayerInvisibility(true);
        ow.controlsLocked = true;
        ow.objects.freezeAll();
        const wait = tasks.create(() => {
          if (paletteFade.active) return;
          tasks.destroy(wait);
          this.flyIn(() => { ow.controlsLocked = false; ow.objects.unfreezeAll(); });
        }, 0);
      };
      ow.warpIntoMapAndLoad();
    });
  }

  private createBird(): Sprite | undefined {
    const bird = this.ow.effects.createFromTemplate("Bird", 255, 180);
    if (!bird) return undefined;
    bird.coordOffsetEnabled = false;
    bird.priority = 1;
    bird.startAnim(0);
    return bird;
  }

  /** FldEff_FlyOut (sFlyOutFieldEffectFuncs) */
  private flyOut(done: () => void): void {
    const ow = this.ow;
    const player = ow.player.object;
    const wasSurfing = ow.player.isSurfing();
    const partyIndex = this.args[0] < 6 ? this.args[0] : 0;
    let state = 0, timer = 0;
    let bird: Sprite | undefined;
    let t1 = 0, t2 = 0;
    const id = tasks.create(() => {
      switch (state) {
        case 0:
          if (!ow.objects.isMovementOverridden(player) || ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
            ow.player.preventStep = true;
            ow.player.setState(PLAYER_AVATAR_GFX_FIELD_MOVE);
            player.sprite.startAnim(ANIM_FIELD_MOVE);
            ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_START_ANIM_IN_DIRECTION);
            state = 1;
          }
          break;
        case 1:
          if (ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
            this.args[0] = partyIndex;
            this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
            state = 2;
          }
          break;
        case 2:
          if (!this.active.has(C.FLDEFF_FIELD_MOVE_SHOW_MON)) {
            if (wasSurfing) ow.effects.setSurfBlobBobState(C.BOB_MON_ONLY);
            // SpriteCB_FlyBirdLeaveBall: the bird circles up out of the ball.
            bird = this.createBird();
            if (bird) { bird.x = save.playerGender ? 118 : 128; bird.y = -48; }
            t1 = 64; t2 = 256;
            state = 3;
          }
          break;
        case 3:
          if (bird) {
            t1 += t2 >> 8;
            bird.x2 = Math.round(Math.cos((t1 & 0xff) * Math.PI / 128) * 120);
            bird.y2 = Math.round(Math.sin((t1 & 0xff) * Math.PI / 128) * 120);
            if (t2 < 2048) t2 += 96;
          }
          if (!bird || t1 > 129) {
            ow.player.setTransitionFlags(PLAYER_AVATAR_FLAG_ON_FOOT);
            ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_FACE_LEFT);
            timer = 16;
            state = 4;
          }
          break;
        case 4:
          if ((timer === 0 || --timer === 0) && ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
            sound.playSE(C.SE_M_FLY);
            if (bird) { bird.x = 120; bird.y = 0; bird.x2 = 0; bird.y2 = 0; }
            t2 = 0; timer = 0;
            state = 5;
          }
          break;
        case 5:
          // SpriteCB_FlyBirdSwoopDown, then the player jumps on at frame 8 and rides off at 18.
          this.swoop(bird, t2, false);
          t2 = (t2 + 4) & 0xff;
          timer++;
          if (timer === 8) {
            ow.player.setState(PLAYER_AVATAR_GFX_RIDE);
            ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_JUMP_IN_PLACE_LEFT);
          }
          if (timer === 18) {
            ow.objects.clearHeldMovementIfActive(player);
            ow.player.SetPlayerInvisibility(true);
            bird?.startAnim(save.playerGender * 2 + 1);
          }
          if (t2 >= 128 || t2 === 0) { ow.tryFadeOutOldMapMusic(); ow.warpFadeOutScreen(); state = 6; }
          break;
        case 6:
          this.swoop(bird, t2, false);
          t2 = Math.min(255, t2 + 4);
          if (!paletteFade.active) {
            if (bird) ow.sprites.destroy(bird);
            ow.player.SetPlayerInvisibility(false);
            ow.player.preventStep = false;
            tasks.destroy(id);
            done();
          }
          break;
      }
    }, 0xfe);
  }

  private swoop(bird: Sprite | undefined, angle: number, _returning: boolean): void {
    if (!bird) return;
    bird.x2 = Math.round(Math.cos(angle * Math.PI / 128) * 140);
    bird.y2 = Math.round(Math.sin(angle * Math.PI / 128) * 72);
  }

  /** FldEff_FlyIn (sFlyInFieldEffectFuncs): the bird carries the player down and flies off. */
  private flyIn(done: () => void): void {
    const ow = this.ow;
    const player = ow.player.object;
    const wasSurfing = ow.player.isSurfing();
    const bird = this.createBird();
    if (bird) { bird.x = 120; bird.y = 0; bird.startAnim(save.playerGender * 2 + 1); }
    sound.playSE(C.SE_M_FLY);
    let angle = 128, state = 0, timer = 0;
    const id = tasks.create(() => {
      switch (state) {
        case 0:
          // Swoop in from the right to the player's position.
          this.swoop(bird, angle, true);
          angle = (angle + 4) & 0xff;
          if (angle === 0 || angle >= 252) {
            if (bird) { bird.startAnim(0); }
            ow.player.SetPlayerInvisibility(false);
            ow.player.setState(PLAYER_AVATAR_GFX_RIDE);
            ow.objects.turn(player, DIR_WEST);
            ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_JUMP_IN_PLACE_LEFT);
            state = 1;
          }
          break;
        case 1:
          if (ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
            ow.player.setState(wasSurfing ? PLAYER_AVATAR_GFX_RIDE : ow.player.currentStateId());
            ow.objects.turn(player, DIR_SOUTH);
            timer = 0;
            state = 2;
          }
          break;
        case 2:
          if (bird) { bird.y2 -= 6; bird.x2 += 2; }
          if (++timer >= 30) {
            if (bird) ow.sprites.destroy(bird);
            tasks.destroy(id);
            done();
          }
          break;
      }
    }, 0xfe);
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const o of this.overlays) o(ctx);
  }
}

/** overworld.c Overworld_MusicCanOverrideMapMusic */
export function musicCanOverrideMapMusic(ow: Overworld, music: number): boolean {
  if (music === C.MUS_CYCLING || music === C.MUS_SURF) {
    const sec = ow.header.regionMapSection;
    if (sec === C.MAPSEC_KANTO_VICTORY_ROAD || sec === C.MAPSEC_ROUTE_23 || sec === C.MAPSEC_INDIGO_PLATEAU) return false;
  }
  return true;
}

function incbin16le(bytes: Uint8Array): Uint16Array {
  const out = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  return out;
}

type CAnim = { frame?: { imageValue: number; duration: number; hFlip?: boolean; vFlip?: boolean }; loop?: { count: number }; jump?: { target: number }; type?: number };

/** Convert exported AnimCmd arrays into the field sprite's command tuples. */
export function animCmds(...anims: unknown[][]): import("../rom").AnimCmd[][] {
  return anims.map((list) => (list as CAnim[]).map((c) => {
    if (c.frame) return ["F", c.frame.imageValue, c.frame.duration, c.frame.hFlip ? 1 : 0, c.frame.vFlip ? 1 : 0] as import("../rom").AnimCmd;
    if (c.loop) return ["L", c.loop.count] as unknown as import("../rom").AnimCmd;
    if (c.jump) return ["J", c.jump.target] as unknown as import("../rom").AnimCmd;
    return ["E"] as unknown as import("../rom").AnimCmd;
  }));
}

let grassMapping: Array<[number, number]> | undefined;
/** sCutGrassMetatileMapping (METATILE_ID(tileset, name) pairs resolved through the exported constants). */
function cutGrassMapping(): Array<[number, number]> {
  if (grassMapping) return grassMapping;
  const pairs: Array<[string, string]> = [
    ["METATILE_General_Plain_Grass", "METATILE_General_Plain_Mowed"],
    ["METATILE_General_ThinTreeTop_Grass", "METATILE_General_ThinTreeTop_Mowed"],
    ["METATILE_General_WideTreeTopLeft_Grass", "METATILE_General_WideTreeTopLeft_Mowed"],
    ["METATILE_General_WideTreeTopRight_Grass", "METATILE_General_WideTreeTopRight_Mowed"],
    ["METATILE_CeladonCity_CyclingRoad_Grass", "METATILE_CeladonCity_CyclingRoad_Mowed"],
    ["METATILE_FuchsiaCity_SafariZoneTreeTopLeft_Grass", "METATILE_FuchsiaCity_SafariZoneTreeTopLeft_Mowed"],
    ["METATILE_FuchsiaCity_SafariZoneTreeTopMiddle_Grass", "METATILE_FuchsiaCity_SafariZoneTreeTopMiddle_Mowed"],
    ["METATILE_FuchsiaCity_SafariZoneTreeTopRight_Grass", "METATILE_FuchsiaCity_SafariZoneTreeTopRight_Mowed"],
    ["METATILE_ViridianForest_HugeTreeTopMiddle_Grass", "METATILE_ViridianForest_HugeTreeTopMiddle_Mowed"],
  ];
  const k = rom.constants;
  grassMapping = pairs.filter(([a, b]) => a in k && b in k).map(([a, b]) => [k[a], k[b]]);
  return grassMapping;
}

/** MetatileAtCoordsIsGrassTile from fldeff_cut.c. */
export function MetatileAtCoordsIsGrassTile(ow: Overworld, x: number, y: number): boolean {
  return (ow.map.attributeAt(x, y, METATILE_ATTRIBUTE_TERRAIN) & C.TILE_TERRAIN_GRASS) !== 0;
}

/**
 * SetUpFieldMove_Cut. Returns the post-menu field callback selected by the C
 * checks: dotted-hole door, cuttable tree, or same-elevation grass in front.
 */
export function SetUpFieldMove_Cut(game: Game): "ruin" | "tree" | "grass" | undefined {
  const ow = game.overworld, p = ow.player.object;
  if (!flagGet(C.FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE)
    && ow.mapId === "MAP_SIX_ISLAND_RUIN_VALLEY"
    && p.currentCoords.x - MAP_OFFSET === 24
    && p.currentCoords.y - MAP_OFFSET === 25
    && p.facingDirection === DIR_NORTH) return "ruin";
  const [dx, dy] = DIRECTION_VECTORS[p.facingDirection];
  const destX = p.currentCoords.x + dx, destY = p.currentCoords.y + dy;
  const tree = ow.objects.objectAtXYZ(destX, destY, p.currentElevation);
  if (tree?.graphicsId === C.OBJ_EVENT_GFX_CUT_TREE) {
    varSet(SV.LAST_TALKED, tree.localId);
    return "tree";
  }
  for (let i = 0; i < 3; i++) {
    const y = destY - 1 + i;
    for (let j = 0; j < 3; j++) {
      const x = destX - 1 + j;
      if (ow.map.elevationAt(x, y) === p.currentElevation && MetatileAtCoordsIsGrassTile(ow, x, y)) return "grass";
    }
  }
  return undefined;
}

// Referenced for completeness of the palette helpers.
void rgb555; void canvas; void PlayerAvatar; void DIR_EAST; void DIR_WEST;
