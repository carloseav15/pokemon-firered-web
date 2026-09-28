// The main loop (main.c: CB1/CB2 callbacks at the GBA frame rate) and the
// glue between the field, menus, battles and saving.

import { sound } from "./audio/sound";
import { BattleSetup, B_OUTCOME_WON, type BattleRequest } from "./battle/battleSetup";
import { BattleTransitionScene, GetTrainerBattleTransition, GetWildBattleTransition } from "./battle/transition";
import { concat, encode, expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { FONT_NORMAL, FONT_SMALL, stringWidth } from "./gba/font";
import { paletteFade, FADE_FROM_BLACK, FADE_TO_BLACK, RGB_BLACK } from "./gba/fade";
import { joy, JOY_NEW, A_BUTTON, B_BUTTON, START_BUTTON, ReadKeys } from "./gba/input";
import { tasks } from "./gba/tasks";
import { printText, TextPrinter, getTextSpeedSetting, textOptions } from "./gba/textPrinter";
import { Window } from "./gba/window";
import { Overworld } from "./field/overworld";
import { Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menus/menu";
import { ScriptMenu } from "./menus/scriptMenu";
import { createMon, giveMonToPlayer, setDexFlag, type Pokemon } from "./pokemon/pokemon";
import { rom } from "./rom";
import { ApplyNewEncryptionKeyToGameStats, flagGet, GetGameStat, IncrementGameStat, newSaveData, ResetGameStats, save, saveStore, setName, setSave, SV, varGet, varSet, PlayTimeCounter_Reset, PlayTimeCounter_Start, PlayTimeCounter_Update, type SaveData } from "./save";
import { openHardwareChoice } from "./menus/hardwareChoice";
import { ChooseMonForDaycare, ChooseMonForMoveTutor, gSelectedOrderFromParty, InitChooseMonsForBattle, Task_ChoosePartyMon } from "./partyMenu";
import { GetMoveSlotToReplace, PokemonSummaryScreenMode, ShowPokemonSummaryScreen } from "./pokemonSummaryScreen";
import { computeWhiteOutMoneyLoss, relearnableMoves } from "./pokemon/partyRules";
import { TrainerSee } from "./field/trainerSee";
import { RestartWildEncounterImmunitySteps, WildEncounter } from "./field/wildEncounter";
import { InitPlayerTrainerId, takeWildEncounterSeed } from "./random";
import { tryFieldPoisonWhiteOut } from "./field/poison";
import { healMon } from "./pokemon/pokemon";
import { GetSetPokedexFlag } from "./pokemon/mon_extra";
import { SaveStatToString } from "./saveMenuUtil";
import * as C from "./generated/constants";
import { CB2_BagMenuFromStartMenu, fieldMenu, fieldMessage, openFieldBag, openFieldParty } from "./menus/fieldMenus";
import { openFameChecker, openTeachyTv } from "./menus/keyItemScreens";
import { Task_VsSeeker_0 } from "./field/vsSeeker";
import { GetSafariZoneFlag } from "./field/safariZone";
import { ClearMailData } from "./pokemon/mail";
import { InUnionRoom } from "./unionRoom";
import { FieldWeather } from "./field/weather";
import { StopPokemonLeagueLightingEffectTask } from "./field/leagueLighting";
import { openPlayerPc } from "./menus/playerPc";
import { CreateHelpMessageWindow, DestroyHelpMessageWindow, DrawHelpMessageWindowWithText, PrintTextOnHelpMessageWindow } from "./menus/helpMessage";
import { showDiploma } from "./diploma";
import { DoCredits } from "./credits";
import { BeginHallOfFamePC } from "./hallOfFame";
import { enterHallOfFame } from "./postBattleEventFuncs";
import { createInGameTradePokemon, doInGameTradeScene, getInGameTradeSpeciesInfo, getTradeSpecies } from "./pokemon/ingameTrade";
import { CreateEgg, daycareLevelMenuRows, hatchPartyEgg, shouldEggHatch } from "./pokemon/daycare";
import { openHardwareMessage } from "./menus/hardwareChoice";
import { askMoveRelearnerQuestion, openMoveRelearnerList } from "./menus/moveRelearner";
import { learnMoveWithPrompt } from "./menus/monProgress";
import { checkBagHasItem, ApplyNewEncryptionKeyToBagItems_ } from "./pokemon/items";
import { resetPokemonStorageSystem } from "./pokemon/storage";
import { openStorageMenu } from "./menus/storageMenu";
import { openPokedexScreen } from "./pokedexScreen";
import { openTrainerCardScreen } from "./menus/trainerCard";
import {
  SetUpStartMenu, StartMenuBagCallback, StartMenuExitCallback, StartMenuOptionCallback, StartMenuPlayerCallback,
  StartMenuPokedexCallback, StartMenuPokedexSanityCheck, StartMenuPokemonCallback, StartMenuSafariZoneRetireCallback,
  StartMenuSaveCallback, type StartMenuSetupState,
} from "./startMenu";
import { IsUpdateLinkStateCBActive } from "./linkState";
import { openSlotMachine } from "./menus/slotMachine";
import { ReducePlayerPartyToThree } from "./pokemon/scriptPokemonUtil";
import { ResetBagCursorPositions } from "./bagMenu";
import { ResetTMCaseCursorPos } from "./tmCase";
import { ResetFameChecker } from "./fameChecker";
import { ClearRoamerData } from "./pokemon/roamer";
import { SetAllRenewableItemFlags } from "./renewableHiddenItems";
import { NewGameInitPCItems } from "./menus/playerPc";
import { ResetQLPlayedTheSlots } from "./questLogEvents";
import { setRegionMapSectionProvider } from "./pokemon/mon";
import { HelpSystem_Disable, HelpSystem_Enable } from "./helpSystem";
import { InitEasyChatPhrases } from "./easyChat";
import { ClearEnigmaBerries } from "./pokemon/berry";
import { SaveMapView } from "./field/fieldmap";

/** GetProfOaksRatingMessageByCount (prof_pc.c). */
function GetProfOaksRatingMessageByCount(count: number): Uint8Array {
  varSet(SV.RESULT, 0);
  for (let threshold = 10; threshold < C.KANTO_DEX_COUNT; threshold += 10) {
    if (count < threshold) return rom.text(`PokedexRating_Text_LessThan${threshold}`);
  }
  if (count === C.KANTO_DEX_COUNT - 1) {
    const mewNationalDexNo = rom.species[rom.c("SPECIES_MEW")].national;
    if (GetSetPokedexFlag(mewNationalDexNo, C.FLAG_GET_CAUGHT))
      return rom.text("PokedexRating_Text_LessThan150");
    varSet(SV.RESULT, 1);
    return rom.text("PokedexRating_Text_Complete");
  }
  if (count === C.KANTO_DEX_COUNT) {
    varSet(SV.RESULT, 1);
    return rom.text("PokedexRating_Text_Complete");
  }
  return rom.text("PokedexRating_Text_LessThan10");
}
import { CreatePokemartMenu } from "./shop";
import { openOptionMenu } from "./optionMenu";
import { openRegionMap, REGIONMAP_TYPE_NORMAL, REGIONMAP_TYPE_WALL } from "./regionMap";
import { DoNamingScreen } from "./namingScreen";
import { HwScene } from "./hw/runtime";
import { gender as pokemonGender } from "./pokemon/pokemon";
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
  private nicknameScene: HwScene | null = null;
  battleOutcome = 0;
  safariSteps: number | undefined;
  safariBalls = 0;
  readonly trainerSee: TrainerSee;
  readonly wild: WildEncounter;
  fieldEffectArguments = new Array<number>(8).fill(0);
  battleRunner?: (request: BattleRequest) => Scene;
  /** new_game.c gDifferentSaveFile: preserve a prior save until the new file is confirmed. */
  private differentSaveFile = false;
  readonly weather = new FieldWeather();
  readonly trades = {
    getSpeciesInfo: () => getInGameTradeSpeciesInfo(),
    getTradeSpecies: () => getTradeSpecies(),
    create: () => { createInGameTradePokemon(); },
    doScene: () => {
      const ow = this.overworld;
      ow.script.ScriptContext_Stop();
      fieldMenu(this, (close) => doInGameTradeScene(() => { close(); ow.script.ScriptContext_Enable(); }), false);
    },
  };
  private accumulator = 0;
  private lastTime = 0;
  frameCount = 0;
  private ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.overworld = new Overworld(this);
    setRegionMapSectionProvider(() => this.overworld.header.regionMapSection);
    this.scriptMovement = new ScriptMovement(this.overworld);
    this.scriptMenu = new ScriptMenu(() => this.overworld);
    this.battleSetup = new BattleSetup(this);
    this.wild = new WildEncounter(this);
    this.trainerSee = new TrainerSee(this);
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
    joy.buttonMode = save.options.buttonMode;
    ReadKeys();
    this.frameCount++;
    this.callback1?.();
    this.callback2?.();
    PlayTimeCounter_Update();
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
    this.NewGameInitData(playerName, gender, rivalName);
    setName("player", encode(playerName.slice(0, 7)));
    setName("rival", encode(rivalName.slice(0, 7)));
    this.overworld.resetInitialPlayerAvatarState();
    this.overworld.fieldCallback = () => this.overworld.fieldCBWarpExitFadeFromBlack();
    this.overworld.script.ScriptContext_Init();
    paletteFade.fill(RGB_BLACK);
    PlayTimeCounter_Start();
    this.overworld.warpIntoMapAndLoad();
  }

  /** new_game.c: initialize the modeled SaveBlock state for a new game. */
  NewGameInitData(playerName: string, gender: number, rivalName: string): void {
    ResetQLPlayedTheSlots();
    this.ResetMenuAndMonGlobals();
    this.Sav2_ClearSetDefault();
    this.differentSaveFile = true;
    const data = newSaveData();
    data.trainerId = InitPlayerTrainerId();
    data.playerGender = gender;
    data.playerName = Array.from(encode(playerName.slice(0, 7)));
    data.rivalName = Array.from(encode(rivalName.slice(0, 7)));
    this.ClearPokedexFlags(data);
    this.ClearBattleTower(data);
    data.money = 3000;
    data.registeredItem = 0;
    setSave(data);
    ClearEnigmaBerries();
    ResetGameStats();
    ClearMailData();
    ResetFameChecker();
    this.ResetMiniGamesResults();
    ClearRoamerData();
    resetPokemonStorageSystem();
    NewGameInitPCItems();
    InitEasyChatPhrases(save);
    this.InitHeracrossSizeRecord();
    this.InitMagikarpSizeRecord();
    SetAllRenewableItemFlags();
    PlayTimeCounter_Reset();
    this.wild.seed(takeWildEncounterSeed());
    this.WarpToPlayersRoom();
    this.overworld.script.RunScriptImmediately(rom.label("EventScript_ResetAllMapFlags"));
  }

  /** new_game.c SetDefaultOptions. */
  SetDefaultOptions(): void {
    save.options = { textSpeed: 1, battleScene: true, battleStyle: 0, sound: 0, buttonMode: 0, frameType: 0 };
  }

  /** new_game.c ClearPokedexFlags. */
  ClearPokedexFlags(data: SaveData = save): void {
    data.pokedexCaught.fill(0);
    data.pokedexSeen.fill(0);
  }

  /** new_game.c ClearBattleTower; this port currently models no tower records. */
  ClearBattleTower(data: SaveData = save): void {
    data.battleTower = [];
  }

  /** new_game.c Sav2_ClearSetDefault. A fresh SaveBlock2 is represented by newSaveData. */
  Sav2_ClearSetDefault(): void {
    this.SetDefaultOptions();
  }

  /** new_game.c ResetMiniGamesResults for the records represented by SaveData. */
  ResetMiniGamesResults(): void {
    save.miniGameResults = { berryCrush: [], pokemonJump: [], berryPicking: [], berryPowder: 0 };
    save.berryPowder = 0;
  }

  /** main.c ResetMenuAndMonGlobals, limited to menu state present in this port. */
  ResetMenuAndMonGlobals(): void {
    this.differentSaveFile = false;
    ResetBagCursorPositions();
    ResetTMCaseCursorPos();
  }

  /** new_game.c WarpToPlayersRoom. */
  WarpToPlayersRoom(): void {
    const num = rom.c("MAP_PALLET_TOWN_PLAYERS_HOUSE_2F");
    this.overworld.setWarpDestination(num >> 8, num & 0xff, -1, 6, 6);
    this.overworld.lastUsedWarp = { ...save.location };
  }

  /** CB2_ContinueSavedGame (overworld.c). `data` replaces the C's implicit already-loaded
   * gSaveBlock1Ptr (this port loads the save data explicitly instead of always keeping it
   * resident). */
  continueGame(data: SaveData): void {
    setSave(data);
    this.overworld.restoreMapViewOnNextInit = true;
    this.differentSaveFile = false;
    this.wild.seed(takeWildEncounterSeed());
    // Overworld_ResetStateOnContinue runs before the continue warp is applied.
    this.overworld.Overworld_ResetStateOnContinue();
    // CB2_ContinueSavedGame: UseContinueGameWarp → SetWarpDestinationToContinueGameWarp
    const flags = save as unknown as { continueGameWarpActive?: boolean };
    let usedContinueGameWarp = false;
    if (flags.continueGameWarpActive && save.continueGameWarp.mapGroup !== 0xff) {
      flags.continueGameWarpActive = false;
      this.overworld.SetWarpDestinationToContinueGameWarp();
      save.location = { ...this.overworld.warpDestination };
      save.pos = { x: this.overworld.warpDestination.x, y: this.overworld.warpDestination.y };
      usedContinueGameWarp = true;
    }
    textOptions.speed = save.options.textSpeed;
    joy.buttonMode = save.options.buttonMode;
    sound.setStereo(save.options.sound === 1);
    const w = save.location;
    this.overworld.setWarpDestination(w.mapGroup, w.mapNum, -1, save.pos.x, save.pos.y);
    this.overworld.initialAvatar = { direction: save.facing || 1, transitionFlags: save.playerAvatarFlags & 0x0f || 1, hasDirectionSet: true };
    this.overworld.savedMusic = save.savedMusic;
    this.overworld.script.ScriptContext_Init();
    // The continue-warp branch goes through a plain WarpIntoMap+CB2_LoadMap in the C (no map
    // name popup); the other branch runs FieldCB_ShowMapNameOnContinue first.
    this.overworld.fieldCallback = usedContinueGameWarp
      ? () => this.overworld.fieldCBWarpExitFadeFromBlack()
      : () => this.overworld.FieldCB_ShowMapNameOnContinue();
    paletteFade.fill(RGB_BLACK);
    PlayTimeCounter_Start();
    this.overworld.warpIntoMapAndLoad();
  }
  /** CB2_ContinueSavedGame (overworld.c). */
  CB2_ContinueSavedGame(data: SaveData): void { this.continueGame(data); }

  writeSave(isHallOfFame = false): boolean {
    const p = this.overworld.player.object;
    save.facing = p?.facingDirection ?? 1;
    save.playerAvatarFlags = this.overworld.player.flags;
    save.savedMusic = this.overworld.savedMusic;
    save.options.textSpeed = textOptions.speed;
    SaveMapView(this.overworld.map, save.pos, save.mapView);
    ApplyNewEncryptionKeyToGameStats(save.trainerId);
    ApplyNewEncryptionKeyToBagItems_(save.trainerId);
    const continueFlags = save as SaveData & { continueGameWarpActive?: boolean };
    if (isHallOfFame) {
      if (GetGameStat(C.GAME_STAT_ENTERED_HOF) < 999) IncrementGameStat(C.GAME_STAT_ENTERED_HOF);
    } else {
      this.overworld.SetContinueGameWarpToDynamicWarp(0);
      continueFlags.continueGameWarpActive = true;
    }
    const succeeded = saveStore.write(save);
    if (succeeded && !isHallOfFame) continueFlags.continueGameWarpActive = false;
    return succeeded;
  }

  // ---------------------------------------------------------------- start menu

  showStartMenu(): void {
    const ow = this.overworld;
    ow.objects.freezeAll();
    const c = rom.constants;
    const safari = GetSafariZoneFlag();
    const startMenu: StartMenuSetupState = {
      order: [], numItems: 0,
      pokedexObtained: flagGet(c.FLAG_SYS_POKEDEX_GET),
      pokemonObtained: flagGet(c.FLAG_SYS_POKEMON_GET),
      linkStateActive: IsUpdateLinkStateCBActive(),
      inUnionRoom: InUnionRoom(),
      inSafariZone: safari,
    };
    SetUpStartMenu(startMenu);
    const actions: Array<{ text: Uint8Array; desc: string; action: () => void; canChoose?: () => boolean }> = [
      { text: rom.text("gText_MenuPokedex"), desc: "gStartMenuDesc_Pokedex", action: () => StartMenuPokedexCallback(this), canChoose: StartMenuPokedexSanityCheck },
      { text: rom.text("gText_MenuPokemon"), desc: "gStartMenuDesc_Pokemon", action: () => StartMenuPokemonCallback(this) },
      { text: rom.text("gText_MenuBag"), desc: "gStartMenuDesc_Bag", action: () => StartMenuBagCallback(this) },
      { text: Uint8Array.from(save.playerName), desc: "gStartMenuDesc_Player", action: () => StartMenuPlayerCallback(this) },
      { text: rom.text("gText_MenuSave"), desc: "gStartMenuDesc_Save", action: () => StartMenuSaveCallback(this) },
      { text: rom.text("gText_MenuOption"), desc: "gStartMenuDesc_Option", action: () => StartMenuOptionCallback(this) },
      { text: rom.text("gText_MenuExit"), desc: "gStartMenuDesc_Exit", action: () => StartMenuExitCallback(this) },
      { text: rom.text("gText_MenuRetire"), desc: "gStartMenuDesc_Retire", action: () => StartMenuSafariZoneRetireCallback(this) },
      { text: Uint8Array.from(save.playerName), desc: "gStartMenuDesc_Player", action: () => StartMenuPlayerCallback(this) },
    ];
    const items = startMenu.order.slice(0, startMenu.numItems).map((entry) => actions[entry]!);
    const window = new Window(22, 1, 7, items.length * 2 - 1);
    window.frame = "std";
    window.frameType = save.options.frameType;
    window.fill(1);
    items.forEach((item, i) => printText(window, FONT_NORMAL, item.text, 8, i * 15));
    ow.windows.add(window);
    // DrawHelpMessageWindowWithText (help_message.c).
    const desc = CreateHelpMessageWindow(ow.windows);
    const menu = new Menu(window, FONT_NORMAL, 0, 0, 15, items.length, this.startMenuCursor);
    const printDesc = () => {
      const sym = items[menu.cursorPos].desc;
      DrawHelpMessageWindowWithText(ow.windows, rom.strings[sym] ? rom.text(sym) : [0xff]);
    };
    printDesc();
    this.startMenuWindows = [window, desc];
    if (safari) {
      // DrawSafariZoneStatsWindow
      const stats = new Window(2, 2, 10, 4);
      stats.frame = "std";
      stats.frameType = save.options.frameType;
      stats.fill(1);
      stringVars.var1 = intToDecimal(this.safariSteps ?? 0, STR_CONV_MODE_RIGHT_ALIGN, 3);
      stringVars.var2 = encode("600");
      stringVars.var3 = intToDecimal(this.safariBalls, STR_CONV_MODE_RIGHT_ALIGN, 2);
      printText(stats, FONT_NORMAL, expandPlaceholders(rom.text("gText_MenuSafariStats")), 4, 3);
      ow.windows.add(stats);
      this.startMenuWindows.push(stats);
    }
    // task50_startmenu: DoDrawStartMenu states 0-3, PrintStartMenuItems (two
    // items per frame) and state 5 each take a frame, then
    // Task_StartMenuHandleInput spends one frame in state 0. Only after that
    // does StartCB_HandleInput read JOY_NEW, so the START press that opened
    // the menu cannot also close it. The windows are drawn at once here.
    let drawFrames = 4 + Math.ceil(items.length / 2) + 1 + 1;
    const id = tasks.create(() => {
      if (drawFrames > 0) { drawFrames--; return; }
      const before = menu.cursorPos;
      const input = menu.processInput();
      if (menu.cursorPos !== before) printDesc();
      if (input === MENU_NOTHING_CHOSEN) {
        if (JOY_NEW(START_BUTTON)) { tasks.destroy(id); this.closeStartMenu(); }
        return;
      }
      if (items[input].canChoose?.() === false) return;
      tasks.destroy(id);
      if (input === MENU_B_PRESSED) { this.closeStartMenu(); return; }
      this.startMenuCursor = input;
      items[input].action();
    }, 80);
  }

  private startMenuCursor = 0;
  private startMenuWindows: Window[] = [];

  private removeStartMenuWindows(): void {
    DestroyHelpMessageWindow(this.overworld.windows, 0);
    for (const w of this.startMenuWindows) this.overworld.windows.remove(w);
    this.startMenuWindows = [];
  }

  closeStartMenu(): void {
    this.removeStartMenuWindows();
    const ow = this.overworld;
    ow.objects.ObjectEventClearHeldMovementIfFinished(ow.player.object);
    this.scriptMovement.unfreezeAndStop();
    ow.objects.unfreezeAll();
    ow.controlsLocked = false;
  }

  startMenuSave(): void {
    this.removeStartMenuWindows();
    const ow = this.overworld;
    this.showSaveStats();
    ow.control.MsgSetNotSignpost();
    ow.messageBox.show(rom.text("gText_WouldYouLikeToSaveTheGame"));
    // start_menu.c sSaveDialogCB chain: AskSaveHandleInput -> PrintAskOverwriteText
    // -> AskOverwrite/ReplacePreviousFile -> PrintSavingDontTurnOffPower -> DoSave
    // -> PrintSaveResult -> WaitPrintSuccessAndPlaySE -> ReturnSuccess.
    let state = 0;
    let saveOk = false;
    const cancel = (): void => { tasks.destroy(id); this.closeStartMenu(); };
    const printSavingDontTurnOffPower = (): void => {
      ow.messageBox.hide();
      ow.messageBox.show(rom.text("gText_SavingDontTurnOffThePower"));
      state = 4;
    };
    const id = tasks.create(() => {
      switch (state) {
        case 0:
          if (ow.messageBox.isHidden()) {
            this.scriptMenu.yesNo(0, 0);
            state = 1;
          }
          break;
        case 1: // SaveDialogCB_AskSaveHandleInput
          if (varGet(0x800d) !== 0xff) {
            const yes = varGet(0x800d) === 1;
            ow.messageBox.hide();
            if (!yes) { cancel(); return; }
            if (saveStore.load() || !this.differentSaveFile) {
              // SaveDialogCB_PrintAskOverwriteText
              ow.messageBox.show(rom.text(this.differentSaveFile ? "gText_DifferentGameFile" : "gText_AlreadySaveFile_WouldLikeToOverwrite"));
              state = 2;
            } else printSavingDontTurnOffPower();
          }
          break;
        case 2:
          if (ow.messageBox.isHidden()) {
            // DisplayYesNoMenuDefaultNo for a different file, DefaultYes to overwrite.
            this.scriptMenu.yesNo(0, 0, this.differentSaveFile ? 1 : 0);
            state = 3;
          }
          break;
        case 3: // SaveDialogCB_AskOverwriteOrReplacePreviousFileHandleInput
          if (varGet(0x800d) !== 0xff) {
            const yes = varGet(0x800d) === 1;
            ow.messageBox.hide();
            if (!yes) { cancel(); return; }
            printSavingDontTurnOffPower();
          }
          break;
        case 4: // SaveDialogCB_DoSave + SaveDialogCB_PrintSaveResult
          if (ow.messageBox.isHidden()) {
            saveOk = this.writeSave();
            this.differentSaveFile = false;
            stringVars.var1 = Uint8Array.from(save.playerName);
            ow.messageBox.hide();
            ow.messageBox.show(expandPlaceholders(rom.text(saveOk ? "gText_PlayerSavedTheGame" : "gText_SaveError_PleaseExchangeBackupMemory")));
            this.saveWait = 0;
            state = 5;
          }
          break;
        case 5: // SaveDialogCB_WaitPrintSuccessAndPlaySE: SE once the text is printed
          if (ow.messageBox.isHidden()) {
            if (saveOk) sound.playSE(sound.c("SE_SAVE"));
            state = 6;
          }
          break;
        case 6: // SaveDialogCB_ReturnSuccess: !IsSEPlaying() && (60 frames or A held)
          if (!sound.isSEPlaying() && (++this.saveWait > 60 || (joy.held & A_BUTTON))) {
            this.saveWait = 0;
            ow.messageBox.hide();
            cancel();
          }
          break;
      }
    }, 80);
  }

  /** PrintSaveStats / SaveStatToString (start_menu.c, save_menu_util.c). */
  private showSaveStats(): void {
    const ow = this.overworld;
    const stats = new Window(1, 1, 14, 9);
    stats.frame = "std";
    stats.frameType = save.options.frameType;
    stats.fill(1);

    const location = SaveStatToString(C.SAVE_STAT_LOCATION, 8, ow.header.regionMapSection);
    printText(stats, FONT_NORMAL, location, Math.max(0, (112 - stringWidth(FONT_NORMAL, location)) >> 1), 0);
    const label = (y: number, name: string) => printText(stats, FONT_SMALL, rom.text(name), 2, y);
    const value = (y: number, text: ArrayLike<number>) => printText(stats, FONT_SMALL, text, 60, y);
    label(14, "gSaveStatName_Player");
    value(14, SaveStatToString(C.SAVE_STAT_NAME, 2));

    label(28, "gSaveStatName_Badges");
    value(28, SaveStatToString(C.SAVE_STAT_BADGES, 2));

    let y = 42;
    if (flagGet(rom.c("FLAG_SYS_POKEDEX_GET"))) {
      label(y, "gSaveStatName_Pokedex");
      value(y, SaveStatToString(C.SAVE_STAT_POKEDEX, 2));
      y += 14;
    }

    label(y, "gSaveStatName_Time");
    value(y, SaveStatToString(C.SAVE_STAT_TIME, 2));

    ow.windows.add(stats);
    this.startMenuWindows.push(stats);
  }

  private saveWait = 0;

  // ---------------------------------------------------------------- placeholder screens

  openPlaceholder(title: string): void {
    this.removeStartMenuWindows();
    const ow = this.overworld;
    ow.control.MsgSetNotSignpost();
    ow.messageBox.show(encode(`${title}\nThis screen is not ported yet.`));
    const id = tasks.create(() => {
      if (ow.messageBox.isHidden() && (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON))) {
        ow.messageBox.hide();
        tasks.destroy(id);
        this.closeStartMenu();
      }
    }, 80);
  }

  /** CB2_OpenPokedexFromStartMenu; CB2_ClosePokedex returns with CB2_ReturnToFieldWithOpenMenu. */
  openPokedex(): void {
    StopPokemonLeagueLightingEffectTask();
    this.removeStartMenuWindows();
    fieldMenu(this, (close) => openPokedexScreen(() => { close(); this.showStartMenu(); }), false);
  }
  openTrainerCard(): void {
    StopPokemonLeagueLightingEffectTask();
    this.removeStartMenuWindows();
    fieldMenu(this, (close) => openTrainerCardScreen(() => { close(); this.showStartMenu(); }), false);
  }

  openPartyMenu(): void { StopPokemonLeagueLightingEffectTask(); this.removeStartMenuWindows(); openFieldParty(this); }
  openBag(): void { StopPokemonLeagueLightingEffectTask(); CB2_BagMenuFromStartMenu(this, () => this.removeStartMenuWindows()); }

  /** CB2_OptionsMenuFromStartMenu; savedCallback CB2_ReturnToFieldWithOpenMenu reopens the start menu. */
  openOptions(): void {
    StopPokemonLeagueLightingEffectTask();
    this.removeStartMenuWindows();
    fieldMenu(this, (close) => openOptionMenu(() => { close(); this.showStartMenu(); }), false);
  }

  UseRegisteredKeyItemOnField(): boolean {
    if (InUnionRoom()) return false;
    this.overworld.mapName.DismissMapNamePopup();
    if (save.registeredItem && !checkBagHasItem(save.registeredItem, 1)) save.registeredItem = C.ITEM_NONE;
    if (!save.registeredItem) {
      fieldMessage(this, rom.text("Text_BagItemCanBeRegistered"), () => {});
      return true;
    }
    this.overworld.controlsLocked = true;
    this.overworld.objects.freezeAll();
    this.overworld.player.HandleEnforcedLookDirectionOnPlayerStopMoving();
    this.overworld.player.StopPlayerAvatar();
    openFieldBag(this, save.registeredItem);
    return true;
  }

  useRegisteredKeyItem(): boolean { return this.UseRegisteredKeyItemOnField(); }

  shouldEggHatch(): boolean {
    return shouldEggHatch();
  }

  /** daycare.c ShowDaycareLevelMenu: the two stored mons with their current levels. */
  showDaycareLevelMenu(): void {
    const ow = this.overworld;
    const rows = daycareLevelMenuRows();
    const window = this.scriptMenu.createFramedWindow(11, 0, 17, 5);
    rows.forEach((r, i) => {
      printText(window, FONT_NORMAL, r.name, 8, i * 16 + 1);
      const lv = encode(`Lv${r.level}`);
      printText(window, FONT_NORMAL, lv, 132 - lv.length * 6, i * 16 + 1);
    });
    printText(window, FONT_NORMAL, rom.text("gOtherText_Exit"), 8, 33);
    const menu = new Menu(window, FONT_NORMAL, 0, 1, 16, 3, 0);
    const id = tasks.create(() => {
      const input = menu.processInputNoWrap();
      if (input === MENU_NOTHING_CHOSEN) return;
      varSet(SV.RESULT, input === MENU_B_PRESSED || input === 2 ? C.DAYCARE_EXITED_LEVEL_MENU : input);
      this.scriptMenu.removeWindow(window);
      tasks.destroy(id);
      ow.script.ScriptContext_Enable();
    }, 3);
  }

  /** daycare.c EggHatch (CB2_EggHatch): the hatch, its fanfare and the nickname prompt. */
  eggHatch(): void {
    const ow = this.overworld;
    const index = varGet(SV.x8004);
    hatchPartyEgg(index, ow.header.regionMapSection);
    const mon = save.party[index];
    fieldMenu(this, (close) => {
      sound.playFanfare(rom.c("MUS_EVOLVED"));
      sound.PlayCry_Normal(mon.species, 0);
      stringVars.var1 = Uint8Array.from(mon.nickname);
      openHardwareMessage(rom.text("gText_HatchedFromEgg"), () => {
        stringVars.var1 = Uint8Array.from(mon.nickname);
        openHardwareChoice(rom.text("gText_NickHatchPrompt"), [{ label: "YES", value: 1 }, { label: "NO", value: 0 }], false, (yes) => {
          const done = (): void => { close(); ow.script.ScriptContext_Enable(); };
          if (yes !== 1) { done(); return; }
          DoNamingScreen(C.NAMING_SCREEN_NICKNAME, mon.nickname, mon.species, pokemonGender(mon), mon.personality, done);
        });
      });
    }, false);
  }

  // ---------------------------------------------------------------- script-driven screens

  private continueScriptAfterPlaceholder(message: string): void {
    const ow = this.overworld;
    ow.script.ScriptContext_Stop();
    ow.messageBox.show(encode(message));
    const id = tasks.create(() => {
      if (ow.messageBox.isHidden() && (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON))) {
        ow.messageBox.hide();
        tasks.destroy(id);
        ow.script.ScriptContext_Enable();
      }
    }, 80);
  }

  /** ChoosePartyMon / ChooseMonForMoveTutor / ChooseMonForMoveRelearner / ChooseSendDaycareMon → CB2_ReturnToFieldContinueScriptPlayMapMusic */
  choosePartyMon(mode: string): void {
    this.overworld.script.ScriptContext_Stop();
    const scene = new HwScene();
    scene.enter();
    this.scene = scene;
    this.setCallbacks(null, () => scene.update());
    const exit = (): void => {
      const selected = varGet(SV.x8004);
      if (selected < save.party.length) stringVars.var1 = Uint8Array.from(save.party[selected].nickname);
      scene.leave();
      this.scene = null;
      this.setCallbacks(() => this.overworld.cb1(), () => this.overworld.cb2());
      this.overworld.script.ScriptContext_Enable();
    };
    switch (mode) {
      case "moveTutor": ChooseMonForMoveTutor(exit); break;
      case "relearner": Task_ChoosePartyMon(C.PARTY_MENU_TYPE_MOVE_RELEARNER, exit); break;
      case "daycare": ChooseMonForDaycare(exit); break;
      default: Task_ChoosePartyMon(C.PARTY_MENU_TYPE_CHOOSE_SINGLE_MON, exit); break;
    }
  }

  ChangePokemonNickname(): void {
    const index = varGet(SV.x8004);
    const mon = save.party[index];
    if (!mon || mon.isEgg) { this.overworld.script.ScriptContext_Enable(); return; }
    stringVars.var3 = Uint8Array.from(mon.nickname);
    stringVars.var2 = Uint8Array.from(mon.nickname);
    this.overworld.script.ScriptContext_Stop();
    const scene = new HwScene();
    this.nicknameScene = scene;
    scene.enter();
    this.scene = scene;
    this.setCallbacks(null, () => scene.update());
    DoNamingScreen(C.NAMING_SCREEN_NICKNAME, stringVars.var2, mon.species, pokemonGender(mon), mon.personality, () => this.ChangePokemonNickname_CB());
  }

  /** ChangePokemonNickname_CB from field_specials.c. */
  private ChangePokemonNickname_CB(): void {
    const mon = save.party[varGet(SV.x8004)];
    if (mon) mon.nickname = Array.from(stringVars.var2);
    this.returnFromNicknameScreen();
  }

  private returnFromNicknameScreen(): void {
    this.nicknameScene?.leave();
    this.nicknameScene = null;
    this.scene = null;
    this.setCallbacks(() => this.overworld.cb1(), () => this.overworld.cb2());
    this.overworld.script.ScriptContext_Enable();
  }
  openPokemonStorage(): void { openStorageMenu(this); }
  openPlayerPC(bedroom: boolean): void { openPlayerPc(this, bedroom); }
  /** special ShowTownMap: InitRegionMapWithExitCB(REGIONMAP_TYPE_WALL, CB2_ReturnToFieldContinueScriptPlayMapMusic). */
  showTownMap(): void {
    this.overworld.script.ScriptContext_Stop();
    fieldMenu(this, (close) => openRegionMap(this, REGIONMAP_TYPE_WALL, () => { close(); this.overworld.script.ScriptContext_Enable(); }), false);
  }

  /** Task_UseTownMapFromField: InitRegionMapWithExitCB(REGIONMAP_TYPE_NORMAL, CB2_ReturnToField). */
  showTownMapFromField(): void {
    fieldMenu(this, (close) => openRegionMap(this, REGIONMAP_TYPE_NORMAL, close, true));
  }

  openFameChecker(): void {
    fieldMenu(this, (close) => { void openFameChecker(close); });
  }

  openTeachyTv(done?: () => void): void {
    fieldMenu(this, (close) => openTeachyTv(() => { close(); done?.(); }));
  }

  /** party_menu_specials.c SelectMoveDeleterMove: VAR_0x8005 = move slot, or MAX_MON_MOVES when cancelled. */
  selectMoveDeleterMove(): void {
    const ow = this.overworld;
    const partyIndex = varGet(SV.x8004);
    ow.script.ScriptContext_Stop();
    ShowPokemonSummaryScreen(
      save.party,
      partyIndex,
      save.party.length - 1,
      () => {
        varSet(SV.x8005, GetMoveSlotToReplace());
        ow.script.ScriptContext_Enable();
      },
      PokemonSummaryScreenMode.PSS_MODE_FORGET_MOVE,
    );
  }

  /** learn_move.c TeachMoveRelearnerMove: VAR_0x8004 = TRUE once a move was learned. */
  openMoveRelearner(): void {
    const ow = this.overworld;
    ow.script.ScriptContext_Stop();
    fieldMenu(this, (close) => {
      const mon = save.party[varGet(SV.x8004)];
      const finish = (learned: boolean): void => { varSet(SV.x8004, learned ? 1 : 0); close(); ow.script.ScriptContext_Enable(); };
      if (!mon) { finish(false); return; }
      stringVars.var1 = Uint8Array.from(mon.nickname);
      const moves = relearnableMoves(mon);
      const confirmStop = (): void => {
        stringVars.var1 = Uint8Array.from(mon.nickname);
        askMoveRelearnerQuestion(rom.text("gText_GiveUpTryingToTeachNewMove"), (yes) => {
          if (yes) finish(false); else list();
        });
      };
      const list = (): void => { void openMoveRelearnerList(moves, (i) => {
        if (i === null) { confirmStop(); return; }
        const move = moves[i];
        stringVars.var2 = rom.moveName(move);
        askMoveRelearnerQuestion(rom.text("gText_TeachMoveQues"), (yes) => {
          if (!yes) { list(); return; }
          learnMoveWithPrompt(mon, move, (learned) => { if (learned) finish(true); else list(); }, true);
        });
      }); };
      list();
    }, false);
  }

  /** field_specials.c ChangeBoxPokemonNickname */
  ChangeBoxPokemonNickname(): void {
    const box = varGet(SV.MON_BOX_ID), pos = varGet(SV.MON_BOX_POS);
    const mon = save.boxes[box]?.[pos];
    if (!mon) { this.overworld.script.ScriptContext_Enable(); return; }
    stringVars.var3 = Uint8Array.from(mon.nickname);
    stringVars.var2 = Uint8Array.from(mon.nickname);
    this.overworld.script.ScriptContext_Stop();
    const scene = new HwScene();
    this.nicknameScene = scene;
    scene.enter();
    this.scene = scene;
    this.setCallbacks(null, () => scene.update());
    DoNamingScreen(C.NAMING_SCREEN_NICKNAME, stringVars.var2, mon.species, pokemonGender(mon), mon.personality, () => this.ChangeBoxPokemonNickname_CB());
  }

  /** ChangeBoxPokemonNickname_CB from field_specials.c. */
  private ChangeBoxPokemonNickname_CB(): void {
    const mon = save.boxes[varGet(SV.MON_BOX_ID)]?.[varGet(SV.MON_BOX_POS)];
    if (mon) mon.nickname = Array.from(stringVars.var2);
    this.returnFromNicknameScreen();
  }

  doCredits(): void { this.overworld.script.ScriptContext_Stop(); sound.playNewMapMusic(C.MUS_CREDITS); DoCredits(this); }
  openHallOfFamePc(): void { this.overworld.script.ScriptContext_Stop(); BeginHallOfFamePC(this); }

  /** A field message that resumes the waiting script once dismissed. */
  showMessageThenEnable(text: Uint8Array): void {
    this.overworld.script.ScriptContext_Stop();
    fieldMessage(this, text, () => this.overworld.script.ScriptContext_Enable());
  }

  /** FieldUseFunc_VsSeeker → Task_VsSeeker_0 */
  useVsSeeker(item: number): void {
    const ow = this.overworld;
    const release = (): void => {
      ow.objects.ObjectEventClearHeldMovementIfFinished(ow.player.object);
      ow.objects.unfreezeAll();
      ow.controlsLocked = false;
    };
    Task_VsSeeker_0(this, item, (text, next) => fieldMessage(this, text, next), release);
  }
  askSaveGame(): void {
    const ow = this.overworld;
    import("./save").then(({ varSet }) => {
      varSet(0x800d, this.writeSave() ? 1 : 0);
      ow.script.ScriptContext_Enable();
    });
  }
  showDiploma(): void { showDiploma(this); }
  enterHallOfFame(): void { enterHallOfFame(this); }
  createPokemartMenu(ptr: number): void {
    this.overworld.script.ScriptContext_Stop();
    CreatePokemartMenu(this, ptr);
  }
  playSlotMachine(id: number): void {
    const ow = this.overworld;
    fieldMenu(this, (close) => openSlotMachine(id, () => { close(); ow.script.ScriptContext_Enable(); }), false);
  }
  animateFlash(target: number): void { this.overworld.effects.animateFlash(target, () => this.overworld.script.ScriptContext_Enable()); }
  fieldEffectStart(id: number): void { this.overworld.effects.start(id); }
  setStepCallback(id: number): void { this.overworld.stepCallback.activate(id); }
  /** SetCurrentMapLayout: used from ON_TRANSITION scripts, before InitMap builds the grid. */
  setMapLayoutIndex(index: number): void {
    const ow = this.overworld;
    const id = rom.layoutIdByIndex_(index);
    const layout = id ? rom.cachedLayout(id) : undefined;
    if (!layout || !ow.loaded) return;
    const primary = rom.cachedTileset(layout.primary) ?? ow.loaded.primary;
    const secondary = rom.cachedTileset(layout.secondary) ?? ow.loaded.secondary;
    ow.loaded = { ...ow.loaded, layout, primary, secondary };
  }
  createVirtualObject(graphicsId: number, virtualObjId: number, x: number, y: number, elevation: number, direction: number): void {
    this.overworld.objects.CreateVirtualObject(graphicsId, virtualObjId, x, y, elevation, direction);
  }
  turnVirtualObject(virtualObjId: number, direction: number): void {
    this.overworld.objects.TurnVirtualObject(virtualObjId, direction);
  }
  private pcTurnOnTaskId: number | undefined;
  /** AnimatePcTurnOn (field_specials.c). */
  AnimatePcTurnOn(): void {
    if (this.pcTurnOnTaskId !== undefined && tasks.tasks[this.pcTurnOnTaskId]?.isActive) return;
    const taskId = tasks.create((id) => this.Task_AnimatePcTurnOn(id), 8);
    this.pcTurnOnTaskId = taskId;
    tasks.tasks[taskId].data[0] = 0;
    tasks.tasks[taskId].data[1] = 0;
  }
  /** Task_AnimatePcTurnOn (field_specials.c). */
  private Task_AnimatePcTurnOn(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    if (data[1] === 6) {
      this.PcTurnOnUpdateMetatileId((data[0]! & 1) !== 0);
      this.overworld.renderer?.invalidate();
      data[1] = 0;
      data[0] = data[0]! + 1;
      if (data[0] === 5) {
        tasks.destroy(taskId);
        this.pcTurnOnTaskId = undefined;
      }
    }
    data[1] = data[1]! + 1;
  }
  /** PcTurnOnUpdateMetatileId (field_specials.c). */
  private PcTurnOnUpdateMetatileId(flickerOff: boolean): void {
    const direction = this.overworld.player.object.facingDirection;
    const [dx, dy] = direction === C.DIR_NORTH ? [0, -1]
      : direction === C.DIR_WEST ? [-1, -1]
        : direction === C.DIR_EAST ? [1, -1] : [0, 0];
    const which = varGet(SV.x8004);
    let metatileId = 0;
    if (which === 0) metatileId = rom.c(flickerOff ? "METATILE_Building_PCOff" : "METATILE_Building_PCOn");
    else if (which === 1 || which === 2) metatileId = rom.c(flickerOff ? "METATILE_GenericBuilding1_PlayersPCOff" : "METATILE_GenericBuilding1_PlayersPCOn");
    this.overworld.map.setMetatileIdAt(save.pos.x + dx + 7, save.pos.y + dy + 7, metatileId | 0x0c00);
  }
  /** AnimatePcTurnOff (field_specials.c). */
  AnimatePcTurnOff(): void {
    this.PcTurnOnUpdateMetatileId(true);
    this.overworld.renderer?.invalidate();
  }
  /** prof_pc.c GetProfOaksRatingMessage: shows the rating for VAR_0x8004 caught mons; RESULT = complete. */
  profOakRating(): number {
    this.overworld.messageBox.show(GetProfOaksRatingMessageByCount(varGet(SV.x8004)));
    return varGet(SV.RESULT);
  }
  tryFieldPoisonWhiteOut(): void { tryFieldPoisonWhiteOut(this); }
  whiteOutMoneyLoss(): void { stringVars.var1 = encode(String(computeWhiteOutMoneyLoss())); }

  scriptGiveMon(species: number, level: number, item: number): number {
    const mon = createMon(species, level, { metLocation: this.overworld.header.regionMapSection });
    if (item) mon.heldItem = item;
    const result = giveMonToPlayer(mon);
    if (result === 0 || result === 1) setDexFlag(species, true);
    return result;
  }

  scriptGiveEgg(species: number): number {
    return giveMonToPlayer(CreateEgg(species, true));
  }

  /** pokemon_size_record.c InitHeracrossSizeRecord / new_game.c. */
  InitHeracrossSizeRecord(): void { varSet(C.VAR_HERACROSS_SIZE_RECORD, 0); }

  /** pokemon_size_record.c InitMagikarpSizeRecord / new_game.c. */
  InitMagikarpSizeRecord(): void { varSet(C.VAR_MAGIKARP_SIZE_RECORD, 0); }

  /** script_pokemon_util.c ChooseHalfPartyForBattle. */
  ChooseHalfPartyForBattle(): void {
    InitChooseMonsForBattle(C.CHOOSE_MONS_FOR_CABLE_CLUB_BATTLE, () => this.CB2_ReturnFromChooseHalfParty());
  }

  /** CB2_ReturnFromChooseHalfParty. */
  CB2_ReturnFromChooseHalfParty(): void {
    varSet(SV.RESULT, 0);
    // party-menu selected order is maintained by InitChooseMonsForBattle.
    if (gSelectedOrderFromParty[0] !== 0) varSet(SV.RESULT, 1);
    this.returnToFieldContinueScript(true);
  }

  /** script_pokemon_util.c ChooseBattleTowerPlayerParty. */
  ChooseBattleTowerPlayerParty(): void {
    InitChooseMonsForBattle(C.CHOOSE_MONS_FOR_BATTLE_TOWER, () => this.CB2_ReturnFromChooseBattleTowerParty());
  }

  /** CB2_ReturnFromChooseBattleTowerParty. */
  CB2_ReturnFromChooseBattleTowerParty(): void {
    if (gSelectedOrderFromParty[0] === 0) varSet(SV.RESULT, 0);
    else { ReducePlayerPartyToThree(); varSet(SV.RESULT, 1); }
    this.returnToFieldContinueScript(true);
  }

  // ---------------------------------------------------------------- battles

  startBattle(request: BattleRequest): void {
    if (!this.battleRunner) throw new Error("Battle host has not been installed");
    const ow = this.overworld;
    ow.controlsLocked = true;
    ow.objects.freezeAll();
    this.battleOutcome = 0;
    let transitionDone = false;
    let transition = 0;
    const game = this;
    function Task_BattleStart(taskId: number): void {
      const data = tasks.data(taskId);
      switch (data[0]) {
        case 0: {
          // battle_setup.c waits for FldEffPoison_IsActive before disabling help and starting the transition.
          if (ow.effects.FldEffPoison_IsActive()) return;
          HelpSystem_Disable();
          game.scene = new BattleTransitionScene(transition, game.ctx, () => {
            transitionDone = true;
            Task_BattleStart(taskId);
          });
          data[0]++;
          game.setCallbacks(null, () => game.scene?.update());
          break;
        }
        case 1:
          if (!transitionDone) return;
          HelpSystem_Enable();
          // CleanupOverworldWindowsAndTilemaps is hardware/window cleanup; the Canvas battle host has no equivalent.
          RestartWildEncounterImmunitySteps();
          ow.control.ClearPoisonStepCounter();
          tasks.destroy(taskId);
          if (game.battleRunner) {
            game.scene = game.battleRunner(request);
            game.setCallbacks(null, () => game.scene?.update());
          }
          break;
      }
    }
    function CreateBattleStartTask(transitionType: number, song: number): void {
      transition = transitionType;
      const taskId = tasks.create(Task_BattleStart, 1);
      sound.playBattleBGM(song);
    }
    const transitionType = request.kind === "trainer"
      ? GetTrainerBattleTransition(ow, request.trainerId ?? 0)
      : GetWildBattleTransition(ow, request.enemyParty);
    CreateBattleStartTask(transitionType, this.battleSetup.battleBgm(request));
  }

  /** CB2_ReturnToFieldContinueScript/CB2_ReturnToFieldContinueScriptPlayMapMusic: missing
   * ReloadObjectsAndRunReturnToFieldMapScript's SpawnObjectEventsOnReturnToField(0, 0) step
   * (event_object_movement.c, not ported) before RunOnReturnToFieldMapScript. */
  returnToFieldContinueScript(playMusic: boolean): void {
    const ow = this.overworld;
    this.scene = null;
    this.setCallbacks(() => ow.cb1(), () => ow.cb2());
    ow.RunOnReturnToFieldMapScript();
    if (playMusic) ow.FieldCB_ContinueScriptHandleMusic();
    else ow.FieldCB_ContinueScript();
    ow.objects.unfreezeAll();
  }
  /** CB2_ReturnToFieldContinueScript (overworld.c). */
  CB2_ReturnToFieldContinueScript(): void { this.returnToFieldContinueScript(false); }
  /** CB2_ReturnToFieldContinueScriptPlayMapMusic (overworld.c). */
  CB2_ReturnToFieldContinueScriptPlayMapMusic(): void { this.returnToFieldContinueScript(true); }

  /** CB2_WhiteOut: respawn at the last heal location. */
  whiteOut(): void {
    const ow = this.overworld;
    this.scene = null;
    save.money -= computeWhiteOutMoneyLoss();
    for (const mon of save.party) healMon(mon);
    ow.Overworld_ResetStateAfterWhitingOut();
    const respawn = ow.SetWhiteoutRespawnWarpAndHealerNpc();
    ow.warpDestination = respawn.warp;
    ow.fieldCallback = () => ow.FieldCB_RushInjuredPokemonToCenter();
    ow.script.ScriptContext_Init();
    paletteFade.fill(RGB_BLACK);
    ow.warpIntoMapAndLoad();
  }

  fadeFromBlack(): void {
    paletteFade.fadeScreen(FADE_FROM_BLACK, 0);
  }
}

export { TextPrinter, getTextSpeedSetting };
