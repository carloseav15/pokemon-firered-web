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
import type { Overworld } from "./overworld";
import { PLAYER_AVATAR_GFX_VSSEEKER } from "./playerAvatar";
import { ItemUse_SetQuestLogEvent, Task_ItemUse_CloseMessageBoxAndReturnToField } from "../itemUse";

const MAX_REMATCH_PARTIES = 6;
const SKIP = 0xffff;
const MAX_REMATCH_ENTRIES = 100;
type RematchData = { trainerIdxs: number[]; mapGroup: number; mapNum: number };

/** FLDEFF_USE_VS_SEEKER avatar animation shared by the item flow and Quest Log playback. */
export function StartVsSeekerFieldEffect(ow: Overworld): () => boolean {
  const player = ow.player.object;
  ow.player.preventStep = true;
  let state = 0;
  const id = tasks.create(() => {
    switch (state) {
      case 0:
        if (!ow.objects.isMovementOverridden(player) || ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
          ow.player.StartPlayerAvatarVsSeekerAnim();
          ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_START_ANIM_IN_DIRECTION);
          state++;
        }
        break;
      case 1:
        if (ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
          ow.player.setState(ow.player.currentStateId());
          ow.objects.forceSetHeldMovement(player, [0, 0, 1, 2, 3][player.facingDirection] ?? 0);
          state++;
        }
        break;
      case 2:
        if (ow.objects.ObjectEventClearHeldMovementIfFinished(player)) {
          ow.player.preventStep = false;
          state++;
          tasks.destroy(id);
        }
        break;
    }
  }, 0xff);
  return () => state === 3;
}

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

/** VsSeekerResetInBagStepCounter. */
function VsSeekerResetInBagStepCounter(): void { setStepCounter(stepCounter() & 0xff00); }

/** VsSeekerSetStepCounterInBagFull. */
function VsSeekerSetStepCounterInBagFull(): void { setStepCounter((stepCounter() & 0xff00) | 100); }

/** VsSeekerResetChargingStepCounter. */
function VsSeekerResetChargingStepCounter(): void { setStepCounter(stepCounter() & 0x00ff); }

/** VsSeekerSetStepCounterFullyCharged. */
function VsSeekerSetStepCounterFullyCharged(): void { setStepCounter((stepCounter() & 0x00ff) | (100 << 8)); }

const hasTrainerBeenFought = (trainerId: number): boolean => flagGet(C.TRAINER_FLAGS_START + trainerId);

/** GetTrainerFlagFromScript: the trainer id is at +2 of a script that starts with trainerbattle. */
function GetTrainerFlagFromScript(script: number): number {
  return script ? rom.u8(script + 2) | (rom.u8(script + 3) << 8) : 0;
}

function GetRandomFaceDirectionMovementType(): number {
  return [C.MOVEMENT_TYPE_FACE_UP, C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_LEFT, C.MOVEMENT_TYPE_FACE_RIGHT][random() % 4];
}

const isRaiseHand = (type: number): boolean =>
  type === C.MOVEMENT_TYPE_RAISE_HAND_AND_STOP || type === C.MOVEMENT_TYPE_RAISE_HAND_AND_JUMP || type === C.MOVEMENT_TYPE_RAISE_HAND_AND_SWIM;

function GetRunningBehaviorFromGraphicsId(gfx: number): number {
  const jumpers = ["LITTLE_GIRL", "YOUNGSTER", "BOY", "BUG_CATCHER", "LASS", "WOMAN_1", "CRUSH_GIRL", "MAN", "ROCKER", "WOMAN_2", "BEAUTY",
    "BALDING_MAN", "TUBER_F", "CAMPER", "PICNICKER", "COOLTRAINER_M", "COOLTRAINER_F", "SWIMMER_M_LAND", "SWIMMER_F_LAND", "BLACK_BELT", "HIKER", "SAILOR"];
  if (jumpers.some((n) => rom.constants[`OBJ_EVENT_GFX_${n}`] === gfx)) return C.MOVEMENT_TYPE_RAISE_HAND_AND_JUMP;
  if (["TUBER_M_WATER", "SWIMMER_M_WATER", "SWIMMER_F_WATER"].some((n) => rom.constants[`OBJ_EVENT_GFX_${n}`] === gfx)) return C.MOVEMENT_TYPE_RAISE_HAND_AND_SWIM;
  return C.MOVEMENT_TYPE_RAISE_HAND_AND_STOP;
}

