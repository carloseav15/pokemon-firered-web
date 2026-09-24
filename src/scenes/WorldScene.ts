import Phaser from "phaser";
import { openingDialogue } from "../content/dialogues";
import { AudioManager } from "../audio/AudioManager";
import { WorldEngine } from "../engine/WorldEngine";
import { PalletQuest, LAB_SCENE } from "../engine/PalletQuest";
import type { Direction, MapData } from "../engine/types";
import { MetatileBehavior } from "../engine/MetatileBehavior";
import { sourceDialogueForScript } from "../content/sourceScripts";
import { TextProcessor } from "../ui/TextProcessor";
import { SaveStore, type SaveGame, type StarterSpecies } from "../game/GameState";
import { ChoiceModel } from "../ui/ChoiceModel";

const TILE = 16;

type Interaction = { x: number; y: number; lines: string[] };
type MobileNpc = { id: string; sprite: Phaser.GameObjects.Sprite; key: string; x: number; y: number; minX: number; maxX: number; minY: number; maxY: number; solidPosition: { x: number; y: number }; interaction: Interaction; busy: boolean };

const MAPS = [
  ["MAP_PALLET_TOWN", "palletTownData"],
  ["MAP_PALLET_TOWN_PLAYERS_HOUSE_1F", "playersHouse1FData"],
  ["MAP_PALLET_TOWN_PLAYERS_HOUSE_2F", "playersHouse2FData"],
  ["MAP_PALLET_TOWN_RIVALS_HOUSE", "rivalsHouseData"],
  ["MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB", "oaksLabData"],
  ["MAP_ROUTE1", "route1Data"],
] as const;

const MAP_ASSETS: Record<string, { base: string; foreground: string }> = {
  MAP_PALLET_TOWN_PLAYERS_HOUSE_1F: { base: "playersHouse1FBase", foreground: "playersHouse1FForeground" },
  MAP_PALLET_TOWN_PLAYERS_HOUSE_2F: { base: "playersHouse2FBase", foreground: "playersHouse2FForeground" },
  MAP_PALLET_TOWN_RIVALS_HOUSE: { base: "rivalsHouseBase", foreground: "rivalsHouseForeground" },
  MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB: { base: "oaksLabBase", foreground: "oaksLabForeground" },
  MAP_ROUTE1: { base: "route1Base", foreground: "route1Foreground" },
};

