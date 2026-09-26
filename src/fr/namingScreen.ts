// naming_screen.c: hardware-screen entry/exit and source keyboard data.
// Page-swap/button-flash choreography and target icons still need their C callbacks.
import * as C from "./generated/constants";
import { MoveCursorToOKButton, NamingModel, type NameBuffer } from "./menus/namingModel";
import { cdata, incbin, loadCData, preloadPacks, type SymRef } from "./hw/assets";
import { animFrom, oamFrom, templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import { save, varGet, flagGet } from "./save";
import { getBoxName, getPCBoxToSendMon, isDestinationBoxFull } from "./pokemon/storage";
import { rom } from "./rom";
import { joy, A_BUTTON } from "./gba/input";
import { EOS, stringVars, expandPlaceholders } from "./gba/charmap";
import { FONT_NORMAL, FONT_SMALL, stringWidth } from "./gba/font";
import { tasks } from "./gba/tasks";
import { sound } from "./audio/sound";
import { speciesName } from "./pokemon/pokemon";
import { textFlags, getTextSpeedSetting } from "./gba/textPrinter";
import { BG_COORD_SET, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate } from "./hw/bg";
import { InitGpuRegManager, SetGpuReg } from "./hw/gpu";
import { DrawDialogueFrame, GetTextWindowPalette, InitStandardTextBoxWindows, InitTextBoxGfxAndPrinters } from "./hw/menu";
import { BeginNormalPaletteFade, gPaletteFade, LoadPalette, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { gMain, SetMainCallback1, SetMainCallback2, SetHBlankCallback, SetVBlankCallback } from "./hw/runtime";
import { AnimateSprites, BuildOamBuffer, CreateSprite, FreeAllSpritePalettes, GetSpriteTileStartByTag, gSprites, IndexOfSpritePaletteTag, LoadOam, LoadSpritePalette, LoadSpriteSheet, ProcessSpriteCopyRequests, ResetSpriteData, SetSubspriteTables, SpriteCallbackDummy, StartSpriteAnim, type Subsprite } from "./hw/sprite";
import { AddTextPrinterParameterized2, AddTextPrinterParameterized3, DeactivateAllTextPrinters, IsTextPrinterActive, RunTextPrinters } from "./hw/text";
import { AddWindow, CopyWindowToVram, COPYWIN_FULL, FillWindowPixelBuffer, FreeAllWindowBuffers, PIXEL_FILL, PutWindowTilemap, type WindowTemplate } from "./hw/window";
import { CreateMonIcon, LoadMonIconPalettes } from "./pokemonIcon";
import { CreateObjectGraphicsSprite, CopyObjectGraphicsInfoToSpriteTemplate } from "./objectEventGraphics";

const data = <T>(name: string) => cdata<T>("naming_screen", name);
const text = (name: string) => cdata<number[]>("strings", name);
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
  private state: "fadeIn" | "input" | "moveToOK" | "message" | "fadeOut" = "fadeIn";
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
    for (const sheet of data<Array<{data: SymRef; size: number; tag: number}>>("sSpriteSheets")) {
      if (sheet.data) LoadSpriteSheet({data: incbin(sheet.data.$sym), size: sheet.size, tag: sheet.tag});
    }
    for (const pal of data<Array<{data: SymRef; tag: number}>>("sSpritePalettes")) {
      if (pal.data) LoadSpritePalette({data: incbin(pal.data.$sym).subarray((pal.data.index ?? 0) * 32, ((pal.data.index ?? 0) + 1) * 32), tag: pal.tag});
    }
    this.cursor = this.sprite("sSpriteTemplate_Cursor", 38, 88, 1);
    gSprites[this.cursor].oam.priority = 1;
    this.sprite("sSpriteTemplate_PageSwapFrame", 204, 88, 0, "sSubspriteTable_PageSwapFrame");
    this.pageText = this.sprite("sSpriteTemplate_PageSwapText", 204, 84, 1, "sSubspriteTable_PageSwapText");
    this.pageButton = this.sprite("sSpriteTemplate_PageSwapButton", 204, 83, 2);
    gSprites[this.pageButton].oam.priority = 1;
    this.sprite("sSpriteTemplate_BackButton", 204, 116, 0, "sSubspriteTable_Button");
    this.sprite("sSpriteTemplate_OkButton", 204, 140, 0, "sSubspriteTable_Button");
    const baseX = (240 - this.model.template.maxChars * 8) / 2 + 6;
    gSprites[this.sprite("sSpriteTemplate_InputArrow", baseX - 5, 56, 0)].oam.priority = 3;
    for (let i = 0; i < this.model.template.maxChars; i++) gSprites[this.sprite("sSpriteTemplate_Underscore", baseX + i * 8 + 3, 60, 0)].oam.priority = 3;
    this.createInputTargetIcon();
    this.drawPage(); this.drawEntry(); this.drawTitle(); this.drawControls();
    for (let bg = 0; bg < 4; bg++) { CopyBgTilemapBufferToVram(bg); ShowBg(bg); }
    joy.repeatStartDelay = 16;
    BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    SetVBlankCallback(() => { LoadOam(); ProcessSpriteCopyRequests(); TransferPlttBuffer(); });
    SetMainCallback2(() => this.update());
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
    const page = this.model.keyboardId;
    const map = ["Lower", "Upper", "Symbols"][page];
    CopyToBgTilemapBuffer(1, incbin(`gNamingScreenKeyboard${map}_Tilemap`), 0, 0);
    const win = this.windows[0];
    const fill = [14, 13, 15][page];
    FillWindowPixelBuffer(win, PIXEL_FILL(fill));
    const rows = data<SymRef[][]>("sNamingScreenKeyboardText")[page];
    rows.forEach((row, i) => AddTextPrinterParameterized3(win, C.FONT_NORMAL_COPY_1, 0, i * 16 + 1, [fill, 1, 2], 0, cdata<number[]>("keyboard_text", row.$sym)));
    PutWindowTilemap(win); CopyWindowToVram(win, COPYWIN_FULL);
    CopyBgTilemapBufferToVram(1);
    const gfx = data<number[]>("sPageToNextGfxId")[this.model.page];
    gSprites[this.pageButton].oam.paletteNum = IndexOfSpritePaletteTag(data<number[]>("sPageSwapPalTags")[gfx]);
    gSprites[this.pageText].sheetTileStart = GetSpriteTileStartByTag(data<number[]>("sPageSwapGfxTags")[gfx]);
    gSprites[this.pageText].subspriteTableNum = gfx;
    this.moveCursor();
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
    sprite.x = this.model.onButton ? 196 : this.model.columnPositions[this.model.x] + 38;
    sprite.y = this.model.onButton ? [88, 116, 140][this.model.y] : this.model.y * 16 + 88;
  }

  private fadeOut(): void {
    BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.state = "fadeOut";
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
    this.state = "message";
  }

  private update(): void {
    if (this.state === "fadeIn" && !gPaletteFade.active) this.state = "input";
    else if (this.state === "input") {
      const action = this.model.input(joy.newKeys, joy.repeated);
      if (action === "move") sound.playSE(C.SE_SELECT);
      if (action === "page") { sound.playSE(C.SE_WIN_OPEN); this.drawPage(); }
      if (action === "moveToOK") {
        StartSpriteAnim(gSprites[this.cursor], 1);
        this.state = "moveToOK";
      }
      if (action === "character" || action === "moveToOK" || action === "delete") {
        sound.playSE(action === "delete" ? C.SE_BALL : C.SE_SELECT); this.drawEntry();
      }
      if (action !== "none" && action !== "moveToOK") this.moveCursor();
      if (action === "confirm") {
        sound.playSE(C.SE_SELECT);
        if (this.model.type === C.NAMING_SCREEN_CAUGHT_MON && save.party.length >= C.PARTY_SIZE) this.showPCMessage();
        else this.fadeOut();
      }
    } else if (this.state === "moveToOK") {
      if (gSprites[this.cursor].animEnded) {
        MoveCursorToOKButton(this.model);
        this.moveCursor();
        this.state = "input";
      }
    } else if (this.state === "message") {
      RunTextPrinters();
      if (!IsTextPrinterActive(0) && joy.newKeys & A_BUTTON) this.fadeOut();
    } else if (this.state === "fadeOut" && !gPaletteFade.active) {
      joy.repeatStartDelay = this.repeatDelay;
      Object.assign(textFlags, this.savedTextFlags);
      FreeAllWindowBuffers(); DeactivateAllTextPrinters();
      SetVBlankCallback(null); SetMainCallback1(this.callback1); SetMainCallback2(this.returnCallback);
      return;
    }
    AnimateSprites(); BuildOamBuffer(); UpdatePaletteFade();
  }
}
