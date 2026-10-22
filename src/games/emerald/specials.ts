// pokeemerald gSpecials entries that the Hoenn circuit's scripts call and the FireRed table lacks.
// Installed on the engine with setGameSpecials while Emerald content runs (EngineInteraction).
// Each function keeps its C source file and name.
import { GetSetPokedexFlag } from "@core/pokemon/mon_extra";
import { GetMonData, GetMonEVCount } from "@core/pokemon/mon";
import { GetLeadMonIndex, HoennToNationalOrder } from "@core/pokemon/pokemon";
import { EOS } from "@core/gba/charmap";
import { stringVars } from "@core/gba/stringBuffers";
import { sound } from "@core/audio/sound";
import { tasks } from "@core/gba/tasks";
import { random } from "@core/random";
import type { ScriptRunner } from "@core/script/context";
import * as FR from "@game/generated/constants";
import { flagClear, flagGet, flagSet, GetGameStat, save, SV, varGet, varSet } from "@game/save";
import * as EM from "./generated/constants";
import { save as emSave } from "./save";
import { FinishCyclingRoadChallenge, GetPlayerAvatarBike, GetRecordedCyclingRoadResults, Special_BeginCyclingRoadChallenge, UpdateCyclingRoadState } from "./cyclingRoad";
import { ShouldTryRematchBattle } from "./battleSetup";
import { PlayerFaceTrainerAfterBattle } from "./trainerSee";
import * as Berry from "./berry";

/** pokedex.c HasAllHoennMons: -2 excludes Jirachi and Deoxys. HoennToNationalOrder is the core port of
 * pokemon.c (sHoennToNationalOrder has the same values in pokeemerald and pokefirered). */
function HasAllHoennMons(): boolean {
  for (let i = 0; i < EM.HOENN_DEX_COUNT - 2; i++)
    if (!GetSetPokedexFlag(HoennToNationalOrder(i + 1), EM.FLAG_GET_CAUGHT)) return false;
  return true;
}

/** contest_util.c CountPlayerMuseumPaintings (SaveBlock1.contestWinners). */
function CountPlayerMuseumPaintings(): number {
  let count = 0;
  for (let i = 0; i < EM.NUM_CONTEST_WINNERS - EM.MUSEUM_CONTEST_WINNERS_START; i++)
    if (emSave.contestWinners[EM.MUSEUM_CONTEST_WINNERS_START + i]!.species) count++;
  return count;
}

/** trainer_card.c HasAllFrontierSymbols */
function HasAllFrontierSymbols(): boolean {
  for (let i = 0; i < EM.NUM_FRONTIER_FACILITIES; i++)
    if (!flagGet(EM.FLAG_SYS_TOWER_SILVER + 2 * i) || !flagGet(EM.FLAG_SYS_TOWER_GOLD + 2 * i)) return false;
  return true;
}

/** trainer_card.c CountPlayerTrainerStars */
export function CountPlayerTrainerStars(): number {
  let stars = 0;
  if (GetGameStat(EM.GAME_STAT_ENTERED_HOF)) stars++;
  if (HasAllHoennMons()) stars++;
  if (CountPlayerMuseumPaintings() >= EM.CONTEST_CATEGORIES_COUNT) stars++;
  if (HasAllFrontierSymbols()) stars++;
  return stars;
}

/** field_specials.c PlayerNotAtTrainerHillEntrance */
export function PlayerNotAtTrainerHillEntrance(): number {
  if (save.location.mapGroup === (EM.MAP_TRAINER_HILL_ENTRANCE >> 8) && save.location.mapNum === (EM.MAP_TRAINER_HILL_ENTRANCE & 0xff)) return 0;
  return 1;
}

// GetMonData fields are the ids of the engine's own constants (@game), not Emerald's.

/** field_specials.c FoundBlackGlasses */
function FoundBlackGlasses(): number { return flagGet(EM.FLAG_HIDDEN_ITEM_ROUTE_116_BLACK_GLASSES) ? 1 : 0; }

/** field_specials.c ScriptGetPartyMonSpecies (MON_DATA_SPECIES_OR_EGG) */
function ScriptGetPartyMonSpecies(): number {
  const mon = save.party[varGet(SV.x8004)];
  return mon ? GetMonData(mon, FR.MON_DATA_SPECIES_OR_EGG) : 0;
}

/** field_specials.c ResetSSTidalFlag */
function ResetSSTidalFlag(): void { flagClear(EM.FLAG_SYS_CRUISE_MODE); }

