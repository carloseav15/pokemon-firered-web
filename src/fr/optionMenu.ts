// option_menu.c: the OPTION screen on the hardware layer (header window,
// user frame preview on BG1, WIN0 highlight bar over the selected row,
// Pick/Switch/Cancel bar). CloseAndSaveOptionMenu writes the options back;
// the caller returns to the field with the start menu open.

import { sound } from "./audio/sound";
import { intToDecimal, STR_CONV_MODE_LEADING_ZEROS } from "./gba/charmap";
import { FONT_NORMAL, FONT_SMALL, stringWidth } from "./gba/font";
import { joy, A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP } from "./gba/input";
import { tasks } from "./gba/tasks";
import { textOptions } from "./gba/textPrinter";
import { cdata, incbin, loadCData, preloadPacks } from "./hw/assets";
import {
  BG_COORD_SET, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags,
  ShowBg,
} from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import { FONTATTR_MAX_LETTER_HEIGHT, GetFontAttribute, GetTextWindowPalette, LoadStdWindowGfxOnBg } from "./hw/menu";
import { BeginNormalPaletteFade, BG_PLTT_ID, gPaletteFade, LoadPalette, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import {
  BLDCNT_EFFECT_BLEND, BLDCNT_EFFECT_LIGHTEN, BLDCNT_TGT1_BG0, BLDCNT_TGT1_BG1, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY,
  REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, WIN_RANGE, WININ_WIN0_BG0,
} from "./hw/ppu";
import { SetHBlankCallback, SetMainCallback2, SetVBlankCallback, SetMainCallback2WhenLoaded } from "./hw/runtime";
import { AnimateSprites, BuildOamBuffer, FreeAllSpritePalettes, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData } from "./hw/sprite";
import { AddTextPrinterParameterized, AddTextPrinterParameterized3, DeactivateAllTextPrinters } from "./hw/text";
import { COPYWIN_FULL, CopyWindowToVram, FillWindowPixelBuffer, FillWindowPixelRect, FreeAllWindowBuffers, InitWindows, PIXEL_FILL, PutWindowTilemap } from "./hw/window";
import { rom } from "./rom";
import { save } from "./save";

const MENUITEM_TEXTSPEED = 0, MENUITEM_BATTLESCENE = 1, MENUITEM_BATTLESTYLE = 2, MENUITEM_SOUND = 3, MENUITEM_BUTTONMODE = 4, MENUITEM_FRAMETYPE = 5,
  MENUITEM_CANCEL = 6, MENUITEM_COUNT = 7;
const WIN_TEXT_OPTION = 0, WIN_OPTIONS = 1;
const WINOUT_WIN01_BG0 = 1 << 0, WINOUT_WIN01_BG1 = 1 << 1, WINOUT_WIN01_BG2 = 1 << 2, WINOUT_WIN01_CLR = 1 << 5;
const DISPCNT_WIN0_ON = 0x2000;
const TEXT_SKIP_DRAW = 0xff;

const sOptionMenuItemCounts = [3, 2, 2, 2, 3, 10, 0];
const sOptionMenuItemsNames = ["gText_TextSpeed", "gText_BattleScene", "gText_BattleStyle", "gText_Sound", "gText_ButtonMode", "gText_Frame", "gText_OptionMenuCancel"];
const sOptionTexts = [
  ["gText_TextSpeedSlow", "gText_TextSpeedMid", "gText_TextSpeedFast"],
  ["gText_BattleSceneOn", "gText_BattleSceneOff"],
  ["gText_BattleStyleShift", "gText_BattleStyleSet"],
  ["gText_SoundMono", "gText_SoundStereo"],
  ["gText_ButtonTypeHelp", "gText_ButtonTypeLR", "gText_ButtonTypeLEqualsA"],
];
const sOptionMenuPickSwitchCancelTextColor = [6, 1, 2]; // TEXT_DYNAMIC_COLOR_6, WHITE, DARK_GRAY
const sOptionMenuTextColor = [0, 4, 5]; // TRANSPARENT, LIGHT_RED, RED

type OptionMenu = { option: number[]; cursorPos: number; loadState: number; state: number; loadPaletteState: number; done: () => void };
let sOptionMenuPtr: OptionMenu | null = null;
const m = (): OptionMenu => sOptionMenuPtr!;

type UserFrame = { tiles: { $sym: string }; palette: { $sym: string } };
const userFrame = (frameType: number): UserFrame => cdata<UserFrame[]>("text_window_graphics", "gUserFrames")[frameType];

/** CB2_OptionsMenuFromStartMenu; `done` runs CloseAndSaveOptionMenu's savedCallback. Runs under gMain in an HwScene. */
export function openOptionMenu(done: () => void): void {
  SetMainCallback2WhenLoaded(Promise.all([
    loadCData("strings", "text_window_graphics"),
    preloadPacks(["graphics_misc", "graphics_text_window", "graphics_fonts"]),
  ]), () => {
    const o = save.options;
    sOptionMenuPtr = {
      option: [o.textSpeed, o.battleScene ? 0 : 1, o.battleStyle, o.sound, o.buttonMode, o.frameType, 0],
      cursorPos: 0, loadState: 0, state: 0, loadPaletteState: 0, done,
    };
    for (let i = 0; i < MENUITEM_COUNT - 1; i++) if (m().option[i] > sOptionMenuItemCounts[i] - 1) m().option[i] = 0;
    SetMainCallback2(CB2_OptionMenu);
  });
}

function CB2_InitOptionMenu(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

function VBlankCB_OptionMenu(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_OptionMenu(): void {
  switch (m().state) {
    case 0: SetVBlankCallback(null); SetHBlankCallback(null); break;
    case 1: InitOptionMenuBg(); break;
    case 2: ResetSpriteData(); ResetPaletteFade(); FreeAllSpritePalettes(); tasks.reset(); break;
    case 3: if (!LoadOptionMenuPalette()) return; break;
    case 4: PrintOptionMenuHeader(); break;
    case 5: DrawOptionMenuBg(); break;
    case 6: LoadOptionMenuItemNames(); break;
    case 7: for (let i = 0; i < MENUITEM_COUNT; i++) BufferOptionMenuString(i); break;
    case 8: UpdateSettingSelectionDisplay(m().cursorPos); break;
    case 9: OptionMenu_PickSwitchCancel(); break;
    default:
      tasks.create(Task_OptionMenu, 0);
      SetMainCallback2(CB2_InitOptionMenu);
      break;
  }
  if (sOptionMenuPtr) m().state++;
}

function InitOptionMenuBg(): void {
  ppu.vram.fill(0); ppu.oam.fill(0); ppu.pltt.fill(0);
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, [
    { bg: 1, charBaseIndex: 1, mapBaseIndex: 30, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0 },
    { bg: 0, charBaseIndex: 1, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 1, baseTile: 0 },
    { bg: 2, charBaseIndex: 1, mapBaseIndex: 29, screenSize: 0, paletteMode: 0, priority: 2, baseTile: 0 },
  ]);
  for (let bg = 0; bg < 4; bg++) { ChangeBgX(bg, 0, BG_COORD_SET); ChangeBgY(bg, 0, BG_COORD_SET); }
  InitWindows([
    { bg: 1, tilemapLeft: 2, tilemapTop: 3, width: 26, height: 2, paletteNum: 1, baseBlock: 2 },
    { bg: 0, tilemapLeft: 2, tilemapTop: 7, width: 26, height: 12, paletteNum: 1, baseBlock: 0x36 },
    { bg: 2, tilemapLeft: 0, tilemapTop: 0, width: 30, height: 2, paletteNum: 15, baseBlock: 0x16e },
    { bg: 0xff, tilemapLeft: 0, tilemapTop: 0, width: 0, height: 0, paletteNum: 0, baseBlock: 0 },
  ]);
  DeactivateAllTextPrinters();
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG0 | BLDCNT_EFFECT_BLEND | BLDCNT_EFFECT_LIGHTEN);
  SetGpuReg(REG_OFFSET_BLDY, BLDCNT_TGT1_BG1);
  SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG0);
  SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG0 | WINOUT_WIN01_BG1 | WINOUT_WIN01_BG2 | WINOUT_WIN01_CLR);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON | DISPCNT_WIN0_ON);
  ShowBg(0); ShowBg(1); ShowBg(2);
}

