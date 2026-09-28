// Port of field_control_avatar.c: turns input into interactions, step
// events (coord triggers, warps, wild encounters) and player steps.

import { DoCoordEventWeather } from "./coordEventWeather";
import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { sound } from "../audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, JOY_HELD, R_BUTTON, SELECT_BUTTON, START_BUTTON } from "../gba/input";
import { rom } from "../rom";
import { flagGet, flagSet, incrementGameStat, save, SV, varGet, varSet } from "../save";
import { MAP_OFFSET } from "./fieldmap";
import { DIR_EAST, DIR_NONE, DIR_NORTH, DIR_SOUTH, DIR_WEST, DIRECTION_VECTORS } from "./objectEvents";
import { MOVING, PLAYER_AVATAR_FLAG_ACRO_BIKE, PLAYER_AVATAR_FLAG_FORCED, PLAYER_AVATAR_FLAG_MACH_BIKE, PLAYER_AVATAR_FLAG_ON_FOOT, PLAYER_SPEED_FASTEST, T_NOT_MOVING, T_TILE_CENTER } from "./playerAvatar";
import type { Overworld } from "./overworld";
import { updateVsSeekerStepCounter } from "./vsSeeker";
import { IncrementRenewableHiddenItemStepCounter } from "../renewableHiddenItems";
import { WonderNews_IncrementStepCounter } from "../wonderNews";
import { IncrementBirthIslandRockStepCount, IncrementResortGorgeousStepCounter, RunMassageCooldownStepCounter } from "./fieldStepCounters";
import { AdjustFriendship } from "../pokemon/mon_extra";
import { tasks } from "../gba/tasks";
import { GetRamScript } from "../script/context";
import { IsEscalatorMoving, StartEscalator, StopEscalator } from "./specialFieldAnim";
import { QL_RecordFieldInput, QL_TryRunActions, gQuestLogPlaybackState, gQuestLogState } from "../questLogEvents";
import { ClearQuestLogInput, ClearQuestLogInputIsDpadFlag, GetRegisteredQuestLogInput, IsQuestLogInputDpad, RegisterQuestLogInput } from "../script/context";

export type FieldInput = {
  pressedAButton: boolean;
  checkStandardWildEncounter: boolean;
  pressedStartButton: boolean;
  pressedSelectButton: boolean;
  heldDirection: boolean;
  heldDirection2: boolean;
  tookStep: boolean;
  pressedBButton: boolean;
  pressedRButton: boolean;
  input_field_1_0: boolean;
  input_field_1_1: boolean;
  input_field_1_2: boolean;
  input_field_1_3: boolean;
  dpadDirection: number;
};

function emptyInput(): FieldInput {
  const input = {} as FieldInput;
  FieldClearPlayerInput(input);
  return input;
}

/** FieldClearPlayerInput (field_control_avatar.c). */
export function FieldClearPlayerInput(input: FieldInput): void {
  input.pressedAButton = false;
  input.checkStandardWildEncounter = false;
  input.pressedStartButton = false;
  input.pressedSelectButton = false;
  input.heldDirection = false;
  input.heldDirection2 = false;
  input.tookStep = false;
  input.pressedBButton = false;
  input.pressedRButton = false;
  input.input_field_1_0 = false;
  input.input_field_1_1 = false;
  input.input_field_1_2 = false;
  input.input_field_1_3 = false;
  input.dpadDirection = 0;
}

/** QuestLogOverrideJoyVars (field_control_avatar.c). */
export function QuestLogOverrideJoyVars(newKeys: number, heldKeys: number): { newKeys: number; heldKeys: number } {
  let override = 0;
  switch (GetRegisteredQuestLogInput()) {
    case C.QL_INPUT_UP: override = DPAD_UP; break;
    case C.QL_INPUT_DOWN: override = DPAD_DOWN; break;
    case C.QL_INPUT_LEFT: override = DPAD_LEFT; break;
    case C.QL_INPUT_RIGHT: override = DPAD_RIGHT; break;
    case C.QL_INPUT_L: override = C.L_BUTTON; break;
    case C.QL_INPUT_R: override = R_BUTTON; break;
    case C.QL_INPUT_START: override = START_BUTTON; break;
    case C.QL_INPUT_SELECT: override = SELECT_BUTTON; break;
  }
  if (override !== 0) newKeys = heldKeys = override;
  ClearQuestLogInputIsDpadFlag();
  ClearQuestLogInput();
  return { newKeys, heldKeys };
}

const SIGNPOST_NA = 0, SIGNPOST_POKECENTER = 1, SIGNPOST_POKEMART = 2, SIGNPOST_INDIGO_1 = 3, SIGNPOST_INDIGO_2 = 4, SIGNPOST_SCRIPTED = 240;

