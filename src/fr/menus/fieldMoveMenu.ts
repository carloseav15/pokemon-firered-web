// party_menu.c field-move actions (sFieldMoves / sFieldMoveCursorCallbacks and
// CursorCB_FieldMove) with the SetUpFieldMove_* checks from fldeff_*.c.
// Each setup returns the post-menu field callback (gPostMenuFieldCallback)
// that runs once the party menu has closed.

import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { decode, expandPlaceholders, stringVars } from "../gba/charmap";
import { rom } from "../rom";
import { sound } from "../audio/sound";
import { METATILE_ATTRIBUTE_TERRAIN } from "../field/fieldmap";
import { flagGet, flagSet, save, varSet, SV, type WarpData } from "../save";
import type { Game } from "../game";
import { DIRECTION_VECTORS, DIR_NORTH } from "../field/objectEvents";

export const FIELD_MOVE_FLASH = 0, FIELD_MOVE_CUT = 1, FIELD_MOVE_FLY = 2, FIELD_MOVE_STRENGTH = 3, FIELD_MOVE_SURF = 4,
  FIELD_MOVE_ROCK_SMASH = 5, FIELD_MOVE_WATERFALL = 6, FIELD_MOVE_TELEPORT = 7, FIELD_MOVE_DIG = 8, FIELD_MOVE_MILK_DRINK = 9,
  FIELD_MOVE_SOFT_BOILED = 10, FIELD_MOVE_SWEET_SCENT = 11;

/** sFieldMoves */
export const FIELD_MOVES = [C.MOVE_FLASH, C.MOVE_CUT, C.MOVE_FLY, C.MOVE_STRENGTH, C.MOVE_SURF, C.MOVE_ROCK_SMASH, C.MOVE_WATERFALL,
  C.MOVE_TELEPORT, C.MOVE_DIG, C.MOVE_MILK_DRINK, C.MOVE_SOFT_BOILED, C.MOVE_SWEET_SCENT];

/** Party menu std messages used by the field moves (sActionStringTable). */
const FAIL_MESSAGES = ["gText_CantUseHere", "gText_NothingToCut", "gText_CantUseHere", "gText_CantUseHere", "gText_CantSurfHere",
  "gText_CantUseHere", "gText_CantUseHere", "gText_CantUseHere", "gText_CantUseHere", "gText_NotEnoughHp", "gText_NotEnoughHp", "gText_CantUseHere"];

export function text(symbol: string): string {
  return decode(expandPlaceholders(rom.text(symbol)));
}

/** SetPartyMonFieldSelectionActions: the field moves this mon knows, in sFieldMoves order. */
export function fieldMovesOf(moves: number[]): number[] {
  const out: number[] = [];
  FIELD_MOVES.forEach((move, index) => { if (moves.includes(move)) out.push(index); });
  return out;
}

export function fieldMoveName(index: number): string {
  return decode(rom.moveName(FIELD_MOVES[index]));
}

export type FieldMoveResult =
  | { kind: "fail"; message: string }
  | { kind: "close"; post: () => void }
  | { kind: "confirm"; message: string; post: () => void }
  | { kind: "fly" }
  | { kind: "softboiled" };

/** GetMapNameGeneric for a map's region map section. */
export function mapSecName(section: number): string {
  return decode(rom.regionMapName(section));
}

export function sectionOfWarp(w: WarpData): number {
  const id = rom.mapIdByNum((w.mapGroup << 8) | w.mapNum);
  const name = id ? rom.mapIndex.maps[id]?.section : undefined;
  return name ? rom.c(name) : 0;
}

function mapTypeAllowsTeleportAndFly(mapType: number): boolean {
  return mapType === C.MAP_TYPE_ROUTE || mapType === C.MAP_TYPE_TOWN || mapType === C.MAP_TYPE_OCEAN_ROUTE || mapType === C.MAP_TYPE_CITY;
}

