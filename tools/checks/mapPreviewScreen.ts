// Headless check for map preview screen parity (map_preview_screen.c, fldeff_flash.c)
// Run with: npx esbuild tools/checks/mapPreviewScreen.ts --bundle --platform=node --format=esm --log-level=warning --outfile=.decomp-build/checks/mapPreviewScreen.mjs && node .decomp-build/checks/mapPreviewScreen.mjs

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData } from '../../src/fr/hw/assets.ts';
import { flagClear, flagGet, flagSet } from '../../src/fr/save.ts';
import {
  MPS_COUNT,
  MPS_TYPE_CAVE,
  MPS_TYPE_FOREST,
  MPS_TYPE_ANY,
  MPS_VIRIDIAN_FOREST,
  MPS_MT_MOON,
  MPS_DIGLETTS_CAVE,
  MPS_ROCK_TUNNEL,
  MPS_SAFARI_ZONE,
  GetMapPreviewScreenIdx,
  MapHasPreviewScreen,
  MapHasPreviewScreen_HandleQLState2,
  GetDungeonMapPreviewScreenInfo,
  MapPreview_SetFlag,
  MapPreview_GetDuration,
  getHasVisitedMapBefore,
  setHasVisitedMapBefore,
  buildMapPreviewCanvas,
  type MapPreviewScreen,
} from '../../src/fr/mapPreviewScreen.ts';

// 1. Mock document for headless canvas creation
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      let imgData: any = null;
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w: number, h: number) => {
            imgData = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
            return imgData;
          },
          putImageData: (img: any) => { imgData = img; },
          getImageData: () => imgData,
          drawImage: () => {},
          fillRect: () => {},
          save: () => {},
          restore: () => {},
        }),
      };
    },
  };
}

const root = process.cwd() + '/public/fr/';

// 2. Load cdata and incbin index
const cdataRaw = JSON.parse(readFileSync(root + 'cdata/map_preview_screen.json', 'utf8'));
registerCData('map_preview_screen', cdataRaw.defs);

const incbinIndex = JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8'));
const symbols = incbinIndex.symbols;

const previewData: MapPreviewScreen[] = cdataRaw.defs.sMapPreviewScreenData.value;
assert.equal(previewData.length, MPS_COUNT, `sMapPreviewScreenData must have exactly ${MPS_COUNT} entries`);
assert.equal(MPS_COUNT, 28, 'MPS_COUNT must be 28');

// 3. Verify all 28 entries have valid symbols in incbin index
for (let i = 0; i < MPS_COUNT; i++) {
  const entry = previewData[i];
  assert.ok(entry.mapsec > 0, `entry ${i} must have valid mapsec`);
  assert.ok(entry.type === MPS_TYPE_CAVE || entry.type === MPS_TYPE_FOREST, `entry ${i} must be cave or forest`);
  assert.ok(entry.flagId > 0, `entry ${i} must have valid flagId`);

  const tSym = (entry.tilesptr as any).$sym;
  const tmSym = (entry.tilemapptr as any).$sym;
  const pSym = (entry.palptr as any).$sym;

  assert.ok(symbols[tSym], `tilesptr symbol ${tSym} must exist in index.json`);
  assert.ok(symbols[tmSym], `tilemapptr symbol ${tmSym} must exist in index.json`);
  assert.ok(symbols[pSym], `palptr symbol ${pSym} must exist in index.json`);

  // Verify tilemap size is 1280 bytes (640 u16 entries: 32x20)
  assert.equal(symbols[tmSym][2], 1280, `tilemap ${tmSym} must be 1280 bytes`);
  // Verify palette size is either 64 bytes (2 palettes) or 96 bytes (3 palettes)
  const palSize = symbols[pSym][2];
  assert.ok(palSize === 64 || palSize === 96, `palette ${pSym} size ${palSize} must be 64 or 96 bytes`);
}

// 4. Test GetMapPreviewScreenIdx
assert.equal(GetMapPreviewScreenIdx(126), MPS_VIRIDIAN_FOREST, 'Viridian Forest mapsec 126 must be idx 0');
assert.equal(GetMapPreviewScreenIdx(127), MPS_MT_MOON, 'Mt. Moon mapsec 127 must be idx 1');
assert.equal(GetMapPreviewScreenIdx(131), MPS_DIGLETTS_CAVE, 'Digletts Cave mapsec 131 must be idx 2');
assert.equal(GetMapPreviewScreenIdx(138), MPS_ROCK_TUNNEL, 'Rock Tunnel mapsec 138 must be idx 3');
assert.equal(GetMapPreviewScreenIdx(136), MPS_SAFARI_ZONE, 'Safari Zone mapsec 136 must be idx 5');
assert.equal(GetMapPreviewScreenIdx(254), MPS_COUNT, 'Unknown mapsec must return MPS_COUNT');

