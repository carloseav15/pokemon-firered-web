// gSpecials: the C functions scripts call through `special`/`specialvar`.
// Each entry mirrors the original field_specials.c (or its home file).

import * as C from "../generated/constants";
import { BackupHelpContext, HelpSystem_Disable, HelpSystem_Enable, RestoreHelpContext, Script_SetHelpContext, SetHelpContext, SetHelpContextForMap } from "../helpSystem";
import { GetQuestLogState, QuestLog_CutRecording, SetQuestLogEvent } from "../questLogEvents";
import { sound } from "../audio/sound";
import { decode, encode, stringVars } from "../gba/charmap";
import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { random } from "../random";
import { EnableNationalPokedex as enableNationalPokedex, flagGet, flagSet, incrementGameStat, IsNationalPokedexEnabled, save, SV, varGet, varSet } from "../save";
import { MAP_OFFSET } from "../field/fieldmap";
import { LOCALID_CAMERA, OPPOSITE } from "../field/objectEvents";
import * as items from "../pokemon/items";
import { countAliveNonEggMons, GetKantoPokedexCount, GetNationalPokedexCount, GetLeadMonIndex, GetPlayerTrainerId, HasAllKantoMons, HasAllMons, healMon, leadMonIndex, nickname, setDexFlag, speciesName } from "../pokemon/pokemon";
import { GetMonData, GetMonEVCount, SetMonData } from "../pokemon/mon";
import { cdata, hasCData, incbin16, loadCData } from "../hw/assets";
import { ApplyGlobalFieldPaletteTint } from "../field/fieldPalette";
import { LoadPalette, OBJ_PLTT_ID, PLTT_SIZEOF } from "../hw/palette";
import type { ScriptRunner } from "./context";
import { EXTRA_SPECIALS } from "./specialsExtra";
import { DAYCARE_SPECIALS, hatchPartyEgg } from "../pokemon/daycare";
import { initRoamer } from "../pokemon/roamer";
import { doSeagallopFerryScene, getSeagallopNumber, getSelectedSeagallopDestination, seagallopDestinationItems } from "../seagallop";
import { isTrainerReadyForRematch, shouldTryRematchBattle, VsSeekerFreezeObjectsAfterChargeComplete, VsSeekerResetObjectMovementAfterChargeComplete } from "../field/vsSeeker";
import { EnterSafariMode, ExitSafariMode } from "../field/safariZone";
import { GetPlayerAvatarBike, GetPlayerFacingDirection } from "../field/playerAvatar";
import { SetUnlockedPokedexFlags } from "../pokemon/saveLocation";
import { GetMonsStateToDoubles } from "../pokemon/scriptPokemonUtil";
import { AnimateTeleporterCable, AnimateTeleporterHousing } from "../field/specialFieldAnim";
import { ReadTrainerTowerAndValidate } from "../cereaderTool";
import { WonderNews_GetRewardInfo } from "../wonderNews";
import { BufferRandomHobbyOrLifestyleString } from "../easyChat";
import { IsEnigmaBerryValid } from "../pokemon/berry";

type Special = (ctx: ScriptRunner) => number | void;

/** HasMonBeenRenamed from field_specials.c. */
function HasMonBeenRenamed(idx: number): boolean {
  const mon = save.party[idx];
  if (!mon) return false;
  if ((mon.language ?? C.LANGUAGE_ENGLISH) !== C.LANGUAGE_ENGLISH) return true;
  return nickname(mon).join(",") !== speciesName(mon.species).join(",");
}

const warned = new Set<string>();

/** GetStarterSpeciesById (field_specials.c): invalid ids select Bulbasaur. */
function GetStarterSpeciesById(index: number): number {
  const c = rom.constants;
  return [c.SPECIES_BULBASAUR, c.SPECIES_SQUIRTLE, c.SPECIES_CHARMANDER][index] ?? c.SPECIES_BULBASAUR;
}

/** ShakeScreen (field_specials.c). */
function ShakeScreen(ctx: ScriptRunner): void {
  const taskId = tasks.create((id) => Task_ShakeScreen(id, ctx), 9);
  const data = tasks.tasks[taskId].data;
  data[0] = varGet(SV.x8005);
  data[1] = 0;
  data[2] = varGet(SV.x8006);
  data[3] = varGet(SV.x8007);
  data[4] = varGet(SV.x8004);
  ctx.ow.SetCameraPanningCallback(null);
  sound.playSE(sound.c("SE_M_STRENGTH"));
}

/** DoDeoxysTriangleInteraction and task from field_specials.c. */
function DoDeoxysTriangleInteraction(ctx: ScriptRunner): void {
  tasks.create((taskId) => Task_DoDeoxysTriangleInteraction(taskId, ctx), 8);
}

