// Native viewer presentation of the existing Game/Overworld runtime. NPC bytecode,
// menus and transactions run unchanged. Only UI windows and interaction sprites
// are projected onto the current viewer map; no second field view is displayed.
import { Game, FRAME_MS } from '@game/game';
import { joy } from '@core/gba/input';
import { loadFieldFx } from '@core/field/fieldEffects';
import { preloadFieldAssets } from '@core/field/preloadField';
import { loadCData, preloadPacks } from '@core/hw/assets';
import { rom } from '@core/rom';
import { loadTrig } from '@core/hw/trig';
import { gWindows } from '@core/hw/window';
import { GetBgTilemapBuffer } from '@core/hw/bg';
import { incrementGameStat, save, SV, varSet } from '@game/save';
import * as MB from '@game/generated/metatileBehavior';
import * as C from '@game/generated/constants';
import type { Sprite } from '@core/gba/sprite';
import { tasks } from '@core/gba/tasks';
import { gBattlerControllerFuncs } from '@core/battle/globals';
import { installBattleHost } from '@core/battle/host';
import { preloadBattleAssets } from '@game/battle/preload';
import { preloadEggHatch } from '@game/eggHatch';
import { sound } from '@core/audio/sound';
import { MAP_OFFSET } from '@core/field/fieldmap';
import { PLAYER_AVATAR_FLAG_ACRO_BIKE, PLAYER_AVATAR_FLAG_MACH_BIKE, PLAYER_AVATAR_FLAG_ON_FOOT, PLAYER_AVATAR_FLAG_SURFING } from '@core/field/playerAvatar';
import { syncViewerLocation, type NavigationSave } from './session';

