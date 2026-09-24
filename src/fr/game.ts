// The main loop (main.c: CB1/CB2 callbacks at the GBA frame rate) and the
// glue between the field, menus, battles and saving.

import { sound } from "./audio/sound";
import { BattleSetup, B_OUTCOME_WON, type BattleRequest } from "./battle/battleSetup";
import { encode, expandPlaceholders, stringVars } from "./gba/charmap";
import { FONT_NORMAL } from "./gba/font";
import { paletteFade, FADE_FROM_BLACK, FADE_TO_BLACK, RGB_BLACK } from "./gba/fade";
import { joy, JOY_NEW, A_BUTTON, B_BUTTON, START_BUTTON } from "./gba/input";
import { tasks } from "./gba/tasks";
import { printText, TextPrinter, getTextSpeedSetting, textOptions } from "./gba/textPrinter";
import { Window } from "./gba/window";
import { Overworld } from "./field/overworld";
import { Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menus/menu";
import { ScriptMenu } from "./menus/scriptMenu";
import { createMon, giveMonToPlayer, setDexFlag, type Pokemon } from "./pokemon/pokemon";
import { addPCItem } from "./pokemon/items";
import { rom } from "./rom";
import { flagGet, newSaveData, save, saveStore, setName, setSave, varGet, type SaveData } from "./save";
import { ScriptMovement } from "./script/movement";

export const FRAME_MS = 1000 / (16777216 / 280896);

type Callback = (() => void) | null;

export type Scene = {
  update(): void;
  render(ctx: CanvasRenderingContext2D): void;
};

export class Game {
  readonly overworld: Overworld;
  readonly scriptMovement: ScriptMovement;
  readonly scriptMenu: ScriptMenu;
  readonly battleSetup: BattleSetup;
  callback1: Callback = null;
  callback2: Callback = null;
  /** Full-screen scene drawn instead of the field (battle, menus). */
  scene: Scene | null = null;
  battleOutcome = 0;
  safariSteps: number | undefined;
  safariBalls = 0;
  trainerSee?: { checkForTrainersWantingBattle(): boolean; endApproach(): void };
  wild?: { tryStandardWildEncounter(attributes: number): boolean; rockSmashEncounter(): boolean };
  fieldEffectArguments = new Array<number>(8).fill(0);
  battleRunner?: (request: BattleRequest) => Scene;
  readonly weather = {
    setSavedFromHeader: () => {},
    setSaved: (_w: number) => {},
    doCurrent: () => {},
  };
  readonly trades = {
    getSpeciesInfo: () => 0,
    getTradeSpecies: () => 0,
    create: () => {},
    doScene: () => { this.overworld.script.enable(); },
  };
  private accumulator = 0;
  private lastTime = 0;
  frameCount = 0;
  private ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.overworld = new Overworld(this);
    this.scriptMovement = new ScriptMovement(this.overworld);
    this.scriptMenu = new ScriptMenu(() => this.overworld);
    this.battleSetup = new BattleSetup(this);
  }

  setCallbacks(cb1: Callback, cb2: Callback): void {
    this.callback1 = cb1;
    this.callback2 = cb2;
  }

  party(): Pokemon[] {
    return save.party;
  }

  // ---------------------------------------------------------------- loop

  start(): void {
    joy.attach();
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const delta = Math.min(250, now - this.lastTime);
      this.lastTime = now;
      this.accumulator += delta;
      let steps = 0;
      while (this.accumulator >= FRAME_MS && steps < 8) {
        this.accumulator -= FRAME_MS;
        this.frame();
        steps++;
      }
      if (steps >= 8) this.accumulator = 0;
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** One GBA frame: ReadKeys, callback1, callback2, sound. */
  frame(): void {
    joy.poll();
    this.frameCount++;
    save.playTimeFrames++;
    this.callback1?.();
    this.callback2?.();
    sound.frame();
  }

  render(): void {
    if (this.scene) this.scene.render(this.ctx);
    else if (this.overworld.loaded) this.overworld.render(this.ctx);
    else {
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, 240, 160);
    }
  }

  // ---------------------------------------------------------------- new game / continue

  newGame(playerName: string, gender: number, rivalName: string): void {
    const data = newSaveData();
    setSave(data);
    setName("player", encode(playerName.toUpperCase().slice(0, 7)));
    setName("rival", encode(rivalName.toUpperCase().slice(0, 7)));
    save.playerGender = gender;
    save.money = 3000;
    addPCItem(rom.c("ITEM_POTION"), 1);
    this.syncStringVars();
    // WarpToPlayersRoom
    const num = rom.c("MAP_PALLET_TOWN_PLAYERS_HOUSE_2F");
    this.overworld.setWarpDestination(num >> 8, num & 0xff, -1, 6, 6);
    this.overworld.lastUsedWarp = { ...save.location };
    // RunScriptImmediately(EventScript_ResetAllMapFlags)
    this.overworld.script.runImmediately(rom.label("EventScript_ResetAllMapFlags"));
    this.overworld.resetInitialPlayerAvatarState();
    this.overworld.fieldCallback = () => this.overworld.fieldCBWarpExitFadeFromBlack();
    this.overworld.script.init();
    paletteFade.fill(RGB_BLACK);
    this.overworld.warpIntoMapAndLoad();
  }

  continueGame(data: SaveData): void {
    setSave(data);
    textOptions.speed = save.options.textSpeed;
    this.syncStringVars();
    const w = save.location;
    this.overworld.setWarpDestination(w.mapGroup, w.mapNum, -1, save.pos.x, save.pos.y);
    this.overworld.initialAvatar = { direction: save.facing || 1, transitionFlags: save.playerAvatarFlags & 0x0f || 1, hasDirectionSet: true };
    this.overworld.savedMusic = save.savedMusic;
    this.overworld.script.init();
    this.overworld.fieldCallback = () => this.overworld.fieldCBWarpExitFadeFromBlack();
    paletteFade.fill(RGB_BLACK);
    this.overworld.warpIntoMapAndLoad();
  }

  syncStringVars(): void {
    stringVars.player = Uint8Array.from(save.playerName);
    stringVars.rival = Uint8Array.from(save.rivalName);
  }

  writeSave(): boolean {
    const p = this.overworld.player.object;
    save.facing = p?.facingDirection ?? 1;
    save.playerAvatarFlags = this.overworld.player.flags;
    save.savedMusic = this.overworld.savedMusic;
    save.options.textSpeed = textOptions.speed;
    return saveStore.write(save);
  }

  // ---------------------------------------------------------------- start menu

  showStartMenu(): void {
    const ow = this.overworld;
    ow.objects.freezeAll();
    const items: Array<{ text: Uint8Array; desc: string; action: () => void }> = [];
    const c = rom.constants;
    if (flagGet(c.FLAG_SYS_POKEDEX_GET)) items.push({ text: rom.text("gText_MenuPokedex"), desc: "gStartMenuDesc_Pokedex", action: () => this.openPlaceholder("POKéDEX") });
    if (flagGet(c.FLAG_SYS_POKEMON_GET)) items.push({ text: rom.text("gText_MenuPokemon"), desc: "gStartMenuDesc_Pokemon", action: () => this.openPartyMenu() });
    items.push({ text: rom.text("gText_MenuBag"), desc: "gStartMenuDesc_Bag", action: () => this.openBag() });
    items.push({ text: Uint8Array.from(save.playerName), desc: "gStartMenuDesc_Player", action: () => this.openPlaceholder("TRAINER CARD") });
    items.push({ text: rom.text("gText_MenuSave"), desc: "gStartMenuDesc_Save", action: () => this.startMenuSave() });
    items.push({ text: rom.text("gText_MenuOption"), desc: "gStartMenuDesc_Option", action: () => this.openOptions() });
    items.push({ text: rom.text("gText_MenuExit"), desc: "gStartMenuDesc_Exit", action: () => this.closeStartMenu() });
    const window = new Window(22, 1, 7, items.length * 2 - 1);
    window.frame = "std";
    window.frameType = save.options.frameType;
    window.fill(1);
    items.forEach((item, i) => printText(window, FONT_NORMAL, item.text, 8, i * 15));
    ow.windows.add(window);
    const desc = new Window(0, 17, 30, 3);
    desc.frame = "none";
    ow.windows.add(desc);
    const menu = new Menu(window, FONT_NORMAL, 0, 0, 15, items.length, this.startMenuCursor);
    const printDesc = () => {
      desc.fill(15);
      const sym = items[menu.cursorPos].desc;
      if (rom.strings[sym]) printText(desc, FONT_NORMAL, rom.text(sym), 2, 3, { fg: 1, bg: 15, shadow: 2 });
    };
    printDesc();
    this.startMenuWindows = [window, desc];
    const id = tasks.create(() => {
      const before = menu.cursorPos;
      const input = menu.processInput();
      if (menu.cursorPos !== before) printDesc();
      if (input === MENU_NOTHING_CHOSEN) {
        if (JOY_NEW(START_BUTTON)) { tasks.destroy(id); this.closeStartMenu(); }
        return;
      }
      tasks.destroy(id);
      if (input === MENU_B_PRESSED) { this.closeStartMenu(); return; }
      this.startMenuCursor = input;
      items[input].action();
    }, 80);
  }

  private startMenuCursor = 0;
  private startMenuWindows: Window[] = [];

  private removeStartMenuWindows(): void {
    for (const w of this.startMenuWindows) this.overworld.windows.remove(w);
    this.startMenuWindows = [];
  }

  closeStartMenu(): void {
    this.removeStartMenuWindows();
    const ow = this.overworld;
    ow.objects.clearHeldMovementIfFinished(ow.player.object);
    this.scriptMovement.unfreezeAndStop();
    ow.objects.unfreezeAll();
    ow.controlsLocked = false;
  }

  private startMenuSave(): void {
    this.removeStartMenuWindows();
    const ow = this.overworld;
    ow.control.msgIsSignpost = false;
    ow.messageBox.show(rom.text("gText_WouldYouLikeToSaveTheGame"));
    let state = 0;
    const id = tasks.create(() => {
      switch (state) {
        case 0:
          if (ow.messageBox.isHidden()) {
            this.scriptMenu.yesNo(0, 0);
            state = 1;
          }
          break;
        case 1:
          // the yes/no task re-enables the script context; here we poll the result var
          if (varGet(0x800d) !== 0xff) {
            const yes = varGet(0x800d) === 1;
            ow.messageBox.hide();
            if (!yes) { tasks.destroy(id); this.closeStartMenu(); return; }
            const ok = this.writeSave();
            stringVars.var1 = Uint8Array.from(save.playerName);
            ow.messageBox.show(expandPlaceholders(rom.text(ok ? "gText_PlayerSavedTheGame" : "gText_SaveError_PleaseExchangeBackupMemory")));
            if (ok) sound.playSE(sound.c("SE_SAVE"));
            state = 2;
          }
          break;
        case 2:
          if (ow.messageBox.isHidden() && (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON) || ++this.saveWait > 60)) {
            this.saveWait = 0;
            ow.messageBox.hide();
            tasks.destroy(id);
            this.closeStartMenu();
          }
          break;
      }
    }, 80);
  }

  private saveWait = 0;

  // ---------------------------------------------------------------- placeholder screens

  openPlaceholder(title: string): void {
    this.removeStartMenuWindows();
    const ow = this.overworld;
    ow.control.msgIsSignpost = false;
    ow.messageBox.show(encode(`${title}\nThis screen is not ported yet.`));
    const id = tasks.create(() => {
      if (ow.messageBox.isHidden() && (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON))) {
        ow.messageBox.hide();
        tasks.destroy(id);
        this.closeStartMenu();
      }
    }, 80);
  }

  openPartyMenu(): void { this.openPlaceholder("POKéMON"); }
  openBag(): void { this.openPlaceholder("BAG"); }

  openOptions(): void {
    this.removeStartMenuWindows();
    textOptions.speed = (textOptions.speed + 1) % 3;
    save.options.textSpeed = textOptions.speed;
    const ow = this.overworld;
    ow.messageBox.show(encode(`TEXT SPEED: ${["SLOW", "MID", "FAST"][textOptions.speed]}`));
    const id = tasks.create(() => {
      if (ow.messageBox.isHidden() && (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON))) {
        ow.messageBox.hide();
        tasks.destroy(id);
        this.closeStartMenu();
      }
    }, 80);
  }

  useRegisteredKeyItem(): boolean {
    return false;
  }

  shouldEggHatch(): boolean {
    return false;
  }

  // ---------------------------------------------------------------- script-driven screens

  private continueScriptAfterPlaceholder(message: string): void {
    const ow = this.overworld;
    ow.script.stop();
    ow.messageBox.show(encode(message));
    const id = tasks.create(() => {
      if (ow.messageBox.isHidden() && (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON))) {
        ow.messageBox.hide();
        tasks.destroy(id);
        ow.script.enable();
      }
    }, 80);
  }

  choosePartyMon(_mode: string): void {
    // Until the party menu is ported, choose the first Pokémon.
    stringVars.var1 = encode("");
    this.overworld.script.stop();
    (globalThis as unknown as { __fr?: unknown }).__fr = this;
    import("./save").then(({ varSet }) => {
      varSet(0x8004, save.party.length ? 0 : 0xff);
      this.overworld.script.enable();
    });
  }

  changeNickname(_index: number): void { this.overworld.script.enable(); }
  openPokemonStorage(): void { this.continueScriptAfterPlaceholder("POKéMON STORAGE SYSTEM\nis not ported yet."); }
  openPlayerPC(_bedroom: boolean): void { this.continueScriptAfterPlaceholder("PC item storage\nis not ported yet."); }
  showTownMap(): void { this.continueScriptAfterPlaceholder("TOWN MAP\nis not ported yet."); }
  askSaveGame(): void {
    const ow = this.overworld;
    import("./save").then(({ varSet }) => {
      varSet(0x800d, this.writeSave() ? 1 : 0);
      ow.script.enable();
    });
  }
  showDiploma(): void { this.overworld.script.enable(); }
  enterHallOfFame(): void { this.continueScriptAfterPlaceholder("HALL OF FAME\nCongratulations!"); }
  createPokemartMenu(ptr: number): void { this.continueScriptAfterPlaceholder(`POKéMART (${ptr.toString(16)})\nis not ported yet.`); }
  playSlotMachine(_id: number): void { this.overworld.script.enable(); }
  animateFlash(_target: number): void { this.overworld.flashLevel = _target; this.overworld.script.enable(); }
  fieldEffectStart(_id: number): void {}
  setStepCallback(_id: number): void {}
  setMapLayoutIndex(_index: number): void {}
  createVirtualObject(..._args: number[]): void {}
  turnVirtualObject(..._args: number[]): void {}
  animatePc(_on: boolean): void {}
  profOakRating(): number { return 0; }
  tryFieldPoisonWhiteOut(): void {}
  whiteOutMoneyLoss(): void {}

  scriptGiveMon(species: number, level: number, item: number): number {
    const mon = createMon(species, level, { metLocation: this.overworld.header.regionMapSection });
    if (item) mon.heldItem = item;
    const result = giveMonToPlayer(mon);
    setDexFlag(species, true);
    return result;
  }

  scriptGiveEgg(species: number): number {
    const mon = createMon(species, 5);
    mon.isEgg = true;
    mon.friendship = rom.species[species].eggCycles;
    return giveMonToPlayer(mon);
  }

  // ---------------------------------------------------------------- battles

  startBattle(request: BattleRequest): void {
    const ow = this.overworld;
    ow.controlsLocked = true;
    ow.objects.freezeAll();
    this.battleOutcome = 0;
    // Battle transition: fade to black, then run the battle scene.
    paletteFade.fadeScreen(FADE_TO_BLACK, 0);
    const id = tasks.create(() => {
      if (paletteFade.active) return;
      tasks.destroy(id);
      if (this.battleRunner) {
        this.scene = this.battleRunner(request);
        this.setCallbacks(null, () => this.scene?.update());
      } else {
        this.battleOutcome = B_OUTCOME_WON;
        request.onEnd(B_OUTCOME_WON);
      }
    }, 1);
  }

  /** CB2_ReturnToFieldContinueScriptPlayMapMusic */
  returnToFieldContinueScript(playMusic: boolean): void {
    const ow = this.overworld;
    this.scene = null;
    this.setCallbacks(() => ow.cb1(), () => ow.cb2());
    ow.runMapScriptImmediately(7);
    ow.fieldCBContinueScript(playMusic);
    ow.objects.unfreezeAll();
  }

  /** CB2_WhiteOut: respawn at the last heal location. */
  whiteOut(): void {
    const ow = this.overworld;
    this.scene = null;
    save.money = Math.floor(save.money / 2);
    for (const mon of save.party) { mon.hp = mon.stats[0]; mon.status = 0; }
    const heal = save.lastHealLocation.mapGroup === 0xff ? { mapGroup: 4, mapNum: 1, warpId: -1, x: 6, y: 6 } : save.lastHealLocation;
    ow.warpDestination = { ...heal };
    ow.fieldCallback = () => {
      ow.fadeInFromBlack();
      ow.script.setupScript(rom.label("EventScript_AfterWhiteOutHeal"));
    };
    ow.script.init();
    paletteFade.fill(RGB_BLACK);
    ow.warpIntoMapAndLoad();
  }

  fadeFromBlack(): void {
    paletteFade.fadeScreen(FADE_FROM_BLACK, 0);
  }
}

export { TextPrinter, getTextSpeedSetting };
