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
