// pokeemerald berry.c: berry tree state, growth and the object-event interaction specials.
// State lives in the Hoenn bank (save.berryTrees, SaveBlock1.berryTrees). Each function keeps its C name.
//
// Not ported (see TAREAS-FINALES): Bag_ChooseBerry (the bag's berry-tree mode), DoWateringBerryTreeAnim
// (avatar watering frames) and the BerryTreeGrowth movement type that raises BERRY_FLAG_SPARKLING and swaps
// the tree sprites. IsBerryTreeSparkling therefore only sees flags set through SetBerryTreeJustPicked.
import { cdata } from "@core/hw/assets";
import { EOS } from "@core/gba/charmap";
import { stringVars } from "@core/gba/stringBuffers";
import { addBagItem } from "@core/pokemon/items";
import { random } from "@core/random";
import type { ScriptRunner } from "@core/script/context";
import { type BerryTree, save, SV, varGet, varSet } from "@game/save";
import * as EM from "./generated/constants";
import { GetBerryCountString } from "./scriptText";

/** The fields of struct Berry that berry.c reads. */
type Berry = { name: ArrayLike<number>; maxYield: number; minYield: number; stageDuration: number };

const BERRY_NAME_LENGTH = 6;
// global.berry.h EnigmaBerry (Berry2 is 0x1C bytes; itemEffect, holdEffect, holdEffectParam, checksum follow).
const ENIGMA_MAX_YIELD = 10, ENIGMA_STAGE_DURATION = 20, ENIGMA_CHECKSUM = 48;

const ITEM_TO_BERRY = (itemId: number): number => (itemId - EM.FIRST_BERRY_INDEX) + 1;

const gBerries = (): { name: number[]; maxYield: number; minYield: number; stageDuration: number }[] => cdata("berry", "gBerries");

/** berry.c gBlankBerryTree */
const blankBerryTree = (): BerryTree => ({
  berry: 0, stage: 0, stopGrowth: false, minutesUntilNextStage: 0, berryYield: 0, regrowthCount: 0,
  watered1: false, watered2: false, watered3: false, watered4: false,
});

/** gSaveBlock1Ptr->berryTrees, created blank on first use (ClearBerryTrees). */
function berryTrees(): BerryTree[] {
  return save.berryTrees ??= Array.from({ length: EM.BERRY_TREES_COUNT }, blankBerryTree);
}

/** berry.c ClearBerryTrees */
export function ClearBerryTrees(): void {
  save.berryTrees = Array.from({ length: EM.BERRY_TREES_COUNT }, blankBerryTree);
}

/** berry.c GetEnigmaBerryChecksum: sum of the bytes before the checksum field. */
function GetEnigmaBerryChecksum(enigmaBerry: number[]): number {
  let checksum = 0;
  for (let i = 0; i < ENIGMA_CHECKSUM; i++) checksum += enigmaBerry[i]!;
  return checksum >>> 0;
}

/** berry.c IsEnigmaBerryValid */
export function IsEnigmaBerryValid(): boolean {
  const enigma = save.enigmaBerry;
  if (!enigma[ENIGMA_STAGE_DURATION]) return false;
  if (!enigma[ENIGMA_MAX_YIELD]) return false;
  const stored = (enigma[ENIGMA_CHECKSUM]! | (enigma[ENIGMA_CHECKSUM + 1]! << 8) | (enigma[ENIGMA_CHECKSUM + 2]! << 16) | (enigma[ENIGMA_CHECKSUM + 3]! << 24)) >>> 0;
  return GetEnigmaBerryChecksum(enigma) === stored;
}

/** berry.c GetBerryInfo */
export function GetBerryInfo(berry: number): Berry {
  berry &= 0xff;
  if (berry === ITEM_TO_BERRY(EM.ITEM_ENIGMA_BERRY) && IsEnigmaBerryValid()) {
    const enigma = save.enigmaBerry;
    return { name: enigma.slice(0, BERRY_NAME_LENGTH + 1), maxYield: enigma[ENIGMA_MAX_YIELD]!, minYield: enigma[ENIGMA_MAX_YIELD + 1]!, stageDuration: enigma[ENIGMA_STAGE_DURATION]! };
  }
  if (berry === EM.BERRY_NONE || berry > ITEM_TO_BERRY(EM.LAST_BERRY_INDEX)) berry = ITEM_TO_BERRY(EM.FIRST_BERRY_INDEX);
  return gBerries()[berry - 1]!;
}

