// pokeemerald gSpecials entries that the Hoenn circuit's scripts call and the FireRed table lacks.
// Installed on the engine with setGameSpecials while Emerald content runs (EngineInteraction).
// Each function keeps its C source file and name.
import { GetSetPokedexFlag } from "@core/pokemon/mon_extra";
import { GetMonData, GetMonEVCount, GetNature, SetMonData } from "@core/pokemon/mon";
import { GetPCBoxToSendMon as GetPCBoxToSendMon_, shouldShowBoxWasFullMessage } from "@core/pokemon/storage";
import { cdata } from "@core/hw/assets";
import { rom } from "@core/rom";
import { GetPlayerTrainerId } from "@core/pokemon/pokemon";
import { createMon, GetLeadMonIndex, HoennToNationalOrder } from "@core/pokemon/pokemon";
import { StringGet_Nickname } from "@core/gba/charmap";
import { EOS } from "@core/gba/charmap";
import { stringVars } from "@core/gba/stringBuffers";
import { sound } from "@core/audio/sound";
import { tasks } from "@core/gba/tasks";
import { MAP_OFFSET, MapGridSetMetatileIdAt } from "@core/field/fieldmap";
import { GetPlayerFacingDirection } from "@core/field/playerAvatar";
import { random } from "@core/random";
import type { ScriptRunner } from "@core/script/context";
import type { Pokemon } from "@core/pokemon/pokemon";
import * as FR from "@game/generated/constants";
import { flagClear, flagGet, flagSet, GetGameStat, incrementGameStat, save, SV, varGet, varSet } from "@game/save";
import * as EM from "./generated/constants";
import { save as emSave } from "./save";
import { FinishCyclingRoadChallenge, GetPlayerAvatarBike, GetRecordedCyclingRoadResults, Special_BeginCyclingRoadChallenge, UpdateCyclingRoadState } from "./cyclingRoad";
import { GetRematchIdxByTrainerIdx, IsTrainerReadyForRematch, ShouldTryRematchBattle } from "./battleSetup";
import { gLocalTime } from "./clock";
import { PlayerFaceTrainerAfterBattle } from "./trainerSee";
import * as Berry from "./berry";
import * as BerryPowder from "./berryPowder";
import { RotatingGate_InitPuzzle, RotatingGate_InitPuzzleAndGraphics } from "./rotatingGate";
import { ChooseStarter, GetStarterPokemon } from "./starterChoose";
import { ScriptGetPokedexInfo, ShowPokedexRatingMessage } from "./birchPc";

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

/** field_specials.c Task_PCTurnOnEffect task data (tPaused is never set). */
const tPaused = 0, tTaskId = 1, tFlickerCount = 2, tTimer = 3, tIsScreenOn = 4;
/** DrawWholeMapView needs the script's overworld; the task runs for 30 frames after the special. */
let sPCEffectCtx: ScriptRunner | null = null;

/** field_specials.c PCTurnOnEffect_SetMetatile / PCTurnOffEffect: gSpecialVar_0x8004 is a PC_LOCATION_* value. */
function PCEffect_SetMetatile(ctx: ScriptRunner, screenOn: boolean, dx: number, dy: number): void {
  const k = rom.constants;
  let metatileId = 0;
  const location = varGet(SV.x8004);
  if (screenOn) {
    // Screen is on, set it off
    if (location === EM.PC_LOCATION_OTHER) metatileId = k.METATILE_Building_PC_Off!;
    else if (location === EM.PC_LOCATION_BRENDANS_HOUSE) metatileId = k.METATILE_BrendansMaysHouse_BrendanPC_Off!;
    else if (location === EM.PC_LOCATION_MAYS_HOUSE) metatileId = k.METATILE_BrendansMaysHouse_MayPC_Off!;
  } else {
    // Screen is off, set it on
    if (location === EM.PC_LOCATION_OTHER) metatileId = k.METATILE_Building_PC_On!;
    else if (location === EM.PC_LOCATION_BRENDANS_HOUSE) metatileId = k.METATILE_BrendansMaysHouse_BrendanPC_On!;
    else if (location === EM.PC_LOCATION_MAYS_HOUSE) metatileId = k.METATILE_BrendansMaysHouse_MayPC_On!;
  }
  MapGridSetMetatileIdAt(save.pos.x + dx + MAP_OFFSET, save.pos.y + dy + MAP_OFFSET, metatileId | EM.MAPGRID_COLLISION_MASK, ctx.ow.map);
}