type Hooks = {
  pause(active: boolean): void;
  project(canvas: HTMLCanvasElement, game: Game): void;
  hideObjects(hidden: boolean, localId: number): void;
  /** Engine moved the player (white-out respawn): continue the viewer from here. */
  relocate(nav: NavigationSave): void;
  /** An object event the script removed (cut tree, smashed rock): drop it from the viewer map. */
  removeObject(mapId: string, localId: number): void;
  /** The bag's Bicycle (or its dismount) changed the avatar state. */
  setBike(on: boolean): void;
};
export class EngineInteraction {
  readonly root = document.createElement('section');
  private readonly ui = document.createElement('canvas');
  private readonly field = document.createElement('canvas');
  // Hardware menus retain their original renderer offscreen. Only their window
  // rectangles are presented, never their miniature copy of the field/map.
  private readonly engineCanvas = document.createElement('canvas');
  private game?: Game;
  private loading?: Promise<void>;
  private frame = 0;
  private last = 0;
  private accumulator = 0;
  private initialSprites = new Set<Sprite>();
  private localId = 0;
  // Start-menu scenes (Pokédex, party, bag, summary...) own the whole GBA screen,
  // so their full frame is shown. Field interactions keep the window-only mode.
  private fullScreen = false;
  // Map the engine overworld was last prepared for by the wild-encounter test.
  private wildMap = '';
  private testingWild = false;
  get open(): boolean { return !this.root.hidden; }
  /** True while a step is being tested for an encounter or a battle is running. */
  get busy(): boolean { return this.open || this.testingWild; }
  constructor(private readonly hooks: Hooks) {
    this.root.id = 'engine-interaction'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Diálogo y compras');
    this.field.id = 'interaction-sprites'; this.field.setAttribute('aria-hidden','true');
    this.ui.width = this.engineCanvas.width = this.field.width = 240;
    this.ui.height = this.engineCanvas.height = this.field.height = 160;
    this.ui.setAttribute('aria-label', 'Z: aceptar; X: volver; flechas: elegir');
    this.ui.tabIndex = 0;
    const help = document.createElement('p');
    help.textContent = 'Z · aceptar     X · volver     ↑ ↓ · elegir';
    this.root.append(this.ui, help); document.body.append(this.root);
  }
  private async initialize(): Promise<void> {
    await loadFieldFx();
    await Promise.all([preloadFieldAssets(), loadTrig(), loadCData('text_printer', 'text', 'wild_encounter', 'berry'),
      preloadPacks(['graphics_fonts', 'graphics_help_system', 'graphics_quest_log'])]);
    // Wild encounters and trainer battles run the source battle scene.
    await Promise.all([preloadBattleAssets(), sound.loadCryData(), preloadEggHatch()]);
    this.game = new Game(this.engineCanvas);
    installBattleHost(this.game);
    joy.attach(); joy.setExternalInputEnabled(false);
  }
  /** The engine may have moved the player (white-out): hand its position back to the viewer. */
  private finish(nav: NavigationSave): void {
    this.close();
    this.wildMap = '';
    if (!this.game) return;
    if (this.menuVehicle && this.menuVehicle !== 'surf') {
      const bike = (this.game.overworld.player.flags & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE)) !== 0;
      if (bike !== (this.menuVehicle === 'bike')) this.hooks.setBike(bike);
    }
    this.menuVehicle = null;
    // removeobject (scrcmd.c) on the interacted object: cut trees, smashed rocks.
    if (this.localId && !this.game.overworld.objects.list.some(o => o.localId === this.localId)) this.hooks.removeObject(nav.mapId, this.localId);
    // DoWhiteOut/warps update save.location before the engine's own map load
    // completes, so the destination is read from the record, not the loaded map.
    const { mapGroup, mapNum, x, y } = save.location;
    const mapId = rom.mapIdByNum(((mapGroup & 0xff) << 8) | (mapNum & 0xff));
    if (mapId && (mapId !== nav.mapId || x !== nav.x || y !== nav.y)) {
      const direction = ({ [C.DIR_SOUTH]: 'south', [C.DIR_NORTH]: 'north', [C.DIR_WEST]: 'west', [C.DIR_EAST]: 'east' } as const)[save.facing] ?? nav.direction;
      this.hooks.relocate({ mapId, x, y, direction, dynamic: null });
    }
  }
  private close(): void {
    cancelAnimationFrame(this.frame); this.root.hidden = true; this.field.remove();
    joy.initKeys(); joy.setExternalInputEnabled(false);
    this.hooks.hideObjects(false, this.localId); this.hooks.pause(false);
    document.getElementById('viewport')?.focus({preventScroll:true});
  }
  private present(): void {
    const game = this.game!, ow = game.overworld;
    const ui = this.ui.getContext('2d')!;
    ui.clearRect(0,0,240,160);
    if (game.scene && this.fullScreen) {
      game.render();
      ui.drawImage(this.engineCanvas,0,0);
      this.field.getContext('2d')!.clearRect(0,0,240,160);
      return;
    }
    if (game.scene) {
      // Run VBlank/HBlank and source PPU rendering, then extract only visible UI
      // windows. BG field tiles are never copied into the viewer presentation.
      game.render();
      for (const entry of gWindows) {
        const t=entry.window;
        if (!entry.tileData || t.bg === 255 || !t.width || !t.height) continue;
        const tilemap=GetBgTilemapBuffer(t.bg);
        if (!tilemap || (tilemap[t.tilemapTop*32+t.tilemapLeft]&1023)!==t.baseBlock) continue;
        const x=t.tilemapLeft*8,y=t.tilemapTop*8,w=t.width*8,h=t.height*8;
        ui.fillStyle='#e5edf0';ui.fillRect(x-1,y-1,w+2,h+2);
        ui.drawImage(this.engineCanvas,x,y,w,h,x,y,w,h);
      }
    } else ow.windows.render(ui);
    const ctx = this.field.getContext('2d')!;ctx.clearRect(0,0,240,160);
    // Step events (repel, poison) leave the viewer's own avatar in place.
    const objects = this.localId ? [ow.player.object, ow.objects.list.find(o=>o.localId===this.localId)] : [];
    for (const object of objects) if(object?.sprite && !object.sprite.invisible) ow.sprites.drawSprite(ctx,object.sprite);
    // Healing balls/glow and other actual field-effect sprites stay at their
    // original map coordinates. General NPC rendering remains a later integration.
    for(const sprite of ow.sprites.sprites) if(!this.initialSprites.has(sprite)&&!sprite.invisible&&!sprite.destroyed) ow.sprites.drawSprite(ctx,sprite);
    this.hooks.project(this.field,game);
  }
  async show(nav: NavigationSave, localId: number): Promise<void> {
    await this.run(nav, localId, false, (game) => {
      const ow = game.overworld;
      const object = ow.objects.list.find(o=>o.localId===localId);
      const template = ow.header.objects.find(o=>!o.clone&&o.localId===localId);
      if(!object||!template||template.clone||!template.script)throw Error('NPC sin script fuente');
      this.hooks.hideObjects(true,localId);
      ow.selectedObject=ow.objects.indexOf(object);
      varSet(SV.LAST_TALKED,localId);varSet(SV.FACING,save.facing);
      ow.script.ScriptContext_SetupScript(template.script);
    });
  }
  /** ShowStartMenu (start_menu.c) over the current viewer map. */
  async showStartMenu(nav: NavigationSave, vehicle: 'walk' | 'bike' | 'surf' = 'walk'): Promise<void> {
    const bikeFlags = PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE;
    await this.run(nav, 0, true, (game) => {
      // The engine decides item rules (Bicycle on/off) from the avatar flags.
      const player = game.overworld.player;
      const base = player.flags & ~(bikeFlags | PLAYER_AVATAR_FLAG_SURFING | PLAYER_AVATAR_FLAG_ON_FOOT);
      player.flags = base | (vehicle === 'bike' ? PLAYER_AVATAR_FLAG_MACH_BIKE : vehicle === 'surf' ? PLAYER_AVATAR_FLAG_SURFING : PLAYER_AVATAR_FLAG_ON_FOOT);
      this.menuVehicle = vehicle;
      game.showStartMenu();
    });
  }
  private menuVehicle: 'walk' | 'bike' | 'surf' | null = null;
  private async run(nav: NavigationSave, localId: number, fullScreen: boolean, start: (game: Game) => void, prepared = false): Promise<void> {
    if (this.open) return;
    this.localId=localId; this.fullScreen=fullScreen; this.hooks.pause(true); this.root.hidden=false;
    this.root.dataset.loading='true';
    try {
      await (this.loading ??= this.initialize());
      const game = this.game!, ow = game.overworld;
      if (!prepared) {
        syncViewerLocation(nav);
        await ow.prepareViewerInteraction(nav.mapId);
      }
      this.initialSprites=new Set(ow.sprites.sprites);
      start(game);
      joy.initKeys();joy.setExternalInputEnabled(true);
      this.root.dataset.loading='false';this.ui.focus({preventScroll:true});
      this.last=performance.now();this.accumulator=0;
      let idle=0, warpFrames=0;
      const startNum=save.location.mapNum, startGroup=save.location.mapGroup;
      const loop=(now:number)=>{
        if(!this.open)return;
        this.accumulator+=Math.min(100,now-this.last);this.last=now;
        while(this.accumulator>=FRAME_MS){game.frame();this.accumulator-=FRAME_MS;}
        this.present();
        this.root.dataset.scriptActive=String(ow.script.isActive()||(fullScreen&&ow.controlsLocked));
        this.root.dataset.script=ow.script.global.entry;
        this.root.dataset.native=ow.script.global.nativePtr?.name??'';
        this.root.dataset.mode=String(ow.script.global.mode);
        this.root.dataset.money=String(save.money);
        this.root.dataset.battle=game.scene?gBattlerControllerFuncs[0]?.name??'':'';
        const finished=fullScreen?!ow.controlsLocked&&!ow.script.isActive():!ow.script.isActive();
        // Field moves and warps run as tasks after the menu has unlocked the field:
        // wait until the task list stays empty (or, with a leaked task, a long while).
        idle=finished&&!game.scene?idle+1:0;
        // The engine decided on a warp (teleport, fly, escape rope, white-out): its own map
        // load is not run here, so after the fade-out the viewer follows save.location.
        const at=save.location;
        const warped=fullScreen&&!game.scene&&(at.mapGroup!==startGroup||at.mapNum!==startNum||at.x!==nav.x||at.y!==nav.y);
        warpFrames=warped?warpFrames+1:0;
        if(warpFrames>=90){this.finish(nav);return;}
        const busyTasks=fullScreen&&tasks.tasks.some(t=>t.isActive);
        if(finished&&!game.scene&&(!fullScreen||(!busyTasks&&idle>=20)||idle>=600)){this.finish(nav);return;}
        this.frame=requestAnimationFrame(loop);
      };
      this.frame=requestAnimationFrame(loop);
    }catch(error){this.loading=undefined;this.close();throw error;}
  }
  /** Load the engine ahead of the first step so it never stalls a walk. */
  warm(): Promise<void> {
    return (this.loading ??= this.initialize().catch(error => { this.loading = undefined; throw error; }));
  }
  /**
   * Arrival in a Pokémon Center: its OnTransition map script (`setrespawn`,
   * overworld.c RunOnTransitionMapScript) registers the white-out respawn point.
   * Other maps' transition scripts belong to the story VM and are not run here.
   */
  async enterMap(nav: NavigationSave): Promise<void> {
    if (!/_POKEMON_CENTER_1F$/.test(nav.mapId) || this.busy) return;
    this.testingWild = true;
    try {
      await (this.loading ??= this.initialize());
      const ow = this.game!.overworld;
      syncViewerLocation(nav);
      await ow.prepareViewerInteraction(nav.mapId);
      this.wildMap = nav.mapId;
      ow.RunOnTransitionMapScript();
    } finally { this.testingWild = false; }
  }
  /**
   * Leaving an outdoor map for a cave or building stores the escape warp
   * (overworld.c: outdoors -> not outdoors), which Escape Rope, Dig and Teleport
   * out of caves use. The viewer does not run the engine's own warp, so it asks
   * for the same bookkeeping with the last outdoor tile and the destination map.
   */
  async recordEscapeWarp(from: NavigationSave, toMapId: string): Promise<void> {
    if (this.busy) return;
    this.testingWild = true;
    try {
      await (this.loading ??= this.initialize());
      const ow = this.game!.overworld;
      syncViewerLocation(from);
      if (this.wildMap !== from.mapId) { await ow.prepareViewerInteraction(from.mapId); this.wildMap = from.mapId; }
      const target = rom.mapNum(toMapId);
      ow.warpDestination = { mapGroup: target >>> 8, mapNum: target & 255, warpId: -1, x: -1, y: -1 };
      ow.objects.turn(ow.player.object, save.facing);
      ow.updateEscapeWarp(from.x + MAP_OFFSET, from.y + MAP_OFFSET);
    } finally { this.testingWild = false; }
  }
  /**
   * GetInteractionScript (field_control_avatar.c) for the tile in front of the
   * viewer player: background events (signs), metatile scripts (PC, shelves, TV)
   * and field-move water scripts. Object events are handled by the viewer.
   */
  async interactFront(nav: NavigationSave, surfing: boolean): Promise<boolean> {
    if (this.busy) return false;
    this.testingWild = true;
    let started = false;
    try {
      await (this.loading ??= this.initialize());
      const game = this.game!, ow = game.overworld;
      syncViewerLocation(nav);
      if (this.wildMap !== nav.mapId) { await ow.prepareViewerInteraction(nav.mapId); this.wildMap = nav.mapId; }
      const player = ow.player.object;
      ow.objects.MoveObjectEventToMapCoords(player, nav.x + MAP_OFFSET, nav.y + MAP_OFFSET);
      ow.objects.turn(player, save.facing);
      ow.SetCameraToTrackPlayer();
      ow.player.flags = surfing ? ow.player.flags | PLAYER_AVATAR_FLAG_SURFING : ow.player.flags & ~PLAYER_AVATAR_FLAG_SURFING;
      const front = ow.control.getInFrontOfPlayerPosition();
      const behavior = ow.map.behaviorAt(front.x, front.y);
      // Object events at the tile are the viewer's own entities; only the other lookups run.
      const direction = player.facingDirection;
      const script = ow.control.getInteractedBackgroundEventScript({ ...front }, behavior, direction)
        || ow.control.getInteractedMetatileScript({ ...front }, behavior, direction)
        || ow.control.getInteractedWaterScript({ ...front }, behavior, direction);
      if (!script) return false;
      started = true;
      ow.script.ScriptContext_SetupScript(script);
      await this.run(nav, 0, true, () => {}, true);
      return true;
    } finally {
      this.testingWild = false;
      if (!started) this.root.dataset.loading = 'false';
    }
  }
  /**
   * CheckStandardWildEncounter (field_control_avatar.c) for the tile the viewer
   * player just reached. The engine decides (rate, repel, tables, level) and
   * runs the real transition and battle scene; the viewer is paused until the
   * battle returns.
   */
  async tryWildEncounter(nav: NavigationSave, surfing: boolean): Promise<boolean> {
    if (this.busy) return false;
    this.testingWild = true;

    let started = false;
    try {
      await (this.loading ??= this.initialize());
      const game = this.game!, ow = game.overworld;
      syncViewerLocation(nav);
      if (this.wildMap !== nav.mapId) { await ow.prepareViewerInteraction(nav.mapId); this.wildMap = nav.mapId; }
      // Place the engine avatar (and camera) exactly where the viewer player stands.
      const player = ow.player.object;
      ow.objects.MoveObjectEventToMapCoords(player, nav.x + MAP_OFFSET, nav.y + MAP_OFFSET);
      ow.objects.turn(player, save.facing);
      ow.SetCameraToTrackPlayer();
      ow.player.flags = surfing ? ow.player.flags | PLAYER_AVATAR_FLAG_SURFING : ow.player.flags & ~PLAYER_AVATAR_FLAG_SURFING;
      // checkForTrainersWantingBattle (trainer_see.c) runs first in ProcessPlayerFieldInput:
      // the source approach, exclamation, walk and battle script for a trainer in sight.
      if (ow.effects.checkForTrainersWantingBattle()) {
        const trainerId = (game.trainerSee as unknown as { approaching?: { trainer: { localId: number } } }).approaching?.trainer.localId ?? 0;
        started = true;
        await this.run(nav, trainerId, true, () => { if (trainerId) this.hooks.hideObjects(true, trainerId); }, true);
        return true;
      }
      // ProcessPlayerFieldInput tookStep (field_control_avatar.c): step stat, then the
      // step-count scripts (happiness, poison, egg hatch, Safari) and repel; those
      // that set up a script run it before the encounter check, as in the C.
      const behavior = ow.map.behaviorAt(nav.x + MAP_OFFSET, nav.y + MAP_OFFSET);
      incrementGameStat(C.GAME_STAT_STEPS);
      const forced = MB.MetatileBehavior_IsForcedMovementTile(behavior);
      if (ow.control.tryStartStepCountScript(behavior) || (!forced && ow.effects.updateRepelCounter())) {
        started = true;
        await this.run(nav, 0, true, () => {}, true);
        return true;
      }
      const attributes = ow.map.attributesOf(ow.map.metatileIdAt(nav.x + MAP_OFFSET, nav.y + MAP_OFFSET));
      const wildHit = game.wild.tryStandardWildEncounter(attributes);
      if (!wildHit) return false;
      started = true;
      await this.run(nav, 0, true, () => {}, true);
      return true;
    } finally {
      this.testingWild = false;
      if (!started) this.root.dataset.loading = 'false';
    }
  }
}