/** berry.c GetBerryTreeInfo */
export function GetBerryTreeInfo(id: number): BerryTree {
  return berryTrees()[id & 0xff]!;
}

/** berry.c GetStageDurationByBerryType */
function GetStageDurationByBerryType(berry: number): number {
  return (GetBerryInfo(berry).stageDuration * 60) & 0xffff;
}

/** berry.c BerryTreeGetNumStagesWatered */
function BerryTreeGetNumStagesWatered(tree: BerryTree): number {
  return (tree.watered1 ? 1 : 0) + (tree.watered2 ? 1 : 0) + (tree.watered3 ? 1 : 0) + (tree.watered4 ? 1 : 0);
}

/** berry.c GetNumStagesWateredByBerryTreeId */
function GetNumStagesWateredByBerryTreeId(id: number): number {
  return BerryTreeGetNumStagesWatered(GetBerryTreeInfo(id));
}

/** berry.c CalcBerryYieldInternal: Random() draws from the subset of the yield range that `water` selects. */
function CalcBerryYieldInternal(max: number, min: number, water: number): number {
  if (water === 0) return min;
  const randMin = (max - min) * (water - 1);
  const randMax = (max - min) * water;
  const rand = (randMin + (random() % (randMax - randMin + 1))) >>> 0;
  const extraYield = (rand % EM.NUM_WATER_STAGES) >= EM.NUM_WATER_STAGES / 2 ? Math.trunc(rand / EM.NUM_WATER_STAGES) + 1 : Math.trunc(rand / EM.NUM_WATER_STAGES);
  return (extraYield + min) & 0xff;
}

/** berry.c CalcBerryYield */
function CalcBerryYield(tree: BerryTree): number {
  const berry = GetBerryInfo(tree.berry);
  return CalcBerryYieldInternal(berry.maxYield, berry.minYield, BerryTreeGetNumStagesWatered(tree));
}

/** berry.c GetBerryCountByBerryTreeId */
function GetBerryCountByBerryTreeId(id: number): number {
  return berryTrees()[id & 0xff]!.berryYield;
}

/** berry.c BerryTreeGrow: false when the tree did not change stage. */
function BerryTreeGrow(tree: BerryTree): boolean {
  if (tree.stopGrowth) return false;
  switch (tree.stage) {
    case EM.BERRY_STAGE_NO_BERRY:
      return false;
    case EM.BERRY_STAGE_FLOWERING:
      tree.berryYield = CalcBerryYield(tree);
      // fall through: BERRY_STAGE_FLOWERING also advances the stage
    case EM.BERRY_STAGE_PLANTED:
    case EM.BERRY_STAGE_SPROUTED:
    case EM.BERRY_STAGE_TALLER:
      tree.stage++;
      break;
    case EM.BERRY_STAGE_BERRIES:
      tree.watered1 = tree.watered2 = tree.watered3 = tree.watered4 = false;
      tree.berryYield = 0;
      tree.stage = EM.BERRY_STAGE_SPROUTED;
      if (++tree.regrowthCount === 10) Object.assign(tree, blankBerryTree());
      break;
  }
  return true;
}

/** berry.c BerryTreeTimeUpdate */
export function BerryTreeTimeUpdate(minutes: number): void {
  for (const tree of berryTrees()) {
    if (tree.berry && tree.stage && !tree.stopGrowth) {
      if (minutes >= GetStageDurationByBerryType(tree.berry) * 71) {
        Object.assign(tree, blankBerryTree());
      } else {
        let time = minutes;
        while (time !== 0) {
          if (tree.minutesUntilNextStage > time) {
            tree.minutesUntilNextStage -= time;
            break;
          }
          time -= tree.minutesUntilNextStage;
          tree.minutesUntilNextStage = GetStageDurationByBerryType(tree.berry);
          if (!BerryTreeGrow(tree)) break;
          if (tree.stage === EM.BERRY_STAGE_BERRIES) tree.minutesUntilNextStage = (tree.minutesUntilNextStage * 4) & 0xffff;
        }
      }
    }
  }
}

/** berry.c PlantBerryTree */
export function PlantBerryTree(id: number, berry: number, stage: number, allowGrowth: boolean): void {
  const tree = GetBerryTreeInfo(id);
  Object.assign(tree, blankBerryTree());
  tree.berry = berry & 0xff;
  tree.minutesUntilNextStage = GetStageDurationByBerryType(berry);
  tree.stage = stage & 0x7f;
  if (stage === EM.BERRY_STAGE_BERRIES) {
    tree.berryYield = CalcBerryYield(tree);
    tree.minutesUntilNextStage = (tree.minutesUntilNextStage * 4) & 0xffff;
  }
  // Stop growth, to keep tree at this stage until the player has seen it
  // allowGrowth is always true for berry trees the player has planted
  if (!allowGrowth) tree.stopGrowth = true;
}

