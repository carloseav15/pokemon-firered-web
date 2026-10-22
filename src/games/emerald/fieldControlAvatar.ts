// pokeemerald src/field_control_avatar.c: the parts the Hoenn viewer runs on the FireRed field engine.
// GetInteractedBackgroundEventScript (signs, hidden items), RestartWildEncounterImmunitySteps and
// CheckStandardWildEncounter with their file statics. The viewer moves the player and dispatches warps
// itself; the other ProcessPlayerFieldInput steps it runs are listed in EngineInteraction.tryEmeraldStep.
// Secret base background events are not exported to the Emerald map data, so that case never arises.
// Coord events without a script are weather triggers: DoCoordEventWeather is not run on the engine
// (the Hoenn viewer applies those triggers to its own weather overlay).
import { rom, type MapHeader } from "@core/rom";
import { MAP_OFFSET } from "@core/field/fieldmap";
import { flagGet, SV, varGet, varSet } from "@game/save";
import * as EM from "./generated/constants";
import * as EMB from "./generated/metatileBehavior";
import { StandardWildEncounter } from "./wildEncounter";

type MapPosition = { x: number; y: number; elevation: number };

/** GetBackgroundEventAtPosition: elevation 0 matches any elevation. */
function GetBackgroundEventAtPosition(header: MapHeader, x: number, y: number, elevation: number) {
  return header.bgs.find(bg => bg.x === x && bg.y === y && (bg.elevation === elevation || bg.elevation === 0));
}

/** GetInteractedBackgroundEventScript; returns 0 for NULL. */
export function GetInteractedBackgroundEventScript(header: MapHeader, position: MapPosition, _metatileBehavior: number, direction: number): number {
  const bgEvent = GetBackgroundEventAtPosition(header, position.x - MAP_OFFSET, position.y - MAP_OFFSET, position.elevation);
  if (!bgEvent) return 0;
  if (bgEvent.type === "hidden_item") {
    // BG_EVENT_HIDDEN_ITEM: the exported flag is FLAG_HIDDEN_ITEMS_START + the packed hidden item ID.
    varSet(SV.x8004, bgEvent.flag);
    varSet(SV.x8005, bgEvent.item);
    if (flagGet(bgEvent.flag)) return 0;
    return rom.label("EventScript_HiddenItemScript");
  }
  if (!bgEvent.script) return rom.label("EventScript_TestSignpostMsg");
  switch (bgEvent.facing) {
    case EM.BG_EVENT_PLAYER_FACING_NORTH: if (direction !== EM.DIR_NORTH) return 0; break;
    case EM.BG_EVENT_PLAYER_FACING_SOUTH: if (direction !== EM.DIR_SOUTH) return 0; break;
    case EM.BG_EVENT_PLAYER_FACING_EAST: if (direction !== EM.DIR_EAST) return 0; break;
    case EM.BG_EVENT_PLAYER_FACING_WEST: if (direction !== EM.DIR_WEST) return 0; break;
  }
  return bgEvent.script;
}

/**
 * GetInteractedMetatileScript (field_control_avatar.c). `mapGridElevation` is MapGridGetElevationAt of the
 * faced tile. The secret base furniture checks (CheckInteractedWithFriends*) belong to the secret base
 * system, which is not ported: those metatile behaviors only occur in secret base layouts, so reaching
 * them stops with an error instead of returning no script.
 */
