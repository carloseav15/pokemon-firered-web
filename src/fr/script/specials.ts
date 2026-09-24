// gSpecials: the C functions scripts call through `special`/`specialvar`.
// Each entry mirrors the original field_specials.c (or its home file).

import { sound } from "../audio/sound";
import { decode, encode, stringVars } from "../gba/charmap";
import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { random } from "../random";
import { flagGet, flagSet, save, SV, varGet, varSet } from "../save";
import { MAP_OFFSET } from "../field/fieldmap";
import { LOCALID_CAMERA, OPPOSITE } from "../field/objectEvents";
import * as items from "../pokemon/items";
import { countAliveNonEggMons, dexCount, healMon, leadMonIndex, nickname, setDexFlag, speciesName } from "../pokemon/pokemon";
import type { ScriptRunner } from "./context";
import { isTrainerReadyForRematch, shouldTryRematchBattle, vsSeekerFreezeObjectsAfterChargeComplete, vsSeekerResetObjectMovementAfterChargeComplete } from "../field/vsSeeker";

type Special = (ctx: ScriptRunner) => number | void;

const warned = new Set<string>();

function starterSpecies(index: number): number {
  const c = rom.constants;
  return [c.SPECIES_BULBASAUR, c.SPECIES_SQUIRTLE, c.SPECIES_CHARMANDER][index] ?? c.SPECIES_BULBASAUR;
}