/** field_specials.c SetSSTidalFlag */
function SetSSTidalFlag(): void {
  flagSet(EM.FLAG_SYS_CRUISE_MODE);
  varSet(EM.VAR_CRUISE_STEP_COUNT, 0);
}

/** field_specials.c StorePlayerCoordsInVars */
function StorePlayerCoordsInVars(): void {
  varSet(SV.x8004, save.pos.x);
  varSet(SV.x8005, save.pos.y);
}

/** field_specials.c ResetTrickHouseNuggetFlag / SetTrickHouseNuggetFlag */
function ResetTrickHouseNuggetFlag(): void {
  varSet(SV.x8004, EM.FLAG_HIDDEN_ITEM_TRICK_HOUSE_NUGGET);
  flagClear(EM.FLAG_HIDDEN_ITEM_TRICK_HOUSE_NUGGET);
}
function SetTrickHouseNuggetFlag(): void {
  varSet(SV.x8004, EM.FLAG_HIDDEN_ITEM_TRICK_HOUSE_NUGGET);
  flagSet(EM.FLAG_HIDDEN_ITEM_TRICK_HOUSE_NUGGET);
}

/** field_specials.c FoundAbandonedShipRoom{1,2,4,6}Key: the flag is also left in gSpecialVar_0x8004. */
function FoundAbandonedShipRoomKey(flag: number): number {
  varSet(SV.x8004, flag);
  return flagGet(flag) ? 1 : 0;
}

/** field_specials.c ShouldDistributeEonTicket */
function ShouldDistributeEonTicket(): number { return varGet(EM.VAR_DISTRIBUTE_EON_TICKET) ? 1 : 0; }

/** field_specials.c CheckLeadMon{Beauty,Cool,Cute,Smart,Tough}: contest condition of at least 200. */
function CheckLeadMonCondition(field: number): number {
  return GetMonData(save.party[GetLeadMonIndex()]!, field) < 200 ? 0 : 1;
}

/** field_specials.c GetLeadMonFriendshipScore */
function GetLeadMonFriendshipScore(): number {
  const friendship = GetMonData(save.party[GetLeadMonIndex()]!, FR.MON_DATA_FRIENDSHIP);
  if (friendship === EM.MAX_FRIENDSHIP) return EM.FRIENDSHIP_MAX;
  if (friendship >= 200) return EM.FRIENDSHIP_200_TO_254;
  if (friendship >= 150) return EM.FRIENDSHIP_150_TO_199;
  if (friendship >= 100) return EM.FRIENDSHIP_100_TO_149;
  if (friendship >= 50) return EM.FRIENDSHIP_50_TO_99;
  if (friendship >= 1) return EM.FRIENDSHIP_1_TO_49;
  return EM.FRIENDSHIP_NONE;
}

/** field_specials.c Special_AreLeadMonEVsMaxedOut */
function Special_AreLeadMonEVsMaxedOut(): number {
  return GetMonEVCount(save.party[GetLeadMonIndex()]!) >= EM.MAX_TOTAL_EVS ? 1 : 0;
}

/** field_specials.c IsBadEggInParty */
function IsBadEggInParty(): number {
  for (const mon of save.party) if (GetMonData(mon, FR.MON_DATA_SANITY_IS_BAD_EGG) === 1) return 1;
  return 0;
}

/** string_util.c StringCompare: 0 when both strings are equal up to EOS. */
function StringCompare(first: ArrayLike<number>, second: ArrayLike<number>): number {
  for (let i = 0; (first[i] ?? EOS) === (second[i] ?? EOS); i++) if ((first[i] ?? EOS) === EOS) return 0;
  return 1;
}

/** field_specials.c MonOTNameNotPlayer: foreign-language mons and any OT name other than the player's. */
function MonOTNameNotPlayer(): number {
  const mon = save.party[varGet(SV.x8004)]!;
  if (GetMonData(mon, FR.MON_DATA_LANGUAGE) !== EM.GAME_LANGUAGE) return 1;
  const otName = new Array<number>(FR.PLAYER_NAME_LENGTH + 1).fill(EOS);
  GetMonData(mon, FR.MON_DATA_OT_NAME, otName);
  if (StringCompare(save.playerName, otName) === 0) return 0;
  return 1;
}