/** CursorCB_FieldMove's badge check and the SetUpFieldMove_* dispatch. */
export function trySetUpFieldMove(game: Game, fieldMove: number, partyIndex: number): FieldMoveResult {
  const ow = game.overworld;
  const args = game.fieldEffectArguments;
  if (fieldMove <= FIELD_MOVE_WATERFALL && !flagGet(C.FLAG_BADGE01_GET + fieldMove)) return { kind: "fail", message: text("gText_CantUseUntilNewBadge") };
  const p = ow.player.object;
  const [dx, dy] = DIRECTION_VECTORS[p.facingDirection];
  const fx = p.currentCoords.x + dx, fy = p.currentCoords.y + dy;
  const frontObject = (gfx: number) => {
    const o = ow.objects.objectAt(p, fx, fy);
    return o && o.graphicsId === gfx ? o : undefined;
  };
  switch (fieldMove) {
    case FIELD_MOVE_FLASH:
      if (!ow.header.requiresFlash || flagGet(C.FLAG_SYS_FLASH_ACTIVE)) {
        return { kind: "fail", message: text(flagGet(C.FLAG_SYS_FLASH_ACTIVE) ? "gText_InUseAlready_PM" : "gText_CantUseHere") };
      }
      return { kind: "close", post: () => {
        args[0] = partyIndex;
        ow.effects.moves.createShowMon(() => {
          sound.playSE(C.SE_M_REFLECT);
          flagSet(C.FLAG_SYS_FLASH_ACTIVE);
          ow.script.setupScript(rom.label("EventScript_FldEffFlash"));
        });
      } };
    case FIELD_MOVE_CUT: {
      const tree = frontObject(C.OBJ_EVENT_GFX_CUT_TREE);
      if (tree) {
        varSet(SV.LAST_TALKED, tree.localId);
        return { kind: "close", post: () => { args[0] = partyIndex; ow.script.setupScript(rom.label("EventScript_FldEffCut")); } };
      }
      // Grass within the 3×3 area around the player at the same elevation.
      const elevation = p.currentElevation;
      for (let y = p.currentCoords.y - 1; y <= p.currentCoords.y + 1; y++) {
        for (let x = p.currentCoords.x - 1; x <= p.currentCoords.x + 1; x++) {
          if (ow.map.elevationAt(x, y) !== elevation) continue;
          if (ow.map.attributeAt(x, y, METATILE_ATTRIBUTE_TERRAIN) & C.TILE_TERRAIN_GRASS) {
            return { kind: "close", post: () => { args[0] = partyIndex; ow.effects.start(C.FLDEFF_USE_CUT_ON_GRASS); } };
          }
        }
      }
      return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
    }
    case FIELD_MOVE_FLY:
      if (!mapTypeAllowsTeleportAndFly(ow.header.mapType)) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      return { kind: "fly" };
    case FIELD_MOVE_STRENGTH: {
      const boulder = frontObject(C.OBJ_EVENT_GFX_PUSHABLE_BOULDER);
      if (ow.player.isSurfing() || !boulder) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      varSet(SV.RESULT, partyIndex);
      return { kind: "close", post: () => { args[0] = partyIndex; ow.script.setupScript(rom.label("EventScript_FldEffStrength")); } };
    }
    case FIELD_MOVE_SURF: {
      const behavior = ow.map.behaviorAt(fx, fy);
      if (!MB.MetatileBehavior_IsFastWater(behavior) && ow.player.hasMonWithSurf() && ow.player.isFacingSurfableWater()) {
        return { kind: "close", post: () => { args[0] = partyIndex; ow.effects.start(C.FLDEFF_USE_SURF); } };
      }
      let message = "gText_CantSurfHere";
      if (ow.player.isSurfing()) message = "gText_AlreadySurfing";
      else if (MB.MetatileBehavior_IsFastWater(behavior)) message = "gText_CurrentIsTooFast";
      else if (ow.mapId === "MAP_ROUTE17" || ow.mapId === "MAP_ROUTE18") message = "gText_EnjoyCycling";
      return { kind: "fail", message: text(message) };
    }
    case FIELD_MOVE_ROCK_SMASH: {
      const rock = frontObject(C.OBJ_EVENT_GFX_ROCK_SMASH_ROCK);
      if (!rock) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      varSet(SV.LAST_TALKED, rock.localId);
      return { kind: "close", post: () => { args[0] = partyIndex; ow.script.setupScript(rom.label("EventScript_FldEffRockSmash")); } };
    }
    case FIELD_MOVE_WATERFALL:
      if (MB.MetatileBehavior_IsWaterfall(ow.map.behaviorAt(fx, fy)) && ow.player.isSurfing() && p.facingDirection === DIR_NORTH) {
        return { kind: "close", post: () => { args[0] = partyIndex; ow.effects.start(C.FLDEFF_USE_WATERFALL); } };
      }
      return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
    case FIELD_MOVE_TELEPORT:
      if (!mapTypeAllowsTeleportAndFly(ow.header.mapType)) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      stringVars.var1 = Uint8Array.from(rom.regionMapName(sectionOfWarp(save.lastHealLocation)));
      return { kind: "confirm", message: text("gText_ReturnToHealingSpot"), post: () => {
        ow.resetStateAfterTeleport();
        args[0] = partyIndex;
        ow.effects.start(C.FLDEFF_USE_TELEPORT);
      } };
    case FIELD_MOVE_DIG:
      if (!ow.header.allowEscaping) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      stringVars.var1 = Uint8Array.from(rom.regionMapName(sectionOfWarp(save.escapeWarp)));
      return { kind: "confirm", message: text("gText_EscapeFromHereAndReturnTo"), post: () => {
        ow.resetStateAfterDigEscRope();
        args[0] = partyIndex;
        ow.effects.start(C.FLDEFF_USE_DIG);
      } };
    case FIELD_MOVE_MILK_DRINK:
    case FIELD_MOVE_SOFT_BOILED: {
      const mon = save.party[partyIndex];
      if (mon.hp > Math.floor(mon.stats[0] / 5)) return { kind: "softboiled" };
      return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
    }
    case FIELD_MOVE_SWEET_SCENT:
      return { kind: "close", post: () => { args[0] = partyIndex; ow.effects.start(C.FLDEFF_SWEET_SCENT); } };
  }
  return { kind: "fail", message: text("gText_CantUseHere") };
}

