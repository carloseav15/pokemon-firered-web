// naming_screen.c: hardware-screen entry/exit and source keyboard data.
// Target icons, the BG page swap, and cursor/button flashes use C data.
import * as C from "./generated/constants";
import { PageToNextGfxId } from "./generated/cdataTableAccessors";
import { CurrentPageToNextKeyboardId, GetKeyRoleAtCursorPos, MoveCursorToOKButton, NamingModel, SwapKeyboardPage, type NameBuffer } from "./menus/namingModel";
import { cdata, incbin, loadCData, preloadPacks, type SymRef } from "./hw/assets";
import { animFrom, oamFrom, templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import { save, varGet, flagGet } from "./save";
import { getBoxName, getPCBoxToSendMon, isDestinationBoxFull } from "./pokemon/storage";
import { rom } from "./rom";
import { joy, A_BUTTON, B_BUTTON, SELECT_BUTTON, START_BUTTON, DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT } from "./gba/input";
import { EOS, stringVars, expandPlaceholders } from "./gba/charmap";
import { FONT_NORMAL, FONT_SMALL, stringWidth } from "./gba/font";
import { tasks } from "./gba/tasks";
import { sound } from "./audio/sound";
import { speciesName } from "./pokemon/pokemon";
import { textFlags, getTextSpeedSetting } from "./gba/textPrinter";
import { BG_ATTR_PRIORITY, BG_COORD_SET, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, GetBgAttribute, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgAttribute, SetBgTilemapBuffer, ShowBg, type BgTemplate } from "./hw/bg";
import { InitGpuRegManager, SetGpuReg } from "./hw/gpu";
import { DrawDialogueFrame, GetTextWindowPalette, InitStandardTextBoxWindows, InitTextBoxGfxAndPrinters } from "./hw/menu";
import { BeginNormalPaletteFade, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { BLDALPHA_BLEND, BLDCNT_EFFECT_BLEND, BLDCNT_TGT2_BG1, BLDCNT_TGT2_BG2, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { gMain, SetMainCallback1, SetMainCallback2, SetHBlankCallback, SetVBlankCallback } from "./hw/runtime";
import { AnimateSprites, BuildOamBuffer, CreateSprite, FreeAllSpritePalettes, GetSpriteTileStartByTag, gSprites, IndexOfSpritePaletteTag, LoadOam, LoadSpritePalette, LoadSpriteSheet, ProcessSpriteCopyRequests, ResetSpriteData, SetSubspriteTables, SpriteCallbackDummy, StartSpriteAnim, type Sprite, type Subsprite } from "./hw/sprite";
import { AddTextPrinterParameterized2, AddTextPrinterParameterized3, DeactivateAllTextPrinters, IsTextPrinterActive, RunTextPrinters } from "./hw/text";
import { AddWindow, CopyWindowToVram, COPYWIN_FULL, FillWindowPixelBuffer, FreeAllWindowBuffers, PIXEL_FILL, PutWindowTilemap, type WindowTemplate } from "./hw/window";
import { CreateMonIcon, LoadMonIconPalettes } from "./pokemonIcon";
import { CreateObjectGraphicsSprite, CopyObjectGraphicsInfoToSpriteTemplate } from "./objectEventGraphics";
import { Sin } from "./hw/trig";

const data = <T>(name: string) => cdata<T>("naming_screen", name);
const text = (name: string) => cdata<number[]>("strings", name);
// BUTTON_PAGE/BUTTON_BACK/BUTTON_OK/BUTTON_COUNT (naming_screen.c).
const enum NamingButton { PAGE, BACK, OK, COUNT }
let loading: Promise<void> | undefined;
export function preloadNamingScreen(): Promise<void> {
  return loading ??= Promise.all([
    loadCData("naming_screen", "keyboard_text", "strings", "text_window_graphics", "pokemon_icon", "event_object_movement", "field_player_avatar"),
    preloadPacks(["graphics_naming_screen", "graphics_text_window", "graphics_fonts", "graphics_object_events", "pokemon"]),
  ]).then(() => undefined);
}

/** C argument order: template, destination, species, gender, personality, callback. */
export function DoNamingScreen(type: number, destination: NameBuffer, species: number, gender: number, personality: number, returnCallback: () => void): void {
  const screen = new NamingScreen(new NamingModel(type, destination), species, gender, personality, returnCallback);
  // Defer initialization: Oak's caller frees its own windows after this call.
  SetMainCallback2(() => screen.begin());
}

class NamingScreen {
  private windows: number[] = [];
  private cursor = 0;
  private pageText = 0;
  private pageButton = 0;
  private state: "fadeIn" | "waitFadeIn" | "input" | "moveToOK" | "pageSwap" | "pressedOK" | "waitSentToPCMessage" | "fadeOut" | "exit" = "fadeIn";
  private activeKeyboardBg = 1;
  private bgToReveal = 0;
  private bg1vOffset = 0;
  private bg2vOffset = 0;
  private buttonFlashTaskId = -1;
  private stopFlashesNextUpdate = false;
  private pageSwapFrameCount = 0;
  private pageSwapAnimState = 0;
  private pageSwapButtonState = 0;
  private pageSwapPage = 0;
  private callback1 = gMain.callback1;
  private repeatDelay = joy.repeatStartDelay;
  private savedTextFlags = { ...textFlags };
  constructor(private model: NamingModel, private species: number, private gender: number, readonly personality: number, private returnCallback: () => void) {}

  begin(): void {
    SetMainCallback1(null);
    SetVBlankCallback(null);
    SetHBlankCallback(null);
    InitGpuRegManager();
    ppu.vram.fill(0); ppu.oam.fill(0); ppu.pltt.fill(0);
    tasks.reset();
    FreeAllWindowBuffers();
    ResetSpriteData(); FreeAllSpritePalettes(); ResetPaletteFade();
    ResetBgsAndClearDma3BusyFlags(false);
    InitBgsFromTemplates(0, data<BgTemplate[]>("sBgTemplates"));
    for (let bg = 0; bg < 4; bg++) {
      SetBgTilemapBuffer(bg, new Uint16Array(1024));
      ChangeBgX(bg, 0, BG_COORD_SET); ChangeBgY(bg, 0, BG_COORD_SET);
    }
    InitStandardTextBoxWindows(); InitTextBoxGfxAndPrinters();
    this.windows = data<WindowTemplate[]>("sWindowTemplates").filter(w => w.bg !== 255).map(w => AddWindow(w));
    SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
    LoadPalette(incbin("gNamingScreenMenu_Pal"), 0, incbin("gNamingScreenMenu_Pal").length);
    LoadPalette(incbin("gNamingScreenKeyboard_Pal"), 160, 32);
    LoadPalette(GetTextWindowPalette(2), 176, 32);
    for (let bg = 1; bg <= 3; bg++) {
      const tiles = incbin("gNamingScreenMenu_Gfx");
      LoadBgTiles(bg, tiles, tiles.length, 0);
    }
    CopyToBgTilemapBuffer(3, incbin("gNamingScreenBackground_Tilemap"), 0, 0);
    SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG1 | BLDCNT_TGT2_BG2);
    SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(12, 8));
    for (const sheet of data<Array<{data: SymRef; size: number; tag: number}>>("sSpriteSheets")) {
      if (sheet.data) LoadSpriteSheet({data: incbin(sheet.data.$sym), size: sheet.size, tag: sheet.tag});
    }
    for (const pal of data<Array<{data: SymRef; tag: number}>>("sSpritePalettes")) {
      if (pal.data) LoadSpritePalette({data: incbin(pal.data.$sym).subarray((pal.data.index ?? 0) * 32, ((pal.data.index ?? 0) + 1) * 32), tag: pal.tag});
    }
    this.cursor = this.sprite("sSpriteTemplate_Cursor", 38, 88, 1);
    gSprites[this.cursor].callback = sprite => this.SpriteCB_Cursor(sprite);
    this.SetCursorInvisibility(true);
    gSprites[this.cursor].oam.priority = 1;
    this.CreatePageSwapButtonSprites();
    this.sprite("sSpriteTemplate_BackButton", 204, 116, 0, "sSubspriteTable_Button");
    this.sprite("sSpriteTemplate_OkButton", 204, 140, 0, "sSubspriteTable_Button");
    const baseX = (240 - this.model.template.maxChars * 8) / 2 + 6;
    const inputArrow = this.sprite("sSpriteTemplate_InputArrow", baseX - 5, 56, 0);
    gSprites[inputArrow].oam.priority = 3;
    gSprites[inputArrow].invisible = true;
    gSprites[inputArrow].callback = sprite => this.SpriteCB_InputArrow(sprite);
    for (let i = 0; i < this.model.template.maxChars; i++) {
      const underscore = this.sprite("sSpriteTemplate_Underscore", baseX + i * 8 + 3, 60, 0);
      gSprites[underscore].oam.priority = 3;
      gSprites[underscore].data[0] = i;
      gSprites[underscore].invisible = true;
      gSprites[underscore].callback = sprite => this.SpriteCB_Underscore(sprite);
    }
    this.createInputTargetIcon();
    this.CreateButtonFlashTask();
    SetVBlankCallback(() => {
      LoadOam(); ProcessSpriteCopyRequests(); TransferPlttBuffer();
      SetGpuReg(REG_OFFSET_BG1VOFS, this.bg1vOffset);
      SetGpuReg(REG_OFFSET_BG2VOFS, this.bg2vOffset);
    });
    SetMainCallback2(() => this.Task_NamingScreen());
  }

  private sprite(name: string, x: number, y: number, order: number, table?: string): number {
    const source = data<CSpriteTemplate>(name);
    const template = templateFrom(source);
    // Static C names can also exist in other loaded files. Resolve this
    // screen's OAM/animation tables locally rather than taking the first match.
    if (source.oam) template.oam = oamFrom(data(source.oam.$sym));
    if (source.anims) template.anims = data<SymRef[]>(source.anims.$sym).map(ref => animFrom(data(ref.$sym)));
    const id = CreateSprite(template, x, y, order);
    if (table) {
      const tables = data<Array<{subspriteCount: number; subsprites: SymRef}>>(table);
      SetSubspriteTables(gSprites[id], tables.map(t => {
        const subsprites = data<Subsprite[]>(t.subsprites.$sym);
        return {subspriteCount: subsprites.length, subsprites};
      }));
    }
    return id;
  }

  /** CreateButtonFlashTask (naming_screen.c). */
  private CreateButtonFlashTask(): void {
    this.buttonFlashTaskId = tasks.create(taskId => this.Task_UpdateButtonFlash(taskId), 3);
    tasks.data(this.buttonFlashTaskId)[0] = NamingButton.COUNT;
  }

  /** SetSpritesVisible (naming_screen.c). */
  private SetSpritesVisible(): void {
    for (const sprite of gSprites) {
      if (sprite.inUse) sprite.invisible = false;
    }
    this.SetCursorInvisibility(false);
  }

  /** SpriteCB_InputArrow (naming_screen.c). */
  private SpriteCB_InputArrow(sprite: Sprite): void {
    const x = [0, -4, -2, -1];
    let delay = sprite.data[0]!;
    if (delay === 0 || --delay === 0) {
      delay = 8;
      sprite.data[1] = (sprite.data[1]! + 1) & (x.length - 1);
    }
    sprite.data[0] = delay;
    sprite.x2 = x[sprite.data[1]! & (x.length - 1)]!;
  }

  /** SpriteCB_Underscore (naming_screen.c). */
  private SpriteCB_Underscore(sprite: Sprite): void {
    const y = [2, 3, 2, 1];
    if (this.model.caret !== (sprite.data[0]! & 0xff)) {
      sprite.y2 = 0;
      sprite.data[1] = 0;
      sprite.data[2] = 0;
      return;
    }
    const yPosId = sprite.data[1]! & (y.length - 1);
    sprite.y2 = y[yPosId]!;
    sprite.data[2] = sprite.data[2]! + 1;
    if (sprite.data[2]! > 8) {
      sprite.data[1] = (yPosId + 1) & (y.length - 1);
      sprite.data[2] = 0;
    }
  }

  /** CreateInputTargetIcon and sIconFunctions dispatch from naming_screen.c. */
  private createInputTargetIcon(): void {
    switch (this.model.template.iconFunction) {
      case 1: this.NamingScreen_CreatePlayerIcon(); break;
      case 2: this.NamingScreen_CreatePCIcon(); break;
      case 3: this.NamingScreen_CreateMonIcon(); break;
      case 4: this.NamingScreen_CreateRivalIcon(); break;
    }
  }

  private NamingScreen_CreatePlayerIcon(): void {
    const graphics = cdata<number[][]>("field_player_avatar", "sPlayerAvatarGfxIds")[C.PLAYER_AVATAR_STATE_NORMAL][this.species];
    const id = CreateObjectGraphicsSprite(graphics, SpriteCallbackDummy, 56, 37, 0);
    gSprites[id].oam.priority = 3;
    StartSpriteAnim(gSprites[id], C.ANIM_STD_GO_SOUTH);
  }

  private NamingScreen_CreatePCIcon(): void {
    const id = this.sprite("sSpriteTemplate_PCIcon", 56, 41, 0, "sSubspriteTable_PCIcon");
    gSprites[id].oam.priority = 3;
  }

  private NamingScreen_CreateMonIcon(): void {
    LoadMonIconPalettes();
    const id = CreateMonIcon(this.species, SpriteCallbackDummy, 56, 40, 0, this.personality, 1);
    gSprites[id].oam.priority = 3;
  }

  private NamingScreen_CreateRivalIcon(): void {
    const { spriteTemplate } = CopyObjectGraphicsInfoToSpriteTemplate(C.OBJ_EVENT_GFX_RED_NORMAL, SpriteCallbackDummy);
    spriteTemplate.tileTag = 255;
    spriteTemplate.paletteTag = 255;
    spriteTemplate.anims = data<SymRef[]>("sAnims_Rival").map(ref => animFrom(data(ref.$sym)));
    LoadSpriteSheet({ data: incbin("sRival_Gfx"), size: 0x900, tag: 255 });
    LoadSpritePalette({ data: incbin("gNamingScreenRival_Pal"), tag: 255 });
    const id = CreateSprite(spriteTemplate, 56, 37, 0);
    gSprites[id].oam.priority = 3;
  }

  private drawPage(): void {
    const nextKeyboard = CurrentPageToNextKeyboardId(this.model);
    this.drawKeyboardPage(1, 0, this.model.keyboardId);
    this.drawKeyboardPage(2, 1, nextKeyboard);
    this.setPageSwapButtonGfx(this.model.page);
    this.moveCursor();
  }

  private drawKeyboardPage(bg: number, windowIndex: number, keyboardId: number): void {
    const map = ["Lower", "Upper", "Symbols"][keyboardId];
    CopyToBgTilemapBuffer(bg, incbin(`gNamingScreenKeyboard${map}_Tilemap`), 0, 0);
    const win = this.windows[windowIndex];
    const fill = [14, 13, 15][keyboardId];
    FillWindowPixelBuffer(win, PIXEL_FILL(fill));
    const rows = data<SymRef[][]>("sNamingScreenKeyboardText")[keyboardId];
    rows.forEach((row, i) => AddTextPrinterParameterized3(win, C.FONT_NORMAL_COPY_1, 0, i * 16 + 1, [fill, 1, 2], 0, cdata<number[]>("keyboard_text", row.$sym)));
    PutWindowTilemap(win); CopyWindowToVram(win, COPYWIN_FULL);
    CopyBgTilemapBufferToVram(bg);
  }

  private setPageSwapButtonGfx(page: number): void {
    const gfx = PageToNextGfxId(page);
    gSprites[this.pageButton].oam.paletteNum = IndexOfSpritePaletteTag(data<number[]>("sPageSwapPalTags")[gfx]);
    gSprites[this.pageText].sheetTileStart = GetSpriteTileStartByTag(data<number[]>("sPageSwapGfxTags")[gfx]);
    gSprites[this.pageText].subspriteTableNum = gfx;
  }

  /** CreatePageSwapButtonSprites (naming_screen.c). */
  private CreatePageSwapButtonSprites(): void {
    this.sprite("sSpriteTemplate_PageSwapFrame", 204, 88, 0, "sSubspriteTable_PageSwapFrame");
    this.pageText = this.sprite("sSpriteTemplate_PageSwapText", 204, 84, 1, "sSubspriteTable_PageSwapText");
    this.pageButton = this.sprite("sSpriteTemplate_PageSwapButton", 204, 83, 2);
    gSprites[this.pageButton].oam.priority = 1;
  }

  /** StartPageSwapAnim (naming_screen.c); create and run the C task init state immediately. */
  private StartPageSwapAnim(): void {
    this.pageSwapFrameCount = 0;
    this.PageSwapAnimState_Init();
  }

  /** PageSwapAnimState_Init (naming_screen.c). */
  private PageSwapAnimState_Init(): void {
    this.bg1vOffset = 0;
    this.bg2vOffset = 0;
    ChangeBgY(1, 0, BG_COORD_SET);
    ChangeBgY(2, 0, BG_COORD_SET);
    this.pageSwapAnimState = 1;
  }

  /** StartPageSwapButtonAnim (naming_screen.c). */
  private StartPageSwapButtonAnim(): void {
    this.pageSwapButtonState = 2;
    this.pageSwapPage = this.model.page;
  }

  /** IsPageSwapAnimNotInProgress (naming_screen.c). */
  private IsPageSwapAnimNotInProgress(): boolean {
    return this.pageSwapAnimState === 0;
  }

  /** SpriteCB_PageSwap (naming_screen.c): run the current page-button callback state. */
  private SpriteCB_PageSwap(): void {
    switch (this.pageSwapButtonState) {
      case 0: this.PageSwapSprite_Init(); break;
      case 1: this.PageSwapSprite_Idle(); break;
      case 2: this.PageSwapSprite_SlideOff(); break;
      case 3: this.PageSwapSprite_SlideOn(); break;
    }
  }

  /** PageSwapSprite_Init (naming_screen.c). */
  private PageSwapSprite_Init(): void {
    this.setPageSwapButtonGfx(PageToNextGfxId(this.model.page));
    this.pageSwapButtonState = 1;
  }

  /** PageSwapSprite_Idle (naming_screen.c). */
  private PageSwapSprite_Idle(): void {}

  /** PageSwapSprite_SlideOff (naming_screen.c). */
  private PageSwapSprite_SlideOff(): void {
    const text = gSprites[this.pageText]!;
    if (++text.y2 > 7) {
      this.pageSwapButtonState = 3;
      text.y2 = -4;
      text.invisible = true;
      this.setPageSwapButtonGfx(PageToNextGfxId((this.pageSwapPage + 1) % 3));
    }
  }

  /** PageSwapSprite_SlideOn (naming_screen.c). */
  private PageSwapSprite_SlideOn(): void {
    const text = gSprites[this.pageText]!;
    text.invisible = false;
    if (++text.y2 >= 0) {
      text.y2 = 0;
      this.pageSwapButtonState = 1;
    }
  }

  private MainState_StartPageSwap(): void {
    this.TryStartButtonFlash(NamingButton.PAGE, false, true);
    this.state = "pageSwap";
    this.SetCursorInvisibility(true);
    gSprites[this.pageText].y2 = 0;
    this.StartPageSwapButtonAnim();
    this.StartPageSwapAnim();
  }

  private updatePageSwapOffsets(): void {
    this.pageSwapFrameCount++;
    const angle = this.pageSwapFrameCount * 4;
    const revealOffset = Sin(angle, 40);
    const hideOffset = Sin((angle + 128) & 0xff, 40);
    const offsets = this.bgToReveal === 0
      ? [[REG_OFFSET_BG2VOFS, revealOffset], [REG_OFFSET_BG1VOFS, hideOffset]]
      : [[REG_OFFSET_BG1VOFS, revealOffset], [REG_OFFSET_BG2VOFS, hideOffset]];
    for (const [reg, value] of offsets) {
      if (reg === REG_OFFSET_BG1VOFS) this.bg1vOffset = value;
      else this.bg2vOffset = value;
    }

  }

  private PageSwapAnimState_1(): void {
    this.updatePageSwapOffsets();
    if (this.pageSwapFrameCount < 16) return;
    const bg1Priority = GetBgAttribute(1, BG_ATTR_PRIORITY);
    const bg2Priority = GetBgAttribute(2, BG_ATTR_PRIORITY);
    SetBgAttribute(1, BG_ATTR_PRIORITY, bg2Priority);
    SetBgAttribute(2, BG_ATTR_PRIORITY, bg1Priority);
    ShowBg(1); ShowBg(2);
    this.activeKeyboardBg = bg1Priority < bg2Priority ? 2 : 1;
    this.pageSwapAnimState = 2;
  }

  private PageSwapAnimState_2(): void {
    this.updatePageSwapOffsets();
    if (this.pageSwapFrameCount < 32) return;
    this.bgToReveal = 1 - this.bgToReveal;
    this.pageSwapAnimState = 3;
  }

  private DrawKeyboardPageOnDeck(): void {
    const hiddenBg = this.activeKeyboardBg === 1 ? 2 : 1;
    const hiddenWindow = hiddenBg === 1 ? 0 : 1;
    const nextKeyboard = CurrentPageToNextKeyboardId(this.model);
    this.drawKeyboardPage(hiddenBg, hiddenWindow, nextKeyboard);
  }

  private PageSwapAnimState_Done(): void {
    this.pageSwapAnimState = 0;
  }

  /** Task_HandlePageSwapAnim (naming_screen.c): advance one C task state per field frame. */
  private Task_HandlePageSwapAnim(): void {
    if (this.pageSwapAnimState === 1) this.PageSwapAnimState_1();
    else if (this.pageSwapAnimState === 2) this.PageSwapAnimState_2();
    else if (this.pageSwapAnimState === 3) this.PageSwapAnimState_Done();
  }

  private MainState_WaitPageSwap(): void {
    if (!this.IsPageSwapAnimNotInProgress()) return;
    SwapKeyboardPage(this.model);
    this.DrawKeyboardPageOnDeck();
    this.setPageSwapButtonGfx(this.model.page);
    gSprites[this.pageText].y2 = 0;
    this.SetCursorInvisibility(false);
    this.moveCursor();
    this.state = "input";
  }

  private drawEntry(): void {
    const win = this.windows[2];
    FillWindowPixelBuffer(win, PIXEL_FILL(1));
    const x = (240 - this.model.template.maxChars * 8) / 2 + 6 - 64;
    for (let i = 0; i < this.model.template.maxChars; i++) AddTextPrinterParameterized3(win, FONT_NORMAL, x + i * 8, 1, [1, 2, 3], 0, [this.model.text[i], EOS]);
    if (this.model.template.addGenderIcon && this.gender !== C.MON_GENDERLESS) {
      const female = this.gender === C.MON_FEMALE;
      AddTextPrinterParameterized3(win, FONT_NORMAL, 104, 1, female ? [0, 5, 4] : [0, 9, 8], 0, text(female ? "gText_FemaleSymbol" : "gText_MaleSymbol"));
    }
    PutWindowTilemap(win); CopyWindowToVram(win, COPYWIN_FULL);
  }

  private drawTitle(): void {
    const win = this.windows[3];
    const title = text(this.model.template.title.$sym);
    const prefix = this.model.template.addGenderIcon ? Array.from(speciesName(this.species)).filter(ch => ch !== EOS) : [];
    FillWindowPixelBuffer(win, PIXEL_FILL(1));
    AddTextPrinterParameterized3(win, C.FONT_NORMAL_COPY_1, 1, 1, [1, 2, 3], 0, [...prefix, ...title]);
    PutWindowTilemap(win); CopyWindowToVram(win, COPYWIN_FULL);
  }

  private drawControls(): void {
    const win = this.windows[4], label = text("gText_MoveOkBack");
    FillWindowPixelBuffer(win, PIXEL_FILL(15));
    AddTextPrinterParameterized3(win, FONT_SMALL, 236 - stringWidth(FONT_SMALL, label, 0), 0, [15, 1, 2], 0, label);
    PutWindowTilemap(win); CopyWindowToVram(win, COPYWIN_FULL);
  }

  private moveCursor(): void {
    const sprite = gSprites[this.cursor];
    sprite.data[0] = this.model.x; // sX
    sprite.data[1] = this.model.y; // sY
    sprite.x = this.model.onButton ? 0 : this.model.columnPositions[this.model.x] + 38;
    sprite.y = this.model.onButton ? [88, 116, 140][this.model.y] : this.model.y * 16 + 88;
  }

  /** SetCursorInvisibility (naming_screen.c). */
  private SetCursorInvisibility(invisible: boolean): void {
    const sprite = gSprites[this.cursor];
    sprite.data[4] = (sprite.data[4]! & 0xff00) | Number(invisible); // sInvisible
    StartSpriteAnim(sprite, 0);
  }

  /** SetCursorFlashing (naming_screen.c). */
  private SetCursorFlashing(flashing: boolean): void {
    const sprite = gSprites[this.cursor];
    sprite.data[4] = (sprite.data[4]! & 0x00ff) | (Number(flashing) << 8); // sFlashing
  }

  /** SpriteCB_Cursor (naming_screen.c). */
  private SpriteCB_Cursor(sprite: Sprite): void {
    if (sprite.animEnded) StartSpriteAnim(sprite, 0);
    sprite.invisible = !!(sprite.data[4]! & 0x00ff); // sInvisible
    if (sprite.data[0] === this.model.columns) sprite.invisible = true;
    if (sprite.invisible || !(sprite.data[4]! & 0xff00)
      || sprite.data[0] !== sprite.data[2] || sprite.data[1] !== sprite.data[3]) {
      sprite.data[5] = 0; // sColor
      sprite.data[6] = 2; // sColorIncr
      sprite.data[7] = 2; // sColorDelay
    }
    sprite.data[7] = sprite.data[7]! - 1;
    if (sprite.data[7] === 0) {
      sprite.data[5]! += sprite.data[6]!;
      if (sprite.data[5] === 16 || sprite.data[5] === 0) sprite.data[6] = -sprite.data[6]!;
      sprite.data[7] = 2;
    }
    if (sprite.data[4]! & 0xff00) {
      const color = sprite.data[5]!;
      const template = data<CSpriteTemplate>("sSpriteTemplate_Cursor");
      const index = OBJ_PLTT_ID(IndexOfSpritePaletteTag(template.paletteTag)) + 1;
      this.MultiplyInvertedPaletteRGBComponents(index, color >> 1, color, color);
    }
    sprite.data[2] = sprite.data[0]!; // sPrevX
    sprite.data[3] = sprite.data[1]!; // sPrevY
  }

  /** MainState_FadeIn (naming_screen.c). */
  private MainState_FadeIn(): void {
    this.drawPage(); this.drawEntry(); this.drawTitle(); this.drawControls();
    for (let bg = 0; bg < 4; bg++) { CopyBgTilemapBufferToVram(bg); ShowBg(bg); }
    joy.repeatStartDelay = 16;
    BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    this.state = "waitFadeIn";
  }

  /** MainState_WaitFadeIn (naming_screen.c). */
  private MainState_WaitFadeIn(): void {
    if (!gPaletteFade.active) {
      this.SetCursorFlashing(true);
      this.state = "input";
    }
  }

  /** MainState_HandleInput (naming_screen.c). */
  private MainState_HandleInput(): void {
    const roleBeforeInput = GetKeyRoleAtCursorPos(this.model);
    const action = this.model.input(joy.newKeys, joy.repeated);
    const dpadRepeated = !(joy.newKeys & (A_BUTTON | B_BUTTON | SELECT_BUTTON | START_BUTTON))
      && !!(joy.repeated & (DPAD_UP | DPAD_DOWN | DPAD_LEFT | DPAD_RIGHT));
    const role = dpadRepeated ? GetKeyRoleAtCursorPos(this.model) : roleBeforeInput;
    const button = role === "page" ? NamingButton.PAGE : role === "backspace" ? NamingButton.BACK : role === "ok" ? NamingButton.OK : NamingButton.COUNT;
    if (!(joy.newKeys & (B_BUTTON | SELECT_BUTTON | START_BUTTON))) {
      this.TryStartButtonFlash(button, button !== NamingButton.COUNT, false);
    }
    if (action === "move") sound.playSE(C.SE_SELECT);
    if (action === "page") { sound.playSE(C.SE_WIN_OPEN); this.MainState_StartPageSwap(); }
    if (action === "moveToOK") {
      StartSpriteAnim(gSprites[this.cursor], 1);
      this.state = "moveToOK";
    }
    if (action === "delete") {
      if (role === "character" || role === "backspace") this.TryStartButtonFlash(NamingButton.BACK, false, true);
    }
    if (action === "character" || action === "moveToOK" || action === "delete") {
      sound.playSE(action === "delete" ? C.SE_BALL : C.SE_SELECT); this.drawEntry();
    }
    if (action !== "none" && action !== "moveToOK") this.moveCursor();
    if (action === "confirm") {
      sound.playSE(C.SE_SELECT);
      this.state = "pressedOK";
    }
  }

  /** MainState_MoveToOKButton (naming_screen.c). */
  private MainState_MoveToOKButton(): void {
    if (!gSprites[this.cursor].animEnded) return;
    MoveCursorToOKButton(this.model);
    this.moveCursor();
    this.state = "input";
  }

  /** MainState_PressedOKButton (naming_screen.c). */
  private MainState_PressedOKButton(): void {
    this.model.save();
    this.stopFlashesNextUpdate = true;
    if (this.model.type === C.NAMING_SCREEN_CAUGHT_MON && save.party.length >= C.PARTY_SIZE) this.showPCMessage();
    else this.state = "fadeOut";
  }

  /** MainState_FadeOut (naming_screen.c). */
  private MainState_FadeOut(): void {
    BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.state = "exit";
  }

  /** MainState_Exit (naming_screen.c). */
  private MainState_Exit(): void {
    if (gPaletteFade.active) return;
    joy.repeatStartDelay = this.repeatDelay;
    Object.assign(textFlags, this.savedTextFlags);
    FreeAllWindowBuffers(); DeactivateAllTextPrinters();
    SetVBlankCallback(null); SetMainCallback1(this.callback1); SetMainCallback2(this.returnCallback);
  }

  private showPCMessage(): void {
    const changedBox = isDestinationBoxFull();
    stringVars.var1 = getBoxName(varGet(C.VAR_PC_BOX_TO_SEND_MON));
    stringVars.var2 = Uint8Array.from(Array.from({length: this.model.destination.length}, (_, i) => this.model.destination[i]));
    if (changedBox) stringVars.var3 = getBoxName(getPCBoxToSendMon());
    const labels = ["Text_MonSentToBoxInSomeonesPC", "Text_MonSentToBoxInBillsPC", "Text_MonSentToBoxSomeonesBoxFull", "Text_MonSentToBoxBillsBoxFull"];
    const index = (changedBox ? 2 : 0) + (flagGet(C.FLAG_SYS_NOT_SOMEONES_PC) ? 1 : 0);
    DrawDialogueFrame(0, false);
    textFlags.canABSpeedUpPrint = true;
    textFlags.useAlternateDownArrow = false;
    textFlags.autoScroll = false;
    AddTextPrinterParameterized2(0, FONT_NORMAL, expandPlaceholders(rom.text(labels[index])), getTextSpeedSetting(), null, 2, 1, 3);
    CopyWindowToVram(0, COPYWIN_FULL);
    this.state = "waitSentToPCMessage";
  }

  /** MainState_WaitSentToPCMessage (naming_screen.c). */
  private MainState_WaitSentToPCMessage(): void {
    RunTextPrinters();
    if (!IsTextPrinterActive(0) && joy.newKeys & A_BUTTON) this.state = "fadeOut";
  }

  /** TryStartButtonFlash (naming_screen.c). */
  private TryStartButtonFlash(button: number, keepFlashing: boolean, interruptCurFlash: boolean): void {
    const task = tasks.data(this.buttonFlashTaskId);
    const currentButton = task[0];
    if (button === currentButton && !interruptCurFlash) {
      task[1] = Number(keepFlashing);
      task[2] = 1;
      return;
    }
    if (button === NamingButton.COUNT && !task[1] && !interruptCurFlash) return;
    if (currentButton !== NamingButton.COUNT) this.RestoreButtonColor(currentButton);
    this.StartButtonFlash(task, button, keepFlashing);
  }

  /** Task_UpdateButtonFlash (naming_screen.c). */
  private Task_UpdateButtonFlash(taskId: number): void {
    const task = tasks.data(taskId);
    const button = task[0]!;
    if (button === NamingButton.COUNT || !task[2]) return;
    const paletteIndex = this.GetButtonPalOffset(button);
    this.MultiplyInvertedPaletteRGBComponents(paletteIndex, task[3]!, task[3]!, task[3]!);
    if (task[5]) {
      task[5] = task[5]! - 1;
      if (task[5]) return;
    }
    task[5] = 2;
    if (task[4]! >= 0) {
      if (task[3]! < 14) {
        task[3] += task[4]!;
        task[6] += task[4]!;
      } else {
        task[3] = 16;
        task[6]++;
      }
    } else {
      task[3] += task[4]!;
      task[6] += task[4]!;
    }
    if (task[3] === 16 && task[6] === 22) task[4] = -4;
    else if (task[3] === 0) {
      task[2] = task[1]!;
      task[4] = 2;
      task[6] = 0;
    }
  }

  /** GetButtonPalOffset (naming_screen.c). */
  private GetButtonPalOffset(button: number): number {
    const templateName = ["sSpriteTemplate_PageSwapFrame", "sSpriteTemplate_BackButton", "sSpriteTemplate_OkButton"][button]!;
    const template = data<CSpriteTemplate>(templateName);
    return OBJ_PLTT_ID(IndexOfSpritePaletteTag(template.paletteTag)) + 14;
  }

  /** RestoreButtonColor (naming_screen.c). */
  private RestoreButtonColor(button: number): void {
    const index = this.GetButtonPalOffset(button);
    gPlttBufferFaded[index] = gPlttBufferUnfaded[index]!;
  }

  /** StartButtonFlash (naming_screen.c). */
  private StartButtonFlash(task: number[], button: number, keepFlashing: boolean): void {
    task[0] = button;
    task[1] = Number(keepFlashing);
    task[2] = 1;
    task[3] = 4;
    task[4] = 2;
    task[5] = 0;
    task[6] = 4;
  }

  /** MultiplyInvertedPaletteRGBComponents (field_effect.c). */
  private MultiplyInvertedPaletteRGBComponents(index: number, r: number, g: number, b: number): void {
    const color = gPlttBufferUnfaded[index]!;
    const red = color & 0x1f;
    const green = (color >> 5) & 0x1f;
    const blue = (color >> 10) & 0x1f;
    gPlttBufferFaded[index] = red + (((0x1f - red) * r) >> 4)
      | (green + (((0x1f - green) * g) >> 4)) << 5
      | (blue + (((0x1f - blue) * b) >> 4)) << 10;
  }

  /** Task_NamingScreen (naming_screen.c): dispatch the active main-state callback. */
  private Task_NamingScreen(): void {
    switch (this.state) {
      case "fadeIn": this.MainState_FadeIn(); this.SetSpritesVisible(); break;
      case "waitFadeIn": this.MainState_WaitFadeIn(); break;
      case "input": this.MainState_HandleInput(); break;
      case "moveToOK": this.MainState_MoveToOKButton(); break;
      case "pageSwap": this.MainState_WaitPageSwap(); break;
      case "pressedOK": this.MainState_PressedOKButton(); break;
      case "waitSentToPCMessage": this.MainState_WaitSentToPCMessage(); break;
      case "fadeOut": this.MainState_FadeOut(); break;
      case "exit": this.MainState_Exit(); break;
    }
    this.Task_HandlePageSwapAnim();
    this.SpriteCB_PageSwap();
    if (this.stopFlashesNextUpdate) {
      this.SetCursorFlashing(false);
      this.TryStartButtonFlash(NamingButton.COUNT, false, true);
      this.stopFlashesNextUpdate = false;
    }
    tasks.run();
    AnimateSprites(); BuildOamBuffer(); UpdatePaletteFade();
  }
}