export class FieldControl {
  /** gWalkAwayFromSignInhibitTimer and message box cancel state (script.c) */
  walkAwayInhibitTimer = 0;
  msgBoxCancelable = false;
  msgBoxWalkawayDisabled = false;
  msgIsSignpost = false;
  private recordedPlayerFieldInput = emptyInput();
  private questLogStartMenuTask: number | null = null;

  constructor(private readonly ow: Overworld) {}

  /** DoCB1_Overworld */
  processFrame(newKeys: number, heldKeys: number): void {
    QL_TryRunActions(this.ow.controlsLocked);
    const player = this.ow.player;
    player.UpdatePlayerAvatarTransitionState();
    const input = emptyInput();
    this.FieldGetPlayerInput(input, newKeys, heldKeys);
    this.FieldInput_HandleCancelSignpost(input);
    if (!this.ow.controlsLocked) {
      if (this.processPlayerFieldInput(input)) {
        if (gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_RECORDING) QL_RecordFieldInput(this.recordedPlayerFieldInput);
        this.ow.controlsLocked = true;
        this.ow.mapName.dismiss();
      } else {
        player.player_step(input.dpadDirection, newKeys, heldKeys);
      }
    }
  }

  /** GetPlayerCurMetatileBehavior (field_control_avatar.c). */
  private GetPlayerCurMetatileBehavior(): number {
    const p = this.ow.player.object;
    return this.ow.map.behaviorAt(p.currentCoords.x, p.currentCoords.y);
  }

  /** FieldGetPlayerInput (field_control_avatar.c). */
  FieldGetPlayerInput(input: FieldInput, newKeys: number, heldKeys: number): void {
    const player = this.ow.player;
    const forcedMove = MB.MetatileBehavior_IsForcedMovementTile(this.GetPlayerCurMetatileBehavior());
    const tile = player.tileTransitionState;
    if (!this.ow.script.ScriptContext_IsEnabled() && IsQuestLogInputDpad()) {
      ({ newKeys, heldKeys } = QuestLogOverrideJoyVars(newKeys, heldKeys));
    }
    const isQuestLogPlayback = gQuestLogState === C.QL_STATE_PLAYBACK || gQuestLogState === C.QL_STATE_PLAYBACK_LAST;
    if ((tile === T_TILE_CENTER && !forcedMove) || tile === T_NOT_MOVING) {
      if (player.GetPlayerSpeed() !== PLAYER_SPEED_FASTEST) {
        if ((newKeys & START_BUTTON) && !(player.flags & PLAYER_AVATAR_FLAG_FORCED)) input.pressedStartButton = true;
        if (!isQuestLogPlayback && !(player.flags & PLAYER_AVATAR_FLAG_FORCED)) {
          if (newKeys & SELECT_BUTTON) input.pressedSelectButton = true;
          if (newKeys & A_BUTTON) input.pressedAButton = true;
          if (newKeys & B_BUTTON) input.pressedBButton = true;
          if (newKeys & R_BUTTON) input.pressedRButton = true;
        }
      }
      if (!isQuestLogPlayback && (heldKeys & (DPAD_UP | DPAD_DOWN | DPAD_LEFT | DPAD_RIGHT))) {
        input.heldDirection = true;
        input.heldDirection2 = true;
      }
    }
    if (!forcedMove) {
      if (tile === T_TILE_CENTER && player.runningState === MOVING) input.tookStep = true;
      if (tile === T_TILE_CENTER) input.checkStandardWildEncounter = true;
    }
    if (!isQuestLogPlayback) {
      if (heldKeys & DPAD_UP) input.dpadDirection = DIR_NORTH;
      else if (heldKeys & DPAD_DOWN) input.dpadDirection = DIR_SOUTH;
      else if (heldKeys & DPAD_LEFT) input.dpadDirection = DIR_WEST;
      else if (heldKeys & DPAD_RIGHT) input.dpadDirection = DIR_EAST;
    }
  }

