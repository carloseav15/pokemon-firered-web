// The SetUpFieldMove_* checks from fldeff_*.c behind party_menu.c
// CursorCB_FieldMove (partyMenu.ts). Each setup returns the post-menu field
// callback (gPostMenuFieldCallback) that runs once the party menu has closed.

import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { decode, expandPlaceholders, stringVars } from "../gba/charmap";
import { rom } from "../rom";
import { sound } from "../audio/sound";
import { SetUpFieldMove_Cut } from "../field/fieldMoves";
import { flagGet, flagSet, save, varSet, SV, type WarpData } from "../save";
import type { Game } from "../game";
import { DIRECTION_VECTORS, DIR_NORTH } from "../field/objectEvents";
import { Overworld_MapTypeAllowsTeleportAndFly } from "../field/overworld";
import { getMapNameGenericBytes } from "../regionMap";

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

export type FieldMoveResult =
  | { kind: "fail"; message: string }
  | { kind: "close"; post: () => void }
  | { kind: "confirm"; message: string; post: () => void }
  | { kind: "fly" }
  | { kind: "softboiled" };

/** SetUpFieldMove_Flash (fldeff_flash.c), adapted to the field-move result callback. */
export function SetUpFieldMove_Flash(game: Game, partyIndex: number): FieldMoveResult | null {
  const ow = game.overworld;
  if (!ow.header.requiresFlash || flagGet(C.FLAG_SYS_FLASH_ACTIVE)) return null;
  return { kind: "close", post: () => FieldCallback_Flash(game, partyIndex) };
}

/** FieldCallback_Flash (fldeff_flash.c): show the selected Pokémon before invoking Flash. */
export function FieldCallback_Flash(game: Game, partyIndex: number): void {
  game.fieldEffectArguments[0] = partyIndex;
  game.overworld.effects.moves.CreateFieldEffectShowMon(() => FldEff_UseFlash(game));
}

/** FldEff_UseFlash (fldeff_flash.c). */
export function FldEff_UseFlash(game: Game): void {
  sound.playSE(C.SE_M_REFLECT);
  flagSet(C.FLAG_SYS_FLASH_ACTIVE);
  game.overworld.script.ScriptContext_SetupScript(rom.label("EventScript_FldEffFlash"));
}

function sectionOfWarp(w: WarpData): number {
  const id = rom.mapIdByNum((w.mapGroup << 8) | w.mapNum);
  const name = id ? rom.mapIndex.maps[id]?.section : undefined;
  return name ? rom.c(name) : 0;
}

/** fldeff_softboiled.c SetUpFieldMove_SoftBoiled */
export function SetUpFieldMove_SoftBoiled(partyIndex: number): boolean {
  const mon = save.party[partyIndex];
  return mon.hp > Math.floor(mon.stats[0] / 5);
}

/** fldeff_sweetscent.c SetUpFieldMove_SweetScent; its post-menu callback is the field effect. */
let gPostMenuFieldCallback: (() => void) | undefined;
export function SetUpFieldMove_SweetScent(postMenuCallback: () => void): boolean {
  gPostMenuFieldCallback = postMenuCallback;
  return true;
}

/** fldeff_teleport.c SetUpFieldMove_Teleport; callbacks are installed by the field-menu adapter. */
export function SetUpFieldMove_Teleport(mapType: number): boolean {
  return Overworld_MapTypeAllowsTeleportAndFly(mapType);
}

/** fldeff_dig.c SetUpFieldMove_Dig / item_use.c CanUseEscapeRopeOnCurrMap */
export function SetUpFieldMove_Dig(allowEscaping: boolean): boolean {
  return allowEscaping === true;
}

/** fldeff_strength.c SetUpFieldMove_Strength; frontObject already checks the C graphics ID. */
export function SetUpFieldMove_Strength(isSurfing: boolean, hasBoulder: boolean): boolean {
  return !isSurfing && hasBoulder;
}

/** event_object_movement.c CheckObjectGraphicsInFrontOfPlayer. */
export function CheckObjectGraphicsInFrontOfPlayer(game: Game, graphicsId: number): boolean {
  const ow = game.overworld, player = ow.player.object;
  const [dx, dy] = DIRECTION_VECTORS[player.facingDirection];
  const object = ow.objects.objectAtXYZ(player.currentCoords.x + dx, player.currentCoords.y + dy, player.currentElevation);
  if (!object || object.graphicsId !== graphicsId) return false;
  varSet(SV.LAST_TALKED, object.localId);
  return true;
}

/** fldeff_rocksmash.c SetUpFieldMove_RockSmash. */
export function SetUpFieldMove_RockSmash(game: Game): boolean {
  return CheckObjectGraphicsInFrontOfPlayer(game, C.OBJ_EVENT_GFX_ROCK_SMASH_ROCK);
}