function OptionMenu_PickSwitchCancel(): void {
  const str = rom.text("gText_PickSwitchCancel");
  const x = 0xe4 - stringWidth(FONT_SMALL, str, 0);
  FillWindowPixelBuffer(2, PIXEL_FILL(15));
  AddTextPrinterParameterized3(2, FONT_SMALL, x, 0, sOptionMenuPickSwitchCancelTextColor, 0, str);
  PutWindowTilemap(2);
  CopyWindowToVram(2, COPYWIN_FULL);
}

function loadUserFrame(frameType: number): void {
  const frame = userFrame(frameType);
  LoadBgTiles(1, incbin(frame.tiles.$sym), 0x120, 0x1aa);
  LoadPalette(incbin(frame.palette.$sym), BG_PLTT_ID(2), 32);
}

function LoadOptionMenuPalette(): boolean {
  switch (m().loadPaletteState) {
    case 0: { const frame = userFrame(m().option[MENUITEM_FRAMETYPE]); LoadBgTiles(1, incbin(frame.tiles.$sym), 0x120, 0x1aa); break; }
    case 1: LoadPalette(incbin(userFrame(m().option[MENUITEM_FRAMETYPE]).palette.$sym), BG_PLTT_ID(2), 32); break;
    case 2: {
      const pal = incbin("sOptionMenuPalette");
      LoadPalette(pal, BG_PLTT_ID(1), pal.length);
      LoadPalette(GetTextWindowPalette(2), BG_PLTT_ID(15), 32);
      break;
    }
    case 3: LoadStdWindowGfxOnBg(1, 0x1b3, BG_PLTT_ID(3)); break;
    default: return true;
  }
  m().loadPaletteState++;
  return false;
}