  /** FieldInput_HandleCancelSignpost (field_control_avatar.c). */
  FieldInput_HandleCancelSignpost(input: FieldInput): void {
    if (!this.ow.script.ScriptContext_IsEnabled()) return;
    if (this.walkAwayInhibitTimer !== 0) {
      this.walkAwayInhibitTimer--;
      return;
    }
    if (!this.CanWalkAwayToCancelMsgBox()) return;
    const facing = this.ow.player.object.facingDirection;
    if ((input.dpadDirection !== 0 && facing !== input.dpadDirection) || input.pressedStartButton) {
      if (input.dpadDirection !== 0 && this.IsMsgBoxWalkawayDisabled()) return;
      if (input.dpadDirection !== 0) {
        const registered = input.dpadDirection === DIR_NORTH ? C.QL_INPUT_UP
          : input.dpadDirection === DIR_SOUTH ? C.QL_INPUT_DOWN
            : input.dpadDirection === DIR_WEST ? C.QL_INPUT_LEFT : C.QL_INPUT_RIGHT;
        RegisterQuestLogInput(registered);
      }
      this.ow.script.ScriptContext_SetupScript(rom.label("EventScript_CancelMessageBox"));
      this.ow.controlsLocked = true;
      if (input.pressedStartButton && this.questLogStartMenuTask === null) {
        this.questLogStartMenuTask = tasks.create(() => this.Task_QuestLogPlayback_OpenStartMenu(), 8);
      }
    }
  }

  /** Task_QuestLogPlayback_OpenStartMenu (field_control_avatar.c). */
  private Task_QuestLogPlayback_OpenStartMenu(): void {
    if (this.ow.controlsLocked) return;
    sound.playSE(sound.c("SE_WIN_OPEN"));
    this.ow.game.showStartMenu();
    if (this.questLogStartMenuTask !== null) tasks.destroy(this.questLogStartMenuTask);
    this.questLogStartMenuTask = null;
  }

  /** GetPlayerPosition (field_control_avatar.c). */
  private GetPlayerPosition(): { x: number; y: number; elevation: number } {
    const p = this.ow.player.object;
    return { x: p.currentCoords.x, y: p.currentCoords.y, elevation: p.previousElevation };
  }

  /** GetInFrontOfPlayerPosition (field_control_avatar.c). */
  private GetInFrontOfPlayerPosition(): { x: number; y: number; elevation: number } {
    const p = this.ow.player.object;
    const [dx, dy] = DIRECTION_VECTORS[p.facingDirection];
    const elevation = this.ow.map.elevationAt(p.currentCoords.x, p.currentCoords.y) !== 0 ? p.previousElevation : 0;
    return { x: p.currentCoords.x + dx, y: p.currentCoords.y + dy, elevation };
  }

  /** ProcessPlayerFieldInput */
  processPlayerFieldInput(input: FieldInput): boolean {
    this.recordedPlayerFieldInput = { ...emptyInput(), dpadDirection: input.dpadDirection };
    this.resetFacingNpcOrSignpostVars();
    const direction = this.ow.player.object.facingDirection;
    let position = this.GetPlayerPosition();
    const attributes = this.ow.map.attributesOf(this.ow.map.metatileIdAt(position.x, position.y));
    let behavior = this.ow.map.behaviorAt(position.x, position.y);

    if (this.ow.effects.checkForTrainersWantingBattle()) return true;
    if (this.ow.tryRunOnFrameMapScript()) return true;

    if (input.tookStep) {
      incrementGameStat(rom.constants.GAME_STAT_STEPS ?? 0);
      WonderNews_IncrementStepCounter();
      IncrementRenewableHiddenItemStepCounter();
      RunMassageCooldownStepCounter();
      IncrementResortGorgeousStepCounter();
      IncrementBirthIslandRockStepCount();
      if (this.tryStartStepBasedScript(position, behavior, direction)) { this.recordAcceptedFieldInput("tookStep"); return true; }
    }
    if (input.checkStandardWildEncounter && (input.dpadDirection === 0 || input.dpadDirection === direction)) {
      const front = this.GetInFrontOfPlayerPosition();
      const frontBehavior = this.ow.map.behaviorAt(front.x, front.y);
      if (this.trySetUpWalkIntoSignpostScript(front, frontBehavior, direction)) { this.recordAcceptedFieldInput("checkStandardWildEncounter"); return true; }
      position = this.GetPlayerPosition();
      behavior = this.ow.map.behaviorAt(position.x, position.y);
    }
    if (input.checkStandardWildEncounter && this.ow.effects.tryStandardWildEncounter(attributes)) { this.recordAcceptedFieldInput("checkStandardWildEncounter"); return true; }
    if (input.heldDirection && input.dpadDirection === direction && this.tryArrowWarp(position, behavior, direction)) { this.recordAcceptedFieldInput("heldDirection"); return true; }

    const front = this.GetInFrontOfPlayerPosition();
    const frontBehavior = this.ow.map.behaviorAt(front.x, front.y);
    if (input.heldDirection && input.dpadDirection === direction && this.trySetUpWalkIntoSignpostScript(front, frontBehavior, direction)) { this.recordAcceptedFieldInput("heldDirection"); return true; }
    if (input.pressedAButton && this.tryStartInteractionScript(front, frontBehavior, direction)) { this.recordAcceptedFieldInput("pressedAButton"); return true; }
    if (input.heldDirection2 && input.dpadDirection === direction && this.tryDoorWarp(front, frontBehavior, direction)) { this.recordAcceptedFieldInput("heldDirection2"); return true; }
    if (input.pressedStartButton) {
      flagSet(rom.c("FLAG_OPENED_START_MENU"));
      sound.playSE(sound.c("SE_WIN_OPEN"));
      this.ow.game.showStartMenu();
      this.recordAcceptedFieldInput("pressedStartButton");
      return true;
    }
    if (input.pressedSelectButton && this.ow.game.UseRegisteredKeyItemOnField()) { this.recordAcceptedFieldInput("pressedSelectButton"); return true; }
    return false;
  }