const SPECIALS: Record<string, Special> = {
  NullFieldSpecial: () => 0,
  // union_room.c: wireless link hardware init (RFU/manager/task). There is no
  // link hardware in the browser; the union-room desk simply stays inert.
  InitUnionRoom: () => 0,
  HealPlayerParty: () => { for (const mon of save.party) healMon(mon); },
  GetPlayerFacingDirection: (ctx) => ctx.ow.player.object.facingDirection,
  GetPlayerXY: () => { varSet(SV.x8004, save.pos.x); varSet(SV.x8005, save.pos.y); },
  DrawWholeMapView: (ctx) => { ctx.ow.renderer?.invalidate(); },
  SetHiddenItemFlag: () => { flagSet(varGet(SV.x8004)); },
  GetLeadMonFriendship: () => {
    const f = save.party[leadMonIndex()]?.friendship ?? 0;
    return f === 255 ? 6 : f >= 200 ? 5 : f >= 150 ? 4 : f >= 100 ? 3 : f >= 50 ? 2 : f > 0 ? 1 : 0;
  },
  IsEnoughForCostInVar0x8005: () => (items.isEnoughMoney(varGet(SV.x8005)) ? 1 : 0),
  SubtractMoneyFromVar0x8005: () => { items.removeMoney(varGet(SV.x8005)); },
  GetStarterSpecies: () => starterSpecies(varGet(rom.c("VAR_STARTER_MON"))),
  IsStarterFirstStageInParty: () => (save.party.some((m) => m.species === starterSpecies(varGet(rom.c("VAR_STARTER_MON")))) ? 1 : 0),
  IsThereRoomInAnyBoxForMorePokemon: () => (save.boxes.some((b) => b.some((s) => s === null)) ? 1 : 0),
  SetSeenMon: () => { setDexFlag(varGet(SV.x8004), false); },
  GetPokedexCount: () => {
    const national = varGet(SV.x8004) !== 0;
    varSet(SV.x8005, dexCount(false, !national));
    varSet(SV.x8006, dexCount(true, !national));
    return isNationalDexEnabled() ? 1 : 0;
  },
  IsNationalPokedexEnabled: () => (isNationalDexEnabled() ? 1 : 0),
  EnableNationalPokedex: () => { varSet(rom.c("VAR_NATIONAL_DEX"), 0x6258); flagSet(rom.c("FLAG_SYS_NATIONAL_DEX")); },
  HasAllKantoMons: () => (dexCount(true, true) >= 150 ? 1 : 0),
  HasAllMons: () => (dexCount(true, false) >= 386 ? 1 : 0),
  SetUnlockedPokedexFlags: () => {},
  GetProfOaksRatingMessage: (ctx) => ctx.ow.game.profOakRating(),
  CalculatePlayerPartyCount: () => save.party.length,
  CountPartyNonEggMons: () => save.party.filter((m) => !m.isEgg).length,
  CountPartyAliveNonEggMons_IgnoreVar0x8004Slot: () => countAliveNonEggMons(varGet(SV.x8004)),
  HasEnoughMonsForDoubleBattle: () => (countAliveNonEggMons() >= 2 ? 0 : 1),
  BufferMonNickname: () => { const mon = save.party[varGet(SV.x8004)]; stringVars.var1 = mon ? nickname(mon) : encode(""); },
  GetPartyMonSpecies: () => save.party[varGet(SV.x8004)]?.species ?? 0,
  IsSelectedMonEgg: () => (save.party[varGet(SV.x8004)]?.isEgg ? 1 : 0),
  DoesPlayerPartyContainSpecies: () => (save.party.some((m) => m.species === varGet(SV.x8004)) ? 1 : 0),
  PlayerHasGrassPokemonInParty: () => (save.party.some((m) => !m.isEgg && rom.species[m.species].types.includes(rom.c("TYPE_GRASS"))) ? 1 : 0),
  IsPokerusInParty: () => (save.party.some((m) => m.pokerus & 0xf) ? 1 : 0),
  IsMonOTIDNotPlayers: () => { varSet(SV.RESULT, save.party[varGet(SV.x8004)]?.otId === save.trainerId ? 0 : 1); },
  IsMonOTNameNotPlayers: () => {
    const mon = save.party[varGet(SV.x8004)];
    stringVars.var1 = Uint8Array.from(mon?.otName ?? [0xff]);
    return mon && mon.otName.join(",") === save.playerName.join(",") ? 0 : 1;
  },
  HasLeadMonBeenRenamed: () => {
    const mon = save.party[leadMonIndex()];
    if (!mon) return 0;
    const name = speciesName(mon.species);
    return nickname(mon).join(",") === name.join(",") ? 0 : 1;
  },
  GetPlayerTrainerIdOnesDigit: () => (save.trainerId & 0xffff) % 10,
  BufferBigGuyOrBigGirlString: () => { stringVars.var1 = rom.text(save.playerGender ? "gText_BigGirl" : "gText_BigGuy"); },
  BufferSonOrDaughterString: () => { stringVars.var1 = rom.text(save.playerGender ? "gText_Daughter" : "gText_Son"); },
  SpawnCameraObject: (ctx) => {
    const ow = ctx.ow;
    const template = {
      localId: LOCALID_CAMERA, graphicsId: rom.c("OBJ_EVENT_GFX_YOUNGSTER"), graphicsName: "", x: save.pos.x, y: save.pos.y, elevation: 3,
      movementType: 8, rangeX: 0, rangeY: 0, trainerType: 0, trainerRange: 0, script: 0, scriptName: null, flag: 0,
    };
    const o = ow.objects.spawnFromTemplate(template);
    if (o) {
      o.invisible = true;
      ow.syncObjectSprites();
      ow.cameraTarget = o;
    }
  },
  RemoveCameraObject: (ctx) => {
    const ow = ctx.ow;
    ow.cameraTarget = ow.player.object;
    const o = ow.objects.byLocalId(LOCALID_CAMERA);
    if (o) ow.objects.remove(o);
    ow.syncObjectSprites();
  },
  ShakeScreen: (ctx) => {
    const yTrans = varGet(SV.x8004), xTrans = varGet(SV.x8005), n = varGet(SV.x8006), duration = varGet(SV.x8007);
    let timer = 0;
    let remaining = n;
    let panY = yTrans, panX = xTrans;
    sound.playSE(sound.c("SE_M_STRENGTH"));
    const id = tasks.create(() => {
      timer++;
      if (duration && timer % duration === 0) {
        timer = 0;
        remaining--;
        panX = -panX;
        panY = -panY;
        ctx.ow.panX = panX;
        ctx.ow.panY = panY;
        if (remaining === 0) {
          ctx.ow.panX = 0;
          ctx.ow.panY = 0;
          tasks.destroy(id);
          ctx.ow.script.enable();
        }
      }
    }, 9);
  },
  Script_FacePlayer: (ctx) => {
    const o = ctx.ow.objects.objects[ctx.ow.selectedObject];
    if (o) ctx.ow.objects.turn(o, OPPOSITE[varGet(SV.FACING)]);
  },
  Script_ClearHeldMovement: (ctx) => {
    const o = ctx.ow.objects.objects[ctx.ow.selectedObject];
    if (o) ctx.ow.objects.clearHeldMovementIfActive(o);
  },
  DisableMsgBoxWalkaway: (ctx) => { ctx.ow.control.msgBoxWalkawayDisabled = true; },
  SetWalkingIntoSignVars: (ctx) => { ctx.ow.control.walkAwayInhibitTimer = 6; ctx.ow.control.msgBoxCancelable = true; },
  ShowFieldMessageStringVar4: (ctx) => { ctx.ow.messageBox.show(stringVars.var4); },
  Overworld_PlaySpecialMapMusic: (ctx) => { ctx.ow.playSpecialMapMusic(); },
  Script_FadeOutMapMusic: () => { sound.fadeOutBGM(4); },
  QuestLog_CutRecording: () => {},
  QuestLog_StartRecordingInputsAfterDeferredEvent: () => {},
  SetUsedPkmnCenterQuestLogEvent: () => {},
  GetQuestLogState: () => 0,
  HelpSystem_Enable: () => {},
  HelpSystem_Disable: () => {},
  Script_SetHelpContext: () => {},
  SetHelpContextForMap: () => {},
  BackupHelpContext: () => {},
  RestoreHelpContext: () => {},
  ForcePlayerOntoBike: (ctx) => {
    if (ctx.ow.player.flags & 1) ctx.ow.player.setTransitionFlags(2);
    ctx.ow.savedMusic = rom.c("MUS_CYCLING");
    sound.playNewMapMusic(rom.c("MUS_CYCLING"));
  },
  GetPlayerAvatarBike: (ctx) => ((ctx.ow.player.flags & 2) ? 1 : (ctx.ow.player.flags & 4) ? 2 : 0),
  ForcePlayerToStartSurfing: (ctx) => { ctx.ow.player.setTransitionFlags(8); },
  AnimatePcTurnOn: (ctx) => { ctx.ow.game.animatePc(true); },
  AnimatePcTurnOff: (ctx) => { ctx.ow.game.animatePc(false); },
  SetVermilionTrashCans: () => {
    const first = (random() % 15) + 1;
    const neighbors = first === 1 ? [1, 5]
      : first <= 4 ? [1, 5, -1]
      : first === 5 ? [5, -1]
      : first === 6 ? [-5, 1, 5]
      : first <= 9 ? [-5, 1, 5, -1]
      : first === 10 ? [-5, 5, -1]
      : first === 11 ? [-5, 1]
      : first <= 14 ? [-5, 1, -1]
      : [-5, -1];
    let second = first + neighbors[random() % neighbors.length];
    if (second > 15) second = first + (first % 5 === 0 ? -1 : 1);
    varSet(SV.x8004, first);
    varSet(SV.x8005, second);
  },
  // ---- battles
  ShouldTryRematchBattle: (ctx) => (shouldTryRematchBattle(ctx.ow.game.battleSetup.opponentA) ? 1 : 0),
  IsTrainerReadyForRematch: (ctx) => (isTrainerReadyForRematch(ctx.ow.game.battleSetup.opponentA) ? 1 : 0),
  StartRematchBattle: (ctx) => { ctx.ow.game.battleSetup.startTrainerBattle(true); ctx.ow.script.stop(); },
  VsSeekerFreezeObjectsAfterChargeComplete: (ctx) => { vsSeekerFreezeObjectsAfterChargeComplete(ctx.ow.game); },
  VsSeekerResetObjectMovementAfterChargeComplete: (ctx) => { vsSeekerResetObjectMovementAfterChargeComplete(ctx.ow.game); },
  GetBattleOutcome: (ctx) => ctx.ow.game.battleOutcome,
  GetTrainerBattleMode: (ctx) => ctx.ow.game.battleSetup.mode,
  ShowTrainerIntroSpeech: (ctx) => { ctx.ow.game.battleSetup.showIntroSpeech(); },
  ShowTrainerCantBattleSpeech: (ctx) => { ctx.ow.game.battleSetup.showCantBattleSpeech(); },
  Script_HasTrainerBeenFought: (ctx) => (ctx.ow.game.battleSetup.hasTrainerBeenFought(varGet(SV.x8004)) ? 1 : 0),
  EndTrainerApproach: (ctx) => { ctx.ow.game.trainerSee?.endApproach(); },
  PlayTrainerEncounterMusic: (ctx) => { ctx.ow.game.battleSetup.playEncounterMusic(); },
  SetUpTrainerMovement: (ctx) => { ctx.ow.game.trainerSee.setUpTrainerMovement(); },
  SetBattledTrainerFlag: (ctx) => { ctx.ow.game.battleSetup.setBattledTrainerFlag(); },
  StartLegendaryBattle: (ctx) => { ctx.ow.game.battleSetup.startLegendaryBattle(); },
  StartMarowakBattle: (ctx) => { ctx.ow.game.battleSetup.startMarowakBattle(); },
  StartOldManTutorialBattle: (ctx) => { ctx.ow.game.battleSetup.startOldManTutorialBattle(); },
  StartSouthernIslandBattle: (ctx) => { ctx.ow.game.battleSetup.startLegendaryBattle(); },
  StartRegiBattle: (ctx) => { ctx.ow.game.battleSetup.startLegendaryBattle(); },
  StartGroudonKyogreBattle: (ctx) => { ctx.ow.game.battleSetup.startLegendaryBattle(); },
  RockSmashWildEncounter: (ctx) => { varSet(SV.RESULT, ctx.ow.game.wild?.rockSmashEncounter() ? 1 : 0); },
  CreateEnemyEventMon: (ctx) => { ctx.ow.game.battleSetup.createScriptedWildMon(varGet(SV.x8004), varGet(SV.x8005), varGet(SV.x8006)); },
  TryFieldPoisonWhiteOut: (ctx) => { ctx.ow.game.tryFieldPoisonWhiteOut(); },
  SetCB2WhiteOut: (ctx) => { ctx.ow.game.whiteOut(); },
  OverworldWhiteOutGetMoneyLoss: (ctx) => { ctx.ow.game.whiteOutMoneyLoss(); },
  // ---- menus / screens
  ChoosePartyMon: (ctx) => { ctx.ow.game.choosePartyMon("choose"); },
  ChooseMonForMoveTutor: (ctx) => { ctx.ow.game.choosePartyMon("moveTutor"); },
  ChooseMonForMoveRelearner: (ctx) => { ctx.ow.game.choosePartyMon("relearner"); },
  ChooseSendDaycareMon: (ctx) => { ctx.ow.game.choosePartyMon("choose"); },
  ChangePokemonNickname: (ctx) => { ctx.ow.game.changeNickname(varGet(SV.x8004)); },
  ShowPokemonStorageSystemPC: (ctx) => { ctx.ow.game.openPokemonStorage(); },
  PlayerPC: (ctx) => { ctx.ow.game.openPlayerPC(false); },
  BedroomPC: (ctx) => { ctx.ow.game.openPlayerPC(true); },
  ShowTownMap: (ctx) => { ctx.ow.game.showTownMap(); },
  Field_AskSaveTheGame: (ctx) => { ctx.ow.game.askSaveGame(); },
  ShowDiploma: (ctx) => { ctx.ow.game.showDiploma(); },
  EnterHallOfFame: (ctx) => { ctx.ow.game.enterHallOfFame(); },
  DoCredits: (ctx) => { ctx.ow.game.enterHallOfFame(); },
  HallOfFamePCBeginFade: () => {},
  ListMenu: (ctx) => { ctx.ow.game.scriptMenu.listMenu(); },
  ReturnToListMenu: (ctx) => { ctx.ow.game.scriptMenu.listMenu(); },
  DoPicboxCancel: (ctx) => { ctx.ow.game.scriptMenu.hideMonPic(); },
  CreatePCMenu: (ctx) => { ctx.ow.game.scriptMenu.pcMenu(); },
  // ---- in-game trades
  GetInGameTradeSpeciesInfo: (ctx) => ctx.ow.game.trades.getSpeciesInfo(),
  GetTradeSpecies: (ctx) => ctx.ow.game.trades.getTradeSpecies(),
  CreateInGameTradePokemon: (ctx) => { ctx.ow.game.trades.create(); },
  DoInGameTradeScene: (ctx) => { ctx.ow.game.trades.doScene(); },
  // ---- daycare (Route 5 and Four Island)
  GetDaycareState: () => 0,
  GetDaycarePokemonCount: () => 0,
  IsThereMonInRoute5Daycare: () => 0,
  // ---- misc
  GetElevatorFloor: () => 0,
  InitElevatorFloorSelectMenuPos: () => {},
  DrawElevatorCurrentFloorWindow: () => {},
  CloseElevatorCurrentFloorWindow: () => {},
  AnimateElevator: () => {},
  SetPostgameFlags: () => { flagSet(rom.c("FLAG_SYS_CAN_LINK_WITH_RS")); },
  GetMartClerkObjectId: () => 1,
  GetMagikarpSizeRecordInfo: () => {},
  GetHeracrossSizeRecordInfo: () => {},
  NameRaterWasNicknameChanged: () => {
    const mon = save.party[varGet(SV.x8004)];
    stringVars.var1 = mon ? nickname(mon) : encode("");
    return decode(stringVars.var3) === decode(stringVars.var1) ? 0 : 1;
  },
  UpdateLoreleiDollCollection: () => {},
  IsBadEggInParty: () => 0,
  DoesPartyHaveEnigmaBerry: () => 0,
  IsWirelessAdapterConnected: () => 0,
  ValidateEReaderTrainer: () => 1,
  GetMysteryGiftCardStat: () => 0,
  ValidateSavedWonderCard: () => 0,
  WonderNews_GetRewardInfo: () => 0,
  GetSeagallopNumber: () => varGet(SV.x8004),
  LoopWingFlapSound: () => {},
  CheckAddCoins: () => (save.coins + varGet(SV.x8006) <= items.MAX_COINS ? 1 : 0),
  GetRandomSlotMachineId: () => {
    const indices = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5];
    return indices[random() % indices.length];
  },
  EggHatch: () => {},
  DaisyMassageServices: () => {},
  IsDodrioInParty: () => 0,
  IsPokemonJumpSpeciesInParty: () => 0,
  EnterSafariMode: (ctx) => { flagSet(rom.c("FLAG_SYS_SAFARI_MODE")); ctx.ow.game.safariSteps = 600; ctx.ow.game.safariBalls = 30; },
  ExitSafariMode: (ctx) => { save.flags[rom.c("FLAG_SYS_SAFARI_MODE") >> 3] &= ~(1 << (rom.c("FLAG_SYS_SAFARI_MODE") & 7)); ctx.ow.game.safariSteps = undefined; },
  SetIcefallCaveCrackedIceMetatiles: () => {},
  SeafoamIslandsB4F_CurrentDumpsPlayerOnLand: () => 0,
  IsPlayerLeftOfVermilionSailor: () => (save.pos.x < 24 ? 1 : 0),
  IsPlayerNotInTrainerTowerLobby: () => 1,
  InitRoamer: () => {},
  DoSSAnneDepartureCutscene: () => {},
  DoPokemonLeagueLightingEffect: () => {},
  AnimateTeleporterHousing: () => {},
  AnimateTeleporterCable: () => {},
  OpenMuseumFossilPic: () => {},
  CloseMuseumFossilPic: () => {},
  BufferTMHMMoveName: () => {
    const item = varGet(SV.x8004);
    const index = items.tmhmIndex(item);
    const move = rom.tmhmMoves[index] ?? 0;
    stringVars.var2 = speciesName(0);
    if (move) stringVars.var2 = Uint8Array.from(atob(rom.moves[move].name), (c) => c.charCodeAt(0));
  },
};

export function isNationalDexEnabled(): boolean {
  return varGet(rom.c("VAR_NATIONAL_DEX")) === 0x6258 && flagGet(rom.c("FLAG_SYS_NATIONAL_DEX"));
}

/** Runs a special by name; returns its u16 result when it has one. */
export function runSpecial(ctx: ScriptRunner, name: string | undefined): number | undefined {
  if (!name) return undefined;
  const fn = SPECIALS[name];
  if (!fn) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`special not implemented: ${name}`);
    }
    return 0;
  }
  const result = fn(ctx);
  return typeof result === "number" ? result : undefined;
}

export { MAP_OFFSET };
