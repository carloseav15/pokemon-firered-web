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
import { BeginNormalPaletteFade, BlendPalettes, gPaletteFade, PALETTES_ALL, RGB_WHITE } from "../hw/palette";
import { DATA_ROOT, rom } from "../rom";
import { flagGet, flagSet, incrementGameStat, save, varSet, SV } from "../save";
import { stringVars } from "../gba/charmap";
import { IsWeatherNotFadingIn, SetWeatherScreenFadeOut, WeatherProcessingIdle } from "./weather";
import { canvas, rgb555, spriteSheet, tilemapCanvas } from "./gfx4bpp";
import { MAP_OFFSET, MapGridGetElevationAt, MapGridGetMetatileAttributeAt, MapGridGetMetatileIdAt, MapGridSetMetatileIdAt, METATILE_ATTRIBUTE_TERRAIN } from "./fieldmap";
import { actionFace, actionJumpSpecial, actionWalkSlower, DIR_EAST, DIR_NONE, DIR_NORTH, DIR_SOUTH, DIR_WEST, DIRECTION_VECTORS, type ObjectEvent } from "./objectEvents";
import { isMapTypeOutdoors, type Overworld } from "./overworld";
import type { Game } from "../game";
import { PlayerGetDestCoords, PLAYER_AVATAR_FLAG_CONTROLLABLE, PLAYER_AVATAR_FLAG_ON_FOOT, PLAYER_AVATAR_FLAG_SURFING, PLAYER_AVATAR_GFX_NORMAL, PLAYER_AVATAR_GFX_RIDE } from "./playerAvatar";
import { SetHelpContext } from "../helpSystem";
import { CalculatePlayerPartyCount } from "../pokemon/mon";
import { QuestLog_DrawPreviouslyOnQuestHeaderIfInPlaybackMode } from "../questLogEvents";
import { FldEff_UseVsSeeker } from "./vsSeeker";

type Overlay = (ctx: CanvasRenderingContext2D) => void;
type FieldMoveShowMonTask = { id: number; data: Int16Array; mon: Sprite; outdoors: boolean; image?: HTMLCanvasElement; overlay?: Overlay };
type PokeballGlowTask = { id: number; data: Int16Array; glow: Sprite; monitor?: Sprite };
type UseDiveTask = { id: number; data: Int16Array };
type PokeballGlowSprite = { palette: Uint16Array; unfaded: Uint16Array; gfx: Uint8Array; cacheKey: string; image?: HTMLCanvasElement };
/** gFieldEffectArguments[0] bit 31: play the cry without ducking (Surf). */
const SHOW_MON_CRY_NO_DUCKING = 0x80000000;

export class FieldMoveEffects {
  readonly overlays = new Set<Overlay>();
  private readonly pokeballGlowSprites = new Map<Sprite, PokeballGlowSprite>();
  private readonly pokeballGlowBallOwners = new WeakMap<Sprite, Sprite>();
  private readonly flyBirdPlayerSprites = new WeakMap<Sprite, Sprite>();
  private readonly flyOutCompletions = new Map<number, () => void>();
  private readonly flyInCompletions = new Map<number, () => void>();
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
      this.CutMoveOpenDottedHoleDoor();
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
      case C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT: this.FldEff_FieldMoveShowMonInit(); return true;
      case C.FLDEFF_FIELD_MOVE_SHOW_MON: this.FldEff_FieldMoveShowMon(); return true;
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
      case C.FLDEFF_USE_SURF: this.FldEff_UseSurf(); return true;
      case C.FLDEFF_USE_WATERFALL: this.FldEff_UseWaterfall(); return true;
      case C.FLDEFF_USE_DIVE: this.FldEff_UseDive(); return true;
      case C.FLDEFF_POKECENTER_HEAL: this.FldEff_PokecenterHeal(); return true;
      case C.FLDEFF_HALL_OF_FAME_RECORD: this.FldEff_HallOfFameRecord(); return true;
      case C.FLDEFF_SWEET_SCENT: this.FieldCallback_SweetScent(); return true;
      case C.FLDEFF_USE_VS_SEEKER: FldEff_UseVsSeeker(this.ow); return true;
      case C.FLDEFF_PHOTO_FLASH: this.FldEff_PhotoFlash(); return true;
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
      ow.player.StartPlayerAvatarSummonMonForFieldMoveAnim();
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

  /** FldEff_FieldMoveShowMonInit (field_effect.c). */
  private FldEff_FieldMoveShowMonInit(): void {
    const cryFlags = this.args[0]! & SHOW_MON_CRY_NO_DUCKING;
    const mon = save.party[this.args[0]! & 0xff];
    this.args[0] = ((mon?.species ?? 0) | cryFlags) >>> 0;
    this.args[1] = mon?.otId ?? 0;
    this.args[2] = mon?.personality ?? 0;
    this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON);
    this.remove(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
  }

  /** FldEff_FieldMoveShowMon (field_effect.c). */
  private FldEff_FieldMoveShowMon(): void {
    const speciesAndFlags = this.args[0]! >>> 0;
    const mon = this.InitFieldMoveMonSprite(speciesAndFlags, this.args[1]! >>> 0, this.args[2]! >>> 0);
    const outdoors = isMapTypeOutdoors(this.ow.header.mapType);
    const task: FieldMoveShowMonTask = { id: 0, data: new Int16Array(16), mon, outdoors };
    task.data[15] = this.ow.sprites.sprites.indexOf(mon);
    task.id = tasks.create(() => outdoors ? this.Task_ShowMon_Outdoors(task) : this.Task_ShowMon_Indoors(task), 0xff);
  }

  /** InitFieldMoveMonSprite (field_effect.c): decode the Cry flag around the source sprite helper. */
  private InitFieldMoveMonSprite(speciesAndFlags: number, otId: number, personality: number): Sprite {
    const playCry = (speciesAndFlags & SHOW_MON_CRY_NO_DUCKING) >>> 16;
    const species = speciesAndFlags & 0x7fffffff;
    const sprite = this.CreateMonSprite_FieldMove(species, otId, personality, 0x140, 0x50, 0);
    sprite.data[6] = playCry;
    return sprite;
  }

  /** CreateMonSprite_FieldMove (field_effect.c); Canvas keeps the exported PNG as the sprite image. */
  CreateMonSprite_FieldMove(species: number, otId: number, personality: number, x: number, y: number, subpriority: number): Sprite {
    const sprite = new Sprite();
    const shiny = (((otId >>> 16) ^ (otId & 0xffff) ^ (personality >>> 16) ^ (personality & 0xffff)) & 0xffff) < 8;
    sprite.frameImages = [{ url: `${DATA_ROOT}/gfx/pokemon/${shiny ? "front_shiny" : "front"}/${species}.png`, index: 0, width: 64, height: 64 }];
    sprite.width = 64;
    sprite.height = 64;
    sprite.centerToCornerVecX = -32;
    sprite.centerToCornerVecY = -32;
    sprite.x = x;
    sprite.y = y;
    sprite.coordOffsetEnabled = false;
    sprite.priority = 0;
    sprite.subpriority = subpriority & 0xff;
    sprite.aboveWindows = true;
    sprite.data[0] = species;
    sprite.callback = () => {};
    this.ow.sprites.add(sprite);
    return sprite;
  }

  private SpriteCB_FieldMoveMonSlideOnscreen(sprite: Sprite): void {
    if ((sprite.x -= 20) <= 0x78) {
      sprite.x = 0x78;
      sprite.data[1] = 30;
      sprite.callback = (s) => this.SpriteCB_FieldMoveMonWaitAfterCry(s);
      if (sprite.data[6]) sound.PlayCry_NormalNoDucking(sprite.data[0]!, 0, C.CRY_VOLUME_RS, C.CRY_PRIORITY_NORMAL);
      else sound.PlayCry_Normal(sprite.data[0]!, 0);
    }
  }

  private SpriteCB_FieldMoveMonWaitAfterCry(sprite: Sprite): void {
    if (--sprite.data[1]! === 0) sprite.callback = (s) => this.SpriteCB_FieldMoveMonSlideOffscreen(s);
  }

  private SpriteCB_FieldMoveMonSlideOffscreen(sprite: Sprite): void {
    if (sprite.x < -0x40) sprite.data[7] = 1;
    else sprite.x -= 20;
  }

  /** Canvas equivalent of loading the matching source BG assets into VRAM. */
  private LoadFieldMoveStreaksTilemapToVram(outdoors: boolean): HTMLCanvasElement {
    const name = outdoors ? "Outdoors" : "Indoors";
    const tiles = incbin(`sFieldMoveStreaks${name}_Gfx`);
    const pal = incbin(`sFieldMoveStreaks${name}_Pal`);
    const palette = new Uint16Array(256);
    for (let i = 0; i < 16; i++) palette[15 * 16 + i] = pal[i * 2] | (pal[i * 2 + 1] << 8);
    const map = incbin(`sFieldMoveStreaks${name}_Tilemap`);
    const entries = new Uint16Array(32 * 10);
    for (let i = 0; i < entries.length; i++) entries[i] = ((map[i * 2] | (map[i * 2 + 1] << 8)) & 0x0fff) | 0xf000;
    return tilemapCanvas(tiles, entries, palette, 32, 10, true);
  }

  private drawScrolled(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, hofs: number, y: number): void {
    const x = -(((hofs % 256) + 256) % 256);
    ctx.drawImage(image, x, y);
    ctx.drawImage(image, x + 256, y);
  }

