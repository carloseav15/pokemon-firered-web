// mail.c: ReadMail and the source paper, text, fade, and teardown callbacks.
import * as C from "../generated/constants";
import { decode, encode, EOS } from "../gba/charmap";
import { joy, A_BUTTON, B_BUTTON } from "../gba/input";
import { tasks } from "../gba/tasks";
import { cdata, incbin, incbin16, loadCData, preloadPacks, symName, type SymRef } from "../hw/assets";
import { BG_PLTT_ID, BeginNormalPaletteFade, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, PALETTES_ALL, PLTT_SIZE_4BPP, ResetPaletteFade, RGB, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "../hw/palette";
import { BG_SCREEN_SIZE, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, FillBgTilemapBufferRect_Palette0, InitBgsFromTemplates, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate } from "../hw/bg";
import { DecompressAndCopyTileDataToVram, FreeTempTileDataBuffersIfPossible, ResetTempTileDataBuffers } from "../hw/menuHelpers";
import { GetTextWindowPalette } from "../hw/menu";
import { SetGpuReg } from "../hw/gpu";
import { REG_OFFSET_DISPCNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, ppu } from "../hw/ppu";
import { SetMainCallback2, SetVBlankCallback, SetHBlankCallback, gMain } from "../hw/runtime";
import { ScanlineEffect_Stop } from "../hw/scanline";
import { AnimateSprites, BuildOamBuffer, FreeAllSpritePalettes, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy, gSprites } from "../hw/sprite";
import { CreateMonIcon_HandleDeoxys, DestroyMonIcon, FreeMonIconPalette as freeIconPalette, LoadMonIconPalette } from "../pokemonIcon";
import { MailSpeciesToIconSpecies } from "./trainerCard";
import { mailLines, MailSpeciesToSpecies } from "../pokemon/mail";
import { AddTextPrinterParameterized3, RunTextPrinters, DeactivateAllTextPrinters } from "../hw/text";
import { FONT_NORMAL_COPY_1, stringWidth } from "../gba/font";
import { COPYWIN_FULL, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap, type WindowTemplate } from "../hw/window";
import { rom } from "../rom";
import { save } from "../save";
import type { MailData } from "../save";
import { SetHelpContext } from "../helpSystem";
import { gPlayerPcMenuManager } from "../mailboxPc";

type MailGfx = { pal: SymRef; tiles: SymRef; map: SymRef; size: number; textpals: number[] };
type MailLayout = { numRows: number; nameY: number; nameX: number; messageTop: number; messageLeft: number; linesLayout: SymRef };
type MailLineLayout = { numWordsInLine: number; lineXoffset: number; lineHeight: number };
type MailResources = { mailType: number; layout: MailLayout; gfx: MailGfx; iconType: 0 | 1 | 2; iconSpriteId: number; species: number; savedCallback: (() => void) | null; messageExists: boolean; lines: string[]; author: string; nameX: number; showMailCallback: () => void };

let sMailViewResources: MailResources | null = null;
const DISPCNT_MODE_0_OBJ = 0x1000 | 0x100;
const SPEED_INSTANT = 0;

/** ReadMail(mail, savedCallback, messageExists): the source C entrypoint accepts a Mail record and return callback. */
export function ReadMail(mail: Pick<MailData, "itemId" | "species" | "words" | "playerName">, savedCallback: (() => void) | null, messageExists: boolean): void {
  const load = Promise.all([loadCData("mail", "easy_chat"), preloadPacks(["graphics_mail"])]);
  SetMainCallback2(() => {});
  void load.then(() => {
    const firstItem = C.ITEM_ORANGE_MAIL;
    let mailType = mail.itemId - firstItem;
    let hasMessage = messageExists;
    if (mailType < 0 || mailType >= 12) { mailType = 0; hasMessage = false; }
    const arrangements = cdata<MailLayout[]>("mail", "sMessageLayouts_5x2");
    const gfxList = cdata<MailGfx[]>("mail", "sGfxHeaders");
    const layout = arrangements[mailType];
    const gfx = gfxList[mailType];
    if (!layout || !gfx) throw new Error(`mail.c: missing layout or graphics for mail type ${mailType}`);
    const authorString = decodeAuthor(mail.playerName);
    const speciesId = MailSpeciesToSpecies(mail.species).species;
    const iconType = speciesId === C.SPECIES_NONE ? 0 : mailType === C.ITEM_BEAD_MAIL - firstItem ? 1 : mailType === C.ITEM_DREAM_MAIL - firstItem ? 2 : 0;
    sMailViewResources = {
      mailType, layout, gfx, iconType, iconSpriteId: 0xff, species: mail.species, savedCallback, messageExists: hasMessage,
      lines: mailLines(mail.words), author: authorString, nameX: layout.nameX, showMailCallback: ShowMailCB_WaitFadeIn,
    };
    SetMainCallback2(CB2_InitMailView);
  });
}

function decodeAuthor(author: ArrayLike<number>): string {
  const bytes: number[] = [];
  for (let i = 0; i < author.length && author[i] !== EOS; i++) bytes.push(author[i]! & 0xff);
  // The author is already a GBA encoded string; decoding and re-encoding retains its glyphs.
  return bytes.length ? decode(Uint8Array.from([...bytes, EOS])) : "";
}

/** CB2_InitMailView. */
function CB2_InitMailView(): void {
  while (sMailViewResources && !DoInitMailView()) {}
  if (sMailViewResources && gMain.state === 0) SetMainCallback2(CB2_RunShowMailCB);
}

/** DoInitMailView: preserve the C state order and only wait on the source DMA-buffer step. */
function DoInitMailView(): boolean {
  const r = sMailViewResources;
  if (!r) return false;
  switch (gMain.state) {
    case 0:
      SetVBlankCallback(null); ScanlineEffect_Stop(); SetGpuReg(REG_OFFSET_DISPCNT, 0);
      SetHelpContext(gPlayerPcMenuManager.notInRoom ? C.HELPCONTEXT_PLAYERS_PC_MAILBOX : C.HELPCONTEXT_BEDROOM_PC_MAILBOX);
      break;
    case 1: ppuOamFill(); break;
    case 2: ResetPaletteFade(); break;
    case 3: tasksReset(); break;
    case 4: ResetSpriteData(); break;
    case 5:
      FreeAllSpritePalettes(); ResetTempTileDataBuffers();
      for (const reg of [REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BG2HOFS, REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA]) SetGpuReg(reg, 0);
      break;
    case 6: {
      ResetBgsAndClearDma3BusyFlags(false);
      InitBgsFromTemplates(0, cdata<BgTemplate[]>("mail", "sBgTemplates"));
      SetBgTilemapBuffer(1, new Uint16Array(BG_SCREEN_SIZE / 2)); SetBgTilemapBuffer(2, new Uint16Array(BG_SCREEN_SIZE / 2));
      break;
    }
    case 7: InitWindows(cdata<WindowTemplate[]>("mail", "sWindowTemplates")); DeactivateAllTextPrinters(); break;
    case 8: DecompressAndCopyTileDataToVram(1, incbin(symName(r.gfx.tiles)!), 0, 0, 0); break;
    case 9: if (FreeTempTileDataBuffersIfPossible()) return false; break;
    case 10:
      FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 30, 20);
      FillBgTilemapBufferRect_Palette0(2, 1, 0, 0, 30, 20);
      CopyToBgTilemapBuffer(1, incbin16(symName(r.gfx.map)!), 0, 0);
      break;
    case 11: CopyBgTilemapBufferToVram(0); CopyBgTilemapBufferToVram(1); CopyBgTilemapBufferToVram(2); break;
    case 12: {
      const windowPal = GetTextWindowPalette(0);
      LoadPalette(windowPal, BG_PLTT_ID(15), PLTT_SIZE_4BPP);
      gPlttBufferUnfaded[BG_PLTT_ID(15) + 10] = r.gfx.textpals[0] ?? 0; gPlttBufferFaded[BG_PLTT_ID(15) + 10] = r.gfx.textpals[0] ?? 0;
      gPlttBufferUnfaded[BG_PLTT_ID(15) + 11] = r.gfx.textpals[1] ?? 0; gPlttBufferFaded[BG_PLTT_ID(15) + 11] = r.gfx.textpals[1] ?? 0;
      LoadPalette(incbin16(symName(r.gfx.pal)!), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
      const genderPals = save.playerGender === 0 ? [RGB(13, 22, 26), RGB(5, 13, 20)] : [RGB(28, 15, 17), RGB(20, 6, 14)];
      gPlttBufferUnfaded[10] = genderPals[0] ?? 0; gPlttBufferFaded[10] = genderPals[0] ?? 0;
      gPlttBufferUnfaded[11] = genderPals[1] ?? 0; gPlttBufferFaded[11] = genderPals[1] ?? 0;
      break;
    }
    case 13: if (r.messageExists) BufferMailMessage(); break;
    case 14: if (r.messageExists) { AddMailMessagePrinters(); RunTextPrinters(); } break;
    case 15: break; // Overworld_LinkRecvQueueLengthMoreThan2 is excluded with LINK.
    case 16: SetVBlankCallback(VBlankCB_ShowMail); gPaletteFade.bufferTransferDisabled = true; break;
    case 17:
      if (r.iconType) {
        const iconSpecies = MailSpeciesToIconSpecies(r.species);
        if (iconSpecies !== C.SPECIES_NONE) {
          LoadMonIconPalette(iconSpecies);
          r.iconSpriteId = CreateMonIcon_HandleDeoxys(iconSpecies, SpriteCallbackDummy, r.iconType === 1 ? 0x60 : 0x28, 0x80, 0, false);
        }
      }
      break;
    case 18:
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0_OBJ); ShowBg(0); ShowBg(1); ShowBg(2);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK); gPaletteFade.bufferTransferDisabled = false;
      r.showMailCallback = ShowMailCB_WaitFadeIn; gMain.state = 0; return true;
    default: return false;
  }
  gMain.state++;
  return false;
}

