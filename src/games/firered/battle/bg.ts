// battle_bg.c: battle BG/window templates, textbox, terrain backgrounds and the entry (intro slide) backgrounds.
// The link-battle VS screen (DrawLinkBattle*, InitLinkBattleVsScreen) is not ported: there is no link play.

import * as C from "../generated/constants";
import { rom } from "../rom";
import { save } from "../save";
import { cdata, incbin, symName } from "../hw/assets";
import { EnableInterrupts, SetGpuReg } from "../hw/gpu";
import {
  CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, type BgTemplate,
} from "../hw/bg";
import { gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, RGB } from "../hw/palette";
import { ppu, DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_OBJWIN_ON, DISPCNT_WIN0_ON, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT,
  REG_OFFSET_BLDY, REG_OFFSET_DISPCNT } from "../hw/ppu";
import { DeactivateAllTextPrinters } from "../hw/text";
import { GetWindowAttribute, InitWindows, WINDOW_BG, type WindowTemplate } from "../hw/window";
import { GetTextWindowPalette } from "../hw/menu";
import { G } from "./globals";
import { battleHost } from "./host";
import { AnimateSprites, BuildOamBuffer, CreateSprite, gSprites, ResetSpriteData } from "../hw/sprite";
import { SetMainCallback2 } from "../hw/runtime";
import { templateFrom, type CSpriteTemplate } from "../hw/cdataSprite";
import { SpriteCB_UnusedDebugSprite } from "./main_init";

export {
  BG_ATTR_PRIORITY, CopyBgTilemapBufferToVram, CopyToBgTilemapBufferRect_ChangePalette, IsDma3ManagerBusyWithBgCopy, SetBgAttribute, ShowBg,
} from "../hw/bg";

const BG_CHAR_ADDR = (n: number) => n * 0x4000;
const BG_SCREEN_ADDR = (n: number) => n * 0x800;
const BG_PLTT_ID = (n: number) => n * 16;

type BattleBackground = { tileset: unknown; tilemap: unknown; entryTileset: unknown; entryTilemap: unknown; palette: unknown };

/** battle_bg.c CreateUnknownDebugSprite (unused in normal gameplay). */
export function CreateUnknownDebugSprite(): void {
  ResetSpriteData();
  const template = templateFrom(cdata<CSpriteTemplate>("battle_main", "gUnknownDebugSprite"), { SpriteCB_UnusedDebugSprite });
  const spriteId = CreateSprite(template, 0, 0, 0);
  if (spriteId < gSprites.length) gSprites[spriteId].invisible = true;
  SetMainCallback2(CB2_unused);
}

/** battle_bg.c CB2_unused. */
export function CB2_unused(): void {
  AnimateSprites();
  BuildOamBuffer();
}

export const gBattleBgTemplates = (): BgTemplate[] => cdata<BgTemplate[]>("battle_bg", "gBattleBgTemplates");
/** GetBattleBgTemplateData (battle_main.c): expose the selected u32 field of the GBA BG template. */
export function GetBattleBgTemplateData(arrayId: number, caseId: number): number {
  const template = gBattleBgTemplates()[arrayId]!;
  switch (caseId) {
    case 0: return template.bg >>> 0;
    case 1: return template.charBaseIndex >>> 0;
    case 2: return template.mapBaseIndex >>> 0;
    case 3: return template.screenSize >>> 0;
    case 4: return template.paletteMode >>> 0;
    case 5: return template.priority >>> 0;
    case 6: return template.baseTile >>> 0;
    default: return 0;
  }
}
const sStandardBattleWindowTemplates = (): WindowTemplate[] => cdata<WindowTemplate[]>("battle_bg", "sStandardBattleWindowTemplates");
const sBattleTerrainTable = (): BattleBackground[] => cdata<BattleBackground[]>("battle_bg", "sBattleTerrainTable");

/** LZDecompressVram (INCBIN data is stored already decompressed). */
function decompressToVram(sym: unknown, offset: number): void {
  const data = incbin(symName(sym) ?? String(sym));
  ppu.vram.set(data.subarray(0, Math.min(data.length, ppu.vram.length - offset)), offset);
}

function loadPalFromSym(sym: unknown, offset: number, size: number): void {
  LoadPalette(incbin(symName(sym) ?? String(sym)), offset, size);
}

function GetBattleTerrainByMapScene(mapBattleScene: number): number {
  for (const [scene, terrain] of cdata<Array<[number, number]>>("battle_bg", "sMapBattleSceneMapping")) {
    if (mapBattleScene === scene) return terrain;
  }
  return C.BATTLE_TERRAIN_PLAIN;
}