  private recordAcceptedFieldInput(key: "pressedAButton" | "checkStandardWildEncounter" | "pressedStartButton" | "pressedSelectButton" | "heldDirection" | "heldDirection2" | "tookStep"): void {
    this.recordedPlayerFieldInput[key] = true;
  }

  resetFacingNpcOrSignpostVars(): void {
    this.ow.selectedObject = 0;
    varSet(SV.TEXT_COLOR, 0xff);
    this.MsgSetNotSignpost();
  }

  DisableMsgBoxWalkaway(): void { this.msgBoxWalkawayDisabled = true; }
  EnableMsgBoxWalkaway(): void { this.msgBoxWalkawayDisabled = false; }
  IsMsgBoxWalkawayDisabled(): boolean { return this.msgBoxWalkawayDisabled; }
  ClearMsgBoxCancelableState(): void { this.msgBoxCancelable = false; }
  CanWalkAwayToCancelMsgBox(): boolean { return this.msgBoxCancelable; }
  SetWalkingIntoSignVars(): void { this.walkAwayInhibitTimer = 6; this.msgBoxCancelable = true; }
  MsgSetSignpost(): void { this.msgIsSignpost = true; }
  MsgSetNotSignpost(): void { this.msgIsSignpost = false; }
  IsMsgSignpost(): boolean { return this.msgIsSignpost; }

  // ---------------------------------------------------------------- interactions

  private tryStartInteractionScript(position: { x: number; y: number; elevation: number }, behavior: number, direction: number): boolean {
    const script = this.GetInteractionScript(position, behavior, direction);
    if (!script) return false;
    const noSound = [rom.label("PalletTown_PlayersHouse_2F_EventScript_PC"), rom.label("EventScript_PC")];
    if (!noSound.includes(script)) sound.playSE(sound.SE_SELECT);
    this.ow.script.ScriptContext_SetupScript(script);
    return true;
  }

  /** GetInteractionScript (field_control_avatar.c): preserve the C lookup order. */
  private GetInteractionScript(position: { x: number; y: number; elevation: number }, behavior: number, direction: number): number {
    return this.GetInteractedObjectEventScript(position, behavior, direction)
      || this.GetInteractedBackgroundEventScript(position, behavior, direction)
      || this.GetInteractedMetatileScript(behavior, direction)
      || this.GetInteractedWaterScript(behavior);
  }

  /** GetInteractedObjectEventScript (field_control_avatar.c), for the single-player map. */
  private GetInteractedObjectEventScript(position: { x: number; y: number; elevation: number }, behavior: number, direction: number): number {
    let object = this.ow.objects.objectAtXYZ(position.x, position.y, position.elevation);
    if (!object || object.isPlayer) {
      if (!MB.MetatileBehavior_IsCounter(behavior)) return 0;
      const [dx, dy] = DIRECTION_VECTORS[direction];
      object = this.ow.objects.objectAtXYZ(position.x + dx, position.y + dy, position.elevation);
      if (!object || object.isPlayer) return 0;
    }
    this.ow.selectedObject = this.ow.objects.indexOf(object);
    varSet(SV.LAST_TALKED, object.localId);
    varSet(SV.FACING, direction);
    return GetRamScript(object.localId, object.template?.script ?? 0);
  }

  /** GetBackgroundEventAtPosition (field_control_avatar.c), including wildcard elevation 0. */
  private GetBackgroundEventAtPosition(x: number, y: number, elevation: number) {
    return this.ow.header.bgs.find((bg) => bg.x === x && bg.y === y && (bg.elevation === elevation || bg.elevation === 0));
  }

