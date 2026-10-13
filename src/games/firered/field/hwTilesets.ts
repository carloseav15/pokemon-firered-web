// The map's tilesets and palettes in hardware VRAM / palette RAM, for screens
// that draw the map on the hardware layer (Poké Mart view, credits scrolls).
// The C finds them already loaded by the field (CopyPrimaryTilesetToVram,
// CopySecondaryTilesetToVram, LoadMapTilesetPalettes); the port's field draws
// with Canvas2D, so they are copied here first.

import type { TilesetData } from "../rom";
import { BG_PLTT_ID, LoadPalette, PLTT_SIZE_4BPP } from "../hw/palette";
import { ppu } from "../hw/ppu";
import { NUM_TILES_IN_PRIMARY } from "./fieldmap";

/** Primary tiles at tile 0, secondary at NUM_TILES_IN_PRIMARY; primary palettes 0-6, secondary 7-12. */
export function CopyMapTilesetsToHw(primary: TilesetData, secondary: TilesetData): void {
  ppu.vram.set(primary.tiles.subarray(0, NUM_TILES_IN_PRIMARY * 32), 0);
  ppu.vram.set(secondary.tiles.subarray(0, (1024 - NUM_TILES_IN_PRIMARY) * 32), NUM_TILES_IN_PRIMARY * 32);
  const rgb555 = (c: number[]) => ((c[0] >> 3) & 31) | (((c[1] >> 3) & 31) << 5) | (((c[2] >> 3) & 31) << 10);
  for (let i = 0; i < 13; i++) {
    const palette = (i < 7 ? primary.palettes[i] : secondary.palettes[i]).map(rgb555);
    if (i === 0) palette[0] = 0;
    LoadPalette(palette, BG_PLTT_ID(i), PLTT_SIZE_4BPP);
  }
}
