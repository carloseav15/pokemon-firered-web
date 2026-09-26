// seagallop.c: the Seagallop Hi-Speed ferry crossing (scrolling water, ferry
// and wake sprites), then the warp to the chosen harbor. Also
// script_menu.c DrawSeagallopDestinationMenu / GetSelectedSeagallopDestination.

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { cdata, incbin } from "./hw/assets";
import { templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import { BG_COORD_ADD, BG_COORD_SUB, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBufferRect, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate } from "./hw/bg";
import { InitGpuRegManager, SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import { GetTextWindowPalette } from "./hw/menu";
import { BeginNormalPaletteFade, BlendPalettes, gPaletteFade, LoadPalette, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { DISPCNT_BG0_ON, DISPCNT_BG3_ON, DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_WIN0_ON, ppu, REG_OFFSET_BG0CNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT } from "./hw/ppu";
import { HwScene, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes, FreeSpritePaletteByTag, FreeSpriteTilesByTag, gSprites, LoadOam, LoadSpritePalettes, LoadSpriteSheets, ProcessSpriteCopyRequests, ResetSpriteData, StartSpriteAnim, type Sprite, type SpriteTemplate } from "./hw/sprite";
import { FreeAllWindowBuffers } from "./hw/window";
import { ResetAllPicSprites } from "./trainerPokemonSprites";
import { tasks } from "./gba/tasks";
import { SV, varGet } from "./save";
import type { Game } from "./game";

const data = <T>(name: string) => cdata<T>("seagallop", name);
const DIRN_EASTBOUND = 1;
const TILESTAG_FERRY = 3000;
const TILESTAG_WAKE = 4000;
const PALTAG_FERRY_WAKE = 3000;

/** GetDirectionOfTravel from seagallop.c. */
function GetDirectionOfTravel(): number {
  const from = varGet(SV.x8004), to = varGet(SV.x8006);
  const matrix = data<number[]>("sTravelDirectionMatrix");
  if (from >= matrix.length) return DIRN_EASTBOUND;
  return (matrix[from] >> to) & 1;
}

/** ResetBGPos from seagallop.c: clear all four BG scroll offsets. */
function ResetBGPos(): void {
  for (let bg = 0; bg < 4; bg++) { ChangeBgX(bg, 0, 0); ChangeBgY(bg, 0, 0); }
}

/** ResetGPU from seagallop.c, adapted to the browser-owned GBA memory arrays. */
function ResetGPU(): void {
  ppu.vram.fill(0);
  ppu.oam.fill(0);
  ppu.pltt.fill(0);
  InitGpuRegManager();
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  for (let bg = 0; bg < 4; bg++) {
    SetGpuReg(REG_OFFSET_BG0CNT + bg * 2, 0);
    SetGpuReg(REG_OFFSET_BG0HOFS + bg * 4, 0);
    SetGpuReg(REG_OFFSET_BG0VOFS + bg * 4, 0);
  }
  for (const reg of [REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDY]) SetGpuReg(reg, 0);
}

/** ResetAllAssets from seagallop.c, using the browser task/sprite/palette owners. */
function ResetAllAssets(): void {
  tasks.reset();
  ResetSpriteData();
  ResetAllPicSprites();
  ResetPaletteFade();
  FreeAllSpritePalettes();
}

/** SetDispcnt from seagallop.c. */
function SetDispcnt(): void {
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG0_ON | DISPCNT_BG3_ON | DISPCNT_OBJ_ON);
}

/** LoadFerrySpriteResources from seagallop.c. */
function LoadFerrySpriteResources(): void {
  LoadSpriteSheets([
    { data: incbin("sWakeSpriteTiles"), size: incbin("sWakeSpriteTiles").length, tag: TILESTAG_WAKE },
    { data: incbin("sFerrySpriteTiles"), size: incbin("sFerrySpriteTiles").length, tag: TILESTAG_FERRY },
  ]);
  LoadSpritePalettes([{ data: incbin("sFerryAndWakePal"), tag: PALTAG_FERRY_WAKE }]);
}

/** FreeFerrySpriteResources from seagallop.c. */
function FreeFerrySpriteResources(): void {
  FreeSpriteTilesByTag(TILESTAG_FERRY);
  FreeSpriteTilesByTag(TILESTAG_WAKE);
  FreeSpritePaletteByTag(PALTAG_FERRY_WAKE);
}

function directionOfTravel(): number { return GetDirectionOfTravel(); }

/** CreateFerrySprite from seagallop.c; template carries the scene's ferry callback. */
function CreateFerrySprite(template: SpriteTemplate): void {
  const spriteId = CreateSprite(template, 0, 92, 0);
  gSprites[spriteId].data[0] = 48;
  if (GetDirectionOfTravel() === DIRN_EASTBOUND) {
    StartSpriteAnim(gSprites[spriteId], 1);
  } else {
    gSprites[spriteId].x = 240;
    gSprites[spriteId].data[0] *= -1;
  }
}

/** GetSeagallopNumber: the "SEAGALLOP HI-SPEED ##" line for this route. */
export function getSeagallopNumber(): number {
  const o = varGet(SV.x8004), d = varGet(SV.x8006);
  const either = (a: number) => o === a || d === a;
  const both = (set: number[]) => set.includes(o) && set.includes(d);
  if (either(C.SEAGALLOP_CINNABAR_ISLAND)) return 1;
  if (either(C.SEAGALLOP_VERMILION_CITY)) return 7;
  if (either(C.SEAGALLOP_NAVEL_ROCK)) return 10;
  if (either(C.SEAGALLOP_BIRTH_ISLAND)) return 12;
  if (both([C.SEAGALLOP_ONE_ISLAND, C.SEAGALLOP_TWO_ISLAND, C.SEAGALLOP_THREE_ISLAND])) return 2;
  if (both([C.SEAGALLOP_FOUR_ISLAND, C.SEAGALLOP_FIVE_ISLAND])) return 3;
  if (both([C.SEAGALLOP_SIX_ISLAND, C.SEAGALLOP_SEVEN_ISLAND])) return 5;
  return 6;
}

/** DoSeagallopFerryScene */
export function doSeagallopFerryScene(game: Game): void {
  const ow = game.overworld;
  const scene = new HwScene();
  scene.enter();
  game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  let state = 0;
  const wakeTemplate = templateFrom(data<CSpriteTemplate>("sWakeSpriteTemplate"), { SpriteCB_Wake: (s) => { if (s.animEnded) DestroySprite(s); } });
  function CreateWakeSprite(x: number): void {
    const id = CreateSprite(wakeTemplate, x, 92, 8);
    if (id !== 64 && directionOfTravel() === DIRN_EASTBOUND) StartSpriteAnim(gSprites[id], 1);
  }
  const ferryTemplate = templateFrom(data<CSpriteTemplate>("sFerrySpriteTemplate"), {
    SpriteCB_Ferry: (s: Sprite) => {
      s.data[1] += s.data[0];
      s.x2 = s.data[1] >> 4;
      if (s.data[2] % 5 === 0) CreateWakeSprite(s.x + s.x2);
      s.data[2]++;
      if (((300 + s.x2) & 0xffff) > 600) DestroySprite(s);
    },
  });
  const scrollBg = (): void => { ChangeBgX(3, 0x600, directionOfTravel() === DIRN_EASTBOUND ? BG_COORD_ADD : BG_COORD_SUB); };
  function Task_Seagallop_3(): void {
    const seag = data<number[][]>("sSeag");
    let dest = varGet(SV.x8006);
    if (dest >= seag.length) dest = 0;
    const [group, num, x, y] = seag[dest];
    sound.playSE(C.SE_EXIT);
    FreeFerrySpriteResources();
    FreeAllWindowBuffers();
    scene.leave();
    game.scene = null;
    ow.setWarpDestination(group, num, -1, x, y);
    ow.fieldCallback = () => ow.fieldCBDefaultWarpExit();
    ow.resetInitialPlayerAvatarState();
    ow.warpIntoMapAndLoad();
  }
  let timer = 0;
  function Task_Seagallop_1(id: number): void {
    scrollBg();
    if (++timer === 140) {
      sound.fadeOutBGM(4);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      tasks.setFunc(id, Task_Seagallop_2);
    }
  }
  function Task_Seagallop_2(id: number): void {
    scrollBg();
    if (sound.isBGMPausedOrStopped() && !gPaletteFade.active) {
      Task_Seagallop_3();
      tasks.destroy(id);
    }
  }
  function Task_Seagallop_0(id: number): void { tasks.setFunc(id, Task_Seagallop_1); }
  function MainCB2_SeaGallop(): void {
    tasks.run();
    AnimateSprites();
    BuildOamBuffer();
    UpdatePaletteFade();
  }
  function VBlankCB_SeaGallop(): void { LoadOam(); ProcessSpriteCopyRequests(); TransferPlttBuffer(); }
  SetVBlankCallback(null);
  function CB2_SetUpSeagallopScene(): void {
    switch (state) {
      case 0:
        ResetGPU();
        state++;
        break;
      case 1:
        ResetAllAssets();
        state++;
        break;
      case 2: {
        ResetBgsAndClearDma3BusyFlags(false);
        InitBgsFromTemplates(0, data<BgTemplate[]>("sBGTemplates"));
        SetBgTilemapBuffer(3, new Uint16Array(0x400));
        ResetBGPos();
        state++;
        break;
      }
      case 3: {
        const tiles = incbin("sWaterTiles");
        LoadBgTiles(3, tiles, tiles.length, 0);
        const map = incbin(directionOfTravel() === DIRN_EASTBOUND ? "sWaterTilemap_EB" : "sWaterTilemap_WB");
        const words = new Uint16Array(map.length >> 1);
        for (let i = 0; i < words.length; i++) words[i] = map[i * 2] | (map[i * 2 + 1] << 8);
        CopyToBgTilemapBufferRect(3, words, 0, 0, 32, 32);
        LoadPalette(incbin("sWaterPal"), 0x40, 32);
        LoadPalette(GetTextWindowPalette(2), 0xf0, 32);
        state++;
        break;
      }
      case 4:
        ShowBg(0);
        ShowBg(3);
        CopyBgTilemapBufferToVram(3);
        state++;
        break;
      case 5:
        LoadFerrySpriteResources();
        BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
        state++;
        break;
      case 6:
        BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
        state++;
        break;
      case 7: {
        SetDispcnt();
        SetVBlankCallback(VBlankCB_SeaGallop);
        sound.playSE(C.SE_SHIP);
        CreateFerrySprite(ferryTemplate);
        SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
        SetGpuReg(REG_OFFSET_WININ, 0x3f);
        SetGpuReg(REG_OFFSET_WINOUT, 0x00);
        SetGpuReg(REG_OFFSET_WIN0H, 0x00f0);
        SetGpuReg(REG_OFFSET_WIN0V, 0x1888);
        tasks.create(Task_Seagallop_0, 8);
        SetMainCallback2(MainCB2_SeaGallop);
        break;
      }
    }
  }
  SetMainCallback2(CB2_SetUpSeagallopScene);
}

/** script_menu.c DrawSeagallopDestinationMenu: the list items for this page and origin. */
export function seagallopDestinationItems(): { labels: string[]; numItems: number; top: number } {
  const origin = varGet(SV.x8004);
  const page = varGet(SV.x8005);
  const names = ["gText_Vermilion", "gText_OneIsland", "gText_TwoIsland", "gText_ThreeIsland", "gText_FourIsland", "gText_FiveIsland", "gText_SixIsland", "gText_SevenIsland"];
  let dest: number, numItems: number, top: number;
  if (page === 1) { dest = origin < C.SEAGALLOP_FIVE_ISLAND ? C.SEAGALLOP_FIVE_ISLAND : C.SEAGALLOP_FOUR_ISLAND; numItems = 5; top = 2; }
  else { dest = C.SEAGALLOP_VERMILION_CITY; numItems = 6; top = 0; }
  const labels: string[] = [];
  for (let i = 0; i < numItems - 2; i++) {
    if (dest !== origin) labels.push(names[dest]);
    else i--;
    dest++;
    if (dest === C.SEAGALLOP_SEVEN_ISLAND + 1) dest = C.SEAGALLOP_VERMILION_CITY;
  }
  labels.push("gText_Other", "gOtherText_Exit");
  return { labels, numItems, top };
}

/** GetSelectedSeagallopDestination */
export function getSelectedSeagallopDestination(result: number): number {
  const origin = varGet(SV.x8004);
  const CANCEL = 127;
  if (result === CANCEL) return CANCEL;
  if (varGet(SV.x8005) === 1) {
    if (result === 3) return C.SEAGALLOP_MORE;
    if (result === 4) return CANCEL;
    if (result === 0) return origin > C.SEAGALLOP_FOUR_ISLAND ? C.SEAGALLOP_FOUR_ISLAND : C.SEAGALLOP_FIVE_ISLAND;
    if (result === 1) return origin > C.SEAGALLOP_FIVE_ISLAND ? C.SEAGALLOP_FIVE_ISLAND : C.SEAGALLOP_SIX_ISLAND;
    if (result === 2) return origin > C.SEAGALLOP_SIX_ISLAND ? C.SEAGALLOP_SIX_ISLAND : C.SEAGALLOP_SEVEN_ISLAND;
  } else {
    if (result === 4) return C.SEAGALLOP_MORE;
    if (result === 5) return CANCEL;
    return result >= origin ? result + 1 : result;
  }
  return C.SEAGALLOP_VERMILION_CITY;
}
