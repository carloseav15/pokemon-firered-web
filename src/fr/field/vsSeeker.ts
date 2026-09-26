// vs_seeker.c: the VS Seeker key item (charge counter, trainer responses and
// rematch state), plus the rematch lookups battle_setup.c uses.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { tasks } from "../gba/tasks";
import { cdata } from "../hw/assets";
import { random } from "../random";
import { rom } from "../rom";
import { flagClear, flagGet, flagSet, save, SV, varGet } from "../save";
import { checkBagHasItem } from "../pokemon/items";
import type { Game } from "../game";
import type { ObjectEvent } from "./objectEvents";
import { PLAYER_AVATAR_GFX_VSSEEKER } from "./playerAvatar";

const MAX_REMATCH_PARTIES = 6;
const SKIP = 0xffff;
const MAX_REMATCH_ENTRIES = 100;
type RematchData = { trainerIdxs: number[]; mapGroup: number; mapNum: number };

let rematchTable: RematchData[] | undefined;
function sRematches(): RematchData[] {
  if (!rematchTable) rematchTable = cdata<RematchData[]>("vs_seeker", "sRematches");
  return rematchTable;
}

function rematches(): number[] {
  if (!save.trainerRematches) save.trainerRematches = new Array(MAX_REMATCH_ENTRIES).fill(0);
  return save.trainerRematches;
}

function stepCounter(): number { return save.trainerRematchStepCounter ?? 0; }
function setStepCounter(v: number): void { save.trainerRematchStepCounter = v & 0xffff; }

const hasTrainerBeenFought = (trainerId: number): boolean => flagGet(C.TRAINER_FLAGS_START + trainerId);

/** GetTrainerFlagFromScript: the trainer id is at +2 of a script that starts with trainerbattle. */
function trainerFlagFromScript(script: number): number {
  return script ? rom.u8(script + 2) | (rom.u8(script + 3) << 8) : 0;
}

function randomFaceDirectionMovementType(): number {
  return [C.MOVEMENT_TYPE_FACE_UP, C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_LEFT, C.MOVEMENT_TYPE_FACE_RIGHT][random() % 4];
}

const isRaiseHand = (type: number): boolean =>
  type === C.MOVEMENT_TYPE_RAISE_HAND_AND_STOP || type === C.MOVEMENT_TYPE_RAISE_HAND_AND_JUMP || type === C.MOVEMENT_TYPE_RAISE_HAND_AND_SWIM;

function runningBehaviorFromGraphicsId(gfx: number): number {
  const jumpers = ["LITTLE_GIRL", "YOUNGSTER", "BOY", "BUG_CATCHER", "LASS", "WOMAN_1", "CRUSH_GIRL", "MAN", "ROCKER", "WOMAN_2", "BEAUTY",
    "BALDING_MAN", "TUBER_F", "CAMPER", "PICNICKER", "COOLTRAINER_M", "COOLTRAINER_F", "SWIMMER_M_LAND", "SWIMMER_F_LAND", "BLACK_BELT", "HIKER", "SAILOR"];
  if (jumpers.some((n) => rom.constants[`OBJ_EVENT_GFX_${n}`] === gfx)) return C.MOVEMENT_TYPE_RAISE_HAND_AND_JUMP;
  if (["TUBER_M_WATER", "SWIMMER_M_WATER", "SWIMMER_F_WATER"].some((n) => rom.constants[`OBJ_EVENT_GFX_${n}`] === gfx)) return C.MOVEMENT_TYPE_RAISE_HAND_AND_SWIM;
  return C.MOVEMENT_TYPE_RAISE_HAND_AND_STOP;
}

function nextAvailableRematchTrainer(trainerFlagNo: number): { idx: number; j: number } {
  const table = sRematches();
  for (let i = 0; i < table.length; i++) {
    const ids = table[i].trainerIdxs;
    if (ids[0] !== trainerFlagNo) continue;
    let j = 1;
    for (; j < MAX_REMATCH_PARTIES; j++) {
      const id = ids[j] ?? C.TRAINER_NONE;
      if (id === C.TRAINER_NONE) return { idx: i, j: j - 1 };
      if (id === SKIP) continue;
      if (hasTrainerBeenFought(id)) continue;
      return { idx: i, j };
    }
    return { idx: i, j: j - 1 };
  }
  return { idx: 0, j: 0 };
}

function lookupOpponent(trainerId: number): number {
  const table = sRematches();
  for (let i = 0; i < table.length; i++) {
    for (let j = 0; j < MAX_REMATCH_PARTIES; j++) {
      const id = table[i].trainerIdxs[j] ?? 0;
      if (id === 0) break;
      if (id === SKIP) continue;
      if (id === trainerId) return i;
    }
  }
  return -1;
}