  /** GetInteractedBackgroundEventScript (field_control_avatar.c). */
  private GetInteractedBackgroundEventScript(position: { x: number; y: number; elevation: number }, behavior: number, direction: number): number {
    const bg = this.GetBackgroundEventAtPosition(position.x - MAP_OFFSET, position.y - MAP_OFFSET, position.elevation);
    if (!bg) return 0;
    if (bg.type === "hidden_item") {
      if (bg.underfoot) return 0;
      varSet(SV.x8005, bg.item);
      varSet(SV.x8004, bg.flag);
      varSet(SV.x8006, bg.quantity);
      if (flagGet(bg.flag)) return 0;
      varSet(SV.FACING, direction);
      return rom.label("EventScript_HiddenItemScript");
    }
    if (!bg.script) return rom.label("EventScript_TestSignpostMsg");
    const c = rom.constants;
    switch (bg.facing) {
      case c.BG_EVENT_PLAYER_FACING_NORTH: if (direction !== DIR_NORTH) return 0; break;
      case c.BG_EVENT_PLAYER_FACING_SOUTH: if (direction !== DIR_SOUTH) return 0; break;
      case c.BG_EVENT_PLAYER_FACING_EAST: if (direction !== DIR_EAST) return 0; break;
      case c.BG_EVENT_PLAYER_FACING_WEST: if (direction !== DIR_WEST) return 0; break;
    }
    if (this.GetFacingSignpostType(behavior, direction) !== SIGNPOST_NA) this.MsgSetSignpost();
    varSet(SV.FACING, direction);
    return bg.script;
  }

  /** GetInteractedMetatileScript (field_control_avatar.c). */
  private GetInteractedMetatileScript(behavior: number, direction: number): number {
    varSet(SV.FACING, direction);
    const table: Array<[(b: number, d: number) => boolean, string, boolean?]> = [
      [MB.MetatileBehavior_IsPC, "EventScript_PC"],
      [MB.MetatileBehavior_IsRegionMap, "EventScript_WallTownMap"],
      [MB.MetatileBehavior_IsBookshelf, "EventScript_Bookshelf"],
      [MB.MetatileBehavior_IsPokeMartShelf, "EventScript_PokeMartShelf"],
      [MB.MetatileBehavior_IsFood, "EventScript_Food"],
      [MB.MetatileBehavior_IsImpressiveMachine, "EventScript_ImpressiveMachine"],
      [MB.MetatileBehavior_IsBlueprints, "EventScript_Blueprints"],
      [MB.MetatileBehavior_IsVideoGame, "EventScript_VideoGame"],
      [MB.MetatileBehavior_IsBurglary, "EventScript_Burglary"],
      [MB.MetatileBehavior_IsComputer, "EventScript_Computer"],
      [MB.MetatileBehavior_IsTrainerTowerMonitor, "TrainerTower_EventScript_ShowTime"],
      [MB.MetatileBehavior_IsPlayerFacingTVScreen, "EventScript_PlayerFacingTVScreen"],
      [MB.MetatileBehavior_IsCabinet, "EventScript_Cabinet"],
      [MB.MetatileBehavior_IsKitchen, "EventScript_Kitchen"],
      [MB.MetatileBehavior_IsDresser, "EventScript_Dresser"],
      [MB.MetatileBehavior_IsSnacks, "EventScript_Snacks"],
      [MB.MetatileBehavior_IsPainting, "EventScript_Painting"],
      [MB.MetatileBehavior_IsPowerPlantMachine, "EventScript_PowerPlantMachine"],
      [MB.MetatileBehavior_IsTelephone, "EventScript_Telephone"],
      [MB.MetatileBehavior_IsAdvertisingPoster, "EventScript_AdvertisingPoster"],
      [MB.MetatileBehavior_IsTastyFood, "EventScript_TastyFood"],
      [MB.MetatileBehavior_IsTrashBin, "EventScript_TrashBin"],
      [MB.MetatileBehavior_IsCup, "EventScript_Cup"],
      [MB.MetatileBehavior_IsPolishedWindow, "EventScript_PolishedWindow"],
      [MB.MetatileBehavior_IsBeautifulSkyWindow, "EventScript_BeautifulSkyWindow"],
      [MB.MetatileBehavior_IsBlinkingLights, "EventScript_BlinkingLights"],
      [MB.MetatileBehavior_IsNeatlyLinedUpTools, "EventScript_NeatlyLinedUpTools"],
      [MB.MetatileBehavior_IsPlayerFacingCableClubWirelessMonitor, "CableClub_EventScript_ShowWirelessCommunicationScreen"],
      [MB.MetatileBehavior_IsQuestionnaire, "EventScript_Questionnaire"],
      [MB.MetatileBehavior_IsPlayerFacingBattleRecords, "CableClub_EventScript_ShowBattleRecords"],
      [MB.MetatileBehavior_IsIndigoPlateauSign1, "EventScript_Indigo_UltimateGoal", true],
      [MB.MetatileBehavior_IsIndigoPlateauSign2, "EventScript_Indigo_HighestAuthority", true],
      [MB.MetatileBehavior_IsPlayerFacingPokeMartSign, "EventScript_PokemartSign", true],
      [MB.MetatileBehavior_IsPlayerFacingPokemonCenterSign, "EventScript_PokecenterSign", true],
    ];
    for (const [check, label, signpost] of table) {
      if (check(behavior, direction)) {
        if (signpost) this.MsgSetSignpost();
        return rom.label(label);
      }
    }
    return 0;
  }