/** The PC is in front of the player, one tile up and to the side when the player faces west/east. */
function PCEffect_Offset(): [number, number] {
  switch (GetPlayerFacingDirection()) {
    case EM.DIR_NORTH: return [0, -1];
    case EM.DIR_WEST: return [-1, -1];
    case EM.DIR_EAST: return [1, -1];
  }
  return [0, 0];
}

/** field_specials.c DoPCTurnOnEffect */
function DoPCTurnOnEffect(ctx: ScriptRunner): void {
  if (!tasks.isActive(Task_PCTurnOnEffect)) {
    sPCEffectCtx = ctx;
    const taskId = tasks.create(Task_PCTurnOnEffect, 8);
    const data = tasks.tasks[taskId].data;
    data[tPaused] = 0;
    data[tTaskId] = taskId;
    data[tFlickerCount] = 0;
    data[tTimer] = 0;
    data[tIsScreenOn] = 0;
  }
}

/** field_specials.c Task_PCTurnOnEffect / PCTurnOnEffect */
function Task_PCTurnOnEffect(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (data[tPaused]) return;
  if (data[tTimer] === 6) {
    data[tTimer] = 0;
    const [dx, dy] = PCEffect_Offset();
    PCEffect_SetMetatile(sPCEffectCtx!, !!data[tIsScreenOn], dx, dy);
    DrawWholeMapView(sPCEffectCtx!);
    // Screen flickers 5 times. Odd number and starting with the screen off means the animation ends with the screen on.
    data[tIsScreenOn] = data[tIsScreenOn]! ^ 1;
    data[tFlickerCount] = data[tFlickerCount]! + 1;
    if (data[tFlickerCount] === 5) tasks.destroy(data[tTaskId]!);
  }
  data[tTimer] = data[tTimer]! + 1;
}

/** field_specials.c DoPCTurnOffEffect / PCTurnOffEffect */
function DoPCTurnOffEffect(ctx: ScriptRunner): void {
  const [dx, dy] = PCEffect_Offset();
  const k = rom.constants;
  const location = varGet(SV.x8004);
  let metatileId = 0;
  if (location === EM.PC_LOCATION_OTHER) metatileId = k.METATILE_Building_PC_Off!;
  else if (location === EM.PC_LOCATION_BRENDANS_HOUSE) metatileId = k.METATILE_BrendansMaysHouse_BrendanPC_Off!;
  else if (location === EM.PC_LOCATION_MAYS_HOUSE) metatileId = k.METATILE_BrendansMaysHouse_MayPC_Off!;
  MapGridSetMetatileIdAt(save.pos.x + dx + MAP_OFFSET, save.pos.y + dy + MAP_OFFSET, metatileId | EM.MAPGRID_COLLISION_MASK, ctx.ow.map);
  DrawWholeMapView(ctx);
}

/** script_menu.c ScriptMenu_CreatePCMultichoice (waitstate=1: the menu task re-enables the script) */
function ScriptMenu_CreatePCMultichoice(ctx: ScriptRunner): number { return ctx.ow.game.scriptMenu.ScriptMenu_CreatePCMultichoice() ? 1 : 0; }

/** player_pc.c PlayerPC (EQUIVALENCE/wrapper): the engine's player PC (Item Storage, Mailbox, Turn Off). */
function PlayerPC(ctx: ScriptRunner): void { ctx.ow.game.openPlayerPC(false); }

/** pokemon_storage_system.c ShowPokemonStorageSystemPC (EQUIVALENCE/wrapper): the engine's storage system. */
function ShowPokemonStorageSystemPC(ctx: ScriptRunner): void { ctx.ow.game.openPokemonStorage(); }