function Task_DoDeoxysTriangleInteraction(taskId: number, ctx: ScriptRunner): void {
  if (flagGet(C.FLAG_SYS_DEOXYS_AWAKENED)) {
    varSet(SV.RESULT, 3);
    ctx.ow.script.ScriptContext_Enable();
    tasks.destroy(taskId);
    return;
  }

  const num = varGet(C.VAR_DEOXYS_INTERACTION_NUM) & 0xffff;
  const steps = varGet(C.VAR_DEOXYS_INTERACTION_STEP_COUNTER) & 0xffff;
  const stepCaps = cdata<number[]>("field_specials", "sDeoxysStepCaps");
  varSet(C.VAR_DEOXYS_INTERACTION_STEP_COUNTER, 0);
  if (num !== 0 && stepCaps[num - 1]! < steps) {
    MoveDeoxysObject(ctx, 0);
    varSet(C.VAR_DEOXYS_INTERACTION_NUM, 0);
    varSet(SV.RESULT, 0);
    tasks.destroy(taskId);
  } else if (num === 10) {
    flagSet(C.FLAG_SYS_DEOXYS_AWAKENED);
    varSet(SV.RESULT, 2);
    ctx.ow.script.ScriptContext_Enable();
    tasks.destroy(taskId);
  } else {
    const next = (num + 1) & 0xffff;
    MoveDeoxysObject(ctx, next);
    varSet(C.VAR_DEOXYS_INTERACTION_NUM, next);
    varSet(SV.RESULT, 1);
    tasks.destroy(taskId);
  }
}

/** MoveDeoxysObject and Task_WaitDeoxysFieldEffect from field_specials.c. */
function MoveDeoxysObject(ctx: ScriptRunner, num: number): void {
  const palettes = incbin16("field_specials.c:sDeoxysObjectPals");
  LoadPalette(palettes.subarray(num * 16, num * 16 + 16), OBJ_PLTT_ID(10), PLTT_SIZEOF(4));
  ApplyGlobalFieldPaletteTint(10);

  const localId = C.LOCALID_BIRTH_ISLAND_EXTERIOR_ROCK;
  const packedMap = rom.mapNum("MAP_BIRTH_ISLAND_EXTERIOR");
  const mapNum = packedMap & 0xff, mapGroup = packedMap >>> 8;
  sound.playSE(sound.c(num === 0 ? "SE_M_CONFUSE_RAY" : "SE_DEOXYS_MOVE"));
  tasks.create((taskId) => Task_WaitDeoxysFieldEffect(taskId, ctx), 8);

  const args = ctx.ow.game.fieldEffectArguments;
  const coords = cdata<number[][]>("field_specials", "sDeoxysCoords")[num]!;
  args[0] = localId;
  args[1] = mapNum;
  args[2] = mapGroup;
  args[3] = coords[0]!;
  args[4] = coords[1]!;
  args[5] = num === 0 ? 60 : 5;
  ctx.ow.effects.start(C.FLDEFF_MOVE_DEOXYS_ROCK);

  const object = ctx.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup);
  if (object) ctx.ow.objects.overrideTemplateCoords(object);
}

function Task_WaitDeoxysFieldEffect(taskId: number, ctx: ScriptRunner): void {
  if (!ctx.ow.effects.active.has(C.FLDEFF_MOVE_DEOXYS_ROCK)) {
    ctx.ow.script.ScriptContext_Enable();
    tasks.destroy(taskId);
  }
}

/** SetDeoxysTrianglePalette from field_specials.c. */
function SetDeoxysTrianglePalette(): void {
  const num = varGet(C.VAR_DEOXYS_INTERACTION_NUM) & 0xff;
  const palettes = incbin16("field_specials.c:sDeoxysObjectPals");
  LoadPalette(palettes.subarray(num * 16, num * 16 + 16), OBJ_PLTT_ID(10), PLTT_SIZEOF(4));
  ApplyGlobalFieldPaletteTint(10);
}

/** FieldSpecialScene_Dummy0-3 and FieldCB_ShowPortholeView (field_special_scene.c): all empty in
 * the source, with no caller anywhere in pokefirered (not script specials themselves). */
function FieldSpecialScene_Dummy0(): number { return 0; }
function FieldSpecialScene_Dummy1(): void {}
function FieldSpecialScene_Dummy2(): void {}
function FieldSpecialScene_Dummy3(): void {}
export function FieldCB_ShowPortholeView(): void {}