/** field_specials.c BufferVarsForIVRater: IV sum, highest-IV stat index and its value (ties by Random() & 1). */
function BufferVarsForIVRater(): void {
  const mon = save.party[varGet(SV.x8004)]!;
  const ivStorage = [
    GetMonData(mon, FR.MON_DATA_HP_IV), GetMonData(mon, FR.MON_DATA_ATK_IV), GetMonData(mon, FR.MON_DATA_DEF_IV),
    GetMonData(mon, FR.MON_DATA_SPEED_IV), GetMonData(mon, FR.MON_DATA_SPATK_IV), GetMonData(mon, FR.MON_DATA_SPDEF_IV),
  ];
  varSet(SV.x8005, 0);
  for (let i = 0; i < EM.NUM_STATS; i++) varSet(SV.x8005, varGet(SV.x8005) + ivStorage[i]!);
  varSet(SV.x8006, 0);
  varSet(SV.x8007, ivStorage[EM.STAT_HP]!);
  for (let i = 1; i < EM.NUM_STATS; i++) {
    const best = varGet(SV.x8006);
    if (ivStorage[best]! < ivStorage[i]!) {
      varSet(SV.x8006, i);
      varSet(SV.x8007, ivStorage[i]!);
    } else if (ivStorage[best] === ivStorage[i]) {
      const randomNumber = random();
      if (randomNumber & 1) {
        varSet(SV.x8006, i);
        varSet(SV.x8007, ivStorage[i]!);
      }
    }
  }
}

/** field_specials.c ShakeCamera / Task_ShakeCamera / StopCameraShake */
function ShakeCamera(ctx: ScriptRunner): void {
  const taskId = tasks.create((id) => Task_ShakeCamera(ctx, id), 9);
  const data = tasks.tasks[taskId].data;
  data[0] = varGet(SV.x8005);
  data[1] = 0;
  data[2] = varGet(SV.x8006);
  data[3] = varGet(SV.x8007);
  data[4] = varGet(SV.x8004);
  ctx.ow.SetCameraPanningCallback(null);
  sound.playSE(sound.c("SE_M_STRENGTH"));
}

function Task_ShakeCamera(ctx: ScriptRunner, taskId: number): void {
  const data = tasks.tasks[taskId].data;
  data[1] = data[1]! + 1;
  if (data[1]! % data[3]! === 0) {
    data[1] = 0;
    data[2] = data[2]! - 1;
    data[0] = -data[0]!;
    data[4] = -data[4]!;
    ctx.ow.SetCameraPanning(data[0]!, data[4]!);
    if (data[2] === 0) {
      tasks.destroy(taskId);
      ctx.ow.script.ScriptContext_Enable();
      ctx.ow.InstallCameraPanAheadCallback();
    }
  }
}

/** field_camera.c DrawWholeMapView: ADAPTATION (equivalence), the canvas renderer composes the visible map
 * from the map grid, so redrawing is invalidating the cached tiles after setmetatile. */
function DrawWholeMapView(ctx: ScriptRunner): void { ctx.ow.renderer?.invalidate(); }

/** pokemon.c CheckPartyPokerus: the selection bits that hold a mon with an active or cured strain (low nibble). */
function CheckPartyPokerus(selection: number): number {
  let retVal = 0, partyIndex = 0, curBit = 1;
  const infected = (index: number) => { const mon = save.party[index]; return !!mon && (GetMonData(mon, FR.MON_DATA_POKERUS) & 0xf) !== 0; };
  if (selection) {
    do {
      if ((selection & 1) && infected(partyIndex)) retVal |= curBit;
      partyIndex++;
      curBit <<= 1;
      selection >>= 1;
    } while (selection);
  } else if (infected(0)) {
    retVal = 1;
  }
  return retVal;
}

/** field_specials.c IsPokerusInParty; gPlayerParty has PARTY_SIZE slots, the empty ones have no strain. */
function IsPokerusInParty(): number {
  return CheckPartyPokerus((1 << EM.PARTY_SIZE) - 1) ? 1 : 0;
}

/** union_room.c sUnionRoomPlayerName: only the wireless Union Room task (Task_InitUnionRoom, link scope)
 * writes it, so it stays empty here and BufferUnionRoomPlayerName returns FALSE. */
const sUnionRoomPlayerName = new Uint8Array([EOS]);

/** union_room.c BufferUnionRoomPlayerName */
function BufferUnionRoomPlayerName(): number {
  if (sUnionRoomPlayerName[0] !== EOS) {
    stringVars.var1 = Uint8Array.from(sUnionRoomPlayerName);
    sUnionRoomPlayerName[0] = EOS;
    return 1;
  }
  return 0;
}