/** berry.c RemoveBerryTree */
export function RemoveBerryTree(id: number): void {
  berryTrees()[id & 0xff] = blankBerryTree();
}

/** berry.c GetBerryTypeByBerryTreeId */
export function GetBerryTypeByBerryTreeId(id: number): number {
  return berryTrees()[id & 0xff]!.berry;
}

/** berry.c GetStageByBerryTreeId */
export function GetStageByBerryTreeId(id: number): number {
  return berryTrees()[id & 0xff]!.stage;
}

/** berry.c ItemIdToBerryType */
export function ItemIdToBerryType(item: number): number {
  const berry = (item - EM.FIRST_BERRY_INDEX) & 0xffff;
  if (berry > EM.LAST_BERRY_INDEX - EM.FIRST_BERRY_INDEX) return ITEM_TO_BERRY(EM.FIRST_BERRY_INDEX);
  return ITEM_TO_BERRY(item);
}

/** berry.c BerryTypeToItemId */
function BerryTypeToItemId(berry: number): number {
  const item = (berry - 1) & 0xffff;
  if (item > EM.LAST_BERRY_INDEX - EM.FIRST_BERRY_INDEX) return EM.FIRST_BERRY_INDEX;
  return berry + EM.FIRST_BERRY_INDEX - 1;
}

/** berry.c GetBerryNameByBerryType: the name is BERRY_NAME_LENGTH bytes, then EOS. */
export function GetBerryNameByBerryType(berry: number): Uint8Array {
  const out = new Uint8Array(BERRY_NAME_LENGTH + 1).fill(EOS);
  const name = GetBerryInfo(berry).name;
  for (let i = 0; i < BERRY_NAME_LENGTH; i++) out[i] = name[i]!;
  return out;
}

/** berry.c GetBerryCountStringByBerryType (item.c GetBerryCountString on the berry's name). */
function GetBerryCountStringByBerryType(berry: number, berryCount: number): Uint8Array {
  return GetBerryCountString(Uint8Array.from(GetBerryInfo(berry).name), berryCount);
}

/** berry.c AllowBerryTreeGrowth */
export function AllowBerryTreeGrowth(id: number): void {
  GetBerryTreeInfo(id).stopGrowth = false;
}

/** event_object_movement.c sBerryTreeFlags (BERRY_FLAG_SPARKLING / BERRY_FLAG_JUST_PICKED), keyed by localId + map. */
const BERRY_FLAG_SPARKLING = 1 << 1, BERRY_FLAG_JUST_PICKED = 1 << 2;
const sBerryTreeFlags = new Map<string, number>();
const berryTreeKey = (localId: number, mapNum: number, mapGroup: number): string => `${mapGroup}.${mapNum}.${localId}`;

/** event_object_movement.c IsBerryTreeSparkling */
export function IsBerryTreeSparkling(localId: number, mapNum: number, mapGroup: number): boolean {
  return ((sBerryTreeFlags.get(berryTreeKey(localId, mapNum, mapGroup)) ?? 0) & BERRY_FLAG_SPARKLING) !== 0;
}

/** event_object_movement.c SetBerryTreeJustPicked */
export function SetBerryTreeJustPicked(localId: number, mapNum: number, mapGroup: number): void {
  const key = berryTreeKey(localId, mapNum, mapGroup);
  sBerryTreeFlags.set(key, (sBerryTreeFlags.get(key) ?? 0) | BERRY_FLAG_JUST_PICKED);
}

/** event_object_movement.c GetObjectEventBerryTreeId(gSelectedObjectEvent): trainerRange_berryTreeId. */
function GetObjectEventBerryTreeId(ctx: ScriptRunner): number {
  return ctx.ow.objects.objects[ctx.ow.selectedObject]!.trainerRange & 0xff;
}

