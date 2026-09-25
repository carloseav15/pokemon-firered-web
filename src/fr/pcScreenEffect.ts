// pc_screen_effect.c: the CRT turn-on / turn-off effect of the PC screens,
// done with WIN0 and the brighten blend. Direct port; task data indices are
// the C's tState..tBldYBak.

import { tasks } from "./gba/tasks";
import { GetGpuReg, ClearGpuRegBits, SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import { FuncIsActiveTask } from "./hw/menuHelpers";
import { BG_PLTT_ID, BlendPalettes, gPlttBufferFaded, PALETTES_ALL, RGB_BLACK } from "./hw/palette";
import {
  BLDCNT_EFFECT_LIGHTEN, BLDCNT_TGT1_BD, BLDCNT_TGT1_BG0, BLDCNT_TGT1_BG1, BLDCNT_TGT1_BG2, BLDCNT_TGT1_BG3, BLDCNT_TGT1_OBJ, DISPCNT_WIN0_ON,
  DISPLAY_HEIGHT, DISPLAY_WIDTH, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ,
  REG_OFFSET_WINOUT, WIN_RANGE, WININ_WIN0_BG_ALL, WININ_WIN0_CLR, WININ_WIN0_OBJ,
} from "./hw/ppu";
import type { TaskFunc } from "./gba/tasks";

const tState = 0, tXSpeed = 1, tYSpeed = 2, tWin0Left = 3, tWin0Right = 4, tWin0Top = 5, tWin0Bottom = 6, tBldCntBak = 7, tBldYBak = 8;

const BLDCNT_ALL_LIGHTEN = BLDCNT_TGT1_BG0 | BLDCNT_TGT1_BG1 | BLDCNT_TGT1_BG2 | BLDCNT_TGT1_BG3 | BLDCNT_TGT1_OBJ | BLDCNT_TGT1_BD | BLDCNT_EFFECT_LIGHTEN;

/** BeginPCScreenEffect_TurnOn */
export function BeginPCScreenEffect_TurnOn(xspeed: number, yspeed: number, priority: number): void {
  BeginPCScreenEffect(Task_PCScreenEffect_TurnOn, xspeed, yspeed, priority);
}

/** BeginPCScreenEffect_TurnOff */
export function BeginPCScreenEffect_TurnOff(xspeed: number, yspeed: number, priority: number): void {
  BeginPCScreenEffect(Task_PCScreenEffect_TurnOff, xspeed, yspeed, priority);
}

/** IsPCScreenEffectRunning_TurnOn */
export function IsPCScreenEffectRunning_TurnOn(): boolean {
  return FuncIsActiveTask(Task_PCScreenEffect_TurnOn);
}

/** IsPCScreenEffectRunning_TurnOff */
export function IsPCScreenEffectRunning_TurnOff(): boolean {
  return FuncIsActiveTask(Task_PCScreenEffect_TurnOff);
}

function BeginPCScreenEffect(func: TaskFunc, speed: number, _unused: number, priority: number): void {
  const taskId = tasks.create(func, priority);
  const data = tasks.tasks[taskId].data;
  data[tState] = 0;
  data[tXSpeed] = speed === 0 ? 16 : speed;
  data[tYSpeed] = speed === 0 ? 20 : speed; // Bug? should be the unused param, not speed
  tasks.tasks[taskId].func(taskId);
}

function Task_PCScreenEffect_TurnOn(taskId: number): void {
  const d = tasks.tasks[taskId].data;

  switch (d[tState]) {
    case 0:
      d[tWin0Left] = 120;
      d[tWin0Right] = 120;
      d[tWin0Top] = 80;
      d[tWin0Bottom] = 81;
      SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(d[tWin0Left], d[tWin0Right]));
      SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(d[tWin0Top], d[tWin0Bottom]));
      SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN0_CLR);
      SetGpuReg(REG_OFFSET_WINOUT, 0);
      break;
    case 1:
      d[tBldCntBak] = GetGpuReg(REG_OFFSET_BLDCNT);
      d[tBldYBak] = GetGpuReg(REG_OFFSET_BLDY);
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_ALL_LIGHTEN);
      SetGpuReg(REG_OFFSET_BLDY, 16);
      break;
    case 2:
      d[tWin0Left] -= d[tXSpeed];
      d[tWin0Right] += d[tXSpeed];
      if (d[tWin0Left] <= 0 || d[tWin0Right] >= DISPLAY_WIDTH) {
        d[tWin0Left] = 0;
        d[tWin0Right] = DISPLAY_WIDTH;
        SetGpuReg(REG_OFFSET_BLDY, 0);
        SetGpuReg(REG_OFFSET_BLDCNT, d[tBldCntBak]);
        BlendPalettes(PALETTES_ALL, 0, RGB_BLACK);
        gPlttBufferFaded[BG_PLTT_ID(0)] = 0;
      }
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(d[tWin0Left], d[tWin0Right]));
      if (d[tWin0Left]) return;
      break;
    case 3:
      d[tWin0Top] -= d[tYSpeed];
      d[tWin0Bottom] += d[tYSpeed];
      if (d[tWin0Top] <= 0 || d[tWin0Bottom] >= DISPLAY_HEIGHT) {
        d[tWin0Top] = 0;
        d[tWin0Bottom] = DISPLAY_HEIGHT;
        ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
      }
      SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(d[tWin0Top], d[tWin0Bottom]));
      if (d[tWin0Top]) return;
      break;
    default:
      SetGpuReg(REG_OFFSET_BLDCNT, d[tBldCntBak]);
      tasks.destroy(taskId);
      return;
  }
  ++d[tState];
}

function Task_PCScreenEffect_TurnOff(taskId: number): void {
  const d = tasks.tasks[taskId].data;

  switch (d[tState]) {
    case 0:
      gPlttBufferFaded[BG_PLTT_ID(0)] = 0;
      break;
    case 1:
      d[tWin0Left] = 0;
      d[tWin0Right] = DISPLAY_WIDTH;
      d[tWin0Top] = 0;
      d[tWin0Bottom] = DISPLAY_HEIGHT;
      SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(d[tWin0Left], d[tWin0Right]));
      SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(d[tWin0Top], d[tWin0Bottom]));
      SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN0_CLR);
      SetGpuReg(REG_OFFSET_WINOUT, 0);
      break;
    case 2:
      d[tWin0Top] += d[tYSpeed];
      d[tWin0Bottom] -= d[tYSpeed];
      if (d[tWin0Top] >= 80 || d[tWin0Bottom] <= 81) {
        d[tWin0Top] = 80;
        d[tWin0Bottom] = 81;
        SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_ALL_LIGHTEN);
        SetGpuReg(REG_OFFSET_BLDY, 16);
      }
      SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(d[tWin0Top], d[tWin0Bottom]));
      if (d[tWin0Top] !== 80) return;
      break;
    case 3:
      d[tWin0Left] += d[tXSpeed];
      d[tWin0Right] -= d[tXSpeed];
      if (d[tWin0Left] >= 120 || d[tWin0Right] <= 120) {
        d[tWin0Left] = 120;
        d[tWin0Right] = 120;
        BlendPalettes(PALETTES_ALL, 0x10, RGB_BLACK);
        gPlttBufferFaded[BG_PLTT_ID(0)] = 0;
      }
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(d[tWin0Left], d[tWin0Right]));
      if (d[tWin0Left] !== 120) return;
      break;
    default:
      ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
      SetGpuReg(REG_OFFSET_BLDY, 0);
      SetGpuReg(REG_OFFSET_BLDCNT, 0);
      tasks.destroy(taskId);
      return;
  }
  ++d[tState];
}