export function GetInteractedMetatileScript(position: MapPosition, metatileBehavior: number, direction: number, mapGridElevation: number): number {
  const label = (name: string) => rom.label(name);
  if (EMB.MetatileBehavior_IsPlayerFacingTVScreen(metatileBehavior, direction)) return label("EventScript_TV");
  if (EMB.MetatileBehavior_IsPC(metatileBehavior)) return label("EventScript_PC");
  if (EMB.MetatileBehavior_IsClosedSootopolisDoor(metatileBehavior)) return label("EventScript_ClosedSootopolisDoor");
  if (EMB.MetatileBehavior_IsSkyPillarClosedDoor(metatileBehavior)) return label("SkyPillar_Outside_EventScript_ClosedDoor");
  if (EMB.MetatileBehavior_IsCableBoxResults1(metatileBehavior)) return label("EventScript_CableBoxResults");
  if (EMB.MetatileBehavior_IsPokeblockFeeder(metatileBehavior)) return label("EventScript_PokeBlockFeeder");
  if (EMB.MetatileBehavior_IsTrickHousePuzzleDoor(metatileBehavior)) return label("Route110_TrickHousePuzzle_EventScript_Door");
  if (EMB.MetatileBehavior_IsRegionMap(metatileBehavior)) return label("EventScript_RegionMap");
  if (EMB.MetatileBehavior_IsRunningShoesManual(metatileBehavior)) return label("EventScript_RunningShoesManual");
  if (EMB.MetatileBehavior_IsPictureBookShelf(metatileBehavior)) return label("EventScript_PictureBookShelf");
  if (EMB.MetatileBehavior_IsBookShelf(metatileBehavior)) return label("EventScript_BookShelf");
  if (EMB.MetatileBehavior_IsPokeCenterBookShelf(metatileBehavior)) return label("EventScript_PokemonCenterBookShelf");
  if (EMB.MetatileBehavior_IsVase(metatileBehavior)) return label("EventScript_Vase");
  if (EMB.MetatileBehavior_IsTrashCan(metatileBehavior)) return label("EventScript_EmptyTrashCan");
  if (EMB.MetatileBehavior_IsShopShelf(metatileBehavior)) return label("EventScript_ShopShelf");
  if (EMB.MetatileBehavior_IsBlueprint(metatileBehavior)) return label("EventScript_Blueprint");
  if (EMB.MetatileBehavior_IsPlayerFacingWirelessBoxResults(metatileBehavior, direction)) return label("EventScript_WirelessBoxResults");
  if (EMB.MetatileBehavior_IsCableBoxResults2(metatileBehavior, direction)) return label("EventScript_CableBoxResults");
  if (EMB.MetatileBehavior_IsQuestionnaire(metatileBehavior)) return label("EventScript_Questionnaire");
  if (EMB.MetatileBehavior_IsTrainerHillTimer(metatileBehavior)) return label("EventScript_TrainerHillTimer");

  if (position.elevation === mapGridElevation) {
    if (EMB.MetatileBehavior_IsSecretBasePC(metatileBehavior)) return label("SecretBase_EventScript_PC");
    if (EMB.MetatileBehavior_IsRecordMixingSecretBasePC(metatileBehavior)) return label("SecretBase_EventScript_RecordMixingPC");
    if (EMB.MetatileBehavior_IsSecretBaseSandOrnament(metatileBehavior)) return label("SecretBase_EventScript_SandOrnament");
    if (EMB.MetatileBehavior_IsSecretBaseShieldOrToyTV(metatileBehavior)) return label("SecretBase_EventScript_ShieldOrToyTV");
    if (EMB.MetatileBehavior_IsSecretBaseDecorationBase(metatileBehavior)
      || EMB.MetatileBehavior_HoldsLargeDecoration(metatileBehavior)
      || EMB.MetatileBehavior_HoldsSmallDecoration(metatileBehavior)) throw Error("Secret base furniture interaction is not ported");
  } else if (EMB.MetatileBehavior_IsSecretBasePoster(metatileBehavior)) {
    throw Error("Secret base poster interaction is not ported");
  }
  return 0;
}

/** TryRunCoordEventScript; `runImmediately` is RunScriptImmediately for trigger 0 events. */
function TryRunCoordEventScript(event: MapHeader["coords"][number], runImmediately: (script: number) => void): number {
  if (!event.script) return 0;
  if (event.var === 0) {
    runImmediately(event.script);
    return 0;
  }
  return varGet(event.var) === (event.value & 0xff) ? event.script : 0;
}

/** GetCoordEventScriptAtPosition: elevation ELEVATION_TRANSITION matches any elevation. */
export function GetCoordEventScriptAtPosition(header: MapHeader, x: number, y: number, elevation: number, runImmediately: (script: number) => void): number {
  for (const event of header.coords) {
    if ((event.x & 0xffff) !== (x & 0xffff) || (event.y & 0xffff) !== (y & 0xffff)) continue;
    if (event.elevation !== elevation && event.elevation !== EM.ELEVATION_TRANSITION) continue;
    const script = TryRunCoordEventScript(event, runImmediately);
    if (script) return script;
  }
  return 0;
}

let sWildEncounterImmunitySteps = 0;
let sPrevMetatileBehavior = 0;

/** RestartWildEncounterImmunitySteps: starts at 0 and counts up to 4 steps. */
export function RestartWildEncounterImmunitySteps(): void {
  sWildEncounterImmunitySteps = 0;
}

/** CheckStandardWildEncounter */
export function CheckStandardWildEncounter(metatileBehavior: number): boolean {
  if (sWildEncounterImmunitySteps < 4) {
    sWildEncounterImmunitySteps++;
    sPrevMetatileBehavior = metatileBehavior;
    return false;
  }
  if (StandardWildEncounter(metatileBehavior, sPrevMetatileBehavior)) {
    sWildEncounterImmunitySteps = 0;
    sPrevMetatileBehavior = metatileBehavior;
    return true;
  }
  sPrevMetatileBehavior = metatileBehavior;
  return false;
}