export const EMERALD_SPECIALS = {
  CountPlayerTrainerStars, PlayerNotAtTrainerHillEntrance, UpdateCyclingRoadState,
  Special_BeginCyclingRoadChallenge, FinishCyclingRoadChallenge, GetRecordedCyclingRoadResults, GetPlayerAvatarBike,
  ShouldTryRematchBattle, PlayerFaceTrainerAfterBattle, DrawWholeMapView, IsPokerusInParty, BufferUnionRoomPlayerName,
  ObjectEventInteractionGetBerryTreeData: Berry.ObjectEventInteractionGetBerryTreeData,
  ObjectEventInteractionGetBerryName: Berry.ObjectEventInteractionGetBerryName,
  ObjectEventInteractionGetBerryCountString: Berry.ObjectEventInteractionGetBerryCountString,
  ObjectEventInteractionWaterBerryTree: Berry.ObjectEventInteractionWaterBerryTree,
  ObjectEventInteractionPlantBerryTree: Berry.ObjectEventInteractionPlantBerryTree,
  ObjectEventInteractionPickBerryTree: Berry.ObjectEventInteractionPickBerryTree,
  ObjectEventInteractionRemoveBerryTree: Berry.ObjectEventInteractionRemoveBerryTree,
  PlayerHasBerries: Berry.PlayerHasBerries,
  IncrementDailyPickedBerries: Berry.IncrementDailyPickedBerries,
  IncrementDailyPlantedBerries: Berry.IncrementDailyPlantedBerries,
  FoundBlackGlasses, ScriptGetPartyMonSpecies, ResetSSTidalFlag, SetSSTidalFlag, StorePlayerCoordsInVars,
  ResetTrickHouseNuggetFlag, SetTrickHouseNuggetFlag,
  FoundAbandonedShipRoom1Key: () => FoundAbandonedShipRoomKey(EM.FLAG_HIDDEN_ITEM_ABANDONED_SHIP_RM_1_KEY),
  FoundAbandonedShipRoom2Key: () => FoundAbandonedShipRoomKey(EM.FLAG_HIDDEN_ITEM_ABANDONED_SHIP_RM_2_KEY),
  FoundAbandonedShipRoom4Key: () => FoundAbandonedShipRoomKey(EM.FLAG_HIDDEN_ITEM_ABANDONED_SHIP_RM_4_KEY),
  FoundAbandonedShipRoom6Key: () => FoundAbandonedShipRoomKey(EM.FLAG_HIDDEN_ITEM_ABANDONED_SHIP_RM_6_KEY),
  ShouldDistributeEonTicket,
  CheckLeadMonBeauty: () => CheckLeadMonCondition(FR.MON_DATA_BEAUTY),
  CheckLeadMonCool: () => CheckLeadMonCondition(FR.MON_DATA_COOL),
  CheckLeadMonCute: () => CheckLeadMonCondition(FR.MON_DATA_CUTE),
  CheckLeadMonSmart: () => CheckLeadMonCondition(FR.MON_DATA_SMART),
  CheckLeadMonTough: () => CheckLeadMonCondition(FR.MON_DATA_TOUGH),
  GetLeadMonFriendshipScore, Special_AreLeadMonEVsMaxedOut, IsBadEggInParty, MonOTNameNotPlayer,
  BufferVarsForIVRater, ShakeCamera,
};

/**
 * FireRed gSpecials entries that Emerald content may call: the homonym has the same C body in
 * pokeemerald (refs/emerald/functions.json status "identical" for the function in its home file).
 * Every other FireRed entry differs or has no Emerald counterpart and is not run for Hoenn.
 */
export const FIRERED_SPECIALS_SHARED_WITH_EMERALD: ReadonlySet<string> = new Set([
  'HealPlayerParty', 'GetTrainerBattleMode', 'ShowTrainerCantBattleSpeech', 'HasEnoughMonsForDoubleBattle',
  'CalculatePlayerPartyCount', 'ShowFieldMessageStringVar4', 'SetHiddenItemFlag', 'GetBattleOutcome',
  'ChooseSendDaycareMon', 'ShowDaycareLevelMenu', 'IsEnoughForCostInVar0x8005', 'SubtractMoneyFromVar0x8005',
  'TryFieldPoisonWhiteOut', 'SetCB2WhiteOut', 'GetPlayerFacingDirection', 'Script_FacePlayer',
  'Script_ClearHeldMovement', 'Script_FadeOutMapMusic',
]);