function Task_OptionMenu(taskId: number): void {
  const o = m();
  switch (o.loadState) {
    case 0:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0x10, 0, RGB_BLACK);
      SetVBlankCallback(VBlankCB_OptionMenu);
      o.loadState++;
      break;
    case 1:
      if (gPaletteFade.active) return;
      o.loadState++;
      break;
    case 2:
      switch (OptionMenu_ProcessInput()) {
        case 1: o.loadState++; break;
        case 2: loadUserFrame(o.option[MENUITEM_FRAMETYPE]); BufferOptionMenuString(o.cursorPos); break;
        case 3: UpdateSettingSelectionDisplay(o.cursorPos); break;
        case 4: BufferOptionMenuString(o.cursorPos); break;
      }
      break;
    case 3:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
      o.loadState++;
      break;
    case 4:
      if (gPaletteFade.active) return;
      o.loadState++;
      break;
    case 5:
      CloseAndSaveOptionMenu(taskId);
      break;
  }
}

function OptionMenu_ProcessInput(): number {
  const o = m();
  const count = sOptionMenuItemCounts[o.cursorPos];
  if (joy.repeated & DPAD_RIGHT) {
    // MENUITEM_CANCEL has no values: 0 - 1 wraps like the source's u16 compare.
    o.option[o.cursorPos] = o.option[o.cursorPos] === ((count - 1) & 0xffff) ? 0 : (o.option[o.cursorPos] + 1) & 0xffff;
    return o.cursorPos === MENUITEM_FRAMETYPE ? 2 : 4;
  }
  if (joy.repeated & DPAD_LEFT) {
    o.option[o.cursorPos] = o.option[o.cursorPos] === 0 ? (count - 1) & 0xffff : o.option[o.cursorPos] - 1;
    return o.cursorPos === MENUITEM_FRAMETYPE ? 2 : 4;
  }
  if (joy.repeated & DPAD_UP) {
    o.cursorPos = o.cursorPos === MENUITEM_TEXTSPEED ? MENUITEM_CANCEL : o.cursorPos - 1;
    return 3;
  }
  if (joy.repeated & DPAD_DOWN) {
    o.cursorPos = o.cursorPos === MENUITEM_CANCEL ? MENUITEM_TEXTSPEED : o.cursorPos + 1;
    return 3;
  }
  if (joy.newKeys & (A_BUTTON | B_BUTTON)) return 1;
  return 0;
}

function BufferOptionMenuString(selection: number): void {
  const o = m();
  const height = GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT);
  const x = 0x82;
  const y = (height - 1) * selection + 2;
  FillWindowPixelRect(WIN_OPTIONS, 1, x, y, 0x46, height);
  let str: Uint8Array | null = null;
  if (selection < MENUITEM_FRAMETYPE) {
    const name = sOptionTexts[selection][o.option[selection]];
    if (name) str = rom.text(name);
  } else if (selection === MENUITEM_FRAMETYPE) {
    const head = Array.from(rom.text("gText_FrameType"));
    const end = head.indexOf(0xff);
    str = Uint8Array.from([...head.slice(0, end < 0 ? head.length : end), ...Array.from(intToDecimal(o.option[selection] + 1, STR_CONV_MODE_LEADING_ZEROS, 2)).filter((b) => b !== 0xff), 0xff]);
  }
  if (str) AddTextPrinterParameterized3(WIN_OPTIONS, FONT_NORMAL, x, y, sOptionMenuTextColor, -1, str);
  PutWindowTilemap(WIN_OPTIONS);
  CopyWindowToVram(WIN_OPTIONS, COPYWIN_FULL);
}

