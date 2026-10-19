import * as C from "@game/generated/constants";
import * as EmConstants from "../../games/emerald/generated/constants";
import { viewerEventMap } from "../mapEvents";
import { flagGet } from "@game/save";
import type { Element } from "../types";

const emeraldFlags = EmConstants as Record<string, number | undefined>;
const kantoFlags = C as Record<string, number | undefined>;

/** event_object_movement.c:1812-1814: an object template spawns when its flag is clear.
 * Index flags are symbolic; interior MapObjectTemplate flags are numeric.
 * startsHidden is atlas metadata, not the current saved game state.
 */
export function isViewerObjectPresent(element: Element): boolean {
  const flag = element.flag;
  let id = 0;
  if (typeof flag === "number") {
    id = flag;
  } else if (typeof flag === "string") {
    if (/^(?:0x[\da-f]+|\d+)$/i.test(flag)) {
      id = Number(flag);
    } else {
      id = emeraldFlags[flag] ?? kantoFlags[flag] ?? 0;
    }
  }
  // Only the current map owns the shared temporary bits. Neighbouring sector
  // templates must not inherit a cut tree's TEMP flag from another map.
  if (id >= C.TEMP_FLAGS_START && id <= C.TEMP_FLAGS_END && element.map !== viewerEventMap()) return true;
  return !flagGet(id);
}