/** SetUsedPkmnCenterQuestLogEvent (field_specials.c): this event has no payload. */
function SetUsedPkmnCenterQuestLogEvent(): void {
  SetQuestLogEvent(C.QL_EVENT_USED_PKMN_CENTER, {});
}

/** Task_ShakeScreen (field_specials.c). */
function Task_ShakeScreen(taskId: number, ctx: ScriptRunner): void {
  const data = tasks.tasks[taskId].data;
  data[1] = data[1]! + 1;
  if (data[1]! % data[3]! === 0) {
    data[1] = 0;
    data[2] = data[2]! - 1;
    data[0] = -data[0]!;
    data[4] = -data[4]!;
    ctx.ow.SetCameraPanning(data[0]!, data[4]!);
    if (data[2] === 0) {
      Task_EndScreenShake(taskId, ctx);
      ctx.ow.InstallCameraPanAheadCallback();
    }
  }
}

/** Task_EndScreenShake (field_specials.c). */
function Task_EndScreenShake(taskId: number, ctx: ScriptRunner): void {
  tasks.destroy(taskId);
  ctx.ow.script.ScriptContext_Enable();
}

/** Task_EnableScriptAfterMusicFade from field_screen_effect.c. */
function Task_EnableScriptAfterMusicFade(taskId: number, ctx: ScriptRunner): void {
  if (sound.isBGMPausedOrStopped()) {
    tasks.destroy(taskId);
    ctx.ow.script.ScriptContext_Enable();
  }
}

