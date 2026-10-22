// pokeemerald Cycling Road challenge: field_specials.c (timer, results, record) and the collision
// counter of bike.c (Bike_TryAdvanceCyclingRoadCollisions). Each function keeps its C name.
// The Hoenn viewer moves the avatar itself, so it calls Bike_TryAdvanceCyclingRoadCollisions on the
// bump it plays for a blocked bike step (GetBikeCollisionAt's `if (collision)` branch).
import { rom } from "@core/rom";
import { EOS } from "@core/gba/charmap";
import { stringVars } from "@core/gba/stringBuffers";
import { StringAppend } from "@game/generated/stringUtil";
import { ConvertIntToDecimalStringN, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "./stringUtil";
import { SV, varGet, varSet } from "@game/save";
import { TestPlayerAvatarFlags } from "@core/field/playerAvatar";
import type { ScriptRunner } from "@core/script/context";
import * as EM from "./generated/constants";

/** gBikeCyclingChallenge, gBikeCollisions and sBikeCyclingTimer. */
let gBikeCyclingChallenge = false;
let gBikeCollisions = 0;
let sBikeCyclingTimer = 0;

/** gMain.vblankCounter1 is a free-running u32 in pokeemerald. ADAPTATION: the viewer installs its
 * fixed GBA timeline (ViewerClock.tick), which stops while the viewer is suspended. */
let vblankCounter1: () => number = () => 0;
export function SetCyclingRoadFrameCounter(counter: () => number): void { vblankCounter1 = counter; }

export function GetBikeCollisions(): number { return gBikeCollisions; }
export function IsBikeCyclingChallengeActive(): boolean { return gBikeCyclingChallenge; }

/** field_specials.c ResetCyclingRoadChallengeData */
export function ResetCyclingRoadChallengeData(): void {
  gBikeCyclingChallenge = false;
  gBikeCollisions = 0;
  sBikeCyclingTimer = 0;
}

/** field_specials.c Special_BeginCyclingRoadChallenge */
export function Special_BeginCyclingRoadChallenge(): void {
  gBikeCyclingChallenge = true;
  gBikeCollisions = 0;
  sBikeCyclingTimer = vblankCounter1() >>> 0;
}

/** bike.c Bike_TryAdvanceCyclingRoadCollisions */
export function Bike_TryAdvanceCyclingRoadCollisions(): void {
  if (gBikeCyclingChallenge && gBikeCollisions < 100) gBikeCollisions++;
}

/** field_specials.c GetPlayerAvatarBike */
export function GetPlayerAvatarBike(): number {
  if (TestPlayerAvatarFlags(EM.PLAYER_AVATAR_FLAG_ACRO_BIKE)) return 1;
  if (TestPlayerAvatarFlags(EM.PLAYER_AVATAR_FLAG_MACH_BIKE)) return 2;
  return 0;
}

/** field_specials.c DetermineCyclingRoadResults: gStringVar1/2 and gSpecialVar_Result. */
function DetermineCyclingRoadResults(numFrames: number, numBikeCollisions: number): void {
  numFrames >>>= 0;
  numBikeCollisions &= 0xff;
  if (numBikeCollisions < 100) {
    const buffer = new Uint8Array(32).fill(EOS);
    ConvertIntToDecimalStringN(buffer, numBikeCollisions, STR_CONV_MODE_LEFT_ALIGN, 2);
    StringAppend(buffer, rom.text("gText_SpaceTimes"));
    stringVars.var1 = buffer;
  } else {
    stringVars.var1 = rom.text("gText_99TimesPlus");
  }

  if (numFrames < 3600) {
    const buffer = new Uint8Array(32).fill(EOS);
    ConvertIntToDecimalStringN(buffer, Math.trunc(numFrames / 60), STR_CONV_MODE_RIGHT_ALIGN, 2);
    buffer[2] = EM.CHAR_DEC_SEPARATOR;
    ConvertIntToDecimalStringN(buffer, Math.trunc(((numFrames % 60) * 100) / 60), STR_CONV_MODE_LEADING_ZEROS, 2, 3);
    StringAppend(buffer, rom.text("gText_SpaceSeconds"));
    stringVars.var2 = buffer;
  } else {
    stringVars.var2 = rom.text("gText_1MinutePlus");
  }

  let result = 0;
  if (numBikeCollisions === 0) result = 5;
  else if (numBikeCollisions < 4) result = 4;
  else if (numBikeCollisions < 10) result = 3;
  else if (numBikeCollisions < 20) result = 2;
  else if (numBikeCollisions < 100) result = 1;

  const seconds = Math.trunc(numFrames / 60);
  if (seconds <= 10) result += 5;
  else if (seconds <= 15) result += 4;
  else if (seconds <= 20) result += 3;
  else if (seconds <= 40) result += 2;
  else if (seconds < 60) result += 1;

  varSet(SV.RESULT, result);
}

/** field_specials.c RecordCyclingRoadResults */
function RecordCyclingRoadResults(numFrames: number, numBikeCollisions: number): void {
  const low = varGet(EM.VAR_CYCLING_ROAD_RECORD_TIME_L);
  const high = varGet(EM.VAR_CYCLING_ROAD_RECORD_TIME_H);
  const framesRecord = (low + high * 0x10000) >>> 0;
  if (framesRecord > numFrames || framesRecord === 0) {
    varSet(EM.VAR_CYCLING_ROAD_RECORD_TIME_L, numFrames);
    varSet(EM.VAR_CYCLING_ROAD_RECORD_TIME_H, numFrames >>> 16);
    varSet(EM.VAR_CYCLING_ROAD_RECORD_COLLISIONS, numBikeCollisions);
  }
}

/** field_specials.c FinishCyclingRoadChallenge */
export function FinishCyclingRoadChallenge(): void {
  const numFrames = ((vblankCounter1() >>> 0) - sBikeCyclingTimer) >>> 0;
  DetermineCyclingRoadResults(numFrames, gBikeCollisions);
  RecordCyclingRoadResults(numFrames, gBikeCollisions);
}

/** field_specials.c GetRecordedCyclingRoadResults */
export function GetRecordedCyclingRoadResults(): number {
  const low = varGet(EM.VAR_CYCLING_ROAD_RECORD_TIME_L);
  const high = varGet(EM.VAR_CYCLING_ROAD_RECORD_TIME_H);
  const framesRecord = (low + high * 0x10000) >>> 0;
  if (framesRecord === 0) return 0;
  DetermineCyclingRoadResults(framesRecord, varGet(EM.VAR_CYCLING_ROAD_RECORD_COLLISIONS));
  return 1;
}

/** field_specials.c UpdateCyclingRoadState: ON_RESUME of Route 110. */
export function UpdateCyclingRoadState(ctx: ScriptRunner): void {
  const last = ctx.ow.lastUsedWarp;
  if (last.mapNum === (EM.MAP_ROUTE110_SEASIDE_CYCLING_ROAD_NORTH_ENTRANCE & 0xff)
    && last.mapGroup === (EM.MAP_ROUTE110_SEASIDE_CYCLING_ROAD_NORTH_ENTRANCE >>> 8)) return;
  const state = varGet(EM.VAR_CYCLING_CHALLENGE_STATE);
  if (state === 2 || state === 3) {
    varSet(EM.VAR_CYCLING_CHALLENGE_STATE, 0);
    ctx.ow.Overworld_SetSavedMusic(EM.MUS_DUMMY);
  }
}