/** field_specials.c sPetalburgGymSlidingDoorMetatiles / sSlidingDoorNextFrameDelay and their static counters */
const sSlidingDoorNextFrameDelay = [0, 1, 1, 1, 1];
let sSlidingDoorNextFrameCounter = 0;
let sSlidingDoorFrame = 0;
let sPetalburgGymCtx: ScriptRunner | null = null;
const sPetalburgGymSlidingDoorMetatiles = (): number[] => [0, 1, 2, 3, 4].map(i => rom.constants[`METATILE_PetalburgGym_SlidingDoor_Frame${i}`]!);

/** field_specials.c PetalburgGymSlideOpenRoomDoors (waitstate=1: the task re-enables the script) */
function PetalburgGymSlideOpenRoomDoors(ctx: ScriptRunner): void {
  sPetalburgGymCtx = ctx;
  sSlidingDoorNextFrameCounter = 0;
  sSlidingDoorFrame = 0;
  sound.playSE(sound.c("SE_UNLOCK"));
  tasks.create(Task_PetalburgGymSlideOpenRoomDoors, 8);
}

function Task_PetalburgGymSlideOpenRoomDoors(taskId: number): void {
  const metatiles = sPetalburgGymSlidingDoorMetatiles();
  if (sSlidingDoorNextFrameDelay[sSlidingDoorFrame] === sSlidingDoorNextFrameCounter) {
    PetalburgGymSetDoorMetatiles(sPetalburgGymCtx!, varGet(SV.x8004) & 0xff, metatiles[sSlidingDoorFrame]!);
    sSlidingDoorNextFrameCounter = 0;
    if (++sSlidingDoorFrame === metatiles.length) {
      tasks.destroy(taskId);
      sPetalburgGymCtx!.ow.script.ScriptContext_Enable();
    }
  } else {
    sSlidingDoorNextFrameCounter++;
  }
}

/** field_specials.c PetalburgGymSetDoorMetatiles: the door columns/rows of each gym room (1–8). */
function PetalburgGymSetDoorMetatiles(ctx: ScriptRunner, roomNumber: number, metatileId: number): void {
  const doorCoordsX: number[] = [], doorCoordsY: number[] = [];
  let nDoors = 0;
  switch (roomNumber) {
    case 1: nDoors = 2; doorCoordsX.push(1, 7); doorCoordsY.push(104, 104); break;
    case 2: nDoors = 2; doorCoordsX.push(1, 7); doorCoordsY.push(78, 78); break;
    case 3: nDoors = 2; doorCoordsX.push(1, 7); doorCoordsY.push(91, 91); break;
    case 4: nDoors = 1; doorCoordsX.push(7); doorCoordsY.push(39); break;
    case 5: nDoors = 2; doorCoordsX.push(1, 7); doorCoordsY.push(52, 52); break;
    case 6: nDoors = 1; doorCoordsX.push(1); doorCoordsY.push(65); break;
    case 7: nDoors = 1; doorCoordsX.push(7); doorCoordsY.push(13); break;
    case 8: nDoors = 1; doorCoordsX.push(1); doorCoordsY.push(26); break;
  }
  const METATILE_ROW_WIDTH = 8;
  for (let i = 0; i < nDoors; i++) {
    MapGridSetMetatileIdAt(doorCoordsX[i]! + MAP_OFFSET, doorCoordsY[i]! + MAP_OFFSET, metatileId | EM.MAPGRID_COLLISION_MASK, ctx.ow.map);
    MapGridSetMetatileIdAt(doorCoordsX[i]! + MAP_OFFSET, doorCoordsY[i]! + MAP_OFFSET + 1, (metatileId + METATILE_ROW_WIDTH) | EM.MAPGRID_COLLISION_MASK, ctx.ow.map);
  }
  DrawWholeMapView(ctx);
}

/** field_specials.c PetalburgGymUnlockRoomDoors */
function PetalburgGymUnlockRoomDoors(ctx: ScriptRunner): void {
  PetalburgGymSetDoorMetatiles(ctx, varGet(SV.x8004) & 0xff, sPetalburgGymSlidingDoorMetatiles()[4]!);
}