  /** GetInteractedWaterScript (field_control_avatar.c); direction is unused by C. */
  private GetInteractedWaterScript(behavior: number): number {
    const player = this.ow.player;
    if (MB.MetatileBehavior_IsFastWater(behavior) && player.PartyHasMonWithSurf()) return rom.label("EventScript_CurrentTooFast");
    if (flagGet(rom.c("FLAG_BADGE05_GET")) && player.PartyHasMonWithSurf() && player.IsPlayerFacingSurfableFishableWater()) return rom.label("EventScript_UseSurf");
    if (MB.MetatileBehavior_IsWaterfall(behavior)) {
      if (flagGet(rom.c("FLAG_BADGE07_GET")) && player.IsPlayerSurfingNorth()) return rom.label("EventScript_Waterfall");
      return rom.label("EventScript_CantUseWaterfall");
    }
    return 0;
  }

  // ---------------------------------------------------------------- step events

  private tryStartStepBasedScript(position: { x: number; y: number; elevation: number }, behavior: number, _direction: number): boolean {
    if (this.tryStartCoordEventScript(position)) return true;
    if (this.tryStartWarpEventScript(position, behavior)) return true;
    if (this.tryStartStepCountScript(behavior)) return true;
    if (!(this.ow.player.flags & PLAYER_AVATAR_FLAG_FORCED) && !MB.MetatileBehavior_IsForcedMovementTile(behavior) && this.ow.effects.updateRepelCounter()) return true;
    return false;
  }

  private tryStartCoordEventScript(position: { x: number; y: number; elevation: number }): boolean {
    const script = this.GetCoordEventScriptAtMapPosition(position);
    if (!script) return false;
    this.ow.script.ScriptContext_SetupScript(script);
    return true;
  }

  /** TryRunCoordEventScript (field_control_avatar.c), including weather and immediate-script side effects. */
  private TryRunCoordEventScript(event: (typeof this.ow.header.coords)[number]): number {
    if (!event.script) {
      DoCoordEventWeather(event.var);
      return 0;
    }
    if (event.var === 0) {
      this.ow.script.RunScriptImmediately(event.script);
      return 0;
    }
    return varGet(event.var) === (event.value & 0xff) ? event.script : 0;
  }

  /** GetCoordEventScriptAtPosition (field_control_avatar.c). */
  private GetCoordEventScriptAtPosition(x: number, y: number, elevation: number): number {
    for (const event of this.ow.header.coords) {
      if (event.x !== x || event.y !== y) continue;
      if (event.elevation !== elevation && event.elevation !== 0) continue;
      const script = this.TryRunCoordEventScript(event);
      if (script) return script;
    }
    return 0;
  }

  /** GetCoordEventScriptAtMapPosition (field_control_avatar.c). */
  private GetCoordEventScriptAtMapPosition(position: { x: number; y: number; elevation: number }): number {
    return this.GetCoordEventScriptAtPosition(position.x - MAP_OFFSET, position.y - MAP_OFFSET, position.elevation);
  }

  private tryStartStepCountScript(behavior: number): boolean {
    this.updateHappinessStepCounter();
    if (!(this.ow.player.flags & PLAYER_AVATAR_FLAG_FORCED) && !MB.MetatileBehavior_IsForcedMovementTile(behavior)) {
      if (updateVsSeekerStepCounter()) {
        this.ow.script.ScriptContext_SetupScript(rom.label("EventScript_VsSeekerChargingDone"));
        return true;
      }
      if (this.ow.effects.updatePoisonStepCounter()) {
        this.ow.script.ScriptContext_SetupScript(rom.label("EventScript_FieldPoison"));
        return true;
      }
      if (this.ow.game.shouldEggHatch()) {
        incrementGameStat(rom.constants.GAME_STAT_HATCHED_EGGS ?? 0);
        this.ow.script.ScriptContext_SetupScript(rom.label("EventScript_EggHatch"));
        return true;
      }
    }
    if (this.ow.effects.safariZoneTakeStep()) return true;
    return false;
  }

