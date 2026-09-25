// dynamic_placeholder_text_util.c: shared NPC text-color lookup and the
// {DYNAMIC id} placeholder expansion. Adaptation: ExpandPlaceholders returns
// the expanded string instead of writing through dest.
import { EOS } from "./gba/charmap";
import { rom } from "./rom";

const CHAR_DYNAMIC = 0xf7;
const sStringPointers: (ArrayLike<number> | null)[] = [null, null, null, null, null, null, null, null];

/** DynamicPlaceholderTextUtil_Reset */
export function DynamicPlaceholderTextUtil_Reset(): void {
  for (let i = 0; i < sStringPointers.length; i++) sStringPointers[i] = null;
}

/** DynamicPlaceholderTextUtil_SetPlaceholderPtr */
export function DynamicPlaceholderTextUtil_SetPlaceholderPtr(idx: number, ptr: ArrayLike<number>): void {
  if (idx < sStringPointers.length) sStringPointers[idx] = ptr;
}

/** DynamicPlaceholderTextUtil_ExpandPlaceholders */
export function DynamicPlaceholderTextUtil_ExpandPlaceholders(src: ArrayLike<number>): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < src.length && src[i] !== EOS; i++) {
    if (src[i] !== CHAR_DYNAMIC) {
      out.push(src[i]);
    } else {
      const repl = sStringPointers[src[++i]];
      if (repl) for (let j = 0; j < repl.length && repl[j] !== EOS; j++) out.push(repl[j]);
    }
  }
  out.push(EOS);
  return Uint8Array.from(out);
}

/** GetColorFromTextColorTable (graphicId is u16; colors are packed as two nibbles). */
export function GetColorFromTextColorTable(graphicId: number): number {
  const id = graphicId & 0xffff;
  const index = id >>> 1;
  const table = rom.scriptMenu.textColors;
  if (index >= table.length) return 3; // NPC_TEXT_COLOR_NEUTRAL
  return ((table[index] ?? 0) >>> ((id & 1) << 2)) & 0xf;
}