/** tv.c SetTVMetatilesOnMap: every MB_TELEVISION tile of the map layout. */
function SetTVMetatilesOnMap(ctx: ScriptRunner, width: number, height: number, metatileId: number): void {
  for (let y = MAP_OFFSET; y < height + MAP_OFFSET; y++)
    for (let x = MAP_OFFSET; x < width + MAP_OFFSET; x++)
      if (ctx.ow.map.behaviorAt(x, y) === rom.constants.MB_TELEVISION)
        MapGridSetMetatileIdAt(x, y, metatileId | EM.MAPGRID_COLLISION_MASK, ctx.ow.map);
}

/** tv.c TurnOffTVScreen / TurnOnTVScreen (gBackupMapLayout is the map's layout size) */
function TurnOffTVScreen(ctx: ScriptRunner): void {
  SetTVMetatilesOnMap(ctx, ctx.ow.map.xSize - 2 * MAP_OFFSET, ctx.ow.map.ySize - 2 * MAP_OFFSET, rom.constants.METATILE_Building_TV_Off!);
  DrawWholeMapView(ctx);
}
function TurnOnTVScreen(ctx: ScriptRunner): void {
  SetTVMetatilesOnMap(ctx, ctx.ow.map.xSize - 2 * MAP_OFFSET, ctx.ow.map.ySize - 2 * MAP_OFFSET, rom.constants.METATILE_Building_TV_On!);
  DrawWholeMapView(ctx);
}

/** tv.c GetRibbonCount */
function GetRibbonCount(mon: Pokemon): number {
  let nRibbons = 0;
  for (const field of [
    FR.MON_DATA_COOL_RIBBON, FR.MON_DATA_BEAUTY_RIBBON, FR.MON_DATA_CUTE_RIBBON, FR.MON_DATA_SMART_RIBBON, FR.MON_DATA_TOUGH_RIBBON,
    FR.MON_DATA_CHAMPION_RIBBON, FR.MON_DATA_WINNING_RIBBON, FR.MON_DATA_VICTORY_RIBBON, FR.MON_DATA_ARTIST_RIBBON,
    FR.MON_DATA_EFFORT_RIBBON, FR.MON_DATA_MARINE_RIBBON, FR.MON_DATA_LAND_RIBBON, FR.MON_DATA_SKY_RIBBON,
    FR.MON_DATA_COUNTRY_RIBBON, FR.MON_DATA_NATIONAL_RIBBON, FR.MON_DATA_EARTH_RIBBON, FR.MON_DATA_WORLD_RIBBON,
  ]) nRibbons += GetMonData(mon, field);
  return nRibbons;
}

/** field_specials.c LeadMonHasEffortRibbon */
function LeadMonHasEffortRibbon(): number {
  return GetMonData(save.party[GetLeadMonIndex()]!, FR.MON_DATA_EFFORT_RIBBON) ? 1 : 0;
}

/** field_specials.c GiveLeadMonEffortRibbon. GAP: with more than NUM_CUTIES_RIBBONS ribbons Emerald calls tv.c
 * TryPutSpotTheCutiesOnAir (TV shows are not ported), so that branch stops instead of skipping the show. */
function GiveLeadMonEffortRibbon(): void {
  incrementGameStat(EM.GAME_STAT_RECEIVED_RIBBONS);
  flagSet(EM.FLAG_SYS_RIBBON_GET);
  const leadMon = save.party[GetLeadMonIndex()]!;
  SetMonData(leadMon, FR.MON_DATA_EFFORT_RIBBON, 1);
  if (GetRibbonCount(leadMon) > EM.NUM_CUTIES_RIBBONS)
    throw Error("GiveLeadMonEffortRibbon: tv.c TryPutSpotTheCutiesOnAir is not ported");
}

/** field_specials.c ChangePokemonNickname and tv.c ChangeBoxPokemonNickname (EQUIVALENCE/wrappers): the engine's
 * naming screen with the same return to the field. */