  private updateHappinessStepCounter(): void {
    const id = rom.c("VAR_HAPPINESS_STEP_COUNTER");
    const value = (varGet(id) + 1) % 128;
    varSet(id, value);
    if (value === 0) {
      for (const mon of save.party) AdjustFriendship(mon, C.FRIENDSHIP_EVENT_WALKING);
    }
  }

  // ---------------------------------------------------------------- signposts

  /** GetFacingSignpostType (field_control_avatar.c). */
  private GetFacingSignpostType(behavior: number, direction: number): number {
    if (MB.MetatileBehavior_IsPlayerFacingPokemonCenterSign(behavior, direction)) return SIGNPOST_POKECENTER;
    if (MB.MetatileBehavior_IsPlayerFacingPokeMartSign(behavior, direction)) return SIGNPOST_POKEMART;
    if (MB.MetatileBehavior_IsIndigoPlateauSign1(behavior)) return SIGNPOST_INDIGO_1;
    if (MB.MetatileBehavior_IsIndigoPlateauSign2(behavior)) return SIGNPOST_INDIGO_2;
    if (MB.MetatileBehavior_IsSignpost(behavior)) return SIGNPOST_SCRIPTED;
    return SIGNPOST_NA;
  }

  /** SetUpWalkIntoSignScript (field_control_avatar.c). */
  private SetUpWalkIntoSignScript(script: number, playerDirection: number): void {
    varSet(SV.FACING, playerDirection);
    this.ow.script.ScriptContext_SetupScript(script);
    this.SetWalkingIntoSignVars();
    this.MsgSetSignpost();
  }

  private trySetUpWalkIntoSignpostScript(position: { x: number; y: number; elevation: number }, behavior: number, direction: number): boolean {
    if (JOY_HELD(DPAD_LEFT | DPAD_RIGHT)) return false;
    if (direction === DIR_EAST || direction === DIR_WEST) return false;
    const type = this.GetFacingSignpostType(behavior, direction);
    if (type === SIGNPOST_POKECENTER) { this.SetUpWalkIntoSignScript(rom.label("EventScript_PokecenterSign"), direction); return true; }
    if (type === SIGNPOST_POKEMART) { this.SetUpWalkIntoSignScript(rom.label("EventScript_PokemartSign"), direction); return true; }
    if (type === SIGNPOST_INDIGO_1) { this.SetUpWalkIntoSignScript(rom.label("EventScript_Indigo_UltimateGoal"), direction); return true; }
    if (type === SIGNPOST_INDIGO_2) { this.SetUpWalkIntoSignScript(rom.label("EventScript_Indigo_HighestAuthority"), direction); return true; }
    const script = this.GetSignpostScriptAtMapPosition(position);
    if (!script) return false;
    if (type !== SIGNPOST_SCRIPTED) return false;
    this.SetUpWalkIntoSignScript(script, direction);
    return true;
  }

  /** GetSignpostScriptAtMapPosition (field_control_avatar.c). */
  private GetSignpostScriptAtMapPosition(position: { x: number; y: number; elevation: number }): number {
    const event = this.GetBackgroundEventAtPosition(position.x - MAP_OFFSET, position.y - MAP_OFFSET, position.elevation);
    if (!event) return 0;
    return ("script" in event && event.script) || rom.label("EventScript_TestSignpostMsg");
  }

  // ---------------------------------------------------------------- warps

  /** GetWarpEventAtPosition (field_control_avatar.c). */
  private GetWarpEventAtPosition(x: number, y: number, elevation: number): number {
    return this.ow.header.warps.findIndex((w) => w.x === x && w.y === y && (w.elevation === elevation || w.elevation === 0));
  }

  /** GetWarpEventAtMapPosition (field_control_avatar.c). */
  private GetWarpEventAtMapPosition(position: { x: number; y: number; elevation: number }): number {
    return this.GetWarpEventAtPosition(position.x - MAP_OFFSET, position.y - MAP_OFFSET, position.elevation);
  }

  private isWarpMetatileBehavior(b: number): boolean {
    return MB.MetatileBehavior_IsWarpDoor(b) || MB.MetatileBehavior_IsLadder(b) || MB.MetatileBehavior_IsEscalator(b) || MB.MetatileBehavior_IsNonAnimDoor(b)
      || MB.MetatileBehavior_IsLavaridgeB1FWarp(b) || MB.MetatileBehavior_IsLavaridge1FWarp(b) || MB.MetatileBehavior_IsWarpPad(b)
      || MB.MetatileBehavior_IsFallWarp(b) || MB.MetatileBehavior_IsUnionRoomWarp(b);
  }

