// special_field_anim.c: Sea Cottage teleporter tile animations.
// The source creates priority-0 tasks; the shared GBA task scheduler advances
// them once per frame, while FieldMap's onChange invalidates the Canvas map.
import { tasks } from "../gba/tasks";
import { MAPGRID_COLLISION_MASK } from "./fieldmap";
import { rom } from "../rom";
import type { Overworld } from "./overworld";

function playerCurrentCoords(ow: Overworld): { x: number; y: number } {
  // Despite its name, field_player_avatar.c returns currentCoords directly.
  const p = ow.player.object;
  return { x: p.currentCoords.x, y: p.currentCoords.y };
}

function setAndDraw(ow: Overworld, x: number, y: number, metatileName: string): void {
  ow.map.setMetatileIdAt(x, y, rom.c(metatileName) | MAPGRID_COLLISION_MASK);
}

const escalatorOwners = new Map<number, Overworld>();
let sEscalatorTaskId = 0;
const escalatorTiles = [
  ["METATILE_PokemonCenter_Escalator_BottomNextRail_Transition2", "METATILE_PokemonCenter_Escalator_BottomNextRail_Transition1", "METATILE_PokemonCenter_Escalator_BottomNextRail_Normal"],
  ["METATILE_PokemonCenter_Escalator_BottomRail_Transition2", "METATILE_PokemonCenter_Escalator_BottomRail_Transition1", "METATILE_PokemonCenter_Escalator_BottomRail_Normal"],
  ["METATILE_PokemonCenter_Escalator_BottomNext_Transition2", "METATILE_PokemonCenter_Escalator_BottomNext_Transition1", "METATILE_PokemonCenter_Escalator_BottomNext_Normal"],
  ["METATILE_PokemonCenter_Escalator_Bottom_Transition2", "METATILE_PokemonCenter_Escalator_Bottom_Transition1", "METATILE_PokemonCenter_Escalator_Bottom_Normal"],
  ["METATILE_PokemonCenter_Escalator_TopNext_Normal", "METATILE_PokemonCenter_Escalator_TopNext_Transition1", "METATILE_PokemonCenter_Escalator_TopNext_Transition2"],
  ["METATILE_PokemonCenter_Escalator_Top_Normal", "METATILE_PokemonCenter_Escalator_Top_Transition1", "METATILE_PokemonCenter_Escalator_Top_Transition2"],
  ["METATILE_PokemonCenter_Escalator_TopNextRail_Normal", "METATILE_PokemonCenter_Escalator_TopNextRail_Transition1", "METATILE_PokemonCenter_Escalator_TopNextRail_Transition2"],
] as const;

function SetEscalatorMetatile(taskId: number, tiles: readonly string[], mask: number): void {
  const ow = escalatorOwners.get(taskId);
  if (!ow) return;
  const data = tasks.data(taskId);
  const x = data[4] - 1, y = data[5] - 1, stage = data[1];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const mx = x + col, my = y + row;
    const current = ow.map.metatileIdAt(mx, my);
    if (!data[2]) {
      const from = rom.c(tiles[stage]);
      if (current === from) ow.map.setMetatileIdAt(mx, my, mask | rom.c(tiles[stage === 2 ? 0 : stage + 1]));
    } else {
      const from = rom.c(tiles[2 - stage]);
      if (current === from) ow.map.setMetatileIdAt(mx, my, mask | rom.c(tiles[stage === 2 ? 2 : 1 - stage]));
    }
  }
}

/** Task_DrawEscalator from special_field_anim.c. */
function Task_DrawEscalator(taskId: number): void {
  const data = tasks.data(taskId);
  data[3] = 1;
  switch (data[0]) {
    case 0: SetEscalatorMetatile(taskId, escalatorTiles[0], 0); break;
    case 1: SetEscalatorMetatile(taskId, escalatorTiles[1], 0); break;
    case 2: SetEscalatorMetatile(taskId, escalatorTiles[2], MAPGRID_COLLISION_MASK); break;
    case 3: SetEscalatorMetatile(taskId, escalatorTiles[3], 0); break;
    case 4: SetEscalatorMetatile(taskId, escalatorTiles[4], MAPGRID_COLLISION_MASK); break;
    case 5: SetEscalatorMetatile(taskId, escalatorTiles[5], 0); break;
    case 6: SetEscalatorMetatile(taskId, escalatorTiles[6], 0); break;
  }
  data[0] = (data[0] + 1) & 7;
  if (data[0] === 0) { data[1] = (data[1] + 1) % 3; data[3] = 0; }
}