function GetNextAvailableRematchTrainer(trainerFlagNo: number): { idx: number; j: number } {
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

function LookupVsSeekerOpponentInArray(trainerId: number): number {
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

function GetRematchIdx(trainerFlagIdx: number): number {
  return sRematches().findIndex((r) => r.trainerIdxs[0] === trainerFlagIdx);
}

/** GetRematchTrainerIdGivenGameState. */
function GetRematchTrainerIdGivenGameState(ids: number[], rematch: number): number {
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

/** TryGetRematchTrainerIdGivenGameState; return the C in/out index after progression gates. */
function TryGetRematchTrainerIdGivenGameState(ids: number[], rematch: number): number {
  switch (rematch) {
    case 1: if (!flagGet(C.FLAG_GOT_VS_SEEKER)) return GetRematchTrainerIdGivenGameState(ids, rematch); break;
    case 2: if (!flagGet(C.FLAG_WORLD_MAP_CELADON_CITY)) return GetRematchTrainerIdGivenGameState(ids, rematch); break;
    case 3: if (!flagGet(C.FLAG_WORLD_MAP_FUCHSIA_CITY)) return GetRematchTrainerIdGivenGameState(ids, rematch); break;
    case 4: if (!flagGet(C.FLAG_SYS_GAME_CLEAR)) return GetRematchTrainerIdGivenGameState(ids, rematch); break;
    case 5: if (!flagGet(C.FLAG_SYS_CAN_LINK_WITH_RS)) return GetRematchTrainerIdGivenGameState(ids, rematch); break;
  }
  return rematch;
}

/** GetRematchTrainerId */
export function getRematchTrainerId(trainerId: number): number {
  const { idx, j } = GetNextAvailableRematchTrainer(trainerId);
  if (!j) return 0;
  return sRematches()[idx].trainerIdxs[TryGetRematchTrainerIdGivenGameState(sRematches()[idx].trainerIdxs, j)];
}

const isThisTrainerRematchable = (localId: number): boolean => !!rematches()[localId];

/** ShouldTryRematchBattle */
export function shouldTryRematchBattle(opponent: number): boolean {
  if (ShouldTryRematchBattleInternal(opponent)) return true;
  return HasRematchTrainerAlreadyBeenFought(opponent);
}

/** IsTrainerReadyForRematch */
export function isTrainerReadyForRematch(opponent: number): boolean {
  return IsTrainerReadyForRematchInternal(opponent);
}

function ShouldTryRematchBattleInternal(trainerBattleOpponent: number): boolean {
  const idx = GetRematchIdx(trainerBattleOpponent);
  return idx >= 0 && idx < sRematches().length && isThisTrainerRematchable(varGet(SV.LAST_TALKED));
}

function HasRematchTrainerAlreadyBeenFought(trainerBattleOpponent: number): boolean {
  const idx = GetRematchIdx(trainerBattleOpponent);
  return idx !== -1 && hasTrainerBeenFought(sRematches()[idx].trainerIdxs[0]);
}

function IsTrainerReadyForRematchInternal(trainerId: number): boolean {
  const idx = LookupVsSeekerOpponentInArray(trainerId);
  return idx !== -1 && idx < sRematches().length && isThisTrainerRematchable(varGet(SV.LAST_TALKED));
}

/** ClearRematchStateOfLastTalked */
export function clearRematchStateOfLastTalked(): void {
  rematches()[varGet(SV.LAST_TALKED)] = 0;
}

/** ClearRematchStateByTrainerId */
export function clearRematchStateByTrainerId(game: Game, opponent: number): void {
  const idx = LookupVsSeekerOpponentInArray(opponent);
  if (idx === -1) return;
  const ow = game.overworld;
  const faceTypes = [C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_UP, C.MOVEMENT_TYPE_FACE_LEFT, C.MOVEMENT_TYPE_FACE_RIGHT];
  for (const t of ow.objects.templates) {
    if (t.trainerType !== C.TRAINER_TYPE_NORMAL && t.trainerType !== C.TRAINER_TYPE_BURIED) continue;
    if (LookupVsSeekerOpponentInArray(GetTrainerFlagFromScript(t.script)) !== idx) continue;
    const o = ow.objects.byLocalIdAndMap(t.localId, save.location.mapNum, save.location.mapGroup);
    rematches()[t.localId] = 0;
    if (!o) continue;
    GetRandomFaceDirectionMovementType();
    t.movementType = faceTypes[o.facingDirection];
    o.movementType = ow.objects.objects[ow.selectedObject] === o ? faceTypes[o.facingDirection] : C.MOVEMENT_TYPE_FACE_DOWN;
  }
}

function clearAllTrainerRematchStates(): void {
  rematches().fill(0);
}

/** UpdateVsSeekerStepCounter: true when the charge completes. */
export function UpdateVsSeekerStepCounter(): boolean {
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
export function MapResetTrainerRematches(game: Game): void {
  flagClear(C.FLAG_SYS_VS_SEEKER_CHARGING);
  setStepCounter(stepCounter() & 0xff);
  clearAllTrainerRematchStates();
  for (const o of game.overworld.objects.list) {
    if (!isRaiseHand(o.movementType)) continue;
    o.sprite.x2 = 0;
    o.sprite.y2 = 0;
    game.overworld.objects.setTrainerMovementType(o, GetRandomFaceDirectionMovementType());
  }
}

/** VsSeekerFreezeObjectsAfterChargeComplete */
export function Task_ResetObjectsRematchWantedState(game: Game): void {
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

/** VsSeekerFreezeObjectsAfterChargeComplete; the C task helper requires this runtime's game context. */
export function VsSeekerFreezeObjectsAfterChargeComplete(game: Game): void {
  Task_ResetObjectsRematchWantedState(game);
}

/** VsSeekerResetObjectMovementAfterChargeComplete */
export function ResetMovementOfRematchableTrainers(game: Game): void {
  const ow = game.overworld;
  for (const t of ow.objects.templates) {
    if (t.trainerType !== C.TRAINER_TYPE_NORMAL && t.trainerType !== C.TRAINER_TYPE_BURIED) continue;
    if (!isRaiseHand(t.movementType)) continue;
    const type = GetRandomFaceDirectionMovementType();
    const o = ow.objects.byLocalIdAndMap(t.localId, save.location.mapNum, save.location.mapGroup);
    if (o) ow.objects.setTrainerMovementType(o, type);
    t.movementType = type;
  }
}

/** VsSeekerResetObjectMovementAfterChargeComplete. */
export function VsSeekerResetObjectMovementAfterChargeComplete(game: Game): void {
  ResetMovementOfRematchableTrainers(game);
}

type TrainerInfo = { script: number; trainerIdx: number; localId: number; object: ObjectEvent | undefined; x: number; y: number; graphicsId: number };

type VsSeekerResponse = { code: number; wantsRematch: Array<{ trainerIdx: number; behavior: number }> };

/** GatherNearbyTrainerInfo; retain loaded trainer templates in map order. */
function GatherNearbyTrainerInfo(game: Game): TrainerInfo[] {
  const ow = game.overworld;
  return ow.objects.templates
    .filter((t) => t.trainerType === C.TRAINER_TYPE_NORMAL || t.trainerType === C.TRAINER_TYPE_BURIED)
    .map((t) => {
      const object = ow.objects.byLocalIdAndMap(t.localId, save.location.mapNum, save.location.mapGroup);
      return { script: t.script, trainerIdx: GetTrainerFlagFromScript(t.script), localId: t.localId, object,
        x: (object?.currentCoords.x ?? 0) - 7, y: (object?.currentCoords.y ?? 0) - 7, graphicsId: t.graphicsId };
    });
}

/** ObjectEventIdIsSane: object identity is represented by a live event reference in this runtime. */
function ObjectEventIdIsSane(info: TrainerInfo): boolean { return !!info.object?.active; }

/** IsTrainerVisibleOnScreen with the source's 15 by 11 tile search rectangle. */
function IsTrainerVisibleOnScreen(ow: Overworld, info: TrainerInfo): boolean {
  const p = ow.player.object;
  const x = p.currentCoords.x - 7, y = p.currentCoords.y - 7;
  return x - 7 <= info.x && x + 7 >= info.x && y - 5 <= info.y && y + 5 >= info.y && ObjectEventIdIsSane(info);
}

/** GetRematchableTrainerLocalId. */
function GetRematchableTrainerLocalId(ow: Overworld, info: TrainerInfo[]): number {
  for (const trainer of info) {
    if (IsTrainerVisibleOnScreen(ow, trainer)
      && (!hasTrainerBeenFought(trainer.trainerIdx) || GetNextAvailableRematchTrainer(trainer.trainerIdx).j))
      return trainer.localId;
  }
  return 0xff;
}

/** CanUseVsSeeker returns the source enum: 0 not charged, 1 no trainers, 2 usable. */
function CanUseVsSeeker(ow: Overworld, info: TrainerInfo[]): number {
  if ((stepCounter() & 0xff) !== 100) return 0;
  return GetRematchableTrainerLocalId(ow, info) === 0xff ? 1 : 2;
}

/** StartTrainerObjectMovementScript. */
function StartTrainerObjectMovementScript(game: Game, info: TrainerInfo, bytes: number[]): void {
  if (info.object) game.overworld.objects.unfreeze(info.object);
  game.scriptMovement.startBytes(info.object, bytes);
}

/** GetCurVsSeekerResponse: a visible earlier copy of this trainer decides later copies. */
function GetCurVsSeekerResponse(ow: Overworld, info: TrainerInfo[], index: number, trainerIdx: number, accepted: number[]): number {
  for (let i = 0; i < index; i++) {
    if (!IsTrainerVisibleOnScreen(ow, info[i]) || info[i].trainerIdx !== trainerIdx) continue;
    return accepted.includes(trainerIdx) ? 2 : 1;
  }
  return 0;
}

/** GetVsSeekerResponseInArea; response values are no response, unfought, and found rematches. */
function GetVsSeekerResponseInArea(game: Game, info: TrainerInfo[]): VsSeekerResponse {
  const ow = game.overworld;
  let notYetFought = false;
  let wantsAnyRematch = false;
  const wantsRematch: VsSeekerResponse["wantsRematch"] = [];
  info.forEach((trainer, index) => {
    if (!IsTrainerVisibleOnScreen(ow, trainer)) return;
    if (!hasTrainerBeenFought(trainer.trainerIdx)) {
      StartTrainerObjectMovementScript(game, trainer, [C.MOVEMENT_ACTION_EMOTE_EXCLAMATION_MARK, C.MOVEMENT_ACTION_STEP_END]);
      notYetFought = true;
      return;
    }
    const rematchTrainerIdx = GetNextAvailableRematchTrainer(trainer.trainerIdx).j;
    if (!rematchTrainerIdx) {
      StartTrainerObjectMovementScript(game, trainer, [C.MOVEMENT_ACTION_EMOTE_X, C.MOVEMENT_ACTION_STEP_END]);
      return;
    }
    const rval = random() % 100; // C advances RNG even when an earlier copy decides the result.
    const response = GetCurVsSeekerResponse(ow, info, index, trainer.trainerIdx, wantsRematch.map((w) => w.trainerIdx));
    const wants = response === 2 || (response === 0 && rval >= 30);
    if (!wants) {
      StartTrainerObjectMovementScript(game, trainer, [C.MOVEMENT_ACTION_EMOTE_X, C.MOVEMENT_ACTION_STEP_END]);
      return;
    }
    rematches()[trainer.localId] = rematchTrainerIdx;
    if (trainer.object) ow.objects.shiftStill(trainer.object);
    StartTrainerObjectMovementScript(game, trainer, [C.MOVEMENT_ACTION_WALK_IN_PLACE_FASTER_DOWN, C.MOVEMENT_ACTION_EMOTE_DOUBLE_EXCL_MARK, C.MOVEMENT_ACTION_STEP_END]);
    wantsRematch.push({ trainerIdx: trainer.trainerIdx, behavior: GetRunningBehaviorFromGraphicsId(trainer.graphicsId) });
    wantsAnyRematch = true;
  });
  if (wantsAnyRematch) {
    sound.playSE(C.SE_PIN);
    flagSet(C.FLAG_SYS_VS_SEEKER_CHARGING);
    VsSeekerResetChargingStepCounter();
    return { code: 2, wantsRematch };
  }
  return { code: notYetFought ? 1 : 0, wantsRematch };
}

/** Task_ItemUse_CloseMessageBoxAndReturnToField_VsSeeker (item_use.c). */
export function Task_ItemUse_CloseMessageBoxAndReturnToField_VsSeeker(release: () => void): void {
  Task_ItemUse_CloseMessageBoxAndReturnToField(release);
}

type VsSeekerTask = {
  game: Game;
  info: TrainerInfo[];
  showMessage: (text: Uint8Array, next: () => void) => void;
  release: () => void;
  isAnimFinished: () => boolean;
  d0: number;
  d1: number;
  d2: number;
  response: VsSeekerResponse;
};

const vsSeekerTasks = new Map<number, VsSeekerTask>();

/** Task_VsSeeker_0; task id and global callbacks are adapted to the active field runtime. */
export function Task_VsSeeker_0(game: Game, item: number, showMessage: (text: Uint8Array, next: () => void) => void, release: () => void): void {
  const ow = game.overworld;
  const info = GatherNearbyTrainerInfo(game);
  const useState = CanUseVsSeeker(ow, info);
  if (useState === 0) {
    const charge = stepCounter() & 0xff;
    import("../gba/charmap").then(({ TV_PrintIntToStringVar }) => {
      TV_PrintIntToStringVar(0, 100 - charge);
      showMessage(rom.text("VSSeeker_Text_BatteryNotChargedNeedXSteps"), () => Task_ItemUse_CloseMessageBoxAndReturnToField_VsSeeker(release));
    });
    return;
  }
  if (useState === 1) {
    showMessage(rom.text("VSSeeker_Text_NoTrainersWithinRange"), () => Task_ItemUse_CloseMessageBoxAndReturnToField_VsSeeker(release));
    return;
  }

  ItemUse_SetQuestLogEvent(C.QL_EVENT_USED_ITEM, null, item, 0xffff);
  ow.controlsLocked = true;
  ow.objects.freezeAll();
  const id = tasks.create(Task_VsSeeker_1, 80);
  vsSeekerTasks.set(id, {
    game, info, showMessage, release, isAnimFinished: StartVsSeekerFieldEffect(ow),
    d0: 15, d1: 0, d2: 0, response: { code: 0, wantsRematch: [] },
  });
}

/** Task_VsSeeker_1: wait 15 frames, then arm the response sound timer. */
export function Task_VsSeeker_1(taskId: number): void {
  const flow = vsSeekerTasks.get(taskId);
  if (!flow || --flow.d0 !== 0) return;
  flow.d1 = 16;
  tasks.setFunc(taskId, Task_VsSeeker_2);
}

/** Task_VsSeeker_2: wait for the avatar effect, gather responses, then wait for the player movement. */
export function Task_VsSeeker_2(taskId: number): void {
  const flow = vsSeekerTasks.get(taskId);
  if (!flow) return;
  if (flow.d2 !== 2 && --flow.d1 === 0) {
    sound.playSE(C.SE_CONTEST_MONS_TURN);
    flow.d1 = 11;
    flow.d2++;
  }
  if (!flow.isAnimFinished()) return;
  VsSeekerResetInBagStepCounter();
  flow.response = GetVsSeekerResponseInArea(flow.game, flow.info);
  flow.game.scriptMovement.startBytes(flow.game.overworld.player.object, [C.MOVEMENT_ACTION_DELAY_16, C.MOVEMENT_ACTION_DELAY_16, C.MOVEMENT_ACTION_DELAY_16, C.MOVEMENT_ACTION_STEP_END]);
  tasks.setFunc(taskId, Task_VsSeeker_3);
}

/** Task_VsSeeker_3: finish the player movement and release the field. */
export function Task_VsSeeker_3(taskId: number): void {
  const flow = vsSeekerTasks.get(taskId);
  if (!flow || !flow.game.scriptMovement.isFinished(flow.game.overworld.player.object)) return;
  tasks.destroy(taskId);
  vsSeekerTasks.delete(taskId);
  if (flow.response.code === 0) {
    flow.showMessage(rom.text("VSSeeker_Text_TrainersNotReady"), () => Task_ItemUse_CloseMessageBoxAndReturnToField_VsSeeker(flow.release));
    return;
  }
  if (flow.response.code === 2) StartAllRespondantIdleMovements(flow.game, flow.info, flow.response.wantsRematch);
  flow.release();
}

/** StartAllRespondantIdleMovements. */
function StartAllRespondantIdleMovements(game: Game, info: TrainerInfo[], wantsRematch: VsSeekerResponse["wantsRematch"]): void {
  const ow = game.overworld;
  for (const response of wantsRematch) {
    for (const trainer of info) {
      if (trainer.trainerIdx !== response.trainerIdx || !trainer.object) continue;
      ow.objects.setTrainerMovementType(trainer.object, response.behavior);
      ow.objects.overrideTemplateMovementType(trainer.object, response.behavior);
      rematches()[trainer.localId] = GetNextAvailableRematchTrainer(trainer.trainerIdx).j;
    }
  }
}
