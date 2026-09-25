// slot_machine.c: Celadon Game Corner slots as a field-menu adapter. Betting,
// biased reel stops, match lines, payouts and coin handling follow the source;
// reel sprites, the Clefairy dance and line-flash presentation are pending
// (the same 3x3 window, bets, lines and payouts are shown as text).

import { encode } from "../gba/charmap";
import { FONT_NORMAL } from "../gba/font";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, JOY_NEW, joy, R_BUTTON } from "../gba/input";
import { InitBgsFromTemplates, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg } from "../hw/bg";
import { InitGpuRegManager, SetGpuReg } from "../hw/gpu";
import { GetTextWindowPalette } from "../hw/menu";
import { LoadPalette, ResetPaletteFade, TransferPlttBuffer } from "../hw/palette";
import { ppu, REG_OFFSET_DISPCNT } from "../hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback1, SetMainCallback2, SetVBlankCallback } from "../hw/runtime";
import { AddTextPrinterParameterized3 } from "../hw/text";
import { COPYWIN_FULL, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap } from "../hw/window";
import { sound } from "../audio/sound";
import { random } from "../random";
import { incrementGameStat, save } from "../save";
import { removeCoins } from "../pokemon/items";
import {
  calcPayout, calcSlotBias, ICON_LABELS, LINES, newSlotState, resetMachineBias,
  stopReel, visibleIcons, PAYOUT_7, PAYOUT_ROCKET, REEL_LENGTH, type SlotState,
} from "../game/slots";
import { rom } from "../rom";

const MAX_COINS = 9999;
const SPIN_TICKS = 3;

type Phase = "bet" | "spin" | "result" | "askquit" | "help" | "out";

function gridRows(st: SlotState): string[] {
  const icons = visibleIcons(st).map((icon) => ICON_LABELS[icon] ?? "?");
  return [0, 1, 2].map((row) => `${icons[row]} ${icons[row + 3]} ${icons[row + 6]}`);
}

function linesRow(st: SlotState): string {
  const won = LINES.map((line, i) => (st.winLines[i] ? line.name : null)).filter(Boolean);
  return won.length ? `WIN ${won.join("+")}` : "";
}

/** PlaySlotMachine: fullscreen slots, script resumes on exit. */
export function openSlotMachine(machineIdx: number, done: () => void): void {
  const st = newSlotState(machineIdx);
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
    let phase: Phase = save.coins > 0 ? "bet" : "out";
    let order = 0;
    let spinTick = 0;
    let quitCursor = 0;

    const draw = (): void => {
      FillWindowPixelBuffer(0, 0x11);
      const rows: string[] = [`SLOTS   COINS ${save.coins}`, `BET ${st.bet}`, ...gridRows(st)];
      if (phase === "result") rows.push(linesRow(st));
      if (phase === "askquit") {
        rows.push("QUIT PLAYING?");
        rows.push(`${quitCursor === 0 ? ">" : " "} NO`);
        rows.push(`${quitCursor === 1 ? ">" : " "} YES`);
      } else if (phase === "help") {
        rows.push("7:300 RKT:100 PIK/PSY:15");
        rows.push("MAG/SHL:8 CHR:6/2");
        rows.push("BET1:MID BET2:+TOP/BOT");
        rows.push("BET3:+DIAG LEFT:BACK");
      } else if (phase === "out") {
        rows.push("OUT OF COINS!");
      } else if (phase === "bet") {
        rows.push("DN:BET R:MAX A:SPIN");
        rows.push("B:EXIT RIGHT:HELP");
      } else if (phase === "spin") {
        rows.push(`A:STOP REEL ${order + 1}`);
      } else {
        rows.push(st.payout > 0 ? `WON ${st.payout} COINS!` : "DARN! NO PAYOUT");
        rows.push("A:CONTINUE");
      }
      AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 0, [1, 2, 3], 0, encode(rows[0]!));
      rows.slice(1, 8).forEach((row, i) =>
        AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 26 + i * 16, [1, 2, 3], 0, encode(row)));
      PutWindowTilemap(0); CopyWindowToVram(0, COPYWIN_FULL);
    };

    const finish = (): void => {
      FreeAllWindowBuffers(); SetVBlankCallback(null); SetMainCallback1(callback1);
      SetMainCallback2(null);
      done();
    };

    const toBet = (): void => {
      st.bet = 0;
      order = 0;
      phase = save.coins > 0 ? "bet" : "out";
      draw();
    };

    const spin = (): void => {
      calcSlotBias(st, random);
      for (let i = 0; i < 3; i++) st.positions[i] = (st.positions[i] + 5) % REEL_LENGTH;
      order = 0;
      phase = "spin";
      draw();
    };

    const stop = (): void => {
      sound.playSE(sound.c("SE_CONTEST_PLACE"));
      stopReel(st, order, order, random);
      order++;
      if (order >= 3) {
        const best = calcPayout(st);
        if (best === PAYOUT_7) incrementGameStat(rom.c("GAME_STAT_SLOT_JACKPOTS"));
        if (st.payout > 0) {
          sound.playFanfare(rom.c(best === PAYOUT_7 || best === PAYOUT_ROCKET ? "MUS_SLOTS_JACKPOT" : "MUS_SLOTS_WIN"));
          save.coins = Math.min(MAX_COINS, save.coins + st.payout);
        }
        resetMachineBias(st);
        phase = "result";
      }
      draw();
    };

    const betMore = (max: boolean): void => {
      if (save.coins <= 0) { spin(); return; }
      if (max) {
        const add = Math.min(3 - st.bet, save.coins);
        st.bet += add;
        removeCoins(add);
      } else {
        st.bet++;
        removeCoins(1);
      }
      sound.playSE(sound.c("SE_RS_SHOP"));
      if (st.bet >= 3 || save.coins <= 0) spin();
      else draw();
    };

    draw();
    SetVBlankCallback(TransferPlttBuffer);
    SetMainCallback2(() => {
      if (phase === "spin") {
        if (++spinTick >= SPIN_TICKS) {
          spinTick = 0;
          for (let i = order; i < 3; i++) st.positions[i] = (st.positions[i] + 1) % REEL_LENGTH;
          draw();
        }
        if (JOY_NEW(A_BUTTON)) stop();
        return;
      }
      if (phase === "bet") {
        if (JOY_NEW(DPAD_DOWN)) betMore(false);
        else if (JOY_NEW(R_BUTTON)) betMore(true);
        else if (JOY_NEW(A_BUTTON) && st.bet > 0) spin();
        else if (JOY_NEW(B_BUTTON)) { quitCursor = 0; phase = "askquit"; draw(); }
        else if (JOY_NEW(DPAD_RIGHT)) { phase = "help"; draw(); }
        return;
      }
      if (phase === "result") {
        if (JOY_NEW(A_BUTTON | B_BUTTON)) toBet();
        return;
      }
      if (phase === "askquit") {
        if (JOY_NEW(DPAD_UP | DPAD_DOWN)) { quitCursor = quitCursor ? 0 : 1; draw(); }
        else if (JOY_NEW(A_BUTTON)) {
          if (quitCursor === 1) finish();
          else { phase = "bet"; draw(); }
        } else if (JOY_NEW(B_BUTTON)) { phase = "bet"; draw(); }
        return;
      }
      if (phase === "help") {
        if (JOY_NEW(DPAD_LEFT | B_BUTTON)) { phase = "bet"; draw(); }
        return;
      }
      if (phase === "out") {
        if (JOY_NEW(A_BUTTON | B_BUTTON)) finish();
      }
    });
  });
}
