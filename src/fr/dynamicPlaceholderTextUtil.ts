// dynamic_placeholder_text_util.c: shared NPC text-color lookup.
import { rom } from "./rom";

/** GetColorFromTextColorTable (graphicId is u16; colors are packed as two nibbles). */
export function GetColorFromTextColorTable(graphicId: number): number {
  const id = graphicId & 0xffff;
  const index = id >>> 1;
  const table = rom.scriptMenu.textColors;
  if (index >= table.length) return 3; // NPC_TEXT_COLOR_NEUTRAL
  return ((table[index] ?? 0) >>> ((id & 1) << 2)) & 0xf;
}