function rematchIdx(trainerFlagIdx: number): number {
  return sRematches().findIndex((r) => r.trainerIdxs[0] === trainerFlagIdx);
}

/** TryGetRematchTrainerIdGivenGameState */
function rematchIdGivenGameState(ids: number[], rematch: number): number {
  const back = (idx: number): number => {
    while (--idx !== 0) if ((ids[idx] ?? 0) !== SKIP) return idx;
    return 0;
  };
  switch (rematch) {
    case 1: if (!flagGet(C.FLAG_GOT_VS_SEEKER)) return back(rematch); break;
    case 2: if (!flagGet(C.FLAG_WORLD_MAP_CELADON_CITY)) return back(rematch); break;
    case 3: if (!flagGet(C.FLAG_WORLD_MAP_FUCHSIA_CITY)) return back(rematch); break;
    case 4: if (!flagGet(C.FLAG_SYS_GAME_CLEAR)) return back(rematch); break;
    case 5: if (!flagGet(C.FLAG_SYS_CAN_LINK_WITH_RS)) return back(rematch); break;
  }
  return rematch;
}

/** GetRematchTrainerId */
export function getRematchTrainerId(trainerId: number): number {
  const { idx, j } = nextAvailableRematchTrainer(trainerId);
  if (!j) return 0;
  return sRematches()[idx].trainerIdxs[rematchIdGivenGameState(sRematches()[idx].trainerIdxs, j)];
}

const isThisTrainerRematchable = (localId: number): boolean => !!rematches()[localId];

/** ShouldTryRematchBattle */
export function shouldTryRematchBattle(opponent: number): boolean {
  const idx = rematchIdx(opponent);
  if (idx !== -1 && isThisTrainerRematchable(varGet(SV.LAST_TALKED))) return true;
  if (idx === -1) return false;
  return hasTrainerBeenFought(sRematches()[idx].trainerIdxs[0]);
}

/** IsTrainerReadyForRematch */
export function isTrainerReadyForRematch(opponent: number): boolean {
  const idx = lookupOpponent(opponent);
  return idx !== -1 && isThisTrainerRematchable(varGet(SV.LAST_TALKED));
}

/** ClearRematchStateOfLastTalked */
export function clearRematchStateOfLastTalked(): void {
  rematches()[varGet(SV.LAST_TALKED)] = 0;
}

/** ClearRematchStateByTrainerId */
export function clearRematchStateByTrainerId(game: Game, opponent: number): void {
  const idx = lookupOpponent(opponent);
  if (idx === -1) return;
  const ow = game.overworld;
  const faceTypes = [C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_UP, C.MOVEMENT_TYPE_FACE_LEFT, C.MOVEMENT_TYPE_FACE_RIGHT];
  for (const t of ow.objects.templates) {
    if (t.trainerType !== C.TRAINER_TYPE_NORMAL && t.trainerType !== C.TRAINER_TYPE_BURIED) continue;
    if (lookupOpponent(trainerFlagFromScript(t.script)) !== idx) continue;
    const o = ow.objects.byLocalIdAndMap(t.localId, save.location.mapNum, save.location.mapGroup);
    rematches()[t.localId] = 0;
    if (!o) continue;
    randomFaceDirectionMovementType();
    t.movementType = faceTypes[o.facingDirection];
    o.movementType = ow.objects.objects[ow.selectedObject] === o ? faceTypes[o.facingDirection] : C.MOVEMENT_TYPE_FACE_DOWN;
  }
}

function clearAllTrainerRematchStates(): void {
  rematches().fill(0);
}

/** UpdateVsSeekerStepCounter: true when the charge completes. */
export function updateVsSeekerStepCounter(): boolean {
  let counter = stepCounter();
  if (checkBagHasItem(C.ITEM_VS_SEEKER, 1) && (counter & 0xff) < 100) counter++;
  setStepCounter(counter);
  if (flagGet(C.FLAG_SYS_VS_SEEKER_CHARGING)) {
    if (((counter >> 8) & 0xff) < 100) setStepCounter((counter & 0xff) | ((((counter >> 8) & 0xff) + 1) << 8));
    if (((stepCounter() >> 8) & 0xff) === 100) {
      flagClear(C.FLAG_SYS_VS_SEEKER_CHARGING);
      setStepCounter(stepCounter() & 0xff);
      clearAllTrainerRematchStates();
      return true;
    }
  }
  return false;
}

