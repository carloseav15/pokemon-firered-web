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
import { incrementGameStat, save, SV, varGet, varSet } from '@game/save';
import * as MB from '@game/generated/metatileBehavior';
import * as C from '@game/generated/constants';
import type { Sprite } from '@core/gba/sprite';
import { paletteFade } from '@core/gba/fade';
import { tasks } from '@core/gba/tasks';
import { gMain } from '@core/hw/runtime';
import { gBattlerControllerFuncs } from '@core/battle/globals';
import { installBattleHost } from '@core/battle/host';
import { preloadBattleAssets } from '@game/battle/preload';
import { preloadEggHatch } from '@game/eggHatch';
import { GetSafariZoneFlag } from '@core/field/safariZone';
import { sound } from '@core/audio/sound';
import { MAP_OFFSET } from '@core/field/fieldmap';
import { PLAYER_AVATAR_FLAG_ACRO_BIKE, PLAYER_AVATAR_FLAG_MACH_BIKE, PLAYER_AVATAR_FLAG_ON_FOOT, PLAYER_AVATAR_FLAG_SURFING } from '@core/field/playerAvatar';
import { objectStateKey, readViewerObjectState, readViewerTemplateState, objectDirection, storeViewerObjects, translateViewerObjectCoords, type ViewerMapOrigin, type ViewerObjectState } from './objectState';
import { syncViewerLocation, type NavigationSave } from './session';
import { IncrementRenewableHiddenItemStepCounter } from '@game/renewableHiddenItems';
import { WonderNews_IncrementStepCounter } from '@game/wonderNews';
import { IncrementBirthIslandRockStepCount, IncrementResortGorgeousStepCounter, RunMassageCooldownStepCounter } from '@core/field/fieldStepCounters';