  private Task_ShowMon_Outdoors(task: FieldMoveShowMonTask): void {
    const state = task.data[0]!;
    if (state === 0) this.ShowMonEffect_Outdoors_1(task);
    else if (state === 1) this.ShowMonEffect_Outdoors_2(task);
    else if (state === 2) this.ShowMonEffect_Outdoors_3(task);
    else if (state === 3) this.ShowMonEffect_Outdoors_4(task);
    else if (state === 4) this.ShowMonEffect_Outdoors_5(task);
    else if (state === 5) this.ShowMonEffect_Outdoors_6(task);
    else this.ShowMonEffect_Outdoors_7(task);
  }

  private ShowMonEffect_Outdoors_1(task: FieldMoveShowMonTask): void {
    task.data[1] = 0xf0f1; task.data[2] = 0x5051; task.data[3] = 0x1f;
    task.overlay = (ctx) => this.VBlankCB_ShowMonEffect_Outdoors(task, ctx);
    this.overlays.add(task.overlay);
    task.data[0]++;
  }

  private ShowMonEffect_Outdoors_2(task: FieldMoveShowMonTask): void {
    task.image = this.LoadFieldMoveStreaksTilemapToVram(true);
    task.data[0]++;
  }

  private ShowMonEffect_Outdoors_3(task: FieldMoveShowMonTask): void {
    task.data[5] = (task.data[5]! - 16) << 16 >> 16;
    const left = Math.max(0, ((task.data[1]! & 0xffff) >>> 8) - 16);
    const top = Math.max(0x28, ((task.data[2]! & 0xffff) >>> 8) - 2);
    const bottom = Math.min(0x78, (task.data[2]! & 0xff) + 2);
    task.data[1] = (left << 8) | (task.data[1]! & 0xff);
    task.data[2] = (top << 8) | bottom;
    if (left === 0 && top === 0x28 && bottom === 0x78) {
      task.mon.callback = (sprite) => this.SpriteCB_FieldMoveMonSlideOnscreen(sprite);
      task.data[0]++;
    }
  }

  private ShowMonEffect_Outdoors_4(task: FieldMoveShowMonTask): void {
    task.data[5] = (task.data[5]! - 16) << 16 >> 16;
    if (task.mon.data[7]) task.data[0]++;
  }

  private ShowMonEffect_Outdoors_5(task: FieldMoveShowMonTask): void {
    task.data[5] = (task.data[5]! - 16) << 16 >> 16;
    const top = Math.min(0x50, ((task.data[2]! & 0xffff) >>> 8) + 6);
    const bottom = Math.max(0x51, (task.data[2]! & 0xff) - 6);
    task.data[2] = (top << 8) | bottom;
    if (top === 0x50 && bottom === 0x51) task.data[0]++;
  }

  private ShowMonEffect_Outdoors_6(task: FieldMoveShowMonTask): void {
    task.data[1] = 0x00f1; task.data[2] = 0x00a1; task.data[3] = 0;
    task.data[0]++;
  }

  private ShowMonEffect_Outdoors_7(task: FieldMoveShowMonTask): void {
    this.FreeResourcesAndDestroySprite(task.mon);
    if (task.overlay) this.overlays.delete(task.overlay);
    this.remove(C.FLDEFF_FIELD_MOVE_SHOW_MON);
    tasks.destroy(task.id);
  }