// 5. Test MapHasPreviewScreen
assert.equal(MapHasPreviewScreen(126, MPS_TYPE_FOREST), true, 'Viridian Forest is a forest');
assert.equal(MapHasPreviewScreen(126, MPS_TYPE_CAVE), false, 'Viridian Forest is not a cave');
assert.equal(MapHasPreviewScreen(126, MPS_TYPE_ANY), true, 'Viridian Forest matches ANY');
assert.equal(MapHasPreviewScreen(127, MPS_TYPE_CAVE), true, 'Mt. Moon is a cave');
assert.equal(MapHasPreviewScreen(127, MPS_TYPE_FOREST), false, 'Mt. Moon is not a forest');
assert.equal(MapHasPreviewScreen(100, MPS_TYPE_ANY), false, 'Pallet Town has no preview');

assert.equal(MapHasPreviewScreen_HandleQLState2(126, MPS_TYPE_FOREST), true);
assert.equal(MapHasPreviewScreen_HandleQLState2(100, MPS_TYPE_ANY), false);

// 6. Test GetDungeonMapPreviewScreenInfo
const vfInfo = GetDungeonMapPreviewScreenInfo(126);
assert.ok(vfInfo !== null);
assert.equal(vfInfo.mapsec, 126);
assert.equal(vfInfo.type, MPS_TYPE_FOREST);
assert.equal(GetDungeonMapPreviewScreenInfo(254), null);

// 7. Test cave durations and B-button / flag mechanics
// Mt Moon flag is 2213
flagClear(2213);
assert.equal(MapPreview_GetDuration(127), 120, 'First cave visit duration must be 120 frames');
MapPreview_SetFlag(2213);
assert.equal(flagGet(2213), true, 'Flag must be set by MapPreview_SetFlag');
assert.equal(MapPreview_GetDuration(127), 40, 'Repeat cave visit duration must be 40 frames');

// 8. Test forest durations and sHasVisitedMapBefore
// Viridian Forest flag is 2212
flagClear(2212);
setHasVisitedMapBefore(false);
MapPreview_SetFlag(2212); // Flag was cleared, so sHasVisitedMapBefore becomes true
assert.equal(getHasVisitedMapBefore(), true, 'sHasVisitedMapBefore must be true on first visit');
assert.equal(MapPreview_GetDuration(126), 120, 'First forest visit duration must be 120 frames');

// Subsequent visit: flag is already set
MapPreview_SetFlag(2212); // Flag already set, so sHasVisitedMapBefore becomes false
assert.equal(getHasVisitedMapBefore(), false, 'sHasVisitedMapBefore must be false on repeat visit');
assert.equal(MapPreview_GetDuration(126), 40, 'Repeat forest visit duration must be 40 frames');

// 9. Test actual canvas generation for all 28 preview screens
import { registerIncbinIndex, registerPack } from '../../src/fr/hw/assets.ts';
registerIncbinIndex(incbinIndex);
const packData = new Uint8Array(readFileSync(root + 'incbin/graphics_map_preview.bin'));
registerPack('graphics_map_preview', packData);

let renderedCount = 0;
for (let i = 0; i < MPS_COUNT; i++) {
  const entry = previewData[i];
  const cvs = buildMapPreviewCanvas(entry);
  assert.equal(cvs.width, 240, `preview ${i} width must be 240`);
  assert.equal(cvs.height, 160, `preview ${i} height must be 160`);
  const imgData = (cvs.getContext('2d') as any).getImageData();
  assert.ok(imgData, `preview ${i} image data must exist`);
  assert.equal(imgData.data.length, 240 * 160 * 4, `preview ${i} data size must be 240*160*4`);
  // Verify that there are non-zero opaque pixels
  let nonZero = 0;
  for (let p = 0; p < imgData.data.length; p += 4) {
    if (imgData.data[p + 3] === 255) nonZero++;
  }
  assert.equal(nonZero, 240 * 160, `all 240x160 pixels in preview ${i} must be opaque`);
  renderedCount++;
}

console.log(`PASS: All 28 map preview screens verified (constants, flags, durations, and 28/28 rendered 240x160 canvases).`);