  private isArrowWarp(b: number, direction: number): boolean {
    switch (direction) {
      case DIR_NORTH: return MB.MetatileBehavior_IsNorthArrowWarp(b);
      case DIR_SOUTH: return MB.MetatileBehavior_IsSouthArrowWarp(b);
      case DIR_WEST: return MB.MetatileBehavior_IsWestArrowWarp(b);
      case DIR_EAST: return MB.MetatileBehavior_IsEastArrowWarp(b);
    }
    return false;
  }

  /** SetupWarp */
  private setupWarp(warpIndex: number, position: { x: number; y: number }): void {
    const warp = this.ow.header.warps[warpIndex];
    if (warp.destMap === "MAP_DYNAMIC") {
      this.ow.SetWarpDestinationToDynamicWarp(warp.destWarpId);
      return;
    }
    const num = rom.mapNum(warp.destMap);
    this.ow.SetWarpDestinationToMapWarp(num >> 8, num & 0xff, warp.destWarpId);
    this.ow.updateEscapeWarp(position.x, position.y);
    const destHeader = rom.cachedMap(warp.destMap);
    const back = destHeader?.warps[warp.destWarpId];
    if (back && back.destMap === "MAP_DYNAMIC") {
      this.ow.SetDynamicWarp(warp.destWarpId, save.location.mapGroup, save.location.mapNum, warpIndex);
    }
  }

  private tryArrowWarp(position: { x: number; y: number; elevation: number }, behavior: number, direction: number): boolean {
    const warpIndex = this.GetWarpEventAtMapPosition(position);
    if (warpIndex < 0) return false;
    if (this.isArrowWarp(behavior, direction)) {
      this.ow.storeInitialPlayerAvatarState();
      this.setupWarp(warpIndex, position);
      this.ow.doWarp();
      return true;
    }
    if (this.ow.player.isDirectionalStairWarp(behavior, direction)) {
      let delay = 0;
      if (this.ow.player.flags & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE)) {
        this.ow.player.setTransitionFlags(PLAYER_AVATAR_FLAG_ON_FOOT);
        delay = 12;
      }
      this.ow.storeInitialPlayerAvatarState();
      this.setupWarp(warpIndex, position);
      this.ow.doStairWarp(behavior, delay);
      return true;
    }
    return false;
  }

  private tryStartWarpEventScript(position: { x: number; y: number; elevation: number }, behavior: number): boolean {
    const warpIndex = this.GetWarpEventAtMapPosition(position);
    if (warpIndex < 0 || !this.isWarpMetatileBehavior(behavior)) return false;
    this.ow.storeInitialPlayerAvatarState();
    this.setupWarp(warpIndex, position);
    if (MB.MetatileBehavior_IsEscalator(behavior)) {
      // special_field_anim.c draws the escalator's three transition stages
      // before the field effect begins the map fade. field_effect.c also moves
      // the avatar along the rail; this web path preserves the staged tiles
      // and delays the warp until their source task reaches its final stage.
      this.ow.controlsLocked = true;
      this.ow.objects.freezeAll();
      StartEscalator(this.ow, behavior === MB.MB_UP_ESCALATOR);
      tasks.create((taskId) => {
        if (IsEscalatorMoving()) return;
        StopEscalator();
        tasks.destroy(taskId);
        this.ow.doWarp();
      }, 0);
      return true;
    }
    if (MB.MetatileBehavior_IsWarpPad(behavior)) {
      this.ow.doTeleportWarp();
      return true;
    }
    if (MB.MetatileBehavior_IsFallWarp(behavior)) {
      this.ow.resetInitialPlayerAvatarState();
      this.ow.script.ScriptContext_SetupScript(rom.label("EventScript_DoFallWarp"));
      return true;
    }
    this.ow.doWarp();
    return true;
  }

  private tryDoorWarp(position: { x: number; y: number; elevation: number }, behavior: number, direction: number): boolean {
    if (direction !== DIR_NORTH || !MB.MetatileBehavior_IsWarpDoor(behavior)) return false;
    const warpIndex = this.GetWarpEventAtMapPosition(position);
    if (warpIndex < 0 || !this.isWarpMetatileBehavior(behavior)) return false;
    this.ow.storeInitialPlayerAvatarState();
    this.setupWarp(warpIndex, position);
    this.ow.doDoorWarp();
    return true;
  }
}

export { DIR_NONE };
