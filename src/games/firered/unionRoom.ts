// union_room.c: Union Room location predicate used by item and mail rules.

import * as C from "./generated/constants";
import { save } from "./save";

/** InUnionRoom: the C implementation compares both map group and map number. */
export function InUnionRoom(): boolean {
  const map = C.MAP_UNION_ROOM;
  return save.location.mapGroup === (map >>> 8) && save.location.mapNum === (map & 0xff);
}