  private VBlankCB_ShowMonEffect_Outdoors(task: FieldMoveShowMonTask, ctx: CanvasRenderingContext2D): void {
    if (!task.image || task.data[0] < 2 || task.data[0] >= 6) return;
    const h = task.data[1]!, v = task.data[2]!;
    const left = (h & 0xffff) >>> 8, right = h & 0xff, top = (v & 0xffff) >>> 8, bottom = v & 0xff;
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, Math.max(0, right - left), Math.max(0, bottom - top)); ctx.clip();
    this.drawScrolled(ctx, task.image, task.data[5]!, 40); ctx.restore();
  }

  private Task_ShowMon_Indoors(task: FieldMoveShowMonTask): void {
    const state = task.data[0]!;
    if (state === 0) this.ShowMonEffect_Indoors_1(task);
    else if (state === 1) this.ShowMonEffect_Indoors_2(task);
    else if (state === 2) this.ShowMonEffect_Indoors_3(task);
    else if (state === 3) this.ShowMonEffect_Indoors_4(task);
    else if (state === 4) this.ShowMonEffect_Indoors_5(task);
    else if (state === 5) this.ShowMonEffect_Indoors_6(task);
    else this.ShowMonEffect_Indoors_7(task);
  }

  private ShowMonEffect_Indoors_1(task: FieldMoveShowMonTask): void {
    task.data[1] = 0; task.data[2] = 0;
    task.overlay = (ctx) => this.VBlankCB_ShowMonEffect_Indoors(task, ctx);
    this.overlays.add(task.overlay);
    task.data[0]++;
  }

  private ShowMonEffect_Indoors_2(task: FieldMoveShowMonTask): void {
    task.image = this.LoadFieldMoveStreaksTilemapToVram(false);
    task.data[0]++;
  }

  private ShowMonEffect_Indoors_3(task: FieldMoveShowMonTask): void {
    if (this.SlideIndoorBannerOnscreen(task)) {
      task.mon.callback = (sprite) => this.SpriteCB_FieldMoveMonSlideOnscreen(sprite);
      task.data[0]++;
    }
    this.AnimateIndoorShowMonBg(task);
  }

  private ShowMonEffect_Indoors_4(task: FieldMoveShowMonTask): void {
    this.AnimateIndoorShowMonBg(task);
    if (task.mon.data[7]) task.data[0]++;
  }

  private ShowMonEffect_Indoors_5(task: FieldMoveShowMonTask): void {
    this.AnimateIndoorShowMonBg(task);
    task.data[3] = task.data[1]! & 7;
    task.data[4] = 0;
    task.data[0]++;
  }

  private ShowMonEffect_Indoors_6(task: FieldMoveShowMonTask): void {
    this.AnimateIndoorShowMonBg(task);
    if (this.SlideIndoorBannerOffscreen(task)) task.data[0]++;
  }

  private ShowMonEffect_Indoors_7(task: FieldMoveShowMonTask): void {
    this.FreeResourcesAndDestroySprite(task.mon);
    if (task.overlay) this.overlays.delete(task.overlay);
    this.remove(C.FLDEFF_FIELD_MOVE_SHOW_MON);
    tasks.destroy(task.id);
  }

  private VBlankCB_ShowMonEffect_Indoors(task: FieldMoveShowMonTask, ctx: CanvasRenderingContext2D): void {
    if (!task.image || task.data[0] < 2 || task.data[0] >= 6) return;
    const erasing = task.data[0] >= 5;
    const shown = Math.min(240, Math.max(0, task.data[4]! * 8));
    const left = erasing ? 0 : 240 - shown;
    const right = erasing ? 240 - shown : 240;
    if (right <= left) return;
    ctx.save(); ctx.beginPath(); ctx.rect(left, 40, right - left, 80); ctx.clip();
    this.drawScrolled(ctx, task.image, task.data[1]!, 40); ctx.restore();
  }

  private AnimateIndoorShowMonBg(task: FieldMoveShowMonTask): void {
    task.data[1] = (task.data[1]! - 16) << 16 >> 16;
    task.data[3] = (task.data[3]! + 16) << 16 >> 16;
  }

  private SlideIndoorBannerOnscreen(task: FieldMoveShowMonTask): boolean {
    if (task.data[4]! >= 32) return true;
    const dstOffs = (task.data[3]! >> 3) & 0x1f;
    if (dstOffs >= task.data[4]!) task.data[4] = (task.data[4]! + 2) << 16 >> 16;
    return false;
  }

  private SlideIndoorBannerOffscreen(task: FieldMoveShowMonTask): boolean {
    if (task.data[4]! >= 32) return true;
    const dstOffs = task.data[3]! >> 3;
    if (dstOffs >= task.data[4]!) task.data[4] = (task.data[4]! + 2) << 16 >> 16;
    return false;
  }

  private FreeResourcesAndDestroySprite(sprite: Sprite): void {
    this.ow.sprites.destroy(sprite);
  }

  // ---------------------------------------------------------------- surf / waterfall

  /** FldEff_UseSurf / Task_FldEffUseSurf (field_effect.c). */
  private FldEff_UseSurf(): void {
    const ow = this.ow;
    const task = { id: 0, data: new Int16Array(16) };
    task.data[15] = this.args[0]!;
    ow.savedMusic = 0;
    if (musicCanOverrideMapMusic(ow, C.MUS_SURF)) sound.playNewMapMusic(C.MUS_SURF);
    task.id = tasks.create(() => this.Task_FldEffUseSurf(task), 0xff);
  }

  /** FldEff_UseDive / Task_UseDive (field_effect.c); FireRed has no map Dive links. */
  private FldEff_UseDive(): void {
    const task: UseDiveTask = { id: 0, data: new Int16Array(16) };
    task.data[15] = this.args[0]!;
    task.data[14] = this.args[1]!;
    task.id = tasks.create(() => this.Task_UseDive(task), 0xff);
    this.Task_UseDive(task);
  }

  private Task_UseDive(task: UseDiveTask): void {
    let advance: boolean;
    do {
      switch (task.data[0]) {
        case 0: advance = this.DiveFieldEffect_Init(task); break;
        case 1: advance = this.DiveFieldEffect_ShowMon(task); break;
        case 2: advance = this.DiveFieldEffect_TryWarp(task); break;
        default: advance = false; break;
      }
    } while (advance);
  }

  /** DiveFieldEffect_Init (field_effect.c). */
  private DiveFieldEffect_Init(task: UseDiveTask): boolean {
    this.ow.player.preventStep = true;
    task.data[0]++;
    return false;
  }

  /** DiveFieldEffect_ShowMon (field_effect.c). */
  private DiveFieldEffect_ShowMon(task: UseDiveTask): boolean {
    this.ow.LockPlayerFieldControls();
    this.args[0] = task.data[15]!;
    this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
    task.data[0]++;
    return false;
  }

  /** DiveFieldEffect_TryWarp (field_effect.c). */
  private DiveFieldEffect_TryWarp(task: UseDiveTask): boolean {
    if (this.active.has(C.FLDEFF_FIELD_MOVE_SHOW_MON)) return false;
    this.ow.control.dive_warp(PlayerGetDestCoords(), this.ow.player.object.currentMetatileBehavior);
    tasks.destroy(task.id);
    this.remove(C.FLDEFF_USE_DIVE);
    return false;
  }

  private Task_FldEffUseSurf(task: { id: number; data: Int16Array }): void {
    const state = task.data[0]!;
    if (state === 0) this.UseSurfEffect_1(task);
    else if (state === 1) this.UseSurfEffect_2(task);
    else if (state === 2) this.UseSurfEffect_3(task);
    else if (state === 3) this.UseSurfEffect_4(task);
    else if (state === 4) this.UseSurfEffect_5(task);
  }

  private UseSurfEffect_1(task: { data: Int16Array }): void {
    const player = this.ow.player.object;
    this.ow.controlsLocked = true;
    this.ow.objects.freezeAll();
    this.ow.player.preventStep = true;
    this.ow.player.flags |= PLAYER_AVATAR_FLAG_SURFING;
    const [dx, dy] = DIRECTION_VECTORS[player.movementDirection]!;
    task.data[1] = player.currentCoords.x;
    task.data[2] = player.currentCoords.y;
    task.data[1] = (task.data[1]! + dx) << 16 >> 16;
    task.data[2] = (task.data[2]! + dy) << 16 >> 16;
    task.data[0]++;
  }

  private UseSurfEffect_2(task: { data: Int16Array }): void {
    const player = this.ow.player.object;
    if (this.ow.objects.isMovementOverridden(player) && !this.ow.objects.ObjectEventClearHeldMovementIfFinished(player)) return;
    this.ow.player.StartPlayerAvatarSummonMonForFieldMoveAnim();
    this.ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_START_ANIM_IN_DIRECTION);
    task.data[0]++;
  }

  private UseSurfEffect_3(task: { data: Int16Array }): void {
    const player = this.ow.player.object;
    if (!this.ow.objects.ObjectEventCheckHeldMovementStatus(player)) return;
    this.args[0] = (task.data[15]! | SHOW_MON_CRY_NO_DUCKING) >>> 0;
    this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
    task.data[0]++;
  }

  private UseSurfEffect_4(task: { data: Int16Array }): void {
    if (this.active.has(C.FLDEFF_FIELD_MOVE_SHOW_MON)) return;
    const player = this.ow.player.object;
    this.ow.player.setState(PLAYER_AVATAR_GFX_RIDE);
    this.ow.objects.ObjectEventClearHeldMovementIfFinished(player);
    this.ow.objects.setHeldMovement(player, actionJumpSpecial(player.movementDirection));
    this.ow.effects.startSurfBlob(player, C.BOB_NONE);
    this.args[0] = task.data[1]!;
    this.args[1] = task.data[2]!;
    this.args[2] = this.ow.objects.objects.indexOf(player);
    task.data[0]++;
  }

  private UseSurfEffect_5(_task: { id: number; data: Int16Array }): void {
    const player = this.ow.player.object;
    if (!this.ow.objects.ObjectEventClearHeldMovementIfFinished(player)) return;
    this.ow.player.preventStep = false;
    this.ow.player.flags &= ~PLAYER_AVATAR_FLAG_CONTROLLABLE;
    this.ow.objects.setHeldMovement(player, actionFace(player.movementDirection));
    this.ow.effects.setSurfBlobBobState(C.BOB_PLAYER_AND_MON);
    this.ow.objects.unfreezeAll();
    this.ow.controlsLocked = false;
    this.remove(C.FLDEFF_USE_SURF);
    SetHelpContext(C.HELPCONTEXT_SURFING);
    tasks.destroy(_task.id);
  }

  /** FldEff_UseWaterfall: create Task_UseWaterfall and run its initial callback now. */
  private FldEff_UseWaterfall(): void {
    const task = { id: 0, data: new Int16Array(16) };
    task.data[1] = this.args[0]!;
    task.id = tasks.create(() => this.Task_UseWaterfall(task), 0xff);
    this.Task_UseWaterfall(task);
  }

  private Task_UseWaterfall(task: { id: number; data: Int16Array }): void {
    while (true) {
      const state = task.data[0]!;
      const continueNow = state === 0 ? this.waterfall_0_setup(task)
        : state === 1 ? this.waterfall_1_do_anim_probably(task)
        : state === 2 ? this.waterfall_2_wait_anim_finish_probably(task)
        : state === 3 ? this.waterfall_3_move_player_probably(task)
        : state === 4 ? this.waterfall_4_wait_player_move_probably(task)
        : false;
      if (!continueNow) return;
    }
  }

  private waterfall_0_setup(task: { data: Int16Array }): boolean {
    this.ow.controlsLocked = true;
    this.ow.player.preventStep = true;
    task.data[0]++;
    return false;
  }

  private waterfall_1_do_anim_probably(task: { data: Int16Array }): boolean {
    const player = this.ow.player.object;
    this.ow.controlsLocked = true;
    if (!this.ow.objects.isMovementOverridden(player)) {
      this.ow.objects.ObjectEventClearHeldMovementIfFinished(player);
      this.args[0] = task.data[1]!;
      this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
      task.data[0]++;
    }
    return false;
  }

  private waterfall_2_wait_anim_finish_probably(task: { data: Int16Array }): boolean {
    if (this.active.has(C.FLDEFF_FIELD_MOVE_SHOW_MON)) return false;
    task.data[0]++;
    return true;
  }

  private waterfall_3_move_player_probably(task: { data: Int16Array }): boolean {
    this.ow.objects.setHeldMovement(this.ow.player.object, actionWalkSlower(DIR_NORTH));
    task.data[0]++;
    return false;
  }

  private waterfall_4_wait_player_move_probably(task: { id: number; data: Int16Array }): boolean {
    const player = this.ow.player.object;
    if (!this.ow.objects.ObjectEventClearHeldMovementIfFinished(player)) return false;
    if (MB.MetatileBehavior_IsWaterfall(player.currentMetatileBehavior)) {
      task.data[0] = 3;
      return true;
    }
    this.ow.controlsLocked = false;
    this.ow.player.preventStep = false;
    tasks.destroy(task.id);
    this.remove(C.FLDEFF_USE_WATERFALL);
    return false;
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
        if (MapGridGetElevationAt(x, y, ow.map) !== p.currentElevation) continue;
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
    const metatileId = MapGridGetMetatileIdAt(x, y, this.ow.map);
    for (const [from, to] of mapping) {
      if (from === metatileId) {
        MapGridSetMetatileIdAt(x, y, to, this.ow.map);
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
  private CutMoveOpenDottedHoleDoor(): void {
    const ow = this.ow;
    MapGridSetMetatileIdAt(31, 31, rom.c("METATILE_SeviiIslands67_DottedHoleDoor_Open"), ow.map);
    ow.renderer?.invalidate();
    sound.playSE(C.SE_BANG);
    flagSet(C.FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE);
    ow.controlsLocked = false;
    ow.objects.unfreezeAll();
  }

  // ---------------------------------------------------------------- escape rope / dig / teleport

  /** StartEscapeRopeFieldEffect (field_effect.c). */
  StartEscapeRopeFieldEffect(): void {
    this.ow.LockPlayerFieldControls();
    this.ow.objects.freezeAll();
    tasks.create((taskId) => this.Task_EscapeRopeWarpOut(taskId), 80);
  }

  startEscapeRope(): void { this.StartEscapeRopeFieldEffect(); }

  private Task_EscapeRopeWarpOut(taskId: number): void {
    const data = tasks.data(taskId);
    if (data[0] === 0) this.EscapeRopeWarpOutEffect_Init(data);
    else this.EscapeRopeWarpOutEffect_Spin(taskId);
  }

  private EscapeRopeWarpOutEffect_Init(data: number[]): void {
    data[0]++;
    data[13] = 64;
    data[14] = this.ow.player.object.facingDirection;
    data[15] = DIR_NONE;
  }

  private EscapeRopeWarpOutEffect_Spin(taskId: number): void {
    const data = tasks.data(taskId);
    const player = this.ow.player.object;
    this.SpinObjectEvent(player, data, 1, 2);
    if (data[3]! < 60) {
      data[3] = data[3]! + 1;
      if (data[3] === 20) sound.playSE(C.SE_WARP_IN);
    } else if (data[4] === 0 && !this.WarpOutObjectEventUpwards(player, data)) {
      this.ow.TryFadeOutOldMapMusic();
      this.ow.warpFadeOutScreen();
      data[4] = 1;
    }
    if (data[4] === 1 && !paletteFade.active && this.ow.BGMusicStopped()) {
      this.ow.objects.setDirection(player, data[15]!);
      this.ow.SetWarpDestinationToEscapeWarp();
      this.ow.fieldCallback = () => this.FieldCallback_EscapeRopeExit();
      this.ow.warpIntoMapAndLoad();
      tasks.destroy(taskId);
    }
  }

  /** SpinObjectEvent (field_effect.c): advance through the source facing table and acceleration. */
  private SpinObjectEvent(player: ObjectEvent, data: number[], delayIndex: number, turnsIndex: number): number {
    const directions = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
    if (!this.ow.objects.isMovementOverridden(player) || this.ow.objects.ObjectEventClearHeldMovementIfFinished(player) !== 0) {
      if (data[delayIndex] !== 0 && --data[delayIndex]! !== 0) return player.facingDirection;
      const direction = directions[player.facingDirection] ?? DIR_SOUTH;
      this.ow.objects.setHeldMovement(player, actionFace(direction));
      if (data[turnsIndex]! < 12) data[turnsIndex] = data[turnsIndex]! + 1;
      data[delayIndex] = 12 >> data[turnsIndex]!;
      return direction;
    }
    return player.facingDirection;
  }

  /** WarpOutObjectEventUpwards (field_effect.c): rise in 8-pixel steps and restore priority at the cutoff. */
  private WarpOutObjectEventUpwards(player: ObjectEvent, data: number[]): boolean {
    const sprite = player.sprite;
    switch (data[5]) {
      case 0:
        data[5] = 1; // CameraObjectReset2 is a no-op in this renderer.
        // fall through
      case 1:
        sprite.y2 -= 8;
        data[6] = data[6]! - 8;
        if (data[6]! <= -16) {
          player.fixedPriority = true;
          sprite.priority = 1;
          sprite.subpriority = 0;
          sprite.subspriteMode = C.SUBSPRITES_OFF;
          data[5] = 2;
        }
        break;
      case 2:
        sprite.y2 -= 8;
        data[6] = data[6]! - 8;
        if (data[6]! <= -88) { data[5] = 3; return false; }
        break;
      case 3: return false;
    }
    return true;
  }

  /** FieldCallback_EscapeRopeExit (field_effect.c). */
  private FieldCallback_EscapeRopeExit(): void {
    const ow = this.ow;
    ow.fieldCallback = null;
    ow.playSpecialMapMusic();
    ow.WarpFadeInScreen();
    QuestLog_DrawPreviouslyOnQuestHeaderIfInPlaybackMode(ow);
    ow.LockPlayerFieldControls();
    ow.objects.freezeAll();
    ow.player.object.invisible = true;
    tasks.create((taskId) => this.Task_EscapeRopeWarpIn(taskId), 0);
  }

  private Task_EscapeRopeWarpIn(taskId: number): void {
    const data = tasks.data(taskId);
    if (data[0] === 0) this.EscapeRopeWarpInEffect_Init(data);
    else this.EscapeRopeWarpInEffect_Spin(taskId);
  }

  private EscapeRopeWarpInEffect_Init(data: number[]): void {
    if (!IsWeatherNotFadingIn()) return;
    sound.playSE(C.SE_WARP_OUT);
    data[15] = this.ow.player.object.facingDirection;
    data[0]++;
  }

  private EscapeRopeWarpInEffect_Spin(taskId: number): void {
    const data = tasks.data(taskId);
    const player = this.ow.player.object;
    const moving = this.WarpInObjectEventDownwards(player, data);
    player.invisible = false;
    if (data[6]! < 8) data[6] = data[6]! + 1;
    else if (data[7] === 0) {
      data[6] = data[6]! + 1;
      data[8] = this.SpinObjectEvent(player, data, 9, 10);
      if (data[6]! >= 50 && data[8] === data[15]) data[7] = 1;
    }
    if (!moving && data[8] === data[15] && this.ow.objects.ObjectEventCheckHeldMovementStatus(player) === 1) {
      player.invisible = false;
      player.fixedPriority = false;
      this.ow.UnlockPlayerFieldControls();
      this.ow.objects.unfreezeAll();
      tasks.destroy(taskId);
    }
  }

  /** WarpInObjectEventDownwards (field_effect.c): descend and restore the original sprite layout. */
  private WarpInObjectEventDownwards(player: ObjectEvent, data: number[]): boolean {
    const sprite = player.sprite;
    switch (data[1]) {
      case 0:
        data[2] = -88;
        sprite.y2 -= 88;
        data[3] = sprite.priority;
        data[4] = sprite.subpriority;
        data[5] = sprite.subspriteMode;
        player.fixedPriority = true;
        sprite.priority = 1;
        sprite.subpriority = 0;
        sprite.subspriteMode = C.SUBSPRITES_OFF;
        data[1] = 1;
        // fall through
      case 1:
        sprite.y2 += 4;
        data[2] = data[2]! + 4;
        if (data[2]! >= -16) {
          sprite.priority = data[3]!;
          sprite.subpriority = data[4]!;
          sprite.subspriteMode = data[5]!;
          data[1] = 2;
        }
        break;
      case 2:
        sprite.y2 += 4;
        data[2] = data[2]! + 4;
        if (data[2]! >= 0) {
          sprite.y2 = 0;
          sound.playSE(C.SE_CLICK);
          data[1] = 3;
          return false;
        }
        break;
      case 3: return false;
    }
    return true;
  }

  /** CreateTeleportFieldEffectTask (TeleportFieldEffectTask1-4) */
  startTeleport(): void {
    this.CreateTeleportFieldEffectTask();
  }

  private teleportFieldTaskId = -1;
  private teleportFieldTaskData = new Array<number>(16).fill(0);
  private teleportInTaskId = -1;
  private teleportInTaskData = new Array<number>(16).fill(0);

  /** CreateTeleportFieldEffectTask (field_effect.c). */
  CreateTeleportFieldEffectTask(): void {
    this.teleportFieldTaskData = new Array<number>(16).fill(0);
    this.teleportFieldTaskId = tasks.create(() => this.Task_DoTeleportFieldEffect(), 0);
  }

  /** Task_DoTeleportFieldEffect (field_effect.c). */
  private Task_DoTeleportFieldEffect(): void {
    switch (this.teleportFieldTaskData[0]) {
      case 0: this.TeleportFieldEffectTask1(); break;
      case 1: this.TeleportFieldEffectTask2(); break;
      case 2: this.TeleportFieldEffectTask3(); break;
      case 3: this.TeleportFieldEffectTask4(); break;
    }
  }

  private TeleportFieldEffectTask1(): void {
    this.ow.controlsLocked = true;
    this.ow.objects.freezeAll();
    this.teleportFieldTaskData[15] = this.ow.player.object.facingDirection;
    this.teleportFieldTaskData[0]++;
  }

  private TeleportFieldEffectTask2(): void {
    const d = this.teleportFieldTaskData, p = this.ow.player.object;
    const spin = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
    if (d[1] === 0 || --d[1] === 0) { this.ow.objects.turn(p, spin[p.facingDirection] ?? DIR_SOUTH); d[1] = 8; d[2]++; }
    if (d[2] > 7 && d[15] === p.facingDirection) {
      d[0]++; d[1] = 4; d[2] = 8; d[3] = 1; sound.playSE(C.SE_WARP_IN);
    }
  }

  private TeleportFieldEffectTask3(): void {
    const d = this.teleportFieldTaskData, p = this.ow.player.object, sprite = p.sprite;
    const spin = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
    if (--d[1] <= 0) { d[1] = 4; this.ow.objects.turn(p, spin[p.facingDirection] ?? DIR_SOUTH); }
    sprite.y -= d[3]; d[4] += d[3];
    if (--d[2] <= 0) { d[2] = 4; if (d[3] < 8) d[3] <<= 1; }
    if (d[4] > 8) { sprite.priority = 1; if (sprite.subspriteMode !== C.SUBSPRITES_OFF) sprite.subspriteMode = C.SUBSPRITES_IGNORE_PRIORITY; }
    if (d[4] >= 0xa8) { d[0]++; this.ow.tryFadeOutOldMapMusic(); this.ow.warpFadeOutScreen(); }
  }

  private TeleportFieldEffectTask4(): void {
    if (!paletteFade.active && sound.isNotWaitingForBGMStop()) {
      this.ow.SetWarpDestinationToLastHealLocation();
      this.ow.fieldCallback = () => this.FieldCallback_TeleportIn();
      tasks.destroy(this.teleportFieldTaskId);
      this.ow.warpIntoMapAndLoad();
    }
  }

  /** FieldCallback_TeleportIn (field_effect.c). */
  private FieldCallback_TeleportIn(): void {
    this.ow.playSpecialMapMusic(); this.ow.WarpFadeInScreen();
    this.ow.controlsLocked = true; this.ow.objects.freezeAll();
    this.ow.player.SetPlayerInvisibility(true);
    this.teleportInTaskData = new Array<number>(16).fill(0);
    this.teleportInTaskId = tasks.create(() => this.Task_DoTeleportInFieldEffect(), 0);
  }

  /** Task_DoTeleportInFieldEffect and TeleportInFieldEffectTask1-3 (field_effect.c). */
  private Task_DoTeleportInFieldEffect(): void {
    switch (this.teleportInTaskData[0]) {
      case 0: this.TeleportInFieldEffectTask1(); break;
      case 1: this.TeleportInFieldEffectTask2(); break;
      case 2: this.TeleportInFieldEffectTask3(); break;
    }
  }

  /** TeleportInFieldEffectTask1 (field_effect.c). */
  private TeleportInFieldEffectTask1(): void {
    const d = this.teleportInTaskData, p = this.ow.player.object, sprite = p.sprite;
    if (!IsWeatherNotFadingIn()) return;
    const center = sprite.centerToCornerVecY;
    sprite.y2 = -(sprite.y - this.ow.camY - center);
    this.ow.player.SetPlayerInvisibility(false);
    d[0]++; d[1] = 8; d[2] = 1; d[14] = sprite.subspriteMode; d[15] = p.facingDirection;
    sound.playSE(C.SE_WARP_IN);
  }

  /** TeleportInFieldEffectTask2 (field_effect.c). */
  private TeleportInFieldEffectTask2(): void {
    const d = this.teleportInTaskData, p = this.ow.player.object, sprite = p.sprite;
    const spin = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
    if (d[0] === 1) {
      sprite.y2 += d[1];
      if (sprite.y2 >= -8) {
        if (d[13] === 0) { d[13]++; p.triggerGroundEffectsOnMove = true; sprite.subspriteMode = d[14]; }
      } else { sprite.priority = 1; if (sprite.subspriteMode !== C.SUBSPRITES_OFF) sprite.subspriteMode = C.SUBSPRITES_IGNORE_PRIORITY; }
      if (sprite.y2 >= -0x30 && d[1] > 1 && !(sprite.y2 & 1)) d[1]--;
      if (--d[2] === 0) { d[2] = 4; this.ow.objects.turn(p, spin[p.facingDirection] ?? DIR_SOUTH); }
      if (sprite.y2 >= 0) { sprite.y2 = 0; d[0]++; d[1] = 1; d[2] = 0; }
    }
  }

  /** TeleportInFieldEffectTask3 (field_effect.c). */
  private TeleportInFieldEffectTask3(): void {
    const d = this.teleportInTaskData, p = this.ow.player.object;
    const spin = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
    if (--d[1] === 0) {
      this.ow.objects.turn(p, spin[p.facingDirection] ?? DIR_SOUTH); d[1] = 8;
      if (++d[2] > 4 && d[14] === p.facingDirection) {
        this.ow.objects.unfreezeAll(); this.ow.controlsLocked = false; tasks.destroy(this.teleportInTaskId);
      }
    }
  }

  // ---------------------------------------------------------------- pokecenter / hall of fame

  /** FldEff_PokecenterHeal: begin the task after the field-effect dispatcher activates its id. */
  FldEff_PokecenterHeal(): void {
    const data = new Int16Array(16);
    data[1] = CalculatePlayerPartyCount(); data[2] = 93; data[3] = 36; data[4] = 128; data[5] = 24;
    const task: PokeballGlowTask = { id: 0, data, glow: new Sprite() };
    task.id = tasks.create(() => this.Task_PokecenterHeal(task), 0xff);
  }

  private Task_PokecenterHeal(task: PokeballGlowTask): void {
    switch (task.data[0]) {
      case 0: this.PokecenterHealEffect_Init(task); break;
      case 1: this.PokecenterHealEffect_WaitForBallPlacement(task); break;
      case 2: this.PokecenterHealEffect_WaitForBallFlashing(task); break;
      case 3: this.PokecenterHealEffect_WaitForSoundAndEnd(task); break;
    }
  }

  private PokecenterHealEffect_Init(task: PokeballGlowTask): void {
    task.data[0]++;
    task.glow = this.CreateGlowingPokeballsEffect(task.data[1], task.data[2], task.data[3], true);
    task.monitor = this.CreatePokecenterMonitorSprite(task.data[4], task.data[5]);
  }

  private PokecenterHealEffect_WaitForBallPlacement(task: PokeballGlowTask): void {
    if (task.glow.data[0] >= 2) { task.monitor!.data[0]++; task.data[0]++; }
  }

  private PokecenterHealEffect_WaitForBallFlashing(task: PokeballGlowTask): void {
    if (task.glow.data[0] > 4) task.data[0]++;
  }

  private PokecenterHealEffect_WaitForSoundAndEnd(task: PokeballGlowTask): void {
    if (task.glow.data[0] > 6) {
      this.ow.sprites.destroy(task.glow); this.remove(C.FLDEFF_POKECENTER_HEAL); tasks.destroy(task.id);
    }
  }

  /** FldEff_HallOfFameRecord. */
  FldEff_HallOfFameRecord(): void {
    const data = new Int16Array(16);
    data[1] = CalculatePlayerPartyCount(); data[2] = 117; data[3] = 60;
    const task: PokeballGlowTask = { id: 0, data, glow: new Sprite() };
    task.id = tasks.create(() => this.Task_HallOfFameRecord(task), 0xff);
  }

  private Task_HallOfFameRecord(task: PokeballGlowTask): void {
    switch (task.data[0]) {
      case 0: this.HallOfFameRecordEffect_Init(task); break;
      case 1: this.HallOfFameRecordEffect_WaitForBallPlacement(task); break;
      case 2: this.HallOfFameRecordEffect_WaitForBallFlashing(task); break;
      case 3: this.HallOfFameRecordEffect_WaitForSoundAndEnd(task); break;
    }
  }

  private HallOfFameRecordEffect_Init(task: PokeballGlowTask): void {
    task.data[0]++; task.glow = this.CreateGlowingPokeballsEffect(task.data[1], task.data[2], task.data[3], false);
  }

  private HallOfFameRecordEffect_WaitForBallPlacement(task: PokeballGlowTask): void {
    if (task.glow.data[0] > 1) { this.CreateHofMonitorSprite(120, 25); task.data[15]++; task.data[0]++; }
  }

  private HallOfFameRecordEffect_WaitForBallFlashing(task: PokeballGlowTask): void {
    if (task.glow.data[0] > 4) task.data[0]++;
  }

  private HallOfFameRecordEffect_WaitForSoundAndEnd(task: PokeballGlowTask): void {
    if (task.glow.data[0] > 6) {
      this.ow.sprites.destroy(task.glow); this.remove(C.FLDEFF_HALL_OF_FAME_RECORD); tasks.destroy(task.id);
    }
  }

  /** CreateGlowingPokeballsEffect (field_effect.c). */
  private CreateGlowingPokeballsEffect(numMons: number, x: number, y: number, playHealSe: boolean): Sprite {
    const glow = new Sprite(), pal = Uint16Array.from(incbin16le(incbin("sPokeballGlow_Pal")));
    const state: PokeballGlowSprite = { palette: pal, unfaded: pal.slice(), gfx: incbin("sPokeballGlow_Gfx"), cacheKey: "" };
    glow.data[5] = Number(playHealSe); glow.data[6] = numMons; glow.x2 = x; glow.y2 = y; glow.subpriority = 0xff; glow.invisible = true;
    this.pokeballGlowSprites.set(glow, state);
    glow.callback = (sprite) => this.SpriteCB_PokeballGlowEffect(sprite);
    this.ow.sprites.add(glow);
    return glow;
  }

  private SpriteCB_PokeballGlowEffect(sprite: Sprite): void {
    switch (sprite.data[0]) {
      case 0: this.PokeballGlowEffect_PlaceBalls(sprite); break;
      case 1: this.PokeballGlowEffect_TryPlaySe(sprite); break;
      case 2: this.PokeballGlowEffect_FlashFirstThree(sprite); break;
      case 3: this.PokeballGlowEffect_FlashLast(sprite); break;
      case 4: this.PokeballGlowEffect_WaitAfterFlash(sprite); break;
      case 5: this.PokeballGlowEffect_Dummy(sprite); break;
      case 6: this.PokeballGlowEffect_WaitForSound(sprite); break;
      case 7: this.PokeballGlowEffect_Idle(sprite); break;
    }
  }

  private PokeballGlowEffect_PlaceBalls(sprite: Sprite): void {
    if (sprite.data[1] === 0 || --sprite.data[1] === 0) {
      sprite.data[1] = 25;
      const offset = [[0, 0], [6, 0], [0, 4], [6, 4], [0, 8], [6, 8]][sprite.data[2]];
      const ball = new Sprite(), owner = sprite;
      ball.width = 8; ball.height = 8; ball.centerToCornerVecX = -4; ball.centerToCornerVecY = -4;
      ball.x = offset[0] + sprite.x2; ball.y = offset[1] + sprite.y2; ball.coordOffsetEnabled = false; ball.priority = 2; ball.subpriority = 0xff;
      ball.data[0] = sprite.data[7]; this.pokeballGlowBallOwners.set(ball, owner);
      ball.draw = (ctx, dx, dy) => { const st = this.pokeballGlowSprites.get(owner)!; const key = st.palette.join(","); if (!st.image || st.cacheKey !== key) { st.cacheKey = key; st.image = spriteSheet(st.gfx, st.palette, 8, 8); } ctx.drawImage(st.image, dx, dy); };
      ball.callback = (sp) => this.SpriteCB_PokeballGlow(sp);
      this.ow.sprites.add(ball); sprite.data[2]++; sprite.data[6]--; sound.playSE(C.SE_BALL);
    }
    if (sprite.data[6] === 0) { sprite.data[1] = 32; sprite.data[0]++; }
  }

  private PokeballGlowEffect_TryPlaySe(sprite: Sprite): void {
    if (--sprite.data[1] === 0) { sprite.data[0]++; sprite.data[1] = 8; sprite.data[2] = 0; sprite.data[3] = 0; if (sprite.data[5]) sound.playFanfare(C.MUS_HEAL); }
  }

  private PokeballGlowEffect_FlashFirstThree(sprite: Sprite): void {
    if (--sprite.data[1] === 0) { sprite.data[1] = 8; sprite.data[2] = (sprite.data[2] + 1) & 3; if (sprite.data[2] === 0) sprite.data[3]++; }
    const phase = sprite.data[2], red = [16, 12, 8, 0];
    for (const [i, p] of [[8, (phase + 3) & 3], [6, (phase + 2) & 3], [2, (phase + 1) & 3], [5, phase], [3, phase]]) this.MultiplyInvertedPaletteRGBComponents(sprite, i, red[p]);
    if (sprite.data[3] >= 3) { sprite.data[0]++; sprite.data[1] = 8; sprite.data[2] = 0; }
  }

  private PokeballGlowEffect_FlashLast(sprite: Sprite): void {
    if (--sprite.data[1] === 0) { sprite.data[1] = 8; sprite.data[2] = (sprite.data[2] + 1) & 3; if (sprite.data[2] === 3) { sprite.data[0]++; sprite.data[1] = 30; } }
    for (const i of [8, 6, 2, 5, 3]) this.MultiplyInvertedPaletteRGBComponents(sprite, i, [16, 12, 8, 0][sprite.data[2]]);
  }

  private PokeballGlowEffect_WaitAfterFlash(sprite: Sprite): void { if (--sprite.data[1] === 0) sprite.data[0]++; }
  private PokeballGlowEffect_Dummy(sprite: Sprite): void { sprite.data[0]++; }
  private PokeballGlowEffect_WaitForSound(sprite: Sprite): void { if (!sprite.data[5] || sound.isFanfareTaskInactive()) sprite.data[0]++; }
  private PokeballGlowEffect_Idle(_sprite: Sprite): void {}

  private MultiplyInvertedPaletteRGBComponents(sprite: Sprite, index: number, amount: number): void {
    const state = this.pokeballGlowSprites.get(sprite)!; const c = state.unfaded[index];
    const r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
    state.palette[index] = (r + (((31 - r) * amount) >> 4)) | ((g + (((31 - g) * amount) >> 4)) << 5) | (b << 10);
  }

  private SpriteCB_PokeballGlow(sprite: Sprite): void { const owner = this.pokeballGlowBallOwners.get(sprite); if (owner && owner.data[0] > 4) this.ow.sprites.destroy(sprite); }

  /** CreatePokecenterMonitorSprite (field_effect.c). */
  private CreatePokecenterMonitorSprite(x: number, y: number): Sprite {
    const sprite = this.createMonitorSprite(x, y);
    sprite.callback = (sp) => this.SpriteCB_PokecenterMonitor(sp);
    return sprite;
  }

  private SpriteCB_PokecenterMonitor(sprite: Sprite): void {
    if (sprite.data[0] !== 0) { sprite.data[0] = 0; sprite.invisible = false; sprite.startAnim(1); sprite.data[1] = 1; }
    if (sprite.data[1] && sprite.animEnded) this.ow.sprites.destroy(sprite);
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

  private CreateHofMonitorSprite(x: number, y: number): void {
    const tilesAll = incbin("sHofMonitor_Gfx");
    const pal = incbin16le(incbin("sHofMonitor_Pal"));
    const frames = [0, 1, 2, 3].map((f) => spriteSheet(tilesAll.subarray(f * 128, f * 128 + 128), pal, 16, 16));
    const s = new Sprite();
    s.anims = animCmds(cdata<unknown[]>("field_effect", "sAnim_HofMonitor"));
    s.width = 16; s.height = 16; s.centerToCornerVecX = -8; s.centerToCornerVecY = -8;
    s.x = x; s.y = y; s.coordOffsetEnabled = false; s.priority = 2;
    s.draw = (ctx, dx, dy) => ctx.drawImage(frames[s.imageValue] ?? frames[0], dx, dy);
    s.callback = (sp) => this.SpriteCB_HallOfFameMonitor(sp);
    s.startAnim(0);
    this.ow.sprites.add(s);
  }

  private SpriteCB_HallOfFameMonitor(sprite: Sprite): void { if (sprite.animEnded) this.ow.sprites.destroy(sprite); }

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
    const attributes = MapGridGetMetatileAttributeAt(p.currentCoords.x, p.currentCoords.y, 0xff, this.ow.map);
    return this.ow.game.wild.sweetScentEncounter(attributes);
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

  /** FldEff_PhotoFlash (field_effect.c). */
  FldEff_PhotoFlash(): void {
    BlendPalettes(PALETTES_ALL, 0x10, RGB_WHITE);
    BeginNormalPaletteFade(PALETTES_ALL, -1, 0x0f, 0x00, RGB_WHITE);
    tasks.create((taskId) => this.Task_PhotoFlash(taskId), 90);
  }

  /** Task_PhotoFlash (field_effect.c). */
  Task_PhotoFlash(taskId: number): void {
    if (gPaletteFade.active) return;
    this.remove(C.FLDEFF_PHOTO_FLASH);
    tasks.destroy(taskId);
  }

  // ---------------------------------------------------------------- fly

  /** ReturnToFieldFromFlyMapSelect (field_effect.c), carrying the selected party slot. */
  ReturnToFieldFromFlyMapSelect(partyIndex: number): void {
    this.args[0] = partyIndex & 0xff;
    this.FieldCallback_UseFly();
  }

  /** FieldCallback_UseFly (field_effect.c), resumed after the Fly map returns to the field. */
  FieldCallback_UseFly(): void {
    const ow = this.ow;
    ow.fadeInFromBlack();
    tasks.create((id) => this.Task_UseFly(id), 0);
    ow.LockPlayerFieldControls();
    ow.objects.freezeAll();
    ow.fieldCallback = null;
  }

  /** Task_UseFly (field_effect.c). */
  private Task_UseFly(taskId: number): void {
    const data = tasks.data(taskId);
    if (data[0] === 0) {
      if (!IsWeatherNotFadingIn()) return;
      const partyIndex = this.args[0]!;
      this.args[0] = partyIndex < 6 ? partyIndex : 0;
      this.FldEff_FlyOut(() => {});
      data[0]++;
    }
    if (this.active.has(C.FLDEFF_FLY_OUT)) return;
    this.ow.Overworld_ResetStateAfterFly();
    this.ow.fieldCallback = () => this.FieldCallback_FlyIntoMap();
    this.ow.warpIntoMapAndLoad();
    tasks.destroy(taskId);
  }

  /** FieldCallback_FlyIntoMap (field_effect.c). */
  private FieldCallback_FlyIntoMap(): void {
    const ow = this.ow;
    ow.playSpecialMapMusic();
    ow.fadeInFromBlack();
    tasks.create((taskId) => this.Task_FlyIntoMap(taskId), 0);
    ow.player.object.invisible = true;
    if (ow.player.flags & PLAYER_AVATAR_FLAG_SURFING) ow.objects.turn(ow.player.object, DIR_WEST);
    ow.LockPlayerFieldControls();
    ow.objects.freezeAll();
    ow.fieldCallback = null;
  }

  /** Task_FlyIntoMap (field_effect.c). */
  private Task_FlyIntoMap(taskId: number): void {
    const data = tasks.data(taskId);
    if (data[0] === 0) {
      if (paletteFade.active) return;
      this.FldEff_FlyIn(() => {});
      data[0]++;
    }
    if (this.active.has(C.FLDEFF_FLY_IN)) return;
    this.ow.UnlockPlayerFieldControls();
    this.ow.objects.unfreezeAll();
    tasks.destroy(taskId);
  }

  /** CreateFlyBirdSprite (field_effect.c). */
  private CreateFlyBirdSprite(): Sprite | undefined {
    const bird = this.ow.effects.createFromTemplate("Bird", 255, 180);
    if (!bird) return undefined;
    bird.coordOffsetEnabled = false;
    bird.priority = 1;
    bird.startAnim(0);
    bird.data[7] = 0;
    bird.callback = (sprite) => this.SpriteCB_FlyBirdLeaveBall(sprite);
    return bird;
  }

  /** GetFlyBirdAnimCompleted (field_effect.c). */
  private GetFlyBirdAnimCompleted(sprite: Sprite | undefined): boolean {
    return sprite !== undefined && sprite.data[7] !== 0;
  }

  /** SetFlyBirdPlayerSpriteId (field_effect.c). */
  private SetFlyBirdPlayerSpriteId(bird: Sprite, player: Sprite | undefined): void {
    if (player) this.flyBirdPlayerSprites.set(bird, player);
    else this.flyBirdPlayerSprites.delete(bird);
  }

  /** StartFlyBirdSwoopDown (field_effect.c). */
  private StartFlyBirdSwoopDown(bird: Sprite): void {
    bird.callback = (sprite) => this.SpriteCB_FlyBirdSwoopDown(sprite);
    bird.x = 120;
    bird.y = 0;
    bird.x2 = 0;
    bird.y2 = 0;
    bird.data.fill(0);
    bird.data[6] = 0xff;
    bird.data[7] = 0;
    this.SetFlyBirdPlayerSpriteId(bird, undefined);
  }

  /** SpriteCB_FlyBirdLeaveBall (field_effect.c). */
  private SpriteCB_FlyBirdLeaveBall(sprite: Sprite): void {
    if (sprite.data[7] !== 0) return;
    if (sprite.data[0] === 0) {
      sprite.affineMode = 2;
      sprite.affineScaleX = 8 / 256;
      sprite.affineScaleY = 8 / 256;
      sprite.affineRotation = -30;
      sprite.x = save.playerGender ? 118 : 128;
      sprite.y = -48;
      sprite.data[0] = 1;
      sprite.data[1] = 64;
      sprite.data[2] = 256;
    }
    sprite.data[1] = (sprite.data[1] ?? 0) + ((sprite.data[2] ?? 0) >> 8);
    sprite.x2 = Math.round(Math.cos((sprite.data[1]! & 0xff) * Math.PI / 128) * 120);
    sprite.y2 = Math.round(Math.sin((sprite.data[1]! & 0xff) * Math.PI / 128) * 120);
    if (sprite.data[2]! < 2048) sprite.data[2] = sprite.data[2]! + 96;
    // The source affine commands start at 8/256, then add 28/256 for 30 frames.
    if (sprite.data[3] === 0) {
      sprite.data[3] = 1;
      sprite.data[4] = 0;
    } else if (sprite.data[4]! < 30) {
      sprite.data[4] = sprite.data[4]! + 1;
      const t = sprite.data[4]! / 30;
      sprite.affineScaleX = (8 + 28 * 30 * t) / 256;
      sprite.affineScaleY = (8 + 28 * 30 * t) / 256;
      sprite.affineRotation = -30;
    } else {
      sprite.affineScaleX = 1;
      sprite.affineScaleY = 1;
      sprite.affineRotation = 0;
    }
    if (sprite.data[1]! > 129) {
      sprite.data[7] = 1;
      sprite.affineMode = 0;
      sprite.affineScaleX = 1;
      sprite.affineScaleY = 1;
    }
  }

  /** SpriteCB_FlyBirdSwoopDown (field_effect.c). */
  private SpriteCB_FlyBirdSwoopDown(sprite: Sprite): void {
    sprite.x2 = Math.round(Math.cos(sprite.data[2]! * Math.PI / 128) * 140);
    sprite.y2 = Math.round(Math.sin(sprite.data[2]! * Math.PI / 128) * 72);
    sprite.data[2] = (sprite.data[2]! + 4) & 0xff;
    this.UpdateFlyBirdPlayerPosition(sprite);
    if (sprite.data[2]! >= 128) sprite.data[7] = 1;
  }

  /** SpriteCB_FlyBirdWithPlayer (field_effect.c). */
  private SpriteCB_FlyBirdWithPlayer(sprite: Sprite): void {
    if (sprite.data[11] === 1 && sprite.affineMode !== 0) {
      const scale = Math.max(1, sprite.affineScaleX - 16 / 256);
      sprite.affineScaleX = scale;
      sprite.affineScaleY = scale;
    } else if (sprite.data[11] === 0 && sprite.affineMode !== 0) {
      sprite.affineScaleX += 24 / 256;
      sprite.affineScaleY += 24 / 256;
    }
    sprite.x2 = Math.round(Math.cos(sprite.data[2]! * Math.PI / 128) * 180);
    sprite.y2 = Math.round(Math.sin(sprite.data[2]! * Math.PI / 128) * 72);
    sprite.data[2] = (sprite.data[2]! + 2) & 0xff;
    this.UpdateFlyBirdPlayerPosition(sprite);
    if (sprite.data[2]! >= 128) {
      sprite.data[7] = 1;
      sprite.affineMode = 0;
      sprite.affineScaleX = 1;
      sprite.affineScaleY = 1;
    }
  }

  /** DoBirdSpriteWithPlayerAffineAnim (field_effect.c). */
  private DoBirdSpriteWithPlayerAffineAnim(sprite: Sprite, affineAnimId: number): void {
    sprite.affineMode = 2;
    sprite.affineScaleX = affineAnimId === 0 ? 1 : 2;
    sprite.affineScaleY = sprite.affineScaleX;
    sprite.data[11] = affineAnimId;
  }

  /** TryChangeBirdSprite (field_effect.c): end the entry scale animation at identity. */
  private TryChangeBirdSprite(sprite: Sprite): void {
    if (sprite.affineMode !== 0 && sprite.affineScaleX === 1) {
      sprite.affineMode = 0;
      sprite.startAnim(0);
      sprite.callback = (s) => this.SpriteCB_FlyBirdSwoopDown(s);
    }
  }

  /** StartFlyBirdReturnToBall (field_effect.c). */
  private StartFlyBirdReturnToBall(sprite: Sprite): void {
    this.StartFlyBirdSwoopDown(sprite);
    sprite.callback = (s) => this.SpriteCB_FlyBirdReturnToBall(s);
  }

  /** SpriteCB_FlyBirdReturnToBall (field_effect.c). */
  private SpriteCB_FlyBirdReturnToBall(sprite: Sprite): void {
    if (sprite.data[7] !== 0) return;
    if (sprite.data[0] === 0) {
      sprite.affineMode = 2;
      sprite.affineScaleX = 1;
      sprite.affineScaleY = 1;
      sprite.data[0] = 1;
      sprite.data[1] = 240;
      sprite.data[2] = 2048;
      sprite.data[3] = 0;
      sprite.data[4] = 128;
      sprite.x = save.playerGender ? 100 : 112;
      sprite.y = -32;
    }
    sprite.data[1] = (sprite.data[1]! + (sprite.data[2]! >> 8)) & 0xff;
    sprite.data[3] = (sprite.data[3]! + (sprite.data[2]! >> 8)) & 0xffff;
    sprite.x2 = Math.round(Math.cos(sprite.data[1]! * Math.PI / 128) * 32);
    sprite.y2 = Math.round(Math.sin(sprite.data[1]! * Math.PI / 128) * 120);
    if (sprite.data[2]! > 256) sprite.data[2] = sprite.data[2]! - sprite.data[4]!;
    if (sprite.data[4]! < 256) sprite.data[4] = sprite.data[4]! + 24;
    if (sprite.data[2]! < 256) sprite.data[2] = 256;
    if (sprite.data[3]! >= 60) {
      sprite.data[7] = 1;
      sprite.affineMode = 0;
      sprite.invisible = true;
    }
  }

  private UpdateFlyBirdPlayerPosition(sprite: Sprite): void {
    const playerSprite = this.flyBirdPlayerSprites.get(sprite);
    if (!playerSprite) return;
    playerSprite.coordOffsetEnabled = false;
    playerSprite.x = sprite.x + sprite.x2;
    playerSprite.y = sprite.y + sprite.y2 - 8;
    playerSprite.x2 = 0;
    playerSprite.y2 = 0;
  }

  /** FldEff_FlyOut (field_effect.c). */
  private FldEff_FlyOut(done: () => void): void {
    const id = tasks.create((taskId) => this.Task_FlyOut(taskId), 0xfe);
    const data = tasks.data(id);
    data[1] = this.args[0]! < 6 ? this.args[0]! : 0;
    this.flyOutCompletions.set(id, done);
    this.active.add(C.FLDEFF_FLY_OUT);
  }

  private Task_FlyOut(taskId: number): void {
    const state = tasks.data(taskId)[0]!;
    switch (state) {
      case 0: this.FlyOutFieldEffect_FieldMovePose(taskId); break;
      case 1: this.FlyOutFieldEffect_ShowMon(taskId); break;
      case 2: this.FlyOutFieldEffect_BirdLeaveBall(taskId); break;
      case 3: this.FlyOutFieldEffect_WaitBirdLeave(taskId); break;
      case 4: this.FlyOutFieldEffect_BirdSwoopDown(taskId); break;
      case 5: this.FlyOutFieldEffect_JumpOnBird(taskId); break;
      case 6: this.FlyOutFieldEffect_FlyOffWithBird(taskId); break;
      case 7: this.FlyOutFieldEffect_WaitFlyOff(taskId); break;
      default: this.FlyOutFieldEffect_End(taskId); break;
    }
  }

  private FlyOutFieldEffect_FieldMovePose(taskId: number): void {
    const player = this.ow.player.object;
    if (!this.ow.objects.isMovementOverridden(player) || this.ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
      const data = tasks.data(taskId);
      data[15] = this.ow.player.flags;
      this.ow.player.preventStep = true;
      this.ow.player.SetPlayerAvatarStateMask(PLAYER_AVATAR_FLAG_ON_FOOT);
      this.ow.player.StartPlayerAvatarSummonMonForFieldMoveAnim();
      this.ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_START_ANIM_IN_DIRECTION);
      data[0] = data[0]! + 1;
    }
  }

  private FlyOutFieldEffect_ShowMon(taskId: number): void {
    const player = this.ow.player.object;
    if (!this.ow.objects.ObjectEventClearHeldMovementIfFinished(player)) return;
    const data = tasks.data(taskId);
    data[0] = data[0]! + 1;
    this.args[0] = data[1]!;
    this.fieldEffectStart(C.FLDEFF_FIELD_MOVE_SHOW_MON_INIT);
  }

  private FlyOutFieldEffect_BirdLeaveBall(taskId: number): void {
    if (this.active.has(C.FLDEFF_FIELD_MOVE_SHOW_MON)) return;
    const data = tasks.data(taskId);
    if (data[15]! & PLAYER_AVATAR_FLAG_SURFING) {
      this.ow.effects.setSurfBlobBobState(C.BOB_MON_ONLY);
      this.ow.effects.setSurfBlobDontSyncAnim(false);
    }
    const bird = this.CreateFlyBirdSprite();
    data[1] = bird ? this.ow.sprites.getId(bird) : 0xff;
    data[0] = data[0]! + 1;
  }

  private FlyOutFieldEffect_WaitBirdLeave(taskId: number): void {
    const data = tasks.data(taskId);
    if (!this.GetFlyBirdAnimCompleted(this.ow.sprites.getById(data[1]!))) return;
    const player = this.ow.player.object;
    data[0] = data[0]! + 1;
    data[2] = 16;
    this.ow.player.setTransitionFlags(PLAYER_AVATAR_FLAG_ON_FOOT);
    this.ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_FACE_LEFT);
  }

  private FlyOutFieldEffect_BirdSwoopDown(taskId: number): void {
    const data = tasks.data(taskId);
    const player = this.ow.player.object;
    if ((data[2] === 0 || --data[2]! === 0) && this.ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
      data[0] = data[0]! + 1;
      sound.playSE(C.SE_M_FLY);
      const bird = this.ow.sprites.getById(data[1]!);
      if (bird) this.StartFlyBirdSwoopDown(bird);
    }
  }

  private FlyOutFieldEffect_JumpOnBird(taskId: number): void {
    const data = tasks.data(taskId);
    if (++data[2]! < 8) return;
    const player = this.ow.player.object;
    data[0] = data[0]! + 1;
    data[2] = 0;
    this.ow.player.setState(PLAYER_AVATAR_GFX_RIDE);
    player.sprite.startAnim(C.ANIM_GET_ON_OFF_POKEMON_WEST);
    player.inanimate = true;
    this.ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_JUMP_IN_PLACE_LEFT);
  }

  private FlyOutFieldEffect_FlyOffWithBird(taskId: number): void {
    const data = tasks.data(taskId);
    if (++data[2]! < 10) return;
    const player = this.ow.player.object;
    const bird = this.ow.sprites.getById(data[1]!);
    data[0] = data[0]! + 1;
    this.ow.objects.clearHeldMovementIfActive(player);
    player.inanimate = false;
    player.hasShadow = false;
    if (!bird) return;
    bird.startAnim(save.playerGender * 2 + 1);
    this.SetFlyBirdPlayerSpriteId(bird, player.sprite);
    this.DoBirdSpriteWithPlayerAffineAnim(bird, 0);
    bird.callback = (sprite) => this.SpriteCB_FlyBirdWithPlayer(sprite);
  }

  private FlyOutFieldEffect_WaitFlyOff(taskId: number): void {
    const data = tasks.data(taskId);
    if (!this.GetFlyBirdAnimCompleted(this.ow.sprites.getById(data[1]!))) return;
    data[0] = data[0]! + 1;
    this.ow.warpFadeOutScreen();
  }

  private FlyOutFieldEffect_End(taskId: number): void {
    if (paletteFade.active) return;
    const data = tasks.data(taskId);
    this.ow.sprites.destroy(this.ow.sprites.getById(data[1]!));
    this.ow.player.SetPlayerInvisibility(false);
    this.ow.player.preventStep = false;
    this.active.delete(C.FLDEFF_FLY_OUT);
    const done = this.flyOutCompletions.get(taskId);
    this.flyOutCompletions.delete(taskId);
    tasks.destroy(taskId);
    done?.();
  }

  /** FldEff_FlyIn (field_effect.c): the bird carries the player down and flies off. */
  private FldEff_FlyIn(done: () => void): void {
    const id = tasks.create((taskId) => this.Task_FlyIn(taskId), 0xfe);
    this.flyInCompletions.set(id, done);
    this.active.add(C.FLDEFF_FLY_IN);
  }

  private Task_FlyIn(taskId: number): void {
    const state = tasks.data(taskId)[0]!;
    switch (state) {
      case 0: this.FlyInFieldEffect_BirdSwoopDown(taskId); break;
      case 1: this.FlyInFieldEffect_FlyInWithBird(taskId); break;
      case 2: this.FlyInFieldEffect_JumpOffBird(taskId); break;
      case 3: this.FlyInFieldEffect_FieldMovePose(taskId); break;
      case 4: this.FlyInFieldEffect_BirdReturnToBall(taskId); break;
      case 5: this.FlyInFieldEffect_WaitBirdReturn(taskId); break;
      default: this.FlyInFieldEffect_End(taskId); break;
    }
  }

  private FlyInFieldEffect_BirdSwoopDown(taskId: number): void {
    const player = this.ow.player.object;
    if (this.ow.objects.isMovementOverridden(player) && !this.ow.objects.ObjectEventClearHeldMovementIfFinished(player)) return;
    const data = tasks.data(taskId);
    data[15] = this.ow.player.flags;
    data[0] = data[0]! + 1;
    data[2] = 33;
    this.ow.player.preventStep = true;
    this.ow.player.SetPlayerAvatarStateMask(PLAYER_AVATAR_FLAG_ON_FOOT);
    if (data[15]! & PLAYER_AVATAR_FLAG_SURFING) this.ow.effects.setSurfBlobBobState(C.BOB_NONE);
    this.ow.player.setState(PLAYER_AVATAR_GFX_RIDE);
    this.ow.objects.turn(player, DIR_WEST);
    player.sprite.startAnim(C.ANIM_GET_ON_OFF_POKEMON_WEST);
    this.ow.player.SetPlayerInvisibility(false);
    const bird = this.CreateFlyBirdSprite();
    data[1] = bird ? this.ow.sprites.getId(bird) : 0xff;
    if (bird) {
      this.StartFlyBirdSwoopDown(bird);
      this.SetFlyBirdPlayerSpriteId(bird, player.sprite);
      bird.startAnim(save.playerGender * 2 + 2);
      this.DoBirdSpriteWithPlayerAffineAnim(bird, 1);
      bird.callback = (sprite) => this.SpriteCB_FlyBirdWithPlayer(sprite);
    }
  }

  private FlyInFieldEffect_FlyInWithBird(taskId: number): void {
    const data = tasks.data(taskId);
    const bird = this.ow.sprites.getById(data[1]!);
    if (bird) this.TryChangeBirdSprite(bird);
    if (data[2] !== 0 && --data[2]! !== 0) return;
    const playerSprite = this.ow.player.object.sprite;
    if (bird) this.SetFlyBirdPlayerSpriteId(bird, undefined);
    playerSprite.x += playerSprite.x2;
    playerSprite.y += playerSprite.y2;
    playerSprite.x2 = 0;
    playerSprite.y2 = 0;
    data[0] = data[0]! + 1;
    data[2] = 0;
  }

  private FlyInFieldEffect_JumpOffBird(taskId: number): void {
    const data = tasks.data(taskId);
    const yOffsets = [-2, -4, -5, -6, -7, -8, -8, -8, -7, -7, -6, -5, -3, -2, 0, 2, 4, 8];
    this.ow.player.object.sprite.y2 = yOffsets[data[2]!]!;
    if (++data[2]! >= yOffsets.length) data[0] = data[0]! + 1;
  }

  private FlyInFieldEffect_FieldMovePose(taskId: number): void {
    const data = tasks.data(taskId);
    if (!this.GetFlyBirdAnimCompleted(this.ow.sprites.getById(data[1]!))) return;
    const player = this.ow.player.object;
    player.inanimate = false;
    this.ow.player.MovePlayerToMapCoords(player.currentCoords.x, player.currentCoords.y);
    player.sprite.x2 = 0;
    player.sprite.y2 = 0;
    player.sprite.coordOffsetEnabled = true;
    this.ow.player.StartPlayerAvatarSummonMonForFieldMoveAnim();
    this.ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_START_ANIM_IN_DIRECTION);
    data[0] = data[0]! + 1;
  }

  private FlyInFieldEffect_BirdReturnToBall(taskId: number): void {
    if (!this.ow.objects.ObjectEventClearHeldMovementIfFinished(this.ow.player.object)) return;
    const data = tasks.data(taskId);
    const bird = this.ow.sprites.getById(data[1]!);
    data[0] = data[0]! + 1;
    if (bird) this.StartFlyBirdReturnToBall(bird);
  }

  private FlyInFieldEffect_WaitBirdReturn(taskId: number): void {
    const data = tasks.data(taskId);
    const bird = this.ow.sprites.getById(data[1]!);
    if (!this.GetFlyBirdAnimCompleted(bird)) return;
    this.ow.sprites.destroy(bird);
    data[0] = data[0]! + 1;
    data[1] = 16;
  }

  private FlyInFieldEffect_End(taskId: number): void {
    const data = tasks.data(taskId);
    if (--data[1]! !== 0) return;
    const surfing = (data[15]! & PLAYER_AVATAR_FLAG_SURFING) !== 0;
    const player = this.ow.player.object;
    this.ow.player.setState(surfing ? PLAYER_AVATAR_GFX_RIDE : PLAYER_AVATAR_GFX_NORMAL);
    if (surfing) this.ow.effects.setSurfBlobBobState(C.BOB_PLAYER_AND_MON);
    this.ow.objects.turn(player, DIR_SOUTH);
    this.ow.player.flags = data[15]!;
    this.ow.player.preventStep = false;
    this.active.delete(C.FLDEFF_FLY_IN);
    const done = this.flyInCompletions.get(taskId);
    this.flyInCompletions.delete(taskId);
    tasks.destroy(taskId);
    done?.();
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
  return (MapGridGetMetatileAttributeAt(x, y, METATILE_ATTRIBUTE_TERRAIN, ow.map) & C.TILE_TERRAIN_GRASS) !== 0;
}

