// gSpecials: the C functions scripts call through `special`/`specialvar`.
// Each entry mirrors the original field_specials.c (or its home file).

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { decode, encode, stringVars } from "../gba/charmap";
import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { random } from "../random";
import { flagGet, flagSet, incrementGameStat, save, SV, varGet, varSet } from "../save";
import { MAP_OFFSET } from "../field/fieldmap";
import { LOCALID_CAMERA, OPPOSITE } from "../field/objectEvents";
import * as items from "../pokemon/items";
import { countAliveNonEggMons, dexCount, hasAllKantoDexSpecies, hasAllNationalDexSpecies, healMon, leadMonIndex, nickname, setDexFlag, speciesName } from "../pokemon/pokemon";
import { GetMonData, GetMonEVCount, SetMonData } from "../pokemon/mon";
import { cdata, hasCData, loadCData } from "../hw/assets";
import type { ScriptRunner } from "./context";
import { EXTRA_SPECIALS } from "./specialsExtra";
import { DAYCARE_SPECIALS, hatchPartyEgg } from "../pokemon/daycare";
import { initRoamer } from "../pokemon/roamer";
import { doSeagallopFerryScene, getSeagallopNumber, getSelectedSeagallopDestination, seagallopDestinationItems } from "../seagallop";
import { isTrainerReadyForRematch, shouldTryRematchBattle, vsSeekerFreezeObjectsAfterChargeComplete, vsSeekerResetObjectMovementAfterChargeComplete } from "../field/vsSeeker";

type Special = (ctx: ScriptRunner) => number | void;

const warned = new Set<string>();

function starterSpecies(index: number): number {
  const c = rom.constants;
  return [c.SPECIES_BULBASAUR, c.SPECIES_SQUIRTLE, c.SPECIES_CHARMANDER][index] ?? c.SPECIES_BULBASAUR;
}