const MAP_JSON_PATHS: Record<string, string> = {
  palletTownData: "pallet_town.json",
  playersHouse1FData: "maps/pallet_town_players_house_1f/map.json",
  playersHouse2FData: "maps/pallet_town_players_house_2f/map.json",
  rivalsHouseData: "maps/pallet_town_rivals_house/map.json",
  oaksLabData: "maps/pallet_town_professor_oaks_lab/map.json",
  route1Data: "maps/route1/map.json",
};

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private mapData!: MapData;
  private mapId = "MAP_PALLET_TOWN";
  private background?: Phaser.GameObjects.GameObject;
  private foreground?: Phaser.GameObjects.GameObject;
  private dialogueBox?: Phaser.GameObjects.Container;
  private dialogueLines: string[] = openingDialogue;
  private dialogueIndex = 0;
  private dialoguePages: string[] = [];
  private dialogueCharacter = 0;
  private dialogueElapsed = 0;
  private dialogueDone?: () => void;
  private choiceBox?: Phaser.GameObjects.Container;
  private choice?: ChoiceModel;
  private choiceDone?: (answer: string) => void;
  private choiceCursor?: Phaser.GameObjects.Text;
  private scriptWasBusy = false;
  private textProcessor = new TextProcessor();
  private moving = false;
  private playerGrid = { x: 7, y: 16 };
  private ambientFrame = 0;
  private ambientElapsed = 0;
  private interactions: Interaction[] = [];
  private solidObjects: Array<{ x: number; y: number }> = [];
  private pendingWarp?: { dest_map: string; dest_warp_id?: string };
  private mobileNpcs: MobileNpc[] = [];
  private npcElapsed = 0;
  private objectSprites: Phaser.GameObjects.GameObject[] = [];
  private objectSpritesByScript = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>();
  private objectSpritesById = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>();
  private audio = new AudioManager();
  private audioLabel?: Phaser.GameObjects.Text;
  private mapLabel?: Phaser.GameObjects.Text;
  private collisionOverlay?: Phaser.GameObjects.Graphics;
  private collisionDebug = false;
  private forcedChainDepth = 0;
  private engine?: WorldEngine;
  private engineUnsubscribe?: () => void;
  private starterSpecies?: string;
  private save?: SaveGame;

  constructor() { super("WorldScene"); }

  init(data: { starter?: string; save?: SaveGame }): void {
    this.starterSpecies = data?.starter;
    this.save = data?.save;
  }

  preload(): void {
    this.load.spritesheet("palletTownBaseAnim", "/assets/firered/pallet_town_base_anim.png", { frameWidth: 384, frameHeight: 320 });
    this.load.spritesheet("palletTownForegroundAnim", "/assets/firered/pallet_town_foreground_anim.png", { frameWidth: 384, frameHeight: 320 });
    for (const [, key] of MAPS) this.load.json(key, `/assets/firered/${MAP_JSON_PATHS[key]}`);
    for (const [mapId, assets] of Object.entries(MAP_ASSETS)) {
      const folder = mapId.replace("MAP_", "").toLowerCase();
      this.load.image(assets.base, `/assets/firered/maps/${folder}/base.png`);
      this.load.image(assets.foreground, `/assets/firered/maps/${folder}/foreground.png`);
    }
    this.load.spritesheet("player", "/assets/firered/people/red_normal.png", { frameWidth: 16, frameHeight: 32 });
    for (const [key, file] of Object.entries({ profOak: "prof_oak", woman1: "woman_1", fatMan: "fat_man", mom: "mom", daisy: "daisy", scientist: "scientist", workerF: "worker_f", blue: "blue", clerk: "clerk", boy: "boy" })) this.load.spritesheet(key, `/assets/firered/people/${file}.png`, { frameWidth: 16, frameHeight: 32 });
    for (const [key, file] of Object.entries({ itemBall: "item_ball", townMap: "town_map", pokedex: "pokedex" })) this.load.image(key, `/assets/firered/objects/${file}.png`);
  }

  create(): void {
    this.game.canvas.setAttribute("tabindex", "0");
    this.game.canvas.focus();
    this.createPlayerAnimations();
    this.createInput();
    this.player = this.add.sprite(0, 0, "player", 0).setOrigin(0.5, 1).setDepth(10);
    this.loadMap(this.save?.mapId ?? "MAP_PALLET_TOWN", this.save?.position ?? { x: 7, y: 16 });
    if (this.starterSpecies) this.time.delayedCall(80, () => this.openDialogue([`Your first POKéMON, ${this.starterSpecies}, is ready.`, "Pallet Town is now open for free exploration."]));
  }

  update(): void {
    this.engine?.update(this.game.loop.delta);
    this.syncObjectVisibility();
    const scriptBusy = this.engine?.scripts.isBusy ?? false;
    if (this.scriptWasBusy && !scriptBusy) this.persistSave();
    this.scriptWasBusy = scriptBusy;
    this.updateDialogue(this.game.loop.delta);
    this.updateAmbientAnimation(this.game.loop.delta);
    this.updateWanderingNpcs(this.game.loop.delta);
    if (this.dialogueBox || this.choiceBox || this.moving) return;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown) dx = -1;
    else if (this.cursors.right.isDown) dx = 1;
    else if (this.cursors.up.isDown) dy = -1;
    else if (this.cursors.down.isDown) dy = 1;
    if (dx !== 0 || dy !== 0) this.movePlayer(dx, dy);
  }

  private loadMap(mapId: string, spawn?: { x: number; y: number }): void {
    const [, jsonKey] = MAPS.find(([id]) => id === mapId) ?? MAPS[0];
    this.mapId = mapId;
    this.mapData = this.cache.json.get(jsonKey) as MapData;
    const initialSpawn = spawn ?? this.playerGrid;
    this.engineUnsubscribe?.();
    if (!this.engine) this.engine = new WorldEngine(mapId, this.mapData, initialSpawn);
    else this.engine.replaceMap(mapId, this.mapData, initialSpawn);
    if (this.save) {
      this.engine.world.variables = { ...this.save.variables };
      for (const [flag, value] of Object.entries(this.save.flags)) {
        if (value) this.engine.setFlag(flag);
        else this.engine.clearFlag(flag);
      }
      if (this.save.hasPokedex) this.engine.setFlag("FLAG_SYS_POKEDEX_GET");
    }
    this.engineUnsubscribe = this.engine.on((event) => {
      if (event.type === "dialogue") this.openDialogue(event.lines);
    });
    this.background?.destroy();
    this.foreground?.destroy();
    for (const object of this.objectSprites) object.destroy();
    this.objectSprites = [];
    this.objectSpritesByScript.clear();
    this.objectSpritesById.clear();
    this.mobileNpcs = [];
    this.interactions = [];
    this.solidObjects = [];
    this.collisionOverlay?.clear();
    const assets = mapId === "MAP_PALLET_TOWN" ? { base: "palletTownBaseAnim", foreground: "palletTownForegroundAnim" } : MAP_ASSETS[mapId];
    this.background = mapId === "MAP_PALLET_TOWN" ? this.add.sprite(0, 0, assets.base, 0).setOrigin(0, 0).setDepth(0) : this.add.image(0, 0, assets.base).setOrigin(0, 0).setDepth(0);
    this.foreground = mapId === "MAP_PALLET_TOWN" ? this.add.sprite(0, 0, assets.foreground, 0).setOrigin(0, 0).setDepth(20) : this.add.image(0, 0, assets.foreground).setOrigin(0, 0).setDepth(20);
    this.cameras.main.setBounds(0, 0, this.mapData.width * TILE, this.mapData.height * TILE);
    this.playerGrid = initialSpawn;
    this.persistSave();
    this.player.setPosition(this.gridX(this.playerGrid.x), this.feetY(this.playerGrid.y)).setFrame(0).setFlipX(false);
    this.createObjects();
    if (mapId === "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB" && PalletQuest.labScene(this.engine) === 1) {
      this.time.delayedCall(400, () => this.beginLabIntroduction());
    }
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.mapLabel?.destroy();
    this.mapLabel = this.mapData.showMapName ? this.add.text(8, 5, this.mapData.name.replaceAll("_", " "), { color: "#ffffff", fontFamily: "monospace", fontSize: "7px", backgroundColor: "#382c2c", padding: { left: 2, right: 2, top: 1, bottom: 1 } }).setScrollFactor(0).setDepth(100) : undefined;
    if (this.collisionDebug) this.toggleCollisionDebug();
  }

  private createObjects(): void {
    for (const [index, event] of this.mapData.objectEvents.entries()) {
      if (this.engine && !this.engine.world.objects[index]?.active) continue;
      const spriteKey = this.spriteKeyFor(event.graphics_id);
      if (!spriteKey) continue;
      const inanimate = ["itemBall", "townMap", "pokedex"].includes(spriteKey);
      const sprite = inanimate ? this.add.image(this.gridX(event.x), this.feetY(event.y) - 8, spriteKey).setOrigin(0.5, 1).setDepth(10) : this.add.sprite(this.gridX(event.x), this.feetY(event.y), spriteKey, 0).setOrigin(0.5, 1).setDepth(10);
      this.objectSprites.push(sprite);
      if (event.script) this.objectSpritesByScript.set(event.script, sprite);
      const runtimeObject = this.engine?.world.objects[index];
      if (runtimeObject) this.objectSpritesById.set(runtimeObject.id, sprite);
      const solidPosition = { x: event.x, y: event.y };
      this.solidObjects.push(solidPosition);
      const interaction: Interaction = { x: event.x, y: event.y, lines: this.linesFor(event.graphics_id, event.script) };
      this.interactions.push(interaction);
      if (!inanimate && event.movement_type?.includes("WANDER")) {
        const objectId = this.engine?.world.objects[index]?.id ?? `${this.mapId}:object:${index}`;
        this.mobileNpcs.push({ id: objectId, sprite: sprite as Phaser.GameObjects.Sprite, key: spriteKey, x: event.x, y: event.y, minX: Math.max(0, event.x - (event.movement_range_x ?? 0)), maxX: Math.min(this.mapData.width - 1, event.x + (event.movement_range_x ?? 0)), minY: Math.max(0, event.y - (event.movement_range_y ?? 0)), maxY: Math.min(this.mapData.height - 1, event.y + (event.movement_range_y ?? 0)), solidPosition, interaction, busy: false });
        this.createNpcAnimations(spriteKey);
      }
    }
    for (const event of this.mapData.backgroundEvents) this.interactions.push({ x: event.x, y: event.y, lines: ["This is a Pallet Town event.", "Its source event is ready for narrative migration."] });
  }

  private movePlayer(dx: number, dy: number): void {
    const next = { x: this.playerGrid.x + dx, y: this.playerGrid.y + dy };
    const direction = this.directionFor(dx, dy);
    if (!this.engine?.move(direction)) return;
    this.playerGrid = next;
    this.persistSave();
    this.audio.unlock();
    this.audio.play("step");
    this.pendingWarp = this.mapData.warpEvents.find((warp) => warp.x === next.x && warp.y === next.y);
    this.forcedChainDepth = 0;
    this.animatePlayerStep(next, direction);
  }

  private animatePlayerStep(next: { x: number; y: number }, direction: Direction): void {
    this.playerGrid = next;
    this.moving = true;
    this.player.setFlipX(direction === "east").play(`player-walk-${direction === "east" ? "west" : direction}`);
    this.tweens.add({
      targets: this.player,
      x: this.gridX(next.x),
      y: this.feetY(next.y),
      duration: 110,
      onComplete: () => {
        this.player.stop();
        this.player.setFrame(this.idleFrame(direction));
        if (this.engine && this.forcedChainDepth < 16 && this.engine.forcedMove()) {
          this.forcedChainDepth += 1;
          const forced = { ...this.engine.world.player.position };
          const forcedDirection = this.directionFor(forced.x - this.playerGrid.x, forced.y - this.playerGrid.y);
          this.pendingWarp = this.mapData.warpEvents.find((warp) => warp.x === forced.x && warp.y === forced.y);
          this.audio.play("step");
          this.animatePlayerStep(forced, forcedDirection);
          return;
        }
        this.forcedChainDepth = 0;
        this.moving = false;
        if (this.pendingWarp) this.resolveWarp(this.pendingWarp);
        else this.resolveMapConnection();
      },
    });
  }

  private resolveWarp(warp: { dest_map: string; dest_warp_id?: string }): void {
    const [, jsonKey] = MAPS.find(([id]) => id === warp.dest_map) ?? MAPS[0];
    const destination = this.cache.json.get(jsonKey) as MapData;
    const destinationWarp = destination.warpEvents[Number(warp.dest_warp_id ?? 0)];
    this.pendingWarp = undefined;
    if (!destinationWarp) { this.openDialogue([`The path leads toward ${warp.dest_map.replace("MAP_", "").replaceAll("_", " ")}.`, "That destination is not imported yet."]); return; }
    this.transitionToMap(warp.dest_map, { x: destinationWarp.x, y: destinationWarp.y });
  }

  private resolveMapConnection(): void {
    const connection = this.engine?.edgeConnection();
    if (!connection?.map) return;
    if (connection.map === "MAP_ROUTE1" && this.save && this.save.party.length === 0) {
      this.triggerOakEscort();
      return;
    }
    const destination = MAPS.find(([id]) => id === connection.map);
    if (!destination) {
      this.openDialogue([`The path continues toward ${connection.map.replace("MAP_", "").replaceAll("_", " ")}.`, "That connected map has not been imported yet."]);
      return;
    }
    const [, jsonKey] = destination;
    const destinationData = this.cache.json.get(jsonKey) as MapData;
    const offset = connection.offset ?? 0;
    const direction = connection.direction;
    const spawn = direction === "up" || direction === "north"
      ? { x: this.playerGrid.x + offset, y: destinationData.height - 1 }
      : direction === "down" || direction === "south"
        ? { x: this.playerGrid.x + offset, y: 0 }
        : direction === "left" || direction === "west"
          ? { x: destinationData.width - 1, y: this.playerGrid.y + offset }
          : { x: 0, y: this.playerGrid.y + offset };
    this.transitionToMap(connection.map, spawn);
  }

  private transitionToMap(mapId: string, spawn: { x: number; y: number }): void {
    if (!this.engine?.transitions.beginMapChange(mapId)) return;
    this.audio.play("warp");
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.time.delayedCall(200, () => {
      this.loadMap(mapId, spawn);
      this.cameras.main.once("camerafadeincomplete", () => this.engine?.transitions.finishMapChange(mapId));
      this.cameras.main.fadeIn(180, 0, 0, 0);
    });
  }

  private createInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.audioLabel = this.add.text(232, 5, "AUDIO: LOCKED", { color: "#ffffff", fontFamily: "monospace", fontSize: "6px", backgroundColor: "#382c2c", padding: { left: 2, right: 2, top: 1, bottom: 1 } }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.input.keyboard!.on("keydown-M", () => { this.audio.unlock(); this.audioLabel?.setText(this.audio.toggleMute() ? "AUDIO: MUTED" : "AUDIO: ON"); });
    this.input.keyboard!.on("keydown-C", () => this.toggleCollisionDebug());
    this.input.keyboard!.on("keydown", () => { this.audio.unlock(); if (this.audioLabel?.text === "AUDIO: LOCKED") this.audioLabel.setText("AUDIO: ON"); });
    this.input.keyboard!.on("keydown-SPACE", () => this.advanceDialogue());
    this.input.keyboard!.on("keydown-ENTER", () => this.advanceDialogue());
    this.input.keyboard!.on("keydown-UP", () => this.moveChoice(-1));
    this.input.keyboard!.on("keydown-DOWN", () => this.moveChoice(1));
    this.input.keyboard!.on("keydown-E", () => this.openDialogueIfNearby());
  }

  private createPlayerAnimations(): void { for (const [key, frames] of [["south", [3, 0, 4, 0]], ["north", [5, 1, 6, 1]], ["west", [7, 2, 8, 2]]] as const) this.anims.create({ key: `player-walk-${key}`, frames: frames.map((frame) => ({ key: "player", frame })), frameRate: 12, repeat: -1 }); }
  private createNpcAnimations(key: string): void { if (this.anims.exists(`${key}-walk-south`)) return; for (const [direction, frames] of [["south", [3, 0, 4, 0]], ["north", [5, 1, 6, 1]], ["west", [7, 2, 8, 2]]] as const) this.anims.create({ key: `${key}-walk-${direction}`, frames: frames.map((frame) => ({ key, frame })), frameRate: 8, repeat: -1 }); }

  private updateWanderingNpcs(delta: number): void {
    if (!this.engine) return;
    for (const npc of this.mobileNpcs) {
      const object = this.engine.world.objects.find((candidate) => candidate.id === npc.id);
      if (!object) continue;
      const moved = object.x !== npc.x || object.y !== npc.y;
      const direction = this.directionFor(object.x - npc.x, object.y - npc.y);
      npc.x = object.x;
      npc.y = object.y;
      npc.solidPosition.x = object.x;
      npc.solidPosition.y = object.y;
      npc.interaction.x = object.x;
      npc.interaction.y = object.y;
      npc.sprite.setPosition(this.gridX(object.x), this.feetY(object.y));
      if (moved) npc.sprite.setFlipX(direction === "east").play(`${npc.key}-walk-${direction === "east" ? "west" : direction}`);
      else if (npc.sprite.anims.isPlaying) npc.sprite.stop();
    }
  }

  private syncObjectVisibility(): void {
    if (!this.engine) return;
    for (const object of this.engine.world.objects) {
      this.objectSpritesById.get(object.id)?.setVisible(object.active);
    }
  }

  private updateAmbientAnimation(delta: number): void { if (this.mapId !== "MAP_PALLET_TOWN" || !this.background || !this.foreground) return; this.ambientElapsed += delta; if (this.ambientElapsed < 133) return; this.ambientElapsed = 0; this.ambientFrame = (this.ambientFrame + 1) % 16; (this.background as Phaser.GameObjects.Sprite).setFrame(this.ambientFrame); (this.foreground as Phaser.GameObjects.Sprite).setFrame(this.ambientFrame); }
  private toggleCollisionDebug(): void { this.collisionDebug = !this.collisionDebug; if (!this.collisionOverlay) this.collisionOverlay = this.add.graphics().setDepth(50).setAlpha(0.55); this.collisionOverlay.clear(); if (!this.collisionDebug) return; for (let y = 0; y < this.mapData.height; y++) for (let x = 0; x < this.mapData.width; x++) if (!this.canEnter(x, y)) { this.collisionOverlay.fillStyle(this.isBlockedWater(x, y) ? 0x268cff : 0xf04444, 0.55); this.collisionOverlay.fillRect(x * TILE, y * TILE, TILE, TILE); } }
  private canEnter(x: number, y: number): boolean {
    if (!this.engine) return false;
    return this.engine.collisionSystem.isPassable({ x, y }, this.engine.world);
  }
  private isBlockedWater(x: number, y: number): boolean { return this.engine?.collisionSystem.isWater({ x, y }) ?? false; }
  private openDialogueIfNearby(): void {
    if (this.dialogueBox || this.choiceBox || this.moving || this.engine?.transitions.isBusy) return;
    const target = this.engine?.interactionTarget();
    if (target?.object && this.handleLabProgression(target.object)) return;
    if (this.engine?.interact()) return;
    if (target?.object) {
      this.openDialogue(this.linesFor(target.object.graphics_id, target.object.script));
      return;
    }
    if (target?.event) {
      this.openDialogue(target.event.script ? [target.event.script] : ["This event belongs to the original field script.", "Its behavior is ready for script migration."]);
      return;
    }
    const tileLines = this.linesForBehavior(target?.behavior ?? MetatileBehavior.NORMAL);
    if (tileLines) {
      this.openDialogue(tileLines);
      return;
    }
    const nearby = this.interactions.find((interaction) => Math.abs(this.playerGrid.x - interaction.x) + Math.abs(this.playerGrid.y - interaction.y) === 1);
    if (nearby) this.openDialogue(nearby.lines);
  }

  private triggerOakEscort(): void {
    if (!this.engine || !this.save || !PalletQuest.beginOakEscort(this.engine)) {
      this.openDialogue(["OAK: Wait! Don't go out!", "You need a POKéMON before entering the grass."]);
      return;
    }
    this.persistSave();
    this.openDialogue([
      "OAK: Hey! Wait! Don't go out!",
      "OAK: It's unsafe! Wild POKéMON live in tall grass!",
      "OAK: Come with me. I'll give you a POKéMON.",
    ], () => this.transitionToMap("MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB", { x: 6, y: 12 }));
  }

  private beginLabIntroduction(): void {
    if (!this.engine || this.mapId !== "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB" || PalletQuest.labScene(this.engine) !== 1) return;
    this.engine.scripts.load([
      { type: "say", lines: ["{RIVAL}: Gramps! I'm fed up with waiting!"] },
      { type: "wait_frames", frames: 60 },
      { type: "say", lines: ["OAK: There are three POKéMON here. They're held inside these POKé BALLS.", "You can have one. Go on, choose!"] },
      { type: "wait_frames", frames: 30 },
      { type: "say", lines: ["{RIVAL}: Hey! Gramps! No fair! What about me?", "OAK: Be patient, {RIVAL}. You can have one, too!"] },
      { type: "set_variable", key: LAB_SCENE, value: 2 },
    ]);
  }

  /** Source scene values: 0 before Oak, 2 choose, 3 rival has chosen. */
  private handleLabProgression(object: MapData["objectEvents"][number]): boolean {
    if (this.mapId !== "MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB" || !this.save) return false;
    const script = object.script ?? "";
    const phase = this.engine ? PalletQuest.labScene(this.engine) : 0;
    const starter = PalletQuest.starterForScript(script);
    if (starter) {
      if (phase >= 3 || this.save.party.length > 0) {
        this.openDialogue(["That's PROF. OAK's last POKéMON."]);
        return true;
      }
      if (phase !== 2) {
        this.openDialogue(["Those are POKé BALLS. They contain POKéMON!"]);
        return true;
      }
      this.openDialogue([`OAK: ${starter} is your choice.`, `So, {PLAYER}, do you want ${starter}?`], () =>
        this.openChoice(["YES", "NO"], (answer) => {
          if (answer !== "YES" || !this.engine || !this.save || !PalletQuest.chooseStarter(this.engine, this.save, starter)) return;
          const rival = PalletQuest.rivalStarter(starter);
          for (const species of [starter, rival]) {
            const ballScript = `PalletTown_ProfessorOaksLab_EventScript_${species[0]}${species.slice(1).toLowerCase()}Ball`;
            this.objectSpritesByScript.get(ballScript)?.setVisible(false);
          }
          this.persistSave();
          this.openDialogue(["OAK: This POKéMON is really quite energetic!", `{PLAYER} received ${starter} from PROF. OAK!`,
            `{RIVAL}: I'll take this one, then!`, `{RIVAL} received ${rival} from PROF. OAK!`]);
        }));
      return true;
    }
    if (script.endsWith("EventScript_Pokedex")) {
      this.openDialogue(["It's like an encyclopedia, but the pages are blank."]);
      return true;
    }
    return false;
  }
  private linesForBehavior(behavior: number): string[] | undefined {
    if (behavior === MetatileBehavior.SIGNPOST) return ["A signpost stands here.", "Its source script is ready for migration."];
    if (behavior === MetatileBehavior.REGION_MAP) return ["A town map is displayed here.", "The region-map system is ready for migration."];
    if (behavior === MetatileBehavior.PC) return ["The PC is ready to use.", "Storage and player-state services are not ported yet."];
    if (behavior === MetatileBehavior.BOOKSHELF) return ["There are books on the shelf."];
    if (behavior === MetatileBehavior.TELEVISION) return ["The television is showing a program."];
    if (behavior === MetatileBehavior.COMPUTER) return ["A computer is turned on."];
    return undefined;
  }
  private openDialogue(lines: string[], onDone?: () => void): void {
    if (this.dialogueBox) return;
    this.dialogueDone = onDone;
    this.audio.unlock();
    this.audio.play("dialogue");
    this.dialogueLines = lines;
    this.dialoguePages = this.textProcessor.pages(lines, { playerName: this.save?.playerName ?? "RED", rivalName: this.save?.rivalName ?? "BLUE", variables: this.engine?.world.variables });
    this.dialogueIndex = 0;
    this.dialogueCharacter = 0;
    this.dialogueElapsed = 0;
    this.dialogueBox = this.add.container(8, 108).setScrollFactor(0).setDepth(100);
    const panel = this.add.rectangle(112, 24, 224, 46, 0xf8f8f8).setStrokeStyle(2, 0x382c2c);
    const text = this.add.text(12, 9, "", { color: "#222222", fontFamily: "monospace", fontSize: "7px", lineSpacing: 1, wordWrap: { width: 200 } });
    const cursor = this.add.text(207, 37, "▼", { color: "#382c2c", fontFamily: "monospace", fontSize: "7px" });
    this.dialogueBox.add([panel, text, cursor]);
    this.updateDialogue(0);
  }

  private updateDialogue(delta: number): void {
    if (!this.dialogueBox) return;
    const page = this.dialoguePages[this.dialogueIndex] ?? "";
    if (this.dialogueCharacter >= page.length) return;
    this.dialogueElapsed += delta;
    if (this.dialogueElapsed < 22) return;
    this.dialogueElapsed = 0;
    this.dialogueCharacter = Math.min(page.length, this.dialogueCharacter + 1);
    (this.dialogueBox.list[1] as Phaser.GameObjects.Text).setText(page.slice(0, this.dialogueCharacter));
  }

  private advanceDialogue(): void {
    if (this.choiceBox) {
      const answer = this.choice?.choose() ?? "NO";
      const done = this.choiceDone;
      this.choiceBox.destroy();
      this.choiceBox = undefined;
      this.choice = undefined;
      this.choiceCursor = undefined;
      this.choiceDone = undefined;
      done?.(answer);
      return;
    }
    if (!this.dialogueBox) return;
    const page = this.dialoguePages[this.dialogueIndex] ?? "";
    if (this.dialogueCharacter < page.length) {
      this.dialogueCharacter = page.length;
      (this.dialogueBox.list[1] as Phaser.GameObjects.Text).setText(page);
      return;
    }
    this.audio.play("dialogue");
    this.dialogueIndex++;
    if (this.dialogueIndex >= this.dialoguePages.length) {
      this.dialogueBox.destroy();
      this.dialogueBox = undefined;
      this.engine?.scripts.resumeDialogue();
      const done = this.dialogueDone;
      this.dialogueDone = undefined;
      done?.();
      return;
    }
    this.dialogueCharacter = 0;
    this.dialogueElapsed = 0;
    (this.dialogueBox.list[1] as Phaser.GameObjects.Text).setText("");
  }
  private openChoice(options: string[], onDone: (answer: string) => void): void {
    this.choice = new ChoiceModel(options);
    this.choiceDone = onDone;
    this.choiceBox = this.add.container(178, 65).setScrollFactor(0).setDepth(101);
    const panel = this.add.rectangle(30, 18, 60, 38, 0xf8f8f8).setStrokeStyle(2, 0x382c2c);
    const labels = options.map((option, index) => this.add.text(17, 6 + index * 15, option, { color: "#222222", fontFamily: "monospace", fontSize: "7px" }));
    this.choiceCursor = this.add.text(5, 6, "▶", { color: "#222222", fontFamily: "monospace", fontSize: "7px" });
    this.choiceBox.add([panel, ...labels, this.choiceCursor]);
  }
  private moveChoice(delta: number): void {
    if (!this.choice || !this.choiceCursor) return;
    this.choice.move(delta);
    this.choiceCursor.setY(6 + this.choice.index * 15);
  }
  private linesFor(graphicsId: string, script?: string): string[] { const sourceLines = sourceDialogueForScript(script); if (sourceLines) return sourceLines; if (graphicsId === "OBJ_EVENT_GFX_PROF_OAK") return openingDialogue; if (script?.includes("Mom")) return ["MOM: Welcome home!", "The source event is ready for the next narrative pass."]; if (graphicsId === "OBJ_EVENT_GFX_ITEM_BALL") return ["A Poké Ball is displayed here.", "Starter selection will be migrated with the lab scene."]; if (graphicsId === "OBJ_EVENT_GFX_POKEDEX") return ["A Pokédex is on the table."]; return ["This object is part of the original Pallet Town interior.", "Its source event is ready for narrative migration."]; }
  private spriteKeyFor(id: string): string | undefined { const map: Record<string, string> = { OBJ_EVENT_GFX_PROF_OAK: "profOak", OBJ_EVENT_GFX_WOMAN_1: "woman1", OBJ_EVENT_GFX_FAT_MAN: "fatMan", OBJ_EVENT_GFX_MOM: "mom", OBJ_EVENT_GFX_DAISY: "daisy", OBJ_EVENT_GFX_SCIENTIST: "scientist", OBJ_EVENT_GFX_WORKER_F: "workerF", OBJ_EVENT_GFX_BLUE: "blue", OBJ_EVENT_GFX_CLERK: "clerk", OBJ_EVENT_GFX_BOY: "boy", OBJ_EVENT_GFX_ITEM_BALL: "itemBall", OBJ_EVENT_GFX_TOWN_MAP: "townMap", OBJ_EVENT_GFX_POKEDEX: "pokedex" }; return map[id]; }
  private directionFor(dx: number, dy: number): Direction { if (dy < 0) return "north"; if (dy > 0) return "south"; return dx < 0 ? "west" : "east"; }
  private persistSave(): void {
    if (!this.save) return;
    this.save.mapId = this.mapId;
    this.save.position = { ...this.playerGrid };
    this.save.flags = { ...(this.engine?.world.flags ?? this.save.flags) };
    this.save.variables = { ...(this.engine?.world.variables ?? this.save.variables) };
    SaveStore.save(this.save);
  }
  private idleFrame(direction: "south" | "north" | "west" | "east"): number { return direction === "north" ? 1 : direction === "west" || direction === "east" ? 2 : 0; }
  private gridX(x: number): number { return x * TILE + TILE / 2; }
  private feetY(y: number): number { return y * TILE + TILE; }
  shutdown(): void { this.audio.destroy(); }
}