/** CreateEscalatorTask captures PlayerGetDestCoords and draws the first section immediately. */
function CreateEscalatorTask(ow: Overworld, goingUp: boolean): number {
  const taskId = tasks.create(Task_DrawEscalator, 0);
  const data = tasks.data(taskId);
  const p = playerCurrentCoords(ow);
  data[0] = 0; data[1] = 0; data[2] = goingUp ? 1 : 0; data[3] = 0;
  data[4] = p.x; data[5] = p.y;
  escalatorOwners.set(taskId, ow);
  Task_DrawEscalator(taskId);
  return taskId;
}

export function StartEscalator(ow: Overworld, goingUp: boolean): void {
  sEscalatorTaskId = CreateEscalatorTask(ow, goingUp);
}

export function StopEscalator(): void {
  tasks.destroy(sEscalatorTaskId);
  escalatorOwners.delete(sEscalatorTaskId);
}

export function IsEscalatorMoving(): boolean {
  const data = tasks.data(sEscalatorTaskId);
  return !!data[3] || data[1] !== 2;
}

/** Task_DrawTeleporterHousing: source data[0..3] is timer, state, X and Y. */
function Task_DrawTeleporterHousing(taskId: number): void {
  const ow = escalatorOwners.get(taskId);
  if (!ow) return;
  const data = tasks.data(taskId);
  const [timer, state, x, y] = data;
  if (timer === 0) {
    if ((state & 1) === 0) {
      setAndDraw(ow, x, y, "METATILE_SeaCottage_Teleporter_Light_Yellow");
      setAndDraw(ow, x, y + 2, "METATILE_SeaCottage_Teleporter_Door_HalfGlowing");
    } else {
      setAndDraw(ow, x, y, "METATILE_SeaCottage_Teleporter_Light_Red");
      setAndDraw(ow, x, y + 2, "METATILE_SeaCottage_Teleporter_Door_FullGlowing");
    }
  }
  data[0]++;
  if (data[0] !== 16) return;
  data[0] = 0;
  data[1]++;
  if (data[1] !== 13) return;
  setAndDraw(ow, x, y, "METATILE_SeaCottage_Teleporter_Light_Green");
  setAndDraw(ow, x, y + 2, "METATILE_SeaCottage_Teleporter_Door");
  escalatorOwners.delete(taskId);
  tasks.destroy(taskId);
}

/** Task_DrawTeleporterCable: timer/state/X/Y match special_field_anim.c. */
function Task_DrawTeleporterCable(taskId: number): void {
  const ow = escalatorOwners.get(taskId);
  if (!ow) return;
  const data = tasks.data(taskId);
  if (data[0] === 0) {
    if (data[1] !== 0) {
      setAndDraw(ow, data[2], data[3], "METATILE_SeaCottage_Teleporter_Cable_Top");
      setAndDraw(ow, data[2], data[3] + 1, "METATILE_SeaCottage_Teleporter_Cable_Bottom");
      if (data[1] === 4) {
        escalatorOwners.delete(taskId);
        tasks.destroy(taskId);
        return;
      }
      data[2]--;
    }
    setAndDraw(ow, data[2], data[3], "METATILE_SeaCottage_Teleporter_CableBall_Top");
    setAndDraw(ow, data[2], data[3] + 1, "METATILE_SeaCottage_Teleporter_CableBall_Bottom");
  }
  data[0]++;
  if (data[0] === 4) { data[0] = 0; data[1]++; }
}

/** AnimateTeleporterHousing (special_field_anim.c): 13 phases, 16 frames each. */
export function AnimateTeleporterHousing(ow: Overworld, teleporter: number): void {
  const p = playerCurrentCoords(ow);
  const taskId = tasks.create(Task_DrawTeleporterHousing, 0);
  escalatorOwners.set(taskId, ow);
  const data = tasks.data(taskId);
  data[2] = p.x + (teleporter === 0 ? 6 : -1);
  data[3] = p.y - 5;
}

/** AnimateTeleporterCable creates the four-step task at the source priority. */
export function AnimateTeleporterCable(ow: Overworld): void {
  const p = playerCurrentCoords(ow);
  const taskId = tasks.create(Task_DrawTeleporterCable, 0);
  escalatorOwners.set(taskId, ow);
  const data = tasks.data(taskId);
  data[2] = p.x + 4;
  data[3] = p.y - 5;
}