function ppuOamFill(): void { ppu.oam.fill(0); }
function tasksReset(): void { tasks.reset(); }

/** BufferMailMessage and AddMailMessagePrinters: 5x2 easy-chat rows and source C window positions. */
function BufferMailMessage(): void {
  const r = sMailViewResources!;
  r.nameX = r.layout.nameX;
}

function AddMailMessagePrinters(): void {
  const r = sMailViewResources!;
  const lineLayout = cdata<MailLineLayout[]>("mail", symName(r.layout.linesLayout)!);
  const colors = cdata<number[]>("mail", "sTextColor");
  PutWindowTilemap(0); PutWindowTilemap(1); FillWindowPixelBuffer(0, 0); FillWindowPixelBuffer(1, 0);
  let y = 0;
  for (let i = 0; i < r.layout.numRows; i++) {
    const line = r.lines[i] ?? "";
    if (line && line[0] !== " ") {
      AddTextPrinterParameterized3(0, FONT_NORMAL_COPY_1, r.layout.messageLeft + (lineLayout[i]?.lineXoffset ?? 0), r.layout.messageTop + y, colors, SPEED_INSTANT, encode(line));
      y += lineLayout[i]?.lineHeight ?? 16;
    }
  }
  const from = rom.text("gText_From");
  const labelWidth = stringWidth(FONT_NORMAL_COPY_1, from, 0);
  AddTextPrinterParameterized3(1, FONT_NORMAL_COPY_1, r.nameX, r.layout.nameY, colors, SPEED_INSTANT, from);
  AddTextPrinterParameterized3(1, FONT_NORMAL_COPY_1, r.nameX + labelWidth, r.layout.nameY, colors, SPEED_INSTANT, encode(r.author));
  CopyWindowToVram(0, COPYWIN_FULL); CopyWindowToVram(1, COPYWIN_FULL);
}

function VBlankCB_ShowMail(): void { LoadOam(); ProcessSpriteCopyRequests(); TransferPlttBuffer(); }
function CB2_RunShowMailCB(): void {
  if (sMailViewResources?.iconType) { AnimateSprites(); BuildOamBuffer(); }
  sMailViewResources?.showMailCallback();
}
function ShowMailCB_WaitFadeIn(): void { if (!UpdatePaletteFade()) sMailViewResources!.showMailCallback = ShowMailCB_WaitButton; }
function ShowMailCB_WaitButton(): void {
  if (joy.newKeys & (A_BUTTON | B_BUTTON)) { BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK); sMailViewResources!.showMailCallback = ShowMailCB_Teardown; }
}
function ShowMailCB_Teardown(): void {
  if (UpdatePaletteFade()) return;
  const r = sMailViewResources!;
  SetMainCallback2(r.savedCallback);
  if (r.iconSpriteId !== 0xff) { freeIconPalette(MailSpeciesToIconSpecies(r.species)); DestroyMonIcon(gSprites[r.iconSpriteId]!); }
  ResetPaletteFade(); FreeAllWindowBuffers(); SetVBlankCallback(null); SetHBlankCallback(null);
  sMailViewResources = null;
}
