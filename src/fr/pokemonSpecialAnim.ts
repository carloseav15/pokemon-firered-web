// pokemon_special_anim.c: data helpers used by the field item-use animation.
// The scene/task state machine and its sprite effects are still pending.

import * as C from "./generated/constants";
import { GetMonData, type Mon } from "./pokemon/mon";

/** GetAnimTypeByItemId. */
export function GetAnimTypeByItemId(itemId: number): number {
  if (itemId === C.ITEM_RARE_CANDY) return C.PSA_ITEM_ANIM_TYPE_DEFAULT;
  if (itemId === C.ITEM_POTION) return C.PSA_ITEM_ANIM_TYPE_POTION;
  if (itemId >= C.ITEM_TM01 && itemId <= C.ITEM_HM08) return C.PSA_ITEM_ANIM_TYPE_TMHM;
  return C.PSA_ITEM_ANIM_TYPE_DEFAULT;
}

/** GetClosenessFromFriendship. */
export function GetClosenessFromFriendship(friendship: number): number {
  if (friendship <= 100) return 0;
  if (friendship <= 150) return 1;
  if (friendship <= 200) return 2;
  return 3;
}

/** GetMonLevelUpWindowStats. */
export function GetMonLevelUpWindowStats(mon: Mon): number[] {
  return [C.MON_DATA_MAX_HP, C.MON_DATA_ATK, C.MON_DATA_DEF, C.MON_DATA_SPEED, C.MON_DATA_SPATK, C.MON_DATA_SPDEF]
    .map((field) => GetMonData(mon, field));
}