/** MapResetTrainerRematches (on every map load) */
export function mapResetTrainerRematches(game: Game): void {
  flagClear(C.FLAG_SYS_VS_SEEKER_CHARGING);
  setStepCounter(stepCounter() & 0xff);
  clearAllTrainerRematchStates();
  for (const o of game.overworld.objects.list) {
    if (!isRaiseHand(o.movementType)) continue;
    o.sprite.x2 = 0;
    o.sprite.y2 = 0;
    game.overworld.objects.setTrainerMovementType(o, randomFaceDirectionMovementType());
  }
}

/** VsSeekerFreezeObjectsAfterChargeComplete */
export function vsSeekerFreezeObjectsAfterChargeComplete(game: Game): void {
  const ow = game.overworld;
  let standing = 0, frozen = 0;
  const id = tasks.create(() => {
    if (!standing && ow.player.isStandingStill()) {
      ow.objects.ObjectEventClearHeldMovementIfFinished(ow.player.object);
      standing = 1;
    }
    if (!frozen) {
      for (const o of ow.objects.list) {
        if (o.singleMovementActive) return;
        ow.objects.freeze(o);
      }
    }
    frozen = 1;
    if (standing) {
      tasks.destroy(id);
      ow.player.runningState = 0;
      ow.script.ScriptContext_Enable();
    }
  }, 80);
}

/** VsSeekerResetObjectMovementAfterChargeComplete */
export function vsSeekerResetObjectMovementAfterChargeComplete(game: Game): void {
  const ow = game.overworld;
  for (const t of ow.objects.templates) {
    if (t.trainerType !== C.TRAINER_TYPE_NORMAL && t.trainerType !== C.TRAINER_TYPE_BURIED) continue;
    if (!isRaiseHand(t.movementType)) continue;
    const type = randomFaceDirectionMovementType();
    const o = ow.objects.byLocalIdAndMap(t.localId, save.location.mapNum, save.location.mapGroup);
    if (o) ow.objects.setTrainerMovementType(o, type);
    t.movementType = type;
  }
}

type TrainerInfo = { script: number; trainerIdx: number; localId: number; object: ObjectEvent | undefined; x: number; y: number; graphicsId: number };