function CloseAndSaveOptionMenu(taskId: number): void {
  const o = m();
  FreeAllWindowBuffers();
  Object.assign(save.options, {
    textSpeed: o.option[MENUITEM_TEXTSPEED], battleScene: o.option[MENUITEM_BATTLESCENE] === 0, battleStyle: o.option[MENUITEM_BATTLESTYLE],
    sound: o.option[MENUITEM_SOUND], buttonMode: o.option[MENUITEM_BUTTONMODE], frameType: o.option[MENUITEM_FRAMETYPE],
  });
  // SetPokemonCryStereo, plus the live copies the port keeps of these options.
  sound.setStereo(save.options.sound === 1);
  textOptions.speed = save.options.textSpeed;
  joy.buttonMode = save.options.buttonMode;
  tasks.destroy(taskId);
  const done = o.done;
  sOptionMenuPtr = null;
  SetVBlankCallback(null);
  SetMainCallback2(null);
  done();
}

function PrintOptionMenuHeader(): void {
  FillWindowPixelBuffer(WIN_TEXT_OPTION, PIXEL_FILL(1));
  AddTextPrinterParameterized(WIN_TEXT_OPTION, FONT_NORMAL, rom.text("gText_Option"), 8, 1, TEXT_SKIP_DRAW, null);
  PutWindowTilemap(WIN_TEXT_OPTION);
  CopyWindowToVram(WIN_TEXT_OPTION, COPYWIN_FULL);
}

function DrawOptionMenuBg(): void {
  const h = 2;
  FillBgTilemapBufferRect(1, 0x1b3, 1, 2, 1, 1, 3);
  FillBgTilemapBufferRect(1, 0x1b4, 2, 2, 0x1b, 1, 3);
  FillBgTilemapBufferRect(1, 0x1b5, 0x1c, 2, 1, 1, 3);
  FillBgTilemapBufferRect(1, 0x1b6, 1, 3, 1, h, 3);
  FillBgTilemapBufferRect(1, 0x1b8, 0x1c, 3, 1, h, 3);
  FillBgTilemapBufferRect(1, 0x1b9, 1, 5, 1, 1, 3);
  FillBgTilemapBufferRect(1, 0x1ba, 2, 5, 0x1b, 1, 3);
  FillBgTilemapBufferRect(1, 0x1bb, 0x1c, 5, 1, 1, 3);
  FillBgTilemapBufferRect(1, 0x1aa, 1, 6, 1, 1, h);
  FillBgTilemapBufferRect(1, 0x1ab, 2, 6, 0x1a, 1, h);
  FillBgTilemapBufferRect(1, 0x1ac, 0x1c, 6, 1, 1, h);
  FillBgTilemapBufferRect(1, 0x1ad, 1, 7, 1, 0x10, h);
  FillBgTilemapBufferRect(1, 0x1af, 0x1c, 7, 1, 0x10, h);
  FillBgTilemapBufferRect(1, 0x1b0, 1, 0x13, 1, 1, h);
  FillBgTilemapBufferRect(1, 0x1b1, 2, 0x13, 0x1a, 1, h);
  FillBgTilemapBufferRect(1, 0x1b2, 0x1c, 0x13, 1, 1, h);
  CopyBgTilemapBufferToVram(1);
}

function LoadOptionMenuItemNames(): void {
  const height = GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT);
  FillWindowPixelBuffer(WIN_OPTIONS, PIXEL_FILL(1));
  for (let i = 0; i < MENUITEM_COUNT; i++) {
    AddTextPrinterParameterized(WIN_OPTIONS, FONT_NORMAL, rom.text(sOptionMenuItemsNames[i]), 8, ((i * height + 2) & 0xff) - i, TEXT_SKIP_DRAW, null);
  }
}

function UpdateSettingSelectionDisplay(selection: number): void {
  const maxLetterHeight = GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT);
  const y = selection * (maxLetterHeight - 1) + 0x3a;
  SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(y, y + maxLetterHeight));
  SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0x10, 0xe0));
}

