// field_specials.c: DoPokemonLeagueLightingEffect and its task family.

import * as C from "../generated/constants";
import { cdata, incbin16 } from "../hw/assets";
import { BlendPalettes, BG_PLTT_ID, gPaletteFade, LoadPalette, PLTT_SIZE_4BPP, RGB_BLACK } from "../hw/palette";
import { tasks } from "../gba/tasks";
import { ApplyGlobalTintToPaletteSlot, gGlobalFieldTintMode } from "./fieldPalette";
import { flagGet, save } from "../save";

const sChampionRoomLightingTimers = (): number[] => cdata<number[]>("field_specials", "sChampionRoomLightingTimers");
const sEliteFourLightingTimers = (): number[] => cdata<number[]>("field_specials", "sEliteFourLightingTimers");
const isChampionRoom = (): boolean => {
  const id = C.MAP_POKEMON_LEAGUE_CHAMPIONS_ROOM;
  return save.location.mapGroup === (id >>> 8) && save.location.mapNum === (id & 0xff);
};

function LoadLeagueLightingPalette(index: number, champion: boolean): void {
  const palettes = incbin16(champion ? "field_specials.c:sChampionRoomLightingPalettes" : "field_specials.c:sEliteFourLightingPalettes");
  LoadPalette(palettes.subarray(index * 16, index * 16 + 16), BG_PLTT_ID(7), PLTT_SIZE_4BPP);
  ApplyGlobalTintToPaletteSlot(7, 1);
}

/** DoPokemonLeagueLightingEffect (field_specials.c). */
export function DoPokemonLeagueLightingEffect(): void {
  const taskId = tasks.create(Task_RunPokemonLeagueLightingEffect, 8);
  const data = tasks.data(taskId);
  if (flagGet(C.FLAG_TEMP_3)) {
    tasks.setFunc(taskId, Task_CancelPokemonLeagueLightingEffect);
    return;
  }
  const champion = isChampionRoom();
  data[0] = (champion ? sChampionRoomLightingTimers() : sEliteFourLightingTimers())[0]!;
  data[1] = 0;
  data[2] = champion ? 8 : 11;
  LoadLeagueLightingPalette(0, champion);
}

/** Task_RunPokemonLeagueLightingEffect (field_specials.c). */
export function Task_RunPokemonLeagueLightingEffect(taskId: number): void {
  const data = tasks.data(taskId);
  if (gPaletteFade.active || !flagGet(C.FLAG_TEMP_2) || flagGet(C.FLAG_TEMP_5)
    || gGlobalFieldTintMode === C.QL_TINT_BACKUP_GRAYSCALE) return;
  data[0] = (data[0]! - 1 << 16) >> 16;
  if (data[0] !== 0) return;
  const champion = isChampionRoom();
  const count = champion ? 8 : 11;
  data[1] = (data[1]! + 1 << 16) >> 16;
  if (data[1] === count) data[1] = 0;
  data[0] = (champion ? sChampionRoomLightingTimers() : sEliteFourLightingTimers())[data[1]!]!;
  LoadLeagueLightingPalette(data[1]!, champion);
}

/** Task_CancelPokemonLeagueLightingEffect (field_specials.c). */
export function Task_CancelPokemonLeagueLightingEffect(taskId: number): void {
  if (!flagGet(C.FLAG_TEMP_4)) return;
  const champion = isChampionRoom();
  LoadLeagueLightingPalette(champion ? 8 : 11, champion);
  if (gPaletteFade.active) BlendPalettes(0x00000080, 16, RGB_BLACK);
  tasks.destroy(taskId);
}

/** StopPokemonLeagueLightingEffectTask (field_specials.c). */
export function StopPokemonLeagueLightingEffectTask(): void {
  if (tasks.isActive(Task_RunPokemonLeagueLightingEffect)) {
    tasks.destroy(tasks.findByFunc(Task_RunPokemonLeagueLightingEffect));
  }
}