/** sMapFlyDestinations for the mapsecs GetMapsecType reports as visited towns. */
const FLY_DESTINATIONS: Array<[string, string, string]> = [
  ["MAPSEC_PALLET_TOWN", "FLAG_WORLD_MAP_PALLET_TOWN", "HEAL_LOCATION_PALLET_TOWN"],
  ["MAPSEC_VIRIDIAN_CITY", "FLAG_WORLD_MAP_VIRIDIAN_CITY", "HEAL_LOCATION_VIRIDIAN_CITY"],
  ["MAPSEC_PEWTER_CITY", "FLAG_WORLD_MAP_PEWTER_CITY", "HEAL_LOCATION_PEWTER_CITY"],
  ["MAPSEC_ROUTE_4_POKECENTER", "FLAG_WORLD_MAP_ROUTE4_POKEMON_CENTER_1F", "HEAL_LOCATION_ROUTE4"],
  ["MAPSEC_CERULEAN_CITY", "FLAG_WORLD_MAP_CERULEAN_CITY", "HEAL_LOCATION_CERULEAN_CITY"],
  ["MAPSEC_ROUTE_10_POKECENTER", "FLAG_WORLD_MAP_ROUTE10_POKEMON_CENTER_1F", "HEAL_LOCATION_ROUTE10"],
  ["MAPSEC_LAVENDER_TOWN", "FLAG_WORLD_MAP_LAVENDER_TOWN", "HEAL_LOCATION_LAVENDER_TOWN"],
  ["MAPSEC_VERMILION_CITY", "FLAG_WORLD_MAP_VERMILION_CITY", "HEAL_LOCATION_VERMILION_CITY"],
  ["MAPSEC_CELADON_CITY", "FLAG_WORLD_MAP_CELADON_CITY", "HEAL_LOCATION_CELADON_CITY"],
  ["MAPSEC_FUCHSIA_CITY", "FLAG_WORLD_MAP_FUCHSIA_CITY", "HEAL_LOCATION_FUCHSIA_CITY"],
  ["MAPSEC_SAFFRON_CITY", "FLAG_WORLD_MAP_SAFFRON_CITY", "HEAL_LOCATION_SAFFRON_CITY"],
  ["MAPSEC_CINNABAR_ISLAND", "FLAG_WORLD_MAP_CINNABAR_ISLAND", "HEAL_LOCATION_CINNABAR_ISLAND"],
  ["MAPSEC_INDIGO_PLATEAU", "FLAG_WORLD_MAP_INDIGO_PLATEAU_EXTERIOR", "HEAL_LOCATION_INDIGO_PLATEAU"],
  ["MAPSEC_ONE_ISLAND", "FLAG_WORLD_MAP_ONE_ISLAND", "HEAL_LOCATION_ONE_ISLAND"],
  ["MAPSEC_TWO_ISLAND", "FLAG_WORLD_MAP_TWO_ISLAND", "HEAL_LOCATION_TWO_ISLAND"],
  ["MAPSEC_THREE_ISLAND", "FLAG_WORLD_MAP_THREE_ISLAND", "HEAL_LOCATION_THREE_ISLAND"],
  ["MAPSEC_FOUR_ISLAND", "FLAG_WORLD_MAP_FOUR_ISLAND", "HEAL_LOCATION_FOUR_ISLAND"],
  ["MAPSEC_FIVE_ISLAND", "FLAG_WORLD_MAP_FIVE_ISLAND", "HEAL_LOCATION_FIVE_ISLAND"],
  ["MAPSEC_SIX_ISLAND", "FLAG_WORLD_MAP_SIX_ISLAND", "HEAL_LOCATION_SIX_ISLAND"],
  ["MAPSEC_SEVEN_ISLAND", "FLAG_WORLD_MAP_SEVEN_ISLAND", "HEAL_LOCATION_SEVEN_ISLAND"],
];

export function flyDestinations(): Array<{ section: number; heal: number; name: string }> {
  return FLY_DESTINATIONS.filter(([, flag]) => flag in rom.constants && flagGet(rom.c(flag))).map(([sec, , heal]) => ({
    section: rom.c(sec), heal: rom.c(heal), name: decode(Uint8Array.from(rom.regionMapName(rom.c(sec)))),
  }));
}