function ChangePokemonNickname(ctx: ScriptRunner): void { ctx.ow.game.ChangePokemonNickname(); }
function ChangeBoxPokemonNickname(ctx: ScriptRunner): void { ctx.ow.game.ChangeBoxPokemonNickname(); }


/** pokeblock.c GetPokeblockData fields PBLOCK_SPICY..PBLOCK_SOUR (FLAVOR_COUNT of them) */
type Pokeblock = { color: number; spicy: number; dry: number; sweet: number; bitter: number; sour: number; feel: number };
const FLAVOR_COUNT = 5;

/** pokeblock.c PokeblockGetGain */
function PokeblockGetGain(nature: number, pokeblock: Pokeblock): number {
  const table = cdata<number[]>("em:pokeblock", "gPokeblockFlavorCompatibilityTable");
  const flavors = [pokeblock.spicy, pokeblock.dry, pokeblock.sweet, pokeblock.bitter, pokeblock.sour];
  let totalGain = 0;
  for (let flavor = 0; flavor < FLAVOR_COUNT; flavor++) {
    const curGain = flavors[flavor]!;
    if (curGain > 0) totalGain += curGain * table[FLAVOR_COUNT * nature + flavor]!;
  }
  return totalGain;
}

/** pokeblock.c CopyMonFavoritePokeblockName: the first favourite Pokéblock the nature gains from (gPokeblockNames[i + 1]). */
function CopyMonFavoritePokeblockName(nature: number): number[] | null {
  const favorites = cdata<Pokeblock[]>("em:pokeblock", "sFavoritePokeblocksTable");
  const names = cdata<Array<number | { $sym: string }>>("em:pokeblock", "gPokeblockNames");
  for (let i = 0; i < FLAVOR_COUNT; i++) {
    if (PokeblockGetGain(nature, favorites[i]!) > 0) {
      const name = names[i + 1] as { $sym: string };
      return Array.from(rom.text(name.$sym));
    }
  }
  return null;
}

/** field_specials.c GetPokeblockNameByMonNature: returns whether a name was copied, the name goes to gStringVar1. */
function GetPokeblockNameByMonNature(): number {
  const name = CopyMonFavoritePokeblockName(GetNature(save.party[GetLeadMonIndex()]!));
  if (!name) return 0;
  stringVars.var1 = Uint8Array.from(name);
  return 1;
}

/** secret_base.c CheckPlayerHasSecretBase: the player's base is always secretBases[0]. */
function CheckPlayerHasSecretBase(): void {
  varSet(SV.RESULT, save.secretBases?.[0]?.secretBaseId ? 1 : 0);
}

/** region_map.c GetMapName for a region map section below MAPSEC_NONE (padLength 0): gRegionMapEntries[id].name.
 * MAPSEC_SECRET_BASE names the current base (secret_base.c GetSecretBaseName), which needs the secret base records. */
function GetMapName(regionMapId: number): Uint8Array {
  if (regionMapId === EM.MAPSEC_SECRET_BASE) throw Error("GetMapName: secret_base.c GetSecretBaseName is not ported");
  if (regionMapId < EM.MAPSEC_NONE) return rom.regionMapName(regionMapId);
  return Uint8Array.from([...new Array(18).fill(0x00), EOS]); // StringFill(dest, CHAR_SPACE, 18)
}

/** field_specials.c GetSecretBaseNearbyMapName */
function GetSecretBaseNearbyMapName(): void {
  stringVars.var1 = GetMapName(varGet(EM.VAR_SECRET_BASE_MAP));
}

/** field_specials.c LoadWallyZigzagoon: party slot 0 becomes Wally's level 7 Zigzagoon (second ability, only Tackle). SavePlayerParty ran first. */
function LoadWallyZigzagoon(): void {
  save.party[0] = createMon(EM.SPECIES_ZIGZAGOON, 7);
  SetMonData(save.party[0], FR.MON_DATA_ABILITY_NUM, 1);
  SetMonData(save.party[0], FR.MON_DATA_MOVE1, EM.MOVE_TACKLE);
  SetMonData(save.party[0], FR.MON_DATA_MOVE2, EM.MOVE_NONE);
  SetMonData(save.party[0], FR.MON_DATA_MOVE3, EM.MOVE_NONE);
  SetMonData(save.party[0], FR.MON_DATA_MOVE4, EM.MOVE_NONE);
}