/** Task_VsSeeker_0..3 */
export function useVsSeeker(game: Game, showMessage: (text: Uint8Array, next: () => void) => void, release: () => void): void {
  const ow = game.overworld;
  const info: TrainerInfo[] = ow.objects.templates
    .filter((t) => t.trainerType === C.TRAINER_TYPE_NORMAL || t.trainerType === C.TRAINER_TYPE_BURIED)
    .map((t) => {
      const object = ow.objects.byLocalIdAndMap(t.localId, save.location.mapNum, save.location.mapGroup);
      return { script: t.script, trainerIdx: trainerFlagFromScript(t.script), localId: t.localId, object,
        x: (object?.currentCoords.x ?? 0) - 7, y: (object?.currentCoords.y ?? 0) - 7, graphicsId: t.graphicsId };
    });
  const visible = (t: TrainerInfo): boolean => {
    const p = ow.player.object;
    const x = p.currentCoords.x - 7, y = p.currentCoords.y - 7;
    return x - 7 <= t.x && x + 7 >= t.x && y - 5 <= t.y && y + 5 >= t.y && !!t.object?.active;
  };
  const charge = stepCounter() & 0xff;
  if (charge !== 100) {
    // TV_PrintIntToStringVar(0, 100 - steps)
    import("../gba/charmap").then(({ stringVars, encode }) => {
      stringVars.var1 = encode(String(100 - charge));
      showMessage(rom.text("VSSeeker_Text_BatteryNotChargedNeedXSteps"), release);
    });
    return;
  }
  const rematchable = info.find((t) => visible(t) && (!hasTrainerBeenFought(t.trainerIdx) || nextAvailableRematchTrainer(t.trainerIdx).j));
  if (!rematchable) { showMessage(rom.text("VSSeeker_Text_NoTrainersWithinRange"), release); return; }

  // FLDEFF_USE_VS_SEEKER
  const player = ow.player.object;
  ow.controlsLocked = true;
  ow.objects.freezeAll();
  ow.player.preventStep = true;
  let state = 0, d0 = 15, d1 = 0, d2 = 0;
  let fxState = 0;
  const fx = tasks.create(() => {
    switch (fxState) {
      case 0:
        if (!ow.objects.isMovementOverridden(player) || ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
          ow.player.setState(PLAYER_AVATAR_GFX_VSSEEKER);
          player.sprite.startAnim(0);
          ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_START_ANIM_IN_DIRECTION);
          fxState = 1;
        }
        break;
      case 1:
        if (ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
          ow.player.setState(ow.player.currentStateId());
          ow.objects.forceSetHeldMovement(player, [0, 0, 1, 2, 3][player.facingDirection] ?? 0);
          fxState = 2;
        }
        break;
      case 2:
        if (ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
          ow.player.preventStep = false;
          fxState = 3;
          tasks.destroy(fx);
        }
        break;
    }
  }, 0xff);

  let responseCode = 0;
  const wantsRematch: Array<{ trainerIdx: number; behavior: number }> = [];
  const id = tasks.create(() => {
    switch (state) {
      case 0:
        if (--d0 === 0) { state = 1; d1 = 16; }
        break;
      case 1:
        if (d2 !== 2 && --d1 === 0) { sound.playSE(C.SE_CONTEST_MONS_TURN); d1 = 11; d2++; }
        if (fxState === 3) {
          setStepCounter(stepCounter() & 0xff00);
          responseCode = responseInArea();
          game.scriptMovement.startBytes(ow.player.object, [C.MOVEMENT_ACTION_DELAY_16, C.MOVEMENT_ACTION_DELAY_16, C.MOVEMENT_ACTION_DELAY_16, C.MOVEMENT_ACTION_STEP_END]);
          state = 2;
        }
        break;
      case 2:
        if (!game.scriptMovement.isFinished(ow.player.object)) break;
        tasks.destroy(id);
        if (responseCode === 0) { showMessage(rom.text("VSSeeker_Text_TrainersNotReady"), release); return; }
        if (responseCode === 2) startAllRespondantIdleMovements();
        release();
        break;
    }
  }, 80);

  const startMovement = (t: TrainerInfo, bytes: number[]): void => {
    if (t.object) ow.objects.unfreeze(t.object);
    game.scriptMovement.startBytes(t.object, bytes);
  };
  const responseInArea = (): number => {
    let notYet = false, noRematch = false, yes = false;
    info.forEach((t, index) => {
      if (!visible(t)) return;
      if (!hasTrainerBeenFought(t.trainerIdx)) {
        startMovement(t, [C.MOVEMENT_ACTION_EMOTE_EXCLAMATION_MARK, C.MOVEMENT_ACTION_STEP_END]);
        notYet = true;
        return;
      }
      const rematchTrainerIdx = nextAvailableRematchTrainer(t.trainerIdx).j;
      if (rematchTrainerIdx === 0) {
        startMovement(t, [C.MOVEMENT_ACTION_EMOTE_X, C.MOVEMENT_ACTION_STEP_END]);
        noRematch = true;
        return;
      }
      let rval = random() % 100;
      // GetCurVsSeekerResponse: an earlier copy of the same trainer decides this one.
      for (let i = 0; i < index; i++) {
        if (visible(info[i]) && info[i].trainerIdx === t.trainerIdx) {
          rval = wantsRematch.some((w) => w.trainerIdx === t.trainerIdx) ? 100 : 0;
          break;
        }
      }
      if (rval < 30) {
        startMovement(t, [C.MOVEMENT_ACTION_EMOTE_X, C.MOVEMENT_ACTION_STEP_END]);
        noRematch = true;
      } else {
        rematches()[t.localId] = rematchTrainerIdx;
        if (t.object) ow.objects.shiftStill(t.object);
        startMovement(t, [C.MOVEMENT_ACTION_WALK_IN_PLACE_FASTER_DOWN, C.MOVEMENT_ACTION_EMOTE_DOUBLE_EXCL_MARK, C.MOVEMENT_ACTION_STEP_END]);
        wantsRematch.push({ trainerIdx: t.trainerIdx, behavior: runningBehaviorFromGraphicsId(t.graphicsId) });
        yes = true;
      }
    });
    void noRematch;
    if (yes) {
      sound.playSE(C.SE_PIN);
      flagSet(C.FLAG_SYS_VS_SEEKER_CHARGING);
      setStepCounter(stepCounter() & 0xff);
      return 2;
    }
    return notYet ? 1 : 0;
  };
  const startAllRespondantIdleMovements = (): void => {
    for (const w of wantsRematch) {
      for (const t of info) {
        if (t.trainerIdx !== w.trainerIdx || !t.object) continue;
        ow.objects.setTrainerMovementType(t.object, w.behavior);
        ow.objects.overrideTemplateMovementType(t.object, w.behavior);
        rematches()[t.localId] = nextAvailableRematchTrainer(t.trainerIdx).j;
      }
    }
  };
}
