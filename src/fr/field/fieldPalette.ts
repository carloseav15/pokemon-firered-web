// fieldmap.c ApplyGlobalTintToPaletteSlot and field_effect.c ApplyGlobalFieldPaletteTint.

import * as C from "../generated/constants";
import { BG_PLTT_ID, OBJ_PLTT_ID, TintPalette_GrayScale, TintPalette_SepiaTone, gPlttBufferFaded, gPlttBufferUnfaded } from "../hw/palette";
import { QuestLog_BackUpPalette } from "../questLogPalette";

export let gGlobalFieldTintMode = C.QL_TINT_NONE;

export function SetGlobalFieldTintMode(mode: number): void {
  gGlobalFieldTintMode = mode & 0xff;
}

/** ApplyGlobalTintToPaletteEntries (fieldmap.c); offset is in colors, size is a u16 color count. */
export function ApplyGlobalTintToPaletteEntries(offset: number, size: number): void {
  offset &= 0xffff;
  size &= 0xffff;
  switch (gGlobalFieldTintMode) {
    case C.QL_TINT_NONE: return;
    case C.QL_TINT_GRAYSCALE:
      TintPalette_GrayScale(gPlttBufferUnfaded, size, offset);
      break;
    case C.QL_TINT_SEPIA:
      TintPalette_SepiaTone(gPlttBufferUnfaded, size, offset);
      break;
    case C.QL_TINT_BACKUP_GRAYSCALE:
      QuestLog_BackUpPalette(offset, size);
      TintPalette_GrayScale(gPlttBufferUnfaded, size, offset);
      break;
    default: return;
  }
  gPlttBufferFaded.set(gPlttBufferUnfaded.subarray(offset, offset + size), offset);
}

/** ApplyGlobalFieldPaletteTint (field_effect.c); paletteIdx is an OBJ palette slot. */
export function ApplyGlobalFieldPaletteTint(paletteIdx: number): void {
  const offset = OBJ_PLTT_ID(paletteIdx & 0xff);
  switch (gGlobalFieldTintMode) {
    case C.QL_TINT_NONE: return;
    case C.QL_TINT_GRAYSCALE:
      TintPalette_GrayScale(gPlttBufferUnfaded, 16, offset);
      break;
    case C.QL_TINT_SEPIA:
      TintPalette_SepiaTone(gPlttBufferUnfaded, 16, offset);
      break;
    case C.QL_TINT_BACKUP_GRAYSCALE:
      QuestLog_BackUpPalette(offset, 16);
      TintPalette_GrayScale(gPlttBufferUnfaded, 16, offset);
      break;
    default: return;
  }
  gPlttBufferFaded.set(gPlttBufferUnfaded.subarray(offset, offset + 16), offset);
}

/** ApplyGlobalTintToPaletteSlot (fieldmap.c); slot and count are u8 BG palette values. */
export function ApplyGlobalTintToPaletteSlot(slot: number, count: number): void {
  const offset = BG_PLTT_ID(slot & 0xff);
  const colors = (count & 0xff) * 16;
  ApplyGlobalTintToPaletteEntries(offset, colors);
}