/** berry.c ObjectEventInteractionGetBerryTreeData */
export function ObjectEventInteractionGetBerryTreeData(ctx: ScriptRunner): void {
  const id = GetObjectEventBerryTreeId(ctx);
  const berry = GetBerryTypeByBerryTreeId(id);
  AllowBerryTreeGrowth(id);
  const localId = varGet(SV.LAST_TALKED);
  const { mapNum, mapGroup } = save.location;
  if (IsBerryTreeSparkling(localId, mapNum, mapGroup)) varSet(SV.x8004, EM.BERRY_STAGE_SPARKLING);
  else varSet(SV.x8004, GetStageByBerryTreeId(id));
  varSet(SV.x8005, GetNumStagesWateredByBerryTreeId(id));
  varSet(SV.x8006, GetBerryCountByBerryTreeId(id));
  stringVars.var1 = GetBerryCountStringByBerryType(berry, varGet(SV.x8006));
}

/** berry.c ObjectEventInteractionGetBerryName */
export function ObjectEventInteractionGetBerryName(ctx: ScriptRunner): void {
  stringVars.var1 = GetBerryNameByBerryType(GetBerryTypeByBerryTreeId(GetObjectEventBerryTreeId(ctx)));
}

/** berry.c ObjectEventInteractionGetBerryCountString */
export function ObjectEventInteractionGetBerryCountString(ctx: ScriptRunner): void {
  const treeId = GetObjectEventBerryTreeId(ctx);
  const berry = GetBerryTypeByBerryTreeId(treeId);
  const count = GetBerryCountByBerryTreeId(treeId);
  stringVars.var1 = GetBerryCountStringByBerryType(berry, count);
}

/** berry.c ObjectEventInteractionWaterBerryTree */
export function ObjectEventInteractionWaterBerryTree(ctx: ScriptRunner): number {
  const tree = GetBerryTreeInfo(GetObjectEventBerryTreeId(ctx));
  switch (tree.stage) {
    case EM.BERRY_STAGE_PLANTED: tree.watered1 = true; break;
    case EM.BERRY_STAGE_SPROUTED: tree.watered2 = true; break;
    case EM.BERRY_STAGE_TALLER: tree.watered3 = true; break;
    case EM.BERRY_STAGE_FLOWERING: tree.watered4 = true; break;
    default: return 0;
  }
  return 1;
}

/** berry.c ObjectEventInteractionPlantBerryTree */
export function ObjectEventInteractionPlantBerryTree(ctx: ScriptRunner): void {
  const berry = ItemIdToBerryType(varGet(SV.ITEM_ID));
  PlantBerryTree(GetObjectEventBerryTreeId(ctx), berry, EM.BERRY_STAGE_PLANTED, true);
  ObjectEventInteractionGetBerryTreeData(ctx);
}

/** berry.c ObjectEventInteractionPickBerryTree: gSpecialVar_0x8004 is AddBagItem's result. */
export function ObjectEventInteractionPickBerryTree(ctx: ScriptRunner): void {
  const id = GetObjectEventBerryTreeId(ctx);
  const berry = GetBerryTypeByBerryTreeId(id);
  varSet(SV.x8004, addBagItem(BerryTypeToItemId(berry), GetBerryCountByBerryTreeId(id)) ? 1 : 0);
}

/** berry.c ObjectEventInteractionRemoveBerryTree */
export function ObjectEventInteractionRemoveBerryTree(ctx: ScriptRunner): void {
  RemoveBerryTree(GetObjectEventBerryTreeId(ctx));
  SetBerryTreeJustPicked(varGet(SV.LAST_TALKED), save.location.mapNum, save.location.mapGroup);
}

/** berry.c PlayerHasBerries: IsBagPocketNonEmpty(POCKET_BERRIES). */
export function PlayerHasBerries(): number {
  return save.bag.berryPouch.some(slot => slot.item !== 0) ? 1 : 0;
}

/** tv.c IncrementDailyPlantedBerries */
export function IncrementDailyPlantedBerries(): void {
  varSet(EM.VAR_DAILY_PLANTED_BERRIES, varGet(EM.VAR_DAILY_PLANTED_BERRIES) + 1);
}

/** tv.c IncrementDailyPickedBerries: adds gSpecialVar_0x8006, the picked count. */
export function IncrementDailyPickedBerries(): void {
  varSet(EM.VAR_DAILY_PICKED_BERRIES, varGet(EM.VAR_DAILY_PICKED_BERRIES) + varGet(SV.x8006));
}

/** scrcmd.c ScrCmd_setberrytree: both branches of the source call PlantBerryTree with allowGrowth FALSE. */
export function SetBerryTreeEntry(treeId: number, berry: number, growthStage: number): void {
  PlantBerryTree(treeId, berry, growthStage, false);
}