/**
 * SetUpFieldMove_Cut. Returns the post-menu field callback selected by the C
 * checks: dotted-hole door, cuttable tree, or same-elevation grass in front.
 */
export function SetUpFieldMove_Cut(game: Game): "ruin" | "tree" | "grass" | undefined {
  const ow = game.overworld, p = ow.player.object;
  if (CutMoveRuinValleyCheck(ow)) return "ruin";
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
      if (MapGridGetElevationAt(x, y, ow.map) === p.currentElevation && MetatileAtCoordsIsGrassTile(ow, x, y)) return "grass";
    }
  }
  return undefined;
}

/** CutMoveRuinValleyCheck from field_specials.c. */
export function CutMoveRuinValleyCheck(ow: Overworld): boolean {
  const p = ow.player.object;
  return !flagGet(C.FLAG_USED_CUT_ON_RUIN_VALLEY_BRAILLE)
    && ow.mapId === "MAP_SIX_ISLAND_RUIN_VALLEY"
    && p.currentCoords.x - MAP_OFFSET === 24
    && p.currentCoords.y - MAP_OFFSET === 25
    && p.facingDirection === DIR_NORTH;
}

// Referenced for completeness of the palette helpers.
void rgb555; void canvas; void DIR_EAST; void DIR_WEST;