type Hooks = {
  pause(active: boolean): void;
  project(canvas: HTMLCanvasElement, game: Game): void;
  hideObjects(hidden: boolean, mapId: string, localId: number): void;
  /** Engine moved the player (white-out respawn): continue the viewer from here. */
  relocate(nav: NavigationSave): Promise<void> | void;
  readObjects(mapId: string): ViewerObjectState[];
  mapOrigin(mapId: string): ViewerMapOrigin | undefined;
  syncObjects(states: ViewerObjectState[]): void;
  /** The bag's Bicycle (or its dismount) changed the avatar state. */
  setBike(on: boolean): void;
  setVehicle?: (vehicle: 'walk' | 'bike' | 'surf') => void;
  onSetMetatile?: (mapId: string, x: number, y: number, metatile: number) => void;
  onBattleStart?: () => Promise<void> | void;
};
export class EngineInteraction {
  private interactionMapId = '';
  private observedObjects = new Map<string, ViewerObjectState>();
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
  private objectMapId = '';
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
    this.game.overworld.map.onChange = (x, y) => {
      if (!this.game) return;
      const id = this.game.overworld.map.metatileIdAt(x, y);
      const header = this.game.overworld.header;
      this.hooks.onSetMetatile?.(header.id, x - MAP_OFFSET, y - MAP_OFFSET, id);
    };
    this.game.overworld.objects.onScriptObjectRemoved = object => {
      if (!this.open || object.isPlayer) return;
      const state = this.objectState(object,true);
      if(!state)return;
      this.observedObjects.set(objectStateKey(state),state);
      if (this.interactionMapId) storeViewerObjects(this.interactionMapId, [...this.observedObjects.values()]);
    };
    installBattleHost(this.game);
    joy.attach(); joy.setExternalInputEnabled(false);
  }
  private objectState(object: Parameters<typeof readViewerObjectState>[0], removed=false): ViewerObjectState | undefined {
    const mapId=rom.mapIdByNum((object.mapGroup<<8)|object.mapNum);
    if(!mapId)return;
    const loadedId=this.game?.overworld.header.id;
    const loaded=loadedId?this.hooks.mapOrigin(loadedId):undefined,owner=this.hooks.mapOrigin(mapId);
    if(!loaded||!owner)return;
    return readViewerObjectState(object,mapId,removed,translateViewerObjectCoords({x:0,y:0},loaded,owner));
  }
  private observeObjects(): void {
    if (!this.game || !this.interactionMapId) return;
    const ow = this.game.overworld;
    const activeKeys = new Set<string>();
    for (const object of ow.objects.list) {
      if (object.isPlayer) continue;
      const state=this.objectState(object);
      if(!state)continue;
      const key = objectStateKey(state);
      activeKeys.add(key);
      this.observedObjects.set(key,state);
    }
    const loadedId = ow.header.id;
    const baseTemplates = new Map<number, (typeof ow.objects.templates)[number]>();
    for (const o of ow.header.objects) if (!o.clone) baseTemplates.set(o.localId, o);
    for (const t of ow.objects.templates) {
      const key = `${loadedId}:${t.localId}`;
      if (activeKeys.has(key)) continue;
      const base = baseTemplates.get(t.localId);
      const resolvedGfx = ow.objects.resolveGraphicsId(t.graphicsId);
      const baseGfx = base ? ow.objects.resolveGraphicsId(base.graphicsId) : resolvedGfx;
      const prev = this.observedObjects.get(key);
      if (prev || !base || t.x !== base.x || t.y !== base.y || t.movementType !== base.movementType || t.elevation !== base.elevation || resolvedGfx !== baseGfx) {
        this.observedObjects.set(key, readViewerTemplateState(t, loadedId, prev?.removed ?? false, {x:0,y:0}, resolvedGfx));
      }
    }
    storeViewerObjects(this.interactionMapId, [...this.observedObjects.values()]);
  }
  private async prepareObjects(nav: NavigationSave): Promise<void> {
    const ow=this.game!.overworld;
    const states=this.hooks.readObjects(nav.mapId);
    await ow.prepareViewerInteraction(nav.mapId,states.filter(s=>!s.removed).map(s=>({mapId:s.mapId,localId:s.localId})));
    const loaded=this.hooks.mapOrigin(nav.mapId);
    const left=save.pos.x+MAP_OFFSET-2,right=save.pos.x+MAP_OFFSET+17,top=save.pos.y+MAP_OFFSET,bottom=save.pos.y+MAP_OFFSET+16;
    let spawned=false;
    for (const state of states) {
      const num=rom.mapNum(state.mapId),owner=this.hooks.mapOrigin(state.mapId);
      if(!loaded||!owner)continue;
      const coords=translateViewerObjectCoords(state,owner,loaded);
      const tx=coords.x+MAP_OFFSET,ty=coords.y+MAP_OFFSET;
      let object=ow.objects.byLocalIdAndMap(state.localId,num&255,num>>>8);
      if (!object && !state.removed && tx>=left && tx<=right && ty>=top && ty<=bottom) {
        const slot=ow.objects.TrySpawnObjectEvent(state.localId,num&255,num>>>8);
        if (slot < 16) { object = ow.objects.objects[slot] ?? undefined; spawned = true; }
      }
      if (!object) continue; // Source spawning/view limits remain authoritative.
      if (state.removed) { ow.objects.remove(object); continue; }
      ow.objects.MoveObjectEventToMapCoords(object,tx,ty);
      if (state.movementType !== undefined && state.movementType !== object.movementType) {
        ow.objects.setTrainerMovementType(object, state.movementType);
      }
      ow.objects.turn(object,objectDirection(state.direction));
      if (state.graphicsId !== undefined && state.graphicsId !== object.graphicsId) {
        ow.objects.ObjectEventSetGraphicsId(object, state.graphicsId);
      }
      if (state.elevation !== undefined) {
        object.currentElevation = object.previousElevation = state.elevation & 0xff;
      }
      object.invisible=state.invisible;
    }
    if (spawned) ow.syncObjectSprites();
  }
  /** The engine may have moved the player (white-out): hand its position back to the viewer. */
  private finish(nav: NavigationSave): void {
    this.observeObjects();
    this.hooks.syncObjects([...this.observedObjects.values()]);
    this.close();
    this.wildMap = '';
    if (!this.game) return;
    const player = this.game.overworld.player;
    const isSurfing = (player.flags & PLAYER_AVATAR_FLAG_SURFING) !== 0;
    const isBiking = (player.flags & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE)) !== 0;
    const currentVehicle: 'walk' | 'bike' | 'surf' = isSurfing ? 'surf' : isBiking ? 'bike' : 'walk';
    if (this.hooks.setVehicle) {
      this.hooks.setVehicle(currentVehicle);
    } else if (this.menuVehicle && this.menuVehicle !== 'surf') {
      if (isBiking !== (this.menuVehicle === 'bike')) this.hooks.setBike(isBiking);
    }
    this.menuVehicle = null;

    const playerObj = player.object;
    const currentX = playerObj.currentCoords.x - MAP_OFFSET;
    const currentY = playerObj.currentCoords.y - MAP_OFFSET;

    // DoWhiteOut/warps update save.location before the engine's own map load
    // completes, so the destination is read from the record, not the loaded map.
    const { mapGroup, mapNum, x, y } = save.location;
    const mapId = rom.mapIdByNum(((mapGroup & 0xff) << 8) | (mapNum & 0xff));
    const finalFacing = playerObj ? playerObj.facingDirection : save.facing;
    save.facing = finalFacing;
    const direction = ({ [C.DIR_SOUTH]: 'south', [C.DIR_NORTH]: 'north', [C.DIR_WEST]: 'west', [C.DIR_EAST]: 'east' } as const)[finalFacing] ?? nav.direction;

    const finalX = (mapId && mapId === nav.mapId) ? currentX : x;
    const finalY = (mapId && mapId === nav.mapId) ? currentY : y;
    save.location.x = finalX;
    save.location.y = finalY;
    save.pos.x = finalX;
    save.pos.y = finalY;

    if (mapId && (mapId !== nav.mapId || finalX !== nav.x || finalY !== nav.y || direction !== nav.direction)) {
      void this.hooks.relocate({ mapId, x: finalX, y: finalY, direction, dynamic: null });
    }
  }
  private close(): void {
    cancelAnimationFrame(this.frame); this.root.hidden = true; this.field.remove();
    joy.initKeys(); joy.setExternalInputEnabled(false);
    paletteFade.clear();
    this.hooks.hideObjects(false, this.objectMapId || this.interactionMapId, this.localId); this.hooks.pause(false);
    delete this.root.dataset.scene;
    delete this.root.dataset.whiteout;
    document.getElementById('viewport')?.focus({preventScroll:true});
  }
  getSafariStats(): { active: boolean; balls: number; steps: number } {
    const active = GetSafariZoneFlag();
    const game = this.game;
    return {
      active,
      balls: game?.safariBalls ?? (active ? 30 : 0),
      steps: game?.safariSteps ?? (active ? 600 : 0),
    };
  }
  private isFullScreenScene(): boolean {
    const game = this.game;
    if (!game?.scene) return false;
    if (this.fullScreen || gMain.inBattle) return true;
    if (game.scene.constructor.name === 'BattleTransitionScene') return true;
    const cbName = gMain.callback2?.name ?? '';
    return Boolean(
      cbName.includes('EvolutionScene') ||
      cbName.includes('TradeEvolutionScene') ||
      cbName.includes('SlotMachine') ||
      cbName.includes('InGameTrade') ||
      cbName.includes('EggHatch') ||
      cbName.includes('Hof') ||
      cbName.includes('HallOfFame') ||
      cbName.includes('NamingScreen') ||
      cbName.includes('Credits') ||
      cbName.includes('Battle') ||
      cbName.includes('Summary') ||
      cbName.includes('TrainerCard') ||
      cbName.includes('Bag') ||
      cbName.includes('BerryPouch') ||
      cbName.includes('TMCase') ||
      cbName.includes('TeachyTv') ||
      cbName.includes('SeaGallop') ||
      cbName.includes('MoveRelearner') ||
      cbName.includes('Pokedex')
    );
  }
  private present(): void {
    const game = this.game!, ow = game.overworld;
    const ui = this.ui.getContext('2d')!;
    ui.clearRect(0,0,240,160);
    const whiteOut = Boolean(game.whitingOut || ow.whitingOut || (!game.scene && paletteFade.level > 0));
    const fullScene = this.isFullScreenScene();
    if (this.root.dataset.scene !== String(fullScene)) this.root.dataset.scene = String(fullScene);
    if (this.root.dataset.whiteout !== String(whiteOut)) this.root.dataset.whiteout = String(whiteOut);
    if (fullScene) {
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
    } else {
      ow.windows.render(ui);
      paletteFade.render(ui);
      ow.whiteOutWindow?.render(ui);
    }
    const ctx = this.field.getContext('2d')!;ctx.clearRect(0,0,240,160);
    const targetNum = this.localId && this.objectMapId ? rom.mapNum(this.objectMapId) : 0;
    const target = this.localId ? ow.objects.byLocalIdAndMap(this.localId, targetNum & 255, targetNum >>> 8) : null;
    const inFieldAnim = Boolean(this.localId || ow.player.preventStep || ow.player.isSurfing() || ow.controlsLocked);
    if (inFieldAnim) this.hooks.hideObjects(true, this.objectMapId || this.interactionMapId, this.localId);
    const drawPlayer = inFieldAnim;
    const objects = [...(drawPlayer ? [ow.player.object] : []), ...(target ? [target] : [])];
    for (const object of objects) if(object?.sprite && !object.sprite.invisible) ow.sprites.drawSprite(ctx,object.sprite);
    // Healing balls/glow and other actual field-effect sprites stay at their
    // original map coordinates. General NPC rendering remains a later integration.
    for(const sprite of ow.sprites.sprites) if(!this.initialSprites.has(sprite)&&!sprite.invisible&&!sprite.destroyed) ow.sprites.drawSprite(ctx,sprite);
    this.hooks.project(this.field,game);
  }
  async show(nav: NavigationSave, target: number | { mapId?: string; localId: number }): Promise<void> {
    const localId = typeof target === 'number' ? target : target.localId;
    const objectMapId = (typeof target === 'number' ? undefined : target.mapId) ?? nav.mapId;
    await this.run(nav, localId, false, (game) => {
      const ow = game.overworld, num = rom.mapNum(objectMapId);
      const object = ow.objects.byLocalIdAndMap(localId, num & 255, num >>> 8);
      const objectEventId = object ? ow.objects.indexOf(object) : C.OBJECT_EVENTS_COUNT;
      const script = objectEventId < C.OBJECT_EVENTS_COUNT ? ow.objects.GetObjectEventScriptPointerByObjectEventId(objectEventId) : 0;
      if (!object || !script) throw Error('NPC sin script fuente');
      this.hooks.hideObjects(true, objectMapId, localId);
      ow.selectedObject = objectEventId;
      varSet(SV.LAST_TALKED, object.localId); varSet(SV.FACING, save.facing);
      ow.script.ScriptContext_SetupScript(script);
    }, false, objectMapId);
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
  private async run(nav: NavigationSave, localId: number, fullScreen: boolean, start: (game: Game) => void, prepared = false, objectMapId = nav.mapId): Promise<void> {
    if (this.open) return;
    this.interactionMapId=nav.mapId;this.observedObjects.clear();
    for(const state of this.hooks.readObjects(nav.mapId))this.observedObjects.set(objectStateKey(state),state);
    this.localId=localId; this.objectMapId=objectMapId; this.fullScreen=fullScreen; this.hooks.pause(true); this.root.hidden=false;
    this.root.dataset.loading='true';
    try {
      await (this.loading ??= this.initialize());
      const game = this.game!, ow = game.overworld;
      if (!prepared) {
        syncViewerLocation(nav);
        await this.prepareObjects(nav);
      }
      this.observeObjects();
      this.initialSprites=new Set(ow.sprites.sprites);
      start(game);
      joy.initKeys();joy.setExternalInputEnabled(true);
      this.root.dataset.loading='false';this.ui.focus({preventScroll:true});
      this.last=performance.now();this.accumulator=0;
      let idle=0, warpFrames=0, whiteOutRelocated=false, warpRelocated=false;
      const startNum=save.location.mapNum, startGroup=save.location.mapGroup;
      const loop=(now:number)=>{
        if(!this.open)return;
        this.accumulator+=Math.min(100,now-this.last);this.last=now;
        while(this.accumulator>=FRAME_MS){game.frame();this.accumulator-=FRAME_MS;}
        const inWhiteOut=Boolean(game.whitingOut||ow.whitingOut);
        if(ow.whiteOutReady&&!whiteOutRelocated){
          const at=save.location;
          const destId=rom.mapIdByNum(((at.mapGroup&0xff)<<8)|(at.mapNum&0xff));
          if(destId){
            whiteOutRelocated=true;
            this.hooks.hideObjects(false,this.objectMapId||this.interactionMapId,this.localId);
            nav={mapId:destId,x:at.x,y:at.y,direction:'north',dynamic:null};
            this.interactionMapId=destId;
            this.objectMapId=destId;
            this.localId=varGet(SV.LAST_TALKED);
            this.observedObjects.clear();
            this.initialSprites=new Set(ow.sprites.sprites);
            if(this.localId)this.hooks.hideObjects(true,destId,this.localId);
            void Promise.resolve(this.hooks.relocate(nav)).then(()=>{
              if(this.open&&this.localId)this.hooks.hideObjects(true,destId,this.localId);
            });
          }
        }
        const at=save.location;
        const warped=fullScreen&&!game.scene&&!inWhiteOut&&!whiteOutRelocated&&(at.mapGroup!==startGroup||at.mapNum!==startNum||at.x!==nav.x||at.y!==nav.y);
        if(warped&&!warpRelocated&&(paletteFade.level>0||paletteFade.active)){
          const destId=rom.mapIdByNum(((at.mapGroup&0xff)<<8)|(at.mapNum&0xff));
          if(destId){
            warpRelocated=true;
            this.hooks.hideObjects(false,this.objectMapId||this.interactionMapId,this.localId);
            const direction = ({ [C.DIR_SOUTH]: 'south', [C.DIR_NORTH]: 'north', [C.DIR_WEST]: 'west', [C.DIR_EAST]: 'east' } as const)[save.facing] ?? nav.direction;
            nav={mapId:destId,x:at.x,y:at.y,direction,dynamic:null};
            this.interactionMapId=destId;
            this.objectMapId=destId;
            this.observedObjects.clear();
            this.initialSprites=new Set(ow.sprites.sprites);
            this.hooks.hideObjects(true,destId,0);
            void Promise.resolve(this.hooks.relocate(nav)).then(()=>{
              if(this.open)this.hooks.hideObjects(true,destId,0);
            });
          }
        }
        this.observeObjects();
        this.present();
        const activeFull = fullScreen || this.isFullScreenScene() || inWhiteOut || whiteOutRelocated || warpRelocated;
        this.root.dataset.scriptActive=String(ow.script.isActive()||(activeFull&&ow.controlsLocked));
        this.root.dataset.script=ow.script.global.entry;
        this.root.dataset.native=ow.script.global.nativePtr?.name??'';
        this.root.dataset.mode=String(ow.script.global.mode);
        this.root.dataset.money=String(save.money);
        this.root.dataset.battle=game.scene?gBattlerControllerFuncs[0]?.name??'':'';
        const finished=activeFull?!ow.controlsLocked&&!ow.script.isActive()&&!inWhiteOut:!ow.script.isActive()&&!inWhiteOut;
        // Field moves and warps run as tasks after the menu has unlocked the field:
        // wait until the task list stays empty (or, with a leaked task, a long while).
        idle=finished&&!game.scene?idle+1:0;
        warpFrames=warped?warpFrames+1:0;
        if(warpFrames>=1800){this.finish(nav);return;}
        const busyTasks=activeFull&&tasks.tasks.some(t=>t.isActive);
        if(finished&&!game.scene&&(!activeFull||(!busyTasks&&idle>=20)||idle>=600)){this.finish(nav);return;}
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
   * Arrival in a map: runs its OnTransition map script (e.g. setrespawn in Centers,
   * boulder resets in caves/Route 20, etc.) as in overworld.c RunOnTransitionMapScript.
   */
  async enterMap(nav: NavigationSave): Promise<void> {
    if (this.busy) return;
    this.testingWild = true;
    try {
      await (this.loading ??= this.initialize());
      const ow = this.game!.overworld;
      syncViewerLocation(nav);
      await this.prepareObjects(nav);
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
      if (this.wildMap !== from.mapId) { await this.prepareObjects(from); this.wildMap = from.mapId; }
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
      if (this.wildMap !== nav.mapId) { await this.prepareObjects(nav); this.wildMap = nav.mapId; }
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
  /** Execute an arbitrary script (e.g. Victory Road boulder floor switch). */
  async triggerScript(nav: NavigationSave, scriptLabelOrPtr: string | number): Promise<boolean> {
    if (this.busy) return false;
    let started = false;
    try {
      await (this.loading ??= this.initialize());
      const script = typeof scriptLabelOrPtr === 'string' ? rom.label(scriptLabelOrPtr) : scriptLabelOrPtr;
      if (!script) return false;
      started = true;
      await this.run(nav, 0, false, (game) => {
        game.overworld.script.ScriptContext_SetupScript(script);
      }, false);
      return true;
    } finally {
      if (!started) this.root.dataset.loading = 'false';
    }
  }
  /** Use registered key item (e.g. Fishing Rod on water) on the field. */
  async useRegisteredKeyItem(nav: NavigationSave): Promise<boolean> {
    if (this.busy) return false;
    let started = false;
    try {
      await (this.loading ??= this.initialize());
      const game = this.game!;
      const ow = game.overworld;
      syncViewerLocation(nav);
      if (this.wildMap !== nav.mapId) { await this.prepareObjects(nav); this.wildMap = nav.mapId; }
      const player = ow.player.object;
      const elevation = ow.map.elevationAt(nav.x + MAP_OFFSET, nav.y + MAP_OFFSET) || 3;
      player.currentElevation = elevation;
      player.previousElevation = elevation;
      ow.objects.MoveObjectEventToMapCoords(player, nav.x + MAP_OFFSET, nav.y + MAP_OFFSET);
      ow.objects.turn(player, save.facing);
      ow.SetCameraToTrackPlayer();
      started = true;
      this.hooks.hideObjects(true, nav.mapId, 0);
      await this.run(nav, 0, true, (g) => {
        g.UseRegisteredKeyItemOnField();
      }, true);
      return true;
    } finally {
      this.hooks.hideObjects(false, nav.mapId, 0);
      if (!started) this.root.dataset.loading = 'false';
    }
  }
  /** Use Sweet Scent on the field (fldeff_sweetscent.c). */
  async useSweetScent(nav: NavigationSave, partyIndex = 0): Promise<boolean> {
    if (this.busy) return false;
    let started = false;
    try {
      await (this.loading ??= this.initialize());
      const game = this.game!;
      const ow = game.overworld;
      syncViewerLocation(nav);
      if (this.wildMap !== nav.mapId) { await this.prepareObjects(nav); this.wildMap = nav.mapId; }
      const player = ow.player.object;
      const elevation = ow.map.elevationAt(nav.x + MAP_OFFSET, nav.y + MAP_OFFSET) || 3;
      player.currentElevation = elevation;
      player.previousElevation = elevation;
      ow.objects.MoveObjectEventToMapCoords(player, nav.x + MAP_OFFSET, nav.y + MAP_OFFSET);
      ow.objects.turn(player, save.facing);
      ow.SetCameraToTrackPlayer();
      started = true;
      this.hooks.hideObjects(true, nav.mapId, 0);
      await this.run(nav, 0, true, (g) => {
        g.fieldEffectArguments[0] = partyIndex;
        g.overworld.effects.start(C.FLDEFF_SWEET_SCENT);
      }, true);
      return true;
    } finally {
      this.hooks.hideObjects(false, nav.mapId, 0);
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
      if (this.wildMap !== nav.mapId) { await this.prepareObjects(nav); this.wildMap = nav.mapId; }
      // Place the engine avatar (and camera) exactly where the viewer player stands.
      const player = ow.player.object;
      const elevation = ow.map.elevationAt(nav.x + MAP_OFFSET, nav.y + MAP_OFFSET) || 3;
      player.currentElevation = elevation;
      player.previousElevation = elevation;
      ow.objects.MoveObjectEventToMapCoords(player, nav.x + MAP_OFFSET, nav.y + MAP_OFFSET);
      ow.objects.turn(player, save.facing);
      ow.SetCameraToTrackPlayer();
      ow.player.flags = surfing ? ow.player.flags | PLAYER_AVATAR_FLAG_SURFING : ow.player.flags & ~PLAYER_AVATAR_FLAG_SURFING;
      // checkForTrainersWantingBattle (trainer_see.c) runs first in ProcessPlayerFieldInput:
      // the source approach, exclamation, walk and battle script for a trainer in sight.
      if (ow.effects.checkForTrainersWantingBattle()) {
        const trainer = (game.trainerSee as unknown as { approaching?: { trainer: { localId: number; mapNum: number; mapGroup: number } } }).approaching?.trainer;
        const trainerId = trainer?.localId ?? 0;
        const trainerMapId = (trainer ? rom.mapIdByNum((trainer.mapGroup << 8) | trainer.mapNum) : undefined) ?? nav.mapId;
        started = true;
        if (this.hooks.onBattleStart) await this.hooks.onBattleStart();
        await this.run(nav, trainerId, true, () => { if (trainerId) this.hooks.hideObjects(true, trainerMapId, trainerId); }, true, trainerMapId);
        return true;
      }
      // ProcessPlayerFieldInput tookStep (field_control_avatar.c): step stat, then the
      // step-count scripts (happiness, poison, egg hatch, Safari) and repel; those
      // that set up a script run it before the encounter check, as in the C.
      // FieldGetPlayerInput: arriving on a forced-movement tile sets neither tookStep
      // nor checkStandardWildEncounter.
      const behavior = ow.map.behaviorAt(nav.x + MAP_OFFSET, nav.y + MAP_OFFSET);
      if (MB.MetatileBehavior_IsForcedMovementTile(behavior)) return false;
      incrementGameStat(C.GAME_STAT_STEPS);
      WonderNews_IncrementStepCounter();
      IncrementRenewableHiddenItemStepCounter();
      RunMassageCooldownStepCounter();
      IncrementResortGorgeousStepCounter();
      IncrementBirthIslandRockStepCount();
      if (ow.control.tryStartStepCountScript(behavior) || ow.effects.updateRepelCounter()) {
        started = true;
        await this.run(nav, 0, true, () => {}, true);
        return true;
      }
      if (ow.control.tryStartCoordEventScript({ x: nav.x + MAP_OFFSET, y: nav.y + MAP_OFFSET, elevation })) {
        started = true;
        await this.run(nav, 0, true, () => {}, true);
        return true;
      }
      const attributes = ow.map.attributesOf(ow.map.metatileIdAt(nav.x + MAP_OFFSET, nav.y + MAP_OFFSET));
      const wildHit = game.wild.tryStandardWildEncounter(attributes);
      if (!wildHit) return false;
      started = true;
      if (this.hooks.onBattleStart) await this.hooks.onBattleStart();
      await this.run(nav, 0, true, () => {}, true);
      return true;
    } finally {
      this.testingWild = false;
      if (!started) this.root.dataset.loading = 'false';
    }
  }
}