const SPECIALS: Record<string, Special> = {
  ...EXTRA_SPECIALS,
  ...DAYCARE_SPECIALS,
  GetSeagallopNumber: () => getSeagallopNumber(),
  DoSeagallopFerryScene: (ctx) => { doSeagallopFerryScene(ctx.ow.game); },
  DrawSeagallopDestinationMenu: (ctx) => {
    const { labels, numItems, top } = seagallopDestinationItems();
    ctx.ow.game.scriptMenu.customChoice(labels, 17, top, 11, numItems * 2);
  },
  GetSelectedSeagallopDestination: () => getSelectedSeagallopDestination(varGet(SV.RESULT)),
  ShowDaycareLevelMenu: (ctx) => { ctx.ow.game.showDaycareLevelMenu(); },
  EggHatch: (ctx) => { ctx.ow.game.eggHatch(); },
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
  HasAllKantoMons: () => (hasAllKantoDexSpecies() ? 1 : 0),
  HasAllMons: () => (hasAllNationalDexSpecies() ? 1 : 0),
  SetUnlockedPokedexFlags: () => {},
  GetProfOaksRatingMessage: (ctx) => { ctx.ow.game.profOakRating(); },
  CalculatePlayerPartyCount: () => save.party.length,
  CountPartyNonEggMons: () => save.party.filter((m) => !m.isEgg).length,
  CountPartyAliveNonEggMons_IgnoreVar0x8004Slot: () => countAliveNonEggMons(varGet(SV.x8004)),
  HasEnoughMonsForDoubleBattle: () => {
    if (save.party.length === 1) return C.PLAYER_HAS_ONE_MON;
    return countAliveNonEggMons() >= 2
      ? C.PLAYER_HAS_TWO_USABLE_MONS
      : C.PLAYER_HAS_ONE_USABLE_MON;
  },
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
    const o = ow.objects.byLocalIdAndMap(LOCALID_CAMERA, save.location.mapNum, save.location.mapGroup);
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
  Script_FadeOutMapMusic: (ctx) => {
    sound.fadeOutBGM(4);
    const id = tasks.create(() => { if (sound.isBGMPausedOrStopped()) { tasks.destroy(id); ctx.ow.script.enable(); } }, 80);
  },
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
  StartSouthernIslandBattle: (ctx) => { ctx.ow.game.battleSetup.startSouthernIslandBattle(); },
  StartRegiBattle: (ctx) => { ctx.ow.game.battleSetup.startRegiBattle(); },
  StartGroudonKyogreBattle: (ctx) => { ctx.ow.game.battleSetup.startGroudonKyogreBattle(); },
  RockSmashWildEncounter: (ctx) => { varSet(SV.RESULT, ctx.ow.game.wild?.rockSmashEncounter() ? 1 : 0); },
  CreateEnemyEventMon: (ctx) => { ctx.ow.game.battleSetup.createScriptedWildMon(varGet(SV.x8004), varGet(SV.x8005), varGet(SV.x8006)); },
  TryFieldPoisonWhiteOut: (ctx) => { ctx.ow.game.tryFieldPoisonWhiteOut(); },
  SetCB2WhiteOut: (ctx) => { ctx.ow.game.whiteOut(); },
  OverworldWhiteOutGetMoneyLoss: (ctx) => { ctx.ow.game.whiteOutMoneyLoss(); },
  // ---- menus / screens
  ChoosePartyMon: (ctx) => { ctx.ow.game.choosePartyMon("choose"); },
  ChooseMonForMoveTutor: (ctx) => { ctx.ow.game.choosePartyMon("moveTutor"); },
  ChooseMonForMoveRelearner: (ctx) => { ctx.ow.game.choosePartyMon("relearner"); },
  ChooseSendDaycareMon: (ctx) => { ctx.ow.game.choosePartyMon("daycare"); },
  ChangePokemonNickname: (ctx) => { ctx.ow.game.changeNickname(varGet(SV.x8004)); },
  ShowPokemonStorageSystemPC: (ctx) => { ctx.ow.game.openPokemonStorage(); },
  PlayerPC: (ctx) => { ctx.ow.game.openPlayerPC(false); },
  BedroomPC: (ctx) => { ctx.ow.game.openPlayerPC(true); },
  ShowTownMap: (ctx) => { ctx.ow.game.showTownMap(); },
  Field_AskSaveTheGame: (ctx) => { ctx.ow.game.askSaveGame(); },
  ShowDiploma: (ctx) => { ctx.ow.game.showDiploma(); },
  EnterHallOfFame: (ctx) => { ctx.ow.game.enterHallOfFame(); },
  DoCredits: (ctx) => { ctx.ow.game.doCredits(); },
  HallOfFamePCBeginFade: (ctx) => { ctx.ow.game.openHallOfFamePc(); },
  ListMenu: (ctx) => { ctx.ow.game.scriptMenu.listMenu(); },
  ReturnToListMenu: (ctx) => { ctx.ow.game.scriptMenu.returnToListMenu(); },
  DoPicboxCancel: (ctx) => { ctx.ow.game.scriptMenu.hideMonPic(); },
  CreatePCMenu: (ctx) => { ctx.ow.game.scriptMenu.pcMenu(); },
  // ---- in-game trades
  GetInGameTradeSpeciesInfo: (ctx) => ctx.ow.game.trades.getSpeciesInfo(),
  GetTradeSpecies: (ctx) => ctx.ow.game.trades.getTradeSpecies(),
  CreateInGameTradePokemon: (ctx) => { ctx.ow.game.trades.create(); },
  DoInGameTradeScene: (ctx) => { ctx.ow.game.trades.doScene(); },
  // ---- daycare (Route 5 and Four Island)
  // ---- misc
  NameRaterWasNicknameChanged: () => {
    const mon = save.party[varGet(SV.x8004)];
    stringVars.var1 = mon ? nickname(mon) : encode("");
    return decode(stringVars.var3) === decode(stringVars.var1) ? 0 : 1;
  },
  ValidateEReaderTrainer: () => 1,
  GetMysteryGiftCardStat: () => 0,
  ValidateSavedWonderCard: () => 0,
  WonderNews_GetRewardInfo: () => 0,
  CheckAddCoins: () => (save.coins + varGet(SV.x8006) <= items.MAX_COINS ? 1 : 0),
  GetRandomSlotMachineId: () => {
    const indices = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5];
    return indices[random() % indices.length];
  },
  EnterSafariMode: (ctx) => {
    save.gameStats[rom.c("GAME_STAT_ENTERED_SAFARI_ZONE")] = (save.gameStats[rom.c("GAME_STAT_ENTERED_SAFARI_ZONE")] ?? 0) + 1;
    flagSet(rom.c("FLAG_SYS_SAFARI_MODE")); ctx.ow.game.safariSteps = 600; ctx.ow.game.safariBalls = 30;
  },
  ExitSafariMode: (ctx) => { save.flags[rom.c("FLAG_SYS_SAFARI_MODE") >> 3] &= ~(1 << (rom.c("FLAG_SYS_SAFARI_MODE") & 7)); ctx.ow.game.safariSteps = 0; ctx.ow.game.safariBalls = 0; },
  IsPlayerLeftOfVermilionSailor: () => (save.pos.x < 24 ? 1 : 0),
  InitRoamer: () => { initRoamer(); },
  AnimateTeleporterHousing: () => {},
  AnimateTeleporterCable: () => {},
  BufferTMHMMoveName: () => {
    const item = varGet(SV.x8004);
    const index = items.tmhmIndex(item);
    const move = rom.tmhmMoves[index] ?? 0;
    stringVars.var2 = speciesName(0);
    if (move) stringVars.var2 = Uint8Array.from(atob(rom.moves[move].name), (c) => c.charCodeAt(0));
  },
  // ---- effort ribbon / EVs (field_specials.c:393-417)
  LeadMonHasEffortRibbon: () => {
    const mon = save.party[leadMonIndex()];
    if (!mon) return 0;
    return GetMonData(mon, rom.c("MON_DATA_EFFORT_RIBBON")) ? 1 : 0;
  },
  AreLeadMonEVsMaxedOut: () => {
    const mon = save.party[leadMonIndex()];
    if (!mon) return 0;
    return GetMonEVCount(mon) >= (rom.c("MAX_TOTAL_EVS") ?? 510) ? 1 : 0;
  },
  GiveLeadMonEffortRibbon: () => {
    const mon = save.party[leadMonIndex()];
    if (!mon) return;
    incrementGameStat(rom.c("GAME_STAT_RECEIVED_RIBBONS"));
    flagSet(rom.c("FLAG_SYS_RIBBON_GET"));
    SetMonData(mon, rom.c("MON_DATA_EFFORT_RIBBON"), 1);
  },
  // ---- enigma berry (berry.c:984): no enigma-berry storage in the web save,
  // so the checksum check can never pass, matching an empty berry slot.
  IsEnigmaBerryValid: () => 0,
  // ---- bike swap (item.c:458): FireRed only registers the Bicycle, so the
  // Mach/Acro swap is a no-op unless a Mach/Acro bike is registered.
  RegisteredItemHandleBikeSwap: () => {
    const mach = rom.c("ITEM_MACH_BIKE"), acro = rom.c("ITEM_ACRO_BIKE");
    if (save.registeredItem === mach) save.registeredItem = acro;
    else if (save.registeredItem === acro) save.registeredItem = mach;
  },
  // ---- daycare hatch (daycare.c:1675-1678): gSpecialVar_0x8004 holds the party index.
  ScriptHatchMon: (ctx) => { hatchPartyEgg(varGet(SV.x8004), ctx.ow.header.regionMapSection); },
  // ---- cable club save (cable_club.c:621)
  CableClub_AskSaveTheGame: (ctx) => { ctx.ow.game.askSaveGame(); },
  // ---- soft reset (main.c:480): the browser equivalent of a hardware reset.
  DoSoftReset: () => { if (typeof location !== "undefined") location.reload(); },
  // ---- empty scenes in source: field_special_scene.c:25, fldeff_berrytree.c:2
  LookThroughPorthole: () => {},
  DoWateringBerryTreeAnim: () => {},
  // ---- weather/dive visuals without a ported engine: field_weather_effects.c:264
  // has no drought state here, and FireRed has no Dive maps, so these stay inert.
  StartDroughtWeatherBlend: () => {},
  DoDiveWarp: () => {},
  // ---- Deoxys triangle (field_specials.c:2360-2456): var/flag progression is
  // source-accurate; the rock-move field effect (FLDEFF_MOVE_DEOXYS_ROCK) has no
  // port yet, so the object stays while RESULT/vars advance. Palette step is visual-only.
  DoDeoxysTriangleInteraction: () => {
    if (flagGet(rom.c("FLAG_SYS_DEOXYS_AWAKENED"))) return 3;
    const caps = [4, 8, 8, 8, 4, 4, 4, 6, 3, 3]; // sDeoxysStepCaps
    const num = varGet(rom.c("VAR_DEOXYS_INTERACTION_NUM"));
    const steps = varGet(rom.c("VAR_DEOXYS_INTERACTION_STEP_COUNTER"));
    varSet(rom.c("VAR_DEOXYS_INTERACTION_STEP_COUNTER"), 0);
    if (num !== 0 && (caps[num - 1] ?? 0) < steps) {
      varSet(rom.c("VAR_DEOXYS_INTERACTION_NUM"), 0);
      return 0;
    }
    if (num === 10) {
      flagSet(rom.c("FLAG_SYS_DEOXYS_AWAKENED"));
      return 2;
    }
    varSet(rom.c("VAR_DEOXYS_INTERACTION_NUM"), num + 1);
    return 1;
  },
  SetDeoxysTrianglePalette: () => {},
  // ---- easy chat hobby/lifestyle (easy_chat.c:318-323): random enabled word
  // from group 12 (LIFESTYLE) or 13 (HOBBIES) into gStringVar2.
  BufferRandomHobbyOrLifestyleString: () => {
    if (!hasCData("easy_chat", "sEasyChatGroup_Hobbies")) {
      void loadCData("easy_chat").catch(() => undefined);
      const fallback = ["MUSIC", "SPORTS", "READING", "MOVIES", "TRAVEL", "COOKING"];
      stringVars.var2 = encode(fallback[random() % fallback.length]);
      return;
    }
    const group = random() & 1 ? "sEasyChatGroup_Hobbies" : "sEasyChatGroup_Lifestyle";
    const words = cdata<Array<{ text: { $sym: string } }>>("easy_chat", group);
    const word = words[random() % words.length];
    const bytes = cdata<number[]>("easy_chat", word.text.$sym);
    stringVars.var2 = Uint8Array.from(bytes);
  },
  // ---- link save slots (load_save.c:160-220): the web save object is live,
  // so there is nothing to copy between save blocks and battle structs.
  SavePlayerParty: () => {},
  LoadPlayerParty: () => {},
  LoadPlayerBag: () => {},
  // ---- link party selection (script_pokemon_util.c:152-215): no link UI here,
  // so the choice is treated as cancelled (RESULT FALSE, party restored).
  ChooseHalfPartyForBattle: () => 0,
  ChooseBattleTowerPlayerParty: () => 0,
  ReducePlayerPartyToThree: () => {},
  // ---- battle tower (battle_tower.c): the tower engine is not ported; gating
  // checks report a valid party so field scripts continue past the desk.
  CheckPartyBattleTowerBanlist: () => { varSet(SV.x8004, 0); },
  ChooseNextBattleTowerTrainer: () => {},
  DetermineBattleTowerPrize: () => {},
  GiveBattleTowerPrize: () => 0,
  AwardBattleTowerRibbons: () => 0,
  SaveBattleTowerProgress: () => {},
  BattleTowerUtil: () => 0,
  BattleTowerMapScript2: () => {},
  SetBattleTowerParty: () => {},
  SetBattleTowerProperty: () => {},
  // Unlike DoSoftReset, the tower exit must not reload the page.
  BattleTower_SoftReset: () => {},
  Dummy_TryEnableBravoTrainerBattleTower: () => {},
  PrintBattleTowerTrainerGreeting: () => {},
  // ---- trainer tower (trainer_tower.c:438, cereader_tool.c:93): e-Reader data
  // is stubbed FALSE in FireRed itself, so validation always fails here too.
  CallTrainerTowerFunc: () => 0,
  ReadTrainerTowerAndValidate: () => 0,
  // ---- link activities (cable_club.c:532-545,958): no link hardware, report the
  // same LINKUP_CONNECTION_ERROR (6) as an unplugged cable.
  TryContestLinkup: () => 6,
  TryRecordMixLinkup: () => 6,
  StartWiredCableClubTrade: () => 6,
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
