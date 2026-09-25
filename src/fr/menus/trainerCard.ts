// trainer_card.c: the player Trainer Card (front stats, back records) as a
// field-menu adapter. Source draws HW card backgrounds, badge sprites, star
// palettes, photo icons and a flip animation (A flips sides, B closes); this
// keeps the same stats, front/back sides and A/B controls while the dedicated
// card graphics, flip animation and photo icons are pending. On exit the start
// menu closes (source reopens it); this matches the other field-menu adapters.

import { decode, encode } from "../gba/charmap";
import { FONT_NORMAL } from "../gba/font";
import { A_BUTTON, B_BUTTON, joy } from "../gba/input";
import { InitBgsFromTemplates, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg } from "../hw/bg";
import { InitGpuRegManager, SetGpuReg } from "../hw/gpu";
import { GetTextWindowPalette } from "../hw/menu";
import { LoadPalette, ResetPaletteFade, TransferPlttBuffer } from "../hw/palette";
import { ppu, REG_OFFSET_DISPCNT } from "../hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback1, SetMainCallback2, SetVBlankCallback } from "../hw/runtime";
import { COPYWIN_FULL, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap } from "../hw/window";
import { AddTextPrinterParameterized3 } from "../hw/text";
import { sound } from "../audio/sound";
import { flagGet, save, varGet } from "../save";
import { dexCount } from "../pokemon/pokemon";
import { rom } from "../rom";

/** SetPlayerCardData + SetDataFromTrainerCard + GetTrainerStarCount (FRLG). */
function cardData() {
  const c = rom.constants;
  // IsNationalPokedexEnabled: national totals only with the national dex.
  const national = varGet(c.VAR_NATIONAL_DEX ?? 0) === 0x6258 && flagGet(c.FLAG_SYS_NATIONAL_DEX);
  const caught = dexCount(true, !national);
  const badges = Array.from({ length: 8 }, (_, i) => flagGet((c.FLAG_BADGE01_GET ?? 0) + i));
  const frames = save.playTimeFrames;
  const totalSeconds = Math.floor(frames / 60);
  const hours = Math.min(999, Math.floor(totalSeconds / 3600));
  const minutes = Math.floor(totalSeconds / 60) % 60;
  // FIRST_HOF_PLAY_TIME packs hours/minutes/seconds; ENTERED_HOF gates it.
  const enteredHof = (save.gameStats[c.GAME_STAT_ENTERED_HOF] ?? 0) > 0;
  const debut = save.gameStats[c.GAME_STAT_FIRST_HOF_PLAY_TIME] ?? 0;
  const hof = {
    h: Math.min(999, debut >> 16),
    m: (debut >> 8) & 0xff,
    s: debut & 0xff,
  };
  const wins = save.gameStats[c.GAME_STAT_LINK_BATTLE_WINS] ?? 0;
  const losses = save.gameStats[c.GAME_STAT_LINK_BATTLE_LOSSES] ?? 0;
  const trades = save.gameStats[c.GAME_STAT_POKEMON_TRADES] ?? 0;
  const berry = save.gameStats[c.GAME_STAT_BERRY_CRUSH_POINTS] ?? 0;
  const union = save.gameStats[c.GAME_STAT_NUM_UNION_ROOM_BATTLES] ?? 0;
  // FRLG stars: HoF debut + all-Hoenn caught; tower streak and paintings are
  // unreachable here (no tower engine / painting state), matching a fresh cart.
  const stars = (enteredHof ? 1 : 0) + (dexCount(true, false) >= 384 ? 1 : 0);
  return {
    name: decode(Uint8Array.from(save.playerName)),
    id: String(save.trainerId & 0xffff).padStart(5, "0"),
    money: save.money,
    time: `${hours}:${String(minutes).padStart(2, "0")}`,
    caught, badges, enteredHof, hof, wins, losses, trades, berry, union, stars,
  };
}

type Card = ReturnType<typeof cardData>;

function frontRows(d: Card): string[] {
  const n = d.badges.filter(Boolean).length;
  return [
    `NAME ${d.name}`,
    `ID No ${d.id}`,
    `MONEY ${d.money} TIME ${d.time}`,
    `POKéDEX ${d.caught} BADGES ${n}/8`,
    d.badges.map((b) => (b ? "*" : "-")).join(""),
    `STARS ${d.stars}/4`,
    "A:BACK B:EXIT",
  ];
}

function backRows(d: Card): string[] {
  const rows = [`NAME ${d.name}`];
  rows.push(d.enteredHof
    ? `HALL OF FAME ${d.hof.h}:${String(d.hof.m).padStart(2, "0")}:${String(d.hof.s).padStart(2, "0")}`
    : "HALL OF FAME ---");
  if (d.wins !== 0 || d.losses !== 0) rows.push(`LINK W:${d.wins} L:${d.losses}`);
  if (d.trades !== 0) rows.push(`TRADES ${d.trades}`);
  if (d.berry !== 0) rows.push(`BERRY CRUSH ${d.berry}`);
  if (d.union !== 0) rows.push(`UNION ROOM ${d.union}`);
  rows.push("B:FRONT A:EXIT");
  return rows;
}

/** ShowPlayerTrainerCard (front side first, CB2_ReturnToFieldWithOpenMenu). */
export function openTrainerCardScreen(done: () => void): void {
  const data = cardData();
  const callback1 = gMain.callback1;
  SetMainCallback1(null);
  SetMainCallback2(() => {
    SetVBlankCallback(null); SetHBlankCallback(null);
    InitGpuRegManager(); FreeAllWindowBuffers();
    ppu.vram.fill(0); ppu.oam.fill(0);
    ResetBgsAndClearDma3BusyFlags(false);
    InitBgsFromTemplates(0, [{ bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0 }]);
    SetBgTilemapBuffer(0, new Uint16Array(1024));
    InitWindows([{ bg: 0, tilemapLeft: 1, tilemapTop: 1, width: 28, height: 18, paletteNum: 15, baseBlock: 1 }]);
    LoadPalette(GetTextWindowPalette(0), 240, 32);
    SetGpuReg(REG_OFFSET_DISPCNT, 0); ShowBg(0);
    let back = false;
    const draw = (): void => {
      FillWindowPixelBuffer(0, 0x11);
      AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 0, [1, 2, 3], 0, encode("TRAINER CARD"));
      (back ? backRows(data) : frontRows(data)).forEach((row, i) =>
        AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 26 + i * 16, [1, 2, 3], 0, encode(row)));
      PutWindowTilemap(0); CopyWindowToVram(0, COPYWIN_FULL);
    };
    const finish = (): void => {
      FreeAllWindowBuffers(); SetVBlankCallback(null); SetMainCallback1(callback1);
      SetMainCallback2(null);
      done();
    };
    const flip = (): void => {
      sound.playSE(sound.c("SE_CARD_FLIP"));
      back = !back;
      draw();
    };
    draw();
    SetVBlankCallback(TransferPlttBuffer);
    SetMainCallback2(() => {
      if (!back && joy.newKeys & A_BUTTON) { flip(); return; }
      if (!back && joy.newKeys & B_BUTTON) { finish(); return; }
      if (back && joy.newKeys & B_BUTTON) { flip(); return; }
      if (back && joy.newKeys & A_BUTTON) { finish(); return; }
    });
  });
}