export const SPECIALS: Record<string, Special> = {
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
  GetPlayerFacingDirection: () => GetPlayerFacingDirection(),
  GetPlayerXY: () => { varSet(SV.x8004, save.pos.x); varSet(SV.x8005, save.pos.y); },
  DrawWholeMapView: (ctx) => { ctx.ow.renderer?.invalidate(); },
  SetHiddenItemFlag: () => { flagSet(varGet(SV.x8004)); },
  GetLeadMonFriendship: () => {
    const f = save.party[leadMonIndex()]?.friendship ?? 0;
    return f === 255 ? 6 : f >= 200 ? 5 : f >= 150 ? 4 : f >= 100 ? 3 : f >= 50 ? 2 : f > 0 ? 1 : 0;
  },
  IsEnoughForCostInVar0x8005: () => (items.isEnoughMoney(varGet(SV.x8005)) ? 1 : 0),
  SubtractMoneyFromVar0x8005: () => { items.removeMoney(varGet(SV.x8005)); },
  GetStarterSpecies: () => GetStarterSpeciesById(varGet(rom.c("VAR_STARTER_MON"))),
  IsStarterFirstStageInParty: () => (save.party.some((m) => m.species === GetStarterSpeciesById(varGet(rom.c("VAR_STARTER_MON")))) ? 1 : 0),
  IsThereRoomInAnyBoxForMorePokemon: () => (save.boxes.some((b) => b.some((s) => s === null)) ? 1 : 0),
  SetSeenMon: () => { setDexFlag(varGet(SV.x8004), false); },
  GetPokedexCount: () => {
    const national = varGet(SV.x8004) !== 0;
    varSet(SV.x8005, national ? GetNationalPokedexCount(C.FLAG_GET_SEEN) : GetKantoPokedexCount(C.FLAG_GET_SEEN));
    varSet(SV.x8006, national ? GetNationalPokedexCount(C.FLAG_GET_CAUGHT) : GetKantoPokedexCount(C.FLAG_GET_CAUGHT));
    return isNationalDexEnabled() ? 1 : 0;
  },
  IsNationalPokedexEnabled: () => (isNationalDexEnabled() ? 1 : 0),
  EnableNationalPokedex: () => { enableNationalPokedex(); },
  HasAllKantoMons: () => (HasAllKantoMons() ? 1 : 0),
  HasAllMons: () => (HasAllMons() ? 1 : 0),
  SetUnlockedPokedexFlags: () => { SetUnlockedPokedexFlags(); },
  GetProfOaksRatingMessage: (ctx) => { ctx.ow.game.profOakRating(); },
  CalculatePlayerPartyCount: () => save.party.length,
  CountPartyNonEggMons: () => save.party.filter((m) => !m.isEgg).length,
  CountPartyAliveNonEggMons_IgnoreVar0x8004Slot: () => countAliveNonEggMons(varGet(SV.x8004)),
  HasEnoughMonsForDoubleBattle: () => { varSet(SV.RESULT, GetMonsStateToDoubles()); },
  ChooseHalfPartyForBattle: (ctx) => { ctx.ow.game.ChooseHalfPartyForBattle(); },
  ChooseBattleTowerPlayerParty: (ctx) => { ctx.ow.game.ChooseBattleTowerPlayerParty(); },
  BufferMonNickname: () => { const mon = save.party[varGet(SV.x8004)]; stringVars.var1 = mon ? nickname(mon) : encode(""); },
  GetPartyMonSpecies: () => save.party[varGet(SV.x8004)]?.species ?? 0,
  IsSelectedMonEgg: () => (save.party[varGet(SV.x8004)]?.isEgg ? 1 : 0),
  DoesPlayerPartyContainSpecies: () => (save.party.some((m) => m.species === varGet(SV.x8004)) ? 1 : 0),
  PlayerHasGrassPokemonInParty: () => (save.party.some((m) => !m.isEgg && rom.species[m.species].types.includes(rom.c("TYPE_GRASS"))) ? 1 : 0),
  IsPokerusInParty: () => (save.party.some((m) => m.pokerus & 0xf) ? 1 : 0),
  IsMonOTIDNotPlayers: () => { varSet(SV.RESULT, GetPlayerTrainerId() === save.party[varGet(SV.x8004)]?.otId ? 0 : 1); },
  IsMonOTNameNotPlayers: () => {
    const mon = save.party[varGet(SV.x8004)];
    stringVars.var1 = Uint8Array.from(mon?.otName ?? [0xff]);
    return mon && mon.otName.join(",") === save.playerName.join(",") ? 0 : 1;
  },
  HasLeadMonBeenRenamed: () => {
    return HasMonBeenRenamed(GetLeadMonIndex()) ? 1 : 0;
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
  ShakeScreen,
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
    sound.fadeOutMapMusic(4);
    tasks.create((id) => Task_EnableScriptAfterMusicFade(id, ctx), 80);
  },
  QuestLog_CutRecording: () => { QuestLog_CutRecording(); },
  GetQuestLogState: () => { varSet(SV.RESULT, GetQuestLogState()); },
  HelpSystem_Enable: () => { HelpSystem_Enable(); },
  HelpSystem_Disable: () => { HelpSystem_Disable(); },
  Script_SetHelpContext: () => { Script_SetHelpContext(varGet(SV.x8004)); },
  SetHelpContextForMap: (ctx) => { SetHelpContextForMap(ctx.ow); },
  BackupHelpContext: () => { BackupHelpContext(); },
  RestoreHelpContext: () => { RestoreHelpContext(); },
  ForcePlayerOntoBike: (ctx) => {
    if (ctx.ow.player.flags & 1) ctx.ow.player.setTransitionFlags(2);
    ctx.ow.savedMusic = rom.c("MUS_CYCLING");
    sound.playNewMapMusic(rom.c("MUS_CYCLING"));
  },
  GetPlayerAvatarBike: (ctx) => GetPlayerAvatarBike(ctx.ow.player.flags),
  ForcePlayerToStartSurfing: (ctx) => { SetHelpContext(C.HELPCONTEXT_SURFING); ctx.ow.player.setTransitionFlags(C.PLAYER_AVATAR_FLAG_SURFING); },
  AnimatePcTurnOn: (ctx) => { ctx.ow.game.AnimatePcTurnOn(); },
  AnimatePcTurnOff: (ctx) => { ctx.ow.game.AnimatePcTurnOff(); },
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
  StartRematchBattle: (ctx) => { ctx.ow.game.battleSetup.startTrainerBattle(true); ctx.ow.script.ScriptContext_Stop(); },
  VsSeekerFreezeObjectsAfterChargeComplete: (ctx) => { VsSeekerFreezeObjectsAfterChargeComplete(ctx.ow.game); },
  VsSeekerResetObjectMovementAfterChargeComplete: (ctx) => { VsSeekerResetObjectMovementAfterChargeComplete(ctx.ow.game); },
  GetBattleOutcome: (ctx) => ctx.ow.game.battleOutcome,
  GetTrainerBattleMode: (ctx) => ctx.ow.game.battleSetup.mode,
  ShowTrainerIntroSpeech: (ctx) => { ctx.ow.game.battleSetup.ShowTrainerIntroSpeech(); },
  ShowTrainerCantBattleSpeech: (ctx) => { ctx.ow.game.battleSetup.ShowTrainerCantBattleSpeech(); },
  Script_HasTrainerBeenFought: (ctx) => (ctx.ow.game.battleSetup.Script_HasTrainerBeenFought() ? 1 : 0),
  EndTrainerApproach: (ctx) => { ctx.ow.game.trainerSee?.endApproach(); },
  PlayTrainerEncounterMusic: (ctx) => { ctx.ow.game.battleSetup.playEncounterMusic(); },
  SetUpTrainerMovement: (ctx) => { ctx.ow.game.trainerSee.setUpTrainerMovement(); },
  SetBattledTrainerFlag: (ctx) => { ctx.ow.game.battleSetup.SetBattledTrainerFlag(); },
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
  ChangePokemonNickname: (ctx) => { ctx.ow.game.ChangePokemonNickname(); },
  ShowPokemonStorageSystemPC: (ctx) => { ctx.ow.game.openPokemonStorage(); },
  PlayerPC: (ctx) => { ctx.ow.game.openPlayerPC(false); },
  BedroomPC: (ctx) => { ctx.ow.game.openPlayerPC(true); },
  ShowTownMap: (ctx) => { ctx.ow.game.showTownMap(); },
  Field_AskSaveTheGame: (ctx) => { ctx.ow.game.askSaveGame(); },
  ShowDiploma: (ctx) => { ctx.ow.game.showDiploma(); },
  EnterHallOfFame: (ctx) => { ctx.ow.game.enterHallOfFame(); },
  DoCredits: (ctx) => { ctx.ow.game.doCredits(); },
  HallOfFamePCBeginFade: (ctx) => { ctx.ow.game.openHallOfFamePc(); },
  ListMenu: (ctx) => { ctx.ow.game.scriptMenu.ListMenu(); },
  ReturnToListMenu: (ctx) => { ctx.ow.game.scriptMenu.returnToListMenu(); },
  DoPicboxCancel: (ctx) => { ctx.ow.game.scriptMenu.PicboxCancel(); },
  CreatePCMenu: (ctx) => (ctx.ow.game.scriptMenu.CreatePCMenu() ? 1 : 0),
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
  WonderNews_GetRewardInfo: () => WonderNews_GetRewardInfo(),
  CheckAddCoins: () => (save.coins + varGet(SV.x8006) <= items.MAX_COINS ? 1 : 0),
  GetRandomSlotMachineId: () => {
    const indices = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5];
    return indices[random() % indices.length];
  },
  EnterSafariMode: (ctx) => {
    EnterSafariMode(ctx.ow.game);
  },
  ExitSafariMode: (ctx) => { ExitSafariMode(ctx.ow.game); },
  IsPlayerLeftOfVermilionSailor: () => (save.pos.x < 24 ? 1 : 0),
  InitRoamer: () => { initRoamer(); },
  AnimateTeleporterHousing: (ctx) => { AnimateTeleporterHousing(ctx.ow, varGet(SV.x8004)); },
  AnimateTeleporterCable: (ctx) => { AnimateTeleporterCable(ctx.ow); },
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
  // ---- enigma berry (berry.c:984)
  IsEnigmaBerryValid: () => IsEnigmaBerryValid() ? 1 : 0,
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
  // ---- weather visual without the ported drought layer: field_weather_effects.c:264.
  StartDroughtWeatherBlend: () => {},
  // ---- Deoxys triangle (field_specials.c:2360-2456).
  DoDeoxysTriangleInteraction: (ctx) => { DoDeoxysTriangleInteraction(ctx); },
  SetDeoxysTrianglePalette: () => { SetDeoxysTrianglePalette(); },
  SetUsedPkmnCenterQuestLogEvent: () => { SetUsedPkmnCenterQuestLogEvent(); },
  // ---- easy chat hobby/lifestyle (easy_chat.c:318-323): random enabled word
  // from group 12 (LIFESTYLE) or 13 (HOBBIES) into gStringVar2.
  BufferRandomHobbyOrLifestyleString,
  // ---- battle tower (battle_tower.c): the tower engine is not ported; gating
  // checks report a valid party so field scripts continue past the desk.
  CheckPartyBattleTowerBanlist: () => { varSet(SV.x8004, 0); },
  GiveBattleTowerPrize: () => 0,
  AwardBattleTowerRibbons: () => 0,
  BattleTowerUtil: () => 0,
  // ---- trainer tower (trainer_tower.c:438, cereader_tool.c:93): e-Reader data
  // is stubbed FALSE in FireRed itself, so validation always fails here too.
  CallTrainerTowerFunc: () => 0,
  ReadTrainerTowerAndValidate: () => (ReadTrainerTowerAndValidate() ? 1 : 0),
  // ---- link activities (cable_club.c:532-545,958): no link hardware, report the
  // same LINKUP_CONNECTION_ERROR (6) as an unplugged cable.
  TryContestLinkup: () => 6,
  TryRecordMixLinkup: () => 6,
  StartWiredCableClubTrade: () => 6,
};

export function isNationalDexEnabled(): boolean {
  return IsNationalPokedexEnabled();
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