/** field_specials.c ShouldShowBoxWasFullMessage and GetPCBoxToSendMon (EQUIVALENCE/wrappers): the engine's storage keeps the
 * same sPCBoxToSendMon / VAR_PC_BOX_TO_SEND_MON / FLAG_SHOWN_BOX_WAS_FULL_MESSAGE state, resolved through the Emerald constants. */
function ShouldShowBoxWasFullMessage(): number { return shouldShowBoxWasFullMessage() ? 1 : 0; }
function GetPCBoxToSendMon(): number { return GetPCBoxToSendMon_(); }

/** field_specials.c GetPlayerBigGuyGirlString */
function GetPlayerBigGuyGirlString(): void {
  stringVars.var1 = rom.text(save.playerGender === EM.MALE ? "gText_BigGuy" : "gText_BigGirl");
}

/** field_specials.c GetRivalSonDaughterString */
function GetRivalSonDaughterString(): void {
  stringVars.var1 = rom.text(save.playerGender === EM.MALE ? "gText_Daughter" : "gText_Son");
}

/** field_specials.c GetWeekCount; gLocalTime is the value RtcCalcLocalTime last stored (clock.ts). */
function GetWeekCount(): number {
  let weekCount = Math.trunc(gLocalTime.days / 7);
  if (weekCount > 9999) weekCount = 9999;
  return weekCount;
}

/** field_specials.c IsStarterInParty; CalculatePlayerPartyCount is the party length. */
function IsStarterInParty(): number {
  const starter = GetStarterPokemon(varGet(EM.VAR_STARTER_MON));
  for (let i = 0; i < save.party.length; i++)
    if (GetMonData(save.party[i]!, FR.MON_DATA_SPECIES_OR_EGG) === starter) return 1;
  return 0;
}

/** field_specials.c IsTrainerRegistered (GetRematchIdxByTrainerIdx is pokenav_match_call_data.c). */
function IsTrainerRegistered(): number {
  const index = GetRematchIdxByTrainerIdx(varGet(SV.x8004));
  if (index >= 0 && flagGet(EM.TRAINER_REGISTERED_FLAGS_START + index)) return 1;
  return 0;
}

/** field_specials.c ResetHealLocationFromDewford: avoids respawning at Dewford with no way off. */
function ResetHealLocationFromDewford(ctx: ScriptRunner): void {
  if (save.lastHealLocation.mapGroup === (EM.MAP_DEWFORD_TOWN >> 8) && save.lastHealLocation.mapNum === (EM.MAP_DEWFORD_TOWN & 0xff))
    ctx.ow.SetLastHealLocationWarp(EM.HEAL_LOCATION_PETALBURG_CITY);
}

/** time_events.c InitBirchState */
function InitBirchState(): void { varSet(EM.VAR_BIRCH_STATE, 0); }

/** event_data.c EnableNationalPokedex. ResetPokedexScrollPositions (pokedex.c) clears the Pokédex screen's
 * static cursor state, which the engine's own Pokédex does not keep; the mode/order fields do not exist in the
 * live save, whose Pokédex screen derives them from the national flag. */
function EnableNationalPokedex(): void {
  save.nationalDexMagic = 0xda;
  varSet(EM.VAR_NATIONAL_DEX, 0x302);
  flagSet(EM.FLAG_SYS_NATIONAL_DEX);
}

/** save_location.c SetUnlockedPokedexFlags */
function SetUnlockedPokedexFlags(): void {
  const block = save as unknown as { gcnLinkFlags?: number };
  block.gcnLinkFlags = (block.gcnLinkFlags ?? 0) | (1 << 15) | (1 << 0) | (1 << 1) | (1 << 2) | (1 << 4) | (1 << 5) | (1 << 3);
}