function terrainEntry(terrain: number): BattleBackground {
  const table = sBattleTerrainTable();
  return table[terrain >= table.length ? C.BATTLE_TERRAIN_PLAIN : terrain];
}

/** GetBattleTerrainGfxPtrs from battle_bg.c; returns the original exported data references. */
export function GetBattleTerrainGfxPtrs(terrain: number): { tiles: unknown; map: unknown; palette: unknown } {
  const entry = terrainEntry(terrain > C.BATTLE_TERRAIN_PLAIN ? C.BATTLE_TERRAIN_PLAIN : terrain);
  return { tiles: entry.tileset, map: entry.tilemap, palette: entry.palette };
}

function LoadBattleTerrainGfx(terrain: number): void {
  const t = terrainEntry(terrain);
  decompressToVram(t.tileset, BG_CHAR_ADDR(2));
  decompressToVram(t.tilemap, BG_SCREEN_ADDR(26));
  loadPalFromSym(t.palette, BG_PLTT_ID(2), 3 * 32);
}

function LoadBattleTerrainEntryGfx(terrain: number): void {
  const t = terrainEntry(terrain);
  decompressToVram(t.entryTileset, BG_CHAR_ADDR(1));
  decompressToVram(t.entryTilemap, BG_SCREEN_ADDR(28));
}

export function BattleInitBgsAndWindows(): void {
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, gBattleBgTemplates());
  InitWindows(sStandardBattleWindowTemplates());
  DeactivateAllTextPrinters();
}

export function InitBattleBgsVideo(): void {
  EnableInterrupts(0);
  BattleInitBgsAndWindows();
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  SetGpuReg(REG_OFFSET_BLDY, 0);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON | DISPCNT_WIN0_ON | DISPCNT_OBJWIN_ON);
}

/** text_window.c LoadUserWindowGfx */
function LoadUserWindowGfx(windowId: number, destOffset: number, palOffset: number): void {
  const type = save.options.frameType < 10 ? save.options.frameType : 0;
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), incbin(`sUserFrame_Type${type + 1}_Gfx`), 0x120, destOffset);
  LoadPalette(incbin(`sUserFrame_Type${type + 1}_Pal`), palOffset, 32);
}

/** text_window.c LoadMenuMessageWindowGfx */
function LoadMenuMessageWindowGfx(windowId: number, destOffset: number, palOffset: number): void {
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), incbin("gMenuMessageWindow_Gfx"), 0x280, destOffset);
  LoadPalette(GetTextWindowPalette(0), palOffset, 32);
}

export function LoadBattleMenuWindowGfx(): void {
  LoadUserWindowGfx(2, 0x012, BG_PLTT_ID(1));
  LoadUserWindowGfx(2, 0x022, BG_PLTT_ID(1));
  const p5 = BG_PLTT_ID(5);
  gPlttBufferUnfaded[p5 + 12] = RGB(9, 9, 9);
  gPlttBufferUnfaded[p5 + 13] = RGB(9, 9, 9);
  gPlttBufferUnfaded[p5 + 14] = RGB(31, 31, 31);
  gPlttBufferUnfaded[p5 + 15] = RGB(26, 26, 25);
  for (let i = 12; i < 16; i++) gPlttBufferFaded[p5 + i] = gPlttBufferUnfaded[p5 + i];
  if (G.gBattleTypeFlags & (C.BATTLE_TYPE_FIRST_BATTLE | C.BATTLE_TYPE_POKEDUDE)) {
    LoadPalette(incbin("gStandardMenuPalette"), BG_PLTT_ID(7), 20); // Menu_LoadStdPalAt
    LoadMenuMessageWindowGfx(0, 0x030, BG_PLTT_ID(7));
    const p7 = BG_PLTT_ID(7);
    gPlttBufferUnfaded[p7 + 6] = RGB(0, 0, 0);
    gPlttBufferFaded[p7 + 6] = gPlttBufferUnfaded[p7 + 6];
  }
}

export function DrawMainBattleBackground(): void {
  LoadBattleTerrainGfx(GetBattleTerrainOverride());
}

export function LoadBattleTextboxAndBackground(): void {
  decompressToVram("gBattleInterface_Textbox_Gfx", BG_CHAR_ADDR(0));
  CopyToBgTilemapBuffer(0, incbin("gBattleInterface_Textbox_Tilemap"), 0, 0);
  CopyBgTilemapBufferToVram(0);
  LoadPalette(incbin("gBattleInterface_Textbox_Pal"), BG_PLTT_ID(0), 2 * 32);
  LoadBattleMenuWindowGfx();
  DrawMainBattleBackground();
}

