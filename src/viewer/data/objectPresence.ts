import { rom } from "@core/rom";
import { flagGet } from "@game/save";
import type { Element } from "../types";

/** event_object_movement.c:1812-1814: an object template spawns when its flag is clear.
 * Index flags are symbolic; interior MapObjectTemplate flags are numeric.
 * startsHidden is atlas metadata, not the current saved game state.
 */
export function isViewerObjectPresent(element: Element): boolean {
  const flag = element.flag;
  const id = typeof flag === "string" ? (/^(?:0x[\da-f]+|\d+)$/i.test(flag) ? Number(flag) : rom.c(flag)) : flag ?? 0;
  return !flagGet(id);
}