/** fldeff_rocksmash.c FieldCallback_UseRockSmash. */
export function FieldCallback_UseRockSmash(game: Game, partyIndex: number): void {
  game.fieldEffectArguments[0] = partyIndex;
  game.overworld.script.ScriptContext_SetupScript(rom.label("EventScript_FldEffRockSmash"));
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
      return SetUpFieldMove_Flash(game, partyIndex)!;
    case FIELD_MOVE_CUT: {
      ow.effects.moves.setScheduleOpenDottedHole(false);
      const cutTarget = SetUpFieldMove_Cut(game);
      if (cutTarget === "ruin") {
        return { kind: "close", post: () => {
          ow.effects.moves.setScheduleOpenDottedHole(true);
          ow.effects.moves.FieldCallback_CutGrass(partyIndex);
        } };
      }
      if (cutTarget === "tree") {
        return { kind: "close", post: () => ow.effects.moves.FieldCallback_CutTree(partyIndex) };
      }
      if (cutTarget === "grass") return { kind: "close", post: () => ow.effects.moves.FieldCallback_CutGrass(partyIndex) };
      return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
    }
    case FIELD_MOVE_FLY:
      if (!Overworld_MapTypeAllowsTeleportAndFly(ow.header.mapType)) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      return { kind: "fly" };
    case FIELD_MOVE_STRENGTH: {
      const boulder = frontObject(C.OBJ_EVENT_GFX_PUSHABLE_BOULDER);
      if (!SetUpFieldMove_Strength(ow.player.isSurfing(), !!boulder)) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      varSet(SV.RESULT, partyIndex);
      return { kind: "close", post: () => { args[0] = partyIndex; ow.script.ScriptContext_SetupScript(rom.label("EventScript_FldEffStrength")); } };
    }
    case FIELD_MOVE_SURF: {
      const behavior = ow.map.behaviorAt(fx, fy);
      if (!MB.MetatileBehavior_IsFastWater(behavior) && ow.player.PartyHasMonWithSurf() && ow.player.IsPlayerFacingSurfableFishableWater()) {
        return { kind: "close", post: () => { args[0] = partyIndex; ow.effects.start(C.FLDEFF_USE_SURF); } };
      }
      let message = "gText_CantSurfHere";
      if (ow.player.isSurfing()) message = "gText_AlreadySurfing";
      else if (MB.MetatileBehavior_IsFastWater(behavior)) message = "gText_CurrentIsTooFast";
      else if (ow.mapId === "MAP_ROUTE17" || ow.mapId === "MAP_ROUTE18") message = "gText_EnjoyCycling";
      return { kind: "fail", message: text(message) };
    }
    case FIELD_MOVE_ROCK_SMASH: {
      if (!SetUpFieldMove_RockSmash(game)) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      return { kind: "close", post: () => FieldCallback_UseRockSmash(game, partyIndex) };
    }
    case FIELD_MOVE_WATERFALL:
      if (MB.MetatileBehavior_IsWaterfall(ow.map.behaviorAt(fx, fy)) && ow.player.IsPlayerSurfingNorth()) {
        return { kind: "close", post: () => { args[0] = partyIndex; ow.effects.start(C.FLDEFF_USE_WATERFALL); } };
      }
      return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
    case FIELD_MOVE_TELEPORT:
      if (!SetUpFieldMove_Teleport(ow.header.mapType)) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      stringVars.var1 = getMapNameGenericBytes(sectionOfWarp(save.lastHealLocation));
      return { kind: "confirm", message: text("gText_ReturnToHealingSpot"), post: () => {
        ow.resetStateAfterTeleport();
        args[0] = partyIndex;
        ow.effects.start(C.FLDEFF_USE_TELEPORT);
      } };
    case FIELD_MOVE_DIG:
      if (!SetUpFieldMove_Dig(ow.header.allowEscaping)) return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      stringVars.var1 = getMapNameGenericBytes(sectionOfWarp(save.escapeWarp));
      return { kind: "confirm", message: text("gText_EscapeFromHereAndReturnTo"), post: () => {
        ow.resetStateAfterDigEscRope();
        args[0] = partyIndex;
        ow.effects.start(C.FLDEFF_USE_DIG);
      } };
    case FIELD_MOVE_MILK_DRINK:
    case FIELD_MOVE_SOFT_BOILED: {
      if (SetUpFieldMove_SoftBoiled(partyIndex)) return { kind: "softboiled" };
      return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
    }
    case FIELD_MOVE_SWEET_SCENT:
      if (!SetUpFieldMove_SweetScent(() => { args[0] = partyIndex; ow.effects.start(C.FLDEFF_SWEET_SCENT); }))
        return { kind: "fail", message: text(FAIL_MESSAGES[fieldMove]) };
      return { kind: "close", post: () => { const callback = gPostMenuFieldCallback; gPostMenuFieldCallback = undefined; callback?.(); } };
  }
  return { kind: "fail", message: text("gText_CantUseHere") };
}