function trainerClass(): number {
  return rom.trainers[G.gTrainerBattleOpponent_A]?.class ?? 0;
}

export function DrawBattleEntryBackground(): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE) {
    LoadBattleTerrainEntryGfx(C.BATTLE_TERRAIN_GRASS);
  } else if (G.gBattleTypeFlags & (C.BATTLE_TYPE_TRAINER_TOWER | C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_BATTLE_TOWER | C.BATTLE_TYPE_EREADER_TRAINER)) {
    LoadBattleTerrainEntryGfx(C.BATTLE_TERRAIN_BUILDING);
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_KYOGRE_GROUDON) {
    LoadBattleTerrainEntryGfx(C.BATTLE_TERRAIN_CAVE); // FireRed
  } else {
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) {
      const cls = trainerClass();
      if (cls === C.TRAINER_CLASS_LEADER || cls === C.TRAINER_CLASS_CHAMPION) {
        LoadBattleTerrainEntryGfx(C.BATTLE_TERRAIN_BUILDING);
        return;
      }
    }
    if (battleHost.mapBattleScene() === C.MAP_BATTLE_SCENE_NORMAL) LoadBattleTerrainEntryGfx(G.gBattleTerrain);
    else LoadBattleTerrainEntryGfx(C.BATTLE_TERRAIN_BUILDING);
  }
}

function GetBattleTerrainOverride(): number {
  if (G.gBattleTypeFlags & (C.BATTLE_TYPE_TRAINER_TOWER | C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_BATTLE_TOWER | C.BATTLE_TYPE_EREADER_TRAINER)) {
    return C.BATTLE_TERRAIN_LINK;
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE) {
    G.gBattleTerrain = C.BATTLE_TERRAIN_GRASS;
    return C.BATTLE_TERRAIN_GRASS;
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) {
    if (trainerClass() === C.TRAINER_CLASS_LEADER) return C.BATTLE_TERRAIN_LEADER;
    if (trainerClass() === C.TRAINER_CLASS_CHAMPION) return C.BATTLE_TERRAIN_CHAMPION;
  }
  const battleScene = battleHost.mapBattleScene();
  if (battleScene === C.MAP_BATTLE_SCENE_NORMAL) return G.gBattleTerrain;
  return GetBattleTerrainByMapScene(battleScene);
}

/** Used by reshow_battle_screen.c */
export function LoadChosenBattleElement(caseId: number): boolean {
  switch (caseId) {
    case 0:
      decompressToVram("gBattleInterface_Textbox_Gfx", BG_CHAR_ADDR(0));
      break;
    case 1:
      CopyToBgTilemapBuffer(0, incbin("gBattleInterface_Textbox_Tilemap"), 0, 0);
      CopyBgTilemapBufferToVram(0);
      break;
    case 2:
      LoadPalette(incbin("gBattleInterface_Textbox_Pal"), BG_PLTT_ID(0), 2 * 32);
      break;
    case 3:
      decompressToVram(terrainEntry(GetBattleTerrainOverride()).tileset, BG_CHAR_ADDR(2));
    // fall through
    case 4:
      decompressToVram(terrainEntry(GetBattleTerrainOverride()).tilemap, BG_SCREEN_ADDR(26));
      break;
    case 5:
      loadPalFromSym(terrainEntry(GetBattleTerrainOverride()).palette, BG_PLTT_ID(2), 3 * 32);
      break;
    case 6:
      LoadBattleMenuWindowGfx();
      break;
    default:
      return true;
  }
  return false;
}

/** battle_gfx_sfx_util.c BattleInterfaceSetWindowPals: give palette-0 pixels of the window frame tiles a solid index. */
export function BattleInterfaceSetWindowPals(): void {
  const vram = new Uint16Array(ppu.vram.buffer, ppu.vram.byteOffset, ppu.vram.length >> 1);
  const fix = (byteOffset: number, tiles: number, nibble: number) => {
    let p = byteOffset >> 1;
    for (let i = 0; i < tiles; i++) {
      for (let j = 0; j < 16; j++, p++) {
        let v = vram[p];
        if (!(v & 0xf000)) v |= nibble << 12;
        if (!(v & 0x0f00)) v |= nibble << 8;
        if (!(v & 0x00f0)) v |= nibble << 4;
        if (!(v & 0x000f)) v |= nibble;
        vram[p] = v;
      }
    }
  };
  fix(0x240, 9, 0xf);
  fix(0x600, 18, 0x6);
}