/** tv.c BufferMonNickname */
function BufferMonNickname(): void {
  const nickname: number[] = [];
  GetMonData(save.party[varGet(SV.x8004)]!, FR.MON_DATA_NICKNAME, nickname);
  const buffer = new Uint8Array(Math.max(nickname.length, FR.POKEMON_NAME_LENGTH) + 2).fill(EOS);
  buffer.set(nickname);
  StringGet_Nickname(buffer);
  stringVars.var1 = buffer;
}

/** tv.c IsMonOTIDNotPlayers */
function IsMonOTIDNotPlayers(): void {
  const otId = GetMonData(save.party[varGet(SV.x8004)]!, FR.MON_DATA_OT_ID) >>> 0;
  varSet(SV.RESULT, GetPlayerTrainerId() === otId ? 0 : 1);
}

/** load_save.c SavePlayerParty / LoadPlayerParty: SaveBlock1.playerPartyCount and playerParty. */
function SavePlayerParty(): void {
  save.playerPartySave = { count: save.party.length, party: structuredClone(save.party.slice(0, EM.PARTY_SIZE)) };
}
function LoadPlayerParty(): void {
  const saved = save.playerPartySave;
  if (!saved) throw Error("LoadPlayerParty: SaveBlock1.playerParty was never filled by SavePlayerParty");
  save.party.splice(0, save.party.length, ...structuredClone(saved.party.slice(0, saved.count)));
}

/** party_menu.c ChoosePartyMon (EQUIVALENCE/wrapper): the engine's party menu with Task_HandleChooseMonInput and
 * BufferMonSelection's mapping of a cancelled/invalid slot to PARTY_NOTHING_CHOSEN. */
function ChoosePartyMon(ctx: ScriptRunner): void {
  ctx.ow.game.choosePartyMon("choose", () => {
    if (varGet(SV.x8004) >= EM.PARTY_SIZE) varSet(SV.x8004, EM.PARTY_NOTHING_CHOSEN);
  });
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
  ChooseStarter: (ctx: ScriptRunner) => ChooseStarter(ctx.ow.game),
  GetPlayerBigGuyGirlString, GetRivalSonDaughterString, GetWeekCount, IsStarterInParty, IsTrainerRegistered,
  ResetHealLocationFromDewford, InitBirchState, EnableNationalPokedex, SetUnlockedPokedexFlags, BufferMonNickname,
  RotatingGate_InitPuzzle, RotatingGate_InitPuzzleAndGraphics, LoadWallyZigzagoon, ShouldShowBoxWasFullMessage, GetPCBoxToSendMon,
  GetPokeblockNameByMonNature, CheckPlayerHasSecretBase, GetSecretBaseNearbyMapName,
  PetalburgGymSlideOpenRoomDoors, PetalburgGymUnlockRoomDoors, TurnOffTVScreen, TurnOnTVScreen, LeadMonHasEffortRibbon,
  GiveLeadMonEffortRibbon, ChangePokemonNickname, ChangeBoxPokemonNickname, ScriptGetPokedexInfo, ShowPokedexRatingMessage,
  HasEnoughBerryPowder: BerryPowder.HasEnoughBerryPowder, TakeBerryPowder: BerryPowder.TakeBerryPowder,
  DisplayBerryPowderVendorMenu: BerryPowder.DisplayBerryPowderVendorMenu,
  PrintPlayerBerryPowderAmount: BerryPowder.PrintPlayerBerryPowderAmount,
  RemoveBerryPowderVendorMenu: BerryPowder.RemoveBerryPowderVendorMenu,
  DoPCTurnOnEffect, DoPCTurnOffEffect, ScriptMenu_CreatePCMultichoice, PlayerPC, ShowPokemonStorageSystemPC,
  IsMonOTIDNotPlayers, SavePlayerParty, LoadPlayerParty, ChoosePartyMon, IsTrainerReadyForRematch,
  IsEnigmaBerryValid: () => (Berry.IsEnigmaBerryValid() ? 1 : 0),
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
